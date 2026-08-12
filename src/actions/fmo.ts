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
