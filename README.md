# AL Additions

**AL Additions** is a userscript that adds practical tools and quality-of-life improvements to [AniList](https://anilist.co/). It brings list management, optional performance enhancements, anime theme songs, quick links, and a one-way AniList-to-MyAnimeList (MAL) sync into one configurable script.

[**Install AL Additions**](https://raw.githubusercontent.com/Daiya404/AL-Additions/main/al-additions.user.js) · [Source code](https://github.com/Daiya404/AL-Additions) · [Report a problem](https://github.com/Daiya404/AL-Additions/issues)

| Project details                    |                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------- |
| **Current version**                | `0.8.2`                                                                |
| **Author**                         | [Daiya](https://github.com/Daiya404)                                   |
| **Recommended userscript manager** | [Violentmonkey](https://violentmonkey.github.io/)                      |
| **Alternative manager**            | [Greasemonkey](https://addons.mozilla.org/firefox/addon/greasemonkey/) |
| **License**                        | [GPL-3.0-or-later](https://www.gnu.org/licenses/gpl-3.0.html)          |

> **First setup:** Most enhancement modules are disabled by default on a clean install. After installing, open **AniList → Settings → AL Additions** and enable the features you want.

## Contents

- [What it includes](#what-it-includes)
- [Installation](#installation)
- [Getting started](#getting-started)
- [AniList-to-MAL sync](#anilist-to-mal-sync)
- [Backups and account security](#backups-and-account-security)
- [Settings and compatibility](#settings-and-compatibility)
- [Troubleshooting](#troubleshooting)
- [Privacy](#privacy)
- [Development](#development)
- [Credits](#credits)
- [License](#license)

## What it includes

AL Additions is modular: you can turn individual features on or off in its settings. The exact controls shown depend on the page and the module.

### List management and syncing

- **AniList → MyAnimeList sync** — manually or automatically add and update anime and manga entries on MAL. Anime and manga schedules can be configured separately.
- **Manual sync mappings and audit tools** — choose a specific MAL ID when automatic matching is wrong, mark entries as AniList-only, and review unmatched or potentially orphaned entries.
- **List Score & Progress Editor** — edit score and episode/chapter progress from an anime or manga page's sidebar.
- **Airing Progress Indicator** — show an orange dot for airing anime in your Watching list when your progress is behind the aired episode count.

### Browsing and performance

- **AniList Fast Load** — optional performance improvements such as lazy media handling, skipping off-screen list rows, request caching and deduplication, and batching observer work.
- **Browse Tag Rank Filter** — set a minimum tag-rank percentage when browsing with tags or genres.
- **AniList Tier Labels** — customise score tiers, ranges, and colours in supported list, card, browse, and comparison views.
- **Compare View Improvements** — sort comparison entries, filter by each user's status, and load more of the comparison list so filters can cover entries beyond the initially loaded rows.
- **Short AniList URLs** — remove title slugs from supported anime, manga, staff, and character URLs while preserving sub-page paths.

### Media and shortcuts

- **Anime Opening & Ending Songs** — view opening and ending themes on anime pages and play supported theme videos inline.
- **Song Search Providers** — customise the search services and shortcuts used by the theme-song feature, reorder providers, and import or export provider configuration.
- **MyAnimeList and Nyaa links** — open a title on MAL, or use Ctrl-click/Cmd-click on desktop or long-press on mobile to search Nyaa where supported.
- **Anime/Manga Banner Downloader** — add a download control to anime and manga banners; profile-banner downloading can be enabled optionally.
- **Keyframe Staff List links** — jump to the corresponding staff or studio page on Keyframe Staff List.

### Settings and maintenance

- **Backup & Restore** — export and import settings in a versioned backup format, with password-protected encryption options. Credential export is a separate operation and requires a password.
- **Developer Mode** — enable diagnostic logging for selected modules to help investigate issues.

## Installation

1. Install a userscript manager. **[Violentmonkey is recommended](https://violentmonkey.github.io/)**; [Greasemonkey](https://addons.mozilla.org/firefox/addon/greasemonkey/) is an alternative.
2. Open the [AL Additions install file](https://raw.githubusercontent.com/Daiya404/AL-Additions/main/al-additions.user.js).
3. Follow the prompt in your userscript manager to install the script.
4. Open [AniList](https://anilist.co/) and go to **Settings → AL Additions**.
5. Enable the modules you want to use and review their settings before relying on them.

The script includes update metadata pointing to the project's published userscript file, so your manager can check for updates.

## Getting started

After installation:

1. Open AniList settings and select **AL Additions**.
2. Browse the settings sections and enable only the modules you want.
3. Read the help text for any module that changes list data or communicates with another service.
4. If you're using AniList-to-MAL sync, connect your accounts and review the sync mode before running it.

If you are upgrading from an earlier release, check your settings after the update. Existing saved preferences are generally retained, while newly added settings use their own defaults. Clean installations start with most enhancement modules disabled.

## AniList-to-MAL sync

The sync is **one-way: AniList → MyAnimeList**. It does not sync changes from MAL back to AniList.

### Connect your accounts

Use the connection controls in AL Additions settings to connect AniList and MAL, then confirm that the displayed connection status is current before starting a sync. If you change account pairings, review the connection and reconnect if necessary.

### Choose the sync mode

**Update Only** is the safer choice if you want to preserve MAL entries that are no longer on AniList. It adds and updates matching entries but does not delete MAL entries simply because they were removed from AniList.

**Exact Match (Mirror)** aims to make MAL more closely match AniList. As part of that behaviour, removing an entry from AniList can result in the corresponding MAL entry being deleted. Safeguards exist, but this mode can still cause data loss if used unintentionally.

> **Important:** If you do not want AniList removals to trigger deletions on MAL, choose **Update Only**. Check the mode and back up your settings before enabling automatic sync.

### Automatic sync

Anime and manga have separate automatic-sync toggles and intervals. You can disable automatic syncing and continue to run a sync manually. If a run fails or encounters a rate limit, check its status and logs before repeatedly retrying.

### Manual mappings and audit

Use a manual mapping when the automatically selected MAL entry is incorrect. You can assign a specific MAL ID or mark an entry as **AniList-Only (Ignored)** so it is not synced. Audit tools help you find unmatched AniList entries and MAL entries that may be missing from AniList.

Review audit results carefully before taking a deletion action. Alternate titles, adaptations, and similarly named entries can make matching ambiguous; do not treat an uncertain match as confirmed without checking it.

## Backups and account security

AL Additions can export and import settings using a versioned `.settings` backup format. Password-protected settings backups use PBKDF2-derived AES-GCM encryption. The importer can also recognise supported legacy JSON/text and GZIP backup formats.

- A regular settings backup **does not include account credentials**.
- Credential/token export is a separate operation and **requires a password**.
- Keep backup files and passwords private. Unencrypted backups may expose their contents to anyone who can access the file.
- Import only files you trust, and export a backup of your current settings before importing another one.

A settings backup does not replace reviewing your sync mode or understanding its deletion behaviour.

## Settings and compatibility

### Defaults and upgrades

Most enhancement modules are disabled by default on a clean installation. After upgrading, review the settings and enable the features you want. Existing saved preferences are generally retained; newly introduced settings use their configured defaults.

### Standalone Fast Load and Tier Labels scripts

AL Additions can detect the standalone **AniList Fast Load** and **AniList Tier Labels** userscripts. If a standalone counterpart is detected, the built-in version pauses to avoid running both implementations at once. Your saved preference for the built-in module is retained and applies again if you remove the standalone script.

### Song search providers

The Anime Opening & Ending Songs module has configurable search providers and shortcuts. You can change which providers are available and their order, and import or export provider configuration. If a custom configuration stops working, review it or restore the defaults.

## Troubleshooting

### A feature is missing

1. Check that the module is enabled under **AniList → Settings → AL Additions**.
2. Confirm that you are on a page where the feature is supported.
3. Refresh AniList after changing settings.
4. If you use the standalone Fast Load or Tier Labels script, review the compatibility notes above.

### Sync does not run or matches the wrong entry

1. Confirm that both accounts are connected and the connection status is current.
2. Review the selected sync mode and the separate anime/manga automatic-sync settings.
3. Check manual mappings and the sync audit for entries that need attention.
4. Use **Update Only** if you do not want removals from AniList to delete corresponding MAL entries.

### A module appears to cause a problem

1. Temporarily disable the module and refresh the page to see whether the issue changes.
2. Re-enable only the affected module to narrow down the cause.
3. If needed, enable the relevant Developer Mode logging options and check the browser console.
4. Report reproducible problems through [GitHub Issues](https://github.com/Daiya404/AL-Additions/issues). Include the page, reproduction steps, expected behaviour, actual behaviour, and relevant console errors.

Do not include passwords, access tokens, or private account information in issue reports.

## Privacy

AL Additions runs in your browser on the supported sites and uses the site/API connections required by its features. Sync communicates with AniList and MyAnimeList to read list data and apply requested updates. Other modules may contact the external services they rely on, including AnimeThemes and search destinations. The script's source and userscript metadata list the declared connections and permissions.

Regular settings backups exclude credentials; credential exports are separate and password-protected. Treat tokens, account data, logs, and backup files as private, and redact them before sharing diagnostic information.

## Development

AL Additions is maintained as a modular TypeScript codebase and uses Vite with `vite-plugin-monkey` to build the distributable userscript. The source is organised into API, core, module, settings, and utility areas. The project workflow includes type-checking, CI checks, and version-bump tooling.

See the [GitHub repository](https://github.com/Daiya404/AL-Additions) for the current source tree and contribution workflow. When reporting a bug, include clear reproduction steps and avoid attaching secrets or personal account data.

## Credits

AL Additions brings together original work, fixes, and integrations from multiple contributors and prior userscripts. Thank you to everyone whose work helped shape it.

- **[Daiya](https://github.com/Daiya404)** — project consolidation, maintenance, fixes, standalone-script detection, and original features including AniList Fast Load, the Keyframe Staff List button, and List Score & Progress Editor.
- **[MatiX221](https://github.com/MatiX221)** — API-limit fix idea, modularisation, general fixes, Fast Load and Tier Labels integration and improvements, Compare View improvements, manual sync mappings, and backup/restore.
- **[Plennhar](https://greasyfork.org/en/users/1323916-plennhar)** — [Browse Tag Rank Filter](https://greasyfork.org/en/scripts/559539-anilist-browse-set-default-minimum-tag-percentage-to-50) and [Airing Progress Indicator](https://greasyfork.org/en/scripts/563899-anilist-color-airing-dots-on-anime-lists-orange-if-the-user-is-behind-on-episodes).
- **[Morimasa](https://greasyfork.org/en/users/61126-morimasa)** — [Anisongs](https://greasyfork.org/en/scripts/374785-anisongs), the anime opening/ending song feature.
- **[Samu](https://greasyfork.org/en/users/17840-samu)** — [Find on Nyaa](https://greasyfork.org/en/scripts/379776-find-on-nyaa), the Nyaa search link.
- **[trevor229](https://greasyfork.org/en/users/158806-trevor229)** — [AniList Banner Downloader](https://greasyfork.org/en/scripts/370470-anilist-banner-downloader).
- **[meatloaf1](https://greasyfork.org/en/users/1630083-meatloaf1)** — [Remove AniList titles from URL](https://greasyfork.org/en/scripts/589540-remove-anilist-titles-from-url), the short-URL feature.
- **[MALSync](https://github.com/MALSync/MALSync)** — inspiration for MAL syncing and episode/chapter and score embedding.
- **[ercarp](https://greasyfork.org/en/users/1434372-ercarp)** — [AniList Tier Labels](https://greasyfork.org/en/scripts/526694-anilist-tier-labels).
- **Claude and ChatGPT** — AI assistance throughout consolidation and fixes.

If you believe an attribution is missing or inaccurate, please open an issue in the repository.

## License

AL Additions is distributed under the **GNU General Public License v3.0 or later**. See the [license text](https://www.gnu.org/licenses/gpl-3.0.html).
