// Presentation helpers: formatting and escaping. Values are never computed here, only displayed.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const nf = new Intl.NumberFormat('en-US');
export const int = v => (v == null || Number.isNaN(v) ? '—' : nf.format(Math.round(v)));
export function compact(v) {
  if (v == null) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e4) return `${Math.round(v / 1e3)}k`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return int(v);
}
export function eur(v, { precise = false } = {}) {
  if (v == null) return '—';
  const a = Math.abs(v);
  if (a >= 100) return `€${nf.format(Math.round(v))}`;
  if (a >= 1) return `€${v.toFixed(2)}`;
  if (a >= 0.01) return `€${v.toFixed(precise ? 4 : 3)}`;
  if (a >= 0.0001) return `€${v.toFixed(precise ? 5 : 4)}`;
  if (a === 0) return '€0';
  return '< €0.00001';
}
export function bytes(v) {
  if (v == null) return '—';
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)} MB`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)} KB`;
  return `${v} B`;
}
export function ms(v) {
  if (v == null) return '—';
  if (v >= 1000) return `${(v / 1000).toFixed(1)} s`;
  return `${Math.round(v)} ms`;
}
export const pct = (v, d = 1) => (v == null ? '—' : `${(v * 100).toFixed(d)}%`);
export const clock = t => { const s = t / 1000; return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
export const times = v => (v == null ? '—' : v >= 1000 ? `${nf.format(Math.round(v))}×` : v >= 10 ? `${Math.round(v)}×` : `${v.toFixed(1)}×`);
export const signedMm = v => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} mm`;
