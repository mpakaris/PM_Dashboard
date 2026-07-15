'use server';

import { revalidatePath } from 'next/cache';
import { readData, writeData, readElsap, writeElsap } from '@/lib/db';
import { generateId } from '@/lib/utils';
import { ElsapRow } from '@/lib/types';

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseStunden(raw: string): number {
  return parseFloat(raw.replace(',', '.')) || 0;
}

function makeDedupId(einkBeleg: string, position: string, datum: string, sapUser: string, aktivitaet: string): string {
  return `${einkBeleg}_${position}_${datum}_${sapUser}_${aktivitaet.slice(0, 40).replace(/[^a-zA-Z0-9]/g, '_')}`;
}

function parseCsv(buffer: ArrayBuffer): ElsapRow[] {
  const text = new TextDecoder('utf-16le').decode(buffer);
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = lines[0].split(';').map((h) => h.trim());
  const idx = {
    jahr: header.indexOf('Jahr'),
    periode: header.indexOf('Periode'),
    datum: header.indexOf('Datum'),
    einkBeleg: header.indexOf('EinkBeleg'),
    position: header.indexOf('Position'),
    posText: header.indexOf('PosText'),
    leistZeile: header.indexOf('LeistZeile'),
    leistZText: header.indexOf('LeistZText'),
    sapUser: header.findIndex((h) => h.includes('SAP User')),
    name: header.findIndex((h) => h.includes('Name') && h.includes('Leistungserbringer')),
    aktivitaet: header.findIndex((h) => h.includes('Aktivit')),
    stunden: header.indexOf('Stunden'),
    sdm: header.indexOf('SDM'),
    sdmName: header.findIndex((h) => h === 'SDM Name'),
    status: header.indexOf('Status'),
    verrechnet: header.indexOf('Verrechnet'),
  };

  const rows: ElsapRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(';');

    const jahr = parseInt(cols[idx.jahr] ?? '', 10);
    if (isNaN(jahr) || jahr !== 2026) continue;

    const einkBeleg = (cols[idx.einkBeleg] ?? '').trim();
    const position = (cols[idx.position] ?? '').trim();
    const datum = (cols[idx.datum] ?? '').trim();
    const sapUser = (cols[idx.sapUser] ?? '').trim();
    const aktivitaet = (cols[idx.aktivitaet] ?? '').trim();
    const name = (cols[idx.name] ?? '').trim();

    const id = makeDedupId(einkBeleg, position, datum, sapUser, aktivitaet);

    rows.push({
      id,
      jahr,
      periode: parseInt(cols[idx.periode] ?? '0', 10),
      datum,
      einkBeleg,
      position,
      posText: (cols[idx.posText] ?? '').trim(),
      leistZeile: (cols[idx.leistZeile] ?? '').trim(),
      leistZText: (cols[idx.leistZText] ?? '').trim(),
      sapUser,
      name,
      aktivitaet,
      stunden: parseStunden(cols[idx.stunden] ?? '0'),
      sdm: (cols[idx.sdm] ?? '').trim(),
      sdmName: (cols[idx.sdmName] ?? '').trim(),
      status: (cols[idx.status] ?? '').trim(),
      verrechnet: idx.verrechnet >= 0 ? (cols[idx.verrechnet] ?? '').trim() : '',
    });
  }
  return rows;
}

// ─── Import Action ────────────────────────────────────────────────────────────

export async function importElsapCsv(formData: FormData): Promise<{
  added: number;
  updated: number;
  skipped: number;
  total: number;
  error?: string;
}> {
  const file = formData.get('file') as File | null;
  if (!file) return { added: 0, updated: 0, skipped: 0, total: 0, error: 'No file provided' };

  const buffer = await file.arrayBuffer();
  const incoming = parseCsv(buffer);

  if (incoming.length === 0) {
    return { added: 0, updated: 0, skipped: 0, total: 0, error: 'No 2026 rows found in file — check encoding or Jahr column' };
  }

  const mirror = await readElsap();
  const existingMap = new Map<string, ElsapRow>(mirror.rows.map((r) => [r.id, r]));

  let added = 0, updated = 0, skipped = 0;

  for (const row of incoming) {
    const existing = existingMap.get(row.id);
    if (!existing) {
      existingMap.set(row.id, row);
      added++;
    } else if (
      existing.stunden !== row.stunden ||
      existing.status !== row.status ||
      existing.verrechnet !== row.verrechnet
    ) {
      existingMap.set(row.id, row);
      updated++;
    } else {
      skipped++;
    }
  }

  mirror.rows = Array.from(existingMap.values());
  mirror.lastImport = new Date().toISOString();
  mirror.importStats = { added, updated, skipped };

  await writeElsap(mirror);
  revalidatePath('/elsap');

  return { added, updated, skipped, total: mirror.rows.length };
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
