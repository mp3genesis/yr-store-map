// Pure data logic for the Yves Rocher BE/LU store map.
//
// Loaded in production as a plain <script type="module" src="logic.js"> tag
// (no bundler) and imported directly by Vitest in tests — same code, two
// loaders. PapaParse is injected rather than `import`-ed so this file never
// assumes a bundler is present: production gets it from window.Papa (CDN
// script tag), tests pass in the papaparse npm package explicitly.

const CACHE_KEY = 'yr-store-map:cache:v1';

// Generic numeric parser handling Google Sheets' locale-dependent comma
// decimal separator (e.g. "50,85" or "-5,5"). Returns null for anything
// that doesn't parse to a finite number. Used for coordinates and for the
// profitability percentage — same locale risk either way.
export function sanitizeNumber(raw) {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim();
  if (str === '') return null;
  const normalized = str.replace(',', '.');
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

// Kept as a named export (existing callers/tests depend on this name) —
// coordinates are just numbers with the same comma-decimal risk.
export function sanitizeCoordinate(raw) {
  return sanitizeNumber(raw);
}

// A cell counts as "present" only if it has real content — empty string and
// whitespace-only are treated the same as a missing key, so the info panel
// can render "field is absent" uniformly regardless of which shape the gap
// takes in a half-filled Sheet row.
export function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function cleanField(row, key) {
  return hasValue(row[key]) ? String(row[key]).trim() : null;
}

// Turns raw parsed rows (objects keyed by CSV header) into a clean store
// list. Skips — rather than crashes on — any row missing a code, missing/
// invalid coordinates, or reusing a code already seen earlier in the sheet.
export function parseStores(rows) {
  const seenCodes = new Set();
  const stores = [];
  const skipped = [];

  for (const row of rows || []) {
    const code = cleanField(row, 'code');
    if (!code) {
      skipped.push({ row, reason: 'missing code' });
      continue;
    }
    if (seenCodes.has(code)) {
      skipped.push({ row, reason: `duplicate code: ${code}` });
      continue;
    }
    const lat = sanitizeCoordinate(row.lat);
    const long = sanitizeCoordinate(row.long);
    if (lat === null || long === null) {
      skipped.push({ row, reason: 'missing/invalid coordinates' });
      continue;
    }

    seenCodes.add(code);
    stores.push({
      code,
      lat,
      long,
      name: cleanField(row, 'name'),
      province: cleanField(row, 'province'),
      address: cleanField(row, 'address'),
      hours: cleanField(row, 'hours'),
      phone: cleanField(row, 'phone'),
      managerContact: cleanField(row, 'manager_contact'),
      updatedAt: cleanField(row, 'updated_at'),
      // Number or null (not a cleanField string) — a raw percentage, can be
      // negative. Drives marker color via getProfitabilityColor().
      profitabilityPct: sanitizeNumber(row.profitability_pct),
    });
  }

  return { stores, skipped };
}

// Parses raw ops-sheet CSV text into a clean store list. `PapaLib` defaults
// to the global `Papa` set by the CDN <script> tag in production; tests pass
// the papaparse npm package explicitly.
export function parseCSVText(csvText, PapaLib = (typeof Papa !== 'undefined' ? Papa : undefined)) {
  if (!PapaLib) {
    throw new Error('parseCSVText: PapaParse not available (pass PapaLib explicitly, or load it via <script> before this file runs)');
  }
  const parsed = PapaLib.parse(csvText, { header: true, skipEmptyLines: true });
  return parseStores(parsed.data);
}

export const DEFAULT_MARKER_COLOR = '#666666';

// Accepts #rgb, #rgba, #rrggbb, #rrggbbaa — anything a browser can use
// directly as a CSS color. Deliberately permissive about case.
export function isValidHexColor(value) {
  return typeof value === 'string' && /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value.trim());
}

