import { mkdir, copyFile, writeFile, readFile, cp } from 'node:fs/promises';
const output = new URL('../dist/', import.meta.url);
await mkdir(output, { recursive: true });
for (const name of ['lab.html', 'lab.css', 'lab.js', 'protocol.js', 'icons.js', 'favicon.svg']) await copyFile(new URL(`../${name}`, import.meta.url), new URL(name, output));
for (const dir of ['src', 'styles']) await cp(new URL(`../${dir}/`, import.meta.url), new URL(`${dir}/`, output), { recursive: true });
await mkdir(new URL('docs/', output), { recursive: true });
await copyFile(new URL('../docs/social-card.jpg', import.meta.url), new URL('docs/social-card.jpg', output));
// Social networks need an absolute preview-image URL. On GitHub Actions, derive it from the repository.
let html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const repo = process.env.GITHUB_REPOSITORY;
if (repo) {
  const [owner, name] = repo.split('/');
  const base = `https://${owner.toLowerCase()}.github.io/${name}/`;
  html = html.replace('content="./docs/social-card.jpg"', `content="${base}docs/social-card.jpg"`).replace('<meta property="og:type"', `<meta property="og:url" content="${base}">\n<meta property="og:type"`);
}
await writeFile(new URL('index.html', output), html);
await writeFile(new URL('.nojekyll', output), '');
console.log(`Static build: dist/${repo ? ` (preview image for ${repo})` : ''}`);
