import { Settings } from '../../settings/settings';
import { addStyle } from '../../utils/dom';

export interface SongProviderPreset {
  id: string;
  name: string;
  icon: string;
  url: string;
}

export interface AniSongsConfig {
  active: string[];
  presets: SongProviderPreset[];
}

export interface SongParams {
  title: string;
  title_romaji?: string;
  title_jp?: string;
  artist: string;
  artists?: string;
  anime: string;
  anime_romaji?: string;
  anime_en?: string;
  anime_jp?: string;
  year?: string | number;
  season?: string;
  type: 'OP' | 'ED';
  number: number;
  eps?: string;
}

export const DEFAULT_PRESETS: SongProviderPreset[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    icon: 'https://www.google.com/s2/favicons?domain=youtube.com&sz=32',
    url: 'https://www.youtube.com/results?search_query={title}+{artist}'
  },
  {
    id: 'youtube_music',
    name: 'YouTube Music',
    icon: 'https://www.google.com/s2/favicons?domain=music.youtube.com&sz=32',
    url: 'https://music.youtube.com/search?q={title}+{artist}'
  },
  {
    id: 'spotify',
    name: 'Spotify',
    icon: 'https://www.google.com/s2/favicons?domain=spotify.com&sz=32',
    url: 'https://open.spotify.com/search/{title}%20{artist}'
  },
  {
    id: 'apple_music',
    name: 'Apple Music',
    icon: 'https://www.google.com/s2/favicons?domain=music.apple.com&sz=32',
    url: 'https://music.apple.com/us/search?term={title}+{artist}'
  },
  {
    id: 'aniplaylist',
    name: 'AniPlaylist',
    icon: 'https://www.google.com/s2/favicons?domain=aniplaylist.com&sz=32',
    url: 'https://aniplaylist.com/{title}'
  },
  {
    id: 'youtube_theme',
    name: 'YouTube (Anime + Theme)',
    icon: 'https://www.google.com/s2/favicons?domain=youtube.com&sz=32',
    url: 'https://www.youtube.com/results?search_query={anime}+{theme}'
  },
  {
    id: 'youtube_jp',
    name: 'YouTube (Japanese Anime + Theme)',
    icon: 'https://www.google.com/s2/favicons?domain=youtube.com&sz=32',
    url: 'https://www.youtube.com/results?search_query={anime_jp}+{theme}'
  }
];

export const DEFAULT_ANISONGS_CONFIG: AniSongsConfig = {
  active: [],
  presets: DEFAULT_PRESETS
};

export function validateAniSongsConfig(raw: unknown): {
  valid: boolean;
  config?: AniSongsConfig;
  error?: string;
} {
  let data: any = raw;
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed) return { valid: true, config: JSON.parse(JSON.stringify(DEFAULT_ANISONGS_CONFIG)) };
    try {
      data = JSON.parse(trimmed);
    } catch (e: any) {
      return { valid: false, error: `Invalid JSON syntax: ${e.message}` };
    }
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, error: 'Configuration must be an object with "active" and "presets".' };
  }

  if (!Array.isArray(data.presets) || !data.presets.length) {
    return { valid: false, error: 'Configuration must contain at least one preset in "presets".' };
  }

  const validPresets: SongProviderPreset[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < data.presets.length; i++) {
    const p = data.presets[i];
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      return { valid: false, error: `Preset at index ${i} is invalid.` };
    }
    const id = String(p.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const name = String(p.name || '').trim();
    const url = String(p.url || '').trim();
    const icon = String(p.icon || '').trim() || 'https://www.google.com/s2/favicons?domain=youtube.com&sz=32';

    if (!id) return { valid: false, error: `Preset at index ${i} requires an ID.` };
    if (!name) return { valid: false, error: `Preset "${id}" requires a name.` };
    if (!url || !/^https?:\/\//i.test(url)) {
      return { valid: false, error: `Preset "${id}" has an invalid URL. Must start with http:// or https://.` };
    }
    if (seenIds.has(id)) {
      return { valid: false, error: `Duplicate preset ID "${id}". Each preset ID must be unique.` };
    }
    seenIds.add(id);
    validPresets.push({ id, name, icon, url });
  }

  const rawActive = Array.isArray(data.active) ? data.active : [];
  const validActive = rawActive.map((s: any) => String(s).trim()).filter((id: string) => seenIds.has(id));

  return {
    valid: true,
    config: {
      active: validActive,
      presets: validPresets
    }
  };
}

