// SYSTEM 1 · decision model: decoding, confidence gate, and a pure-JavaScript evaluator of the same weights.
// The browser runtime (runtime.js) executes the ONNX file with ONNX Runtime Web; this evaluator is used by the
// Node tests, by the instant reference runs, and as the clearly labelled fallback when neither WebGPU nor WASM works.
import { WEIGHTS, MODEL_CARD } from './weights.js';

export const HEADS = Object.entries(WEIGHTS.heads).map(([id, h]) => ({ id, ...h }));
export { MODEL_CARD };

/** The gate: when is System 1 allowed to act on its own? */
export const GATE = {
  minConfidence: 0.75,
  rule: 'Act directly only if route = DIRECT, reasoning required = NO and every decision is at least 75 % confident. Otherwise escalate to System 2 (specialised agents), or to a person when the route is HUMAN_REVIEW.'
};

const softmax = z => { const m = Math.max(...z); const e = z.map(v => Math.exp(v - m)); const s = e.reduce((a, b) => a + b, 0); return e.map(v => v / s); };
const sigmoid = v => 1 / (1 + Math.exp(-v));

/** Raw MLP forward pass (float64 in JS; float32 in ONNX Runtime — differences are < 1e-5). */
export function evaluate(vector) {
  let h = vector.map((x, i) => (x - WEIGHTS.mean[i]) / WEIGHTS.std[i]);
  for (const L of WEIGHTS.layers) {
    const out = L.b.slice();
    for (let i = 0; i < h.length; i++) { const hi = h[i], row = L.W[i]; if (hi === 0) continue; for (let j = 0; j < out.length; j++) out[j] += hi * row[j]; }
    h = L.act === 'relu' ? out.map(v => (v > 0 ? v : 0)) : out;
  }
  const res = {};
  for (const hd of HEADS) { const z = h.slice(hd.slice[0], hd.slice[1]); res[hd.id] = hd.act === 'softmax' ? softmax(z) : z.map(sigmoid); }
  return res;
}

/** Probabilities → typed decisions with confidence (choice heads) or per-label probability (multi-label head). */
export function decode(probs) {
  const out = {};
  for (const hd of HEADS) {
    const p = Array.from(probs[hd.id]);
    if (hd.act === 'softmax') {
      const i = p.indexOf(Math.max(...p));
      out[hd.id] = { type: 'choice', label: hd.labels[i], confidence: p[i], probabilities: Object.fromEntries(hd.labels.map((l, k) => [l, p[k]])) };
    } else {
      const selected = hd.labels.filter((_, k) => p[k] >= 0.5);
      const confidence = Math.min(...p.map(v => Math.max(v, 1 - v)));
      out[hd.id] = { type: 'multi', selected, confidence, probabilities: Object.fromEntries(hd.labels.map((l, k) => [l, p[k]])) };
    }
  }
  return out;
}

/** Confidence gate: bounded action, escalation to System 2, or escalation to a person. */
export function gate(decisions, g = GATE) {
  const route = decisions.preferred_route.label, reasoning = decisions.reasoning_required.label;
  const weakest = Object.entries(decisions).reduce((a, [id, d]) => (d.confidence < a.confidence ? { id, confidence: d.confidence } : a), { id: null, confidence: 1 });
  const reasons = [];
  if (route !== 'DIRECT') reasons.push(`route ${route}`);
  if (reasoning === 'YES') reasons.push('reasoning required');
  if (weakest.confidence < g.minConfidence) reasons.push(`low confidence on ${weakest.id.replace('_', ' ')} (${Math.round(weakest.confidence * 100)} %)`);
  const escalate = reasons.length > 0;
  const path = !escalate ? 'BOUNDED_ACTION' : route === 'HUMAN_REVIEW' ? 'HUMAN_REVIEW' : 'SYSTEM_2';
  return { escalate, path, reasons, weakest, threshold: g.minConfidence, rule: g.rule };
}

/** Reference System 1 adapter (pure JavaScript). Latency is measured, not modelled. */
export function createJsSystem1() {
  return {
    kind: 'js',
    describe: () => ({ backend: 'js', runtime: 'Browser · JavaScript (reference evaluator)', execution: 'Client-side', networkCall: 'None', apiCostEur: 0, model: MODEL_CARD.name, modelBytes: MODEL_CARD.onnx.bytes, parameters: MODEL_CARD.parameters, fallback: true }),
    async decide(vector) {
      const t = (globalThis.performance ?? Date).now();
      const probs = evaluate(vector);
      const ms = (globalThis.performance ?? Date).now() - t;
      return { probs, inferenceMs: ms, info: this.describe() };
    }
  };
}
