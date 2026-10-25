import { win, doc, onNav } from './state';
import { CFG, stats, attempt, idle } from './config';

export function installLazyMedia() {
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

export function installRowSkipping() {
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
          idle(win, () => {
            if (!doc.hidden) measure();
          }),
        ms
      )
    );
  }

  onNav(schedule);
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

export function installObserverCoalescing() {
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

export function installFastInnerText() {
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

export function installProbeMemo() {
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

export function installTierSupport() {
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