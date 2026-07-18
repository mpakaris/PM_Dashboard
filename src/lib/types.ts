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
  roleId: string;            // ELSAP role — drives billing rates and conversion factors
  typeOverride?: ResourceType;
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
  id: string; // dedup key: einkBeleg_position_leistZeile (SAP document hierarchy)
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

export interface InvoiceRoleOverride {
  sapUser: string;
  month: string;       // "YYYY-MM"
  projectName: string;
  role: string;
}

export interface InvoiceLineMember {
  sapUser: string;
  name: string;
  hours: number;
}

export interface InvoiceLineItem {
  id: string;
  month: string;         // "YYYY-MM"
  projectName: string;
  role: string;          // effective role (after overrides)
  fakturaNumber: string;
  invoicedHours: number; // exact hours on this invoice line
  invoicedAt: string;    // ISO
  members: InvoiceLineMember[]; // which ELSAP lines were included (traceability)
}

export interface InvoicingStore {
  defaultRates: Record<string, number>;   // role → €/h
  rateOverrides: Record<string, number>;  // "month|projectName|role" → €/h
  roleOverrides: InvoiceRoleOverride[];
  invoices: InvoiceLineItem[];
}

export interface ElsapMirror {
  rows: ElsapRow[];
  lastImport: string;
  lastApply: string;
  importStats: { added: number; updated: number; skipped: number };
}

// ─── Sub Contractor types ────────────────────────────────────────────────────

export interface SubMember {
  sapUser: string;   // ELSAP sapUser — primary key for matching
  name: string;      // display name
  role: string;      // their actual role (e.g. "Spezialist")
}

export interface SubContractor {
  id: string;
  name: string;
  shortName: string;
  rates: Record<string, number>;  // role → €/h (Set 2: what they charge us)
  members: SubMember[];
}

export interface SubInvoiceLine {
  id: string;
  sapUser: string;
  elsapEntryKeys: string[];  // "project|role" keys selected from ELSAP
  applyFactor: boolean;
}

export interface SubInvoice {
  id: string;
  subContractorId: string;
  month: string;         // "YYYY-MM"
  label: string;         // auto-generated: "Ref 1", "Ref 2", …
  createdAt: string;     // ISO
  lines: SubInvoiceLine[];
}

export interface SubContractorStore {
  subContractors: SubContractor[];
  invoices: SubInvoice[];
}
