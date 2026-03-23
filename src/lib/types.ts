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
  monthlyAvailability: number; // avg available hours per month (used as baseline)
}

export interface Project {
  id: string;
  name: string;
  orderNo: string;
  orderAmountHours: number;
  startMonth: string; // "YYYY-MM"
  endMonth: string;   // "YYYY-MM"
  monthlyDistribution: Record<string, number>; // { "2026-01": 50, ... }
  managerId: string;
}

export interface Assignment {
  id: string;
  projectId: string;
  memberId: string;
  hoursPerMonth: number; // same hours every month of the project duration
}

export interface AppData {
  roles: Role[];
  profiles: Profile[];
  teamMembers: TeamMember[];
  projects: Project[];
  assignments: Assignment[];
}
