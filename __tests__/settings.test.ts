import { describe, it, expect, beforeEach } from 'vitest';
import '../src/modules/tagFilter';
import '../src/modules/nyaa';
import '../src/modules/sync';
import '../src/modules/tierLabels';
import { Settings, TYPES, ROWS, PREFIX } from '../src/settings/settings';
import { store } from '../src/utils/helpers';
import type { SettingRow } from '../src/types';

describe('Settings: Type Normalizers (TYPES)', () => {
  describe('number normalizer', () => {
    const numRow: SettingRow = {
      key: 'testNum',
      type: 'number',
      def: 50,
      min: 0,
      max: 100,
      title: 'Test Number',
      help: 'Help',
      legacy: []
    };

    it('clamps values below min and above max', () => {
      expect(TYPES.number.normalize(-15, numRow)).toBe(0);
      expect(TYPES.number.normalize(150, numRow)).toBe(100);
      expect(TYPES.number.normalize(42, numRow)).toBe(42);
    });

    it('rounds floating point inputs to integers', () => {
      expect(TYPES.number.normalize(42.4, numRow)).toBe(42);
      expect(TYPES.number.normalize(42.6, numRow)).toBe(43);
    });

    it('falls back to default for null, undefined, empty strings, and NaN', () => {
      expect(TYPES.number.normalize(null, numRow)).toBe(50);
      expect(TYPES.number.normalize(undefined, numRow)).toBe(50);
      expect(TYPES.number.normalize('', numRow)).toBe(50);
      expect(TYPES.number.normalize('   ', numRow)).toBe(50);
      expect(TYPES.number.normalize('not-a-number', numRow)).toBe(50);
    });

    it('allows 0 when min is 0', () => {
      expect(TYPES.number.normalize(0, numRow)).toBe(0);
      expect(TYPES.number.normalize('0', numRow)).toBe(0);
    });
  });

  describe('toggle normalizer', () => {
    it('normalizes booleans, strings, and truthy/falsy inputs', () => {
      expect(TYPES.toggle.normalize(true)).toBe(true);
      expect(TYPES.toggle.normalize(false)).toBe(false);
      expect(TYPES.toggle.normalize('false')).toBe(false);
      expect(TYPES.toggle.normalize('true')).toBe(true);
      expect(TYPES.toggle.normalize(1)).toBe(true);
      expect(TYPES.toggle.normalize(0)).toBe(false);
      expect(TYPES.toggle.normalize(null)).toBe(false);
      expect(TYPES.toggle.normalize(undefined)).toBe(false);
    });
  });

  describe('select normalizer', () => {
    const selectRow: SettingRow = {
      key: 'testSelect',
      type: 'select',
      def: 'round',
      options: [
        ['ceil', 'Ceil'],
        ['round', 'Round'],
        ['floor', 'Floor']
      ],
      title: 'Rounding',
      help: 'Help',
      legacy: []
    };

    it('allows registered option keys', () => {
      expect(TYPES.select.normalize('ceil', selectRow)).toBe('ceil');
      expect(TYPES.select.normalize('round', selectRow)).toBe('round');
      expect(TYPES.select.normalize('floor', selectRow)).toBe('floor');
    });

    it('falls back to default on invalid options or bad types', () => {
      expect(TYPES.select.normalize('exact', selectRow)).toBe('round');
      expect(TYPES.select.normalize('', selectRow)).toBe('round');
      expect(TYPES.select.normalize(null, selectRow)).toBe('round');
    });
  });

  describe('list normalizer', () => {
    const listRow: SettingRow = {
      key: 'testList',
      type: 'list',
      def: ['SubsPlease', 'ToonsHub'],
      title: 'Providers',
      help: 'Help',
      legacy: []
    };

    it('splits and trims comma-separated strings', () => {
      expect(TYPES.list.normalize('SubsPlease,  Erai-raws , Judged', listRow)).toEqual([
        'SubsPlease',
        'Erai-raws',
        'Judged'
      ]);
    });

    it('filters out empty segments and whitespace', () => {
      expect(TYPES.list.normalize('A,,  ,B', listRow)).toEqual(['A', 'B']);
    });

    it('accepts arrays directly', () => {
      expect(TYPES.list.normalize(['CustomGroup'], listRow)).toEqual(['CustomGroup']);
    });

    it('falls back to default when input is empty or null', () => {
      expect(TYPES.list.normalize('', listRow)).toEqual(['SubsPlease', 'ToonsHub']);
      expect(TYPES.list.normalize(null, listRow)).toEqual(['SubsPlease', 'ToonsHub']);
      expect(TYPES.list.normalize([], listRow)).toEqual(['SubsPlease', 'ToonsHub']);
    });
  });

  describe('json normalizer', () => {
    const jsonRow: SettingRow = {
      key: 'testJson',
      type: 'json',
      def: { initial: true },
      title: 'JSON',
      help: 'Help',
      legacy: []
    };

    it('parses valid JSON strings and preserves objects', () => {
      expect(TYPES.json.normalize('{"custom": 123}', jsonRow)).toEqual({ custom: 123 });
      expect(TYPES.json.normalize({ already: 'object' }, jsonRow)).toEqual({ already: 'object' });
    });

    it('reverts to default on malformed JSON strings or null', () => {
      expect(TYPES.json.normalize('{bad_json', jsonRow)).toEqual({ initial: true });
      expect(TYPES.json.normalize(null, jsonRow)).toEqual({ initial: true });
    });

    it('applies custom row validation if defined', () => {
      const validatedRow: SettingRow = {
        ...jsonRow,
        validate: (v) => (Array.isArray(v) ? { valid: true, tiers: v } : { valid: false })
      };

      expect(TYPES.json.normalize([1, 2, 3], validatedRow)).toEqual([1, 2, 3]);
      expect(TYPES.json.normalize('not-an-array', validatedRow)).toEqual({ initial: true });
    });
  });
});

