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
  (f) => !f.startsWith('.') && /\.(html|css|js|png|jpe?g|svg|webp|gif|ico)$/i.test(f),
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

// Copy module artwork from the repository's shared assets folder.
// This makes /assets/module-*.webp available to marketing home and /landing/ pages.
const MODULE_IMAGES = [
  'module-gst-2a.webp',
  'module-gstr1-3b.webp',
  'module-gst-reconciliation.webp',
  'module-bank.webp',
  'module-tds.webp',
  'module-stock.webp',
];
mkdirSync(join(DIST, 'assets'), { recursive: true });
for (const image of MODULE_IMAGES) {
  const source = join('assets', image);
  if (!existsSync(source)) {
    throw new Error(`Missing module artwork: ${source}`);
  }
  cpSync(source, join(DIST, 'assets', image));
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
