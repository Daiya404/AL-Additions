import { safe } from '../utils/helpers';

export const Core = (() => {
  const navCbs: Array<() => void> = [];
  const bodyCbs: Array<(mutations: MutationRecord[]) => void> = [];
  let observer: MutationObserver | null = null;
  let lastHref = location.href;
  let muted = false;

  const fire = <T>(list: Array<(arg: T) => void>, arg?: T): void => {
    for (const cb of list.slice()) safe(() => cb(arg!), 'core');
  };

  function notifyNav(): void {
    if (muted || location.href === lastHref) return;
    lastHref = location.href;
    fire(navCbs);
  }

  for (const name of ['pushState', 'replaceState'] as const) {
    const orig = history[name];
    history[name] = function (...args: any[]) {
      const r = (orig as any).apply(this, args);
      notifyNav();
      return r;
    };
  }

  window.addEventListener('popstate', notifyNav);
  window.addEventListener('hashchange', notifyNav);
  setInterval(notifyNav, 400);

  function ready(cb: () => void): void {
    if (document.body) safe(cb, 'ready');
    else document.addEventListener('DOMContentLoaded', () => safe(cb, 'ready'), { once: true });
  }

  function ensureObserver(): void {
    if (observer || !document.body) return;
    observer = new MutationObserver((m) => fire(bodyCbs, m));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  ready(ensureObserver);

  function onBodyMutation(cb: (mutations: MutationRecord[]) => void): () => void {
    bodyCbs.push(cb);
    ready(ensureObserver);
    return () => {
      const i = bodyCbs.indexOf(cb);
      if (i !== -1) bodyCbs.splice(i, 1);
    };
  }

  function waitForSelector<T extends HTMLElement = HTMLElement>(selector: string, timeoutMs = 8000): Promise<T | null> {
    return new Promise((resolve) => {
      const existing = document.querySelector<T>(selector);
      if (existing) return resolve(existing);

      let done = false;
      let unsub: (() => void) | null = null;

      const finish = (v: T | null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (unsub) unsub();
        resolve(v);
      };

      const timer = setTimeout(() => finish(null), timeoutMs);
      unsub = onBodyMutation(() => {
        const el = document.querySelector<T>(selector);
        if (el) finish(el);
      });
    });
  }

  function silently(fn: () => void): void {
    muted = true;
    try {
      fn();
    } finally {
      muted = false;
      lastHref = location.href;
    }
  }

  return {
    onNavigate: (cb: () => void) => navCbs.push(cb),
    onBodyMutation,
    waitForSelector,
    ready,
    silently
  };
})();