import { Redis } from '@upstash/redis';
import { unstable_cache, revalidateTag } from 'next/cache';
import { cache } from 'react';
import { AppData, Assignment, Project, Forecast, ElsapMirror, TimesheetStore, InvoicingStore, SubContractorStore, ProjektAnalysisProject, FmoStore, FmoMappingStore, FmoProject } from './types';
import { getMonthsBetween } from './utils';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const DB_KEY = 'app:db';
const ELSAP_KEY = 'app:elsap';
const TIMESHEETS_KEY = 'app:timesheets';
const INVOICING_KEY = 'app:invoicing';

const EMPTY: AppData = {
  roles: [],
  profiles: [],
  teamMembers: [],
  projects: [],
  assignments: [],
  forecasts: [],
};

// Retry wrapper — handles transient fetch failures from Node.js native fetch
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 150): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastError;
}

// Migrate assignments that still use the old flat hoursPerMonth field
function migrateAssignments(raw: any[], projects: Project[]): Assignment[] {
  return raw.map((a: any) => {
    if (a.plannedHours !== undefined) return a as Assignment;
    const project = projects.find((p) => p.id === a.projectId);
    const months = project ? getMonthsBetween(project.startMonth, project.endMonth) : [];
    const plannedHours: Record<string, number> = {};
    for (const month of months) plannedHours[month] = a.hoursPerMonth ?? 0;
    return { id: a.id, projectId: a.projectId, memberId: a.memberId, plannedHours, billedHours: {} };
  });
}

export const readData = unstable_cache(
  async (): Promise<AppData> => {
    const raw = await withRetry(() => redis.get<any>(DB_KEY));
    if (!raw) return { ...EMPTY };
    const projects: Project[] = raw.projects ?? [];
    return {
      roles: raw.roles ?? [],
      profiles: raw.profiles ?? [],
      teamMembers: raw.teamMembers ?? [],
      projects,
      assignments: migrateAssignments(raw.assignments ?? [], projects),
      forecasts: (raw.forecasts ?? []) as Forecast[],
    };
  },
  ['app-data'],
  { tags: ['app-data'], revalidate: 300 }
);

export async function writeData(data: AppData): Promise<void> {
  await withRetry(() => redis.set(DB_KEY, data));
  revalidateTag('app-data', 'default');
}

const EMPTY_ELSAP: ElsapMirror = {
  rows: [],
  lastImport: '',
  lastApply: '',
  importStats: { added: 0, updated: 0, skipped: 0 },
};

export const readElsap = unstable_cache(
  async (): Promise<ElsapMirror> => {
    const raw = await withRetry(() => redis.get<any>(ELSAP_KEY));
    if (!raw) return { ...EMPTY_ELSAP };
    return {
      rows: raw.rows ?? [],
      lastImport: raw.lastImport ?? '',
      lastApply: raw.lastApply ?? '',
      importStats: raw.importStats ?? { added: 0, updated: 0, skipped: 0 },
    };
  },
  ['app-elsap'],
  { tags: ['app-elsap'], revalidate: 300 }
);

export async function writeElsap(mirror: ElsapMirror): Promise<void> {
  await withRetry(() => redis.set(ELSAP_KEY, mirror));
  revalidateTag('app-elsap', 'default');
}

export const readTimesheets = unstable_cache(
  async (): Promise<TimesheetStore> => {
    const raw = await withRetry(() => redis.get<any>(TIMESHEETS_KEY));
    if (!raw) return { entries: [], lastUpload: '', sources: [], baselines: {}, billingRates: {}, costRates: {} };
    return {
      entries: raw.entries ?? [],
      lastUpload: raw.lastUpload ?? '',
      sources: raw.sources ?? [],
      baselines: raw.baselines ?? {},
      billingRates: raw.billingRates ?? {},
      costRates: raw.costRates ?? {},
    };
  },
  ['app-timesheets'],
  { tags: ['app-timesheets'], revalidate: 300 }
);

export async function writeTimesheets(store: TimesheetStore): Promise<void> {
  await withRetry(() => redis.set(TIMESHEETS_KEY, store));
  revalidateTag('app-timesheets', 'default');
}

const EMPTY_INVOICING: InvoicingStore = {
  defaultRates: {},
  rateOverrides: {},
  roleOverrides: [],
  invoices: [],
};

export const readInvoicing = unstable_cache(
  async (): Promise<InvoicingStore> => {
    const raw = await withRetry(() => redis.get<any>(INVOICING_KEY));
    if (!raw) return { ...EMPTY_INVOICING };
    const invoices = (raw.invoices ?? [])
      .filter((i: any) => typeof i.role === 'string' && typeof i.invoicedHours === 'number')
      .map((i: any) => ({ ...i, members: i.members ?? [], poNumber: i.poNumber ?? '' }));
    return {
      defaultRates: raw.defaultRates ?? {},
      rateOverrides: raw.rateOverrides ?? {},
      roleOverrides: raw.roleOverrides ?? [],
      invoices,
    };
  },
  ['app-invoicing'],
  { tags: ['app-invoicing'], revalidate: 300 }
);

