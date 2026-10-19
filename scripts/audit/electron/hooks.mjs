let cfg;
export function initialize(data) { cfg = data; }
export async function resolve(specifier, context, next) {
  if (context.parentURL === cfg.target) {
    if (specifier === 'electron') return { url: cfg.shim, shortCircuit: true };
    if (specifier === 'better-sqlite3') return { url: cfg.sqlite, shortCircuit: true };
  }
  return next(specifier, context);
}
