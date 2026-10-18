import { persistent, jsonGet, jsonSet, store, randomString, sleep } from '../../utils/helpers';
import { TYPES, SyncMediaType, SyncProgress, FlaggedError } from './types';

export const ID_MISS_TTL_MS = 7 * 86400e3;
const SETTLED_TTL_MS = 45 * 86400e3;
const LOCK_STALE_MS = 45e3;
const LOCK_HEARTBEAT_MS = 10e3;
const TAB_ID = randomString(10);
const LOCK_KEY = 'sync_lock_heartbeat';

export const progress: SyncProgress = { phase: 'idle', done: 0, total: 0, changed: 0 };
export const syncStatus = { syncing: false, cancelled: false, autoSyncRetryAfter: 0 };

const progressListeners: Array<(force: boolean) => void> = [];
const stateListeners: Array<() => void> = [];
export const onProgressChange = (cb: (force: boolean) => void): void => {
  progressListeners.push(cb);
};
export const onStateChange = (cb: () => void): void => {
  stateListeners.push(cb);
};
export const notifyProgress = (force = false): void => {
  for (const cb of progressListeners) cb(force);
};
export const notifyState = (): void => {
  for (const cb of stateListeners) cb();
};

export const markDone = (n = 1): void => {
  progress.done += n;
  notifyProgress();
};

export const checkCancel = (): void => {
  if (syncStatus.cancelled) {
    const e: FlaggedError = new Error('Sync stopped.');
    e.cancelled = true;
    throw e;
  }
};

const pruneIds = (d: Record<string, any>): void => {
  for (const k of Object.keys(d)) {
    const r = d[k];
    if (!r || typeof r !== 'object' || (!(r.m > 0) && !(Date.now() - r.t < ID_MISS_TTL_MS))) delete d[k];
  }
};
const pruneSettled = (d: Record<string, any>): void => {
  for (const k of Object.keys(d)) {
    const r = d[k];
    if (!Array.isArray(r) || !(Date.now() - r[2] < SETTLED_TTL_MS)) delete d[k];
  }
};
const makeStores = (t: SyncMediaType) => ({
  ids: persistent<Record<string, any>>(`sync_idmap_${t}`, pruneIds),
  settled: persistent<Record<string, any>>(`sync_settled_${t}`, pruneSettled)
});

export const stores: Record<SyncMediaType, { ids: any; settled: any }> = {
  ANIME: makeStores('ANIME'),
  MANGA: makeStores('MANGA')
};

export const clearCache = (c: { data: Record<string, any>; save: () => void }): void => {
  for (const k of Object.keys(c.data)) delete c.data[k];
  c.save();
};

export function resetAccountState(): void {
  for (const t of TYPES) {
    for (const k of ['last_sync', 'last_run', 'last_compare']) store.del(`${k}_${t}`);
    clearCache(stores[t].settled);
  }
  store.del('sync_retry_at');
}

let heartbeat: ReturnType<typeof setInterval> | null = null;

export async function acquireLock(): Promise<boolean> {
  const lock = jsonGet<any>(LOCK_KEY, null);
  if (lock && lock.tab !== TAB_ID && Number.isFinite(lock.at) && Date.now() - lock.at < LOCK_STALE_MS) return false;
  const beat = () => jsonSet(LOCK_KEY, { at: Date.now(), tab: TAB_ID });
  beat();
  await sleep(250);
  if (jsonGet<any>(LOCK_KEY, null)?.tab !== TAB_ID) return false;
  heartbeat = setInterval(beat, LOCK_HEARTBEAT_MS);
  return true;
}

export function releaseLock(): void {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  if (jsonGet<any>(LOCK_KEY, null)?.tab === TAB_ID) store.del(LOCK_KEY);
}