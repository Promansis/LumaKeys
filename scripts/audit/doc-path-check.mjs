#!/usr/bin/env node
// Checks that the documents the audit depends on only name repository paths that
// exist. Read-only: it reads Markdown, lists the working tree, and runs
// `git ls-files`; it never writes.
//
// What it extracts from each document:
//   - relative Markdown links `[text](target#anchor)`; the anchor is checked against
//     the target's headings with GitHub's slug rules
//   - inline code spans that look like repository paths (`src/...`, `docs/...`,
//     `scripts/...`, root files such as `package.json`), with brace and glob expansion
//   - bare module names in code spans (`staticFiles.ts`), matched by basename anywhere
//     in the tree
//
// Each reference is classified as:
//   ok            exists and is tracked by git
//   untracked     exists on disk but is not tracked (a fresh clone will not have it)
//   generated     under build output (dist/, out/, release/); existence depends on a build
//   shorthand     not found as written but exists under src/ or scripts/audit/ (e.g. `main/index.ts`)
//   git-ref       a branch or tag name that looks like a path (`docs/audit-workflow`)
//   placeholder   template text such as <name>, YYYY-MM-DD, NNN, PH-LANE-NNN
//   runtime       absolute, home, $VAR, or ${...} paths that describe a host, not the repo
//   missing       does not exist (the actionable class)
//   missing-anchor  file exists, heading anchor does not
//
// Links under a "## Proposed Matrix Updates" heading resolve from docs/audit/, where
// the lead pastes them into coverage-matrix.md.
//   stale-line    a `file:line` citation points past the end of the file (the file moved on)
//
// Usage:
//   node scripts/audit/doc-path-check.mjs                 # default document set, missing only
//   node scripts/audit/doc-path-check.mjs --all           # print every classified reference
//   node scripts/audit/doc-path-check.mjs --json          # machine-readable output
//   node scripts/audit/doc-path-check.mjs --strict        # exit 1 if anything is missing outside templates
//   node scripts/audit/doc-path-check.mjs docs/foo.md ... # check only these documents
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, normalize, relative, resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '..', '..');
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const explicitDocs = args.filter((a) => !a.startsWith('--'));

const DEFAULT_DOC_GLOBS = [
  'CONTEXT.md',
  'README.md',
  'docs/agents/*.md',
  'docs/adr/*.md',
  'docs/audit/*.md',
  'docs/audit/reports/*.md',
  'docs/audit/templates/*.md',
];
const SKIP_DIRS = new Set(['.git', 'node_modules']);
const GENERATED_PREFIXES = ['dist/', 'out/', 'release/'];
const ROOT_FILES = /^(package(-lock)?\.json|Dockerfile|docker-compose\.ya?ml|\.dockerignore|\.gitignore|[A-Z][A-Z_]*\.md|tsconfig[\w.]*\.json|vite[\w.]*\.ts|vitest[\w.]*\.ts|electron\.vite\.config\.ts|DESIGN\.json)$/;
const TOP_DIRS = /^(src|docs|scripts|packaging|public|tests?|\.github|\.codex-audits|\.claude|\.agents|dist|out|release|scratch)\//;
const CODE_EXT = /\.(ts|tsx|mjs|cjs|js|json|md|ya?ml|css|html|sh|webm|mp4|png|svg|mid|midi|mscz)$/;
const PLACEHOLDER = /<[^>]+>|YYYY|MM-DD|NNN|\bN\b|PH-LANE|PH-<|\.\.\.|\bX{2,}\b|<tag>|\{id\}|:songId|:method/;

