import { describe, it, expect, beforeEach } from 'vitest';
import Papa from 'papaparse';
import {
  sanitizeNumber,
  sanitizeCoordinate,
  hasValue,
  parseStores,
  parseCSVText,
  saveCache,
  loadCache,
  isValidHexColor,
  getProfitabilityColor,
  parseProfitabilityTiers,
  parseTiersCSVText,
  DEFAULT_PROFITABILITY_TIERS,
  DEFAULT_MARKER_COLOR,
} from './logic.js';

describe('sanitizeCoordinate', () => {
  it('parses a well-formed decimal', () => {
    expect(sanitizeCoordinate('50.836283')).toBe(50.836283);
  });

  it('sanitizes a comma-decimal value (Google Sheets locale risk)', () => {
    expect(sanitizeCoordinate('50,85')).toBe(50.85);
  });

  it('returns null for missing values', () => {
    expect(sanitizeCoordinate(null)).toBeNull();
    expect(sanitizeCoordinate(undefined)).toBeNull();
    expect(sanitizeCoordinate('')).toBeNull();
    expect(sanitizeCoordinate('   ')).toBeNull();
  });

  it('returns null for non-numeric garbage', () => {
    expect(sanitizeCoordinate('not-a-number')).toBeNull();
  });
});

describe('sanitizeNumber', () => {
  it('handles negative comma-decimal values (profitability can be negative)', () => {
    expect(sanitizeNumber('-5,5')).toBe(-5.5);
    expect(sanitizeNumber('-12.3')).toBe(-12.3);
  });

  it('handles a plain integer percentage', () => {
    expect(sanitizeNumber('20')).toBe(20);
    expect(sanitizeNumber('0')).toBe(0);
  });
});

describe('hasValue', () => {
  it('treats empty string and whitespace-only as absent', () => {
    expect(hasValue('')).toBe(false);
    expect(hasValue('   ')).toBe(false);
  });

  it('treats missing key (undefined/null) as absent', () => {
    expect(hasValue(undefined)).toBe(false);
    expect(hasValue(null)).toBe(false);
  });

  it('treats real content as present', () => {
    expect(hasValue('Ixelles')).toBe(true);
    expect(hasValue('0')).toBe(true);
  });
});

describe('parseStores', () => {
  it('includes a well-formed row', () => {
    const { stores, skipped } = parseStores([
      { code: '0001', name: 'Ixelles', lat: '50.836283', long: '4.363063', province: 'Brussels-Capital' },
    ]);
    expect(skipped).toHaveLength(0);
    expect(stores).toEqual([
      {
        code: '0001',
        lat: 50.836283,
        long: 4.363063,
        name: 'Ixelles',
        province: 'Brussels-Capital',
        address: null,
        hours: null,
        phone: null,
        managerContact: null,
        areaManager: null,
        updatedAt: null,
        profitabilityPct: null,
        ca2025: null,
        ca2026Target: null,
        ca2026Actual: null,
        ca2027Target: null,
        ca2027Actual: null,
        ownershipType: null,
        partnerName: null,
        surfaceSqm: null,
        formatType: null,
      },
    ]);
  });

  it('parses profitability_pct as a number, including negative values', () => {
    const { stores } = parseStores([
      { code: '0001', name: 'Profitable', lat: '50', long: '4', profitability_pct: '18.5' },
      { code: '0002', name: 'Loss', lat: '50', long: '4', profitability_pct: '-7,2' },
    ]);
    expect(stores[0].profitabilityPct).toBe(18.5);
    expect(stores[1].profitabilityPct).toBe(-7.2); // comma-decimal sanitized
  });

  it('parses area_manager as a string and ca_2025 as a number', () => {
    const { stores } = parseStores([
      { code: '0001', name: 'Store', lat: '50', long: '4', area_manager: 'Nesiba', ca_2025: '778953.76' },
    ]);
    expect(stores[0].areaManager).toBe('Nesiba');
    expect(stores[0].ca2025).toBe(778953.76);
  });

  it('parses the prepared 2026/2027 and store-attribute fields', () => {
    const { stores } = parseStores([{
      code: '0001', name: 'Store', lat: '50', long: '4',
      ca_2026_target: '850000', ca_2026_actual: '820000',
      ca_2027_target: '900000', ca_2027_actual: '',
      ownership_type: 'FR', partner_name: 'Dupont SA',
      surface_sqm: '65.5', format_type: 'LAB',
    }]);
    const s = stores[0];
    expect(s.ca2026Target).toBe(850000);
    expect(s.ca2026Actual).toBe(820000);
    expect(s.ca2027Target).toBe(900000);
    expect(s.ca2027Actual).toBeNull(); // empty cell, not yet realized
    expect(s.ownershipType).toBe('FR');
    expect(s.partnerName).toBe('Dupont SA');
    expect(s.surfaceSqm).toBe(65.5);
    expect(s.formatType).toBe('LAB');
  });

  it('skips a row with a missing code', () => {
    const { stores, skipped } = parseStores([{ name: 'No Code', lat: '50', long: '4' }]);
    expect(stores).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toBe('missing code');
  });

  it('skips a row with missing/invalid coordinates', () => {
    const { stores, skipped } = parseStores([
      { code: '0001', name: 'Bad Coords', lat: '', long: '4.36' },
      { code: '0002', name: 'Also Bad', lat: 'garbage', long: '4.36' },
    ]);
    expect(stores).toHaveLength(0);
    expect(skipped).toHaveLength(2);
    expect(skipped.every((s) => s.reason === 'missing/invalid coordinates')).toBe(true);
  });

  it('sanitizes comma-decimal coordinates inline', () => {
    const { stores } = parseStores([{ code: '0001', name: 'Comma', lat: '50,85', long: '4,36' }]);
    expect(stores[0].lat).toBe(50.85);
    expect(stores[0].long).toBe(4.36);
  });

  it('skips a duplicate code, keeping the first occurrence', () => {
    const { stores, skipped } = parseStores([
      { code: '0001', name: 'First', lat: '50', long: '4' },
      { code: '0001', name: 'Second (dup)', lat: '51', long: '5' },
    ]);
    expect(stores).toHaveLength(1);
    expect(stores[0].name).toBe('First');
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toBe('duplicate code: 0001');
  });

  it('handles an empty row list without crashing', () => {
    expect(parseStores([])).toEqual({ stores: [], skipped: [] });
    expect(parseStores(undefined)).toEqual({ stores: [], skipped: [] });
  });

  it('renders partial fields as null, distinguishing empty string, whitespace, and missing key', () => {
    const { stores } = parseStores([
      { code: '0001', name: 'Partial', lat: '50', long: '4', address: '', hours: '   ', phone: undefined },
    ]);
    expect(stores[0].address).toBeNull();
    expect(stores[0].hours).toBeNull();
    expect(stores[0].phone).toBeNull();
  });
});

