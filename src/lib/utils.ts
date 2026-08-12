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

export function formatMonth(month: string): string {
  const [year, monthNum] = month.split('-');
  const date = new Date(Number(year), Number(monthNum) - 1, 1);
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}
