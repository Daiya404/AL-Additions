import { defineFeature } from '../core/registry';
import { Core } from '../core/observer';
import { AniList, MediaData } from '../api/anilist';
import { alConnect } from '../api/mal';
import { externalReleased } from '../api/scrapers';
import { addStyle, mediaRoute } from '../utils/dom';
import { tryOr, safe, store } from '../utils/helpers';
import type { MediaRoute } from '../types';

defineFeature(
  {
    id: 'mediaInfo',
    key: 'mediaInfoEnabled',
    section: 'AniList Enhancements',
    def: false,
    legacy: ['mediaInfoEnabled', 'mediaListEditorEnabled'],
    title: 'List Score & Progress Editor',
    help: 'Show your score and episode/chapter progress controls on anime and manga pages.'
  },
  () => {
    const ID = 'ala-media-info';
    addStyle(
      'ala-media-info-style',
      `
      #${ID}{box-sizing:border-box;width:100%;max-width:100%;margin:0 0 12px;padding:14px 15px 15px;border-radius:3px;background:rgb(var(--color-foreground));color:rgb(var(--color-text));font-size:1.3rem;line-height:1.4;overflow:hidden}
      #${ID} *{box-sizing:border-box}
      #${ID} :focus-visible{outline:2px solid rgb(var(--color-blue));outline-offset:2px}
      #${ID} .ala-mi-fields{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:12px}
      #${ID} .ala-mi-field{display:flex;flex-direction:column;gap:6px;min-width:0}
      #${ID} .ala-mi-label{color:rgb(var(--color-text-lighter));font-size:1.2rem}
      #${ID} .ala-mi-box{display:flex;align-items:stretch;height:38px;border-radius:3px;background:rgb(var(--color-background));box-shadow:inset 0 0 0 1px transparent;overflow:hidden;transition:box-shadow .15s}
      #${ID} .ala-mi-box:hover{box-shadow:inset 0 0 0 1px rgba(var(--color-blue),.4)}
      #${ID} .ala-mi-box:focus-within{box-shadow:inset 0 0 0 1px rgb(var(--color-blue))}
      #${ID} input{flex:1 1 auto;width:100%;min-width:0;height:100%;margin:0;padding:0 4px;border:0;outline:none;background:transparent;color:rgb(var(--color-text));font:inherit;font-size:1.5rem;text-align:center;-moz-appearance:textfield}
      #${ID} input::placeholder{color:rgb(var(--color-text-lighter))}
      #${ID} input:focus::placeholder{color:transparent}
      #${ID} input::-webkit-outer-spin-button,#${ID} input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
      #${ID} .ala-mi-step{flex:0 0 34px;display:flex;align-items:center;justify-content:center;padding:0;border:0;background:transparent;color:rgb(var(--color-text-lighter));font:inherit;font-size:1.8rem;line-height:1;cursor:pointer;transition:color .15s}
      #${ID} .ala-mi-step:hover{color:rgb(var(--color-blue))}
      #${ID} .ala-mi-step:active{color:rgb(var(--color-text))}
      #${ID} .ala-mi-sub{min-height:16px;overflow:hidden;color:rgb(var(--color-text-lighter));font-size:1.15rem;white-space:nowrap;text-overflow:ellipsis}
      #${ID} .ala-mi-sub b{color:rgb(var(--color-text));font-weight:inherit}
      #${ID} .ala-mi-bar{position:relative;height:3px;margin:13px 0 14px;border-radius:2px;background:rgb(var(--color-background));overflow:hidden}
      #${ID} .ala-mi-bar[hidden]{display:none}
      #${ID} .ala-mi-aired,#${ID} .ala-mi-done{position:absolute;top:0;bottom:0;left:0;width:0;border-radius:2px;transition:width .2s ease}
      #${ID} .ala-mi-aired{background:rgba(var(--color-blue),.3)}
      #${ID} .ala-mi-done{background:rgb(var(--color-blue))}
      #${ID} .ala-mi-save{display:block;width:100%;height:36px;padding:0;border:0;border-radius:4px;background:rgb(var(--color-blue));color:rgb(var(--color-white,255,255,255));font:inherit;font-size:1.4rem;cursor:pointer;transition:filter .15s,opacity .15s,background .2s,color .2s}
      #${ID} .ala-mi-save:hover:not(:disabled){filter:brightness(1.1)}
      #${ID} .ala-mi-save:disabled{opacity:.45;cursor:default}
      #${ID} .ala-mi-save.is-saving,#${ID} .ala-mi-save.is-saving:disabled{opacity:.7;cursor:wait}
      #${ID} .ala-mi-save.is-saved,#${ID} .ala-mi-save.is-saved:disabled{background:rgb(var(--color-green,76,175,80));color:rgb(var(--color-white,255,255,255));opacity:1;cursor:default}
      @media (pointer:coarse){#${ID} .ala-mi-box{height:42px}#${ID} .ala-mi-step{flex-basis:40px}#${ID} input{font-size:16px}#${ID} .ala-mi-save{height:40px}}
      @media (prefers-reduced-motion:reduce){#${ID} .ala-mi-aired,#${ID} .ala-mi-done,#${ID} .ala-mi-save{transition:none}}`
    );

    const maxOf = (info: any, type: string): number | null => {
      const n = Math.floor(Number(type === 'ANIME' ? info?.episodes : info?.chapters));
      return n > 0 ? n : null;
    };

    function airedEpisodes(info: any): number | null {
      const next = Number(info?.nextAiringEpisode?.episode);
      if (Number.isFinite(next) && next > 0) return Math.max(0, Math.floor(next) - 1);
      if (info?.status === 'NOT_YET_RELEASED') return 0;
      return info?.status === 'FINISHED' ? maxOf(info, 'ANIME') : null;
    }

    function findSpot(): { parent: HTMLElement; before: HTMLElement } | null {
      const el = document.querySelector<HTMLElement>('.sidebar > .data');
      return el?.parentElement && el.parentElement !== document.body ? { parent: el.parentElement, before: el } : null;
    }

    const scoreStep = (f: string | null): string => (f === 'POINT_10_DECIMAL' ? '0.1' : '1');
    const scoreMax = (f: string | null): number => ({ POINT_100: 100, POINT_5: 5, POINT_3: 3 }[f || ''] || 10);
    const formatScore = (raw: any, f: string | null): string => {
      const n = Number(raw);
      return !Number.isFinite(n) || n <= 0 ? '' : f === 'POINT_10_DECIMAL' ? n.toFixed(1) : String(n);
    };
    const today = () => {
      const d = new Date();
      return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
    };
    const scoreFormat = async (): Promise<string | null> => (await tryOr(() => AniList.viewer()))?.scoreFormat || null;

    let shown: string | null = null;
    let gen = 0;
    let rendering = false;
    let rerender = false;
    let saving = false;
    let routeAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | 0 = 0;
    let retry = { key: null as string | null, at: 0, count: 0 };
    const MAX_FAILURES = 3;
    const panel = (): HTMLElement | null => document.getElementById(ID);
    const schedule = (ms = 300): void => {
      clearTimeout(timer);
      timer = setTimeout(() => render(), ms);
    };

    function renderConnect(key: string): void {
      const spot = findSpot();
      if (!spot) return void schedule(800);
      const box = document.createElement('div');
      box.id = ID;
      box.dataset.mode = 'connect';
      box.innerHTML = `<div style="margin-bottom:10px;color:rgb(var(--color-text-lighter))">Connect AniList to edit your score and progress here.</div><button class="ala-mi-save" type="button">Connect AniList</button>`;
      box.querySelector('button')!.addEventListener('click', alConnect);
      panel()?.remove();
      spot.parent.insertBefore(box, spot.before);
      shown = key;
    }

    function changeProgress(delta: number, input: HTMLInputElement, limit: number | null): void {
      const next = Number(input.value) + delta;
      if (!Number.isInteger(next) || next < 0 || (limit !== null && next > limit)) return;
      input.value = String(next);
    }

    async function save(
      media: MediaRoute,
      info: any,
      scoreInput: HTMLInputElement,
      progressInput: HTMLInputElement
    ): Promise<any | false | null> {
      if (saving) return null;
      const fmt = await scoreFormat();
      const max = maxOf(info, media.type);
      const scoreText = scoreInput.value.trim();
      const score = scoreText === '' ? 0 : Number(scoreText);
      let progress = Number(progressInput.value);
      if (!Number.isFinite(score) || score < 0 || score > scoreMax(fmt)) {
        scoreInput.focus();
        return null;
      }
      if (!Number.isInteger(progress) || progress < 0) {
        progressInput.focus();
        return null;
      }
      if (max !== null) progress = Math.min(progress, max);
      progressInput.value = String(progress);
      const prev = info.mediaListEntry || {};
      const finishNow = max !== null && progress >= max && (prev.status !== 'COMPLETED' || !prev.completedAt?.year);
      const isStarting = (!prev.status || prev.status === 'PLANNING') && progress > 0;
      const status = finishNow ? 'COMPLETED' : isStarting ? 'CURRENT' : undefined;
      saving = true;
      try {
        const entry = await MediaData.save(media.id, media.type, {
          score,
          progress,
          status,
          completedAt: finishNow ? today() : undefined
        });
        if (!entry) throw new Error('AniList did not return the updated entry');
        info.mediaListEntry = entry;
        return entry;
      } catch (e) {
        console.warn('[AL-Additions] Media list save failed:', e);
        return false;
      } finally {
        saving = false;
      }
    }

    async function render(force = false): Promise<void> {
      const route = mediaRoute();
      if (!route) {
        shown = null;
        panel()?.remove();
        return;
      }
      const key = `${route.type}:${route.id}`;
      if (rendering) {
        if (force) rerender = true;
        return;
      }
      if (saving && !force) return;
      if (!force && shown === key && panel()) return;
      if (!force && retry.key === key && (retry.count >= MAX_FAILURES || Date.now() < retry.at)) return;
      if (!findSpot()) {
        if (Date.now() - routeAt < 15000) schedule(800);
        return;
      }
      if (!store.get('al_token', null)) return renderConnect(key);

      const g = gen;
      const stale = (): boolean => g !== gen || mediaRoute()?.id !== route.id;
      rendering = true;
      try {
        const info = await MediaData.get(route.id, route.type);
        if (stale()) return;
        if (!info) {
          retry = { key, at: Date.now() + 15000, count: retry.key === key ? retry.count + 1 : 1 };
          if (retry.count < MAX_FAILURES) schedule(15500);
          return;
        }
        const fmt = await scoreFormat();
        if (stale()) return;
        const spot = findSpot();
        if (!spot) {
          schedule(800);
          return;
        }

        const entry = info.mediaListEntry || { score: 0, progress: 0 };
        const max = maxOf(info, route.type);
        const anime = route.type === 'ANIME';
        const progress = Number.isFinite(Number(entry.progress)) ? Number(entry.progress) : 0;
        const label = anime ? 'Episode' : 'Chapter';
        const word = anime ? 'aired' : 'released';
        const scoreTop = scoreMax(fmt);
        let released = anime ? airedEpisodes(info) : null;
        let lookupPending = !anime;

        const box = document.createElement('div');
        box.id = ID;
        box.innerHTML = `
          <div class="ala-mi-fields">
            <div class="ala-mi-field">
              <span class="ala-mi-label">Score</span>
              <div class="ala-mi-box"><input class="ala-mi-score-input" type="number" min="0" max="${scoreTop}" step="${scoreStep(fmt)}" value="${formatScore(entry.score, fmt)}" placeholder="—" inputmode="decimal" aria-label="Score"></div>
              <span class="ala-mi-sub">out of ${scoreTop}</span>
            </div>
            <div class="ala-mi-field">
              <span class="ala-mi-label">${label}</span>
              <div class="ala-mi-box">
                <button class="ala-mi-step ala-mi-minus" type="button" aria-label="Decrease">−</button>
                <input class="ala-mi-progress-input" type="number" min="0"${max !== null ? ` max="${max}"` : ''} step="1" value="${progress}" inputmode="numeric" aria-label="${label} progress">
                <button class="ala-mi-step ala-mi-plus" type="button" aria-label="Increase">+</button>
              </div>
              <span class="ala-mi-sub ala-mi-prog-sub"></span>
            </div>
          </div>
          <div class="ala-mi-bar"><div class="ala-mi-aired"></div><div class="ala-mi-done"></div></div>
          <button class="ala-mi-save" type="button" disabled>Save</button>`;

        const scoreInput = box.querySelector<HTMLInputElement>('.ala-mi-score-input')!;
        const progressInput = box.querySelector<HTMLInputElement>('.ala-mi-progress-input')!;
        const saveBtn = box.querySelector<HTMLButtonElement>('.ala-mi-save')!;
        const sub = box.querySelector<HTMLElement>('.ala-mi-prog-sub')!;
        const bar = box.querySelector<HTMLElement>('.ala-mi-bar')!;
        const doneFill = box.querySelector<HTMLElement>('.ala-mi-done')!;
        const airedFill = box.querySelector<HTMLElement>('.ala-mi-aired')!;
        const limit = (): number | null => (max !== null ? max : released);
        let startScore = scoreInput.value.trim();
        let startProgress = progressInput.value;
        let savedTimer: ReturnType<typeof setTimeout> | 0 = 0;
        let failedTimer: ReturnType<typeof setTimeout> | 0 = 0;

        function clearSavedState(): void {
          if (savedTimer) {
            clearTimeout(savedTimer);
            savedTimer = 0;
          }
          if (failedTimer) {
            clearTimeout(failedTimer);
            failedTimer = 0;
          }
          saveBtn.classList.remove('is-saved', 'is-saving');
          if (saveBtn.textContent === 'Saved' || saveBtn.textContent === 'Saving...' || saveBtn.textContent === 'Failed') {
            saveBtn.textContent = 'Save';
          }
        }

        function paint(): void {
          const typed = Number(progressInput.value);
          const watched = Number.isFinite(typed) && typed > 0 ? typed : 0;
          sub.innerHTML =
            `of <b>${max !== null ? max : '—'}</b>` +
            (released != null ? ` · <b>${released}</b> ${word}` : lookupPending ? ' · …' : '');
          const total = limit();
          bar.hidden = !(total && total > 0);
          if (total && total > 0) {
            doneFill.style.width = Math.min(100, (watched / total) * 100) + '%';
            airedFill.style.width = released != null ? Math.min(100, (released / total) * 100) + '%' : '0%';
          }
          const isDirty = scoreInput.value.trim() !== startScore || progressInput.value !== startProgress;
          if (savedTimer && isDirty) {
            clearSavedState();
          }
          saveBtn.disabled = saving || Boolean(savedTimer) || !isDirty;
        }

        saveBtn.addEventListener('click', async () => {
          if (saving || saveBtn.disabled) return;
          clearSavedState();
          saveBtn.textContent = 'Saving...';
          saveBtn.classList.add('is-saving');
          saveBtn.disabled = true;

          let res: any | false | null = null;
          try {
            res = await save(route, info, scoreInput, progressInput);
          } finally {
            saveBtn.classList.remove('is-saving');
          }

          if (!box.isConnected) return;

          if (res && res !== false) {
            scoreInput.value = formatScore(res.score, fmt);
            const nextProg = Number(res.progress);
            progressInput.value = Number.isFinite(nextProg) ? String(nextProg) : progressInput.value;
            startScore = scoreInput.value.trim();
            startProgress = progressInput.value;
            saveBtn.classList.add('is-saved');
            saveBtn.textContent = 'Saved';
            saveBtn.disabled = true;
            savedTimer = setTimeout(() => {
              savedTimer = 0;
              if (!box.isConnected) return;
              saveBtn.classList.remove('is-saved');
              saveBtn.textContent = 'Save';
              paint();
            }, 1800);
            paint();
          } else if (res === false) {
            saveBtn.textContent = 'Failed';
            saveBtn.disabled = false;
            failedTimer = setTimeout(() => {
              failedTimer = 0;
              if (box.isConnected && saveBtn.textContent === 'Failed') {
                saveBtn.textContent = 'Save';
                paint();
              }
            }, 2000);
          } else {
            saveBtn.textContent = 'Save';
            paint();
          }
        });

        for (const input of [scoreInput, progressInput]) {
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveBtn.click();
          });
          input.addEventListener('input', paint);
          input.addEventListener('focus', () => {
            if (input.value) {
              input.select();
            } else if (input.placeholder) {
              input.dataset.placeholder = input.placeholder;
              input.placeholder = '';
            }
          });
          input.addEventListener('blur', () => {
            if (!input.value && input.dataset.placeholder) {
              input.placeholder = input.dataset.placeholder;
            }
          });
        }
        box.querySelector('.ala-mi-minus')?.addEventListener('click', () => {
          changeProgress(-1, progressInput, limit());
          paint();
        });
        box.querySelector('.ala-mi-plus')?.addEventListener('click', () => {
          changeProgress(1, progressInput, limit());
          paint();
        });

        panel()?.remove();
        spot.parent.insertBefore(box, spot.before);
        shown = key;
        paint();

        if (!anime) {
          externalReleased(info).then((n) => {
            if (stale() || !box.isConnected) return;
            released = n;
            lookupPending = false;
            paint();
          });
        }
      } finally {
        rendering = false;
        if (rerender) {
          rerender = false;
          safe(() => render(true), 'media info refresh');
        }
      }
    }

    window.addEventListener('load', () => schedule(500), { once: true });
    Core.ready(() => schedule(document.readyState === 'complete' ? 500 : 1200));
    Core.onNavigate(() => {
      const r = mediaRoute();
      if (r && shown === `${r.type}:${r.id}` && panel()) return;
      gen++;
      shown = null;
      routeAt = Date.now();
      retry = { key: null, at: 0, count: 0 };
      panel()?.remove();
      schedule(1200);
    });
    Core.onBodyMutation(() => {
      const r = mediaRoute();
      if (!r || panel() || rendering || saving) return;
      if (retry.key === `${r.type}:${r.id}` && retry.count >= MAX_FAILURES) return;
      schedule(500);
    });
    window.addEventListener('focus', () => {
      if (panel()?.dataset.mode === 'connect' && store.get('al_token', null)) render(true);
    });
  }
);