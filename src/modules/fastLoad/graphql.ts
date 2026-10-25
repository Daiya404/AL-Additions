import {
  win,
  store,
  inflight,
  bytes,
  epoch,
  freshFloor,
  setBytes,
  setPausedUntil,
  clearGlobalCache,
  getViewerFromWindow
} from './state';
import { CFG, stats, attempt } from './config';
import {
  isMediaListQuery,
  isTaxonomyQuery,
  isViewerQuery,
  isMutation,
  isVolatile,
  noStore,
  normalizeVariables,
  normalizeGqlQuery,
  stableStringify,
  parseBody
} from './helpers';
import { extractUsersFromRpcResult } from './worker';
import { rememberQuery } from './routes';
import { logDebug, store as gmStore } from '../../utils/helpers';

export const isGraphQL = (u: any): boolean => {
  try {
    const url = new URL(u, win.location.href);
    return (
      url.origin === 'https://graphql.anilist.co' ||
      (url.origin === win.location.origin && url.pathname.replace(/\/$/, '') === '/graphql')
    );
  } catch {
    return false;
  }
};

const SKIP_HEADERS = /^(?:content-encoding|content-length|transfer-encoding)$/i;
const RATE_HEADERS = /^(?:retry-after|x-ratelimit-.+)$/i;

function toResponse(snap: any, live?: Response) {
  const HeadersCtor = win.Headers || Headers;
  const ResponseCtor = win.Response || Response;
  const headers = new HeadersCtor(snap.headers);
  if (live) {
    for (const [k, v] of (live.headers as any).entries()) {
      if (RATE_HEADERS.test(k)) headers.set(k, v);
    }
  }
  return new ResponseCtor(snap.buf, { status: snap.status || 200, statusText: snap.statusText || 'OK', headers });
}

function abortable(promise: Promise<any>, signal?: AbortSignal | null) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const fail = () =>
      reject((signal as any).reason ?? new DOMException('The operation was aborted.', 'AbortError'));
    if (signal.aborted) return fail();
    signal.addEventListener('abort', fail, { once: true });
    const done = () => signal.removeEventListener('abort', fail);
    promise.then(
      (v) => {
        done();
        resolve(v);
      },
      (e) => {
        done();
        reject(e);
      }
    );
  });
}

function evict() {
  const now = Date.now();
  let currentBytes = bytes;
  for (const [key, entry] of store) {
    if (now - entry.time <= CFG.gqlStaleTtl && currentBytes <= CFG.gqlMaxBytes) break;
    currentBytes -= entry.size;
    store.delete(key);
  }
  setBytes(currentBytes);
}

function put(key: string, snap: any) {
  const old = store.get(key);
  let currentBytes = bytes;
  if (old) {
    currentBytes -= old.size;
    store.delete(key);
  }
  const size = snap.buf.byteLength;
  if (size > CFG.gqlMaxEntryBytes) return;
  store.set(key, { time: Date.now(), size, snap });
  currentBytes += size;
  setBytes(currentBytes);
  evict();
}

