import { defineFeature } from '../core/registry';
import { Core } from '../core/observer';
import { addStyle } from '../utils/dom';
import { debounce, logDebug, store, esc } from '../utils/helpers';
import { unsafeWindow } from 'vite-plugin-monkey/dist/client';
import { AniList, type MediaListEntryItem } from '../api/anilist';

export interface EntryData {
  el: HTMLElement;
  title: string;
  yourScore: number;
  otherScore: number;
  yourStatus: string;
  otherStatus: string;
}

export const STATUSES = ['Completed', 'Planning', 'Current', 'Paused', 'Dropped'] as const;

export function normalizeStatus(raw: string): string {
  const s = (raw || '').trim().toLowerCase();
  if (s.includes('plan')) return 'Planning';
  if (s.includes('complete')) return 'Completed';
  if (s.includes('current') || s.includes('watch') || s.includes('read') || s.includes('repeat')) return 'Current';
  if (s.includes('pause') || s.includes('hold')) return 'Paused';
  if (s.includes('drop')) return 'Dropped';
  return raw ? raw.trim() : 'Planning';
}

export function getEntryMediaId(el: HTMLElement): number | null {
  const link = el.querySelector<HTMLAnchorElement>('.title a, a.title');
  if (!link) return null;
  const href = link.getAttribute('href') || link.pathname || '';
  const m = href.match(/\/(?:anime|manga)\/(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

export function getEntryData(el: HTMLElement): EntryData {
  const cached = (el as any)._alaCompareData as EntryData | undefined;
  if (cached) return cached;

  const titleLink = el.querySelector<HTMLElement>('.title a, .title');
  const title = (titleLink?.textContent || '').trim();

  const scores = el.querySelectorAll<HTMLElement>('.score');
  const yourScoreEl = el.querySelector<HTMLElement>('.score[label="Score"]') || scores[0];
  const otherScoreEl = Array.from(scores).find((s) => s !== yourScoreEl) || scores[1];

  const yourScoreAttr = yourScoreEl?.getAttribute('score');
  let yourScore = yourScoreAttr
    ? parseFloat(yourScoreAttr)
    : parseFloat(yourScoreEl?.textContent?.replace(/[^\d.]/g, '') || '0');
  if (!Number.isFinite(yourScore)) yourScore = 0;

  const otherScoreAttr = otherScoreEl?.getAttribute('score');
  let otherScore = otherScoreAttr
    ? parseFloat(otherScoreAttr)
    : parseFloat(otherScoreEl?.textContent?.replace(/[^\d.]/g, '') || '0');
  if (!Number.isFinite(otherScore)) otherScore = 0;

  const statuses = el.querySelectorAll<HTMLElement>('.status');
  const yourStatusEl = el.querySelector<HTMLElement>('.status[label="Your Status"]') || statuses[0];
  const otherStatusEl = Array.from(statuses).find((s) => s !== yourStatusEl) || statuses[1];

  const yourStatus = normalizeStatus(yourStatusEl?.textContent || '');
  const otherStatus = normalizeStatus(otherStatusEl?.textContent || '');

  const data: EntryData = { el, title, yourScore, otherScore, yourStatus, otherStatus };
  (el as any)._alaCompareData = data;
  return data;
}

export function compareEntries(
  a: EntryData,
  b: EntryData,
  col: 'title' | 'yourScore' | 'otherScore',
  dir: 'asc' | 'desc'
): number {
  if (col === 'title') {
    const cmp = a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
    return dir === 'asc' ? cmp : -cmp;
  }

  const aVal = col === 'yourScore' ? a.yourScore : a.otherScore;
  const bVal = col === 'yourScore' ? b.yourScore : b.otherScore;

  if (aVal !== bVal) {
    return dir === 'asc' ? aVal - bVal : bVal - aVal;
  }

  return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
}

defineFeature(
  {
    id: 'compareView',
    key: 'compareViewEnabled',
    section: 'AniList Enhancements',
    def: false,
    title: 'Compare View Improvements',
    help: 'Sort lists by title or scores, auto-load complete compare list, and filter by status with responsive mobile dropdown.'
  },
  () => {
    const CSS_ID = 'ala-compare-style';
    const CSS = `
      .content.container.ala-compare-page-container {
        padding-left: 18px !important;
        padding-right: 18px !important;
        max-width: calc(100% - 36px) !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      .ala-compare-wrap {
        display: flex;
        gap: 20px;
        align-items: flex-start;
        width: 100%;
        box-sizing: border-box;
        margin-top: 30px;
      }
      .ala-compare-sidebar {
        flex: 0 0 170px;
        width: 170px;
        box-sizing: border-box;
        position: sticky;
        top: 85px;
        z-index: 10;
      }
      .ala-compare-main {
        flex: 1 1 0%;
        min-width: 0;
      }
      .ala-compare-main .compare {
        margin-top: 0 !important;
      }
      .ala-compare-card {
        background: rgb(var(--color-foreground));
        border-radius: 6px;
        padding: 14px 16px;
        color: rgb(var(--color-text));
        font-size: 1.3rem;
        box-shadow: 0 2px 8px rgba(0,0,0,.15);
        box-sizing: border-box;
      }
      .ala-compare-card-title {
        font-size: 1.35rem;
        font-weight: 600;
        margin-bottom: 12px;
        color: rgb(var(--color-text));
        display: flex;
        align-items: center;
        justify-content: space-between;
        user-select: none;
      }
      .ala-compare-card-title::-webkit-details-marker {
        display: none;
      }
      .ala-compare-arrow-icon {
        display: none;
      }
      .ala-compare-active-badge {
        display: none;
        font-size: 1.15rem;
        font-weight: 400;
        color: rgb(var(--color-text-lighter));
        margin-left: auto;
        margin-right: 8px;
      }
      .ala-compare-status-list {
        display: flex;
        flex-direction: column;
        gap: 9px;
      }
      .ala-compare-status-item {
        display: flex;
        align-items: center;
        gap: 9px;
        cursor: pointer;
        user-select: none;
        transition: color .15s ease;
        font-size: 1.3rem;
      }
      .ala-compare-status-item:hover {
        color: rgb(var(--color-blue));
      }
      .ala-compare-cb {
        accent-color: rgb(var(--color-blue));
        width: 15px;
        height: 15px;
        margin: 0;
        cursor: pointer;
      }
      .ala-compare-cb-label {
        flex: 1 1 auto;
      }
      .ala-compare-count {
        font-size: 1.15rem;
        color: rgb(var(--color-text-lighter));
      }
      .ala-compare-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid rgba(var(--color-text-lighter), .15);
        font-size: 1.2rem;
      }
      .ala-compare-btn-link {
        background: transparent;
        border: 0;
        padding: 0;
        color: rgb(var(--color-text-lighter));
        font: inherit;
        cursor: pointer;
        transition: color .15s ease;
      }
      .ala-compare-btn-link:hover {
        color: rgb(var(--color-blue));
      }
      .ala-compare-dot {
        color: rgb(var(--color-text-lighter));
        opacity: .5;
      }
      .ala-compare-load-indicator {
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid rgba(var(--color-text-lighter), .12);
        font-size: 1.15rem;
        color: rgb(var(--color-text-lighter));
        display: flex;
        align-items: center;
        gap: 7px;
      }
      .ala-compare-spinner {
        width: 12px;
        height: 12px;
        border: 2px solid rgba(var(--color-text-lighter), .25);
        border-top-color: rgb(var(--color-blue));
        border-radius: 50%;
        animation: ala-compare-spin .7s linear infinite;
        flex-shrink: 0;
        display: inline-block;
      }
      @keyframes ala-compare-spin {
        to { transform: rotate(360deg); }
      }
      .ala-compare-empty {
        padding: 40px 20px;
        text-align: center;
        color: rgb(var(--color-text-lighter));
        font-size: 1.4rem;
        background: rgb(var(--color-foreground));
        border-radius: 4px;
        margin-top: 12px;
      }
      .compare .entry {
        display: flex !important;
        align-items: stretch !important;
      }
      .compare .entry.ala-hidden {
        display: none !important;
      }
      .compare .entry > div {
        flex: 1 1 0% !important;
        min-width: 0 !important;
        box-sizing: border-box !important;
      }
      .compare .entry > div.title {
        flex: 3.5 3.5 0% !important;
        min-width: 0 !important;
      }
      .entry.header > div {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .entry.header > div.title {
        justify-content: flex-start;
      }
      @media (max-width: 760px) {
        .entry.header > div.status,
        .entry .status {
          display: none !important;
        }
      }
      .ala-header-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        max-width: 100%;
      }
      .entry.header > div.title .ala-header-wrap {
        justify-content: flex-start;
      }
      .ala-header-label {
        line-height: 1.25;
        text-align: center;
        word-break: break-word;
      }
      .entry.header > div.title .ala-header-label {
        text-align: left;
      }
      .ala-sortable-header {
        cursor: pointer;
        user-select: none;
        transition: background-color .15s ease;
        border-radius: 3px;
      }
      .ala-sortable-header:hover {
        background-color: var(--ala-header-hover-bg, rgba(255, 255, 255, 0.18)) !important;
      }
      .ala-sort-arrow {
        position: absolute;
        left: 100%;
        top: 50%;
        transform: translateY(-50%);
        margin-left: 4px;
        font-size: 11px;
        color: inherit;
        opacity: 0.85;
        user-select: none;
        pointer-events: none;
        white-space: nowrap;
      }

      @media (min-width: 851px) {
        .ala-compare-card-title {
          pointer-events: none;
        }
        .ala-compare-card > .ala-compare-content {
          display: block !important;
        }
      }

      @media (max-width: 850px) {
        .content.container.ala-compare-page-container {
          padding-left: 10px !important;
          padding-right: 10px !important;
          max-width: calc(100% - 20px) !important;
        }
        .ala-compare-wrap {
          flex-direction: column;
          gap: 16px;
          margin-top: 18px;
        }
        .ala-compare-sidebar {
          width: 100%;
          flex: none;
          position: static;
        }
        .ala-compare-card {
          padding: 0;
          overflow: hidden;
        }
        .ala-compare-card-title {
          padding: 12px 14px;
          margin-bottom: 0;
          cursor: pointer;
        }
        .ala-compare-active-badge {
          display: inline-block;
        }
        .ala-compare-arrow-icon {
          display: inline-block;
          font-size: 10px;
          transition: transform .2s ease;
          opacity: .7;
        }
        .ala-compare-card[open] .ala-compare-arrow-icon {
          transform: rotate(180deg);
        }
        .ala-compare-content {
          padding: 10px 14px 14px;
          border-top: 1px solid rgba(var(--color-text-lighter), .12);
        }
        .ala-compare-status-list {
          flex-direction: column;
          gap: 10px;
        }
      }
    `;

    addStyle(CSS_ID, CSS);

    const isComparePage = (): boolean => /\/(animelist|mangalist)\/compare/i.test(location.pathname);

    let activeSortCol: 'title' | 'yourScore' | 'otherScore' = 'otherScore';
    let activeSortDir: 'asc' | 'desc' = 'desc';
    const activeStatuses = new Set<string>(STATUSES);
    let lastProcessedCount = -1;
    let currentRoute = '';
    let isLoadingAll = false;
    let isCompareLoaded = false;
    let loadFailed = false;
    let isMutatingDOM = false;
    let loadAbortState: { abort: boolean } | null = null;
    let resizeCleanup: (() => void) | null = null;
    let indicatorTimer: ReturnType<typeof setTimeout> | null = null;

    function getCompareVue(): any {
      const win = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window) as any;
      const scrollerEl = win.document?.querySelector?.('.scroller') || document.querySelector('.scroller');
      if (scrollerEl && (scrollerEl as any).__vue__?.$parent) {
        return (scrollerEl as any).__vue__.$parent;
      }
      const compareEl = win.document?.querySelector?.('.compare') || document.querySelector('.compare');
      if (compareEl && (compareEl as any).__vue__) {
        return (compareEl as any).__vue__;
      }
      return null;
    }

    const pageWin = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window) as any;
    const setRpcBlock = (fn?: (query: string, vars: any) => boolean): void => {
      pageWin.__ALFL_RPC_BLOCK__ = fn;
    };

    const compareBlocker = (q?: string, vars?: any): boolean =>
      isComparePage() && (/\bcompareWithAuthList\b/i.test(q || '') || Boolean(vars?.compareWithAuthList));

    const installBlocker = () => {
      setRpcBlock(compareBlocker);
    };

    function disableNativeScrollers(listContainer?: HTMLElement): void {
      const root = listContainer?.parentElement || listContainer || document;
      root.querySelectorAll<HTMLElement>('.scroller').forEach((el) => {
        try {
          const v = (el as any).__vue__;
          if (v) {
            if (typeof v.check === 'function') {
              window.removeEventListener('scroll', v.check);
              window.removeEventListener('resize', v.check);
              v._scrollContainer?.removeEventListener?.('scroll', v.check);
              v._scrollContainer?.removeEventListener?.('resize', v.check);
            }
            v.execute = () => {};
            v.handler = () => {};
            if (v.$parent) {
              v.$parent.complete = true;
              v.$parent.loading = false;
            }
            v.$destroy?.();
          }
        } catch {}
        el.remove();
      });
    }

    async function resolveCompareUsers(): Promise<{
      viewerId?: number;
      viewerName?: string;
      otherId?: number;
      otherName?: string;
      type: 'ANIME' | 'MANGA';
    }> {
      const type: 'ANIME' | 'MANGA' = location.pathname.toLowerCase().includes('mangalist') ? 'MANGA' : 'ANIME';
      const win = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window) as any;
      const userMap: Map<string, number> | undefined = win.__ALFL_USER_MAP__;

      let otherName: string | undefined;
      let otherId: number | undefined;

      const urlMatch = location.pathname.match(/\/user\/([^/]+)\/(animelist|mangalist)\/compare/i);
      if (urlMatch) {
        try {
          otherName = decodeURIComponent(urlMatch[1]);
        } catch {
          otherName = urlMatch[1];
        }
      }

      if (!otherName) {
        const queryUser = new URLSearchParams(location.search).get('user');
        if (queryUser) otherName = queryUser;
      }

      const vue = getCompareVue();
      if (vue) {
        if (!otherName) otherName = vue.user?.name || vue.userName || undefined;
        if (!otherId) otherId = Number(vue.user?.id || vue.userId) || undefined;
      }

      if (otherName && !otherId && userMap) {
        otherId = userMap.get(otherName.toLowerCase());
      }

      if (otherName && otherId) {
        if (userMap) userMap.set(otherName.toLowerCase(), otherId);
        if (win.__ALFL_ID_MAP__) win.__ALFL_ID_MAP__.set(otherId, otherName);
      }

      let viewerId = Number(store.get('al_user_id', 0)) || undefined;
      let viewerName = store.get<string | null>('al_username', null) || undefined;

      if (!viewerId || !viewerName) {
        const nuxtUser = win.__NUXT__?.state?.auth?.user || win.__NUXT__?.state?.user;
        if (nuxtUser) {
          if (!viewerId && nuxtUser.id) viewerId = Number(nuxtUser.id);
          if (!viewerName && nuxtUser.name) viewerName = String(nuxtUser.name);
        }
      }

      if (!viewerId || !viewerName) {
        const viewer = await AniList.viewer();
        if (viewer) {
          viewerId = viewer.id;
          viewerName = viewer.name;
        }
      }

      if (!viewerId && viewerName && userMap) {
        viewerId = userMap.get(viewerName.toLowerCase());
      }

      return { viewerId, viewerName, otherId, otherName, type };
    }

    function updateHeaderHoverColor(): void {
      const testEl = document.createElement('div');
      testEl.style.color = 'rgb(var(--color-blue))';
      document.body.appendChild(testEl);
      const computedColor = getComputedStyle(testEl).color;
      testEl.remove();

      const m = computedColor.match(/\d+/g);
      let isLight = false;
      if (m && m.length >= 3) {
        const r = parseInt(m[0], 10);
        const g = parseInt(m[1], 10);
        const b = parseInt(m[2], 10);
        const luminance = (r * 299 + g * 587 + b * 114) / 1000;
        isLight = luminance > 155;
      }
      const hoverBg = isLight ? 'rgba(0, 0, 0, 0.16)' : 'rgba(255, 255, 255, 0.18)';
      document.documentElement.style.setProperty('--ala-header-hover-bg', hoverBg);
    }

    function cleanHeaderText(raw: string): string {
      return raw.replace(/[▲▼]/g, '').trim();
    }

    function renderHeaderContent(
      el: HTMLElement,
      baseText: string,
      isActive: boolean,
      activeDir: 'asc' | 'desc'
    ): void {
      const clean = cleanHeaderText(baseText);
      let wrap = el.querySelector<HTMLElement>('.ala-header-wrap');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'ala-header-wrap';
        el.innerHTML = '';
        el.appendChild(wrap);
      }

      let label = wrap.querySelector<HTMLElement>('.ala-header-label');
      if (!label) {
        label = document.createElement('span');
        label.className = 'ala-header-label';
        wrap.appendChild(label);
      }
      label.textContent = clean;

      let arrow = wrap.querySelector<HTMLElement>('.ala-sort-arrow');
      if (isActive) {
        if (!arrow) {
          arrow = document.createElement('span');
          arrow.className = 'ala-sort-arrow';
          wrap.appendChild(arrow);
        }
        arrow.textContent = activeDir === 'asc' ? '▲' : '▼';
      } else {
        arrow?.remove();
      }
    }

    function updateSortArrows(
      titleEl: HTMLElement | null,
      yourScoreEl: HTMLElement | null,
      otherScoreEl: HTMLElement | null,
      activeCol: 'title' | 'yourScore' | 'otherScore',
      activeDir: 'asc' | 'desc'
    ): void {
      updateHeaderHoverColor();

      const items: [HTMLElement | null, 'title' | 'yourScore' | 'otherScore'][] = [
        [titleEl, 'title'],
        [yourScoreEl, 'yourScore'],
        [otherScoreEl, 'otherScore']
      ];

      for (const [el, col] of items) {
        if (!el) continue;
        el.classList.add('ala-sortable-header');
        if (!(el as any)._alaBaseText) {
          (el as any)._alaBaseText = cleanHeaderText(el.textContent || '');
        }
        const baseText = (el as any)._alaBaseText;
        renderHeaderContent(el, baseText, col === activeCol, activeDir);
      }
    }

    function applyFilter(listContainer: HTMLElement, entries: HTMLElement[]): void {
      let visibleCount = 0;
      for (const el of entries) {
        const d = getEntryData(el);
        const show = activeStatuses.has(d.yourStatus) && activeStatuses.has(d.otherStatus);

        el.classList.toggle('ala-hidden', !show);
        el.style.display = '';

        if (show) visibleCount++;
      }

      let emptyEl = listContainer.querySelector<HTMLElement>('.ala-compare-empty');
      if (visibleCount === 0 && entries.length > 0) {
        if (!emptyEl) {
          emptyEl = document.createElement('div');
          emptyEl.className = 'ala-compare-empty';
          emptyEl.textContent = 'No entries match the selected status filters.';
          listContainer.appendChild(emptyEl);
        }
        emptyEl.style.display = '';
      } else if (emptyEl) {
        emptyEl.style.display = 'none';
      }
    }

    function applySort(
      listContainer: HTMLElement,
      entries: HTMLElement[],
      col: 'title' | 'yourScore' | 'otherScore',
      dir: 'asc' | 'desc'
    ): void {
      if (entries.length > 0) {
        listContainer.querySelector('.no-results')?.remove();
      }

      entries.sort((a, b) => {
        const dataA = getEntryData(a);
        const dataB = getEntryData(b);
        return compareEntries(dataA, dataB, col, dir);
      });

      const frag = document.createDocumentFragment();
      for (const el of entries) {
        frag.appendChild(el);
      }

      isMutatingDOM = true;
      listContainer.appendChild(frag);

      const emptyEl = listContainer.querySelector('.ala-compare-empty');
      if (emptyEl) listContainer.appendChild(emptyEl);
      isMutatingDOM = false;
    }

    function updateStatusCounts(sidebar: HTMLElement, entries: HTMLElement[]): void {
      const counts: Record<string, number> = {
        Completed: 0,
        Planning: 0,
        Current: 0,
        Paused: 0,
        Dropped: 0
      };
      for (const el of entries) {
        const d = getEntryData(el);
        const counted = new Set([d.yourStatus, d.otherStatus]);
        for (const s of counted) {
          if (s in counts) counts[s]++;
        }
      }

      sidebar.querySelectorAll<HTMLElement>('.ala-compare-count').forEach((span) => {
        const status = span.dataset.status;
        if (status && status in counts) {
          span.textContent = String(counts[status]);
        }
      });

      const badge = sidebar.querySelector<HTMLElement>('.ala-compare-active-badge');
      if (badge) {
        badge.textContent = `${activeStatuses.size}/${STATUSES.length}`;
      }
    }

    function setLoadIndicator(sidebar: HTMLElement, text: string | null): void {
      if (indicatorTimer) {
        clearTimeout(indicatorTimer);
        indicatorTimer = null;
      }
      let indicator = sidebar.querySelector<HTMLElement>('#ala-compare-load-indicator');
      if (!text) {
        indicator?.remove();
        return;
      }
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'ala-compare-load-indicator';
        indicator.className = 'ala-compare-load-indicator';
        indicator.innerHTML = `
          <span class="ala-compare-spinner"></span>
          <span class="ala-compare-load-text"></span>
        `;
        const content = sidebar.querySelector('.ala-compare-content') || sidebar.querySelector('.ala-compare-card');
        content?.appendChild(indicator);
      }
      indicator.style.display = 'flex';
      const textEl = indicator.querySelector<HTMLElement>('.ala-compare-load-text');
      if (textEl) textEl.textContent = text;
    }

    function getActiveCompareContainer(fallback?: HTMLElement): HTMLElement | null {
      return document.getElementById('ala-compare-table') || fallback || document.querySelector('.ala-compare-main .compare') || null;
    }

    function triggerFilterUpdate(sidebar: HTMLElement, fallback?: HTMLElement): void {
      const badge = sidebar.querySelector<HTMLElement>('.ala-compare-active-badge');
      if (badge) badge.textContent = `${activeStatuses.size}/${STATUSES.length}`;
      const target = getActiveCompareContainer(fallback);
      if (!target) return;
      const currentEntries = Array.from(target.querySelectorAll<HTMLElement>('.entry:not(.header)'));
      applyFilter(target, currentEntries);
    }

    function triggerSort(col: 'title' | 'yourScore' | 'otherScore', fallback?: HTMLElement): void {
      if (activeSortCol === col) {
        activeSortDir = activeSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        activeSortCol = col;
        activeSortDir = col === 'title' ? 'asc' : 'desc';
      }
      const target = getActiveCompareContainer(fallback);
      if (!target) return;
      const currentHeader = target.querySelector<HTMLElement>('.entry.header');
      if (currentHeader) {
        const titleH = currentHeader.querySelector<HTMLElement>('.title');
        const scores = currentHeader.querySelectorAll<HTMLElement>('.score');
        updateSortArrows(titleH, scores[0] || null, scores[1] || null, activeSortCol, activeSortDir);
      }
      const currentEntries = Array.from(target.querySelectorAll<HTMLElement>('.entry:not(.header)'));
      applySort(target, currentEntries, activeSortCol, activeSortDir);
    }

    async function loadAllEntriesViaMediaList(
      compareRoot: HTMLElement,
      sidebar: HTMLElement
    ): Promise<void> {
      if (isLoadingAll || isCompareLoaded || loadFailed) return;
      isLoadingAll = true;
      const abortState = { abort: false };
      loadAbortState = abortState;

      indicatorTimer = setTimeout(() => {
        if (!abortState.abort && isComparePage()) {
          setLoadIndicator(sidebar, 'Loading full compare list...');
        }
      }, 250);

      try {
        const { viewerId, viewerName, otherId, otherName, type } = await resolveCompareUsers();
        if (abortState.abort || !isComparePage()) return;

        const viewerTarget = viewerId || viewerName;
        const otherTarget = otherId || otherName;

        if (!viewerTarget || !otherTarget) {
          logDebug('[COMPARE] Missing viewer or other user for getMediaList, keeping fallback');
          loadFailed = true;
          return;
        }

        const [myListRes, otherListRes] = await Promise.all([
          AniList.getMediaList(viewerTarget, type, {
            userId: viewerId,
            userName: viewerId ? undefined : viewerName
          }),
          AniList.getMediaList(otherTarget, type, {
            userId: otherId,
            userName: otherId ? undefined : otherName
          })
        ]);

        if (abortState.abort || !isComparePage()) return;

        const myMap = new Map<number, MediaListEntryItem>();
        for (const entry of myListRes.allEntries) {
          myMap.set(entry.mediaId, entry);
        }

        const displayOtherName = otherListRes.user?.name || otherName || 'User';
        const safeOtherName = esc(displayOtherName);
        const scopeAttr = Array.from(compareRoot.attributes)
          .map((a) => a.name)
          .find((n) => /^data-v-[a-f0-9]+$/i.test(n));

        const seenMediaIds = new Set<number>();
        const matchedNodes: HTMLElement[] = [];
        for (const otherEntry of otherListRes.allEntries) {
          const mediaId = otherEntry.mediaId;
          if (seenMediaIds.has(mediaId)) continue;
          const myEntry = myMap.get(mediaId);
          if (!myEntry) continue;
          seenMediaIds.add(mediaId);

          const title =
            otherEntry.media?.title?.userPreferred ||
            otherEntry.media?.title?.romaji ||
            otherEntry.media?.title?.english ||
            myEntry.media?.title?.userPreferred ||
            'Unknown';

          const yourScore = myEntry.score || 0;
          const otherScore = otherEntry.score || 0;
          const yourStatus = normalizeStatus(myEntry.status);
          const otherStatus = normalizeStatus(otherEntry.status);

          const row = document.createElement('div');
          row.className = 'entry';
          if (scopeAttr) row.setAttribute(scopeAttr, '');
          row.innerHTML = `
            <div class="title"${scopeAttr ? ` ${scopeAttr}=""` : ''}>
              <a href="/${type.toLowerCase()}/${mediaId}/" class=""${scopeAttr ? ` ${scopeAttr}=""` : ''}></a>
            </div>
            <div class="score" label="Score" score="${yourScore}"${scopeAttr ? ` ${scopeAttr}=""` : ''}><span>${yourScore > 0 ? yourScore : '0'}</span></div>
            <div class="score" label="${safeOtherName}'s Score" score="${otherScore}"${scopeAttr ? ` ${scopeAttr}=""` : ''}><span>${otherScore > 0 ? otherScore : '0'}</span></div>
            <div class="status" label="Your Status"${scopeAttr ? ` ${scopeAttr}=""` : ''}><span>${yourStatus}</span></div>
            <div class="status" label="${safeOtherName}'s Status"${scopeAttr ? ` ${scopeAttr}=""` : ''}><span>${otherStatus}</span></div>
          `;

          const link = row.querySelector<HTMLAnchorElement>('.title a');
          if (link) link.textContent = title;

          const data: EntryData = {
            el: row,
            title,
            yourScore,
            otherScore,
            yourStatus,
            otherStatus
          };
          (row as any)._alaCompareData = data;
          matchedNodes.push(row);
        }

        logDebug('[COMPARE] Matched entries via MediaListCollection:', matchedNodes.length);

        const main = compareRoot.parentElement || document.querySelector('.ala-compare-main');
        if (!main) return;

        let customTable = main.querySelector<HTMLElement>('#ala-compare-table');
        if (!customTable) {
          customTable = document.createElement('div');
          customTable.id = 'ala-compare-table';
          customTable.className = 'compare';
          if (scopeAttr) customTable.setAttribute(scopeAttr, '');
          main.appendChild(customTable);
        }

        let customHeader = customTable.querySelector<HTMLElement>('.entry.header');
        if (!customHeader) {
          customHeader = document.createElement('div');
          customHeader.className = 'entry header';
          if (scopeAttr) customHeader.setAttribute(scopeAttr, '');
          customHeader.innerHTML = `
            <div class="title ala-sortable-header"${scopeAttr ? ` ${scopeAttr}=""` : ''}>
              <div class="ala-header-wrap"><span class="ala-header-label">Title</span></div>
            </div>
            <div class="score ala-sortable-header"${scopeAttr ? ` ${scopeAttr}=""` : ''}>
              <div class="ala-header-wrap"><span class="ala-header-label">Your Score</span></div>
            </div>
            <div class="score ala-sortable-header"${scopeAttr ? ` ${scopeAttr}=""` : ''}>
              <div class="ala-header-wrap"><span class="ala-header-label">${safeOtherName}'s Score</span></div>
            </div>
            <div class="status"${scopeAttr ? ` ${scopeAttr}=""` : ''}>
              <span class="ala-header-label">Your Status</span>
            </div>
            <div class="status"${scopeAttr ? ` ${scopeAttr}=""` : ''}>
              <span class="ala-header-label">${safeOtherName}'s Status</span>
            </div>
          `;
          customTable.appendChild(customHeader);

          const titleH = customHeader.querySelector<HTMLElement>('.title');
          const scores = customHeader.querySelectorAll<HTMLElement>('.score');
          titleH?.addEventListener('click', () => triggerSort('title', compareRoot));
          scores[0]?.addEventListener('click', () => triggerSort('yourScore', compareRoot));
          scores[1]?.addEventListener('click', () => triggerSort('otherScore', compareRoot));
        }

        const titleH = customHeader.querySelector<HTMLElement>('.title');
        const scores = customHeader.querySelectorAll<HTMLElement>('.score');
        updateSortArrows(titleH, scores[0] || null, scores[1] || null, activeSortCol, activeSortDir);

        matchedNodes.sort((a, b) => {
          const dataA = getEntryData(a);
          const dataB = getEntryData(b);
          return compareEntries(dataA, dataB, activeSortCol, activeSortDir);
        });

        isMutatingDOM = true;
        customTable.querySelectorAll('.entry:not(.header)').forEach((el) => el.remove());

        const frag = document.createDocumentFragment();
        for (const el of matchedNodes) {
          frag.appendChild(el);
        }
        customTable.appendChild(frag);

        if (matchedNodes.length === 0) {
          let empty = customTable.querySelector<HTMLElement>('.no-results');
          if (!empty) {
            empty = document.createElement('div');
            empty.className = 'no-results';
            empty.textContent = `You don't have any ${type.toLowerCase()} in common ｡ﾟヽ(ﾟ´Д｀)ﾉﾟ｡`;
            customTable.appendChild(empty);
          }
          customHeader.style.display = 'none';
        } else {
          customTable.querySelector('.no-results')?.remove();
          customHeader.style.display = '';
        }

        const emptyEl = customTable.querySelector('.ala-compare-empty');
        if (emptyEl) customTable.appendChild(emptyEl);
        isMutatingDOM = false;

        compareRoot.style.display = 'none';
        disableNativeScrollers(compareRoot);

        lastProcessedCount = matchedNodes.length;
        isCompareLoaded = true;

        installBlocker();

        updateStatusCounts(sidebar, matchedNodes);
        applyFilter(customTable, matchedNodes);
      } catch (err) {
        loadFailed = true;
        setRpcBlock();
        console.error('[AL-Additions] CompareView getMediaList error:', err);
      } finally {
        isLoadingAll = false;
        loadAbortState = null;
        setLoadIndicator(sidebar, null);
      }
    }

    function cleanup(): void {
      if (!isComparePage()) {
        setRpcBlock();
      } else {
        installBlocker();
      }
      if (indicatorTimer) {
        clearTimeout(indicatorTimer);
        indicatorTimer = null;
      }
      if (loadAbortState) {
        loadAbortState.abort = true;
        loadAbortState = null;
      }
      isLoadingAll = false;
      isCompareLoaded = false;
      loadFailed = false;
      isMutatingDOM = false;
      if (resizeCleanup) {
        resizeCleanup();
        resizeCleanup = null;
      }

      const customTable = document.getElementById('ala-compare-table');
      if (customTable) customTable.remove();

      const wrap = document.getElementById('ala-compare-wrap');
      if (wrap) {
        const main = wrap.querySelector('.ala-compare-main');
        const compareRoot = main?.querySelector<HTMLElement>('.compare:not(#ala-compare-table)') || main?.firstElementChild;
        if (compareRoot && wrap.parentElement) {
          if ((compareRoot as HTMLElement).style) {
            (compareRoot as HTMLElement).style.display = '';
          }
          wrap.parentElement.insertBefore(compareRoot, wrap);
        }
        wrap.remove();
      } else {
        const compareRoot = document.querySelector<HTMLElement>('.compare:not(#ala-compare-table)');
        if (compareRoot) {
          delete compareRoot.dataset.alaCompareInit;
          compareRoot.style.display = '';
        }
      }

      document.querySelectorAll('.ala-compare-page-container').forEach((el) => {
        el.classList.remove('ala-compare-page-container');
      });

      document.querySelectorAll('.compare .entry.ala-hidden').forEach((el) => {
        el.classList.remove('ala-hidden');
      });

      const header = document.querySelector<HTMLElement>('.compare:not(#ala-compare-table) .entry.header, .entry.header');
      if (header) {
        delete (header as any)._alaHeaderBound;
        delete header.dataset.alaCompareInit;
        header.querySelectorAll('.ala-sortable-header').forEach((el) => {
          el.classList.remove('ala-sortable-header');
          const baseText = (el as any)._alaBaseText;
          if (baseText) el.textContent = cleanHeaderText(baseText);
          delete (el as any)._alaBaseText;
        });
        header.querySelectorAll('.status').forEach((el) => {
          const label = el.querySelector('.ala-header-label');
          if (label) el.textContent = label.textContent || '';
        });
      }

      lastProcessedCount = -1;
    }

    function setupCompareView(compareRoot: HTMLElement, header: HTMLElement | null, entries: HTMLElement[]): void {
      if (header) {
        header.querySelectorAll<HTMLElement>('.status').forEach((statusEl) => {
          if (!statusEl.querySelector('.ala-header-label')) {
            const text = statusEl.textContent?.trim() || '';
            statusEl.innerHTML = `<span class="ala-header-label">${text}</span>`;
          }
        });
      }

      const headerCells = header ? (Array.from(header.children) as HTMLElement[]) : [];
      const titleHeader =
        headerCells.length >= 3
          ? header!.querySelector<HTMLElement>('.title') ||
            headerCells.find((el) => /title/i.test(el.textContent || '')) ||
            headerCells[0]
          : null;
      const yourScoreHeader =
        headerCells.length >= 3
          ? headerCells.find((el) => /your score/i.test(el.textContent || '')) ||
            header!.querySelector<HTMLElement>('.score:first-of-type') ||
            headerCells[1]
          : null;
      const otherScoreHeader =
        headerCells.length >= 3
          ? headerCells.find((el) => el !== yourScoreHeader && /score/i.test(el.textContent || '')) ||
            header!.querySelectorAll<HTMLElement>('.score')[1] ||
            headerCells[2]
          : null;

      const container = compareRoot.closest<HTMLElement>('.content.container') || compareRoot.parentElement;
      if (container) {
        container.classList.add('ala-compare-page-container');
      }

      let wrap = document.getElementById('ala-compare-wrap');
      let sidebar = document.getElementById('ala-compare-sidebar');
      if (!wrap || !wrap.contains(compareRoot)) {
        wrap?.remove();
        wrap = document.createElement('div');
        wrap.id = 'ala-compare-wrap';
        wrap.className = 'ala-compare-wrap';

        sidebar = document.createElement('aside');
        sidebar.id = 'ala-compare-sidebar';
        sidebar.className = 'ala-compare-sidebar';

        const main = document.createElement('div');
        main.className = 'ala-compare-main';

        compareRoot.parentElement?.insertBefore(wrap, compareRoot);
        wrap.appendChild(sidebar);
        wrap.appendChild(main);
        main.appendChild(compareRoot);
      }

      if (sidebar && !sidebar.querySelector('.ala-compare-card')) {
        const isMobileScreen = window.innerWidth <= 850;
        sidebar.innerHTML = `
          <details class="ala-compare-card" ${isMobileScreen ? '' : 'open'}>
            <summary class="ala-compare-card-title">
              <span>Status Filter</span>
              <span class="ala-compare-active-badge">${activeStatuses.size}/${STATUSES.length}</span>
              <span class="ala-compare-arrow-icon">▼</span>
            </summary>
            <div class="ala-compare-content">
              <div class="ala-compare-status-list">
                ${STATUSES.map(
                  (s) => `
                  <label class="ala-compare-status-item">
                    <input type="checkbox" class="ala-compare-cb" data-status="${s}" ${activeStatuses.has(s) ? 'checked' : ''}>
                    <span class="ala-compare-cb-label">${s}</span>
                    <span class="ala-compare-count" data-status="${s}">0</span>
                  </label>`
                ).join('')}
              </div>
              <div class="ala-compare-actions">
                <button type="button" class="ala-compare-btn-link" id="ala-compare-all">Select all</button>
                <span class="ala-compare-dot">·</span>
                <button type="button" class="ala-compare-btn-link" id="ala-compare-none">Clear all</button>
              </div>
            </div>
          </details>
        `;

        const details = sidebar.querySelector<HTMLDetailsElement>('.ala-compare-card');
        sidebar.querySelector('.ala-compare-card-title')?.addEventListener('click', (e) => {
          if (window.innerWidth > 850) {
            e.preventDefault();
            if (details) details.open = true;
          }
        });

        if (resizeCleanup) {
          resizeCleanup();
        }
        let isDesktop = window.innerWidth > 850;
        const syncDetailsOpen = () => {
          if (!details) return;
          const nowDesktop = window.innerWidth > 850;
          if (nowDesktop !== isDesktop) {
            details.open = nowDesktop;
            isDesktop = nowDesktop;
          }
        };
        window.addEventListener('resize', syncDetailsOpen);
        resizeCleanup = () => {
          window.removeEventListener('resize', syncDetailsOpen);
        };

        sidebar.querySelectorAll<HTMLInputElement>('.ala-compare-cb').forEach((cb) => {
          cb.addEventListener('change', () => {
            const st = cb.dataset.status!;
            if (cb.checked) activeStatuses.add(st);
            else activeStatuses.delete(st);
            triggerFilterUpdate(sidebar!, compareRoot);
          });
        });

        sidebar.querySelector('#ala-compare-all')?.addEventListener('click', () => {
          for (const s of STATUSES) activeStatuses.add(s);
          sidebar?.querySelectorAll<HTMLInputElement>('.ala-compare-cb').forEach((cb) => (cb.checked = true));
          triggerFilterUpdate(sidebar!, compareRoot);
        });

        sidebar.querySelector('#ala-compare-none')?.addEventListener('click', () => {
          activeStatuses.clear();
          sidebar?.querySelectorAll<HTMLInputElement>('.ala-compare-cb').forEach((cb) => (cb.checked = false));
          triggerFilterUpdate(sidebar!, compareRoot);
        });
      }

      if (sidebar && entries.length > 0) {
        updateStatusCounts(sidebar, entries);
      }

      if (header && titleHeader && yourScoreHeader && otherScoreHeader && !(header as any)._alaHeaderBound) {
        (header as any)._alaHeaderBound = true;

        const attachSortClick = (el: HTMLElement | null, col: 'title' | 'yourScore' | 'otherScore') => {
          if (!el) return;
          el.addEventListener('click', () => {
            triggerSort(col, compareRoot);
          });
        };

        attachSortClick(titleHeader, 'title');
        attachSortClick(yourScoreHeader, 'yourScore');
        attachSortClick(otherScoreHeader, 'otherScore');
      }

      if (header && titleHeader) {
        header.dataset.alaCompareInit = 'true';
        updateSortArrows(titleHeader, yourScoreHeader, otherScoreHeader, activeSortCol, activeSortDir);
      }
      compareRoot.dataset.alaCompareInit = 'true';

      entries.forEach((el) => {
        el.querySelectorAll<HTMLElement>('.score').forEach((scoreEl) => {
          const text = scoreEl.textContent?.trim();
          if (!text || text === '') {
            scoreEl.textContent = '0';
          }
        });
      });

      disableNativeScrollers(compareRoot);

      if (entries.length > 0) {
        applyFilter(compareRoot, entries);
        applySort(compareRoot, entries, activeSortCol, activeSortDir);
      }

      installBlocker();

      if (!isLoadingAll && !isCompareLoaded && !loadFailed && sidebar) {
        loadAllEntriesViaMediaList(compareRoot, sidebar);
      }
    }

    const checkView = debounce(() => {
      if (isMutatingDOM) return;
      const path = location.pathname;
      if (!isComparePage()) {
        if (currentRoute) {
          cleanup();
          currentRoute = '';
        }
        return;
      }

      if (path !== currentRoute) {
        currentRoute = path;
        activeSortCol = 'otherScore';
        activeSortDir = 'desc';
        for (const s of STATUSES) activeStatuses.add(s);
        cleanup();
        installBlocker();
      }

      if (isCompareLoaded) return;

      const compareRoot = document.querySelector<HTMLElement>('.compare:not(#ala-compare-table)');
      if (!compareRoot) return;

      const header = compareRoot.querySelector<HTMLElement>('.entry.header');
      const entries = Array.from(compareRoot.querySelectorAll<HTMLElement>('.entry:not(.header)'));

      if (!compareRoot.dataset.alaCompareInit || (!isCompareLoaded && entries.length !== lastProcessedCount)) {
        lastProcessedCount = entries.length;
        setupCompareView(compareRoot, header, entries);
      }
    }, 60);

    installBlocker();
    Core.ready(checkView);
    Core.onNavigate(() => {
      installBlocker();
      checkView();
    });
    Core.onBodyMutation(() => {
      if (isComparePage() && !isMutatingDOM) {
        installBlocker();
        checkView();
      }
    });
  }
);