// Cameo evidence for the Engineering page, in two clearly separated modes.
//
// RECORDED — replays artifacts the Cameo MBSE agent produced from the authoritative model in CATIA Magic
//            (evidence/cameo/: native diagram exports, the build log, the workflow log). Nothing is generated here.
// LIVE     — talks to tools/cameo/live_server.py running on the Cameo workstation, which runs the same workflow
//            through cameo-mcp-bridge and streams each MCP call as it happens. Enabled with ?cameo=live.
import { specText } from './spec.js';

const LIVE_DEFAULT = 'http://127.0.0.1:18790';

async function sha256(text) {
  if (!globalThis.crypto?.subtle) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function loadRecorded(base = './evidence/cameo/') {
  const res = await fetch(`${base}index.json`, { cache: 'no-store' });
  if (!res.ok) return { available: false, reason: `No recorded Cameo evidence (${res.status}).` };
  const index = await res.json();
  const digest = await sha256(specText());
  return {
    available: true, mode: 'recorded', index, base,
    diagramUrl: key => `${base}${index.diagrams[key]?.file ?? `diagrams/${key}.png`}`,
    specMatches: digest == null ? null : digest === index.specDigest, specDigest: digest
  };
}

export function liveConfig() {
  const p = new URLSearchParams(location.search);
  if (p.get('cameo') !== 'live') return null;
  return { url: p.get('agent') || LIVE_DEFAULT };
}

export async function probeLive(cfg) {
  try {
    const r = await fetch(`${cfg.url}/status`, { cache: 'no-store' });
    if (!r.ok) return { ok: false, reason: `Agent answered ${r.status}` };
    return { ok: true, ...(await r.json()) };
  } catch (e) {
    return { ok: false, reason: `Cameo agent not reachable at ${cfg.url} (${e.message}).` };
  }
}

/** Stream the live workflow: onEvent receives the same events the recorded workflow.json was built from. */
export function runLive(cfg, onEvent) {
  return new Promise((resolve, reject) => {
    const es = new EventSource(`${cfg.url}/run`);
    es.onmessage = m => {
      const e = JSON.parse(m.data);
      onEvent(e);
      if (e.kind === 'done' || e.kind === 'error') { es.close(); e.kind === 'done' ? resolve(e) : reject(new Error(e.message)); }
    };
    es.onerror = () => { es.close(); reject(new Error('Live stream interrupted')); };
  });
}

/** Replay the recorded workflow with its recorded step durations (minimum 450 ms per step so it can be followed). */
export async function replayRecorded(index, onEvent, { speed = 1, minMs = 450 } = {}) {
  for (const s of index.workflow.steps) {
    onEvent({ kind: 'step-start', id: s.id, title: s.title });
    await new Promise(r => setTimeout(r, Math.max(minMs, s.ms) / speed));
    onEvent({ kind: 'step-done', ...s });
  }
  onEvent({ kind: 'done', totals: index.workflow.totals });
}
