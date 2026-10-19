#!/usr/bin/env node
// Read-only AppBridge contract diff for the runtime-parity lane.
//
// Extracts the bridge method lists from every place that defines or implements the
// contract and prints any name present in one list but missing from another:
//
//   src/shared/bridgeMethods.ts   APP_BRIDGE_METHODS and the rpc/special/stub partition
//   src/shared/ipc.ts             members of `interface AppBridge`
//   src/main/preload.ts           keys of the exposed `appBridge` object and their IPC channels
//   src/main/index.ts             `ipcMain.handle` channels and `send` channels
//   src/server/bridgeRouter.ts    `bridgeArgValidators` keys and router special cases
//   src/persistence/database.ts   public AppDatabase methods (generic RPC dispatch target)
//   src/renderer/webBridge.ts     explicitly handled `property === '...'` names, stub/RPC sets
//
// Usage:
//   node scripts/audit/bridge-contract-diff.mjs              # working tree
//   node scripts/audit/bridge-contract-diff.mjs --rev 0bd40f5 # a commit, via `git show`
//   node scripts/audit/bridge-contract-diff.mjs --json        # machine-readable lists
//
// Exit code 0 when every check passes, 1 when any mismatch is printed.
// The script never writes files and never changes git state.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const revIndex = argv.indexOf('--rev');
const rev = revIndex >= 0 ? argv[revIndex + 1] : null;
const asJson = argv.includes('--json');

function source(path) {
  if (rev) {
    return execFileSync('git', ['show', `${rev}:${path}`], { cwd: repoRoot, encoding: 'utf8' });
  }
  return readFileSync(join(repoRoot, path), 'utf8');
}

function block(text, startPattern, endPattern, label) {
  const start = text.search(startPattern);
  if (start < 0) {
    throw new Error(`Could not find start of ${label}`);
  }
  const rest = text.slice(start);
  const end = rest.search(endPattern);
  if (end < 0) {
    throw new Error(`Could not find end of ${label}`);
  }
  return rest.slice(0, end);
}

function quotedArray(text, constName) {
  const body = block(text, new RegExp(`export const ${constName} = \\[`), /\]\s*as const/, constName);
  return [...body.matchAll(/'([A-Za-z0-9_]+)'/g)].map((m) => m[1]);
}

function topLevelKeys(body) {
  return [...body.matchAll(/^ {2}([A-Za-z0-9_]+)\??:/gm)].map((m) => m[1]);
}

const files = {
  bridgeMethods: 'src/shared/bridgeMethods.ts',
  ipc: 'src/shared/ipc.ts',
  preload: 'src/main/preload.ts',
  main: 'src/main/index.ts',
  router: 'src/server/bridgeRouter.ts',
  database: 'src/persistence/database.ts',
  webBridge: 'src/renderer/webBridge.ts',
};
const text = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, source(path)]));

// 1. Shared inventory and partition.
const inventory = quotedArray(text.bridgeMethods, 'APP_BRIDGE_METHODS');
const rpc = quotedArray(text.bridgeMethods, 'RPC_BRIDGE_METHODS');
const special = quotedArray(text.bridgeMethods, 'WEB_SPECIAL_BRIDGE_METHODS');
const stub = quotedArray(text.bridgeMethods, 'WEB_STUB_BRIDGE_METHODS');

// 2. AppBridge interface members.
const appBridgeType = topLevelKeys(
  block(text.ipc, /export interface AppBridge \{/, /\n\}/, 'interface AppBridge'),
);

// 3. Preload object keys and the IPC channel each one uses.
const preloadBody = block(text.preload, /const appBridge: AppBridge = \{/, /\n\};/, 'preload appBridge');
const preloadKeys = [];
const preloadChannels = new Map();
let currentKey = null;
for (const line of preloadBody.split('\n')) {
  const keyMatch = line.match(/^ {2}([A-Za-z0-9_]+):/);
  if (keyMatch) {
    currentKey = keyMatch[1];
    preloadKeys.push(currentKey);
  }
  const channelMatch = line.match(/ipcRenderer\.(invoke|on)\('([^']+)'/);
  if (channelMatch && currentKey && !preloadChannels.has(currentKey)) {
    preloadChannels.set(currentKey, { kind: channelMatch[1], channel: channelMatch[2] });
  }
}

