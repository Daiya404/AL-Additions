# Changelog

## 0.8.0

### Major changes

- **TypeScript and build-system refactor.** Reworked the project from a hand-maintained single-file script into a modular TypeScript codebase built with Vite and `vite-plugin-monkey`. The source is organised into API, core, module, settings and utility areas, then compiled into the distributable `al-additions.user.js`. The development workflow also gains type-checking, CI checks and version-bump tooling.
- **AniList Fast Load integrated.** The performance userscript is now available as a built-in module, with lazy media loading, off-screen row optimisation, batched observer work, GraphQL request caching and de-duplication, stale-cache fallback, and prefetching around navigation and likely route changes. Genre/tag taxonomy data is persistently cached for 24 hours; media-list data uses a short-lived in-memory cache with mutation invalidation.
- **AniList Tier Labels integrated.** Adds configurable score-tier badges across supported list, card, browse and comparison views. Tier ranges, labels and colours can be edited in a settings modal, and score-system detection handles AniList's different scoring formats in comparison views.
- **Enhancement modules now default to off.** On a clean install, enable the features you want from Settings. After updating, users who have never saved their settings may find features disabled because their defaults are now off. If you have already configured Settings, your saved choices are retained, while newly added settings start disabled. If the standalone Fast Load or Tier Labels userscript is detected, its built-in counterpart pauses to avoid duplicate execution; the saved built-in preference is retained.

### Compare View

- Added sorting by title, your score and the other user's score, with ascending/descending directions where applicable.
- Added status filters for both users, with live counts, and a compact dropdown layout for narrow/mobile screens.
- Added automatic full-list loading so comparisons and filters can account for entries beyond the initially loaded rows.
- Improved column hover highlighting for different background luminance and fixed score-system handling in comparison pages.

### AniList → MyAnimeList sync

- Added independent automatic-sync toggles and intervals for anime and manga.
- Added **Update Only** and **Exact Match (Mirror)** modes. Update Only leaves MAL entries alone when they are removed from AniList; Exact Match can remove corresponding MAL entries. In mirror mode, removals are queued with re-add protection, and automatic deletion has a safety limit/circuit breaker. Review the mode carefully before enabling it.
- Added **Manual Mappings & Sync Audit**: configure custom MAL ID mappings, mark entries as **AniList-Only (Ignored)**, inspect unmatched AniList titles and MAL entries missing from AniList, and selectively delete audited orphan entries after confirmation.
- Added live AniList previews and shortcuts to media pages in the mapping workflow. Stale metadata can be refreshed in batches, and audit results support filtering and retention/deletion actions.
- Added account connection and disconnection controls with visible AniList/MAL connection status in Settings.
- Improved account-pair change handling, settings/state migration and reset behaviour. Sync matching remains conservative: uncertain matches are not silently guessed.

### Settings, backup and diagnostics

- Reorganised Settings into grouped, collapsible sections and added controls for the expanded built-in modules.
- Added settings export/import using a versioned, compressed `.settings` backup format, with optional PBKDF2/AES-GCM password encryption. Credentials are handled separately from ordinary settings backups and can be included in a password-protected credential backup.
- Added **Developer Mode**, with separate controls for console diagnostics from Fast Load, Sync, Compare View, Media Info, Tier Labels and the core observer.
- Added recognised legacy-settings migration, including Tier Labels settings where supported, and import handling for supported legacy JSON/text and GZIP backups.
- Added bounded memoisation and shared helpers for settings, tab opening and common sync behaviour.

### Core and feature fixes

- Improved SPA navigation detection and batched DOM updates while ignoring the script's own UI changes, reducing redundant observer work.
- **Media Info:** show a Connect AniList prompt when logged out; update an entry's status when episode/chapter progress reaches its total; stop repeated render retries after the failure limit; prevent large episode/chapter numbers from clipping against sidebar stepper buttons.
- **Nyaa search:** open the destination tab directly from the user's click, avoiding popup blocking while the MAL ID is resolved asynchronously.
- **Anime OP/ED songs:** cache empty theme searches for 12 hours rather than retaining them for seven days, and debounce mutation-based UI repair.
- **Airing Progress Indicator:** handle rejected update batches to avoid unhandled promise rejections.
- **Manga matching:** account for title-length ratio and raise the minimum match threshold to reduce false-positive MangaUpdates matches.
- **Settings:** clamp and round numeric inputs, improve validation of imported settings, and fix stale rate-limit countdown timers.
- **Short AniList URLs:** strip a title slug only when it is the final path segment, preserving sub-pages such as `/characters`.
- **Tier Labels:** refresh badges when AniList re-renders or changes a score, and throttle page scans.
- **Userscript metadata:** standardised source, homepage, support, download and update metadata, and added the grants needed by the updated implementation.

### Existing features retained

Browse Tag Rank Filter; Short AniList URLs; Anime/Manga Banner Downloader; MyAnimeList and Nyaa links; Keyframe Staff List links; List Score & Progress Editor; Airing Progress Indicator; Anime OP/ED songs; and one-way AniList → MAL sync.

> **Upgrade notes:** Because feature defaults are now off, an update may disable features for users who have never saved their Settings. If you have previously configured Settings, your existing choices are retained and newly added settings start off. Check Settings after updating and re-enable anything you want to use. If you also have either standalone Fast Load or Tier Labels installed, AL Additions detects it and pauses the built-in counterpart. In **Exact Match (Mirror)** mode, removing an entry from AniList may result in its deletion from MAL; use **Update Only** if you do not want that behaviour. Keep encrypted backups and credentials private.

## 0.7.2

- Credits rewritten: every contributor now links to their profile, and each borrowed feature links to the original script or repository.
- Credits corrected: Anisongs is credited to Morimasa, the Banner Downloader to trevor229 (previously listed as DJ-TrainR3k), and MatiX221 is listed under the correct name.
- MALSync is credited as inspiration for the sync and the episode/chapter and score embedding, not as copied code.
- The credits note that everything not credited, such as the Keyframe Staff List button and the List Score & Progress Editor, is original work.
- Script `@homepageURL` now points to the GitHub repository.

## 0.7.1

- Full code review. No functional bugs found in the sync, rate limiting, caching or feature modules, so none of that code was changed.
- Settings panel: the AniList Fast Load row now stacks vertically on narrow screens, so the button no longer squeezes the text.
- Settings panel: the Fast Load link has a descriptive accessible label for screen readers.
- Code: fixed a misplaced comment above the credits list.

## 0.7.0

- New: a "Get it" button in the settings panel that opens the Greasy Fork page of AniList Fast Load, the companion performance userscript. The row is hidden automatically when Fast Load is already installed.
- Adds the `unsafeWindow` grant, used only to detect Fast Load; the button itself is a plain link opened in a new tab and makes no network requests.

## 0.6.2

- Release workflow: GitHub is now the source of truth; Greasy Fork syncs from this repository.
- Update metadata now points to the GitHub raw file (Greasy Fork replaces it with its own URLs on its hosted copy).
- README installation instructions corrected.

## 0.6.1

- Initial version tracked in this repository.
- See the userscript source and Greasy Fork release history for the full feature and change history.
