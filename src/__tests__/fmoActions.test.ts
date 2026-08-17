import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FmoMappingStore } from '@/lib/types';

// ─── In-memory store mock ─────────────────────────────────────────────────────
// Each test gets a fresh empty store; tests that need specific data set it up explicitly.

let store: FmoMappingStore;

vi.mock('@/lib/db', () => ({
  readFmoMappings:  async () => structuredClone(store),
  writeFmoMappings: async (s: FmoMappingStore) => { store = structuredClone(s); },
  readFmoStore:     async () => ({ entries: [], lastUpload: '', sources: [], importStats: { added: 0, duplicates: 0, updated: 0, newTickets: 0, newMembers: 0, unmapped: 0 } }),
  writeFmoStore:    async () => {},
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// Import actions after mocks are set up
const {
  addFmoWbs,
  updateFmoWbs,
  deleteFmoWbs,
  addFmoSubCategory,
  updateFmoSubCategoryLabel,
  deleteFmoSubCategory,
  setWbsSubCategoryOverride,
} = await import('@/actions/fmo');

function emptyStore(): FmoMappingStore {
  return {
    wbs: {},
    tickets: {},
    members: {},
    billingClasses: { V: 'Billable', I: 'Internal' },
    subCategories: {
      admin:    { id: 'admin',    label: 'Administration' },
      training: { id: 'training', label: 'Training' },
      presales: { id: 'presales', label: 'Presales' },
    },
  };
}

// ─── WBS CRUD ─────────────────────────────────────────────────────────────────

describe('addFmoWbs', () => {
  beforeEach(() => { store = emptyStore(); });

  it('creates a new WBS entry with correct billing class', async () => {
    const r = await addFmoWbs('V.05921700.81.01', 'Barmer IAM Betrieb');
    expect(r.ok).toBe(true);
    expect(store.wbs['V.05921700.81.01']).toMatchObject({
      code: 'V.05921700.81.01',
      label: 'Barmer IAM Betrieb',
      billingClass: 'V',
      syncSource: 'manual',
    });
  });

  it('auto-classifies internal code sub-category on creation', async () => {
    await addFmoWbs('I.05921059.00.01', 'IAM Administration');
    expect(store.wbs['I.05921059.00.01'].subCategory).toBe('admin');
  });

  it('rejects empty code', async () => {
    const r = await addFmoWbs('', 'No code');
    expect(r.ok).toBe(false);
  });

  it('rejects duplicate code', async () => {
    await addFmoWbs('V.05921700.81.01', 'First');
    const r = await addFmoWbs('V.05921700.81.01', 'Duplicate');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already exists/i);
  });
});

describe('updateFmoWbs', () => {
  beforeEach(async () => {
    store = emptyStore();
    await addFmoWbs('I.05921059.00.01', 'IAM Administration');
  });

  it('updates the label', async () => {
    const r = await updateFmoWbs('I.05921059.00.01', { label: 'Updated Label' });
    expect(r.ok).toBe(true);
    expect(store.wbs['I.05921059.00.01'].label).toBe('Updated Label');
  });

  it('sets subCategoryOverride', async () => {
    await updateFmoWbs('I.05921059.00.01', { subCategoryOverride: 'training' });
    expect(store.wbs['I.05921059.00.01'].subCategoryOverride).toBe('training');
  });

  it('clears subCategoryOverride when null is passed', async () => {
    await updateFmoWbs('I.05921059.00.01', { subCategoryOverride: 'training' });
    await updateFmoWbs('I.05921059.00.01', { subCategoryOverride: null });
    expect(store.wbs['I.05921059.00.01'].subCategoryOverride).toBeUndefined();
  });

  it('sets budgetHours and budgetValue', async () => {
    await updateFmoWbs('I.05921059.00.01', { budgetHours: 500, budgetValue: 75000 });
    expect(store.wbs['I.05921059.00.01'].budgetHours).toBe(500);
    expect(store.wbs['I.05921059.00.01'].budgetValue).toBe(75000);
  });

  it('clears budgetHours when null is passed', async () => {
    await updateFmoWbs('I.05921059.00.01', { budgetHours: 500 });
    await updateFmoWbs('I.05921059.00.01', { budgetHours: null });
    expect(store.wbs['I.05921059.00.01'].budgetHours).toBeUndefined();
  });

  it('returns error for non-existent code', async () => {
    const r = await updateFmoWbs('X.99999999.00.00', { label: 'Ghost' });
    expect(r.ok).toBe(false);
  });

  it('does not change unmentioned fields', async () => {
    await updateFmoWbs('I.05921059.00.01', { budgetHours: 200 });
    expect(store.wbs['I.05921059.00.01'].label).toBe('IAM Administration');
    expect(store.wbs['I.05921059.00.01'].billingClass).toBe('I');
  });
});

describe('deleteFmoWbs', () => {
  beforeEach(async () => {
    store = emptyStore();
    await addFmoWbs('V.05921700.81.01', 'Barmer');
  });

  it('removes the entry', async () => {
    await deleteFmoWbs('V.05921700.81.01');
    expect(store.wbs['V.05921700.81.01']).toBeUndefined();
  });

  it('is idempotent for non-existent codes', async () => {
    const r = await deleteFmoWbs('X.99999999.00.00');
    expect(r.ok).toBe(true);
  });
});

// ─── Sub-category CRUD ────────────────────────────────────────────────────────

describe('addFmoSubCategory', () => {
  beforeEach(() => { store = emptyStore(); });

  it('adds a new sub-category', async () => {
    const r = await addFmoSubCategory('security', 'Security');
    expect(r.ok).toBe(true);
    expect(store.subCategories['security']).toEqual({ id: 'security', label: 'Security' });
  });

  it('rejects empty slug', async () => {
    const r = await addFmoSubCategory('', 'No slug');
    expect(r.ok).toBe(false);
  });

  it('rejects empty label', async () => {
    const r = await addFmoSubCategory('foo', '');
    expect(r.ok).toBe(false);
  });

  it('rejects duplicate slug', async () => {
    await addFmoSubCategory('security', 'Security');
    const r = await addFmoSubCategory('security', 'Security 2');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already exists/i);
  });
});

describe('updateFmoSubCategoryLabel', () => {
  beforeEach(async () => {
    store = emptyStore();
    await addFmoSubCategory('security', 'Security');
  });

  it('updates the label', async () => {
    await updateFmoSubCategoryLabel('security', 'Cybersecurity');
    expect(store.subCategories['security'].label).toBe('Cybersecurity');
  });

  it('returns error for unknown slug', async () => {
    const r = await updateFmoSubCategoryLabel('nonexistent', 'X');
    expect(r.ok).toBe(false);
  });
});

describe('deleteFmoSubCategory', () => {
  beforeEach(async () => {
    store = emptyStore();
    await addFmoSubCategory('security', 'Security');
  });

  it('deletes an unused sub-category', async () => {
    await deleteFmoSubCategory('security');
    expect(store.subCategories['security']).toBeUndefined();
  });

  it('refuses to delete a sub-category referenced by a WBS entry', async () => {
    await addFmoWbs('I.05921059.00.01', 'Admin');
    await updateFmoWbs('I.05921059.00.01', { subCategoryOverride: 'security' });
    const r = await deleteFmoSubCategory('security');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/used by/i);
  });
});

// ─── setWbsSubCategoryOverride ───────────────────────────────────────────────

describe('setWbsSubCategoryOverride', () => {
  beforeEach(async () => {
    store = emptyStore();
    await addFmoWbs('I.05921059.00.01', 'IAM Admin');
  });

  it('sets an override', async () => {
    await setWbsSubCategoryOverride('I.05921059.00.01', 'training');
    expect(store.wbs['I.05921059.00.01'].subCategoryOverride).toBe('training');
  });

  it('clears override when null is passed', async () => {
    await setWbsSubCategoryOverride('I.05921059.00.01', 'training');
    await setWbsSubCategoryOverride('I.05921059.00.01', null);
    expect(store.wbs['I.05921059.00.01'].subCategoryOverride).toBeUndefined();
  });

  it('returns error for unknown WBS code', async () => {
    const r = await setWbsSubCategoryOverride('X.99999999.00.00', 'admin');
    expect(r.ok).toBe(false);
  });
});
