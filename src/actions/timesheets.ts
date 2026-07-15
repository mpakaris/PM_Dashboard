'use server';

import { revalidatePath } from 'next/cache';
import { readTimesheets, writeTimesheets } from '@/lib/db';
import { TimesheetEntry } from '@/lib/types';

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQ = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i += 2; }
      else { inQ = !inQ; i++; }
    } else if (ch === ',' && !inQ) {
      fields.push(cur.trim()); cur = ''; i++;
    } else {
      cur += ch; i++;
    }
  }
  fields.push(cur.trim());
  return fields;
}

function datToMonth(dateStr: string): string {
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return '';
  const [, m, y] = parts;
  if (!m || !y) return '';
  return `${y}-${m.padStart(2, '0')}`;
}

async function parseFile(file: File, sourceName: string): Promise<TimesheetEntry[]> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headerRaw = parseLine(lines[0]);
  const h = headerRaw.map(x => x.toLowerCase().replace(/\s+/g, '_'));
  const iProject = h.indexOf('project');
  const iTask    = h.indexOf('task');
  const iDate    = h.indexOf('date');
  const iUser    = h.indexOf('user');
  const iTime    = h.findIndex(x => x.includes('spent'));
  if ([iProject, iTask, iDate, iUser, iTime].some(x => x < 0)) return [];
  const entries: TimesheetEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const project   = cols[iProject]?.trim() ?? '';
    const task      = cols[iTask]?.trim() ?? '';
    const dateStr   = cols[iDate]?.trim() ?? '';
    const user      = cols[iUser]?.trim() ?? '';
    const spentTime = parseFloat(cols[iTime]?.trim() ?? '0') || 0;
    const month     = datToMonth(dateStr);
    if (!month || !user || spentTime <= 0) continue;
    entries.push({ project, task, month, user, spentTime, source: sourceName });
  }
  return entries;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function uploadTimesheetFiles(formData: FormData): Promise<{
  added: number;
  total: number;
  sources: string[];
  error?: string;
}> {
  const files = formData.getAll('files') as File[];
  if (files.length === 0) return { added: 0, total: 0, sources: [], error: 'No files provided' };

  const store = await readTimesheets();

  // Remove existing entries for files being re-uploaded, keep all others
  const uploadedNames = new Set(files.map(f => f.name));
  const kept = store.entries.filter(e => !uploadedNames.has(e.source));

  // Parse new files
  const newEntries: TimesheetEntry[] = [];
  for (const file of files) {
    newEntries.push(...await parseFile(file, file.name));
  }

  const allEntries = [...kept, ...newEntries];
  const allSources = [...new Set(allEntries.map(e => e.source))].sort();

  await writeTimesheets({ entries: allEntries, lastUpload: new Date().toISOString(), sources: allSources });
  revalidatePath('/timesheets');

  return { added: newEntries.length, total: allEntries.length, sources: allSources };
}

export async function deleteTimesheetPerson(user: string): Promise<void> {
  const store = await readTimesheets();
  const entries = store.entries.filter(e => e.user !== user);
  const sources = [...new Set(entries.map(e => e.source))].sort();
  await writeTimesheets({ ...store, entries, sources });
  revalidatePath('/timesheets');
}

export async function clearTimesheets(): Promise<void> {
  await writeTimesheets({ entries: [], lastUpload: '', sources: [] });
  revalidatePath('/timesheets');
}
