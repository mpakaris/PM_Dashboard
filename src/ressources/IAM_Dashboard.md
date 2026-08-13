# IAM Dashboard — Therese_Board.xlsx Analysis

Reference document. Extracted from `Therese_Board.xlsx` so future conversations don't need to re-parse the file.

---

## Workbook Overview

| Sheet | Relevant? | Purpose |
|---|---|---|
| `Spent Time` | **Yes — input** | Raw timesheet rows (7,293 data rows for Jan–Jun 2026) |
| `Mapping` | **Yes — seed data** | Three lookup tables used for classification |
| `Auslastung h` | **Yes — target output** | Pivot: hours by employee/category/month |
| `Auslastung %` | **Yes — target output** | Same pivot as %, relative to employee monthly total |
| `Dashboard`, `PIVOT`, `BW IST FC`, etc. | No | Other financial/management views, not in scope |

---

## Spent Time Sheet

**Row count:** 7,293 data rows (plus 1 header row)  
**Period:** Months 1–6 of 2026 (January–June)
**Format:** Legacy 7-column format — no `WBS-Override` column. WBS mapping was
derived post-import from this file. New exports from SecTrack include the
`WBS-Override` column directly (see SecTrack CSV format below).

### Columns (in order)

| # | Column name | Type | Example | Notes |
|---|---|---|---|---|
| 0 | `Date` | datetime | `2026-01-30` | Booking date |
| 1 | `User` | string | `Thomas Koch` | Employee full name |
| 2 | `WBS` | string | `V.05921700.81.03` | Work breakdown structure code |
| 3 | `Spent time` | float | `4.0` | Hours booked |
| 4 | `Buchungskreis` | string | `5921059` | Cost center (optional) |
| 5 | `Activity-Override` | string | `SECEXP` | SAP activity code (optional) |
| 6 | `SAP-Fixtext` | string | free text | (optional) |
| 7 | `Customer` | string | `- Barmer (DTSEC)` | (optional) |
| 8 | `Comment` | string | free text | (optional) |
| 9 | `Task ID (Tasks)` | int | `34976` | (optional) |
| 10 | `Task` | string | `#34976 - BARMER...` | (optional) |
| 11 | `Monat` | int | `1` | **DERIVED** — month number |
| 12 | `Zuordnung MA` | string | `Extern` | **DERIVED** — see classification rules |
| 13 | `WBS Start` | string | `V` | **DERIVED** — `wbs[0]` |
| 14 | `IWBS Zuordnung` | string | `1700` | **DERIVED** — `wbs[6:10]` |
| 15 | `Zuordnung h` | string | `Verrechenbar` | **DERIVED** — see classification rules |

### Unique classification values

- `Zuordnung MA`: `Extern`, `Intern`
- `Zuordnung h`: `Verrechenbar`, `Intern/Admin`, `OPM`, `Portfolioentwicklung`, `Presales`  
  *(Training and Absence are defined in mapping tables but have 0 rows in this dataset — they must still be supported)*

### Unmapped rows

**11 rows** cannot be classified — WBS `I.05921011.00.01` (IWBS code `1011`) is missing from both lookup tables.  
Affected users: `Lukas Grunwald`, `Patrick Sigart`  
These appear as `#N/A` in the original Excel. The app must surface these clearly rather than silently failing.

---

## Classification Rules

Reproduce these exactly — they mirror the Excel formulas in the Spent Time sheet.

### Zuordnung MA (Extern / Intern)

```
zuordnungMA = EMPLOYEE_TABLE[user] ?? "Unknown"
```

Look up `User` in the employee mapping table. If not found, mark as `"Unknown"` and flag the row.

### Classification — Two Types

The app models two independent classification dimensions per WBS code:

**Type 1 — Billing Class** (derived from `wbs[0]`, never overridable):
```
'V' → Billable  (Verrechenbar)
'I' → Internal  (Intern)
```
Additional prefix letters are registered in `FmoMappingStore.billingClasses` when new
WBS types appear.

**Type 2 — Sub-Category** (only applies to I.* entries; V.* entries have no sub-type):
```
wbs_prefix = wbs[0]
if wbs_prefix === 'V': return null  // Billable — no further sub-classification

iwbs_code = wbs.slice(6, 10)        // Excel: MID(WBS, 7, 4)

IWBS auto-derive table:
  '1059' → 'admin'      '8000' → 'admin'
  '1099' → 'presales'   '1069' → 'portfolio'
  '1076' → 'opm'        '1066' → 'opm'
  '1055' → 'opm'        '1056' → 'opm'

Full-code fallback:
  'I.05921059.00.02' → 'training'
  'I.05921059.00.03' → 'absence'

Admin override (subCategoryOverride) takes priority over auto-derive.
null = Unmapped sub-category (surfaces in the Unmapped report tab).
```

