/**
 * Publishes whatever sits in ./landing at the root of the build.
 *
 *   /                 -> landing home page  (via _redirects rewrite)
 *   /<page>.html      -> every other page in the folder
 *   /landing/...      -> the same files, browsable as a folder
 *   /index.html       -> the React app, untouched
 *
 * The folder is read at build time instead of a hard-coded list, so pages can
 * be added or removed without touching this script. styles.css / app.js are
 * copied only when they exist. The app shell is never renamed or overwritten,
 * so the GitHub Pages build (which copies dist/ into docs/app/) is unaffected.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const SRC = 'landing';

if (!existsSync(SRC)) {
  console.warn('[landing] no ./landing folder, skipping');
  process.exit(0);
}
if (!existsSync(join(DIST, 'index.html'))) {
  console.warn('[landing] dist/index.html not found, skipping (run after vite build)');
  process.exit(0);
}

// every page plus any shared css / js sitting beside it
const files = readdirSync(SRC).filter(
  (f) => !f.startsWith('.') && /\.(html|css|js)$/i.test(f),
);
if (!files.length) {
  console.warn('[landing] nothing to publish in ./landing');
  process.exit(0);
}

// 1. keep a browsable copy at /landing/
mkdirSync(join(DIST, 'landing'), { recursive: true });
for (const file of files) {
  cpSync(join(SRC, file), join(DIST, 'landing', file));
}

// 2. flat copies at the site root; the home page becomes home.html
for (const file of files) {
  const target = file === 'index.html' ? 'home.html' : file;
  cpSync(join(SRC, file), join(DIST, target));
}

// 3. serve the marketing home at "/" and leave the app at /index.html
writeFileSync(
  join(DIST, '_redirects'),
  [
    '# Marketing home at the site root.',
    '# The React app is published at /app/.',
    '/            /home.html    200',
    '',
  ].join('\n'),
);

console.log(`[landing] published ${files.length} file(s) to the build root; app at /app/`);
