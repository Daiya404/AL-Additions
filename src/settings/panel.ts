import { Settings, TYPES, ROWS, features } from './settings';
import { creditsHtml } from './credits';
import { addStyle, findExactText, icon } from '../utils/dom';
import { debounce, store, esc, tryOr } from '../utils/helpers';
import { alConnect, malConnect, clearAniListAuth, clearMalAuth } from '../api/mal';
import { AniList } from '../api/anilist';
import { Core } from '../core/observer';
import { STANDALONE, STANDALONE_IDS_LIST, detectStandalone, type StandaloneId } from '../utils/standalone';
import { maybeAutoSync } from '../modules/sync/engine';
import { createBackup, downloadBackupFile, importBackup, readFileAsBytes } from './backup';
import { promptPasswordModal } from './passwordModal';
import type { SettingRow, RegisteredFeature } from '../types';
import { DEFAULT_TIERS, validateTiers, normalizeHexColor, type TierConfig } from '../utils/tiers';
import { openOverridesModal } from '../modules/sync/overridesModal';
import { OVERRIDES_SETTING_KEY, getManualOverrides } from '../modules/sync/overrides';

const SECTIONS = ['Sync', 'AniList Enhancements', 'External Links, Downloads & Mappings', 'Advanced'];

const CSS = `
  .ala-settings-nav-section{margin-top:26px}
  .ala-settings-nav-heading{color:rgb(var(--color-text-lighter));margin-bottom:12px}
  .ala-settings-nav-link{display:block;padding:9px 12px;border-radius:3px;color:rgb(var(--color-text));text-decoration:none;cursor:pointer}
  .ala-settings-nav-link:hover,.ala-settings-nav-link.is-active{background:rgb(var(--color-foreground))}
  #ala-settings-mobile-launcher{display:none}

  #ala-settings-backdrop{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:rgba(5,12,20,.72);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
  #ala-settings-panel{box-sizing:border-box;display:flex;flex-direction:column;width:min(680px,100%);height:100%;max-height:100%;border-radius:8px;background:rgb(var(--color-foreground));color:rgb(var(--color-text));font-size:14px;line-height:1.4;box-shadow:0 18px 60px rgba(0,0,0,.45);overflow:hidden;outline:none;transform:translateZ(0)}
  #ala-settings-panel *{box-sizing:border-box}
  #ala-settings-panel :focus-visible{outline:2px solid rgb(var(--color-blue));outline-offset:2px}
  #ala-settings-panel h2,#ala-settings-panel h3{margin:0;font-family:inherit}

  .ala-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px 10px}
  .ala-sheet-head h2{font-size:19px;font-weight:600;line-height:1.3}
  .ala-sheet-body{flex:1 1 auto;min-height:0;padding:0 20px 8px;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;scrollbar-gutter:stable}
  .ala-sheet-foot{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:12px 20px;border-top:1px solid rgba(var(--color-text-lighter),.14)}
  .ala-status{flex:1 1 160px;color:rgb(var(--color-text-lighter));font-size:12px;transition:color .15s}
  .ala-status.is-error{color:rgb(var(--color-red,224,85,85));font-weight:600}

  #ala-settings-panel .ala-section-title{margin:18px 2px 8px;color:rgb(var(--color-blue));font-size:13px;font-weight:600}
  .ala-section{border-radius:6px;background:rgb(var(--color-background));overflow:hidden}
  .ala-section-dropdown{margin-top:14px;border-radius:6px;background:rgb(var(--color-background));overflow:hidden;contain:paint}
  .ala-section-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;min-height:48px;cursor:pointer;user-select:none;list-style:none;transition:background .15s}
  .ala-section-summary::-webkit-details-marker{display:none}
  .ala-section-summary:hover{background:rgba(var(--color-text-lighter),.06)}
  .ala-section-summary:focus-visible{outline:2px solid rgb(var(--color-blue));outline-offset:-2px}
  .ala-section-summary .ala-section-title{margin:0!important;color:rgb(var(--color-blue));font-size:13px;font-weight:600}
  .ala-chevron{display:inline-flex;align-items:center;justify-content:center;color:rgb(var(--color-text-lighter));transition:transform .22s cubic-bezier(0.4,0,0.2,1);will-change:transform}
  .ala-section-dropdown.is-expanded .ala-chevron{transform:rotate(180deg)}
  .ala-section-collapsible .ala-collapsible-inner{border-top:1px solid rgba(var(--color-text-lighter),.12)}

  .ala-collapsible{display:grid;grid-template-rows:0fr;transition:grid-template-rows .22s cubic-bezier(0.4,0,0.2,1),visibility 0s .22s;visibility:hidden;overflow:hidden}
  .ala-collapsible.is-open{grid-template-rows:1fr;transition:grid-template-rows .22s cubic-bezier(0.4,0,0.2,1),visibility 0s 0s;visibility:visible}
  .ala-collapsible-inner{min-height:0;overflow:hidden}

  .ala-feature+.ala-feature{border-top:1px solid rgba(var(--color-text-lighter),.12)}
  .ala-row{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:56px;padding:12px 14px;cursor:pointer}
  .ala-text{display:flex;flex-direction:column;gap:3px;min-width:0}
  .ala-title{font-size:14px;color:rgb(var(--color-text))}
  .ala-help{color:rgb(var(--color-text-lighter));font-size:12px;line-height:1.4}
  .ala-options-collapsible{margin:0;padding:0}
  .ala-options{margin:0 14px 12px 20px;padding-left:12px;border-left:2px solid rgba(var(--color-blue),.4)}
  .ala-options .ala-row{min-height:48px;padding:8px 0;cursor:default}
  .ala-options .ala-row:has(.ala-switch){cursor:pointer}
  .ala-child-option{margin-left:8px}
  .ala-child-option .ala-collapsible-inner{border-left:2px solid rgba(var(--color-blue),.25);padding-left:10px}
  .ala-child-option .ala-row{min-height:44px;padding:6px 0}
  .ala-standalone-note{margin:0 14px 12px;padding:8px 10px;border-radius:4px;border-left:3px solid rgb(var(--color-orange,255,152,0));background:rgba(var(--color-orange,255,152,0),.12);color:rgb(var(--color-text));font-size:12px;line-height:1.45}

  #ala-settings-panel input[type=number],#ala-settings-panel input[type=text],#ala-settings-panel select{width:170px;height:36px;padding:0 10px;border:1px solid rgba(var(--color-text-lighter),.22);border-radius:4px;background:rgb(var(--color-foreground));color:rgb(var(--color-text));font:inherit;font-size:13px}
  #ala-settings-panel input:disabled,#ala-settings-panel select:disabled{cursor:not-allowed}

  .ala-switch{position:relative;flex:0 0 auto;width:44px;height:26px}
  .ala-switch input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
  .ala-slider{position:absolute;inset:0;border-radius:999px;background:rgba(var(--color-text-lighter),.3);transition:background .15s;pointer-events:none}
  .ala-slider:before{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .15s}
  .ala-switch input:checked+.ala-slider{background:rgb(var(--color-blue))}
  .ala-switch input:checked+.ala-slider:before{transform:translateX(18px)}
  .ala-switch input:disabled{cursor:not-allowed}
  .ala-switch input:disabled+.ala-slider{opacity:.5}
  .ala-switch input:focus-visible+.ala-slider{outline:2px solid rgb(var(--color-blue));outline-offset:2px}

  .ala-btn{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 18px;border:1px solid rgba(var(--color-text-lighter),.25);border-radius:4px;background:transparent;color:rgb(var(--color-text));font:inherit;font-size:13px;cursor:pointer}
  .ala-btn--primary{border-color:transparent;background:rgb(var(--color-blue));color:#fff;font-weight:600}
  .ala-btn--danger{border-color:rgba(var(--color-red,224,85,85),.35);color:rgb(var(--color-red,224,85,85))}
  .ala-btn--danger:hover{border-color:transparent;background:rgb(var(--color-red,224,85,85));color:#fff}
  .ala-btn:hover{filter:brightness(1.1)}
  .ala-icon-btn{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:36px;height:36px;border:0;border-radius:50%;background:transparent;color:rgb(var(--color-text-lighter));cursor:pointer}
  .ala-icon-btn:hover{background:rgba(var(--color-text-lighter),.14);color:rgb(var(--color-text))}
  .ala-account-row{cursor:default}
  .ala-account-row .ala-btn{flex:0 0 auto;min-width:145px}
  .ala-credits-content{padding:12px 14px;color:rgb(var(--color-text-lighter));font-size:12px}
  .ala-credit{margin-top:10px}
  .ala-credit:first-child{margin-top:0}
  .ala-credit ul{margin:3px 0 0;padding-left:18px;list-style:disc}
  .ala-credit a{color:rgb(var(--color-blue));text-decoration:none}
  .ala-credit a:hover{text-decoration:underline}

  #ala-tier-editor-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(3px);z-index:100001;display:flex;align-items:center;justify-content:center;padding:16px}
  .ala-tier-editor-sheet{width:100%;max-width:640px;max-height:90vh;display:flex;flex-direction:column;background:rgb(var(--color-foreground));color:rgb(var(--color-text));border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.5);overflow:hidden}
  .ala-tier-desc{font-size:13px;color:rgb(var(--color-text-lighter));margin:0 0 14px;line-height:1.4}
  .ala-tier-table-wrap{overflow-x:auto;max-height:48vh;overflow-y:auto;border:1px solid rgba(var(--color-text-lighter),.15);border-radius:8px;padding:4px}
  .ala-tier-table{width:100%;border-collapse:collapse;font-size:13px}
  .ala-tier-table th{text-align:left;padding:8px 6px;color:rgb(var(--color-text-lighter));font-weight:600;border-bottom:1px solid rgba(var(--color-text-lighter),.15)}
  .ala-tier-table td{padding:6px;vertical-align:middle;border-bottom:1px solid rgba(var(--color-text-lighter),.08)}
  .ala-tier-table input[type=text],.ala-tier-table input[type=number]{height:34px;padding:0 8px;border-radius:6px;border:1px solid rgba(var(--color-text-lighter),.2);background:rgb(var(--color-background));color:rgb(var(--color-text));font:inherit;font-size:13px;box-sizing:border-box}
  .ala-tier-table input[type=color]{width:36px;height:34px;padding:1px;border-radius:6px;border:1px solid rgba(var(--color-text-lighter),.2);background:transparent;cursor:pointer}
  .ala-tier-del-btn{padding:0 8px;height:32px;min-width:32px;display:inline-flex;align-items:center;justify-content:center}
  .ala-tier-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  .ala-tier-json-area{width:100%;height:100px;font-family:monospace;font-size:12px;border-radius:6px;border:1px solid rgba(var(--color-text-lighter),.2);background:rgb(var(--color-background));color:rgb(var(--color-text));padding:8px;box-sizing:border-box;resize:vertical}
  .ala-tier-status{margin-left:auto;font-size:13px;color:rgb(var(--color-green,76,175,80))}
  .ala-tier-status.is-error{color:rgb(var(--color-red,224,85,85))}

  @media (max-width:700px){
    .ala-settings-nav-section{display:none!important}
    #ala-settings-backdrop{align-items:flex-end;padding:0}
    #ala-settings-panel{width:100%;height:92vh;height:92dvh;max-height:92vh;max-height:92dvh;border-radius:14px 14px 0 0}
    #ala-tier-editor-backdrop{align-items:flex-end;padding:0}
    .ala-tier-editor-sheet{width:100%;max-height:92vh;max-height:92dvh;border-radius:14px 14px 0 0}
    .ala-tier-table-wrap{max-height:45vh}
    .ala-tier-table th,.ala-tier-table td{padding:4px}
    .ala-sheet-head{padding:16px 16px 8px}
    .ala-sheet-body{padding:0 16px 8px}
    .ala-sheet-foot{padding:12px 16px calc(12px + env(safe-area-inset-bottom))}
    .ala-sheet-foot .ala-btn{flex:1 1 40%;min-height:44px}
    .ala-status{flex-basis:100%;order:3}
    .ala-row{min-height:60px}
    .ala-options .ala-row{flex-direction:column;align-items:stretch;gap:8px}
    .ala-options .ala-row:has(.ala-switch){flex-direction:row;align-items:center;justify-content:space-between}
    .ala-account-row{flex-direction:column;align-items:stretch;gap:10px}
    .ala-account-row .ala-btn{width:100%;min-height:42px}
    #ala-settings-panel input[type=number],#ala-settings-panel input[type=text],#ala-settings-panel select{width:100%;height:44px;font-size:16px}
    #ala-settings-mobile-launcher{display:inline-flex;align-items:center;gap:8px;position:fixed;left:16px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:99998;min-height:46px;padding:0 18px;border:1px solid rgba(255,255,255,.16);border-radius:999px;background:rgb(var(--color-blue));color:#fff;font:inherit;font-size:14px;font-weight:600;box-shadow:0 6px 20px rgba(0,0,0,.35);cursor:pointer}
    #ala-settings-mobile-launcher:active{transform:translateY(1px)}
  }
  @media (prefers-reduced-motion:reduce){.ala-slider,.ala-slider:before,.ala-collapsible,.ala-chevron{transition:none!important}}`;

