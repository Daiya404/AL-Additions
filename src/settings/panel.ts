import { Settings, TYPES, ROWS, features } from './settings';
import { FAST_LOAD_URL, fastLoadInstalled, creditsHtml } from './credits';
import { addStyle, findExactText, icon } from '../utils/dom';
import { debounce } from '../utils/helpers';
import { Core } from '../core/observer';
import type { SettingRow, RegisteredFeature } from '../types';

const SECTIONS = ['Sync', 'AniList Enhancements', 'External Links & Downloads'];

const CSS = `
  .ala-settings-nav-section{margin-top:26px}
  .ala-settings-nav-heading{color:rgb(var(--color-text-lighter));margin-bottom:12px}
  .ala-settings-nav-link{display:block;padding:9px 12px;border-radius:3px;color:rgb(var(--color-text));text-decoration:none;cursor:pointer}
  .ala-settings-nav-link:hover,.ala-settings-nav-link.is-active{background:rgb(var(--color-foreground))}
  #ala-settings-mobile-launcher{display:none}

  #ala-settings-backdrop{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:rgba(5,12,20,.72);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
  #ala-settings-panel{box-sizing:border-box;display:flex;flex-direction:column;width:min(680px,100%);max-height:100%;border-radius:8px;background:rgb(var(--color-foreground));color:rgb(var(--color-text));font-size:14px;line-height:1.4;box-shadow:0 18px 60px rgba(0,0,0,.45);overflow:hidden;outline:none}
  #ala-settings-panel *{box-sizing:border-box}
  #ala-settings-panel :focus-visible{outline:2px solid rgb(var(--color-blue));outline-offset:2px}
  #ala-settings-panel h2,#ala-settings-panel h3{margin:0;font-family:inherit}

  .ala-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px 10px}
  .ala-sheet-head h2{font-size:19px;font-weight:600;line-height:1.3}
  .ala-sheet-body{flex:1 1 auto;min-height:0;padding:0 20px 8px;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
  .ala-sheet-foot{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:12px 20px;border-top:1px solid rgba(var(--color-text-lighter),.14)}
  .ala-status{flex:1 1 160px;color:rgb(var(--color-text-lighter));font-size:12px}

  #ala-settings-panel .ala-section-title{margin:18px 2px 8px;color:rgb(var(--color-blue));font-size:13px;font-weight:600}
  .ala-section{border-radius:6px;background:rgb(var(--color-background));overflow:hidden}
  .ala-feature+.ala-feature{border-top:1px solid rgba(var(--color-text-lighter),.12)}
  .ala-row{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:56px;padding:12px 14px;cursor:pointer}
  .ala-text{display:flex;flex-direction:column;gap:3px;min-width:0}
  .ala-title{font-size:14px;color:rgb(var(--color-text))}
  .ala-help{color:rgb(var(--color-text-lighter));font-size:12px;line-height:1.4}
  .ala-options{margin:0 14px 12px 20px;padding-left:12px;border-left:2px solid rgba(var(--color-blue),.4);transition:opacity .15s}
  .ala-options .ala-row{min-height:48px;padding:8px 0;cursor:default}
  .ala-feature.is-off .ala-options{opacity:.45}

  #ala-settings-panel input[type=number],#ala-settings-panel input[type=text],#ala-settings-panel select{width:170px;height:36px;padding:0 10px;border:1px solid rgba(var(--color-text-lighter),.22);border-radius:4px;background:rgb(var(--color-foreground));color:rgb(var(--color-text));font:inherit;font-size:13px}
  #ala-settings-panel input:disabled,#ala-settings-panel select:disabled{cursor:not-allowed}

  .ala-switch{position:relative;flex:0 0 auto;width:44px;height:26px}
  .ala-switch input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
  .ala-slider{position:absolute;inset:0;border-radius:999px;background:rgba(var(--color-text-lighter),.3);transition:background .15s;pointer-events:none}
  .ala-slider:before{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .15s}
  .ala-switch input:checked+.ala-slider{background:rgb(var(--color-blue))}
  .ala-switch input:checked+.ala-slider:before{transform:translateX(18px)}
  .ala-switch input:focus-visible+.ala-slider{outline:2px solid rgb(var(--color-blue));outline-offset:2px}

  .ala-btn{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 18px;border:1px solid rgba(var(--color-text-lighter),.25);border-radius:4px;background:transparent;color:rgb(var(--color-text));font:inherit;font-size:13px;cursor:pointer}
  .ala-btn--primary{border-color:transparent;background:rgb(var(--color-blue));color:#fff;font-weight:600}
  .ala-btn:hover{filter:brightness(1.1)}
  .ala-icon-btn{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:36px;height:36px;border:0;border-radius:50%;background:transparent;color:rgb(var(--color-text-lighter));cursor:pointer}
  .ala-icon-btn:hover{background:rgba(var(--color-text-lighter),.14);color:rgb(var(--color-text))}
  .ala-promo{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:18px 0 0;padding:12px 14px;border-radius:6px;background:rgb(var(--color-background))}
  .ala-promo .ala-btn{flex:0 0 auto;gap:6px;text-decoration:none}
  .ala-credits{margin:18px 2px 10px;color:rgb(var(--color-text-lighter));font-size:12px}
  .ala-credits summary{cursor:pointer;padding:4px 0}
  .ala-credit{margin-top:10px}
  .ala-credit ul{margin:3px 0 0;padding-left:18px;list-style:disc}
  .ala-credit a{color:rgb(var(--color-blue));text-decoration:none}
  .ala-credit a:hover{text-decoration:underline}

  @media (max-width:700px){
    .ala-settings-nav-section{display:none!important}
    #ala-settings-backdrop{align-items:flex-end;padding:0}
    #ala-settings-panel{width:100%;max-height:92vh;max-height:92dvh;border-radius:14px 14px 0 0}
    .ala-sheet-head{padding:16px 16px 8px}
    .ala-sheet-body{padding:0 16px 8px}
    .ala-sheet-foot{padding:12px 16px calc(12px + env(safe-area-inset-bottom))}
    .ala-sheet-foot .ala-btn{flex:1 1 40%;min-height:44px}
    .ala-status{flex-basis:100%;order:3}
    .ala-row{min-height:60px}
    .ala-options .ala-row{flex-direction:column;align-items:stretch;gap:8px}
    .ala-promo{flex-direction:column;align-items:stretch;gap:10px}
    .ala-promo .ala-btn{min-height:44px}
    #ala-settings-panel input[type=number],#ala-settings-panel input[type=text],#ala-settings-panel select{width:100%;height:44px;font-size:16px}
    #ala-settings-mobile-launcher{display:inline-flex;align-items:center;gap:8px;position:fixed;left:16px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:99998;min-height:46px;padding:0 18px;border:1px solid rgba(255,255,255,.16);border-radius:999px;background:rgb(var(--color-blue));color:#fff;font:inherit;font-size:14px;font-weight:600;box-shadow:0 6px 20px rgba(0,0,0,.35);cursor:pointer}
    #ala-settings-mobile-launcher:active{transform:translateY(1px)}
  }
  @media (prefers-reduced-motion:reduce){.ala-slider,.ala-slider:before,.ala-options{transition:none}}`;

