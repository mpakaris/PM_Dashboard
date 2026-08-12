'use server';

import { revalidatePath } from 'next/cache';
import { readFmoProjects, writeFmoProjects } from '@/lib/db';
import { FmoProject } from '@/lib/types';
import { generateId } from '@/lib/utils';

export async function getFmoProjects(): Promise<FmoProject[]> {
  return readFmoProjects();
}

export async function createFmoProject(
  name: string,
  description: string,
  wbsCodes: string[],
  ticketIds: number[] = [],
  excludedTicketIds: number[] = [],
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!name.trim()) return { ok: false, error: 'Name required' };
  const projects = await readFmoProjects();
  const id = generateId();
  projects.push({
    id, createdAt: new Date().toISOString(),
    name: name.trim(),
    description: description.trim() || undefined,
    wbsCodes, ticketIds, excludedTicketIds,
  });
  await writeFmoProjects(projects);
  revalidatePath('/fmo/projects');
  return { ok: true, id };
}

export async function updateFmoProject(
  id: string,
  name: string,
  description: string,
  wbsCodes: string[],
  ticketIds?: number[],
  excludedTicketIds?: number[],
): Promise<{ ok: boolean; error?: string }> {
  const projects = await readFmoProjects();
  const idx = projects.findIndex(p => p.id === id);
  if (idx === -1) return { ok: false, error: 'Not found' };
  projects[idx] = {
    ...projects[idx],
    name: name.trim(),
    description: description.trim() || undefined,
    wbsCodes,
    ticketIds:         ticketIds         ?? projects[idx].ticketIds         ?? [],
    excludedTicketIds: excludedTicketIds ?? projects[idx].excludedTicketIds ?? [],
  };
  await writeFmoProjects(projects);
  revalidatePath('/fmo/projects');
  revalidatePath(`/fmo/projects/${id}`);
  return { ok: true };
}

export async function deleteFmoProject(id: string): Promise<{ ok: boolean }> {
  const projects = await readFmoProjects();
  await writeFmoProjects(projects.filter(p => p.id !== id));
  revalidatePath('/fmo/projects');
  return { ok: true };
}