// ---------- working tree index ----------
const files = new Set();
const dirs = new Set(['']);
(function walk(abs, rel) {
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      dirs.add(r);
      if (!GENERATED_PREFIXES.some((p) => `${r}/`.startsWith(p)) || r.split('/').length < 3) walk(join(abs, entry.name), r);
    } else {
      files.add(r);
    }
  }
})(REPO, '');
const tracked = new Set(execFileSync('git', ['-C', REPO, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean));
const trackedDirs = new Set(['']);
for (const f of tracked) { let d = dirname(f); while (d && d !== '.' && !trackedDirs.has(d)) { trackedDirs.add(d); d = dirname(d); } }
const gitRefs = new Set(execFileSync('git', ['-C', REPO, 'for-each-ref', '--format=%(refname:short)'], { encoding: 'utf8' }).split('\n').filter(Boolean).flatMap((r) => [r, r.replace(/^[^/]+\//, '')]));
const byBasename = new Map();
for (const f of files) { const b = basename(f); byBasename.set(b, [...(byBasename.get(b) ?? []), f]); }

// ---------- helpers ----------
function expandBraces(p) {
  const m = p.match(/\{([^{}]*)\}/);
  if (!m) return [p];
  return m[1].split(',').flatMap((alt) => expandBraces(p.replace(m[0], alt)));
}
function globToRegex(g) {
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') { re += '.*'; i++; if (g[i + 1] === '/') i++; }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}/?$`);
}
function lookup(rel) {
  const clean = normalize(rel).replace(/\/+$/, '').replace(/^\.\//, '');
  if (clean.startsWith('..')) return { exists: false };
  if (/[*?]/.test(clean)) {
    const re = globToRegex(clean);
    const hit = [...files, ...dirs].find((p) => re.test(p));
    if (!hit) return { exists: false };
    return { exists: true, tracked: tracked.has(hit) || trackedDirs.has(hit), resolved: clean };
  }
  if (files.has(clean)) return { exists: true, tracked: tracked.has(clean), resolved: clean, isFile: true };
  if (dirs.has(clean)) return { exists: true, tracked: trackedDirs.has(clean), resolved: clean };
  // Inside a generated tree we did not index deeply, fall back to the filesystem.
  if (existsSync(join(REPO, clean))) return { exists: true, tracked: tracked.has(clean), resolved: clean, isFile: statSync(join(REPO, clean)).isFile() };
  return { exists: false };
}
function slug(heading) {
  return heading.trim().toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}
const anchorCache = new Map();
function anchorsOf(rel) {
  if (anchorCache.has(rel)) return anchorCache.get(rel);
  const set = new Set();
  const counts = new Map();
  let inFence = false;
  for (const line of readFileSync(join(REPO, rel), 'utf8').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (!m) continue;
    const base = slug(m[1]);
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    set.add(n === 0 ? base : `${base}-${n}`);
  }
  for (const m of readFileSync(join(REPO, rel), 'utf8').matchAll(/<a\s+(?:name|id)="([^"]+)"/g)) set.add(m[1]);
  anchorCache.set(rel, set);
  return set;
}
function isTemplate(doc) { return doc.startsWith('docs/audit/templates/') || /(^|\/)0000-template\.md$/.test(doc); }

// ---------- classification ----------
function classifyPath(doc, raw, kind) {
  const text = raw.trim().replace(/[),.;:]+$/, '');
  if (!text) return null;
  if (/^(https?:|mailto:|data:|file:)/.test(text)) return null;
  if (/^(\$|~|\/(?!media\/storage\/LumaKeys\/))/.test(text) || /\$\{/.test(text) || /^[A-Z]:\\/.test(text) || /%[A-Z]+%/.test(text)) return { class: 'runtime' };
  if (PLACEHOLDER.test(text)) return { class: 'placeholder' };
  if (kind === 'path' && gitRefs.has(text) && !lookup(text).exists) return { class: 'git-ref' };
  const [pathPart, anchor] = text.split('#');
  if (!pathPart) {
    // Same-document anchor.
    if (kind !== 'link' || !anchor) return null;
    return anchorsOf(doc).has(anchor) ? { class: 'ok' } : { class: 'missing-anchor', detail: `#${anchor}` };
  }
  let repoRel = pathPart.replace(/^\/media\/storage\/LumaKeys\//, '').replace(/\?.*$/, '');
  // file:line and file:start-end citations: check the file, then that the lines exist.
  const lineRef = repoRel.match(/^(.*\.[A-Za-z0-9]+):(\d+)(?:-(\d+))?$/);
  if (lineRef) repoRel = lineRef[1];
  try { repoRel = decodeURIComponent(repoRel); } catch {}
  const candidates = [];
  for (const variant of expandBraces(repoRel)) {
    const fromDoc = relative(REPO, resolve(REPO, dirname(doc), variant));
    if (kind === 'link') candidates.push([variant, pathPart.startsWith('/media/storage/LumaKeys/') ? variant : fromDoc]);
    else candidates.push([variant, variant, fromDoc, `docs/audit/${variant}`]);
  }
  const results = candidates.map(([variant, ...tries]) => {
    for (const t of tries) { const hit = lookup(t); if (hit.exists) return { variant, ...hit }; }
    return { variant, exists: false };
  });
  const missing = results.filter((r) => !r.exists);
  const isGenerated = (p) => GENERATED_PREFIXES.some((g) => `${p}/`.startsWith(g));
  if (missing.length) {
    if (missing.every((r) => isGenerated(r.variant))) return { class: 'generated', detail: 'not present in this checkout' };
    for (const root of ['src/', 'scripts/audit/']) {
      if (kind === 'path' && missing.every((r) => lookup(`${root}${r.variant}`).exists)) return { class: 'shorthand', detail: missing.map((r) => `${root}${r.variant}`).join(', ') };
    }
    return { class: 'missing', detail: missing.map((r) => r.variant).join(', ') };
  }
  if (results.every((r) => isGenerated(r.resolved ?? r.variant))) return { class: 'generated' };
  if (anchor && kind === 'link') {
    const target = results[0];
    if (target.isFile && target.resolved.endsWith('.md') && !anchorsOf(target.resolved).has(anchor)) return { class: 'missing-anchor', detail: `${target.resolved}#${anchor}` };
  }
  if (lineRef && results[0]?.isFile) {
    const lastLine = Number(lineRef[3] ?? lineRef[2]);
    const length = readFileSync(join(REPO, results[0].resolved), 'utf8').split('\n').length;
    if (lastLine > length) return { class: 'stale-line', detail: `file has ${length} lines` };
  }
  if (results.some((r) => !r.tracked)) return { class: 'untracked', detail: results.filter((r) => !r.tracked).map((r) => r.resolved).join(', ') };
  return { class: 'ok' };
}

function looksLikeRepoPath(span) {
  const s = span.trim();
  if (!s || /\s/.test(s.replace(/\{[^}]*\}/g, ''))) return false; // commands and prose, not paths
  if (/^(https?:|npm |npx |node |git )/.test(s)) return false;
  if (/^\/media\/storage\/LumaKeys\//.test(s)) return true;
  if (TOP_DIRS.test(s)) return true;
  if (ROOT_FILES.test(s)) return true;
  if (/^\.{1,2}\//.test(s) && CODE_EXT.test(s)) return true;
  if (s.includes('/') && CODE_EXT.test(s) && !s.startsWith('/') && !s.includes('://')) return true;
  return false;
}
function looksLikeBareModule(span) {
  const s = span.trim();
  return /^\w[\w.-]*\.(ts|tsx|mjs|cjs|md|ya?ml|sh)$/.test(s) && !ROOT_FILES.test(s);
}

// ---------- document set ----------
function expandDocGlob(g) {
  const re = globToRegex(g);
  return [...files].filter((f) => re.test(f)).sort();
}
const docs = explicitDocs.length ? explicitDocs.map((d) => relative(REPO, resolve(d))) : [...new Set(DEFAULT_DOC_GLOBS.flatMap(expandDocGlob))];

// ---------- scan ----------
const findings = [];
for (const doc of docs) {
  if (!existsSync(join(REPO, doc))) { findings.push({ doc, line: 0, kind: 'document', ref: doc, class: 'missing' }); continue; }
  const lines = readFileSync(join(REPO, doc), 'utf8').split('\n');
  let inFence = false;
  // Links under a "Proposed Matrix Updates" heading are cells meant for
  // docs/audit/coverage-matrix.md, so they resolve from there, not from the report.
  let linkBase = doc;
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return; }
    if (!inFence && /^#{1,6}\s/.test(line)) linkBase = /^##\s+Proposed Matrix Updates\b/i.test(line) ? 'docs/audit/coverage-matrix.md' : doc;
    const seen = new Set();
    const push = (kind, ref, res) => { if (!res || seen.has(`${kind}:${ref}`)) return; seen.add(`${kind}:${ref}`); findings.push({ doc, line: i + 1, kind, ref, ...res }); };
    if (!inFence) {
      // Link syntax inside a code span is literal text, not a link (for example a
      // proposed matrix cell quoted in a report), so brackets in code spans are blanked.
      const linkText = line.replace(/`[^`]*`/g, (span) => span.replace(/[[\]()]/g, ' '));
      for (const m of linkText.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) push('link', m[1], classifyPath(linkBase, m[1], 'link'));
    }
    // Code spans (outside fences) and whole fenced lines are both scanned for paths.
    const spans = inFence ? line.split(/\s+/) : [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    for (const span of spans) {
      const candidate = inFence ? span.replace(/^["'(]+|["'),;]+$/g, '') : span;
      if (looksLikeRepoPath(candidate)) push('path', candidate, classifyPath(doc, candidate, 'path'));
      else if (!inFence && looksLikeBareModule(candidate)) {
        const name = candidate.trim();
        const res = PLACEHOLDER.test(name) ? { class: 'placeholder' } : byBasename.has(name) ? { class: 'ok', detail: byBasename.get(name).slice(0, 2).join(', ') } : { class: 'missing', detail: 'no file with this basename' };
        push('module', name, res);
      }
    }
  });
}

// ---------- report ----------
const actionable = (f) => f.class === 'missing' || f.class === 'missing-anchor' || f.class === 'stale-line';
const counts = {};
for (const f of findings) counts[f.class] = (counts[f.class] ?? 0) + 1;
if (flags.has('--json')) {
  console.log(JSON.stringify({ repo: REPO, documents: docs.length, counts, findings: flags.has('--all') ? findings : findings.filter((f) => actionable(f) || f.class === 'untracked') }, null, 2));
} else {
  console.log(`doc-path-check: ${docs.length} documents, ${findings.length} references`);
  console.log(`counts: ${Object.entries(counts).sort().map(([k, v]) => `${k}=${v}`).join(' ')}`);
  const show = findings.filter((f) => flags.has('--all') || actionable(f) || f.class === 'untracked');
  let current = '';
  for (const f of show) {
    if (f.doc !== current) { current = f.doc; console.log(`\n${f.doc}${isTemplate(f.doc) ? '  (template)' : ''}`); }
    console.log(`  ${String(f.line).padStart(4)}  ${f.class.padEnd(14)} ${f.kind.padEnd(6)} ${f.ref}${f.detail ? `  [${f.detail}]` : ''}`);
  }
}
if (flags.has('--strict') && findings.some((f) => actionable(f) && !isTemplate(f.doc))) process.exitCode = 1;
