import { unsafeWindow } from 'vite-plugin-monkey/dist/client';
import { store as gmStore } from '../../utils/helpers';
import { stats, attempt } from './config';

export const win = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window) as any;
export const doc: Document = win.document;

export const navListeners: Array<() => void> = [];
export const onNav = (fn: () => void) => navListeners.push(fn);

export const userMap = new Map<string, number>();
export const idToUserMap = new Map<number, string>();

export const store = new Map<string, { time: number; size: number; snap: any }>();
export const inflight = new Map<string, Promise<any>>();
export let bytes = 0;
export let epoch = 0;
export let pausedUntil = 0;
export let freshFloor = 0;

export function setBytes(val: number) { bytes = val; }
export function incEpoch() { epoch++; }
export function setPausedUntil(val: number) { pausedUntil = val; }
export function setFreshFloor(val: number) { freshFloor = val; }

export const rpcCache = new Map<string, { time: number; msg: any }>();
export const rpcInflight = new Map<string, {
  promise: Promise<any>;
  resolve: (val: any) => void;
  reject: (err: any) => void;
}>();
export let rpcEpoch = 0;
export function incRpcEpoch() { rpcEpoch++; }

export const clearAll = () => {
  epoch++;
  store.clear();
  inflight.clear();
  bytes = 0;
};

export const clearRpc = () => {
  rpcEpoch++;
  freshFloor = Date.now();
  rpcCache.clear();
  rpcInflight.clear();
};

export const clearGlobalCache = () => {
  clearAll();
  clearRpc();
};

export function rememberUser(name: string, id: number) {
  if (!name || !id || typeof id !== 'number') return;
  const normName = String(name).trim().toLowerCase();
  if (!normName) return;
  userMap.set(normName, id);
  idToUserMap.set(id, normName);
  attempt(() => {
    const stored = JSON.parse(win.localStorage?.getItem('alfl:userMap') || '{}');
    if (stored[normName] !== id) {
      stored[normName] = id;
      const keys = Object.keys(stored);
      if (keys.length > 300) delete stored[keys[0]];
      win.localStorage?.setItem('alfl:userMap', JSON.stringify(stored));
    }
  });
}

export function initUserMap() {
  attempt(() => {
    const stored = JSON.parse(win.localStorage?.getItem('alfl:userMap') || '{}');
    for (const [k, v] of Object.entries(stored)) {
      if (typeof v === 'number' && v > 0) {
        userMap.set(k.toLowerCase(), v);
        idToUserMap.set(v, k.toLowerCase());
      }
    }
  });
}

export function getViewerFromWindow(): { id: number; name: string } {
  const res = { id: 0, name: '' };
  attempt(() => {
    const nuxt = win.__NUXT__;
    const user = nuxt?.state?.auth?.user || nuxt?.state?.user;
    if (user) {
      if (typeof user.id === 'number' && user.id > 0) res.id = user.id;
      if (typeof user.name === 'string' && user.name) res.name = user.name;
    }
  });
  if (!res.id) {
    const storedId = Number(gmStore.get('al_user_id', 0));
    if (storedId > 0) res.id = storedId;
  }
  if (!res.name) {
    const stored = gmStore.get<string | null>('al_username', null);
    if (stored) res.name = stored;
  }
  if (!res.name && doc) {
    const href = doc
      .querySelector('nav a[href^="/user/"], .nav-wrap a[href^="/user/"], .nav a[href^="/user/"]')
      ?.getAttribute('href');
    const m = href?.match(/^\/user\/([^/?#]+)/);
    if (m) {
      try {
        res.name = decodeURIComponent(m[1]);
      } catch {}
    }
  }
  return res;
}

export function getLocalUsername(): string | null {
  return getViewerFromWindow().name || null;
}

export function registerGlobalBridges() {
  win.__ALFL_STATS__ = stats;
  win.__ALFL_CLEAR__ = clearGlobalCache;
  win.__ALFL_GQL_STORE__ = store;
  win.__ALFL_RPC_CACHE__ = rpcCache;
  win.__ALFL_RPC_INFLIGHT__ = rpcInflight;
  win.__ALFL_USER_MAP__ = userMap;
  win.__ALFL_ID_MAP__ = idToUserMap;
}