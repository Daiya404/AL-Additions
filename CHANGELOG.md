# Changelog

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