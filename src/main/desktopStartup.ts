// Desktop startup pieces that do not need a running Electron app, so tests can
// drive them: the pinned profile directory, the startup error boundary, and the
// question asked when an earlier library and a current one both hold data.

import type { MessageBoxSyncOptions } from 'electron';
import { join } from 'node:path';
import type { LegacyLibraryChoice, LegacyLibraryConflict } from '../persistence/legacyBrandMigration';

export const STARTUP_ERROR_TITLE = 'LumaKeys could not start';

/** The profile every build since the rename opens, whatever Electron derives from package.json. */
export function desktopProfileDir(appDataDir: string): string {
  return join(appDataDir, 'lumakeys');
}

export interface StartupFailureHandlers {
  showError: (title: string, content: string) => void;
  exit: (code: number) => void;
}

/**
 * Runs the startup sequence. Any failure is shown to the user and the process
 * exits with code 1, instead of leaving a running process with no window.
 */
export async function runDesktopStartup(
  start: () => Promise<void>,
  handlers: StartupFailureHandlers,
): Promise<void> {
  try {
    await start();
  } catch (error) {
    console.error('LumaKeys startup failed:', error);
    try {
      handlers.showError(STARTUP_ERROR_TITLE, error instanceof Error ? error.message : String(error));
    } catch (dialogError) {
      console.error('Could not show the startup error:', dialogError);
    }
    handlers.exit(1);
  }
}

const LEGACY_LIBRARY_CHOICES: LegacyLibraryChoice[] = ['use-legacy', 'keep-current', 'quit'];

export function legacyLibraryPrompt(
  conflict: LegacyLibraryConflict,
): MessageBoxSyncOptions & { defaultId: number; cancelId: number } {
  return {
    type: 'question',
    title: 'Earlier library found',
    message: 'LumaKeys found a library from an earlier version, and your current library already holds data.',
    detail:
      `Earlier library: ${conflict.legacyDir}\nCurrent library: ${conflict.destinationDir}\n\n`
      + 'LumaKeys does not merge libraries. If you use the earlier library, the current one is '
      + 'kept in a "before-legacy-migration" folder inside the current library folder. If you keep '
      + 'the current library, LumaKeys will not ask again and the earlier one stays where it is.',
    buttons: ['Use earlier library', 'Keep current library', 'Quit'],
    defaultId: 2,
    cancelId: 2,
    noLink: true,
  };
}

export function legacyLibraryChoiceFromResponse(response: number): LegacyLibraryChoice {
  return LEGACY_LIBRARY_CHOICES[response] ?? 'quit';
}
