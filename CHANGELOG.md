# Changelog

All notable changes to AL Additions are listed here, newest first.

Each version groups changes under **Added**, **Changed** and **Fixed**. Larger releases also include **Highlights** and **Upgrade notes**.

---

## 0.9.0

### Highlights

- **No more AniList connection step.** AL Additions now uses the AniList account you're already logged into in your browser. There is no "Connect AniList" button or authorization tab anymore. If you're logged in, everything just works. If not, you'll see a "Log in to AniList" prompt.
- **Faster, smarter data loading.** Recently loaded AniList data is now reused instead of requested again. Features load faster and you're less likely to hit AniList's rate limits. Syncs always fetch fresh data, so results stay accurate.

### Added

- **Compare View:** a clear message when you and the other user have nothing in common.
- **Developer Mode:** an **Export Raw JSON** option for troubleshooting. It is unencrypted and includes your MAL credentials, so keep that file private.

### Changed

- **Compare View:** both lists are now loaded in full and the comparison table is built for you, instead of scrolling the page to load more entries. Sorting and status filters apply to the whole list, and the sidebar shows a loading indicator.
- **Sync:** now runs only on AniList pages, since it relies on your AniList login. MyAnimeList's site is still used to connect your MAL account.
- **Sync panel:** shows what's needed next, either "Log in to AniList" or "Connect MyAnimeList".
- **Settings:** Connected Accounts now lists only MyAnimeList.
- **Backups:** AniList login details are no longer included. Older backups that contain them still import fine; those values are ignored.
- **Tier Labels:** "Show on Average & Mean scores" is now **"Show on Weighted Score"** and only affects the Weighted Score. It is off by default.

### Fixed

- **Updates:** update checks now correctly come from GitHub instead of Greasy Fork, as intended since 0.6.2. This was missing in 0.8.2.
- **Compare View:** if the full list can't be loaded, it falls back to AniList's original table instead of breaking.
- **Fast Load:** improved reliability when switching between users' lists, and it no longer prefetches lists on compare pages.
- **Media Info:** shows a clearer message if your AniList session can't be verified, and rechecks automatically after you log in.

### Upgrade notes

- You don't need to reconnect AniList. Just make sure you're logged in to AniList in the same browser. Any previously stored AniList token is removed automatically.
- If you had "Show on Average & Mean scores" on for Tier Labels, check Settings. The renamed Weighted Score option starts off.

---

## 0.8.2

### Added

- **Sync Overrides:** an **Import / Export** tab in the Manual Mappings window, with a raw JSON editor, validation, one-click copy to clipboard, and the choice to replace or merge mappings.
- **Anime Themes & Songs:** customizable search shortcut icons next to each OP/ED song, with links to YouTube, Spotify, Apple Music, AniPlaylist and more.
- **Anime Themes & Songs:** a template-based search link system supporting details such as `{title}`, `{artist}`, `{anime}`, native Japanese titles, release year, season and theme codes like `{theme}`.
- **Anime Themes & Songs:** a settings window for reordering active shortcuts, creating custom presets, and importing or exporting them as JSON.

### Changed

- **Title Matching:** titles are now scored using whole-word checks and token similarity, so a base franchise title no longer outranks a specific sequel or sub-arc.

### Fixed

- **Title Matching:** punctuation such as semicolons, slashes and hyphens is now handled properly, so titles like **Steins;Gate** and **Fate/stay night** match consistently across sources.
- **Sync Overrides:** long titles no longer cause sideways scrolling in the Overrides and Sync Audit windows. Titles are shortened with an ellipsis, and the full title shows on hover.

---

## 0.8.1

### Changed

- **Compare View:** the automatic list loading limit is raised to 100 pages (about 3,000 entries).

### Fixed

- **Compare View:** the status filter now hides rows correctly. A styling conflict had been preventing it, and the related classes are now cleaned up properly when leaving the page.

---

## 0.8.0

### Highlights

- **Rebuilt from the ground up.** The script was reorganized from a single hand-maintained file into a modular TypeScript project built with Vite. The release file is generated from it, and development now includes type-checking, automated checks and version-bump tooling.
- **AniList Fast Load is now built in.** Includes lazy media loading, off-screen row optimization, batched page updates, request caching and de-duplication, stale-cache fallback, and prefetching around navigation. Genre and tag data is cached for 24 hours. Media-list data is cached briefly in memory and cleared whenever you make a change.
- **AniList Tier Labels is now built in.** Adds configurable score-tier badges to lists, cards, browse and comparison views. Tier ranges, labels and colors can be edited in Settings, and AniList's different scoring formats are detected automatically.
- **Features are now off by default.** On a clean install, turn on the features you want in Settings. See the upgrade notes below.

### Added

**Compare View**

- Sorting by title, your score, or the other user's score, in ascending or descending order.
- Status filters for both users, with live counts and a compact dropdown on narrow and mobile screens.
- Automatic full-list loading, so comparisons and filters include entries beyond the first rows shown.

**AniList → MyAnimeList sync**

