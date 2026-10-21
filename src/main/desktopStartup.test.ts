// @vitest-environment node

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { legacyProfileDirs, migrateLegacyBrand } from '../persistence/legacyBrandMigration';
import {
  STARTUP_ERROR_TITLE,
  desktopProfileDir,
  legacyLibraryChoiceFromResponse,
  legacyLibraryPrompt,
  runDesktopStartup,
} from './desktopStartup';

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function handlers() {
  return { showError: vi.fn(), exit: vi.fn() };
}

function quietConsole() {
  vi.spyOn(console, 'error').mockImplementation(() => {});
}

describe('desktopProfileDir', () => {
  it('pins the profile to <appData>/lumakeys', () => {
    expect(desktopProfileDir('/home/u/.config')).toBe('/home/u/.config/lumakeys');
  });
});

describe('runDesktopStartup', () => {
  it('shows a migration refusal in a dialog and exits with code 1', async () => {
    quietConsole();
    const appData = join(tmpdir(), `lumakeys-startup-${Math.random().toString(36).slice(2)}`);
    roots.push(appData);
    for (const name of ['luma-keys', 'piano-hero']) {
      mkdirSync(join(appData, name), { recursive: true });
      new Database(join(appData, name, 'pianohero.db')).close();
    }
    const report = handlers();

    await runDesktopStartup(async () => {
      migrateLegacyBrand({ destinationDir: desktopProfileDir(appData), legacyDirs: legacyProfileDirs(appData) });
    }, report);

    expect(report.showError).toHaveBeenCalledTimes(1);
    const [title, content] = report.showError.mock.calls[0] as [string, string];
    expect(title).toBe(STARTUP_ERROR_TITLE);
    expect(content).toContain(join(appData, 'luma-keys'));
    expect(content).toContain(join(appData, 'piano-hero'));
    expect(report.exit).toHaveBeenCalledWith(1);
    expect(report.showError.mock.invocationCallOrder[0]).toBeLessThan(report.exit.mock.invocationCallOrder[0]);
  });

  it('still exits when the dialog itself fails', async () => {
    quietConsole();
    const report = handlers();
    report.showError.mockImplementation(() => {
      throw new Error('no display');
    });

    await runDesktopStartup(async () => {
      throw new Error('database open failed');
    }, report);

    expect(report.exit).toHaveBeenCalledWith(1);
  });

  it('reports a thrown non-Error value', async () => {
    quietConsole();
    const report = handlers();

    await runDesktopStartup(() => Promise.reject('plain text'), report);

    expect(report.showError).toHaveBeenCalledWith(STARTUP_ERROR_TITLE, 'plain text');
    expect(report.exit).toHaveBeenCalledWith(1);
  });

  it('neither reports nor exits when startup succeeds', async () => {
    const report = handlers();

    await runDesktopStartup(async () => {}, report);

    expect(report.showError).not.toHaveBeenCalled();
    expect(report.exit).not.toHaveBeenCalled();
  });
});

describe('legacy library prompt', () => {
  it('names both directories and offers to quit by default', () => {
    const prompt = legacyLibraryPrompt({ legacyDir: '/a/luma-keys', destinationDir: '/a/lumakeys' });

    expect(prompt.detail).toContain('/a/luma-keys');
    expect(prompt.detail).toContain('/a/lumakeys');
    expect(prompt.buttons).toHaveLength(3);
    expect(legacyLibraryChoiceFromResponse(prompt.cancelId)).toBe('quit');
    expect(legacyLibraryChoiceFromResponse(prompt.defaultId)).toBe('quit');
  });

  it('maps each button to its choice', () => {
    expect([0, 1, 2, 7].map(legacyLibraryChoiceFromResponse)).toEqual([
      'use-legacy',
      'keep-current',
      'quit',
      'quit',
    ]);
  });
});
