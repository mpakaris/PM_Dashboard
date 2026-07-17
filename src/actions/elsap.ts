'use server';

import * as XLSX from 'xlsx';
import { revalidatePath } from 'next/cache';
import { readData, writeData, readElsap, writeElsap } from '@/lib/db';
import { generateId } from '@/lib/utils';
import { ElsapRow } from '@/lib/types';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function parseStunden(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  return parseFloat(String(raw).replace(',', '.')) || 0;
}

function makeDedupId(einkBeleg: string, position: string, leistZeile: string, datum: string, sapUser: string, aktivitaet: string): string {
  return [einkBeleg, position, leistZeile, datum, sapUser, aktivitaet].join('|');
}

// ─── Shared row builder (works for both CSV columns and Excel cells) ──────────

function rowsFromMatrix(header: string[], data: unknown[][]): ElsapRow[] {
  const idx = {
    jahr:      header.indexOf('Jahr'),
    periode:   header.indexOf('Periode'),
    datum:     header.indexOf('Datum'),
    einkBeleg: header.indexOf('EinkBeleg'),
    position:  header.indexOf('Position'),
    posText:   header.indexOf('PosText'),
    leistZeile: header.indexOf('LeistZeile'),
    leistZText: header.indexOf('LeistZText'),
    sapUser:   header.findIndex((h) => h.includes('SAP User')),
    name:      header.findIndex((h) => h.includes('Name') && h.includes('Leistungserbringer')),
    aktivitaet: header.findIndex((h) => h.includes('Aktivit')),
    stunden:   header.indexOf('Stunden'),
    sdm:       header.indexOf('SDM'),
    sdmName:   header.findIndex((h) => h === 'SDM Name'),
    status:    header.indexOf('Status'),
    verrechnet: header.findIndex((h) => h.toLowerCase() === 'verrechnet'),
  };

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const str = (v: unknown): string => {
    if (v instanceof Date) {
      // SAP date cells → YYYYMMDD (stable, used in IDs)
      const y = v.getFullYear();
      const m = String(v.getMonth() + 1).padStart(2, '0');
      const d = String(v.getDate()).padStart(2, '0');
      return `${y}${m}${d}`;
    }
    return String(v ?? '').trim();
  };

  // Verrechnet is a month/year label, not a full date — format as "Jun 26"
  const strVerrechnet = (v: unknown): string => {
    if (v instanceof Date) return `${MONTHS[v.getMonth()]} ${String(v.getFullYear()).slice(2)}`;
    return String(v ?? '').trim();
  };

  const get = (cols: unknown[], i: number) => i >= 0 ? str(cols[i]) : '';

  const rows: ElsapRow[] = [];
  for (const cols of data) {
    const jahr = parseInt(get(cols, idx.jahr), 10);
    if (isNaN(jahr) || jahr !== 2026) continue;

    const einkBeleg  = get(cols, idx.einkBeleg);
    const position   = get(cols, idx.position);
    const leistZeile = get(cols, idx.leistZeile);

    const datum      = get(cols, idx.datum);
    const sapUser    = get(cols, idx.sapUser);
    const aktivitaet = get(cols, idx.aktivitaet);

    rows.push({
      id:         makeDedupId(einkBeleg, position, leistZeile, datum, sapUser, aktivitaet),
      jahr,
      periode:    parseInt(get(cols, idx.periode), 10) || 0,
      datum,
      einkBeleg,
      position,
      posText:    get(cols, idx.posText),
      leistZeile,
      leistZText: get(cols, idx.leistZText),
      sapUser,
      name:       get(cols, idx.name),
      aktivitaet,
      stunden:    parseStunden(idx.stunden >= 0 ? cols[idx.stunden] : 0),
      sdm:        get(cols, idx.sdm),
      sdmName:    get(cols, idx.sdmName),
      status:     get(cols, idx.status),
      verrechnet: strVerrechnet(idx.verrechnet >= 0 ? cols[idx.verrechnet] : ''),
    });
  }
  return rows;
}

// ─── Format-specific parsers ──────────────────────────────────────────────────

function parseCsv(buffer: ArrayBuffer): ElsapRow[] {
  const text = new TextDecoder('utf-16le').decode(buffer);
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(';').map((h) => h.trim());
  const data = lines.slice(1).filter((l) => l.trim()).map((l) => l.split(';'));
  return rowsFromMatrix(header, data);
}

