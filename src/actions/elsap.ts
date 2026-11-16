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

function makeDedupId(einkBeleg: string, position: string, leistZeile: string, datum: string, sapUser: string, aktivitaet: string, stunden: number): string {
  // stunden is included so two bookings on the same day/ticket with different hours stay separate.
  // True duplicates (all fields identical) still collapse to one row.
  return [einkBeleg, position, leistZeile, datum, sapUser, aktivitaet, String(stunden)].join('|');
}

// ─── Column mapping ───────────────────────────────────────────────────────────

type ColIdx = {
  jahr: number; periode: number; datum: number; einkBeleg: number;
  position: number; posText: number; leistZeile: number; leistZText: number;
  sapUser: number; name: number; aktivitaet: number; stunden: number;
  sdm: number; sdmName: number; status: number; verrechnet: number;
  extLeistungsnr: number;
};

function buildColIdx(header: string[]): ColIdx {
  // Try each matcher in order — first match wins.
  const first = (...matchers: Array<string | ((h: string) => boolean)>): number => {
    for (const m of matchers) {
      const i = typeof m === 'string'
        ? header.indexOf(m)
        : header.findIndex(m);
      if (i >= 0) return i;
    }
    return -1;
  };

  return {
    // ── Stable across both formats ──────────────────────────────────────────
    jahr:       first('Jahr'),
    datum:      first('Datum'),
    einkBeleg:  first('EinkBeleg'),
    status:     first('Status'),

    // ── Renamed in new format ───────────────────────────────────────────────
    periode:    first('Periode',     'Per'),
    position:   first('Position',    'Pos'),
    posText:    first('PosText',     'Kurztext'),
    leistZeile: first('LeistZeile',  'Zeile'),   // first occurrence = Zeile[2]
    leistZText: first('LeistZText',  'Leistnr Kurztext'),
    sdmName:    first('SDM Name',    'Name des SDM'),

    // ── Partial / multi-name matches ─────────────────────────────────────────
    sapUser:    first(
      (h) => h.includes('SAP User') && !h.startsWith('SDM'), // avoid 'SDM SAP Benutzer'
      'Benutzername',
    ),
    name:       first(
      (h) => h.includes('Name') && h.includes('Leistungserbringer'),
      'Mitarbeiter',
    ),
    aktivitaet: first(
      (h) => h.includes('Aktivit'),
      'Benutzerfeld',
    ),
    sdm:        first(
      'SDM',
      'SDM SAP Benutzer',
    ),

    // ── Stunden: exact name, or LAST occurrence of 'Menge' (new format has
    //    two: index 4 = Bestellmenge total, index 18 = actual hours) ─────────
    stunden: (() => {
      const exact = header.indexOf('Stunden');
      if (exact >= 0) return exact;
      const last = header.lastIndexOf('Menge');
      return last >= 0 ? last : -1;
    })(),

    // ── Not present in new format → will be empty string ────────────────────
    verrechnet:     first((h) => h.toLowerCase() === 'verrechnet'),

    // ── New field: customer cost center (only in new Excel format) ────────────
    extLeistungsnr: first('ext. Leistungsnr.'),
  };
}

// ─── Column failsafe ──────────────────────────────────────────────────────────

type ColWarning = { field: string; severity: 'error' | 'warn'; message: string };

function checkColumns(idx: ColIdx, rows: ElsapRow[]): ColWarning[] {
  const warnings: ColWarning[] = [];

  // Hard-required columns — import must be blocked if missing
  if (idx.jahr < 0)
    warnings.push({ field: 'Jahr', severity: 'error', message: 'Column "Jahr" not found — no rows can be filtered by year' });
  if (idx.einkBeleg < 0)
    warnings.push({ field: 'EinkBeleg', severity: 'error', message: 'Column "EinkBeleg" not found — IDs cannot be generated' });
  if (idx.status < 0)
    warnings.push({ field: 'Status', severity: 'error', message: 'Column "Status" not found — Verbucht filter will not work' });
  if (idx.stunden < 0)
    warnings.push({ field: 'Stunden', severity: 'error', message: 'Column "Stunden" not found — all hours will be 0' });

  // Soft columns — import allowed but data will be incomplete
  if (idx.name < 0)
    warnings.push({ field: 'Leistungserbringer Name', severity: 'warn', message: 'Name column not found — person names will be empty' });
  if (idx.posText < 0)
    warnings.push({ field: 'PosText', severity: 'warn', message: 'Column "PosText" not found — project names will be empty' });
  if (idx.periode < 0)
    warnings.push({ field: 'Periode', severity: 'warn', message: 'Column "Periode" not found — month grouping will be broken' });

  // Data quality checks on parsed rows (only run if we have rows to inspect)
  if (rows.length > 0) {
    const zeroHours = rows.filter((r) => r.stunden === 0).length;
    const emptyName = rows.filter((r) => !r.name).length;
    const emptyPos  = rows.filter((r) => !r.posText).length;
    const pct = (n: number) => Math.round((n / rows.length) * 100);

    if (pct(zeroHours) > 30)
      warnings.push({ field: 'stunden', severity: 'error', message: `${pct(zeroHours)}% of rows have 0 hours — column mapping likely failed` });
    if (pct(emptyName) > 50)
      warnings.push({ field: 'name', severity: 'warn', message: `${pct(emptyName)}% of rows have no person name` });
    if (pct(emptyPos) > 50)
      warnings.push({ field: 'posText', severity: 'warn', message: `${pct(emptyPos)}% of rows have no project name` });
  }

  return warnings;
}

