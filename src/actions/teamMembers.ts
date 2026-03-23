'use server';

import { revalidatePath } from 'next/cache';
import { readData, writeData } from '@/lib/db';
import { generateId } from '@/lib/utils';

export async function createTeamMember(formData: FormData) {
  const data = readData();
  const profileIds = formData.getAll('profileIds') as string[];
  const member = {
    id: generateId(),
    name: formData.get('name') as string,
    roleId: formData.get('roleId') as string,
    profileIds,
    monthlyAvailability: Number(formData.get('monthlyAvailability')) || 0,
  };
  data.teamMembers.push(member);
  writeData(data);
  revalidatePath('/');
}

export async function updateTeamMember(id: string, formData: FormData) {
  const data = readData();
  const idx = data.teamMembers.findIndex((m) => m.id === id);
  if (idx !== -1) {
    const profileIds = formData.getAll('profileIds') as string[];
    data.teamMembers[idx] = {
      id,
      name: formData.get('name') as string,
      roleId: formData.get('roleId') as string,
      profileIds,
      monthlyAvailability: Number(formData.get('monthlyAvailability')) || 0,
    };
    writeData(data);
  }
  revalidatePath('/');
}

export async function deleteTeamMember(id: string) {
  const data = readData();
  data.teamMembers = data.teamMembers.filter((m) => m.id !== id);
  data.assignments = data.assignments.filter((a) => a.memberId !== id);
  writeData(data);
  revalidatePath('/');
}