function parseExcel(buffer: ArrayBuffer): ElsapRow[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  if (raw.length < 2) return [];
  const header = (raw[0] as unknown[]).map((h) => String(h ?? '').trim());
  return rowsFromMatrix(header, raw.slice(1) as unknown[][]);
}

// ─── Inspect Action ──────────────────────────────────────────────────────────

export async function inspectElsapFile(formData: FormData): Promise<{
  columns: string[];
  verrechnetCount: number;
  verrechnetSamples: string[];
  yearBreakdown: Record<string, number>;
  error?: string;
}> {
  const file = formData.get('file') as File | null;
  if (!file) return { columns: [], verrechnetCount: 0, verrechnetSamples: [], yearBreakdown: {} };

  const buffer = await file.arrayBuffer();
  const isExcel = /\.(xlsx|xls|xlsb|xlsm)$/i.test(file.name);

  let allRows: unknown[][] = [];
  let columns: string[] = [];

  if (isExcel) {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    if (raw.length > 0) {
      columns = (raw[0] as unknown[]).map((h) => String(h ?? '').trim());
      allRows = raw.slice(1) as unknown[][];
    }
  } else {
    const text = new TextDecoder('utf-16le').decode(buffer);
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length > 0) {
      columns = lines[0].split(';').map((h) => h.trim());
      allRows = lines.slice(1).map((l) => l.split(';'));
    }
  }

  const vIdx  = columns.findIndex((h) => h.toLowerCase().includes('verrechnet'));
  const jIdx  = columns.indexOf('Jahr');

  const verrechnetRows = allRows.filter((r) => String(r[vIdx] ?? '').trim() !== '');
  const verrechnetSamples = [...new Set(verrechnetRows.map((r) => String(r[vIdx]).trim()))].slice(0, 5);

  const yearBreakdown: Record<string, number> = {};
  for (const r of verrechnetRows) {
    const yr = String(r[jIdx] ?? 'unknown').trim();
    yearBreakdown[yr] = (yearBreakdown[yr] ?? 0) + 1;
  }

  return { columns, verrechnetCount: verrechnetRows.length, verrechnetSamples, yearBreakdown };
}

// ─── Import Action ────────────────────────────────────────────────────────────

export async function importElsapCsv(formData: FormData): Promise<{
  added: number;
  removed: number;
  updated: number;
  unchanged: number;
  total: number;
  error?: string;
}> {
  const file = formData.get('file') as File | null;
  if (!file) return { added: 0, removed: 0, updated: 0, unchanged: 0, total: 0, error: 'No file provided' };

  const buffer = await file.arrayBuffer();
  const isExcel = /\.(xlsx|xls|xlsb|xlsm)$/i.test(file.name);
  const incoming = isExcel ? parseExcel(buffer) : parseCsv(buffer);

  if (incoming.length === 0) {
    return { added: 0, removed: 0, updated: 0, unchanged: 0, total: 0, error: 'No 2026 rows found in file — check encoding, Jahr column, or sheet layout' };
  }

  const mirror = await readElsap();

  // Compute stats against previous mirror for information only
  const oldMap = new Map(mirror.rows.map(r => [r.id, r]));
  const newMap = new Map(incoming.map(r => [r.id, r]));

  let added = 0, updated = 0, unchanged = 0;
  for (const [id, row] of newMap) {
    const old = oldMap.get(id);
    if (!old) added++;
    else if (old.stunden !== row.stunden || old.status !== row.status || old.verrechnet !== row.verrechnet) updated++;
    else unchanged++;
  }
  const removed = [...oldMap.keys()].filter(id => !newMap.has(id)).length;

  // Full replace — the SAP export is authoritative
  mirror.rows = incoming;
  mirror.lastImport = new Date().toISOString();
  mirror.importStats = { added, updated, skipped: unchanged };

  await writeElsap(mirror);
  revalidatePath('/elsap');

  return { added, removed, updated, unchanged, total: incoming.length };
}

// ─── Apply to Dashboard ───────────────────────────────────────────────────────