export function getValidAniSongsConfig(): AniSongsConfig {
  const raw = Settings.get('aniSongsProviders');
  const check = validateAniSongsConfig(raw);
  return check.valid && check.config ? check.config : JSON.parse(JSON.stringify(DEFAULT_ANISONGS_CONFIG));
}

export function buildProviderUrl(template: string, params: SongParams): string {
  if (!template || typeof template !== 'string') return '#';
  const enc = (s: string) => encodeURIComponent((s || '').trim());
  const encPlus = (s: string) => encodeURIComponent((s || '').trim()).replace(/%20/g, '+');
  const format = template.includes('+') ? encPlus : enc;

  const title = (params.title || '').trim();
  const titleRomaji = (params.title_romaji || title).trim();
  const titleJp = (params.title_jp || title).trim();
  const artist = (params.artist || '').trim();
  const artists = (params.artists || artist).trim();

  const anime = (params.anime || '').trim();
  const animeRomaji = (params.anime_romaji || anime).trim();
  const animeEn = (params.anime_en || anime).trim();
  const animeJp = (params.anime_jp || anime).trim();

  const type = params.type || 'OP';
  const number = String(params.number || 1);
  const theme = `${type}${number}`;
  const year = params.year != null ? String(params.year).trim() : '';
  const season = (params.season || '').trim();
  const eps = (params.eps || '').trim();

  const query = [title, artist].filter(Boolean).join(' ');
  const queryAnime = [anime, theme].filter(Boolean).join(' ');
  const queryJp = [animeJp, theme].filter(Boolean).join(' ');

  return template
    .replace(/\{title_romaji\}/gi, format(titleRomaji))
    .replace(/\{title_jp\}/gi, format(titleJp))
    .replace(/\{title_native\}/gi, format(titleJp))
    .replace(/\{title\}/gi, format(title))
    .replace(/\{artists\}/gi, format(artists))
    .replace(/\{artist\}/gi, format(artist))
    .replace(/\{anime_romaji\}/gi, format(animeRomaji))
    .replace(/\{anime_english\}/gi, format(animeEn))
    .replace(/\{anime_en\}/gi, format(animeEn))
    .replace(/\{anime_native\}/gi, format(animeJp))
    .replace(/\{anime_jp\}/gi, format(animeJp))
    .replace(/\{anime\}/gi, format(anime))
    .replace(/\{year\}/gi, format(year))
    .replace(/\{season\}/gi, format(season))
    .replace(/\{theme\}/gi, format(theme))
    .replace(/\{type\}/gi, format(type))
    .replace(/\{number\}/gi, format(number))
    .replace(/\{eps\}/gi, format(eps))
    .replace(/\{query_anime\}/gi, format(queryAnime))
    .replace(/\{query_jp\}/gi, format(queryJp))
    .replace(/\{query\}/gi, format(query));
}

const MODAL_ID = 'ala-anisongs-modal-backdrop';

