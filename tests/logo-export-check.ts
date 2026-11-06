/**
 * Regression checks for the Excel export.
 *
 * 1. A logo that never loads must not block the download (it did: the fetch had
 *    no timeout, so a stalled request left the button doing nothing forever).
 * 2. When the logo does load, every sheet carries it in A1 and sheet protection
 *    locks it (objects="1"), so it cannot be dragged, resized or deleted.
 */
import * as fs from 'fs';
import { exportToExcel, resetLogoCache } from '../src/services/excelEngine';

const logoBytes = fs.readFileSync('public/assets/logo.png');
let mode: 'ok' | 'hang' = 'ok';

(globalThis as any).fetch = (url: string, opts?: any) => {
  if (mode === 'hang') {
    // A real fetch rejects when the abort signal fires; mimic that.
    return new Promise((_resolve: any, reject: any) => {
      const signal = opts?.signal;
      if (signal) signal.addEventListener('abort', () => reject(new Error('The operation was aborted')));
    });
  }
  return Promise.resolve({
    ok: true,
    headers: { get: () => 'image/png' },
    blob: async () => new Blob([logoBytes], { type: 'image/png' }),
  });
};
(globalThis as any).FileReader = class {
  result: any = null;
  onload: any = null;
  onerror: any = null;
  readAsDataURL(blob: Blob) {
    blob.arrayBuffer().then((b) => {
      this.result = 'data:image/png;base64,' + Buffer.from(b).toString('base64');
      this.onload && this.onload();
    });
  }
};
let captured: Blob | null = null;
(globalThis as any).URL = Object.assign(URL, {
  createObjectURL: (b: Blob) => {
    captured = b;
    return 'blob:test';
  },
  revokeObjectURL: () => {},
});
(globalThis as any).document = {
  createElement: () => ({ set href(_v: string) {}, set download(_v: string) {}, click() {}, style: {} }),
  body: { appendChild() {}, removeChild() {} },
};

const SHEETS = {
  Dashboard: [{ Section: 'B2B', Status: 'Matched', Count: 1100 }],
  'B2B Reco': [{ GSTIN: '23AAOFT2395R1ZA', 'Invoice No': 'INV-1', Taxable: 1000 }],
};

async function runExport() {
  captured = null;
  await exportToExcel(SHEETS, 'logo-test.xlsx', { gstin: '23AAOFT2395R1ZA', period: 'FY 2026-27' });
  return Buffer.from(await (captured as Blob).arrayBuffer());
}

async function main() {
  let failures = 0;
  console.log('export checks: starting');

  // --- 1. logo request never answers: the export must still finish ---
  mode = 'hang';
  resetLogoCache();
  const started = Date.now();
  let buffer: Buffer;
  try {
    buffer = await runExport();
  } catch (e: any) {
    console.log('FAIL logo timeout: export threw', e?.message || e);
    process.exit(1);
  }
  const elapsed = Date.now() - started;
  const timedOutOk = elapsed < 10000;
  console.log(`${timedOutOk ? 'PASS' : 'FAIL'} logo hang: export finished in ${elapsed} ms without waiting for the logo`);
  if (!timedOutOk) failures++;

  const mod: any = await import('exceljs');
  const ExcelJS = mod?.default ?? mod;
  const wbNoLogo = new ExcelJS.Workbook();
  await wbNoLogo.xlsx.load(buffer);
  const noLogoImages = wbNoLogo.worksheets.reduce((n: number, ws: any) => n + ws.getImages().length, 0);
  const noLogoOk = noLogoImages === 0;
  console.log(`${noLogoOk ? 'PASS' : 'FAIL'} logo hang: workbook written without images (found ${noLogoImages})`);
  if (!noLogoOk) failures++;

  // --- 2. logo loads: every sheet has it, locked ---
  mode = 'ok';
  resetLogoCache();
  const withLogo = await runExport();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(withLogo);
  wb.eachSheet((ws: any) => {
    const images = ws.getImages();
    const objectsLocked = (ws.sheetProtection || {}).objects === false;
    const b1 = ws.getCell('B1').value;
    const a1 = ws.getCell('A1').value;
    const ok = images.length === 1 && objectsLocked && !!b1 && !a1;
    if (!ok) failures++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${ws.name}: images=${images.length} objectsLocked=${objectsLocked} ` +
        `B1=${JSON.stringify(String(b1).slice(0, 30))} A1=${JSON.stringify(a1)}`
    );
  });

  console.log(failures === 0 ? 'ALL EXPORT CHECKS OK' : `${failures} CHECK(S) FAILED`);
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error('FAILED', e);
  process.exit(1);
});
