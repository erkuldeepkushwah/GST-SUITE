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
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSync } from 'esbuild';
import { execFileSync } from 'node:child_process';

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

// Parse portal entry points as real ES modules (package.json has type=module).
// Reject duplicate top-level declarations and invalid imports before deployment.
for (const file of ['dashboard.js','dashboard-start.js','auth.js','admin.js','business-workspace.js','firm-workspace.js','document-upload.js','filing-periods.js','workflow-widgets.js','workflow-export.js','portal-fast-cache.js']) {
  if (existsSync(join(SRC,file))) execFileSync(process.execPath,['--check',join(SRC,file)],{stdio:'inherit'});
}

// Verify secure portal contracts with synthetic fixtures before publishing.
execFileSync(process.execPath,['tests/portal-regression.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['tests/workflow-v2.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['tests/contact-enquiries.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['tests/portal-fast-cache.mjs'],{stdio:'inherit'});

// 1. keep a browsable copy at /landing/
mkdirSync(join(DIST, 'landing'), { recursive: true });
for (const file of files) {
  if (file.endsWith('.html')) {
    // Nested /landing/ pages resolve shared module images from ../assets/.
    const html = readFileSync(join(SRC, file), 'utf8').replace(/src="assets\/(module-[^" ]+\.webp|priya-mehta\.jpg|rohan-verma\.jpg)"/g, 'src="../assets/$1"');
    writeFileSync(join(DIST, 'landing', file), html.replaceAll('src="chatbot.js"', 'src="../chatbot.js"'));
  } else {
    cpSync(join(SRC, file), join(DIST, 'landing', file));
  }
}

// 2. flat copies at the site root; the home page becomes home.html
for (const file of files) {
  const target = file === 'index.html' ? 'home.html' : file;
  cpSync(join(SRC, file), join(DIST, target));
}

// Bundle the portal PDF renderer using the project's locked dependencies.
if (existsSync(join(SRC,'portal-pdf.js'))) {
  buildSync({ entryPoints:[join(SRC,'portal-pdf.js')],bundle:true,format:'esm',platform:'browser',target:'es2020',minify:true,outfile:join(DIST,'portal-pdf.js') });
  cpSync(join(DIST,'portal-pdf.js'),join(DIST,'landing','portal-pdf.js'));
}
if (existsSync(join(SRC,'workflow-export.js'))) {
 buildSync({entryPoints:[join(SRC,'workflow-export.js')],bundle:true,format:'esm',platform:'browser',target:'es2020',minify:true,outfile:join(DIST,'workflow-export.js')});
 cpSync(join(DIST,'workflow-export.js'),join(DIST,'landing','workflow-export.js'));
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
  'priya-mehta.jpg',
  'rohan-verma.jpg',
  'login.jpg',
  'banner.jpg',
  'service-gstr3b.webp',
  'service-tds.webp',
  'service-reconciliation.webp',
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
