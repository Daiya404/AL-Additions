import { describe, it, expect, vi } from 'vitest';
import {
  validateAniSongsConfig,
  buildProviderUrl,
  DEFAULT_ANISONGS_CONFIG,
  DEFAULT_PRESETS,
  type SongParams,
  type SongProviderPreset
} from '../src/modules/anisongs/anisongModal';
import {
  extractSongParams,
  parseTheme,
  groupThemes,
  pickVideo,
  resolveProviderLink,
  sortEpisodes,
  formatEpsTag,
  createSongCard,
  type SongEntry,
  type AnimeMetaInfo
} from '../src/modules/anisongs/anisongs';

describe('AniSongs: validateAniSongsConfig', () => {
  it('validates default config successfully with empty active array', () => {
    const res = validateAniSongsConfig(DEFAULT_ANISONGS_CONFIG);
    expect(res.valid).toBe(true);
    expect(res.config?.active).toEqual([]);
    expect(res.config?.presets).toHaveLength(DEFAULT_PRESETS.length);
  });

  it('parses valid JSON string configuration', () => {
    const raw = JSON.stringify({
      active: ['custom'],
      presets: [{ id: 'custom', name: 'Custom Search', url: 'https://search.com?q={title}' }]
    });
    const res = validateAniSongsConfig(raw);
    expect(res.valid).toBe(true);
    expect(res.config?.active).toEqual(['custom']);
  });

  it('filters out active items that do not exist in presets', () => {
    const raw = {
      active: ['ghost_service', 'youtube'],
      presets: [{ id: 'youtube', name: 'YouTube', url: 'https://youtube.com/search?q={title}' }]
    };
    const res = validateAniSongsConfig(raw);
    expect(res.valid).toBe(true);
    expect(res.config?.active).toEqual(['youtube']);
  });
});

describe('AniSongs: buildProviderUrl template substitution', () => {
  const song: SongParams = {
    title: 'KICK BACK',
    title_romaji: 'KICK BACK',
    title_jp: 'キックバック',
    artist: 'Kenshi Yonezu',
    artists: 'Kenshi Yonezu, Daiki Tsuneta',
    anime: 'Chainsaw Man',
    anime_romaji: 'Chainsaw Man',
    anime_en: 'Chainsaw Man',
    anime_jp: 'チェンソーマン',
    year: 2022,
    season: 'FALL',
    type: 'OP',
    number: 1
  };

  it('substitutes Japanese title and Japanese anime name without corrupting base tags', () => {
    const template = 'https://youtube.com/results?search_query={anime_jp}+{title_jp}';
    const result = buildProviderUrl(template, song);
    expect(result).toBe('https://youtube.com/results?search_query=%E3%83%81%E3%82%A7%E3%83%B3%E3%82%BD%E3%83%BC%E3%83%9E%E3%83%B3+%E3%82%AD%E3%83%83%E3%82%AF%E3%83%90%E3%83%83%E3%82%AF');
  });

  it('substitutes theme code and query_jp shortcut', () => {
    const template = 'https://youtube.com/results?search_query={query_jp}';
    const result = buildProviderUrl(template, song);
    expect(result).toBe(
      'https://youtube.com/results?search_query=%E3%83%81%E3%82%A7%E3%83%B3%E3%82%BD%E3%83%BC%E3%83%9E%E3%83%B3%20OP1'
    );

    const templateWithPlus = 'https://youtube.com/results?search_query={anime_jp}+{theme}';
    const resultWithPlus = buildProviderUrl(templateWithPlus, song);
    expect(resultWithPlus).toBe(
      'https://youtube.com/results?search_query=%E3%83%81%E3%82%A7%E3%83%B3%E3%82%BD%E3%83%BC%E3%83%9E%E3%83%B3+OP1'
    );
  });

  it('substitutes multiple artists and year/season', () => {
    const template = 'https://open.spotify.com/search/{title}%20{artists}%20{year}';
    const result = buildProviderUrl(template, song);
    expect(result).toBe('https://open.spotify.com/search/KICK%20BACK%20Kenshi%20Yonezu%2C%20Daiki%20Tsuneta%202022');
  });

  it('substitutes combined {query}', () => {
    const template = 'https://aniplaylist.com/?search={query}';
    const result = buildProviderUrl(template, song);
    expect(result).toBe('https://aniplaylist.com/?search=KICK%20BACK%20Kenshi%20Yonezu');
  });
});

