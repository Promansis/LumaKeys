// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import { createStaticFileHandler, parseByteRange } from './staticFiles';

const tempDirs: string[] = [];
const VIDEO_BYTES = Uint8Array.from({ length: 100 }, (_, index) => index);

async function makeServer() {
  const webRoot = await mkdtemp(join(tmpdir(), 'lumakeys-static-'));
  tempDirs.push(webRoot);
  await mkdir(join(webRoot, 'assets', 'main-menu'), { recursive: true });
  await writeFile(join(webRoot, 'index.html'), '<!doctype html><title>LumaKeys</title>');
  await writeFile(join(webRoot, 'assets', 'main-menu', 'loop.webm'), VIDEO_BYTES);

  const app = new Hono();
  app.get('*', createStaticFileHandler(webRoot));
  return app;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('createStaticFileHandler', () => {
  it('serves webm video with a video content type and advertises range support', async () => {
    const app = await makeServer();

    const response = await app.request('/assets/main-menu/loop.webm');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('video/webm');
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(VIDEO_BYTES);
  });

  it('serves a requested byte range as partial content', async () => {
    const app = await makeServer();

    const response = await app.request('/assets/main-menu/loop.webm', { headers: { Range: 'bytes=10-19' } });

    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 10-19/100');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(VIDEO_BYTES.slice(10, 20));
  });

  it('rejects a range beyond the end of the file', async () => {
    const app = await makeServer();

    const response = await app.request('/assets/main-menu/loop.webm', { headers: { Range: 'bytes=500-' } });

    expect(response.status).toBe(416);
    expect(response.headers.get('Content-Range')).toBe('bytes */100');
  });

  it('falls back to index.html for extensionless app routes', async () => {
    const app = await makeServer();

    const response = await app.request('/library');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(await response.text()).toContain('<title>LumaKeys</title>');
  });
});

describe('parseByteRange', () => {
  it.each([
    ['bytes=0-', { start: 0, end: 99 }],
    ['bytes=90-200', { start: 90, end: 99 }],
    ['bytes=-10', { start: 90, end: 99 }],
    ['bytes=-500', { start: 0, end: 99 }],
  ])('parses %s', (header, expected) => {
    expect(parseByteRange(header, 100)).toEqual(expected);
  });

  it.each([undefined, 'items=0-10', 'bytes=0-1,5-9', 'bytes=-'])('ignores %s', (header) => {
    expect(parseByteRange(header, 100)).toBeNull();
  });

  it.each(['bytes=100-', 'bytes=20-10', 'bytes=-0'])('marks %s as unsatisfiable', (header) => {
    expect(parseByteRange(header, 100)).toBe('unsatisfiable');
  });
});
