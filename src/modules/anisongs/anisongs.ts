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

export interface ThemeVersionEntry {
  version: number;
  episodes?: string;
  notes?: string;
  url: string | null;
}

export interface SongEntry {
  sequence: number;
  name: string;
  url: string | null;
  versions?: ThemeVersionEntry[];
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
  resources?: Record<string, string>;
}

export interface ThemesGroup {
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

export interface AnimeMetaInfo {
  animeName: string;
  animeRomaji: string;
  animeEn: string;
  animeJp: string;
  year: string | number;
  season: string;
}

const str = (v: any): string => (typeof v === 'string' ? v.trim() : '');

export const DIRECT_SITE_MAP: Record<string, string> = {
  spotify: 'SPOTIFY',
  youtube: 'YOUTUBE',
  youtube_music: 'YOUTUBE_MUSIC',
  apple_music: 'APPLE_MUSIC'
};

export function resolveProviderLink(
  preset: SongProviderPreset,
  song: SongEntry,
  groupType: 'OP' | 'ED'
): { url: string; isDirect: boolean } {
  const directSite = DIRECT_SITE_MAP[preset.id];
  const directUrl = directSite && song.resources ? song.resources[directSite] : null;
  if (directUrl) {
    return { url: directUrl, isDirect: true };
  }
  const params = extractSongParams(song, groupType);
  return { url: buildProviderUrl(preset.url, params), isDirect: false };
}

export function pickVideo(entries: any[]): string | null {
  let fallback: string | null = null;
  for (const entry of Array.isArray(entries) ? entries : []) {
    const rawVideos = entry?.videos;
    const videos = Array.isArray(rawVideos?.nodes)
      ? rawVideos.nodes
      : Array.isArray(rawVideos)
      ? rawVideos
      : [];
    for (const video of videos) {
      const link = str(video?.link);
      if (!/^https?:\/\//i.test(link)) continue;
      if (str(video?.source).toUpperCase() === 'WEB') return link;
      fallback = fallback || link;
    }
  }
  return fallback;
}

const PERFORMER_ROLES = new Set(['PERFORMANCE', 'FEATURING']);
const relevanceOf = (v: any): number =>
  v != null && Number.isFinite(Number(v)) ? Number(v) : Number.MAX_SAFE_INTEGER;

function extractSongArtists(song: any): { artists: string[]; credit: string } {
  const mainArtists: string[] = [];
  const featArtists: string[] = [];
  const seen = new Set<string>();

  if (Array.isArray(song?.staff)) {
    const sorted = [...song.staff].sort((a: any, b: any) => relevanceOf(a?.relevance) - relevanceOf(b?.relevance));
    for (const s of sorted) {
      const role = str(s?.role).toUpperCase();
      if (role && !PERFORMER_ROLES.has(role)) continue;
      const name = str(s?.as || s?.alias || s?.artist?.name?.main || s?.artist?.name);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      if (role === 'FEATURING') featArtists.push(name);
      else mainArtists.push(name);
    }
  } else if (Array.isArray(song?.artists)) {
    for (const a of song.artists) {
      const name = str(a?.name);
      if (name && !seen.has(name)) {
        seen.add(name);
        mainArtists.push(name);
      }
    }
  }

  const artists = [...mainArtists, ...featArtists];
  const credit =
    mainArtists.length && featArtists.length
      ? `${mainArtists.join(', ')} feat. ${featArtists.join(', ')}`
      : artists.join(', ');
  return { artists, credit };
}

function firstEpisodeNum(eps?: string): number {
  const m = (eps || '').match(/\d+/);
  return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER;
}

export function sortEpisodes(raw: string): string {
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return parts[0] || '';
  parts.sort((a, b) => firstEpisodeNum(a) - firstEpisodeNum(b) || a.localeCompare(b));
  return parts.join(', ');
}

export function formatEpsTag(eps: string): string {
  if (!eps) return '';
  return `(${/[-,]/.test(eps) ? 'eps' : 'ep'} ${eps})`;
}

export function parseTheme(theme: any, meta: AnimeMetaInfo): SongEntry | null {
  const songTitle = str(theme?.song?.title?.romaji || theme?.song?.title);
  if (!songTitle) return null;
  const seq = Number(theme?.sequence);
  const sequence = Number.isFinite(seq) && seq >= 1 ? Math.floor(seq) : 1;

  const { artists, credit: artistCredit } = extractSongArtists(theme?.song);

  const entriesList = Array.isArray(theme?.entries)
    ? theme.entries
    : Array.isArray(theme?.animethemeentries)
    ? theme.animethemeentries
    : [];

  const sortedEntries = [...entriesList].sort((a: any, b: any) => {
    const va = a?.version != null && Number.isFinite(Number(a.version)) ? Number(a.version) : 1;
    const vb = b?.version != null && Number.isFinite(Number(b.version)) ? Number(b.version) : 1;
    if (va !== vb) return va - vb;
    return firstEpisodeNum(str(a?.episodes)) - firstEpisodeNum(str(b?.episodes));
  });

  const versions: ThemeVersionEntry[] = sortedEntries.map((e: any, idx: number) => {
    const vNum = e?.version != null && Number.isFinite(Number(e.version)) ? Math.floor(Number(e.version)) : idx + 1;
    const ep = sortEpisodes(str(e?.episodes));
    const notes = str(e?.notes);
    return {
      version: vNum,
      ...(ep ? { episodes: ep } : {}),
      ...(notes ? { notes } : {}),
      url: pickVideo([e])
    };
  });

  const multiVersion = versions.length > 1;
  const eps = sortEpisodes(versions.map((v) => v.episodes).filter(Boolean).join(', '));
  const epsSuffix = !multiVersion && eps ? ` ${formatEpsTag(eps)}` : '';

  const group = typeof theme?.group === 'object' && theme?.group !== null ? str(theme.group.name) : str(theme?.group);
  const type = str(theme?.type).toUpperCase() === 'ED' ? 'ED' : 'OP';

  const nativeTitle = str(theme?.song?.title?.native);
  const hasJp = !!nativeTitle || /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(songTitle);

  const resourcesList = Array.isArray(theme?.song?.resources?.nodes) ? theme.song.resources.nodes : [];
  const resources: Record<string, string> = {};
  for (const r of resourcesList) {
    const site = str(r?.site).toUpperCase();
    const link = str(r?.link);
    if (site && link) resources[site] = link;
  }

  return {
    sequence,
    title: songTitle,
    title_romaji: songTitle,
    title_jp: nativeTitle || (hasJp ? songTitle : undefined),
    artists,
    type,
    animeName: meta.animeName,
    animeRomaji: meta.animeRomaji,
    animeEn: meta.animeEn,
    animeJp: meta.animeJp,
    year: meta.year,
    season: meta.season,
    eps: eps || undefined,
    ...(multiVersion ? { versions } : {}),
    resources: Object.keys(resources).length ? resources : undefined,
    name:
      `${sequence}. "${songTitle}"` +
      (artistCredit ? ` by ${artistCredit}` : '') +
      epsSuffix +
      (group && group.toLowerCase().includes('dubbed') ? ` (${group})` : ''),
    url: versions.find((v) => v.url)?.url || null
  };
}

export function groupThemes(anime: any, meta: AnimeMetaInfo): ThemesGroup {
  const out: ThemesGroup = { OP: [], ED: [] };
  const themeList = Array.isArray(anime?.themes)
    ? anime.themes
    : Array.isArray(anime?.animethemes)
    ? anime.animethemes
    : [];
  for (const theme of themeList) {
    const parsed = parseTheme(theme, meta);
    const type = str(theme?.type).toUpperCase() as 'OP' | 'ED';
    if (parsed && out[type]) out[type].push(parsed);
  }
  const sort = (a: SongEntry, b: SongEntry) => a.sequence - b.sequence || a.name.localeCompare(b.name);
  out.OP.sort(sort);
  out.ED.sort(sort);
  return out;
}

const COLLAPSE_FALLBACK_MS = 260;

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface ActivePlayer {
  wrap: HTMLDivElement;
  video: HTMLVideoElement;
  row: HTMLElement | null;
}

const cancelClosingMap = new WeakMap<HTMLElement, () => void>();

function createCollapsibleVideo(videoUrl: string): { wrap: HTMLDivElement; video: HTMLVideoElement } {
  const wrap = document.createElement('div');
  wrap.className = 'daiya-anisong-collapsible';

  const inner = document.createElement('div');
  inner.className = 'daiya-anisong-collapsible-inner';

  const pad = document.createElement('div');
  pad.className = 'daiya-anisong-video-pad';

  const video = document.createElement('video');
  video.controls = true;
  video.preload = 'none';
  video.volume = 0.4;
  video.src = videoUrl;
  video.addEventListener('click', (ev) => ev.stopPropagation());

  pad.appendChild(video);
  inner.appendChild(pad);
  wrap.appendChild(inner);
  return { wrap, video };
}

export function createSongCard(song: SongEntry, activePresets: SongProviderPreset[], groupType: 'OP' | 'ED'): HTMLDivElement {
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

    activePresets.forEach((p) => {
      if (!p || !p.url) return;
      const a = document.createElement('a');
      a.className = 'daiya-anisong-link';
      const { url, isDirect } = resolveProviderLink(p, song, groupType);
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = isDirect ? `Listen on ${p.name}` : `Search on ${p.name}`;
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

  let active: ActivePlayer | null = null;
  const closingByRow = new Map<HTMLElement | null, ActivePlayer>();

  function closePlayer(player: ActivePlayer): void {
    player.video.pause?.();
    player.row?.classList.remove('is-active');
    if (prefersReducedMotion()) {
      player.wrap.remove();
      return;
    }

    closingByRow.set(player.row, player);
    player.wrap.classList.remove('is-open');

    let done = false;
    const detach = () => {
      if (done) return false;
      done = true;
      clearTimeout(timer);
      player.wrap.removeEventListener('transitionend', onEnd);
      cancelClosingMap.delete(player.wrap);
      if (closingByRow.get(player.row) === player) closingByRow.delete(player.row);
      return true;
    };
    const finish = () => {
      if (detach()) player.wrap.remove();
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target === player.wrap && e.propertyName === 'grid-template-rows') finish();
    };
    const timer = setTimeout(finish, COLLAPSE_FALLBACK_MS);
    player.wrap.addEventListener('transitionend', onEnd);
    cancelClosingMap.set(player.wrap, detach);
  }

  function toggleVideo(videoUrl: string, row: HTMLElement | null): void {
    const prev = active;
    if (prev && prev.row === row) {
      active = null;
      closePlayer(prev);
      return;
    }

    const reduced = prefersReducedMotion();
    const revived = closingByRow.get(row) || null;
    let next: ActivePlayer;

    if (revived) {
      cancelClosingMap.get(revived.wrap)?.();
      next = revived;
    } else {
      const { wrap, video } = createCollapsibleVideo(videoUrl);
      next = { wrap, video, row };
      if (row) row.insertAdjacentElement('afterend', next.wrap);
      else el.appendChild(next.wrap);
      if (!reduced) void next.wrap.offsetHeight;
    }

    if (prev) closePlayer(prev);

    active = next;
    row?.classList.add('is-active');
    next.wrap.classList.add('is-open');
    Promise.resolve(next.video.play?.()).catch(() => {});
  }

  const versions = Array.isArray(song.versions) && song.versions.length > 1 ? song.versions : null;
  if (versions) {
    el.classList.add('has-versions');
    const list = document.createElement('div');
    list.className = 'daiya-anisongs-versions';

    versions.forEach((v) => {
      const row = document.createElement('div');
      row.className = 'daiya-anisong-version';

      const badge = document.createElement('span');
      badge.className = 'daiya-anisong-version-tag';
      badge.textContent = `v${v.version}`;
      row.appendChild(badge);

      const metaParts: string[] = [];
      if (v.episodes) metaParts.push(formatEpsTag(v.episodes));
      if (v.notes) metaParts.push(`— ${v.notes}`);
      if (metaParts.length) {
        const info = document.createElement('span');
        info.className = 'daiya-anisong-version-meta';
        info.textContent = metaParts.join(' ');
        row.appendChild(info);
      }

      if (v.url) {
        const verUrl = v.url;
        row.classList.add('has-video');
        row.setAttribute('role', 'button');
        row.tabIndex = 0;
        row.addEventListener('click', (e) => {
          if (e.target instanceof HTMLVideoElement) return;
          toggleVideo(verUrl, row);
        });
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleVideo(verUrl, row);
          }
        });
      }

      list.appendChild(row);
    });

    el.appendChild(list);
    return el;
  }

