import { RateLimiter } from '../utils/limiter';
import { store, gm, sleep, memo, openTab, authError, safe, randomString, logDebug } from '../utils/helpers';
import { strictTitle } from '../utils/matching';
import { Core } from '../core/observer';
import { AniList } from './anilist';

export const AL_AUTH_URL = 'https://anilist.co/api/v2/oauth/authorize';
export const AL_CLIENT_ID = '50247';
export const MAL_AUTH_URL = 'https://myanimelist.net/v1/oauth2/authorize';
export const MAL_TOKEN_URL = 'https://myanimelist.net/v1/oauth2/token';
export const MAL_API = 'https://api.myanimelist.net/v2';
export const MAL_REDIRECT = 'https://myanimelist.net/';
export const MAL_CLIENT_ID = 'f8197fe8cb24188073de4c0227307edf';
export const MAL_CLIENT_SECRET = '';
export const hooks: { checkCancel?: () => void } = {};

export let logLines: string[] = [];
export let lastNotice = '';

export function log(msg: any, level: 'info' | 'warn' | 'error' | 'success' = 'info'): void {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const marker = level === 'error' ? 'ERROR' : level === 'warn' ? 'WARN ' : level === 'success' ? 'OK   ' : 'INFO ';
  logLines.unshift(`${time}  ${marker} ${String(msg)}`);
  logLines = logLines.slice(0, 60);
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
  console[method]('[AL→MAL Sync]', msg);
  lastNotice = String(msg);
  const box = document.getElementById('almal-log');
  const hint = document.getElementById('almal-hint');
  if (box) box.textContent = logLines.join('\n');
  if (hint) hint.textContent = lastNotice;
}

export function toast(msg: string, isError?: boolean, closeTab?: boolean): void {
  log(msg);
  Core.ready(() => {
    let t = document.getElementById('almal-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'almal-toast';
      t.style.cssText =
        'position:fixed;top:16px;left:50%;transform:translateX(-50%);padding:10px 18px;border-radius:3px;color:#fff;font-size:1.2rem;z-index:999999;box-shadow:0 4px 16px rgba(0,0,0,.45)';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = isError ? '#b23b3b' : '#2f8f5b';
    t.style.display = 'block';
    clearTimeout((t as any)._hide);
    (t as any)._hide = setTimeout(() => {
      if (t) t.style.display = 'none';
    }, 6000);
    if (closeTab) setTimeout(() => safe(() => window.close()), 1800);
  });
}

export const clearMalAuth = (): void => {
  ['mal_token', 'mal_refresh_token', 'mal_expires_at'].forEach((k) => store.del(k));
};

export const clearAniListAuth = (): void => {
  store.del('al_token');
  AniList.clearViewer();
};

export async function malTokenRequest(params: Record<string, string>): Promise<string> {
  const body = new URLSearchParams({ client_id: MAL_CLIENT_ID, ...params });
  if (MAL_CLIENT_SECRET) body.set('client_secret', MAL_CLIENT_SECRET);
  const res = await gm.request(MAL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: body.toString()
  });
  let json: any = {};
  try {
    json = JSON.parse(res.responseText);
  } catch (_) {}
  if (!json.access_token) {
    if (params.grant_type === 'refresh_token' && [400, 401, 403].includes(res.status)) {
      clearMalAuth();
      throw authError('MAL', 'MAL session expired — reconnect MAL.');
    }
    throw new Error(json.hint || json.message || json.error || res.responseText || `HTTP ${res.status}`);
  }
  store.set('mal_token', json.access_token);
  if (json.refresh_token) store.set('mal_refresh_token', json.refresh_token);
  store.set('mal_expires_at', Date.now() + (Number(json.expires_in) || 3600) * 1000);
  return json.access_token;
}

export async function exchangeMalCode(code: string): Promise<string> {
  const token = await malTokenRequest({
    code,
    code_verifier: store.get('mal_code_verifier', ''),
    grant_type: 'authorization_code',
    redirect_uri: MAL_REDIRECT
  });
  store.del('mal_code_verifier');
  return token;
}

