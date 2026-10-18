import { GM_registerMenuCommand } from 'vite-plugin-monkey/dist/client';
import { defineFeature } from '../../core/registry';
import { clearMalAuth, clearAniListAuth, log } from '../../api/mal';
import { store, safe } from '../../utils/helpers';
import { SENSITIVE_KEYS } from '../../settings/backup';
import { TYPES } from './types';
import { stores, clearCache } from './state';
import { initSyncPanel, renderPanel } from './panel';

const ALL_KEYS = [
  ...SENSITIVE_KEYS,
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
    def: false,
    legacy: ['syncEnabled', 'syncOn'],
    title: 'AniList → MyAnimeList Sync',
    help: 'Enable sync and show the list page sync panel',
    options: [
      {
        key: 'syncAutoAnime',
        type: 'toggle',
        def: false,
        legacy: ['syncAutoAnime'],
        title: 'Auto-Sync Anime',
        help: 'Automatically sync your anime list to MyAnimeList in the background.'
      },
      {
        key: 'syncIntervalAnime',
        type: 'number',
        childOf: 'syncAutoAnime',
        def: 6,
        min: 1,
        max: 720,
        legacy: ['syncIntervalAnime', 'syncIntervalHours', 'autoSyncIntervalHours', 'autoSyncInterval'],
        title: 'Auto-Sync Anime Interval',
        help: 'How often to automatically sync your anime list (in hours, minimum 1).'
      },
      {
        key: 'syncAutoManga',
        type: 'toggle',
        def: false,
        legacy: ['syncAutoManga'],
        title: 'Auto-Sync Manga',
        help: 'Automatically sync your manga list to MyAnimeList in the background.'
      },
      {
        key: 'syncIntervalManga',
        type: 'number',
        childOf: 'syncAutoManga',
        def: 6,
        min: 1,
        max: 720,
        legacy: ['syncIntervalManga', 'syncIntervalMangaHours', 'autoSyncIntervalMangaHours', 'syncIntervalHours'],
        title: 'Auto-Sync Manga Interval',
        help: 'How often to automatically sync your manga list (in hours, minimum 1).'
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