const onSettingsPage = (): boolean => /^\/settings(\/|$)/.test(location.pathname);

const rowText = (title: string, help: string): string =>
  `<span class="ala-text"><span class="ala-title">${title}</span><span class="ala-help">${help}</span></span>`;

const optionHtml = (r: SettingRow): string => {
  const tag = r.type === 'json' ? 'div' : 'label';
  const rowHtml = `<${tag} class="ala-row">${rowText(r.title, r.help)}${TYPES[r.type].html(r, Settings.get(r.key))}</${tag}>`;
  if (r.childOf) {
    const parentVal = !!Settings.get(r.childOf);
    return `<div class="ala-collapsible ala-child-option ${parentVal ? 'is-open' : ''}" data-child-for="${r.childOf}">
      <div class="ala-collapsible-inner">
        ${rowHtml}
      </div>
    </div>`;
  }
  return rowHtml;
};

const featureHtml = (f: RegisteredFeature): string => {
  if (f.toggle.type === 'json') {
    return `<div class="ala-feature" data-feature="${f.id}">
      <div class="ala-row ala-row--main">${rowText(f.title, f.help)}${TYPES.json.html(f.toggle, Settings.get(f.toggle.key))}</div>
    </div>`;
  }
  const isFeatureOn = !!Settings.get(f.toggle.key);
  return `<div class="ala-feature ${isFeatureOn ? '' : 'is-off'}" data-feature="${f.id}">
    <label class="ala-row ala-row--main">${rowText(f.title, f.help)}${TYPES.toggle.html(f.toggle, isFeatureOn)}</label>
    ${f.options.length ? `
      <div class="ala-collapsible ala-options-collapsible ${isFeatureOn ? 'is-open' : ''}">
        <div class="ala-collapsible-inner">
          <div class="ala-options">${f.options.map(optionHtml).join('')}</div>
        </div>
      </div>` : ''}
  </div>`;
};

