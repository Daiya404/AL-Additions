import { defineFeature } from '../core/registry';
import { Core } from '../core/observer';
import { addStyle, mediaRoute } from '../utils/dom';
import { persistent, gm, memo } from '../utils/helpers';

interface SongEntry {
  sequence: number;
  name: string;
  url: string | null;
}

interface ThemesGroup {
  OP: SongEntry[];
  ED: SongEntry[];
}

interface AnimeThemesCacheEntry {
  expires: number;
  data: ThemesGroup;
}

interface AnisongsState {
  id: string;
  themes: ThemesGroup | null;
  busy: boolean;
}

defineFeature(
  {
    id: 'aniSongs',
    key: 'aniSongsEnabled',
    section: 'AniList Enhancements',
    legacy: ['aniSongsEnabled', 'animeThemeSongsEnabled', 'anisongsEnabled'],
    title: 'Anime Opening & Ending Songs',
    help: 'Show OP/ED theme songs on anime pages.'
  },
  () => {
    const API = 'https://api.animethemes.moe/anime';
    const ROOT = 'daiya-anisongs';
    const TTL = 7 * 86400e3;

    addStyle(
      'daiya-anisongs-style',
      `
      #${ROOT}{width:100%;margin-top:30px}
      #${ROOT} .daiya-anisongs-columns{display:flex;gap:30px;width:100%}
      #${ROOT} .daiya-anisongs-group{flex:1 1 0;min-width:0}
      #${ROOT} h2{margin-top:0}
      #${ROOT} .daiya-anisong-entry{background:rgb(var(--color-foreground));border-radius:3px;padding:8px 10px;font-size:1.3rem;margin-bottom:10px;color:rgb(var(--color-text))}
      #${ROOT} .daiya-anisong-entry.has-video{cursor:pointer}
      #${ROOT} .daiya-anisong-entry.has-video:hover{color:rgb(var(--color-blue));transition:color .15s}
      #${ROOT} video{display:block;width:100%;max-width:39em;margin-top:10px;cursor:auto}
      #${ROOT} .daiya-anisongs-empty{text-align:center;opacity:.7;padding:10px}
      @media (max-width:700px){#${ROOT} .daiya-anisongs-columns{flex-direction:column;gap:10px}}`
    );

    const cacheStore = persistent<Record<string, AnimeThemesCacheEntry>>('daiya_anisongs_cache_v5', (d) => {
      for (const id of Object.keys(d)) {
        if (!(Number(d[id]?.expires) > Date.now())) delete d[id];
      }
    });
    const cache = cacheStore.data;

    const str = (v: any): string => (typeof v === 'string' ? v.trim() : '');

    function pickVideo(entries: any[]): string | null {
      let fallback: string | null = null;
      for (const entry of Array.isArray(entries) ? entries : []) {
        for (const video of Array.isArray(entry?.videos) ? entry.videos : []) {
          const link = str(video?.link);
          if (!/^https?:\/\//i.test(link)) continue;
          if (str(video?.source).toUpperCase() === 'WEB') return link;
          fallback = fallback || link;
        }
      }
      return fallback;
    }

    function parseTheme(theme: any): SongEntry | null {
      const title = str(theme?.song?.title);
      if (!title) return null;
      const seq = Number(theme?.sequence);
      const sequence = Number.isFinite(seq) && seq >= 1 ? Math.floor(seq) : 1;
      const artists = (Array.isArray(theme?.song?.artists) ? theme.song.artists : [])
        .map((a: any) => str(a?.name))
        .filter(Boolean);
      const eps = (Array.isArray(theme?.animethemeentries) ? theme.animethemeentries : [])
        .map((e: any) => str(e?.episodes))
        .filter(Boolean)
        .join(', ');
      const group = str(theme?.group);
      return {
        sequence,
        name:
          `${sequence}. "${title}"` +
          (artists.length ? ` by ${artists.join(', ')}` : '') +
          (eps ? ` (${eps.includes('-') ? 'eps' : 'ep'} ${eps})` : '') +
          (group && group.toLowerCase().includes('dubbed') ? ` (${group})` : ''),
        url: pickVideo(theme?.animethemeentries)
      };
    }

    function groupThemes(anime: any): ThemesGroup {
      const out: ThemesGroup = { OP: [], ED: [] };
      for (const theme of Array.isArray(anime?.animethemes) ? anime.animethemes : []) {
        const parsed = parseTheme(theme);
        const type = str(theme?.type).toUpperCase() as 'OP' | 'ED';
        if (parsed && out[type]) out[type].push(parsed);
      }
      const sort = (a: SongEntry, b: SongEntry) => a.sequence - b.sequence || a.name.localeCompare(b.name);
      out.OP.sort(sort);
      out.ED.sort(sort);
      return out;
    }

    const loadThemes = memo(async (id: string | number): Promise<ThemesGroup> => {
      const hit = cache[String(id)];
      if (hit && hit.expires > Date.now()) return hit.data;
      const params = new URLSearchParams({
        'filter[has]': 'resources',
        'filter[site]': 'AniList',
        'filter[external_id]': String(id),
        include: 'animethemes.animethemeentries.videos,animethemes.song,animethemes.song.artists'
      });
      const result = await gm.json(`${API}?${params}`, { headers: { Accept: 'application/json' } });
      const data = groupThemes(Array.isArray(result?.anime) ? result.anime[0] : null);
      cache[String(id)] = { expires: Date.now() + TTL, data };
      cacheStore.save();
      return data;
    });

    function songEl(song: SongEntry): HTMLDivElement {
      const el = document.createElement('div');
      el.className = 'daiya-anisong-entry';
      el.textContent = song.name;
      const url = song.url;
      if (!url) return el;
      el.classList.add('has-video');
      let video: HTMLVideoElement | null = null;
      el.addEventListener('click', (e) => {
        if (e.target instanceof HTMLVideoElement) return;
        if (video) {
          video.pause();
          video.remove();
          video = null;
          return;
        }
        video = document.createElement('video');
        video.controls = true;
        video.preload = 'none';
        video.volume = 0.4;
        video.src = url;
        video.addEventListener('click', (ev) => ev.stopPropagation());
        el.appendChild(video);
        video.play().catch(() => {});
      });
      return el;
    }

    function groupEl(title: string, songs: SongEntry[]): HTMLDivElement {
      const g = document.createElement('div');
      g.className = 'daiya-anisongs-group';
      const h = document.createElement('h2');
      h.textContent = title;
      g.appendChild(h);
      if (!songs.length) {
        const empty = document.createElement('div');
        empty.className = 'daiya-anisongs-empty';
        empty.textContent = 'No songs to show (つ﹏<)･ﾟ｡';
        g.appendChild(empty);
      } else {
        songs.forEach((s) => g.appendChild(songEl(s)));
      }
      return g;
    }

    function mount(state: { id: string; themes: ThemesGroup }, overview: HTMLElement): void {
      document.getElementById(ROOT)?.remove();
      const root = document.createElement('section');
      root.id = ROOT;
      root.dataset.animeId = state.id;
      const cols = document.createElement('div');
      cols.className = 'daiya-anisongs-columns';
      cols.append(groupEl('Openings', state.themes.OP), groupEl('Endings', state.themes.ED));
      root.appendChild(cols);
      overview.appendChild(root);
    }

    let cur: AnisongsState | null = null;
    let backoff = { id: null as string | null, until: 0 };
    const animeId = (): string | null => {
      const r = mediaRoute();
      return r && r.kind === 'anime' ? String(r.id) : null;
    };

    async function sync(): Promise<void> {
      const id = animeId();
      if (!id) {
        document.getElementById(ROOT)?.remove();
        cur = null;
        return;
      }
      if (cur?.id === id) return;
      if (backoff.id === id && Date.now() < backoff.until) return;
      document.getElementById(ROOT)?.remove();
      const mine: AnisongsState = { id, themes: null, busy: true };
      cur = mine;
      try {
        const themes = await loadThemes(id, id);
        if (cur !== mine) return;
        if (!themes.OP.length && !themes.ED.length) return;
        mine.themes = themes;
        const overview = await Core.waitForSelector('.overview', 10000);
        if (cur === mine && overview && animeId() === id) mount(mine as { id: string; themes: ThemesGroup }, overview);
      } catch (_) {
        if (cur === mine) {
          cur = null;
          backoff = { id, until: Date.now() + 30000 };
        }
      } finally {
        mine.busy = false;
      }
    }

    function repair(): void {
      const id = animeId();
      if (!id) return;
      if (cur?.id !== id) return void sync();
      if (cur.themes && !cur.busy && !document.getElementById(ROOT)) {
        const overview = document.querySelector<HTMLElement>('.overview');
        if (overview) mount(cur as { id: string; themes: ThemesGroup }, overview);
      }
    }

    Core.ready(sync);
    Core.onNavigate(sync);
    Core.onBodyMutation(repair);
  }
);