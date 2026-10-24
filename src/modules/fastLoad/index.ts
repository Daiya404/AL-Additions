import { defineFeature } from '../../core/registry';
import { markBuiltIn } from '../../utils/standalone';
import { CFG, GQL_ORIGIN, MEDIA_ORIGIN, attempt } from './config';
import {
  win,
  doc,
  initUserMap,
  registerGlobalBridges,
  getViewerFromWindow,
  rememberUser,
  incEpoch,
  setFreshFloor,
  inflight,
  navListeners
} from './state';
import {
  installLazyMedia,
  installRowSkipping,
  installObserverCoalescing,
  installFastInnerText,
  installProbeMemo,
  installTierSupport
} from './domOptimizers';
import { hookWorker } from './worker';
import {
  loadRoutes,
  triggerEarlyStart,
  scheduleAutoPrefetch,
  installPointerPrefetch
} from './routes';
import { installGraphQLLayer } from './graphql';
import { store as gmStore } from '../../utils/helpers';

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
    if (win.top !== win.self) return;
    if (win.__ANILIST_FAST_LOAD__ || win.__ANILIST_FAST_LOAD_V4__) {
      console.warn(
        '[AL-Additions] Built-in Fast Load skipped: the standalone AniList Fast Load script is already running. Uninstall it to use the built-in version.'
      );
      return;
    }

    win.__ALA_FAST_LOAD__ = '0.4.3';
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

    initUserMap();
    registerGlobalBridges();

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

    let hiddenAt = 0;
    doc.addEventListener('visibilitychange', () => {
      if (doc.hidden) {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt > 10 * 60_000) {
        incEpoch();
        setFreshFloor(Date.now());
      }
      inflight.clear();
    });

    if (CFG.gqlTtl > 0 && typeof win.fetch === 'function') {
      installGraphQLLayer(yielded);
      hookWorker(yielded);
    }
    if (CFG.coalesceObservers) attempt(installObserverCoalescing);
    if (CFG.fastInnerText) attempt(installFastInnerText);
    if (CFG.memoSelectorProbes) attempt(installProbeMemo);
    if (CFG.blockTierInData || CFG.tierAssist) attempt(installTierSupport);
    if (CFG.lazyMedia) attempt(installLazyMedia);
    if (CFG.rowSkipping) attempt(installRowSkipping);

    if (CFG.earlyStart) {
      loadRoutes();
      triggerEarlyStart(yielded);
      navListeners.push(() => triggerEarlyStart(yielded));
    } else if (CFG.prefetch) {
      loadRoutes();
    }

    if (CFG.prefetch) {
      navListeners.push(() => scheduleAutoPrefetch(yielded, 500));
      if (doc.readyState !== 'loading') scheduleAutoPrefetch(yielded, 1000);
      else doc.addEventListener('DOMContentLoaded', () => scheduleAutoPrefetch(yielded, 1000), { once: true });
      installPointerPrefetch(yielded);
    }
  }
);