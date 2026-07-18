'use server';

import { revalidatePath } from 'next/cache';
import { readSubContractors, writeSubContractors } from '@/lib/db';
import { generateId } from '@/lib/utils';
import { SubContractor, SubInvoice, SubInvoiceLine } from '@/lib/types';

export async function upsertSubContractor(
  data: Omit<SubContractor, 'id'> & { id?: string }
): Promise<void> {
  const store = await readSubContractors();
  if (data.id) {
    const idx = store.subContractors.findIndex(s => s.id === data.id);
    if (idx >= 0) store.subContractors[idx] = data as SubContractor;
    else store.subContractors.push(data as SubContractor);
  } else {
    store.subContractors.push({ ...data, id: generateId() });
  }
  await writeSubContractors(store);
  revalidatePath('/subinvoices');
}

export async function deleteSubContractor(id: string): Promise<void> {
  const store = await readSubContractors();
  store.subContractors = store.subContractors.filter(s => s.id !== id);
  store.invoices = store.invoices.filter(i => i.subContractorId !== id);
  await writeSubContractors(store);
  revalidatePath('/subinvoices');
}

export async function createSubReference(
  subContractorId: string,
  month: string,
  lines: Omit<import('@/lib/types').SubInvoiceLine, 'id'>[],
  invoiceNumber: string,
): Promise<void> {
  const store = await readSubContractors();
  const label = invoiceNumber.trim() || `Ref ${store.invoices.filter(i => i.subContractorId === subContractorId && i.month === month).length + 1}`;
  store.invoices.push({
    id: generateId(),
    subContractorId,
    month,
    label,
    createdAt: new Date().toISOString(),
    lines: lines.map(l => ({ ...l, id: generateId() })),
  });
  await writeSubContractors(store);
  revalidatePath('/subinvoices');
}

export async function deleteSubInvoice(id: string): Promise<void> {
  const store = await readSubContractors();
  store.invoices = store.invoices.filter(i => i.id !== id);
  await writeSubContractors(store);
  revalidatePath('/subinvoices');
}

export async function setLineApplyFactor(
  invoiceId: string, lineId: string, applyFactor: boolean
): Promise<void> {
  const store = await readSubContractors();
  const invoice = store.invoices.find(i => i.id === invoiceId);
  if (!invoice) return;
  const line = invoice.lines.find(l => l.id === lineId);
  if (line) line.applyFactor = applyFactor;
  await writeSubContractors(store);
  revalidatePath('/subinvoices');
}
