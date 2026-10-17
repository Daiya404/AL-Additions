import { GM_registerMenuCommand } from 'vite-plugin-monkey/dist/client';
import { defineFeature } from '../../core/registry';
import { clearMalAuth, clearAniListAuth, log } from '../../api/mal';
import { store, safe } from '../../utils/helpers';
import { TYPES } from './types';
import { stores, clearCache } from './state';
import { initSyncPanel, renderPanel } from './panel';

const ALL_KEYS = [
  'al_token',
  'al_username',
  'al_user_id',
  'al_score_format',
  'mal_code_verifier',
  'mal_token',
  'mal_refresh_token',
  'mal_expires_at',
  'sync_lock_heartbeat',
  'sync_onboarded',
  'sync_retry_at',
  'sync_account',
  ...TYPES.flatMap((t) => [`last_sync_${t}`, `last_run_${t}`, `last_compare_${t}`])
];

defineFeature(
  {
    id: 'sync',
    key: 'syncEnabled',
    section: 'Sync',
    hosts: ['anilist.co', 'myanimelist.net'],
    alwaysRun: true,
    legacy: ['syncEnabled', 'syncOn'],
    title: 'AniList → MyAnimeList Sync',
    help: 'Enable syncing your AniList list to MyAnimeList, including automatic syncs.',
    options: [
      {
        key: 'syncIntervalHours',
        type: 'number',
        def: 6,
        min: 1,
        max: 720,
        legacy: ['syncIntervalHours', 'autoSyncIntervalHours', 'autoSyncInterval'],
        title: 'Automatic Sync Interval',
        help: 'How often automatic syncing checks and updates MyAnimeList. The minimum is 1 hour.'
      },
      {
        key: 'syncScoreRounding',
        type: 'select',
        def: 'round',
        options: [
          ['ceil', 'Ceil'],
          ['round', 'Round'],
          ['floor', 'Floor']
        ],
        legacy: ['syncScoreRounding', 'scoreConversionMethod'],
        title: 'Decimal Score Conversion',
        help: 'MyAnimeList only accepts whole-number scores. <b>Ceil</b> always rounds up (7.4 → 8), <b>Round</b> rounds normally (7.4 → 7, 7.5 → 8), and <b>Floor</b> always rounds down (7.9 → 7).'
      }
    ]
  },
  () => {
    if (store.get('sync_schema', 0) < 2) {
      safe(() => {
        for (const k of [
          'mal_mirror_ANIME',
          'mal_mirror_MANGA',
          'retry_queue_ANIME',
          'retry_queue_MANGA',
          'force_mirror_refresh',
          'mal_idmap_ANIME',
          'mal_idmap_MANGA',
          'last_full_sync'
        ])
          store.del(k);
        for (const t of TYPES) {
          if (!store.get(`last_run_${t}`, 0) && store.get(`last_sync_${t}`, 0))
            store.set(`last_run_${t}`, store.get(`last_sync_${t}`, 0));
        }
        store.set('sync_schema', 2);
      }, 'sync schema upgrade');
    }

    GM_registerMenuCommand('🗑️ AL→MAL Sync: Reset all data', () => {
      ALL_KEYS.forEach((k) => store.del(k));
      for (const t of TYPES) {
        clearCache(stores[t].ids);
        clearCache(stores[t].settled);
      }
      log('All stored data cleared.');
      renderPanel();
    });
    GM_registerMenuCommand('🔵 AL→MAL Sync: Disconnect AniList', () => {
      clearAniListAuth();
      log('AniList disconnected.');
      renderPanel();
    });
    GM_registerMenuCommand('🟦 AL→MAL Sync: Disconnect MAL', () => {
      clearMalAuth();
      log('MAL disconnected.');
      renderPanel();
    });

    initSyncPanel();
  }
);