let malRefresh: Promise<string> | null = null;

export async function malEnsureToken(): Promise<string> {
  if (Date.now() < store.get('mal_expires_at', 0) - 60000) return store.get('mal_token');
  if (!malRefresh) {
    malRefresh = (async () => {
      const refresh = store.get<string | null>('mal_refresh_token', null);
      if (!refresh) throw authError('MAL', 'No MAL refresh token stored — reconnect MAL.');
      return malTokenRequest({ grant_type: 'refresh_token', refresh_token: refresh });
    })().finally(() => {
      malRefresh = null;
    });
  }
  return malRefresh;
}

export function alConnect(): void {
  openTab(`${AL_AUTH_URL}?client_id=${encodeURIComponent(AL_CLIENT_ID)}&response_type=token`);
  log('Opened AniList authorization in a new tab. Finish connecting there, then return to your list.');
}

export function malConnect(): void {
  const verifier = randomString(96);
  store.set('mal_code_verifier', verifier);
  openTab(
    `${MAL_AUTH_URL}?response_type=code&client_id=${encodeURIComponent(MAL_CLIENT_ID)}&code_challenge=${encodeURIComponent(
      verifier
    )}&code_challenge_method=plain&redirect_uri=${encodeURIComponent(MAL_REDIRECT)}`
  );
  log('Opened MAL authorization in a new tab. Finish connecting there, then return to your list.');
}

export function saveAniListToken(token: string): void {
  store.set('al_token', token);
  AniList.clearViewer();
}

export function captureCredentials(): void {
  const HOST = location.hostname;
  if (HOST === 'anilist.co' && location.hash) {
    const params = new URLSearchParams(location.hash.substring(1));
    const token = params.get('access_token');
    const err = params.get('error');
    if (token || err) {
      history.replaceState(null, '', location.pathname + location.search);
      if (token) {
        saveAniListToken(token);
        toast('AniList connected! You can close this tab.', false, true);
      } else {
        toast(`AniList auth failed: ${err}. Check the app's redirect URL matches https://anilist.co/ exactly.`, true);
      }
    }
  }
  if (HOST === 'myanimelist.net') {
    const code = new URLSearchParams(location.search).get('code');
    if (!code || !store.get('mal_code_verifier')) return;
    exchangeMalCode(code)
      .then(() => {
        const url = new URL(location.href);
        url.searchParams.delete('code');
        url.searchParams.delete('state');
        history.replaceState(null, '', url.pathname + url.search);
        toast('MAL connected! You can close this tab.', false, true);
      })
      .catch((e) => toast('MAL connection failed: ' + e.message, true));
  }
}

export const malLimiter = new RateLimiter({
  rate: 60,
  min: 12,
  max: 180,
  burst: 4,
  adaptive: true,
  jitter: true,
  persistKey: 'ala_mal_api_resume_at'
});

const BREAKER_THRESHOLD = 8;
const BREAKER_COOLDOWN_MS = 90e3;

export const breaker = (() => {
  let fails = 0;
  let until = 0;
  let trips = 0;
  return {
    ok() {
      fails = 0;
    },
    fail() {
      if (++fails >= BREAKER_THRESHOLD && Date.now() >= until) {
        fails = 0;
        trips++;
        until = Date.now() + BREAKER_COOLDOWN_MS;
        log(`⚠ ${BREAKER_THRESHOLD} consecutive MAL failures — pausing writes for ${BREAKER_COOLDOWN_MS / 1000}s.`);
      }
    },
    async wait(checkCancel?: () => void) {
      while (Date.now() < until) {
        checkCancel?.();
        await sleep(Math.min(1000, until - Date.now()));
      }
    },
    get trips() {
      return trips;
    },
    reset() {
      fails = 0;
      until = 0;
      trips = 0;
    }
  };
})();

