import { mkdir, copyFile, writeFile, cp } from 'node:fs/promises';
const output = new URL('../dist/', import.meta.url);
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'lab.html', 'lab.css', 'lab.js', 'protocol.js', 'icons.js', 'favicon.svg']) await copyFile(new URL(`../${name}`, import.meta.url), new URL(name, output));
for (const dir of ['src', 'styles']) await cp(new URL(`../${dir}/`, import.meta.url), new URL(`${dir}/`, output), { recursive: true });
// CAD benchmark dashboard: static files and exported data only (no harness code, no raw run folders)
await mkdir(new URL('cad-benchmark/', output), { recursive: true });
for (const name of ['index.html', 'app.js', 'app.css']) await copyFile(new URL(`../cad-benchmark/${name}`, import.meta.url), new URL(`cad-benchmark/${name}`, output));
await cp(new URL('../cad-benchmark/data/', import.meta.url), new URL('cad-benchmark/data/', output), { recursive: true });
await writeFile(new URL('.nojekyll', output), '');
console.log('Static build: dist/ (relative URLs support GitHub Pages).');
