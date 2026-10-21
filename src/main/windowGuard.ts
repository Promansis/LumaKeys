// Policy for windows the renderer opens and for navigation away from the app (PH-SEC-005).
// Kept free of Electron imports so it can be unit tested.

export interface WindowGuardContents {
  setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' }): void;
  on(event: 'will-navigate', listener: (event: { url: string; preventDefault(): void }) => void): unknown;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** Never opens an app window. Only https: links go on to the system browser. */
export function handleWindowOpen(url: string, openExternal: (url: string) => unknown): { action: 'deny' } {
  if (parseUrl(url)?.protocol === 'https:') {
    try {
      Promise.resolve(openExternal(url)).catch(() => undefined);
    } catch {
      // A missing or failing browser launcher must not break the renderer.
    }
  }
  return { action: 'deny' };
}

/** True for the packaged app file (any hash or query) or for the dev-server origin. */
export function isAppNavigation(targetUrl: string, appUrl: string): boolean {
  const target = parseUrl(targetUrl);
  const app = parseUrl(appUrl);
  if (!target || !app) {
    return false;
  }
  if (app.protocol === 'file:') {
    return target.protocol === 'file:' && target.pathname === app.pathname;
  }
  return target.origin === app.origin;
}

export function installWindowGuard(
  contents: WindowGuardContents,
  appUrl: string,
  openExternal: (url: string) => unknown,
): void {
  contents.setWindowOpenHandler(({ url }) => handleWindowOpen(url, openExternal));
  contents.on('will-navigate', (event) => {
    if (!isAppNavigation(event.url, appUrl)) {
      event.preventDefault();
    }
  });
}
