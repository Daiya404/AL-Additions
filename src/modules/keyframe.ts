import { defineFeature } from '../core/registry';
import { Core } from '../core/observer';
import { addStyle, icon } from '../utils/dom';
import { debounce } from '../utils/helpers';

interface KeyframeRoute {
  kind: 'staff' | 'studio';
  id: string;
}

defineFeature(
  {
    id: 'keyframe',
    key: 'keyframeEnabled',
    section: 'External Links & Downloads',
    def: false,
    legacy: ['keyframeEnabled'],
    title: 'Keyframe Staff List Links',
    help: 'Add a button on staff and studio pages that opens the same person or studio on Keyframe Staff List.'
  },
  () => {
    const ID = 'ala-keyframe-link';
    const BASE = 'https://keyframe-staff-list.com';
    const LABEL = 'Keyframe Staff List';
    const SLOT = '.filters';
    const PATHS: Record<string, string> = { staff: 'person', studio: 'studio' };

    const route = (): KeyframeRoute | null => {
      const m = location.pathname.match(/^\/(staff|studio)\/(\d+)(?:\/|$)/);
      return m ? { kind: m[1] as 'staff' | 'studio', id: m[2] } : null;
    };

    addStyle(
      'ala-keyframe-style',
      `
      #${ID}{flex:0 0 auto;margin-right:12px;text-decoration:none;color:inherit;cursor:pointer;white-space:nowrap}
      #${ID}.ala-kf-plain{display:inline-flex;align-items:center;gap:7px;min-height:30px;padding:0 12px;border-radius:4px;background:rgb(var(--color-foreground));font-size:1.2rem;font-weight:500;line-height:1;transition:background .15s,color .15s}
      #${ID}.ala-kf-plain:hover{background:rgb(var(--color-blue));color:#fff}
      #${ID} .icon{flex:0 0 auto}`
    );

    const copyScope = (from: Element, to: Element): void => {
      for (const at of Array.from(from.attributes)) {
        if (at.name.startsWith('data-v-')) to.setAttribute(at.name, at.value);
      }
    };

    function skin(a: HTMLElement | null): void {
      if (!a || a.dataset.kfSkin) return;
      const ref = a.parentElement?.querySelector('.mini-select');
      if (!ref) return;
      a.classList.remove('ala-kf-plain');
      a.classList.add('mini-select');
      copyScope(ref, a);

      const refIcon = ref.querySelector('svg');
      const refLabel = ref.querySelector('.label');
      const iconEl = a.querySelector('svg');
      const labelEl = a.querySelector('span');

      if (iconEl) {
        iconEl.classList.add('icon');
        if (refIcon) copyScope(refIcon, iconEl);
      }
      if (labelEl) {
        labelEl.classList.add('label');
        if (refLabel) copyScope(refLabel, labelEl);
      }
      a.dataset.kfSkin = '1';
    }

    function build(r: KeyframeRoute): HTMLAnchorElement {
      const a = document.createElement('a');
      a.id = ID;
      a.className = 'ala-kf-plain';
      a.href = `${BASE}/${PATHS[r.kind]}/${r.id}`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.title = `Open on ${LABEL}`;
      a.setAttribute('aria-label', `Open on ${LABEL}`);
      a.innerHTML = `${icon('external', 14)}<span>${LABEL}</span>`;
      a.addEventListener('click', (e) => e.stopPropagation());
      return a;
    }

    let token = 0;
    let placedKey: string | null = null;
    let placing = false;

    async function place(): Promise<void> {
      const r = route();
      const key = r && `${r.kind}:${r.id}`;
      if (key && key === placedKey && document.getElementById(ID)) return;
      document.getElementById(ID)?.remove();
      placedKey = null;
      if (!r) return;

      const mine = ++token;
      placing = true;
      try {
        const row = await Core.waitForSelector(SLOT, 8000);
        const now = route();
        if (row && mine === token && now && now.kind === r.kind && now.id === r.id && !document.getElementById(ID)) {
          const a = build(r);
          row.insertBefore(a, row.firstChild);
          skin(a);
          placedKey = key;
        }
      } finally {
        if (mine === token) placing = false;
      }
    }

    const repair = debounce(() => {
      if (!route() || placing) return;
      const a = document.getElementById(ID);
      if (!a) {
        placedKey = null;
        place();
      } else {
        skin(a);
      }
    }, 400);

    place();
    Core.onNavigate(place);
    Core.onBodyMutation(repair);
  }
);