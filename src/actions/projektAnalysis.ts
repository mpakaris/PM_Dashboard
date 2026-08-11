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
  OperationContract,
} from '@/lib/types';
import { generateId } from '@/lib/utils';
import * as XLSX from 'xlsx';

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

// Supports DD/MM/YYYY, DD.MM.YYYY, and YYYY-MM-DD → YYYY-MM
function dateToMonth(dateStr: string): string {
  const s = dateStr.trim();
  // ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);
  // DD/MM/YYYY or DD.MM.YYYY
  const parts = s.split(/[\/\.]/);
  if (parts.length === 3 && parts[2].length === 4) {
    const [, m, y] = parts;
    if (m && y) return `${y}-${m.padStart(2, '0')}`;
  }
  return '';
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
    const mergedMembers = [...new Set([...existing.members, ...activeUsers])];
    project = {
      ...existing,
      uploadedAt: new Date().toISOString(),
      entries,
      members: mergedMembers,
      memberSettings: existing.memberSettings.filter(s => activeUsers.has(s.user)),
      forecast: { ...existing.forecast, tickets: mergedTickets },
    };
    projects[existingIdx] = project;
  } else {
    const activeUsers = [...new Set(entries.map(e => e.user))];
    project = {
      id: generateId(),
      name,
      createdAt: new Date().toISOString(),
      uploadedAt: new Date().toISOString(),
      projectType: 'time-and-material',
      contractHours: 0,
      contractValue: 0,
      changes: [],
      members: activeUsers,
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

// ─── Link Forecast Scenario ───────────────────────────────────────────────────

export async function linkForecast(
  projektAnalysisId: string,
  forecastId: string | null
): Promise<void> {
  const projects = await readProjektAnalysis();
  const idx = projects.findIndex(p => p.id === projektAnalysisId);
  if (idx < 0) return;
  projects[idx] = { ...projects[idx], linkedForecastId: forecastId ?? undefined };
  await writeProjektAnalysis(projects);
  revalidatePath(`/projekt-analysis/${projektAnalysisId}`);
}

// ─── Delete Employee Entries ──────────────────────────────────────────────────

export async function deleteEmployeeEntries(
  projectId: string,
  userName: string
): Promise<{ ok: boolean; error?: string }> {
  const projects = await readProjektAnalysis();
  const idx = projects.findIndex(p => p.id === projectId);
  if (idx < 0) return { ok: false, error: 'Project not found' };
  const project = projects[idx];
  const members = project.members.includes(userName) ? project.members : [...project.members, userName];
  projects[idx] = {
    ...project,
    members,
    entries: project.entries.filter(e => e.user !== userName),
  };
  await writeProjektAnalysis(projects);
  revalidatePath(`/projekt-analysis/${projectId}`);
  return { ok: true };
}

export async function addProjectMember(
  projectId: string,
  userName: string
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = userName.trim();
  if (!trimmed) return { ok: false, error: 'Name required' };
  const projects = await readProjektAnalysis();
  const idx = projects.findIndex(p => p.id === projectId);
  if (idx < 0) return { ok: false, error: 'Project not found' };
  const project = projects[idx];
  if (project.members.includes(trimmed)) return { ok: true };
  projects[idx] = { ...project, members: [...project.members, trimmed] };
  await writeProjektAnalysis(projects);
  revalidatePath(`/projekt-analysis/${projectId}`);
  return { ok: true };
}

export async function removeProjectMember(
  projectId: string,
  userName: string
): Promise<{ ok: boolean; error?: string }> {
  const projects = await readProjektAnalysis();
  const idx = projects.findIndex(p => p.id === projectId);
  if (idx < 0) return { ok: false, error: 'Project not found' };
  const project = projects[idx];
  projects[idx] = {
    ...project,
    members: project.members.filter(m => m !== userName),
    entries: project.entries.filter(e => e.user !== userName),
  };
  await writeProjektAnalysis(projects);
  revalidatePath(`/projekt-analysis/${projectId}`);
  return { ok: true };
}

// ─── Excel Upload for Employee ────────────────────────────────────────────────

function excelSerialToMonth(serial: number): string {
  // Excel serial date: days since 1899-12-30
  const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function parseEmployeeExcel(buffer: ArrayBuffer): { task: string; month: string; spentTime: number }[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  if (raw.length < 2) return [];

  const headers = (raw[0] as unknown[]).map(h => String(h ?? '').trim().toLowerCase());

  // Try to detect columns by header name; fall back to fixed positions (the format is always the same)
  let iId    = headers.findIndex(h => h.includes('ticket-id') || h.includes('ticketid') || h.includes('ticket_id'));
  let iTitle = headers.findIndex(h => h.includes('titel') || h.includes('title'));
  let iDate  = headers.findIndex(h => h === 'datum' || h.includes('datum') || h === 'date');
  let iHours = headers.findIndex(h => h.includes('stunden') || h.includes('dauer') || h.includes('hours'));

  // Fall back to positional (Ticket-ID=0, Ticket Titel=1, Datum=2, Dauer=3)
  if (iId    < 0) iId    = 0;
  if (iTitle < 0) iTitle = 1;
  if (iDate  < 0) iDate  = 2;
  if (iHours < 0) iHours = 3;

  const result: { task: string; month: string; spentTime: number }[] = [];

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    const ticketId    = String(row[iId]    ?? '').trim();
    const ticketTitle = String(row[iTitle] ?? '').trim();
    const dateCell    = row[iDate];
    const hoursCell   = row[iHours];

    if (!ticketId) continue;

    // Hours: Excel stores numbers as JS numbers; string "1,25" needs comma→dot
    const spentTime = typeof hoursCell === 'number'
      ? hoursCell
      : parseFloat(String(hoursCell ?? '').replace(',', '.')) || 0;
    if (spentTime <= 0) continue;

    // Task key matching existing format: "#40111 - IDM.ONe..."
    const task = ticketTitle ? `#${ticketId} - ${ticketTitle}` : `#${ticketId}`;

    // Date: Excel serial number OR string DD.MM.YYYY / YYYY-MM-DD
    let month = '';
    if (typeof dateCell === 'number') {
      month = excelSerialToMonth(dateCell);
    } else {
      const s = String(dateCell ?? '').trim();
      const parts = s.split(/[./]/);
      if (parts.length === 3 && parts[2].length === 4) {
        month = `${parts[2]}-${parts[1].padStart(2, '0')}`;
      } else if (/^\d{4}-\d{2}/.test(s)) {
        month = s.slice(0, 7);
      }
    }
    if (!month) continue;

    result.push({ task, month, spentTime });
  }

  return result;
}

export async function uploadEmployeeExcel(
  formData: FormData,
  projectId: string,
  userName: string
): Promise<{ ok: boolean; error?: string; added: number }> {
  const file = formData.get('file') as File | null;
  if (!file) return { ok: false, error: 'No file provided', added: 0 };

  const buffer = await file.arrayBuffer();
  const rows = parseEmployeeExcel(buffer);
  if (rows.length === 0) return { ok: false, error: 'No valid entries found in file', added: 0 };

  // Aggregate by task + month
  const incoming = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.task}|||${r.month}`;
    incoming.set(key, (incoming.get(key) ?? 0) + r.spentTime);
  }

  const projects = await readProjektAnalysis();
  const idx = projects.findIndex(p => p.id === projectId);
  if (idx < 0) return { ok: false, error: 'Project not found', added: 0 };

  const project = projects[idx];

  // Keep entries from other users, drop this user's entries that overlap with new data
  const otherEntries = project.entries.filter(e => e.user !== userName);
  const userOldEntries = project.entries.filter(e => e.user === userName);
  const nonOverlapping = userOldEntries.filter(e => !incoming.has(`${e.task}|||${e.month}`));

  // Build new entries for this user
  const newEntries: ProjektAnalysisEntry[] = [];
  for (const [key, spentTime] of incoming) {
    const [task, month] = key.split('|||');
    newEntries.push({ task, month, user: userName, activity: 'Work', spentTime });
  }

  const mergedEntries = [...otherEntries, ...nonOverlapping, ...newEntries];

  // Add new tickets to forecast if they don't exist yet
  const existingTaskSet = new Set(project.forecast.tickets.map(t => t.task));
  const newTasks = [...new Set(newEntries.map(e => e.task))].filter(t => !existingTaskSet.has(t));
  const mergedForecastTickets: ProjektAnalysisTicketForecast[] = [
    ...project.forecast.tickets,
    ...newTasks.map(task => ({ task, expectedHours: 0, billable: true, rate: 0 })),
  ];

  const members = project.members.includes(userName) ? project.members : [...project.members, userName];

  projects[idx] = {
    ...project,
    uploadedAt: new Date().toISOString(),
    members,
    entries: mergedEntries,
    forecast: { ...project.forecast, tickets: mergedForecastTickets },
  };

  await writeProjektAnalysis(projects);
  revalidatePath(`/projekt-analysis/${projectId}`);

  return { ok: true, added: newEntries.length };
}

export async function updateOperationContracts(
  projectId: string,
  contracts: OperationContract[]
): Promise<void> {
  const projects = await readProjektAnalysis();
  const idx = projects.findIndex(p => p.id === projectId);
  if (idx === -1) return;
  projects[idx] = { ...projects[idx], operationContracts: contracts };
  await writeProjektAnalysis(projects);
  revalidatePath(`/projekt-analysis/${projectId}`);
}
