import { Settings } from '../../settings/settings';
import { SyncMediaType, AniListSyncEntry } from './types';

export const STATUS_MAP: Record<SyncMediaType, Record<string, string>> = {
  ANIME: {
    CURRENT: 'watching',
    COMPLETED: 'completed',
    PAUSED: 'on_hold',
    DROPPED: 'dropped',
    PLANNING: 'plan_to_watch',
    REPEATING: 'watching'
  },
  MANGA: {
    CURRENT: 'reading',
    COMPLETED: 'completed',
    PAUSED: 'on_hold',
    DROPPED: 'dropped',
    PLANNING: 'plan_to_read',
    REPEATING: 'reading'
  }
};

export const PROGRESS_KEYS = ['num_watched_episodes', 'num_chapters_read', 'num_volumes_read'];

export function convertScore(score100: any): number {
  if (!score100 || score100 <= 0) return 0;
  const mode = Settings.get('syncScoreRounding');
  const fn = mode === 'ceil' ? Math.ceil : mode === 'floor' ? Math.floor : Math.round;
  return Math.max(1, Math.min(10, fn(Number(score100) / 10)));
}

export const fuzzyToMalDate = (f: any): string | null =>
  f && f.year && f.month && f.day ? `${f.year}-${String(f.month).padStart(2, '0')}-${String(f.day).padStart(2, '0')}` : null;

export const count = (v: any): number => Math.max(0, Math.floor(Number(v) || 0));
export const normText = (s: any): string => String(s || '').replace(/\r\n?/g, '\n').trim();

export function buildPayload(type: SyncMediaType, e: AniListSyncEntry): Record<string, any> | null {
  const status = STATUS_MAP[type][e.status];
  if (!status) return null;
  const anime = type === 'ANIME';
  const p: Record<string, any> = { status };
  const score = convertScore(e.score);
  if (score > 0) p.score = score;
  p[anime ? 'is_rewatching' : 'is_rereading'] = e.status === 'REPEATING' ? 'true' : 'false';
  if (anime) p.num_watched_episodes = count(e.progress);
  else {
    p.num_chapters_read = count(e.progress);
    if (count(e.progressVolumes) > 0) p.num_volumes_read = count(e.progressVolumes);
  }
  const start = fuzzyToMalDate(e.startedAt);
  const finish = fuzzyToMalDate(e.completedAt);
  if (start) p.start_date = start;
  if (finish) p.finish_date = finish;
  if (count(e.repeat) > 0) p[anime ? 'num_times_rewatched' : 'num_times_reread'] = count(e.repeat);
  const notes = normText(e.notes);
  if (notes) p.comments = notes.slice(0, 2000);
  return p;
}

export const malKey = (k: string): string => (k === 'num_watched_episodes' ? 'num_episodes_watched' : k);
export const normDate = (v: any): string | null => (v ? String(v).slice(0, 10) : null);
export const truthy = (v: any): boolean => v === true || v === 1 || String(v).toLowerCase() === 'true';
export const NUMERIC = [
  'score',
  'num_watched_episodes',
  'num_chapters_read',
  'num_volumes_read',
  'num_times_rewatched',
  'num_times_reread'
];

export function fieldEquals(key: string, desired: any, actual: any): boolean {
  if (key === 'is_rewatching' || key === 'is_rereading') return truthy(actual) === truthy(desired);
  if (key === 'start_date' || key === 'finish_date') return normDate(actual) === normDate(desired);
  if (key === 'comments') return normText(actual) === normText(desired);
  if (NUMERIC.includes(key)) return Number(actual || 0) === Number(desired || 0);
  return String(actual ?? '') === String(desired ?? '');
}