// 4. Main-process handlers and push channels.
const mainHandled = [...text.main.matchAll(/ipcMain\.handle\(\s*'([^']+)'/g)].map((m) => m[1]);
const mainSent = [...text.main.matchAll(/\.send\('([^']+)'/g)].map((m) => m[1]);

// 5. Web RPC router validators and special-cased dispatch.
const validatorKeys = topLevelKeys(
  block(text.router, /const bridgeArgValidators = \{/, /\n\} satisfies/, 'bridgeArgValidators'),
);
const routerSpecialCases = [...new Set([...text.router.matchAll(/method === '([A-Za-z0-9_]+)'/g)].map((m) => m[1]))];

// 6. Public AppDatabase methods reachable by the router's generic `db[method]` dispatch.
const dbClass = block(text.database, /export class AppDatabase \{/, /\n\}\n/, 'AppDatabase');
const dbPublicMethods = [
  ...dbClass.matchAll(/^ {2}(?!private |protected |constructor)(?:public |static |async )*([A-Za-z0-9_]+)\(/gm),
].map((m) => m[1]);

// 7. Web bridge proxy.
const webHandled = [...new Set([...text.webBridge.matchAll(/property === '([A-Za-z0-9_]+)'/g)].map((m) => m[1]))];
const webUsesStubSet = /WEB_STUB_BRIDGE_METHOD_SET\.has\(property\)/.test(text.webBridge);
const webUsesRpcSet = /RPC_BRIDGE_METHOD_SET\.has\(property\)/.test(text.webBridge);
const webHasDesktopStubNames = /desktopStubNames/.test(text.webBridge);

const findings = [];
const check = (label, left, leftName, right, rightName) => {
  const r = new Set(right);
  const l = new Set(left);
  const onlyLeft = left.filter((name) => !r.has(name));
  const onlyRight = right.filter((name) => !l.has(name));
  const ok = onlyLeft.length === 0 && onlyRight.length === 0;
  findings.push({ label, ok, onlyLeft, onlyRight, leftName, rightName, counts: [left.length, right.length] });
};
const subset = (label, inner, innerName, outer, outerName) => {
  const o = new Set(outer);
  const missing = inner.filter((name) => !o.has(name));
  findings.push({ label, ok: missing.length === 0, onlyLeft: missing, onlyRight: [], leftName: innerName, rightName: outerName, counts: [inner.length, outer.length] });
};
const duplicates = (label, list) => {
  const seen = new Set();
  const dupes = list.filter((name) => (seen.has(name) ? true : (seen.add(name), false)));
  findings.push({ label, ok: dupes.length === 0, onlyLeft: dupes, onlyRight: [], leftName: 'duplicates', rightName: '', counts: [list.length, list.length] });
};

check('AppBridge type vs APP_BRIDGE_METHODS', appBridgeType, 'ipc.ts AppBridge', inventory, 'bridgeMethods.ts');
duplicates('APP_BRIDGE_METHODS has no duplicates', inventory);
check('Partition rpc+special+stub vs inventory', [...rpc, ...special, ...stub], 'rpc+special+stub', inventory, 'APP_BRIDGE_METHODS');
duplicates('Partition categories are disjoint', [...rpc, ...special, ...stub]);
check('Preload keys vs inventory', preloadKeys, 'preload.ts appBridge', inventory, 'APP_BRIDGE_METHODS');
const preloadInvoked = [...preloadChannels.values()].filter((c) => c.kind === 'invoke').map((c) => c.channel);
const preloadSubscribed = [...preloadChannels.values()].filter((c) => c.kind === 'on').map((c) => c.channel);
const keysWithoutChannel = preloadKeys.filter((key) => !preloadChannels.has(key));
findings.push({ label: 'Every preload key uses an IPC channel', ok: keysWithoutChannel.length === 0, onlyLeft: keysWithoutChannel, onlyRight: [], leftName: 'preload keys without channel', rightName: '', counts: [preloadKeys.length, preloadChannels.size] });
duplicates('Preload invoke channels are unique', preloadInvoked);
check('Preload invoke channels vs main ipcMain.handle', preloadInvoked, 'preload invoke', mainHandled, 'main handle');
duplicates('Main handlers are registered once', mainHandled);
check('Preload subscriptions vs main send channels', preloadSubscribed, 'preload on', [...new Set(mainSent)], 'main send');
check('Router validators vs RPC_BRIDGE_METHODS', validatorKeys, 'bridgeRouter validators', rpc, 'RPC_BRIDGE_METHODS');
subset('Router special cases are RPC methods', routerSpecialCases, 'router method === ...', rpc, 'RPC_BRIDGE_METHODS');
const dispatchedGenerically = rpc.filter((name) => !['resetUserData', 'recomputeAllSongDifficulties', 'addSong', 'deleteSong', 'bulkDeleteSongs'].includes(name));
subset('Generic RPC dispatch targets exist on AppDatabase', dispatchedGenerically, 'RPC (non-special)', dbPublicMethods, 'AppDatabase public methods');
subset('Every web-special method is handled explicitly in webBridge', special, 'WEB_SPECIAL_BRIDGE_METHODS', webHandled, 'webBridge property === ...');
subset('webBridge explicit names are contract methods', webHandled, 'webBridge property === ...', inventory, 'APP_BRIDGE_METHODS');
findings.push({ label: 'webBridge routes stubs via WEB_STUB_BRIDGE_METHOD_SET', ok: webUsesStubSet, onlyLeft: webUsesStubSet ? [] : ['WEB_STUB_BRIDGE_METHOD_SET.has(property) not found'], onlyRight: [], leftName: '', rightName: '', counts: [stub.length, stub.length] });
findings.push({ label: 'webBridge routes RPC via RPC_BRIDGE_METHOD_SET', ok: webUsesRpcSet, onlyLeft: webUsesRpcSet ? [] : ['RPC_BRIDGE_METHOD_SET.has(property) not found'], onlyRight: [], leftName: '', rightName: '', counts: [rpc.length, rpc.length] });

const rpcOverriddenInWeb = webHandled.filter((name) => rpc.includes(name));
const stubOverriddenInWeb = webHandled.filter((name) => stub.includes(name));

if (asJson) {
  console.log(JSON.stringify({
    rev: rev ?? 'working-tree',
    lists: { inventory, rpc, special, stub, appBridgeType, preloadKeys, preloadChannels: Object.fromEntries(preloadChannels), mainHandled, mainSent, validatorKeys, routerSpecialCases, webHandled },
    findings,
  }, null, 2));
} else {
  console.log(`AppBridge contract diff (${rev ? `rev ${rev}` : 'working tree'})`);
  console.log(`inventory=${inventory.length} rpc=${rpc.length} special=${special.length} stub=${stub.length} ` +
    `type=${appBridgeType.length} preload=${preloadKeys.length} mainHandle=${mainHandled.length} ` +
    `validators=${validatorKeys.length} webExplicit=${webHandled.length}`);
  for (const f of findings) {
    const detail = f.ok ? '' : `\n    only in ${f.leftName}: ${f.onlyLeft.join(', ') || '-'}` +
      (f.rightName ? `\n    only in ${f.rightName}: ${f.onlyRight.join(', ') || '-'}` : '');
    console.log(`${f.ok ? 'PASS' : 'FAIL'} ${f.label}${detail}`);
  }
  console.log(`NOTE router special cases: ${routerSpecialCases.join(', ')}`);
  console.log(`NOTE RPC methods overridden client-side in webBridge: ${rpcOverriddenInWeb.join(', ') || 'none'}`);
  console.log(`NOTE stub methods overridden client-side in webBridge: ${stubOverriddenInWeb.join(', ') || 'none'}`);
  console.log(`NOTE webBridge defines desktopStubNames: ${webHasDesktopStubNames ? 'yes' : 'no (stubs come from WEB_STUB_BRIDGE_METHODS)'}`);
  console.log(`NOTE stub methods: ${stub.join(', ')}`);
}

process.exitCode = findings.every((f) => f.ok) ? 0 : 1;
