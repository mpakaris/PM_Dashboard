'use server';

import { revalidatePath } from 'next/cache';
import { readFmoMappings, writeFmoMappings, readFmoStore, writeFmoStore } from '@/lib/db';
import { seedWbsEntries, classifyWbs, slugifyName, extractTicketId, extractTicketName, parseSecTrackDate, SEED_BILLING_CLASSES, SEED_SUB_CATEGORIES } from '@/lib/fmoClassify';
import type { FmoEntry, FmoImportStats } from '@/lib/types';

// ─── Init / Seed ──────────────────────────────────────────────────────────────

export async function initFmoWbsIfEmpty() {
  const mappings = await readFmoMappings();
  if (Object.keys(mappings.wbs).length > 0) return;

  const seeds = seedWbsEntries();
  for (const entry of seeds) mappings.wbs[entry.code] = entry;

  mappings.billingClasses = { ...SEED_BILLING_CLASSES };
  mappings.subCategories  = { ...SEED_SUB_CATEGORIES };

  await writeFmoMappings(mappings);
}

export async function getFmoMappings() {
  return readFmoMappings();
}

export async function getFmoData() {
  const [store, mappings] = await Promise.all([readFmoStore(), readFmoMappings()]);
  return { store, mappings };
}

// ─── WBS CRUD ─────────────────────────────────────────────────────────────────

export async function addFmoWbs(code: string, label: string) {
  if (!code.trim()) return { ok: false, error: 'WBS code required' };
  const mappings = await readFmoMappings();
  if (mappings.wbs[code]) return { ok: false, error: 'WBS code already exists' };

  const { billingClass, subCategory } = classifyWbs(code, mappings.wbs);
  mappings.wbs[code] = {
    code,
    label,
    billingClass,
    subCategory: subCategory ?? undefined,
    syncSource: 'manual',
  };

  await writeFmoMappings(mappings);
  revalidatePath('/fmo/wbs');
  return { ok: true };
}

export async function updateFmoWbs(code: string, label: string) {
  const mappings = await readFmoMappings();
  if (!mappings.wbs[code]) return { ok: false, error: 'Not found' };
  mappings.wbs[code].label = label;
  await writeFmoMappings(mappings);
  revalidatePath('/fmo/wbs');
  return { ok: true };
}

export async function deleteFmoWbs(code: string) {
  const mappings = await readFmoMappings();
  delete mappings.wbs[code];
  await writeFmoMappings(mappings);
  revalidatePath('/fmo/wbs');
  return { ok: true };
}

// ─── Sub-Category management ──────────────────────────────────────────────────

export async function addFmoSubCategory(slug: string, label: string) {
  if (!slug.trim() || !label.trim()) return { ok: false, error: 'Slug and label required' };
  const mappings = await readFmoMappings();
  if (mappings.subCategories[slug]) return { ok: false, error: 'Slug already exists' };
  mappings.subCategories[slug] = { id: slug, label };
  await writeFmoMappings(mappings);
  revalidatePath('/fmo/wbs');
  return { ok: true };
}

export async function updateFmoSubCategoryLabel(slug: string, label: string) {
  const mappings = await readFmoMappings();
  if (!mappings.subCategories[slug]) return { ok: false, error: 'Not found' };
  mappings.subCategories[slug].label = label;
  await writeFmoMappings(mappings);
  revalidatePath('/fmo/wbs');
  return { ok: true };
}

export async function deleteFmoSubCategory(slug: string) {
  const mappings = await readFmoMappings();
  const inUse = Object.values(mappings.wbs).filter(
    (w) => w.subCategory === slug || w.subCategoryOverride === slug
  ).length;
  if (inUse > 0) return { ok: false, error: `Used by ${inUse} WBS entry/entries` };
  delete mappings.subCategories[slug];
  await writeFmoMappings(mappings);
  revalidatePath('/fmo/wbs');
  return { ok: true };
}

export async function setWbsSubCategoryOverride(code: string, override: string | null) {
  const mappings = await readFmoMappings();
  if (!mappings.wbs[code]) return { ok: false, error: 'WBS not found' };
  if (override === null) {
    delete mappings.wbs[code].subCategoryOverride;
  } else {
    mappings.wbs[code].subCategoryOverride = override;
  }
  await writeFmoMappings(mappings);
  revalidatePath('/fmo/wbs');
  return { ok: true };
}

// ─── Ticket WBS assignment (US-008) ──────────────────────────────────────────

export async function assignTicketWbs(ticketId: number, wbsCode: string | null) {
  const [store, mappings] = await Promise.all([readFmoStore(), readFmoMappings()]);
  const key = String(ticketId);
  if (!mappings.tickets[key]) return { ok: false, error: 'Ticket not found' };

  const c = wbsCode ? classifyWbs(wbsCode, mappings.wbs) : { billingClass: null, subCategory: null };
  Object.assign(mappings.tickets[key], { wbsCode, billingClass: c.billingClass, subCategory: c.subCategory });

  let reclassified = 0;
  for (const entry of store.entries) {
    if (entry.ticketId === ticketId) {
      entry.wbsCode = wbsCode; entry.billingClass = c.billingClass; entry.subCategory = c.subCategory;
      reclassified++;
    }
  }

  await Promise.all([writeFmoStore(store), writeFmoMappings(mappings)]);
  revalidatePath('/fmo/tickets');
  revalidatePath('/fmo/utilization');
  return { ok: true, reclassified };
}

