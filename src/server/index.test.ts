// @vitest-environment node

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SERVER_ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));
const GIVE_UP_AFTER_MS = 8000;
const tempDirs: string[] = [];

/** Starts the real server entry and reports how it exited; a server that keeps running is killed. */
async function startServer(env: Record<string, string>): Promise<{ code: number | null; output: string }> {
  const dataDir = await mkdtemp(join(tmpdir(), 'lumakeys-startup-'));
  tempDirs.push(dataDir);
  const childEnv: NodeJS.ProcessEnv = { ...process.env, PORT: '0', LUMAKEYS_DATA_DIR: dataDir, ...env };
  for (const name of ['LUMAKEYS_WEB_ACCESS_TOKEN', 'PIANOHERO_WEB_ACCESS_TOKEN', 'LUMAKEYS_TRUST_UPSTREAM_AUTH']) {
    if (!(name in env)) {
      delete childEnv[name];
    }
  }

  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', SERVER_ENTRY], {
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    const timer = setTimeout(() => child.kill('SIGKILL'), GIVE_UP_AFTER_MS);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

// PH-OPS-002: the web server must not start with /api/* open by default.
describe('web server startup', () => {
  it('refuses to start when neither an access token nor upstream trust is set', async () => {
    const { code, output } = await startServer({});

    expect(code).toBe(1);
    expect(output).toMatch(/No web access gate is set/);
  }, GIVE_UP_AFTER_MS + 5000);

  it('refuses to start with the placeholder token from docker-compose.yml', async () => {
    const { code, output } = await startServer({ LUMAKEYS_WEB_ACCESS_TOKEN: 'change-this-long-random-token' });

    expect(code).toBe(1);
    expect(output).toMatch(/placeholder/);
  }, GIVE_UP_AFTER_MS + 5000);
});
