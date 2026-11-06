/**
 * GSTIN checks.
 *
 * A GSTIN is 15 characters: 2-digit state code + 10-character PAN + entity
 * number + 'Z' + check digit. The check digit is the standard GSTN mod-36
 * calculation, so a typo in any character is caught before a reconciliation
 * run uses the wrong GSTIN.
 *
 * `validateGstin` returns *why* a GSTIN failed (length, character set, format,
 * PAN holder type, state code or check digit) so the UI can point at the real
 * mistake instead of a generic "invalid".
 */
const CODE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * GST state codes. 25 (Daman & Diu) and 26 (Dadra & Nagar Haveli and Daman &
 * Diu) both stay in the list: registrations issued before the 2020 merger
 * still carry 25 and must not be flagged as typos.
 */
export const GST_STATE_NAMES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman & Diu (merged into 26)',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};

/** 4th character of the PAN, which records the holder type. */
export const PAN_HOLDER_TYPES: Record<string, string> = {
  P: 'Individual',
  C: 'Company',
  H: 'HUF',
  F: 'Firm / LLP',
  A: 'Association of Persons',
  T: 'Trust',
  B: 'Body of Individuals',
  L: 'Local Authority',
  J: 'Artificial Juridical Person',
  G: 'Government',
};

export type GstinIssueCode = 'length' | 'charset' | 'pattern' | 'pan' | 'state' | 'checksum';

export type GstinCheck =
  | { status: 'empty'; normalized: '' }
  | {
      status: 'valid';
      normalized: string;
      stateCode: string;
      stateName: string;
      pan: string;
      holderType: string;
    }
  | {
      status: 'invalid';
      normalized: string;
      issue: GstinIssueCode;
      /** State code as typed, useful even when the GSTIN is otherwise broken. */
      stateCode: string;
      stateName?: string;
      pan?: string;
      expectedCheck?: string;
      actualCheck?: string;
    };

/** Uppercase and drop spaces, hyphens and any other separator. */
export function normalizeGstin(raw: unknown): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
}

/** Check digit for the first 14 characters of a GSTIN (mod-36). */
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

export function validateGstin(raw: unknown): GstinCheck {
  const g = normalizeGstin(raw);
  if (!g) return { status: 'empty', normalized: '' };

  const stateCode = g.slice(0, 2);
  const pan = g.length >= 12 ? g.slice(2, 12) : undefined;
  const stateName = GST_STATE_NAMES[stateCode];

  if (g.length !== 15) {
    return { status: 'invalid', normalized: g, issue: 'length', stateCode, stateName, pan };
  }
  if (!/^[0-9A-Z]{15}$/.test(g)) {
    return { status: 'invalid', normalized: g, issue: 'charset', stateCode, stateName, pan };
  }
  // 2 state digits + 5 PAN letters + 4 PAN digits + PAN holder letter +
  // entity number + 'Z' + check digit.
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(g)) {
    return { status: 'invalid', normalized: g, issue: 'pattern', stateCode, stateName, pan };
  }
  if (!stateName) {
    return { status: 'invalid', normalized: g, issue: 'state', stateCode };
  }
  // 4th character of the PAN (index 5 of the GSTIN) is the holder type.
  const holderType = PAN_HOLDER_TYPES[g[5]];
  if (!holderType) {
    return { status: 'invalid', normalized: g, issue: 'pan', stateCode, stateName, pan };
  }

  const expectedCheck = gstinChecksum(g);
  if (expectedCheck !== g[14]) {
    return {
      status: 'invalid',
      normalized: g,
      issue: 'checksum',
      stateCode,
      stateName,
      pan,
      expectedCheck,
      actualCheck: g[14],
    };
  }

  return {
    status: 'valid',
    normalized: g,
    stateCode,
    stateName,
    pan: pan as string,
    holderType,
  };
}

export function isValidGstin(gstin: string): boolean {
  return validateGstin(gstin).status === 'valid';
}

/** Translation key for an issue code, e.g. 'checksum' -> 'gstin_reason_checksum'. */
export function gstinIssueKey(issue: GstinIssueCode): string {
  return `gstin_reason_${issue}`;
}

/** Short one-line summary, e.g. "23 - Madhya Pradesh | PAN AAOFT2395R". */
export function describeGstin(raw: unknown): string {
  const check = validateGstin(raw);
  if (check.status !== 'valid') return '';
  return `${check.stateCode} - ${check.stateName} · PAN ${check.pan}`;
}
