'use server';

import { revalidatePath } from 'next/cache';
import { readData, writeData } from '@/lib/db';
import { generateId } from '@/lib/utils';

export async function createProject(formData: FormData) {
  const data = readData();

  // Parse monthlyDistribution from form entries like "dist_2026-01"
  const monthlyDistribution: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('dist_')) {
      const month = key.replace('dist_', '');
      const hours = Number(value);
      if (hours > 0) monthlyDistribution[month] = hours;
    }
  }

  const project = {
    id: generateId(),
    name: formData.get('name') as string,
    orderNo: formData.get('orderNo') as string,
    orderAmountHours: Number(formData.get('orderAmountHours')),
    startMonth: formData.get('startMonth') as string,
    endMonth: formData.get('endMonth') as string,
    monthlyDistribution,
    managerId: formData.get('managerId') as string,
  };
  data.projects.push(project);
  writeData(data);
  revalidatePath('/');
}

export async function updateProject(id: string, formData: FormData) {
  const data = readData();
  const idx = data.projects.findIndex((p) => p.id === id);
  if (idx !== -1) {
    const monthlyDistribution: Record<string, number> = {};
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('dist_')) {
        const month = key.replace('dist_', '');
        const hours = Number(value);
        if (hours > 0) monthlyDistribution[month] = hours;
      }
    }

    data.projects[idx] = {
      id,
      name: formData.get('name') as string,
      orderNo: formData.get('orderNo') as string,
      orderAmountHours: Number(formData.get('orderAmountHours')),
      startMonth: formData.get('startMonth') as string,
      endMonth: formData.get('endMonth') as string,
      monthlyDistribution,
      managerId: formData.get('managerId') as string,
    };
    writeData(data);
  }
  revalidatePath('/');
}

export async function deleteProject(id: string) {
  const data = readData();
  data.projects = data.projects.filter((p) => p.id !== id);
  data.assignments = data.assignments.filter((a) => a.projectId !== id);
  writeData(data);
  revalidatePath('/');
}
