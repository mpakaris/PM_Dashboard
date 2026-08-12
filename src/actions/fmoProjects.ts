'use server';

import { revalidatePath } from 'next/cache';
import { readFmoProjects, writeFmoProjects } from '@/lib/db';
import { FmoProject, FmoProjectType, FmoOperationContract } from '@/lib/types';
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
    projectType: 'tm', contractValue: 0, contractHours: 0,
    memberRates: {}, operationContracts: [],
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

export async function updateProjectConfig(
  id: string,
  config: { projectType: FmoProjectType; contractValue: number; contractHours: number }
): Promise<{ ok: boolean }> {
  const projects = await readFmoProjects();
  const idx = projects.findIndex(p => p.id === id);
  if (idx === -1) return { ok: false };
  projects[idx] = { ...projects[idx], ...config };
  await writeFmoProjects(projects);
  revalidatePath(`/fmo/projects/${id}`);
  return { ok: true };
}

export async function setProjectMemberRate(
  projectId: string, memberId: string, billingRate: number
): Promise<{ ok: boolean }> {
  const projects = await readFmoProjects();
  const idx = projects.findIndex(p => p.id === projectId);
  if (idx === -1) return { ok: false };
  const rates = projects[idx].memberRates ?? {};
  rates[memberId] = { billingRate };
  projects[idx] = { ...projects[idx], memberRates: rates };
  await writeFmoProjects(projects);
  revalidatePath(`/fmo/projects/${projectId}`);
  return { ok: true };
}

export async function upsertProjectOperationContract(
  projectId: string,
  contract: Omit<FmoOperationContract, 'id'> & { id?: string }
): Promise<{ ok: boolean }> {
  const projects = await readFmoProjects();
  const idx = projects.findIndex(p => p.id === projectId);
  if (idx === -1) return { ok: false };
  const contracts = [...(projects[idx].operationContracts ?? [])];
  const existingIdx = contract.id ? contracts.findIndex(c => c.id === contract.id) : -1;
  const full: FmoOperationContract = { ...contract, id: contract.id ?? generateId() };
  if (existingIdx >= 0) contracts[existingIdx] = full;
  else contracts.push(full);
  projects[idx] = { ...projects[idx], operationContracts: contracts };
  await writeFmoProjects(projects);
  revalidatePath(`/fmo/projects/${projectId}`);
  return { ok: true };
}

export async function removeProjectOperationContract(
  projectId: string, contractId: string
): Promise<{ ok: boolean }> {
  const projects = await readFmoProjects();
  const idx = projects.findIndex(p => p.id === projectId);
  if (idx === -1) return { ok: false };
  projects[idx] = { ...projects[idx], operationContracts: (projects[idx].operationContracts ?? []).filter(c => c.id !== contractId) };
  await writeFmoProjects(projects);
  revalidatePath(`/fmo/projects/${projectId}`);
  return { ok: true };
}
