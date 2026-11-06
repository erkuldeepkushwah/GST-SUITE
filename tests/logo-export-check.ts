/**
 * Regression check for the Excel export: every sheet must carry the firm logo
 * in A1 and must be protected in a way that locks that logo in place.
 * Runs the real exporter under node with small shims for the browser APIs.
 */
import * as fs from 'fs';
import { exportToExcel } from '../src/services/excelEngine';

(globalThis as any).fetch = async (url: string) => {
  const buf = fs.readFileSync('public' + url);
  return { ok: true, blob: async () => new Blob([buf], { type: 'image/png' }) };
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

async function main() {
  await exportToExcel(
    {
      Dashboard: [{ Section: 'B2B', Status: 'Matched', Count: 1100 }],
      'B2B Reco': [{ GSTIN: '23AAOFT2395R1ZA', 'Invoice No': 'INV-1', Taxable: 1000 }],
    },
    'logo-test.xlsx',
    { gstin: '23AAOFT2395R1ZA', period: 'FY 2026-27', title: 'GST 2A' }
  );
  const buffer = Buffer.from(await (captured as Blob).arrayBuffer());
  fs.writeFileSync('logo-test.xlsx', buffer);

  const mod: any = await import('exceljs');
  const ExcelJS = mod?.default ?? mod;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  let failures = 0;
  wb.eachSheet((ws: any) => {
    const images = ws.getImages();
    const protection = ws.sheetProtection || {};
    const objectsLocked = protection.objects === false;
    const b1 = ws.getCell('B1').value;
    const a1 = ws.getCell('A1').value;
    const ok = images.length === 1 && objectsLocked && !!b1 && !a1;
    if (!ok) failures++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${ws.name}: images=${images.length} objectsLocked=${objectsLocked} ` +
        `B1=${JSON.stringify(String(b1).slice(0, 30))} A1=${JSON.stringify(a1)}`
    );
  });

  console.log(failures === 0 ? 'ALL SHEETS OK' : `${failures} SHEET(S) FAILED`);
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error('FAILED', e);
  process.exit(1);
});
