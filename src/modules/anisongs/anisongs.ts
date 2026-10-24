import { defineFeature } from '../../core/registry';
import { Core } from '../../core/observer';
import { AniList } from '../../api/anilist';
import { addStyle, mediaRoute } from '../../utils/dom';
import { persistent, gm, memo, debounce } from '../../utils/helpers';
import {
  DEFAULT_ANISONGS_CONFIG,
  validateAniSongsConfig,
  getValidAniSongsConfig,
  buildProviderUrl,
  type SongProviderPreset,
  type SongParams
} from './anisongModal';

export { DEFAULT_ANISONGS_CONFIG, validateAniSongsConfig, getValidAniSongsConfig, buildProviderUrl };

export interface SongEntry {
  sequence: number;
  name: string;
  url: string | null;
  title?: string;
  title_romaji?: string;
  title_jp?: string;
  artists?: string[];
  type?: 'OP' | 'ED';
  animeName?: string;
  animeRomaji?: string;
  animeEn?: string;
  animeJp?: string;
  year?: string | number;
  season?: string;
  eps?: string;
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

interface AnimeMetaInfo {
  animeName: string;
  animeRomaji: string;
  animeEn: string;
  animeJp: string;
  year: string | number;
  season: string;
}

export function extractSongParams(song: SongEntry, groupType: 'OP' | 'ED' = 'OP'): SongParams {
  let title = (song.title || '').trim();
  if (!title) {
    const m = song.name.match(/"([^"]+)"/);
    title = m ? m[1].trim() : song.name.replace(/^\d+\.\s*/, '').trim();
  }