function accountsHtml(): string {
  const alConnected = !!store.get('al_token', null);
  const alUser = store.get<string | null>('al_username', null);
  const malConnected = !!store.get('mal_token', null);

  const alStatus = alConnected ? (alUser ? `Connected as <b>${esc(alUser)}</b>` : 'Connected') : 'Not connected';
  const malStatus = malConnected ? 'Connected' : 'Not connected';

  return `<h3 class="ala-section-title">Connected Accounts</h3>
  <div class="ala-section">
    <div class="ala-row ala-account-row">
      <span class="ala-text">
        <span class="ala-title">AniList</span>
        <span class="ala-help" id="ala-status-al">${alStatus}</span>
      </span>
      <button type="button" class="ala-btn ${alConnected ? 'ala-btn--danger' : 'ala-btn--primary'}" id="ala-btn-al">
        ${alConnected ? 'Disconnect' : 'Connect to AniList'}
      </button>
    </div>
    <div class="ala-row ala-account-row" style="border-top:1px solid rgba(var(--color-text-lighter),.12)">
      <span class="ala-text">
        <span class="ala-title">MyAnimeList</span>
        <span class="ala-help" id="ala-status-mal">${malStatus}</span>
      </span>
      <button type="button" class="ala-btn ${malConnected ? 'ala-btn--danger' : 'ala-btn--primary'}" id="ala-btn-mal">
        ${malConnected ? 'Disconnect' : 'Connect to MAL'}
      </button>
    </div>
  </div>`;
}

