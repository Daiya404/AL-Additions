import { store, safe, esc } from '../utils/helpers';
import type { SettingRow, SettingType, FeatureMeta, RegisteredFeature } from '../types';

const PREFIX = 'ala_setting_';
export const features: RegisteredFeature[] = [];
export const ROWS: Record<string, SettingRow> = {};

const textIO = {
  read: (el: HTMLInputElement | HTMLSelectElement) => el.value,
  write: (el: HTMLInputElement | HTMLSelectElement, v: any) => {
    el.value = v;
  }
};

export const TYPES: Record<
  SettingType,
  {
    normalize: (v: any, r?: SettingRow) => any;
    html: (r: SettingRow, v: any) => string;
    read: (el: any) => any;
    write: (el: any, v: any) => void;
  }
> = {
  toggle: {
    normalize: (v) => (v === 'false' ? false : !!v),
    html: (r, v) =>
      `<span class="ala-switch"><input type="checkbox" data-key="${r.key}" ${v ? 'checked' : ''}><span class="ala-slider"></span></span>`,
    read: (el: HTMLInputElement) => el.checked,
    write: (el: HTMLInputElement, v) => {
      el.checked = !!v;
    }
  },
  number: {
    normalize: (v, r) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) && n > 0 ? Math.max(r?.min ?? 1, Math.min(r?.max ?? 100, n)) : r?.def;
    },
    html: (r, v) =>
      `<input type="number" data-key="${r.key}" min="${r.min ?? 1}" max="${r.max ?? 100}" step="1" inputmode="numeric" value="${esc(v)}">`,
    ...textIO
  },
  select: {
    normalize: (v, r) => (r?.options?.some((o) => o[0] === v) ? v : r?.def),
    html: (r, v) =>
      `<select data-key="${r.key}">${(r.options || [])
        .map(([val, label]) => `<option value="${val}" ${v === val ? 'selected' : ''}>${label}</option>`)
        .join('')}</select>`,
    ...textIO
  },
  list: {
    normalize: (v, r) => {
      const arr = (Array.isArray(v) ? v : String(v == null ? '' : v).split(','))
        .map((x) => String(x).trim())
        .filter(Boolean);
      return arr.length ? arr : (r?.def || []).slice();
    },
    html: (r, v) =>
      `<input type="text" data-key="${r.key}" value="${esc((v || []).join(', '))}" autocomplete="off" autocapitalize="off" spellcheck="false">`,
    read: (el: HTMLInputElement) => el.value,
    write: (el: HTMLInputElement, v: string[]) => {
      el.value = v.join(', ');
    }
  }
};

function register(f: FeatureMeta): void {
  const toggle: SettingRow = {
    key: f.key,
    type: 'toggle',
    def: f.def !== false,
    legacy: f.legacy || [],
    title: f.title,
    help: f.help
  };
  const options: SettingRow[] = (f.options || []).map((o) => ({
    ...o,
    legacy: o.legacy || []
  }));

  for (const row of [toggle, ...options]) {
    if (ROWS[row.key]) throw new Error(`Duplicate setting: ${row.key}`);
    row.legacy = [...new Set([row.key, ...row.legacy])];
    ROWS[row.key] = row;
  }
  features.push({ id: f.id, section: f.section || 'Other', title: f.title, help: f.help, toggle, options });
}

function get(key: string): any {
  const r = ROWS[key];
  if (!r) throw new Error(`Unknown setting: ${key}`);
  return TYPES[r.type].normalize(store.get(PREFIX + key, r.def), r);
}

function set(key: string, raw: any): void {
  store.set(PREFIX + key, raw);
  store.set(PREFIX + key, get(key));
}

function migrate(): void {
  safe(() => {
    for (const r of Object.values(ROWS)) {
      if (store.get(PREFIX + r.key, undefined) !== undefined) continue;
      for (const name of r.legacy) {
        const raw = localStorage.getItem('ALAdditions:' + name);
        if (raw == null) continue;
        let v: any = raw;
        try {
          v = JSON.parse(raw);
        } catch (_) {}
        store.set(PREFIX + r.key, v);
        break;
      }
    }
  }, 'settings migration');
}

export const Settings = { get, set, register, migrate };