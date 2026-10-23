import { defineFeature } from '../core/registry';
import { Core } from '../core/observer';
import { AniList } from '../api/anilist';
import { addStyle } from '../utils/dom';
import { persistent, clean, debounce } from '../utils/helpers';

interface AiringCacheEntry {
  status: string | null;
  updated: number;
  aired: number | null;
  nextEpisode: number | null;
  nextCheck: number;
}

defineFeature(
  {
    id: 'behindDots',
    key: 'behindDotsEnabled',
    section: 'AniList Enhancements',
    def: false,
    legacy: ['behindDotsEnabled', 'airingProgressIndicatorEnabled'],
    title: 'Airing Progress Indicator',
    help: 'Show an orange indicator when your watched episode count is behind the number of aired episodes.'
  },
  () => {
    const CLASS = 'daiya-behind-dot';
    const ORANGE = 'rgb(255, 152, 0)';
    const NO_AIRING_TTL = 6 * 3600e3;
    const AIRING_GRACE = 30e3;
    const ERROR_RETRY = 5 * 60e3;
    const PRUNE_AGE = 30 * 86400e3;
    const BATCH = 25;
    const CONCURRENCY = 4;
    const OPTIMISTIC_TTL = 2500;
    const QUERY =
      'query ($ids: [Int]) { Page(page: 1, perPage: 25) { media(id_in: $ids, type: ANIME) { id status nextAiringEpisode { episode airingAt timeUntilAiring } } } }';

    addStyle(
      'daiya-behind-dot-css',
      `
      .${CLASS}{background:${ORANGE}!important;background-color:${ORANGE}!important;box-shadow:0 0 5px rgba(255,152,0,.85)!important;opacity:1!important}
      .${CLASS}::before,.${CLASS}::after{background:${ORANGE}!important;background-color:${ORANGE}!important}`
    );

    const cacheStore = persistent<Record<string, AiringCacheEntry>>('daiya-anilist-airing-cache-v5', (d) => {
      for (const id of Object.keys(d)) {
        if (!(Date.now() - Number(d[id]?.updated) < PRUNE_AGE)) delete d[id];
      }
    });
    const cache = cacheStore.data;

    const pending = new Set<string>();
    const active = new Set<string>();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const optimistic = new Map<string, { target: number; expiresAt: number }>();
    let running = 0;

    const onListPage = (): boolean => location.pathname.includes('/animelist');
    const idOf = (entry: Element): string | null =>
      entry.querySelector('a[href*="/anime/"]')?.getAttribute('href')?.match(/\/anime\/(\d+)(?:[/?#]|$)/i)?.[1] ||
      null;
    const needsFetch = (id: string): boolean => {
      const d = cache[id];
      return !d || !Number.isFinite(d.nextCheck) || Date.now() >= d.nextCheck;
    };
    const sectionIsWatching = (wrap: Element | null): boolean =>
      clean(wrap?.querySelector('.section-name')?.textContent) === 'Watching';

    function watchingEntries(): Element[] {
      const out: Element[] = [];
      for (const wrap of document.querySelectorAll('.list-wrap')) {
        if (sectionIsWatching(wrap)) out.push(...Array.from(wrap.querySelectorAll('.list-entries .entry')));
      }
      return out;
    }

    function progressOf(entry: Element): number | null {
      const m =
        entry.querySelector('.progress')?.textContent?.match(/^\s*(\d+)/) ||
        entry.textContent?.match(/(?:^|\s)(\d+)\s*\/\s*(?:\d+|\?)(?:\s|$)/);
      return m ? Number(m[1]) : null;
    }

    function releasingDot(entry: Element): HTMLElement | null {
      const fast = entry.querySelector<HTMLElement>('.release-status.RELEASING');
      if (fast) return fast;
      for (const el of entry.querySelectorAll<HTMLElement>(".release-status, [class*='release-status']")) {
        if (/\bRELEASING\b/i.test(typeof el.className === 'string' ? el.className : '')) return el;
        if (/^releasing$/i.test((el.getAttribute('aria-label') || el.getAttribute('title') || '').trim())) return el;
      }
      return null;
    }

    function updateEntry(entry: Element): string | null {
      if (!entry || !entry.isConnected) return null;
      const dot = releasingDot(entry);
      if (!dot || !sectionIsWatching(entry.closest('.list-wrap'))) return null;
      const id = idOf(entry);
      if (!id) return null;
      const watched = progressOf(entry);
      if (!Number.isFinite(watched)) {
        dot.classList.remove(CLASS);
        return id;
      }

      const opt = optimistic.get(id);
      if (opt) {
        if (Date.now() >= opt.expiresAt || (watched !== null && watched >= opt.target)) optimistic.delete(id);
        else {
          dot.classList.remove(CLASS);
          return id;
        }
      }
      const data = cache[id];
      const behind = !!data && Number.isFinite(data.aired) && watched !== null && watched < (data.aired as number);
      if (dot.classList.contains(CLASS) !== behind) dot.classList.toggle(CLASS, behind);
      return id;
    }

    function scanAll(): void {
      if (!onListPage()) return;
      const stale = new Set<string>();
      for (const entry of watchingEntries()) {
        const id = updateEntry(entry);
        if (id && needsFetch(id)) stale.add(id);
      }
      queueIDs(stale);
    }

    function repaint(ids: Set<string>): void {
      for (const entry of watchingEntries()) {
        const id = idOf(entry);
        if (id && ids.has(id)) updateEntry(entry);
      }
    }

    function makeEntry(media: any): AiringCacheEntry {
      const next = media.nextAiringEpisode;
      const now = Date.now();
      const base = { status: media.status || null, updated: now };
      if (!next || !Number.isFinite(Number(next.episode)))
        return { ...base, aired: null, nextEpisode: null, nextCheck: now + NO_AIRING_TTL };
      const timeUntil = Number(next.timeUntilAiring);
      const airingAt = Number(next.airingAt);
      const nextCheck = Number.isFinite(timeUntil)
        ? now + Math.max(0, timeUntil) * 1000 + AIRING_GRACE
        : Number.isFinite(airingAt)
        ? airingAt * 1000 + AIRING_GRACE
        : now + NO_AIRING_TTL;
      return {
        ...base,
        aired: Math.max(0, Math.floor(Number(next.episode)) - 1),
        nextEpisode: Number(next.episode),
        nextCheck
      };
    }

    function scheduleRefresh(id: string, at: number): void {
      const existing = timers.get(id);
      if (existing) clearTimeout(existing);
      timers.delete(id);
      if (!Number.isFinite(at)) return;
      const t = setTimeout(() => {
        timers.delete(id);
        queueIDs([id]);
        repaint(new Set([id]));
      }, Math.min(Math.max(0, at - Date.now()), 2147483647));
      timers.set(id, t);
    }

    async function updateBatch(ids: string[]): Promise<void> {
      const returned = new Set<string>();
      try {
        const data = await AniList.query(QUERY, { ids: ids.map(Number) });
        for (const m of data?.Page?.media || []) {
          const id = String(m.id);
          returned.add(id);
          cache[id] = makeEntry(m);
          scheduleRefresh(id, cache[id].nextCheck);
        }
      } catch (_) {}

      const retryAt = Date.now() + ERROR_RETRY;
      for (const id of ids) {
        if (returned.has(id)) continue;
        const ex = cache[id];
        if (ex && Number.isFinite(ex.aired)) ex.nextCheck = retryAt;
        else cache[id] = { aired: null, nextEpisode: null, status: null, nextCheck: retryAt, updated: Date.now() };
        scheduleRefresh(id, retryAt);
      }
      cacheStore.save();
      if (returned.size) repaint(returned);
    }

    function queueIDs(ids: Iterable<string>): void {
      for (const raw of ids) {
        const id = String(raw);
        if (!active.has(id)) pending.add(id);
      }
      while (running < CONCURRENCY && pending.size) {
        const batch: string[] = [];
        for (const id of pending) {
          pending.delete(id);
          active.add(id);
          batch.push(id);
          if (batch.length >= BATCH) break;
        }
        running++;
        updateBatch(batch)
          .catch((e) => console.error('[AL-Additions] airing batch', e))
          .finally(() => {
            batch.forEach((id) => active.delete(id));
            running--;
            queueIDs([]);
          });
      }
    }

    const dirty = new Set<Element>();
    let fullScan = false;
    let raf = 0;

    function flush(): void {
      raf = 0;
      if (!onListPage()) {
        dirty.clear();
        fullScan = false;
        return;
      }
      if (fullScan) {
        fullScan = false;
        dirty.clear();
        scanAll();
        return;
      }
      const stale = new Set<string>();
      for (const entry of dirty) {
        const id = updateEntry(entry);
        if (id && needsFetch(id)) stale.add(id);
      }
      dirty.clear();
      queueIDs(stale);
    }

    const mark = (): void => {
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const refresh = debounce(scanAll, 100);

    Core.onBodyMutation((muts) => {
      if (!onListPage()) return;
      for (const m of muts) {
        const t = (m.target.nodeType === 1 ? m.target : m.target.parentElement) as Element | null;
        const own = t?.closest?.('.entry');
        if (own) {
          dirty.add(own);
          mark();
        }
        for (const n of Array.from(m.addedNodes)) {
          if (n.nodeType !== 1) continue;
          const el = n as Element;
          if (el.matches('.entry')) dirty.add(el);
          else {
            el.querySelectorAll('.entry').forEach((e) => dirty.add(e));
            if (el.matches('.list-wrap, .section-name') || el.querySelector('.section-name')) fullScan = true;
          }
          mark();
        }
      }
    });

    Core.onNavigate(() => {
      if (onListPage()) {
        fullScan = true;
        mark();
        refresh();
      }
    });

    const isIncrease = (el: Element | null): boolean => {
      for (let n: Element | null = el, i = 0; i < 4 && n; i++, n = n.parentElement) {
        const label = `${n.getAttribute?.('aria-label') || ''} ${n.getAttribute?.('title') || ''}`
          .trim()
          .toLowerCase();
        if (/increase|increment|add episode|add chapter|next episode|next chapter/.test(label)) return true;
        const text = (n.textContent || '').trim();
        if (text === '+' || text === '+1') return true;
      }
      return false;
    };

    document.addEventListener(
      'pointerdown',
      (e) => {
        if (!(e.target instanceof Element) || !isIncrease(e.target)) return;
        const entry = e.target.closest('.entry');
        const dot = entry && releasingDot(entry);
        if (!dot || !dot.classList.contains(CLASS)) return;
        const id = idOf(entry);
        const data = id && cache[id];
        const watched = progressOf(entry);
        if (
          data &&
          Number.isFinite(data.aired) &&
          Number.isFinite(watched) &&
          watched !== null &&
          watched + 1 >= (data.aired as number)
        ) {
          optimistic.set(id, { target: watched + 1, expiresAt: Date.now() + OPTIMISTIC_TTL });
          dot.classList.remove(CLASS);
        }
      },
      true
    );

    for (const type of ['click', 'input', 'change']) {
      document.addEventListener(
        type,
        (e) => {
          if (e.target instanceof Element && e.target.closest('.entry')) refresh();
        },
        true
      );
    }
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refresh();
    });

    setInterval(scanAll, 60000);
    Core.ready(() => {
      if (onListPage()) {
        scanAll();
        setTimeout(scanAll, 500);
        setTimeout(scanAll, 1500);
      }
    });
  }
);