// Fallback tiers, used whenever the ProfitabilityTiers sheet is unavailable
// or a row fails validation. Also the starting point seeded into that sheet
// — see data/profitability-tiers-seed.csv. Sorted ascending by maxPercent;
// the last tier's maxPercent is null, meaning "and above" (no upper bound).
// A store's percentage falls into the first tier (in this order) whose
// maxPercent is null or greater than the value — so [-Inf,-5) -> Loss,
// [-5,5) -> Break-even, [5,15) -> Moderate, [15,+Inf) -> Strong.
export const DEFAULT_PROFITABILITY_TIERS = [
  { label: 'Loss', maxPercent: -5, color: '#000000' },
  { label: 'Break-even', maxPercent: 5, color: '#e6194b' },
  { label: 'Moderate', maxPercent: 15, color: '#f58231' },
  { label: 'Strong', maxPercent: null, color: '#3cb44b' },
];

// Returns the color for a given profitability percentage, per the ordered
// tier list (ascending maxPercent, last tier's maxPercent is null = no
// upper bound). Missing/invalid data (null, NaN, non-numeric) falls back to
// DEFAULT_MARKER_COLOR rather than guessing a tier.
export function getProfitabilityColor(percent, tiers = DEFAULT_PROFITABILITY_TIERS) {
  const value = sanitizeNumber(percent);
  if (value === null) return DEFAULT_MARKER_COLOR;
  for (const tier of tiers) {
    if (tier.maxPercent === null || value < tier.maxPercent) {
      return tier.color;
    }
  }
  return DEFAULT_MARKER_COLOR;
}

// Turns raw ProfitabilityTiers sheet rows ({label, max_percent, color}) into
// a validated, ascending-sorted tier list. A row with an invalid color is
// skipped outright (never allowed to break rendering with a bad CSS value).
// An empty/missing max_percent means "no upper bound" (null) — there should
// be exactly one such row (the top tier), but this doesn't enforce that;
// sorting naturally puts any null-bound row(s) last since null sorts as
// +Infinity here.
export function parseProfitabilityTiers(rows) {
  const tiers = [];
  const skipped = [];

  for (const row of rows || []) {
    const color = cleanField(row, 'color');
    if (!color || !isValidHexColor(color)) {
      skipped.push({ row, reason: `invalid color: ${JSON.stringify(row.color)}` });
      continue;
    }
    const maxPercentRaw = cleanField(row, 'max_percent');
    let maxPercent = null;
    if (maxPercentRaw !== null) {
      maxPercent = sanitizeNumber(maxPercentRaw);
      if (maxPercent === null) {
        skipped.push({ row, reason: `invalid max_percent: ${JSON.stringify(row.max_percent)}` });
        continue;
      }
    }
    tiers.push({ label: cleanField(row, 'label'), maxPercent, color });
  }

  tiers.sort((a, b) => {
    const av = a.maxPercent === null ? Infinity : a.maxPercent;
    const bv = b.maxPercent === null ? Infinity : b.maxPercent;
    return av - bv;
  });

  return { tiers, skipped };
}

// Parses raw ProfitabilityTiers CSV text the same way parseCSVText does for
// store data. Same PapaLib injection pattern (global Papa in production,
// explicit package in tests).
export function parseTiersCSVText(csvText, PapaLib = (typeof Papa !== 'undefined' ? Papa : undefined)) {
  if (!PapaLib) {
    throw new Error('parseTiersCSVText: PapaParse not available (pass PapaLib explicitly, or load it via <script> before this file runs)');
  }
  const parsed = PapaLib.parse(csvText, { header: true, skipEmptyLines: true });
  return parseProfitabilityTiers(parsed.data);
}

// Persists the last successfully fetched store list. Fails silently
// (returns false) if localStorage is unavailable or full — the caller
// decides what that means for the UI, this function just doesn't throw.
export function saveCache(stores, updatedAt) {
  try {
    const payload = JSON.stringify({
      stores,
      updatedAt: updatedAt || null,
      cachedAt: new Date().toISOString(),
    });
    localStorage.setItem(CACHE_KEY, payload);
    return true;
  } catch (err) {
    return false;
  }
}

// Reads back the last cached store list. Returns null if there is no cache,
// localStorage is unavailable, or the cached payload is corrupt — every
// failure mode collapses to "no cache", which is exactly the state the
// page's "couldn't load, try again" message is designed to handle.
export function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.stores)) return null;
    return data;
  } catch (err) {
    return null;
  }
}
