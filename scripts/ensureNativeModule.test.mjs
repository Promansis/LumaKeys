// @vitest-environment node

import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ensureNativeModule } = require('./ensure-native-module.cjs');

// ADR 0002 items 3 and 4: the skip variable is trimmed, and the legacy name still works but is named.
describe('ensureNativeModule electron skip', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function captureConsole() {
    return {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    };
  }

  it('skips the Electron probe when LUMAKEYS_SKIP_ELECTRON_REBUILD is 1 with surrounding spaces', () => {
    vi.stubEnv('LUMAKEYS_SKIP_ELECTRON_REBUILD', ' 1 ');
    vi.stubEnv('PIANOHERO_SKIP_ELECTRON_REBUILD', '');
    const output = captureConsole();

    expect(ensureNativeModule('electron')).toBe(true);
    expect(output.log).toHaveBeenCalledWith(expect.stringMatching(/^Skipping the Electron native-module check because LUMAKEYS_SKIP_ELECTRON_REBUILD=1/));
    expect(output.warn).not.toHaveBeenCalled();
  });

  it('warns once, naming PIANOHERO_SKIP_ELECTRON_REBUILD, when only the legacy name skips the probe', () => {
    vi.stubEnv('LUMAKEYS_SKIP_ELECTRON_REBUILD', '');
    vi.stubEnv('PIANOHERO_SKIP_ELECTRON_REBUILD', '1');
    const output = captureConsole();

    expect(ensureNativeModule('electron')).toBe(true);
    expect(output.log).toHaveBeenCalledWith(expect.stringMatching(/because PIANOHERO_SKIP_ELECTRON_REBUILD=1/));
    expect(output.warn).toHaveBeenCalledTimes(1);
    expect(output.warn.mock.calls[0][0]).toMatch(/PIANOHERO_SKIP_ELECTRON_REBUILD.*LUMAKEYS_SKIP_ELECTRON_REBUILD/);
  });
});
