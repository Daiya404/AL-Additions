# AL Additions

AL Additions is a userscript that adds practical tools to [AniList](https://anilist.co/): list editing, airing indicators, OP/ED themes, quick links, score-tier labels, compare-view improvements, performance optimisations, and a one-way **AniList → MyAnimeList sync**.

- **Version:** 0.8.0 ([changelog](./CHANGELOG.md))
- **License:** GPL-3.0-or-later
- **Author:** [Daiya](https://github.com/Daiya404)
- **Runs on:** [AniList](https://anilist.co/) and [MyAnimeList](https://myanimelist.net/) (MAL is used for account connection and syncing)
- **Requires:** a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)

---

## Why this exists

I wanted these features without making AniList feel unnecessarily slow. Some features began as separate userscripts; AL Additions brings them together, fixes and extends them, and shares core navigation and DOM-observation work. Version 0.8.0 also brings the performance-focused AniList Fast Load and AniList Tier Labels functionality into the same script, alongside new compare-view, sync-management, and backup tools.

**AI disclosure:** AI tools, including Claude and ChatGPT, assisted substantially with the code. I direct the project, test it, and maintain it.

---

## Features

Each feature can be enabled or disabled in **AniList Settings → AL Additions → Settings**. Some features are off by default; check the setting before expecting them to appear.

| Feature                           | What it does                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AniList → MAL Sync**            | One-way anime and manga list sync, with manual or scheduled runs, safe matching, configurable sync behaviour, and activity logs.                                    |
| **Manual Mappings & Sync Audit**  | Override a title's MAL ID, explicitly skip a title, and find MAL entries that are missing from your AniList library.                                                |
| **AniList Fast Load**             | Optional performance optimisation using lazy media handling, off-screen row skipping, request caching/deduplication, observer batching, and navigation prefetching. |
| **AniList Tier Labels**           | Custom score-tier badges and colours on supported list, card, browse, and compare ratings.                                                                          |
| **Compare View Improvements**     | Sort comparison entries by title or score, load the full comparison list, and filter by status.                                                                     |
| **Browse Tag Rank Filter**        | Applies a configurable minimum tag-rank percentage when searching with a tag or genre.                                                                              |
| **Short AniList URLs**            | Removes title slugs from anime, manga, staff, and character URLs.                                                                                                   |
| **Anime/Manga Banner Downloader** | Adds a banner download button to anime and manga pages; profile banners are optional.                                                                               |
| **MyAnimeList & Nyaa Links**      | Opens the MAL page from a title link; Ctrl/Cmd-click on desktop or long-press on mobile searches Nyaa.                                                              |
| **Keyframe Staff List Links**     | Opens the matching staff or studio page on Keyframe Staff List.                                                                                                     |
| **List Score & Progress Editor**  | Edits your score and episode/chapter progress from the anime or manga page sidebar.                                                                                 |
| **Airing Progress Indicator**     | Shows an orange dot for airing shows in your Watching list when your progress is behind the aired episode count.                                                    |
| **Anime Opening & Ending Songs**  | Lists OP/ED themes on anime pages and lets you play a theme video inline.                                                                                           |
| **Backup & Restore**              | Export and import settings, with optional encryption; a separate protected export can include account credentials.                                                  |
| **Developer Mode**                | Enables optional console diagnostics for troubleshooting.                                                                                                           |

### Feature notes

**AniList Fast Load** is disabled by default. Enable it in the settings panel under **AniList Enhancements**. It includes lazy media handling, skipping work for off-screen rows, coalesced observer work, safe GraphQL caching and in-flight request deduplication, stale-data fallback, navigation prefetching, and earlier request starts. It is intended to reduce repeated work, not to change AniList's core features.

**AniList Tier Labels** is disabled by default. Enable it under **AniList Enhancements**. You can customise tier labels, score ranges, and colours; choose whether the score text matches its tier colour; and choose whether badges appear beside Average and Mean scores. The feature supports list, card, browse, and compare views where compatible rating elements are present.

**Standalone-script compatibility:** if the standalone AniList Fast Load or AniList Tier Labels userscript is detected, AL Additions pauses the corresponding built-in module to avoid duplicate execution. The built-in setting is retained and can take effect after the standalone script is removed. You should not deliberately run both versions of the same feature at once.

**Compare View Improvements** adds sorting by title, your score, or the other user's score; automatic loading of the complete comparison list; and filtering based on the statuses selected for both users. The status control adapts to narrow/mobile screens.

**Browse Tag Rank Filter** applies only on anime and manga search pages, after a tag or genre has been selected. The minimum rank can be set from 1 to 100 (default 50).

**MyAnimeList & Nyaa Links:** Nyaa results are sorted by seeders and highlight the release groups you specify. The default groups are SubsPlease and ToonsHub; edit them in settings.

**List Score & Progress Editor:** supports AniList's 100-point, 10-point, 10-point decimal, 5-star, and 3-smiley score formats. The +/− controls change the form only; nothing is saved until you press **Save**. Saving the final episode or chapter marks the entry completed without overwriting an existing completion date. For manga and novels, released chapter counts are looked up from MangaUpdates or NovelUpdates.

**Airing Progress Indicator:** checks entries in the Watching section of your anime list and caches results to reduce requests.

**Anime Opening & Ending Songs:** theme data comes from [AnimeThemes](https://animethemes.moe/) and is cached for seven days.

---

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Install AL Additions from **[Greasy Fork](https://greasyfork.org/en/scripts/594705-al-additions)**.
3. Open AniList and configure features in **Settings → AL Additions → Settings**.

Releases are published on GitHub first, and Greasy Fork syncs from this repository. Your userscript manager should check for updates automatically.

### Install directly from GitHub

Open the [raw userscript file](https://raw.githubusercontent.com/Daiya404/AL-Additions/main/al-additions.user.js) and accept the install prompt from your userscript manager.

Use either Greasy Fork or GitHub, not both, to avoid running two copies.

---

## Settings

- **Desktop:** open AniList Settings and choose **AL Additions → Settings** in the sidebar.
- **Mobile or narrow screens:** open AniList Settings and use the floating **AL Additions** button.

The panel groups features into sections. Change the settings you want, then press **Save and reload**. **Reset to defaults** resets the controls in the panel; press Save and reload to apply the reset. Feature-specific options appear when the relevant feature is enabled.

Notable options include:

| Setting                  | Default              | Notes                                                                                             |
| ------------------------ | -------------------- | ------------------------------------------------------------------------------------------------- |
| Minimum Tag Rank         | 50                   | Range 1–100.                                                                                      |
| User Profile Banners     | Off                  | Enables the banner downloader on user profiles; anime/manga banners are supported regardless.     |
| Nyaa Search Providers    | SubsPlease, ToonsHub | Comma-separated release-group names.                                                              |
| Auto-Sync Anime          | Off                  | Configure its interval separately.                                                                |
| Auto-Sync Manga          | Off                  | Configure its interval separately.                                                                |
| Auto-Sync interval       | 6 hours per list     | Range 1–720 hours. Anime and manga have independent intervals.                                    |
| Decimal Score Conversion | Round                | MAL accepts whole-number scores: Ceil always rounds up, Round rounds normally, Floor rounds down. |
| Sync Mode                | Update Only          | Exact Match (Mirror) can delete MAL entries removed from AniList.                                 |
| Fast Load                | Off                  | Optional performance module.                                                                      |
| Tier Labels              | Off                  | Custom score tiers and colours.                                                                   |
| Developer Mode           | Off                  | Enables optional console diagnostics and module-specific debug switches.                          |

### Backup & Restore

The settings panel includes a **Backup & Restore** section:

- **Export Settings** downloads a backup of your AL Additions settings without account credentials. You may optionally protect the backup with a password.
- **Export with Credentials** includes AniList and MAL authentication credentials. A password is mandatory, and the script asks for confirmation first. Anyone who can decrypt this file may be able to access those accounts, so store it securely and never share it publicly.
- **Import Settings** restores recognised values from a backup file. Settings not present in the backup are left as they are. Importing a backup containing credentials can restore those credentials as well.

Keep backups somewhere private. A password-encrypted backup is only as safe as the password you choose and protect.

---

## AniList → MyAnimeList sync

The sync is **one-way**: AniList is the source and the script writes changes to MyAnimeList. It does not sync MAL edits back to AniList.

### Connect your accounts

You can connect or disconnect AniList and MyAnimeList from the account controls in the settings panel. The sync panel is shown on your own anime or manga list page, not on another user's list. If a connection does not complete normally, use the connection troubleshooting option shown by the sync flow.

### Using the sync panel

| Control         | Action                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Sync**        | Syncs the list currently being viewed, or both list types when not on a specific list page.                          |
| **Full resync** | Rechecks the library and clears cached match/suppression decisions. Use it after correcting mappings or MAL entries. |
| **Stop**        | Requests that a running sync stop after its current request finishes.                                                |
| **Logs**        | Shows sync activity and reports skipped or failed entries.                                                           |

The first sync may ask you to confirm decimal-score conversion because MAL only accepts whole-number scores.

**Automatic sync** is configurable independently for anime and manga. It runs at the chosen interval while an AniList or MAL tab is open and both accounts are connected. Failed runs are retried after a delay.

### Sync modes — read before choosing

- **Update Only (default):** adds and updates MAL entries. If an entry is removed from AniList, an existing MAL entry is left alone.
- **Exact Match (Mirror):** aims to mirror the AniList library and can delete entries from MAL when they are removed from AniList. Only choose this if you want deletions mirrored.

### Manual mappings and audit

Open **Manual Mappings & Sync Audit** in the settings panel to:

- Assign a specific MAL ID when the automatic mapping is wrong or missing.
- Mark a title as **AniList-Only** so it is intentionally ignored by sync.
- Search and filter saved overrides and ignored entries.
- Scan your AniList and MAL lists for MAL entries that are not represented in your AniList library.
- Delete a selected orphaned entry from MAL after confirming the action.

Use the audit before deleting entries, and verify your lists after the first sync. Sync changes MAL; it does not write back to AniList.

### How matching and updates work

- **Conservative matching:** the sync uses available AniList/MAL IDs and existing MAL-list titles first, then searches when needed. Uncertain matches are skipped and logged rather than guessed.
- **Minimal writes:** it reads the MAL list and only submits fields that differ.
- **Incremental sync:** normal runs focus on AniList entries changed since the last successful run; a full comparison runs periodically and when you request a full resync.
- **Scores:** unscored AniList entries do not erase a MAL score. Decimal scores are converted using the selected rounding rule.
- **Dates and notes:** start/finish dates are only sent when complete; notes are trimmed to fit MAL's comments field.
- **Rate limits:** requests are paced, cooldowns are respected, and repeated MAL failures pause writes temporarily. A lock prevents two tabs from syncing at once.
- **Account changes:** when the connected account pair changes, account-specific sync state is reset.

The sync is designed to be cautious, but you should still verify your lists after the first run, especially if the two libraries differ substantially.

### Disconnecting and resetting

Use the account controls in Settings to disconnect AniList or MAL. The userscript manager's menu also provides sync commands to disconnect either service or reset stored sync data. Resetting data removes saved sync state and credentials for the relevant service; reconnect when needed.

---

## Privacy and permissions

AL Additions runs on `anilist.co` and `myanimelist.net`. It contacts services needed for enabled features:

| Service                                        | Used for                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| `graphql.anilist.co`                           | AniList media/list data, sync, score editor, and related lookups. |
| `myanimelist.net`, `api.myanimelist.net`       | MAL account connection, list reading, and sync updates.           |
| `api.animethemes.moe`                          | OP/ED theme data.                                                 |
| `api.mangaupdates.com`, `www.mangaupdates.com` | Latest chapter counts for manga.                                  |
| `www.novelupdates.com`                         | Latest chapter counts for novels.                                 |
| `s4.anilist.co`                                | AniList-hosted images, such as banners.                           |

Settings, tokens, and caches are stored by your userscript manager. The script does not include analytics or tracking. The settings-only export excludes authentication credentials; credential exports are separate, explicitly confirmed, and password-protected.

The MAL connection uses OAuth with PKCE and a public client ID, so no client secret is embedded in the script. As with any userscript, install only software you trust and review the source before granting permissions.

---

## Troubleshooting

**The sync panel does not appear.** It appears on your own anime or manga list page when sync is enabled. Wait for AniList's sidebar to finish loading or reload the page.

**A title is skipped or has no confident MAL match.** The sync avoids uncertain matches. Correct the MAL entry, add a manual mapping, mark the title AniList-Only, or run Full resync as appropriate.

**A value is not accepted by MAL.** Check the log for the entry and field. Some rejected values may be suppressed to avoid repeated write attempts until the AniList entry changes or you run Full resync.

**The API limit is reached.** The sync should honour the cooldown and continue when possible.

**Fast Load or Tier Labels does not run.** Check that the feature is enabled. If the corresponding standalone userscript is installed, AL Additions pauses its built-in counterpart to avoid duplicate execution.

**A feature stopped working after an AniList update.** AniList sometimes changes its page layout. Please [open an issue](https://github.com/Daiya404/AL-Additions/issues) with the affected page and what happened.

---

## Reporting bugs or requesting features

Use [GitHub Issues](https://github.com/Daiya404/AL-Additions/issues). Please include your browser and userscript-manager versions, the affected site/page, what you expected, what happened, and relevant sync-log or console lines.

**Never include access tokens, authorization codes, backup files containing credentials, or other secrets.** See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

---

## Development

The project is published as the single userscript [`al-additions.user.js`](./al-additions.user.js). It uses shared core utilities and navigation/DOM observation, a feature/module registry, a generated settings panel, an AniList API client, and individual feature modules.

For a release:

1. Update `@version` in `al-additions.user.js`.
2. Add the release notes to [`CHANGELOG.md`](./CHANGELOG.md) and update the README version.
3. Push to `main`; Greasy Fork syncs from this repository.

Keep the userscript metadata (`@match`, `@grant`, `@connect`, `@license`, `@homepageURL`, `@downloadURL`, and `@updateURL`) consistent when publishing.

---

## Credits

AL Additions combines and builds on work by other authors. MALSync is an inspiration for the sync and episode/chapter and score embedding; its code is not copied. Features not credited below, including the Keyframe Staff List button and List Score & Progress Editor, are original work by Daiya.

| Who                                                            | Contribution                                                                                                                                                                | Original work                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Daiya](https://github.com/Daiya404)                           | Combining, fixing, extending, and maintaining AL Additions; original features including the Keyframe Staff List button, List Score & Progress Editor, and AniList Fast Load | [AL-Additions](https://github.com/Daiya404/AL-Additions); [AniList Fast Load](https://github.com/Daiya404/AL-Fast-Load)                                                                                                                                               |
| [Plennhar](https://greasyfork.org/en/users/1323916-plennhar)   | Browse Tag Rank Filter; Airing Progress Indicator                                                                                                                           | [Minimum tag percentage](https://greasyfork.org/en/scripts/559539-anilist-browse-set-default-minimum-tag-percentage-to-50); [Airing dots](https://greasyfork.org/en/scripts/563899-anilist-color-airing-dots-on-anime-lists-orange-if-the-user-is-behind-on-episodes) |
| [Morimasa](https://greasyfork.org/en/users/61126-morimasa)     | Anime OP/ED songs                                                                                                                                                           | [Anisongs](https://greasyfork.org/en/scripts/374785-anisongs)                                                                                                                                                                                                         |
| [Samu](https://greasyfork.org/en/users/17840-samu)             | Nyaa search link                                                                                                                                                            | [Find on Nyaa](https://greasyfork.org/en/scripts/379776-find-on-nyaa)                                                                                                                                                                                                 |
| [trevor229](https://greasyfork.org/en/users/158806-trevor229)  | Banner Downloader                                                                                                                                                           | [AniList Banner Downloader](https://greasyfork.org/en/scripts/370470-anilist-banner-downloader)                                                                                                                                                                       |
| [meatloaf1](https://greasyfork.org/en/users/1630083-meatloaf1) | Short AniList URLs                                                                                                                                                          | [Remove AniList titles from URL](https://greasyfork.org/en/scripts/589540-remove-anilist-titles-from-url)                                                                                                                                                             |
| [MALSync](https://github.com/MALSync)                          | Inspiration for sync and episode/chapter and score embedding                                                                                                                | [MALSync](https://github.com/MALSync/MALSync)                                                                                                                                                                                                                         |
| [MatiX221](https://github.com/MatiX221)                        | API-limit fix idea, modularisation, general fixes, Fast Load and Tier Labels integration/improvements, Compare View improvements, manual sync mappings, and backup/restore  | [MatiX221/AL-Additions](https://github.com/MatiX221/AL-Additions)                                                                                                                                                                                                     |
| [ercarp](https://greasyfork.org/en/users/1434372-ercarp)       | AniList Tier Labels                                                                                                                                                         | [AniList Tier Labels](https://greasyfork.org/en/scripts/526694-anilist-tier-labels)                                                                                                                                                                                   |
| Claude & ChatGPT                                               | AI assistance throughout consolidation, implementation, and fixes                                                                                                           | —                                                                                                                                                                                                                                                                     |

Theme data is provided by [AnimeThemes](https://animethemes.moe/). Chapter data comes from [MangaUpdates](https://www.mangaupdates.com/) and [NovelUpdates](https://www.novelupdates.com/).

---

## License

Released under the [GPL-3.0-or-later](./LICENSE) license.
