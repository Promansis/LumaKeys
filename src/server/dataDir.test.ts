// @vitest-environment node

import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDataDir } from './dataDir';

const CWD = resolve('/srv/lumakeys-app');
const nothingExists = () => false;
const existing = (...dirs: string[]) => (path: string) => dirs.includes(path);

// ADR 0002 items 3 and 4; the V and S ids are the cases of scripts/audit/legacy-brand-server-probe.mjs.
describe('resolveDataDir', () => {
  it('treats an empty LUMAKEYS_DATA_DIR as unset (V1)', () => {
    expect(resolveDataDir({ LUMAKEYS_DATA_DIR: '' }, CWD, nothingExists)).toEqual({
      dataDir: join(CWD, '.lumakeys-data'),
      legacyNames: [],
    });
  });

  it('treats a whitespace LUMAKEYS_DATA_DIR as unset (V2), so a legacy variable still applies (V4)', () => {
    expect(resolveDataDir({ LUMAKEYS_DATA_DIR: '   ' }, CWD, nothingExists).dataDir).toBe(join(CWD, '.lumakeys-data'));
    expect(resolveDataDir({ LUMAKEYS_DATA_DIR: '   ', PIANOHERO_DATA_DIR: '/legacy' }, CWD, nothingExists)).toEqual({
      dataDir: resolve('/legacy'),
      legacyNames: ['PIANOHERO_DATA_DIR'],
    });
  });

  it('refuses a relative LUMAKEYS_DATA_DIR, naming the value and the fix (V3)', () => {
    expect(() => resolveDataDir({ LUMAKEYS_DATA_DIR: 'rel/data' }, CWD, nothingExists)).toThrow(
      /LUMAKEYS_DATA_DIR is "rel\/data".*absolute path/,
    );
    expect(() => resolveDataDir({ LUMAKEYS_DATA_DIR: ' ./data ' }, CWD, nothingExists)).toThrow(/"\.\/data"/);
  });

  it('trims an absolute LUMAKEYS_DATA_DIR (V5) and ignores the legacy names', () => {
    expect(
      resolveDataDir({ LUMAKEYS_DATA_DIR: ' /abs/data ', PIANOHERO_DATA_DIR: '/legacy' }, CWD, existing(join(CWD, '.pianohero-data'))),
    ).toEqual({ dataDir: resolve('/abs/data'), legacyNames: [] });
  });

  it('names PIANOHERO_DATA_DIR when it picks the directory (S5), trimmed', () => {
    expect(resolveDataDir({ PIANOHERO_DATA_DIR: ' /legacy ' }, CWD, nothingExists)).toEqual({
      dataDir: resolve('/legacy'),
      legacyNames: ['PIANOHERO_DATA_DIR'],
    });
  });

  it('names a working-directory .pianohero-data only when it is the one used (S1, S2)', () => {
    const legacyDir = join(CWD, '.pianohero-data');
    expect(resolveDataDir({}, CWD, existing(legacyDir))).toEqual({ dataDir: legacyDir, legacyNames: [legacyDir] });
    expect(resolveDataDir({}, CWD, existing(legacyDir, join(CWD, '.lumakeys-data')))).toEqual({
      dataDir: join(CWD, '.lumakeys-data'),
      legacyNames: [],
    });
  });
});