export async function writeInvoicing(store: InvoicingStore): Promise<void> {
  await withRetry(() => redis.set(INVOICING_KEY, store));
  revalidateTag('app-invoicing', 'default');
}

const SUB_KEY = 'app:subcontractors';

export const readSubContractors = unstable_cache(
  async (): Promise<SubContractorStore> => {
    const raw = await withRetry(() => redis.get<any>(SUB_KEY));
    if (!raw) return { subContractors: [], invoices: [] };
    return {
      subContractors: raw.subContractors ?? [],
      invoices: raw.invoices ?? [],
    };
  },
  ['app-subs'],
  { tags: ['app-subs'], revalidate: 300 }
);

export async function writeSubContractors(store: SubContractorStore): Promise<void> {
  await withRetry(() => redis.set(SUB_KEY, store));
  revalidateTag('app-subs', 'default');
}

const PROJEKT_ANALYSIS_KEY = 'app:projekt-analysis';

export const readProjektAnalysis = unstable_cache(
  async (): Promise<ProjektAnalysisProject[]> => {
    const raw = await withRetry(() => redis.get<any>(PROJEKT_ANALYSIS_KEY));
    if (!raw) return [];
    if (!Array.isArray(raw)) return [];
    return raw.map((p: any) => ({
      projectType: 'time-and-material',
      contractHours: 0,
      contractValue: 0,
      changes: [],
      members: [],
      operationContracts: [],
      ...p,
    })) as ProjektAnalysisProject[];
  },
  ['app-projekt-analysis'],
  { tags: ['app-projekt-analysis'], revalidate: 300 }
);

export async function writeProjektAnalysis(projects: ProjektAnalysisProject[]): Promise<void> {
  await withRetry(() => redis.set(PROJEKT_ANALYSIS_KEY, projects));
  revalidateTag('app-projekt-analysis', 'default');
}

// ─── FMO ─────────────────────────────────────────────────────────────────────

const FMO_STORE_KEY   = 'app:fmo:store';
const FMO_MAPPING_KEY = 'app:fmo:mappings';

const EMPTY_FMO_STORE: FmoStore = {
  entries: [],
  lastUpload: '',
  sources: [],
  importStats: { added: 0, duplicates: 0, updated: 0, newTickets: 0, newMembers: 0, unmapped: 0 },
};

const EMPTY_FMO_MAPPINGS: FmoMappingStore = {
  wbs: {},
  tickets: {},
  members: {},
  billingClasses: {},
  subCategories: {},
};

// readFmoStore uses React cache() (request-level deduplication only).
// The FMO store is ~8MB — Next.js unstable_cache hard-limits at 2MB and would error on every request.
export const readFmoStore = cache(async (): Promise<FmoStore> => {
  const raw = await withRetry(() => redis.get<any>(FMO_STORE_KEY));
  if (!raw) return { ...EMPTY_FMO_STORE, importStats: { ...EMPTY_FMO_STORE.importStats } };
  return {
    entries: raw.entries ?? [],
    lastUpload: raw.lastUpload ?? '',
    sources: raw.sources ?? [],
    importStats: raw.importStats ?? { ...EMPTY_FMO_STORE.importStats },
  };
});

export async function writeFmoStore(store: FmoStore): Promise<void> {
  await withRetry(() => redis.set(FMO_STORE_KEY, store));
}

// readFmoMappings uses React cache() (request-level deduplication only).
// unstable_cache caused stale Vercel Data Cache to be read by server actions and
// written back to Redis, silently overwriting real data with old cached data.
export const readFmoMappings = cache(async (): Promise<FmoMappingStore> => {
  const raw = await withRetry(() => redis.get<any>(FMO_MAPPING_KEY));
  if (!raw) return { ...EMPTY_FMO_MAPPINGS };
  return {
    wbs: raw.wbs ?? {},
    tickets: raw.tickets ?? {},
    members: raw.members ?? {},
    billingClasses: raw.billingClasses ?? {},
    subCategories: raw.subCategories ?? {},
  };
});

export async function writeFmoMappings(mappings: FmoMappingStore): Promise<void> {
  await withRetry(() => redis.set(FMO_MAPPING_KEY, mappings));
}

const FMO_PROJECTS_KEY  = 'app:fmo:projects';

export const readFmoProjects = cache(async (): Promise<FmoProject[]> => {
  const raw = await withRetry(() => redis.get<FmoProject[]>(FMO_PROJECTS_KEY));
  return (raw ?? []) as FmoProject[];
});

export async function writeFmoProjects(projects: FmoProject[]): Promise<void> {
  await withRetry(() => redis.set(FMO_PROJECTS_KEY, projects));
}

