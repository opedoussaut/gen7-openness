import { mkdir, copyFile, writeFile, cp, readdir } from 'node:fs/promises';
const output = new URL('../dist/', import.meta.url);
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'lab.html', 'lab.css', 'lab.js', 'protocol.js', 'icons.js', 'favicon.svg']) await copyFile(new URL(`../${name}`, import.meta.url), new URL(name, output));
for (const dir of ['src', 'styles', 'vendor']) await cp(new URL(`../${dir}/`, import.meta.url), new URL(`${dir}/`, output), { recursive: true });
// System 1: ship the ONNX model and its card (the training script and golden data stay in the repository only).
await mkdir(new URL('models/system1/', output), { recursive: true });
for (const f of ['decision-mlp.onnx', 'model-card.json']) await copyFile(new URL(`../models/system1/${f}`, import.meta.url), new URL(`models/system1/${f}`, output));
// Cinematics (both the original and the System 1 / System 2 version) when present.
await mkdir(new URL('media/', output), { recursive: true });
for (const f of await readdir(new URL('../media/', import.meta.url))) if (/\.(mp4|jpg)$/.test(f)) await copyFile(new URL(`../media/${f}`, import.meta.url), new URL(`media/${f}`, output));
await writeFile(new URL('.nojekyll', output), '');
console.log('Static build: dist/ (relative URLs support GitHub Pages).');
