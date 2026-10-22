export const TYPES = ['ANIME', 'MANGA'] as const;
export type SyncMediaType = (typeof TYPES)[number];

export const typeLabel = (t: string): string => (t === 'ANIME' ? 'Anime' : 'Manga');

export interface SyncProgress {
  phase: 'idle' | 'fetching' | 'pushing';
  done: number;
  total: number;
  changed: number;
}

export interface SyncCounters {
  pushed: number;
  deleted: number;
  unchanged: number;
  settled: number;
  skipped: number;
  unmatched: number;
  conflicts: number;
  transient: number;
  permanent: number;
}

export interface PendingDelete {
  mediaId: number;
  malId?: number;
  type: SyncMediaType;
  title: string;
  deletedAt: number;
}

export interface AniListSyncEntry {
  status: string;
  score: number;
  progress: number;
  progressVolumes?: number;
  repeat: number;
  notes?: string;
  updatedAt: number;
  startedAt?: { year?: number; month?: number; day?: number };
  completedAt?: { year?: number; month?: number; day?: number };
  mediaId: number;
  idMal: number;
  title: string;
  queryTitles: string[];
  titles: string[];
  startYear: number;
}

export interface SyncTarget {
  entry: AniListSyncEntry;
  malId: number;
  explicit: boolean;
}

export interface SyncJob extends SyncTarget {
  patch: Record<string, any>;
}

export interface FlaggedError extends Error {
  cancelled?: boolean;
  abort?: boolean;
  auth?: string;
  status?: number;
  html?: boolean;
}