describe('parseCSVText (PapaParse integration)', () => {
  it('parses real CSV text end to end, including a free-text field containing a comma', () => {
    const csv = 'code,name,lat,long,address\n0001,"Ixelles - Chée d\'Ixelles",50.836283,4.363063,"Rue A, 12"\n';
    const { stores, skipped } = parseCSVText(csv, Papa);
    expect(skipped).toHaveLength(0);
    expect(stores).toHaveLength(1);
    expect(stores[0].address).toBe('Rue A, 12');
  });

  it('throws a clear error if no PapaParse implementation is available', () => {
    expect(() => parseCSVText('code,name\n0001,Test\n', undefined)).toThrow(/PapaParse not available/);
  });
});

describe('isValidHexColor', () => {
  it('accepts 6-digit and 3-digit hex', () => {
    expect(isValidHexColor('#e6194b')).toBe(true);
    expect(isValidHexColor('#abc')).toBe(true);
  });

  it('accepts 8-digit and 4-digit hex (with alpha)', () => {
    expect(isValidHexColor('#e6194bff')).toBe(true);
    expect(isValidHexColor('#abcd')).toBe(true);
  });

  it('rejects non-hex strings, named colors, and malformed values', () => {
    expect(isValidHexColor('red')).toBe(false);
    expect(isValidHexColor('e6194b')).toBe(false); // missing #
    expect(isValidHexColor('#zzzzzz')).toBe(false);
    expect(isValidHexColor('#12345')).toBe(false); // wrong length
    expect(isValidHexColor('')).toBe(false);
    expect(isValidHexColor(null)).toBe(false);
    expect(isValidHexColor(undefined)).toBe(false);
  });
});

describe('getProfitabilityColor (default tiers: Loss <-5, Break-even [-5,5), Moderate [5,15), Strong >=15)', () => {
  it('returns black for a significant loss (below -5%)', () => {
    expect(getProfitabilityColor(-10)).toBe('#000000');
    expect(getProfitabilityColor(-5.01)).toBe('#000000');
  });

  it('returns red for the break-even band, including the -5% boundary itself', () => {
    expect(getProfitabilityColor(-5)).toBe('#e6194b'); // boundary belongs to the upper tier
    expect(getProfitabilityColor(0)).toBe('#e6194b');
    expect(getProfitabilityColor(4.99)).toBe('#e6194b');
  });

  it('returns orange for moderate profitability, including the 5% boundary', () => {
    expect(getProfitabilityColor(5)).toBe('#f58231');
    expect(getProfitabilityColor(14.99)).toBe('#f58231');
  });

  it('returns green for strong profitability, including the 15% boundary and above', () => {
    expect(getProfitabilityColor(15)).toBe('#3cb44b');
    expect(getProfitabilityColor(50)).toBe('#3cb44b');
  });

  it('falls back to DEFAULT_MARKER_COLOR for missing/invalid data rather than guessing a tier', () => {
    expect(getProfitabilityColor(null)).toBe(DEFAULT_MARKER_COLOR);
    expect(getProfitabilityColor(undefined)).toBe(DEFAULT_MARKER_COLOR);
    expect(getProfitabilityColor('not-a-number')).toBe(DEFAULT_MARKER_COLOR);
  });

  it('handles a comma-decimal percentage (Google Sheets locale risk)', () => {
    expect(getProfitabilityColor('-7,5')).toBe('#000000');
  });
});

