'use server';

import { revalidatePath } from 'next/cache';
import { readProjektAnalysis, writeProjektAnalysis } from '@/lib/db';
import {
  ProjektAnalysisProject,
  ProjektAnalysisEntry,
  ProjektAnalysisMemberSettings,
  ProjektAnalysisForecast,
  ProjektAnalysisTicketForecast,
  ProjektAnalysisType,
  ProjektAnalysisChange,
} from '@/lib/types';
import { generateId } from '@/lib/utils';

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

// DD/MM/YYYY → YYYY-MM
function dateToMonth(dateStr: string): string {
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return '';
  const [, m, y] = parts;
  if (!m || !y) return '';
  return `${y}-${m.padStart(2, '0')}`;
}

async function parseCSV(file: File): Promise<ProjektAnalysisEntry[]> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headerRaw = parseLine(lines[0]);
  const h = headerRaw.map(x => x.toLowerCase().replace(/\s+/g, '_'));

  const iTask     = h.indexOf('task');
  const iDate     = h.indexOf('date');
  const iUser     = h.indexOf('user');
  const iActivity = h.indexOf('activity');
  const iTime     = h.findIndex(x => x.includes('spent'));

  if ([iTask, iDate, iUser, iTime].some(x => x < 0)) return [];

  const entries: ProjektAnalysisEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const task      = cols[iTask]?.trim() ?? '';
    const dateStr   = cols[iDate]?.trim() ?? '';
    const user      = cols[iUser]?.trim() ?? '';
    const activity  = iActivity >= 0 ? (cols[iActivity]?.trim() ?? '') : '';
    const spentTime = parseFloat(cols[iTime]?.trim() ?? '0') || 0;
    const month     = dateToMonth(dateStr);
    if (!month || !user || !task || spentTime <= 0) continue;
    entries.push({ task, month, user, activity, spentTime });
  }
  return entries;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function uploadProjektAnalysisCSV(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
  projectId?: string;
}> {
  const file = formData.get('file') as File | null;
  if (!file) return { ok: false, error: 'No file provided' };

  const name = file.name.replace(/\.csv$/i, '');
  const entries = await parseCSV(file);
  if (entries.length === 0) return { ok: false, error: 'No valid entries found in CSV' };

  const projects = await readProjektAnalysis();
  const existingIdx = projects.findIndex(p => p.name.toLowerCase() === name.toLowerCase());

  const uniqueTasks = [...new Set(entries.map(e => e.task))].sort();

  let project: ProjektAnalysisProject;

  if (existingIdx >= 0) {
    const existing = projects[existingIdx];
    const existingTicketMap = new Map(existing.forecast.tickets.map(t => [t.task, t]));
    const mergedTickets: ProjektAnalysisTicketForecast[] = uniqueTasks.map(task =>
      existingTicketMap.get(task) ?? { task, expectedHours: 0, billable: true, rate: 0 }
    );
    const activeUsers = new Set(entries.map(e => e.user));
    project = {
      ...existing,
      uploadedAt: new Date().toISOString(),
      entries,
      memberSettings: existing.memberSettings.filter(s => activeUsers.has(s.user)),
      forecast: { ...existing.forecast, tickets: mergedTickets },
    };
    projects[existingIdx] = project;
  } else {
    project = {
      id: generateId(),
      name,
      createdAt: new Date().toISOString(),
      uploadedAt: new Date().toISOString(),
      projectType: 'time-and-material',
      contractHours: 0,
      contractValue: 0,
      changes: [],
      entries,
      memberSettings: [],
      forecast: {
        monthsRemaining: 0,
        totalExpectedHours: 0,
        tickets: uniqueTasks.map(task => ({ task, expectedHours: 0, billable: true, rate: 0 })),
      },
    };
    projects.push(project);
  }

  await writeProjektAnalysis(projects);
  revalidatePath('/projekt-analysis');

  return { ok: true, projectId: project.id };
}

export async function deleteProjektAnalysisProject(id: string): Promise<void> {
  const projects = await readProjektAnalysis();
  await writeProjektAnalysis(projects.filter(p => p.id !== id));
  revalidatePath('/projekt-analysis');
}

export async function updateProjektAnalysisMemberSettings(
  id: string,
  settings: ProjektAnalysisMemberSettings[]
): Promise<void> {
  const projects = await readProjektAnalysis();
  const idx = projects.findIndex(p => p.id === id);
  if (idx < 0) return;
  projects[idx] = { ...projects[idx], memberSettings: settings };
  await writeProjektAnalysis(projects);
  revalidatePath(`/projekt-analysis/${id}`);
}

export async function updateProjektAnalysisForecast(
  id: string,
  forecast: ProjektAnalysisForecast
): Promise<void> {
  const projects = await readProjektAnalysis();
  const idx = projects.findIndex(p => p.id === id);
  if (idx < 0) return;
  projects[idx] = { ...projects[idx], forecast };
  await writeProjektAnalysis(projects);
  revalidatePath(`/projekt-analysis/${id}`);
}

export async function updateProjektAnalysisProjectSettings(
  id: string,
  settings: { projectType: ProjektAnalysisType; contractHours: number; contractValue: number }
): Promise<void> {
  const projects = await readProjektAnalysis();
  const idx = projects.findIndex(p => p.id === id);
  if (idx < 0) return;
  projects[idx] = { ...projects[idx], ...settings };
  await writeProjektAnalysis(projects);
  revalidatePath(`/projekt-analysis/${id}`);
}

export async function updateProjektAnalysisChanges(
  id: string,
  changes: ProjektAnalysisChange[]
): Promise<void> {
  const projects = await readProjektAnalysis();
  const idx = projects.findIndex(p => p.id === id);
  if (idx < 0) return;
  projects[idx] = { ...projects[idx], changes };
  await writeProjektAnalysis(projects);
  revalidatePath(`/projekt-analysis/${id}`);
}
