import { unsafeWindow } from 'vite-plugin-monkey/dist/client';
import { Settings } from '../../settings/settings';
import { mediaRoute } from '../../utils/dom';
import { log } from '../../api/mal';
import { stores, addPendingDelete, removePendingDelete } from './state';
import { SyncMediaType, typeLabel } from './types';
import { getOverride } from './overrides';

let activeCandidate: { mediaId: number; type: SyncMediaType; title: string; malId?: number } | null = null;

export function extractDialogMedia(root: Element = document.body): { mediaId: number; type: SyncMediaType; title: string; malId?: number } | null {
  const dialog = root.closest('.el-dialog, .el-dialog__wrapper, body')?.querySelector('.el-dialog__body') || document.querySelector('.el-dialog__body');
  if (!dialog) return null;

  const titleEl = dialog.querySelector('.title, .header .title');
  const title = titleEl?.textContent?.trim() || '';

  let type: SyncMediaType = 'ANIME';
  if (dialog.querySelector('.input-wrap.manga, .form.manga, .manga')) {
    type = 'MANGA';
  } else if (dialog.querySelector('.input-wrap.anime, .form.anime, .anime')) {
    type = 'ANIME';
  }

  let mediaId = 0;
  const vue = (dialog as any).__vue__ || (dialog.parentElement as any)?.__vue__;
  if (vue?.mediaId) mediaId = Number(vue.mediaId);
  else if (vue?.media?.id) mediaId = Number(vue.media.id);

  if (!mediaId) {
    const el = dialog.querySelector<HTMLElement>('.header[data-src], .header[style*="media/"], .cover img, img[src*="/media/"]');
    const src = el?.getAttribute('src') || el?.getAttribute('data-src') || el?.style.backgroundImage || '';
    const m = src.match(/\/media\/(anime|manga)\/[^\/]+\/(?:bx)?(\d+)/i);
    if (m) {
      type = m[1].toUpperCase() as SyncMediaType;
      mediaId = Number(m[2]);
    }
  }

  if (!mediaId && title) {
    const link = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/anime/"], a[href*="/manga/"]')).find(
      (a) => a.textContent?.trim() === title
    );
    if (link) {
      const m = link.getAttribute('href')?.match(/^\/(anime|manga)\/(\d+)/);
      if (m) {
        type = m[1].toUpperCase() as SyncMediaType;
        mediaId = Number(m[2]);
      }
    }
  }

  if (!mediaId) {
    const route = mediaRoute();
    if (route) {
      mediaId = route.id;
      type = route.type;
    }
  }

  if (!mediaId) return null;

  const override = getOverride(mediaId);
  if (override && override.malId === 0) {
    return null;
  }

  const malId = override?.malId || stores[type].ids.data[mediaId]?.m || undefined;
  return { mediaId, type, title: title || `Media #${mediaId}`, malId };
}

let installed = false;

export function initDeletionInterceptor(): void {
  if (installed || typeof window === 'undefined') return;
  if (location.hostname !== 'anilist.co') return;
  installed = true;

  const targetWindows = [window, typeof unsafeWindow !== 'undefined' ? unsafeWindow : null].filter(Boolean) as any[];

  for (const win of targetWindows) {
    const origFetch = win.fetch;
    if (typeof origFetch !== 'function') continue;

    win.fetch = async function (input: any, init?: RequestInit) {
      const url = typeof input === 'string' ? input : input?.url || '';
      const isGraphQL = typeof url === 'string' && url.includes('graphql.anilist.co');

      let queryStr = '';
      let variables: any = null;

      if (isGraphQL && init?.body) {
        try {
          const bodyStr = typeof init.body === 'string' ? init.body : '';
          if (bodyStr) {
            const parsed = JSON.parse(bodyStr);
            queryStr = parsed.query || parsed.operationName || '';
            variables = parsed.variables || null;
          }
        } catch (_) {}
      }

      if (queryStr.includes('DeleteMediaListEntry')) {
        if (Settings.get('syncMode') === 'exact') {
          const candidate = activeCandidate || extractDialogMedia(document.body);
          if (candidate) {
            addPendingDelete({
              mediaId: candidate.mediaId,
              malId: candidate.malId,
              type: candidate.type,
              title: candidate.title,
              deletedAt: Date.now()
            });
            activeCandidate = null;
            log(`${typeLabel(candidate.type)}: queued "${candidate.title}" for deletion on MAL (Exact Match).`, 'info');
          }
        }
      }

      const res = await origFetch.apply(this, arguments as any);

      if (queryStr.includes('SaveMediaListEntry') && variables?.mediaId) {
        const mediaId = Number(variables.mediaId);
        removePendingDelete(mediaId, 'ANIME');
        removePendingDelete(mediaId, 'MANGA');
      }

      return res;
    };
  }

  document.addEventListener(
    'click',
    (e) => {
      if (Settings.get('syncMode') !== 'exact') return;
      const target = e.target as HTMLElement;
      if (!target) return;

      const deleteBtn = target.closest('.delete-btn, .delete, button, [role="button"]') || target;
      const btnText = (deleteBtn.textContent || '').trim().toLowerCase();

      const isDeleteClick =
        target.classList.contains('delete-btn') ||
        target.classList.contains('delete') ||
        btnText === 'delete' ||
        btnText.includes('delete list entry');

      if (isDeleteClick) {
        const candidate = extractDialogMedia(target);
        if (candidate) {
          activeCandidate = candidate;
        }
        return;
      }

      const inWarningBox = !!target.closest('.el-message-box, .el-message-box__wrapper');
      const isOkClick =
        btnText === 'ok' ||
        target.classList.contains('el-button--primary') ||
        !!target.closest('.el-message-box__btns .el-button--primary');

      if (isOkClick && inWarningBox) {
        const candidate = activeCandidate || extractDialogMedia(document.body);
        if (candidate) {
          addPendingDelete({
            mediaId: candidate.mediaId,
            malId: candidate.malId,
            type: candidate.type,
            title: candidate.title,
            deletedAt: Date.now()
          });
          activeCandidate = null;
          log(`${typeLabel(candidate.type)}: queued "${candidate.title}" for deletion on MAL (Exact Match).`, 'info');
        }
        return;
      }

      if (btnText === 'cancel' && inWarningBox) {
        activeCandidate = null;
        return;
      }

      if (btnText === 'save' || target.classList.contains('save-btn')) {
        const candidate = extractDialogMedia(target);
        if (candidate) {
          removePendingDelete(candidate.mediaId, candidate.type);
        }
      }
    },
    true
  );
}
