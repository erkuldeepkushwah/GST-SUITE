/**
 * GSTIN checks: 15 characters, 2-digit state code + PAN + entity code + 'Z' + checksum.
 * The checksum is the standard GSTN mod-36 calculation, so a typo in any
 * character is caught before a reconciliation run uses the wrong GSTIN.
 */
const CODE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function gstinChecksum(gstin: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CODE.indexOf(gstin[i]);
    if (value < 0) return '';
    const factor = i % 2 === 0 ? 1 : 2;
    const product = value * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CODE[(36 - (sum % 36)) % 36];
}

export function isValidGstin(gstin: string): boolean {
  const g = (gstin || '').trim().toUpperCase();
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(g)) return false;
  return gstinChecksum(g) === g[14];
}
