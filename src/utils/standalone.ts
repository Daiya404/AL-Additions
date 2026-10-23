import { unsafeWindow } from 'vite-plugin-monkey/dist/client';
import { sleep } from './helpers';

export type StandaloneId = 'fastLoad' | 'tierLabels';

export interface StandaloneInfo {
  /** Name of the standalone userscript on Greasy Fork. */
  name: string;
  /** Setting key of the built-in version of the same feature. */
  settingKey: string;
}

export const STANDALONE: Record<StandaloneId, StandaloneInfo> = {
  fastLoad: { name: 'AniList Fast Load', settingKey: 'fastLoadEnabled' },
  tierLabels: { name: 'AniList Tier Labels', settingKey: 'tierLabelsEnabled' }
};

export const STANDALONE_IDS_LIST = Object.keys(STANDALONE) as StandaloneId[];

export const isStandaloneId = (id: string | undefined): id is StandaloneId =>
  !!id && Object.prototype.hasOwnProperty.call(STANDALONE, id);

/** Attribute on the hidden element used to probe for standalone Tier Labels; the built-in version ignores it. */
export const PROBE_ATTR = 'data-ala-probe';

const builtInRunning = new Set<StandaloneId>();

/** Called by a built-in feature once it has actually started, so it is never mistaken for the standalone script. */
export const markBuiltIn = (id: StandaloneId): void => {
  builtInRunning.add(id);
};

const pageWin = (): any => (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);

/**
 * The standalone Fast Load (and the built-in one) announce themselves with the same page-level flag.
 * If the flag is set and the built-in version did not set it, the standalone script is running.
 */
export function detectFastLoad(): boolean {
  const w = pageWin();
  return !!(w.__ANILIST_FAST_LOAD__ || w.__ANILIST_FAST_LOAD_V4__) && !builtInRunning.has('fastLoad');
}

/**
 * The standalone Tier Labels leaves no global, but it processes every `.score` element added to the page
 * and marks it with `data-tier-modified`. Add a hidden one and see whether anything marks it.
 */
export async function probeTierLabels(timeoutMs = 600): Promise<boolean> {
  if (!document.body) return false;
  const probe = document.createElement('div');
  probe.className = 'score';
  probe.hidden = true;
  probe.setAttribute('score', '9');
  probe.setAttribute(PROBE_ATTR, '1');
  probe.textContent = '9';
  document.body.appendChild(probe);
  try {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      await sleep(50);
      if (probe.hasAttribute('data-tier-modified')) return true;
    }
    return false;
  } finally {
    probe.remove();
  }
}

const CACHE_MS = 30_000;
const cache = new Map<StandaloneId, { at: number; result: Promise<boolean> }>();

/** Resolves true when the standalone userscript for this feature is installed and running. Cached briefly. */
export function detectStandalone(id: StandaloneId): Promise<boolean> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;
  const result = (id === 'fastLoad' ? Promise.resolve(detectFastLoad()) : probeTierLabels()).catch(() => false);
  cache.set(id, { at: Date.now(), result });
  return result;
}