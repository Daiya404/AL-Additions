import { addStyle } from '../utils/dom';
import { esc } from '../utils/helpers';

export interface PasswordModalOptions {
  title: string;
  description?: string;
  submitText?: string;
  cancelText?: string;
  allowEmpty?: boolean;
  confirm?: boolean;
  placeholder?: string;
}

const MODAL_CSS = `
  #ala-pwd-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(5, 12, 20, 0.75);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 100005;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    box-sizing: border-box;
  }
  .ala-pwd-sheet {
    width: 100%;
    max-width: 420px;
    background: rgb(var(--color-foreground, 31, 38, 49));
    color: rgb(var(--color-text, 240, 243, 246));
    border-radius: 10px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: alaModalPop 0.15s ease-out;
  }
  @keyframes alaModalPop {
    from { opacity: 0; transform: scale(0.96) translateY(-4px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
  .ala-pwd-desc {
    margin: 0 0 16px;
    font-size: 13px;
    color: rgb(var(--color-text-lighter, 146, 154, 166));
    line-height: 1.45;
  }
  .ala-pwd-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ala-pwd-label {
    font-size: 12px;
    font-weight: 600;
    color: rgb(var(--color-text-lighter, 146, 154, 166));
  }
  .ala-pwd-input-wrap {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
  }
  .ala-pwd-field {
    width: 100%;
    height: 40px;
    padding: 0 38px 0 12px;
    border-radius: 6px;
    border: 1px solid rgba(var(--color-text-lighter, 146, 154, 166), 0.25);
    background: rgb(var(--color-background, 15, 23, 42));
    color: rgb(var(--color-text, 240, 243, 246));
    font: inherit;
    font-size: 14px;
    box-sizing: border-box;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .ala-pwd-field:focus {
    outline: none;
    border-color: rgb(var(--color-blue, 61, 180, 242));
    box-shadow: 0 0 0 2px rgba(var(--color-blue, 61, 180, 242), 0.25);
  }
  .ala-pwd-toggle {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: rgb(var(--color-text-lighter, 146, 154, 166));
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }
  .ala-pwd-toggle:hover {
    color: rgb(var(--color-text, 240, 243, 246));
    background: rgba(var(--color-text-lighter, 146, 154, 166), 0.12);
  }
  .ala-pwd-error {
    margin-top: 12px;
    padding: 8px 12px;
    border-radius: 6px;
    background: rgba(var(--color-red, 224, 85, 85), 0.12);
    border: 1px solid rgba(var(--color-red, 224, 85, 85), 0.3);
    color: rgb(var(--color-red, 224, 85, 85));
    font-size: 12px;
    font-weight: 500;
  }
`;

const EYE_OPEN = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const EYE_OFF = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

export function promptPasswordModal(options: PasswordModalOptions): Promise<string | null> {
  return new Promise((resolve) => {
    addStyle('ala-pwd-modal-style', MODAL_CSS);

    const existing = document.getElementById('ala-pwd-backdrop');
    if (existing) existing.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'ala-pwd-backdrop';
    backdrop.innerHTML = `
      <div class="ala-sheet ala-pwd-sheet" role="dialog" aria-modal="true" aria-labelledby="ala-pwd-title">
        <header class="ala-sheet-head">
          <h2 id="ala-pwd-title">${esc(options.title)}</h2>
          <button class="ala-icon-btn ala-pwd-btn-close" type="button" aria-label="Close">✕</button>
        </header>
        <div class="ala-sheet-body">
          ${options.description ? `<p class="ala-pwd-desc">${esc(options.description)}</p>` : ''}
          <div class="ala-pwd-group">
            <label for="ala-pwd-input-main" class="ala-pwd-label">Password</label>
            <div class="ala-pwd-input-wrap">
              <input
                id="ala-pwd-input-main"
                class="ala-pwd-field"
                type="password"
                placeholder="${esc(options.placeholder || 'Enter password')}"
                autocomplete="${options.confirm ? 'new-password' : 'current-password'}"
              />
              <button type="button" class="ala-pwd-toggle" title="Show / Hide password" aria-label="Toggle password visibility">
                ${EYE_OPEN}
              </button>
            </div>
          </div>
          ${options.confirm ? `
            <div class="ala-pwd-group" style="margin-top:12px">
              <label for="ala-pwd-input-confirm" class="ala-pwd-label">Confirm Password</label>
              <div class="ala-pwd-input-wrap">
                <input
                  id="ala-pwd-input-confirm"
                  class="ala-pwd-field"
                  type="password"
                  placeholder="Re-enter password"
                  autocomplete="new-password"
                />
              </div>
            </div>
          ` : ''}
          <div class="ala-pwd-error" id="ala-pwd-err" style="display:none"></div>
        </div>
        <footer class="ala-sheet-foot">
          <button class="ala-btn ala-btn--primary" id="ala-pwd-btn-submit" type="button">
            ${esc(options.submitText || 'Submit')}
          </button>
          <button class="ala-btn" id="ala-pwd-btn-cancel" type="button">
            ${esc(options.cancelText || 'Cancel')}
          </button>
        </footer>
      </div>
    `;

    document.body.appendChild(backdrop);

    const input = backdrop.querySelector('#ala-pwd-input-main') as HTMLInputElement;
    const confirmInput = backdrop.querySelector('#ala-pwd-input-confirm') as HTMLInputElement | null;
    const toggleBtn = backdrop.querySelector('.ala-pwd-toggle') as HTMLButtonElement;
    const errBox = backdrop.querySelector('#ala-pwd-err') as HTMLElement;
    const submitBtn = backdrop.querySelector('#ala-pwd-btn-submit') as HTMLButtonElement;
    const cancelBtn = backdrop.querySelector('#ala-pwd-btn-cancel') as HTMLButtonElement;
    const closeBtn = backdrop.querySelector('.ala-pwd-btn-close') as HTMLButtonElement;

    let isVisible = false;

    const cleanup = () => {
      document.removeEventListener('keydown', onKeyDown);
      backdrop.remove();
    };

    const cancel = () => {
      cleanup();
      resolve(null);
    };

    const submit = () => {
      const val = input.value;
      if (!options.allowEmpty && !val.trim()) {
        errBox.textContent = 'Password cannot be empty.';
        errBox.style.display = 'block';
        input.focus();
        return;
      }

      if (options.confirm && confirmInput) {
        if (val && val !== confirmInput.value) {
          errBox.textContent = 'Passwords do not match.';
          errBox.style.display = 'block';
          confirmInput.focus();
          return;
        }
      }

      cleanup();
      resolve(val);
    };

    toggleBtn.addEventListener('click', () => {
      isVisible = !isVisible;
      const type = isVisible ? 'text' : 'password';
      input.type = type;
      if (confirmInput) confirmInput.type = type;
      toggleBtn.innerHTML = isVisible ? EYE_OFF : EYE_OPEN;
      toggleBtn.title = isVisible ? 'Hide password' : 'Show password';
    });

    submitBtn.addEventListener('click', submit);
    cancelBtn.addEventListener('click', cancel);
    closeBtn.addEventListener('click', cancel);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) cancel();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    setTimeout(() => input.focus(), 50);
  });
}