addStyle(
  'ala-anisongs-modal-style',
  `
  #${MODAL_ID}{position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:rgba(5,12,20,.72);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
  #${MODAL_ID} .ala-as-sheet{display:flex;flex-direction:column;width:min(660px,100%);height:100%;max-height:92vh;border-radius:10px;background:rgb(var(--color-foreground));color:rgb(var(--color-text));box-shadow:0 18px 60px rgba(0,0,0,.5);overflow:hidden}
  .ala-as-sheet *{box-sizing:border-box}
  .ala-as-sheet :focus-visible{outline:2px solid rgb(var(--color-blue));outline-offset:2px}
  .ala-as-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid rgba(var(--color-text-lighter),.14)}
  .ala-as-head h2{margin:0;font-size:18px;font-weight:600}
  .ala-as-body{flex:1 1 auto;min-height:0;padding:16px 20px;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;scrollbar-gutter:stable}
  .ala-as-foot{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:12px 20px;border-top:1px solid rgba(var(--color-text-lighter),.14)}

  .ala-as-tabs{display:flex;gap:6px;margin-bottom:16px;border-bottom:1px solid rgba(var(--color-text-lighter),.14);padding-bottom:10px;overflow-x:auto;-webkit-overflow-scrolling:touch}
  .ala-as-tab{padding:6px 14px;border:0;border-radius:4px;background:transparent;color:rgb(var(--color-text-lighter));font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all .15s}
  .ala-as-tab:hover{color:rgb(var(--color-text));background:rgba(var(--color-text-lighter),.1)}
  .ala-as-tab.is-active{color:#fff;background:rgb(var(--color-blue))}

  .ala-as-box{padding:14px;border-radius:6px;background:rgb(var(--color-background));margin-bottom:16px}
  .ala-as-title{margin:0 0 8px;font-size:13px;font-weight:600;color:rgb(var(--color-blue))}
  .ala-as-help{font-size:12px;color:rgb(var(--color-text-lighter));margin:0 0 10px;line-height:1.4}

  .ala-as-list{display:grid;gap:6px;margin-bottom:12px;min-width:0}
  .ala-as-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;background:rgb(var(--color-foreground));border:1px solid rgba(var(--color-text-lighter),.12);min-width:0;max-width:100%}
  .ala-as-item-icon{width:22px;height:22px;object-fit:contain;border-radius:3px;flex-shrink:0}
  .ala-as-item-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
  .ala-as-item-name{font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px}
  .ala-as-item-url{font-size:11px;color:rgb(var(--color-text-lighter));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:monospace}
  .ala-as-item-actions{display:flex;align-items:center;gap:4px;flex-shrink:0}

  .ala-as-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border:1px solid rgba(var(--color-text-lighter),.25);border-radius:14px;background:rgb(var(--color-foreground));color:rgb(var(--color-text));font-size:12px;cursor:pointer;transition:all .15s}
  .ala-as-chip:hover{border-color:rgb(var(--color-blue));color:rgb(var(--color-blue))}
  .ala-as-chip-group{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}

  .ala-as-form{display:grid;gap:8px;margin-top:8px}
  .ala-as-form-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .ala-as-field{display:flex;flex-direction:column;gap:4px}
  .ala-as-field label{font-size:11px;font-weight:600;color:rgb(var(--color-text-lighter))}
  .ala-as-input{width:100%;height:34px;padding:0 8px;border:1px solid rgba(var(--color-text-lighter),.22);border-radius:4px;background:rgb(var(--color-foreground));color:rgb(var(--color-text));font:inherit;font-size:12px}
  .ala-as-input:focus{outline:none;border-color:rgb(var(--color-blue))}

  .ala-as-var-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;max-height:120px;overflow-y:auto;padding-bottom:2px}
  .ala-as-var-tag{padding:3px 7px;border-radius:3px;font-family:monospace;font-size:11px;background:rgba(var(--color-blue),.15);color:rgb(var(--color-blue));cursor:pointer;user-select:none;touch-action:manipulation}
  .ala-as-var-tag:hover{background:rgb(var(--color-blue));color:#fff}

  .ala-as-textarea{width:100%;height:280px;padding:10px;border:1px solid rgba(var(--color-text-lighter),.22);border-radius:4px;background:rgb(var(--color-foreground));color:rgb(var(--color-text));font-family:monospace,Consolas,Courier;font-size:12px;line-height:1.4;resize:vertical;tab-size:2}
  .ala-as-status{padding:8px 12px;border-radius:4px;font-size:12px;margin-top:10px;display:none}
  .ala-as-status--success{background:rgba(var(--color-green,70,211,105),.15);color:rgb(var(--color-green,70,211,105));border:1px solid rgba(var(--color-green,70,211,105),.3)}
  .ala-as-status--error{background:rgba(var(--color-red,235,87,87),.15);color:rgb(var(--color-red,235,87,87));border:1px solid rgba(var(--color-red,235,87,87),.3)}

  .ala-as-sheet .ala-btn:disabled,
  .ala-as-sheet .ala-icon-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    pointer-events: none;
    filter: none !important;
  }

  @media (max-width:700px){
    #${MODAL_ID}{align-items:flex-end;padding:0}
    #${MODAL_ID} .ala-as-sheet{width:100%;height:92vh;height:92dvh;max-height:92vh;max-height:92dvh;border-radius:14px 14px 0 0}
    .ala-as-head{padding:14px 16px}
    .ala-as-body{padding:12px 16px}
    .ala-as-foot{padding:10px 16px calc(10px + env(safe-area-inset-bottom, 0px));flex-direction:column-reverse;gap:8px}
    .ala-as-foot .ala-btn{width:100%;min-height:42px;justify-content:center}

    .ala-as-form-row{grid-template-columns:1fr;gap:6px}
    .ala-as-input{height:38px;font-size:14px}

    .ala-as-item{flex-wrap:wrap;align-items:flex-start;gap:8px;padding:10px}
    .ala-as-item-info{flex:1 1 calc(100% - 36px);min-width:0}
    .ala-as-item-url{white-space:normal;word-break:break-all;font-size:10px}
    .ala-as-item-actions{width:100%;display:flex;gap:6px;margin-top:4px;padding-top:6px;border-top:1px solid rgba(var(--color-text-lighter),.1)}
    .ala-as-item-actions .ala-btn{flex:1 1 0;min-height:36px;justify-content:center;font-size:12px}
    .ala-as-item-actions .ala-icon-btn{flex:0 0 36px;height:36px}

    .ala-as-form-actions{flex-direction:column;gap:8px;width:100%}
    .ala-as-form-actions .ala-btn{width:100%;min-height:42px;margin-left:0!important;justify-content:center;text-align:center}

    .ala-as-json-actions{flex-direction:column;gap:8px}
    .ala-as-json-actions .ala-btn{width:100%;min-height:42px;margin-left:0!important;justify-content:center}
    .ala-as-textarea{height:200px}
  }
  `
);