function backupRestoreHtml(): string {
  return `<details class="ala-section-dropdown" data-section="backup" open>
    <summary class="ala-section-summary">
      <span class="ala-section-title">Backup &amp; Restore</span>
      <span class="ala-chevron">${icon('chevron', 14)}</span>
    </summary>
    <div class="ala-collapsible ala-section-collapsible">
      <div class="ala-collapsible-inner">
        <div class="ala-section">
          <div class="ala-row ala-account-row">
            <span class="ala-text">
              <span class="ala-title">Export Settings</span>
              <span class="ala-help">Download all settings as a backup file. Excludes account credentials.</span>
            </span>
            <button type="button" class="ala-btn" id="ala-btn-export">Export</button>
          </div>
          <div class="ala-row ala-account-row" style="border-top:1px solid rgba(var(--color-text-lighter),.12)">
            <span class="ala-text">
              <span class="ala-title">Export with Credentials</span>
              <span class="ala-help">Include AniList and MyAnimeList tokens. A password is required.</span>
            </span>
            <button type="button" class="ala-btn ala-btn--danger" id="ala-btn-export-secrets">Export with Secrets</button>
          </div>
          <div class="ala-row ala-account-row" style="border-top:1px solid rgba(var(--color-text-lighter),.12)">
            <span class="ala-text">
              <span class="ala-title">Import Settings</span>
              <span class="ala-help">Restore settings from an <code>al-additions.settings</code> file. Existing values not in the backup are kept.</span>
            </span>
            <button type="button" class="ala-btn ala-btn--primary" id="ala-btn-import">Import File</button>
            <input type="file" id="ala-import-file" accept=".settings,.json,text/*" style="display:none">
          </div>
        </div>
      </div>
    </div>
  </details>`;
}

function sectionsHtml(): string {
  const order = [...new Set([...SECTIONS, ...features.map((f) => f.section)])];
  return order
    .map((name) => {
      const items = features.filter((f) => f.section === name);
      return items.length
        ? `<details class="ala-section-dropdown" data-section="${esc(name)}" open>
            <summary class="ala-section-summary">
              <span class="ala-section-title">${esc(name)}</span>
              <span class="ala-chevron">${icon('chevron', 14)}</span>
            </summary>
            <div class="ala-collapsible ala-section-collapsible">
              <div class="ala-collapsible-inner">
                <div class="ala-section">${items.map(featureHtml).join('')}</div>
              </div>
            </div>
          </details>`
        : '';
    })
    .join('');
}

function creditsDropdownHtml(): string {
  return `<details class="ala-section-dropdown ala-credits-dropdown" data-section="credits" open>
    <summary class="ala-section-summary">
      <span class="ala-section-title">Credits</span>
      <span class="ala-chevron">${icon('chevron', 14)}</span>
    </summary>
    <div class="ala-collapsible ala-section-collapsible">
      <div class="ala-collapsible-inner">
        <div class="ala-credits-content">${creditsHtml()}</div>
      </div>
    </div>
  </details>`;
}

function initDropdownAnimations(panel: HTMLElement): void {
  panel.querySelectorAll<HTMLDetailsElement>('details.ala-section-dropdown').forEach((details) => {
    const summary = details.querySelector<HTMLElement>(':scope > summary');
    const collapsible = details.querySelector<HTMLElement>(':scope > .ala-collapsible');
    if (!summary || !collapsible) return;

    summary.addEventListener('click', (e) => {
      e.preventDefault();
      const isExpanded = details.classList.toggle('is-expanded');
      collapsible.classList.toggle('is-open', isExpanded);
    });
  });
}

let prevOverflow: string | null = null;

