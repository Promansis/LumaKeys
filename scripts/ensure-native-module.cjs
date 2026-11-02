const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const projectRoot = resolve(__dirname, '..');
const nativeProbe = "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.close();";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function firstErrorLine(result) {
  const text = String(result.stderr ?? '').trim();
  return text.split('\n').find((line) => /error/i.test(line)) ?? text.split('\n')[0] ?? '';
}

// legacy-brand: remove in 0.3.0 (ADR 0002).
const LEGACY_SKIP_VARIABLE = 'PIANOHERO_SKIP_ELECTRON_REBUILD';

/** The variable that asks to skip the Electron probe (trimmed, set to 1), or null. */
function electronSkipVariable(env) {
  return ['LUMAKEYS_SKIP_ELECTRON_REBUILD', LEGACY_SKIP_VARIABLE].find((name) => env[name]?.trim() === '1') ?? null;
}

function ensureNativeModule(target) {
  if (target !== 'node' && target !== 'electron') {
    console.error(`Unknown native runtime target: ${target}`);
    return false;
  }

  const skipVariable = target === 'electron' ? electronSkipVariable(process.env) : null;
  if (skipVariable) {
    // The variable keeps its old name so CI, the Dockerfile and the docs need no change. It no
    // longer skips a rebuild (better-sqlite3 13 is N-API and is never rebuilt per Electron
    // version); it skips the Electron probe, which would fetch the Electron binary.
    console.log(`Skipping the Electron native-module check because ${skipVariable}=1`);
    if (skipVariable === LEGACY_SKIP_VARIABLE) {
      console.warn(
        `Legacy PianoHero names are in use: ${LEGACY_SKIP_VARIABLE}. Rename it to LUMAKEYS_SKIP_ELECTRON_REBUILD; `
          + 'LumaKeys 0.3.0 stops reading it (ADR 0002).',
      );
    }
    return true;
  }

  const probeCommand = target === 'electron' ? require('electron') : process.execPath;
  const probeResult = run(probeCommand, ['-e', nativeProbe], {
    env: target === 'electron'
      ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
      : process.env,
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  if (probeResult.status === 0) {
    console.log(`better-sqlite3 is ready for ${target}`);
    return true;
  }

  // better-sqlite3 13 ships N-API prebuilt binaries that load in Node and in Electron, and
  // neither `electron-rebuild` nor `npm rebuild` can produce a missing one, so there is
  // nothing to rebuild here. A reinstall is the fix.
  const cause = firstErrorLine(probeResult);
  console.error(`better-sqlite3 could not be loaded for ${target}${cause ? `: ${cause}` : '.'}`);
  console.error(
    'Its prebuilt binary is missing or unusable. Run `npm ci` again with Node 22.14 or later '
      + '(see engines in package.json). On Windows without Python and the Visual Studio Build '
      + 'Tools, see BUILD_PORTABLE.md.',
  );
  return false;
}

if (require.main === module && !ensureNativeModule(process.argv[2])) {
  process.exitCode = 1;
}

module.exports = { ensureNativeModule };
