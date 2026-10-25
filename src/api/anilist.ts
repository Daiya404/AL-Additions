import { RateLimiter } from '../utils/limiter';
import { store, sleep, authError, logDebug } from '../utils/helpers';
import { unsafeWindow } from 'vite-plugin-monkey/dist/client';

export interface ViewerInfo {
  id: number;
  name: string;
  scoreFormat: string;
}

export interface MediaEntry {
  id: number;
  idMal: number | null;
  format: string;
  title: {
    userPreferred?: string;
    english?: string;
    romaji?: string;
    native?: string;
  };
  episodes: number | null;
  chapters: number | null;
  status: string;
  season?: string;
  seasonYear?: number;
  nextAiringEpisode?: {
    episode: number;
  };
  mediaListEntry?: {
    score: number;
    progress: number;
    status: string;
    completedAt?: {
      year?: number;
      month?: number;
      day?: number;
    };
  };
}

export interface MediaListEntryItem {
  id: number;
  mediaId: number;
  status: string;
  score: number;
  progress: number;
  progressVolumes?: number;
  repeat?: number;
  priority?: number;
  notes?: string;
  customLists?: Record<string, boolean>;
  startedAt?: { year?: number; month?: number; day?: number };
  completedAt?: { year?: number; month?: number; day?: number };
  media?: {
    id: number;
    idMal: number | null;
    format?: string;
    episodes?: number | null;
    chapters?: number | null;
    status?: string;
    title?: {
      userPreferred?: string;
      english?: string;
      romaji?: string;
      native?: string;
    };
  };
}

export interface MediaListGroup {
  name: string;
  isCustomList: boolean;
  status: string | null;
  entries: MediaListEntryItem[];
}

export interface MediaListCollectionData {
  hasNextChunk?: boolean;
  user?: {
    id: number;
    name: string;
  };
  lists: MediaListGroup[];
}

export interface MediaListResult {
  collection: MediaListCollectionData;
  lists: MediaListGroup[];
  allEntries: MediaListEntryItem[];
  user?: { id: number; name: string };
}

export interface QueryOptions {
  retries?: number;
  forceFresh?: boolean;
}

interface EntityMeta {
  entityKey: string;
  isSuperset: boolean;
  requiredFields: Set<string>;
}

const KNOWN_LIST_FIELDS = [
  'mediaId', 'id', 'score', 'status', 'progress', 'progressVolumes',
  'notes', 'startedAt', 'completedAt', 'repeat', 'priority', 'private',
  'hiddenFromStatusLists', 'customLists', 'advancedScores', 'updatedAt',
  'media', 'title', 'coverImage', 'format', 'episodes', 'volumes',
  'chapters', 'averageScore', 'popularity', 'genres', 'tags', 'bannerImage'
];

const KNOWN_MEDIA_FIELDS = [
  'id', 'idMal', 'type', 'title', 'format', 'episodes', 'chapters', 'status',
  'mediaListEntry', 'season', 'seasonYear', 'nextAiringEpisode', 'synonyms',
  'isAdult', 'genres', 'tags', 'bannerImage', 'coverImage', 'description'
];