function openTierEditor(inputEl: HTMLInputElement): void {
  let tiers: TierConfig[];
  try {
    const parsed = JSON.parse(inputEl.value);
    const check = validateTiers(parsed);
    tiers = check.valid && check.tiers ? check.tiers : JSON.parse(JSON.stringify(DEFAULT_TIERS));
  } catch {
    tiers = JSON.parse(JSON.stringify(DEFAULT_TIERS));
  }

  const existing = document.getElementById('ala-tier-editor-backdrop');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'ala-tier-editor-backdrop';
  backdrop.innerHTML = `
    <div class="ala-sheet ala-tier-editor-sheet" role="dialog" aria-modal="true" aria-labelledby="ala-tier-modal-title">
      <header class="ala-sheet-head">
        <h2 id="ala-tier-modal-title">Customize Tier Labels</h2>
        <button class="ala-icon-btn ala-tier-close" type="button" aria-label="Close">✕</button>
      </header>
      <div class="ala-sheet-body">
        <p class="ala-tier-desc">Configure tier badges, score thresholds (0–100 scale), and colors. Tiers match in order from top to bottom.</p>
        <div class="ala-tier-table-wrap">
          <table class="ala-tier-table">
            <thead>
              <tr>
                <th style="width:75px">Label</th>
                <th style="width:70px">Min</th>
                <th style="width:70px">Max</th>
                <th style="width:48px">Badge</th>
                <th style="width:48px">Text</th>
                <th style="width:75px">Preview</th>
                <th style="width:36px"></th>
              </tr>
            </thead>
            <tbody id="ala-tier-tbody"></tbody>
          </table>
        </div>
        <div class="ala-tier-actions">
          <button type="button" class="ala-btn" id="ala-tier-btn-add">+ Add Tier</button>
          <button type="button" class="ala-btn" id="ala-tier-btn-reset">Reset Defaults</button>
          <button type="button" class="ala-btn" id="ala-tier-btn-toggle-json">Import / Export JSON</button>
        </div>
        <div id="ala-tier-json-wrap" style="display:none;margin-top:12px">
          <textarea id="ala-tier-json-area" class="ala-tier-json-area" rows="6" spellcheck="false"></textarea>
          <div style="display:flex;gap:8px;margin-top:6px">
            <button type="button" class="ala-btn" id="ala-tier-btn-apply-json">Apply JSON</button>
          </div>
        </div>
      </div>
      <footer class="ala-sheet-foot">
        <button class="ala-btn ala-btn--primary" id="ala-tier-btn-save" type="button">Apply Tiers</button>
        <button class="ala-btn" id="ala-tier-btn-cancel" type="button">Cancel</button>
        <span class="ala-tier-status" id="ala-tier-status" role="status"></span>
      </footer>
    </div>
  `;

  document.body.appendChild(backdrop);
  const tbody = backdrop.querySelector('#ala-tier-tbody') as HTMLElement;
  const status = backdrop.querySelector('#ala-tier-status') as HTMLElement;

  const setModalStatus = (msg: string, isError = false) => {
    status.textContent = msg;
    status.className = `ala-tier-status ${isError ? 'is-error' : ''}`;
  };

  const createRowHtml = (t: TierConfig, idx: number) => {
    const badgeColor = normalizeHexColor(t.color) || '#000000';
    const textColor = normalizeHexColor(t.textColor) || '#ffffff';
    return `
    <tr data-idx="${idx}">
      <td><input type="text" class="ala-t-label" value="${esc(t.label)}" maxlength="20" placeholder="Label" style="width:100%"></td>
      <td><input type="number" class="ala-t-min" min="0" max="100" step="0.1" value="${t.min}" style="width:100%"></td>
      <td><input type="number" class="ala-t-max" min="0" max="100" step="0.1" value="${t.max}" style="width:100%"></td>
      <td><input type="color" class="ala-t-color" value="${esc(badgeColor)}" title="Badge Background Color"></td>
      <td><input type="color" class="ala-t-text-color" value="${esc(textColor)}" title="Badge Text Color"></td>
      <td><span class="ala-tier-badge ala-tier-badge--list ala-t-preview" style="background-color:${esc(badgeColor)};color:${esc(textColor)}">${esc(t.label)}</span></td>
      <td><button type="button" class="ala-icon-btn ala-tier-del-btn" title="Delete Tier">✕</button></td>
    </tr>
  `;
  };

  const renderTable = (list: TierConfig[]) => {
    tbody.innerHTML = list.map((t, i) => createRowHtml(t, i)).join('');
  };

  const getRowsData = (): TierConfig[] => {
    const rows = tbody.querySelectorAll<HTMLTableRowElement>('tr');
    const result: TierConfig[] = [];
    rows.forEach((tr) => {
      const label = (tr.querySelector<HTMLInputElement>('.ala-t-label')?.value || '').trim();
      const min = parseFloat(tr.querySelector<HTMLInputElement>('.ala-t-min')?.value || '0');
      const max = parseFloat(tr.querySelector<HTMLInputElement>('.ala-t-max')?.value || '100');
      const color = tr.querySelector<HTMLInputElement>('.ala-t-color')?.value || '#000000';
      const textColor = tr.querySelector<HTMLInputElement>('.ala-t-text-color')?.value || '#ffffff';
      result.push({
        label: label || 'Tier',
        min: isNaN(min) ? 0 : min,
        max: isNaN(max) ? 100 : max,
        color,
        textColor
      });
    });
    return result;
  };

  const updatePreview = (tr: HTMLTableRowElement) => {
    const label = tr.querySelector<HTMLInputElement>('.ala-t-label')?.value || '';
    const color = tr.querySelector<HTMLInputElement>('.ala-t-color')?.value || '#000000';
    const textColor = tr.querySelector<HTMLInputElement>('.ala-t-text-color')?.value || '#ffffff';
    const preview = tr.querySelector<HTMLElement>('.ala-t-preview');
    if (preview) {
      preview.textContent = label;
      preview.style.backgroundColor = color;
      preview.style.color = textColor;
    }
  };

  tbody.addEventListener('input', (e) => {
    const target = e.target as HTMLElement;
    const tr = target.closest<HTMLTableRowElement>('tr');
    if (tr) updatePreview(tr);
  });

  tbody.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLButtonElement>('.ala-tier-del-btn');
    if (btn) {
      const tr = btn.closest<HTMLTableRowElement>('tr');
      if (tr) {
        tr.remove();
        setModalStatus('Tier removed.');
      }
    }
  });

  backdrop.querySelector('#ala-tier-btn-add')?.addEventListener('click', () => {
    const current = getRowsData();
    current.push({ min: 0, max: 0, label: 'New', color: '#3db4f2', textColor: '#ffffff' });
    renderTable(current);
    setModalStatus('Added new tier.');
  });

  backdrop.querySelector('#ala-tier-btn-reset')?.addEventListener('click', () => {
    renderTable(JSON.parse(JSON.stringify(DEFAULT_TIERS)));
    setModalStatus('Reset to default tiers.');
  });

  const jsonWrap = backdrop.querySelector('#ala-tier-json-wrap') as HTMLElement;
  const jsonArea = backdrop.querySelector('#ala-tier-json-area') as HTMLTextAreaElement;

  backdrop.querySelector('#ala-tier-btn-toggle-json')?.addEventListener('click', () => {
    const isHidden = jsonWrap.style.display === 'none';
    if (isHidden) {
      jsonArea.value = JSON.stringify(getRowsData(), null, 2);
      jsonWrap.style.display = 'block';
    } else {
      jsonWrap.style.display = 'none';
    }
  });

  backdrop.querySelector('#ala-tier-btn-apply-json')?.addEventListener('click', () => {
    try {
      const parsed = JSON.parse(jsonArea.value);
      const check = validateTiers(parsed);
      if (!check.valid || !check.tiers) {
        setModalStatus(check.error || 'Invalid tier JSON.', true);
        return;
      }
      renderTable(check.tiers);
      jsonWrap.style.display = 'none';
      setModalStatus('JSON applied successfully.');
    } catch (e: any) {
      setModalStatus('Invalid JSON syntax: ' + (e.message || e), true);
    }
  });

  const closeModal = () => {
    document.removeEventListener('keydown', onKey, true);
    backdrop.remove();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeModal();
    }
  };
  document.addEventListener('keydown', onKey, true);

  backdrop.querySelector('.ala-tier-close')?.addEventListener('click', closeModal);
  backdrop.querySelector('#ala-tier-btn-cancel')?.addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });

  backdrop.querySelector('#ala-tier-btn-save')?.addEventListener('click', () => {
    const data = getRowsData();
    const check = validateTiers(data);
    if (!check.valid || !check.tiers) {
      setModalStatus(check.error || 'Invalid tier configuration.', true);
      return;
    }
    inputEl.value = JSON.stringify(check.tiers);
    Settings.set('tierLabels', check.tiers);
    closeModal();
    const panelStatus = document.querySelector('#ala-settings-panel .ala-status');
    if (panelStatus) {
      panelStatus.textContent = 'Custom tiers applied. Press "Save and reload" to activate.';
    }
  });

  renderTable(tiers);
}

