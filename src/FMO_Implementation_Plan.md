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

**SecTrack CSV format** (7 columns, see `src/ressources/Barmer.csv` as reference):
```
Project | Task | Date | User | Activity | Comment | Spent time
```
- Date format: `DD/MM/YYYY` (e.g. `31/07/2026`)
- Task format: `#XXXXX - description` (e.g. `#34977 - BARMER (DTSEC) SAP IDM Migration`)
- Activity values: `Work` | `Operations`
- Spent time: float string (e.g. `"8.00"`, `"0.25"`)

**Therese_Board.xlsx** (`src/ressources/Therese_Board.xlsx`) is used for one-time seeding:
- `Spent Time` tab, col[9]=Task ID, col[2]=WBS → seeds Ticket→WBS mapping (70 tickets)
- `Mapping` tab → seeds Employee types and WBS classification tables

**Scale:** ~3,000 rows per monthly SecTrack CSV upload.

---

## 3. TECH STACK (no new dependencies)

- **Framework:** Next.js 16.2.1, React 19, TypeScript
- **Storage:** Upstash Redis via `@upstash/redis` (existing `src/lib/db.ts` pattern)
- **CSV/Excel parsing:** `xlsx` package (already in `package.json`)
- **Styling:** Tailwind CSS v4
- **Charts:** `recharts` (already in `package.json`)
- **Pattern:** Server Components fetch data → pass to `'use client'` components.
  Server actions in `src/actions/` use `'use server'`.

---

## 4. DATA MODEL

Add to **`src/lib/types.ts`** (append only — never modify existing types):

```typescript
// ─── FMO Types ────────────────────────────────────────────────────────────────

export interface FmoWbsEntry {
  code: string;          // e.g. "I.05921059.00.01" or "V.05921700.81.03"
  label: string;         // human name, e.g. "IAM Administration"
  category: string;      // auto-derived or overridden: "Intern/Admin" | "Verrechenbar" | etc.
  categoryOverride?: string; // if admin manually set a different category
}

export interface FmoTicket {
  id: number;            // e.g. 34977
  name: string;          // e.g. "BARMER (DTSEC) SAP IDM Migration 2025/2026 - DevOps"
  project: string;       // SecTrack project name
  wbsCode: string | null;     // assigned WBS (null = unassigned)
  category: string | null;    // derived from WBS via classify(); null if unassigned
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
  wbsCode: string | null;
  category: string | null;
}

// Dedup key formula:
// `${date}|${user}|${ticketId ?? ticketName}|${activity}|${spentTime}`

export interface FmoImportStats {
  added: number;
  duplicates: number;
  newTickets: number;    // tickets not previously seen
  newMembers: number;    // members not previously seen
  unmapped: number;      // entries where ticket has no WBS assigned
}

export interface FmoStore {
  entries: FmoEntry[];
  lastUpload: string;    // ISO timestamp
  sources: string[];     // filenames uploaded so far
  importStats: FmoImportStats;
}

export interface FmoMappingStore {
  wbs: Record<string, FmoWbsEntry>;        // keyed by WBS code
  tickets: Record<string, FmoTicket>;      // keyed by ticket ID string
  members: Record<string, FmoMember>;      // keyed by member.id (slugified name)
}
```

---

## 5. CLASSIFICATION LOGIC

Create **`src/lib/fmoClassify.ts`** (new file, pure functions — no DB, no side effects):