  let artist = '';
  if (Array.isArray(song.artists) && song.artists.length) {
    artist = song.artists.filter(Boolean).join(' ');
  } else if (typeof (song as any).artist === 'string') {
    artist = (song as any).artist.trim();
  } else {
    const m = song.name.match(/ by ([^(]+)/i);
    if (m) artist = m[1].trim();
  }

  const anime =
    (song.animeName || '').trim() ||
    document.querySelector('.header h1')?.textContent?.trim() ||
    document.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
    '';

  const type = song.type === 'ED' || groupType === 'ED' ? 'ED' : 'OP';
  const number = Number.isFinite(song.sequence) && song.sequence >= 1 ? Math.floor(song.sequence) : 1;

  return {
    title,
    title_romaji: song.title_romaji || title,
    title_jp: song.title_jp || title,
    artist,
    artists: Array.isArray(song.artists) && song.artists.length ? song.artists.join(', ') : artist,
    anime,
    anime_romaji: song.animeRomaji || anime,
    anime_en: song.animeEn || anime,
    anime_jp: song.animeJp || anime,
    year: song.year,
    season: song.season,
    type,
    number,
    eps: song.eps
  };
}

defineFeature(
  {
    id: 'aniSongs',
    key: 'aniSongsEnabled',
    section: 'AniList Enhancements',
    def: false,
    legacy: ['aniSongsEnabled', 'animeThemeSongsEnabled', 'anisongsEnabled'],
    title: 'Anime Opening & Ending Songs',
    help: 'Show OP/ED theme songs on anime pages.',
    options: [
      {
        key: 'aniSongsProviders',
        type: 'json',
        def: DEFAULT_ANISONGS_CONFIG,
        title: 'Song Search Providers',
        help: 'Configure search shortcuts (YouTube, Spotify, etc.) and active music services.',
        validate: validateAniSongsConfig
      }
    ]
  },
  () => {
    const API = 'https://api.animethemes.moe/anime';
    const ROOT = 'daiya-anisongs';
    const TTL = 7 * 86400e3;
    const EMPTY_TTL = 12 * 3600e3;

    addStyle(
      'daiya-anisongs-style',
      `
      #${ROOT}{width:100%;margin-top:30px}
      #${ROOT} .daiya-anisongs-columns{display:flex;gap:30px;width:100%}
      #${ROOT} .daiya-anisongs-group{flex:1 1 0;min-width:0}
      #${ROOT} h2{margin-top:0}
      #${ROOT} .daiya-anisong-entry{background:rgb(var(--color-foreground));border-radius:4px;padding:8px 10px;font-size:1.3rem;margin-bottom:10px;color:rgb(var(--color-text))}
      #${ROOT} .daiya-anisong-header{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%}
      #${ROOT} .daiya-anisong-title{flex:1 1 auto;min-width:0;word-break:break-word}
      #${ROOT} .daiya-anisong-entry.has-video .daiya-anisong-title{cursor:pointer}
      #${ROOT} .daiya-anisong-entry.has-video .daiya-anisong-title:hover{color:rgb(var(--color-blue));transition:color .15s}
      #${ROOT} .daiya-anisong-actions{display:inline-flex;align-items:center;gap:6px;flex-shrink:0}
      #${ROOT} .daiya-anisong-link{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:4px;background:rgba(var(--color-text-lighter),.08);padding:3px;transition:all .15s;text-decoration:none}
      #${ROOT} .daiya-anisong-link:hover{background:rgba(var(--color-blue),.2);transform:translateY(-1px)}
      #${ROOT} .daiya-anisong-icon{width:16px;height:16px;object-fit:contain;display:block;border-radius:2px}
      #${ROOT} video{display:block;width:100%;max-width:39em;margin-top:10px;cursor:auto}
      #${ROOT} .daiya-anisongs-empty{text-align:center;opacity:.7;padding:10px}
      @media (max-width:700px){#${ROOT} .daiya-anisongs-columns{flex-direction:column;gap:10px}}`
    );

    const cacheStore = persistent<Record<string, AnimeThemesCacheEntry>>('daiya_anisongs_cache_v7', (d) => {
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

    function parseTheme(theme: any, meta: AnimeMetaInfo): SongEntry | null {
      const songTitle = str(theme?.song?.title);
      if (!songTitle) return null;
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
      const type = str(theme?.type).toUpperCase() === 'ED' ? 'ED' : 'OP';

      const hasJp = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(songTitle);

      return {
        sequence,
        title: songTitle,
        title_romaji: songTitle,
        title_jp: hasJp ? songTitle : undefined,
        artists,
        type,
        animeName: meta.animeName,
        animeRomaji: meta.animeRomaji,
        animeEn: meta.animeEn,
        animeJp: meta.animeJp,
        year: meta.year,
        season: meta.season,
        eps: eps || undefined,
        name:
          `${sequence}. "${songTitle}"` +
          (artists.length ? ` by ${artists.join(', ')}` : '') +
          (eps ? ` (${eps.includes('-') ? 'eps' : 'ep'} ${eps})` : '') +
          (group && group.toLowerCase().includes('dubbed') ? ` (${group})` : ''),
        url: pickVideo(theme?.animethemeentries)
      };
    }

    function groupThemes(anime: any, meta: AnimeMetaInfo): ThemesGroup {
      const out: ThemesGroup = { OP: [], ED: [] };
      for (const theme of Array.isArray(anime?.animethemes) ? anime.animethemes : []) {
        const parsed = parseTheme(theme, meta);
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

      const alQuery = `query ($id: Int) {
        Media(id: $id) {
          title { userPreferred english romaji native }
          seasonYear
          season
        }
      }`;

      const [themesRes, alRes] = await Promise.allSettled([
        gm.json(`${API}?${params}`, { headers: { Accept: 'application/json' } }),
        AniList.query(alQuery, { id: Number(id) })
      ]);

      const result = themesRes.status === 'fulfilled' ? themesRes.value : null;
      const alMedia = alRes.status === 'fulfilled' ? alRes.value?.Media : null;
      const rawAnime = Array.isArray(result?.anime) ? result.anime[0] : null;

      const animeName =
        str(alMedia?.title?.userPreferred) ||
        str(rawAnime?.name) ||
        document.querySelector('.header h1')?.textContent?.trim() ||
        '';

      const meta: AnimeMetaInfo = {
        animeName,
        animeRomaji: str(alMedia?.title?.romaji) || str(rawAnime?.name) || animeName,
        animeEn: str(alMedia?.title?.english) || animeName,
        animeJp: str(alMedia?.title?.native) || '',
        year: alMedia?.seasonYear || rawAnime?.year || '',
        season: alMedia?.season || rawAnime?.season || ''
      };

      const data = groupThemes(rawAnime, meta);
      const empty = !data.OP.length && !data.ED.length;
      cache[String(id)] = { expires: Date.now() + (empty ? EMPTY_TTL : TTL), data };
      cacheStore.save();
      return data;
    });

    function songEl(song: SongEntry, activePresets: SongProviderPreset[], groupType: 'OP' | 'ED'): HTMLDivElement {
      const el = document.createElement('div');
      el.className = 'daiya-anisong-entry';

      const header = document.createElement('div');
      header.className = 'daiya-anisong-header';

      const titleSpan = document.createElement('span');
      titleSpan.className = 'daiya-anisong-title';
      titleSpan.textContent = song.name;
      header.appendChild(titleSpan);

      if (activePresets.length) {
        const actions = document.createElement('div');
        actions.className = 'daiya-anisong-actions';
        const params = extractSongParams(song, groupType);

        activePresets.forEach((p) => {
          if (!p || !p.url) return;
          const a = document.createElement('a');
          a.className = 'daiya-anisong-link';
          a.href = buildProviderUrl(p.url, params);
          a.target = '_blank';
          a.rel = 'noopener';
          a.title = `Search on ${p.name}`;
          a.addEventListener('click', (ev) => ev.stopPropagation());

          const img = document.createElement('img');
          img.className = 'daiya-anisong-icon';
          img.src = p.icon;
          img.alt = p.name;
          img.onerror = () => {
            img.src = 'https://www.google.com/s2/favicons?domain=youtube.com&sz=32';
          };
          a.appendChild(img);
          actions.appendChild(a);
        });

        header.appendChild(actions);
      }

      el.appendChild(header);

      const url = song.url;
      if (!url) return el;

      el.classList.add('has-video');
      let video: HTMLVideoElement | null = null;
      header.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.daiya-anisong-actions')) return;
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

    function groupEl(title: string, songs: SongEntry[], activePresets: SongProviderPreset[], groupType: 'OP' | 'ED'): HTMLDivElement {
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
        songs.forEach((s) => g.appendChild(songEl(s, activePresets, groupType)));
      }
      return g;
    }

    function mount(state: { id: string; themes: ThemesGroup }, overview: HTMLElement): void {
      document.getElementById(ROOT)?.remove();
      const config = getValidAniSongsConfig();
      const presetMap = new Map<string, SongProviderPreset>();
      config.presets.forEach((p) => presetMap.set(p.id, p));
      const activePresets = config.active.map((id) => presetMap.get(id)).filter(Boolean) as SongProviderPreset[];

      const root = document.createElement('section');
      root.id = ROOT;
      root.dataset.animeId = state.id;
      const cols = document.createElement('div');
      cols.className = 'daiya-anisongs-columns';
      cols.append(
        groupEl('Openings', state.themes.OP, activePresets, 'OP'),
        groupEl('Endings', state.themes.ED, activePresets, 'ED')
      );
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
      } catch (err) {
        console.error('[AL-Additions] Anisongs sync error:', err);
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
        if (overview) {
          try {
            mount(cur as { id: string; themes: ThemesGroup }, overview);
          } catch (err) {
            console.error('[AL-Additions] Anisongs repair error:', err);
          }
        }
      }
    }

    Core.ready(sync);
    Core.onNavigate(sync);
    Core.onBodyMutation(debounce(repair, 200));
  }
);