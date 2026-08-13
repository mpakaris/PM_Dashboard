# FMO — SecTrack Timesheet & Utilization Module
## Implementation Plan (Cache-Clear Safe)

---

## 0. BEFORE WRITING ANY CODE

Read the Next.js version-specific guide first:
```
node_modules/next/dist/docs/
```
This is Next.js **16.2.1** with React 19. APIs may differ from training data.
Check `src/app/elsap/ElsapClient.tsx` and `src/actions/elsap.ts` as the canonical pattern reference.

---

## 1. PROTECTED AREAS — ZERO CHANGES, EVER

These files and Redis keys must never be touched:

**Files:**
- `src/app/elsap/` (entire folder)
- `src/app/invoicing/` (entire folder)
- `src/app/subinvoices/` (entire folder)
- `src/actions/elsap.ts`
- `src/actions/invoicing.ts`
- `src/actions/subcontractors.ts`

**Existing Redis keys** (never read or write from FMO code):
- `app:db` · `app:elsap` · `app:invoicing` · `app:subcontractors`
- `app:timesheets` · `app:projekt-analysis`

**Why:** Invoicing Client + Invoicing Subs extract team members from ELSAP data.
Breaking that pipeline destroys billing. FMO members are a separate pool entirely.

---

## 2. PROJECT CONTEXT

**Goal:** Replace `src/ressources/Therese_Board.xlsx` with a software module.
The Excel has these relevant tabs:
- **Spent Time** — 7,293 rows of manually pasted SecTrack bookings (Jan–Jun 2026)
- **Mapping** — 3 lookup tables: Employee→type, IWBS→category, WBS→category
- **Auslastung h / Auslastung %** — Pivot tables built from Spent Time

**SecTrack CSV format — two variants (both must parse):**

**Extended format** (current — use this when exporting from SecTrack):
```
Project, Task, Date, User, Activity, Comment, Spent time, WBS-Override, Billing Type, Customer, Task ID (Tasks)
```

**Legacy format** (7 columns — old exports, still valid):
```
Project, Task, Date, User, Activity, Comment, Spent time
```

Column details:
- `Date`: `DD/MM/YYYY` (e.g. `14/08/2026`)
- `Task`: `#XXXXX - description` (e.g. `#40116 - Barmer IAM Betrieb…`)
- `Activity`: `Work` | `Operations`
- `Spent time`: float string (`"1.00"`, `"0.25"`)
- `WBS-Override`: WBS code per entry (e.g. `V.05921700.81.01`, `I.05921059.00.01`);
  empty string if absent — **this eliminates the need for a separate ticket→WBS mapping
  step for any CSV exported with this extended format**
- `Billing Type`: `""` (T&M) or `"Fixprice"` (fixed-price / Operations contract);
  **this is a direct signal from SecTrack identifying which entries belong to
  Operations Contracts — no manual assignment needed for correctly exported CSVs**
- `Customer`: client name (e.g. `- Barmer (DTSEC)`, `- INTERN`)
- `Task ID (Tasks)`: numeric ticket ID (e.g. `40116`) — prefer this over regex
  extraction from the Task string when the column is present

**Parser rule:** detect format by checking whether column `WBS-Override` is present
in the header (case-insensitive). Parse accordingly. Never hardcode column positions.

**Therese_Board.xlsx** (`src/ressources/Therese_Board.xlsx`) is now used only for:
- `Mapping` tab → seeds Employee types and IWBS/WBS classification tables (labels)
- `Spent Time` tab → seeds WBS _labels_ for codes and historical entries that were
  exported in the old 7-column format without WBS

The ticket→WBS mapping for new CSV uploads is now carried directly in each row.

**Scale:** ~3,000 rows per monthly SecTrack CSV upload.

---

## 3. CURRENT IMPLEMENTATION STATUS

Read this before writing a single line of code.

### What already exists and must not be re-implemented

The following modules are **complete and working** in the current codebase.
Do not rewrite them. Only modify them where a US explicitly instructs you to.

| Module | Location | Status |
|---|---|---|
| Project Analysis | `src/app/projekt-analysis/` | ✅ Complete |
| Forecast / Planning | `src/app/planning/` | ✅ Complete |
| Team Members | `src/app/team/` | ✅ Complete |
| Roles | `src/app/roles/` | ✅ Complete |
| Profiles | `src/app/profiles/` | ✅ Complete |
| Projects | `src/app/projects/` | ✅ Complete |
| Assignments | `src/app/assignments/` | ✅ Complete |
| Overview | `src/app/overview/` | ✅ Complete |
| Timesheets | `src/app/timesheets/` | ✅ Complete |
| ELSAP, Invoicing, Subinvoices | `src/app/elsap/`, `src/app/invoicing/`, `src/app/subinvoices/` | ✅ Complete — **PROTECTED, never touch** |

### What is partially done and needs clean-up

The **Operations feature (US-016 to US-019)** is already implemented in the codebase,
but does NOT yet match the clean architecture prescribed in those stories.
Specifically:

- `opAmount` and `opAmountFc` are duplicate functions — consolidate into `src/lib/operationsUtils.ts`
- `OperationContractModal` and `ForecastOpContractModal` are near-identical — merge into `src/components/OperationContractModal.tsx`
- `OperationsTab` lives inside `ProjektAnalysisDetailClient.tsx` — extract to `src/app/projekt-analysis/[id]/OperationsTab.tsx`
- `ProjectOperationsSection` lives inside `ForecastClient.tsx` — extract to `src/app/planning/[id]/ProjectOperationsSection.tsx`
- `fmtEur` / `fmtH` are duplicated across chart and client files — these will be unified when US-024 (i18n) introduces locale-aware formatting

**Do not re-implement Operations from scratch. Refactor the existing code to match the US-016–019 specs.**

### What does not exist yet — must be built

| Module | Status |
|---|---|
| FMO (`/fmo/*`) | ❌ Not started — build from US-001 |
| `src/lib/operationsUtils.ts` | ❌ Not started — build in US-016 refactor |
| `src/components/OperationContractModal.tsx` | ❌ Not started — build in US-016 refactor |
| `src/app/projekt-analysis/[id]/OperationsTab.tsx` | ❌ Not started — extract in US-017 refactor |
| `src/app/planning/[id]/ProjectOperationsSection.tsx` | ❌ Not started — extract in US-019 refactor |
| `src/lib/wbsDataSource.ts` | ❌ Not started — build in US-020 |
| `src/lib/i18n.ts` + `messages/` | ❌ Not started — build in US-024 |
| `src/lib/chartRegistry.ts` | ❌ Not started — build in US-025 |

### Dependency exception for i18n

Section 3 says "no new dependencies." This rule is **relaxed for US-024 only**.
`next-intl` may be installed for the internationalisation story. No other new
packages are permitted without explicit discussion.

---

## 4. TECH STACK (no new dependencies — except `next-intl` for US-024, see Section 3)

- **Framework:** Next.js 16.2.1, React 19, TypeScript
- **Storage:** Upstash Redis via `@upstash/redis` (existing `src/lib/db.ts` pattern)
- **CSV/Excel parsing:** `xlsx` package (already in `package.json`)
- **Styling:** Tailwind CSS v4
- **Charts:** `recharts` (already in `package.json`)
- **Pattern:** Server Components fetch data → pass to `'use client'` components.
  Server actions in `src/actions/` use `'use server'`.

---

## 5. DATA MODEL

### 4a. WBS Hierarchy design

The domain has three levels. Every layer is explicitly typed; none bleeds into another:

```
WBS Element  (cost centre / Kostenstelle)
  └── Ticket  (SecTrack task — one ticket belongs to exactly one WBS)
        └── Time Entry  (one row per person/day booking)
```

**WBS → Ticket relationship** is one-to-many and stored on the ticket (`wbsCode`).
The reverse lookup (all tickets for a WBS) is derived at read time — never stored
redundantly. This keeps the single source of truth on the ticket.

**Data source provenance** is tracked on both WBS and Ticket via a `syncSource` field.
This makes it possible to mix manually entered records with auto-synced ones and
know which came from where — essential when the remote API is added later.

### 4b. Data Source Abstraction

The app will have multiple data sources over time:

| Source | When | canAutoSync |
|---|---|---|
| `excel` | Now — upload Therese_Board.xlsx | `false` |
| `sectrack` | Future — SecTrack REST API | `true` |
| `sap` | Future — SAP RFC / OData | `true` |

All data loading goes through a single interface (`WbsDataSource`) defined in
`src/lib/wbsDataSource.ts`. The import actions call the interface, never the
implementation directly. Swapping in a live API requires only adding a new class that
implements the interface — zero changes to actions or UI.

Add to **`src/lib/types.ts`** (append only — never modify existing types):