export async function applyElsapToDb(): Promise<{
  roles: number;
  members: number;
  projects: number;
  assignments: number;
  error?: string;
}> {
  const [mirror, data] = await Promise.all([readElsap(), readData()]);

  const verbuchtRows = mirror.rows.filter((r) => r.status === 'Verbucht');
  if (verbuchtRows.length === 0) {
    return { roles: 0, members: 0, projects: 0, assignments: 0, error: 'No Verbucht rows in mirror' };
  }

  let newRoles = 0, newMembers = 0, newProjects = 0, newAssignments = 0;

  // ── 1. Roles (from LeistZText) — only ADD, never remove ────────────────────
  const roleNames = [...new Set(verbuchtRows.map((r) => r.leistZText).filter(Boolean))];
  for (const roleName of roleNames) {
    const exists = data.roles.some((r) => r.name === roleName);
    if (!exists) {
      data.roles.push({ id: generateId(), name: roleName, definition: '', type: 'extern' });
      newRoles++;
    }
  }

  // ── 2. Team Members — only ADD new ones, never remove or modify existing ───
  for (const row of verbuchtRows) {
    const name = row.name;
    if (!name) continue;
    const exists = data.teamMembers.some((m) => m.name === name);
    if (!exists) {
      const role = data.roles.find((r) => r.name === row.leistZText);
      data.teamMembers.push({
        id: generateId(),
        name,
        roleId: role?.id ?? '',
        profileIds: [],
        monthlyAvailability: 0,
      });
      newMembers++;
    }
    // Existing members are never touched — user manages them manually
  }

  // ── 3. Projects — only ADD new ones, never remove or modify existing ────────
  for (const row of verbuchtRows) {
    if (!row.posText) continue;
    const exists = data.projects.some((p) => p.name === row.posText);
    if (!exists) {
      const projectRows = verbuchtRows.filter((r) => r.posText === row.posText);
      const datums = projectRows.map((r) => r.datum).filter(Boolean).sort();
      const firstDatum = datums[0] ?? '20260101';
      const lastDatum = datums[datums.length - 1] ?? '20261231';
      const startMonth = `${firstDatum.slice(0, 4)}-${firstDatum.slice(4, 6)}`;
      const endMonth = `${lastDatum.slice(0, 4)}-${lastDatum.slice(4, 6)}`;
      data.projects.push({
        id: generateId(),
        name: row.posText,
        orderNo: row.einkBeleg,
        orderAmountHours: 0,
        startMonth,
        endMonth,
        monthlyDistribution: {},
        managerId: '',
      });
      newProjects++;
    }
  }

  // ── 4. Assignments — only ADD new ones, plannedHours are NEVER touched ──────
  const seen = new Set<string>();
  for (const row of verbuchtRows) {
    const member = data.teamMembers.find((m) => m.name === row.name);
    const project = data.projects.find((p) => p.name === row.posText);
    if (!member || !project) continue;
    const key = `${member.id}:${project.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const exists = data.assignments.some((a) => a.memberId === member.id && a.projectId === project.id);
    if (!exists) {
      // plannedHours start empty — user fills them manually or via the Team page
      data.assignments.push({ id: generateId(), projectId: project.id, memberId: member.id, plannedHours: {}, billedHours: {} });
      newAssignments++;
    }
    // Existing assignments: plannedHours are NEVER overwritten here
  }

  // ── 5. Recompute billedHours only — plannedHours are never modified ─────────
  const billedMap = new Map<string, number>(); // `${memberId}:${projectId}:${month}` → hours
  for (const row of verbuchtRows) {
    const member = data.teamMembers.find((m) => m.name === row.name);
    const project = data.projects.find((p) => p.name === row.posText);
    if (!member || !project) continue;
    const month = `${row.jahr}-${String(row.periode).padStart(2, '0')}`;
    const mapKey = `${member.id}:${project.id}:${month}`;
    billedMap.set(mapKey, (billedMap.get(mapKey) ?? 0) + row.stunden);
  }

  for (const a of data.assignments) {
    for (const [mapKey, hours] of billedMap) {
      const [mId, pId, month] = mapKey.split(':');
      if (a.memberId === mId && a.projectId === pId) {
        // Only billedHours are written — plannedHours remain untouched
        a.billedHours[month] = Math.round(hours * 100) / 100;
      }
    }
  }

  const mirror2 = await readElsap();
  mirror2.lastApply = new Date().toISOString();

  await Promise.all([writeData(data), writeElsap(mirror2)]);
  revalidatePath('/', 'layout');

  return { roles: newRoles, members: newMembers, projects: newProjects, assignments: newAssignments };
}
