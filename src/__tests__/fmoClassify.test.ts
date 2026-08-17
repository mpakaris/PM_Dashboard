import { describe, it, expect } from 'vitest';
import {
  deriveBillingClass,
  deriveSubCategory,
  classifyWbs,
  extractTicketId,
  extractTicketName,
  parseSecTrackDate,
  slugifyName,
} from '@/lib/fmoClassify';
import type { FmoWbsEntry } from '@/lib/types';

// ─── deriveBillingClass ───────────────────────────────────────────────────────

describe('deriveBillingClass', () => {
  it('returns V for billable codes', () => {
    expect(deriveBillingClass('V.05921700.81.01')).toBe('V');
  });

  it('returns I for internal codes', () => {
    expect(deriveBillingClass('I.05921059.00.01')).toBe('I');
  });

  it('returns the raw character for unknown prefixes', () => {
    expect(deriveBillingClass('X.12345678.00.01')).toBe('X');
  });

  it('returns "unknown" for empty string', () => {
    expect(deriveBillingClass('')).toBe('unknown');
  });
});

// ─── deriveSubCategory ───────────────────────────────────────────────────────

describe('deriveSubCategory', () => {
  it('returns null for V-class codes (billable needs no sub-category)', () => {
    expect(deriveSubCategory('V.05921700.81.01', {})).toBeNull();
  });

  it('detects admin via IWBS chars 6-10 = 1059', () => {
    expect(deriveSubCategory('I.05921059.00.99', {})).toBe('admin');
  });

  it('detects presales via IWBS 1099', () => {
    expect(deriveSubCategory('I.05921099.00.01', {})).toBe('presales');
  });

  it('detects portfolio via IWBS 1069', () => {
    expect(deriveSubCategory('I.05921069.00.04', {})).toBe('portfolio');
  });

  it('detects opm via IWBS 1076', () => {
    expect(deriveSubCategory('I.05921076.00.06', {})).toBe('opm');
  });

  it('detects opm via IWBS 1066', () => {
    expect(deriveSubCategory('I.05921066.00.01', {})).toBe('opm');
  });

  it('detects opm via IWBS 1055', () => {
    expect(deriveSubCategory('I.05921055.00.01', {})).toBe('opm');
  });

  it('detects opm via IWBS 1056', () => {
    expect(deriveSubCategory('I.05921056.00.01', {})).toBe('opm');
  });

  it('detects training via full-code lookup', () => {
    expect(deriveSubCategory('I.05921059.00.02', {})).toBe('training');
  });

  it('detects absence via full-code lookup', () => {
    expect(deriveSubCategory('I.05921059.00.03', {})).toBe('absence');
  });

  it('returns null for unmapped internal codes', () => {
    expect(deriveSubCategory('I.05921999.00.01', {})).toBeNull();
  });

  it('subCategoryOverride in wbsTable takes priority over auto-derive', () => {
    const wbsTable: Record<string, FmoWbsEntry> = {
      'I.05921059.00.01': {
        code: 'I.05921059.00.01',
        label: 'IAM Admin',
        billingClass: 'I',
        subCategoryOverride: 'training', // override to training
        syncSource: 'manual',
      },
    };
    // would normally auto-resolve to 'admin' but override wins
    expect(deriveSubCategory('I.05921059.00.01', wbsTable)).toBe('training');
  });

  it('returns null for empty code', () => {
    expect(deriveSubCategory('', {})).toBeNull();
  });
});

// ─── classifyWbs ─────────────────────────────────────────────────────────────

describe('classifyWbs', () => {
  it('classifies a billable code correctly', () => {
    expect(classifyWbs('V.05921700.81.01', {})).toEqual({
      billingClass: 'V',
      subCategory: null,
    });
  });

  it('classifies an internal admin code correctly', () => {
    expect(classifyWbs('I.05921059.00.01', {})).toEqual({
      billingClass: 'I',
      subCategory: 'admin',
    });
  });

  it('classifies an unmapped internal code', () => {
    const result = classifyWbs('I.05929999.00.01', {});
    expect(result.billingClass).toBe('I');
    expect(result.subCategory).toBeNull();
  });
});

// ─── extractTicketId ─────────────────────────────────────────────────────────

describe('extractTicketId', () => {
  it('extracts numeric id from standard SecTrack format', () => {
    expect(extractTicketId('#40116 - Barmer IAM Betrieb')).toBe(40116);
  });

  it('returns null when no # prefix', () => {
    expect(extractTicketId('Some task without id')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractTicketId('')).toBeNull();
  });
});

// ─── extractTicketName ───────────────────────────────────────────────────────

describe('extractTicketName', () => {
  it('strips the #ID prefix and dash', () => {
    expect(extractTicketName('#40116 - Barmer IAM Betrieb')).toBe('Barmer IAM Betrieb');
  });

  it('returns the raw string when no id prefix present', () => {
    expect(extractTicketName('Plain task name')).toBe('Plain task name');
  });

  it('handles extra whitespace around the dash', () => {
    expect(extractTicketName('#123 -  Task with spaces  ')).toBe('Task with spaces');
  });
});

// ─── parseSecTrackDate ───────────────────────────────────────────────────────

describe('parseSecTrackDate', () => {
  it('converts DD/MM/YYYY to YYYY-MM-DD', () => {
    expect(parseSecTrackDate('14/08/2026')).toBe('2026-08-14');
  });

  it('zero-pads single-digit day and month', () => {
    expect(parseSecTrackDate('01/01/2025')).toBe('2025-01-01');
  });
});

// ─── slugifyName ─────────────────────────────────────────────────────────────

describe('slugifyName', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(slugifyName('My Category')).toBe('my-category');
  });

  it('strips leading and trailing dashes', () => {
    expect(slugifyName(' spaces ')).toBe('spaces');
  });

  it('collapses multiple non-alphanumeric chars into one dash', () => {
    expect(slugifyName('Pre-Sales & OPM')).toBe('pre-sales-opm');
  });
});
