import { defineFeature } from '../core/registry';
import { Settings } from '../settings/settings';
import { Core } from '../core/observer';
import { MediaData } from '../api/anilist';
import { addStyle, icon, mediaRoute } from '../utils/dom';
import { openTab, debounce } from '../utils/helpers';
import type { MediaRoute } from '../types';

defineFeature(
  {
    id: 'nyaa',
    key: 'nyaaEnabled',
    section: 'External Links & Downloads',
    def: false,
    legacy: ['nyaaEnabled', 'malNyaaLinksEnabled', 'malNyaaEnabled'],
    title: 'MyAnimeList & Nyaa Links',
    help: 'Show a MyAnimeList link, with Nyaa search available by Ctrl/Cmd-click on desktop or long-press on mobile.',
    options: [
      {
        key: 'nyaaProviders',
        type: 'list',
        def: ['SubsPlease', 'ToonsHub'],
        legacy: ['nyaaProviders', 'nyaaSearchGroups'],
        title: 'Nyaa Search Providers',
        help: 'Comma-separated provider names to include in Nyaa searches. Defaults to SubsPlease and ToonsHub.'
      }
    ]
  },
  () => {
    const ID = 'ala-find-on-nyaa';
    const TITLE_SEL = '.page-content .header .content > h1';
    const ICON = icon('external', 17);
    addStyle(
      'ala-nyaa-style',
      `#${ID}{margin-left:10px;display:inline-flex;align-items:center;vertical-align:middle;color:rgb(var(--color-text-lighter));opacity:.8;transition:opacity .15s,transform .15s}#${ID}:hover{opacity:1;color:rgb(var(--color-blue));transform:scale(1.1)}`
    );

    const nyaaUrl = (title: string): string => {
      const q = title.trim().replace(/[^a-zA-Z0-9]+/g, '+').replace(/^\++|\++$/g, '');
      const frag = (Settings.get('nyaaProviders') as string[]).map(encodeURIComponent).join('&text=');
      return `https://nyaa.si/?f=0&c=1_2&s=seeders&o=desc&q=${encodeURI(q)}#:~:text=${frag}`;
    };

    function attach(h1: HTMLElement, route: MediaRoute): void {
      const a = document.createElement('a');
      a.id = ID;
      a.href = '#';
      a.title = 'Open on MAL (Ctrl/Cmd+click or long-press: search Nyaa)';
      a.setAttribute('aria-label', 'Open on MAL; long-press to search Nyaa');
      a.innerHTML = ICON;
      const titleText = (): string =>
        [...h1.childNodes]
          .filter((n) => n !== a)
          .map((n) => n.textContent)
          .join('');
      const searchNyaa = (): void => openTab(nyaaUrl(titleText()));
      MediaData.get(route.id, route.type);

      let timer: ReturnType<typeof setTimeout> | null = null;
      let longPressed = false;
      let sx = 0;
      let sy = 0;
      const cancel = (): void => {
        if (timer) clearTimeout(timer);
        timer = null;
      };

      a.addEventListener(
        'touchstart',
        (e) => {
          if (e.touches.length !== 1) return;
          sx = e.touches[0].clientX;
          sy = e.touches[0].clientY;
          longPressed = false;
          cancel();
          timer = setTimeout(() => {
            timer = null;
            longPressed = true;
            searchNyaa();
            setTimeout(() => {
              longPressed = false;
            }, 800);
          }, 550);
        },
        { passive: true }
      );

      a.addEventListener(
        'touchmove',
        (e) => {
          if (timer === null || !e.touches.length) return;
          if (Math.abs(e.touches[0].clientX - sx) > 12 || Math.abs(e.touches[0].clientY - sy) > 12) cancel();
        },
        { passive: true }
      );

      a.addEventListener('touchend', cancel, { passive: true });
      a.addEventListener('touchcancel', cancel, { passive: true });
      a.addEventListener('contextmenu', (e) => {
        if (longPressed) e.preventDefault();
      });

      a.addEventListener('click', async (e) => {
        e.preventDefault();
        if (longPressed) {
          longPressed = false;
          e.stopPropagation();
          return;
        }
        const w = window.open('about:blank', '_blank');
        const nyaa = nyaaUrl(titleText());
        let target = nyaa;
        if (!e.ctrlKey && !e.metaKey) {
          const media = await MediaData.get(route.id, route.type);
          if (media?.idMal) target = `https://myanimelist.net/${route.kind}/${media.idMal}`;
        }
        if (w) {
          w.opener = null;
          w.location.href = target;
        } else openTab(target);
      });

      h1.appendChild(a);
    }

    let token = 0;
    let placedKey: string | null = null;
    let placing = false;

    async function place(): Promise<void> {
      const route = mediaRoute();
      const key = route && `${route.type}:${route.id}`;
      if (key && key === placedKey && document.getElementById(ID)) return;
      document.getElementById(ID)?.remove();
      placedKey = null;
      if (!route) return;

      const mine = ++token;
      placing = true;
      try {
        const h1 = await Core.waitForSelector(TITLE_SEL, 8000);
        if (h1 && mine === token && mediaRoute()?.id === route.id && !document.getElementById(ID)) {
          attach(h1, route);
          placedKey = key;
        }
      } finally {
        if (mine === token) placing = false;
      }
    }

    const repair = debounce(() => {
      if (placedKey && !placing && !document.getElementById(ID)) place();
    }, 400);

    place();
    Core.onNavigate(place);
    Core.onBodyMutation(repair);
  }
);