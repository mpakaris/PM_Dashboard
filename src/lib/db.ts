import { Redis } from '@upstash/redis';
import { AppData, Assignment, Project, Forecast, ElsapMirror, TimesheetStore, InvoicingStore, SubContractorStore, ProjektAnalysisProject, FmoStore, FmoMappingStore, FmoProject, FmoForecast } from './types';
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

export async function readData(): Promise<AppData> {
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
}

export async function writeData(data: AppData): Promise<void> {
  await withRetry(() => redis.set(DB_KEY, data));
}

const EMPTY_ELSAP: ElsapMirror = {
  rows: [],
  lastImport: '',
  lastApply: '',
  importStats: { added: 0, updated: 0, skipped: 0 },
};

export async function readElsap(): Promise<ElsapMirror> {
  const raw = await withRetry(() => redis.get<any>(ELSAP_KEY));
  if (!raw) return { ...EMPTY_ELSAP };
  return {
    rows: raw.rows ?? [],
    lastImport: raw.lastImport ?? '',
    lastApply: raw.lastApply ?? '',
    importStats: raw.importStats ?? { added: 0, updated: 0, skipped: 0 },
  };
}

export async function writeElsap(mirror: ElsapMirror): Promise<void> {
  await withRetry(() => redis.set(ELSAP_KEY, mirror));
}

export async function readTimesheets(): Promise<TimesheetStore> {
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
}

export async function writeTimesheets(store: TimesheetStore): Promise<void> {
  await withRetry(() => redis.set(TIMESHEETS_KEY, store));
}

const EMPTY_INVOICING: InvoicingStore = {
  defaultRates: {},
  rateOverrides: {},
  roleOverrides: [],
  invoices: [],
};

export async function readInvoicing(): Promise<InvoicingStore> {
  const raw = await withRetry(() => redis.get<any>(INVOICING_KEY));
  if (!raw) return { ...EMPTY_INVOICING };
  // Only keep records that match the current InvoiceLineItem shape (role + invoicedHours required)
  const invoices = (raw.invoices ?? [])
    .filter((i: any) => typeof i.role === 'string' && typeof i.invoicedHours === 'number')
    .map((i: any) => ({ ...i, members: i.members ?? [], poNumber: i.poNumber ?? '' }));
  return {
    defaultRates: raw.defaultRates ?? {},
    rateOverrides: raw.rateOverrides ?? {},
    roleOverrides: raw.roleOverrides ?? [],
    invoices,
  };
}

export async function writeInvoicing(store: InvoicingStore): Promise<void> {
  await withRetry(() => redis.set(INVOICING_KEY, store));
}

const SUB_KEY = 'app:subcontractors';

export async function readSubContractors(): Promise<SubContractorStore> {
  const raw = await withRetry(() => redis.get<any>(SUB_KEY));
  if (!raw) return { subContractors: [], invoices: [] };
  return {
    subContractors: raw.subContractors ?? [],
    invoices: raw.invoices ?? [],
  };
}

export async function writeSubContractors(store: SubContractorStore): Promise<void> {
  await withRetry(() => redis.set(SUB_KEY, store));
}

const PROJEKT_ANALYSIS_KEY = 'app:projekt-analysis';

export async function readProjektAnalysis(): Promise<ProjektAnalysisProject[]> {
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
}

export async function writeProjektAnalysis(projects: ProjektAnalysisProject[]): Promise<void> {
  await withRetry(() => redis.set(PROJEKT_ANALYSIS_KEY, projects));
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

export async function readFmoStore(): Promise<FmoStore> {
  const raw = await withRetry(() => redis.get<any>(FMO_STORE_KEY));
  if (!raw) return { ...EMPTY_FMO_STORE, importStats: { ...EMPTY_FMO_STORE.importStats } };
  return {
    entries: raw.entries ?? [],
    lastUpload: raw.lastUpload ?? '',
    sources: raw.sources ?? [],
    importStats: raw.importStats ?? { ...EMPTY_FMO_STORE.importStats },
  };
}

export async function writeFmoStore(store: FmoStore): Promise<void> {
  await withRetry(() => redis.set(FMO_STORE_KEY, store));
}

export async function readFmoMappings(): Promise<FmoMappingStore> {
  const raw = await withRetry(() => redis.get<any>(FMO_MAPPING_KEY));
  if (!raw) return { ...EMPTY_FMO_MAPPINGS };
  return {
    wbs: raw.wbs ?? {},
    tickets: raw.tickets ?? {},
    members: raw.members ?? {},
    billingClasses: raw.billingClasses ?? {},
    subCategories: raw.subCategories ?? {},
  };
}

export async function writeFmoMappings(mappings: FmoMappingStore): Promise<void> {
  await withRetry(() => redis.set(FMO_MAPPING_KEY, mappings));
}

const FMO_PROJECTS_KEY  = 'app:fmo:projects';
const FMO_PLANNING_KEY  = 'app:fmo:planning';

export async function readFmoProjects(): Promise<FmoProject[]> {
  const raw = await withRetry(() => redis.get<FmoProject[]>(FMO_PROJECTS_KEY));
  return raw ?? [];
}

export async function writeFmoProjects(projects: FmoProject[]): Promise<void> {
  await withRetry(() => redis.set(FMO_PROJECTS_KEY, projects));
}

export async function readFmoForecasts(): Promise<FmoForecast[]> {
  const raw = await withRetry(() => redis.get<FmoForecast[]>(FMO_PLANNING_KEY));
  return raw ?? [];
}

export async function writeFmoForecasts(forecasts: FmoForecast[]): Promise<void> {
  await withRetry(() => redis.set(FMO_PLANNING_KEY, forecasts));
}