```typescript
import { FmoWbsEntry } from './types';

// Derives category from WBS code using IWBS rules.
// wbsTable is the live admin-managed table (from FmoMappingStore.wbs).
export function classifyWbs(code: string, wbsTable: Record<string, FmoWbsEntry>): string {
  if (!code) return 'Unmapped';

  // Admin override takes priority
  if (wbsTable[code]?.categoryOverride) return wbsTable[code].categoryOverride!;

  // V.* prefix → always Verrechenbar
  if (code.startsWith('V.')) return 'Verrechenbar';

  // IWBS lookup: characters 6–10 (0-indexed), equivalent to Excel MID(WBS,7,4)
  const iwbs = code.slice(6, 10);
  const iwbsMap: Record<string, string> = {
    '1059': 'Intern/Admin',
    '1099': 'Presales',
    '1069': 'Portfolioentwicklung',
    '1076': 'OPM',
    '1066': 'OPM',
    '1055': 'OPM',
    '8000': 'Intern/Admin',
  };
  if (iwbsMap[iwbs]) return iwbsMap[iwbs];

  // Full WBS fallback
  const fullMap: Record<string, string> = {
    'I.05921059.00.02': 'Training',
    'I.05921059.00.03': 'Absence',
  };
  return fullMap[code] ?? 'Unmapped';
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

## 6. DATABASE LAYER

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

## 7. USER STORIES

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

**Story:** As an admin, I want to see a list of all known WBS codes with their categories
so I understand how time entries are classified.

**Dependencies:** US-001, US-002

**Acceptance Criteria:**
- [ ] `/fmo/wbs` page loads and shows a table of WBS entries
- [ ] On first visit (empty Redis), `seedWbsEntries()` is called automatically and
      the 22 seed entries are saved and displayed
- [ ] Table columns: WBS Code | Label | Category | Actions
- [ ] Category is colour-coded: Verrechenbar=green, Intern/Admin=slate,
      Presales=blue, OPM=orange, Portfolioentwicklung=purple, Training=yellow,
      Absence=red, Unmapped=rose
- [ ] "Unmapped" rows (like `I.05921011.00.01`) are visually highlighted with a
      warning badge

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

### US-004 · WBS — Add / Edit / Delete WBS Entry

**Story:** As an admin, I want to add new WBS codes, edit their labels, and delete
unused ones so the classification table stays current as the business evolves.

**Dependencies:** US-003

**Acceptance Criteria:**
- [ ] "Add WBS" button opens an inline form (not a modal) at the top of the table
- [ ] Form fields: WBS Code (text), Label (text)
- [ ] Category is auto-derived on save via `classifyWbs()` and displayed as read-only
- [ ] Saving an empty or duplicate WBS code shows an inline error, no crash
- [ ] Each row has an "Edit" button that makes the Label field inline-editable
- [ ] Each row has a "Delete" button with a `window.confirm()` confirmation
- [ ] After any change, the page re-fetches and shows updated data

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
entries are parsed, classified, and stored without manual work.

**Dependencies:** US-001, US-003

**Acceptance Criteria:**
- [ ] `/fmo/import` page has a drag-and-drop zone that also accepts a file picker
- [ ] Accepts `.csv` files only (multiple files in one batch)
- [ ] Required columns checked: `Project`, `Task`, `Date`, `User`,
      `Activity`, `Spent time` — if any missing, show error per file, skip it
- [ ] Column matching is case-insensitive and trims whitespace
- [ ] Each row is parsed: date `DD/MM/YYYY`→`YYYY-MM-DD`, ticket ID extracted from
      Task string via regex `^#(\d+)\s*-\s*(.+)`, Spent time parsed as float
- [ ] Dedup key per entry: `` `${date}|${user}|${ticketId ?? ticketName}|${activity}|${spentTime}` ``
- [ ] Existing entries with the same dedup key are skipped (not duplicated)
- [ ] New tickets found in the CSV are added to `FmoMappingStore.tickets` with
      `wbsCode: null` (unassigned)
- [ ] New users found are added to `FmoMappingStore.members` with
      `type: 'extern'` (default — admin can change later), `costRate: 0`
- [ ] WBS classification is applied immediately: if ticket has a WBS assigned,
      the entry gets `wbsCode` and `category` set; otherwise both are `null`
- [ ] After upload, an import summary shows:
      N entries added | N duplicates skipped | N new tickets (need WBS) |
      N new members | N unmapped entries

**Files to create:**
- `src/app/fmo/import/page.tsx` — server component shell
- `src/app/fmo/import/ImportClient.tsx` — `'use client'` upload UI