- Separate automatic-sync toggles and intervals for anime and manga.
- **Update Only** and **Exact Match (Mirror)** sync modes. Update Only leaves MAL entries alone when you remove them from AniList. Exact Match can remove the matching MAL entries. In Exact Match, removals are queued with protection against accidental re-adds, and automatic deletion has a safety limit.
- **Manual Mappings & Sync Audit:**
  - Set custom MAL ID mappings.
  - Mark entries as **AniList-Only (Ignored)**.
  - Review unmatched AniList titles and MAL entries missing from AniList.
  - Delete orphaned MAL entries after confirmation.
  - Live AniList previews and shortcuts to media pages, batch refresh of outdated info, and filtering of audit results.
- Account connect and disconnect controls, with connection status shown in Settings.

**Settings, backup and diagnostics**

- Settings are now grouped into collapsible sections, with controls for all built-in modules.
- Settings export and import using a compressed `.settings` backup, with optional password encryption. Credentials are kept separate from normal backups and can be included in a password-protected backup.
- **Developer Mode** with separate console logging for Fast Load, Sync, Compare View, Media Info, Tier Labels and the core page observer.
- Automatic migration of recognized older settings, including Tier Labels settings, and support for importing older JSON, text and GZIP backups.

### Changed

- **Compare View:** improved column hover highlighting for different background brightness, and fixed score-format handling on comparison pages.
- **Sync:** account changes, settings migration and resets are handled more carefully. Matching stays conservative, so uncertain matches are never guessed.
- **Page updates:** improved navigation detection and batched updates, and the script now ignores its own interface changes, reducing unnecessary work.
- **Anime OP/ED songs:** empty theme searches are now remembered for 12 hours instead of seven days, and interface repairs are debounced.
- **Manga matching:** title length is now considered and the minimum match threshold is higher, reducing wrong MangaUpdates matches.
- **Script info:** standardized source, homepage, support, download and update links, and added the permissions needed by the new features.

### Fixed

- **Media Info:** shows a Connect AniList prompt when logged out, updates an entry's status when progress reaches the total, stops endlessly retrying after repeated failures, and no longer clips large episode or chapter numbers against the stepper buttons.
- **Nyaa search:** the search tab now opens directly from your click, so browsers no longer block it while the MAL ID is looked up.
- **Airing Progress Indicator:** failed update requests no longer cause unhandled errors.
- **Settings:** number inputs are clamped and rounded, imported settings are validated more thoroughly, and stale rate-limit countdowns are fixed.
- **Short AniList URLs:** the title is removed only when it is the last part of the address, so sub-pages like `/characters` keep working.
- **Tier Labels:** badges refresh when AniList re-renders a page or a score changes, and page scans are throttled.

### Existing features retained

Browse Tag Rank Filter, Short AniList URLs, Anime/Manga Banner Downloader, MyAnimeList and Nyaa links, Keyframe Staff List links, List Score & Progress Editor, Airing Progress Indicator, Anime OP/ED songs, and one-way AniList → MAL sync.

### Upgrade notes

- Because features now default to off, an update may disable features for users who have never saved their Settings. If you've already configured Settings, your choices are kept and newly added options start off. Check Settings after updating and re-enable anything you want.
- If the standalone Fast Load or Tier Labels script is installed, AL Additions detects it and pauses its own version. Your saved preference is kept.
- In **Exact Match (Mirror)** mode, removing an entry from AniList may delete it from MAL. Use **Update Only** if you don't want that.
- Keep encrypted backups and credentials private.

---

## 0.7.2

### Changed

- **Credits:** rewritten so every contributor links to their profile and each borrowed feature links to the original script or repository.
- **Credits:** MALSync is credited as inspiration for the sync and for the episode/chapter and score embedding, not as copied code.
- **Credits:** added a note that everything not credited, such as the Keyframe Staff List button and the List Score & Progress Editor, is original work.
- **Script info:** `@homepageURL` now points to the GitHub repository.

### Fixed

- **Credits:** Anisongs is now credited to Morimasa, the Banner Downloader to trevor229 (previously listed as DJ-TrainR3k), and MatiX221 is listed under the correct name.

---

## 0.7.1

### Changed

- Full code review. No functional bugs were found in the sync, rate limiting, caching or feature modules, so none of that code was changed.

### Fixed

- **Settings:** the AniList Fast Load row now stacks vertically on narrow screens, so the button no longer squeezes the text.
- **Settings:** the Fast Load link now has a descriptive accessible label for screen readers.
- **Code:** fixed a misplaced comment above the credits list.

---

## 0.7.0

### Added

- **Settings:** a "Get it" button that opens the Greasy Fork page for AniList Fast Load, the companion performance script. The row is hidden automatically if Fast Load is already installed.
- Added the `unsafeWindow` permission, used only to detect Fast Load. The button is a plain link that opens in a new tab and makes no network requests.

---

## 0.6.2

### Changed

- **Releases:** GitHub is now the source of truth, and Greasy Fork syncs from this repository.
- **Updates:** update links now point to the GitHub raw file (Greasy Fork replaces them with its own on its hosted copy).

### Fixed

- **README:** installation instructions corrected.

---

## 0.6.1

- Initial version tracked in this repository.
- See the userscript source and Greasy Fork release history for the full earlier history.
