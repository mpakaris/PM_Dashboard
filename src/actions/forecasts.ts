'use server';

import { revalidatePath } from 'next/cache';
import { readData, writeData } from '@/lib/db';
import { generateId } from '@/lib/utils';
import { ForecastProject, GhostMember } from '@/lib/types';

export async function createForecast(name: string): Promise<string> {
  const data = await readData();
  const id = generateId();
  data.forecasts.push({
    id,
    name,
    createdAt: new Date().toISOString(),
    projects: [],
    ghostMembers: [],
    assignments: [],
  });
  await writeData(data);
  revalidatePath('/planning', 'layout');
  return id;
}

export async function renameForecast(forecastId: string, name: string): Promise<void> {
  const data = await readData();
  const f = data.forecasts.find((f) => f.id === forecastId);
  if (f) {
    f.name = name;
    await writeData(data);
    revalidatePath('/planning', 'layout');
  }
}

export async function deleteForecast(forecastId: string): Promise<void> {
  const data = await readData();
  data.forecasts = data.forecasts.filter((f) => f.id !== forecastId);
  await writeData(data);
  revalidatePath('/planning', 'layout');
}

export async function createForecastProject(
  forecastId: string,
  project: Omit<ForecastProject, 'id'>
): Promise<void> {
  const data = await readData();
  const f = data.forecasts.find((f) => f.id === forecastId);
  if (!f) return;
  f.projects.push({ ...project, id: generateId() });
  await writeData(data);
  revalidatePath('/planning', 'layout');
}

export async function updateForecastProject(
  forecastId: string,
  projectId: string,
  project: Omit<ForecastProject, 'id'>
): Promise<void> {
  const data = await readData();
  const f = data.forecasts.find((f) => f.id === forecastId);
  if (!f) return;
  const idx = f.projects.findIndex((p) => p.id === projectId);
  if (idx !== -1) f.projects[idx] = { id: projectId, ...project };
  await writeData(data);
  revalidatePath('/planning', 'layout');
}

export async function deleteForecastProject(forecastId: string, projectId: string): Promise<void> {
  const data = await readData();
  const f = data.forecasts.find((f) => f.id === forecastId);
  if (!f) return;
  f.projects = f.projects.filter((p) => p.id !== projectId);
  f.assignments = f.assignments.filter((a) => a.projectId !== projectId);
  await writeData(data);
  revalidatePath('/planning', 'layout');
}

export async function createGhostMember(
  forecastId: string,
  member: Omit<GhostMember, 'id'>
): Promise<void> {
  const data = await readData();
  const f = data.forecasts.find((f) => f.id === forecastId);
  if (!f) return;
  f.ghostMembers.push({ ...member, id: generateId() });
  await writeData(data);
  revalidatePath('/planning', 'layout');
}

export async function updateGhostMember(
  forecastId: string,
  memberId: string,
  member: Omit<GhostMember, 'id'>
): Promise<void> {
  const data = await readData();
  const f = data.forecasts.find((f) => f.id === forecastId);
  if (!f) return;
  const idx = f.ghostMembers.findIndex((m) => m.id === memberId);
  if (idx !== -1) f.ghostMembers[idx] = { id: memberId, ...member };
  await writeData(data);
  revalidatePath('/planning', 'layout');
}

export async function deleteGhostMember(forecastId: string, memberId: string): Promise<void> {
  const data = await readData();
  const f = data.forecasts.find((f) => f.id === forecastId);
  if (!f) return;
  f.ghostMembers = f.ghostMembers.filter((m) => m.id !== memberId);
  f.assignments = f.assignments.filter((a) => !(a.isGhost && a.memberId === memberId));
  await writeData(data);
  revalidatePath('/planning', 'layout');
}

export async function upsertForecastAssignment(
  forecastId: string,
  projectId: string,
  memberId: string,
  isGhost: boolean,
  plannedHours: Record<string, number>
): Promise<void> {
  const data = await readData();
  const f = data.forecasts.find((f) => f.id === forecastId);
  if (!f) return;
  const existing = f.assignments.find(
    (a) => a.projectId === projectId && a.memberId === memberId
  );
  if (existing) {
    existing.plannedHours = plannedHours;
  } else {
    f.assignments.push({ id: generateId(), projectId, memberId, isGhost, plannedHours });
  }
  await writeData(data);
  revalidatePath('/planning', 'layout');
}

export async function bulkUpsertForecastAssignments(
  forecastId: string,
  items: Array<{ projectId: string; memberId: string; isGhost: boolean; plannedHours: Record<string, number> }>
): Promise<void> {
  const data = await readData();
  const f = data.forecasts.find((f) => f.id === forecastId);
  if (!f) return;
  for (const item of items) {
    const existing = f.assignments.find(
      (a) => a.projectId === item.projectId && a.memberId === item.memberId
    );
    if (existing) {
      existing.plannedHours = item.plannedHours;
    } else {
      f.assignments.push({ id: generateId(), ...item });
    }
  }
  await writeData(data);
  revalidatePath('/planning', 'layout');
}

export async function deleteForecastAssignment(
  forecastId: string,
  assignmentId: string
): Promise<void> {
  const data = await readData();
  const f = data.forecasts.find((f) => f.id === forecastId);
  if (!f) return;
  f.assignments = f.assignments.filter((a) => a.id !== assignmentId);
  await writeData(data);
  revalidatePath('/planning', 'layout');
}