```typescript
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
  code: string;              // e.g. "I.05921059.00.01" or "V.05921700.81.03"
  label: string;             // human name, e.g. "IAM Administration"
  billingClass: WbsBillingClass;     // Type 1 — auto-derived from code[0]; never admin-set
  subCategory?: string;              // Type 2 — slug from WbsSubCategory; null for V.* entries
  subCategoryOverride?: string;      // admin-set Type 2 override (beats auto-derive)
  // Hierarchy & extensibility
  budgetHours?: number;      // planned hours for this cost centre (future: from SAP)
  budgetValue?: number;      // planned € value (future: from SAP)
  syncSource: SyncSource;    // provenance — where this record came from
  syncedAt?: string;         // ISO timestamp of last remote sync (undefined = never synced)
}

export interface FmoTicket {
  id: number;                   // e.g. 34977
  name: string;                 // e.g. "BARMER (DTSEC) SAP IDM Migration 2025/2026 - DevOps"
  project: string;              // SecTrack project name
  wbsCode: string | null;       // parent WBS (null = unassigned); one ticket → one WBS
  billingClass: WbsBillingClass | null; // Type 1 — derived from wbsCode[0]; null if unassigned
  subCategory: string | null;   // Type 2 slug — null for V.* or unassigned
  // Extensibility
  syncSource: SyncSource;
  syncedAt?: string;
}

export interface FmoMember {
  id: string;            // slugified name, e.g. "thomas-koch"
  name: string;          // full name as it appears in SecTrack CSV User column
  type: 'intern' | 'extern';
  partnerCompany: string; // "" for intern; company name for extern
  costRate: number;       // €/h — what we pay this person
}

export interface FmoEntry {
  id: string;            // dedup key (see below)
  date: string;          // "YYYY-MM-DD"
  month: string;         // "YYYY-MM"
  project: string;
  ticketId: number | null;
  ticketName: string;
  user: string;
  activity: string;      // "Work" | "Operations"
  comment: string;
  spentTime: number;
  source: string;        // original filename
  wbsCode: string | null;            // from WBS-Override column (extended) or ticket mapping (legacy)
  billingClass: WbsBillingClass | null; // Type 1 — deriveBillingClass(wbsCode); null if no WBS
  subCategory: string | null;        // Type 2 slug — deriveSubCategory(wbsCode); null for V.* or no WBS
  billingType: 'fixprice' | '';  // from Billing Type column; '' for T&M / legacy rows
  customer: string;          // from Customer column; '' for legacy rows
}

// Dedup key formula (unchanged — wbsCode/billingType are attributes, not identifiers):
// `${date}|${user}|${ticketId ?? ticketName}|${activity}|${spentTime}`
// Re-uploading a corrected CSV with a different WBS for the same entry updates
// the entry's wbsCode in-place rather than creating a duplicate.

export interface FmoImportStats {
  added: number;
  duplicates: number;     // entries skipped (same dedup key already stored)
  updated: number;        // entries whose wbsCode/billingType changed on re-upload
  newTickets: number;     // tickets not previously seen
  newMembers: number;     // members not previously seen
  unmapped: number;       // entries where wbsCode is null after import
                          // (should be 0 for extended-format CSVs)
}

export interface FmoStore {
  entries: FmoEntry[];
  lastUpload: string;    // ISO timestamp
  sources: string[];     // filenames uploaded so far
  importStats: FmoImportStats;
}

export interface FmoMappingStore {
  wbs: Record<string, FmoWbsEntry>;                  // keyed by WBS code
  tickets: Record<string, FmoTicket>;                // keyed by ticket ID string
  members: Record<string, FmoMember>;                // keyed by member.id (slugified name)
  billingClasses: Record<string, string>;            // prefix → label; e.g. { 'V': 'Billable', 'I': 'Internal' }
  subCategories: Record<string, WbsSubCategory>;     // keyed by slug; admin-managed Type 2 values
}

// Pre-seeded billingClasses (set once at initFmoWbsIfEmpty):
// { 'V': 'Billable', 'I': 'Internal' }

// Pre-seeded subCategories (set once at initFmoWbsIfEmpty; applies to I.* only):
// { 'admin': 'Administration', 'training': 'Training', 'presales': 'Presales',
//   'portfolio': 'Portfolioentwicklung', 'opm': 'OPM', 'absence': 'Absence' }
```

---

## 6. CLASSIFICATION LOGIC

Create **`src/lib/fmoClassify.ts`** (new file, pure functions — no DB, no side effects):

```typescript
import { FmoWbsEntry, WbsBillingClass } from './types';

/**
 * Type 1 — Billing Class.
 * Derived entirely from the first character of the WBS code.
 * Never fails: unknown prefixes return the raw character so new types surface visibly.
 */
export function deriveBillingClass(code: string): WbsBillingClass {
  return code[0] ?? 'unknown';
}

/**
 * Type 2 — Sub-Category slug.
 * Only meaningful for Internal ('I.*') entries.
 * V.* entries return null — "Billable" is their complete classification.
 * Admin override (subCategoryOverride) takes priority over auto-derive.
 */
export function deriveSubCategory(
  code: string,
  wbsTable: Record<string, FmoWbsEntry>
): string | null {
  if (!code) return null;

  // V.* — no sub-category
  if (code.startsWith('V.')) return null;

  // Admin override
  const override = wbsTable[code]?.subCategoryOverride;
  if (override) return override;

  // IWBS auto-derive: characters 6–10 (Excel MID(WBS,7,4))
  const iwbs = code.slice(6, 10);
  const iwbsMap: Record<string, string> = {
    '1059': 'admin',
    '8000': 'admin',
    '1099': 'presales',
    '1069': 'portfolio',
    '1076': 'opm',
    '1066': 'opm',
    '1055': 'opm',
    '1056': 'opm',
  };
  if (iwbsMap[iwbs]) return iwbsMap[iwbs];

  // Full-code fallback for specific internal entries
  const fullMap: Record<string, string> = {
    'I.05921059.00.01': 'admin',
    'I.05921059.00.02': 'training',
    'I.05921059.00.03': 'absence',
  };
  return fullMap[code] ?? null; // null = Unmapped sub-category
}

/** Convenience: classify a code and return both types at once. */
export function classifyWbs(
  code: string,
  wbsTable: Record<string, FmoWbsEntry>
): { billingClass: WbsBillingClass; subCategory: string | null } {
  return {
    billingClass: deriveBillingClass(code),
    subCategory: deriveSubCategory(code, wbsTable),
  };
}

// Slugify a name to use as a stable member ID
export function slugifyName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Extract ticket ID from SecTrack Task string: "#34977 - description" → 34977
export function extractTicketId(task: string): number | null {
  const m = task.match(/^#(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// Extract ticket name: "#34977 - BARMER..." → "BARMER..."
export function extractTicketName(task: string): string {
  const m = task.match(/^#\d+\s*-\s*(.+)$/);
  return m ? m[1].trim() : task;
}

// Parse SecTrack date "DD/MM/YYYY" → "YYYY-MM-DD"
export function parseSecTrackDate(raw: string): string {
  const [d, m, y] = raw.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// All 20 WBS codes from Therese_Board.xlsx Spent Time tab with their labels.
// Used as seed data on first run.
export function seedWbsEntries(): FmoWbsEntry[] {
  const entries: Array<[string, string]> = [
    ['I.05921011.00.01', 'Schaffrath Cisco DUO'],
    ['I.05921055.00.01', 'GRC Cloud OPM'],
    ['I.05921059.00.01', 'IAM Administration'],
    ['I.05921059.00.02', 'IAM Training'],
    ['I.05921059.00.03', 'IAM Absence'],
    ['I.05921066.00.01', 'Andrea Administrative Tasks'],
    ['I.05921069.00.04', 'Hitguard Portfolioentwicklung'],
    ['I.05921069.00.05', 'IAM Portfolioentwicklung'],
    ['I.05921069.00.07', 'Hitguard SASE'],
    ['I.05921076.00.06', 'KRL Patch Management OPM'],
    ['I.05921099.00.01', 'Presales AT'],
    ['I.05921099.00.02', 'Presales DE'],
    ['I.05921099.00.03', 'Presales CH'],
    ['V.00300592.01.01', 'Corporate Volunteering'],
    ['V.05920030.64.81', 'TSA - UNIQA - IAM'],
    ['V.05920030.64.81.01', 'UNIQA PAM Deployment'],
    ['V.05920030.80.01.44', 'Donauwalzer ODC Migration'],
    ['V.05920030.98.81.01', 'TSA - IAM Projekte Union IT'],
    ['V.05921470.81.01', 'MA01 Wien Digital IDM.ONe'],
    ['V.05921470.81.05', 'MA01 Wien Digital SUN.idm'],
    ['V.05921700.81.01', 'DTSec Barmer IAM Betrieb'],
    ['V.05921700.81.03', 'DTSec Barmer IAM Entwicklung'],
  ];
  return entries.map(([code, label]) => ({
    code,
    label,
    category: classifyWbs(code, {}),
  }));
}
```

---

## 7. DATABASE LAYER

Append to **`src/lib/db.ts`** (append only — never modify existing functions):

```typescript
// ─── FMO ─────────────────────────────────────────────────────────────────────

const FMO_STORE_KEY    = 'app:fmo:store';
const FMO_MAPPING_KEY  = 'app:fmo:mappings';

const EMPTY_FMO_STORE: FmoStore = {
  entries: [],
  lastUpload: '',
  sources: [],
  importStats: { added: 0, duplicates: 0, newTickets: 0, newMembers: 0, unmapped: 0 },
};

const EMPTY_FMO_MAPPINGS: FmoMappingStore = {
  wbs: {},
  tickets: {},
  members: {},
};

export async function readFmoStore(): Promise<FmoStore> {
  const raw = await withRetry(() => redis.get<any>(FMO_STORE_KEY));
  if (!raw) return { ...EMPTY_FMO_STORE };
  return {
    entries: raw.entries ?? [],
    lastUpload: raw.lastUpload ?? '',
    sources: raw.sources ?? [],
    importStats: raw.importStats ?? { added: 0, duplicates: 0, newTickets: 0, newMembers: 0, unmapped: 0 },
  };
}

export async function writeFmoStore(store: FmoStore): Promise<void> {
  await withRetry(() => redis.set(FMO_STORE_KEY, store));
}

export async function readFmoMappings(): Promise<FmoMappingStore> {
  const raw = await withRetry(() => redis.get<any>(FMO_MAPPING_KEY));
  if (!raw) return { ...EMPTY_FMO_MAPPINGS };
  return {
    wbs: raw.wbs ?? {},
    tickets: raw.tickets ?? {},
    members: raw.members ?? {},
  };
}

export async function writeFmoMappings(mappings: FmoMappingStore): Promise<void> {
  await withRetry(() => redis.set(FMO_MAPPING_KEY, mappings));
}
```

Import the new FMO types at the top of db.ts (in the existing import line):
```typescript
import { ..., FmoStore, FmoMappingStore } from './types';
```

---

## 8. USER STORIES

---

### US-001 · Foundation — Types, DB layer, Classification

**Story:** As a developer, I need the foundational data types, database functions, and
classification logic in place so all subsequent stories can build on a stable base.

**Dependencies:** None (first story to implement)

**Acceptance Criteria:**
- [ ] `FmoWbsEntry`, `FmoTicket`, `FmoMember`, `FmoEntry`, `FmoImportStats`,
      `FmoStore`, `FmoMappingStore` types exist in `src/lib/types.ts`
- [ ] `readFmoStore`, `writeFmoStore`, `readFmoMappings`, `writeFmoMappings`
      functions exist in `src/lib/db.ts` (appended at bottom)
- [ ] `src/lib/fmoClassify.ts` exists with `classifyWbs`, `slugifyName`,
      `extractTicketId`, `extractTicketName`, `parseSecTrackDate`, `seedWbsEntries`
- [ ] Running `readFmoStore()` on a fresh Redis returns `EMPTY_FMO_STORE`
- [ ] `classifyWbs('V.05921700.81.03', {})` returns `'Verrechenbar'`
- [ ] `classifyWbs('I.05921059.00.01', {})` returns `'Intern/Admin'`
- [ ] `classifyWbs('I.05921099.00.01', {})` returns `'Presales'`
- [ ] `classifyWbs('I.05921011.00.01', {})` returns `'Unmapped'`
- [ ] `parseSecTrackDate('31/07/2026')` returns `'2026-07-31'`
- [ ] `extractTicketId('#34977 - BARMER...')` returns `34977`

**Files to create:**
- `src/lib/fmoClassify.ts` — full content in Section 5 above

**Files to modify (append only):**
- `src/lib/types.ts` — append FMO Types block from Section 4
- `src/lib/db.ts` — append FMO database block from Section 6; add FMO types to import

