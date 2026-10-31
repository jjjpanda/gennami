import { rm } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const paths = ['.artifacts', 'debug.log', ...(process.argv.includes('--all') ? ['dist'] : [])];

for (const path of paths) {
  await rm(new URL(path, root), { recursive: true, force: true });
}
console.log(`Removed ${paths.join(', ')}.`);
