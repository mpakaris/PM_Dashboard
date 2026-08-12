'use server';

import { revalidatePath } from 'next/cache';
import { readFmoMappings, writeFmoMappings } from '@/lib/db';
import { seedWbsEntries, classifyWbs, SEED_BILLING_CLASSES, SEED_SUB_CATEGORIES } from '@/lib/fmoClassify';

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