describe('Settings: Registry & Storage (Settings.get / Settings.set)', () => {
  beforeEach(() => {
    store.del(PREFIX + 'tagPercentage');
    store.del(PREFIX + 'syncScoreRounding');
  });

  it('reads registered default values when no custom setting is saved', () => {
    expect(Settings.get('tagPercentage')).toBe(50);
    expect(Settings.get('syncScoreRounding')).toBe('round');
  });

  it('persists and normalizes values when updated via Settings.set', () => {
    Settings.set('tagPercentage', 75);
    expect(Settings.get('tagPercentage')).toBe(75);
    expect(store.get(PREFIX + 'tagPercentage')).toBe(75);

    Settings.set('tagPercentage', 250);
    expect(Settings.get('tagPercentage')).toBe(100);
  });

  it('throws an error when querying an unregistered setting key', () => {
    expect(() => Settings.get('nonExistentKey')).toThrow('Unknown setting: nonExistentKey');
  });

  it('rejects registering duplicate keys in FeatureMeta', () => {
    expect(() =>
      Settings.register({
        id: 'duplicateTest',
        key: 'tagPercentage',
        title: 'Duplicate',
        help: 'Duplicate'
      })
    ).toThrow('Duplicate setting: tagPercentage');
  });
});

describe('Settings: Legacy Migration (Settings.migrate)', () => {
  const TEST_KEY = 'migrateTestSetting';

  beforeEach(() => {
    store.del(PREFIX + TEST_KEY);
    store.del(PREFIX + 'old_legacy_key');
    localStorage.removeItem('ALAdditions:old_legacy_key');
  });

  it('migrates legacy stored values into prefixed keys', () => {
    if (!ROWS[TEST_KEY]) {
      Settings.register({
        id: 'migrationFeature',
        key: TEST_KEY,
        type: 'number',
        def: 10,
        legacy: ['old_legacy_key'],
        title: 'Migrate Test',
        help: 'Help'
      });
    }

    store.set(PREFIX + 'old_legacy_key', 42);

    Settings.migrate();

    expect(Settings.get(TEST_KEY)).toBe(42);
  });

  it('migrates raw localStorage keys from ALAdditions namespace', () => {
    if (!ROWS[TEST_KEY]) {
      Settings.register({
        id: 'migrationFeature',
        key: TEST_KEY,
        type: 'number',
        def: 10,
        legacy: ['old_legacy_key'],
        title: 'Migrate Test',
        help: 'Help'
      });
    }

    localStorage.setItem('ALAdditions:old_legacy_key', JSON.stringify(77));

    Settings.migrate();

    expect(Settings.get(TEST_KEY)).toBe(77);
  });
});