import { describe, it, expect } from 'vitest';
import {
  validateAniSongsConfig,
  buildProviderUrl,
  DEFAULT_ANISONGS_CONFIG,
  DEFAULT_PRESETS,
  type SongParams
} from '../src/modules/anisongs/anisongModal';
import { extractSongParams } from '../src/modules/anisongs/anisongs';

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