import { defineFeature } from '../core/registry';
import { Core } from '../core/observer';
import { Settings, PREFIX } from '../settings/settings';
import { addStyle } from '../utils/dom';
import { store, logDebug } from '../utils/helpers';
import { PROBE_ATTR, detectStandalone } from '../utils/standalone';
import { DEFAULT_TIERS, getTier, validateTiers, type TierConfig } from '../utils/tiers';

export { DEFAULT_TIERS, getTier, validateTiers, type TierConfig };

export function getValidTiers(): TierConfig[] {
  const raw = Settings.get('tierLabels');
  const check = validateTiers(raw);
  return check.valid && check.tiers ? check.tiers : DEFAULT_TIERS;
}

defineFeature(
  {
    id: 'tierLabels',
    key: 'tierLabelsEnabled',
    section: 'AniList Enhancements',
    def: false,
    legacy: ['tierLabelsEnabled'],
    title: 'AniList Tier Labels',
    help: 'Adds customizable tier badges (S+, S, A, etc.) next to ratings across list, card, browse, and compare views.',
    options: [
      {
        key: 'tierLabelsColorScore',
        type: 'toggle',
        def: true,
        title: 'Color score value',
        help: 'Color the score number text to match its tier badge.'
      },
      {
        key: 'tierLabelsAverageScore',
        type: 'toggle',
        def: true,
        title: 'Show on Average & Mean scores',
        help: 'Display tier badge next to Average Score / Mean Score on profile and media pages.'
      },
      {
        key: 'tierLabels',
        type: 'json',
        def: DEFAULT_TIERS,
        title: 'Tier Ranges & Colors',
        help: 'Customize score ranges, badge labels, and colors.',
        validate: validateTiers
      }
    ]
  },
  () => {
    // Migrate settings from standalone AniList Tier Labels userscript if present
    try {
      const legacy = localStorage.getItem('anilistTierLabelsSettings');
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (Array.isArray(parsed.tiers) && parsed.tiers.length && store.get(PREFIX + 'tierLabels', null) === null) {
          const check = validateTiers(parsed.tiers);
          if (check.valid && check.tiers) {
            store.set(PREFIX + 'tierLabels', check.tiers);
          }
        }
        if (
          typeof parsed.enableRatingTextColor === 'boolean' &&
          store.get(PREFIX + 'tierLabelsColorScore', null) === null
        ) {
          store.set(PREFIX + 'tierLabelsColorScore', parsed.enableRatingTextColor);
        }
      }
    } catch (_) {}

    addStyle(
      'ala-tier-labels-css',
      `
      .ala-tier-badge {
        display: inline-block;
        font-weight: 700;
        border-radius: 4px;
        vertical-align: middle;
        white-space: nowrap;
        line-height: 1.2;
        box-sizing: border-box;
      }
      .ala-tier-badge--list {
        font-size: 11px;
        padding: 2px 5px;
        margin-left: 5px;
      }
      .ala-tier-badge--block {
        font-size: 10px;
        padding: 1px 4px;
        margin-left: 4px;
      }
      .ala-tier-container {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .ala-tier-container--block {
        background-color: rgba(0, 0, 0, 0.55);
        padding: 2px 6px;
        border-radius: 4px;
        overflow: hidden;
      }
      `
    );

    function createBadge(tier: TierConfig, isBlockView = false): HTMLElement {
      const badge = document.createElement('span');
      badge.className = `ala-tier-badge ${isBlockView ? 'ala-tier-badge--block' : 'ala-tier-badge--list'}`;
      badge.textContent = tier.label;
      badge.style.backgroundColor = tier.color;
      badge.style.color = tier.textColor;
      return badge;
    }

    function getScoreSystem(): string {
      const container = document.querySelector('.content.container, .medialist');
      if (container) {
        if (container.querySelector('.medialist.table.POINT_100, .medialist.POINT_100')) return 'POINT_100';
        if (container.querySelector('.medialist.table.POINT_10_DECIMAL, .medialist.POINT_10_DECIMAL')) {
          return 'POINT_10_DECIMAL';
        }
        if (container.querySelector('.medialist.table.POINT_10, .medialist.POINT_10')) return 'POINT_10';
        if (container.querySelector('.medialist.table.POINT_5, .medialist.POINT_5')) return 'POINT_5';
        if (container.querySelector('.medialist.table.POINT_3, .medialist.POINT_3')) return 'POINT_3';
      }
      const viewerFmt = store.get<string | null>('al_score_format', null);
      if (viewerFmt) return viewerFmt;
      return 'UNKNOWN';
    }

    function getCompareColumnFormat(el: HTMLElement): string {
      const compareRoot = el.closest('.compare') as (HTMLElement & { _colFormats?: Record<string, string> }) | null;
      if (!compareRoot) return 'UNKNOWN';

      const label = el.getAttribute('label') || '';
      const isAuthUser =
        label === 'Score' || !!el.matches('.entry > .cell.score:first-of-type, .entry > .score:first-of-type');
      const sideKey = isAuthUser ? 'auth' : 'target';

      if (!compareRoot._colFormats) compareRoot._colFormats = {};
      if (compareRoot._colFormats[sideKey]) return compareRoot._colFormats[sideKey];

      if (isAuthUser) {
        const viewerFmt = store.get<string | null>('al_score_format', null);
        if (viewerFmt) {
          compareRoot._colFormats[sideKey] = viewerFmt;
          return viewerFmt;
        }
      }

      const colSelector = isAuthUser
        ? '.entry > .cell.score:first-of-type, .entry > .score:first-of-type, .score[label="Score"]'
        : '.entry > .cell.score:nth-of-type(2), .entry > .score:nth-of-type(2), .score:not([label="Score"])';

      const cells = compareRoot.querySelectorAll<HTMLElement>(colSelector);
      let maxScore = 0;
      let hasDecimal = false;
      let hasStarIcon = false;

      for (const cell of cells) {
        if (cell.querySelector('svg, .icon')) hasStarIcon = true;
        const s = cell.getAttribute('score') || (cell.textContent || '').replace('%', '').trim();
        const num = parseFloat(s);
        if (!isNaN(num) && num > 0) {
          if (num > maxScore) maxScore = num;
          if (s.includes('.')) hasDecimal = true;
        }
      }

      let detected = 'UNKNOWN';
      if (maxScore > 10) detected = 'POINT_100';
      else if (hasDecimal) detected = 'POINT_10_DECIMAL';
      else if (hasStarIcon) detected = 'POINT_5';
      else if (maxScore > 5) detected = 'POINT_10';
      else if (maxScore > 0) detected = 'POINT_10';

      compareRoot._colFormats[sideKey] = detected;
      logDebug('[TIER]', `Detected score system for ${isAuthUser ? 'viewer' : 'other'}:`, detected, { maxScore, hasDecimal, hasStarIcon });
      return detected;
    }

    function normalizeScore(score: number, scoreSystem: string, isPercentage = false): number | null {
      if (isNaN(score) || score <= 0) return null;
      if (isPercentage) return score;

      switch (scoreSystem) {
        case 'POINT_100':
          return score;
        case 'POINT_10_DECIMAL':
        case 'POINT_10':
          return score * 10;
        case 'POINT_5':
          return score * 20;
        case 'POINT_3':
          return score === 3 ? 100 : score === 2 ? 60 : 20;
        default:
          return score > 10 ? score : score * 10;
      }
    }

    function processScoreElement(
      el: HTMLElement,
      tiers: TierConfig[],
      colorScore: boolean,
      isPercentage = false,
      isBlockView = false
    ): void {
      if (el.hasAttribute(PROBE_ATTR)) return;
      if (el.dataset.tierModified) {
        // Re-process when the page re-rendered the cell (our badge is gone) or its score attribute changed.
        const attrNow = el.getAttribute('score');
        const changed = attrNow !== null && attrNow !== el.dataset.tierSource;
        if (el.querySelector('.ala-tier-container') && !changed) return;
        delete el.dataset.tierModified;
      }

      const attr = el.getAttribute('score');
      const rawText = (attr || el.textContent || '').replace('%', '').trim();
      if (!rawText || rawText === '-' || rawText === '0') return;

      const num = parseFloat(rawText);
      if (isNaN(num) || num <= 0) return;

      const scoreSystem = el.closest('.compare') ? getCompareColumnFormat(el) : getScoreSystem();
      const normalizedRating = normalizeScore(num, scoreSystem, isPercentage);
      if (normalizedRating === null) return;

      const tier = getTier(normalizedRating, tiers);
      if (!tier) return;
      logDebug('[TIER]', 'Applied tier badge:', tier.label, 'to raw score:', rawText, 'normalized:', normalizedRating);

      el.dataset.tierModified = 'true';
      el.dataset.tierSource = attr ?? '';

      const container = document.createElement('div');
      container.className = `ala-tier-container ${isBlockView ? 'ala-tier-container--block' : ''}`;

      const scoreSpan = document.createElement('span');
      scoreSpan.className = 'ala-tier-score-text';
      if (colorScore) {
        scoreSpan.style.color = tier.color;
      }

      const icon = el.querySelector('svg, .icon');
      if (icon) {
        scoreSpan.appendChild(icon.cloneNode(true));
        scoreSpan.appendChild(document.createTextNode(' ' + rawText));
      } else {
        scoreSpan.textContent = isPercentage ? `${rawText}%` : rawText;
      }

      container.appendChild(scoreSpan);
      container.appendChild(createBadge(tier, isBlockView));

      el.textContent = '';
      el.appendChild(container);
    }

    function processTop100Elements(tiers: TierConfig[], colorScore: boolean): void {
      document.querySelectorAll<HTMLElement>('.row.score').forEach((row) => {
        const percentageEl = row.querySelector<HTMLElement>('.percentage');
        if (!percentageEl || percentageEl.classList.contains('popularity')) return;
        if (percentageEl.dataset.tierModified) {
          if (percentageEl.querySelector('.ala-tier-container')) return;
          delete percentageEl.dataset.tierModified;
        }

        const childNodes = Array.from(percentageEl.childNodes);
        const textNode = childNodes.find((n) => n.nodeType === Node.TEXT_NODE && (n.textContent || '').trim() !== '');
        if (!textNode) return;

        const ratingText = (textNode.textContent || '').trim().replace('%', '');
        const numericRating = parseFloat(ratingText);
        if (isNaN(numericRating) || numericRating <= 0) return;

        const tier = getTier(numericRating, tiers);
        if (!tier) return;

        percentageEl.dataset.tierModified = 'true';
        textNode.remove();

        const ratingWrapper = document.createElement('div');
        ratingWrapper.className = 'ala-tier-container';
        ratingWrapper.style.display = 'inline-flex';
        ratingWrapper.style.alignItems = 'center';
        ratingWrapper.style.gap = '6px';

        const textSpan = document.createElement('span');
        textSpan.className = 'ala-tier-score-text';
        textSpan.textContent = numericRating + '%';
        if (colorScore) {
          textSpan.style.color = tier.color;
        }

        ratingWrapper.appendChild(textSpan);
        ratingWrapper.appendChild(createBadge(tier));

        const popularityEl = percentageEl.querySelector('.sub-row.popularity');
        if (popularityEl) {
          percentageEl.insertBefore(ratingWrapper, popularityEl);
        } else {
          percentageEl.appendChild(ratingWrapper);
        }
      });
    }

    function applyTierLabels(): void {
      const tiers: TierConfig[] = getValidTiers();
      const colorScore: boolean = Settings.get('tierLabelsColorScore');
      const showAverage: boolean = Settings.get('tierLabelsAverageScore');

      // 1. List view & Compare view
      document
        .querySelectorAll<HTMLElement>('.score:not(.media-card .score):not(.entry-card .score)')
        .forEach((el) => {
          processScoreElement(el, tiers, colorScore, false, false);
        });

      // 2. Block / Card view
      document.querySelectorAll<HTMLElement>('.entry-card .score').forEach((el) => {
        processScoreElement(el, tiers, colorScore, false, true);
      });

      // 3. Average & Mean score in data-sets
      if (showAverage) {
        document.querySelectorAll<HTMLElement>('.data-set').forEach((dataSet) => {
          const label = dataSet.querySelector<HTMLElement>('.type');
          const value = dataSet.querySelector<HTMLElement>('.value');
          if (
            label &&
            value &&
            ((label.textContent || '').includes('Average Score') || (label.textContent || '').includes('Mean Score'))
          ) {
            processScoreElement(value, tiers, colorScore, true, false);
          }
        });
      }

      // 4. Top 100 / Browse ranking
      processTop100Elements(tiers, colorScore);
    }

    // Yield to the standalone AniList Tier Labels script when it is installed.
    // The last probe result is remembered so a normal page load never waits on the probe.
    const HINT_KEY = 'ala_standalone_seen_tierLabels';
    let paused = !!store.get<boolean>(HINT_KEY, false);
    const runScan = (): void => {
      if (!paused) applyTierLabels();
    };

    Core.ready(() => {
      runScan();
      Core.onNavigate(() => {
        // Clear cached compare formats on navigation
        document.querySelectorAll<HTMLElement & { _colFormats?: any }>('.compare').forEach((c) => {
          delete c._colFormats;
        });
        runScan();
      });
      let scanQueued = false;
      Core.onBodyMutation(() => {
        if (scanQueued) return;
        scanQueued = true;
        setTimeout(() => {
          scanQueued = false;
          runScan();
        }, 100);
      });

      void detectStandalone('tierLabels').then((found) => {
        store.set(HINT_KEY, found);
        const wasPaused = paused;
        paused = found;
        if (found && !wasPaused) {
          console.warn(
            '[AL-Additions] Built-in Tier Labels paused: the standalone AniList Tier Labels script is installed. Uninstall it to use the built-in version.'
          );
        }
        if (!found && wasPaused) runScan();
      });
    });
  }
);