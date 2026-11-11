/**
 * Publishes the static marketing site in ./landing at the root of the build.
 *
 *   /                 -> landing home page  (via _redirects rewrite)
 *   /about.html       -> landing about page
 *   /solutions.html   -> module gallery
 *   /blog.html        -> blog
 *   /contact.html     -> contact
 *   /landing/...      -> same pages, browsable as a folder
 *   /index.html       -> the React app, untouched
 *
 * The app shell is never renamed or overwritten, so the GitHub Pages build
 * (which copies dist/ into docs/app/) keeps working exactly as before.
 */
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const SRC = 'landing';
const FILES = [
  'index.html',
  'about.html',
  'solutions.html',
  'blog.html',
  'contact.html',
  'styles.css',
  'app.js',
];

if (!existsSync(SRC)) {
  console.warn('[landing] no ./landing folder, skipping');
  process.exit(0);
}
if (!existsSync(join(DIST, 'index.html'))) {
  console.warn('[landing] dist/index.html not found, skipping (run after vite build)');
  process.exit(0);
}

// 1. the app keeps its own index.html, but Cloudflare Pages normalises
//    /index.html to /, which is rewritten to the marketing home. Publish the
//    same shell at /app/ so the app has a URL of its own.
mkdirSync(join(DIST, 'app'), { recursive: true });
cpSync(join(DIST, 'index.html'), join(DIST, 'app', 'index.html'));

// 2. keep a browsable copy at /landing/
mkdirSync(join(DIST, 'landing'), { recursive: true });
for (const file of FILES) {
  cpSync(join(SRC, file), join(DIST, 'landing', file));
}

// 3. flat copies at the site root; the home page becomes home.html
for (const file of FILES) {
  const target = file === 'index.html' ? 'home.html' : file;
  cpSync(join(SRC, file), join(DIST, target));
}

// 4. serve the marketing home at "/" and leave the app at /index.html
writeFileSync(
  join(DIST, '_redirects'),
  [
    '# Marketing home at the site root.',
    '# The React app is published at /app/.',
    '/            /home.html    200',
    '',
  ].join('\n'),
);

console.log('[landing] published home + 4 pages to the build root; app at /app/');
