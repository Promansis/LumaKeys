import electron from 'electron';
const Native = electron.BrowserWindow;
export class BrowserWindow extends Native {
  constructor(opts = {}) {
    super({ ...opts, show: false, webPreferences: { ...(opts.webPreferences ?? {}), offscreen: true } });
  }
}
for (const k of ['getAllWindows', 'getFocusedWindow', 'fromWebContents', 'fromId', 'fromBrowserView']) {
  if (Native[k]) BrowserWindow[k] = Native[k].bind(Native);
}
export const { app, ipcMain, dialog, shell, session, protocol, Menu, nativeTheme, webContents } = electron;
export default electron;