describe('AniSongs: extractSongParams legacy fallback', () => {
  it('correctly parses legacy cached entries missing title/artists', () => {
    const legacySong = {
      sequence: 2,
      name: '2. "Gurenge" by LiSA (eps 1-13)',
      url: 'https://example.com/video.webm'
    };
    const params = extractSongParams(legacySong, 'OP');
    expect(params.title).toBe('Gurenge');
    expect(params.artist).toBe('LiSA');
    expect(params.type).toBe('OP');
    expect(params.number).toBe(2);
    expect(params.title_jp).toBe('Gurenge');
  });
});

describe('AniSongs: GraphQL Theme Parsing & Video Resolution', () => {
  const meta: AnimeMetaInfo = {
    animeName: 'Chainsaw Man',
    animeRomaji: 'Chainsaw Man',
    animeEn: 'Chainsaw Man',
    animeJp: 'チェンソーマン',
    year: 2022,
    season: 'FALL'
  };

  it('parses AnimeThemes GraphQL theme with SongTitle, staff, ThemeGroup and resources', () => {
    const rawTheme = {
      type: 'OP',
      sequence: 1,
      group: { name: 'Main' },
      song: {
        title: {
          romaji: 'KICK BACK',
          native: 'キックバック'
        },
        staff: [
          { role: 'Performance', relevance: 1, as: null, artist: { name: { main: 'Kenshi Yonezu' } } },
          { role: 'Arrangement', relevance: 2, as: null, artist: { name: { main: 'Daiki Tsuneta' } } }
        ],
        resources: {
          nodes: [
            { site: 'SPOTIFY', link: 'https://open.spotify.com/track/3khEEPRyBeOUabbmOPJzAG' },
            { site: 'YOUTUBE', link: 'https://www.youtube.com/watch?v=M2cckDmNLMI' }
          ]
        }
      },
      entries: [
        {
          episodes: '1-12',
          version: 1,
          videos: {
            nodes: [
              { link: 'https://v.animethemes.moe/ChainsawMan-OP1-NCBD1080.webm', source: 'BD', basename: 'ChainsawMan-OP1-NCBD1080.webm' },
              { link: 'https://v.animethemes.moe/ChainsawMan-OP1.webm', source: 'WEB', basename: 'ChainsawMan-OP1.webm' }
            ]
          }
        }
      ]
    };

    const entry = parseTheme(rawTheme, meta);
    expect(entry).not.toBeNull();
    expect(entry?.sequence).toBe(1);
    expect(entry?.title).toBe('KICK BACK');
    expect(entry?.title_romaji).toBe('KICK BACK');
    expect(entry?.title_jp).toBe('キックバック');
    expect(entry?.artists).toEqual(['Kenshi Yonezu']);
    expect(entry?.type).toBe('OP');
    expect(entry?.eps).toBe('1-12');
    expect(entry?.resources).toEqual({
      SPOTIFY: 'https://open.spotify.com/track/3khEEPRyBeOUabbmOPJzAG',
      YOUTUBE: 'https://www.youtube.com/watch?v=M2cckDmNLMI'
    });
    // Prefers WEB video source over BD
    expect(entry?.url).toBe('https://v.animethemes.moe/ChainsawMan-OP1.webm');
  });

  it('defaults sequence to 1 when sequence is null in GraphQL response', () => {
    const rawTheme = {
      type: 'ED',
      sequence: null,
      group: null,
      song: {
        title: { romaji: 'Vita Philosophica', native: null },
        staff: [{ as: null, artist: { name: { main: 'Kashitarou Itou' } } }]
      },
      entries: [
        {
          episodes: '2-11',
          version: 1,
          videos: {
            nodes: [{ link: 'https://v.animethemes.moe/WatashiNoShiawase-ED1.webm', source: 'WEB' }]
          }
        }
      ]
    };

    const entry = parseTheme(rawTheme, meta);
    expect(entry?.sequence).toBe(1);
    expect(entry?.name).toContain('1. "Vita Philosophica" by Kashitarou Itou (eps 2-11)');
  });

  it('correctly sorts and groups OP and ED themes in groupThemes', () => {
    const anime = {
      title: { romaji: 'Chainsaw Man' },
      themes: [
        {
          type: 'ED',
          sequence: 2,
          song: { title: { romaji: 'Zanki' } }
        },
        {
          type: 'OP',
          sequence: 1,
          song: { title: { romaji: 'KICK BACK' } }
        },
        {
          type: 'ED',
          sequence: 1,
          song: { title: { romaji: 'Chainsaw Blood' } }
        }
      ]
    };

    const grouped = groupThemes(anime, meta);
    expect(grouped.OP).toHaveLength(1);
    expect(grouped.OP[0].title).toBe('KICK BACK');
    expect(grouped.ED).toHaveLength(2);
    expect(grouped.ED[0].title).toBe('Chainsaw Blood');
    expect(grouped.ED[1].title).toBe('Zanki');
  });

  it('filters out non-performer roles and deduplicates multi-role artists (e.g. Sugar Salt)', () => {
    const rawTheme = {
      type: 'OP',
      sequence: 1,
      song: {
        title: { romaji: 'Sugar Salt' },
        staff: [
          { role: 'Arrangement', relevance: 4, artist: { name: { main: 'Masayoshi Ooishi' } } },
          { role: 'Composition', relevance: 3, artist: { name: { main: 'Masayoshi Ooishi' } } },
          { role: 'Lyrics', relevance: 2, artist: { name: { main: 'Masayoshi Ooishi' } } },
          { role: 'Performance', relevance: 1, artist: { name: { main: 'Masayoshi Ooishi' } } }
        ]
      },
      entries: [{ episodes: '1-' }]
    };

    const entry = parseTheme(rawTheme, meta);
    expect(entry?.artists).toEqual(['Masayoshi Ooishi']);
    expect(entry?.name).toBe('1. "Sugar Salt" by Masayoshi Ooishi (eps 1-)');
  });

  it('formats Performance + Featuring roles with feat. and sorts by relevance (e.g. Hatsukoi Reply)', () => {
    const rawTheme = {
      type: 'OP',
      sequence: 1,
      song: {
        title: { romaji: 'Hatsukoi Reply' },
        staff: [
          { role: 'Arrangement', relevance: 7, artist: { name: { main: 'HoneyWorks' } } },
          { role: 'Lyrics', relevance: 3, artist: { name: { main: 'HoneyWorks' } } },
          { role: 'Featuring', relevance: 2, artist: { name: { main: 'Sara Hoshikawa' } } },
          { role: 'Performance', relevance: 1, artist: { name: { main: 'HoneyWorks' } } },
          { role: 'Composition', relevance: 6, artist: { name: { main: 'MARUMOCHI' } } }
        ]
      },
      entries: [{ episodes: '1-' }]
    };

    const entry = parseTheme(rawTheme, meta);
    expect(entry?.artists).toEqual(['HoneyWorks', 'Sara Hoshikawa']);
    expect(entry?.name).toBe('1. "Hatsukoi Reply" by HoneyWorks feat. Sara Hoshikawa (eps 1-)');
  });

  it('deduplicates repeated group/band credits across member rows (e.g. Kessoku Band)', () => {
    const rawTheme = {
      type: 'OP',
      sequence: 1,
      song: {
        title: { romaji: 'Seishun Complex' },
        staff: [
          { role: 'Performance', relevance: 3, as: null, artist: { name: { main: 'Kessoku Band' } }, memberAs: 'Hitori Gotou' },
          { role: 'Performance', relevance: 1, as: null, artist: { name: { main: 'Kessoku Band' } }, memberAs: 'Nijika Ijichi' },
          { role: 'Performance', relevance: 2, as: null, artist: { name: { main: 'Kessoku Band' } }, memberAs: 'Ikuyo Kita' },
          { role: 'Performance', relevance: 4, as: null, artist: { name: { main: 'Kessoku Band' } }, memberAs: 'Ryou Yamada' }
        ]
      }
    };

    const entry = parseTheme(rawTheme, meta);
    expect(entry?.artists).toEqual(['Kessoku Band']);
    expect(entry?.name).toBe('1. "Seishun Complex" by Kessoku Band');
  });

  it('orders multi-character performers by relevance and prefers as over artist name', () => {
    const rawTheme = {
      type: 'ED',
      sequence: 7,
      song: {
        title: { romaji: 'Yume Kataru Yori Yume Utaou' },
        staff: [
          { role: 'Performance', relevance: 3, as: 'Yoshiko Tsushima', artist: { name: { main: 'Aika Kobayashi' } } },
          { role: 'Performance', relevance: 1, as: 'Hanamaru Kunikida', artist: { name: { main: 'Kanako Takatsuki' } } },
          { role: 'Performance', relevance: 2, as: 'Ruby Kurosawa', artist: { name: { main: 'Ai Furihata' } } }
        ]
      }
    };

    const entry = parseTheme(rawTheme, meta);
    expect(entry?.artists).toEqual(['Hanamaru Kunikida', 'Ruby Kurosawa', 'Yoshiko Tsushima']);
    expect(entry?.name).toBe('7. "Yume Kataru Yori Yume Utaou" by Hanamaru Kunikida, Ruby Kurosawa, Yoshiko Tsushima');
  });
});