function standaloneNote(id: StandaloneId): string {
  return `<b>Standalone ${STANDALONE[id].name} detected.</b> This feature is now built into AL Additions, so you no longer need the separate script. The built-in version is switched off while the standalone script is installed. Your setting is kept and applies again once you uninstall it.`;
}

function showStandaloneNotes(panel: HTMLElement, syncFeature: (card: HTMLElement) => void): void {
  for (const id of STANDALONE_IDS_LIST) {
    void detectStandalone(id).then((found) => {
      if (!panel.isConnected) return;
      const card = panel.querySelector<HTMLElement>(`.ala-feature[data-feature="${id}"]`);
      if (!card) return;
      card.querySelector('.ala-standalone-note')?.remove();
      if (!found) return;
      const toggle = card.querySelector<HTMLInputElement>('.ala-row--main input[type="checkbox"][data-key]');
      if (toggle) {
        toggle.dataset.standaloneLocked = '1';
        toggle.checked = false;
        toggle.disabled = true;
        syncFeature(card);
      }
      const note = document.createElement('div');
      note.className = 'ala-standalone-note';
      note.setAttribute('role', 'note');
      note.innerHTML = standaloneNote(id);
      card.querySelector('.ala-row--main')?.insertAdjacentElement('afterend', note);
    });
  }
}

export function closePanel(): void {
  const b = document.getElementById('ala-settings-backdrop') as (HTMLElement & { _onKey?: (e: KeyboardEvent) => void; _onFocus?: () => void }) | null;
  if (!b) return;
  if (b._onKey) document.removeEventListener('keydown', b._onKey);
  if (b._onFocus) window.removeEventListener('focus', b._onFocus);
  b.remove();
  document.documentElement.style.overflow = prevOverflow || '';
  prevOverflow = null;
}

