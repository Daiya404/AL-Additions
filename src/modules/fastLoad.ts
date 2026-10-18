import { defineFeature } from '../core/registry';
import { unsafeWindow } from 'vite-plugin-monkey/dist/client';

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
    if (win.__ANILIST_FAST_LOAD__ || win.__ANILIST_FAST_LOAD_V4__) return;
    win.__ANILIST_FAST_LOAD__ = '0.3.1';

    const CFG = {
      lazyMedia: true,
      rowSkipping: true,
      coalesceObservers: true,
      observerBatchMs: 80,
      fastInnerText: true,
      memoSelectorProbes: true,
      blockTierInData: true,
      tierAssist: true,
      tierAssistMs: 250,

      gqlTtl: 15_000,
      gqlStaleTtl: 5 * 60_000,
      gqlMaxBytes: 40 * 1024 * 1024,
      gqlMaxEntryBytes: 16 * 1024 * 1024,

      prefetch: true,
      earlyStart: true,
      prefetchMaxPerMin: 8,
      prefetchDwellMs: 140,
      learnWindowMs: 3_000,
      learnMaxReqs: 4
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
      let prefetching = false;

      const isGraphQL = (u: any) => {
        try {
          return new URL(u, win.location.href).origin === GQL_ORIGIN;
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
        return new ResponseCtor(snap.buf, { status: snap.status, statusText: snap.statusText, headers });
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
      const isVolatile = (parsed: any) => /notification|activit/i.test(parsed.query);
      const noStore = (d: any) =>
        d.cache === 'no-store' || d.cache === 'reload' || !!d.headers.get('cache-control')?.toLowerCase().includes('no-store');

      const decoder = new TextDecoder();
      const ERROR_SCAN_BYTES = 2048;
      function hasGraphQLErrors(buf: ArrayBuffer) {
        const view = new Uint8Array(buf);
        const head = decoder.decode(view.subarray(0, ERROR_SCAN_BYTES));
        const tail =
          view.length > ERROR_SCAN_BYTES ? decoder.decode(view.subarray(view.length - ERROR_SCAN_BYTES)) : '';
        return /"errors"\s*:/.test(head) || /"errors"\s*:/.test(tail);
      }

      const makeKey = (d: any) =>
        [
          d.headers.get('authorization') || '',
          d.headers.get('accept') || '',
          d.url,
          d.method,
          d.credentials || '',
          d.mode || '',
          d.body
        ].join('\u0001');

      const note429 = (res: Response) => {
        if (res.status === 429) pausedUntil = Date.now() + 60_000;
      };

      const sameId = (a: any, b: any) =>
        a === b || (typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase());
      const isIdKey = (key: string) => /^(?:id|name|userName|username)$|Id$/.test(key);
      const STATIC_ROUTE = /^\/(?:home|search\/(?:anime|manga))\/?$/;

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
        if (STATIC_ROUTE.test(path))
          return { shape: `static:${path.replace(/\/$/, '')}${search}`, id: null, static: true };
        return null;
      }
      const here = () => parseRoute(win.location.pathname, win.location.search);

      function hasPageId(value: any, id: any): boolean {
        if (!value || typeof value !== 'object') return false;
        return Object.keys(value).some((key) => {
          const x = value[key];
          if (x && typeof x === 'object') return hasPageId(x, id);
          return isIdKey(key) && sameId(x, id);
        });
      }

      function replacePageId(value: any, from: any, to: any): number {
        if (!value || typeof value !== 'object') return 0;
        let count = 0;
        for (const key of Object.keys(value)) {
          const x = value[key];
          if (x && typeof x === 'object') count += replacePageId(x, from, to);
          else if (isIdKey(key) && sameId(x, from)) {
            value[key] = to;
            count++;
          }
        }
        return count;
      }

      const learned = new Map<string, any>();
      const ROUTES_KEY = 'alfl:routes:v1';
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
          const raw = win.localStorage.getItem(ROUTES_KEY);
          if (!raw) return;
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
        if (!(CFG.prefetch || CFG.earlyStart) || prefetching || !learning.route) return;
        if (!learning.started) learning.started = Date.now();
        if (Date.now() - learning.started > CFG.learnWindowMs) return;
        if (learning.reqs.length >= CFG.learnMaxReqs) return;
        if (!learning.route.static && !hasPageId(parsed.variables, learning.route.id)) return;
        if (JSON.stringify(parsed) !== desc.body) return;

        const headers = Object.fromEntries(desc.headers.entries());
        const authValue = headers.authorization;
        delete headers.authorization;
        let auth = false;
        if (authValue !== undefined) {
          if (!win.al_token || authValue !== `Bearer ${win.al_token}`) return;
          auth = true;
        } else if (win.al_token) {
          return;
        }
        learning.reqs.push({
          url: desc.url,
          body: desc.body,
          headers,
          auth,
          credentials: desc.credentials,
          mode: desc.mode
        });
        learned.delete(learning.route.shape);
        learned.set(learning.route.shape, { route: learning.route, reqs: [...learning.reqs], t: Date.now() });
        persistRoutes();
      }

      function classify(input: any, init?: RequestInit) {
        const RequestCtor = win.Request || Request;
        const isRequest = input instanceof RequestCtor;
        const method = String(init?.method || (isRequest ? input.method : 'GET')).toUpperCase();
        if (method !== 'POST') return null;

        const url = isRequest ? input.url : input instanceof URL ? input.href : String(input);
        if (!isGraphQL(url)) return null;

        const body = init?.body ?? null;
        if (typeof body !== 'string') return null;

        const parsed = parseBody(body);
        if (!parsed) return null;

        const HeadersCtor = win.Headers || Headers;
        const desc = {
          url,
          method,
          body,
          headers: new HeadersCtor(init?.headers ?? (isRequest ? input.headers : undefined)),
          credentials: init?.credentials ?? (isRequest ? input.credentials : undefined),
          mode: init?.mode ?? (isRequest ? input.mode : undefined),
          cache: init?.cache ?? (isRequest ? input.cache : undefined)
        };
        return { desc, parsed, mutation: isMutation(parsed), bypass: isVolatile(parsed) || noStore(desc) };
      }

      function cachedFetch(job: any, input: any, init?: RequestInit) {
        const { desc, parsed } = job;
        if (init?.signal?.aborted) return nativeFetch(input, init);
        attempt(() => rememberQuery(desc, parsed));

        const key = makeKey(desc);
        const now = Date.now();
        const cached = store.get(key);

        if (cached && cached.time >= freshFloor && now - cached.time < CFG.gqlTtl) {
          stats.cacheHits++;
          return Promise.resolve(toResponse(cached.snap));
        }

        const flying = inflight.get(key);
        if (flying) {
          stats.deduped++;
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
        const original = nativeFetch(input, init);

        const snapshot = original.then(async (res: Response) => {
          note429(res);
          if (res.status !== 200) throw new Error('not cacheable');
          const copy = res.clone();
          const buf = await copy.arrayBuffer();
          if (hasGraphQLErrors(buf)) throw new Error('graphql errors');
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
            if (epoch === myEpoch) put(key, snap);
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

      win.fetch = function fetch(input: any, init?: RequestInit) {
        let job = null;
        try {
          job = classify(input, init);
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
        return cachedFetch(job, input, init);
      };

      /* ==================================================================
       * Replaying learned queries: navigation prefetch and early start
       * ================================================================== */
      doc.addEventListener('visibilitychange', () => {
        if (doc.hidden) return;
        epoch++;
        freshFloor = Date.now();
        inflight.clear();
      });

      const prefetched = new Map<string, number>();
      const stamps: number[] = [];
      let dwellTimer: any = 0;

      let tokenWait: Promise<boolean> | null = null;
      function waitForToken(cb: () => void) {
        tokenWait ||= new Promise((resolve) => {
          let tries = 0;
          const t = setInterval(() => {
            const ready = !!win.al_token;
            if (!ready && ++tries <= 300) return;
            clearInterval(t);
            tokenWait = null;
            resolve(ready);
          }, 10);
        });
        tokenWait.then((ready) => {
          if (ready) cb();
        });
      }

      function replayRoute(known: any, route: any) {
        let sent = 0;
        for (const request of known.reqs) {
          let parsed;
          try {
            parsed = JSON.parse(request.body);
          } catch {
            continue;
          }
          if (isMutation(parsed) || isVolatile(parsed)) continue;
          if (!known.route.static && !replacePageId(parsed.variables, known.route.id, route.id)) continue;
          const body = JSON.stringify(parsed);

          const send = () => {
            const headers = { ...request.headers };
            if (request.auth) headers.authorization = `Bearer ${win.al_token}`;
            prefetching = true;
            try {
              win
                .fetch(request.url, {
                  method: 'POST',
                  headers,
                  body,
                  credentials: request.credentials,
                  mode: request.mode
                })
                .catch(() => {});
            } catch {
              /* ignore */
            }
            prefetching = false;
          };
          stamps.push(Date.now());
          sent++;
          if (request.auth && !win.al_token) waitForToken(send);
          else send();
        }
        return sent;
      }

      if (CFG.earlyStart) {
        loadRoutes();
        attempt(() => {
          if ((navigator as any).connection?.saveData) return;
          const route = here();
          const known = route && learned.get(route.shape);
          if (known) stats.earlyStarts += replayRoute(known, route);
        });
      } else if (CFG.prefetch) {
        loadRoutes();
      }

      if (!CFG.prefetch) return;

      function prefetchFor(anchor: HTMLAnchorElement) {
        const now = Date.now();
        if (doc.hidden || now < pausedUntil || (navigator as any).connection?.saveData) return;

        let url;
        try {
          url = new URL(anchor.href, win.location.href);
        } catch {
          return;
        }
        if (url.origin !== win.location.origin) return;

        const route = parseRoute(url.pathname, url.search);
        if (!route || route.static) return;
        const known = learned.get(route.shape);
        if (!known || known.route.static) return;
        if (typeof known.route.id !== typeof route.id || sameId(known.route.id, route.id)) return;

        const current = here();
        if (current && current.shape === route.shape && sameId(current.id, route.id)) return;

        const key = `${route.shape}|${String(route.id).toLowerCase()}`;
        if (now - (prefetched.get(key) || 0) < CFG.gqlTtl) return;

        while (stamps.length && now - stamps[0] > 60_000) stamps.shift();
        if (prefetched.size > 200) {
          for (const [k, t] of prefetched) if (now - t > CFG.gqlTtl) prefetched.delete(k);
        }
        if (stamps.length + known.reqs.length > CFG.prefetchMaxPerMin) return;

        const sent = replayRoute(known, route);
        if (sent) {
          prefetched.set(key, now);
          stats.prefetched += sent;
        }
      }

      const linkOf = (event: any) => event.target?.closest?.('a[href]') || null;
      const opts = { capture: true, passive: true };

      doc.addEventListener(
        'pointerover',
        (event: any) => {
          if (event.pointerType !== 'mouse') return;
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
    if (CFG.coalesceObservers) attempt(installObserverCoalescing);
    if (CFG.fastInnerText) attempt(installFastInnerText);
    if (CFG.memoSelectorProbes) attempt(installProbeMemo);
    if (CFG.blockTierInData || CFG.tierAssist) attempt(installTierSupport);
    if (CFG.lazyMedia) attempt(installLazyMedia);
    if (CFG.rowSkipping) attempt(installRowSkipping);
    if (CFG.gqlTtl > 0 && typeof win.fetch === 'function') attempt(installGraphQLLayer);
  }
);