export class MalError extends Error {
  status: number;
  html: boolean;
  constructor(what: string, res: any) {
    super(`${what} ${res.status}: ${String(res.responseText || 'request failed').slice(0, 200)}`);
    this.status = res.status;
    this.html = /^\s*</.test(res.responseText || '');
  }
}

export function parseRetryAfterMs(headers: string, fallback: number): number {
  const m = String(headers || '').match(/retry-after:\s*(\S+)/i);
  if (!m) return fallback;
  const secs = Number(m[1]);
  if (Number.isFinite(secs)) return Math.max(1000, Math.min(secs * 1000, 120000));
  const date = Date.parse(m[1]);
  return Number.isFinite(date) ? Math.max(1000, Math.min(date - Date.now(), 120000)) : fallback;
}

export const looksLimited = (res: any): boolean =>
  res.status === 429 || (res.status === 403 && /^\s*</.test(res.responseText || ''));

const backoff = (attempt: number) => Math.min(30000, 1000 * 2 ** attempt) * (0.8 + Math.random() * 0.4);

export async function malRequest(
  { method = 'GET', url, data, headers = {}, timeout = 30000 }: { method?: string; url: string; data?: any; headers?: any; timeout?: number },
  checkCancel?: () => void
): Promise<any> {
  await malLimiter.acquire(checkCancel ?? hooks.checkCancel);
  const token = await malEnsureToken();
  logDebug('[SYNC]', `MAL ${method} ${url}`, data ? { data } : '');
  const res = await gm.request(url, { method, data, timeout, headers: { Authorization: `Bearer ${token}`, ...headers } });
  logDebug('[SYNC]', `MAL ${method} response: ${res.status} for ${url}`);
  if (looksLimited(res)) malLimiter.limit(parseRetryAfterMs(res.responseHeaders, res.status === 429 ? 5000 : 60000));
  else if (res.status >= 500) malLimiter.limit(2000);
  else if (res.status >= 200 && res.status < 300) malLimiter.success();
  return res;
}

export async function malCall(opts: any, retries = 4, checkCancel?: () => void): Promise<any> {
  const check = checkCancel ?? hooks.checkCancel;
  let refreshed = false;
  for (let attempt = 0; ; attempt++) {
    check?.();
    let res: any;
    try {
      res = await malRequest(opts, check);
    } catch (e: any) {
      if (e.auth || e.cancelled || attempt >= retries) throw e;
      await sleep(backoff(attempt));
      continue;
    }
    if (res.status === 401) {
      if (refreshed) {
        clearMalAuth();
        throw authError('MAL', 'MAL rejected the access token — reconnect MAL.');
      }
      refreshed = true;
      store.set('mal_expires_at', 0);
      continue;
    }
    if (!looksLimited(res) && res.status < 500) return res;
    if (attempt >= retries) return res;
  }
}

export const parseJson = (res: any, what: string): any => {
  try {
    return JSON.parse(res.responseText || '{}');
  } catch (_) {
    throw new Error(`MAL returned invalid JSON for ${what}.`);
  }
};

