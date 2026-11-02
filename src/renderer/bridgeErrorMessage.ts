// Electron wraps an error thrown in a main-process handler as
// "Error invoking remote method '<channel>': Error: <message>". The user only needs
// <message>; the web bridge already passes the bare message through.
const IPC_ERROR_PREFIX = /^Error invoking remote method '[^']*': (?:[A-Za-z]*Error: )?/;

export function getBridgeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(IPC_ERROR_PREFIX, '');
}
