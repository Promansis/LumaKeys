import { open, readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import type { Context } from 'hono';

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const IMMUTABLE_ASSET_PATH_PATTERN = /^\/assets\/.+-[A-Za-z0-9_-]+\.(?:css|js)$/;

type ByteRange = { start: number; end: number };

function setStaticCacheHeaders(pathname: string, absolutePath: string, setHeader: (name: string, value: string) => void): void {
  const extension = extname(absolutePath);

  if (extension === '.html' || pathname === '/') {
    setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    setHeader('Pragma', 'no-cache');
    setHeader('Expires', '0');
    return;
  }

  if (IMMUTABLE_ASSET_PATH_PATTERN.test(pathname)) {
    setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return;
  }

  if (extension === '.json') {
    setHeader('Cache-Control', 'no-cache, must-revalidate');
    return;
  }

  setHeader('Cache-Control', 'public, max-age=3600');
}

/**
 * Parses a single-range `Range` header. Returns null when the header should be ignored
 * (absent, malformed, or multi-range) and 'unsatisfiable' when it cannot be served.
 */
export function parseByteRange(header: string | undefined, size: number): ByteRange | 'unsatisfiable' | null {
  const match = header?.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    return null;
  }

  const [, startText, endText] = match;
  if (!startText && !endText) {
    return null;
  }

  if (!startText) {
    const suffixLength = Number(endText);
    if (suffixLength === 0 || size === 0) {
      return 'unsatisfiable';
    }
    return { start: Math.max(size - suffixLength, 0), end: size - 1 };
  }

  const start = Number(startText);
  const end = endText ? Math.min(Number(endText), size - 1) : size - 1;
  if (start >= size || end < start) {
    return 'unsatisfiable';
  }
  return { start, end };
}

async function readByteRange(absolutePath: string, { start, end }: ByteRange): Promise<Uint8Array<ArrayBuffer>> {
  const handle = await open(absolutePath, 'r');
  try {
    const buffer = new Uint8Array(end - start + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    return bytesRead === buffer.length ? buffer : buffer.slice(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export function createStaticFileHandler(webRoot: string) {
  function resolveStaticPath(pathname: string): string {
    const trimmedPath = pathname === '/' ? '/index.html' : pathname;
    const normalizedPath = normalize(trimmedPath).replace(/^([.][.][/\\])+/, '');
    return resolve(webRoot, `.${normalizedPath}`);
  }

  return async (c: Context) => {
    const requestedPath = c.req.path;
    const absolutePath = resolveStaticPath(requestedPath);

    if (!absolutePath.startsWith(webRoot)) {
      return c.notFound();
    }

    try {
      const fileStats = await stat(absolutePath);
      if (fileStats.isFile()) {
        c.header('Content-Type', CONTENT_TYPES[extname(absolutePath)] ?? 'application/octet-stream');
        c.header('Accept-Ranges', 'bytes');
        setStaticCacheHeaders(requestedPath, absolutePath, (name, value) => c.header(name, value));

        const range = parseByteRange(c.req.header('Range'), fileStats.size);
        if (range === 'unsatisfiable') {
          c.header('Content-Range', `bytes */${fileStats.size}`);
          return c.body(null, 416);
        }
        if (range) {
          c.header('Content-Range', `bytes ${range.start}-${range.end}/${fileStats.size}`);
          return c.body(await readByteRange(absolutePath, range), 206);
        }

        return c.body(await readFile(absolutePath));
      }
    } catch {
      if (extname(requestedPath)) {
        return c.notFound();
      }
    }

    try {
      const indexPath = join(webRoot, 'index.html');
      const body = await readFile(indexPath);
      c.header('Content-Type', 'text/html; charset=utf-8');
      setStaticCacheHeaders('/', indexPath, (name, value) => c.header(name, value));
      return c.body(body);
    } catch {
      return c.text('Web build not found. Run npm run build:web first.', 404);
    }
  };
}
