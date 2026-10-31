import { cp, writeFile, rm } from 'node:fs/promises';

// No bundler or runtime dependency. ES module and worker URLs stay relative.
await rm('dist', { recursive: true, force: true });

for (const file of ['index.html', 'embed', 'src']) {
  await cp(file, `dist/${file}`, { recursive: true });
}

await writeFile('dist/.nojekyll', '');
console.log('Built dist/: native ES modules, standalone page, iframe, and module worker.');
