#!/usr/bin/env node
// Recounts the Lane Completion Summary in docs/audit/coverage-matrix.md from the
// actual rows, per the charter rule "update counts from the tables; do not estimate".
//
// Usage:
//   node scripts/audit/recount-coverage.mjs          # print the recounted table
//   node scripts/audit/recount-coverage.mjs --write  # rewrite the summary rows in place
//   node scripts/audit/recount-coverage.mjs --check  # exit 1 if the file is stale
//
// Counting rules:
//   Total        = rows whose first cell matches <PREFIX>-NNN inside the section.
//   Covered      = rows whose Status cell is exactly `covered`.
//   Gap/blocked  = rows whose Status cell is `gap` or `blocked`.
//   Open findings = distinct PH-/BASE- finding IDs referenced anywhere in the row.
//                  (This counts referenced findings, not ledger status; the ledger
//                  remains canonical for status.)
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MATRIX_PATH = resolve(import.meta.dirname, '../../docs/audit/coverage-matrix.md');
const SECTIONS = [
  { heading: 'User Workflows', label: 'User workflows' },
  { heading: 'Supported Runtimes And UI Conditions', label: 'Runtime/UI conditions' },
  { heading: 'Durable Entities And Stores', label: 'Durable entities/stores' },
  { heading: 'AppBridge Contract', label: 'AppBridge methods' },
  { heading: 'Privileged And Destructive Operations', label: 'Privileged/destructive operations' },
  { heading: 'High-Risk Modules And Operations Surfaces', label: 'High-risk modules/operations' },
];
const SUMMARY_HEADING = 'Lane Completion Summary';
const ROW_ID = /^\|\s*[A-Z]+-\d{3}\s*\|/;
const FINDING_ID = /\b(?:PH|BASE)-[A-Z]+-\d{3}\b/g;

const args = new Set(process.argv.slice(2));
const source = readFileSync(MATRIX_PATH, 'utf8');
const lines = source.split('\n');

function sectionLines(heading) {
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) {
    throw new Error(`Section "## ${heading}" not found in ${MATRIX_PATH}`);
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith('## ')) {
      end = i;
      break;
    }
  }
  return { start, end, body: lines.slice(start, end) };
}

function cells(line) {
  return line.split('|').slice(1, -1).map((cell) => cell.trim());
}

function countSection(heading) {
  const { body } = sectionLines(heading);
  const header = body.find((line) => /^\|\s*ID\s*\|/.test(line));
  if (!header) {
    throw new Error(`No table header with an ID column under "## ${heading}"`);
  }
  const statusIndex = cells(header).findIndex((cell) => cell.toLowerCase() === 'status');
  if (statusIndex === -1) {
    throw new Error(`No Status column under "## ${heading}"`);
  }
  const rows = body.filter((line) => ROW_ID.test(line));
  const findings = new Set();
  let covered = 0;
  let gapOrBlocked = 0;
  const unknownStatuses = new Map();
  for (const row of rows) {
    const status = (cells(row)[statusIndex] ?? '').toLowerCase();
    if (status === 'covered') {
      covered += 1;
    } else if (status === 'gap' || status === 'blocked') {
      gapOrBlocked += 1;
    } else {
      unknownStatuses.set(status, (unknownStatuses.get(status) ?? 0) + 1);
    }
    for (const id of row.match(FINDING_ID) ?? []) {
      findings.add(id);
    }
  }
  return { total: rows.length, covered, gapOrBlocked, openFindings: findings.size, unknownStatuses };
}

const counts = SECTIONS.map((section) => ({ ...section, ...countSection(section.heading) }));

const summary = sectionLines(SUMMARY_HEADING);
const summaryRows = new Map();
for (const line of summary.body) {
  if (!line.startsWith('|') || /^\|\s*Lane\/dimension/.test(line) || /^\|\s*-+/.test(line)) {
    continue;
  }
  const [label, , , , , signOff] = cells(line);
  summaryRows.set(label, signOff ?? '');
}

const renderedRows = counts.map((c) => {
  const signOff = summaryRows.get(c.label) ?? 'TBD';
  return `| ${c.label} | ${c.total} | ${c.covered} | ${c.gapOrBlocked} | ${c.openFindings} | ${signOff} |`;
});

let stale = false;
for (const c of counts) {
  const existing = summary.body.find((line) => line.startsWith(`| ${c.label} |`));
  const expected = renderedRows.find((line) => line.startsWith(`| ${c.label} |`));
  if (!existing) {
    console.error(`Summary row missing for "${c.label}"`);
    stale = true;
  } else {
    const existingNumbers = cells(existing).slice(1, 5).join(',');
    const expectedNumbers = cells(expected).slice(1, 5).join(',');
    if (existingNumbers !== expectedNumbers) {
      stale = true;
    }
  }
  for (const [status, n] of c.unknownStatuses) {
    console.error(`warning: ${n} row(s) under "${c.heading}" have status "${status || '<empty>'}" (counted as neither covered nor gap)`);
  }
}

if (args.has('--write')) {
  const rebuilt = [...lines];
  for (const row of renderedRows) {
    const label = cells(row)[0];
    const index = rebuilt.findIndex((line, i) => i > summary.start && i < summary.end && line.startsWith(`| ${label} |`));
    if (index === -1) {
      throw new Error(`Cannot rewrite: summary row for "${label}" missing. Add it manually once.`);
    }
    rebuilt[index] = row;
  }
  writeFileSync(MATRIX_PATH, rebuilt.join('\n'));
  console.log(`Rewrote ${counts.length} summary rows in ${MATRIX_PATH}`);
} else {
  console.log('| Lane/dimension | Total | Covered | Gap/blocked | Open findings | Owner sign-off |');
  console.log('|---|---:|---:|---:|---:|---|');
  for (const row of renderedRows) {
    console.log(row);
  }
  if (stale) {
    console.log('\nSummary table is STALE relative to the rows above. Run with --write to update it.');
    if (args.has('--check')) {
      process.exit(1);
    }
  } else {
    console.log('\nSummary table matches the rows.');
  }
}
