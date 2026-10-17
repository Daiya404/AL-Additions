import { AniList } from '../../api/anilist';
import {
  malUpdateEntry,
  malWhoAmI,
  malFetchList,
  malLimiter,
  breaker,
  log,
  clearMalAuth,
  clearAniListAuth
} from '../../api/mal';
import { hooks } from '../../api/mal';
import { store, tryOr } from '../../utils/helpers';
import { strictTitle } from '../../utils/matching';
import { Settings } from '../../settings/settings';
import {
  TYPES,
  SyncMediaType,
  AniListSyncEntry,
  SyncJob,
  SyncTarget,
  SyncCounters,
  FlaggedError
} from './types';
import {
  progress,
  syncStatus,
  stores,
  markDone,
  checkCancel,
  notifyProgress,
  notifyState,
  acquireLock,
  releaseLock,
  clearCache,
  resetAccountState
} from './state';
import { reconcile, fallbackPatch, describePatch, malKey, PROGRESS_KEYS } from './reconcile';
import { resolveTargets, dedupeTargets, runPool, rememberId } from './targets';

hooks.checkCancel = checkCancel;

const FULL_COMPARE_MS = 7 * 86400e3;
const BREAKER_MAX_TRIPS = 3;
const RETRY_AFTER_FAILURE_MS = 10 * 60e3;
export const LIST_PATH_RE = /^\/user\/[^/]+\/(anime|manga)list/;
const typeLabel = (t: string): string => (t === 'ANIME' ? 'Anime' : 'Manga');

const ENTRY_FIELDS =
  'status score(format: POINT_100) progress progressVolumes repeat notes updatedAt startedAt { year month day } completedAt { year month day }';
const MEDIA_FIELDS = 'id idMal startDate { year } synonyms title { userPreferred english romaji native }';

const toEntry = (row: any, media: any): AniListSyncEntry => {
  const t = media?.title || {};
  return {
    ...row,
    mediaId: Number(media?.id) || 0,
    idMal: Number(media?.idMal) || 0,
    title: t.userPreferred || t.romaji || t.english || String(media?.id || ''),
    queryTitles: [...new Set([t.userPreferred, t.romaji, t.english].map((s) => String(s || '').trim()).filter(Boolean))],
    titles: [
      ...new Set(
        [t.userPreferred, t.english, t.romaji, t.native, ...(media?.synonyms || [])].map(strictTitle).filter(Boolean)
      )
    ],
    startYear: Number(media?.startDate?.year) || 0,
    updatedAt: Number(row.updatedAt) || 0
  };
};

export async function alFetchIncremental(userId: number, type: SyncMediaType, since: number): Promise<AniListSyncEntry[]> {
  const q = `query ($userId: Int, $type: MediaType, $page: Int) { Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage } mediaList(userId: $userId, type: $type, sort: UPDATED_TIME_DESC) { ${ENTRY_FIELDS} media { ${MEDIA_FIELDS} } } } }`;
  const out: AniListSyncEntry[] = [];
  for (let page = 1; page <= 400; page++) {
    checkCancel();
    const p = (await AniList.query(q, { userId, type, page }))?.Page;
    let stop = false;
    for (const row of p?.mediaList || []) {
      if ((Number(row.updatedAt) || 0) < since) {
        stop = true;
        break;
      }
      out.push(toEntry(row, row.media));
    }
    if (stop || !p?.pageInfo?.hasNextPage) break;
  }
  return out;
}

export async function alFetchAll(userId: number, type: SyncMediaType): Promise<AniListSyncEntry[]> {
  const q = `query ($userId: Int, $type: MediaType, $chunk: Int, $perChunk: Int) {
    MediaListCollection(userId: $userId, type: $type, chunk: $chunk, perChunk: $perChunk) { hasNextChunk lists { entries { ${ENTRY_FIELDS} media { ${MEDIA_FIELDS} } } } } }`;
  const out: AniListSyncEntry[] = [];
  const seen = new Set<number>();
  for (let chunk = 1; chunk <= 100; chunk++) {
    checkCancel();
    const c = (await AniList.query(q, { userId, type, chunk, perChunk: 500 }))?.MediaListCollection;
    for (const list of c?.lists || []) {
      for (const row of list.entries || []) {
        const e = toEntry(row, row.media);
        if (!e.mediaId || seen.has(e.mediaId)) continue;
        seen.add(e.mediaId);
        out.push(e);
      }
    }
    if (!c?.hasNextChunk) return out;
  }
  throw new Error('AniList collection exceeded the 100-chunk safety limit.');
}