**No UI in this story.**

---

### US-002 · Sidebar — FMO Navigation

**Story:** As a user, I want a new FMO section in the sidebar so I can navigate to all
FMO pages.

**Dependencies:** US-001

**Acceptance Criteria:**
- [ ] New "FMO" section appears in sidebar **below** the existing sections (temporary
      position — will be reorganised later when old modules are cleaned out)
- [ ] Section contains 5 links: Import, WBS Codes, Tickets, Members, Utilization
- [ ] Active link highlights correctly based on current path
- [ ] Existing sidebar items and sections are completely unchanged

**Files to modify (append only — add new section object to `sections` array):**
- `src/components/Sidebar.tsx`

Add this object to the `sections` array (at the end):
```typescript
{
  label: 'FMO',
  items: [
    { label: 'Import',      href: '/fmo/import' },
    { label: 'WBS Codes',   href: '/fmo/wbs' },
    { label: 'Tickets',     href: '/fmo/tickets' },
    { label: 'Members',     href: '/fmo/members' },
    { label: 'Utilization', href: '/fmo/utilization' },
  ],
},
```

**No new files needed.**

---

### US-003 · WBS — Seed and List WBS Codes

**Story:** As an admin, I want to see a list of all known WBS codes with both their
Billing Class (Type 1) and Sub-Category (Type 2) so I understand exactly how time
entries are classified at each level.

**Dependencies:** US-001, US-002

**Acceptance Criteria:**
- [ ] `/fmo/wbs` page loads and shows a table of WBS entries
- [ ] On first visit (empty Redis), `initFmoWbsIfEmpty()` seeds:
  - 22 WBS entries (from `seedWbsEntries()`)
  - `billingClasses`: `{ 'V': 'Billable', 'I': 'Internal' }` (pre-typed)
  - `subCategories`: pre-seeded slugs (admin, training, presales, portfolio, opm, absence)
- [ ] Table columns: WBS Code | Label | **Type 1 (Billing Class)** | **Type 2 (Sub-Category)** | Actions
- [ ] Type 1 badge colour-coding (derived from prefix, read-only):
  - `V` → green "Billable"
  - `I` → slate "Internal"
  - Unknown → rose "Unknown"
- [ ] Type 2 badge colour-coding (only shown for I.* entries):
  - admin → slate, training → yellow, presales → blue, portfolio → purple,
    opm → orange, absence → red, null → rose "Unmapped"
- [ ] V.* rows show no Type 2 badge — a dash indicates no sub-classification applies
- [ ] "Unmapped" Type 2 rows (I.* entries where `deriveSubCategory` returns null)
      are highlighted with a warning badge

**Files to create:**
- `src/app/fmo/wbs/page.tsx` — server component, reads mappings, calls seed if empty
- `src/app/fmo/wbs/WbsClient.tsx` — `'use client'` table component
- `src/actions/fmo.ts` — server actions file (shared for all FMO actions, start here)

**`src/actions/fmo.ts` — first actions to add:**
```typescript
'use server';
import { revalidatePath } from 'next/cache';
import { readFmoMappings, writeFmoMappings } from '@/lib/db';
import { seedWbsEntries, classifyWbs } from '@/lib/fmoClassify';

export async function initFmoWbsIfEmpty() {
  const mappings = await readFmoMappings();
  if (Object.keys(mappings.wbs).length > 0) return;
  const seeds = seedWbsEntries();
  for (const entry of seeds) mappings.wbs[entry.code] = entry;
  await writeFmoMappings(mappings);
}

export async function getFmoMappings() {
  return readFmoMappings();
}
```

**`src/app/fmo/wbs/page.tsx`:**
```typescript
import { initFmoWbsIfEmpty, getFmoMappings } from '@/actions/fmo';
import WbsClient from './WbsClient';

export default async function WbsPage() {
  await initFmoWbsIfEmpty();
  const mappings = await getFmoMappings();
  return <WbsClient wbsEntries={Object.values(mappings.wbs)} />;
}
```

---

### US-004 · WBS — Add / Edit / Delete WBS Entry + Manage Sub-Categories

**Story:** As an admin, I want to add new WBS codes, edit their labels, override their
Type 2 sub-category, and manage the list of available sub-categories so the
classification table stays current as the business evolves.

**Dependencies:** US-003

**Acceptance Criteria — WBS entry CRUD**
- [ ] "Add WBS" button opens an inline form at the top of the table
- [ ] Form fields: WBS Code (text), Label (text)
- [ ] Type 1 (Billing Class) is shown read-only — auto-derived from code prefix,
      never admin-editable (it is contractual, not configurable)
- [ ] Type 2 (Sub-Category) is shown for I.* entries only:
  - Auto-derived value displayed as default
  - Admin can override via a dropdown populated from `FmoMappingStore.subCategories`
  - "— auto —" option resets to auto-derive (clears `subCategoryOverride`)
  - V.* entries show "—" and no dropdown (not applicable)
- [ ] Saving an empty or duplicate WBS code shows an inline error, no crash
- [ ] Each row has an "Edit" button — makes Label and Type 2 override editable inline
- [ ] Each row has a "Delete" button with `window.confirm()` confirmation
- [ ] After any change, page re-fetches and shows updated data

**Acceptance Criteria — Sub-Category management panel**
- [ ] A collapsible "Sub-Categories" panel on the `/fmo/wbs` page (below the WBS table)
- [ ] Lists all entries in `FmoMappingStore.subCategories` with their slug and label
- [ ] Admin can add a new sub-category: slug (auto-generated from label, editable),
      label (display name)
- [ ] Admin can rename the label of an existing sub-category (slug is immutable once
      created — it is used as a foreign key in WBS entries)
- [ ] Admin cannot delete a sub-category that is referenced by any WBS entry
      (show count of references; grey out delete button)
- [ ] New sub-categories are immediately available in the Type 2 dropdown

**New server actions to add to `src/actions/fmo.ts`:**
```typescript
export async function addFmoSubCategory(slug: string, label: string)
export async function updateFmoSubCategoryLabel(slug: string, label: string)
export async function deleteFmoSubCategory(slug: string)
export async function setWbsSubCategoryOverride(code: string, override: string | null)
```

**New actions to add to `src/actions/fmo.ts`:**
```typescript
export async function addFmoWbs(code: string, label: string) {
  if (!code.trim()) return { ok: false, error: 'WBS code required' };
  const mappings = await readFmoMappings();
  if (mappings.wbs[code]) return { ok: false, error: 'WBS code already exists' };
  mappings.wbs[code] = { code, label, category: classifyWbs(code, mappings.wbs) };
  await writeFmoMappings(mappings);
  revalidatePath('/fmo/wbs');
  return { ok: true };
}

export async function updateFmoWbs(code: string, label: string) {
  const mappings = await readFmoMappings();
  if (!mappings.wbs[code]) return { ok: false, error: 'Not found' };
  mappings.wbs[code].label = label;
  await writeFmoMappings(mappings);
  revalidatePath('/fmo/wbs');
  return { ok: true };
}

export async function deleteFmoWbs(code: string) {
  const mappings = await readFmoMappings();
  delete mappings.wbs[code];
  await writeFmoMappings(mappings);
  revalidatePath('/fmo/wbs');
  return { ok: true };
}
```

---

### US-005 · Import — Upload SecTrack CSV

**Story:** As an admin, I want to upload one or more SecTrack CSV files so that time
entries are parsed, WBS-classified, and stored — with full support for both the legacy
7-column format and the extended 11-column format that includes WBS and billing type.

**Dependencies:** US-001, US-003

**Acceptance Criteria — Format detection**
- [ ] Parser detects format by checking for `WBS-Override` in the header
      (case-insensitive, space-normalised). Never hardcode column positions.
- [ ] Both formats are accepted in the same upload batch (mixed files are fine)
- [ ] Required columns (both formats): `Project`, `Task`, `Date`, `User`,
      `Activity`, `Spent time` — missing any → error per file, skip that file

**Acceptance Criteria — Parsing**
- [ ] `Date`: `DD/MM/YYYY` → `YYYY-MM-DD`; `month` = `YYYY-MM`
- [ ] `Task ID`: prefer the `Task ID (Tasks)` column when present; fall back to
      regex `^#(\d+)` on the `Task` string
- [ ] `Ticket name`: extracted via regex `^#\d+\s*-\s*(.+)` from `Task` string
- [ ] Extended format only — `WBS-Override` → `wbsCode`; `Billing Type` →
      `billingType` (`'fixprice'` if value is `"Fixprice"` case-insensitively, else `''`);
      `Customer` → `customer`
- [ ] Legacy format — `wbsCode` = `null`, `billingType` = `''`, `customer` = `''`

**Acceptance Criteria — WBS classification at import time**
- [ ] **Extended format**: `category` = `classifyWbs(wbsCode, mappings.wbs)` applied
      immediately per row — no post-import reclassification step needed
- [ ] **Legacy format**: `category` derived from the ticket's stored `wbsCode` in
      `FmoMappingStore.tickets` (fallback to `null` if unassigned)
- [ ] WBS codes from the extended format are upserted into `FmoMappingStore.tickets`
      (ticket gets `wbsCode` set if it was previously `null`; existing assignments
      are updated if the new CSV differs — the CSV is authoritative for this field)

**Acceptance Criteria — Upsert behaviour**
- [ ] Dedup key: `` `${date}|${user}|${ticketId ?? ticketName}|${activity}|${spentTime}` ``
- [ ] Existing entry with same key: update `wbsCode`, `category`, `billingType`,
      `customer` if they changed — count as `updated`, not `added`
- [ ] New entry: add — count as `added`
- [ ] New ticket: add to `FmoMappingStore.tickets` with `syncSource: 'sectrack'`
- [ ] New member: add to `FmoMappingStore.members` with `type: 'extern'`, `costRate: 0`

**Acceptance Criteria — Import summary**
- [ ] `added` — new entries
- [ ] `updated` — entries whose WBS/billingType changed on re-upload
- [ ] `duplicates` — entries identical to stored (no change needed)
- [ ] `newTickets` — tickets seen for first time
- [ ] `newMembers` — members seen for first time
- [ ] `unmapped` — entries with `wbsCode = null` after import
      *(should be 0 for extended-format CSVs with complete WBS-Override values)*

**Action signature:**
```typescript
export async function uploadFmoCSV(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
  stats: FmoImportStats;
}>
// Steps:
// 1. Read files from formData (field: 'files')
// 2. For each file:
//    a. Parse CSV text; normalise header names
//    b. Detect format (extended vs legacy)
//    c. Validate required columns
//    d. Parse rows → FmoEntry[]
//    e. Upsert entries (skip/update/add by dedup key)
//    f. Upsert tickets (wbsCode from CSV overwrites null, updates differing value)
//    g. Upsert members (new only — never update existing member settings)
// 3. writeFmoStore + writeFmoMappings
// 4. revalidatePath('/fmo/utilization')
// 5. Return stats
```

