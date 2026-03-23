'use server';

import { revalidatePath } from 'next/cache';
import { readData, writeData } from '@/lib/db';
import { generateId } from '@/lib/utils';

export async function createAssignment(formData: FormData) {
  const data = readData();
  const assignment = {
    id: generateId(),
    projectId: formData.get('projectId') as string,
    memberId: formData.get('memberId') as string,
    hoursPerMonth: Number(formData.get('hoursPerMonth')),
  };
  data.assignments.push(assignment);
  writeData(data);
  revalidatePath('/');
}

export async function createBulkAssignments(formData: FormData) {
  const data = readData();
  const projectId = formData.get('projectId') as string;

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('hours_')) continue;
    const memberId = key.replace('hours_', '');
    const hours = Number(value);
    if (!hours || hours <= 0) continue;
    // Skip if already assigned
    const exists = data.assignments.some(
      (a) => a.projectId === projectId && a.memberId === memberId
    );
    if (exists) continue;
    data.assignments.push({ id: generateId(), projectId, memberId, hoursPerMonth: hours });
  }

  writeData(data);
  revalidatePath('/');
}

export async function updateAssignment(id: string, formData: FormData) {
  const data = readData();
  const idx = data.assignments.findIndex((a) => a.id === id);
  if (idx !== -1) {
    data.assignments[idx] = {
      id,
      projectId: formData.get('projectId') as string,
      memberId: formData.get('memberId') as string,
      hoursPerMonth: Number(formData.get('hoursPerMonth')),
    };
    writeData(data);
  }
  revalidatePath('/');
}

export async function deleteAssignment(id: string) {
  const data = readData();
  data.assignments = data.assignments.filter((a) => a.id !== id);
  writeData(data);
  revalidatePath('/');
}
