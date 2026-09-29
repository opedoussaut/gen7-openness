// Small shared helpers. No DOM access here so the module also runs in Node tests.

/** Deterministic PRNG (mulberry32). Same seed → same synthetic dataset on every run. */
export function prng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    pick: list => list[Math.floor(next() * list.length)],
    chance: p => next() < p
  };
}

const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
/** UTF-8 byte size of a string. */
export const utf8Bytes = text => (encoder ? encoder.encode(text).length : text.length);
/** Byte size of a value once serialized as JSON. */
export const jsonBytes = value => utf8Bytes(JSON.stringify(value));

/**
 * Token estimate used throughout the demonstrator: ≈ 4 characters per token.
 * Real adapters replace this with the usage fields returned by the model provider.
 */
export const CHARS_PER_TOKEN = 4;
export const estimateTokens = value => Math.ceil((typeof value === 'string' ? utf8Bytes(value) : jsonBytes(value)) / CHARS_PER_TOKEN);

export const round = (value, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

export const sum = (list, fn = x => x) => list.reduce((acc, item) => acc + fn(item), 0);

export function uid(prefix = 'id') {
  const bytes = globalThis.crypto?.getRandomValues ? crypto.getRandomValues(new Uint8Array(6)) : Array.from({ length: 6 }, () => Math.floor(Math.random() * 256));
  return `${prefix}-${[...bytes].map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

export const now = () => (globalThis.performance?.now ? performance.now() : Date.now());