describe('parseProfitabilityTiers', () => {
  it('builds a sorted tier list from well-formed rows, in any input order', () => {
    const { tiers, skipped } = parseProfitabilityTiers([
      { label: 'Strong', max_percent: '', color: '#3cb44b' },
      { label: 'Loss', max_percent: '-5', color: '#000000' },
      { label: 'Moderate', max_percent: '15', color: '#f58231' },
      { label: 'Break-even', max_percent: '5', color: '#e6194b' },
    ]);
    expect(skipped).toHaveLength(0);
    expect(tiers).toEqual([
      { label: 'Loss', maxPercent: -5, color: '#000000' },
      { label: 'Break-even', maxPercent: 5, color: '#e6194b' },
      { label: 'Moderate', maxPercent: 15, color: '#f58231' },
      { label: 'Strong', maxPercent: null, color: '#3cb44b' },
    ]);
  });

  it('skips a row with a missing or invalid color, rather than breaking rendering', () => {
    const { tiers, skipped } = parseProfitabilityTiers([
      { label: 'Bad', max_percent: '5', color: '' },
      { label: 'AlsoBad', max_percent: '10', color: 'not-a-color' },
    ]);
    expect(tiers).toHaveLength(0);
    expect(skipped).toHaveLength(2);
  });

  it('skips a row with a non-numeric max_percent (but empty is valid — means "no upper bound")', () => {
    const { tiers, skipped } = parseProfitabilityTiers([
      { label: 'Bad', max_percent: 'not-a-number', color: '#000000' },
    ]);
    expect(tiers).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toMatch(/invalid max_percent/);
  });

  it('handles an empty row list without crashing', () => {
    expect(parseProfitabilityTiers([])).toEqual({ tiers: [], skipped: [] });
    expect(parseProfitabilityTiers(undefined)).toEqual({ tiers: [], skipped: [] });
  });
});

describe('parseTiersCSVText (PapaParse integration)', () => {
  it('parses real CSV text end to end', () => {
    const csv = 'label,max_percent,color\nLoss,-5,#000000\nBreak-even,5,#e6194b\nModerate,15,#f58231\nStrong,,#3cb44b\n';
    const { tiers, skipped } = parseTiersCSVText(csv, Papa);
    expect(skipped).toHaveLength(0);
    expect(tiers).toEqual(DEFAULT_PROFITABILITY_TIERS);
  });

  it('every DEFAULT_PROFITABILITY_TIERS color is itself valid hex', () => {
    // Guards against a typo in the fallback tiers breaking rendering silently.
    for (const tier of DEFAULT_PROFITABILITY_TIERS) {
      expect(isValidHexColor(tier.color), `${tier.label}: ${tier.color}`).toBe(true);
    }
  });
});

describe('cache read/write', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a store list through save and load', () => {
    const stores = [{ code: '0001', name: 'Test', lat: 50, long: 4 }];
    expect(saveCache(stores, '2026-07-27T10:00:00Z')).toBe(true);
    const loaded = loadCache();
    expect(loaded.stores).toEqual(stores);
    expect(loaded.updatedAt).toBe('2026-07-27T10:00:00Z');
    expect(typeof loaded.cachedAt).toBe('string');
  });

  it('returns null when there is no cache yet', () => {
    expect(loadCache()).toBeNull();
  });

  it('returns null (not a throw) for a corrupt cache payload', () => {
    localStorage.setItem('yr-store-map:cache:v1', 'not valid json{{{');
    expect(loadCache()).toBeNull();
  });

  it('returns null when the cached payload has the wrong shape', () => {
    localStorage.setItem('yr-store-map:cache:v1', JSON.stringify({ stores: 'not-an-array' }));
    expect(loadCache()).toBeNull();
  });

  it('saveCache returns false instead of throwing when localStorage is unavailable', () => {
    const original = global.localStorage;
    // Simulate a full/blocked localStorage (e.g. private browsing quota).
    global.localStorage = {
      setItem() {
        throw new Error('QuotaExceededError');
      },
    };
    expect(saveCache([{ code: '0001' }], null)).toBe(false);
    global.localStorage = original;
  });
});
