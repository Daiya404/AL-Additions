import { defineFeature } from '../core/registry';

defineFeature(
  {
    id: 'devMode',
    key: 'devModeEnabled',
    section: 'Advanced',
    def: false,
    title: 'Developer Mode',
    help: 'Enable developer diagnostics and verbose module logging in the browser console.',
    options: [
      {
        key: 'debugFastLoad',
        type: 'toggle',
        def: false,
        title: 'Fast Load Debug',
        help: 'Log Web Worker RPC requests, cache hits/misses, deduplication, and prefetch activity.'
      },
      {
        key: 'debugSync',
        type: 'toggle',
        def: false,
        title: 'Sync Debug',
        help: 'Log MAL synchronization steps, queue processing, rate limits, and deletions.'
      },
      {
        key: 'debugCompareView',
        type: 'toggle',
        def: false,
        title: 'Compare View Debug',
        help: 'Log list comparison data loading, score diffs, sorting, and filtering passes.'
      },
      {
        key: 'debugMediaInfo',
        type: 'toggle',
        def: false,
        title: 'Media Info Debug',
        help: 'Log media info sidebar updates, progress steppers, and save requests.'
      },
      {
        key: 'debugTierLabels',
        type: 'toggle',
        def: false,
        title: 'Tier Labels Debug',
        help: 'Log scoring system detection, tier matching, and badge rendering.'
      },
      {
        key: 'debugGeneral',
        type: 'toggle',
        def: false,
        title: 'Core & Observer Debug',
        help: 'Log DOM observer mutations, route changes, and general script lifecycle events.'
      }
    ]
  },
  () => {}
);
