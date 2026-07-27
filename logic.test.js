import { describe, it, expect, beforeEach } from 'vitest';
import Papa from 'papaparse';
import {
  sanitizeCoordinate,
  hasValue,
  parseStores,
  parseCSVText,
  saveCache,
  loadCache,
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
        updatedAt: null,
      },
    ]);
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
