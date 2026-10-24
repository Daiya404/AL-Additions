import { userMap } from './state';
import { store as gmStore } from '../../utils/helpers';

export const isTaxonomyQuery = (parsed: any): boolean =>
  /\bGenreCollection\b|\bMediaTagCollection\b/i.test(String(parsed?.query || ''));

export const isMediaListQuery = (parsed: any): boolean =>
  /\bMediaListCollection\b/i.test(String(parsed?.query || ''));

export const isViewerQuery = (parsed: any): boolean =>
  /\bViewer\b/i.test(String(parsed?.query || ''));

export const isMutation = (parsed: any) =>
  /\bmutation\b/i.test(String(parsed?.query || '').replace(/#[^\n\r]*/g, ' '));

export const isVolatile = (parsed: any) =>
  /\b(?:notifications|activities|Activity|Notification)\s*\(/.test(String(parsed?.query || '').replace(/#[^\n\r]*/g, ' '));

export const noStore = (d: any) =>
  d.cache === 'no-store' || d.cache === 'reload' || !!d.headers.get('cache-control')?.toLowerCase().includes('no-store');

export function normalizeGqlQuery(q: string): string {
  if (typeof q !== 'string') return '';
  return q
    .replace(/#[^\n\r]*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}():,])\s*/g, '$1')
    .trim();
}

export function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

export function normalizeVariables(vars: any): any {
  if (!vars || typeof vars !== 'object') return {};
  const copy: Record<string, any> = {};
  for (const k of Object.keys(vars)) {
    if (vars[k] !== undefined && vars[k] !== null) {
      copy[k] = vars[k];
    }
  }
  if (copy.userName && !copy.userId) {
    const name = String(copy.userName).toLowerCase();
    const mine = String(gmStore.get('al_username', '') || '').toLowerCase();
    const id = userMap.get(name) || (name === mine ? Number(gmStore.get('al_user_id', 0)) : 0);
    if (id) {
      copy.userId = id;
      delete copy.userName;
    }
  }
  if (copy.userId && copy.userName) {
    delete copy.userName;
  }
  return copy;
}

export function parseBody(body: string) {
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.query === 'string'
      ? parsed
      : null;
  } catch {
    return null;
  }
}