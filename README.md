# AL Additions

A userscript that adds extra tools to [AniList](https://anilist.co/), including a one-way **AniList → MyAnimeList sync**, a score and progress editor, airing indicators, OP/ED songs and quick links to other sites.

- **Version:** 0.8.0 ([changelog](./CHANGELOG.md))
- **License:** GPL-3.0-or-later
- **Author:** Daiya
- **Runs on:** [anilist.co](https://anilist.co/) and [myanimelist.net](https://myanimelist.net/) (the MAL site is used for connecting your account)
- **Needs:** a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)

---

## Why this exists

I wanted these features without the slowdown. In my experience the MALSync browser extension made AniList load very slowly, and some userscripts I relied on, such as Morimasa's Anisongs and Plennhar's airing dots, had stopped working. So I updated and fixed the broken ones, wrote the sync "myself", and combined everything into one script that shares a single page observer to stay light.

**AI disclosure:** a lot of AI was involved. Much of the code, including the sync, was written with heavy help from Claude and ChatGPT. I direct the work, test it and maintain it.

---

## Contents

- [AL Additions](#al-additions)
    - [Why this exists](#why-this-exists)
    - [Contents](#contents)
    - [Features](#features)
        - [Feature details](#feature-details)
    - [Installation](#installation)
        - [Alternative: install directly from GitHub](#alternative-install-directly-from-github)
    - [AniList → MyAnimeList sync](#anilist--myanimelist-sync)
        - [Connecting your accounts](#connecting-your-accounts)
        - [Using it](#using-it)
        - [How it works](#how-it-works)
        - [Disconnecting and resetting](#disconnecting-and-resetting)
    - [Settings](#settings)
    - [Privacy and permissions](#privacy-and-permissions)
    - [Troubleshooting](#troubleshooting)
    - [Reporting bugs or requesting features](#reporting-bugs-or-requesting-features)
    - [Development](#development)
    - [Credits](#credits)
    - [License](#license)

---

## Features

Every feature can be turned on or off in the settings panel.

| Feature                          | What it does                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **AniList → MAL sync**           | One-way sync of your anime and manga lists to MyAnimeList, manual or automatic.                                                                                                      |
| **Browse Tag Rank Filter**       | Automatically adds a minimum tag-rank percentage (default 50%) when you browse with a tag or genre.                                                                                  |
| **Short AniList URLs**           | Removes the title slug from anime, manga, staff and character URLs and links.                                                                                                        |
| **Banner Downloader**            | Adds a download button to the banner on anime and manga pages. User profile banners are optional.                                                                                    |
| **MyAnimeList & Nyaa links**     | A link icon next to the title opens the MAL page. Ctrl/Cmd+click on desktop, or long-press on mobile, searches Nyaa instead.                                                         |
| **Keyframe Staff List links**    | A button on staff and studio pages that opens the same person or studio on Keyframe Staff List.                                                                                      |
| **List Score & Progress Editor** | Edit your score and episode/chapter progress from the sidebar of any anime or manga page.                                                                                            |
| **Airing Progress Indicator**    | Shows an orange dot on releasing shows in your _Watching_ list when you are behind the aired episode count.                                                                          |
| **Anime OP/ED songs**            | Lists opening and ending themes on anime pages. Click a song to play its video inline.                                                                                               |
| **Settings panel**               | One place to configure everything, including a mobile-friendly layout. Includes a button linking to [AniList Fast Load](https://greasyfork.org/en/scripts/598442-anilist-fast-load). |

### Feature details

**Browse Tag Rank Filter**  
Applies only on the anime and manga search pages, and only once a tag or genre is selected. The minimum rank is configurable (1–100).

**MyAnimeList & Nyaa links**  
The Nyaa search is sorted by seeders and highlights your chosen release groups. The default groups are SubsPlease and ToonsHub, and you can change them in settings.

**List Score & Progress Editor**  
Works with whichever score format your AniList account uses (100 point, 10 point, 10 point decimal, 5 star or 3 smiley). The +/− buttons only change the field; nothing is saved until you press **Save**. Saving the last episode or chapter marks the entry as completed, and it does not overwrite an existing completion date. For manga and novels, the released chapter count is looked up from MangaUpdates or NovelUpdates.

**Airing Progress Indicator**  
Only entries in the _Watching_ section of your anime list are checked, and the data is cached to keep requests low.

**Anime OP/ED songs**  
Theme data comes from [AnimeThemes](https://animethemes.moe/) and is cached for 7 days.

---

## Installation

1. Install a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Install the script from **[Greasy Fork](https://greasyfork.org/en/scripts/594705-al-additions)**.
3. Open AniList. The features are active straight away, and the settings are described [below](#settings).

Releases are published on GitHub first, and Greasy Fork syncs from this repository. Your userscript manager updates the script automatically.

### Alternative: install directly from GitHub

Open the [raw script file](https://raw.githubusercontent.com/Daiya404/AL-Additions/main/al-additions.user.js). Your userscript manager will offer to install it and will check GitHub for updates.

Use either Greasy Fork or GitHub, not both, to avoid running two copies.

---

## AniList → MyAnimeList sync

The sync is **one-way**: it copies your AniList lists to MyAnimeList and never writes anything back to AniList.

### Connecting your accounts

1. Open **your own** anime or manga list on AniList. The sync panel appears in the sidebar, below the random-entry button or the Sort control. It is not shown on other people's lists.
2. Press **Connect AniList** and approve access in the tab that opens.
3. Press **Connect MyAnimeList** and approve access in the tab that opens.
4. If a connection doesn't complete, use **Trouble connecting?** to paste a token or authorization code by hand.

### Using it

| Control                          | Action                                                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Sync**                         | Syncs the list you are viewing, or both lists if you are not on a list page.                                                             |
| **Full resync** (circular arrow) | Re-checks your entire AniList library against MAL and clears cached match and suppression decisions. Use it after fixing entries on MAL. |
| **Stop** (square)                | Stops a running sync after the current requests finish.                                                                                  |
| **Logs** (list icon)             | Shows a running activity log.                                                                                                            |

The first manual sync for each list asks for confirmation if your AniList account uses **decimal scores**, because MAL only accepts whole numbers.

**Automatic sync** starts only after you have run a manual sync for both anime and manga at least once. It then runs at your chosen interval (default 6 hours, minimum 1 hour) while an AniList or MAL tab is open. After a failed run it retries about 10 minutes later.

### How it works

- **Minimal writes.** The script reads your MAL list on every run and only sends fields that differ, so entries already in sync cost no requests.
- **Incremental runs.** Normal runs read only the AniList entries changed since the last successful run. A full comparison runs weekly and on **Full resync**, which also catches edits made on the MAL side.
- **Safe matching.** MAL IDs come from AniList's own mapping first, then from titles already in your MAL list, then from a MAL search. A search result is only used if a title matches exactly and the start year agrees. Ambiguous or uncertain titles are skipped and reported in the log rather than guessed.
- **Completed entries.** MAL's own episode or chapter total is used when MAL publishes one, so counts stay consistent. If MAL has no total, the highest known count is kept.
- **Nothing gets wiped.** An unscored AniList entry doesn't remove a MAL score, and start or finish dates are only sent when complete (year, month and day). Notes are sent to MAL's comments field, trimmed to 2000 characters.
- **Rate-limit friendly.** Requests are paced by an adaptive limiter that slows down on rate-limit responses and honours cooldowns across tabs. A circuit breaker pauses writes after repeated MAL failures, and a lock stops two tabs from syncing at once.
- **Account switches.** If you connect a different AniList or MAL account, the stored sync watermarks are reset automatically.

### Disconnecting and resetting

Your userscript manager's menu for this script has three commands:

- **Reset all data**: removes tokens, sync state and caches.
- **Disconnect AniList**
- **Disconnect MAL**

> Verify your lists after the first run, especially if your AniList and MAL entries differ a lot. The sync is one-way and will overwrite differing values on MAL with the AniList values.

---

## Settings

- **On desktop:** go to AniList → **Settings** and open **AL Additions** → **Settings** in the sidebar.
- **On mobile or narrow screens:** open AniList Settings and use the floating **AL Additions** button.

Each feature has a toggle, and some have options:

| Setting                  | Default              | Notes                                                                                                        |
| ------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------ |
| Minimum Tag Rank         | 50                   | 1–100.                                                                                                       |
| User Profile Banners     | Off                  | Show the banner download button on profile banners too.                                                      |
| Nyaa Search Providers    | SubsPlease, ToonsHub | Comma-separated release group names.                                                                         |
| Automatic Sync Interval  | 6 hours              | 1–720 hours.                                                                                                 |
| Decimal Score Conversion | Round                | **Ceil** rounds up (7.4 → 8), **Round** rounds normally (7.4 → 7, 7.5 → 8), **Floor** rounds down (7.9 → 7). |

The panel also has a **Get it** button for [AniList Fast Load](https://greasyfork.org/en/scripts/598442-anilist-fast-load), my separate performance userscript (lazy media, request caching, smoother scrolling). It only opens the Greasy Fork page in a new tab, and it disappears once Fast Load is installed. It is optional, and AL Additions works the same without it.

Changes apply when you press **Save and reload**. **Reset to defaults** restores the defaults in the panel, and you still need to press Save.

---

## Privacy and permissions

The script runs on `anilist.co` and `myanimelist.net`. It contacts only the services its features need:

| Service                                        | Used for                                                 |
| ---------------------------------------------- | -------------------------------------------------------- |
| `graphql.anilist.co`                           | Reading media and your list; the sync; the score editor. |
| `myanimelist.net`, `api.myanimelist.net`       | Connecting and syncing your MAL list.                    |
| `api.animethemes.moe`                          | OP/ED song data.                                         |
| `api.mangaupdates.com`, `www.mangaupdates.com` | Latest chapter counts for manga.                         |
| `www.novelupdates.com`                         | Latest chapter counts for novels.                        |
| `s4.anilist.co`                                | AniList-hosted images such as banners.                   |

Settings, tokens and caches are stored in your userscript manager's storage and are not sent anywhere else. There is no analytics or tracking.

The AniList Fast Load button in settings and Nyaa and Keyframe Staff List are only opened as links in a new tab when you click them; the script doesn't make background requests to them.

The MAL connection uses the OAuth PKCE flow with a public client ID, so there is no client secret in the script. As with any userscript, only install scripts you trust and read the source before granting permissions.

---

## Troubleshooting

**The sync panel doesn't appear.**  
It only shows on **your own** anime or manga list page and only while the sync feature is enabled. AniList loads the sidebar late, so wait a moment or reload.

**A title wasn't synced ("no confident MAL match").**  
The script skips titles it can't match safely. Add or fix the entry on MAL, then run **Full resync**.

**MAL keeps rejecting or not keeping a value.**  
The log will say which entry and field. Those values are suppressed to avoid a write loop until the AniList entry changes or you run **Full resync**.

**"API limit reached" appears.**  
This is normal. The script waits for the cooldown and carries on by itself.

**Connection broke or looks stuck.**  
Use the **Disconnect** menu commands and connect again, or use **Reset all data**.

**A feature stopped working after an AniList update.**  
AniList changes its page layout from time to time. Please [open an issue](https://github.com/Daiya404/AL-Additions/issues) with the page and what you saw.

---

## Reporting bugs or requesting features

Use [Issues](https://github.com/Daiya404/AL-Additions/issues). Please include:

- your browser and userscript manager (with versions),
- the affected site and page,
- what you expected and what happened,
- for sync problems, the relevant lines from the sync log or browser console.

**Never include access tokens, authorization codes or other credentials.** See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

---

## Development

The project is written in **TypeScript** and bundled using **Vite** with [`vite-plugin-monkey`](https://github.com/lisonge/vite-plugin-monkey).

### Project structure

```text
src/
├── api/             # API clients (AniList GraphQL, MAL REST/OAuth, external chapter scrapers)
├── core/            # Navigation listener, DOM MutationObserver, module registry
├── modules/         # Standalone feature modules
│   └── sync/        # AniList → MAL sync engine, reconciliation, and UI panel
├── settings/        # Feature settings registry, storage normalization, and modal UI
├── utils/           # Shared utilities (rate limiter, DOM helpers, string matching)
├── types.ts         # Shared TypeScript interfaces
└── main.ts          # Script bootstrap entry point
```

### Setup & Commands

```bash
# Install dependencies
npm install

# Start Vite dev server (requires CSP bypass on AniList)
npm run dev

# Continuous build on file change (recommended for local testing)
npm run watch

# Type-check and build production bundle
npm run build
```

### Release routine

The production build compiles the code through TypeScript and Vite into `dist/al-additions.user.js`, then automatically copies the output to the root `al-additions.user.js` so Greasy Fork and GitHub raw URLs stay up to date.

1. Run `npm run bump -- patch`, `npm run bump -- minor`, or `npm run bump -- major`. This updates the package metadata; `vite.config.ts` reads the package version directly, then the script type-checks and rebuilds the userscript.
2. Add an entry to [`CHANGELOG.md`](./CHANGELOG.md) and update the version near the top of this README.
3. Review the generated `al-additions.user.js` and the complete diff.
4. Commit your changes and push to `main`. Greasy Fork syncs automatically from this repository.

Use the bump script for releases instead of editing version fields manually, so all package and userscript metadata stay synchronized. Always bump the version, otherwise userscript managers will not prompt users to update.

---

## Credits

AL Additions combines and builds on the work of these authors, and is inspired by MALSync (its code is not copied). Everything not credited here, such as the Keyframe Staff List button and the List Score & Progress Editor, is original work by Daiya. The same list is available in the settings panel.

| Who                                                            | What                                                                          | Original work                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Daiya](https://github.com/Daiya404)                           | Combining, fixing and maintaining this script                                 | [AL-Additions](https://github.com/Daiya404/AL-Additions)                                                                                                                                                                                                              |
| [Plennhar](https://greasyfork.org/en/users/1323916-plennhar)   | Browse Tag Rank Filter, Airing Progress Indicator                             | [Minimum tag percentage](https://greasyfork.org/en/scripts/559539-anilist-browse-set-default-minimum-tag-percentage-to-50), [Airing dots](https://greasyfork.org/en/scripts/563899-anilist-color-airing-dots-on-anime-lists-orange-if-the-user-is-behind-on-episodes) |
| [Morimasa](https://greasyfork.org/en/users/61126-morimasa)     | Anime OP/ED songs                                                             | [Anisongs](https://greasyfork.org/en/scripts/374785-anisongs)                                                                                                                                                                                                         |
| [Samu](https://greasyfork.org/en/users/17840-samu)             | Nyaa search link                                                              | [Find on Nyaa](https://greasyfork.org/en/scripts/379776-find-on-nyaa)                                                                                                                                                                                                 |
| [trevor229](https://greasyfork.org/en/users/158806-trevor229)  | Banner Downloader                                                             | [AniList Banner Downloader](https://greasyfork.org/en/scripts/370470-anilist-banner-downloader)                                                                                                                                                                       |
| [meatloaf1](https://greasyfork.org/en/users/1630083-meatloaf1) | Short AniList URLs                                                            | [Remove AniList titles from URL](https://greasyfork.org/en/scripts/589540-remove-anilist-titles-from-url)                                                                                                                                                             |
| [MALSync](https://github.com/MALSync)                          | Inspiration for the MAL sync, and for the episode/chapter and score embedding | [MALSync](https://github.com/MALSync/MALSync)                                                                                                                                                                                                                         |
| [MatiX221](https://github.com/MatiX221)                        | API limit fix idea, modularising refactor                                     | [MatiX221/AL-Additions](https://github.com/MatiX221/AL-Additions)                                                                                                                                                                                                     |
| Claude & ChatGPT                                               | AI assistance throughout consolidation and fixes                              |                                                                                                                                                                                                                                                                       |

Theme data is provided by [AnimeThemes](https://animethemes.moe/). Chapter data comes from [MangaUpdates](https://www.mangaupdates.com/) and [NovelUpdates](https://www.novelupdates.com/).

---

## License

Released under the [GPL-3.0-or-later](./LICENSE) license.