// ─── Shared row builder (works for both CSV columns and Excel cells) ──────────

function rowsFromMatrix(header: string[], data: unknown[][]): ElsapRow[] {
  const idx = buildColIdx(header);

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

  const rowMap = new Map<string, ElsapRow>();
  for (const cols of data) {
    const jahr = parseInt(get(cols, idx.jahr), 10);
    if (isNaN(jahr) || jahr !== 2026) continue;

    const einkBeleg  = get(cols, idx.einkBeleg);
    const position   = get(cols, idx.position);
    const leistZeile = get(cols, idx.leistZeile);
    const datum      = get(cols, idx.datum);
    const sapUser    = get(cols, idx.sapUser);
    const aktivitaet = get(cols, idx.aktivitaet);
    const stunden    = parseStunden(idx.stunden >= 0 ? cols[idx.stunden] : 0);
    const id         = makeDedupId(einkBeleg, position, leistZeile, datum, sapUser, aktivitaet, stunden);

    if (!rowMap.has(id)) {
      rowMap.set(id, {
        id,
        jahr,
        periode:        parseInt(get(cols, idx.periode), 10) || 0,
        datum,
        einkBeleg,
        position,
        posText:        get(cols, idx.posText),
        leistZeile,
        leistZText:     get(cols, idx.leistZText),
        sapUser,
        name:           get(cols, idx.name),
        aktivitaet,
        stunden,
        sdm:            get(cols, idx.sdm),
        sdmName:        get(cols, idx.sdmName),
        status:         get(cols, idx.status),
        verrechnet:     strVerrechnet(idx.verrechnet >= 0 ? cols[idx.verrechnet] : ''),
        extLeistungsnr: get(cols, idx.extLeistungsnr),
      });
    }
  }
  return [...rowMap.values()];
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
  warnings?: string[];
}> {
  const file = formData.get('file') as File | null;
  if (!file) return { added: 0, removed: 0, updated: 0, unchanged: 0, total: 0, error: 'No file provided' };

  const buffer = await file.arrayBuffer();
  const isExcel = /\.(xlsx|xls|xlsb|xlsm)$/i.test(file.name);

  // Parse header separately so we can run column checks before committing
  let header: string[] = [];
  if (isExcel) {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    if (raw.length > 0) header = (raw[0] as unknown[]).map((h) => String(h ?? '').trim());
  } else {
    const text = new TextDecoder('utf-16le').decode(buffer);
    const firstLine = text.split(/\r?\n/)[0];
    header = firstLine.split(';').map((h) => h.trim());
  }

  const colIdx = buildColIdx(header);
  const incoming = isExcel ? parseExcel(buffer) : parseCsv(buffer);

  // Run column + data quality checks
  const colWarnings = checkColumns(colIdx, incoming);
  const errors   = colWarnings.filter((w) => w.severity === 'error').map((w) => w.message);
  const softWarns = colWarnings.filter((w) => w.severity === 'warn').map((w) => w.message);

  if (errors.length > 0) {
    return {
      added: 0, removed: 0, updated: 0, unchanged: 0, total: 0,
      error: `Import blocked — column mapping failed:\n• ${errors.join('\n• ')}`,
      warnings: softWarns.length > 0 ? softWarns : undefined,
    };
  }

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

  return {
    added, removed, updated, unchanged, total: incoming.length,
    warnings: softWarns.length > 0 ? softWarns : undefined,
  };
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
  // Match priority: exact name → sapUser fallback (handles SAP-ID-only exports for former staff)
  for (const row of verbuchtRows) {
    const name = row.name;
    if (!name) continue;
    const byName    = data.teamMembers.find((m) => m.name === name);
    const bySapUser = !byName && row.sapUser
      ? data.teamMembers.find((m) => m.sapUser === row.sapUser)
      : undefined;
    if (!byName && !bySapUser) {
      const role = data.roles.find((r) => r.name === row.leistZText);
      data.teamMembers.push({
        id: generateId(),
        name,
        sapUser: row.sapUser || undefined,
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
  const findMember = (row: { name: string; sapUser: string }) =>
    data.teamMembers.find((m) => m.name === row.name) ??
    (row.sapUser ? data.teamMembers.find((m) => m.sapUser === row.sapUser) : undefined);

  const seen = new Set<string>();
  for (const row of verbuchtRows) {
    const member = findMember(row);
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
    const member = findMember(row);
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
