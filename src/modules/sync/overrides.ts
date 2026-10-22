import { store } from '../../utils/helpers';
import { AniList } from '../../api/anilist';
import { PREFIX } from '../../settings/settings';
import { ManualOverride, ManualOverrideStore, SyncMediaType } from './types';

export const OVERRIDES_SETTING_KEY = 'syncManualOverrides';

export function getManualOverrides(): ManualOverrideStore {
  let raw = store.get<any>(PREFIX + OVERRIDES_SETTING_KEY, {});
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch (_) {
      raw = {};
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw;
}

export function saveManualOverrides(overrides: ManualOverrideStore): void {
  store.set(PREFIX + OVERRIDES_SETTING_KEY, overrides);
  const hiddenInput = document.querySelector<HTMLInputElement>(
    `#ala-settings-panel input[data-key="${OVERRIDES_SETTING_KEY}"]`
  );
  if (hiddenInput) {
    hiddenInput.value = JSON.stringify(overrides);
  }
}

export function getOverride(mediaId: number): ManualOverride | undefined {
  if (!mediaId) return undefined;
  return getManualOverrides()[String(mediaId)];
}

export function setOverride(
  mediaId: number,
  data: Omit<ManualOverride, 'updatedAt'> & { updatedAt?: number }
): void {
  if (!mediaId) return;
  const all = { ...getManualOverrides() };
  all[String(mediaId)] = {
    ...data,
    updatedAt: data.updatedAt || Date.now()
  };
  saveManualOverrides(all);
}

export function removeOverride(mediaId: number): void {
  if (!mediaId) return;
  const all = { ...getManualOverrides() };
  delete all[String(mediaId)];
  saveManualOverrides(all);
}

export function isIgnored(mediaId: number): boolean {
  const o = getOverride(mediaId);
  return !!o && o.malId === 0;
}

export function getEffectiveMalId(mediaId: number, defaultMalId?: number | null): number | null {
  const o = getOverride(mediaId);
  if (o) {
    return o.malId > 0 ? o.malId : null;
  }
  return defaultMalId && defaultMalId > 0 ? defaultMalId : null;
}

const STALE_MS = 24 * 3600 * 1000;
let refreshing = false;

export async function refreshStaleOverrides(): Promise<void> {
  if (refreshing) return;
  const initial = getManualOverrides();
  const keys = Object.keys(initial);
  if (!keys.length) return;

  const staleIds = keys
    .map(Number)
    .filter((id) => id > 0 && (!initial[String(id)]?.updatedAt || Date.now() - initial[String(id)].updatedAt > STALE_MS))
    .sort((a, b) => (initial[String(a)]?.updatedAt || 0) - (initial[String(b)]?.updatedAt || 0));

  if (!staleIds.length) return;

  refreshing = true;
  try {
    for (let i = 0; i < staleIds.length; i += 50) {
      const batch = staleIds.slice(i, i + 50);
      const q = `query ($ids: [Int]) {
        Page(page: 1, perPage: 50) {
          media(id_in: $ids) {
            id
            type
            title { userPreferred english romaji }
            coverImage { medium }
          }
        }
      }`;

      try {
        const res = await AniList.query(q, { ids: batch });
        const list = res?.Page?.media || [];
        const current = getManualOverrides();
        let changed = false;

        for (const m of list) {
          const idStr = String(m.id);
          if (current[idStr]) {
            const t = m.title?.userPreferred || m.title?.english || m.title?.romaji || current[idStr].title;
            const cover = m.coverImage?.medium || current[idStr].cover;
            const type = (m.type === 'MANGA' ? 'MANGA' : 'ANIME') as SyncMediaType;
            if (
              current[idStr].title !== t ||
              current[idStr].cover !== cover ||
              current[idStr].type !== type ||
              !current[idStr].updatedAt
            ) {
              changed = true;
            }
            current[idStr] = {
              ...current[idStr],
              title: t,
              cover,
              type,
              updatedAt: Date.now()
            };
          }
        }

        if (changed) {
          saveManualOverrides(current);
        }
      } catch (e) {
        console.warn('[AL-Additions] Failed to refresh stale overrides batch:', e);
        break;
      }
    }
  } finally {
    refreshing = false;
  }
}