const decoder = new TextDecoder();
const ERROR_SCAN_BYTES = 2048;
function hasGraphQLErrors(buf: ArrayBuffer) {
  try {
    const view = new Uint8Array(buf);
    const head = decoder.decode(view.subarray(0, ERROR_SCAN_BYTES));
    return /^\s*\{\s*"errors"\s*:/.test(head);
  } catch {
    return false;
  }
}

export function makeKey(d: any, parsed: any): string {
  if (isMediaListQuery(parsed)) {
    const { type = 'ANIME', userId, userName, ...rest } = normalizeVariables(parsed?.variables);
    const who = userId || (userName ? String(userName).toLowerCase() : getViewerFromWindow().id || 'me');
    return `gql:MediaListCollection:${String(type).toUpperCase()}:${who}:${stableStringify(rest)}`;
  }
  if (isTaxonomyQuery(parsed)) {
    return 'gql:Taxonomy';
  }
  if (isViewerQuery(parsed)) {
    return 'gql:Viewer';
  }
  const normQuery = normalizeGqlQuery(parsed?.query || '');
  const normVars = stableStringify(normalizeVariables(parsed?.variables));
  const auth = d.headers?.get?.('authorization') ? 'a' : '';
  return `${d.url}\u0001${auth}\u0001${normQuery}\u0001${normVars}`;
}

const TAXONOMY_STORAGE_KEY = 'alfl:taxonomy:v1';
const TAXONOMY_TTL = 24 * 3600 * 1000;

function getQueryTtl(parsed: any): number {
  if (isTaxonomyQuery(parsed)) return TAXONOMY_TTL;
  if (isMediaListQuery(parsed)) return 5 * 60_000;
  if (isViewerQuery(parsed)) return 5 * 60_000;
  return CFG.gqlTtl;
}

function loadStoredTaxonomy(): {
  time: number;
  text: string;
  status: number;
  statusText: string;
  headers: [string, string][];
} | null {
  try {
    const raw = win.localStorage?.getItem(TAXONOMY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.time === 'number' && typeof parsed.text === 'string') return parsed;
  } catch {}
  return null;
}

function persistStoredTaxonomy(snap: any) {
  attempt(() => {
    const text = decoder.decode(snap.buf);
    win.localStorage?.setItem(
      TAXONOMY_STORAGE_KEY,
      JSON.stringify({
        time: Date.now(),
        text,
        status: snap.status,
        statusText: snap.statusText,
        headers: snap.headers
      })
    );
  });
}

const note429 = (res: Response) => {
  if (res.status === 429) setPausedUntil(Date.now() + 60_000);
};

export async function classify(input: any, init?: RequestInit) {
  const RequestCtor = win.Request || Request;
  const isRequest = input instanceof RequestCtor;
  const method = String(init?.method || (isRequest ? input.method : 'GET')).toUpperCase();
  if (method !== 'POST') return null;

  const rawUrl = isRequest ? input.url : input instanceof URL ? input.href : String(input);
  if (!isGraphQL(rawUrl)) return null;

  let resolvedUrl = rawUrl;
  try {
    resolvedUrl = new URL(rawUrl, win.location.href).href;
  } catch {}

  let body: string | null = null;
  if (typeof init?.body === 'string') {
    body = init.body;
  } else if (isRequest) {
    try {
      body = await input.clone().text();
    } catch {}
  }
  if (typeof body !== 'string') return null;

  const parsed = parseBody(body);
  if (!parsed) return null;

  const HeadersCtor = win.Headers || Headers;
  const desc = {
    url: resolvedUrl,
    method,
    body,
    headers: new HeadersCtor(init?.headers ?? (isRequest ? input.headers : undefined)),
    credentials: init?.credentials ?? (isRequest ? input.credentials : undefined) ?? 'same-origin',
    mode: init?.mode ?? (isRequest ? input.mode : undefined) ?? 'cors',
    cache: init?.cache ?? (isRequest ? input.cache : undefined)
  };

  const authHeader = desc.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      gmStore.set('al_token_auth', authHeader);
    }
  }
  const mediaList = isMediaListQuery(parsed);
  const bypass = noStore(desc) || (!mediaList && isVolatile(parsed));
  return { desc, parsed, mutation: isMutation(parsed), bypass };
}

