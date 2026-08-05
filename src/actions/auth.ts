'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { makeSessionValue, type Role } from '@/lib/auth';

const SESSION_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 days
};

export async function login(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const password = String(formData.get('password') ?? '');

  let role: Role | null = null;
  if (password && password === process.env.VIEWER_PASSWORD) role = 'viewer';
  else if (password && password === process.env.ADMIN_PASSWORD) role = 'admin';

  if (!role) return 'Invalid password';

  const store = await cookies();
  store.set('session', await makeSessionValue(role), SESSION_OPTS);
  redirect('/');
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete('session');
  redirect('/login');
}
