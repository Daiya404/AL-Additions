import {
  win,
  rpcCache,
  rpcInflight,
  rpcEpoch,
  freshFloor,
  userMap,
  idToUserMap,
  rememberUser,
  clearGlobalCache
} from './state';
import { stats, attempt } from './config';
import {
  isMediaListQuery,
  isTaxonomyQuery,
  isViewerQuery,
  isMutation,
  isVolatile,
  normalizeVariables,
  normalizeGqlQuery,
  stableStringify
} from './helpers';
import { store as gmStore, logDebug } from '../../utils/helpers';

export const workerPending = new WeakMap<object, Map<string, { key: string | null; mutation: boolean; epoch?: number }>>();
export const watched = new WeakSet<object>();
export let workerUrl: string | null = null;
export let workerOpts: any;
export let WorkerCtor: any = null;
export let lastAuth = '';

const RPC_MAX_ENTRIES = 32;

const clone = (v: any) => {
  try {
    return (win.structuredClone || structuredClone)(v);
  } catch {
    return JSON.parse(JSON.stringify(v));
  }
};

export const findWorkerUrl = (): string | null =>
  workerUrl ||
  (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
    .map((e) => e.name)
    .find((n) => /\.worker\.js(?:\?|$)/.test(n)) ||
  attempt(() => win.localStorage?.getItem('alfl:workerUrl') || gmStore.get('alfl:workerUrl', null)) ||
  null;

export const isRpcFetch = (d: any) =>
  !!d && d.type === 'RPC' && d.method === 'fetch' && Array.isArray(d.params) && typeof d.params[1] === 'string';

export const rpcKey = (params: any[]) => {
  const [endpoint, query, variables, headers] = params;
  const q = { query, variables };
  if (isMediaListQuery(q)) {
    const normVars = normalizeVariables(variables);
    const { type = 'ANIME', userId, userName, ...rest } = normVars;
    let resolvedId = userId;
    if (!resolvedId && userName) {
      resolvedId = userMap.get(String(userName).toLowerCase());
    }
    const who = resolvedId || (userName ? String(userName).toLowerCase() : 'me');
    return `rpc:MediaListCollection:${String(type).toUpperCase()}:${who}:${stableStringify(rest)}`;
  }
  if (isTaxonomyQuery(q)) return 'rpc:Taxonomy';
  if (isViewerQuery(q)) return 'rpc:Viewer';
  const normQuery = normalizeGqlQuery(query);
  const normVars = stableStringify(normalizeVariables(variables));
  const auth = String(headers?.Authorization ?? headers?.authorization ?? '');
  return `${endpoint}\u0001${auth.slice(-16)}\u0001${normQuery}\u0001${normVars}`;
};

export function extractUsersFromRpcResult(res: any) {
  if (!res || typeof res !== 'object') return;
  attempt(() => {
    const scanUsers = (obj: any, depth = 0) => {
      if (!obj || typeof obj !== 'object' || depth > 5) return;
      if (
        typeof obj.name === 'string' &&
        obj.avatar &&
        obj.id &&
        (typeof obj.id === 'number' || /^\d+$/.test(String(obj.id)))
      ) {
        rememberUser(String(obj.name), Number(obj.id));
      }
      for (const v of Object.values(obj)) {
        if (v && typeof v === 'object') scanUsers(v, depth + 1);
      }
    };
    scanUsers(res);

    const viewer = res.Viewer || res.data?.Viewer;
    if (viewer && viewer.id && viewer.name) {
      rememberUser(String(viewer.name), Number(viewer.id));
      gmStore.set('al_user_id', Number(viewer.id));
      gmStore.set('al_username', String(viewer.name));
    }
    const user = res.User || res.data?.User || res.MediaListCollection?.user || res.data?.MediaListCollection?.user;
    if (user && user.id && user.name) {
      rememberUser(String(user.name), Number(user.id));
    }
  });
}

export const onIn = function (this: any, ev: MessageEvent) {
  const d: any = ev.data;
  if (!d || d.type !== 'RPC') return;
  const id = String(d.id);
  const worker = (ev.currentTarget || ev.target || this) as any;
  const pMap = workerPending.get(worker);
  if (!pMap) return;
  const p = pMap.get(id);
  if (!p) return;
  pMap.delete(id);
  logDebug('[FASTLOAD RPC] IN', id, Object.keys(d));
  if (d.result) {
    extractUsersFromRpcResult(d.result);
  }
  if (p.mutation) return clearGlobalCache();
  if (p.key && d.error == null && p.epoch === rpcEpoch) {
    attempt(() => {
      const cached = { time: Date.now(), msg: clone(d) };
      rpcCache.delete(p.key!);
      rpcCache.set(p.key!, cached);
      while (rpcCache.size > RPC_MAX_ENTRIES) rpcCache.delete(rpcCache.keys().next().value as string);
    });
  }
};

export const getMediaListKeys = (type: string, userId?: number, userName?: string): string[] => {
  const keys = new Set<string>();
  const t = String(type).toUpperCase();
  if (userId) {
    keys.add(`rpc:MediaListCollection:${t}:${userId}:{}`);
    const mappedName = idToUserMap.get(userId);
    if (mappedName) keys.add(`rpc:MediaListCollection:${t}:${mappedName}:{}`);
  }
  if (userName) {
    const norm = String(userName).trim().toLowerCase();
    keys.add(`rpc:MediaListCollection:${t}:${norm}:{}`);
    const mappedId = userMap.get(norm);
    if (mappedId) keys.add(`rpc:MediaListCollection:${t}:${mappedId}:{}`);
  }
  return [...keys];
};

const prefetchedWorkerKeys = new Map<string, number>();

export function prefetchWorkerList(type: 'ANIME' | 'MANGA', userId: number, userName?: string) {
  const url = findWorkerUrl();
  if (!url || !WorkerCtor) {
    logDebug('[FASTLOAD RPC] Prefetch skipped: worker script unknown');
    return;
  }
  if (!userId && userName) {
    userId = userMap.get(userName.toLowerCase()) || 0;
  }
  if (userId && !userName) {
    userName = idToUserMap.get(userId) || undefined;
  }

  const raw = attempt(() => win.localStorage?.getItem('alfl:rpc:listTpl:v2') || gmStore.get('alfl:rpc:listTpl:v2', null));
  let tpl: any;
  if (raw) {
    try {
      tpl = JSON.parse(raw);
    } catch {}
  }
  if (!tpl) {
    logDebug('[FASTLOAD RPC] Prefetch skipped: no list template yet');
    return;
  }

  const vars: any = { ...(tpl.vars || {}), type };
  if (userId) {
    vars.userId = userId;
    delete vars.userName;
  } else if (userName) {
    vars.userName = userName;
    delete vars.userId;
  }
  const authVal =
    lastAuth ||
    gmStore.get('al_token_auth', '') ||
    (gmStore.get('al_token', null) ? `Bearer ${gmStore.get('al_token', null)}` : '');
  const headers: any = { ...(tpl.headers || {}) };
  if (authVal) {
    headers.Authorization = authVal;
    headers.authorization = authVal;
  }
  const options = tpl.options
    ? { ...tpl.options, ...(tpl.options.schemaArgs ? { schemaArgs: [type] } : {}) }
    : tpl.options;
  const params = [tpl.endpoint, tpl.query, vars, headers, options];
  const key = rpcKey(params);
  const now = Date.now();

  const possibleKeys = getMediaListKeys(type, userId, userName);
  for (const k of possibleKeys) {
    const hit = rpcCache.get(k);
    if (hit && hit.time >= freshFloor && now - hit.time < 5 * 60_000) return;
    if (rpcInflight.has(k)) return;
  }
  if (now - (prefetchedWorkerKeys.get(key) || 0) < 60_000) return;
  prefetchedWorkerKeys.set(key, now);
  for (const k of possibleKeys) prefetchedWorkerKeys.set(k, now);

  let w: Worker;
  try {
    w = new WorkerCtor(url, workerOpts);
  } catch (err) {
    logDebug('[FASTLOAD RPC] Prefetch worker failed to start', err);
    return;
  }
  const id = `alfl_prefetch_${type}_${now}`;

  let resolver!: (val: any) => void;
  let rejecter!: (err: any) => void;
  const flightPromise = new Promise((resolve, reject) => {
    resolver = resolve;
    rejecter = reject;
  });
  flightPromise.catch(() => {});
  const flight = { promise: flightPromise, resolve: resolver, reject: rejecter };
  rpcInflight.set(key, flight);
  for (const k of possibleKeys) {
    if (!rpcInflight.has(k)) rpcInflight.set(k, flight);
  }

  const finish = () => {
    clearTimeout(timer);
    for (const k of [key, ...possibleKeys]) {
      const f = rpcInflight.get(k);
      if (f) {
        f.reject(new Error('finished'));
        rpcInflight.delete(k);
      }
    }
    attempt(() => w.terminate());
  };
  const timer = setTimeout(() => {
    logDebug('[FASTLOAD RPC] Prefetch timed out', type);
    finish();
  }, 30_000);

  const startEpoch = rpcEpoch;
  w.addEventListener('message', (ev: MessageEvent) => {
    const d: any = ev.data;
    if (!d || d.type !== 'RPC' || String(d.id) !== id) return;
    if (startEpoch !== rpcEpoch) {
      flight.reject(new Error('stale'));
      clearTimeout(timer);
      attempt(() => w.terminate());
      return;
    }
    if (d.error == null) {
      attempt(() => {
        extractUsersFromRpcResult(d.result);
        const mlcUser = d.result?.MediaListCollection?.user || d.result?.data?.MediaListCollection?.user;
        const extractedUserId = mlcUser?.id ? Number(mlcUser.id) : 0;
        const resolvedUserId = userId || extractedUserId || (userName ? userMap.get(userName.toLowerCase()) : 0) || 0;
        if (userName && resolvedUserId) {
          rememberUser(userName, resolvedUserId);
        }
        const resolvedUserName = userName || (resolvedUserId ? idToUserMap.get(resolvedUserId) : undefined);
        const cached = { time: Date.now(), msg: clone(d) };
        const allKeys = [
          ...new Set([
            key,
            ...possibleKeys,
            ...getMediaListKeys(type, resolvedUserId, resolvedUserName)
          ])
        ];
        for (const k of allKeys) {
          rpcCache.delete(k);
          rpcCache.set(k, cached);
        }
        while (rpcCache.size > RPC_MAX_ENTRIES) rpcCache.delete(rpcCache.keys().next().value as string);
      });
      logDebug('[FASTLOAD RPC] Prefetch cached', type, Object.keys(d));
      for (const k of [key, ...possibleKeys]) {
        const f = rpcInflight.get(k);
        if (f) {
          f.resolve(d);
          rpcInflight.delete(k);
        }
      }
    } else {
      logDebug('[FASTLOAD RPC] Prefetch failed', d.error);
      for (const k of [key, ...possibleKeys]) {
        const f = rpcInflight.get(k);
        if (f) {
          f.reject(d.error);
          rpcInflight.delete(k);
        }
      }
    }
    clearTimeout(timer);
    attempt(() => w.terminate());
  });

  w.addEventListener('error', (e: any) => {
    logDebug('[FASTLOAD RPC] Prefetch worker error', e?.message);
    attempt(() => {
      win.localStorage?.removeItem('alfl:workerUrl');
      gmStore.del('alfl:workerUrl');
    });
    workerUrl = null;
    finish();
  });

  logDebug('[FASTLOAD RPC] Prefetch dispatching', type, vars);
  w.postMessage({ type: 'RPC', id, method: 'fetch', params });
}

export function hookWorker(yielded: () => boolean) {
  attempt(() => {
    const pageWin = win;
    const origCtor = pageWin.Worker;
    WorkerCtor = origCtor;
    if (origCtor && !(origCtor as any).__alfl_ctor_hooked) {
      try {
        const ProxiedWorker = function (this: any, scriptURL: string | URL, options?: WorkerOptions) {
          const instance = Reflect.construct(origCtor, [scriptURL, options], new.target || ProxiedWorker);
          const urlStr = String(scriptURL || '');
          if (urlStr.includes('worker.js') && !urlStr.includes('cloudflare')) {
            attempt(() => {
              workerUrl = new URL(urlStr, win.location.href).href;
              win.localStorage?.setItem('alfl:workerUrl', workerUrl);
              gmStore.set('alfl:workerUrl', workerUrl);
            });
            workerOpts = options;
            logDebug('[FASTLOAD RPC] Page worker created:', urlStr);
          }
          if (!watched.has(instance)) {
            watched.add(instance);
            instance.addEventListener('message', onIn);
          }
          return instance;
        } as any;
        ProxiedWorker.prototype = origCtor.prototype;
        ProxiedWorker.__alfl_ctor_hooked = true;
        pageWin.Worker = ProxiedWorker;
      } catch {}
    }

    const W = pageWin.Worker;
    if (!W?.prototype || (W.prototype as any).__alfl_hooked) return;
    (W.prototype as any).__alfl_hooked = true;
    const origPost = W.prototype.postMessage;
    W.prototype.postMessage = function (this: Worker, data: any, ...rest: any[]) {
      try {
        if (!yielded() && isRpcFetch(data)) {
          const id = String(data.id || '');
          if (id.startsWith('alfl_prefetch_')) {
            return origPost.apply(this, [data, ...rest] as any);
          }
          if (!watched.has(this)) {
            watched.add(this);
            this.addEventListener('message', onIn);
          }
          const h = data.params[3] || {};
          const a = h.Authorization ?? h.authorization;
          if (a) {
            lastAuth = String(a);
            gmStore.set('al_token_auth', lastAuth);
          }
          const q = { query: data.params[1], variables: data.params[2] };
          if (isMediaListQuery(q)) {
            attempt(() => {
              const headers = { ...h };
              delete headers.Authorization;
              delete headers.authorization;
              const tplStr = JSON.stringify({
                endpoint: data.params[0],
                query: data.params[1],
                vars: data.params[2],
                headers,
                options: data.params[4]
              });
              win.localStorage?.setItem('alfl:rpc:listTpl:v2', tplStr);
              gmStore.set('alfl:rpc:listTpl:v2', tplStr);
            });
          }
          if (isMutation(q)) {
            clearGlobalCache();
            let pMap = workerPending.get(this);
            if (!pMap) {
              pMap = new Map();
              workerPending.set(this, pMap);
            }
            pMap.set(id, { key: null, mutation: true });
          } else if (!isVolatile(q)) {
            const key = rpcKey(data.params);
            const label = String(q.query).replace(/\s+/g, ' ').slice(0, 50);
            let hit: any = null;
            let flying: any = null;

            if (isMediaListQuery(q)) {
              const normVars = normalizeVariables(q.variables);
              let { type = 'ANIME', userId, userName } = normVars;

              if (!userName && userId) {
                userName = idToUserMap.get(userId);
              }
              if (!userId && userName) {
                userId = userMap.get(userName.toLowerCase());
              }

              const possibleKeys = [key, ...getMediaListKeys(type || 'ANIME', userId, userName)];
              for (const k of possibleKeys) {
                if (!hit) {
                  const h = rpcCache.get(k);
                  if (h && h.time >= freshFloor && Date.now() - h.time < 5 * 60_000) {
                    hit = h;
                  }
                }
                if (!flying) {
                  const f = rpcInflight.get(k);
                  if (f) flying = f;
                }
              }
            } else {
              const h = rpcCache.get(key);
              if (h && h.time >= freshFloor && Date.now() - h.time < 15_000) {
                hit = h;
              }
              flying = rpcInflight.get(key);
            }

            if (hit) {
              stats.cacheHits++;
              logDebug('[FASTLOAD RPC] HIT', label, `${Math.round((Date.now() - hit.time) / 1000)}s old`);
              const worker = this;
              const reply = { ...clone(hit.msg), id: data.id };
              const MessageEventCtor = win.MessageEvent || MessageEvent;
              setTimeout(() => worker.dispatchEvent(new MessageEventCtor('message', { data: reply })), 0);
              return;
            }

            if (flying) {
              stats.deduped++;
              logDebug('[FASTLOAD RPC] Attached to in-flight prefetch:', label);
              const worker = this;
              const replyId = data.id;
              flying.promise.then(
                (msg: any) => {
                  logDebug('[FASTLOAD RPC] In-flight prefetch delivered to page:', label);
                  const reply = { ...clone(msg), id: replyId };
                  const MessageEventCtor = win.MessageEvent || MessageEvent;
                  setTimeout(() => worker.dispatchEvent(new MessageEventCtor('message', { data: reply })), 0);
                },
                () => {
                  origPost.apply(worker, [data, ...rest] as any);
                }
              );
              return;
            }

            logDebug('[FASTLOAD RPC] MISS', label, JSON.stringify(q.variables).slice(0, 80));
            let pMap = workerPending.get(this);
            if (!pMap) {
              pMap = new Map();
              workerPending.set(this, pMap);
            }
            pMap.set(id, { key, mutation: false, epoch: rpcEpoch });
          }
        }
      } catch {
        /* fall through to the real worker */
      }
      return origPost.apply(this, [data, ...rest] as any);
    };
  });
}