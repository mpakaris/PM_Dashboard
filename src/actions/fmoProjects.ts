'use server';

import { revalidatePath } from 'next/cache';
import { readFmoProjects, writeFmoProjects } from '@/lib/db';
import {
  FmoProject, FmoProjectType, FmoProjectCategory, FmoOperationContract,
  FmoProjectChange, FmoWorkPackage, FmoWorkPackageNote, FmoProjectMilestone,
  FmoAcceptanceCriterion,
} from '@/lib/types';
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
  config: { projectType: FmoProjectType; contractValue: number; contractHours: number; projectCategory?: FmoProjectCategory }
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
  const rates = { ...(projects[idx].memberRates ?? {}) };
  rates[memberId] = { ...(rates[memberId] ?? {}), billingRate };
  projects[idx] = { ...projects[idx], memberRates: rates };
  await writeFmoProjects(projects);
  revalidatePath(`/fmo/projects/${projectId}`);
  return { ok: true };
}

export async function setProjectMemberBillingRateHistory(
  projectId: string,
  memberId: string,
  history: Array<{ from: string; rate: number }>
): Promise<void> {
  const projects = await readFmoProjects();
  const idx = projects.findIndex(p => p.id === projectId);
  if (idx === -1) return;
  const rates = { ...(projects[idx].memberRates ?? {}) };
  rates[memberId] = { ...(rates[memberId] ?? { billingRate: 0 }), billingRateHistory: history };
  projects[idx] = { ...projects[idx], memberRates: rates };
  await writeFmoProjects(projects);
  revalidatePath(`/fmo/projects/${projectId}`);
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

// ─── Fixed-Price frame ────────────────────────────────────────────────────────

export async function updateProjectFrame(
  id: string,
  frame: { startDate: string; endDate: string; budgetHours: number; budgetEur: number; fteHours: number }
): Promise<{ ok: boolean }> {
  const projects = await readFmoProjects();
  const idx = projects.findIndex(p => p.id === id);
  if (idx === -1) return { ok: false };
  projects[idx] = { ...projects[idx], ...frame };
  await writeFmoProjects(projects);
  revalidatePath(`/fmo/projects/${id}`);
  return { ok: true };
}

// ─── Nachträge (Change Orders) ────────────────────────────────────────────────

export async function upsertProjectChange(
  projectId: string,
  change: Omit<FmoProjectChange, 'id' | 'createdAt'> & { id?: string }
): Promise<{ ok: boolean }> {
  const projects = await readFmoProjects();
  const idx = projects.findIndex(p => p.id === projectId);
  if (idx === -1) return { ok: false };
  const changes = [...(projects[idx].changes ?? [])];
  const eidx = change.id ? changes.findIndex(c => c.id === change.id) : -1;
  const full: FmoProjectChange = { ...change, id: change.id ?? generateId(), createdAt: change.id ? (changes[eidx]?.createdAt ?? new Date().toISOString()) : new Date().toISOString() };
  if (eidx >= 0) changes[eidx] = full; else changes.push(full);
  projects[idx] = { ...projects[idx], changes };
  await writeFmoProjects(projects);
  revalidatePath(`/fmo/projects/${projectId}`);
  return { ok: true };
}

export async function removeProjectChange(projectId: string, changeId: string): Promise<{ ok: boolean }> {
  const projects = await readFmoProjects();
  const idx = projects.findIndex(p => p.id === projectId);
  if (idx === -1) return { ok: false };
  projects[idx] = { ...projects[idx], changes: (projects[idx].changes ?? []).filter(c => c.id !== changeId) };
  await writeFmoProjects(projects);
  revalidatePath(`/fmo/projects/${projectId}`);
  return { ok: true };
}

// ─── Arbeitspakete (Work Packages) ────────────────────────────────────────────

export async function upsertWorkPackage(
  projectId: string,
  wp: Omit<FmoWorkPackage, 'id' | 'notes'> & { id?: string }
): Promise<{ ok: boolean }> {
  const projects = await readFmoProjects();
  const idx = projects.findIndex(p => p.id === projectId);
  if (idx === -1) return { ok: false };
  const wps = [...(projects[idx].workPackages ?? [])];
  const widx = wp.id ? wps.findIndex(w => w.id === wp.id) : -1;
  if (widx >= 0) wps[widx] = { ...wps[widx], ...wp };
  else wps.push({ ...wp, id: generateId(), notes: [] });
  projects[idx] = { ...projects[idx], workPackages: wps };
  await writeFmoProjects(projects);
  revalidatePath(`/fmo/projects/${projectId}`);
  return { ok: true };
}

export async function removeWorkPackage(projectId: string, wpId: string): Promise<{ ok: boolean }> {
  const projects = await readFmoProjects();
  const idx = projects.findIndex(p => p.id === projectId);
  if (idx === -1) return { ok: false };
  projects[idx] = { ...projects[idx], workPackages: (projects[idx].workPackages ?? []).filter(w => w.id !== wpId) };
  await writeFmoProjects(projects);
  revalidatePath(`/fmo/projects/${projectId}`);
  return { ok: true };
}

export async function addWorkPackageNote(
  projectId: string,
  wpId: string,
  note: Omit<FmoWorkPackageNote, 'id' | 'timestamp'>
): Promise<{ ok: boolean }> {
  const projects = await readFmoProjects();
  const idx = projects.findIndex(p => p.id === projectId);
  if (idx === -1) return { ok: false };
  const wps = (projects[idx].workPackages ?? []).map(w =>
    w.id !== wpId ? w : { ...w, notes: [...w.notes, { ...note, id: generateId(), timestamp: new Date().toISOString() }] }
  );
  projects[idx] = { ...projects[idx], workPackages: wps };
  await writeFmoProjects(projects);
  revalidatePath(`/fmo/projects/${projectId}`);
  return { ok: true };
}

export async function toggleWorkPackageCriterion(
  projectId: string,
  wpId: string,
  criterionId: string,
): Promise<{ ok: boolean }> {
  const projects = await readFmoProjects();
  const idx = projects.findIndex(p => p.id === projectId);
  if (idx === -1) return { ok: false };
  const wps = (projects[idx].workPackages ?? []).map(w => {
    if (w.id !== wpId) return w;
    return {
      ...w,
      acceptanceCriteria: (w.acceptanceCriteria ?? []).map((c: FmoAcceptanceCriterion) =>
        c.id !== criterionId ? c : { ...c, checked: !c.checked }
      ),
    };
  });
  projects[idx] = { ...projects[idx], workPackages: wps };
  await writeFmoProjects(projects);
  revalidatePath(`/fmo/projects/${projectId}`);
  return { ok: true };
}

// ─── Milestones ───────────────────────────────────────────────────────────────

export async function upsertMilestone(
  projectId: string,
  ms: Omit<FmoProjectMilestone, 'id'> & { id?: string }
): Promise<{ ok: boolean }> {
  const projects = await readFmoProjects();
  const idx = projects.findIndex(p => p.id === projectId);
  if (idx === -1) return { ok: false };
  const milestones = [...(projects[idx].milestones ?? [])];
  const midx = ms.id ? milestones.findIndex(m => m.id === ms.id) : -1;
  const full: FmoProjectMilestone = { ...ms, id: ms.id ?? generateId() };
  if (midx >= 0) milestones[midx] = full; else milestones.push(full);
  projects[idx] = { ...projects[idx], milestones };
  await writeFmoProjects(projects);
  revalidatePath(`/fmo/projects/${projectId}`);
  return { ok: true };
}

export async function removeMilestone(projectId: string, milestoneId: string): Promise<{ ok: boolean }> {
  const projects = await readFmoProjects();
  const idx = projects.findIndex(p => p.id === projectId);
  if (idx === -1) return { ok: false };
  projects[idx] = { ...projects[idx], milestones: (projects[idx].milestones ?? []).filter(m => m.id !== milestoneId) };
  await writeFmoProjects(projects);
  revalidatePath(`/fmo/projects/${projectId}`);
  return { ok: true };
}
