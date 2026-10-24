import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildTitleIndex,
  localMatch,
  cachedId,
  rememberId,
  runPool,
  resolveTargets,
  dedupeTargets
} from '../src/modules/sync/targets';
import { stores, ID_MISS_TTL_MS } from '../src/modules/sync/state';
import { searchMalId, log } from '../src/api/mal';
import { getOverride } from '../src/modules/sync/overrides';
import type { AniListSyncEntry, SyncCounters } from '../src/modules/sync/types';

vi.mock('../src/api/mal', () => ({
  searchMalId: vi.fn(),
  log: vi.fn()
}));

vi.mock('../src/modules/sync/overrides', () => ({
  getOverride: vi.fn()
}));

function createEntry(overrides: Partial<AniListSyncEntry> = {}): AniListSyncEntry {
  return {
    mediaId: 100,
    title: 'Sousou no Frieren',
    titles: ['sousou no frieren'],
    status: 'CURRENT',
    updatedAt: 1000,
    ...overrides
  } as AniListSyncEntry;
}

function createCounters(): SyncCounters {
  return { skipped: 0, unmatched: 0, transient: 0, conflicts: 0 } as SyncCounters;
}

describe('Targets: buildTitleIndex & localMatch', () => {
  it('indexes normalized titles and marks duplicate titles as ambiguous (-1)', () => {
    const malData = {
      10: { __malTitle: 'Bocchi the Rock!' },
      20: { __malTitle: 'Steins;Gate' },
      30: { __malTitle: 'Duplicate Show' },
      40: { __malTitle: 'Duplicate Show' }
    };

    const idx = buildTitleIndex(malData);

    expect(idx.get('bocchi the rock')).toBe(10);
    expect(idx.get('steins gate')).toBe(20);
    expect(idx.get('duplicate show')).toBe(-1);
  });

  it('matches entry title when present in the index', () => {
    const idx = new Map<string, number>([
      ['frieren', 100],
      ['bocchi', 200]
    ]);

    const entry = createEntry({ titles: ['unknown alias', 'frieren'] });
    expect(localMatch(entry, idx)).toBe(100);
  });

  it('returns null if matching an ambiguous title or conflicting IDs', () => {
    const idx = new Map<string, number>([
      ['ambiguous', -1],
      ['alias a', 10],
      ['alias b', 20]
    ]);

    expect(localMatch(createEntry({ titles: ['ambiguous'] }), idx)).toBeNull();
    expect(localMatch(createEntry({ titles: ['alias a', 'alias b'] }), idx)).toBeNull();
    expect(localMatch(createEntry({ titles: ['non existent'] }), idx)).toBeNull();
  });
});

describe('Targets: cachedId & rememberId', () => {
  beforeEach(() => {
    vi.mocked(getOverride).mockReturnValue(undefined);
    stores.ANIME.ids.data = {};
    stores.ANIME.ids.save = vi.fn();
  });

  it('prioritizes user override when present', () => {
    vi.mocked(getOverride).mockReturnValue({ malId: 999 } as any);
    expect(cachedId('ANIME', createEntry({ mediaId: 10 }))).toBe(999);
  });

  it('returns direct idMal unless marked as a bad cached match', () => {
    const entry = createEntry({ mediaId: 10, idMal: 50 });

    expect(cachedId('ANIME', entry)).toBe(50);

    stores.ANIME.ids.data[10] = { m: 0, bad: 50, t: Date.now() };
    expect(cachedId('ANIME', entry)).toBe(0);

    stores.ANIME.ids.data[10].t = Date.now() - ID_MISS_TTL_MS - 1000;
    expect(cachedId('ANIME', entry)).toBe(50);
  });

  it('returns cached positive matches and cached negative misses (0)', () => {
    const entry = createEntry({ mediaId: 20, idMal: undefined });

    stores.ANIME.ids.data[20] = { m: 300, t: Date.now() };
    expect(cachedId('ANIME', entry)).toBe(300);

    stores.ANIME.ids.data[20] = { m: 0, t: Date.now() };
    expect(cachedId('ANIME', entry)).toBe(0);

    stores.ANIME.ids.data[20].t = Date.now() - ID_MISS_TTL_MS - 1000;
    expect(cachedId('ANIME', entry)).toBeUndefined();
  });

  it('rememberId writes to store and invokes save', () => {
    rememberId('ANIME', 123, 456, 789);

    expect(stores.ANIME.ids.data[123]).toEqual(
      expect.objectContaining({
        m: 456,
        bad: 789
      })
    );
    expect(stores.ANIME.ids.save).toHaveBeenCalledTimes(1);

    rememberId('ANIME', 0, 999);
    expect(stores.ANIME.ids.save).toHaveBeenCalledTimes(1);
  });
});

describe('Targets: runPool', () => {
  it('executes tasks across concurrent worker lanes', async () => {
    const items = [1, 2, 3, 4, 5];
    const executed: number[] = [];
    let active = 0;
    let maxActive = 0;

    await runPool(
      items,
      async (item) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 10));
        executed.push(item);
        active--;
      },
      2
    );

    expect(executed).toHaveLength(5);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('bubbles first thrown exception from worker', async () => {
    const items = [1, 2, 3];
    const task = runPool(
      items,
      async (item) => {
        if (item === 2) throw new Error('Worker crash');
      },
      2
    );

    await expect(task).rejects.toThrow('Worker crash');
  });
});

