'use server';

import { revalidatePath } from 'next/cache';
import { readData, writeData } from '@/lib/db';
import { generateId } from '@/lib/utils';

export async function createProfile(formData: FormData) {
  const data = await readData();
  const profile = {
    id: generateId(),
    name: formData.get('name') as string,
    definition: formData.get('definition') as string,
  };
  data.profiles.push(profile);
  await writeData(data);
  revalidatePath('/', 'layout');
}

export async function updateProfile(id: string, formData: FormData) {
  const data = await readData();
  const idx = data.profiles.findIndex((p) => p.id === id);
  if (idx !== -1) {
    data.profiles[idx] = {
      id,
      name: formData.get('name') as string,
      definition: formData.get('definition') as string,
    };
    await writeData(data);
  }
  revalidatePath('/', 'layout');
}

export async function deleteProfile(id: string) {
  const data = await readData();
  data.profiles = data.profiles.filter((p) => p.id !== id);
  await writeData(data);
  revalidatePath('/', 'layout');
}
