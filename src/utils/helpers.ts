import { GM_getValue, GM_setValue, GM_deleteValue, GM_xmlhttpRequest, unsafeWindow } from 'vite-plugin-monkey/dist/client';

export const HOST = location.hostname;

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export const clean = (s: unknown): string => String(s || '').replace(/\s+/g, ' ').trim();

export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const safe = <T>(fn: () => T, label?: string): T | undefined => {
  try {
    return fn();
  } catch (e) {
    console.error('[AL-Additions]', label || '', e);
  }
};

export const tryOr = async <T, F = null>(fn: () => Promise<T>, fallback: F = null as unknown as F): Promise<T | F> => {
  try {
    return await fn();
  } catch (_) {
    return fallback;
  }
};

export interface AuthError extends Error {
  auth?: string;
}

export function authError(service: string, message: string): AuthError {
  const e: AuthError = new Error(message);
  e.auth = service;
  return e;
}

export function debounce<T extends (...args: any[]) => void>(fn: T, ms = 0): (...args: Parameters<T>) => void {
  let t: ReturnType<typeof setTimeout> | 0 = 0;
  return (...a: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

const MEMO_MAX_ENTRIES = 1000;

interface MemoOptions {
  keepNull?: boolean;
  ttl?: number;
}

export function memo<TArgs extends any[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  { keepNull = true, ttl = 0 }: MemoOptions = {}
): (key: string | number, ...args: TArgs) => Promise<TReturn> {
  const m = new Map<string, { at: number; p: Promise<TReturn> }>();
  return (key: string | number, ...args: TArgs): Promise<TReturn> => {
    const k = String(key);
    const hit = m.get(k);
    if (hit && (!ttl || Date.now() - hit.at < ttl)) return hit.p;
    const entry = { at: Date.now(), p: Promise.resolve() as unknown as Promise<TReturn> };
    entry.p = Promise.resolve()
      .then(() => fn(...args))
      .then(
        (v) => {
          if (v == null && !keepNull && m.get(k) === entry) m.delete(k);
          return v;
        },
        (e) => {
          if (m.get(k) === entry) m.delete(k);
          throw e;
        }
      );
    if (m.size >= MEMO_MAX_ENTRIES) {
      const now = Date.now();
      for (const [key, v] of m) if (ttl && now - v.at >= ttl) m.delete(key);
      while (m.size >= MEMO_MAX_ENTRIES) m.delete(m.keys().next().value as string);
    }
    m.set(k, entry);
    return entry.p;
  };
}

export function openTab(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const store = {
  get: <T>(k: string, d?: T): T => GM_getValue(k, d as any),
  set: <T>(k: string, v: T): void => GM_setValue(k, v),
  del: (k: string): void => GM_deleteValue(k)
};

export type DebugModule = 'fastLoad' | 'sync' | 'compareView' | 'mediaInfo' | 'tierLabels' | 'general';

const MODULE_SETTING_MAP: Record<string, string> = {
  fastLoad: 'ala_setting_debugFastLoad',
  sync: 'ala_setting_debugSync',
  compareView: 'ala_setting_debugCompareView',
  mediaInfo: 'ala_setting_debugMediaInfo',
  tierLabels: 'ala_setting_debugTierLabels',
  general: 'ala_setting_debugGeneral'
};

export function isDebug(module?: DebugModule | string): boolean {
  try {
    const win = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window) as any;
    if (win.__ALA_DEBUG__ || win.__ALFL_DEBUG__) return true;

    const devMode = store.get('ala_setting_devModeEnabled', false);
    if (!devMode) return false;

    if (!module) return true;

    const settingKey = MODULE_SETTING_MAP[module];
    if (settingKey) {
      const def = module === 'fastLoad';
      return store.get(settingKey, def);
    }

    return true;
  } catch {
    return false;
  }
}

export function logDebug(moduleOrTag: string, ...args: any[]): void {
  let mod: string | undefined;
  if (/^\[(?:FASTLOAD|ALFL)/i.test(moduleOrTag)) mod = 'fastLoad';
  else if (/^\[SYNC/i.test(moduleOrTag)) mod = 'sync';
  else if (/^\[COMPARE/i.test(moduleOrTag)) mod = 'compareView';
  else if (/^\[MEDIAINFO/i.test(moduleOrTag)) mod = 'mediaInfo';
  else if (/^\[TIER/i.test(moduleOrTag)) mod = 'tierLabels';
  else if (/^\[CORE|OBSERVER/i.test(moduleOrTag)) mod = 'general';

  if (!isDebug(mod)) return;
  console.debug(moduleOrTag, ...args);
}

export function jsonGet<T>(key: string, fallback: T): T {
  try {
    const v = store.get<string | null>(key, null);
    if (v == null) return fallback;
    return typeof v === 'string' ? JSON.parse(v) : (v as T);
  } catch (_) {
    return fallback;
  }
}

export const jsonSet = <T>(key: string, value: T): void => store.set(key, JSON.stringify(value));

export function persistent<T extends Record<string, any>>(key: string, prune?: (data: T) => void) {
  let data = jsonGet<T>(key, {} as T);
  if (!data || typeof data !== 'object' || Array.isArray(data)) data = {} as T;
  if (prune) safe(() => prune(data), 'cache prune');
  const save = debounce(() => safe(() => jsonSet(key, data)), 500);
  return { data, save };
}

export const gm = {
  request(url: string, o: Record<string, any> = {}): Promise<any> {
    return new Promise((resolve, reject) =>
      GM_xmlhttpRequest({
        method: 'GET',
        timeout: 15000,
        ...o,
        url,
        onload: resolve,
        onerror: () => reject(new Error('Network error')),
        ontimeout: () => reject(new Error('Timeout')),
        onabort: () => reject(new Error('Request aborted'))
      })
    );
  },
  async text(url: string, o: Record<string, any> = {}): Promise<string> {
    const r = await gm.request(url, o);
    if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
    return r.responseText || '';
  },
  async json<T = any>(url: string, o: Record<string, any> = {}): Promise<T> {
    return JSON.parse(await gm.text(url, o));
  }
};

export function randomString(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}