describe('Targets: resolveTargets pipeline', () => {
  beforeEach(() => {
    vi.mocked(getOverride).mockReturnValue(undefined);
    vi.mocked(searchMalId).mockReset();
    vi.mocked(log).mockReset();
    stores.ANIME.ids.data = {};
    stores.ANIME.ids.save = vi.fn();
  });

  it('skips invalid mediaId or unrecognized statuses', async () => {
    const counters = createCounters();
    const entries = [
      createEntry({ mediaId: 0 }),
      createEntry({ status: 'INVALID_STATUS' })
    ];

    const targets = await resolveTargets('ANIME', entries, {}, counters);

    expect(targets).toHaveLength(0);
    expect(counters.skipped).toBe(2);
  });

  it('respects user overrides (malId > 0 resolves target, malId: 0 skips)', async () => {
    const counters = createCounters();
    vi.mocked(getOverride).mockImplementation((id) => {
      if (id === 1) return { malId: 555 } as any;
      if (id === 2) return { malId: 0 } as any;
      return undefined;
    });

    const entries = [
      createEntry({ mediaId: 1 }),
      createEntry({ mediaId: 2 })
    ];

    const targets = await resolveTargets('ANIME', entries, {}, counters);

    expect(targets).toHaveLength(1);
    expect(targets[0].malId).toBe(555);
    expect(targets[0].explicit).toBe(true);
    expect(counters.skipped).toBe(1);
  });

  it('resolves direct cached targets and cached negative misses', async () => {
    const counters = createCounters();
    stores.ANIME.ids.data[1] = { m: 777, t: Date.now() };
    stores.ANIME.ids.data[2] = { m: 0, t: Date.now() };

    const entries = [
      createEntry({ mediaId: 1, idMal: 777 }),
      createEntry({ mediaId: 2 })
    ];

    const targets = await resolveTargets('ANIME', entries, {}, counters);

    expect(targets).toHaveLength(1);
    expect(targets[0].malId).toBe(777);
    expect(targets[0].explicit).toBe(true);
    expect(counters.unmatched).toBe(1);
  });

  it('resolves via local title matching before remote search', async () => {
    const counters = createCounters();
    const mal = { 888: { __malTitle: 'frieren' } };
    const entries = [createEntry({ mediaId: 10, titles: ['frieren'] })];

    const targets = await resolveTargets('ANIME', entries, mal, counters);

    expect(targets).toHaveLength(1);
    expect(targets[0].malId).toBe(888);
    expect(targets[0].explicit).toBe(false);
    expect(stores.ANIME.ids.data[10]?.m).toBe(888);
    expect(searchMalId).not.toHaveBeenCalled();
  });

  it('queries remote searchMalId for unresolved entries and handles results', async () => {
    const counters = createCounters();
    vi.mocked(searchMalId).mockImplementation(async (_, entry) => {
      if (entry.mediaId === 1) return 999;
      return 0;
    });

    const entries = [
      createEntry({ mediaId: 1, title: 'Matched Show' }),
      createEntry({ mediaId: 2, title: 'Missing Show' })
    ];

    const targets = await resolveTargets('ANIME', entries, {}, counters);

    expect(targets).toHaveLength(1);
    expect(targets[0].malId).toBe(999);
    expect(counters.unmatched).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('no confident MAL match'), 'warn');
  });

  it('re-throws authentication or cancelled errors from searchMalId', async () => {
    const counters = createCounters();
    vi.mocked(searchMalId).mockRejectedValueOnce({ auth: true, message: 'Invalid token' });

    const task = resolveTargets('ANIME', [createEntry({ mediaId: 1 })], {}, counters);
    await expect(task).rejects.toEqual(expect.objectContaining({ auth: true }));
  });

  it('increments transient counter on generic searchMalId errors', async () => {
    const counters = createCounters();
    vi.mocked(searchMalId).mockRejectedValueOnce(new Error('Network timeout'));

    const targets = await resolveTargets('ANIME', [createEntry({ mediaId: 1 })], {}, counters);

    expect(targets).toHaveLength(0);
    expect(counters.transient).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('could not look up'), 'warn');
  });
});

describe('Targets: dedupeTargets', () => {
  it('deduplicates targets preferring explicit matches and newest timestamps', () => {
    const counters = createCounters();
    const targets = [
      { entry: createEntry({ mediaId: 1, title: 'Inferred Match', updatedAt: 2000 }), malId: 10, explicit: false },
      { entry: createEntry({ mediaId: 2, title: 'Explicit Match', updatedAt: 1000 }), malId: 10, explicit: true }
    ];

    const result = dedupeTargets('ANIME', targets, counters);

    expect(result).toHaveLength(1);
    expect(result[0].entry.mediaId).toBe(2);
    expect(counters.conflicts).toBe(1);
  });
});