// ─── Reclassify all entries (US-015) ─────────────────────────────────────────

export async function reclassifyAllEntries() {
  const [store, mappings] = await Promise.all([readFmoStore(), readFmoMappings()]);
  let reclassified = 0, unmapped = 0;

  for (const entry of store.entries) {
    const ticket = entry.ticketId ? mappings.tickets[String(entry.ticketId)] : null;
    const wbsCode = ticket?.wbsCode ?? entry.wbsCode ?? null;
    entry.wbsCode = wbsCode;
    if (wbsCode) {
      const c = classifyWbs(wbsCode, mappings.wbs);
      entry.billingClass = c.billingClass; entry.subCategory = c.subCategory;
      reclassified++;
    } else {
      entry.billingClass = null; entry.subCategory = null;
      unmapped++;
    }
  }

  for (const ticket of Object.values(mappings.tickets)) {
    if (ticket.wbsCode) {
      const c = classifyWbs(ticket.wbsCode, mappings.wbs);
      ticket.billingClass = c.billingClass; ticket.subCategory = c.subCategory;
    }
  }

  await Promise.all([writeFmoStore(store), writeFmoMappings(mappings)]);
  revalidatePath('/fmo/utilization');
  revalidatePath('/fmo/tickets');
  return { ok: true, reclassified, unmapped };
}

// ─── CSV Import (US-005 + US-023) ────────────────────────────────────────────

function parseCSVRow(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { result.push(cur); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur);
  return result;
}

export async function uploadFmoCSV(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
  stats: FmoImportStats;
}> {
  const empty: FmoImportStats = { added: 0, duplicates: 0, updated: 0, newTickets: 0, newMembers: 0, unmapped: 0 };
  const files = formData.getAll('files') as File[];
  if (!files.length) return { ok: false, error: 'No files provided', stats: empty };

  const [store, mappings] = await Promise.all([readFmoStore(), readFmoMappings()]);
  const stats: FmoImportStats = { ...empty };

  // US-023: dedup index built once as a Map — O(1) lookup per row
  const existingById = new Map<string, FmoEntry>();
  for (const e of store.entries) existingById.set(e.id, e);

  for (const file of files) {
    const text  = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) continue;

    const rawHeader = parseCSVRow(lines[0]).map((h) => h.trim());
    const col = (name: string) =>
      rawHeader.findIndex((h) => h.toLowerCase().replace(/[^a-z0-9]/g, '').includes(name.toLowerCase().replace(/[^a-z0-9]/g, '')));

    const cProject  = col('project');
    const cTask     = col('task');
    const cDate     = col('date');
    const cUser     = col('user');
    const cActivity = col('activity');
    const cComment  = col('comment');
    const cSpent    = col('spenttime');

    if ([cProject, cTask, cDate, cUser, cActivity, cSpent].some((c) => c < 0)) continue;

    const isExtended = rawHeader.some((h) => h.toLowerCase().includes('wbs'));
    const cWbs      = isExtended ? rawHeader.findIndex((h) => h.toLowerCase().includes('wbs')) : -1;
    const cBilling  = isExtended ? rawHeader.findIndex((h) => h.toLowerCase().includes('billing')) : -1;
    const cCustomer = isExtended ? rawHeader.findIndex((h) => h.toLowerCase() === 'customer') : -1;
    const cTaskId   = rawHeader.findIndex((h) => h.toLowerCase().includes('task id'));

    const get = (row: string[], idx: number) => (idx >= 0 ? (row[idx] ?? '').trim() : '');

    for (let i = 1; i < lines.length; i++) {
      const row       = parseCSVRow(lines[i]);
      const rawDate   = get(row, cDate);
      const taskStr   = get(row, cTask);
      const user      = get(row, cUser);
      const activity  = get(row, cActivity);
      const spentTime = parseFloat(get(row, cSpent));

      if (!rawDate || !user || isNaN(spentTime)) continue;

      const date  = parseSecTrackDate(rawDate);
      const month = date.slice(0, 7);

      const rawTaskId  = get(row, cTaskId);
      const ticketId   = rawTaskId ? parseInt(rawTaskId, 10) : extractTicketId(taskStr);
      const ticketName = extractTicketName(taskStr);

      const wbsCode    = isExtended ? (get(row, cWbs) || null) : null;
      const rawBilling = isExtended ? get(row, cBilling).toLowerCase() : '';
      const billingType: 'fixprice' | '' = rawBilling === 'fixprice' ? 'fixprice' : '';
      const customer   = isExtended ? get(row, cCustomer) : '';

      let billingClass = wbsCode ? classifyWbs(wbsCode, mappings.wbs).billingClass : null;
      let subCategory  = wbsCode ? classifyWbs(wbsCode, mappings.wbs).subCategory  : null;

      if (!wbsCode && ticketId) {
        const t = mappings.tickets[String(ticketId)];
        if (t?.wbsCode) { billingClass = t.billingClass; subCategory = t.subCategory; }
      }

      const dedupKey = `${date}|${user}|${ticketId ?? ticketName}|${activity}|${spentTime}`;
      const existing = existingById.get(dedupKey);

      if (existing) {
        const changed =
          existing.wbsCode !== wbsCode ||
          existing.billingType !== billingType ||
          existing.customer !== customer;
        if (changed) {
          existing.wbsCode = wbsCode; existing.billingClass = billingClass;
          existing.subCategory = subCategory; existing.billingType = billingType; existing.customer = customer;
          stats.updated++;
        } else {
          stats.duplicates++;
        }
        continue;
      }

      const entry: FmoEntry = {
        id: dedupKey, date, month,
        project: get(row, cProject), ticketId: ticketId || null, ticketName,
        user, activity, comment: get(row, cComment), spentTime, source: file.name,
        wbsCode, billingClass, subCategory, billingType, customer,
      };
      store.entries.push(entry);
      existingById.set(dedupKey, entry);
      stats.added++;
      if (!wbsCode) stats.unmapped++;

      if (ticketId && !isNaN(ticketId)) {
        const tKey = String(ticketId);
        if (!mappings.tickets[tKey]) {
          mappings.tickets[tKey] = { id: ticketId, name: ticketName, project: get(row, cProject), wbsCode, billingClass, subCategory, syncSource: 'sectrack' };
          stats.newTickets++;
        } else if (wbsCode && !mappings.tickets[tKey].wbsCode) {
          Object.assign(mappings.tickets[tKey], { wbsCode, billingClass, subCategory });
        }
      }

      const memberId = slugifyName(user);
      if (!mappings.members[memberId]) {
        mappings.members[memberId] = { id: memberId, name: user, type: 'extern', partnerCompany: '', costRate: 0 };
        stats.newMembers++;
      }
    }

    if (!store.sources.includes(file.name)) store.sources.push(file.name);
  }

  store.lastUpload  = new Date().toISOString();
  store.importStats = stats;
  await Promise.all([writeFmoStore(store), writeFmoMappings(mappings)]);
  revalidatePath('/fmo/utilization');
  revalidatePath('/fmo/import');
  return { ok: true, stats };
}