export function showPanel(): void {
  if (document.getElementById('ala-settings-backdrop')) return;
  const backdrop = document.createElement('div') as HTMLDivElement & { _onKey?: (e: KeyboardEvent) => void; _onFocus?: () => void };
  backdrop.id = 'ala-settings-backdrop';
  backdrop.innerHTML = `<div id="ala-settings-panel" role="dialog" aria-modal="true" aria-labelledby="ala-settings-title" tabindex="-1">
    <header class="ala-sheet-head">
      <div><h2 id="ala-settings-title">AL Additions</h2><div class="ala-help">Changes apply after the page reloads.</div></div>
      <button class="ala-icon-btn ala-close" type="button" aria-label="Close settings">${icon('close', 20)}</button>
    </header>
    <div class="ala-sheet-body">
      ${accountsHtml()}
      ${sectionsHtml()}
      ${backupRestoreHtml()}
      ${creditsDropdownHtml()}
    </div>
    <footer class="ala-sheet-foot">
      <button class="ala-btn ala-btn--primary ala-save" type="button">Save and reload</button>
      <button class="ala-btn ala-reset" type="button">Reset to defaults</button>
      <span class="ala-status" role="status"></span>
    </footer>
  </div>`;

  const panel = backdrop.firstElementChild as HTMLElement;
  const status = panel.querySelector('.ala-status') as HTMLElement;
  const setStatus = (msg: string, isError = false) => {
    status.textContent = msg;
    status.classList.toggle('is-error', isError);
  };
  const controls = () => panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-key]');

  const syncFeature = (card: HTMLElement) => {
    const toggle = card.querySelector<HTMLInputElement>('.ala-row--main input[type="checkbox"][data-key]');
    if (!toggle) return;
    const on = toggle.checked;
    card.classList.toggle('is-off', !on);

    const optionsCollapsible = card.querySelector<HTMLElement>(':scope > .ala-options-collapsible');
    if (optionsCollapsible) {
      optionsCollapsible.classList.toggle('is-open', on);
    }

    card.querySelectorAll<HTMLElement>('.ala-child-option').forEach((childWrap) => {
      const parentKey = childWrap.dataset.childFor;
      const parentInput = parentKey ? card.querySelector<HTMLInputElement>(`[data-key="${parentKey}"]`) : null;
      const childOpen = on && !!parentInput?.checked;
      childWrap.classList.toggle('is-open', childOpen);

      childWrap.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-key]').forEach((el) => {
        el.disabled = !childOpen;
      });
    });

    card.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.ala-options [data-key]').forEach((el) => {
      if (el.closest('.ala-child-option')) return;
      el.disabled = !on;
    });
  };

  panel.querySelectorAll<HTMLElement>('.ala-feature').forEach(syncFeature);
  initDropdownAnimations(panel);
  panel.addEventListener('change', (e) => {
    const target = e.target as HTMLElement | null;
    const card = target?.closest<HTMLElement>('.ala-feature');
    if (card) syncFeature(card);
  });

  panel.querySelector('.ala-save')?.addEventListener('click', () => {
    controls().forEach((el) => {
      const r = ROWS[el.dataset.key!];
      if (r) {
        if (r.key === OVERRIDES_SETTING_KEY) return;
        if (el.dataset.standaloneLocked) return;
        Settings.set(r.key, TYPES[r.type].read(el));
      }
    });
    setStatus('Saved. Reloading…');
    setTimeout(() => location.reload(), 350);
  });

  panel.querySelector('.ala-reset')?.addEventListener('click', () => {
    controls().forEach((el) => {
      const r = ROWS[el.dataset.key!];
      if (r) {
        if (r.key === OVERRIDES_SETTING_KEY) return;
        if (el.dataset.standaloneLocked) return;
        TYPES[r.type].write(el, r.def);
      }
    });
    panel.querySelectorAll<HTMLElement>('.ala-feature').forEach(syncFeature);
    setStatus('Defaults restored. Press Save to apply them.');
  });

  panel.querySelector('.ala-close')?.addEventListener('click', closePanel);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closePanel();
  });
  backdrop._onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closePanel();
  };
  document.addEventListener('keydown', backdrop._onKey);

  const updateAccountUI = () => {
    const alBtn = panel.querySelector<HTMLButtonElement>('#ala-btn-al');
    const alStatus = panel.querySelector<HTMLElement>('#ala-status-al');
    const malBtn = panel.querySelector<HTMLButtonElement>('#ala-btn-mal');
    const malStatus = panel.querySelector<HTMLElement>('#ala-status-mal');

    const alConnected = !!store.get('al_token', null);
    const alUser = store.get<string | null>('al_username', null);
    const malConnected = !!store.get('mal_token', null);

    if (alBtn && alStatus) {
      alBtn.textContent = alConnected ? 'Disconnect' : 'Connect to AniList';
      alBtn.className = `ala-btn ${alConnected ? 'ala-btn--danger' : 'ala-btn--primary'}`;
      alStatus.innerHTML = alConnected ? (alUser ? `Connected as <b>${esc(alUser)}</b>` : 'Connected') : 'Not connected';
    }
    if (malBtn && malStatus) {
      malBtn.textContent = malConnected ? 'Disconnect' : 'Connect to MAL';
      malBtn.className = `ala-btn ${malConnected ? 'ala-btn--danger' : 'ala-btn--primary'}`;
      malStatus.textContent = malConnected ? 'Connected' : 'Not connected';
    }
  };

  if (store.get('al_token', null) && !store.get('al_username', null)) {
    tryOr(() => AniList.viewer()).then(() => updateAccountUI());
  }

  panel.querySelector('#ala-btn-al')?.addEventListener('click', () => {
    const alConnected = !!store.get('al_token', null);
    if (alConnected) {
      if (confirm('Disconnect AniList? You will need to reconnect to use the List Score Editor or Sync.')) {
        clearAniListAuth();
        updateAccountUI();
        setStatus('AniList disconnected.');
      }
    } else {
      alConnect();
      setStatus('Opened AniList authorization tab…');
    }
  });

  panel.querySelector('#ala-btn-mal')?.addEventListener('click', () => {
    const malConnected = !!store.get('mal_token', null);
    if (malConnected) {
      if (confirm('Disconnect MyAnimeList? You will need to reconnect to use AniList → MAL Sync.')) {
        clearMalAuth();
        updateAccountUI();
        setStatus('MyAnimeList disconnected.');
      }
    } else {
      malConnect();
      setStatus('Opened MyAnimeList authorization tab…');
    }
  });

  const getPanelOverrides = (): Record<string, any> => {
    const overrides: Record<string, any> = {};
    controls().forEach((el) => {
      const r = ROWS[el.dataset.key!];
      if (r) {
        if (r.key === OVERRIDES_SETTING_KEY) {
          overrides[r.key] = getManualOverrides();
          return;
        }
        overrides[r.key] = el.dataset.standaloneLocked ? Settings.get(r.key) : TYPES[r.type].read(el);
      }
    });
    return overrides;
  };

  panel.querySelector('#ala-btn-export')?.addEventListener('click', async () => {
    const pwd = await promptPasswordModal({
      title: 'Export Settings',
      description: 'Optional: Set a password to encrypt your backup file. Leave blank for an unencrypted backup.',
      submitText: 'Export',
      allowEmpty: true,
      confirm: true,
      placeholder: 'Optional encryption password'
    });
    if (pwd === null) return;
    try {
      setStatus('Generating backup…');
      const envelope = await createBackup(false, pwd, getPanelOverrides());
      downloadBackupFile(envelope);
      setStatus('Settings exported successfully.');
    } catch (e: any) {
      setStatus('Export failed: ' + (e.message || e), true);
    }
  });

  panel.querySelector('#ala-btn-export-secrets')?.addEventListener('click', async () => {
    const confirmed = confirm(
      '⚠️ Warning: This export includes your AniList and MyAnimeList authentication credentials.\n\n' +
      'Anyone with access to this file will have full access to your connected accounts.\n\n' +
      'Do you want to continue?'
    );
    if (!confirmed) return;

    const pwd = await promptPasswordModal({
      title: 'Export Credentials (Encrypted)',
      description: 'A password is required to encrypt your credentials and protect your accounts.',
      submitText: 'Encrypt & Export',
      allowEmpty: false,
      confirm: true,
      placeholder: 'Choose an encryption password'
    });
    if (pwd === null) return;
    if (!pwd.trim()) {
      setStatus('A password is required to export credentials.', true);
      return;
    }
    try {
      setStatus('Generating backup…');
      const envelope = await createBackup(true, pwd, getPanelOverrides());
      downloadBackupFile(envelope);
      setStatus('Settings and credentials exported successfully.');
    } catch (e: any) {
      setStatus('Export failed: ' + (e.message || e), true);
    }
  });

  const fileInput = panel.querySelector<HTMLInputElement>('#ala-import-file');
  panel.querySelector('#ala-btn-import')?.addEventListener('click', () => {
    fileInput?.click();
  });

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      setStatus('Reading backup file…');
      const bytes = await readFileAsBytes(file);
      const result = await importBackup(bytes);
      if (result.cancelled) {
        setStatus('Import cancelled.');
        fileInput.value = '';
        return;
      }
      const parts = [`${result.applied} setting(s)`];
      if (result.secretsApplied) parts.push(`${result.secretsApplied} credential(s)`);
      setStatus(`Imported ${parts.join(' and ')}. Reloading…`);
      setTimeout(() => location.reload(), 600);
    } catch (e: any) {
      setStatus('Import failed: ' + (e.message || e), true);
      fileInput.value = '';
    }
  });

  panel.querySelector('#ala-btn-edit-tierLabels')?.addEventListener('click', (e) => {
    e.preventDefault();
    const inputEl = panel.querySelector<HTMLInputElement>('input[data-key="tierLabels"]');
    if (inputEl) openTierEditor(inputEl);
  });

  panel.querySelector('#ala-btn-edit-syncManualOverrides')?.addEventListener('click', (e) => {
    e.preventDefault();
    openOverridesModal();
  });

  const onFocus = () => {
    updateAccountUI();
    maybeAutoSync();
  };
  backdrop._onFocus = onFocus;
  window.addEventListener('focus', onFocus);

  prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  document.body.appendChild(backdrop);
  panel.focus();
  showStandaloneNotes(panel, syncFeature);
}

