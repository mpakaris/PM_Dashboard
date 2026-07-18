'use server';

import { revalidatePath } from 'next/cache';
import { readData, writeData } from '@/lib/db';
import { generateId } from '@/lib/utils';

export async function createTeamMember(formData: FormData) {
  const data = await readData();
  const profileIds = formData.getAll('profileIds') as string[];
  const typeOverride = formData.get('typeOverride') as string | null;
  const member = {
    id: generateId(),
    name: formData.get('name') as string,
    roleId: formData.get('roleId') as string,
    ...(typeOverride ? { typeOverride: typeOverride as 'intern' | 'extern' } : {}),
    profileIds,
    monthlyAvailability: Number(formData.get('monthlyAvailability')) || 0,
  };
  data.teamMembers.push(member);
  await writeData(data);
  revalidatePath('/', 'layout');
}

export async function updateTeamMember(id: string, formData: FormData) {
  const data = await readData();
  const idx = data.teamMembers.findIndex((m) => m.id === id);
  if (idx !== -1) {
    const profileIds = formData.getAll('profileIds') as string[];
    const typeOverride = formData.get('typeOverride') as string | null;
    data.teamMembers[idx] = {
      id,
      name: formData.get('name') as string,
      roleId: formData.get('roleId') as string,
      ...(typeOverride ? { typeOverride: typeOverride as 'intern' | 'extern' } : {}),
      profileIds,
      monthlyAvailability: Number(formData.get('monthlyAvailability')) || 0,
    };
    await writeData(data);
  }
  revalidatePath('/', 'layout');
}

export async function deleteTeamMember(id: string) {
  const data = await readData();
  data.teamMembers = data.teamMembers.filter((m) => m.id !== id);
  data.assignments = data.assignments.filter((a) => a.memberId !== id);
  await writeData(data);
  revalidatePath('/', 'layout');
}
