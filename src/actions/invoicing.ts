'use server';

import { revalidatePath } from 'next/cache';
import { readInvoicing, writeInvoicing } from '@/lib/db';
import { generateId } from '@/lib/utils';
import { InvoiceLineMember } from '@/lib/types';

export async function setDefaultRate(role: string, rate: number): Promise<void> {
  const store = await readInvoicing();
  store.defaultRates[role] = rate;
  await writeInvoicing(store);
  revalidatePath('/invoicing');
}

export async function setRateOverride(month: string, projectName: string, role: string, rate: number): Promise<void> {
  const store = await readInvoicing();
  store.rateOverrides[`${month}|${projectName}|${role}`] = rate;
  await writeInvoicing(store);
  revalidatePath('/invoicing');
}

export async function setRoleOverride(sapUser: string, month: string, projectName: string, role: string): Promise<void> {
  const store = await readInvoicing();
  const idx = store.roleOverrides.findIndex(
    o => o.sapUser === sapUser && o.month === month && o.projectName === projectName
  );
  if (idx >= 0) store.roleOverrides[idx].role = role;
  else store.roleOverrides.push({ sapUser, month, projectName, role });
  await writeInvoicing(store);
  revalidatePath('/invoicing');
}

export async function removeRoleOverride(sapUser: string, month: string, projectName: string): Promise<void> {
  const store = await readInvoicing();
  store.roleOverrides = store.roleOverrides.filter(
    o => !(o.sapUser === sapUser && o.month === month && o.projectName === projectName)
  );
  await writeInvoicing(store);
  revalidatePath('/invoicing');
}

export async function addInvoiceLine(
  month: string, projectName: string, role: string,
  fakturaNumber: string, invoicedHours: number,
  members: InvoiceLineMember[]
): Promise<void> {
  const store = await readInvoicing();
  store.invoices.push({ id: generateId(), month, projectName, role, fakturaNumber, invoicedHours, invoicedAt: new Date().toISOString(), members });
  await writeInvoicing(store);
  revalidatePath('/invoicing');
}

export async function removeInvoiceLine(id: string): Promise<void> {
  const store = await readInvoicing();
  store.invoices = store.invoices.filter(i => i.id !== id);
  await writeInvoicing(store);
  revalidatePath('/invoicing');
}
