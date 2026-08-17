export function generateId(): string {
  return crypto.randomUUID();
}

export function getMonthsBetween(start: string, end: string): string[] {
  const months: string[] = [];
  const [startYear, startMonth] = start.split('-').map(Number);
  const [endYear, endMonth] = end.split('-').map(Number);

  let year = startYear;
  let month = startMonth;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  return months;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('de-DE');
}

// Shared filtering logic: does an FMO entry belong to a project?
// Import FmoEntry and FmoProject inline to avoid circular deps in this pure util.
export function opsContractActiveInMonth(
  c: { startDate?: string; endDate?: string },
  month: string, // "YYYY-MM"
): boolean {
  if (c.startDate && month < c.startDate.slice(0, 7)) return false;
  if (c.endDate   && month > c.endDate.slice(0, 7))   return false;
  return true;
}

export function entryBelongsToProject(
  e: { wbsCode: string | null; ticketId: number | null },
  p: { wbsCodes: string[]; ticketIds?: number[]; excludedTicketIds?: number[] },
): boolean {
  const excluded = p.excludedTicketIds ?? [];
  const extras   = p.ticketIds ?? [];
  const byWbs    = !!e.wbsCode && p.wbsCodes.includes(e.wbsCode)
    && (e.ticketId === null || !excluded.includes(e.ticketId));
  const byTicket = e.ticketId !== null && extras.includes(e.ticketId);
  return byWbs || byTicket;
}

/**
 * Implied billing rate for a fixed-price project:
 * total contract value ÷ total budgeted hours.
 * Returns 0 when the project is not fixprice or has no budget hours.
 */
export function fpImpliedRate(project: {
  projectType: string;
  budgetEur?: number;
  contractValue?: number;
  budgetHours?: number;
  contractHours?: number;
  changes?: Array<{ status: string; budgetEur: number }>;
}): number {
  if (project.projectType !== 'fixprice') return 0;
  const value = (project.budgetEur ?? project.contractValue ?? 0)
    + (project.changes ?? []).filter(c => c.status === 'approved').reduce((s, c) => s + c.budgetEur, 0);
  const hours = project.budgetHours ?? project.contractHours ?? 0;
  return hours > 0 ? value / hours : 0;
}

export function rateAtMonth(
  currentRate: number,
  history: Array<{ from: string; rate: number }> | undefined,
  month: string
): number {
  if (!history || history.length === 0) return currentRate;
  const sorted = [...history].sort((a, b) => a.from.localeCompare(b.from));
  let result = sorted[0].rate;
  for (const h of sorted) {
    if (h.from <= month) result = h.rate;
    else break;
  }
  return result;
}

export function formatMonth(month: string): string {
  const [year, monthNum] = month.split('-');
  const date = new Date(Number(year), Number(monthNum) - 1, 1);
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}
