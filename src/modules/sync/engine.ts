import { AniList } from '../../api/anilist';
import {
  malUpdateEntry,
  malDeleteEntry,
  malWhoAmI,
  malFetchList,
  malLimiter,
  breaker,
  log,
  clearMalAuth
} from '../../api/mal';
import { hooks } from '../../api/mal';
import { store, tryOr, authError, logDebug } from '../../utils/helpers';
import { strictTitle } from '../../utils/matching';
import { Settings } from '../../settings/settings';
import {
  TYPES,
  SyncMediaType,
  AniListSyncEntry,
  SyncJob,
  SyncTarget,
  SyncCounters,
  FlaggedError,
  typeLabel
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
  resetAccountState,
  getPendingDeletes,
  removePendingDelete
} from './state';
import { reconcile, fallbackPatch, describePatch, malKey, PROGRESS_KEYS } from './reconcile';
import { resolveTargets, dedupeTargets, runPool, rememberId, cachedId } from './targets';

hooks.checkCancel = checkCancel;

const FULL_COMPARE_MS = 7 * 86400e3;
const BREAKER_MAX_TRIPS = 3;
const RETRY_AFTER_FAILURE_MS = 10 * 60e3;
export const LIST_PATH_RE = /^\/user\/[^/]+\/(anime|manga)list/;

const onAniList = (): boolean => location.hostname === 'anilist.co';

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
    const p = (await AniList.query(q, { userId, type, page }, { forceFresh: true }))?.Page;
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
    const c = (await AniList.query(q, { userId, type, chunk, perChunk: 500 }, { forceFresh: true }))?.MediaListCollection;
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
                  `${k.replace('num_watched_episodes', 'episode count').replace('num_chapters_read', 'chapter count').replace('num_volumes_read', 'volume count')} capped to ${alt[k]} (MAL's listed total)`
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
  const c: SyncCounters = { pushed: 0, deleted: 0, unchanged: 0, settled: 0, skipped: 0, unmatched: 0, conflicts: 0, transient: 0, permanent: 0 };
  const lastSync = Number(store.get(`last_sync_${type}`, 0)) || 0;
  const fullPass = full || !lastSync || Date.now() - Number(store.get(`last_compare_${type}`, 0)) > FULL_COMPARE_MS;
  const isExact = Settings.get('syncMode') === 'exact';

  log(`${label}: starting ${fullPass ? 'full library comparison' : 'incremental sync'} — fetching AniList entries and your current MAL list.`);
  logDebug('[SYNC]', `${label}: starting sync pass:`, { fullPass, lastSync, isExact });
  const [entries, mal] = await Promise.all([
    fullPass ? alFetchAll(userId, type) : alFetchIncremental(userId, type, lastSync),
    malFetchList(type)
  ]);
  const newest = entries.reduce((m, e) => Math.max(m, e.updatedAt), 0);
  log(`${label}: found ${entries.length} AniList entr${entries.length === 1 ? 'y' : 'ies'} to check and ${Object.keys(mal).length} entr${Object.keys(mal).length === 1 ? 'y' : 'ies'} on MAL.`);
  logDebug('[SYNC]', `${label}: AniList entries=${entries.length}, MAL entries=${Object.keys(mal).length}`);
  progress.total += entries.length;
  progress.phase = 'pushing';
  notifyProgress(true);

  if (isExact) {
    const pending = getPendingDeletes().filter((p) => p.type === type);
    for (const p of pending) {
      checkCancel();
      const readded = entries.some((e) => e.mediaId === p.mediaId);
      if (readded) {
        removePendingDelete(p.mediaId, type);
        log(`${label}: deletion cancelled for "${p.title}" — entry is present on AniList.`);
        continue;
      }

      let malId = p.malId || cachedId(type, { mediaId: p.mediaId } as any) || stores[type].ids.data[p.mediaId]?.m;
      if (!malId && mal) {
        for (const [id, st] of Object.entries(mal)) {
          if (st.__malTitle && p.title && strictTitle(st.__malTitle) === strictTitle(p.title)) {
            malId = Number(id);
            break;
          }
        }
      }

      if (malId) {
        try {
          await breaker.wait(checkCancel);
          checkCancel();
          await malDeleteEntry(type, Number(malId));
          if (mal[malId]) delete mal[malId];
          c.deleted++;
          log(`${label}: deleted "${p.title}" from MAL (Exact Match).`, 'success');
        } catch (e: any) {
          if (e.status === 404) {
            if (mal[malId]) delete mal[malId];
          } else {
            log(`${label}: failed to delete "${p.title}" from MAL: ${e.message}`, 'warn');
          }
        }
      } else {
        log(`${label}: could not find MAL ID for deleted title "${p.title}".`, 'warn');
      }
      removePendingDelete(p.mediaId, type);
    }
  }

  const targets = dedupeTargets(type, await resolveTargets(type, entries, mal, c), c);
  const jobs = planJobs(type, targets, mal, c);
  await runPool(jobs, (job) => pushJob(type, job, mal, c), Math.max(2, Math.min(8, Math.round(malLimiter.rate / 20))));

  if (isExact && fullPass) {
    const targetMalIds = new Set(targets.map((t) => t.malId));
    const orphanedMalIds = Object.keys(mal)
      .map(Number)
      .filter((id) => id > 0 && !targetMalIds.has(id));

    const MAX_AUTO_DELETE_LIMIT = 10;
    if (orphanedMalIds.length > MAX_AUTO_DELETE_LIMIT) {
      log(
        `${label}: Exact Match found ${orphanedMalIds.length} MAL entries not present on AniList, exceeding the safety limit of ${MAX_AUTO_DELETE_LIMIT}. Auto-delete was skipped to protect your MAL list from potential API data loss.`,
        'warn'
      );
    } else if (orphanedMalIds.length > 0) {
      for (const orphanId of orphanedMalIds) {
        checkCancel();
        const orphanTitle = mal[orphanId]?.__malTitle || `MAL ID ${orphanId}`;
        try {
          await breaker.wait(checkCancel);
          checkCancel();
          await malDeleteEntry(type, orphanId);
          delete mal[orphanId];
          c.deleted++;
          log(`${label}: deleted "${orphanTitle}" from MAL (not on AniList).`, 'success');
        } catch (e: any) {
          if (e.status === 404) {
            delete mal[orphanId];
          } else {
            log(`${label}: failed to delete "${orphanTitle}" from MAL: ${e.message}`, 'warn');
          }
        }
      }
    }
  }

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
    c.deleted ? `${c.deleted} deleted` : null,
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
  if (e.auth === 'AniList') AniList.clearViewer();
  else clearMalAuth();
  log(`⚠ ${e.message}`);
}

