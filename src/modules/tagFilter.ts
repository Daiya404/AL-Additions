import { defineFeature } from '../core/registry';
import { Settings } from '../settings/settings';
import { Core } from '../core/observer';

defineFeature(
  {
    id: 'tagPercent',
    key: 'tagFilterEnabled',
    section: 'AniList Enhancements',
    early: true,
    legacy: ['tagFilterEnabled', 'browseTagRankFilterEnabled'],
    title: 'Browse Tag Rank Filter',
    help: 'Automatically apply a minimum tag-rank percentage when you search with a tag or genre.',
    options: [
      {
        key: 'tagPercentage',
        type: 'number',
        def: 50,
        min: 1,
        max: 100,
        legacy: ['tagPercentage', 'minimumTagRankPercentage'],
        title: 'Minimum Tag Rank',
        help: 'The minimum percentage a selected tag must meet. For example, 50 means the tag must be present on at least half of the relevant titles.'
      }
    ]
  },
  () => {
    const PARAM = 'minimumTagRank';
    const VALUE = String(Settings.get('tagPercentage'));
    const isTarget = (): boolean => /^\/search\/(anime|manga)\/?$/.test(location.pathname);
    const hasSelection = (url: URL): boolean =>
      [...url.searchParams].some(([k, v]) => k !== PARAM && /genre|tag/i.test(k) && v.trim() !== '');
    let fixing = false;

    function apply(initial: boolean): void {
      if (fixing || !isTarget()) return;
      const u = new URL(location.href);
      if (!hasSelection(u) || u.searchParams.get(PARAM) === VALUE) return;
      u.searchParams.set(PARAM, VALUE);
      fixing = true;
      try {
        if (initial) {
          location.replace(u.toString());
        } else {
          history.replaceState(history.state, document.title, u.toString());
          window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
        }
      } finally {
        fixing = false;
      }
    }

    apply(true);
    Core.onNavigate(() => apply(false));
  }
);