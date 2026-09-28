import { mkdir, copyFile, writeFile } from 'node:fs/promises';
const output = new URL('../dist/',import.meta.url);
await mkdir(output,{recursive:true});
for(const name of ['index.html','styles.css','app.js','protocol.js','icons.js','favicon.svg']) await copyFile(new URL(`../${name}`,import.meta.url),new URL(name,output));
await writeFile(new URL('.nojekyll',output),'');
console.log('Static workshop build: dist/ (relative URLs support GitHub Pages).');
