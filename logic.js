// Pure data logic for the Yves Rocher BE/LU store map.
//
// Loaded in production as a plain <script type="module" src="logic.js"> tag
// (no bundler) and imported directly by Vitest in tests — same code, two
// loaders. PapaParse is injected rather than `import`-ed so this file never
// assumes a bundler is present: production gets it from window.Papa (CDN
// script tag), tests pass in the papaparse npm package explicitly.

const CACHE_KEY = 'yr-store-map:cache:v1';

// Generic numeric parser. Handles two distinct comma risks that both show
// up in this Sheet: a locale decimal separator (e.g. "50,85" coordinates,
// "-5,5" profitability) and a thousands grouping separator once a cell
// picks up currency formatting on export (e.g. "€778,954", "€1,302,630" —
// Google Sheets can convert a currency-formatted number cell to its
// display text on CSV export). Also strips currency symbols and "%".
// Returns null for anything that doesn't parse to a finite number.
export function sanitizeNumber(raw) {
  if (raw === null || raw === undefined) return null;
  let str = String(raw).trim();
  if (str === '') return null;

  // Strip currency symbols, percent signs, and any whitespace (including
  // the non-breaking space Sheets sometimes uses as a thousands separator).
  str = str.replace(/[€$£%\s ]/g, '');
  if (str === '') return null;

  const hasComma = str.includes(',');
  const hasDot = str.includes('.');

  if (hasComma && hasDot) {
    // Whichever separator appears last is the decimal point; the other is
    // thousands grouping to strip (e.g. "1.302,63" vs "1,302.63").
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Multiple commas, or a single comma followed by exactly 3 digits,
    // reads as thousands grouping ("778,954", "1,302,630"). A single comma
    // followed by 1-2 digits is a decimal separator ("50,85", "-7,2").
    const parts = str.split(',');
    const looksLikeThousands = parts.length > 2
      || (parts.length === 2 && parts[1].length === 3);
    str = looksLikeThousands ? str.replace(/,/g, '') : str.replace(',', '.');
  }

  const value = parseFloat(str);
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
// Parses a day-first date typed in the Sheet ("31/12/2026"). Tolerates
// single-digit day/month, ".", "-" or "/" separators and a 2-digit year, but
// is strict about the calendar: 31/02/2026 or a month > 12 returns null
// instead of rolling over into a different date. A US-formatted export
// ("12/31/2026") fails the month check and is reported as unreadable rather
// than silently misread — see the note in data/SETUP.md.
export function parseFrDate(raw) {
  if (raw === null || raw === undefined) return null;
  const m = String(raw).trim().match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (m[3].length === 2) year += 2000;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

// Maps the free-text "Risque partenaire" cell to a color band. Matching is
// case- and accent-insensitive and matches on the leading word, so "Élevé",
// "elevé", "ÉLEVÉ - à surveiller" all read as high. "Sans objet ..." (e.g.
// store taken back in FP, no partner left) is neutral, not a risk level.
// Anything unrecognised is kept as typed with level 'unknown'.
export function getPartnerRiskLevel(raw) {
  if (!hasValue(raw)) return null;
  const text = String(raw).trim();
  const key = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let level = 'unknown';
  if (/^(faible|bas|low)\b/.test(key)) level = 'low';
  else if (/^(moyen|modere|medium)\b/.test(key)) level = 'medium';
  else if (/^(eleve|haut|fort|high)\b/.test(key)) level = 'high';
  else if (/^(sans objet|n\/?a|non applicable)/.test(key)) level = 'none';
  return { level, text };
}

// Canonical dd/mm/yyyy form of a parseable date, or null.
export function formatFrDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function addMonths(date, months) {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

// Criticality of the next lease termination date, from "today":
//   expired  — already past
//   critical — within 6 months   (no time left to negotiate or relocate)
//   warning  — within 12 months
//   watch    — within 24 months
//   ok       — beyond 24 months
// Unparseable or missing text returns level 'unknown' with the raw text kept,
// so a mistyped cell still shows up instead of vanishing.
export function getLeaseCriticality(raw, today = new Date()) {
  if (!hasValue(raw)) return null;
  const date = parseFrDate(raw);
  if (!date) return { level: 'unknown', text: String(raw).trim(), date: null, daysLeft: null };

  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysLeft = Math.round((date - start) / 86400000);
  let level;
  if (daysLeft < 0) level = 'expired';
  else if (date <= addMonths(start, 6)) level = 'critical';
  else if (date <= addMonths(start, 12)) level = 'warning';
  else if (date <= addMonths(start, 24)) level = 'watch';
  else level = 'ok';
  return { level, text: formatFrDate(date), date, daysLeft };
}

// Human wording of the remaining time ("in 3 weeks", "in 14 months",
// "expired 2 months ago"), from the daysLeft that getLeaseCriticality returns.
export function describeDaysLeft(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return '';
  const abs = Math.abs(daysLeft);
  let span;
  if (abs === 0) return 'today';
  if (abs < 14) span = `${abs} day${abs > 1 ? 's' : ''}`;
  else if (abs < 60) span = `${Math.round(abs / 7)} weeks`;
  else if (abs < 730) span = `${Math.round(abs / 30.44)} months`;
  else span = `${(abs / 365.25).toFixed(1).replace(/\.0$/, '')} years`;
  return daysLeft > 0 ? `in ${span}` : `expired ${span} ago`;
}

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
      name: cleanField(row, 'Nom'),
      province: cleanField(row, 'Province'),
      address: cleanField(row, 'Adresse'),
      hours: cleanField(row, 'Heure'),
      phone: cleanField(row, 'Téléphone'),
      // Personal data (name), published on the Ops sheet per Cyril's
      // explicit decision (2026-08 store-list merge).
      managerContact: cleanField(row, 'Directeur'),
      // Director's contact email — often a personal address (gmail/hotmail),
      // not a company one. Same explicit-publish decision as managerContact.
      managerEmail: cleanField(row, 'Email'),
      // "Responsable Secteur" is the live sheet's current name for what
      // used to be area_manager / Regional_Sector.
      areaManager: cleanField(row, 'Responsable Secteur'),
      updatedAt: cleanField(row, 'Mise à jour le'),
      // Free-text operational note (e.g. "Institut fermé momentanément").
      remark: cleanField(row, 'Remarque'),
      // Number or null (not a cleanField string) — a raw percentage, can be
      // negative. Drives marker color via getProfitabilityColor().
      profitabilityPct: sanitizeNumber(row['Profitabilité (Marge Nette)']),
      // Numbers or null — turnover in euros, actual and target, 2025-2027.
      // ca_2025 can arrive as a currency-formatted string (e.g. "€778,954")
      // if the Sheet cell picked up currency formatting — sanitizeNumber
      // strips the symbol and thousands grouping either way.
      ca2025: sanitizeNumber(row.CA_2025),
      ca2026Target: sanitizeNumber(row.CA_2026_target),
      ca2026Actual: sanitizeNumber(row.CA_2026_actual),
      ca2027Target: sanitizeNumber(row.CA_2027_target),
      ca2027Actual: sanitizeNumber(row.CA_2027_actual),
      // FP (fond propre) / FR (franchise partenaire) / FRO (franchise en
      // gérance). Column is "Type Gestion" on the live sheet.
      ownershipType: cleanField(row, 'Type Gestion'),
      // Franchise/gérance partner name — same GDPR sensitivity class as
      // managerContact/areaManager, published per Cyril's established
      // decision. Only present for classic FR/FRO contracts — the "Fr'YR
      // Nord/Sud" and "YR Retail BE" ownership types aren't tracked in the
      // partner-contract source, not a parsing gap.
      partnerName: cleanField(row, 'Nom du partenaire'),
      // Number or null — store surface in square meters.
      surfaceSqm: sanitizeNumber(row['Surface m²']),
      // Number or null — count of physical institut cabins.
      cabines: sanitizeNumber(row.Cabines),
      // LAB (laboratoire) / ACV (Atelier cosmétique végétal).
      formatType: cleanField(row, 'Type de format'),
      // Whether the store has an "Institut" (beauty institute service).
      presenceInstitut: cleanField(row, 'Institut'),
      // Free text, as typed in the Sheet (e.g. "Faible", "Moyen", "Élevé",
      // "Sans objet (repris en FP)") — shown as-is, not interpreted.
      partnerRisk: cleanField(row, 'Risque partenaire'),
      // Date text as typed in the Sheet (dd/mm/yyyy) — shown as-is rather
      // than parsed, so a half-typed or non-date cell still displays.
      nextLeaseTermination: cleanField(row, 'Prochaine résiliation de bail'),
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