describe('AniSongs: resolveProviderLink Strict ID Matching', () => {
  const songWithDirect: SongEntry = {
    sequence: 1,
    name: '1. "KICK BACK" by Kenshi Yonezu',
    url: 'https://v.animethemes.moe/ChainsawMan-OP1.webm',
    title: 'KICK BACK',
    artists: ['Kenshi Yonezu'],
    type: 'OP',
    animeName: 'Chainsaw Man',
    resources: {
      SPOTIFY: 'https://open.spotify.com/track/3khEEPRyBeOUabbmOPJzAG',
      YOUTUBE: 'https://www.youtube.com/watch?v=M2cckDmNLMI'
    }
  };

  const songWithoutDirect: SongEntry = {
    sequence: 1,
    name: '1. "KICK BACK" by Kenshi Yonezu',
    url: 'https://v.animethemes.moe/ChainsawMan-OP1.webm',
    title: 'KICK BACK',
    artists: ['Kenshi Yonezu'],
    type: 'OP',
    animeName: 'Chainsaw Man',
    resources: {}
  };

  const spotifyPreset: SongProviderPreset = {
    id: 'spotify',
    name: 'Spotify',
    icon: 'https://example.com/spotify.png',
    url: 'https://open.spotify.com/search/{title}%20{artist}'
  };

  const youtubePreset: SongProviderPreset = {
    id: 'youtube',
    name: 'YouTube',
    icon: 'https://example.com/yt.png',
    url: 'https://www.youtube.com/results?search_query={title}+{artist}'
  };

  const youtubeThemePreset: SongProviderPreset = {
    id: 'youtube_theme',
    name: 'YouTube (Anime + Theme)',
    icon: 'https://example.com/yt.png',
    url: 'https://www.youtube.com/results?search_query={anime}+{theme}'
  };

  const youtubeJpPreset: SongProviderPreset = {
    id: 'youtube_jp',
    name: 'YouTube (Japanese Anime + Theme)',
    icon: 'https://example.com/yt.png',
    url: 'https://www.youtube.com/results?search_query={anime_jp}+{theme}'
  };

  const aniplaylistPreset: SongProviderPreset = {
    id: 'aniplaylist',
    name: 'AniPlaylist',
    icon: 'https://example.com/aniplaylist.png',
    url: 'https://aniplaylist.com/{title}'
  };

  it('uses direct link when preset ID strictly matches and direct link is present', () => {
    const spotifyRes = resolveProviderLink(spotifyPreset, songWithDirect, 'OP');
    expect(spotifyRes.isDirect).toBe(true);
    expect(spotifyRes.url).toBe('https://open.spotify.com/track/3khEEPRyBeOUabbmOPJzAG');

    const ytRes = resolveProviderLink(youtubePreset, songWithDirect, 'OP');
    expect(ytRes.isDirect).toBe(true);
    expect(ytRes.url).toBe('https://www.youtube.com/watch?v=M2cckDmNLMI');
  });

  it('falls back to search template when direct link is not present for matching preset ID', () => {
    const spotifyRes = resolveProviderLink(spotifyPreset, songWithoutDirect, 'OP');
    expect(spotifyRes.isDirect).toBe(false);
    expect(spotifyRes.url).toBe('https://open.spotify.com/search/KICK%20BACK%20Kenshi%20Yonezu');
  });

  it('never uses direct link for youtube_theme or youtube_jp even when YOUTUBE direct link exists', () => {
    const themeRes = resolveProviderLink(youtubeThemePreset, songWithDirect, 'OP');
    expect(themeRes.isDirect).toBe(false);
    expect(themeRes.url).toBe('https://www.youtube.com/results?search_query=Chainsaw+Man+OP1');

    const jpRes = resolveProviderLink(youtubeJpPreset, songWithDirect, 'OP');
    expect(jpRes.isDirect).toBe(false);
    expect(jpRes.url).toBe('https://www.youtube.com/results?search_query=Chainsaw+Man+OP1');
  });

  it('never uses direct link for custom or third-party preset IDs like aniplaylist', () => {
    const aniRes = resolveProviderLink(aniplaylistPreset, songWithDirect, 'OP');
    expect(aniRes.isDirect).toBe(false);
    expect(aniRes.url).toBe('https://aniplaylist.com/KICK%20BACK');
  });
});

