// SYSTEM 1 · browser runtime. Executes models/system1/decision-mlp.onnx client-side with ONNX Runtime Web.
// Progressive execution:  WebGPU  →  WASM (CPU)  →  pure-JavaScript evaluator (labelled fallback).
// The runtime reported in the UI is the one that actually created the session and ran the model.
import { MODEL_CARD, createJsSystem1, evaluate } from './model.js';

const ROOT = new URL('../../', import.meta.url);
const ORT_DIR = new URL('vendor/onnxruntime-web/1.22.0/', ROOT);
const MODEL_URL = new URL('models/system1/decision-mlp.onnx', ROOT);
const now = () => performance.now();

let initPromise = null;
const state = { status: 'idle', backend: null, ort: null, session: null, info: null, error: [], loadMs: null, coldMs: null, warmMs: null, parity: null };

async function tryCreate(ortModuleFile, providers, label, bytes) {
  const ort = await import(new URL(ortModuleFile, ORT_DIR).href);
  ort.env.wasm.wasmPaths = ORT_DIR.href;
  ort.env.wasm.numThreads = 1;           // GitHub Pages is not cross-origin isolated: single-threaded WASM
  ort.env.logLevel = 'error';
  const session = await ort.InferenceSession.create(bytes, { executionProviders: providers, graphOptimizationLevel: 'all' });
  return { ort, session, label };
}

async function runOrt(vector) {
  const { ort, session } = state;
  const input = new ort.Tensor('float32', Float32Array.from(vector), [1, vector.length]);
  const t = now();
  const out = await session.run({ features: input });
  const ms = now() - t;
  const probs = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Array.from(v.data)]));
  return { probs, ms };
}

/** Load the runtime once (idempotent). Resolves with the description of the backend that works. */
export function initSystem1() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    state.status = 'loading';
    const t0 = now();
    let bytes = null;
    try { bytes = new Uint8Array(await (await fetch(MODEL_URL)).arrayBuffer()); } catch (e) { state.error.push(`model fetch: ${e.message}`); }
    let adapterInfo = null;
    if (bytes && typeof navigator !== 'undefined' && navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
          adapterInfo = adapter.info ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture, description: adapter.info.description } : null;
          Object.assign(state, await tryCreate('ort.webgpu.min.mjs', ['webgpu'], 'webgpu', bytes));
          state.backend = 'webgpu';
        } else state.error.push('WebGPU: no adapter');
      } catch (e) { state.error.push(`WebGPU: ${e.message}`); state.session = null; }
    } else if (bytes) state.error.push('WebGPU: not available in this browser');
    if (bytes && !state.session) {
      try { Object.assign(state, await tryCreate('ort.wasm.min.mjs', ['wasm'], 'wasm', bytes)); state.backend = 'wasm'; }
      catch (e) { state.error.push(`WASM: ${e.message}`); state.session = null; }
    }
    state.loadMs = now() - t0;
    if (state.session) {
      // Cold run (includes shader compilation on WebGPU), then warm runs; parity against the JS evaluator of the same weights.
      const probe = [0.144, 0.869, -0.013, 0.942, 0.039, 0.118, 0.333, 0.236, 1];
      const cold = await runOrt(probe); state.coldMs = cold.ms;
      const warm = [];
      for (let i = 0; i < 20; i++) warm.push((await runOrt(probe)).ms);
      warm.sort((a, b) => a - b); state.warmMs = warm[Math.floor(warm.length / 2)];
      const ref = evaluate(probe);
      state.parity = Math.max(...Object.keys(ref).flatMap(k => ref[k].map((v, i) => Math.abs(v - cold.probs[k][i]))));
      state.info = {
        backend: state.backend,
        runtime: state.backend === 'webgpu' ? 'Browser · WebGPU (ONNX Runtime Web)' : 'Browser · WASM, CPU (ONNX Runtime Web)',
        execution: 'Client-side', networkCall: 'None', apiCostEur: 0,
        model: MODEL_CARD.name, modelFile: 'models/system1/decision-mlp.onnx', modelBytes: MODEL_CARD.onnx.bytes, parameters: MODEL_CARD.parameters,
        ortVersion: '1.22.0', adapter: adapterInfo, loadMs: state.loadMs, coldMs: state.coldMs, warmMs: state.warmMs, parityMaxAbsDiff: state.parity,
        notes: state.error, fallback: false
      };
      state.status = 'ready';
    } else {
      state.backend = 'js';
      state.info = { ...createJsSystem1().describe(), notes: state.error, loadMs: state.loadMs };
      state.status = 'fallback';
    }
    return state.info;
  })();
  return initPromise;
}

export const system1Status = () => ({ status: state.status, info: state.info });

/** Browser System 1 adapter for the engine. Waits for the runtime (bounded), then runs the model. */
export function createBrowserSystem1({ waitMs = 20000 } = {}) {
  const js = createJsSystem1();
  return {
    kind: 'browser',
    describe: () => state.info ?? { backend: 'pending', runtime: 'Browser · loading ONNX Runtime Web…' },
    async decide(vector) {
      await Promise.race([initSystem1(), new Promise(r => setTimeout(r, waitMs))]);
      if (state.session) { const { probs, ms } = await runOrt(vector); return { probs, inferenceMs: ms, info: state.info }; }
      return js.decide(vector);
    }
  };
}