export async function malUpdateEntry(type: 'ANIME' | 'MANGA', malId: number, patch: Record<string, any>): Promise<any> {
  const res = await malCall({
    method: 'PUT',
    url: `${MAL_API}/${type === 'ANIME' ? 'anime' : 'manga'}/${malId}/my_list_status`,
    data: new URLSearchParams(patch).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  if (res.status < 200 || res.status >= 300) throw new MalError('MAL', res);
  return res;
}

export async function malDeleteEntry(type: 'ANIME' | 'MANGA', malId: number): Promise<any> {
  const res = await malCall({
    method: 'DELETE',
    url: `${MAL_API}/${type === 'ANIME' ? 'anime' : 'manga'}/${malId}/my_list_status`
  });
  if (res.status === 404) return res;
  if (res.status < 200 || res.status >= 300) throw new MalError('MAL delete', res);
  return res;
}

export async function malWhoAmI(): Promise<any> {
  const res = await malCall({ url: `${MAL_API}/users/@me` });
  if (res.status < 200 || res.status >= 300) throw new MalError('MAL profile', res);
  return parseJson(res, 'the profile');
}

export async function malFetchList(type: 'ANIME' | 'MANGA'): Promise<Record<number, any>> {
  const MAL_LIST_PAGE_SIZE = 1000;
  const MAL_LIST_MAX = 100000;
  const anime = type === 'ANIME';
  const fields = anime
    ? 'num_episodes,list_status{status,score,num_episodes_watched,is_rewatching,num_times_rewatched,start_date,finish_date,comments}'
    : 'num_chapters,num_volumes,list_status{status,score,num_chapters_read,num_volumes_read,is_rereading,num_times_reread,start_date,finish_date,comments}';
  const entries: Record<number, any> = {};
  let total = 0;

  for (let offset = 0; offset <= MAL_LIST_MAX; ) {
    const res = await malCall(
      {
        url: `${MAL_API}/users/@me/${anime ? 'animelist' : 'mangalist'}?fields=${encodeURIComponent(
          fields
        )}&limit=${MAL_LIST_PAGE_SIZE}&offset=${offset}&nsfw=true`,
        timeout: 60000
      },
      6
    );
    if (res.status < 200 || res.status >= 300) throw new MalError('MAL list', res);
    const json = parseJson(res, 'the list');
    const nodes = Array.isArray(json.data) ? json.data : [];
    for (const row of nodes) {
      const id = Number(row?.node?.id);
      if (!(id > 0) || !row.list_status) continue;
      const node = row.node;
      if (!entries[id]) total++;
      entries[id] = {
        ...row.list_status,
        __malTitle: node.title || '',
        __total: Number(anime ? node.num_episodes : node.num_chapters) || 0,
        __totalVolumes: anime ? 0 : Number(node.num_volumes) || 0
      };
    }
    if (total > MAL_LIST_MAX) throw new Error(`MAL list exceeded the ${MAL_LIST_MAX.toLocaleString()}-entry safety limit.`);
    if (!nodes.length || !json.paging?.next) break;
    offset += nodes.length;
  }
  return entries;
}

export const searchCandidates = memo(async (type: 'ANIME' | 'MANGA', q: string) => {
  const params = new URLSearchParams({
    q: q.slice(0, 64),
    limit: '10',
    nsfw: 'true',
    fields: 'alternative_titles,start_date'
  });
  const res = await malCall({ url: `${MAL_API}/${type === 'ANIME' ? 'anime' : 'manga'}?${params}` }, 2);
  if (res.status === 400) return [];
  if (res.status < 200 || res.status >= 300) throw new MalError('MAL search', res);
  const json = parseJson(res, 'a search');
  return (Array.isArray(json.data) ? json.data : []).map((r: any) => {
    const n = r?.node || {};
    const alt = n.alternative_titles || {};
    return {
      id: Number(n.id) || 0,
      titles: [n.title, alt.en, alt.ja, ...(alt.synonyms || [])].map(strictTitle).filter(Boolean),
      year: Number(String(n.start_date || '').slice(0, 4)) || 0
    };
  });
});

export async function searchMalId(type: 'ANIME' | 'MANGA', entry: any): Promise<number> {
  for (const q of (entry.queryTitles as string[]).filter((s) => s.length >= 3).slice(0, 2)) {
    const cands = await searchCandidates(`${type}:${q}`, type, q);
    const ok = cands.filter(
      (c: any) =>
        c.id &&
        c.titles.some((t: string) => entry.titles.includes(t)) &&
        (!c.year || !entry.startYear || Math.abs(c.year - entry.startYear) <= 1)
    );
    if (ok.length === 1) return ok[0].id;
    if (ok.length > 1) {
      const exact = ok.filter((c: any) => c.year && c.year === entry.startYear);
      return exact.length === 1 ? exact[0].id : 0;
    }
  }
  return 0;
}