Pre-seeded sub-categories (admin can add more in the WBS admin view):

| Slug | Label |
|---|---|
| `admin` | Administration |
| `training` | Training |
| `presales` | Presales |
| `portfolio` | Portfolioentwicklung |
| `opm` | OPM |
| `absence` | Absence |

This mirrors the original Excel formula for reference:
```
=IF(LEFT(WBS,1)="V", "Verrechenbar",
   IFERROR(VLOOKUP(MID(WBS,7,4), IWBS_table, 2, FALSE),
           VLOOKUP(WBS, WBS_table, 2, FALSE)))
```

---

## Mapping Tables (from Mapping sheet)

These are seeded from the Excel. All three must be editable at runtime via the app UI.

### Table 1: Employee → Zuordnung MA

Column headers in Excel: `MA` (col AC), `Zuordnung` (col AD)  
33 employees total.

| Employee | Zuordnung |
|---|---|
| Patrik Jencik | Extern |
| Tom Ritzal | Extern |
| Alexej Gerstmaier | Intern |
| Andrea Délceg | Intern |
| Tarigh Nejat | Extern |
| Horst Kapfenberger | Extern |
| Axel Gaida | Extern |
| Stefan Ljubotina | Intern |
| Lazar Peric | Intern |
| Lukas Grunwald | Intern |
| Patrick Sigart | Intern |
| Nikos Mpakaris | Extern |
| Günther Wohlfahrt | Intern |
| Mate Polocz | Intern |
| Alexey Vorontsov | Extern |
| Thomas Koch | Extern |
| Manuel Buhr | Extern |
| Norbert Baumgärtner | Extern |
| Frigyes Babos | Extern |
| Norbert Puskas | Extern |
| Ulrich Domröse | Extern |
| Timon Wern | Extern |
| Oliver Schmidhofer | Extern |
| Britt Waasdorp | Extern |
| Mateusz Piesiak | Extern |
| Jürgen Gschwindl | Extern |
| Szabolcs Guti | Extern |
| Di Fei Wang | Intern |
| Lukas Filip | Extern |
| Tarek Lutz | Extern |
| Balázs Hubert | Extern |
| Oliver Koller | Intern |
| Pascal Deserno | Extern |

### Table 2: IWBS Code → Category

Column headers in Excel: `IWBS` (col Z), `Zuordnung` (col AA)  
7 entries. IWBS = `wbs.slice(6, 10)` (0-indexed).

| IWBS Code | Category |
|---|---|
| `1099` | Presales |
| `1069` | Portfolioentwicklung |
| `1055` | OPM |
| `1066` | OPM |
| `1056` | OPM |
| `8000` | Intern/Admin |
| `1076` | OPM |

### Table 3: Full WBS Code → Category

Column headers in Excel: `WBS` (col X), `Zuordnung` (col Y)  
3 entries. Fallback when IWBS lookup fails.

| WBS Code | Category |
|---|---|
| `I.05921059.00.01` | Intern/Admin |
| `I.05921059.00.02` | Training |
| `I.05921059.00.03` | Absence |

---

## Target Output: Auslastung h (Hours Pivot)

Equivalent to the `Auslastung h` sheet. Structure:

```
Zuordnung MA (Extern / Intern)
  └── User (employee name)
        └── Zuordnung h (category)    → hours per month
        └── [User] Ergebnis           → employee subtotal per month
  └── [MA group] Ergebnis             → group subtotal per month
Gesamtergebnis                        → grand total per month
```

Columns = month numbers present in the data (currently 1–6, must derive dynamically — no hardcoding).  
Final column = `Gesamtergebnis` (sum across all months for that row).

**Sample data from Excel (Extern group, selected employees):**

| User | Category | M1 | M2 | M3 | M4 | M5 | M6 | Total |
|---|---|---|---|---|---|---|---|---|
| Alexey Vorontsov | Verrechenbar | – | 64 | 120 | 144 | 117 | 64 | 509 |
| Axel Gaida | Verrechenbar | 160 | 174 | 181 | 121 | 136 | 168 | 940 |
| Horst Kapfenberger | Intern/Admin | – | 1.5 | 5 | 8 | 1.5 | – | 16 |
| Horst Kapfenberger | Portfolioentwicklung | – | 1 | – | – | – | – | 1 |
| Horst Kapfenberger | Presales | – | – | – | – | 4.5 | 0.5 | 5 |
| Horst Kapfenberger | Verrechenbar | – | 159 | 156 | 141.5 | 101 | 88.5 | 646 |
| Nikos Mpakaris | Intern/Admin | 12 | 7.5 | 13 | 5 | 3 | 4 | 44.5 |
| Nikos Mpakaris | Verrechenbar | 50 | 63 | 86 | 80.5 | 95 | 118 | 492.5 |

