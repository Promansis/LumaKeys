// @vitest-environment node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SERVER_ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));
// Absolute, so the server can run from a temporary working directory.
const TSX_LOADER = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const GATE_VARIABLES = ['LUMAKEYS_WEB_ACCESS_TOKEN', 'PIANOHERO_WEB_ACCESS_TOKEN', 'LUMAKEYS_TRUST_UPSTREAM_AUTH'];
const GIVE_UP_AFTER_MS = 15000;
const TEST_PORT = 3227;
const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'lumakeys-startup-'));
  tempDirs.push(dir);
  return dir;
}

/** Starts the real server entry. A server that is still running after the give-up time is killed. */
function spawnServer(env: Record<string, string>, cwd?: string) {
  const childEnv: NodeJS.ProcessEnv = { ...process.env, PORT: '0', ...env };
  for (const name of GATE_VARIABLES) {
    if (!(name in env)) {
      delete childEnv[name];
    }
  }

  const child = spawn(process.execPath, ['--import', TSX_LOADER, SERVER_ENTRY], {
    cwd,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
  const timer = setTimeout(() => child.kill('SIGKILL'), GIVE_UP_AFTER_MS);
  const exited = new Promise<number | null>((resolve) => {
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });

  return { child, exited, output: () => output };
}

async function waitForServer(base: string): Promise<void> {
  const deadline = Date.now() + GIVE_UP_AFTER_MS;
  while (Date.now() < deadline) {
    try {
      await fetch(`${base}/`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Server at ${base} did not start.`);
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

// PH-OPS-002: the web server must not start with /api/* open by default.
describe('web server startup', () => {
  it('refuses to start when neither an access token nor upstream trust is set', async () => {
    const dataDir = join(await makeTempDir(), 'data');
    const server = spawnServer({ LUMAKEYS_DATA_DIR: dataDir });

    expect(await server.exited).toBe(1);
    expect(server.output()).toMatch(/No web access gate is set/);
    expect(existsSync(dataDir)).toBe(false);
  }, GIVE_UP_AFTER_MS + 5000);

  it('refuses to start with the placeholder token from docker-compose.yml, before it creates the data dir', async () => {
    const dataDir = join(await makeTempDir(), 'data');
    const server = spawnServer({ LUMAKEYS_DATA_DIR: dataDir, LUMAKEYS_WEB_ACCESS_TOKEN: 'change-this-long-random-token' });

    expect(await server.exited).toBe(1);
    expect(server.output()).toMatch(/placeholder/);
    expect(existsSync(dataDir)).toBe(false);
  }, GIVE_UP_AFTER_MS + 5000);

  // PH-OPS-002 and PH-SEC-003: the gate runs ahead of the API routes, and the app shell
  // carries the security headers.
  it('gates the API and sends the CSP header when started with a token', async () => {
    const root = await makeTempDir();
    await mkdir(join(root, 'dist', 'web'), { recursive: true });
    await writeFile(join(root, 'dist', 'web', 'index.html'), '<!doctype html><title>LumaKeys</title>');
    const server = spawnServer({
      PORT: String(TEST_PORT),
      LUMAKEYS_DATA_DIR: join(root, 'data'),
      LUMAKEYS_WEB_ACCESS_TOKEN: 'startup-test-token',
    }, root);
    const base = `http://127.0.0.1:${TEST_PORT}`;

    try {
      await waitForServer(base);
      const shell = await fetch(`${base}/`);
      const unsigned = await fetch(`${base}/api/bridge/getAllSongs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [] }),
      });
      const signed = await fetch(`${base}/api/bridge/getAllSongs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-lumakeys-access-token': 'startup-test-token' },
        body: JSON.stringify({ args: [] }),
      });

      expect(shell.status).toBe(200);
      expect(shell.headers.get('content-security-policy') ?? '').toMatch(/default-src 'self'.*frame-ancestors 'none'/);
      expect(unsigned.status).toBe(401);
      expect(signed.status).toBe(200);
    } finally {
      server.child.kill('SIGTERM');
      await server.exited;
    }
  }, GIVE_UP_AFTER_MS * 2);
});
