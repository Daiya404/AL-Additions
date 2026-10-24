import { describe, it, expect, beforeEach } from 'vitest';
import '../src/modules/sync';
import {
  convertScore,
  fuzzyToMalDate,
  buildPayload,
  reconcile,
  fallbackPatch,
  describePatch
} from '../src/modules/sync/reconcile';
import { dedupeTargets, buildTitleIndex, localMatch } from '../src/modules/sync/targets';
import {
  addPendingDelete,
  removePendingDelete,
  getPendingDeletes,
  clearPendingDeletes
} from '../src/modules/sync/state';
import { Settings } from '../src/settings/settings';
import type { AniListSyncEntry, SyncTarget, SyncCounters } from '../src/modules/sync/types';

describe('Sync Engine: Score Conversion', () => {
  it('converts scores using "round" mode by default', () => {
    Settings.set('syncScoreRounding', 'round');
    expect(convertScore(0)).toBe(0);
    expect(convertScore(null)).toBe(0);
    expect(convertScore(74)).toBe(7);
    expect(convertScore(75)).toBe(8);
    expect(convertScore(95)).toBe(10);
    expect(convertScore(100)).toBe(10);
  });

  it('converts scores using "ceil" mode', () => {
    Settings.set('syncScoreRounding', 'ceil');
    expect(convertScore(71)).toBe(8);
    expect(convertScore(10)).toBe(1);
    expect(convertScore(91)).toBe(10);
  });

  it('converts scores using "floor" mode', () => {
    Settings.set('syncScoreRounding', 'floor');
    expect(convertScore(79)).toBe(7);
    expect(convertScore(85)).toBe(8);
    expect(convertScore(99)).toBe(9);
  });
});

describe('Sync Engine: Date Formatting', () => {
  it('converts complete fuzzy dates to YYYY-MM-DD strings', () => {
    expect(fuzzyToMalDate({ year: 2024, month: 4, day: 8 })).toBe('2024-04-08');
    expect(fuzzyToMalDate({ year: 2026, month: 10, day: 24 })).toBe('2026-10-24');
  });

  it('returns null for incomplete or missing fuzzy dates', () => {
    expect(fuzzyToMalDate(null)).toBeNull();
    expect(fuzzyToMalDate({ year: 2024, month: 5 })).toBeNull();
    expect(fuzzyToMalDate({ year: 2024, day: 10 })).toBeNull();
  });
});

describe('Sync Engine: Payload Construction & Status Mapping', () => {
  const baseEntry: AniListSyncEntry = {
    mediaId: 100,
    idMal: 200,
    title: 'Frieren: Beyond Journey\'s End',
    status: 'CURRENT',
    score: 90,
    progress: 14,
    repeat: 0,
    queryTitles: ['Frieren'],
    titles: ['frieren'],
    startYear: 2023,
    updatedAt: 1700000000
  };

  it('builds valid payload for anime currently watching', () => {
    const payload = buildPayload('ANIME', baseEntry);
    expect(payload).toEqual({
      status: 'watching',
      score: 9,
      is_rewatching: 'false',
      num_watched_episodes: 14
    });
  });

  it('builds valid payload for manga with volume progress', () => {
    const mangaEntry: AniListSyncEntry = {
      ...baseEntry,
      status: 'PLANNING',
      progress: 5,
      progressVolumes: 2
    };

    const payload = buildPayload('MANGA', mangaEntry);
    expect(payload).toEqual({
      status: 'plan_to_read',
      score: 9,
      is_rereading: 'false',
      num_chapters_read: 5,
      num_volumes_read: 2
    });
  });

  it('flags repeating status as rewatching/rereading', () => {
    const repeatingEntry: AniListSyncEntry = {
      ...baseEntry,
      status: 'REPEATING',
      repeat: 2
    };

    const animePayload = buildPayload('ANIME', repeatingEntry);
    expect(animePayload?.is_rewatching).toBe('true');
    expect(animePayload?.num_times_rewatched).toBe(2);

    const mangaPayload = buildPayload('MANGA', repeatingEntry);
    expect(mangaPayload?.is_rereading).toBe('true');
    expect(mangaPayload?.num_times_reread).toBe(2);
  });
});

