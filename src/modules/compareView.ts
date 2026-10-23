import { defineFeature } from '../core/registry';
import { Core } from '../core/observer';
import { addStyle } from '../utils/dom';
import { debounce, logDebug } from '../utils/helpers';
import { unsafeWindow } from 'vite-plugin-monkey/dist/client';

interface EntryData {
  el: HTMLElement;
  title: string;
  yourScore: number;
  otherScore: number;
  yourStatus: string;
  otherStatus: string;
}

const STATUSES = ['Completed', 'Planning', 'Current', 'Paused', 'Dropped'] as const;

function normalizeStatus(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s.includes('plan')) return 'Planning';
  if (s.includes('complete')) return 'Completed';
  if (s.includes('current') || s.includes('watch') || s.includes('read') || s.includes('repeat')) return 'Current';
  if (s.includes('pause') || s.includes('hold')) return 'Paused';
  if (s.includes('drop')) return 'Dropped';
  return raw.trim();
}

function getEntryData(el: HTMLElement): EntryData {
  const cached = (el as any)._alaCompareData as EntryData | undefined;
  if (cached) return cached;

  const titleLink = el.querySelector<HTMLElement>('.title a, .title');
  const title = (titleLink?.textContent || '').trim();

  const scores = el.querySelectorAll<HTMLElement>('.score');
  const yourScoreEl = el.querySelector<HTMLElement>('.score[label="Score"]') || scores[0];
  const otherScoreEl = el.querySelector<HTMLElement>('.score:not([label="Score"])') || scores[1];

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
  const otherStatusEl = el.querySelector<HTMLElement>('.status:not([label="Your Status"])') || statuses[1];

  const yourStatus = normalizeStatus(yourStatusEl?.textContent || '');
  const otherStatus = normalizeStatus(otherStatusEl?.textContent || '');

  const data: EntryData = { el, title, yourScore, otherScore, yourStatus, otherStatus };
  (el as any)._alaCompareData = data;
  return data;
}

