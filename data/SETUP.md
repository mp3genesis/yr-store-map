# T2 setup steps (Google Sheets — manual, tied to your Google account)

I generated the data files; these steps need your Google account and are quick
(~10-15 min total). Everything below implements the "Data Sensitivity Split"
from the design doc.

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