## Target Output: Auslastung % (Percentage Pivot)

Same row/column structure as Auslastung h.  
Values = `category_hours / employee_month_total` (decimal 0–1).  
Employee subtotal rows always = `1.0` (100%) per month.  
Group and grand total subtotals also always = `1.0`.

**Sample (Horst Kapfenberger, Month 2):**  
Total hours month 2 = 161.5  
- Intern/Admin: 1.5 / 161.5 = 0.00929  
- Portfolioentwicklung: 1 / 161.5 = 0.00619  
- Verrechenbar: 159 / 161.5 = 0.98452  

---

## Operations Contracts

Some projects (e.g. Barmer) combine regular T&M work with **fixed-price Operations
contracts**. These must be modelled separately because:

- Team members book hours to Operations tickets in SecTrack — those hours **cost** the
  company (external rate × hours)
- The client **does not pay per hour** for these tickets — billing is a fixed monthly
  contract amount regardless of actual hours booked

### Data model

```typescript
// src/lib/types.ts
interface OperationContract {
  id: string;
  name: string;
  defaultMonthlyAmount: number;             // € per month (baseline)
  monthlyOverrides: Record<string, number>; // "YYYY-MM" → € override
  ticketIds: string[];                      // SecTrack task strings (entries.task)
}
```

`monthlyOverrides` allows the contract value to vary month-by-month. Any month absent
from `monthlyOverrides` uses `defaultMonthlyAmount`.

### Shared utility module

All computations on `OperationContract` live in **one place only**:

```typescript
// src/lib/operationsUtils.ts
export function opAmount(c: OperationContract, month: string): number
export function totalOpsIncome(contracts: OperationContract[], months: string[]): number
export function buildOpTicketSet(contracts: OperationContract[]): Set<string>
```

No other file reimplements these. Components that need them import from
`src/lib/operationsUtils`.

### Revenue formula

```
totalRevenue    = tmRevenue + operationsIncome
tmRevenue       = Σ (hours on NON-ops tickets × billingRate per user)
operationsIncome = totalOpsIncome(contracts, months)   ← from operationsUtils

totalCost       = Σ (ALL hours × costRate per user)    ← ops hours still cost us
netIncome       = totalRevenue − totalCost
```

**Key invariant:** ops ticket hours are excluded from T&M billing but are **never**
excluded from cost. The fixed contract amount is the revenue for ops work — no more,
no less.

**State rule:** `operationTicketSet` and `operationsIncome` always derive from the
server-authoritative prop (`project.operationContracts`), not from local React state.
This ensures a deleted contract immediately restores prior revenue without a state-sync
lag.

### Module structure

Operations code is split into focused, single-responsibility files:

| File | Responsibility |
|---|---|
| `src/lib/types.ts` | `OperationContract` type definition |
| `src/lib/operationsUtils.ts` | Pure helper functions — no React, no DB |
| `src/components/OperationContractModal.tsx` | Shared modal (used by PA + Planning) |
| `src/app/projekt-analysis/[id]/OperationsTab.tsx` | Operations tab UI for Project Analysis |
| `src/app/planning/[id]/ProjectOperationsSection.tsx` | Operations section inside Planning project card |

The shared `OperationContractModal` accepts an optional `tasks` prop — Project Analysis
passes the ticket list for assignment; Forecast Planning omits it (ticket assignment
lives in Project Analysis, not in planning).

### Utilization reporting impact

In `Auslastung h`, hours on Operations tickets still appear under their WBS category
(`Verrechenbar` for Barmer Operations tickets). The T&M vs fixed-price distinction is
captured at the Project Analysis layer, not the WBS layer.

| View | What is shown |
|---|---|
| Auslastung h / % | All hours by WBS category — Operations hours under their WBS, unchanged |
| Project Analysis → Employees | T&M Subtotal row + Operations Income row + Net Total |
| Project Analysis → Operations tab | Contract list, per-month income, assigned ticket pills |
| Project Analysis → Trends | DevOpsMonthlyChart; colour-coded ticket chart; split velocity |
| Forecast Planning | Operations contracts per project card, planned monthly income |

### Barmer example

