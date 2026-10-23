import { Settings } from '../settings/settings';
import { HOST, logDebug } from '../utils/helpers';
import type { ModuleDef, FeatureMeta } from '../types';

export const modules: ModuleDef[] = [];

export const defineModule = (
  name: string,
  setting: string | null,
  init: () => void | Promise<void>,
  hosts: string[] = ['anilist.co'],
  early = false
): void => {
  modules.push({ name, setting, init, hosts, early });
};

export const defineFeature = (meta: FeatureMeta, init: () => void | Promise<void>): void => {
  Settings.register(meta);
  defineModule(meta.id, meta.alwaysRun ? null : meta.key, init, meta.hosts, meta.early);
};

export function startModules(early: boolean): void {
  for (const m of modules) {
    if (m.early !== early || !m.hosts.includes(HOST)) continue;
    if (m.setting && !Settings.get(m.setting)) continue;
    logDebug('[CORE]', `Initializing module "${m.name}" (early=${early})`);
    try {
      Promise.resolve(m.init()).catch((e) => console.error('[AL-Additions]', m.name, e));
    } catch (e) {
      console.error('[AL-Additions]', m.name, e);
    }
  }
}