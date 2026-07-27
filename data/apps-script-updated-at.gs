// Paste into Extensions > Apps Script in the Ops Sheet, then save.
// Do NOT try to "Run" this manually from the toolbar — Google only
// supplies the edit event `e` on a real edit, so a manual run always
// throws "Cannot read properties of undefined (reading 'source')".
// This function only reads/writes the sheet it's bound to, which Google's
// "simple trigger" rules allow with no authorization prompt at all — just
// edit a cell in a data row and it fires automatically.
//
// Stamps the `updated_at` cell of whichever row was just edited — not a
// single global cell — so a future per-store staleness view has real data,
// while the map's "data as of" banner (built in T3) just takes the max
// across all rows.
function onEdit(e) {
  if (!e || !e.range || !e.source) return; // guard against manual/non-edit invocation

  var sheet = e.source.getActiveSheet();
  if (sheet.getName() !== 'Ops') return; // rename here if your tab isn't called "Ops"

  var headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var updatedAtCol = headerRow.indexOf('updated_at') + 1;
  if (updatedAtCol === 0) return; // no updated_at column found — nothing to stamp

  var editedRow = e.range.getRow();
  if (editedRow === 1) return; // header row edited, ignore
  if (e.range.getColumn() === updatedAtCol) return; // don't re-trigger on our own write

  sheet.getRange(editedRow, updatedAtCol).setValue(new Date().toISOString());
}