export function cachedFetch(nativeFetch: any, job: any, input: any, init?: RequestInit, replay = false) {
  const { desc, parsed } = job;
  if (init?.signal?.aborted) return nativeFetch(input, init);
  if (!replay) attempt(() => rememberQuery(desc, parsed));

  const blocker = (win as any).__ALFL_RPC_BLOCK__;
  if (typeof blocker === 'function' && blocker(parsed?.query, parsed?.variables)) {
    logDebug('[FASTLOAD] Blocked GQL fetch via __ALFL_RPC_BLOCK__:', JSON.stringify(parsed?.variables));
    const dummy = {
      data: {
        Page: {
          pageInfo: { total: 0, perPage: 30, currentPage: parsed?.variables?.page || 1, lastPage: 1, hasNextPage: false },
          mediaList: []
        }
      }
    };
    const ResponseCtor = win.Response || Response;
    return Promise.resolve(
      new ResponseCtor(JSON.stringify(dummy), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
  }

  let key = '';
  let ttl = CFG.gqlTtl;
  try {
    key = makeKey(desc, parsed);
    ttl = getQueryTtl(parsed);
  } catch {
    return nativeFetch(input, init);
  }
  const now = Date.now();

  const cached = store.get(key);

  if (isTaxonomyQuery(parsed)) {
    const storedTax = loadStoredTaxonomy();
    if (storedTax && now - storedTax.time < TAXONOMY_TTL) {
      stats.cacheHits++;
      logDebug('[FASTLOAD] Cache HIT (24h localStorage): GenreCollection & MediaTagCollection');
      const HeadersCtor = win.Headers || Headers;
      const ResponseCtor = win.Response || Response;
      return Promise.resolve(
        new ResponseCtor(storedTax.text, {
          status: storedTax.status || 200,
          statusText: storedTax.statusText || 'OK',
          headers: new HeadersCtor(storedTax.headers)
        })
      );
    }
  }

  if (cached && cached.time >= freshFloor && now - cached.time < ttl) {
    stats.cacheHits++;
    logDebug(
      '[FASTLOAD] Cache HIT (RAM):',
      isMediaListQuery(parsed) ? 'MediaListCollection' : 'GraphQL query',
      `${Math.round((now - cached.time) / 1000)}s old`
    );
    return Promise.resolve(toResponse(cached.snap));
  }

  const flying = inflight.get(key);
  if (flying) {
    stats.deduped++;
    logDebug(
      '[FASTLOAD] Attached to in-flight request:',
      isMediaListQuery(parsed) ? 'MediaListCollection' : 'GraphQL query'
    );
    return abortable(
      flying.then(
        (snap) => toResponse(snap),
        () => nativeFetch(input, init)
      ),
      init?.signal
    );
  }

  const myEpoch = epoch;
  const stale = cached && now - cached.time < CFG.gqlStaleTtl ? cached.snap : null;
  const opName = parsed.operationName || (isMediaListQuery(parsed) ? 'MediaListCollection' : 'query');
  logDebug('[FASTLOAD] Cache MISS (network fetch):', opName, 'key:', key);
  const original = nativeFetch(input, init);

  const snapshot = original.then(async (res: Response) => {
    note429(res);
    if (res.status !== 200) {
      logDebug('[FASTLOAD] Response not 200:', res.status, opName);
      throw new Error('not cacheable');
    }
    const copy = res.clone();
    const buf = await copy.arrayBuffer();
    if (hasGraphQLErrors(buf)) {
      logDebug('[FASTLOAD] Response had GraphQL errors:', opName);
      throw new Error('graphql errors');
    }
    return {
      buf,
      status: res.status,
      statusText: res.statusText,
      headers: [...(res.headers as any).entries()].filter(
        ([k]: [string]) => !SKIP_HEADERS.test(k) && !RATE_HEADERS.test(k)
      )
    };
  });

  inflight.set(key, snapshot);
  snapshot.then(
    (snap: any) => {
      if (inflight.get(key) === snapshot) inflight.delete(key);
      if (epoch === myEpoch) {
        put(key, snap);
        logDebug('[FASTLOAD] Cached in RAM:', opName, `${Math.round(snap.buf.byteLength / 1024)} KB`);
      }
      attempt(() => {
        if (isViewerQuery(parsed)) {
          extractUsersFromRpcResult(JSON.parse(decoder.decode(snap.buf))?.data);
        }
      });
      if (isTaxonomyQuery(parsed) && snap.status === 200) {
        persistStoredTaxonomy(snap);
      }
    },
    () => {
      if (inflight.get(key) === snapshot) inflight.delete(key);
    }
  );

  if (!stale) return original;

  return original.then(
    (res: Response) => {
      if (res.status === 429 || res.status >= 500) {
        stats.staleServed++;
        return toResponse(stale, res);
      }
      return res;
    },
    (err: any) => {
      if (init?.signal?.aborted || err?.name === 'AbortError') throw err;
      stats.staleServed++;
      return toResponse(stale);
    }
  );
}

export function installGraphQLLayer(yielded: () => boolean) {
  const nativeFetch = win.fetch.bind(win);

  win.fetch = async function fetch(input: any, init?: RequestInit) {
    if (yielded()) return nativeFetch(input, init);
    let job = null;
    try {
      job = await classify(input, init);
    } catch {
      /* fall back to native */
    }
    if (!job) return nativeFetch(input, init);
    stats.graphqlRequests++;

    if (job.mutation) {
      clearGlobalCache();
      const p = nativeFetch(input, init);
      p.then(
        (res: Response) => {
          note429(res);
          clearGlobalCache();
        },
        () => clearGlobalCache()
      );
      return p;
    }
    if (job.bypass) {
      const p = nativeFetch(input, init);
      p.then(note429, () => {});
      return p;
    }
    return cachedFetch(nativeFetch, job, input, init, (init as any)?.__alfl === 'replay');
  };
}