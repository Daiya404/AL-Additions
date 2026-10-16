# AL Additions

A feature-rich userscript for AniList and MyAnimeList, combining list tools, external links, anime utilities, and AniList → MyAnimeList synchronization.

- **Current source version:** `0.6.1`
- **Author:** Daiya
- **License:** GPL-3.0-or-later
- **Supported sites:** [AniList](https://anilist.co/) and [MyAnimeList](https://myanimelist.net/)

## Features

- **AniList → MyAnimeList sync** — one-way synchronization for anime and manga lists, with automatic sync options and score conversion settings.
- **Browse Tag Rank Filter** — apply a configurable minimum tag-rank percentage when browsing with tags or genres.
- **Short AniList URLs** — remove title slugs from supported AniList URLs.
- **Anime/Manga Banner Downloader** — download banner images from media pages, with optional user-profile banner support.
- **MyAnimeList & Nyaa links** — quick MAL links and Nyaa search shortcuts.
- **Keyframe Staff List links** — access Keyframe Staff List from supported AniList pages.
- **List Score & Progress Editor** — edit list scores and progress with the script's list tools.
- **Airing Progress Indicator** — show airing-progress indicators on supported pages.
- **Anime Opening & Ending Songs** — surface OP/ED song information.
- **Settings panel** — configure features and their options; settings are stored through the userscript manager.

Feature availability can depend on the page, the relevant service, and your settings.

## Installation

### Recommended: Greasy Fork

Install through the [AL Additions page on Greasy Fork](https://greasyfork.org/en/scripts/594705-al-additions). Your userscript manager should handle updates using the script's existing update metadata.

### Manual installation

1. Install a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Open [`AL Additions.user.js`](./AL%20Additions.user.js) from this repository.
3. Copy the file's contents into a new userscript in your manager and save it.
4. Visit AniList or MyAnimeList and open the script's settings or sync panel as needed.

Manual installation may not update automatically unless you configure an update source yourself. The script currently points to Greasy Fork for updates.

## AniList → MyAnimeList sync

The sync is designed as a **one-way AniList-to-MAL sync**. Review the sync panel and account connections before starting. Verify your lists after the first run, especially if your AniList and MAL entries differ.

The script uses the APIs of AniList and MyAnimeList. API availability, rate limits, account authorization, and changes made by either service may affect functionality.

## Settings

On AniList, open the settings page and look for **AL Additions**. On supported list pages, the sync panel provides sync status and actions. Some settings take effect after saving and reloading the page.

## Privacy and permissions

The script runs on AniList and MyAnimeList and makes requests to services used by its features, including the AniList GraphQL API, the MyAnimeList API, AniTheme, MangaUpdates, and Novel Updates. It uses the userscript manager's storage for settings, authentication state, and caches.

Authentication tokens and related state are stored in the userscript manager's storage. Use the script's disconnect/reset options when you want to clear its stored connection state. Only install scripts you trust, and review the source before granting permissions.

## Reporting bugs or requesting features

- Use [Issues](../../issues) to report a reproducible bug or suggest a feature.
- Include your browser, userscript manager, affected site/page, expected behaviour, and actual behaviour.
- For sync issues, include relevant error messages from the script's panel or browser console, but **never include access tokens, authorization codes, or other credentials**.

## Credits

The script's in-app credits acknowledge the following contributors and projects:

- Daiya — combining, fixing, and adding original features
- Claude & ChatGPT — AI assistance throughout consolidation and fixes
- Plennhar — Episode Dots, Anisong, and Minimum Tags
- Samu — Find on Nyaa
- DJ-TrainR3k — Banner Downloader
- Meatloaf1 — Remove Titles from URL
- MALSync — base MALSync, episode/chapter and score embedding
- Matix — API limit fix idea

See the in-app Credits section for the contribution descriptions.

## Development

The repository currently contains the complete installable userscript as a single file. The script uses a shared core, a feature/module registry, a settings registry, and API helpers.

Please keep the userscript metadata (`@version`, `@match`, `@grant`, `@connect`, `@license`, `@downloadURL`, and `@updateURL`) consistent with the release and distribution plan when publishing updates.