**New action to add to `src/actions/fmo.ts`:**
```typescript
export async function uploadFmoCSV(formData: FormData) {
  // 1. Read all files from formData (field name: 'files')
  // 2. For each file:
  //    a. Parse with XLSX.read(buffer, {type:'buffer'}), sheet_to_json
  //    b. Normalise column names (case-insensitive match)
  //    c. Validate required columns; return error if missing
  //    d. Parse rows into FmoEntry objects
  //    e. Upsert entries into FmoStore (skip duplicates by dedup key)
  //    f. Upsert new tickets into FmoMappingStore.tickets
  //    g. Upsert new members into FmoMappingStore.members
  //    h. Apply WBS classification to entries via ticket lookup
  // 3. Save FmoStore and FmoMappingStore
  // 4. Return FmoImportStats
}
```

**Required columns check:**
```typescript
const REQUIRED = ['project', 'task', 'date', 'user', 'activity', 'spent time'];
const header = Object.keys(rows[0]).map(k => k.toLowerCase().trim());
const missing = REQUIRED.filter(r => !header.some(h => h.includes(r)));
if (missing.length) return { ok: false, error: `Missing columns: ${missing.join(', ')}` };
```

**UI layout for `/fmo/import`:**
```
┌─────────────────────────────────────────────────────┐
│  Import SecTrack Data                                │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │                                               │  │
│  │   Drag & drop CSV files here, or click       │  │
│  │              [Choose files]                   │  │
│  │                                               │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  [Upload X files]  ← button, disabled until files   │
│                       are selected                  │
│                                                     │
│  Last import: 2026-08-11 16:30  (or "Never")        │
│  Files imported: [list of source filenames]         │
│                                                     │
│  ── Last import result ──────────────────────────── │
│  ✓ 2,131 entries added                              │
│  ⊘ 0 duplicates skipped                             │
│  ⚠ 3 new tickets need WBS assignment → [Go to Tickets]│
│  + 2 new members added → [Go to Members]            │
│  ✗ 11 entries unmapped → [Go to Utilization]        │
└─────────────────────────────────────────────────────┘
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

## 8. IMPLEMENTATION ORDER

Execute user stories in this exact order:

| Order | Story | Reason |
|---|---|---|
| 1 | US-001 | Foundation — all others depend on it |
| 2 | US-002 | Sidebar navigation |
| 3 | US-003 | WBS seed + list (needed before import classifies) |
| 4 | US-004 | WBS CRUD |
| 5 | US-005 | SecTrack CSV upload (core import) |
| 6 | US-006 | Seed from Excel (pre-fills ticket→WBS) |
| 7 | US-007 | Ticket list |
| 8 | US-008 | Ticket WBS assignment |
| 9 | US-009 | Member list |
| 10 | US-010 | Member edit |
| 11 | US-011 | Member bar chart |
| 12 | US-012 | Auslastung h |
| 13 | US-013 | Auslastung % |
| 14 | US-014 | Unmapped tab |
| 15 | US-015 | Reclassify all |

---

## 9. VERIFICATION (end-to-end)

After implementing all stories:

1. `npm run dev` — starts without errors
2. Visit `/fmo/wbs` → 22 WBS codes auto-seeded, categories correct
3. Visit `/fmo/import` → upload `src/ressources/Barmer.csv`
   - Result: 3,007 entries added, 0 duplicates, 0 new members (wait — Barmer has
     17 users who should be auto-added), some tickets unassigned
4. Upload `src/ressources/Therese_Board.xlsx` via "Seed from Excel"
   - Result: 70 ticket→WBS mappings seeded, entries reclassified
5. Visit `/fmo/tickets` → tickets now show WBS and categories, 0 unassigned
   (except ticket #38942 which has 2 WBS — will show with first one)
6. Visit `/fmo/members` → 17 members listed, all type=Extern by default
   - Change Andrea Délceg to Intern → persists on reload
7. Visit `/fmo/utilization` → Stunden tab shows correct hierarchy
   - Verify Barmer hours for Frigyes Babos: 788h total matches `WBS_Based.csv` analysis
8. Switch to Auslastung % tab → employee subtotals all show 100%
9. Re-upload `Barmer.csv` → 0 new entries (all duplicates)

---

## 10. REFERENCE DATA (for manual verification)

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
