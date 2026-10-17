import { strictTitle } from '../../utils/matching';
import { searchMalId, log } from '../../api/mal';
import { stores, markDone } from './state';
import { STATUS_MAP } from './reconcile';
import { SyncMediaType, AniListSyncEntry, SyncTarget, SyncCounters } from './types';

const ID_MISS_TTL_MS = 7 * 86400e3;
const typeLabel = (t: string): string => (t === 'ANIME' ? 'Anime' : 'Manga');

export function buildTitleIndex(mal: Record<number, any>): Map<string, number> {
  const idx = new Map<string, number>();
  for (const [id, st] of Object.entries(mal)) {
    const t = strictTitle(st?.__malTitle);
    if (!t) continue;
    idx.set(t, idx.has(t) && idx.get(t) !== Number(id) ? -1 : Number(id));
  }
  return idx;
}

export function localMatch(entry: AniListSyncEntry, idx: Map<string, number>): number | null {
  let match: number | null = null;
  for (const t of entry.titles) {
    const id = idx.get(t);
    if (id == null) continue;
    if (id === -1 || (match && match !== id)) return null;
    match = id;
  }
  return match;
}

export function cachedId(type: SyncMediaType, entry: AniListSyncEntry): number | undefined {
  const c = stores[type].ids.data[entry.mediaId];
  const fresh = !!c && Date.now() - c.t < ID_MISS_TTL_MS;
  if (entry.idMal) return fresh && c.bad === entry.idMal ? 0 : entry.idMal;
  if (c && c.m > 0) return c.m;
  return fresh ? 0 : undefined;
}

export function rememberId(type: SyncMediaType, mediaId: number, malId: number, bad?: number): void {
  if (!mediaId) return;
  const rec: any = { m: malId || 0, t: Date.now() };
  if (bad) rec.bad = bad;
  stores[type].ids.data[mediaId] = rec;
  stores[type].ids.save();
}

export async function runPool<T>(
  items: T[],
  worker: (item: T, idx: number) => Promise<void>,
  concurrency: number
): Promise<void> {
  let i = 0;
  let failure: any = null;
  const lane = async (): Promise<void> => {
    while (!failure && i < items.length) {
      const n = i++;
      try {
        await worker(items[n], n);
      } catch (e) {
        failure = failure || e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) || 1 }, lane));
  if (failure) throw failure;
}

export async function resolveTargets(
  type: SyncMediaType,
  entries: AniListSyncEntry[],
  mal: Record<number, any>,
  c: SyncCounters
): Promise<SyncTarget[]> {
  const idx = buildTitleIndex(mal);
  const targets: SyncTarget[] = [];
  const pending: AniListSyncEntry[] = [];
  const unmatched: string[] = [];

  for (const entry of entries) {
    if (!entry.mediaId || !STATUS_MAP[type][entry.status]) {
      c.skipped++;
      markDone();
      continue;
    }
    const id = cachedId(type, entry);
    if (id !== undefined && id > 0) {
      targets.push({ entry, malId: id, explicit: id === entry.idMal });
      continue;
    }
    if (id === 0) {
      c.unmatched++;
      markDone();
      continue;
    }
    const local = localMatch(entry, idx);
    if (local && local > 0) {
      rememberId(type, entry.mediaId, local);
      targets.push({ entry, malId: local, explicit: false });
      continue;
    }
    pending.push(entry);
  }

  await runPool(
    pending,
    async (entry) => {
      let id = 0;
      try {
        id = await searchMalId(type, entry);
      } catch (e: any) {
        if (e.auth || e.cancelled) throw e;
        c.transient++;
        markDone();
        log(
          `${typeLabel(type)}: could not look up "${entry.title.slice(0, 45)}" on MAL: ${e.message}. Will retry on a later sync.`,
          'warn'
        );
        return;
      }
      rememberId(type, entry.mediaId, id);
      if (id > 0) targets.push({ entry, malId: id, explicit: false });
      else {
        c.unmatched++;
        unmatched.push(entry.title);
        markDone();
      }
    },
    3
  );

  if (unmatched.length)
    log(
      `${typeLabel(type)}: no confident MAL match for ${unmatched.length} title(s). Skipped: ${unmatched
        .slice(0, 5)
        .map((t) => `"${t.slice(0, 30)}"`)
        .join(', ')}${unmatched.length > 5 ? `, plus ${unmatched.length - 5} more` : ''}. Use Full Resync after adding/fixing MAL entries.`,
      'warn'
    );

  return targets;
}

export function dedupeTargets(type: SyncMediaType, targets: SyncTarget[], c: SyncCounters): SyncTarget[] {
  const best = new Map<number, SyncTarget>();
  for (const t of targets) {
    const cur = best.get(t.malId);
    if (!cur) {
      best.set(t.malId, t);
      continue;
    }
    const better = Number(t.explicit) - Number(cur.explicit) || t.entry.updatedAt - cur.entry.updatedAt;
    const loser = better > 0 ? cur : t;
    if (better > 0) best.set(t.malId, t);
    c.conflicts++;
    markDone();
    log(
      `${typeLabel(type)}: "${loser.entry.title.slice(0, 40)}" and another AniList entry resolve to MAL ID ${
        loser.malId
      }; only one can be synced, so the preferred entry wins.`,
      'warn'
    );
  }
  return [...best.values()].sort((a, b) => b.entry.updatedAt - a.entry.updatedAt);
}