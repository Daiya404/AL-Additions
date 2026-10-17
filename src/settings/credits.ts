import { unsafeWindow } from 'vite-plugin-monkey/dist/client';

export const CREDITS: [string, string][] = [
  ['Daiya', 'Combining, fixing, and adding original features.'],
  ['Claude & ChatGPT', 'AI assistance throughout the consolidation and fixes.'],
  ['Plennhar', 'Behind Episode Dots, Anisong, and Minimum Tags.'],
  ['Samu', 'Find on Nyaa.'],
  ['DJ-TrainR3k', 'Banner Downloader.'],
  ['Meatloaf1', 'Remove Titles from URL.'],
  ['MALSync', 'Base MALSync, episode/chapter and score embedding.'],
  ['Matix', 'API Limit Fix Idea.']
];

export const FAST_LOAD_URL = 'https://greasyfork.org/en/scripts/598442-anilist-fast-load';

export function fastLoadInstalled(): boolean {
  try {
    const w = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window) as any;
    return !!(w.__ANILIST_FAST_LOAD__ || w.__ANILIST_FAST_LOAD_V4__);
  } catch (_) {
    return false;
  }
}