const onSettingsPage = (): boolean => /^\/settings(\/|$)/.test(location.pathname);

const rowText = (title: string, help: string): string =>
  `<span class="ala-text"><span class="ala-title">${title}</span><span class="ala-help">${help}</span></span>`;

const optionHtml = (r: SettingRow): string =>
  `<label class="ala-row">${rowText(r.title, r.help)}${TYPES[r.type].html(r, Settings.get(r.key))}</label>`;

const featureHtml = (f: RegisteredFeature): string => `<div class="ala-feature" data-feature="${f.id}">
    <label class="ala-row ala-row--main">${rowText(f.title, f.help)}${TYPES.toggle.html(f.toggle, Settings.get(f.toggle.key))}</label>
    ${f.options.length ? `<div class="ala-options">${f.options.map(optionHtml).join('')}</div>` : ''}
  </div>`;

function sectionsHtml(): string {
  const order = [...new Set([...SECTIONS, ...features.map((f) => f.section)])];
  return order
    .map((name) => {
      const items = features.filter((f) => f.section === name);
      return items.length
        ? `<h3 class="ala-section-title">${name}</h3><div class="ala-section">${items.map(featureHtml).join('')}</div>`
        : '';
    })
    .join('');
}

let prevOverflow: string | null = null;

export function closePanel(): void {
  const b = document.getElementById('ala-settings-backdrop') as (HTMLElement & { _onKey?: (e: KeyboardEvent) => void }) | null;
  if (!b) return;
  if (b._onKey) document.removeEventListener('keydown', b._onKey);
  b.remove();
  document.documentElement.style.overflow = prevOverflow || '';
  prevOverflow = null;
}

