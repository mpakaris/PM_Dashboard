import { describe, it, expect } from 'vitest';
import {
  entryBelongsToProject,
  rateAtMonth,
  opsContractActiveInMonth,
  fpImpliedRate,
  getMonthsBetween,
} from '@/lib/utils';

// ─── entryBelongsToProject ───────────────────────────────────────────────────

describe('entryBelongsToProject', () => {
  const project = {
    wbsCodes: ['V.05921700.81.01', 'V.05921700.81.03'],
    ticketIds: [99001],
    excludedTicketIds: [50000],
  };

  it('matches entry by WBS code', () => {
    expect(entryBelongsToProject(
      { wbsCode: 'V.05921700.81.01', ticketId: null },
      project,
    )).toBe(true);
  });

  it('does not match entry with unrelated WBS code', () => {
    expect(entryBelongsToProject(
      { wbsCode: 'I.05921059.00.01', ticketId: null },
      project,
    )).toBe(false);
  });

  it('matches entry by explicit ticketId even without WBS code', () => {
    expect(entryBelongsToProject(
      { wbsCode: null, ticketId: 99001 },
      project,
    )).toBe(true);
  });

  it('excludes a ticket that is in excludedTicketIds even if WBS matches', () => {
    expect(entryBelongsToProject(
      { wbsCode: 'V.05921700.81.01', ticketId: 50000 },
      project,
    )).toBe(false);
  });

  it('returns false when both wbsCode and ticketId are null', () => {
    expect(entryBelongsToProject(
      { wbsCode: null, ticketId: null },
      project,
    )).toBe(false);
  });

  it('works when project has no ticketIds or excludedTicketIds', () => {
    const minimalProject = { wbsCodes: ['V.05921700.81.01'] };
    expect(entryBelongsToProject(
      { wbsCode: 'V.05921700.81.01', ticketId: null },
      minimalProject,
    )).toBe(true);
  });
});

// ─── rateAtMonth ─────────────────────────────────────────────────────────────

describe('rateAtMonth', () => {
  it('returns currentRate when history is empty', () => {
    expect(rateAtMonth(100, [], '2026-06')).toBe(100);
  });

  it('returns currentRate when history is undefined', () => {
    expect(rateAtMonth(100, undefined, '2026-06')).toBe(100);
  });

  it('returns the rate that was active at the given month', () => {
    const history = [
      { from: '2025-01', rate: 80 },
      { from: '2026-01', rate: 100 },
    ];
    expect(rateAtMonth(120, history, '2025-06')).toBe(80);
    expect(rateAtMonth(120, history, '2026-01')).toBe(100);
    expect(rateAtMonth(120, history, '2026-07')).toBe(100);
  });

  it('uses the first history entry for months before the earliest from', () => {
    const history = [{ from: '2026-01', rate: 100 }];
    expect(rateAtMonth(120, history, '2024-01')).toBe(100);
  });

  it('handles unsorted history entries', () => {
    const history = [
      { from: '2026-01', rate: 100 },
      { from: '2025-01', rate: 80 },
    ];
    expect(rateAtMonth(120, history, '2025-06')).toBe(80);
    expect(rateAtMonth(120, history, '2026-03')).toBe(100);
  });
});

// ─── opsContractActiveInMonth ─────────────────────────────────────────────────

describe('opsContractActiveInMonth', () => {
  it('returns true when no start/end date is set', () => {
    expect(opsContractActiveInMonth({}, '2026-05')).toBe(true);
  });

  it('returns false for month before startDate', () => {
    expect(opsContractActiveInMonth({ startDate: '2026-03-01' }, '2026-02')).toBe(false);
  });

  it('returns true for month equal to startDate month', () => {
    expect(opsContractActiveInMonth({ startDate: '2026-03-01' }, '2026-03')).toBe(true);
  });

  it('returns false for month after endDate', () => {
    expect(opsContractActiveInMonth({ endDate: '2026-06-30' }, '2026-07')).toBe(false);
  });

  it('returns true for month equal to endDate month', () => {
    expect(opsContractActiveInMonth({ endDate: '2026-06-30' }, '2026-06')).toBe(true);
  });

  it('returns true for month within start/end range', () => {
    expect(opsContractActiveInMonth(
      { startDate: '2026-01-01', endDate: '2026-12-31' },
      '2026-06',
    )).toBe(true);
  });
});

// ─── fpImpliedRate ────────────────────────────────────────────────────────────

describe('fpImpliedRate', () => {
  it('returns 0 for T&M projects', () => {
    expect(fpImpliedRate({ projectType: 'tm', budgetHours: 1000, budgetEur: 100000 })).toBe(0);
  });

  it('returns 0 when budgetHours is 0', () => {
    expect(fpImpliedRate({ projectType: 'fixprice', budgetHours: 0, budgetEur: 100000 })).toBe(0);
  });

  it('computes contractValue / budgetHours', () => {
    expect(fpImpliedRate({ projectType: 'fixprice', budgetHours: 1000, budgetEur: 150000 })).toBe(150);
  });

  it('adds approved change orders to the base value', () => {
    const project = {
      projectType: 'fixprice',
      budgetHours: 1000,
      budgetEur: 100000,
      changes: [
        { status: 'approved', budgetEur: 20000 },
        { status: 'pending',  budgetEur: 50000 }, // ignored
      ],
    };
    expect(fpImpliedRate(project)).toBe(120); // (100000 + 20000) / 1000
  });

  it('falls back to contractValue when budgetEur is absent', () => {
    expect(fpImpliedRate({ projectType: 'fixprice', contractHours: 500, contractValue: 75000 })).toBe(150);
  });
});

// ─── getMonthsBetween ────────────────────────────────────────────────────────

describe('getMonthsBetween', () => {
  it('returns a single month when start equals end', () => {
    expect(getMonthsBetween('2026-06', '2026-06')).toEqual(['2026-06']);
  });

  it('returns all months in a quarter', () => {
    expect(getMonthsBetween('2026-01', '2026-03')).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('handles year boundary correctly', () => {
    expect(getMonthsBetween('2025-11', '2026-02')).toEqual([
      '2025-11', '2025-12', '2026-01', '2026-02',
    ]);
  });
});
