import { Redis } from '@upstash/redis';
import { AppData, Assignment, Project } from './types';
import { getMonthsBetween } from './utils';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const DB_KEY = 'app:db';

const EMPTY: AppData = {
  roles: [],
  profiles: [],
  teamMembers: [],
  projects: [],
  assignments: [],
};

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
  const raw = await redis.get<any>(DB_KEY);
  if (!raw) return { ...EMPTY };
  const projects: Project[] = raw.projects ?? [];
  return {
    roles: raw.roles ?? [],
    profiles: raw.profiles ?? [],
    teamMembers: raw.teamMembers ?? [],
    projects,
    assignments: migrateAssignments(raw.assignments ?? [], projects),
  };
}

export async function writeData(data: AppData): Promise<void> {
  await redis.set(DB_KEY, data);
}
