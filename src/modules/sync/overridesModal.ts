import { AniList } from '../../api/anilist';
import { addStyle } from '../../utils/dom';
import { malFetchList, malDeleteEntry } from '../../api/mal';
import { stores } from './state';
import { alFetchAll } from './engine';
import { getManualOverrides, setOverride, removeOverride, refreshStaleOverrides, saveManualOverrides } from './overrides';
import { SyncMediaType } from './types';

const MODAL_ID = 'ala-overrides-backdrop';
const QUICK_MODAL_ID = 'ala-quick-override-backdrop';

addStyle(
  'ala-overrides-style',
  `
  #${MODAL_ID}, #${QUICK_MODAL_ID}{position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:rgba(5,12,20,.72);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
  #${MODAL_ID} .ala-ov-sheet{display:flex;flex-direction:column;width:min(680px,100%);height:100%;max-height:100%;border-radius:10px;background:rgb(var(--color-foreground));color:rgb(var(--color-text));box-shadow:0 18px 60px rgba(0,0,0,.5);overflow:hidden}
  #${QUICK_MODAL_ID} .ala-ov-sheet{display:flex;flex-direction:column;width:min(480px,100%);max-height:90vh;border-radius:10px;background:rgb(var(--color-foreground));color:rgb(var(--color-text));box-shadow:0 18px 60px rgba(0,0,0,.5);overflow:hidden}
  .ala-ov-sheet *{box-sizing:border-box}
  .ala-ov-sheet :focus-visible{outline:2px solid rgb(var(--color-blue));outline-offset:2px}
  .ala-ov-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid rgba(var(--color-text-lighter),.14)}
  .ala-ov-head h2{margin:0;font-size:18px;font-weight:600}
  .ala-ov-body {flex:1 1 auto;min-height:0;padding:16px 20px;overflow-y: auto;overflow-x:hidden;-webkit-overflow-scrolling: touch;overscroll-behavior: contain;scrollbar-gutter: stable;}
  .ala-ov-foot{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:12px 20px;border-top:1px solid rgba(var(--color-text-lighter),.14)}

  .ala-ov-tabs{display:flex;gap:6px;margin-bottom:16px;border-bottom:1px solid rgba(var(--color-text-lighter),.14);padding-bottom:10px}
  .ala-ov-tab{padding:6px 14px;border:0;border-radius:4px;background:transparent;color:rgb(var(--color-text-lighter));font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s}
  .ala-ov-tab:hover{color:rgb(var(--color-text));background:rgba(var(--color-text-lighter),.1)}
  .ala-ov-tab.is-active{color:#fff;background:rgb(var(--color-blue))}

  .ala-ov-form-box{padding:14px;border-radius:6px;background:rgb(var(--color-background));margin-bottom:18px}
  .ala-ov-form-title{margin:0 0 10px;font-size:13px;font-weight:600;color:rgb(var(--color-blue))}
  .ala-ov-field{display:flex;flex-direction:column;gap:5px;margin-bottom:10px}
  .ala-ov-field label{font-size:12px;color:rgb(var(--color-text-lighter))}
  .ala-ov-input{width:100%;height:36px;padding:0 10px;border:1px solid rgba(var(--color-text-lighter),.22);border-radius:4px;background:rgb(var(--color-foreground));color:rgb(var(--color-text));font:inherit;font-size:13px}
  .ala-ov-input:focus{outline:none;border-color:rgb(var(--color-blue))}

  .ala-ov-preview{display:flex;gap:12px;align-items:center;padding:10px;margin:8px 0 12px;border-radius:6px;background:rgba(var(--color-text-lighter),.06);min-height:56px}
  .ala-ov-preview-cover{width:40px;height:54px;border-radius:3px;object-fit:cover;background:rgba(var(--color-text-lighter),.2)}
  .ala-ov-preview-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
  .ala-ov-preview-title{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ala-ov-preview-meta{display:flex;gap:6px;align-items:center;font-size:11px;color:rgb(var(--color-text-lighter))}
  .ala-ov-badge{padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700;text-transform:uppercase;background:rgba(var(--color-blue),.15);color:rgb(var(--color-blue))}
  .ala-ov-badge--manga{background:rgba(235,108,133,.15);color:#eb6c85}
  .ala-ov-badge--ignored{background:rgba(var(--color-text-lighter),.2);color:rgb(var(--color-text-lighter))}

  .ala-ov-form-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}

  .ala-ov-controls{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}
  .ala-ov-search-input{flex:1 1 180px;height:32px;font-size:12px;padding:0 8px}
  .ala-ov-filter-groups{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .ala-ov-filter-group{display:flex;gap:4px;align-items:center}
  .ala-ov-filter-label{font-size:11px;color:rgb(var(--color-text-lighter));margin-right:2px}

  .ala-ov-chip{padding:3px 8px;border:1px solid rgba(var(--color-text-lighter),.2);border-radius:12px;background:transparent;color:rgb(var(--color-text-lighter));font-size:11px;cursor:pointer;transition:all .15s}
  .ala-ov-chip.is-active{background:rgba(var(--color-blue),.2);border-color:rgb(var(--color-blue));color:rgb(var(--color-blue));font-weight:600}

  .ala-ov-list{display:grid;gap:8px;min-width:0;}
  .ala-ov-item{display:flex;align-items:center;gap:12px;padding:8px 10px;border-radius:6px;background:rgb(var(--color-background));transition:background .15s;min-width:0;max-width: 100%;}
  .ala-ov-item:hover{background:rgba(var(--color-text-lighter),.08)}
  .ala-ov-item-cover{width:36px;height:48px;border-radius:3px;object-fit:cover;background:rgba(var(--color-text-lighter),.2);flex-shrink:0}
  .ala-ov-item-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
  .ala-ov-item-title{display: block;width: 100%;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:inherit;text-decoration:none}
  .ala-ov-item-title:hover{color:rgb(var(--color-blue))}
  .ala-ov-item-meta{display:flex;gap:8px;align-items:center;font-size:11px;color:rgb(var(--color-text-lighter));flex-wrap:wrap}
  .ala-ov-item-meta a{color:rgb(var(--color-blue));text-decoration:none}
  .ala-ov-item-meta a:hover{text-decoration:underline}
  .ala-ov-item-actions{display:flex;gap:6px;align-items:center;flex-shrink:0}

  .ala-ov-empty{padding:24px 10px;text-align:center;color:rgb(var(--color-text-lighter));font-size:13px}

  .ala-ov-audit-section{margin-bottom:20px}
  .ala-ov-audit-title{font-size:13px;font-weight:600;color:rgb(var(--color-blue));margin:0 0 8px}

  @media (max-width:700px){
    #${MODAL_ID}{align-items:flex-end;padding:0}
    #${MODAL_ID} .ala-ov-sheet{width:100%;height:92vh;height:92dvh;max-height:92vh;max-height:92dvh;border-radius:14px 14px 0 0}
    #${QUICK_MODAL_ID}{align-items:flex-end;padding:0}
    #${QUICK_MODAL_ID} .ala-ov-sheet{width:100%;max-height:92vh;max-height:92dvh;border-radius:14px 14px 0 0}

    .ala-ov-head{padding:14px 16px}
    .ala-ov-body{padding:12px 16px}
    .ala-ov-foot{padding:10px 16px calc(10px + env(safe-area-inset-bottom, 0px))}
    .ala-ov-foot .ala-btn{width:100%;min-height:42px;justify-content:center}

    .ala-ov-form-actions{flex-direction:column;gap:8px;width:100%}
    .ala-ov-form-actions .ala-btn{width:100%;min-height:42px;margin-left:0!important;justify-content:center;text-align:center}

    .ala-ov-controls{flex-direction:column;align-items:stretch;gap:8px}
    .ala-ov-search-input{width:100%;flex:none;height:36px;font-size:14px}
    .ala-ov-filter-groups{width:100%;flex-direction:column;align-items:flex-start;gap:6px}
    .ala-ov-filter-group{width:100%;flex-wrap:wrap}

    .ala-ov-item{flex-wrap:wrap;align-items:flex-start;gap:8px 10px;padding:10px}
    .ala-ov-item-cover{width:36px;height:48px}
    .ala-ov-item-info{flex:1 1 calc(100% - 48px);min-width:0}
    .ala-ov-item-actions{width:100%;display:flex;gap:8px;margin-top:4px;padding-top:6px;border-top:1px solid rgba(var(--color-text-lighter),.1)}
    .ala-ov-item-actions .ala-btn{flex:1 1 0;min-height:36px;justify-content:center;text-align:center;font-size:13px}
    .ala-ov-item-actions .ala-icon-btn{flex:0 0 36px;height:36px}
  }
  `
);

