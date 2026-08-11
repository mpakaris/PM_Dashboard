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

### Zuordnung h (Activity Category)

```
wbs_prefix = wbs[0]           // first character, e.g. "V" or "I"
iwbs_code  = wbs.slice(6, 10) // Excel: MID(WBS, 7, 4), e.g. "1700" or "1059"

if wbs_prefix === "V":
    return "Verrechenbar"
else:
    result = IWBS_TABLE[iwbs_code]
    if result: return result
    result = WBS_TABLE[wbs]
    if result: return result
    return "Unmapped"
```

This mirrors the original Excel formula:
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
