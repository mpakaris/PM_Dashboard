'use server';

import * as XLSX from 'xlsx';
import { revalidatePath } from 'next/cache';
import { readSupport, writeSupport } from '@/lib/db';
import type { SupportEntry, SupportCluster, SupportStore } from '@/lib/types';

const EMPLOYEE_TABS = ['Baumgartner', 'Puskas', 'Peric', 'Szogyenyi', 'Sigart'];

function excelSerialToISO(serial: number): string {
  const date = new Date((serial - 25569) * 86400 * 1000);
  return date.toISOString().slice(0, 10);
}

function normalizeClusterCode(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const cleaned = s.replace(/^idm\s*:?\s*/i, '').trim();
  const match = cleaned.match(/^(\d+\.\d+)/);
  return match ? match[1] : '';
}

function parseClusterTab(sheet: XLSX.WorkSheet): SupportCluster[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][];
  const clusters: SupportCluster[] = [];
  for (const row of rows) {
    const cell = String((row as string[])[0] ?? '').trim();
    if (!cell) continue;
    const match = cell.match(/^(\d+\.\d+)\s+(.*)/);
    if (!match) continue;
    const code = match[1];
    const label = match[2].trim();
    const parent = code.split('.')[0];
    const isTop = code.endsWith('.0');
    clusters.push({ code, label, parent, isTop });
  }
  return clusters;
}

function parseEmployeeTab(sheet: XLSX.WorkSheet, employee: string): SupportEntry[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const entries: SupportEntry[] = [];

  for (const row of rows) {
    const serial = row['Arbeitstag'];
    if (typeof serial !== 'number' || serial < 10000) continue;

    const h = typeof row['Stunden'] === 'number' ? row['Stunden'] : 0;
    const m = typeof row['Minuten'] === 'number' ? row['Minuten'] : 0;
    const hours = h + m / 60;
    if (hours <= 0) continue;

    const clusterCode = normalizeClusterCode(row['Kategorien']);
    const topClusterCode = clusterCode ? clusterCode.split('.')[0] : '';
    const date = excelSerialToISO(serial);

    entries.push({
      employee,
      date,
      yearMonth: date.slice(0, 7),
      hours: Math.round(hours * 100) / 100,
      description: String(row['Beschreibung'] ?? '').trim(),
      details: String(row['Tätigkeit-Details'] ?? '').trim(),
      clusterCode,
      topClusterCode,
      isIncident: String(row['Incident?']).toLowerCase() === 'ja',
    });
  }
  return entries;
}

export async function parseSupportXlsx(formData: FormData): Promise<{
  ok: boolean;
  entries?: number;
  employees?: number;
  clusters?: number;
  error?: string;
}> {
  try {
    const file = formData.get('file') as File | null;
    if (!file) return { ok: false, error: 'Keine Datei erhalten' };

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });

    // Parse clusters
    const clusterSheet = wb.Sheets['Clusters'];
    const clusters = clusterSheet ? parseClusterTab(clusterSheet) : [];

    // Parse all employee tabs
    const allEntries: SupportEntry[] = [];
    const foundEmployees: string[] = [];
    for (const emp of EMPLOYEE_TABS) {
      if (!wb.Sheets[emp]) continue;
      const entries = parseEmployeeTab(wb.Sheets[emp], emp);
      if (entries.length > 0) {
        allEntries.push(...entries);
        foundEmployees.push(emp);
      }
    }

    if (allEntries.length === 0) {
      return { ok: false, error: 'Keine Einträge gefunden — falsche Datei?' };
    }

    const store: SupportStore = {
      entries: allEntries,
      clusters,
      lastImport: new Date().toISOString(),
      employeeNames: foundEmployees,
    };

    await writeSupport(store);
    revalidatePath('/support');

    return { ok: true, entries: allEntries.length, employees: foundEmployees.length, clusters: clusters.length };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