export function openAniSongsModal(inputEl?: HTMLInputElement): void {
  const existing = document.getElementById(MODAL_ID);
  if (existing) existing.remove();

  let stateConfig: AniSongsConfig;
  try {
    const rawVal = inputEl ? inputEl.value : JSON.stringify(Settings.get('aniSongsProviders'));
    const parsed = JSON.parse(rawVal);
    const check = validateAniSongsConfig(parsed);
    stateConfig = check.valid && check.config ? check.config : JSON.parse(JSON.stringify(DEFAULT_ANISONGS_CONFIG));
  } catch {
    stateConfig = JSON.parse(JSON.stringify(DEFAULT_ANISONGS_CONFIG));
  }

  const backdrop = document.createElement('div');
  backdrop.id = MODAL_ID;
  backdrop.innerHTML = `
    <div class="ala-as-sheet" role="dialog" aria-modal="true" aria-labelledby="ala-as-modal-title">
      <header class="ala-as-head">
        <h2 id="ala-as-modal-title">Customize Song Search Providers</h2>
        <button class="ala-icon-btn ala-as-close" type="button" aria-label="Close">✕</button>
      </header>
      <div class="ala-as-body">
        <div class="ala-as-tabs">
          <button class="ala-as-tab is-active" data-tab="presets" type="button">Shortcuts &amp; Presets</button>
          <button class="ala-as-tab" data-tab="json" type="button">Import / Export JSON</button>
        </div>

        <div id="ala-as-view-presets">
          <div class="ala-as-box">
            <h3 class="ala-as-title">Active Shortcuts</h3>
            <p class="ala-as-help">These search icons appear directly next to each song on anime pages. Use arrows to reorder.</p>
            <div id="ala-as-active-list" class="ala-as-list"></div>
            <div style="font-size:11px;font-weight:600;color:rgb(var(--color-text-lighter));margin-top:8px">Add inactive preset to shortcuts:</div>
            <div id="ala-as-available-chips" class="ala-as-chip-group"></div>
          </div>

          <div class="ala-as-box">
            <h3 class="ala-as-title">All Presets</h3>
            <p class="ala-as-help">Manage available music and video providers.</p>
            <div id="ala-as-preset-list" class="ala-as-list"></div>

            <div style="border-top:1px solid rgba(var(--color-text-lighter),.12);padding-top:12px;margin-top:12px">
              <h4 id="ala-as-form-heading" style="margin:0 0 8px;font-size:12px;color:rgb(var(--color-blue))">Add Custom Preset</h4>
              <div class="ala-as-form">
                <div class="ala-as-form-row">
                  <div class="ala-as-field">
                    <label for="ala-as-in-name">Name</label>
                    <input type="text" id="ala-as-in-name" class="ala-as-input" placeholder="e.g. Deezer">
                  </div>
                  <div class="ala-as-field">
                    <label for="ala-as-in-icon">Favicon / Icon URL</label>
                    <input type="text" id="ala-as-in-icon" class="ala-as-input" placeholder="e.g. https://www.deezer.com/favicon.ico">
                  </div>
                </div>
                <div class="ala-as-field">
                  <label for="ala-as-in-url">URL Search Template</label>
                  <input type="text" id="ala-as-in-url" class="ala-as-input" placeholder="e.g. https://www.deezer.com/search/{title}%20{artist}">
                  <div class="ala-as-var-tags">
                    <span class="ala-as-var-tag" data-var="{title}">{title}</span>
                    <span class="ala-as-var-tag" data-var="{title_jp}">{title_jp}</span>
                    <span class="ala-as-var-tag" data-var="{title_romaji}">{title_romaji}</span>
                    <span class="ala-as-var-tag" data-var="{artist}">{artist}</span>
                    <span class="ala-as-var-tag" data-var="{artists}">{artists}</span>
                    <span class="ala-as-var-tag" data-var="{anime}">{anime}</span>
                    <span class="ala-as-var-tag" data-var="{anime_jp}">{anime_jp}</span>
                    <span class="ala-as-var-tag" data-var="{anime_romaji}">{anime_romaji}</span>
                    <span class="ala-as-var-tag" data-var="{anime_en}">{anime_en}</span>
                    <span class="ala-as-var-tag" data-var="{theme}">{theme}</span>
                    <span class="ala-as-var-tag" data-var="{type}">{type}</span>
                    <span class="ala-as-var-tag" data-var="{number}">{number}</span>
                    <span class="ala-as-var-tag" data-var="{year}">{year}</span>
                    <span class="ala-as-var-tag" data-var="{season}">{season}</span>
                    <span class="ala-as-var-tag" data-var="{query}">{query}</span>
                    <span class="ala-as-var-tag" data-var="{query_anime}">{query_anime}</span>
                    <span class="ala-as-var-tag" data-var="{query_jp}">{query_jp}</span>
                  </div>
                </div>
                <div class="ala-as-form-actions" style="display:flex;gap:8px;margin-top:6px">
                  <button type="button" class="ala-btn ala-btn--sm ala-btn--primary" id="ala-as-btn-save-preset">Add Preset</button>
                  <button type="button" class="ala-btn ala-btn--sm" id="ala-as-btn-cancel-preset" style="display:none">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div id="ala-as-view-json" style="display:none">
          <div class="ala-as-box">
            <h3 class="ala-as-title">Raw JSON Configuration</h3>
            <p class="ala-as-help">View, export, or paste preset definitions and active provider arrays.</p>
            <textarea id="ala-as-json-area" class="ala-as-textarea" spellcheck="false"></textarea>
            <div id="ala-as-json-status" class="ala-as-status"></div>
            <div class="ala-as-json-actions" style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
              <button type="button" class="ala-btn ala-btn--primary" id="ala-as-btn-apply-json">Apply JSON</button>
              <button type="button" class="ala-btn" id="ala-as-btn-copy-json">Copy to Clipboard</button>
              <button type="button" class="ala-btn" id="ala-as-btn-reset-defaults" style="margin-left:auto">Reset Defaults</button>
            </div>
          </div>
        </div>
      </div>
      <footer class="ala-as-foot">
        <button class="ala-btn ala-btn--primary" id="ala-as-btn-done" type="button">Apply &amp; Save</button>
        <button class="ala-btn ala-as-close" type="button">Cancel</button>
      </footer>
    </div>
  `;

  document.body.appendChild(backdrop);

  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    backdrop.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);

  backdrop.querySelectorAll('.ala-as-close').forEach((btn) => btn.addEventListener('click', close));
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  const tabs = backdrop.querySelectorAll<HTMLButtonElement>('.ala-as-tab');
  const viewPresets = backdrop.querySelector('#ala-as-view-presets') as HTMLElement;
  const viewJson = backdrop.querySelector('#ala-as-view-json') as HTMLElement;
  const jsonArea = backdrop.querySelector('#ala-as-json-area') as HTMLTextAreaElement;
  const jsonStatus = backdrop.querySelector('#ala-as-json-status') as HTMLElement;

  tabs.forEach((t) => {
    t.addEventListener('click', () => {
      tabs.forEach((o) => o.classList.toggle('is-active', o === t));
      const isJson = t.dataset.tab === 'json';
      viewPresets.style.display = isJson ? 'none' : 'block';
      viewJson.style.display = isJson ? 'block' : 'none';
      if (isJson) {
        jsonArea.value = JSON.stringify(stateConfig, null, 2);
        jsonStatus.style.display = 'none';
      }
    });
  });

  const urlInput = backdrop.querySelector('#ala-as-in-url') as HTMLInputElement;
  const nameInput = backdrop.querySelector('#ala-as-in-name') as HTMLInputElement;
  const iconInput = backdrop.querySelector('#ala-as-in-icon') as HTMLInputElement;
  const formHeading = backdrop.querySelector('#ala-as-form-heading') as HTMLElement;
  const savePresetBtn = backdrop.querySelector('#ala-as-btn-save-preset') as HTMLButtonElement;
  const cancelPresetBtn = backdrop.querySelector('#ala-as-btn-cancel-preset') as HTMLButtonElement;
  let editingPresetId: string | null = null;

  backdrop.querySelectorAll<HTMLSpanElement>('.ala-as-var-tag').forEach((chip) => {
    chip.addEventListener('click', () => {
      const tag = chip.dataset.var || '';
      urlInput.value += tag;
      urlInput.focus();
    });
  });

  const resetForm = () => {
    editingPresetId = null;
    formHeading.textContent = 'Add Custom Preset';
    savePresetBtn.textContent = 'Add Preset';
    cancelPresetBtn.style.display = 'none';
    nameInput.value = '';
    iconInput.value = '';
    urlInput.value = '';
  };
  cancelPresetBtn.addEventListener('click', resetForm);

  savePresetBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    const url = urlInput.value.trim();
    const icon =
      iconInput.value.trim() ||
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.replace(/^https?:\/\//i, '').split('/')[0])}&sz=32`;

    if (!name) return alert('Please enter a preset name.');
    if (!url || !/^https?:\/\//i.test(url)) return alert('Please enter a valid URL template starting with http:// or https://.');

    if (editingPresetId) {
      const idx = stateConfig.presets.findIndex((p) => p.id === editingPresetId);
      if (idx !== -1) {
        stateConfig.presets[idx] = { ...stateConfig.presets[idx], name, icon, url };
      }
    } else {
      const id = name.toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '_' + Math.floor(Math.random() * 1000);
      stateConfig.presets.push({ id, name, icon, url });
      stateConfig.active.push(id);
    }

    resetForm();
    renderUI();
  });

  function renderUI() {
    const activeList = backdrop.querySelector('#ala-as-active-list') as HTMLElement;
    const availableChips = backdrop.querySelector('#ala-as-available-chips') as HTMLElement;
    const presetList = backdrop.querySelector('#ala-as-preset-list') as HTMLElement;

    const presetMap = new Map<string, SongProviderPreset>();
    stateConfig.presets.forEach((p) => presetMap.set(p.id, p));

    stateConfig.active = stateConfig.active.filter((id) => presetMap.has(id));

    if (!stateConfig.active.length) {
      activeList.innerHTML = `<div style="font-size:12px;color:rgb(var(--color-text-lighter));padding:8px 0">No active shortcuts selected. Tap an available preset below to activate it.</div>`;
    } else {
      const totalActive = stateConfig.active.length;
      activeList.innerHTML = stateConfig.active
        .map((id, idx) => {
          const p = presetMap.get(id)!;
          const isTop = idx === 0;
          const isBottom = idx === totalActive - 1;

          return `
          <div class="ala-as-item" data-id="${p.id}">
            <img class="ala-as-item-icon" src="${p.icon}" alt="" onerror="this.src='https://www.google.com/s2/favicons?domain=youtube.com&sz=32'">
            <div class="ala-as-item-info">
              <span class="ala-as-item-name">${p.name}</span>
              <span class="ala-as-item-url">${p.url}</span>
            </div>
            <div class="ala-as-item-actions">
              <button type="button" class="ala-btn ala-btn--sm ala-as-act-up" data-idx="${idx}" ${isTop ? 'disabled' : ''} title="Move Up">▲</button>
              <button type="button" class="ala-btn ala-btn--sm ala-as-act-down" data-idx="${idx}" ${isBottom ? 'disabled' : ''} title="Move Down">▼</button>
              <button type="button" class="ala-btn ala-btn--sm ala-btn--danger ala-as-act-remove" data-id="${p.id}" title="Remove from active">✕</button>
            </div>
          </div>
        `;
        })
        .join('');
    }

    const activeSet = new Set(stateConfig.active);
    const inactivePresets = stateConfig.presets.filter((p) => !activeSet.has(p.id));
    if (!inactivePresets.length) {
      availableChips.innerHTML = `<span style="font-size:12px;color:rgb(var(--color-text-lighter))">All presets are currently active.</span>`;
    } else {
      availableChips.innerHTML = inactivePresets
        .map(
          (p) => `
          <button type="button" class="ala-as-chip ala-as-chip-activate" data-id="${p.id}">
            <img style="width:14px;height:14px;object-fit:contain" src="${p.icon}" alt="">
            <span>+ ${p.name}</span>
          </button>
        `
        )
        .join('');
    }

    presetList.innerHTML = stateConfig.presets
      .map((p) => {
        const isActive = activeSet.has(p.id);
        return `
        <div class="ala-as-item" data-id="${p.id}">
          <img class="ala-as-item-icon" src="${p.icon}" alt="" onerror="this.src='https://www.google.com/s2/favicons?domain=youtube.com&sz=32'">
          <div class="ala-as-item-info">
            <span class="ala-as-item-name">
              ${p.name}
              ${isActive ? `<span style="font-size:10px;padding:1px 5px;border-radius:3px;background:rgba(var(--color-blue),.15);color:rgb(var(--color-blue))">Active</span>` : ''}
            </span>
            <span class="ala-as-item-url">${p.url}</span>
          </div>
          <div class="ala-as-item-actions">
            <button type="button" class="ala-btn ala-btn--sm ala-as-btn-edit-preset" data-id="${p.id}">Edit</button>
            <button type="button" class="ala-icon-btn ala-as-btn-del-preset" data-id="${p.id}" title="Delete preset">✕</button>
          </div>
        </div>
      `;
      })
      .join('');

    activeList.querySelectorAll<HTMLButtonElement>('.ala-as-act-up').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const idx = Number(btn.dataset.idx);
        if (idx > 0) {
          const temp = stateConfig.active[idx - 1];
          stateConfig.active[idx - 1] = stateConfig.active[idx];
          stateConfig.active[idx] = temp;
          renderUI();
        }
      });
    });

    activeList.querySelectorAll<HTMLButtonElement>('.ala-as-act-down').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const idx = Number(btn.dataset.idx);
        if (idx < stateConfig.active.length - 1) {
          const temp = stateConfig.active[idx + 1];
          stateConfig.active[idx + 1] = stateConfig.active[idx];
          stateConfig.active[idx] = temp;
          renderUI();
        }
      });
    });

    activeList.querySelectorAll<HTMLButtonElement>('.ala-as-act-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        stateConfig.active = stateConfig.active.filter((a) => a !== id);
        renderUI();
      });
    });

    availableChips.querySelectorAll<HTMLButtonElement>('.ala-as-chip-activate').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (id && !stateConfig.active.includes(id)) {
          stateConfig.active.push(id);
          renderUI();
        }
      });
    });

    presetList.querySelectorAll<HTMLButtonElement>('.ala-as-btn-edit-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const p = stateConfig.presets.find((x) => x.id === id);
        if (!p) return;
        editingPresetId = p.id;
        formHeading.textContent = `Edit Preset: ${p.name}`;
        savePresetBtn.textContent = 'Update Preset';
        cancelPresetBtn.style.display = 'inline-flex';
        nameInput.value = p.name;
        iconInput.value = p.icon;
        urlInput.value = p.url;
        nameInput.focus();
      });
    });

    presetList.querySelectorAll<HTMLButtonElement>('.ala-as-btn-del-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (!id) return;
        if (stateConfig.presets.length <= 1) {
          return alert('You must have at least one preset configured.');
        }
        if (!confirm(`Delete preset?`)) return;
        stateConfig.presets = stateConfig.presets.filter((p) => p.id !== id);
        stateConfig.active = stateConfig.active.filter((a) => a !== id);
        if (editingPresetId === id) resetForm();
        renderUI();
      });
    });
  }

  backdrop.querySelector('#ala-as-btn-copy-json')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(jsonArea.value);
      alert('Copied configuration to clipboard!');
    } catch (_) {
      jsonArea.select();
      document.execCommand('copy');
      alert('Copied configuration to clipboard!');
    }
  });

  backdrop.querySelector('#ala-as-btn-reset-defaults')?.addEventListener('click', () => {
    if (!confirm('Reset all music search providers and shortcuts to default settings?')) return;
    stateConfig = JSON.parse(JSON.stringify(DEFAULT_ANISONGS_CONFIG));
    jsonArea.value = JSON.stringify(stateConfig, null, 2);
    renderUI();
    jsonStatus.className = 'ala-as-status ala-as-status--success';
    jsonStatus.textContent = 'Reset to default presets.';
    jsonStatus.style.display = 'block';
  });

  backdrop.querySelector('#ala-as-btn-apply-json')?.addEventListener('click', () => {
    const check = validateAniSongsConfig(jsonArea.value);
    if (!check.valid || !check.config) {
      jsonStatus.className = 'ala-as-status ala-as-status--error';
      jsonStatus.textContent = check.error || 'Invalid configuration JSON';
      jsonStatus.style.display = 'block';
      return;
    }
    stateConfig = check.config;
    renderUI();
    jsonStatus.className = 'ala-as-status ala-as-status--success';
    jsonStatus.textContent = 'Configuration applied successfully!';
    jsonStatus.style.display = 'block';
  });

  backdrop.querySelector('#ala-as-btn-done')?.addEventListener('click', () => {
    const check = validateAniSongsConfig(stateConfig);
    if (!check.valid || !check.config) {
      return alert(check.error || 'Invalid configuration');
    }
    if (inputEl) inputEl.value = JSON.stringify(check.config);
    Settings.set('aniSongsProviders', check.config);
    close();

    const panelStatus = document.querySelector('#ala-settings-panel .ala-status');
    if (panelStatus) {
      panelStatus.textContent = 'Music providers updated. Press "Save and reload" to activate.';
    }
  });

  renderUI();
}