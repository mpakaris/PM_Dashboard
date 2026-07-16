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

export interface GhostMember {
  id: string;
  name: string;
  roleId: string;
  profileIds: string[];
  monthlyAvailability: number;
}

export interface ForecastProject {
  id: string;
  name: string;
  overallHours: number;
  startMonth: string;
  endMonth: string;
}

export interface ForecastAssignment {
  id: string;
  projectId: string;
  memberId: string;
  isGhost: boolean;
  plannedHours: Record<string, number>;
}

export interface Forecast {
  id: string;
  name: string;
  createdAt: string;
  projects: ForecastProject[];
  ghostMembers: GhostMember[];
  assignments: ForecastAssignment[];
}

export interface AppData {
  roles: Role[];
  profiles: Profile[];
  teamMembers: TeamMember[];
  projects: Project[];
  assignments: Assignment[];
  forecasts: Forecast[];
}

export interface TimesheetEntry {
  project: string;
  task: string;
  month: string; // YYYY-MM
  user: string;
  spentTime: number;
  source: string; // original filename — used for merge-by-file on re-upload
}

export interface TicketRate {
  billable: boolean;
  rate: number; // €/h billed to client
}

export interface TimesheetStore {
  entries: TimesheetEntry[];
  lastUpload: string;
  sources: string[];
  baselines: Record<string, number>;        // user name → monthly hour baseline (default 160)
  billingRates: Record<string, TicketRate>; // "project:::task" → billing config
  costRates: Record<string, number>;        // user name → internal cost €/h
}

export interface ElsapRow {
  id: string; // dedup key: einkBeleg_position_datum_sapUser
  jahr: number;
  periode: number;
  datum: string;
  einkBeleg: string;
  position: string;
  posText: string;
  leistZeile: string;
  leistZText: string;
  sapUser: string;
  name: string;
  aktivitaet: string;
  stunden: number;
  sdm: string;
  sdmName: string;
  status: string;
  verrechnet: string;
}

export interface ElsapMirror {
  rows: ElsapRow[];
  lastImport: string;
  lastApply: string;
  importStats: { added: number; updated: number; skipped: number };
}
