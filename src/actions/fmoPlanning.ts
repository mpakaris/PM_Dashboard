'use server';

import { revalidatePath } from 'next/cache';
import { readFmoForecasts, writeFmoForecasts } from '@/lib/db';
import { FmoForecast, FmoForecastProject, FmoForecastAssignment } from '@/lib/types';
import { generateId } from '@/lib/utils';

export async function getFmoForecasts(): Promise<FmoForecast[]> {
  return readFmoForecasts();
}

export async function createFmoForecast(name: string, startMonth: string, endMonth: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!name.trim()) return { ok: false, error: 'Name required' };
  const forecasts = await readFmoForecasts();
  const id = generateId();
  forecasts.push({ id, name: name.trim(), startMonth, endMonth, createdAt: new Date().toISOString(), projects: [] });
  await writeFmoForecasts(forecasts);
  revalidatePath('/fmo/planning');
  return { ok: true, id };
}

export async function deleteFmoForecast(id: string): Promise<{ ok: boolean }> {
  const forecasts = await readFmoForecasts();
  await writeFmoForecasts(forecasts.filter(f => f.id !== id));
  revalidatePath('/fmo/planning');
  return { ok: true };
}

export async function renameFmoForecast(id: string, name: string): Promise<{ ok: boolean }> {
  const forecasts = await readFmoForecasts();
  const f = forecasts.find(f => f.id === id);
  if (!f) return { ok: false };
  f.name = name.trim();
  await writeFmoForecasts(forecasts);
  revalidatePath(`/fmo/planning/${id}`);
  return { ok: true };
}

export async function upsertFmoForecastProject(
  forecastId: string,
  projectId: string,
  overallHours: number,
): Promise<{ ok: boolean }> {
  const forecasts = await readFmoForecasts();
  const f = forecasts.find(f => f.id === forecastId);
  if (!f) return { ok: false };
  const existing = f.projects.find(p => p.projectId === projectId);
  if (existing) {
    existing.overallHours = overallHours;
  } else {
    f.projects.push({ projectId, overallHours, assignments: [] });
  }
  await writeFmoForecasts(forecasts);
  revalidatePath(`/fmo/planning/${forecastId}`);
  return { ok: true };
}

export async function removeFmoForecastProject(forecastId: string, projectId: string): Promise<{ ok: boolean }> {
  const forecasts = await readFmoForecasts();
  const f = forecasts.find(f => f.id === forecastId);
  if (!f) return { ok: false };
  f.projects = f.projects.filter(p => p.projectId !== projectId);
  await writeFmoForecasts(forecasts);
  revalidatePath(`/fmo/planning/${forecastId}`);
  return { ok: true };
}

export async function upsertFmoForecastAssignment(
  forecastId: string,
  projectId: string,
  memberId: string,
  plannedHours: Record<string, number>,
): Promise<{ ok: boolean }> {
  const forecasts = await readFmoForecasts();
  const f = forecasts.find(f => f.id === forecastId);
  if (!f) return { ok: false };
  const proj = f.projects.find(p => p.projectId === projectId);
  if (!proj) return { ok: false };
  const existing = proj.assignments.find(a => a.memberId === memberId);
  if (existing) {
    existing.plannedHours = plannedHours;
  } else {
    proj.assignments.push({ memberId, plannedHours });
  }
  await writeFmoForecasts(forecasts);
  revalidatePath(`/fmo/planning/${forecastId}`);
  return { ok: true };
}

export async function removeFmoForecastAssignment(forecastId: string, projectId: string, memberId: string): Promise<{ ok: boolean }> {
  const forecasts = await readFmoForecasts();
  const f = forecasts.find(f => f.id === forecastId);
  if (!f) return { ok: false };
  const proj = f.projects.find(p => p.projectId === projectId);
  if (!proj) return { ok: false };
  proj.assignments = proj.assignments.filter(a => a.memberId !== memberId);
  await writeFmoForecasts(forecasts);
  revalidatePath(`/fmo/planning/${forecastId}`);
  return { ok: true };
}