  const url = song.url;
  if (!url) return el;

  el.classList.add('has-video');
  header.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.daiya-anisong-actions')) return;
    if (e.target instanceof HTMLVideoElement) return;
    toggleVideo(url, null);
  });

  return el;
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
    const API = 'https://rs.animethemes.moe/graphql';
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
      #${ROOT} .daiya-anisong-collapsible{display:grid;grid-template-rows:0fr;transition:grid-template-rows .22s cubic-bezier(0.4,0,0.2,1),visibility 0s .22s;visibility:hidden;overflow:hidden}
      #${ROOT} .daiya-anisong-collapsible.is-open{grid-template-rows:1fr;transition:grid-template-rows .22s cubic-bezier(0.4,0,0.2,1),visibility 0s 0s;visibility:visible}
      #${ROOT} .daiya-anisong-collapsible-inner{min-height:0;overflow:hidden}
      #${ROOT} .daiya-anisong-video-pad{padding-top:10px}
      #${ROOT} .daiya-anisongs-versions .daiya-anisong-video-pad{padding:4px 0 6px}
      #${ROOT} video{display:block;width:100%;max-width:39em;aspect-ratio:16/9;background:#000;border-radius:4px;cursor:auto}
      #${ROOT} .daiya-anisongs-versions{display:flex;flex-direction:column;margin-top:8px;padding-top:6px;border-top:1px solid rgba(var(--color-text-lighter),.15)}
      #${ROOT} .daiya-anisong-version{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:4px;font-size:1.2rem;color:rgb(var(--color-text-lighter));transition:color .15s,background .15s}
      #${ROOT} .daiya-anisongs-versions>.daiya-anisong-version~.daiya-anisong-version{margin-top:4px}
      #${ROOT} .daiya-anisong-version-tag{font-weight:700;color:rgb(var(--color-text))}
      #${ROOT} .daiya-anisong-version.has-video{cursor:pointer}
      #${ROOT} .daiya-anisong-version.has-video:hover{color:rgb(var(--color-blue));background:rgba(var(--color-blue),.08)}
      #${ROOT} .daiya-anisong-version.has-video:hover .daiya-anisong-version-tag{color:rgb(var(--color-blue))}
      #${ROOT} .daiya-anisong-version.is-active{color:rgb(var(--color-blue));background:rgba(var(--color-blue),.14)}
      #${ROOT} .daiya-anisong-version.is-active .daiya-anisong-version-tag{color:rgb(var(--color-blue))}
      #${ROOT} .daiya-anisongs-empty{text-align:center;opacity:.7;padding:10px}
      @media (max-width:700px){#${ROOT} .daiya-anisongs-columns{flex-direction:column;gap:10px}}
      @media (prefers-reduced-motion:reduce){#${ROOT} .daiya-anisong-collapsible,#${ROOT} .daiya-anisong-entry.has-video .daiya-anisong-title,#${ROOT} .daiya-anisong-link,#${ROOT} .daiya-anisong-version{transition:none!important}}`
    );

    const cacheStore = persistent<Record<string, AnimeThemesCacheEntry>>('daiya_anisongs_cache_v8', (d) => {
      for (const id of Object.keys(d)) {
        if (!(Number(d[id]?.expires) > Date.now())) delete d[id];
      }
    });
    const cache = cacheStore.data;

    const atQuery = `query ($id: [Int!]) {
      filterAnimeByExternalSite(site: ANILIST, id: $id) {
        title { romaji native }
        themes {
          type
          sequence
          group { name }
          song {
            title { romaji native }
            staff {
              role
              relevance
              alias
              as
              artist {
                name { main }
              }
            }
            resources {
              nodes {
                site
                link
              }
            }
          }
          entries {
            episodes
            version
            notes
            videos {
              nodes {
                link
                source
                basename
              }
            }
          }
        }
      }
    }`;

    const loadThemes = memo(async (id: string | number): Promise<ThemesGroup> => {
      const hit = cache[String(id)];
      if (hit && hit.expires > Date.now()) return hit.data;

      const alQuery = `query ($id: Int) {
        Media(id: $id) {
          title { userPreferred english romaji native }
          seasonYear
          season
        }
      }`;

      const [themesRes, alRes] = await Promise.allSettled([
        gm.json(API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'AL-Additions'
          },
          data: JSON.stringify({
            query: atQuery,
            variables: { id: [Number(id)] }
          })
        }),
        AniList.query(alQuery, { id: Number(id) })
      ]);

      const result = themesRes.status === 'fulfilled' ? themesRes.value : null;
      const alMedia = alRes.status === 'fulfilled' ? alRes.value?.Media : null;
      const rawAnime = Array.isArray(result?.data?.filterAnimeByExternalSite)
        ? result.data.filterAnimeByExternalSite[0]
        : null;

      const animeName =
        str(alMedia?.title?.userPreferred) ||
        str(rawAnime?.title?.romaji) ||
        str(rawAnime?.name) ||
        document.querySelector('.header h1')?.textContent?.trim() ||
        '';

      const meta: AnimeMetaInfo = {
        animeName,
        animeRomaji: str(alMedia?.title?.romaji) || str(rawAnime?.title?.romaji) || str(rawAnime?.name) || animeName,
        animeEn: str(alMedia?.title?.english) || animeName,
        animeJp: str(alMedia?.title?.native) || str(rawAnime?.title?.native) || '',
        year: alMedia?.seasonYear || rawAnime?.year || '',
        season: alMedia?.season || rawAnime?.season || ''
      };

      const data = groupThemes(rawAnime, meta);
      const empty = !data.OP.length && !data.ED.length;
      cache[String(id)] = { expires: Date.now() + (empty ? EMPTY_TTL : TTL), data };
      cacheStore.save();
      return data;
    });

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
        songs.forEach((s) => g.appendChild(createSongCard(s, activePresets, groupType)));
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