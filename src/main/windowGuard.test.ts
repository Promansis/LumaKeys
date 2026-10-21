import { describe, expect, it, vi } from 'vitest';
import { handleWindowOpen, installWindowGuard, isAppNavigation } from './windowGuard';

const FILE_APP = 'file:///opt/LumaKeys/resources/app.asar/out/renderer/index.html';
const DEV_APP = 'http://localhost:5173/';

describe('handleWindowOpen', () => {
  it('denies every URL and opens only https: URLs in the system browser', () => {
    const openExternal = vi.fn(() => Promise.resolve());
    const urls = [
      'https://freesound.org/people/someone/sounds/1/',
      'http://example.com/',
      'file:///etc/passwd',
      'local://animals/cat',
      'javascript:alert(1)',
      'data:text/html,<p>x</p>',
      'ftp://example.com/file',
      'not a url',
      '',
    ];

    for (const url of urls) {
      expect(handleWindowOpen(url, openExternal)).toEqual({ action: 'deny' });
    }

    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith('https://freesound.org/people/someone/sounds/1/');
  });

  it('passes the normalised URL to the system browser', () => {
    const openExternal = vi.fn(() => Promise.resolve());

    expect(handleWindowOpen('  https://Example.com/a b ', openExternal)).toEqual({ action: 'deny' });

    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith('https://example.com/a%20b');
  });

  it('does not throw when the system browser cannot be launched', async () => {
    const openExternal = vi.fn(() => Promise.reject(new Error('no browser')));

    expect(handleWindowOpen('https://example.com/', openExternal)).toEqual({ action: 'deny' });
    await Promise.resolve();
  });
});

describe('isAppNavigation', () => {
  it('allows only the packaged app file', () => {
    expect(isAppNavigation(FILE_APP, FILE_APP)).toBe(true);
    expect(isAppNavigation(`${FILE_APP}#/settings`, FILE_APP)).toBe(true);
    expect(isAppNavigation('file:///etc/passwd', FILE_APP)).toBe(false);
    expect(isAppNavigation('file://evil/opt/LumaKeys/resources/app.asar/out/renderer/index.html', FILE_APP)).toBe(false);
    expect(isAppNavigation('https://example.com/', FILE_APP)).toBe(false);
    expect(isAppNavigation('http://localhost:5173/', FILE_APP)).toBe(false);
  });

  it('allows only the dev-server origin', () => {
    expect(isAppNavigation('http://localhost:5173/index.html', DEV_APP)).toBe(true);
    expect(isAppNavigation('http://localhost:5174/', DEV_APP)).toBe(false);
    expect(isAppNavigation('https://localhost:5173/', DEV_APP)).toBe(false);
    expect(isAppNavigation('https://example.com/', DEV_APP)).toBe(false);
    expect(isAppNavigation(FILE_APP, DEV_APP)).toBe(false);
  });

  it('denies anything it cannot parse', () => {
    expect(isAppNavigation('not a url', FILE_APP)).toBe(false);
    expect(isAppNavigation(FILE_APP, 'not a url')).toBe(false);
  });
});

describe('installWindowGuard', () => {
  function fakeContents() {
    let openHandler: ((details: { url: string }) => { action: 'deny' }) | undefined;
    let navigateListener: ((event: { url: string; preventDefault(): void }) => void) | undefined;
    return {
      contents: {
        setWindowOpenHandler: (handler: typeof openHandler) => {
          openHandler = handler;
        },
        on: (event: string, listener: typeof navigateListener) => {
          if (event === 'will-navigate') {
            navigateListener = listener;
          }
        },
      },
      open: (url: string) => openHandler?.({ url }),
      navigate: (url: string) => {
        const preventDefault = vi.fn();
        navigateListener?.({ url, preventDefault });
        return preventDefault;
      },
    };
  }

  it('registers a window-open handler that routes https: links to the system browser', () => {
    const fake = fakeContents();
    const openExternal = vi.fn(() => Promise.resolve());
    installWindowGuard(fake.contents, FILE_APP, openExternal);

    expect(fake.open('https://freesound.org/')).toEqual({ action: 'deny' });
    expect(openExternal).toHaveBeenCalledWith('https://freesound.org/');
  });

  it('cancels navigation away from the app and leaves in-app navigation alone', () => {
    const fake = fakeContents();
    installWindowGuard(fake.contents, FILE_APP, vi.fn());

    expect(fake.navigate('https://example.com/')).toHaveBeenCalledTimes(1);
    expect(fake.navigate('file:///etc/passwd')).toHaveBeenCalledTimes(1);
    expect(fake.navigate(`${FILE_APP}#/x`)).not.toHaveBeenCalled();
  });
});
