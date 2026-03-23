'use server';

import { revalidatePath } from 'next/cache';
import { readData, writeData } from '@/lib/db';
import { generateId } from '@/lib/utils';
import { ResourceType } from '@/lib/types';

export async function createRole(formData: FormData) {
  const data = readData();
  const role = {
    id: generateId(),
    name: formData.get('name') as string,
    definition: formData.get('definition') as string,
    type: formData.get('type') as ResourceType,
  };
  data.roles.push(role);
  writeData(data);
  revalidatePath('/');
}

export async function updateRole(id: string, formData: FormData) {
  const data = readData();
  const idx = data.roles.findIndex((r) => r.id === id);
  if (idx !== -1) {
    data.roles[idx] = {
      id,
      name: formData.get('name') as string,
      definition: formData.get('definition') as string,
      type: formData.get('type') as ResourceType,
    };
    writeData(data);
  }
  revalidatePath('/');
}

export async function deleteRole(id: string) {
  const data = readData();
  data.roles = data.roles.filter((r) => r.id !== id);
  writeData(data);
  revalidatePath('/');
}
