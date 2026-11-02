import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

export interface ResolvedDataDir {
  dataDir: string;
  /** Legacy names that picked `dataDir`: a variable name or a `.pianohero-data` path, never a value. */
  legacyNames: string[];
}

/**
 * Where the web server keeps its data. `LUMAKEYS_DATA_DIR` is trimmed, blank counts as unset,
 * and it must be absolute: a relative value would resolve against the working directory and
 * could open an empty library.
 */
export function resolveDataDir(
  env: Record<string, string | undefined>,
  cwd: string = process.cwd(),
  exists: (path: string) => boolean = existsSync,
): ResolvedDataDir {
  const explicit = env.LUMAKEYS_DATA_DIR?.trim();
  if (explicit) {
    if (!isAbsolute(explicit)) {
      throw new Error(
        `LUMAKEYS_DATA_DIR is "${explicit}", which is not an absolute path. Set it to an absolute path `
          + '(for example /data), or unset it to use .lumakeys-data in the working directory.',
      );
    }
    return { dataDir: resolve(explicit), legacyNames: [] };
  }

  // legacy-brand: remove in 0.3.0 (ADR 0002). Pre-rename names keep a deployment's data.
  const legacyEnv = env.PIANOHERO_DATA_DIR?.trim();
  if (legacyEnv) {
    return { dataDir: resolve(cwd, legacyEnv), legacyNames: ['PIANOHERO_DATA_DIR'] };
  }
  const current = join(cwd, '.lumakeys-data');
  if (exists(current)) {
    return { dataDir: current, legacyNames: [] };
  }
  const legacyDir = join(cwd, '.pianohero-data');
  if (exists(legacyDir)) {
    return { dataDir: legacyDir, legacyNames: [legacyDir] };
  }
  return { dataDir: current, legacyNames: [] };
}
