'use client';

import { createContext, useContext } from 'react';
import type { Role } from '@/lib/auth';

const RoleContext = createContext<Role>('viewer');

export function RoleProvider({ role, children }: { role: Role; children: React.ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useRole(): Role {
  return useContext(RoleContext);
}