export async function runSync(types: SyncMediaType[] = [...TYPES], opts: { full?: boolean } = {}): Promise<void> {
  logDebug('[SYNC]', 'runSync initiated for types:', types, 'options:', opts);
  if (syncStatus.syncing) return log('Sync already running.');
  if (!onAniList()) return log('Open AniList to run a sync — it needs your AniList login.', 'warn');
  if (!AniList.hasAuth()) return log('Log in to AniList first.');
  if (!store.get('mal_token')) return log('Connect MyAnimeList first.');
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
    if (!viewer) throw authError('AniList', 'AniList is not logged in.');
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
  if (!onAniList() || !Settings.get('syncEnabled') || syncStatus.syncing || Date.now() < syncStatus.autoSyncRetryAfter || navigator.onLine === false) return;
  if (!AniList.hasAuth() || !store.get('mal_token')) return;

  const retryAt = Number(store.get('sync_retry_at', 0)) || 0;
  if (retryAt > 0 && Date.now() < retryAt) return;

  const dueTypes: SyncMediaType[] = [];
  for (const t of TYPES) {
    const isAnime = t === 'ANIME';
    const enabled = Settings.get(isAnime ? 'syncAutoAnime' : 'syncAutoManga');
    if (!enabled) continue;

    const hours = Math.max(1, Number(Settings.get(isAnime ? 'syncIntervalAnime' : 'syncIntervalManga')) || 6);
    const last = Number(store.get(`last_run_${t}`, 0)) || 0;
    const isDue = retryAt > 0
      ? (!last || Date.now() - last * 1000 >= RETRY_AFTER_FAILURE_MS)
      : (!last || Date.now() - last * 1000 >= hours * 3600e3);

    if (isDue) dueTypes.push(t);
  }

  if (dueTypes.length > 0) {
    const labels = dueTypes.map(typeLabel).join(' & ');
    log(
      retryAt > 0
        ? `Auto-sync (${labels}): retrying after an earlier failure…`
        : `Auto-sync (${labels}): interval reached or initial sync…`
    );
    syncStatus.autoSyncRetryAfter = Date.now() + 5 * 60e3;
    runSync(dueTypes);
  } else if (retryAt > 0 && Date.now() >= retryAt) {
    store.del('sync_retry_at');
  }
}