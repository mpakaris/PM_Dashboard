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
  operationContracts?: OperationContract[];
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
  poNumber: string;      // ELSAP einkBeleg (PO number); '' for legacy lines
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

// ─── Projekt Analysis ─────────────────────────────────────────────────────────

export interface OperationContract {
  id: string;
  name: string;
  defaultMonthlyAmount: number;             // € per month (baseline)
  monthlyOverrides: Record<string, number>; // "YYYY-MM" → € override
  ticketIds: string[];                      // task strings assigned to this contract
}

export interface ProjektAnalysisEntry {
  task: string;
  month: string;     // "YYYY-MM"
  user: string;
  activity: string;  // "Work" | "Operations"
  spentTime: number;
}

export interface ProjektAnalysisMemberSettings {
  user: string;
  costRate: number;    // €/h internal cost
  billingRate: number; // €/h billed to client
}

export interface ProjektAnalysisTicketForecast {
  task: string;
  expectedHours: number;
  billable: boolean;
  rate: number; // €/h billing rate
  planPerYear?: Record<string, number>; // year (e.g. "2025") → planned hours
}

export interface ProjektAnalysisForecast {
  monthsRemaining: number;
  totalExpectedHours: number;
  tickets: ProjektAnalysisTicketForecast[];
}

export type ProjektAnalysisType = 'time-and-material' | 'festpreis';

export interface ProjektAnalysisChange {
  id: string;
  description: string;
  value: number; // additional € (Nachtrag)
}

export interface ProjektAnalysisProject {
  id: string;
  name: string;           // derived from filename, e.g. "Barmer"
  createdAt: string;
  uploadedAt: string;
  projectType: ProjektAnalysisType;
  contractHours: number;  // Festpreis: calculated hours (basis for price)
  contractValue: number;  // Festpreis: base contract value €
  changes: ProjektAnalysisChange[];  // Nachträge — increases to contract value
  members: string[];      // explicit member list — persists even when entries are empty
  linkedForecastId?: string; // optional link to a Forecast scenario (/planning/[id]) for overlay
  operationContracts?: OperationContract[];
  entries: ProjektAnalysisEntry[];
  memberSettings: ProjektAnalysisMemberSettings[];
  forecast: ProjektAnalysisForecast;
}

// ─── FMO Types ────────────────────────────────────────────────────────────────

export type SyncSource = 'manual' | 'excel' | 'sectrack' | 'sap';

/**
 * Type 1 — Billing Class.
 * Always derived from the WBS code prefix. Never overridable — it is contractual.
 *   'V' → Billable (Verrechenbar)
 *   'I' → Internal (Intern)
 * Additional prefix letters can be registered in FmoMappingStore.billingClasses
 * when new WBS types appear without touching the parser.
 */
export type WbsBillingClass = string; // 'V' | 'I' | future letters

/**
 * Type 2 — Sub-Category.
 * Only applies to Internal ('I.*') WBS entries; Billable entries need no sub-type.
 * Pre-seeded from the IWBS table; admins can add new values in the WBS admin view.
 */
export interface WbsSubCategory {
  id: string;     // stable slug, e.g. 'admin' | 'training' | 'presales'
  label: string;  // display name, e.g. 'Administration' | 'Training' | 'Presales'
}

export interface FmoWbsEntry {
  code: string;
  label: string;
  billingClass: WbsBillingClass;
  subCategory?: string;
  subCategoryOverride?: string;
  budgetHours?: number;
  budgetValue?: number;
  syncSource: SyncSource;
  syncedAt?: string;
}

export interface FmoTicket {
  id: number;
  name: string;
  project: string;
  wbsCode: string | null;
  billingClass: WbsBillingClass | null;
  subCategory: string | null;
  syncSource: SyncSource;
  syncedAt?: string;
}

export interface FmoMember {
  id: string;
  name: string;
  type: 'intern' | 'extern';
  partnerCompany: string;
  costRate: number; // €/h
}

export interface FmoEntry {
  id: string;         // dedup key: `${date}|${user}|${ticketId ?? ticketName}|${activity}|${spentTime}`
  date: string;       // "YYYY-MM-DD"
  month: string;      // "YYYY-MM"
  project: string;
  ticketId: number | null;
  ticketName: string;
  user: string;
  activity: string;   // "Work" | "Operations"
  comment: string;
  spentTime: number;
  source: string;     // original filename
  wbsCode: string | null;
  billingClass: WbsBillingClass | null;
  subCategory: string | null;
  billingType: 'fixprice' | '';
  customer: string;
}

export interface FmoImportStats {
  added: number;
  duplicates: number;
  updated: number;
  newTickets: number;
  newMembers: number;
  unmapped: number;
}

export interface FmoStore {
  entries: FmoEntry[];
  lastUpload: string;
  sources: string[];
  importStats: FmoImportStats;
}

export interface FmoMappingStore {
  wbs: Record<string, FmoWbsEntry>;
  tickets: Record<string, FmoTicket>;
  members: Record<string, FmoMember>;
  billingClasses: Record<string, string>;         // prefix → label, e.g. { 'V': 'Billable', 'I': 'Internal' }
  subCategories: Record<string, WbsSubCategory>;  // keyed by slug
}

// ─── FMO Projects ─────────────────────────────────────────────────────────────

export interface FmoProject {
  id: string;
  name: string;
  description?: string;
  wbsCodes: string[];          // WBS codes — all their tickets are included
  ticketIds: number[];         // extra tickets added individually (mixed / tickets mode)
  excludedTicketIds: number[]; // tickets excluded from a selected WBS code
  createdAt: string;
}

// ─── FMO Planning ─────────────────────────────────────────────────────────────

export interface FmoForecast {
  id: string;
  name: string;
  startMonth: string;   // "YYYY-MM"
  endMonth: string;
  createdAt: string;
  projects: FmoForecastProject[];
}

export interface FmoForecastProject {
  projectId: string;
  overallHours: number;
  assignments: FmoForecastAssignment[];
}

export interface FmoForecastAssignment {
  memberId: string;
  plannedHours: Record<string, number>;  // "YYYY-MM" → hours
}