const isTransient = (e: any): boolean => !(e && (e.status === 400 || e.status === 404 || (e.status === 403 && !e.html)));

export async function pushJob(
  type: SyncMediaType,
  { entry, malId, patch }: SyncJob,
  mal: Record<number, any>,
  c: SyncCounters
): Promise<void> {
  const settled = stores[type].settled;
  try {
    await breaker.wait(checkCancel);
    checkCancel();
    if (breaker.trips >= BREAKER_MAX_TRIPS) {
      const e: FlaggedError = new Error('MAL keeps failing — stopping this run; it will retry automatically.');
      e.abort = true;
      throw e;
    }
    let sent = patch;
    let res: any;
    const tried = new Set<string>();
    for (;;) {
      try {
        res = await malUpdateEntry(type, malId, sent);
        break;
      } catch (e: any) {
        const alt = e.status === 400 ? fallbackPatch(type, sent, mal[malId], tried) : null;
        if (!alt) throw e;
        const removedDates = ['start_date', 'finish_date'].some((k) => k in sent && !(k in alt));
        const cappedKeys = Object.keys(alt).filter(
          (k) => PROGRESS_KEYS.includes(k) && Number(alt[k]) < Number(sent[k])
        );
        const recovery = cappedKeys.length
          ? `retrying with ${cappedKeys
              .map(
                (k) =>
                  `${k .replace('num_watched_episodes', 'episode count') .replace('num_chapters_read', 'chapter count') .replace('num_volumes_read', 'volume count')} capped to ${alt[k]} (MAL's listed total)`
              )
              .join(', ')}`
          : removedDates
          ? 'retrying without the optional start/finish dates'
          : 'retrying with a reduced update';
        log(`${typeLabel(type)}: MAL rejected the update for "${entry.title.slice(0, 45)}" (HTTP 400); ${recovery}.`, 'warn');
        sent = alt;
      }
    }
    let stored: any = null;
    try {
      stored = JSON.parse(res.responseText);
    } catch (_) {}
    const base = mal[malId] || { __total: 0, __totalVolumes: 0, __malTitle: '' };
    const applied = Object.fromEntries(Object.entries(sent).map(([k, v]) => [malKey(k), v]));
    const echoed = stored && typeof stored === 'object' ? stored : {};
    mal[malId] = { ...base, ...applied, ...echoed };
    const residual = stored ? reconcile(type, entry, mal[malId]) : {};
    if (residual && Object.keys(residual).length) {
      settled.data[malId] = [entry.updatedAt, JSON.stringify(residual), Date.now()];
      log(
        `${typeLabel(type)}: MAL saved "${entry.title.slice(0, 55)}" but did not retain ${describePatch(
          type,
          residual
        )}. It may be normalising or rejecting that value; unchanged values are suppressed to avoid a write loop. Full Resync clears this suppression.`,
        'warn'
      );
    } else delete settled.data[malId];
    settled.save();
    c.pushed++;
    log(`${typeLabel(type)}: updated "${entry.title.slice(0, 55)}" — ${describePatch(type, sent)}.`, 'success');
    breaker.ok();
  } catch (e: any) {
    if (e.cancelled || e.auth || e.abort) throw e;
    if (isTransient(e)) {
      c.transient++;
      breaker.fail();
      log(`${typeLabel(type)}: "${entry.title.slice(0, 45)}" — temporary MAL error: ${e.message}. Will retry on the next sync.`, 'warn');
    } else {
      c.permanent++;
      log(
        `${typeLabel(type)}: "${entry.title.slice(0, 45)}" — MAL rejected this update (${
          e.message
        }). It will be skipped until the AniList entry changes or Full Resync is run.`,
        'warn'
      );
      settled.data[malId] = [entry.updatedAt, 'dead', Date.now()];
      settled.save();
      if (e.status === 404) rememberId(type, entry.mediaId, 0, malId);
    }
  } finally {
    markDone();
  }
}

export function planJobs(
  type: SyncMediaType,
  targets: SyncTarget[],
  mal: Record<number, any>,
  c: SyncCounters
): SyncJob[] {
  const settled = stores[type].settled.data;
  const jobs: SyncJob[] = [];
  for (const t of targets) {
    checkCancel();
    const patch = reconcile(type, t.entry, mal[t.malId]);
    if (!patch) {
      c.skipped++;
      markDone();
      continue;
    }
    if (!Object.keys(patch).length) {
      c.unchanged++;
      markDone();
      continue;
    }
    const s = settled[t.malId];
    if (s && s[0] === t.entry.updatedAt && (s[1] === 'dead' || s[1] === JSON.stringify(patch))) {
      c.settled++;
      markDone();
      continue;
    }
    progress.changed++;
    jobs.push({ ...t, patch });
  }
  return jobs;
}

export async function syncType(type: SyncMediaType, userId: number, full: boolean): Promise<{ ok: boolean }> {
  const label = typeLabel(type);
  const c: SyncCounters = { pushed: 0, unchanged: 0, settled: 0, skipped: 0, unmatched: 0, conflicts: 0, transient: 0, permanent: 0 };
  const lastSync = Number(store.get(`last_sync_${type}`, 0)) || 0;
  const fullPass = full || !lastSync || Date.now() - Number(store.get(`last_compare_${type}`, 0)) > FULL_COMPARE_MS;

  log(`${label}: starting ${fullPass ? 'full library comparison' : 'incremental sync'} — fetching AniList entries and your current MAL list.`);
  const [entries, mal] = await Promise.all([
    fullPass ? alFetchAll(userId, type) : alFetchIncremental(userId, type, lastSync),
    malFetchList(type)
  ]);
  const newest = entries.reduce((m, e) => Math.max(m, e.updatedAt), 0);
  log(`${label}: found ${entries.length} AniList entr${entries.length === 1 ? 'y' : 'ies'} to check and ${Object.keys(mal).length} entr${Object.keys(mal).length === 1 ? 'y' : 'ies'} on MAL.`);
  progress.total += entries.length;
  progress.phase = 'pushing';
  notifyProgress(true);

  const targets = dedupeTargets(type, await resolveTargets(type, entries, mal, c), c);
  const jobs = planJobs(type, targets, mal, c);
  await runPool(jobs, (job) => pushJob(type, job, mal, c), Math.max(2, Math.min(8, Math.round(malLimiter.rate / 20))));

  const ok = c.transient === 0;
  if (ok) {
    if (fullPass) {
      store.set(`last_compare_${type}`, Date.now());
      store.set(`last_sync_${type}`, Math.max(1, newest));
    } else if (newest) store.set(`last_sync_${type}`, Math.max(newest, lastSync));
    store.set(`last_run_${type}`, Math.floor(Date.now() / 1000));
  }
  const parts = [
    `${c.pushed} updated`,
    `${c.unchanged + c.settled} already in sync`,
    c.unmatched && `${c.unmatched} unmatched`,
    c.skipped && `${c.skipped} skipped`,
    c.conflicts && `${c.conflicts} conflicts`,
    c.permanent && `${c.permanent} rejected`,
    c.transient && `${c.transient} failed (will retry)`
  ].filter(Boolean);
  log(
    `${label}: finished — ${parts.join(', ')}${c.transient ? '; this type will be retried' : ''}.`,
    c.transient || c.permanent || c.unmatched || c.conflicts ? 'warn' : 'success'
  );
  return { ok };
}

export const currentListType = (): SyncMediaType | null => {
  const m = location.pathname.match(LIST_PATH_RE);
  return m ? (m[1].toUpperCase() as SyncMediaType) : null;
};

export async function confirmDecimalScores(): Promise<boolean> {
  const v = await tryOr(() => AniList.viewer());
  if (v?.scoreFormat !== 'POINT_10_DECIMAL') return true;
  const mode = Settings.get('syncScoreRounding');
  const labels: Record<string, string> = {
    ceil: 'Ceil (always up)',
    round: 'Round (.1–.4 down, .5–.9 up)',
    floor: 'Floor (always down)'
  };
  const examples: Record<string, string> = {
    ceil: '7.4 → 8 and 7.5 → 8',
    round: '7.4 → 7 and 7.5 → 8',
    floor: '7.4 → 7 and 7.5 → 7'
  };
  return confirm(
    `Decimal scores detected on AniList.\n\nMAL uses whole-number scores, so your decimal scores will be converted using: ${labels[mode]}.\n${examples[mode]}.\n\nThis will affect the scores written to MAL during this first sync.\n\nContinue with the first sync?`
  );
}

function handleAuthFailure(e: any): void {
  if (e.auth === 'AniList') clearAniListAuth();
  else clearMalAuth();
  log(`⚠ ${e.message}`);
}

export async function runSync(types: SyncMediaType[] = [...TYPES], opts: { full?: boolean } = {}): Promise<void> {
  if (syncStatus.syncing) return log('Sync already running.');
  if (!store.get('al_token') || !store.get('mal_token')) return log('Connect both AniList and MAL first.');
  if (navigator.onLine === false) return log('You appear to be offline; sync skipped.');
  syncStatus.syncing = true;
  syncStatus.cancelled = false;
  if (!(await acquireLock())) {
    syncStatus.syncing = false;
    return log('Another tab is already syncing, skipped.');
  }
  breaker.reset();
  store.set('sync_onboarded', true);
  Object.assign(progress, { phase: 'fetching', done: 0, total: 0, changed: 0 });
  notifyState();
  const startedAt = Date.now();
  let allOk = false;
  try {
    const viewer = await AniList.viewer();
    if (!viewer) throw { auth: 'AniList', message: 'AniList is not connected.' };
    const me = await malWhoAmI();
    const account = `${viewer.id}:${me.id}`;
    const prev = store.get<string | null>('sync_account', null);
    if (prev && prev !== account) {
      log('Connected account changed. Resetting sync watermarks and per-account suppression state.', 'warn');
      resetAccountState();
    }
    store.set('sync_account', account);

    if (opts.full) for (const t of types) clearCache(stores[t].settled);
    const results = await Promise.allSettled(types.map((t) => syncType(t, viewer.id, !!opts.full)));
    const fatal = results.find(
      (r) => r.status === 'rejected' && ((r as any).reason?.auth || (r as any).reason?.abort)
    );
    for (const r of results) {
      if (r.status !== 'rejected') continue;
      const e = (r as any).reason || {};
      if (e.cancelled) log('Sync stopped after the current request finished.', 'warn');
      else if (!e.auth) log(`Sync could not finish: ${e.message || e}`, 'error');
    }
    if (fatal) {
      if ((fatal as any).reason.auth) handleAuthFailure((fatal as any).reason);
      else log(`Sync stopped: ${(fatal as any).reason.message}`, 'error');
    }
    allOk = results.every((r) => r.status === 'fulfilled' && (r as any).value.ok);
    if (allOk) {
      store.del('sync_retry_at');
      log(`Synced in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    } else if (!syncStatus.cancelled) store.set('sync_retry_at', Date.now() + RETRY_AFTER_FAILURE_MS);
  } catch (e: any) {
    if (e.auth) handleAuthFailure(e);
    else log('Sync could not finish: ' + (e.message || e), 'error');
    if (!e.auth && !syncStatus.cancelled) store.set('sync_retry_at', Date.now() + RETRY_AFTER_FAILURE_MS);
  } finally {
    for (const t of types) {
      stores[t].ids.save();
      stores[t].settled.save();
    }
    releaseLock();
    syncStatus.syncing = false;
    syncStatus.cancelled = false;
    progress.phase = 'idle';
    notifyState();
  }
}