export function showPanel(): void {
  if (document.getElementById('ala-settings-backdrop')) return;
  const backdrop = document.createElement('div') as HTMLDivElement & { _onKey?: (e: KeyboardEvent) => void };
  backdrop.id = 'ala-settings-backdrop';
  backdrop.innerHTML = `<div id="ala-settings-panel" role="dialog" aria-modal="true" aria-labelledby="ala-settings-title" tabindex="-1">
    <header class="ala-sheet-head">
      <div><h2 id="ala-settings-title">AL Additions</h2><div class="ala-help">Changes apply after the page reloads.</div></div>
      <button class="ala-icon-btn ala-close" type="button" aria-label="Close settings">${icon('close', 20)}</button>
    </header>
    <div class="ala-sheet-body">
      ${sectionsHtml()}
      ${
        fastLoadInstalled()
          ? ''
          : `<div class="ala-promo">${rowText('AniList Fast Load', 'My other userscript: faster loading, lazy images, request caching and smoother scrolling on AniList. Opens its Greasy Fork page.')}<a class="ala-btn" href="${FAST_LOAD_URL}" target="_blank" rel="noopener noreferrer" aria-label="Get AniList Fast Load on Greasy Fork (opens in a new tab)">Get it ${icon('external', 16)}</a></div>`
      }
      <details class="ala-credits"><summary>Credits</summary>${creditsHtml()}</details>
    </div>
    <footer class="ala-sheet-foot">
      <button class="ala-btn ala-btn--primary ala-save" type="button">Save and reload</button>
      <button class="ala-btn ala-reset" type="button">Reset to defaults</button>
      <span class="ala-status" role="status"></span>
    </footer>
  </div>`;

  const panel = backdrop.firstElementChild as HTMLElement;
  const status = panel.querySelector('.ala-status') as HTMLElement;
  const controls = () => panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-key]');

  const syncFeature = (card: HTMLElement) => {
    const toggle = card.querySelector<HTMLInputElement>('.ala-row--main [data-key]');
    const on = toggle ? toggle.checked : false;
    card.classList.toggle('is-off', !on);
    card.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.ala-options [data-key]').forEach((el) => {
      el.disabled = !on;
    });
  };

  panel.querySelectorAll<HTMLElement>('.ala-feature').forEach(syncFeature);
  panel.addEventListener('change', (e) => {
    const target = e.target as HTMLElement | null;
    const card = target?.closest<HTMLElement>('.ala-feature');
    if (card && target?.closest('.ala-row--main')) syncFeature(card);
  });

  panel.querySelector('.ala-save')?.addEventListener('click', () => {
    controls().forEach((el) => {
      const r = ROWS[el.dataset.key!];
      if (r) Settings.set(r.key, TYPES[r.type].read(el));
    });
    status.textContent = 'Saved. Reloading…';
    setTimeout(() => location.reload(), 350);
  });

  panel.querySelector('.ala-reset')?.addEventListener('click', () => {
    controls().forEach((el) => {
      const r = ROWS[el.dataset.key!];
      if (r) TYPES[r.type].write(el, r.def);
    });
    panel.querySelectorAll<HTMLElement>('.ala-feature').forEach(syncFeature);
    status.textContent = 'Defaults restored. Press Save to apply them.';
  });

  panel.querySelector('.ala-close')?.addEventListener('click', closePanel);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closePanel();
  });
  backdrop._onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closePanel();
  };
  document.addEventListener('keydown', backdrop._onKey);
  prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  document.body.appendChild(backdrop);
  panel.focus();
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