describe('Sync Engine: Reconciliation (reconcile)', () => {
  const animeEntry: AniListSyncEntry = {
    mediaId: 101,
    idMal: 201,
    title: 'Steins;Gate',
    status: 'CURRENT',
    score: 100,
    progress: 12,
    repeat: 0,
    queryTitles: ['Steins;Gate'],
    titles: ['steins gate'],
    startYear: 2011,
    updatedAt: 1700000000
  };

  it('returns empty patch when AniList and MAL are already in sync', () => {
    const malData = {
      status: 'watching',
      score: 10,
      num_episodes_watched: 12,
      is_rewatching: false
    };

    const patch = reconcile('ANIME', animeEntry, malData);
    expect(patch).toEqual({});
  });

  it('generates minimal patch for changed progress only', () => {
    const malData = {
      status: 'watching',
      score: 10,
      num_episodes_watched: 11,
      is_rewatching: false
    };

    const patch = reconcile('ANIME', animeEntry, malData);
    expect(patch).toEqual({
      num_watched_episodes: 12
    });
  });

  it('fills total episodes when entry is completed and total is known', () => {
    const completedEntry: AniListSyncEntry = {
      ...animeEntry,
      status: 'COMPLETED',
      progress: 0
    };

    const malData = {
      status: 'watching',
      score: 10,
      num_episodes_watched: 12,
      __total: 24
    };

    const patch = reconcile('ANIME', completedEntry, malData);
    expect(patch?.status).toBe('completed');
    expect(patch?.num_watched_episodes).toBe(24);
  });

  it('describes patch contents in human-readable text', () => {
    const patch = {
      status: 'completed',
      score: 9,
      num_watched_episodes: 24
    };

    const description = describePatch('ANIME', patch);
    expect(description).toContain('status: Completed');
    expect(description).toContain('score: 9/10');
    expect(description).toContain('episodes: 24');
  });
});

describe('Sync Engine: Fallback Recovery (fallbackPatch)', () => {
  it('strips start_date and finish_date on first fallback attempt', () => {
    const patch = {
      status: 'completed',
      start_date: '2024-01-01',
      finish_date: '2024-03-30',
      num_watched_episodes: 12
    };

    const tried = new Set<string>();
    const alt = fallbackPatch('ANIME', patch, null, tried);

    expect(alt).not.toBeNull();
    expect(alt?.start_date).toBeUndefined();
    expect(alt?.finish_date).toBeUndefined();
    expect(alt?.status).toBe('completed');
    expect(tried.has('dates')).toBe(true);
  });

  it('caps episode count to total episodes on second fallback attempt', () => {
    const patch = {
      status: 'completed',
      num_watched_episodes: 15
    };

    const mal = { __total: 12 };
    const tried = new Set<string>(['dates']);
    const alt = fallbackPatch('ANIME', patch, mal, tried);

    expect(alt).not.toBeNull();
    expect(alt?.num_watched_episodes).toBe(12);
    expect(tried.has('cap')).toBe(true);
  });
});

describe('Sync Engine: Target Resolution & Deduplication', () => {
  it('builds title index and resolves strict title matches', () => {
    const malList = {
      5001: { __malTitle: 'Bocchi the Rock!' },
      5002: { __malTitle: 'K-On!' }
    };

    const idx = buildTitleIndex(malList);
    const entry: AniListSyncEntry = {
      mediaId: 1,
      idMal: 0,
      title: 'Bocchi the Rock!',
      status: 'CURRENT',
      score: 90,
      progress: 4,
      repeat: 0,
      queryTitles: ['Bocchi the Rock!'],
      titles: ['bocchi the rock'],
      startYear: 2022,
      updatedAt: 1000
    };

    const matchedId = localMatch(entry, idx);
    expect(matchedId).toBe(5001);
  });

  it('resolves conflicting targets by preferring explicit matches', () => {
    const counters: SyncCounters = {
      pushed: 0,
      deleted: 0,
      unchanged: 0,
      settled: 0,
      skipped: 0,
      unmatched: 0,
      conflicts: 0,
      transient: 0,
      permanent: 0
    };

    const target1: SyncTarget = {
      entry: { mediaId: 10, idMal: 999, title: 'Show A', status: 'CURRENT', score: 0, progress: 1, repeat: 0, queryTitles: [], titles: [], startYear: 0, updatedAt: 100 },
      malId: 999,
      explicit: true
    };

    const target2: SyncTarget = {
      entry: { mediaId: 20, idMal: 0, title: 'Show B', status: 'CURRENT', score: 0, progress: 1, repeat: 0, queryTitles: [], titles: [], startYear: 0, updatedAt: 200 },
      malId: 999,
      explicit: false
    };

    const deduped = dedupeTargets('ANIME', [target2, target1], counters);
    expect(deduped.length).toBe(1);
    expect(deduped[0].entry.mediaId).toBe(10);
    expect(counters.conflicts).toBe(1);
  });
});

describe('Sync Engine: Pending Deletions Queue', () => {
  beforeEach(() => {
    clearPendingDeletes();
  });

  it('queues, retrieves, and removes pending deletions', () => {
    expect(getPendingDeletes()).toEqual([]);

    addPendingDelete({
      mediaId: 42,
      malId: 1042,
      type: 'ANIME',
      title: 'Deleted Anime',
      deletedAt: Date.now()
    });

    const pending = getPendingDeletes();
    expect(pending.length).toBe(1);
    expect(pending[0].mediaId).toBe(42);

    removePendingDelete(42, 'ANIME');
    expect(getPendingDeletes()).toEqual([]);
  });
});