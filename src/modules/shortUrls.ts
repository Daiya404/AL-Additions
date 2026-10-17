import { defineFeature } from '../core/registry';
import { Core } from '../core/observer';

defineFeature(
  {
    id: 'removeTitle',
    key: 'linkShortenerEnabled',
    section: 'AniList Enhancements',
    legacy: ['linkShortenerEnabled', 'shortAniListUrlsEnabled', 'shortAniListUrls'],
    title: 'Short AniList URLs',
    help: 'Remove the title slug from AniList anime, manga, staff, and character URLs.'
  },
  () => {
    const SLUG_HREF = /^(?:https:\/\/anilist\.co)?\/(?:manga|anime|staff|character)\/\d{1,10}\/./;
    const strip = (s: string): string => s.replace(/(\/\d{1,10}\/)[^?#]*/, '$1');

    function fixLocation(): void {
      if (
        !/anilist\.co\/(manga|anime|staff|character)\//.test(location.href) ||
        !/\/\d{1,10}\/./.test(location.href)
      )
        return;
      const cur = location.pathname + location.search + location.hash;
      const next = strip(cur.replace(/^https:\/\/anilist\.co/, ''));
      if (cur !== next) Core.silently(() => history.replaceState(history.state, '', next));
    }

    function fixLinks(nodes: NodeList | Node[] | ArrayLike<Node>): void {
      for (const node of Array.from(nodes)) {
        if (node.nodeType !== 1) continue;
        const el = node as Element;
        const links = el.matches('a[href]') ? [el] : el.querySelectorAll('a[href]');
        for (const a of links) {
          const href = a.getAttribute('href');
          if (href && SLUG_HREF.test(href)) a.setAttribute('href', strip(href));
        }
      }
    }

    fixLocation();
    Core.onNavigate(fixLocation);
    Core.onBodyMutation((muts) => {
      for (const m of muts) if (m.addedNodes.length) fixLinks(m.addedNodes);
    });
    Core.ready(() => fixLinks([document.body]));
  }
);