export function ensureLauncher(): void {
  if (document.getElementById('ala-settings-mobile-launcher')) return;
  const b = document.createElement('button');
  b.id = 'ala-settings-mobile-launcher';
  b.type = 'button';
  b.innerHTML = `${icon('sliders', 18)}<span>AL Additions</span>`;
  b.setAttribute('aria-label', 'Open AL Additions settings');
  b.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showPanel();
  });
  document.body.appendChild(b);
}

export function installSidebar(): void {
  if (document.getElementById('ala-settings-nav-section')) return;
  if (!findExactText('Profile')) return;
  const dev = findExactText('Developer');
  if (!dev) return;
  let nav: HTMLElement | null = dev.parentElement;
  while (nav && nav !== document.body && nav.children.length <= 1) nav = nav.parentElement;
  if (!nav || nav === document.body || !nav.parentElement) return;

  const section = document.createElement('div');
  section.id = 'ala-settings-nav-section';
  section.className = 'ala-settings-nav-section';
  section.innerHTML = '<div class="ala-settings-nav-heading">AL Additions</div><a href="#" class="ala-settings-nav-link">Settings</a>';
  section.querySelector('a')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).classList.add('is-active');
    showPanel();
  });
  nav.parentElement.insertBefore(section, nav.nextSibling);
}

export function initSettingsPage(): void {
  addStyle('ala-settings-style', CSS);
  const attempt = debounce(() => {
    if (!onSettingsPage()) return;
    installSidebar();
    ensureLauncher();
  }, 100);
  Core.ready(attempt);
  Core.onBodyMutation(() => {
    if (onSettingsPage() && !(document.getElementById('ala-settings-nav-section') && document.getElementById('ala-settings-mobile-launcher'))) {
      attempt();
    }
  });
  Core.onNavigate(() => {
    if (onSettingsPage()) return attempt();
    closePanel();
    document.getElementById('ala-settings-mobile-launcher')?.remove();
  });
}