function extractAlId(raw: string): number {
  const str = String(raw || '').trim();
  const match = str.match(/(?:anime|manga)\/(\d+)/i) || str.match(/^(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function extractMalId(raw: string): number {
  const str = String(raw || '').trim();
  const match = str.match(/myanimelist\.net\/(?:anime|manga)\/(\d+)/i) || str.match(/^(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function matchesSearch(text: string, id: number | string, extraId: number | string | undefined, query: string): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (String(id).includes(q)) return true;
  if (extraId != null && String(extraId).includes(q)) return true;
  const t = (text || '').toLowerCase();
  if (t.includes(q)) return true;

  let qIdx = 0;
  for (let i = 0; i < t.length && qIdx < q.length; i++) {
    if (t[i] === q[qIdx]) qIdx++;
  }
  return qIdx === q.length;
}

interface LoadedPreview {
  mediaId: number;
  type: SyncMediaType;
  title: string;
  cover?: string;
  detectedMalId?: number;
}

interface UnmatchedMediaMeta {
  title: string;
  cover?: string;
}

const unmatchedMetaCache = new Map<number, UnmatchedMediaMeta>();

async function batchFetchUnmatchedMeta(ids: number[]): Promise<void> {
  const needed = ids.filter((id) => id > 0 && !unmatchedMetaCache.has(id));
  if (!needed.length) return;

  for (let i = 0; i < needed.length; i += 50) {
    const batch = needed.slice(i, i + 50);
    const q = `query ($ids: [Int]) {
      Page(page: 1, perPage: 50) {
        media(id_in: $ids) {
          id
          title { userPreferred english romaji }
          coverImage { medium }
        }
      }
    }`;
    try {
      const res = await AniList.query(q, { ids: batch });
      const list = res?.Page?.media || [];
      for (const m of list) {
        const t = m.title?.userPreferred || m.title?.english || m.title?.romaji || `Media #${m.id}`;
        unmatchedMetaCache.set(m.id, {
          title: t,
          cover: m.coverImage?.medium
        });
      }
    } catch (e) {
      console.warn('[AL-Additions] Failed to batch fetch unmatched metadata:', e);
      break;
    }
  }
}

/**
 * Focused quick edit modal opened directly from anime / manga pages.
 */
export async function openQuickOverrideModal(mediaId: number, mediaType: SyncMediaType = 'ANIME'): Promise<void> {
  const existing = document.getElementById(QUICK_MODAL_ID);
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = QUICK_MODAL_ID;

  const currentOverrides = getManualOverrides();
  const existingOverride = currentOverrides[String(mediaId)];

  backdrop.innerHTML = `
    <div class="ala-ov-sheet ala-ov-quick-sheet" role="dialog" aria-modal="true" aria-labelledby="ala-qo-modal-title">
      <header class="ala-ov-head">
        <h2 id="ala-qo-modal-title">Set MAL Mapping</h2>
        <button class="ala-icon-btn ala-qo-close" type="button" aria-label="Close">✕</button>
      </header>
      <div class="ala-ov-body">
        <div id="ala-qo-preview" class="ala-ov-preview">
          <span style="font-size:12px;color:rgb(var(--color-text-lighter))">Loading entry details...</span>
        </div>

        <div class="ala-ov-field">
          <label for="ala-qo-mal-input">Custom MyAnimeList ID or URL</label>
          <input type="text" id="ala-qo-mal-input" class="ala-ov-input" placeholder="e.g. 16498 or https://myanimelist.net/anime/16498" autocomplete="off">
        </div>

        <div class="ala-ov-form-actions">
          <button type="button" class="ala-btn ala-btn--primary" id="ala-qo-btn-save">Save Override</button>
          <button type="button" class="ala-btn" id="ala-qo-btn-ignore" title="Prevent this entry from ever syncing to MAL without warnings">Mark as AniList-Only</button>
          ${existingOverride ? `<button type="button" class="ala-btn ala-btn--danger" id="ala-qo-btn-remove" style="margin-left:auto">Reset to Default</button>` : ''}
        </div>
      </div>
      <footer class="ala-ov-foot">
        <button class="ala-btn ala-qo-close" type="button">Cancel</button>
      </footer>
    </div>
  `;

  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.querySelectorAll('.ala-qo-close').forEach((btn) => btn.addEventListener('click', close));
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  const previewBox = backdrop.querySelector('#ala-qo-preview') as HTMLElement;
  const malInput = backdrop.querySelector('#ala-qo-mal-input') as HTMLInputElement;
  const saveBtn = backdrop.querySelector('#ala-qo-btn-save') as HTMLButtonElement;
  const ignoreBtn = backdrop.querySelector('#ala-qo-btn-ignore') as HTMLButtonElement;
  const removeBtn = backdrop.querySelector('#ala-qo-btn-remove') as HTMLButtonElement | null;

  if (existingOverride && existingOverride.malId > 0) {
    malInput.value = String(existingOverride.malId);
  }

  let loadedTitle = existingOverride?.title || `Media #${mediaId}`;
  let loadedCover = existingOverride?.cover;
  let loadedType: SyncMediaType = existingOverride?.type || mediaType;
  let detectedMalId: number | undefined;

  const q = `query ($id: Int) {
    Media(id: $id) {
      id
      idMal
      type
      title { userPreferred english romaji }
      coverImage { medium }
    }
  }`;

  try {
    const res = await AniList.query(q, { id: mediaId });
    const m = res?.Media;
    if (m) {
      loadedTitle = m.title?.userPreferred || m.title?.english || m.title?.romaji || loadedTitle;
      loadedCover = m.coverImage?.medium || loadedCover;
      loadedType = m.type === 'MANGA' ? 'MANGA' : 'ANIME';
      detectedMalId = Number(m.idMal) || undefined;
    }
  } catch (_) {}

  const isIgnored = existingOverride && existingOverride.malId === 0;
  const isCustom = existingOverride && existingOverride.malId > 0;

  previewBox.innerHTML = `
    ${loadedCover ? `<img class="ala-ov-preview-cover" src="${loadedCover}" alt="">` : `<div class="ala-ov-preview-cover"></div>`}
    <div class="ala-ov-preview-info">
      <div class="ala-ov-preview-title">${loadedTitle}</div>
      <div class="ala-ov-preview-meta">
        <span class="ala-ov-badge ${loadedType === 'MANGA' ? 'ala-ov-badge--manga' : ''}">${loadedType}</span>
        ${
          isIgnored
            ? `<span class="ala-ov-badge ala-ov-badge--ignored">Currently: AniList-Only</span>`
            : isCustom
            ? `<span>Overridden to MAL ID: <b>${existingOverride.malId}</b></span>`
            : detectedMalId
            ? `<span>Detected MAL ID: <b>${detectedMalId}</b></span>`
            : `<span>No MAL ID on AniList</span>`
        }
      </div>
    </div>
  `;

  if (detectedMalId && !malInput.value) {
    malInput.placeholder = `${detectedMalId} (AniList default)`;
  }

  saveBtn.addEventListener('click', () => {
    let malId = extractMalId(malInput.value);
    if (!malId && detectedMalId) malId = detectedMalId;
    if (!malId) return alert('Please enter a valid MyAnimeList ID or URL.');

    setOverride(mediaId, {
      malId,
      type: loadedType,
      title: loadedTitle,
      cover: loadedCover
    });
    close();
  });

  ignoreBtn.addEventListener('click', () => {
    setOverride(mediaId, {
      malId: 0,
      type: loadedType,
      title: loadedTitle,
      cover: loadedCover
    });
    close();
  });

  removeBtn?.addEventListener('click', () => {
    removeOverride(mediaId);
    close();
  });
}

/**
 * Full Manual Mappings & Sync Audit modal opened from Settings.
 */
export function openOverridesModal(): void {
  const existing = document.getElementById(MODAL_ID);
  if (existing) existing.remove();

  refreshStaleOverrides().then(() => {
    if (document.getElementById(MODAL_ID)) renderList();
  });

  const backdrop = document.createElement('div');
  backdrop.id = MODAL_ID;
  backdrop.innerHTML = `
    <div class="ala-ov-sheet" role="dialog" aria-modal="true" aria-labelledby="ala-ov-modal-title">
      <header class="ala-ov-head">
        <h2 id="ala-ov-modal-title">Manual Mappings & Sync Audit</h2>
        <button class="ala-icon-btn ala-ov-close" type="button" aria-label="Close">✕</button>
      </header>
      <div class="ala-ov-body">
        <div class="ala-ov-tabs">
          <button class="ala-ov-tab is-active" data-tab="overrides" type="button">Overrides & Ignored</button>
          <button class="ala-ov-tab" data-tab="audit" type="button">Sync Audit</button>
        </div>

        <!-- Tab 1: Overrides -->
        <div id="ala-ov-view-overrides">
          <div class="ala-ov-form-box">
            <h3 class="ala-ov-form-title" id="ala-ov-form-heading">Add or Edit Override</h3>
            <div class="ala-ov-field">
              <label for="ala-ov-al-input">AniList Media ID or URL</label>
              <input type="text" id="ala-ov-al-input" class="ala-ov-input" placeholder="e.g. 16498 or https://anilist.co/anime/16498" autocomplete="off">
            </div>

            <div id="ala-ov-preview" class="ala-ov-preview" style="display:none"></div>

            <div class="ala-ov-field">
              <label for="ala-ov-mal-input">Custom MyAnimeList ID or URL</label>
              <input type="text" id="ala-ov-mal-input" class="ala-ov-input" placeholder="e.g. 16498 or https://myanimelist.net/anime/16498" autocomplete="off">
            </div>

            <div class="ala-ov-form-actions">
              <button type="button" class="ala-btn ala-btn--primary" id="ala-ov-btn-save">Save Override</button>
              <button type="button" class="ala-btn" id="ala-ov-btn-ignore" title="Prevent this entry from ever syncing to MAL without warnings">Mark as AniList-Only (Ignore)</button>
              <button type="button" class="ala-btn" id="ala-ov-btn-clear" style="margin-left:auto">Clear</button>
            </div>
          </div>

          <div class="ala-ov-controls">
            <input type="text" id="ala-ov-search" class="ala-ov-input ala-ov-search-input" placeholder="Search overrides by title or ID..." autocomplete="off">
            <div class="ala-ov-filter-groups">
              <div class="ala-ov-filter-group">
                <span class="ala-ov-filter-label">Status:</span>
                <button class="ala-ov-chip is-active" data-status-filter="all" type="button">All</button>
                <button class="ala-ov-chip" data-status-filter="overrides" type="button">Overrides</button>
                <button class="ala-ov-chip" data-status-filter="ignored" type="button">AniList-Only</button>
              </div>
              <div class="ala-ov-filter-group">
                <span class="ala-ov-filter-label">Type:</span>
                <button class="ala-ov-chip is-active" data-type-filter="all" type="button">All</button>
                <button class="ala-ov-chip" data-type-filter="anime" type="button">Anime</button>
                <button class="ala-ov-chip" data-type-filter="manga" type="button">Manga</button>
              </div>
            </div>
          </div>

          <div style="font-size:12px;font-weight:600;color:rgb(var(--color-text-lighter));margin:0 0 8px" id="ala-ov-count">Configured Entries</div>
          <div id="ala-ov-list" class="ala-ov-list"></div>
        </div>

        <!-- Tab 2: Audit -->
        <div id="ala-ov-view-audit" style="display:none">
          <div class="ala-ov-audit-section">
            <h3 class="ala-ov-audit-title">Unmatched AniList Entries</h3>
            <p style="font-size:12px;color:rgb(var(--color-text-lighter));margin:0 0 10px">These entries could not be automatically matched to a MAL ID during sync.</p>
            <div class="ala-ov-controls" id="ala-ov-unmatched-controls" style="display:none">
              <input type="text" id="ala-ov-unmatched-search" class="ala-ov-input ala-ov-search-input" placeholder="Search unmatched by title or ID..." autocomplete="off">
              <div class="ala-ov-filter-group">
                <span class="ala-ov-filter-label">Type:</span>
                <button class="ala-ov-chip is-active" data-unmatched-type="all" type="button">All</button>
                <button class="ala-ov-chip" data-unmatched-type="anime" type="button">Anime</button>
                <button class="ala-ov-chip" data-unmatched-type="manga" type="button">Manga</button>
              </div>
            </div>
            <div id="ala-ov-audit-unmatched" class="ala-ov-list"></div>
          </div>

          <div class="ala-ov-audit-section" style="margin-top:24px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <h3 class="ala-ov-audit-title" style="margin:0">Orphaned MyAnimeList Entries</h3>
              <button type="button" class="ala-btn ala-btn--sm" id="ala-ov-btn-scan-orphans">Scan MAL</button>
            </div>
            <p style="font-size:12px;color:rgb(var(--color-text-lighter));margin:0 0 10px">Entries that exist on your MyAnimeList account but are absent from your AniList library.</p>
            <div class="ala-ov-controls" id="ala-ov-orphans-controls" style="display:none">
              <input type="text" id="ala-ov-orphans-search" class="ala-ov-input ala-ov-search-input" placeholder="Search orphans by title or ID..." autocomplete="off">
              <div class="ala-ov-filter-group">
                <span class="ala-ov-filter-label">Type:</span>
                <button class="ala-ov-chip is-active" data-orphans-type="all" type="button">All</button>
                <button class="ala-ov-chip" data-orphans-type="anime" type="button">Anime</button>
                <button class="ala-ov-chip" data-orphans-type="manga" type="button">Manga</button>
              </div>
            </div>
            <div id="ala-ov-audit-orphans" class="ala-ov-list"></div>
          </div>
        </div>
      </div>
      <footer class="ala-ov-foot">
        <button class="ala-btn ala-btn--primary ala-ov-close" type="button">Done</button>
      </footer>
    </div>
  `;

  document.body.appendChild(backdrop);

  // Close actions
  const close = () => backdrop.remove();
  backdrop.querySelectorAll('.ala-ov-close').forEach((btn) => btn.addEventListener('click', close));
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  // Tab switching
  const tabs = backdrop.querySelectorAll<HTMLButtonElement>('.ala-ov-tab');
  const viewOverrides = backdrop.querySelector('#ala-ov-view-overrides') as HTMLElement;
  const viewAudit = backdrop.querySelector('#ala-ov-view-audit') as HTMLElement;

  tabs.forEach((t) => {
    t.addEventListener('click', () => {
      tabs.forEach((o) => o.classList.toggle('is-active', o === t));
      const isAudit = t.dataset.tab === 'audit';
      viewOverrides.style.display = isAudit ? 'none' : 'block';
      viewAudit.style.display = isAudit ? 'block' : 'none';
      if (isAudit) renderAudit();
      else renderList();
    });
  });

  // State
  let activePreview: LoadedPreview | null = null;
  let statusFilter = 'all';
  let typeFilter = 'all';
  let searchQuery = '';

  const alInput = backdrop.querySelector('#ala-ov-al-input') as HTMLInputElement;
  const malInput = backdrop.querySelector('#ala-ov-mal-input') as HTMLInputElement;
  const previewBox = backdrop.querySelector('#ala-ov-preview') as HTMLElement;
  const listContainer = backdrop.querySelector('#ala-ov-list') as HTMLElement;
  const countLabel = backdrop.querySelector('#ala-ov-count') as HTMLElement;
  const searchInput = backdrop.querySelector('#ala-ov-search') as HTMLInputElement;

  const updatePreviewUI = (loading = false) => {
    if (loading) {
      previewBox.style.display = 'flex';
      previewBox.innerHTML = `<span style="font-size:12px;color:rgb(var(--color-text-lighter))">Looking up AniList entry...</span>`;
      return;
    }
    if (!activePreview) {
      previewBox.style.display = 'none';
      previewBox.innerHTML = '';
      malInput.placeholder = 'e.g. 16498 or https://myanimelist.net/anime/16498';
      return;
    }

    const { type, title, cover, detectedMalId } = activePreview;
    previewBox.style.display = 'flex';
    previewBox.innerHTML = `
      ${cover ? `<img class="ala-ov-preview-cover" src="${cover}" alt="">` : `<div class="ala-ov-preview-cover"></div>`}
      <div class="ala-ov-preview-info">
        <div class="ala-ov-preview-title">${title}</div>
        <div class="ala-ov-preview-meta">
          <span class="ala-ov-badge ${type === 'MANGA' ? 'ala-ov-badge--manga' : ''}">${type}</span>
          ${detectedMalId ? `<span>Detected MAL ID: <b>${detectedMalId}</b></span>` : `<span>No MAL ID on AniList</span>`}
        </div>
      </div>
    `;

    if (detectedMalId && !malInput.value) {
      malInput.placeholder = `${detectedMalId} (AniList default)`;
    }
  };

  let lookupTimer: ReturnType<typeof setTimeout> | 0 = 0;
  const doLookup = async (id: number) => {
    if (!id) {
      activePreview = null;
      updatePreviewUI();
      return;
    }

    const existing = getManualOverrides()[String(id)];
    if (existing) {
      activePreview = {
        mediaId: id,
        type: existing.type,
        title: existing.title,
        cover: existing.cover,
        detectedMalId: existing.malId > 0 ? existing.malId : undefined
      };
      if (existing.malId > 0 && !malInput.value) {
        malInput.value = String(existing.malId);
      }
      updatePreviewUI();
    } else {
      updatePreviewUI(true);
    }

    const q = `query ($id: Int) {
      Media(id: $id) {
        id
        idMal
        type
        title { userPreferred english romaji }
        coverImage { medium }
      }
    }`;

    try {
      const res = await AniList.query(q, { id });
      if (extractAlId(alInput.value) !== id) return;

      const m = res?.Media;
      if (!m) {
        if (!existing) {
          activePreview = null;
          updatePreviewUI();
        }
        return;
      }

      const t = m.title?.userPreferred || m.title?.english || m.title?.romaji || `Media #${m.id}`;
      activePreview = {
        mediaId: m.id,
        type: m.type === 'MANGA' ? 'MANGA' : 'ANIME',
        title: t,
        cover: m.coverImage?.medium || existing?.cover,
        detectedMalId: Number(m.idMal) || undefined
      };
      updatePreviewUI();

      if (existing && existing.malId > 0 && !malInput.value) {
        malInput.value = String(existing.malId);
      }
    } catch (_) {
      if (!existing && extractAlId(alInput.value) === id) {
        activePreview = null;
        updatePreviewUI();
      }
    }
  };

  alInput.addEventListener('input', () => {
    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(() => {
      const id = extractAlId(alInput.value);
      doLookup(id);
    }, 300);
  });

  const saveBtn = backdrop.querySelector('#ala-ov-btn-save') as HTMLButtonElement;
  const ignoreBtn = backdrop.querySelector('#ala-ov-btn-ignore') as HTMLButtonElement;
  const clearBtn = backdrop.querySelector('#ala-ov-btn-clear') as HTMLButtonElement;

  const clearForm = () => {
    clearTimeout(lookupTimer);
    alInput.value = '';
    malInput.value = '';
    activePreview = null;
    updatePreviewUI();
  };
  clearBtn.addEventListener('click', clearForm);

  saveBtn.addEventListener('click', () => {
    const id = activePreview?.mediaId || extractAlId(alInput.value);
    if (!id) return alert('Please enter a valid AniList ID or URL.');

    let malId = extractMalId(malInput.value);
    if (!malId && activePreview?.detectedMalId) {
      malId = activePreview.detectedMalId;
    }
    if (!malId) return alert('Please enter a valid MyAnimeList ID or URL.');

    const existing = getManualOverrides()[String(id)];
    const title = activePreview?.title || existing?.title || `Media #${id}`;
    const cover = activePreview?.cover || existing?.cover;
    const type: SyncMediaType = activePreview?.type || existing?.type || 'ANIME';

    setOverride(id, {
      malId,
      type,
      title,
      cover
    });

    clearForm();
    renderList();

    if (title === `Media #${id}`) {
      AniList.query(
        `query ($id: Int) { Media(id: $id) { id type title { userPreferred english romaji } coverImage { medium } } }`,
        { id }
      )
        .then((res) => {
          const m = res?.Media;
          if (m) {
            const current = getManualOverrides();
            if (current[String(id)]) {
              const t = m.title?.userPreferred || m.title?.english || m.title?.romaji || current[String(id)].title;
              const c = m.coverImage?.medium || current[String(id)].cover;
              current[String(id)] = {
                ...current[String(id)],
                title: t,
                cover: c,
                type: m.type === 'MANGA' ? 'MANGA' : 'ANIME',
                updatedAt: Date.now()
              };
              saveManualOverrides(current);
              if (document.getElementById(MODAL_ID)) renderList();
            }
          }
        })
        .catch(() => {});
    }
  });

  ignoreBtn.addEventListener('click', () => {
    const id = activePreview?.mediaId || extractAlId(alInput.value);
    if (!id) return alert('Please enter a valid AniList ID or URL.');

    const existing = getManualOverrides()[String(id)];
    const title = activePreview?.title || existing?.title || `Media #${id}`;
    const cover = activePreview?.cover || existing?.cover;
    const type: SyncMediaType = activePreview?.type || existing?.type || 'ANIME';

    setOverride(id, {
      malId: 0,
      type,
      title,
      cover
    });

    clearForm();
    renderList();

    if (title === `Media #${id}`) {
      AniList.query(
        `query ($id: Int) { Media(id: $id) { id type title { userPreferred english romaji } coverImage { medium } } }`,
        { id }
      )
        .then((res) => {
          const m = res?.Media;
          if (m) {
            const current = getManualOverrides();
            if (current[String(id)]) {
              const t = m.title?.userPreferred || m.title?.english || m.title?.romaji || current[String(id)].title;
              const c = m.coverImage?.medium || current[String(id)].cover;
              current[String(id)] = {
                ...current[String(id)],
                title: t,
                cover: c,
                type: m.type === 'MANGA' ? 'MANGA' : 'ANIME',
                updatedAt: Date.now()
              };
              saveManualOverrides(current);
              if (document.getElementById(MODAL_ID)) renderList();
            }
          }
        })
        .catch(() => {});
    }
  });

  // Filter chips in Tab 1
  backdrop.querySelectorAll<HTMLButtonElement>('[data-status-filter]').forEach((c) => {
    c.addEventListener('click', () => {
      backdrop.querySelectorAll('[data-status-filter]').forEach((o) => o.classList.toggle('is-active', o === c));
      statusFilter = c.dataset.statusFilter || 'all';
      renderList();
    });
  });

  backdrop.querySelectorAll<HTMLButtonElement>('[data-type-filter]').forEach((c) => {
    c.addEventListener('click', () => {
      backdrop.querySelectorAll('[data-type-filter]').forEach((o) => o.classList.toggle('is-active', o === c));
      typeFilter = c.dataset.typeFilter || 'all';
      renderList();
    });
  });

  let searchTimer: ReturnType<typeof setTimeout> | 0 = 0;
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = searchInput.value.trim();
      renderList();
    }, 150);
  });

  function renderList() {
    const all = getManualOverrides();
    const entries = Object.entries(all).sort((a, b) => b[1].updatedAt - a[1].updatedAt);

    const filtered = entries.filter(([idStr, o]) => {
      if (statusFilter === 'overrides' && o.malId === 0) return false;
      if (statusFilter === 'ignored' && o.malId > 0) return false;
      if (typeFilter !== 'all' && o.type.toLowerCase() !== typeFilter.toLowerCase()) return false;
      if (searchQuery && !matchesSearch(o.title, idStr, o.malId > 0 ? o.malId : undefined, searchQuery)) {
        return false;
      }
      return true;
    });

    countLabel.textContent = `Configured Entries (${entries.length}${filtered.length !== entries.length ? ` — showing ${filtered.length}` : ''})`;

    if (!filtered.length) {
      listContainer.innerHTML = `<div class="ala-ov-empty">No entries found matching this filter.</div>`;
      return;
    }

    listContainer.innerHTML = filtered
      .map(([idStr, o]) => {
        const id = Number(idStr);
        const isIgnoredEntry = o.malId === 0;
        const alUrl = `https://anilist.co/${o.type.toLowerCase()}/${id}`;
        const malUrl = o.malId > 0 ? `https://myanimelist.net/${o.type.toLowerCase()}/${o.malId}` : '#';

        return `
        <div class="ala-ov-item" data-id="${id}">
          ${o.cover ? `<img class="ala-ov-item-cover" src="${o.cover}" alt="">` : `<div class="ala-ov-item-cover"></div>`}
          <div class="ala-ov-item-info">
            <a class="ala-ov-item-title" href="${alUrl}" target="_blank" rel="noopener" title="${o.title}">${o.title}</a>
            <div class="ala-ov-item-meta">
              <span class="ala-ov-badge ${o.type === 'MANGA' ? 'ala-ov-badge--manga' : ''}">${o.type}</span>
              <span>AniList ID: <b>${id}</b></span>
              ${
                isIgnoredEntry
                  ? `<span class="ala-ov-badge ala-ov-badge--ignored">AniList-Only (Ignored)</span>`
                  : `<span>MAL ID: <a href="${malUrl}" target="_blank" rel="noopener"><b>${o.malId}</b></a></span>`
              }
            </div>
          </div>
          <div class="ala-ov-item-actions">
            <button type="button" class="ala-btn ala-btn--sm ala-ov-btn-edit" data-id="${id}">Edit</button>
            <button type="button" class="ala-icon-btn ala-ov-btn-del" data-id="${id}" title="Remove override">✕</button>
          </div>
        </div>
      `;
      })
      .join('');

    listContainer.querySelectorAll<HTMLButtonElement>('.ala-ov-btn-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        if (id) {
          removeOverride(id);
          if (activePreview?.mediaId === id) {
            clearForm();
          }
          renderList();
        }
      });
    });

    listContainer.querySelectorAll<HTMLButtonElement>('.ala-ov-btn-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        if (id) {
          alInput.value = String(id);
          doLookup(id);
          viewOverrides.scrollTop = 0;
        }
      });
    });
  }

  // Tab 2: Audit Logic
  let unmatchedTypeFilter = 'all';
  let unmatchedSearchQuery = '';
  let orphansTypeFilter = 'all';
  let orphansSearchQuery = '';

  const unmatchedControls = backdrop.querySelector('#ala-ov-unmatched-controls') as HTMLElement;
  const unmatchedSearchInput = backdrop.querySelector('#ala-ov-unmatched-search') as HTMLInputElement;

  backdrop.querySelectorAll<HTMLButtonElement>('[data-unmatched-type]').forEach((c) => {
    c.addEventListener('click', () => {
      backdrop.querySelectorAll('[data-unmatched-type]').forEach((o) => o.classList.toggle('is-active', o === c));
      unmatchedTypeFilter = c.dataset.unmatchedType || 'all';
      renderUnmatchedList();
    });
  });

  let unmatchedSearchTimer: ReturnType<typeof setTimeout> | 0 = 0;
  unmatchedSearchInput?.addEventListener('input', () => {
    clearTimeout(unmatchedSearchTimer);
    unmatchedSearchTimer = setTimeout(() => {
      unmatchedSearchQuery = unmatchedSearchInput.value.trim();
      renderUnmatchedList();
    }, 150);
  });

  function getRawUnmatched(): Array<{ mediaId: number; type: SyncMediaType }> {
    const configured = getManualOverrides();
    const unmatched: Array<{ mediaId: number; type: SyncMediaType }> = [];
    for (const t of ['ANIME', 'MANGA'] as const) {
      const data = stores[t].ids.data || {};
      for (const [idStr, rec] of Object.entries(data)) {
        const id = Number(idStr);
        if (id > 0 && rec && (rec as any).m === 0 && !configured[String(id)]) {
          unmatched.push({ mediaId: id, type: t });
        }
      }
    }
    return unmatched;
  }

  function renderUnmatchedList() {
    const unmatchedBox = backdrop.querySelector('#ala-ov-audit-unmatched') as HTMLElement;
    const raw = getRawUnmatched();

    if (!raw.length) {
      unmatchedControls.style.display = 'none';
      unmatchedBox.innerHTML = `<div class="ala-ov-empty">No unmatched entries found. All synced titles have MAL IDs or were resolved!</div>`;
      return;
    }

    unmatchedControls.style.display = 'flex';

    const filtered = raw.filter(({ mediaId, type }) => {
      if (unmatchedTypeFilter !== 'all' && type.toLowerCase() !== unmatchedTypeFilter.toLowerCase()) return false;
      const meta = unmatchedMetaCache.get(mediaId);
      const title = meta?.title || `Media #${mediaId}`;
      if (unmatchedSearchQuery && !matchesSearch(title, mediaId, undefined, unmatchedSearchQuery)) return false;
      return true;
    });

    if (!filtered.length) {
      unmatchedBox.innerHTML = `<div class="ala-ov-empty">No unmatched entries match this filter.</div>`;
      return;
    }

    unmatchedBox.innerHTML = filtered
      .map(({ mediaId, type }) => {
        const meta = unmatchedMetaCache.get(mediaId);
        const title = meta?.title || `Media #${mediaId}`;
        const cover = meta?.cover;

        return `
        <div class="ala-ov-item" data-id="${mediaId}">
          ${cover ? `<img class="ala-ov-item-cover" src="${cover}" alt="">` : `<div class="ala-ov-item-cover"></div>`}
          <div class="ala-ov-item-info">
            <a class="ala-ov-item-title" href="https://anilist.co/${type.toLowerCase()}/${mediaId}" target="_blank" rel="noopener" title="${title}">${title}</a>
            <div class="ala-ov-item-meta">
              <span class="ala-ov-badge ${type === 'MANGA' ? 'ala-ov-badge--manga' : ''}">${type}</span>
              <span>AniList ID: <b>${mediaId}</b></span>
            </div>
          </div>
          <div class="ala-ov-item-actions">
            <button type="button" class="ala-btn ala-btn--sm ala-ov-audit-set" data-id="${mediaId}">Set MAL ID</button>
            <button type="button" class="ala-btn ala-btn--sm ala-ov-audit-ignore" data-id="${mediaId}" data-type="${type}">Ignore</button>
          </div>
        </div>
      `;
      })
      .join('');

    unmatchedBox.querySelectorAll<HTMLButtonElement>('.ala-ov-audit-set').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        tabs[0].click();
        alInput.value = String(id);
        doLookup(id);
      });
    });

    unmatchedBox.querySelectorAll<HTMLButtonElement>('.ala-ov-audit-ignore').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        const type = (btn.dataset.type || 'ANIME') as SyncMediaType;
        const meta = unmatchedMetaCache.get(id);
        setOverride(id, { malId: 0, type, title: meta?.title || `Media #${id}`, cover: meta?.cover });
        renderUnmatchedList();
        renderList();
      });
    });
  }

  function renderAudit() {
    renderUnmatchedList();

    const raw = getRawUnmatched();
    const missingMetaIds = raw.map((r) => r.mediaId).filter((id) => !unmatchedMetaCache.has(id));
    if (missingMetaIds.length > 0) {
      batchFetchUnmatchedMeta(missingMetaIds).then(() => {
        renderUnmatchedList();
      });
    }

    renderOrphansList();
  }

  interface OrphanItem {
    malId: number;
    type: SyncMediaType;
    title: string;
  }
  let scannedOrphans: OrphanItem[] | null = null;

  const orphansControls = backdrop.querySelector('#ala-ov-orphans-controls') as HTMLElement;
  const orphansSearchInput = backdrop.querySelector('#ala-ov-orphans-search') as HTMLInputElement;

  backdrop.querySelectorAll<HTMLButtonElement>('[data-orphans-type]').forEach((c) => {
    c.addEventListener('click', () => {
      backdrop.querySelectorAll('[data-orphans-type]').forEach((o) => o.classList.toggle('is-active', o === c));
      orphansTypeFilter = c.dataset.orphansType || 'all';
      renderOrphansList();
    });
  });

  let orphansSearchTimer: ReturnType<typeof setTimeout> | 0 = 0;
  orphansSearchInput?.addEventListener('input', () => {
    clearTimeout(orphansSearchTimer);
    orphansSearchTimer = setTimeout(() => {
      orphansSearchQuery = orphansSearchInput.value.trim();
      renderOrphansList();
    }, 150);
  });

  function renderOrphansList() {
    const orphansBox = backdrop.querySelector('#ala-ov-audit-orphans') as HTMLElement;
    if (!orphansBox) return;

    if (scannedOrphans === null) {
      orphansControls.style.display = 'none';
      orphansBox.innerHTML = `<div class="ala-ov-empty">Click "Scan MAL" to find entries present on MyAnimeList that are missing from your AniList library.</div>`;
      return;
    }

    if (!scannedOrphans.length) {
      orphansControls.style.display = 'none';
      orphansBox.innerHTML = `<div class="ala-ov-empty">No orphaned entries found. Your MyAnimeList list matches your AniList library!</div>`;
      return;
    }

    orphansControls.style.display = 'flex';

    const filtered = scannedOrphans.filter((item) => {
      if (orphansTypeFilter !== 'all' && item.type.toLowerCase() !== orphansTypeFilter.toLowerCase()) return false;
      if (orphansSearchQuery && !matchesSearch(item.title, item.malId, undefined, orphansSearchQuery)) return false;
      return true;
    });

    if (!filtered.length) {
      orphansBox.innerHTML = `<div class="ala-ov-empty">No orphaned entries match this filter.</div>`;
      return;
    }

    orphansBox.innerHTML = filtered
      .map(
        (item) => `
        <div class="ala-ov-item" data-mal-id="${item.malId}">
          <div class="ala-ov-item-info">
            <a class="ala-ov-item-title" href="https://myanimelist.net/${item.type.toLowerCase()}/${item.malId}" target="_blank" rel="noopener" title="${item.title}">${item.title}</a>
            <div class="ala-ov-item-meta">
              <span class="ala-ov-badge ${item.type === 'MANGA' ? 'ala-ov-badge--manga' : ''}">${item.type}</span>
              <span>MAL ID: <b>${item.malId}</b></span>
            </div>
          </div>
          <div class="ala-ov-item-actions">
            <button type="button" class="ala-btn ala-btn--sm ala-btn--danger ala-ov-btn-del-mal" data-mal-id="${item.malId}" data-type="${item.type}">Delete from MAL</button>
            <button type="button" class="ala-btn ala-btn--sm ala-ov-btn-keep-mal" data-mal-id="${item.malId}">Keep on MAL</button>
          </div>
        </div>
      `
      )
      .join('');

    orphansBox.querySelectorAll<HTMLButtonElement>('.ala-ov-btn-del-mal').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.malId);
        const type = (btn.dataset.type || 'ANIME') as SyncMediaType;
        if (!id) return;
        if (!confirm(`Delete MAL ID ${id} from your MyAnimeList account? This cannot be undone.`)) return;
        btn.disabled = true;
        btn.textContent = 'Deleting...';
        try {
          await malDeleteEntry(type, id);
          scannedOrphans = scannedOrphans?.filter((o) => o.malId !== id) || [];
          renderOrphansList();
        } catch (err: any) {
          btn.disabled = false;
          btn.textContent = 'Delete from MAL';
          alert(`Failed to delete from MAL: ${err?.message || err}`);
        }
      });
    });

    orphansBox.querySelectorAll<HTMLButtonElement>('.ala-ov-btn-keep-mal').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.malId);
        scannedOrphans = scannedOrphans?.filter((o) => o.malId !== id) || [];
        renderOrphansList();
      });
    });
  }

  const scanOrphansBtn = backdrop.querySelector('#ala-ov-btn-scan-orphans') as HTMLButtonElement;
  scanOrphansBtn?.addEventListener('click', async () => {
    const orphansBox = backdrop.querySelector('#ala-ov-audit-orphans') as HTMLElement;
    scanOrphansBtn.disabled = true;
    scanOrphansBtn.textContent = 'Scanning...';
    orphansBox.innerHTML = `<div class="ala-ov-empty">Scanning your AniList and MyAnimeList libraries...</div>`;

    try {
      const viewer = await AniList.viewer();
      if (!viewer) {
        orphansBox.innerHTML = `<div class="ala-ov-empty" style="color:rgb(var(--color-red,224,85,85))">AniList user not found. Please connect AniList first.</div>`;
        return;
      }

      const overrides = getManualOverrides();
      const knownMalIds = new Set<number>();

      for (const t of ['ANIME', 'MANGA'] as const) {
        try {
          const alEntries = await alFetchAll(viewer.id, t);
          for (const e of alEntries) {
            const ov = overrides[String(e.mediaId)];
            if (ov) {
              if (ov.malId > 0) knownMalIds.add(ov.malId);
            } else {
              const cached = stores[t].ids.data[e.mediaId]?.m;
              if (cached && cached > 0) knownMalIds.add(cached);
              else if (e.idMal > 0) knownMalIds.add(e.idMal);
            }
          }
        } catch (e: any) {
          console.warn(`[AL-Additions] Audit scan: failed to fetch AniList ${t}:`, e);
        }
      }

      const foundOrphans: OrphanItem[] = [];
      for (const t of ['ANIME', 'MANGA'] as const) {
        try {
          const malList = await malFetchList(t);
          for (const [idStr, data] of Object.entries(malList)) {
            const malId = Number(idStr);
            if (malId > 0 && !knownMalIds.has(malId)) {
              foundOrphans.push({
                malId,
                type: t,
                title: data.__malTitle || `MAL #${malId}`
              });
            }
          }
        } catch (e: any) {
          console.warn(`[AL-Additions] Audit scan: failed to fetch MAL ${t}:`, e);
        }
      }

      scannedOrphans = foundOrphans;
      renderOrphansList();
    } catch (err: any) {
      orphansBox.innerHTML = `<div class="ala-ov-empty" style="color:rgb(var(--color-red,224,85,85))">Scan error: ${err?.message || err}</div>`;
    } finally {
      scanOrphansBtn.disabled = false;
      scanOrphansBtn.textContent = 'Scan MAL';
    }
  });

  // Initial load
  renderList();
}