export async function startManualSync(): Promise<void> {
  if (syncStatus.syncing) return;
  const pageType = currentListType();
  const types = pageType ? [pageType] : [...TYPES];
  if (types.some((t) => !store.get(`last_sync_${t}`, 0)) && !(await confirmDecimalScores()))
    return log('First sync cancelled.');
  runSync(types);
}

export async function fullResync(): Promise<void> {
  if (syncStatus.syncing) return;
  if (!store.get('sync_onboarded', false) && !(await confirmDecimalScores())) return log('Full resync cancelled.');
  for (const t of TYPES) clearCache(stores[t].ids);
  log('Full Resync started: checking the entire AniList library and clearing cached match/suppression decisions.');
  runSync([...TYPES], { full: true });
}

export function maybeAutoSync(): void {
  if (!Settings.get('syncEnabled') || syncStatus.syncing || Date.now() < syncStatus.autoSyncRetryAfter || navigator.onLine === false) return;
  if (!store.get('al_token') || !store.get('mal_token') || !store.get('sync_onboarded', false)) return;
  const runs = TYPES.map((t) => Number(store.get(`last_run_${t}`, 0)) || 0);
  const last = Math.min(...runs);
  if (!(last > 0)) return;
  const hours = Settings.get('syncIntervalHours');
  const retryAt = Number(store.get('sync_retry_at', 0)) || 0;
  const due = retryAt ? Date.now() >= retryAt : Date.now() - last * 1000 >= hours * 3600e3;
  if (due) {
    log(retryAt ? 'Auto-sync: retrying after an earlier failure…' : `Auto-sync: ${hours}h interval reached…`);
    syncStatus.autoSyncRetryAfter = Date.now() + 5 * 60e3;
    runSync([...TYPES]);
  }
}