export function reconcile(type: SyncMediaType, entry: AniListSyncEntry, mal: any): Record<string, any> | null {
  const desired = buildPayload(type, entry);
  if (!desired) return null;
  const anime = type === 'ANIME';
  const pKey = anime ? 'num_watched_episodes' : 'num_chapters_read';
  const rKey = anime ? 'num_times_rewatched' : 'num_times_reread';
  const m = mal || {};

  const rewatches = Math.max(Number(desired[rKey]) || 0, Number(m[rKey]) || 0);
  if (rewatches > 0) desired[rKey] = rewatches;

  if (entry.status === 'COMPLETED') {
    const completedCount = (key: string, total: any) =>
      Number(total) > 0 ? Number(total) : Math.max(Number(desired[key]) || 0, Number(m[malKey(key)]) || 0);
    desired[pKey] = completedCount(pKey, m.__total);
    if (!anime) {
      const vols = completedCount('num_volumes_read', m.__totalVolumes);
      if (vols > 0) desired.num_volumes_read = vols;
      else delete desired.num_volumes_read;
    }
    if (!(desired[pKey] > 0)) delete desired[pKey];
  }
  if (!mal) return desired;

  const statusEq =
    fieldEquals('status', desired.status, m.status) ||
    (entry.status === 'REPEATING' && truthy(m[anime ? 'is_rewatching' : 'is_rereading']));
  const patch: Record<string, any> = {};
  for (const [k, v] of Object.entries(desired)) {
    if (k === 'status') {
      if (!statusEq) patch.status = v;
      continue;
    }
    if ((!statusEq && PROGRESS_KEYS.includes(k)) || !fieldEquals(k, v, m[malKey(k)])) patch[k] = v;
  }
  return patch;
}

export function fallbackPatch(type: SyncMediaType, patch: Record<string, any>, mal: any, tried: Set<string>): Record<string, any> | null {
  if (!tried.has('dates')) {
    tried.add('dates');
    if ('start_date' in patch || 'finish_date' in patch) {
      const out = { ...patch };
      delete out.start_date;
      delete out.finish_date;
      if (Object.keys(out).length) return out;
    }
  }
  if (!tried.has('cap')) {
    tried.add('cap');
    const caps: Record<string, any> =
      type === 'ANIME'
        ? { num_watched_episodes: mal?.__total }
        : { num_chapters_read: mal?.__total, num_volumes_read: mal?.__totalVolumes };
    const out = { ...patch };
    let changed = false;
    for (const [k, cap] of Object.entries(caps)) {
      if (cap > 0 && Number(out[k]) > cap) {
        out[k] = cap;
        changed = true;
      }
    }
    if (changed) return out;
  }
  return null;
}

export const STATUS_LABEL: Record<string, string> = {
  watching: 'Watching',
  reading: 'Reading',
  completed: 'Completed',
  on_hold: 'On hold',
  dropped: 'Dropped',
  plan_to_watch: 'Plan to watch',
  plan_to_read: 'Plan to read'
};

export function describePatch(type: SyncMediaType, patch: Record<string, any>): string {
  const parts: string[] = [];
  if ('status' in patch) parts.push(`status: ${STATUS_LABEL[patch.status] || patch.status}`);
  if ('score' in patch) parts.push(`score: ${patch.score}/10`);
  const progressKey = type === 'ANIME' ? 'num_watched_episodes' : 'num_chapters_read';
  if (progressKey in patch) parts.push(`${type === 'ANIME' ? 'episodes' : 'chapters'}: ${patch[progressKey]}`);
  if (type === 'MANGA' && 'num_volumes_read' in patch) parts.push(`volumes: ${patch.num_volumes_read}`);
  if ('num_times_rewatched' in patch) parts.push(`rewatches: ${patch.num_times_rewatched}`);
  if ('num_times_reread' in patch) parts.push(`rereads: ${patch.num_times_reread}`);
  if ('start_date' in patch) parts.push(`start date: ${patch.start_date}`);
  if ('finish_date' in patch) parts.push(`finish date: ${patch.finish_date}`);
  if ('comments' in patch) parts.push('notes');
  return parts.join('; ') || 'MAL-normalised fields';
}