function parseEntityMeta(query: string, vars: Record<string, any>): EntityMeta | null {
  const clean = query.replace(/#[^\n\r]*/g, ' ').replace(/\s+/g, ' ');

  if (/\bMediaListCollection\b/i.test(clean)) {
    const type = (vars.type || 'ANIME').toUpperCase();
    const who = vars.userId || (vars.userName ? String(vars.userName).toLowerCase() : 'me');
    const chunkPart = vars.chunk != null ? `:${vars.chunk}` : '';
    const fieldCount = (clean.match(/[{,]\s*([a-zA-Z0-9_]+)/g) || []).length;
    const isSuperset = fieldCount > 12;

    const requiredFields = new Set<string>();
    for (const f of KNOWN_LIST_FIELDS) {
      if (new RegExp(`\\b${f}\\b`).test(clean)) requiredFields.add(f);
    }

    return {
      entityKey: `MediaListCollection:${type}:${who}${chunkPart}`,
      isSuperset,
      requiredFields
    };
  }

  const mediaMatch = clean.match(/\bMedia\s*\(\s*id\s*:\s*\$([a-zA-Z0-9_]+)/i);
  if (mediaMatch && vars[mediaMatch[1]]) {
    const id = vars[mediaMatch[1]];
    const fieldCount = (clean.match(/[{,]\s*([a-zA-Z0-9_]+)/g) || []).length;
    const requiredFields = new Set<string>();
    for (const f of KNOWN_MEDIA_FIELDS) {
      if (new RegExp(`\\b${f}\\b`).test(clean)) requiredFields.add(f);
    }

    return {
      entityKey: `Media:${id}`,
      isSuperset: fieldCount > 10,
      requiredFields
    };
  }

  if (/\bViewer\b/i.test(clean)) {
    return {
      entityKey: 'Viewer',
      isSuperset: clean.includes('mediaListOptions'),
      requiredFields: new Set(['id', 'name'])
    };
  }

  return null;
}

function isSubsetOf(subset: Set<string>, superset: Set<string>): boolean {
  for (const item of subset) {
    if (!superset.has(item)) return false;
  }
  return true;
}

export const AniList = (() => {
  const limiter = new RateLimiter({ rate: 25, max: 90, burst: 1, persistKey: 'ala_anilist_api_resume_at' });

  interface CachedRecord {
    time: number;
    data: any;
    isSuperset: boolean;
    fields: Set<string>;
  }

  interface InflightEntity {
    promise: Promise<any>;
    isSuperset: boolean;
    fields: Set<string>;
  }

  const entityCache = new Map<string, CachedRecord>();
  const inflightExact = new Map<string, Promise<any>>();
  const inflightEntities = new Map<string, InflightEntity>();
  const ENTITY_TTL = 3 * 60_000;

  function getCsrfToken(): string | null {
    const win = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window) as any;
    if (typeof win.al_token === 'string' && win.al_token) return win.al_token;
    try {
      const meta = win.document?.querySelector('meta[name="csrf-token"]');
      if (meta?.content) return meta.content;
    } catch (_) {}
    try {
      const scripts = win.document?.querySelectorAll('head script') || [];
      for (const s of scripts) {
        const m = s.textContent?.match(/window\.al_token\s*=\s*['"]([^'"]+)['"]/);
        if (m && m[1]) return m[1];
      }
    } catch (_) {}
    return null;
  }

  function isBrowserLoggedIn(): boolean {
    const win = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window) as any;
    const nuxtUser = win.__NUXT__?.state?.auth?.user || win.__NUXT__?.state?.user;
    if (nuxtUser?.id) return true;
    const doc = win.document || document;
    if (doc?.querySelector?.('nav a[href^="/user/"], .nav-wrap a[href^="/user/"], .user-wrap .avatar')) return true;
    if (doc?.querySelector?.('nav a[href="/login"], .nav a[href="/login"]')) return false;
    return Boolean(Number(store.get('al_user_id', 0)) > 0 && store.get('al_username', null));
  }

  const header = (res: Response | undefined, name: string): string | null => {
    try {
      return res?.headers?.get?.(name) ?? null;
    } catch (_) {
      return null;
    }
  };

  function resetDelay(res: Response | undefined): number {
    const retry = Number(header(res, 'Retry-After'));
    if (retry > 0) return Math.min(retry * 1000, 120000);
    const reset = Number(header(res, 'X-RateLimit-Reset'));
    if (reset > 0) return Math.min((reset > 1e12 ? reset : reset * 1000) - Date.now(), 120000);
    return 0;
  }

  function handle(res: Response | undefined): void {
    const advertised = Number(header(res, 'X-RateLimit-Limit'));
    if (advertised > 0) limiter.setRate(Math.floor(advertised * 0.85));
    if (res?.status === 429) return limiter.limit(resetDelay(res) || 60000);
    const remaining = header(res, 'X-RateLimit-Remaining');
    if (remaining != null && Number(remaining) <= 1) limiter.limit(resetDelay(res));
  }

  async function executeNetworkRequest<T>(
    q: string,
    variables: Record<string, any>,
    retries: number,
    forceFresh = false
  ): Promise<T> {
    const csrfToken = getCsrfToken();
    const win = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window) as any;
    const fetchFn = (typeof win.fetch === 'function' ? win.fetch : fetch).bind(win);
    const backoff = () => sleep(1500 * (4 - retries));

    const endpoint = `${win.location?.origin || 'https://anilist.co'}/graphql`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(forceFresh ? { 'Cache-Control': 'no-cache' } : {})
    };

    if (csrfToken) {
      headers['X-CSRF-TOKEN'] = csrfToken;
    }

    let res: Response;

    try {
      await limiter.acquire();
      res = await fetchFn(endpoint, {
        method: 'POST',
        headers,
        cache: forceFresh ? 'no-store' : undefined,
        credentials: 'include',
        body: JSON.stringify({ query: q, variables })
      });
    } catch (e: any) {
      if (retries > 0) {
        await backoff();
        return executeNetworkRequest<T>(q, variables, retries - 1, forceFresh);
      }
      throw new Error(`AniList network error: ${e?.message || e}`);
    }

    handle(res);

    if (!res) {
      throw new Error('AniList network error: empty response');
    }

    if ((res.status === 429 || res.status >= 500) && retries > 0) {
      if (res.status >= 500) await backoff();
      return executeNetworkRequest<T>(q, variables, retries - 1, forceFresh);
    }

    let json: any = null;
    try {
      json = await res.json();
    } catch (_) {}

    const message = json?.errors?.length ? json.errors.map((e: any) => e.message).join('; ') : '';
    if (res.status === 401 || /invalid token|unauthenticated|unauthorized/i.test(message)) {
      clearViewer();
      throw authError('AniList', 'AniList session unauthenticated — please log in to AniList.');
    }
    if (message) throw new Error(message);
    if (!res.ok || !json) throw new Error(`AniList API HTTP ${res.status}`);
    return json.data as T;
  }

  async function query<T = any>(
    q: string,
    variables: Record<string, any> = {},
    optionsOrRetries?: number | QueryOptions
  ): Promise<T> {
    const opts: QueryOptions =
      typeof optionsOrRetries === 'number'
        ? { retries: optionsOrRetries }
        : optionsOrRetries || {};
    const retries = opts.retries ?? 3;
    const isMutation = /\bmutation\b/i.test(q);

    if (isMutation) {
      invalidate();
      return executeNetworkRequest<T>(q, variables, retries);
    }

    const meta = parseEntityMeta(q, variables);
    const now = Date.now();
    const exactKey = `${q}\u0001${JSON.stringify(variables)}`;

    if (!opts.forceFresh && meta) {
      const cached = entityCache.get(meta.entityKey);
      if (cached && now - cached.time < ENTITY_TTL && isSubsetOf(meta.requiredFields, cached.fields)) {
        logDebug('[ANILIST API] 🎯 Cache HIT via Subset matching:', meta.entityKey);
        return cached.data as T;
      }
    }

    if (meta && !opts.forceFresh) {
      const flyingEntity = inflightEntities.get(meta.entityKey);
      if (flyingEntity && isSubsetOf(meta.requiredFields, flyingEntity.fields)) {
        logDebug('[ANILIST API] 🔗 Attached to in-flight Superset request:', meta.entityKey);
        return flyingEntity.promise as Promise<T>;
      }
    }

    const flyingExact = inflightExact.get(exactKey);
    if (flyingExact && !opts.forceFresh) {
      return flyingExact as Promise<T>;
    }

    const networkPromise = executeNetworkRequest<T>(q, variables, retries, opts.forceFresh)
      .then((data) => {
        if (meta && data) {
          entityCache.set(meta.entityKey, {
            time: Date.now(),
            data,
            isSuperset: meta.isSuperset,
            fields: meta.requiredFields
          });
        }
        return data;
      })
      .finally(() => {
        inflightExact.delete(exactKey);
        if (meta && inflightEntities.get(meta.entityKey)?.promise === networkPromise) {
          inflightEntities.delete(meta.entityKey);
        }
      });

    inflightExact.set(exactKey, networkPromise);
    if (meta) {
      const existing = inflightEntities.get(meta.entityKey);
      if (!existing || (!existing.isSuperset && meta.isSuperset)) {
        inflightEntities.set(meta.entityKey, {
          promise: networkPromise,
          isSuperset: meta.isSuperset,
          fields: meta.requiredFields
        });
      }
    }

    return networkPromise;
  }

  function formatMediaListResult(mlc: any): MediaListResult {
    const mergedCollection: MediaListCollectionData = {
      user: mlc.user,
      lists: mlc.lists || []
    };

    const seenEntryIds = new Set<number>();
    const allEntries: MediaListEntryItem[] = [];
    for (const list of mergedCollection.lists) {
      for (const entry of list.entries || []) {
        if (!seenEntryIds.has(entry.id)) {
          seenEntryIds.add(entry.id);
          allEntries.push(entry);
        }
      }
    }

    return {
      collection: mergedCollection,
      lists: mergedCollection.lists,
      allEntries,
      user: mergedCollection.user
    };
  }

  function parseRpcMediaList(payload: any): MediaListResult | null {
    if (!payload || typeof payload !== 'object') return null;

    const mlc = payload.MediaListCollection || payload.data?.MediaListCollection;
    if (mlc && Array.isArray(mlc.lists)) {
      return formatMediaListResult(mlc);
    }

    const entities = payload.entities || payload;
    const entriesMap = entities?.listEntry || entities?.mediaListEntry;
    if (entriesMap && typeof entriesMap === 'object') {
      const mediaMap = entities.media || entities.listEntryMedia || {};
      const allEntries: MediaListEntryItem[] = [];

      for (const rawEntry of Object.values(entriesMap) as any[]) {
        if (!rawEntry || typeof rawEntry !== 'object') continue;
        const mediaId =
          rawEntry.mediaId ||
          (typeof rawEntry.media === 'number' ? rawEntry.media : rawEntry.media?.id);
        if (!mediaId) continue;

        const mediaObj =
          typeof rawEntry.media === 'object' && rawEntry.media !== null
            ? rawEntry.media
            : mediaMap[mediaId] || { id: mediaId };

        allEntries.push({
          ...rawEntry,
          mediaId,
          media: mediaObj
        });
      }

      if (allEntries.length === 0) return null;

      const userObj = entities.user ? (Object.values(entities.user)[0] as any) : undefined;
      const lists: any[] = [];
      if (entities.listSection && typeof entities.listSection === 'object') {
        for (const sec of Object.values(entities.listSection) as any[]) {
          if (!sec) continue;
          lists.push({
            name: sec.name || '',
            isCustomList: !!sec.isCustomList,
            status: sec.status,
            entries: Array.isArray(sec.entries)
              ? sec.entries.map((id: any) => entriesMap[id]).filter(Boolean)
              : []
          });
        }
      }

      const user = userObj && userObj.id ? { id: Number(userObj.id), name: String(userObj.name || '') } : undefined;
      const collection: MediaListCollectionData = {
        lists,
        user
      };

      return {
        collection,
        allEntries,
        lists,
        user
      };
    }

    return null;
  }

  function tryGetCachedMediaList(
    target: number | string,
    type: 'ANIME' | 'MANGA',
    userId?: number,
    userName?: string
  ): MediaListResult | null {
    const win = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window) as any;
    const t = type.toUpperCase();
    const isId = typeof target === 'number' || /^\d+$/.test(String(target));
    const id = userId || (isId ? Number(target) : undefined);
    const name = userName || (!isId ? String(target).trim().toLowerCase() : undefined);

    const userMap: Map<string, number> | undefined = win.__ALFL_USER_MAP__;
    const idMap: Map<number, string> | undefined = win.__ALFL_ID_MAP__;

    const resolvedId = id || (name && userMap ? userMap.get(name) : undefined);
    const resolvedName = name || (resolvedId && idMap ? idMap.get(resolvedId)?.toLowerCase() : undefined);

    // 1. Check entityCache in AniList
    const entityKeys: string[] = [];
    if (resolvedId) entityKeys.push(`MediaListCollection:${t}:${resolvedId}`);
    if (resolvedName) entityKeys.push(`MediaListCollection:${t}:${resolvedName}`);
    for (const k of entityKeys) {
      const cached = entityCache.get(k);
      if (cached && Date.now() - cached.time < ENTITY_TTL && cached.data?.MediaListCollection) {
        logDebug('[ANILIST API] 🎯 Cache HIT for MediaListCollection via entityCache:', k);
        return formatMediaListResult(cached.data.MediaListCollection);
      }
    }

    // 2. Check FastLoad GQL Store (Fetch responses intercepted by FastLoad)
    const gqlStore: Map<string, { time: number; snap: any }> | undefined = win.__ALFL_GQL_STORE__;
    if (gqlStore) {
      const gqlKeys: string[] = [];
      if (resolvedId) {
        gqlKeys.push(`gql:MediaListCollection:${t}:${resolvedId}:{}`);
      }
      if (resolvedName) {
        gqlKeys.push(`gql:MediaListCollection:${t}:${resolvedName}:{}`);
      }

      for (const k of gqlKeys) {
        const cached = gqlStore.get(k);
        if (cached && Date.now() - cached.time < 5 * 60_000 && cached.snap?.buf) {
          try {
            const raw = new TextDecoder().decode(cached.snap.buf);
            const json = JSON.parse(raw);
            const mlc = json?.data?.MediaListCollection || json?.MediaListCollection;
            if (mlc && Array.isArray(mlc.lists)) {
              logDebug('[ANILIST API] 🎯 Cache HIT for MediaListCollection via FastLoad GQL store:', k);
              const result = formatMediaListResult(mlc);
              if (resolvedId) {
                entityCache.set(`MediaListCollection:${t}:${resolvedId}`, {
                  time: Date.now(),
                  data: { MediaListCollection: mlc },
                  isSuperset: true,
                  fields: new Set(KNOWN_LIST_FIELDS)
                });
              }
              if (resolvedName) {
                entityCache.set(`MediaListCollection:${t}:${resolvedName}`, {
                  time: Date.now(),
                  data: { MediaListCollection: mlc },
                  isSuperset: true,
                  fields: new Set(KNOWN_LIST_FIELDS)
                });
              }
              return result;
            }
          } catch (_) {}
        }
      }
      for (const [k, cached] of gqlStore.entries()) {
        if (!k.startsWith(`gql:MediaListCollection:${t}:`)) continue;
        const matchId = resolvedId && k.includes(`:${resolvedId}:`);
        const matchName = resolvedName && k.toLowerCase().includes(`:${resolvedName.toLowerCase()}:`);
        if ((matchId || matchName) && cached && Date.now() - cached.time < 5 * 60_000 && cached.snap?.buf) {
          try {
            const raw = new TextDecoder().decode(cached.snap.buf);
            const json = JSON.parse(raw);
            const mlc = json?.data?.MediaListCollection || json?.MediaListCollection;
            if (mlc && Array.isArray(mlc.lists)) {
              logDebug('[ANILIST API] 🎯 Cache HIT for MediaListCollection via FastLoad GQL store (scan):', k);
              const result = formatMediaListResult(mlc);
              if (resolvedId) {
                entityCache.set(`MediaListCollection:${t}:${resolvedId}`, {
                  time: Date.now(),
                  data: { MediaListCollection: mlc },
                  isSuperset: true,
                  fields: new Set(KNOWN_LIST_FIELDS)
                });
              }
              if (resolvedName) {
                entityCache.set(`MediaListCollection:${t}:${resolvedName}`, {
                  time: Date.now(),
                  data: { MediaListCollection: mlc },
                  isSuperset: true,
                  fields: new Set(KNOWN_LIST_FIELDS)
                });
              }
              return result;
            }
          } catch (_) {}
        }
      }
    }

    // 3. Check FastLoad RPC Cache (Prefetched by Web Worker)
    const rpcCache: Map<string, { time: number; msg: any }> | undefined = win.__ALFL_RPC_CACHE__;
    if (rpcCache) {
      const rpcKeys: string[] = [];
      if (resolvedId) {
        rpcKeys.push(`rpc:MediaListCollection:${t}:${resolvedId}:{}`);
      }
      if (resolvedName) {
        rpcKeys.push(`rpc:MediaListCollection:${t}:${resolvedName}:{}`);
      }

      for (const k of rpcKeys) {
        const cached = rpcCache.get(k);
        if (cached && Date.now() - cached.time < 5 * 60_000 && cached.msg) {
          const payload = cached.msg.result ?? cached.msg;
          const result = parseRpcMediaList(payload);
          if (result && result.allEntries.length > 0) {
            logDebug('[ANILIST API] 🎯 Cache HIT for MediaListCollection via FastLoad RPC cache:', k);
            return result;
          }
        }
      }

      for (const [k, cached] of rpcCache.entries()) {
        if (!k.startsWith(`rpc:MediaListCollection:${t}:`)) continue;
        const matchId = resolvedId && k.includes(`:${resolvedId}:`);
        const matchName = resolvedName && k.toLowerCase().includes(`:${resolvedName.toLowerCase()}:`);
        if ((matchId || matchName) && cached && Date.now() - cached.time < 5 * 60_000 && cached.msg) {
          const payload = cached.msg.result ?? cached.msg;
          const result = parseRpcMediaList(payload);
          if (result && result.allEntries.length > 0) {
            logDebug('[ANILIST API] 🎯 Cache HIT for MediaListCollection via FastLoad RPC cache (scan):', k);
            return result;
          }
        }
      }
    }

    return null;
  }

  async function getMediaList(
    target: number | string,
    type: 'ANIME' | 'MANGA' = 'ANIME',
    options?: { forceFresh?: boolean; userId?: number; userName?: string }
  ): Promise<MediaListResult> {
    const isId = typeof target === 'number' || /^\d+$/.test(String(target));
    const userId = options?.userId || (isId ? Number(target) : undefined);
    const userName = options?.userName || (!isId ? String(target).trim() : undefined);

    if (!options?.forceFresh) {
      const cached = tryGetCachedMediaList(target, type, userId, userName);
      if (cached) {
        return cached;
      }
    }

    const win = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window) as any;
    const rpcInflight: Map<string, { promise: Promise<any> }> | undefined = win.__ALFL_RPC_INFLIGHT__;
    if (rpcInflight && !options?.forceFresh) {
      const t = type.toUpperCase();
      const userMap: Map<string, number> | undefined = win.__ALFL_USER_MAP__;
      const idMap: Map<number, string> | undefined = win.__ALFL_ID_MAP__;
      const resolvedId = userId || (userName && userMap ? userMap.get(userName.toLowerCase()) : undefined);
      const resolvedName = userName ? userName.toLowerCase() : (resolvedId && idMap ? idMap.get(resolvedId)?.toLowerCase() : undefined);

      const rpcKeys: string[] = [];
      if (resolvedId) rpcKeys.push(`rpc:MediaListCollection:${t}:${resolvedId}:{}`);
      if (resolvedName) rpcKeys.push(`rpc:MediaListCollection:${t}:${resolvedName}:{}`);

      const checkInflight = async (k: string, flight: { promise: Promise<any> }) => {
        try {
          logDebug('[ANILIST API] ⏳ Awaiting in-flight FastLoad RPC prefetch:', k);
          const msg = await Promise.race([
            flight.promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
          ]);
          const payload = msg?.result ?? msg;
          const parsed = parseRpcMediaList(payload);
          if (parsed && parsed.allEntries.length > 0) {
            logDebug('[ANILIST API] 🎯 Cache HIT from completed in-flight FastLoad RPC prefetch:', k);
            return parsed;
          }
        } catch (_) {}
        return null;
      };

      for (const k of rpcKeys) {
        const flight = rpcInflight.get(k);
        if (flight) {
          const res = await checkInflight(k, flight);
          if (res) return res;
        }
      }

      for (const [k, flight] of rpcInflight.entries()) {
        if (!k.startsWith(`rpc:MediaListCollection:${t}:`)) continue;
        const matchId = resolvedId && k.includes(`:${resolvedId}:`);
        const matchName = resolvedName && k.toLowerCase().includes(`:${resolvedName.toLowerCase()}:`);
        if (matchId || matchName) {
          const res = await checkInflight(k, flight);
          if (res) return res;
        }
      }
    }

    const singleQuery = `query ($userId: Int, $userName: String, $type: MediaType) {
      MediaListCollection(userId: $userId, userName: $userName, type: $type) {
        user { id name }
        lists {
          name
          isCustomList
          status
          entries {
            id
            mediaId
            status
            score
            progress
            progressVolumes
            repeat
            priority
            notes
            customLists
            startedAt { year month day }
            completedAt { year month day }
            media {
              id
              idMal
              format
              episodes
              chapters
              status
              title { userPreferred english romaji native }
            }
          }
        }
      }
    }`;

    const queryVars = {
      userId: userId || undefined,
      userName: userId ? undefined : (userName || undefined),
      type
    };

    const data = await query<{ MediaListCollection: MediaListCollectionData }>(
      singleQuery,
      queryVars,
      { forceFresh: options?.forceFresh }
    );

    const mlc = data?.MediaListCollection;
    if (!mlc || !Array.isArray(mlc.lists)) {
      throw new Error('Unexpected MediaListCollection response shape');
    }

    return formatMediaListResult(mlc);
  }

  async function viewer(): Promise<ViewerInfo | null> {
    const name = store.get<string | null>('al_username', null);
    const fmt = store.get<string | null>('al_score_format', null);
    const id = Number(store.get('al_user_id', 0));
    if (name && fmt && id) return { id, name, scoreFormat: fmt };
    if (!hasAuth()) return null;

    const d = await query<{ Viewer: { id: number; name: string; mediaListOptions: { scoreFormat: string } } | null }>(
      'query { Viewer { id name mediaListOptions { scoreFormat } } }',
      {}
    ).catch((e) => {
      if (e?.auth) throw e;
      return null;
    });

    if (d?.Viewer) {
      store.set('al_user_id', d.Viewer.id);
      store.set('al_username', d.Viewer.name);
      store.set('al_score_format', d.Viewer.mediaListOptions.scoreFormat);
      return { id: d.Viewer.id, name: d.Viewer.name, scoreFormat: d.Viewer.mediaListOptions.scoreFormat };
    }
    return null;
  }

  const clearViewer = (): void => {
    store.del('al_username');
    store.del('al_user_id');
    store.del('al_score_format');
  };

  const invalidate = (entityKeyPrefix?: string): void => {
    if (!entityKeyPrefix) {
      entityCache.clear();
      inflightEntities.clear();
    } else {
      for (const k of entityCache.keys()) {
        if (k.startsWith(entityKeyPrefix)) entityCache.delete(k);
      }
      for (const k of inflightEntities.keys()) {
        if (k.startsWith(entityKeyPrefix)) inflightEntities.delete(k);
      }
    }

    const win = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window) as any;
    win.__ALFL_CLEAR__?.();
  };

  const invalidateMediaList = (target?: number | string, type?: 'ANIME' | 'MANGA'): void => {
    if (!target) return invalidate('MediaListCollection');
    const t = type ? type.toUpperCase() : '';
    const prefix = t ? `MediaListCollection:${t}:${String(target).toLowerCase()}` : `MediaListCollection:`;
    invalidate(prefix);
  };

  const hasAuth = (): boolean => isBrowserLoggedIn();
  const resumeAt = (): number => limiter.resumeAt;

  return {
    query,
    getMediaList,
    viewer,
    clearViewer,
    invalidate,
    invalidateMediaList,
    hasAuth,
    resumeAt
  };
})();

