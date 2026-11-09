'use server';

import { revalidatePath } from 'next/cache';
import { readPlanning, writePlanning } from '@/lib/db';
import { PlanEntry } from '@/lib/types';
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

function parseHeaderToMonth(header: string): string | null {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = String(header).trim().split(' ');
  if (parts.length !== 2) return null;
  const idx = monthNames.indexOf(parts[0]);
  if (idx === -1) return null;
  const year = parseInt(parts[1], 10);
  if (isNaN(year)) return null;
  return `${year}-${String(idx + 1).padStart(2, '0')}`;
}

export async function uploadPlanningExcel(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
  count?: number;
}> {
  const file = formData.get('file') as File | null;
  if (!file) return { ok: false, error: 'No file provided' };

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    return { ok: false, error: 'Could not read file' };
  }

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'array' });
  } catch {
    return { ok: false, error: 'Invalid Excel file' };
  }

  const plans: PlanEntry[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
    if (rows.length < 2) continue;

    const headerRow = rows[0] as unknown[];
    const monthColMap: Record<number, string> = {};
    for (let col = 2; col < headerRow.length; col++) {
      const month = parseHeaderToMonth(String(headerRow[col] ?? ''));
      if (month && PLAN_MONTHS.includes(month)) monthColMap[col] = month;
    }

    for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx] as unknown[];
      const project = String(row[0] ?? '').trim();
      const task = String(row[1] ?? '').trim();
      if (!project && !task) continue;

      for (const [colStr, month] of Object.entries(monthColMap)) {
        const col = Number(colStr);
        const raw = row[col];
        const percent = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''));
        if (isNaN(percent) || percent <= 0) continue;
        plans.push({ user: sheetName, project, task, month, plannedPercent: percent });
      }
    }
  }

  await writePlanning({ plans, lastUpload: new Date().toISOString() });
  revalidatePath('/timesheets');

  return { ok: true, count: plans.length };
}
