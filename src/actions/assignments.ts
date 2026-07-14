'use server';

import { revalidatePath } from 'next/cache';
import { readData, writeData } from '@/lib/db';
import { generateId } from '@/lib/utils';
import { getMonthsBetween } from '@/lib/utils';

export async function createAssignment(formData: FormData) {
  const data = await readData();
  const projectId = formData.get('projectId') as string;
  const memberId = formData.get('memberId') as string;
  const project = data.projects.find((p) => p.id === projectId);
  const months = project ? getMonthsBetween(project.startMonth, project.endMonth) : [];
  const hoursPerMonth = Number(formData.get('hoursPerMonth')) || 0;
  const plannedHours: Record<string, number> = {};
  for (const month of months) plannedHours[month] = hoursPerMonth;
  data.assignments.push({ id: generateId(), projectId, memberId, plannedHours, billedHours: {} });
  await writeData(data);
  revalidatePath('/', 'layout');
}

export async function createBulkAssignments(formData: FormData) {
  const data = await readData();
  const projectId = formData.get('projectId') as string;
  const project = data.projects.find((p) => p.id === projectId);
  const months = project ? getMonthsBetween(project.startMonth, project.endMonth) : [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('hours_')) continue;
    const memberId = key.replace('hours_', '');
    const hours = Number(value);
    if (hours < 0) continue;
    const exists = data.assignments.some((a) => a.projectId === projectId && a.memberId === memberId);
    if (exists) continue;
    const plannedHours: Record<string, number> = {};
    for (const month of months) plannedHours[month] = hours;
    data.assignments.push({ id: generateId(), projectId, memberId, plannedHours, billedHours: {} });
  }

  await writeData(data);
  revalidatePath('/', 'layout');
}

export async function updateAssignment(id: string, formData: FormData) {
  const data = await readData();
  const idx = data.assignments.findIndex((a) => a.id === id);
  if (idx === -1) return;

  const plannedHours: Record<string, number> = {};
  const billedHours: Record<string, number> = {};

  for (const [key, value] of formData.entries()) {
    if (key.startsWith('planned_')) {
      const month = key.replace('planned_', '');
      const h = Number(value);
      if (h >= 0) plannedHours[month] = h;
    }
    if (key.startsWith('billed_')) {
      const month = key.replace('billed_', '');
      const h = Number(value);
      if (h >= 0) billedHours[month] = h;
    }
  }

  data.assignments[idx] = { ...data.assignments[idx], plannedHours, billedHours };
  await writeData(data);
  revalidatePath('/', 'layout');
}

export async function updatePlannedHours(id: string, formData: FormData) {
  const data = await readData();
  const idx = data.assignments.findIndex((a) => a.id === id);
  if (idx === -1) return;

  const plannedHours: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('planned_')) {
      const month = key.replace('planned_', '');
      const h = Number(value);
      if (h >= 0) plannedHours[month] = h;
    }
  }

  data.assignments[idx] = { ...data.assignments[idx], plannedHours };
  await writeData(data);
  revalidatePath('/', 'layout');
}

export async function deleteAssignment(id: string) {
  const data = await readData();
  data.assignments = data.assignments.filter((a) => a.id !== id);
  await writeData(data);
  revalidatePath('/', 'layout');
}