export const MediaData = (() => {
  async function get(
    id: number | string,
    type: 'ANIME' | 'MANGA',
    opts?: { throwAuth?: boolean }
  ): Promise<MediaEntry | null> {
    try {
      const data = await AniList.query<{ Media: MediaEntry }>(
        `query($id:Int,$type:MediaType){ Media(id:$id,type:$type){
          id idMal format title { userPreferred english romaji native }
          episodes chapters status season seasonYear nextAiringEpisode { episode }
          mediaListEntry { score progress status completedAt { year month day } }
        } }`,
        { id: Number(id), type }
      );
      return data?.Media || null;
    } catch (e: any) {
      if (opts?.throwAuth && e?.auth) throw e;
      logDebug('[MEDIA DATA] fetch failed:', e?.message || e);
      return null;
    }
  }

  async function save(
    id: number | string,
    _type: 'ANIME' | 'MANGA',
    c: {
      score?: number;
      progress?: number;
      status?: string;
      completedAt?: { year: number; month: number; day: number };
    }
  ): Promise<any> {
    const data = await AniList.query(
      `mutation($mediaId:Int!,$score:Float,$progress:Int,$status:MediaListStatus,$completedAt:FuzzyDateInput){
        SaveMediaListEntry(mediaId:$mediaId,score:$score,progress:$progress,status:$status,completedAt:$completedAt){
          score progress status completedAt { year month day }
        } }`,
      { mediaId: Number(id), score: c.score, progress: c.progress, status: c.status, completedAt: c.completedAt }
    );
    const entry = data?.SaveMediaListEntry || null;

    AniList.invalidate(`Media:${id}`);
    AniList.invalidateMediaList();
    return entry;
  }

  return { get, save };
})();