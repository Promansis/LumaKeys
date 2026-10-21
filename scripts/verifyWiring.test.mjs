import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const workflowPath = join(root, '.github', 'workflows', 'verify.yml');
const ASSERT_ASSETS = 'node scripts/assert-electron-assets.mjs';

function splitSteps(script) {
  return script.split('&&').map((step) => step.trim());
}

describe('PH-OPS-005 verify script', () => {
  it('chains typecheck, server typecheck, tests, both builds and the asset assertion in order', () => {
    expect(packageJson.scripts.verify).toBeDefined();
    expect(splitSteps(packageJson.scripts.verify)).toEqual([
      'npm run typecheck',
      'tsc --noEmit -p tsconfig.server.json',
      'vitest run',
      'npm run build',
      'npm run build:web',
      ASSERT_ASSETS,
    ]);
  });
});

describe('PH-OPS-005 workflow', () => {
  it('runs on push and pull request, installs without the Electron rebuild, then verifies', () => {
    expect(existsSync(workflowPath)).toBe(true);
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toMatch(/^on:\s*\n\s+push:/m);
    expect(workflow).toMatch(/^\s+pull_request:/m);
    expect(workflow).toMatch(/LUMAKEYS_SKIP_ELECTRON_REBUILD:\s*['"]?1['"]?/);

    const order = ['npm ci', 'npm run verify', 'node scripts/audit/recount-coverage.mjs --check']
      .map((command) => workflow.indexOf(`run: ${command}`));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('PH-PAR-001 package scripts', () => {
  const packageScripts = Object.entries(packageJson.scripts).filter(([name]) => name.startsWith('package:'));

  it('has at least one package script to guard', () => {
    expect(packageScripts.length).toBeGreaterThan(0);
  });

  it.each(packageScripts)('%s asserts the Electron assets after the build and before electron-builder', (_name, script) => {
    const steps = splitSteps(script);
    const build = steps.indexOf('npm run build');
    const assertion = steps.indexOf(ASSERT_ASSETS);
    const packager = steps.findIndex((step) => step.startsWith('electron-builder'));

    expect(build).toBeGreaterThanOrEqual(0);
    expect(assertion).toBeGreaterThan(build);
    expect(packager).toBeGreaterThan(assertion);
  });
});
