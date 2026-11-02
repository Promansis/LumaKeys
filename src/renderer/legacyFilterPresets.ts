const FILTER_PRESETS_STORAGE_KEY = 'lumakeys-filter-presets';

// Pre-rename (PianoHero) key, read only to carry saved presets over.
// legacy-brand: remove in 0.3.0 (ADR 0002): delete this file and its one call in
// LibraryScreen.tsx, with the Node-side fallback in src/persistence/legacyBrandMigration.ts.
const LEGACY_FILTER_PRESETS_STORAGE_KEY = 'pianohero-filter-presets';

/**
 * Copies library filter presets saved under the pre-rename key to the current key, then removes the
 * old key. Does nothing when the current key already exists, so a merge never overwrites presets;
 * the old key then stays until "Reset all user data". The old key is removed only after the copy
 * reads back correctly.
 */
export function carryOverLegacyFilterPresets(): void {
  try {
    if (localStorage.getItem(FILTER_PRESETS_STORAGE_KEY) !== null) {
      return;
    }
    const legacy = localStorage.getItem(LEGACY_FILTER_PRESETS_STORAGE_KEY);
    if (legacy === null) {
      return;
    }
    localStorage.setItem(FILTER_PRESETS_STORAGE_KEY, legacy);
    if (localStorage.getItem(FILTER_PRESETS_STORAGE_KEY) === legacy) {
      localStorage.removeItem(LEGACY_FILTER_PRESETS_STORAGE_KEY);
    }
  } catch {
    // Storage can be unavailable or full; the presets then simply stay where they are.
  }
}