**Files to create:**
- `src/app/fmo/import/page.tsx` — server component shell
- `src/app/fmo/import/ImportClient.tsx` — `'use client'` upload UI

**UI layout for `/fmo/import`:**
```
┌─────────────────────────────────────────────────────────┐
│  Import SecTrack Data                                    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Drag & drop CSV files here, or click           │    │
│  │           [Choose files]                        │    │
│  └─────────────────────────────────────────────────┘    │
│  [Upload X files]                                       │
│                                                         │
│  Last import: 2026-08-14 09:30  (or "Never")            │
│  Files imported: sectrack-aug-2026.csv, …               │
│                                                         │
│  ── Last import result ──────────────────────────────── │
│  ✓ 2,131 added  · 14 updated  · 0 duplicates            │
│  ⚠ 3 new tickets  ·  2 new members                      │
│  ✗ 0 unmapped  ← 0 because extended CSV had WBS column  │
│                                                         │
│  ── Data Sources ────────────────────────────────────── │
│  ● Excel (manual upload)   canAutoSync: No              │
│    [Upload Therese_Board.xlsx to seed WBS labels]        │
└─────────────────────────────────────────────────────────┘
```

Also show a "Seed from Therese_Board.xlsx" section (see US-006).

---

### US-006 · Import — Seed Ticket→WBS Mapping from Therese_Board.xlsx

**Story:** As an admin, I want to upload `Therese_Board.xlsx` once to pre-populate the
Ticket→WBS mapping so that all 70 known tickets are classified immediately on first
SecTrack CSV upload.

**Dependencies:** US-005

**Acceptance Criteria:**
- [ ] On the `/fmo/import` page, a separate "Seed from Excel" section accepts a
      single `.xlsx` file
- [ ] The app reads the `Spent Time` sheet from the uploaded Excel
- [ ] From each row: `Task ID (Tasks)` (col index 9) and `WBS` (col index 2) are
      extracted
- [ ] 70 unique task-ID→WBS pairs are upserted into `FmoMappingStore.tickets`
      (existing ticket entries keep their name/project if already set)
- [ ] If a ticket ID already exists with a WBS assigned, it is NOT overwritten
      (seed does not override admin decisions)
- [ ] After seeding, all existing `FmoStore.entries` whose ticket now has a WBS are
      reclassified in-place
- [ ] Summary shown: "Seeded N ticket→WBS mappings. Reclassified M entries."
- [ ] Column indices used (0-based from Spent Time sheet):
      - col[2] = WBS
      - col[9] = Task ID (Tasks)
      - col[10] = Task (name)
      - col[11] = Monat (skip — derived column)
      - Headers are in row[0]; data starts row[1]

**New action to add to `src/actions/fmo.ts`:**
```typescript
export async function seedFromExcel(formData: FormData) {
  // 1. Read xlsx file from formData (field: 'excelFile')
  // 2. Open 'Spent Time' sheet
  // 3. Extract Task ID (col 9) + WBS (col 2) + Task name (col 10) from each row
  // 4. For each unique (taskId, wbs) pair where taskId is a number:
  //    - If ticket not in mappings.tickets OR ticket.wbsCode is null:
  //        set ticket.wbsCode = wbs, ticket.category = classifyWbs(wbs)
  // 5. Reclassify all FmoStore.entries whose ticket now has a WBS
  // 6. Save both stores
  // 7. Return { seeded: N, reclassified: M }
}
```

**Note on column indices:** The Spent Time sheet has a row[0] header and row[1]+ data.
The `Task ID (Tasks)` column header contains "Task ID". Match headers by partial string
rather than hardcoding column index 9, in case column order changes in future exports.

---

### US-007 · Tickets — View and Filter Ticket List

**Story:** As an admin, I want to see all known tickets in a searchable, filterable
table so I can understand what work has been tracked and identify which tickets still
need a WBS assignment.

**Dependencies:** US-005

**Acceptance Criteria:**
- [ ] `/fmo/tickets` page shows a table of all tickets in `FmoMappingStore.tickets`
- [ ] Table columns: Ticket ID | Name | Project | WBS Code | Category | Status
- [ ] Status badge: green "Assigned" if wbsCode is set; amber "Unassigned" if null
- [ ] Filter bar with: search (filters ID + name), status dropdown (All / Assigned /
      Unassigned), category dropdown (All / Verrechenbar / Intern/Admin / ...)
- [ ] Row count shown: "Showing X of Y tickets"
- [ ] "X tickets need WBS assignment" warning banner if any unassigned tickets exist
- [ ] Clicking a ticket row opens the inline WBS assignment (US-008)
- [ ] Table is sorted: Unassigned first, then alphabetically by name

**Files to create:**
- `src/app/fmo/tickets/page.tsx` — server component
- `src/app/fmo/tickets/TicketsClient.tsx` — `'use client'`

---

### US-008 · Tickets — Assign WBS to a Ticket

**Story:** As an admin, I want to assign or change a WBS code for any ticket so that
all time entries for that ticket are correctly classified.

**Dependencies:** US-007

**Acceptance Criteria:**
- [ ] Each table row has a WBS dropdown (select element) populated with all known WBS
      codes from `FmoMappingStore.wbs`, sorted alphabetically, showing
      `[code] label — category`
- [ ] A blank "— unassigned —" option is always first in the dropdown
- [ ] Changing the dropdown immediately calls the `assignTicketWbs` server action
- [ ] After assignment: the ticket's `category` is updated via `classifyWbs()`
- [ ] After assignment: ALL `FmoStore.entries` that reference this ticket ID are
      reclassified (their `wbsCode` and `category` fields updated)
- [ ] The UI shows a brief "Saved" confirmation inline on the row (no page reload)
- [ ] If reclassification fails (Redis error), show an inline error on the row

**New action to add to `src/actions/fmo.ts`:**
```typescript
export async function assignTicketWbs(ticketId: number, wbsCode: string | null) {
  const [store, mappings] = await Promise.all([readFmoStore(), readFmoMappings()]);
  const key = String(ticketId);
  if (!mappings.tickets[key]) return { ok: false, error: 'Ticket not found' };
  mappings.tickets[key].wbsCode = wbsCode;
  mappings.tickets[key].category = wbsCode ? classifyWbs(wbsCode, mappings.wbs) : null;

  // Reclassify all entries for this ticket
  let reclassified = 0;
  for (const entry of store.entries) {
    if (entry.ticketId === ticketId) {
      entry.wbsCode = wbsCode;
      entry.category = wbsCode ? classifyWbs(wbsCode, mappings.wbs) : null;
      reclassified++;
    }
  }

  await Promise.all([writeFmoStore(store), writeFmoMappings(mappings)]);
  revalidatePath('/fmo/tickets');
  revalidatePath('/fmo/utilization');
  return { ok: true, reclassified };
}
```

---

### US-009 · Members — View Member List

**Story:** As an admin, I want to see all team members extracted from SecTrack uploads,
with their type (Intern/Extern), partner company, and cost rate.

**Dependencies:** US-005

**Acceptance Criteria:**
- [ ] `/fmo/members` page shows a table of all members in `FmoMappingStore.members`
- [ ] Table columns: Name | Type (badge) | Partner Company | Cost Rate (€/h) |
      Total Hours (sum across all entries) | Actions
- [ ] Type badge: blue "Intern", orange "Extern"
- [ ] Members with `costRate: 0` show a warning icon (cost not configured)
- [ ] Table sorted alphabetically by name
- [ ] Each row has an "Edit" link that goes to `/fmo/members/[id]` detail page
- [ ] Total count shown: "X Extern, Y Intern"

**Files to create:**
- `src/app/fmo/members/page.tsx` — server component
- `src/app/fmo/members/MembersClient.tsx` — `'use client'`

**New action to add to `src/actions/fmo.ts`:**
```typescript
export async function getFmoData() {
  const [store, mappings] = await Promise.all([readFmoStore(), readFmoMappings()]);
  return { store, mappings };
}
```

---

### US-010 · Members — Edit Member Profile

**Story:** As an admin, I want to set a member's type (Intern/Extern), partner company,
and cost rate so the system has accurate data for reporting.

**Dependencies:** US-009

**Acceptance Criteria:**
- [ ] `/fmo/members/[id]` page shows a form to edit: Type toggle, Partner Company
      (text, only visible when type=Extern), Cost Rate (number, €/h)
- [ ] Saving updates `FmoMappingStore.members[id]`
- [ ] Page also shows a stacked bar chart (see US-011) below the form
- [ ] "Save" shows inline success/error feedback
- [ ] Back link returns to `/fmo/members`

**Files to create:**
- `src/app/fmo/members/[id]/page.tsx` — server component
- `src/app/fmo/members/[id]/MemberDetailClient.tsx` — `'use client'`

**New action to add to `src/actions/fmo.ts`:**
```typescript
export async function updateFmoMember(
  id: string,
  updates: Partial<Pick<FmoMember, 'type' | 'partnerCompany' | 'costRate'>>
) {
  const mappings = await readFmoMappings();
  if (!mappings.members[id]) return { ok: false, error: 'Member not found' };
  Object.assign(mappings.members[id], updates);
  await writeFmoMappings(mappings);
  revalidatePath('/fmo/members');
  revalidatePath(`/fmo/members/${id}`);
  return { ok: true };
}
```

---

### US-011 · Members — Hours Bar Chart per Member

**Story:** As an admin, I want to see a stacked bar chart for each member showing their
hours by category per month so I can assess individual productivity and workload.

**Dependencies:** US-010

