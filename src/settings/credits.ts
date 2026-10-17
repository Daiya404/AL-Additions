import { unsafeWindow } from 'vite-plugin-monkey/dist/client';
import { esc } from '../utils/helpers';

export interface CreditItem {
  name: string;
  url?: string;
  note: string;
  works?: [string, string][];
}

export const CREDITS: CreditItem[] = [
  {
    name: 'Daiya',
    url: 'https://github.com/Daiya404',
    note: 'Combining, fixing and maintaining this script. Everything not credited below, such as the Keyframe Staff List button and the List Score & Progress Editor, is original work.',
    works: [['AL-Additions on GitHub', 'https://github.com/Daiya404/AL-Additions']]
  },
  {
    name: 'Plennhar',
    url: 'https://greasyfork.org/en/users/1323916-plennhar',
    note: 'Browse Tag Rank Filter and Airing Progress Indicator.',
    works: [
      ['AniList Browse: set default minimum tag percentage to 50', 'https://greasyfork.org/en/scripts/559539-anilist-browse-set-default-minimum-tag-percentage-to-50'],
      ['AniList: color airing dots on anime lists orange if the user is behind on episodes', 'https://greasyfork.org/en/scripts/563899-anilist-color-airing-dots-on-anime-lists-orange-if-the-user-is-behind-on-episodes']
    ]
  },
  {
    name: 'Morimasa',
    url: 'https://greasyfork.org/en/users/61126-morimasa',
    note: 'Anime OP/ED songs.',
    works: [['Anisongs', 'https://greasyfork.org/en/scripts/374785-anisongs']]
  },
  {
    name: 'Samu',
    url: 'https://greasyfork.org/en/users/17840-samu',
    note: 'Nyaa search link.',
    works: [['Find on Nyaa', 'https://greasyfork.org/en/scripts/379776-find-on-nyaa']]
  },
  {
    name: 'trevor229',
    url: 'https://greasyfork.org/en/users/158806-trevor229',
    note: 'Banner Downloader.',
    works: [['AniList Banner Downloader', 'https://greasyfork.org/en/scripts/370470-anilist-banner-downloader']]
  },
  {
    name: 'meatloaf1',
    url: 'https://greasyfork.org/en/users/1630083-meatloaf1',
    note: 'Short AniList URLs.',
    works: [['Remove AniList titles from URL', 'https://greasyfork.org/en/scripts/589540-remove-anilist-titles-from-url']]
  },
  {
    name: 'MALSync',
    url: 'https://github.com/MALSync',
    note: 'Inspiration for the MyAnimeList sync, and for the episode/chapter and score embedding.',
    works: [['MALSync on GitHub', 'https://github.com/MALSync/MALSync']]
  },
  {
    name: 'MatiX221',
    url: 'https://github.com/MatiX221',
    note: 'The API limit fix idea, and a refactor that modularises the code.',
    works: [['MatiX221/AL-Additions', 'https://github.com/MatiX221/AL-Additions']]
  },
  { name: 'Claude & ChatGPT', note: 'AI assistance throughout the consolidation and fixes.' }
];

export const creditLink = (url: string, text: string, cls = ''): string =>
  `<a${cls ? ` class="${cls}"` : ''} href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;

export const creditsHtml = (): string =>
  CREDITS.map(
    (c) =>
      `<div class="ala-credit"><b>${c.url ? creditLink(c.url, c.name) : esc(c.name)}</b> — ${esc(c.note)}${
        c.works ? `<ul>${c.works.map(([label, url]) => `<li>${creditLink(url, label)}</li>`).join('')}</ul>` : ''
      }</div>`
  ).join('');

export const FAST_LOAD_URL = 'https://greasyfork.org/en/scripts/598442-anilist-fast-load';

export function fastLoadInstalled(): boolean {
  try {
    const w = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window) as any;
    return !!(w.__ANILIST_FAST_LOAD__ || w.__ANILIST_FAST_LOAD_V4__);
  } catch (_) {
    return false;
  }
}