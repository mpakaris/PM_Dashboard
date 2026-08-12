import { FmoWbsEntry, FmoTicket, SyncSource } from './types';
import { classifyWbs, extractTicketId, extractTicketName } from './fmoClassify';

export interface WbsDataSource {
  readonly id: SyncSource;
  readonly label: string;
  readonly canAutoSync: boolean;
  loadWbs(): Promise<FmoWbsEntry[]>;
  loadTickets(): Promise<FmoTicket[]>;
}

export class ExcelDataSource implements WbsDataSource {
  readonly id = 'excel' as const;
  readonly label = 'Excel (Therese_Board.xlsx)';
  readonly canAutoSync = false;

  constructor(private buffer: ArrayBuffer) {}

  async loadWbs(): Promise<FmoWbsEntry[]> {
    const xlsx = await import('xlsx');
    const wb = xlsx.read(this.buffer, { type: 'array' });
    const sheet = wb.Sheets['Mapping'];
    if (!sheet) return [];

    const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    const now = new Date().toISOString();
    const result: FmoWbsEntry[] = [];

    // Table 3: Full WBS Code → Category (cols X=23, Y=24)
    // Table 2: IWBS Code → Category (cols Z=25, AA=26)
    // Employee table (cols AC=28, AD=29) — not WBS, handled separately
    // We use the WBS table (col X/Y) as the primary WBS label source.
    // Headers are in row 0; scan all rows for non-empty WBS codes (col 23).
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const code = String(row[23] ?? '').trim();
      const label = String(row[24] ?? '').trim();
      if (!code || !code.match(/^[A-Z]\./)) continue;
      const { billingClass, subCategory } = classifyWbs(code, {});
      result.push({
        code,
        label,
        billingClass,
        subCategory: subCategory ?? undefined,
        syncSource: 'excel',
        syncedAt: now,
      });
    }
    return result;
  }

  async loadTickets(): Promise<FmoTicket[]> {
    const xlsx = await import('xlsx');
    const wb = xlsx.read(this.buffer, { type: 'array' });
    const sheet = wb.Sheets['Spent Time'];
    if (!sheet) return [];

    const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    if (rows.length < 2) return [];

    const header = rows[0].map((h: any) => String(h ?? '').trim());
    const colWbs     = header.findIndex((h) => h === 'WBS');
    const colTaskId  = header.findIndex((h) => h.includes('Task ID'));
    const colTask    = header.findIndex((h) => h === 'Task');
    const colProject = header.findIndex((h) => h === 'Project' || h === 'Projekt');

    const seen = new Map<number, FmoTicket>();
    const now = new Date().toISOString();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rawTaskId = colTaskId >= 0 ? row[colTaskId] : null;
      const taskStr   = colTask >= 0 ? String(row[colTask] ?? '').trim() : '';
      const ticketId  = rawTaskId != null && rawTaskId !== ''
        ? parseInt(String(rawTaskId), 10)
        : extractTicketId(taskStr);

      if (!ticketId || isNaN(ticketId)) continue;
      if (seen.has(ticketId)) continue;

      const wbsCode  = colWbs >= 0 ? String(row[colWbs] ?? '').trim() || null : null;
      const name     = extractTicketName(taskStr);
      const project  = colProject >= 0 ? String(row[colProject] ?? '').trim() : '';
      const { billingClass, subCategory } = wbsCode ? classifyWbs(wbsCode, {}) : { billingClass: null, subCategory: null };

      seen.set(ticketId, {
        id: ticketId,
        name,
        project,
        wbsCode,
        billingClass,
        subCategory,
        syncSource: 'excel',
        syncedAt: now,
      });
    }
    return Array.from(seen.values());
  }
}

export class RemoteDataSource implements WbsDataSource {
  readonly id = 'sectrack' as const;
  readonly label = 'SecTrack API';
  readonly canAutoSync = true;

  async loadWbs(): Promise<FmoWbsEntry[]> {
    throw new Error('RemoteDataSource not yet implemented');
  }

  async loadTickets(): Promise<FmoTicket[]> {
    throw new Error('RemoteDataSource not yet implemented');
  }
}