describe('AniSongs: Episode Sorting, Formatting & Multi-Version Theme Cards', () => {
  const meta: AnimeMetaInfo = {
    animeName: 'Kyouran Reijou Nia Liston',
    animeRomaji: 'Kyouran Reijou Nia Liston',
    animeEn: 'Nia Liston',
    animeJp: '',
    year: 2026,
    season: 'FALL'
  };

  it('sorts comma-separated episode segments numerically and formats ep vs eps', () => {
    expect(sortEpisodes('2, 5, 3, 6, 4')).toBe('2, 3, 4, 5, 6');
    expect(sortEpisodes('10, 2, 1-3')).toBe('1-3, 2, 10');
    expect(sortEpisodes('7-')).toBe('7-');
    expect(formatEpsTag('4')).toBe('(ep 4)');
    expect(formatEpsTag('2, 5')).toBe('(eps 2, 5)');
    expect(formatEpsTag('1-3, 5-6')).toBe('(eps 1-3, 5-6)');
    expect(formatEpsTag('7-')).toBe('(eps 7-)');
  });

  it('parses multi-version theme entries sorted by version with notes and separate URLs', () => {
    const rawTheme = {
      type: 'ED',
      sequence: 1,
      song: {
        title: { romaji: 'Tokimeki Un Deux Trois♪' },
        staff: [{ role: 'Performance', relevance: 1, artist: { name: { main: 'Magic Vision Hirome-tai' } } }]
      },
      entries: [
        {
          version: 2,
          episodes: '3, 6',
          notes: 'rock',
          videos: { nodes: [{ link: 'https://v.animethemes.moe/NiaListon-ED1v2.webm', source: 'WEB' }] }
        },
        {
          version: 3,
          episodes: '4',
          notes: 'paper',
          videos: { nodes: [{ link: 'https://v.animethemes.moe/NiaListon-ED1v3.webm', source: 'WEB' }] }
        },
        {
          version: 1,
          episodes: '5, 2',
          notes: 'scissors',
          videos: { nodes: [{ link: 'https://v.animethemes.moe/NiaListon-ED1.webm', source: 'WEB' }] }
        }
      ]
    };

    const entry = parseTheme(rawTheme, meta);
    expect(entry).not.toBeNull();
    expect(entry?.name).toBe('1. "Tokimeki Un Deux Trois♪" by Magic Vision Hirome-tai');
    expect(entry?.eps).toBe('2, 3, 4, 5, 6');
    expect(entry?.versions).toEqual([
      {
        version: 1,
        episodes: '2, 5',
        notes: 'scissors',
        url: 'https://v.animethemes.moe/NiaListon-ED1.webm'
      },
      {
        version: 2,
        episodes: '3, 6',
        notes: 'rock',
        url: 'https://v.animethemes.moe/NiaListon-ED1v2.webm'
      },
      {
        version: 3,
        episodes: '4',
        notes: 'paper',
        url: 'https://v.animethemes.moe/NiaListon-ED1v3.webm'
      }
    ]);
  });

  it('keeps single-version card clickable via header and animates multi-version switching across rows', () => {
    vi.useFakeTimers();
    const singleSong: SongEntry = {
      sequence: 1,
      name: '1. "Anata no Soba ni." by Riria. (eps 1-12)',
      url: 'https://v.animethemes.moe/Single.webm',
      title: 'Anata no Soba ni.'
    };
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const originalMatchMedia = window.matchMedia;
    let reduced = false;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? reduced : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    }));

    try {
      const singleCard = createSongCard(singleSong, [], 'OP');
      expect(singleCard.classList.contains('has-video')).toBe(true);
      expect(singleCard.querySelector('.daiya-anisongs-versions')).toBeNull();

      const singleHeader = singleCard.querySelector('.daiya-anisong-header') as HTMLElement;
      singleHeader.click();
      const singleWrap = singleCard.querySelector('.daiya-anisong-collapsible') as HTMLElement;
      expect(singleWrap).not.toBeNull();
      expect(singleWrap.classList.contains('is-open')).toBe(true);
      expect(singleWrap.querySelector('video')?.src).toBe('https://v.animethemes.moe/Single.webm');

      // Closing removes .is-open immediately and removes wrapper after transition
      singleHeader.click();
      expect(singleWrap.classList.contains('is-open')).toBe(false);
      expect(singleCard.querySelectorAll('.daiya-anisong-collapsible')).toHaveLength(1);
      vi.advanceTimersByTime(260);
      expect(singleCard.querySelectorAll('.daiya-anisong-collapsible')).toHaveLength(0);

      const multiSong: SongEntry = {
        sequence: 1,
        name: '1. "Tokimeki Un Deux Trois♪" by Magic Vision Hirome-tai',
        url: 'https://v.animethemes.moe/NiaListon-ED1.webm',
        title: 'Tokimeki Un Deux Trois♪',
        versions: [
          { version: 1, episodes: '2, 5', notes: 'scissors', url: 'https://v.animethemes.moe/NiaListon-ED1.webm' },
          { version: 2, episodes: '3, 6', notes: 'rock', url: 'https://v.animethemes.moe/NiaListon-ED1v2.webm' },
          { version: 3, episodes: '4', notes: 'paper', url: 'https://v.animethemes.moe/NiaListon-ED1v3.webm' }
        ]
      };

      const multiCard = createSongCard(multiSong, [], 'ED');
      expect(multiCard.classList.contains('has-versions')).toBe(true);
      expect(multiCard.classList.contains('has-video')).toBe(false);

      const multiHeader = multiCard.querySelector('.daiya-anisong-header') as HTMLElement;
      multiHeader.click();
      expect(multiCard.querySelectorAll('video')).toHaveLength(0);

      const versionsList = multiCard.querySelector('.daiya-anisongs-versions') as HTMLElement;
      const rows = multiCard.querySelectorAll<HTMLElement>('.daiya-anisong-version');
      expect(rows).toHaveLength(3);
      expect(rows[0].querySelector('.daiya-anisong-version-tag')?.textContent).toBe('v1');
      expect(rows[0].querySelector('.daiya-anisong-version-meta')?.textContent).toBe('(eps 2, 5) — scissors');
      expect(rows[1].querySelector('.daiya-anisong-version-tag')?.textContent).toBe('v2');
      expect(rows[1].querySelector('.daiya-anisong-version-meta')?.textContent).toBe('(eps 3, 6) — rock');
      expect(rows[2].querySelector('.daiya-anisong-version-tag')?.textContent).toBe('v3');
      expect(rows[2].querySelector('.daiya-anisong-version-meta')?.textContent).toBe('(ep 4) — paper');

      // Clicking v1 opens v1 collapsible right after v1 (pushing v2 & v3 below)
      rows[0].click();
      const wrapV1 = rows[0].nextElementSibling as HTMLElement;
      expect(wrapV1?.classList.contains('daiya-anisong-collapsible')).toBe(true);
      expect(wrapV1?.classList.contains('is-open')).toBe(true);
      expect(wrapV1?.querySelector('video')?.src).toBe('https://v.animethemes.moe/NiaListon-ED1.webm');
      expect(rows[0].classList.contains('is-active')).toBe(true);

      // Clicking v2 simultaneously starts closing v1 (!is-open, paused) and opens v2 (is-open)
      const pausesBeforeSwitch = pauseSpy.mock.calls.length;
      rows[1].click();
      expect(pauseSpy.mock.calls.length).toBe(pausesBeforeSwitch + 1);
      const wrapV2 = rows[1].nextElementSibling as HTMLElement;
      expect(wrapV1.classList.contains('is-open')).toBe(false);
      expect(wrapV2?.classList.contains('daiya-anisong-collapsible')).toBe(true);
      expect(wrapV2?.classList.contains('is-open')).toBe(true);
      expect(wrapV2?.querySelector('video')?.src).toBe('https://v.animethemes.moe/NiaListon-ED1v2.webm');
      expect(rows[0].classList.contains('is-active')).toBe(false);
      expect(rows[1].classList.contains('is-active')).toBe(true);

      // Rapidly clicking v1 before collapse finishes revives wrapV1 in place without duplicating collapsibles
      rows[0].click();
      expect(multiCard.querySelectorAll('.daiya-anisong-collapsible')).toHaveLength(2);
      expect(wrapV1.classList.contains('is-open')).toBe(true);
      expect(wrapV2.classList.contains('is-open')).toBe(false);

      // Advance past transition: closing v2 collapsible is removed cleanly, only v1 remains
      vi.advanceTimersByTime(260);
      expect(multiCard.querySelectorAll('.daiya-anisong-collapsible')).toHaveLength(1);
      expect(Array.from(versionsList.children)).toEqual([rows[0], wrapV1, rows[1], rows[2]]);

      // With reduced motion enabled, switching or closing removes previous wrapper synchronously
      reduced = true;
      rows[1].click();
      expect(multiCard.querySelectorAll('.daiya-anisong-collapsible')).toHaveLength(1);
      const wrapV2Immediate = rows[1].nextElementSibling as HTMLElement;
      expect(Array.from(versionsList.children)).toEqual([rows[0], rows[1], wrapV2Immediate, rows[2]]);

      rows[1].click();
      expect(multiCard.querySelectorAll('.daiya-anisong-collapsible')).toHaveLength(0);
      expect(Array.from(versionsList.children)).toEqual([rows[0], rows[1], rows[2]]);
    } finally {
      window.matchMedia = originalMatchMedia;
      vi.useRealTimers();
      playSpy.mockRestore();
      pauseSpy.mockRestore();
    }
  });
});