# FMO Module — Architecture

FMO ("Field Management Office") is the SecTrack timesheet analysis module. It imports CSV exports from SecTrack and derives per-member utilization, per-WBS profitability, and per-project financials.

---

## Data Storage

All FMO data lives in two Redis keys, never touching the keys owned by ELSAP/Invoicing/Subcontractors:

| Redis key | Type | Contains |
|---|---|---|
| `app:fmo` | JSON | `FmoStore` — raw time entries + import stats |
| `app:fmo-mappings` | JSON | `FmoMappingStore` — WBS codes, tickets, members, sub-categories |

**Protected keys (never read or write from FMO code):**
`app:db` · `app:elsap` · `app:invoicing` · `app:subcontractors` · `app:timesheets` · `app:projekt-analysis`

---

## Core Types

```
FmoEntry          — one time-booking row (date, user, ticket, hours, wbsCode, billingClass, subCategory)
FmoWbsEntry       — WBS code master record (code, label, billingClass, subCategoryOverride, budgetHours, budgetValue)
FmoTicket         — ticket master (id, name, wbsCode, billingClass, subCategory)
FmoMember         — team member (costRate, type intern/extern, capacity targets)
FmoProject        — project definition (wbsCodes[], ticketIds[], memberRates, operationContracts)
FmoMappingStore   — the whole reference layer (wbs, tickets, members, subCategories)
```

---

## Data Flow

```
SecTrack CSV export
        │
        ▼
importFmoSecTrack() ──► parse rows (extended 11-col or legacy 7-col format)
        │                 extract ticketId, ticketName, date, user, wbsCode, billingClass
        │
        ▼
classifyWbs(code, wbsTable)
        │  billingClass = code[0]           ('V' = billable, 'I' = internal)
        │  subCategory  = IWBS lookup       (chars 6–10 → admin/presales/opm/portfolio)
        │               + full-code lookup  (specific I.* entries)
        │               + subCategoryOverride (manual admin override wins last)
        ▼
FmoEntry rows written to app:fmo (dedup by id = date|user|ticketId|activity|spentTime)
        │
        ▼
FmoMappingStore updated in app:fmo-mappings
        ├─ new WBS codes auto-registered from entries
        ├─ new tickets auto-registered and linked to their WBS
        └─ new members auto-registered

        ▼ (read path — no writes)

WbsClient / MemberDetailClient / ProjectDetailClient
        │
        ├─ filter entries by date range (chartRange / ticketRange)
        ├─ join entries → wbsEntry → project (via entryBelongsToProject)
        ├─ compute cost:    spentTime × rateAtMonth(member.costRate, history, month)
        ├─ compute revenue: spentTime × billingRate (T&M) or implied rate (FP)
        └─ render charts / tables
```

---

## WBS Classification

`classifyWbs(code, wbsTable)` in `src/lib/fmoClassify.ts`:

- **Billing class** (`V` / `I`): the first character of the code, always. Never overridable — it's contractual.
- **Sub-category** (only for `I.*` codes): checked in priority order:
  1. `subCategoryOverride` on the WBS master record (admin sets this in the UI)
  2. IWBS digits (chars 6–10): `1059`→admin, `1099`→presales, `1069`→portfolio, `1076/1066/1055/1056`→opm
  3. Full-code lookup table for specific standard entries (training, absence)
  4. `null` → shown as "Unmapped" in the UI

An unmapped internal WBS can be fixed by opening the Edit modal in WBS Codes and setting a sub-category override.

---

## Billing Calculations

**T&M projects:**
```
revenue = Σ (spentTime × billingRate)
billingRate = project.memberRates[memberId].billingRate
            → resolved via rateAtMonth() to support rate history per member per project
```

**Fixed-price projects:**
```
impliedRate = (contractValue + approvedChanges) / budgetHours
revenue = Σ (spentTime × impliedRate)   // distributes proportionally by hours
```

**Cost (all project types):**
```
cost = Σ (spentTime × costRate)
costRate = member.costRate → resolved via rateAtMonth() for historical rate changes
```

**Operations contracts (flat-fee):**
- `fixprice` ops contracts: monthly flat fee distributed regardless of hours; revenue credited to the Ops category
- `hourly` ops contracts: treated like T&M

---

## Entry–Project Matching

`entryBelongsToProject(entry, project)` in `src/lib/utils.ts`:

An entry is matched to a project if:
- Its `wbsCode` is in `project.wbsCodes` AND its `ticketId` is not in `project.excludedTicketIds`
- OR its `ticketId` is in `project.ticketIds` (explicit extra-ticket list)

Entries without a wbsCode or ticketId fall through to "No WBS / no project" in profitability views.

---

## CSV Import Formats

SecTrack exports two variants; the parser auto-detects by checking for a `WBS-Override` column header:

**Extended (11 columns — preferred):**
`Project, Task, Date, User, Activity, Comment, Spent time, WBS-Override, Billing Type, Customer, Task ID (Tasks)`

**Legacy (7 columns):**
`Project, Task, Date, User, Activity, Comment, Spent time`

In the legacy format, WBS assignment falls back to the ticket master record (`FmoTicket.wbsCode`).

---

## Protected Areas

These modules must never be modified by FMO changes:

- `src/app/elsap/` — ELSAP billing pipeline
- `src/app/invoicing/` — invoicing UI
- `src/app/subinvoices/` — subcontractor invoices
- `src/actions/elsap.ts`, `invoicing.ts`, `subcontractors.ts`

---

## Excel Seed (one-time)

`Therese_Board.xlsx` in `src/ressources/` is used only for the initial WBS label seed and backfilling legacy entries that lack WBS codes. The import flow is in `importFmoFromExcel()` in `src/actions/fmo.ts`.
