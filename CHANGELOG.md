# Changelog

## 0.8.0

- **Modular TypeScript Refactor**: Migrated the entire codebase to TypeScript and modularized it using Vite with `vite-plugin-monkey`. Split the monolithic script into structured directories (`src/api`, `src/core`, `src/modules`, `src/settings`, `src/utils`), with static type-checking, bundle compilation (`al-additions.user.js`), automated CI testing, and version bump tooling.
- **AniList Fast Load**: Integrated as a built-in module (lazy media loading, off-screen row skipping via content-visibility, MutationObserver coalescing, safe GraphQL cache and de-duplication with stale fallback, navigation prefetch, and reload early-request start).
- **AniList Tier Labels**: Integrated as a built-in module adding tier badges (S+, S, A, B, etc.) to scores across list, card, browse, and compare views. Features an interactive in-settings modal editor for custom score ranges, labels, and color pickers. Includes smart scoring system detection that permanently fixes the list comparison (`/animelist/compare` and `/mangalist/compare`) view.
- **Compare View Improvements**: Added interactive sorting and status filtering to list comparison pages (`/animelist/compare` and `/mangalist/compare`). Sort by Title (A-Z / Z-A), Your Score, or Other User's Score (high-to-low / low-to-high) with directional arrow indicators. Features dual-user status filtering checkboxes (Completed, Planning, Current, Paused, Dropped) with real-time counts, automatic background full-list loading, luminance-adaptive column hover highlighting, and a collapsible mobile dropdown.
- **Settings Backup & Restore**: Added export and import of settings to `.settings` files, compressed with Gzip stream compression and optional PBKDF2/AES-GCM password encryption. Sensitive credentials (tokens) can optionally be included in encrypted backups.
- **Account Management**: Added dedicated Connect/Disconnect management buttons and live status indicators for AniList and MyAnimeList directly in the settings panel.
- **Sync Enhancements**: Separated anime and manga auto-sync into independent toggles and sync intervals (min 1h). Added **Sync Mode** setting ("Update Only" vs. "Exact Match (Mirror)") with a safe pending deletions queue that catches UI deletions with re-add protection and automated full compare sync with panic circuit breaker protection.
- **Default State**: All enhancement modules are now disabled by default on clean installations.
- **Core Observer Hardening**: Patched `history.pushState` and `replaceState` on `unsafeWindow` with 50ms mutation batching while filtering out the script's own UI mutations.
- **Bug Fixes & Improvements**:
    - Media Info: show a "Connect AniList" prompt when logged out instead of an inactive editor; automatically update entry status when episode/chapter reaches total count; stop rescheduling renders after max failures.
    - Nyaa search: open tabs synchronously on click to prevent browser popup blockers during asynchronous MAL ID resolution.
    - Anisongs: cache empty theme queries for 12 hours instead of 7 days; debounced mutation repair listener.
    - Airing Dots: added rejection handling in update batches to prevent unhandled promise rejections.
    - Manga Matching: scaled substring matching score by length ratio and raised minimum threshold to 70 to eliminate false positive MangaUpdates matches.
    - Settings: enforced numeric bounds clamping and integer rounding on number inputs, hardened JSON setting validation, and prevented stale rate-limit countdown timers.
    - Short URLs: only strip the slug when it is the last path segment, so sub-pages such as `/characters` keep working.
    - Tier Labels: badges refresh when AniList re-renders a score or changes its score attribute, and page scans are throttled.
    - Settings Backup: exporting credentials now requires a password.
    - Internal: bounded memo cache, deduplicated sync constants, and consistent auth errors.

## 0.7.2

- Credits rewritten: every contributor now links to their profile, and each borrowed feature links to the original script or repository.
- Credits corrected: Anisongs is credited to Morimasa, the Banner Downloader to trevor229 (previously listed as DJ-TrainR3k), and Matix is now listed as MatiX221.
- MALSync is credited as inspiration for the sync and the episode/chapter and score embedding, not as copied code.
- The credits note that everything not credited, such as the Keyframe Staff List button and the List Score & Progress Editor, is original work.
- Script `@homepageURL` now points to the GitHub repository.

## 0.7.1

- Full code review. No functional bugs found in the sync, rate limiting, caching or feature modules, so none of that code was changed.
- Settings panel: the AniList Fast Load row now stacks vertically on narrow screens, so the button no longer squeezes the text.
- Settings panel: the Fast Load link has a descriptive accessible label for screen readers.
- Code: fixed a misplaced comment above the credits list.

## 0.7.0

- New: a "Get it" button in the settings panel that opens the Greasy Fork page of AniList Fast Load, my companion performance userscript. The row is hidden automatically when Fast Load is already installed.
- Nothing else changed; adds the `unsafeWindow` grant (used only to detect Fast Load), no network requests (the button is a plain link opened in a new tab).

## 0.6.2

- Release workflow: GitHub is now the source of truth; Greasy Fork syncs from this repository.
- Update metadata now points to the GitHub raw file (Greasy Fork replaces it with its own URLs on its hosted copy).
- README installation instructions corrected.

## 0.6.1

- Initial version tracked in this repository.
- See the userscript source and Greasy Fork release history for the full feature and change history.
