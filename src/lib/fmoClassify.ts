import { FmoWbsEntry, FmoMappingStore, SyncSource, WbsBillingClass } from './types';

/**
 * Type 1 — Billing Class.
 * Derived entirely from the first character of the WBS code.
 * Unknown prefixes return the raw character so new types surface visibly.
 */
export function deriveBillingClass(code: string): WbsBillingClass {
  return code[0] ?? 'unknown';
}

/**
 * Type 2 — Sub-Category slug.
 * Only meaningful for Internal ('I.*') entries.
 * V.* entries return null — "Billable" is their complete classification.
 * Admin override (subCategoryOverride) takes priority over auto-derive.
 */
export function deriveSubCategory(
  code: string,
  wbsTable: Record<string, FmoWbsEntry>
): string | null {
  if (!code) return null;

  if (code.startsWith('V.')) return null;

  const override = wbsTable[code]?.subCategoryOverride;
  if (override) return override;

  // Full-code lookup first — more specific than the IWBS prefix shortcut below.
  // Without this order, I.05921059.00.02 (training) and .00.03 (absence) would
  // be incorrectly classified as 'admin' because they share the 1059 IWBS digits.
  const fullMap: Record<string, string> = {
    'I.05921059.00.01': 'admin',
    'I.05921059.00.02': 'training',
    'I.05921059.00.03': 'absence',
  };
  if (fullMap[code]) return fullMap[code];

  // IWBS auto-derive: characters 6–10 (Excel MID(WBS,7,4))
  const iwbs = code.slice(6, 10);
  const iwbsMap: Record<string, string> = {
    '1059': 'admin',
    '8000': 'admin',
    '1099': 'presales',
    '1069': 'portfolio',
    '1076': 'opm',
    '1066': 'opm',
    '1055': 'opm',
    '1056': 'opm',
  };
  return iwbsMap[iwbs] ?? null;
}

export function classifyWbs(
  code: string,
  wbsTable: Record<string, FmoWbsEntry>
): { billingClass: WbsBillingClass; subCategory: string | null } {
  return {
    billingClass: deriveBillingClass(code),
    subCategory: deriveSubCategory(code, wbsTable),
  };
}

export function slugifyName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function extractTicketId(task: string): number | null {
  const m = task.match(/^#(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export function extractTicketName(task: string): string {
  const m = task.match(/^#\d+\s*-\s*(.+)$/);
  return m ? m[1].trim() : task;
}

export function parseSecTrackDate(raw: string): string {
  const [d, m, y] = raw.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export function seedWbsEntries(): FmoWbsEntry[] {
  const entries: Array<[string, string]> = [
    ['I.05921011.00.01', 'Schaffrath Cisco DUO'],
    ['I.05921055.00.01', 'GRC Cloud OPM'],
    ['I.05921059.00.01', 'IAM Administration'],
    ['I.05921059.00.02', 'IAM Training'],
    ['I.05921059.00.03', 'IAM Absence'],
    ['I.05921066.00.01', 'Andrea Administrative Tasks'],
    ['I.05921069.00.04', 'Hitguard Portfolioentwicklung'],
    ['I.05921069.00.05', 'IAM Portfolioentwicklung'],
    ['I.05921069.00.07', 'Hitguard SASE'],
    ['I.05921076.00.06', 'KRL Patch Management OPM'],
    ['I.05921099.00.01', 'Presales AT'],
    ['I.05921099.00.02', 'Presales DE'],
    ['I.05921099.00.03', 'Presales CH'],
    ['V.00300592.01.01', 'Corporate Volunteering'],
    ['V.05920030.64.81', 'TSA - UNIQA - IAM'],
    ['V.05920030.64.81.01', 'UNIQA PAM Deployment'],
    ['V.05920030.80.01.44', 'Donauwalzer ODC Migration'],
    ['V.05920030.98.81.01', 'TSA - IAM Projekte Union IT'],
    ['V.05921470.81.01', 'MA01 Wien Digital IDM.ONe'],
    ['V.05921470.81.05', 'MA01 Wien Digital SUN.idm'],
    ['V.05921700.81.01', 'DTSec Barmer IAM Betrieb'],
    ['V.05921700.81.03', 'DTSec Barmer IAM Entwicklung'],
  ];
  return entries.map(([code, label]) => {
    const { billingClass, subCategory } = classifyWbs(code, {});
    return {
      code,
      label,
      billingClass,
      subCategory: subCategory ?? undefined,
      syncSource: 'manual' as SyncSource,
    };
  });
}

export const SEED_BILLING_CLASSES: Record<string, string> = {
  V: 'Billable',
  I: 'Internal',
};

export const SEED_SUB_CATEGORIES: FmoMappingStore['subCategories'] = {
  admin:     { id: 'admin',     label: 'Administration' },
  training:  { id: 'training',  label: 'Training' },
  presales:  { id: 'presales',  label: 'Presales' },
  portfolio: { id: 'portfolio', label: 'Portfolioentwicklung' },
  opm:       { id: 'opm',       label: 'OPM' },
  absence:   { id: 'absence',   label: 'Absence' },
};