// ─── Seed from Excel (US-021 / WbsDataSource) ────────────────────────────────

export async function seedFromDataSource(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
  wbsLabelsAdded: number;
  ticketsBackfilled: number;
  entriesReclassified: number;
}> {
  const zero = { wbsLabelsAdded: 0, ticketsBackfilled: 0, entriesReclassified: 0 };
  const file = formData.get('excelFile') as File | null;
  if (!file) return { ok: false, error: 'No file provided', ...zero };

  const buffer = await file.arrayBuffer();
  const { ExcelDataSource } = await import('@/lib/wbsDataSource');
  const source = new ExcelDataSource(buffer);

  const [wbsFromExcel, ticketsFromExcel] = await Promise.all([source.loadWbs(), source.loadTickets()]);
  const [store, mappings] = await Promise.all([readFmoStore(), readFmoMappings()]);

  let wbsLabelsAdded = 0;
  for (const entry of wbsFromExcel) {
    if (!mappings.wbs[entry.code]) {
      mappings.wbs[entry.code] = entry;
      wbsLabelsAdded++;
    } else if (!mappings.wbs[entry.code].label && entry.label) {
      mappings.wbs[entry.code].label    = entry.label;
      mappings.wbs[entry.code].syncedAt = entry.syncedAt;
      wbsLabelsAdded++;
    }
  }

  let ticketsBackfilled = 0;
  for (const ticket of ticketsFromExcel) {
    const key = String(ticket.id);
    if (!mappings.tickets[key]) {
      mappings.tickets[key] = ticket;
      ticketsBackfilled++;
    } else if (!mappings.tickets[key].wbsCode && ticket.wbsCode) {
      Object.assign(mappings.tickets[key], { wbsCode: ticket.wbsCode, billingClass: ticket.billingClass, subCategory: ticket.subCategory, syncedAt: ticket.syncedAt });
      ticketsBackfilled++;
    }
  }

  let entriesReclassified = 0;
  for (const entry of store.entries) {
    if (entry.wbsCode) continue;
    const ticket = entry.ticketId ? mappings.tickets[String(entry.ticketId)] : null;
    if (ticket?.wbsCode) {
      const c = classifyWbs(ticket.wbsCode, mappings.wbs);
      entry.wbsCode = ticket.wbsCode; entry.billingClass = c.billingClass; entry.subCategory = c.subCategory;
      entriesReclassified++;
    }
  }

  await Promise.all([writeFmoStore(store), writeFmoMappings(mappings)]);
  revalidatePath('/fmo/wbs');
  revalidatePath('/fmo/tickets');
  revalidatePath('/fmo/utilization');
  return { ok: true, wbsLabelsAdded, ticketsBackfilled, entriesReclassified };
}