| Contract | Default monthly amount |
|---|---|
| Operation Contract 1 (IAM Betrieb — Standard) | 20,000 € |
| Operation Contract 2 (IAM Betrieb — Extended) | 10,000 € |

Tickets such as `#34977 - BARMER (DTSEC) SAP IDM Migration` are assigned to these
contracts. Their hours are excluded from hourly billing; they appear in the cost line
only.

---

## WBS → Ticket Hierarchy

The app models a three-level hierarchy derived entirely from existing data:

```
WBS Element  (Kostenstelle — e.g. V.05921700.81.03 "DTSec Barmer IAM Entwicklung")
  └── Ticket  (SecTrack task — one ticket maps to exactly one WBS)
        └── Time Entry  (one row per person/day booking in SecTrack)
```

**Relationship storage rule:** the link is stored on the ticket (`FmoTicket.wbsCode`),
never as a nested structure. The tree is derived by grouping at read time. This keeps
WBS and Ticket independent and avoids synchronisation bugs.

**Data provenance:** every `FmoWbsEntry` and `FmoTicket` carries a `syncSource` field
(`'manual' | 'excel' | 'sectrack' | 'sap'`) and `syncedAt` timestamp. Records seeded
from Therese_Board.xlsx get `syncSource: 'excel'`. Manually added records get
`syncSource: 'manual'`. When a remote API is connected later, records get
`syncSource: 'sectrack'` or `'sap'`. Admins can see provenance in the UI.

**Budget fields:** `FmoWbsEntry.budgetHours` and `budgetValue` are defined in the type
but left `undefined` in the current Excel seed — they will be populated automatically
when a SAP/SecTrack data source provides planned values. No UI change needed at that
point; the columns are already in the WBS table (showing "—" until populated).

### From Therese_Board.xlsx

The hierarchy is seeded from two sheets in one upload via `ExcelDataSource`:

| Sheet | What is extracted |
|---|---|
| `Mapping` | WBS code → label, category (seeds `FmoWbsEntry`) |
| `Spent Time` | Task ID + WBS per row → unique ticket→WBS pairs (seeds `FmoTicket`) |

The `seedFromDataSource` action (US-021) is idempotent: admin-overridden WBS
assignments on tickets are never overwritten by a re-upload.

### Future: Remote Data Source

When SecTrack or SAP connectivity is available, a `RemoteDataSource` class is added to
`src/lib/wbsDataSource.ts` implementing the same `WbsDataSource` interface. The import
page automatically shows a "Sync now" button for it. No action or UI code changes.

---

## SecTrack CSV Format (Extended — Current)

The extended CSV export from SecTrack resolves the previous requirement to separately
seed ticket→WBS mappings from this Excel file. **Use the extended format going forward.**

```
Project, Task, Date, User, Activity, Comment, Spent time,
WBS-Override, Billing Type, Customer, Task ID (Tasks)
```

Key columns added over the legacy format:

| Column | Example | Impact |
|---|---|---|
| `WBS-Override` | `V.05921700.81.01` | WBS code per entry — eliminates Excel ticket→WBS seeding for new uploads |
| `Billing Type` | `""` or `"Fixprice"` | Identifies fixed-price / Operations entries directly from SecTrack |
| `Customer` | `- Barmer (DTSEC)` | Customer context per entry |
| `Task ID (Tasks)` | `40116` | Numeric ticket ID as explicit column (preferred over regex extraction) |

**Fixprice entries** (`Billing Type = "Fixprice"`) are excluded from T&M hourly
billing; their revenue is covered by the fixed-price Operations Contract monthly amount.
The `billingType` field on `FmoEntry` is the ground truth for this distinction.

The Excel file (`Therese_Board.xlsx`) is now only needed for:
1. WBS labels — the CSV has codes (`V.05921700.81.01`) but not names
   (`DTSec Barmer IAM Betrieb`)
2. Employee classification (Intern/Extern) from the Mapping sheet
3. Backfilling legacy entries exported in the old 7-column format

---

## Deduplication Key

For upsert / duplicate detection on import:

```
key = `${date}|${user}|${wbs}|${taskId}|${spentTime}`
```

Where `taskId` is `Task ID (Tasks)` column. If Task ID is absent, omit it from the key (use empty string).

---

## Row Count / Scale

- Current dataset: 7,293 rows (Jan–Jun 2026)
- Expected growth: ~1,200 rows/month
- Storage backend: Upstash Redis (existing pattern in codebase)
- At ~250 bytes/row JSON, 7,293 rows ≈ 1.8 MB — near Upstash free-tier per-value limit (1 MB)
- **Risk:** May need chunked storage or compression for multi-year accumulation. Note this during implementation.
