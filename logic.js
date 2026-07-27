// Pure data logic for the Yves Rocher BE/LU store map.
//
// Loaded in production as a plain <script type="module" src="logic.js"> tag
// (no bundler) and imported directly by Vitest in tests — same code, two
// loaders. PapaParse is injected rather than `import`-ed so this file never
// assumes a bundler is present: production gets it from window.Papa (CDN
// script tag), tests pass in the papaparse npm package explicitly.

const CACHE_KEY = 'yr-store-map:cache:v1';

// Google Sheets can render coordinates with a comma decimal separator
// (e.g. "50,85") depending on the sheet's locale. Treat that as the default
// risk, not an edge case: always normalize before parsing.
export function sanitizeCoordinate(raw) {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim();
  if (str === '') return null;
  const normalized = str.replace(',', '.');
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
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

// Fallback palette, used whenever the ProvinceColors sheet is unavailable or
// missing an entry for a given province. Also the starting point seeded into
// that sheet — see data/province-colors-seed.csv.
export const DEFAULT_PROVINCE_COLORS = {
  'Brussels-Capital': '#e6194b',
  'Namur': '#3cb44b',
  'Walloon Brabant': '#ffe119',
  'Liège': '#4363d8',
  'West Flanders': '#f58231',
  'Flemish Brabant': '#911eb4',
  'Limburg': '#42d4f4',
  'Antwerp': '#f032e6',
  'East Flanders': '#bfef45',
  'Grand Duchy of Luxembourg': '#469990',
  'Hainaut': '#9a6324',
  'Belgian Luxembourg': '#800000',
};
export const DEFAULT_MARKER_COLOR = '#666666';

// Accepts #rgb, #rgba, #rrggbb, #rrggbbaa — anything a browser can use
// directly as a CSS color. Deliberately permissive about case.
export function isValidHexColor(value) {
  return typeof value === 'string' && /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value.trim());
}

// Turns raw ProvinceColors rows into a { province: color } map. A row with
// a missing province, or a color that isn't valid CSS hex, is skipped rather
// than allowed to silently break rendering with an invalid color — callers
// fall back to DEFAULT_PROVINCE_COLORS for any province missing from the
// result (sheet not created yet, fetch failed, typo'd province name, etc).
export function parseProvinceColors(rows) {
  const colors = {};
  const skipped = [];

  for (const row of rows || []) {
    const province = cleanField(row, 'province');
    if (!province) {
      skipped.push({ row, reason: 'missing province' });
      continue;
    }
    const color = cleanField(row, 'color');
    if (!color || !isValidHexColor(color)) {
      skipped.push({ row, reason: `invalid color: ${JSON.stringify(row.color)}` });
      continue;
    }
    colors[province] = color.trim();
  }

  return { colors, skipped };
}

// Parses raw ProvinceColors CSV text the same way parseCSVText does for
// store data. Same PapaLib injection pattern (global Papa in production,
// explicit package in tests).
export function parseColorsCSVText(csvText, PapaLib = (typeof Papa !== 'undefined' ? Papa : undefined)) {
  if (!PapaLib) {
    throw new Error('parseColorsCSVText: PapaParse not available (pass PapaLib explicitly, or load it via <script> before this file runs)');
  }
  const parsed = PapaLib.parse(csvText, { header: true, skipEmptyLines: true });
  return parseProvinceColors(parsed.data);
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
