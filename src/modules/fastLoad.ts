import { defineFeature } from '../core/registry';
import { unsafeWindow } from 'vite-plugin-monkey/dist/client';
import { store as gmStore, logDebug } from '../utils/helpers';
import { markBuiltIn } from '../utils/standalone';

defineFeature(
  {
    id: 'fastLoad',
    key: 'fastLoadEnabled',
    section: 'AniList Enhancements',
    early: true,
    def: false,
    title: 'AniList Fast Load',
    help: 'Performance optimizer: lazy media, off-screen row skipping, observer coalescing, safe GraphQL cache/de-duplication with stale fallback, navigation prefetch and early request start.'
  },
  () => {
    const win = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window) as any;
    if (win.top !== win.self) return;
    if (win.__ANILIST_FAST_LOAD__ || win.__ANILIST_FAST_LOAD_V4__) {
      console.warn(
        '[AL-Additions] Built-in Fast Load skipped: the standalone AniList Fast Load script is already running. Uninstall it to use the built-in version.'
      );
      return;
    }
    // Own flag on purpose: the standalone script must still be able to start after us, and we step aside
    // (see yielded() below) as soon as it announces itself with one of its flags.
    win.__ALA_FAST_LOAD__ = '0.4.1';
    markBuiltIn('fastLoad');

    let yieldedToStandalone = false;
    const yielded = (): boolean => {
      if (yieldedToStandalone) return true;
      if (win.__ANILIST_FAST_LOAD__ || win.__ANILIST_FAST_LOAD_V4__) {
        yieldedToStandalone = true;
        console.warn(
          '[AL-Additions] Built-in Fast Load paused: the standalone AniList Fast Load script is installed. Uninstall it to use the built-in version.'
        );
      }
      return yieldedToStandalone;
    };

    const CFG = {
      lazyMedia: false,
      rowSkipping: false,
      coalesceObservers: false,
      observerBatchMs: 80,
      fastInnerText: false,
      memoSelectorProbes: false,
      blockTierInData: false,
      tierAssist: false,
      tierAssistMs: 250,

      gqlTtl: 15_000,
      gqlStaleTtl: 5 * 60_000,
      gqlMaxBytes: 64 * 1024 * 1024,
      gqlMaxEntryBytes: 24 * 1024 * 1024,

      prefetch: true,
      earlyStart: false,
      prefetchMaxPerMin: 12,
      prefetchDwellMs: 200,
      learnWindowMs: 8_000,
      learnMaxReqs: 6
    };

    const GQL_ORIGIN = 'https://graphql.anilist.co';
    const MEDIA_ORIGIN = 'https://s4.anilist.co';

    const stats = {
      graphqlRequests: 0,
      cacheHits: 0,
      deduped: 0,
      staleServed: 0,
      prefetched: 0,
      earlyStarts: 0,
      observerBatches: 0,
      observerRecordsMerged: 0,
      probesShared: 0,
      labelsReleased: 0
    };
    win.__ALFL_STATS__ = stats;

    const attempt = <T>(fn: () => T): T | undefined => {
      try {
        return fn();
      } catch {
        /* ignore */
      }
    };

    const idle = (fn: () => void, timeout = 1500) =>
      'requestIdleCallback' in win ? win.requestIdleCallback(fn, { timeout }) : setTimeout(fn, 0);

    const doc: Document = win.document;

    /* ======================================================================
     * 1. Connection warm-up
     * ====================================================================== */
    attempt(() => {
      const parent = doc.head || doc.documentElement;
      for (const [href, cors] of [
        [GQL_ORIGIN, true],
        [MEDIA_ORIGIN, false],
        ['https://fonts.googleapis.com', false],
        ['https://fonts.gstatic.com', true]
      ] as const) {
        if (parent.querySelector(`link[rel="preconnect"][href="${href}"]`)) continue;
        const link = doc.createElement('link');
        link.rel = 'preconnect';
        link.href = href;
        if (cors) link.crossOrigin = '';
        parent.appendChild(link);
      }
    });

    /* ======================================================================
     * 2. Shared: SPA navigation hook
     * ====================================================================== */
    const navListeners: Array<() => void> = [];
    attempt(() => {
      const fire = () => navListeners.forEach(attempt);
      for (const name of ['pushState', 'replaceState'] as const) {
        const orig = win.history[name];
        win.history[name] = function (this: History, ...args: any[]) {
          const r = orig.apply(this, args);
          fire();
          return r;
        };
      }
      win.addEventListener('popstate', fire);
    });

    /* ======================================================================
     * 3. Lazy media
     * ====================================================================== */
    function installLazyMedia() {
      const lazify = (el: any) => {
        if (!el || el.nodeType !== 1) return;
        switch (el.localName) {
          case 'img':
            if (!el.hasAttribute('loading')) el.loading = 'lazy';
            if (!el.hasAttribute('decoding')) el.decoding = 'async';
            break;
          case 'iframe':
            if (!el.hasAttribute('loading')) el.loading = 'lazy';
            break;
          case 'video':
            if (!el.hasAttribute('preload')) el.preload = 'metadata';
            break;
        }
      };

      const patchCreate = (target: any) => {
        if (!target) return;
        const orig = target.createElement;
        if (typeof orig !== 'function') return;
        const patched = function (this: any, tag: string, options?: ElementCreationOptions) {
          const el = orig.call(this, tag, options);
          try {
            lazify(el);
          } catch {
            /* ignore */
          }
          return el;
        };
        try {
          target.createElement = patched;
        } catch {
          try {
            Object.defineProperty(target, 'createElement', { value: patched, writable: true, configurable: true });
          } catch {
            /* ignore */
          }
        }
      };

      patchCreate(win.Document?.prototype);
      patchCreate(win.HTMLDocument?.prototype);
      patchCreate(Document.prototype);
      patchCreate(doc);
      if (typeof document !== 'undefined' && document !== doc) patchCreate(document);

      const MEDIA_TAG = /<(?:img|iframe|video)[\s>/]/i;
      const MEDIA_SEL = 'img:not([loading]),iframe:not([loading]),video:not([preload])';
      const lazifyTree = (root: any) => {
        if (!root || typeof root.querySelectorAll !== 'function') return;
        lazify(root);
        for (const el of root.querySelectorAll(MEDIA_SEL)) lazify(el);
      };

      const ElementProto = win.Element?.prototype || Element.prototype;

      attempt(() => {
        const desc = Object.getOwnPropertyDescriptor(ElementProto, 'innerHTML');
        if (!desc || !desc.set || !desc.configurable) return;
        Object.defineProperty(ElementProto, 'innerHTML', {
          ...desc,
          set(this: Element, value: any) {
            desc.set!.call(this, value);
            if (typeof value === 'string' && MEDIA_TAG.test(value)) {
              attempt(() => lazifyTree(this instanceof win.HTMLTemplateElement ? (this as HTMLTemplateElement).content : this));
            }
          }
        });
      });

      attempt(() => {
        const native = ElementProto.insertAdjacentHTML;
        ElementProto.insertAdjacentHTML = function (this: Element, position: InsertPosition, html: string) {
          const r = native.call(this, position, html);
          if (typeof html === 'string' && MEDIA_TAG.test(html)) {
            const outer = /^(?:beforebegin|afterend)$/i.test(position);
            attempt(() => lazifyTree(outer ? this.parentNode : this));
          }
          return r;
        };
      });
    }

    /* ======================================================================
     * 4. Off-screen row skipping (content-visibility)
     * ====================================================================== */
    const ROW_GROUPS = [
      { selector: '.medialist .entry.row', h: 56 },
      { selector: '.medialist .entry-card', h: 220 },
      { selector: '.activity-entry', h: 160 }
    ];

    function injectCSS(text: string) {
      try {
        if ('adoptedStyleSheets' in doc && typeof win.CSSStyleSheet !== 'undefined') {
          const sheet = new win.CSSStyleSheet();
          sheet.replaceSync(text);
          (doc as any).adoptedStyleSheets = [...(doc as any).adoptedStyleSheets, sheet];
          return;
        }
      } catch {
        /* fall through */
      }
      const style = doc.createElement('style');
      style.textContent = text;
      (doc.head || doc.documentElement).appendChild(style);
    }

    function installRowSkipping() {
      const rules = ROW_GROUPS.map(
        ({ selector, h }, i) => `
            ${selector} {
                content-visibility: auto;
                contain-intrinsic-height: auto var(--alfast-h${i}, ${h}px);
                overflow-clip-margin: 16px;
            }
            ${selector}:hover,
            ${selector}:focus-within {
                content-visibility: visible;
            }`
      ).join('\n');

      injectCSS(`@supports (content-visibility: auto) and (contain-intrinsic-height: auto 1px) { ${rules} }`);

      const measuredFor = ROW_GROUPS.map(() => '');
      let timers: any[] = [];

      function measure() {
        const path = win.location.pathname;
        const vh = win.innerHeight || doc.documentElement.clientHeight;
        ROW_GROUPS.forEach(({ selector }, i) => {
          if (measuredFor[i] === path) return;
          let nodes;
          try {
            nodes = doc.querySelectorAll(selector);
          } catch {
            return;
          }
          let total = 0;
          let count = 0;
          for (const el of nodes as any) {
            const r = el.getBoundingClientRect();
            if (r.top > vh) break;
            if (r.height > 0 && r.bottom > 0) {
              total += r.height;
              if (++count >= 6) break;
            }
          }
          if (!count) return;
          doc.documentElement.style.setProperty(`--alfast-h${i}`, `${Math.max(1, Math.round(total / count))}px`);
          measuredFor[i] = path;
        });
      }

      function schedule() {
        timers.forEach(clearTimeout);
        timers = [500, 1800, 4500].map((ms) =>
          setTimeout(
            () =>
              idle(() => {
                if (!doc.hidden) measure();
              }),
            ms
          )
        );
      }

      navListeners.push(schedule);
      if (doc.readyState !== 'loading') schedule();
      else doc.addEventListener('DOMContentLoaded', schedule, { once: true });
      win.addEventListener('load', schedule, { once: true });

      let resizeTimer: any = 0;
      const onResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          measuredFor.fill('');
          schedule();
        }, 200);
      };
      win.addEventListener('resize', onResize, { passive: true });
      win.addEventListener('orientationchange', onResize, { passive: true });
    }

    /* ======================================================================
     * 5. Observer coalescing
     * ====================================================================== */
    function installObserverCoalescing() {
      const Native = win.MutationObserver;
      if (typeof Native !== 'function') return;

      const states = new WeakMap();

      const ignoresRecords = (fn: any) => {
        if (typeof fn !== 'function' || fn.length !== 0) return false;
        try {
          const src = Function.prototype.toString.call(fn);
          if (/\barguments\b/.test(src)) return false;
          const params = /^[^(]*\(([^)]*)\)/.exec(src);
          return !params || params[1].trim() === '';
        } catch {
          return false;
        }
      };

      const isPageRoot = (t: any) => t === doc || t === doc.documentElement || t === doc.body;

      function schedule(st: any) {
        if (st.timer) return;
        const wait = Math.max(0, st.last + CFG.observerBatchMs - performance.now());
        st.timer = setTimeout(() => {
          st.timer = 0;
          if (!st.queue.length) return;
          const records = st.queue.splice(0);
          stats.observerBatches++;
          stats.observerRecordsMerged += records.length;
          try {
            st.callback.call(st.self, records, st.self);
          } catch (e) {
            setTimeout(() => {
              throw e;
            });
          }
          st.last = performance.now();
        }, wait);
      }

      class CoalescedMutationObserver extends (Native as typeof MutationObserver) {
        constructor(callback: any) {
          const st: any = {
            callback,
            eligible: ignoresRecords(callback),
            on: false,
            queue: [],
            timer: 0,
            last: -Infinity,
            self: null
          };
          super(
            typeof callback === 'function'
              ? (records: MutationRecord[]) => {
                  if (!st.on) return callback.call(st.self, records, st.self);
                  for (const r of records) st.queue.push(r);
                  schedule(st);
                }
              : callback
          );
          st.self = this;
          states.set(this, st);
        }
        override observe(target: Node, options?: MutationObserverInit) {
          const st = states.get(this);
          if (st && st.eligible && options && options.subtree && isPageRoot(target)) st.on = true;
          return super.observe(target, options);
        }
        override disconnect() {
          const st = states.get(this);
          if (st) {
            st.queue.length = 0;
            st.on = false;
          }
          return super.disconnect();
        }
        override takeRecords(): MutationRecord[] {
          const st = states.get(this);
          const pending = super.takeRecords();
          return st ? st.queue.splice(0).concat(pending) : pending;
        }
      }

      try {
        Object.defineProperty(win, 'MutationObserver', {
          value: CoalescedMutationObserver,
          writable: true,
          configurable: true
        });
      } catch {
        win.MutationObserver = CoalescedMutationObserver;
      }
    }

    /* ======================================================================
     * 6. Cheap innerText
     * ====================================================================== */
    function installFastInnerText() {
      const proto = win.HTMLElement?.prototype || HTMLElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'innerText');
      if (!desc || !desc.get || !desc.configurable) return;
      const LEAF = '.score, .value, .type, .percentage';
      Object.defineProperty(proto, 'innerText', {
        ...desc,
        get(this: HTMLElement) {
          try {
            if (this.childElementCount === 0 && this.matches(LEAF)) {
              return (this.textContent || '').replace(/\s+/g, ' ').trim();
            }
          } catch {
            /* fall through */
          }
          return desc.get!.call(this);
        }
      });
    }

    /* ======================================================================
     * 7. Selector probe memo
     * ====================================================================== */
    function installProbeMemo() {
      const ElementProto = win.Element?.prototype || Element.prototype;
      const native = ElementProto.querySelector;
      let memo: WeakMap<any, Map<string, any>> | null = null;
      ElementProto.querySelector = function querySelector(this: Element, sel: string) {
        if (typeof sel === 'string' && sel.charCodeAt(0) === 46 && sel.startsWith('.medialist.table.POINT_')) {
          if (!memo) {
            memo = new WeakMap();
            queueMicrotask(() => {
              memo = null;
            });
          }
          let perEl = memo.get(this);
          if (!perEl) memo.set(this, (perEl = new Map()));
          if (perEl.has(sel)) {
            stats.probesShared++;
            return perEl.get(sel);
          }
          const r = native.call(this, sel);
          perEl.set(sel, r);
          return r;
        }
        return native.call(this, sel);
      };
    }

    /* ======================================================================
     * 8. Tier Labels support
     * ====================================================================== */
    function installTierSupport() {
      const DATA_VALUE = '.data .data-set .value';
      const mark = (node: any) => {
        if (!node || node.nodeType !== 1) return;
        if (node.matches?.(DATA_VALUE)) node.dataset.tierModified = 'true';
        if (node.firstElementChild) {
          for (const el of node.querySelectorAll(DATA_VALUE)) el.dataset.tierModified = 'true';
        }
      };

      const DONE_SCORE = '.medialist .score[data-tier-modified]';
      const releases = new WeakMap();
      let sweepTimer: any = 0;

      const needsBadge = (el: any) => {
        const attr = el.getAttribute('score');
        if (!attr || !(parseFloat(attr) > 0)) return false;
        const badge = el.firstElementChild;
        return !badge || (badge.firstElementChild?.textContent || '').trim() !== attr.trim();
      };

      function sweep() {
        sweepTimer = 0;
        if (doc.hidden) return;
        let released = 0;
        for (const el of doc.querySelectorAll(DONE_SCORE) as any) {
          const n = releases.get(el) || 0;
          if (n >= 2 || !needsBadge(el)) continue;
          releases.set(el, n + 1);
          delete el.dataset.tierModified;
          released++;
        }
        if (!released || !doc.body) return;
        stats.labelsReleased += released;
        const wake = doc.createComment('');
        doc.body.appendChild(wake);
        wake.remove();
      }
      const scheduleSweep = () => {
        if (!sweepTimer) sweepTimer = setTimeout(() => attempt(sweep), CFG.tierAssistMs);
      };

      const MutationObserverCtor = win.MutationObserver || MutationObserver;
      const observer = new MutationObserverCtor((records: MutationRecord[]) => {
        if (CFG.blockTierInData) {
          for (const r of records) {
            for (const n of r.addedNodes) {
              try {
                mark(n);
              } catch {
                /* ignore */
              }
            }
          }
        }
        if (CFG.tierAssist) scheduleSweep();
      });
      observer.observe(
        doc,
        CFG.tierAssist
          ? { childList: true, subtree: true, attributes: true, attributeFilter: ['score'] }
          : { childList: true, subtree: true }
      );
      if (CFG.tierAssist) {
        doc.addEventListener('visibilitychange', () => {
          if (!doc.hidden) scheduleSweep();
        });
      }
      if (CFG.blockTierInData) attempt(() => mark(doc.documentElement));
    }

    /* ======================================================================
     * 9. GraphQL layer: cache, de-duplication, stale-on-error, prefetch
     * ====================================================================== */
    function installGraphQLLayer() {
      const nativeFetch = win.fetch.bind(win);

      const store = new Map<string, { time: number; size: number; snap: any }>();
      const inflight = new Map<string, Promise<any>>();
      let bytes = 0;
      let epoch = 0;
      let pausedUntil = 0;
      let freshFloor = 0;

      const isGraphQL = (u: any): boolean => {
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

      function clearAll() {
        epoch++;
        store.clear();
        inflight.clear();
        bytes = 0;
      }

      function evict() {
        const now = Date.now();
        for (const [key, entry] of store) {
          if (now - entry.time <= CFG.gqlStaleTtl && bytes <= CFG.gqlMaxBytes) break;
          bytes -= entry.size;
          store.delete(key);
        }
      }

      function put(key: string, snap: any) {
        const old = store.get(key);
        if (old) {
          bytes -= old.size;
          store.delete(key);
        }
        const size = snap.buf.byteLength;
        if (size > CFG.gqlMaxEntryBytes) return;
        store.set(key, { time: Date.now(), size, snap });
        bytes += size;
        evict();
      }

      function parseBody(body: string) {
        try {
          const parsed = JSON.parse(body);
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.query === 'string'
            ? parsed
            : null;
        } catch {
          return null;
        }
      }

      const isMutation = (parsed: any) => /\bmutation\b/i.test(String(parsed.query).replace(/#[^\n\r]*/g, ' '));
      const isVolatile = (parsed: any) =>
        /\b(?:notifications|activities|Activity|Notification)\s*\(/.test(String(parsed?.query || '').replace(/#[^\n\r]*/g, ' '));
      const noStore = (d: any) =>
        d.cache === 'no-store' || d.cache === 'reload' || !!d.headers.get('cache-control')?.toLowerCase().includes('no-store');

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

      function normalizeGqlQuery(q: string): string {
        if (typeof q !== 'string') return '';
        return q
          .replace(/#[^\n\r]*/g, '')
          .replace(/\s+/g, ' ')
          .replace(/\s*([{}():,])\s*/g, '$1')
          .trim();
      }

      function stableStringify(obj: any): string {
        if (obj === null || typeof obj !== 'object') {
          return JSON.stringify(obj);
        }
        if (Array.isArray(obj)) {
          return '[' + obj.map(stableStringify).join(',') + ']';
        }
        const keys = Object.keys(obj).sort();
        return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
      }

      function normalizeVariables(vars: any): any {
        if (!vars || typeof vars !== 'object') return {};
        const copy: Record<string, any> = {};
        for (const k of Object.keys(vars)) {
          if (vars[k] !== undefined && vars[k] !== null) {
            copy[k] = vars[k];
          }
        }
        if (copy.userName && !copy.userId) {
          const name = String(copy.userName).toLowerCase();
          const mine = String(gmStore.get('al_username', '') || '').toLowerCase();
          const id = userMap.get(name) || (name === mine ? Number(gmStore.get('al_user_id', 0)) : 0);
          if (id) {
            copy.userId = id;
            delete copy.userName;
          }
        }
        if (copy.userId && copy.userName) {
          delete copy.userName;
        }
        return copy;
      }

      const isTaxonomyQuery = (parsed: any): boolean =>
        /\bGenreCollection\b|\bMediaTagCollection\b/i.test(String(parsed?.query || ''));
      const isMediaListQuery = (parsed: any): boolean =>
        /\bMediaListCollection\b/i.test(String(parsed?.query || ''));
      const isViewerQuery = (parsed: any): boolean =>
        /\bViewer\b/i.test(String(parsed?.query || ''));

      function makeKey(d: any, parsed: any): string {
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

      const note429 = (res: Response) => {
        if (res.status === 429) pausedUntil = Date.now() + 60_000;
      };

      const sameId = (a: any, b: any) =>
        a === b || (typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase());
      const isIdKey = (key: string) => /^(?:id|name|userName|username|userId)$|Id$/.test(key);
      const STATIC_ROUTE = /^\/(?:home|search\/(?:anime|manga))\/?$/;

      const userMap = new Map<string, number>();
      const idToUserMap = new Map<number, string>();

      function rememberUser(name: string, id: number) {
        if (!name || !id || typeof id !== 'number') return;
        const normName = String(name).trim().toLowerCase();
        if (!normName) return;
        userMap.set(normName, id);
        idToUserMap.set(id, normName);
        attempt(() => {
          const stored = JSON.parse(win.localStorage.getItem('alfl:userMap') || '{}');
          if (stored[normName] !== id) {
            stored[normName] = id;
            const keys = Object.keys(stored);
            if (keys.length > 300) delete stored[keys[0]];
            win.localStorage.setItem('alfl:userMap', JSON.stringify(stored));
          }
        });
      }

      attempt(() => {
        const stored = JSON.parse(win.localStorage.getItem('alfl:userMap') || '{}');
        for (const [k, v] of Object.entries(stored)) {
          if (typeof v === 'number' && v > 0) {
            userMap.set(k.toLowerCase(), v);
            idToUserMap.set(v, k.toLowerCase());
          }
        }
      });

      function getViewerFromWindow(): { id: number; name: string } {
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
        if (!res.name) {
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

      function getLocalUsername(): string | null {
        return getViewerFromWindow().name || null;
      }

      attempt(() => {
        const viewer = getViewerFromWindow();
        if (viewer.name && viewer.id) {
          rememberUser(viewer.name, viewer.id);
          gmStore.set('al_user_id', viewer.id);
          gmStore.set('al_username', viewer.name);
        } else if (viewer.name) {
          gmStore.set('al_username', viewer.name);
        }
      });

      function extractUserMappings(buf: ArrayBuffer) {
        try {
          const text = decoder.decode(new Uint8Array(buf));
          if (!text.includes('Viewer') && !text.includes('User')) return;
          const json = JSON.parse(text);
          const viewer = json?.data?.Viewer;
          if (viewer && viewer.id && viewer.name) {
            rememberUser(String(viewer.name), Number(viewer.id));
            gmStore.set('al_user_id', Number(viewer.id));
            gmStore.set('al_username', String(viewer.name));
          }
          const user = json?.data?.User;
          if (user && user.id && user.name) {
            rememberUser(String(user.name), Number(user.id));
          }
        } catch {}
      }

      function parseRoute(path: string, search = '') {
        const parts = path
          .split('/')
          .filter(Boolean)
          .map((x) => {
            try {
              return decodeURIComponent(x);
            } catch {
              return x;
            }
          });
        if (['anime', 'manga', 'character', 'staff', 'studio'].includes(parts[0]) && /^\d+$/.test(parts[1] || '')) {
          return { shape: `${parts[0]}/${parts[3] || ''}`, id: Number(parts[1]) };
        }
        if (parts[0] === 'user' && parts[1]) return { shape: `user/${parts[2] || ''}`, id: parts[1] };
        if (parts[0] === 'animelist' || parts[0] === 'mangalist') {
          const myName = getLocalUsername();
          if (myName) return { shape: `user/${parts[0]}`, id: myName };
        }
        if (STATIC_ROUTE.test(path))
          return { shape: `static:${path.replace(/\/$/, '')}${search}`, id: null, static: true };
        return null;
      }
      const here = () => parseRoute(win.location.pathname, win.location.search);

      function hasPageId(value: any, id: any): boolean {
        if (!value || typeof value !== 'object') return false;
        const targetUserId = typeof id === 'string' ? userMap.get(id.toLowerCase()) : undefined;
        return Object.keys(value).some((key) => {
          const x = value[key];
          if (x && typeof x === 'object') return hasPageId(x, id);
          if (isIdKey(key)) {
            if (sameId(x, id)) return true;
            if (targetUserId != null && (key === 'userId' || key === 'id') && x === targetUserId) return true;
          }
          return false;
        });
      }

      function replacePageId(value: any, from: any, to: any): number {
        if (!value || typeof value !== 'object') return 0;
        const fromUserId = typeof from === 'string' ? userMap.get(from.toLowerCase()) : undefined;
        const toUserId = typeof to === 'string' ? userMap.get(to.toLowerCase()) : undefined;
        let count = 0;
        for (const key of Object.keys(value)) {
          const x = value[key];
          if (x && typeof x === 'object') count += replacePageId(x, from, to);
          else if (isIdKey(key)) {
            if (sameId(x, from)) {
              value[key] = to;
              count++;
            } else if (fromUserId != null && toUserId != null && (key === 'userId' || key === 'id') && x === fromUserId) {
              value[key] = toUserId;
              count++;
            }
          }
        }
        return count;
      }

      const learned = new Map<string, any>();
      const ROUTES_KEY = 'alfl:routes:v3';
      const ROUTES_TTL = 30 * 86400e3;

      let persistTimer: any = 0;
      const persistRoutes = () => {
        clearTimeout(persistTimer);
        persistTimer = setTimeout(
          () =>
            attempt(() => {
              const out: Record<string, any> = {};
              for (const [shape, v] of [...learned].slice(-40))
                out[shape] = { t: v.t, id: v.route.id, static: !!v.route.static, reqs: v.reqs };
              win.localStorage.setItem(ROUTES_KEY, JSON.stringify(out));
            }),
          1000
        );
      };

      function loadRoutes() {
        attempt(() => {
          win.localStorage.removeItem('alfl:routes:v1');
          win.localStorage.removeItem('alfl:routes:v2');
          const raw = win.localStorage.getItem(ROUTES_KEY);
          if (raw) {
            const now = Date.now();
            for (const [shape, v] of Object.entries(JSON.parse(raw)) as any) {
              if (!v || !Array.isArray(v.reqs) || typeof v.t !== 'number' || now - v.t > ROUTES_TTL) continue;
              const reqs = v.reqs.filter(
                (r: any) =>
                  r &&
                  typeof r.body === 'string' &&
                  typeof r.url === 'string' &&
                  isGraphQL(r.url) &&
                  r.headers &&
                  typeof r.headers === 'object'
              );
              if (reqs.length) learned.set(shape, { route: { shape, id: v.id, static: !!v.static }, reqs, t: v.t });
            }
          }
        });
      }

      let learning: { key: string; started: number; route: any; reqs: any[] } = {
        key: '',
        started: 0,
        route: null,
        reqs: []
      };

      function refreshLearning() {
        const key = win.location.pathname + (STATIC_ROUTE.test(win.location.pathname) ? win.location.search : '');
        if (learning.key === key) return;
        learning = { key, started: 0, route: here(), reqs: [] };
      }

      function rememberQuery(desc: any, parsed: any) {
        refreshLearning();
        if (!(CFG.prefetch || CFG.earlyStart) || !learning.route) return;
        if (!learning.started) learning.started = Date.now();
        if (Date.now() - learning.started > CFG.learnWindowMs) return;
        if (learning.reqs.length >= CFG.learnMaxReqs) return;
        if (!learning.route.static && !hasPageId(parsed.variables, learning.route.id)) return;

        const headers = Object.fromEntries(desc.headers.entries());
        delete headers['content-length'];
        delete headers['host'];
        delete headers['connection'];
        delete headers['content-encoding'];
        const authValue = headers.authorization;
        delete headers.authorization;
        let auth = false;
        if (authValue !== undefined) {
          auth = true;
          if (authValue.startsWith('Bearer ')) {
            const token = authValue.slice(7).trim();
            if (token) {
              win.al_token = token;
            }
          }
        }
        learning.reqs.push({
          url: desc.url,
          body: JSON.stringify(parsed),
          headers,
          auth,
          credentials: desc.credentials || 'same-origin',
          mode: desc.mode || 'cors'
        });
        learned.delete(learning.route.shape);
        learned.set(learning.route.shape, { route: learning.route, reqs: [...learning.reqs], t: Date.now() });

        if (learning.route.shape === 'user/animelist') {
          const mangaReqs = learning.reqs.map((r) => ({
            ...r,
            body: r.body.replace(/"type"\s*:\s*"ANIME"/g, '"type":"MANGA"')
          }));
          learned.set('user/mangalist', {
            route: { shape: 'user/mangalist', id: learning.route.id, static: false },
            reqs: mangaReqs,
            t: Date.now()
          });
        } else if (learning.route.shape === 'user/mangalist') {
          const animeReqs = learning.reqs.map((r) => ({
            ...r,
            body: r.body.replace(/"type"\s*:\s*"MANGA"/g, '"type":"ANIME"')
          }));
          learned.set('user/animelist', {
            route: { shape: 'user/animelist', id: learning.route.id, static: false },
            reqs: animeReqs,
            t: Date.now()
          });
        }

        persistRoutes();
      }

      async function classify(input: any, init?: RequestInit) {
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
            win.al_token = token;
          }
        }
        const mediaList = isMediaListQuery(parsed);
        const bypass = !mediaList && (isVolatile(parsed) || noStore(desc));
        return { desc, parsed, mutation: isMutation(parsed), bypass };
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
          const raw = win.localStorage.getItem(TAXONOMY_STORAGE_KEY);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.time === 'number' && typeof parsed.text === 'string') return parsed;
        } catch {}
        return null;
      }

      function persistStoredTaxonomy(snap: any) {
        attempt(() => {
          const text = decoder.decode(snap.buf);
          win.localStorage.setItem(
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

      function cachedFetch(job: any, input: any, init?: RequestInit, replay = false) {
        const { desc, parsed } = job;
        if (init?.signal?.aborted) return nativeFetch(input, init);
        if (!replay) attempt(() => rememberQuery(desc, parsed));

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
            extractUserMappings(snap.buf);
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
          clearAll();
          const p = nativeFetch(input, init);
          p.then(
            (res: Response) => {
              note429(res);
              clearAll();
            },
            () => clearAll()
          );
          return p;
        }
        if (job.bypass) {
          const p = nativeFetch(input, init);
          p.then(note429, () => {});
          return p;
        }
        return cachedFetch(job, input, init, (init as any)?.__alfl === 'replay');
      };

      const rpcCache = new Map<string, { time: number; msg: any }>();
      const rpcInflight = new Map<string, {
        promise: Promise<any>;
        resolve: (val: any) => void;
        reject: (err: any) => void;
      }>();
      const workerPending = new WeakMap<object, Map<string, { key: string | null; mutation: boolean; epoch?: number }>>();
      const watched = new WeakSet<object>();
      let workerUrl: string | null = null;
      let workerOpts: any;
      let WorkerCtor: any = null;
      let lastAuth = '';
      const findWorkerUrl = (): string | null =>
        workerUrl ||
        (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
          .map((e) => e.name)
          .find((n) => /\.worker\.js(?:\?|$)/.test(n)) ||
        attempt(() => win.localStorage.getItem('alfl:workerUrl') || gmStore.get('alfl:workerUrl', null)) ||
        null;

      attempt(() => {
        win.localStorage.removeItem('alfl:rpc:listTpl');
        gmStore.del('alfl:rpc:listTpl');
      });

      win.__ALFL_RPC_CACHE__ = rpcCache;
      win.__ALFL_RPC_INFLIGHT__ = rpcInflight;
      const RPC_MAX_ENTRIES = 32;
      const clone = (v: any) => {
        try {
          return (win.structuredClone || structuredClone)(v);
        } catch {
          return JSON.parse(JSON.stringify(v));
        }
      };
      let rpcEpoch = 0;
      const clearRpc = () => {
        rpcEpoch++;
        freshFloor = Date.now();
        rpcCache.clear();
        rpcInflight.clear();
      };
      win.__ALFL_CLEAR__ = clearRpc;

      const isRpcFetch = (d: any) =>
        !!d && d.type === 'RPC' && d.method === 'fetch' && Array.isArray(d.params) && typeof d.params[1] === 'string';

      const extractUsersFromRpcResult = (res: any) => {
        if (!res || typeof res !== 'object') return;
        attempt(() => {
          const scanUsers = (obj: any, depth = 0) => {
            if (!obj || typeof obj !== 'object' || depth > 5) return;
            if (obj.name && obj.id && (typeof obj.id === 'number' || /^\d+$/.test(String(obj.id)))) {
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
      };

      const getMediaListKeys = (type: string, userId?: number, userName?: string): string[] => {
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

      const rpcKey = (params: any[]) => {
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

      const onIn = function (this: any, ev: MessageEvent) {
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
        if (p.mutation) return clearRpc();
        if (p.key && d.error == null && p.epoch === rpcEpoch) {
          attempt(() => {
            rpcCache.delete(p.key!);
            rpcCache.set(p.key!, { time: Date.now(), msg: clone(d) });
            while (rpcCache.size > RPC_MAX_ENTRIES) rpcCache.delete(rpcCache.keys().next().value as string);
          });
        }
      };

      const prefetchedWorkerKeys = new Map<string, number>();

      function prefetchWorkerList(type: 'ANIME' | 'MANGA', userId: number, userName?: string) {
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
        const raw = attempt(() => win.localStorage.getItem('alfl:rpc:listTpl:v2') || gmStore.get('alfl:rpc:listTpl:v2', null));
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
        const authVal = lastAuth || gmStore.get('al_token_auth', '') || (win.al_token ? `Bearer ${win.al_token}` : '');
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
            win.localStorage.removeItem('alfl:workerUrl');
            gmStore.del('alfl:workerUrl');
          });
          workerUrl = null;
          finish();
        });

        logDebug('[FASTLOAD RPC] Prefetch dispatching', type, vars);
        w.postMessage({ type: 'RPC', id, method: 'fetch', params });
      }

      let autoPrefetchTimer: any = 0;
      function scheduleAutoPrefetch(delay = 600) {
        clearTimeout(autoPrefetchTimer);
        autoPrefetchTimer = setTimeout(() => {
          attempt(autoPrefetchListsForCurrentRoute);
        }, delay);
      }

      function autoPrefetchListsForCurrentRoute() {
        if (!CFG.prefetch || yielded()) return;
        const now = Date.now();
        if (doc.hidden || now < pausedUntil || (navigator as any).connection?.saveData) return;

        const path = win.location.pathname;
        const viewer = getViewerFromWindow();
        const myId = viewer.id || Number(gmStore.get('al_user_id', 0));
        const myName = viewer.name || gmStore.get<string | null>('al_username', null);

        const userMatch = path.match(/^\/user\/([^/]+)(?:\/([^/]+))?/i);
        let isAnotherUserPage = false;
        let otherUser = '';
        let otherUserId = 0;
        let subRoute = '';

        if (userMatch) {
          const targetUser = decodeURIComponent(userMatch[1]);
          subRoute = (userMatch[2] || '').toLowerCase();
          const isMe =
            (myName && targetUser.toLowerCase() === myName.toLowerCase()) ||
            (myId > 0 && userMap.get(targetUser.toLowerCase()) === myId);

          if (!isMe) {
            isAnotherUserPage = true;
            otherUser = targetUser;
            otherUserId = userMap.get(targetUser.toLowerCase()) || 0;
          }
        }

        if (isAnotherUserPage) {
          logDebug('[FASTLOAD RPC] Auto-prefetching for target user:', otherUser, 'subRoute:', subRoute);
          if (subRoute !== 'animelist') {
            setTimeout(() => {
              prefetchWorkerList('ANIME', otherUserId, otherUser);
            }, 100);
          }
          if (subRoute !== 'mangalist') {
            setTimeout(() => {
              prefetchWorkerList('MANGA', otherUserId, otherUser);
            }, 300);
          }

          if (myId || myName) {
            setTimeout(() => {
              prefetchWorkerList('ANIME', myId, myName || undefined);
            }, 500);
            setTimeout(() => {
              prefetchWorkerList('MANGA', myId, myName || undefined);
            }, 800);
          }
        } else {
          if (myId || myName) {
            const isMyAnimePage = path.includes('/animelist') && (myName ? path.toLowerCase().includes(myName.toLowerCase()) : true);
            const isMyMangaPage = path.includes('/mangalist') && (myName ? path.toLowerCase().includes(myName.toLowerCase()) : true);
            if (!isMyAnimePage) {
              setTimeout(() => {
                prefetchWorkerList('ANIME', myId, myName || undefined);
              }, 100);
            }
            if (!isMyMangaPage) {
              setTimeout(() => {
                prefetchWorkerList('MANGA', myId, myName || undefined);
              }, 300);
            }
          }
        }
      }

      navListeners.push(() => scheduleAutoPrefetch(500));
      if (doc.readyState !== 'loading') scheduleAutoPrefetch(1000);
      else doc.addEventListener('DOMContentLoaded', () => scheduleAutoPrefetch(1000), { once: true });

      attempt(() => {
        const pageWin = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window) as any;
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
                  win.localStorage.setItem('alfl:workerUrl', workerUrl);
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
                  win.localStorage.setItem('alfl:rpc:listTpl:v2', tplStr);
                  gmStore.set('alfl:rpc:listTpl:v2', tplStr);
                });
              }
              if (isMutation(q)) {
                clearRpc();
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
                  const viewer = getViewerFromWindow();
                  const myId = viewer.id || Number(gmStore.get('al_user_id', 0));
                  const isViewerReq = (userId && userId === myId) || (userName && userName.toLowerCase() === viewer.name?.toLowerCase());

                  if (!userName && userId) {
                    userName = idToUserMap.get(userId);
                  }
                  if (!userId && userName) {
                    userId = userMap.get(userName.toLowerCase());
                  }

                  if (!isViewerReq) {
                    const userMatch = win.location.pathname.match(/^\/user\/([^/]+)/i);
                    if (userMatch) {
                      const profileUser = decodeURIComponent(userMatch[1]).trim().toLowerCase();
                      if (!userName) userName = profileUser;
                      if (userId && !userMap.has(profileUser)) {
                        rememberUser(profileUser, userId);
                      }
                    }
                  }

                  const possibleKeys = [key, ...getMediaListKeys(type || 'ANIME', userId, userName)];
                  for (const k of possibleKeys) {
                    if (!hit) {
                      const h = rpcCache.get(k);
                      if (h && h.time >= freshFloor && Date.now() - h.time < getQueryTtl(q)) {
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
                  if (h && h.time >= freshFloor && Date.now() - h.time < getQueryTtl(q)) {
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

      /* ==================================================================
       * Replaying learned queries: navigation prefetch and early start
       * ================================================================== */
      let hiddenAt = 0;
      doc.addEventListener('visibilitychange', () => {
        if (doc.hidden) {
          hiddenAt = Date.now();
          return;
        }
        if (hiddenAt && Date.now() - hiddenAt > 10 * 60_000) {
          epoch++;
          freshFloor = Date.now();
        }
        inflight.clear();
      });

      const prefetched = new Map<string, number>();
      const stamps: number[] = [];
      let dwellTimer: any = 0;

      function getAuthToken(): string | null {
        if (win.al_token) return win.al_token;
        const stored = gmStore.get<string | null>('al_token', null);
        if (stored) {
          win.al_token = stored;
          return stored;
        }
        try {
          const nuxtToken = win.__NUXT__?.state?.auth?.token || win.__NUXT__?.state?.auth?._token;
          if (typeof nuxtToken === 'string' && nuxtToken) {
            const clean = nuxtToken.replace(/^Bearer\s+/i, '').trim();
            if (clean) {
              win.al_token = clean;
              gmStore.set('al_token', clean);
              return clean;
            }
          }
        } catch {}
        try {
          const candidates = ['auth._token.local', 'auth.token', 'access_token', 'token', 'al_token'];
          for (const k of candidates) {
            const val = win.localStorage.getItem(k);
            if (typeof val === 'string' && val) {
              const clean = val.replace(/^"|"$/g, '').replace(/^Bearer\s+/i, '').trim();
              if (clean && clean !== 'false' && clean !== 'null' && clean.length > 10) {
                win.al_token = clean;
                gmStore.set('al_token', clean);
                return clean;
              }
            }
          }
        } catch {}
        return null;
      }

      function replayRoute(known: any, route: any) {
        if (yielded()) return 0;
        let sent = 0;
        for (const request of known.reqs) {
          let parsed;
          try {
            parsed = JSON.parse(request.body);
          } catch {
            continue;
          }
          if (isMutation(parsed) || isVolatile(parsed)) continue;
          if (!known.route.static && !sameId(known.route.id, route.id)) {
            if (!replacePageId(parsed.variables, known.route.id, route.id)) continue;
          }
          const body = JSON.stringify(parsed);

          const headers = { ...request.headers };
          if (request.auth) {
            const token = getAuthToken();
            if (!token) continue;
            headers.authorization = `Bearer ${token}`;
          }
          stamps.push(Date.now());
          sent++;
          attempt(() => {
            logDebug('[FASTLOAD] Replay/Prefetch dispatching for:', route.shape, 'vars:', parsed.variables);
            win
              .fetch(request.url, {
                method: 'POST',
                headers,
                body,
                credentials: request.credentials || 'same-origin',
                mode: request.mode || 'cors',
                __alfl: 'replay'
              } as any)
              .catch(() => {});
          });
        }
        return sent;
      }

      const triggerEarlyStart = () => {
        attempt(() => {
          if ((navigator as any).connection?.saveData) return;
          const route = here();
          const known = route && learned.get(route.shape);
          if (known) stats.earlyStarts += replayRoute(known, route);
        });
      };

      if (CFG.earlyStart) {
        loadRoutes();
        triggerEarlyStart();
        navListeners.push(triggerEarlyStart);
      } else if (CFG.prefetch) {
        loadRoutes();
      }

      if (!CFG.prefetch) return;

      function prefetchFor(anchor: HTMLAnchorElement) {
        if (yielded()) return;
        const now = Date.now();
        if (doc.hidden || now < pausedUntil || (navigator as any).connection?.saveData) return;

        let url;
        try {
          url = new URL(anchor.href, win.location.href);
        } catch {
          return;
        }
        if (url.origin !== win.location.origin) return;

        const listMatch = url.pathname.match(/^\/(?:user\/([^/]+)\/)?(animelist|mangalist)/i);
        if (listMatch) {
          const targetUser = listMatch[1] || getLocalUsername();
          const listType = listMatch[2].toLowerCase() === 'mangalist' ? 'MANGA' : 'ANIME';
          const userId = targetUser
            ? (userMap.get(targetUser.toLowerCase()) || (targetUser.toLowerCase() === getLocalUsername()?.toLowerCase() ? Number(gmStore.get('al_user_id', 0)) : 0))
            : 0;
          if (userId || targetUser) {
            prefetchWorkerList(listType, userId, targetUser || undefined);
          }
          return;
        }

        const route = parseRoute(url.pathname, url.search);
        if (!route || route.static) return;
        const known = learned.get(route.shape);
        if (!known || known.route.static) return;
        if (typeof known.route.id !== typeof route.id) {
          if (typeof known.route.id === 'number' && typeof route.id === 'string') {
            if (userMap.get(route.id.toLowerCase()) !== known.route.id) return;
          } else if (typeof known.route.id === 'string' && typeof route.id === 'number') {
            if (userMap.get(known.route.id.toLowerCase()) !== route.id) return;
          } else {
            return;
          }
        }

        const current = here();
        if (current && current.shape === route.shape && sameId(current.id, route.id)) return;

        const key = `${route.shape}|${String(route.id).toLowerCase()}`;
        const cooldown = route.shape.includes('list') ? 60_000 : CFG.gqlTtl;
        if (now - (prefetched.get(key) || 0) < cooldown) return;

        while (stamps.length && now - stamps[0] > 60_000) stamps.shift();
        if (prefetched.size > 200) {
          for (const [k, t] of prefetched) if (now - t > cooldown) prefetched.delete(k);
        }
        if (stamps.length + known.reqs.length > CFG.prefetchMaxPerMin) return;

        const sent = replayRoute(known, route);
        if (sent) {
          prefetched.set(key, now);
          stats.prefetched += sent;
          logDebug('[FASTLOAD] Prefetch sent for:', route.shape, route.id);
        }
      }

      const linkOf = (event: any) => event.target?.closest?.('a[href]') || null;
      const opts = { capture: true, passive: true };

      doc.addEventListener(
        'pointerover',
        (event: any) => {
          if (event.pointerType && event.pointerType !== 'mouse') return;
          const anchor = linkOf(event);
          clearTimeout(dwellTimer);
          if (anchor) dwellTimer = setTimeout(() => prefetchFor(anchor), CFG.prefetchDwellMs);
        },
        opts
      );
      doc.addEventListener('pointerout', () => clearTimeout(dwellTimer), opts);
      doc.addEventListener(
        'pointerdown',
        (event: any) => {
          const anchor = linkOf(event);
          if (anchor) prefetchFor(anchor);
        },
        opts
      );
    }

    /* ======================================================================
     * Start
     * ====================================================================== */
    if (CFG.gqlTtl > 0 && typeof win.fetch === 'function') attempt(installGraphQLLayer);
    if (CFG.coalesceObservers) attempt(installObserverCoalescing);
    if (CFG.fastInnerText) attempt(installFastInnerText);
    if (CFG.memoSelectorProbes) attempt(installProbeMemo);
    if (CFG.blockTierInData || CFG.tierAssist) attempt(installTierSupport);
    if (CFG.lazyMedia) attempt(installLazyMedia);
    if (CFG.rowSkipping) attempt(installRowSkipping);
  }
);