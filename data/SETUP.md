# T2 setup steps (Google Sheets — manual, tied to your Google account)

## 0c. Filled the Restricted sheet — do NOT commit this file (2026-07-29)

`data/restricted-sheet-seed.csv` is now populated with real content from
`Connaissance_YvesRocher.md`: `performance_notes` for 19 struggling stores
(the "Groupe A/B" loss/high-fixed-cost list — figures, action plans) and
`other_sensitive_notes` for 4 stores with an interrupted franchise
cooperation (brand standards non-compliance).

**This file is git-ignored and was removed from tracking** — the
`yr-store-map` GitHub repo is **public**, and this content should never
enter git history (even though the live map never fetches this sheet,
anyone can browse a public repo's files directly). Copy this file's
content into the **Restricted tab** of your Google Sheet yourself
(normal Google Sheets sharing, not "publish to web" — see step 5 below
for why that distinction matters). If you ever need to share this file
with me again, don't put it in this git-tracked project folder.

I generated the data files; these steps need your Google account and are quick
(~10-15 min total). Everything below implements the "Data Sensitivity Split"
from the design doc.

## 0b. Data refresh from weekly reporting (2026-07-29)

Merged from `Reporting Hebdo BNL - S31 new.xlsx`: `Regional_Sector` (RS,
18 stores reassigned), `Ownership_Type` (Statut: FP/FRO/FR — filled for
all stores, not FP/FR/FG as originally assumed), and `Presence_Institut`
(derived as Yes/No from the "CA INSTITUTS" column being >0 — 23 stores
have one). **Halle (code 021) removed** — the report marked it "Fermé"
(closed), confirmed by Cyril. Down to 81 active stores.

You'll need to make the same changes on the live Sheet: delete row 021,
and update `Regional_Sector`/`Ownership_Type`/`Presence_Institut` for the
remaining 81 rows from `data/ops-sheet-seed.csv` (now the source of truth
for this refresh).

## 0. Sync note (2026-07-27)

You've been editing the live Ops sheet directly since these steps were first
written (real addresses filled in, columns renamed/added). `logic.js` and
`data/ops-sheet-seed.csv` were resynced to match the live sheet's actual
current column names — some are capitalized differently than the original
plan below (`Ownership_Type`, `Partner_name`, `Surface_sqm`, not the
lowercase names in earlier steps), `area_manager` is now `Regional_Sector`,
`manager_contact` is now `Directeur` (a duplicate `Director` column was
dropped, per your choice), and a new `Presence_Institut` column was added
by you directly. The steps below are kept for historical context — trust
this note and the actual live sheet over the older step-by-step column
names where they conflict.

## 1. Create the Sheet

1. Create a new Google Sheet — e.g. "YR Store Map - Data".
2. Rename the first tab to `Ops`.
3. File > Import > Upload `data/ops-sheet-seed.csv` > Import location:
   "Replace current sheet". This gives you all 82 stores with `province`
   already filled in (computed offline from each store's city — verified by
   parsing all 82 rows with zero skipped/invalid entries).
4. Add a second tab, rename it to `Restricted`.
5. File > Import > Upload `data/restricted-sheet-seed.csv` into that tab
   (same "replace current sheet" import, but into the `Restricted` tab).

## 2. Resolve the manager_contact decision (do this before filling that column)

The design doc flagged this explicitly — it's not a "low sensitivity" fact,
it's a judgment call: publishing an individual employee's name is personal
data (GDPR, Belgium/Luxembourg are EU). Decide one of:
- Use a role-based contact instead (store phone number or a generic email),
- or confirm with HR/legal that publishing manager names on an unlisted
  URL is acceptable.

**Don't fill in `manager_contact` until this is decided** — leave it blank
in the meantime.

## 3. Add the auto-timestamp script (updated_at)

1. In the `Ops` tab: Extensions > Apps Script.
2. Delete the placeholder code, paste in `data/apps-script-updated-at.gs`.
3. Save (name the project anything, e.g. "yr-store-map-timestamps").
4. **Do not click Run in the toolbar** — Google only supplies the edit
   event to `onEdit` on a real edit, so a manual run always throws
   `Cannot read properties of undefined (reading 'source')`. That's expected,
   not a bug — just skip straight to step 5.
5. Test it directly: edit any cell in a data row (not the header — e.g.
   change a store's `hours`), confirm that row's `updated_at` cell fills in
   with an ISO timestamp. This script only touches its own spreadsheet, so
   Google runs it with no authorization prompt at all.

## 4. Set the Sheet's locale explicitly

File > Settings > Locale — set to a locale that uses `.` as the decimal
separator (e.g. United States) to reduce the comma-decimal risk at the
source. `logic.js` already sanitizes this defensively either way, but
fixing the locale means fewer rows ever need that fallback.

## 5. Publish the Ops tab (NOT the Restricted tab)

1. File > Share > Publish to web.
2. Select the `Ops` tab specifically (not "Entire document").
3. Format: **Comma-separated values (.csv)**.
4. Click Publish, confirm the warning about public access — this is expected
   and matches the Data Sensitivity Split (unlisted URL, ops-level data only).
5. Copy the resulting URL. This is what T3's `fetchOpsData()` will fetch.

**Do NOT publish the Restricted tab.** Share it only via normal Google Sheets
sharing (Share button, specific people) with yourself and any trusted
colleagues who need performance/sensitive notes.

## 6. Day-0 spike (validates Next Steps #1)

1. Open the published CSV URL from step 5 in a browser tab — confirm it
   loads as plain CSV, not an HTML page or an error.
2. Edit one test cell in the `Ops` tab (e.g. change a store's `hours`).
3. Hard-refresh the published CSV URL and time how long until the edit
   shows up. This measures the real edit-to-visible latency the whole
   "colleague edits sheet, map updates" success criterion depends on —
   the design doc flagged this as unverified until measured.

Report back what you find (the published CSV URL — needed for T3 — and the
measured latency) and I'll wire it into `index.html`.

## 6b. New columns: area_manager and ca_2025 (2026-07-27)

Two more columns added to `data/ops-sheet-seed.csv`, filled in from
`BELGIUM - 202606 - Scorecard_shop.xlsx` (all 82 stores matched by code,
zero mismatches): `area_manager` (the assigned area manager's first name)
and `ca_2025` (exact 2025 turnover in euros). Cyril explicitly accepted
the sensitivity tradeoff on both — a real employee's first name (GDPR,
same class of concern as `manager_contact`) and an exact per-store revenue
figure (more precise than the profitability tier already accepted) are
now going on the **published** Ops sheet.

Your live Ops sheet was created before these columns existed — add
`area_manager` and `ca_2025` as new columns (any position, `logic.js`
matches by header name not position) before pasting the updated CSV data.

## 6c. Prepared (empty) columns for future data (2026-07-27)

Eight more columns added to `data/ops-sheet-seed.csv`, currently empty —
prepared ahead of time per Cyril's request, so filling them in later needs
no further code changes:

| Column | Meaning | Type |
|---|---|---|
| `ca_2026_target` | 2026 turnover target (€) | number |
| `ca_2026_actual` | 2026 turnover actual (€) | number |
| `ca_2027_target` | 2027 turnover target (€) | number |
| `ca_2027_actual` | 2027 turnover actual (€) | number |
| `ownership_type` | `FP` (fond propre) / `FR` (franchise partenaire) / `FG` (gérance) | text |
| `partner_name` | Franchise/gérance partner name | text |
| `surface_sqm` | Store surface, m² | number |
| `format_type` | `LAB` (laboratoire) / `ACV` (Atelier cosmétique végétal) | text |

**`partner_name` sensitivity flag, not yet resolved:** this is the same
class of concern as `manager_contact`/`area_manager` — potentially an
identifiable person or a named business relationship. It's currently
empty, so nothing is exposed yet, but when you're ready to fill it in,
flag it explicitly again before publishing real values (same pattern as
the other two).

Add these 8 columns to your live Ops sheet whenever convenient — they can
stay empty for a while with no effect (all render as "not shown" in the
info panel, same as any other blank field).

## 7. Add the profitability_pct column to your existing Ops tab

Your live Ops sheet was created before this column existed. Add a new
column at the end named `profitability_pct` — a percentage, can be
negative (e.g. `-7.5`, `12`, `22.3`). This drives the marker color on the
map (see step 8) and replaces province-based coloring entirely — province
stays visible in the info panel, it's just no longer the color source.

## 8. ProfitabilityTiers tab (lets you change thresholds/colors without touching code)

1. Add a new tab, rename it to `ProfitabilityTiers`.
2. File > Import > Upload `data/profitability-tiers-seed.csv` into that tab
   (same "replace current sheet" import). This seeds the 4 confirmed tiers:

   | label | max_percent | color | meaning |
   |---|---|---|---|
   | Loss | -5 | #000000 (black) | below -5% |
   | Break-even | 5 | #e6194b (red) | -5% up to (not including) 5% |
   | Moderate | 15 | #f58231 (orange) | 5% up to (not including) 15% |
   | Strong | *(empty)* | #3cb44b (green) | 15% and above |

   `max_percent` is the upper bound of that tier (a store's percentage
   belongs to the first row, top to bottom by max_percent, whose bound is
   greater than its value). Leave `max_percent` empty on exactly one row
   (the highest tier) to mean "and above, no upper bound" — that's what
   `Strong` does above. Edit any threshold or any color (any CSS hex:
   `#rgb`, `#rrggbb`, or with alpha `#rrggbbaa`) to change the map. A row
   with an invalid color is silently skipped rather than breaking the map.
3. File > Share > Publish to web > select the `ProfitabilityTiers` tab >
   format CSV > Publish. Copy the URL.

Send me that URL and I'll drop it into `PROFITABILITY_TIERS_URL` in
`index.html`. Until then the map uses the hardcoded default tiers above —
nothing breaks, this whole feature degrades gracefully if skipped.
