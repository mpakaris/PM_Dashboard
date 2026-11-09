import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { parseSession } from '@/lib/auth';
import { readTimesheets, readPlanning } from '@/lib/db';
import * as XLSX from 'xlsx';

// Jan 2027 – Jun 2028 (18 months)
const PLAN_MONTHS: string[] = (() => {
  const months: string[] = [];
  for (let i = 0; i < 18; i++) {
    const year = 2027 + Math.floor(i / 12);
    const month = (i % 12) + 1;
    months.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return months;
})();

function fmtMonthHeader(ym: string): string {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

export async function GET() {
  const store = await cookies();
  const role = await parseSession(store.get('session')?.value);
  if (role !== 'admin') {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const [tsStore, planning] = await Promise.all([readTimesheets(), readPlanning()]);

  const users = [...new Set(tsStore.entries.map(e => e.user))].sort();
  const wb = XLSX.utils.book_new();

  const planMap = new Map<string, number>();
  for (const p of planning.plans) {
    planMap.set(`${p.user}|||${p.project}|||${p.task}|||${p.month}`, p.plannedPercent);
  }

  for (const user of users) {
    const userEntries = tsStore.entries.filter(e => e.user === user);
    const ticketSet = new Set<string>();
    for (const e of userEntries) ticketSet.add(`${e.project}|||${e.task}`);
    const tickets = [...ticketSet].sort().map(t => {
      const sep = t.indexOf('|||');
      return { project: t.slice(0, sep), task: t.slice(sep + 3) };
    });

    const header = ['Project', 'Task', ...PLAN_MONTHS.map(fmtMonthHeader)];
    const rows: (string | number | null)[][] = [header];

    for (const { project, task } of tickets) {
      const row: (string | number | null)[] = [project, task];
      for (const month of PLAN_MONTHS) {
        const key = `${user}|||${project}|||${task}|||${month}`;
        row.push(planMap.get(key) ?? null);
      }
      rows.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 32 }, { wch: 32 }, ...PLAN_MONTHS.map(() => ({ wch: 10 }))];
    XLSX.utils.book_append_sheet(wb, ws, user.substring(0, 31));
  }

  if (users.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([['No timesheet data loaded yet.']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Info');
  }

  const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const arrayBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(arrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="planung_${date}.xlsx"`,
    },
  });
}