function compareEntries(
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
    let loadAbortState: { abort: boolean } | null = null;
    let resizeCleanup: (() => void) | null = null;

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
        el.style.display = show ? '' : 'none';
        if (show) visibleCount++;
      }
      logDebug('[COMPARE]', 'Filter applied:', { activeStatuses: [...activeStatuses], visibleCount, total: entries.length });

      let emptyEl = listContainer.querySelector<HTMLElement>('.ala-compare-empty');
      if (visibleCount === 0) {
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
      entries.sort((a, b) => {
        const dataA = getEntryData(a);
        const dataB = getEntryData(b);
        return compareEntries(dataA, dataB, col, dir);
      });

      for (const el of entries) {
        listContainer.appendChild(el);
      }

      const emptyEl = listContainer.querySelector('.ala-compare-empty');
      if (emptyEl) listContainer.appendChild(emptyEl);

      const scroller = listContainer.querySelector('.scroller');
      if (scroller) listContainer.appendChild(scroller);
      logDebug('[COMPARE]', 'Sort applied:', { col, dir, totalEntries: entries.length });
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
      let indicator = sidebar.querySelector<HTMLElement>('#ala-compare-load-indicator');
      if (!text) {
        if (indicator) indicator.style.display = 'none';
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

    async function autoLoadAllEntries(
      listContainer: HTMLElement,
      sidebar: HTMLElement
    ): Promise<void> {
      if (isLoadingAll) return;
      isLoadingAll = true;
      const abortState = { abort: false };
      loadAbortState = abortState;

      try {
        let iterations = 0;
        const MAX_PAGES = 60; // Up to ~1800 entries safety cap

        while (!abortState.abort && isComparePage() && iterations < MAX_PAGES) {
          iterations++;

          const scrollerEl = document.querySelector<HTMLElement>('.scroller');
          const vue = getCompareVue();

          if (vue) {
            const currentEntries = listContainer.querySelectorAll('.entry:not(.header)').length;

            if (currentEntries > 0) {
              setLoadIndicator(sidebar, `Loading all entries (${currentEntries})...`);
            } else if (scrollerEl) {
              setLoadIndicator(sidebar, 'Loading all entries...');
            }

            if (vue.hasNextPage === false || vue.complete) {
              break;
            }

            if (vue.loading) {
              await new Promise((r) => setTimeout(r, 100));
              continue;
            }

            try {
              if (typeof vue.scrollHandler === 'function') {
                await vue.scrollHandler();
              } else if (typeof (scrollerEl as any)?.__vue__?.handler === 'function') {
                await (scrollerEl as any).__vue__.handler();
              }
            } catch (_) {}

            await new Promise((r) => setTimeout(r, 140));
          } else if (scrollerEl) {
            const currentEntries = listContainer.querySelectorAll('.entry:not(.header)').length;
            if (currentEntries > 0) {
              setLoadIndicator(sidebar, `Loading all entries (${currentEntries})...`);
            } else {
              setLoadIndicator(sidebar, 'Loading all entries...');
            }
            const prevCount = currentEntries;
            scrollerEl.scrollIntoView({ behavior: 'auto', block: 'end' });
            window.dispatchEvent(new Event('scroll'));
            await new Promise((r) => setTimeout(r, 300));
            const newCount = listContainer.querySelectorAll('.entry:not(.header)').length;
            if (newCount === prevCount) {
              await new Promise((r) => setTimeout(r, 400));
              if (listContainer.querySelectorAll('.entry:not(.header)').length === prevCount) {
                break;
              }
            }
          } else {
            break;
          }
        }
      } finally {
        isLoadingAll = false;
        loadAbortState = null;
        setLoadIndicator(sidebar, null);

        if (isComparePage()) {
          const finalEntries = Array.from(listContainer.querySelectorAll<HTMLElement>('.entry:not(.header)'));
          if (finalEntries.length > 0) {
            updateStatusCounts(sidebar, finalEntries);
            applyFilter(listContainer, finalEntries);
            applySort(listContainer, finalEntries, activeSortCol, activeSortDir);
          }
        }
      }
    }

    function cleanup(): void {
      if (loadAbortState) {
        loadAbortState.abort = true;
        loadAbortState = null;
      }
      isLoadingAll = false;
      if (resizeCleanup) {
        resizeCleanup();
        resizeCleanup = null;
      }

      const wrap = document.getElementById('ala-compare-wrap');
      if (wrap) {
        const main = wrap.querySelector('.ala-compare-main');
        const compareRoot = main?.firstElementChild;
        if (compareRoot && wrap.parentElement) {
          wrap.parentElement.insertBefore(compareRoot, wrap);
        }
        wrap.remove();
      }

      document.querySelectorAll('.ala-compare-page-container').forEach((el) => {
        el.classList.remove('ala-compare-page-container');
      });

      const header = document.querySelector<HTMLElement>('.entry.header');
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

    function setupCompareView(header: HTMLElement, listContainer: HTMLElement, entries: HTMLElement[]): void {
      logDebug('[COMPARE]', 'Setting up Compare View UI with', entries.length, 'entries');
      header.querySelectorAll<HTMLElement>('.status').forEach((statusEl) => {
        if (!statusEl.querySelector('.ala-header-label')) {
          const text = statusEl.textContent?.trim() || '';
          statusEl.innerHTML = `<span class="ala-header-label">${text}</span>`;
        }
      });

      const headerCells = Array.from(header.children) as HTMLElement[];
      if (headerCells.length < 3) return;

      const titleHeader =
        header.querySelector<HTMLElement>('.title') ||
        headerCells.find((el) => /title/i.test(el.textContent || '')) ||
        headerCells[0];
      const yourScoreHeader =
        headerCells.find((el) => /your score/i.test(el.textContent || '')) ||
        header.querySelector<HTMLElement>('.score:first-of-type') ||
        headerCells[1];
      const otherScoreHeader =
        headerCells.find((el) => el !== yourScoreHeader && /score/i.test(el.textContent || '')) ||
        header.querySelectorAll<HTMLElement>('.score')[1] ||
        headerCells[2];

      const compareRoot = header.closest<HTMLElement>('.compare') || listContainer;

      // Ensure container has compare page styling
      const container = compareRoot.closest<HTMLElement>('.content.container') || compareRoot.parentElement;
      if (container) {
        container.classList.add('ala-compare-page-container');
      }

      // Wrap compare table with sidebar if not already wrapped
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

      // Initialize sidebar card once
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
            const badge = sidebar?.querySelector<HTMLElement>('.ala-compare-active-badge');
            if (badge) badge.textContent = `${activeStatuses.size}/${STATUSES.length}`;
            const currentEntries = Array.from(listContainer.querySelectorAll<HTMLElement>('.entry:not(.header)'));
            applyFilter(listContainer, currentEntries);
          });
        });

        sidebar.querySelector('#ala-compare-all')?.addEventListener('click', () => {
          for (const s of STATUSES) activeStatuses.add(s);
          sidebar?.querySelectorAll<HTMLInputElement>('.ala-compare-cb').forEach((cb) => (cb.checked = true));
          const badge = sidebar?.querySelector<HTMLElement>('.ala-compare-active-badge');
          if (badge) badge.textContent = `${activeStatuses.size}/${STATUSES.length}`;
          const currentEntries = Array.from(listContainer.querySelectorAll<HTMLElement>('.entry:not(.header)'));
          applyFilter(listContainer, currentEntries);
        });

        sidebar.querySelector('#ala-compare-none')?.addEventListener('click', () => {
          activeStatuses.clear();
          sidebar?.querySelectorAll<HTMLInputElement>('.ala-compare-cb').forEach((cb) => (cb.checked = false));
          const badge = sidebar?.querySelector<HTMLElement>('.ala-compare-active-badge');
          if (badge) badge.textContent = `${activeStatuses.size}/${STATUSES.length}`;
          const currentEntries = Array.from(listContainer.querySelectorAll<HTMLElement>('.entry:not(.header)'));
          applyFilter(listContainer, currentEntries);
        });
      }

      if (sidebar) {
        updateStatusCounts(sidebar, entries);
      }

      // Initialize sort header bindings once
      if (!(header as any)._alaHeaderBound) {
        (header as any)._alaHeaderBound = true;

        const attachSortClick = (el: HTMLElement | null, col: 'title' | 'yourScore' | 'otherScore') => {
          if (!el) return;
          el.addEventListener('click', () => {
            if (activeSortCol === col) {
              activeSortDir = activeSortDir === 'asc' ? 'desc' : 'asc';
            } else {
              activeSortCol = col;
              activeSortDir = col === 'title' ? 'asc' : 'desc';
            }
            updateSortArrows(titleHeader, yourScoreHeader, otherScoreHeader, activeSortCol, activeSortDir);
            const currentEntries = Array.from(listContainer.querySelectorAll<HTMLElement>('.entry:not(.header)'));
            applySort(listContainer, currentEntries, activeSortCol, activeSortDir);
          });
        };

        attachSortClick(titleHeader, 'title');
        attachSortClick(yourScoreHeader, 'yourScore');
        attachSortClick(otherScoreHeader, 'otherScore');
      }

      header.dataset.alaCompareInit = 'true';
      updateSortArrows(titleHeader, yourScoreHeader, otherScoreHeader, activeSortCol, activeSortDir);
      applyFilter(listContainer, entries);
      applySort(listContainer, entries, activeSortCol, activeSortDir);

      // Trigger auto-loading all remaining pages if not already started
      if (!isLoadingAll && sidebar) {
        autoLoadAllEntries(listContainer, sidebar);
      }
    }

    const checkView = debounce(() => {
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
      }

      const header = document.querySelector<HTMLElement>('.entry.header');
      if (!header) return;

      const listContainer = header.parentElement;
      if (!listContainer) return;

      const entries = Array.from(listContainer.querySelectorAll<HTMLElement>('.entry:not(.header)'));
      if (entries.length === 0) return;

      if (!header.dataset.alaCompareInit || entries.length !== lastProcessedCount) {
        lastProcessedCount = entries.length;
        setupCompareView(header, listContainer, entries);
      }
    }, 60);

    Core.ready(checkView);
    Core.onNavigate(() => {
      checkView();
    });
    Core.onBodyMutation(() => {
      if (isComparePage()) {
        checkView();
      }
    });
  }
);
