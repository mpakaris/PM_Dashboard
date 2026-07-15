import { Redis } from '@upstash/redis';
import { AppData, Assignment, Project, Forecast, ElsapMirror } from './types';
import { getMonthsBetween } from './utils';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const DB_KEY = 'app:db';
const ELSAP_KEY = 'app:elsap';

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