**Acceptance Criteria:**
- [ ] Bar chart on the member detail page (`/fmo/members/[id]`)
- [ ] X-axis: months present in the member's data (e.g. "Apr 26", "May 26", …)
- [ ] Y-axis: hours
- [ ] Stacked bars: one colour per category
  - Verrechenbar: green (#22c55e)
  - Intern/Admin: slate (#64748b)
  - Presales: blue (#3b82f6)
  - OPM: orange (#f97316)
  - Portfolioentwicklung: purple (#a855f7)
  - Training: yellow (#eab308)
  - Absence: red (#ef4444)
  - Unmapped: rose (#fb7185)
- [ ] A summary table below the chart: Category | Month1 | Month2 | … | Total
      (same layout as Auslastung h, but for one member only)
- [ ] If member has no entries, show "No data imported yet" message

**Implementation:** Use `recharts` `BarChart` with `Bar` per category.
Compute data from `FmoStore.entries` filtered to `entry.user === member.name`.
Group by month, then by category. Sum spentTime.

---

### US-012 · Utilization — Auslastung h (Hours Report)

**Story:** As a manager, I want to see total hours by team member, category, and month
in a hierarchical table (equivalent to the "Auslastung h" Excel tab) so I can track
utilization across the team.

**Dependencies:** US-005, US-008

**Acceptance Criteria:**
- [ ] `/fmo/utilization` page, default tab "Stunden (h)"
- [ ] Table structure (hierarchical):
  ```
  Extern / Intern
    └── Employee name
          └── Category (Verrechenbar, Intern/Admin, OPM, Presales, Portfolioentwicklung, Training, Absence, Unmapped)
                └── Hours per month
          └── Employee subtotal per month
    └── Group subtotal per month (Extern / Intern)
  Grand total per month
  ```
- [ ] Month columns are DERIVED from the data (not hardcoded). Header format: "Jan 26"
- [ ] Final column: "Total" (sum across all months for that row)
- [ ] Rows are expandable: click Extern/Intern group to collapse/expand;
      click employee row to collapse/expand their categories
- [ ] All rows expanded by default
- [ ] Filter bar: Year dropdown (derived from data), Month multi-select
- [ ] Employees are sorted within their group: Extern alphabetically, then Intern alphabetically
- [ ] Categories within an employee sorted: Verrechenbar first, then alphabetical

**Files to create:**
- `src/app/fmo/utilization/page.tsx` — server component (reads entries + mappings)
- `src/app/fmo/utilization/UtilizationClient.tsx` — `'use client'` with tabs + table

**Aggregation logic (compute client-side from flat entries array):**
```typescript
// Build pivot: { [memberName]: { [month]: { [category]: number } } }
function buildPivot(entries: FmoEntry[], members: Record<string, FmoMember>) {
  // Group entries by user → month → category, sum spentTime
  // Use member.type to determine Extern/Intern grouping
  // If entry.category is null → use 'Unmapped'
}
```

---

### US-013 · Utilization — Auslastung % (Percentage Report)

**Story:** As a manager, I want to see each category's hours as a percentage of the
employee's total hours for that month so I can assess how time is distributed.

**Dependencies:** US-012

**Acceptance Criteria:**
- [ ] Second tab "Auslastung (%)" on the `/fmo/utilization` page
- [ ] Same hierarchical structure as US-012
- [ ] Cell values = `categoryHours / employeeTotalHoursForMonth` × 100, formatted
      as "84.2 %" (1 decimal place)
- [ ] Employee subtotal rows always show "100 %" per month (or "—" if no hours)
- [ ] Group and grand total subtotal rows always show "100 %" per month
- [ ] Months with 0 hours for an employee show "—" not "0 %"
- [ ] Toggle between Stunden and Auslastung tabs preserves current filter selection

---

### US-014 · Utilization — Unmapped Entries

**Story:** As an admin, I want to see all entries where no WBS classification could be
applied so I can fix the missing ticket→WBS assignments.

**Dependencies:** US-012

**Acceptance Criteria:**
- [ ] On the `/fmo/utilization` page, a third tab "Unmapped (N)" appears where N is
      the count of entries with `category === null` or `category === 'Unmapped'`
- [ ] Tab label turns rose/red when N > 0
- [ ] The tab shows a table: Date | User | Ticket ID | Ticket Name | WBS | Hours
- [ ] Each row has a "Assign WBS" link that opens `/fmo/tickets` filtered to that ticket
- [ ] The hours in unmapped entries are INCLUDED in the totals of other tabs
      (shown as the "Unmapped" category row) — they are never silently dropped
- [ ] When N = 0: tab shows "All entries classified — great!" message

---

### US-015 · Reclassification — Recompute After WBS Change

**Story:** As an admin, after editing WBS codes or ticket assignments, I want to trigger
a full reclassification of all stored entries so the reports reflect the latest mappings.

**Dependencies:** US-004, US-008

**Acceptance Criteria:**
- [ ] "Reclassify All" button on `/fmo/wbs` page
- [ ] `window.confirm()` dialog: "This will recompute categories for all N entries
      using current WBS assignments. Continue?"
- [ ] After confirmation, server action runs and updates ALL entries in FmoStore
- [ ] Result shown: "Reclassified N entries. M entries remain unmapped."
- [ ] The button is also available on `/fmo/tickets` page
- [ ] The action also updates `category` on all `FmoMappingStore.tickets` entries

**New action to add to `src/actions/fmo.ts`:**
```typescript
export async function reclassifyAllEntries() {
  const [store, mappings] = await Promise.all([readFmoStore(), readFmoMappings()]);
  let reclassified = 0;
  let unmapped = 0;

  for (const entry of store.entries) {
    const ticket = entry.ticketId ? mappings.tickets[String(entry.ticketId)] : null;
    entry.wbsCode = ticket?.wbsCode ?? null;
    entry.category = entry.wbsCode ? classifyWbs(entry.wbsCode, mappings.wbs) : null;
    if (!entry.category) unmapped++;
    else reclassified++;
  }

  // Also update ticket categories
  for (const ticket of Object.values(mappings.tickets)) {
    if (ticket.wbsCode) ticket.category = classifyWbs(ticket.wbsCode, mappings.wbs);
  }

  await Promise.all([writeFmoStore(store), writeFmoMappings(mappings)]);
  revalidatePath('/fmo/utilization');
  revalidatePath('/fmo/tickets');
  return { ok: true, reclassified, unmapped };
}
```

---

## ARCHITECTURE PRINCIPLES (Operations Feature)

Before reading the Operations user stories, internalise these constraints.
Every story below must be implemented against them — no exceptions.

### 1 — Single Responsibility
Each file does exactly one job. A component renders UI. An action mutates data.
A utility computes a value. Nothing crosses those boundaries inside a single file.

### 2 — No Duplication
Pure functions that are used in more than one place live in a shared module.
Copy-pasting a helper and renaming it (`opAmount` / `opAmountFc`) is a defect,
not a style choice.

### 3 — Module boundaries
Operations-specific code lives in its own files, never appended to large host files:

```
src/
├── lib/
│   └── operationsUtils.ts          # ALL pure helpers for operations
├── components/
│   └── OperationContractModal.tsx  # ONE shared modal, used by PA and Planning
├── app/
│   ├── projekt-analysis/[id]/
│   │   └── OperationsTab.tsx       # PA-specific tab — own file
│   └── planning/[id]/
│       └── ProjectOperationsSection.tsx  # Planning-specific section — own file
```

### 4 — Props carry the minimum needed
If the parent already computed a derived value (e.g. `operationTicketSet`), pass
that single value down. Do not pass the raw source data (e.g. `operationContracts`)
as well and recompute the same thing inside the child — that is hidden duplication.

### 5 — Server-authoritative state for financial figures
Financial calculations (revenue, P&L) must derive from the server prop
(`project.operationContracts`), not from local React state that can lag after a
delete/save cycle. Local state is only for optimistic UI in the editing flow.

### 6 — React rules
- Never call a state setter inside another `useState` initializer.
  Use `useEffect` for prop→state sync.
- Never use `useEffect` for derived values — use `useMemo`.

---

### Operations & Billing Type — connection to CSV

The extended CSV format contains a `Billing Type` column (`""` or `"Fixprice"`).
This is a direct signal from SecTrack that a time entry belongs to a fixed-price
Operations contract. The connection to the Operations Contracts feature is:

| `billingType` | Meaning | Action |
|---|---|---|
| `''` (empty) | Regular T&M — billed at hourly rate | Included in T&M revenue |
| `'fixprice'` | Fixed-price — covered by an Operations Contract | Excluded from T&M billing; covered by contract monthly amount |

**Auto-suggestion (US-017 scope):** when a project has entries with
`billingType: 'fixprice'`, the Operations tab can surface a banner:
*"N entries with Fixprice billing type detected — consider creating an Operations
Contract and assigning these tickets."* This is a hint, not automatic assignment —
the admin still creates the contract and confirms ticket assignments.

This means `billingType` on `FmoEntry` is the ground truth for whether an entry
is fixed-price. The `operationTicketSet` in Project Analysis is the admin-managed
assignment layer on top of that ground truth.

---

### US-016 · Operations — Shared Utilities and Actions

**Story:** As a developer, I need the `OperationContract` type, one shared pure-function
module, one shared modal component, and the two server actions so all Operations UI
stories have a clean foundation with zero duplication.

**Context:**
Projects can have fixed-price Operations contracts alongside regular T&M work.
External team members book hours to specific tickets (cost), but the client is billed
a fixed monthly amount (income). This split must be modelled cleanly so that revenue,
P&L, and trends are always accurate.

**Dependencies:** US-001

**Acceptance Criteria — Types (`src/lib/types.ts`)**
- [ ] `OperationContract` interface:
  ```typescript
  export interface OperationContract {
    id: string;
    name: string;
    defaultMonthlyAmount: number;             // € per month (baseline)
    monthlyOverrides: Record<string, number>; // "YYYY-MM" → € override
    ticketIds: string[];                      // task strings (entries.task values)
  }
  ```
- [ ] `ProjektAnalysisProject.operationContracts?: OperationContract[]`
- [ ] `ForecastProject.operationContracts?: OperationContract[]`

**Acceptance Criteria — DB (`src/lib/db.ts`)**
- [ ] `readProjektAnalysis()` spreads `operationContracts: p.operationContracts ?? []`
      so old records deserialise without breaking

**Acceptance Criteria — Shared utilities (`src/lib/operationsUtils.ts`) — NEW FILE**
- [ ] File exports exactly three pure functions, no imports from React or Next.js:
  ```typescript
  import { OperationContract } from './types';

  /** Amount for a single contract in a given month (override or default). */
  export function opAmount(c: OperationContract, month: string): number {
    return c.monthlyOverrides[month] ?? c.defaultMonthlyAmount;
  }

  /** Total income across all contracts for a set of months. */
  export function totalOpsIncome(
    contracts: OperationContract[],
    months: string[]
  ): number {
    return months.reduce(
      (sum, month) => sum + contracts.reduce((s, c) => s + opAmount(c, month), 0),
      0
    );
  }

  /** Set of task strings that belong to at least one operation contract. */
  export function buildOpTicketSet(contracts: OperationContract[]): Set<string> {
    return new Set(contracts.flatMap(c => c.ticketIds));
  }
  ```
- [ ] No other file reimplements any of these three computations

**Acceptance Criteria — Shared modal (`src/components/OperationContractModal.tsx`) — NEW FILE**
- [ ] Single `'use client'` component used by both Project Analysis and Forecast Planning
- [ ] Props:
  ```typescript
  interface Props {
    initial?: OperationContract;
    months: string[];        // controls per-month override inputs
    tasks?: string[];        // optional — only PA passes this; Planning omits it
    onSave: (c: OperationContract) => void;
    onClose: () => void;
  }
  ```
- [ ] Fields: name, default monthly amount, per-month overrides, optional ticket
      checkboxes (rendered only when `tasks` prop is provided)
- [ ] Generates a new `crypto.randomUUID()` id when `initial` is absent
- [ ] Calls `onSave` with the complete `OperationContract` — no server calls inside
      this component (caller owns the save)

**Acceptance Criteria — Server actions**
- [ ] `updateOperationContracts(projectId, contracts)` in `src/actions/projektAnalysis.ts`
- [ ] `updateForecastProjectOperations(forecastId, projectId, contracts)` in
      `src/actions/forecasts.ts`
- [ ] `updateForecastProject(...)` spreads `operationContracts: existing.operationContracts`
      so editing name/budget/dates never overwrites contracts

**Files to create:**
- `src/lib/operationsUtils.ts`
- `src/components/OperationContractModal.tsx`

**Files to modify (minimal, append-only):**
- `src/lib/types.ts`
- `src/lib/db.ts`
- `src/actions/projektAnalysis.ts`
- `src/actions/forecasts.ts`

**No UI beyond the shared modal. No formatting helpers in this story.**

---

### US-017 · Operations — Project Analysis Tab & Revenue

**Story:** As an admin, I want to manage Operation contracts on a project and see their
effect on revenue so I can model fixed-price income streams accurately.

**Dependencies:** US-016

**Module: `src/app/projekt-analysis/[id]/OperationsTab.tsx`** — NEW FILE
This component owns all Operations UI for the Project Analysis detail page.
It must not be defined inside `ProjektAnalysisDetailClient.tsx`.

**Acceptance Criteria — OperationsTab component**
- [ ] `'use client'` component in its own file
- [ ] Props:
  ```typescript
  interface Props {
    contracts: OperationContract[];
    months: string[];
    tasks: string[];
    isAdmin: boolean;
    onSave: (next: OperationContract[]) => Promise<void>;
  }
  ```
- [ ] Imports `OperationContractModal` from `src/components/OperationContractModal`
- [ ] Imports `opAmount`, `totalOpsIncome` from `src/lib/operationsUtils`
- [ ] Renders: contract list (expandable rows), per-month income table, "+ Add Contract"
- [ ] Expanded row shows: monthly income table with overrides highlighted, ticket pills
      each with an admin-only `×` to remove that ticket without reopening the modal
- [ ] Monthly income overview table below the list when ≥1 contract exists
- [ ] All formatting uses `Intl` / `toLocaleString` inline — no imported `fmtEur`

**Acceptance Criteria — Tab integration (change to `ProjektAnalysisDetailClient.tsx`)**
- [ ] Import `OperationsTab` from `./OperationsTab`
- [ ] `'Operations'` added to `TABS` constant between `'Tickets'` and `'Trends'`
- [ ] Tab rendered as `<OperationsTab contracts={operationContracts} ... />`
- [ ] `operationContracts` local state used only for the tab UI (optimistic editing)
- [ ] `operationTicketSet` and `totalOperationsIncome` derived from
      `project.operationContracts` (server prop) via `buildOpTicketSet` and
      `totalOpsIncome` from `src/lib/operationsUtils` — never from local state

**Acceptance Criteria — Revenue formula**
- [ ] `tmHours` per user: `operationTicketSet.size === 0 ? allHours : filteredEntries.filter(...)`
- [ ] `totalTmRevenue` = Σ(tmHours × billingRate)
- [ ] `totalRevenue = totalTmRevenue + totalOperationsIncome`
- [ ] Employees tab `<tfoot>`: three rows — T&M Subtotal | Operations Income | **Total**

**Files to create:**
- `src/app/projekt-analysis/[id]/OperationsTab.tsx`

**Files to modify:**
- `src/app/projekt-analysis/[id]/ProjektAnalysisDetailClient.tsx` — import tab,
  update TABS, update economics memos, update tfoot, add ops summary to Forecast tab

---

### US-018 · Operations — Trends: Development vs Operations Split

**Story:** As a manager, I want the trend charts to distinguish Development from
Operations ticket hours so I can see the split at a glance.

**Dependencies:** US-017

**Acceptance Criteria — Chart prop contract**
- [ ] `DevOpsMonthlyChart`, `VelocityChart`, `MonthlyByTicketChart` each accept
      **only** `operationTicketSet?: Set<string>` — they do NOT accept
      `operationContracts` as a prop. The parent computes the set; charts consume it.
- [ ] `MonthlyBillingChart` and `EconomicsChart` accept **only**
      `operationTicketSet?: Set<string>` and `operationContracts?: OperationContract[]`
      for income computation; they import `opAmount` from `src/lib/operationsUtils`
      and do not reimplement it

**Acceptance Criteria — DevOpsMonthlyChart (new export in ProjektAnalysisCharts.tsx)**
- [ ] Shown only when `operationTicketSet.size > 0`
- [ ] Stacked bar per month: indigo = Dev hours, amber = Ops hours
- [ ] KPI row above chart: total Dev (+ %), total Ops (+ %)
- [ ] Dashed line on right Y-axis: Dev % share per month

**Acceptance Criteria — VelocityChart (updated)**
- [ ] When `operationTicketSet` is provided and non-empty: single bar splits into Dev +
      Ops stacked segments; 3-month avg line covers total
- [ ] When absent/empty: renders exactly as before (no regression)

**Acceptance Criteria — MonthlyByTicketChart (updated)**
- [ ] Ops tickets colored from `OPS_COLORS`, prefixed ⚙ in legend, labeled `[OPS]`
      in tooltip, rendered last in stack
- [ ] Dev tickets colored from `DEV_COLORS`
- [ ] When `operationTicketSet` absent/empty: renders exactly as before

**Acceptance Criteria — Color constants**
- [ ] `DEV_COLORS` and `OPS_COLORS` defined once at the top of
      `ProjektAnalysisCharts.tsx`; no other file defines these palettes

**Files to modify:**
- `src/app/projekt-analysis/[id]/ProjektAnalysisCharts.tsx`
- `src/app/projekt-analysis/[id]/ProjektAnalysisDetailClient.tsx` (pass `operationTicketSet`)

---

### US-019 · Operations — Plan Contracts in Forecast Planning

**Story:** As a manager, I want to define Operation contracts per project in the Forecast
Planning view so I can model fixed-price income alongside resource allocation.

**Dependencies:** US-016

**Module: `src/app/planning/[id]/ProjectOperationsSection.tsx`** — NEW FILE
This component owns all Operations UI for the Forecast Planning project card.
It must not be defined inside `ForecastClient.tsx`.

**Acceptance Criteria — ProjectOperationsSection component**
- [ ] `'use client'` component in its own file
- [ ] Props:
  ```typescript
  interface Props {
    project: ForecastProject;
    forecastId: string;
    onRefresh: () => void;
  }
  ```
- [ ] Derives `months` via `getMonthsBetween(project.startMonth, project.endMonth)`
- [ ] Initialises local `contracts` state from `project.operationContracts ?? []`
- [ ] Syncs with incoming prop via `useEffect([project.operationContracts])` — never
      via a setter call inside a `useState` initializer
- [ ] Imports `OperationContractModal` from `src/components/OperationContractModal`
- [ ] Imports `opAmount`, `totalOpsIncome` from `src/lib/operationsUtils`
- [ ] Ticket assignment: omitted — pass `tasks={undefined}` to modal (Planning has no
      ticket data; tickets are managed in Project Analysis)
- [ ] All saves: `updateForecastProjectOperations` → `router.refresh()` → `onRefresh()`
- [ ] When 2+ contracts: renders "Total Ops Income" summary row across month columns

**Acceptance Criteria — Integration (change to `ForecastClient.tsx`)**
- [ ] Import `ProjectOperationsSection` from `./ProjectOperationsSection`
- [ ] Render inside `ProjectCard`'s expanded block, after the assignment matrix
- [ ] No operations-related helpers or state inside `ForecastClient.tsx` itself

**Files to create:**
- `src/app/planning/[id]/ProjectOperationsSection.tsx`

**Files to modify:**
- `src/app/planning/[id]/ForecastClient.tsx` — import + render `ProjectOperationsSection`;
  remove `ForecastOpContractModal`, `opAmountFc`, `fmtEurFc` (these belong to the new
  file and to `operationsUtils.ts`)

---

---

### US-020 · WBS Hierarchy — Data Source Abstraction

**Story:** As a developer, I need a single interface for loading WBS and ticket data so
that the Excel-based import (used now) and future remote API sources (SecTrack, SAP)
are interchangeable without touching any action or UI code.

**Dependencies:** US-001

**Acceptance Criteria — Interface (`src/lib/wbsDataSource.ts`) — NEW FILE**
- [ ] Exports one interface and two classes — nothing else:
  ```typescript
  export interface WbsDataSource {
    readonly id: SyncSource;
    readonly label: string;
    readonly canAutoSync: boolean; // false for Excel, true for API sources
    loadWbs(): Promise<FmoWbsEntry[]>;
    loadTickets(): Promise<FmoTicket[]>;
  }

  /** Current implementation — reads from an uploaded Therese_Board.xlsx buffer. */
  export class ExcelDataSource implements WbsDataSource {
    readonly id = 'excel' as const;
    readonly label = 'Excel (Therese_Board.xlsx)';
    readonly canAutoSync = false;
    constructor(private buffer: ArrayBuffer) {}
    async loadWbs(): Promise<FmoWbsEntry[]> { /* parse Mapping sheet */ }
    async loadTickets(): Promise<FmoTicket[]> { /* parse Spent Time sheet */ }
  }

  /** Stub — will be implemented when SecTrack API credentials are available. */
  export class RemoteDataSource implements WbsDataSource {
    readonly id = 'sectrack' as const;
    readonly label = 'SecTrack API';
    readonly canAutoSync = true;
    async loadWbs(): Promise<FmoWbsEntry[]> {
      throw new Error('RemoteDataSource not yet implemented');
    }
    async loadTickets(): Promise<FmoTicket[]> {
      throw new Error('RemoteDataSource not yet implemented');
    }
  }
  ```
- [ ] `ExcelDataSource.loadWbs()` reads the `Mapping` sheet from
      `src/ressources/Therese_Board.xlsx`, returns `FmoWbsEntry[]` with
      `syncSource: 'excel'` and `syncedAt: new Date().toISOString()`
- [ ] `ExcelDataSource.loadTickets()` reads the `Spent Time` sheet, extracts unique
      (taskId, taskName, wbsCode, project) rows, returns `FmoTicket[]` with
      `syncSource: 'excel'`
- [ ] No action or page file imports `ExcelDataSource` or `RemoteDataSource` directly.
      They receive a `WbsDataSource` instance — the concrete class is resolved once,
      at the point where the uploaded file is available, and passed down as the interface

**Rule:** If a future developer wants to add SAP support, they create `SapDataSource
implements WbsDataSource` in this file. No other file changes.

**Files to create:**
- `src/lib/wbsDataSource.ts`

**Files to modify:**
- `src/lib/types.ts` — add `SyncSource` type; add `syncSource`/`syncedAt`/`budgetHours`/
  `budgetValue` fields to `FmoWbsEntry` and `FmoTicket`

---

### US-021 · WBS Hierarchy — Seed WBS Labels from Therese_Board.xlsx

**Story:** As an admin, I want to upload Therese_Board.xlsx to seed WBS labels and
employee classification data, so that codes imported via CSV have human-readable names
and historical entries from old-format CSVs are correctly classified.

**Context:** This replaces and supersedes US-006 (marked **DEPRECATED**). The
ticket→WBS link is now carried directly in the extended CSV format (US-005). The Excel
seed is now responsible for:
1. WBS labels — the CSV has codes but not human-readable names
2. Employee type classification (Intern/Extern) from the Mapping sheet
3. Historical ticket→WBS mapping for entries that were exported in the legacy 7-column
   format before the WBS-Override column was available

**Dependencies:** US-020, US-005

**Acceptance Criteria — Action**
- [ ] `seedFromDataSource(formData: FormData)` server action in `src/actions/fmo.ts`
- [ ] Reads uploaded `.xlsx` → creates `ExcelDataSource(buffer)`
- [ ] Calls `source.loadWbs()` → upserts into `FmoMappingStore.wbs`:
  - Populates `label` for existing code entries that have no label set
  - Never overwrites a `categoryOverride` set by an admin
  - New entries: `syncSource: 'excel'`, `syncedAt: now`
- [ ] Calls `source.loadTickets()` → upserts into `FmoMappingStore.tickets` for
      **legacy records only** (where `syncSource !== 'sectrack'` or `wbsCode === null`):
  - Does NOT overwrite any ticket whose `wbsCode` was already set by a CSV import
  - New tickets from Excel: `syncSource: 'excel'`, `wbsCode` from Excel
- [ ] After upsert: re-runs classification for legacy entries whose WBS was null and
      is now resolved (reuses `reclassifyAllEntries` from US-015)
- [ ] Returns `{ wbsLabelsAdded, ticketsBackfilled, entriesReclassified }`
- [ ] Idempotent — re-uploading the same Excel changes nothing already resolved by CSV

**Acceptance Criteria — UI**
- [ ] Result banner distinguishes seed scope:
      "WBS labels added: N · Legacy tickets backfilled: M · Entries reclassified: K"
- [ ] WBS list shows provenance chip per row: "excel", "manual", or "sectrack"
- [ ] Data Sources card on import page lists registered sources (see US-020 for stub)

**Files to modify:**
- `src/actions/fmo.ts` — add `seedFromDataSource`, deprecate `seedFromExcel`
- `src/app/fmo/import/ImportClient.tsx` — call new action; add sources card
- `src/lib/wbsDataSource.ts` — implement `ExcelDataSource` bodies (US-020 stubs → real)

---

### US-022 · WBS Hierarchy — Browsable WBS → Ticket Tree

**Story:** As an admin, I want to browse WBS elements and see the tickets that belong
to each one, collapsed by default, so I can understand the work structure at a glance
and identify gaps without scrolling through a flat ticket list.

**Dependencies:** US-021, US-007

**Data rule:** The parent-child relationship (`wbsCode` on `FmoTicket`) is the single
source of truth. The tree is derived at render time by grouping tickets by `wbsCode`
— never stored as a nested structure.

**Acceptance Criteria — `/fmo/wbs` page (replaces flat list from US-003)**
- [ ] Default view: WBS elements as collapsible rows; each shows code, label, category
      badge, `syncSource`, and ticket count
- [ ] Expanding a WBS row reveals its tickets as indented sub-rows: ID, name, project,
      hours (sum of all `FmoStore.entries` for that ticket)
- [ ] Tickets with no WBS are shown in a fixed "⚠ Unassigned Tickets" group at the
      bottom — never silently hidden
- [ ] WBS rows with 0 associated tickets show a "No tickets" placeholder
- [ ] A **"View: Tree / Flat"** toggle reverts to the original flat list (US-003) for
      admins who prefer the old view — toggle persists to `localStorage`
- [ ] Search box filters both WBS rows AND their child tickets simultaneously; a WBS row
      stays visible if any of its children match the query
- [ ] Budget columns (`budgetHours`, `budgetValue`) are shown as "—" if unset; when
      WBS data is synced from a future remote source these will populate automatically

**Acceptance Criteria — `/fmo/tickets` page (replaces flat list from US-007)**
- [ ] Same **"View: Tree / Flat"** toggle; tree groups tickets under their WBS parent
- [ ] Flat view is unchanged from US-007 (no regression)
- [ ] In tree view the WBS assignment dropdown (US-008) remains available on each
      ticket row, so reparenting a ticket is still one click

**Acceptance Criteria — Utilization page (extends US-012)**
- [ ] A **"Group by: Category / WBS"** toggle on `/fmo/utilization`
- [ ] "Group by WBS" mode: hierarchy becomes Employee → WBS Element → hours per month
      (instead of Employee → Category → hours)
- [ ] Totals and % calculations are identical; only the grouping key changes
- [ ] Default remains "Group by Category" (no regression for existing users)

**Acceptance Criteria — Project Analysis Tickets tab (separate surface)**
- [ ] When a project has entries whose tasks map to known WBS codes in
      `FmoMappingStore`, the Tickets tab in `/projekt-analysis/[id]` offers a
      **"Group by WBS"** toggle
- [ ] Grouped view: WBS label as section header → tickets indented below; collapsed
      by default; hours/cost/revenue roll up to the WBS section header row
- [ ] Toggle defaults to **off** (flat list, zero regression)
- [ ] This lookup is read-only: the WBS-ticket mapping comes from `FmoMappingStore`,
      not from anything stored on the `ProjektAnalysisProject`

**Files to create:**
- `src/app/fmo/wbs/WbsTree.tsx` — `'use client'` tree component (flat list lives in
  `WbsClient.tsx` as before; tree is a separate component imported conditionally)
- `src/app/fmo/tickets/TicketsTree.tsx` — same pattern for the tickets page

**Files to modify:**
- `src/app/fmo/wbs/WbsClient.tsx` — add toggle; import `WbsTree` conditionally
- `src/app/fmo/tickets/TicketsClient.tsx` — add toggle; import `TicketsTree`
- `src/app/fmo/utilization/UtilizationClient.tsx` — add "Group by WBS" toggle
- `src/app/projekt-analysis/[id]/ProjektAnalysisDetailClient.tsx` — add "Group by WBS"
  toggle in Tickets tab (reads `FmoMappingStore` via a new server action)

---

---

### US-023 · Import — Monthly Full-History Re-upload

**Story:** As an admin, I upload a new full-history CSV every month (all entries from
project start to today). The system must add only the genuinely new rows and update
changed attributes — never create duplicates and never delete existing data.

**Context:** SecTrack exports are cumulative. A July export contains all entries from
January onwards. An August export contains everything again, plus August rows. The
system must handle this efficiently even as the file grows to tens of thousands of rows.

**Dependencies:** US-005

**Acceptance Criteria — Correctness**
- [ ] Uploading a file that is a strict superset of a previous upload adds only the
      new rows; all previously stored entries remain unchanged (except attribute updates)
- [ ] Uploading the exact same file twice produces `added: 0, updated: 0,
      duplicates: N` — no state change
- [ ] A row whose `wbsCode` or `billingType` changed since last upload is updated
      in-place (`updated` counter incremented) — never duplicated

**Acceptance Criteria — Performance**
- [ ] The existing dedup-key lookup uses a `Set<string>` built from all stored entry
      keys before the loop — never a linear search per row
  ```typescript
  const existingKeys = new Set(store.entries.map(e => e.id));
  // then per incoming row: existingKeys.has(dedupKey) → skip/update
  ```
- [ ] Parsing and upsert of a 50,000-row CSV completes within the Vercel function
      timeout (60 s). If the file is too large for a single function call, the action
      returns a `{ ok: false, error: 'File too large — split into monthly batches' }`
      error with a clear message rather than silently timing out
- [ ] Import result always shows the breakdown:
      `added · updated · duplicates · newTickets · newMembers · unmapped`

**No new files — changes to `src/actions/fmo.ts` only.**

---

### US-024 · Internationalisation — English & German

**Story:** As a user, I want to switch the application language between English and
German so the UI is accessible in my preferred language.

**Architecture decision:** Use `next-intl` (one dependency, standard for Next.js App
Router, handles SSR/RSC, pluralization, and `Intl`-based date/number formatting).
The "no new dependencies" rule from Section 3 is relaxed for i18n only — doing this
without a library produces fragile DIY code that breaks on edge cases.

**Dependencies:** US-002 (sidebar — language toggle lives there)

**Acceptance Criteria — Infrastructure**
- [ ] `next-intl` installed; middleware configured for locale detection
- [ ] Two message files: `messages/en.json` and `messages/de.json`
- [ ] Locale stored in `localStorage` and as a cookie for SSR; falls back to `en`
- [ ] URL structure does NOT change (no `/en/` or `/de/` prefix) — locale is a user
      preference, not a route, because all users are internal

**Acceptance Criteria — Language toggle**
- [ ] A small `EN | DE` toggle appears in the sidebar footer (or top-right of every page)
- [ ] Switching language updates `localStorage`, the cookie, and re-renders — no full
      page reload required for client components
- [ ] Server components read locale from cookie at request time

**Acceptance Criteria — Coverage**
- [ ] All static UI strings are translated: labels, table headers, buttons, empty states,
      error messages, tab names, chart titles
- [ ] Dynamic data (project names, ticket names, WBS labels, user names) is NOT
      translated — these are proper nouns from SecTrack
- [ ] Number formatting uses locale automatically: `1.234,56 €` in DE, `1,234.56 €` in EN
- [ ] Date formatting uses locale: `14.08.2026` in DE, `Aug 14, 2026` in EN
- [ ] `fmtH` and `fmtEur` helpers throughout the codebase use `Intl.NumberFormat`
      with the active locale — not hardcoded `'de-DE'`

**Acceptance Criteria — Translation files**
- [ ] Keys are namespaced by page/feature to avoid collisions:
  ```json
  // messages/en.json
  {
    "common": { "save": "Save", "cancel": "Cancel", "delete": "Delete" },
    "nav": { "import": "Import", "wbs": "WBS Codes", "utilization": "Utilization" },
    "import": { "title": "Import SecTrack Data", "dropzone": "Drop CSV files here…" },
    "utilization": { "hours": "Hours", "percent": "Utilization %", "unmapped": "Unmapped" }
  }
  ```
- [ ] German file mirrors every key exactly (missing keys = build-time error via
      `next-intl`'s strict mode)

**Files to create:**
- `messages/en.json`
- `messages/de.json`
- `src/i18n.ts` — `next-intl` configuration
- `src/middleware.ts` — updated to handle locale cookie

**Files to modify:**
- Every `'use client'` and `'use server'` component — replace string literals with
  `t('key')` calls (large but mechanical change; do page-by-page per sub-story)
- `src/components/Sidebar.tsx` — add language toggle

**Implementation note:** translate page-by-page, not all at once. Each page is a
sub-task that can be reviewed and merged independently.

---

### US-025 · Chart Dashboard — Curated Chart Library with User Toggle

**Story:** As a user, I want to choose which charts appear on each analysis page and
control whether each chart takes half or full width, so I can build a view that matches
my workflow without being overwhelmed by charts I never look at.

**Design decision:** A curated library of named, meaningful charts (not an open-ended
custom chart builder). Each chart is a well-defined view with a fixed data binding.
The user toggles visibility and layout per chart. Preferences are stored in
`localStorage` keyed by page — no server persistence needed.

**Dependencies:** US-012, US-017, US-018

**Acceptance Criteria — Chart registry**
- [ ] Each chart is registered with a descriptor:
  ```typescript
  interface ChartDescriptor {
    id: string;          // stable key for localStorage
    title: string;       // display name (translated)
    defaultWidth: 'half' | 'full';
    defaultVisible: boolean;
    pages: string[];     // which pages this chart is available on
  }
  ```
- [ ] The registry is a static array in `src/lib/chartRegistry.ts` — one place to
      add/remove charts, no changes needed in individual page files

**Acceptance Criteria — Chart preferences**
- [ ] Stored in `localStorage` as `chartPrefs:{pageId}`:
  ```typescript
  type ChartPrefs = Record<string, { visible: boolean; width: 'half' | 'full' }>;
  ```
- [ ] A `useChartPrefs(pageId)` hook reads/writes this — no server calls
- [ ] Defaults come from the `ChartDescriptor` (first visit shows the default layout)
- [ ] "Reset to defaults" button restores the descriptor defaults for that page

**Acceptance Criteria — UI**
- [ ] A **"Charts"** button (or gear icon) in the top-right of any analysis page opens
      a slide-in panel listing all available charts for that page
- [ ] Each chart in the panel has:
  - Toggle (show / hide)
  - Width selector: half / full (radio or segmented control)
  - A small thumbnail or icon so the user knows what they're toggling
- [ ] Changes apply immediately to the page (no save button — reactive)
- [ ] Hidden charts are not rendered at all (not just `display:none`) — no wasted
      computation

**Acceptance Criteria — Layout**
- [ ] Visible charts render in a responsive grid:
  - Full-width charts span the entire row
  - Half-width charts sit side-by-side on ≥ lg screens, stack on mobile
- [ ] Chart order in the grid matches the order in the panel (drag-to-reorder is
      out of scope for this story — fixed order per registry)

**Charts available per page (initial set):**

| Page | Chart ID | Default visible | Default width |
|---|---|---|---|
| Project Analysis | `monthly-by-ticket` | yes | half |
| Project Analysis | `monthly-by-user` | yes | half |
| Project Analysis | `velocity` | yes | half |
| Project Analysis | `team-composition` | yes | half |
| Project Analysis | `activity-split` | yes | full |
| Project Analysis | `dev-ops-split` | yes | full |
| Project Analysis | `monthly-billing` | yes | half |
| Project Analysis | `economics` | yes | half |
| Project Analysis | `cumulative` | no | full |
| Project Analysis | `forecast-burnup` | no | full |
| Project Analysis | `ticket-progress` | no | full |
| FMO Utilization | `utilization-hours` | yes | full |
| FMO Utilization | `utilization-percent` | yes | full |
| FMO Utilization | `member-category-bar` | yes | full |

**Files to create:**
- `src/lib/chartRegistry.ts` — descriptor array, `useChartPrefs` hook
- `src/components/ChartPanel.tsx` — slide-in toggle panel (shared across pages)

**Files to modify:**
- `src/app/projekt-analysis/[id]/ProjektAnalysisDetailClient.tsx` — replace hardcoded
  chart grid with registry-driven layout; add Chart button
- `src/app/fmo/utilization/UtilizationClient.tsx` — same pattern

---

## 9. IMPLEMENTATION ORDER

Execute user stories in this exact order. Each row lists what it unlocks.

| # | Story | Depends on | Unlocks |
|---|---|---|---|
| 1 | **US-001** Foundation | — | Everything |
| 2 | **US-020** Data Source Abstraction | US-001 | US-021 (Excel seed needs the interface) |
| 3 | **US-024** i18n Infrastructure | US-001 | All UI stories — do this before any component is built so translations are wired in from day one, not retrofitted |
| 4 | **US-002** Sidebar | US-001, US-024 | All pages need navigation; language toggle lands here |
| 5 | **US-003** WBS List | US-001, US-002 | US-004, US-005 (CSV classifier needs WBS table) |
| 6 | **US-004** WBS CRUD | US-003 | US-015 (reclassify needs editable WBS) |
| 7 | **US-005** CSV Import | US-001, US-003 | Core data pipeline — everything else reads its output |
| 8 | **US-023** Monthly Re-upload | US-005 | Done while import code is fresh — same files, same action |
| 9 | **US-021** Excel Label Seed | US-020, US-005 | WBS labels visible; legacy entries backfilled |
| 10 | **US-007** Ticket List | US-005 | US-008 (need list before you can assign) |
| 11 | **US-008** Ticket WBS Assignment | US-007 | US-015, US-022 (tree needs all tickets assigned) |
| 12 | **US-015** Reclassify All | US-004, US-008 | Ensures all entries reflect latest WBS decisions before reports are built |
| 13 | **US-022** WBS Tree UI | US-021, US-008, US-015 | Full hierarchy visible across WBS, Tickets, Utilization, Project Analysis |
| 14 | **US-009** Member List | US-005 | US-010 |
| 15 | **US-010** Member Edit | US-009 | US-011 |
| 16 | **US-011** Member Chart | US-010 | Individual utilization visible |
| 17 | **US-012** Auslastung h | US-005, US-008, US-009 | Core report — baseline for % and unmapped |
| 18 | **US-013** Auslastung % | US-012 | Second report tab |
| 19 | **US-014** Unmapped Tab | US-012 | Surfaces classification gaps |
| 20 | **US-016** Operations Utilities | US-001 | Shared foundation for US-017, US-019 |
| 21 | **US-017** Operations PA Tab | US-016, US-005 | Revenue split visible in Project Analysis |
| 22 | **US-018** Dev vs Ops Charts | US-017 | Trend charts updated |
| 23 | **US-019** Operations in Planning | US-016 | Forecast Planning gets ops contracts |
| 24 | **US-025** Chart Library | US-012, US-018 | All charts (FMO + PA) exist — toggle panel can reference them |

**~~US-006~~** is deprecated — do not implement. US-021 supersedes it.

---

## 10. VERIFICATION (end-to-end)

After implementing all stories:

1. `npm run dev` — starts without errors
2. Visit `/fmo/wbs` → 22 WBS codes auto-seeded (flat list from US-003), categories correct
3. Visit `/fmo/import` → upload `src/ressources/Barmer.csv`
   - Result: entries added, some tickets unassigned, new members auto-added
4. Upload `src/ressources/Therese_Board.xlsx` via "Seed from Data Source" (US-021)
   - Result: WBS entries and ticket→WBS mappings seeded via `ExcelDataSource`
   - Provenance column on WBS list shows "excel · [today's date]"
5. **WBS Hierarchy check:**
   - Visit `/fmo/wbs` → toggle "View: Tree"
   - `V.05921700.81.03` expands to show Barmer development tickets
   - `V.05921700.81.01` expands to show Barmer operations tickets
   - "Unassigned Tickets" group at bottom shows any tickets with no WBS
   - Search "Barmer" highlights matching WBS rows and their child tickets
6. Visit `/fmo/tickets` → toggle "View: Tree" → same grouping from ticket side
5. Visit `/fmo/tickets` → tickets now show WBS and categories, 0 unassigned
   (except ticket #38942 which has 2 WBS — will show with first one)
6. Visit `/fmo/members` → 17 members listed, all type=Extern by default
   - Change Andrea Délceg to Intern → persists on reload
7. Visit `/fmo/utilization` → Stunden tab shows correct hierarchy
   - Verify Barmer hours for Frigyes Babos: 788h total matches `WBS_Based.csv` analysis
8. Switch to Auslastung % tab → employee subtotals all show 100%
9. Re-upload `Barmer.csv` → 0 new entries (all duplicates)

---

## 11. REFERENCE DATA (for manual verification)

**Expected member hours from `WBS_Based.csv` (subset — one WBS filtered):**
- Frigyes Babos: 788.00h
- Norbert Puskas: 430.80h
- Andrea Délceg: 223.25h
- Balázs Hubert: 109.50h
- Norbert Baumgärtner: 82.75h
- Szabolcs Guti: 49.16h

**Employee types (from Mapping sheet):**
Extern: Patrik Jencik, Tom Ritzal, Tarigh Nejat, Horst Kapfenberger, Axel Gaida,
Nikos Mpakaris, Alexey Vorontsov, Thomas Koch, Manuel Buhr, Norbert Baumgärtner,
Frigyes Babos, Norbert Puskas, Ulrich Domröse, Timon Wern, Oliver Schmidhofer,
Britt Waasdorp, Mateusz Piesiak, Jürgen Gschwindl, Szabolcs Guti, Lukas Filip,
Tarek Lutz, Balázs Hubert, Pascal Deserno, Alexej Gerstmaier (check — listed as Intern in Excel)

Intern: Andrea Délceg, Stefan Ljubotina, Lazar Peric, Lukas Grunwald, Patrick Sigart,
Günther Wohlfahrt, Mate Polocz, Di Fei Wang, Oliver Koller, Alexej Gerstmaier

**Unmapped ticket:** #40970 - Schaffrath (DTSEC) - WBS I.05921011.00.01 (IWBS 1011)
→ must appear in Unmapped tab

**Classification spot-checks:**
- `V.05921700.81.03` → Verrechenbar ✓
- `I.05921059.00.01` → Intern/Admin ✓ (IWBS 1059)
- `I.05921099.00.01` → Presales ✓ (IWBS 1099)
- `I.05921069.00.05` → Portfolioentwicklung ✓ (IWBS 1069)
- `I.05921055.00.01` → OPM ✓ (IWBS 1055)
- `I.05921011.00.01` → Unmapped ✓ (IWBS 1011 not in table)
