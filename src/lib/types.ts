export type ResourceType = 'intern' | 'extern';

export interface Role {
  id: string;
  name: string;
  definition: string;
  type: ResourceType;
}

export interface Profile {
  id: string;
  name: string;
  definition: string;
}

export interface TeamMember {
  id: string;
  name: string;
  roleId: string;
  profileIds: string[];
  monthlyAvailability: number;
}

export interface Project {
  id: string;
  name: string;
  orderNo: string;
  orderAmountHours: number;
  startMonth: string;
  endMonth: string;
  monthlyDistribution: Record<string, number>;
  managerId: string;
}

export interface Assignment {
  id: string;
  projectId: string;
  memberId: string;
  plannedHours: Record<string, number>; // { "2026-01": 30, "2026-02": 60 }
  billedHours: Record<string, number>;  // { "2026-01": 10, "2026-02": 60 }
}

export interface AppData {
  roles: Role[];
  profiles: Profile[];
  teamMembers: TeamMember[];
  projects: Project[];
  assignments: Assignment[];
}
