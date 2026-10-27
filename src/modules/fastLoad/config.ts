export const CFG = {
  lazyMedia: false,
  rowSkipping: false,
  coalesceObservers: false,
  observerBatchMs: 80,
  fastInnerText: false,
  memoSelectorProbes: false,
  blockTierInData: false,
  tierAssist: false,
  tierAssistMs: 250,

  gqlTtl: 15_000,
  gqlStaleTtl: 5 * 60_000,
  gqlMaxBytes: 64 * 1024 * 1024,
  gqlMaxEntryBytes: 24 * 1024 * 1024,

  prefetch: true,
  earlyStart: false,
  prefetchMaxPerMin: 12,
  prefetchDwellMs: 200,
  learnWindowMs: 8_000,
  learnMaxReqs: 6
};

export const GQL_ORIGIN = 'https://graphql.anilist.co';
export const MEDIA_ORIGIN = 'https://s4.anilist.co';

export const stats = {
  graphqlRequests: 0,
  cacheHits: 0,
  deduped: 0,
  staleServed: 0,
  prefetched: 0,
  earlyStarts: 0,
  observerBatches: 0,
  observerRecordsMerged: 0,
  probesShared: 0,
  labelsReleased: 0
};

export const attempt = <T>(fn: () => T): T | undefined => {
  try {
    return fn();
  } catch {
    /* ignore */
  }
};

export const idle = (win: any, fn: () => void, timeout = 1500) =>
  'requestIdleCallback' in win ? win.requestIdleCallback(fn, { timeout }) : setTimeout(fn, 0);