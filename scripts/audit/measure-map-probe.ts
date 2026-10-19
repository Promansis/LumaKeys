// Phase 11 lane C measure-map probe (audit tool; not part of the product build).
//
// Usage, from the repository root:
//   npx tsx scripts/audit/measure-map-probe.ts <file.mid> [more.mid ...] [--oracle oracle.json] [--json]
//
// For each MIDI file it:
//   1. reads raw tempo, time-signature, and note events with `midi-file` and builds an
//      independent Standard MIDI File reference (120 BPM and 4/4 until the first events);
//   2. runs the product parser (`parseMidiFile`) and the measure consumers in
//      `songUtils.ts` (measure index, measure count, loop range) and `GameSession`
//      (loop scheduling and per-measure accuracy buckets, controlled clock, tempo 0.5);
//   3. compares the product output with the reference, and with a hand-written oracle
//      when `--oracle` names a JSON file keyed by the MIDI basename (without `.mid`).
//
// The product truncates the final measure at the last note-off tick (PH-MUS-002 fix);
// the reference reports the musical barline separately and does not count that as a
// failure. Exit code is 1 when any check fails.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import midiFile from 'midi-file';
import { parseMidiFile } from '../../src/lib/midi/midiFileParser';
import {
  filterSongByHand,
  getLoopRangeSeconds,
  getMeasureCount,
  getMeasureIndexForTime,
} from '../../src/lib/game/songUtils';
import { GameSession } from '../../src/lib/game/GameSession';
import type { ParsedSong, SessionConfig } from '../../src/lib/game/types';

const { parseMidi } = midiFile as unknown as { parseMidi: (data: Uint8Array) => RawMidi };

interface RawEvent { deltaTime: number; type: string; [key: string]: unknown }
interface RawMidi { header: { format: number; ticksPerBeat?: number }; tracks: RawEvent[][] }

interface OracleEntry {
  boundaries?: Array<[number, number, number, number]>;
  noteMeasure?: Record<string, number>;
  noteSec?: Record<string, number>;
  loops?: Array<{ range: [number, number]; sec: [number, number]; noteTicks: number[] }>;
  durationSec?: number;
  startBpm?: number;
  measureCount?: number;
}

const EPS = 1e-6;
const args = process.argv.slice(2);
const oracleIndex = args.indexOf('--oracle');
const oracle: Record<string, OracleEntry> = oracleIndex >= 0 ? JSON.parse(readFileSync(args[oracleIndex + 1], 'utf8')) : {};
const asJson = args.includes('--json');
const files = args.filter((arg, index) => (arg.endsWith('.mid') || arg.endsWith('.midi')) && (oracleIndex < 0 || index !== oracleIndex + 1));

const SESSION: SessionConfig = {
  mode: 'luma-keys',
  tempoMultiplier: 1,
  handFilter: 'both',
  loopRange: null,
  waitForInput: false,
  metronomeEnabled: false,
  handSize: 'medium',
  fingeringDisplayMode: 'never',
  pitchBendEnabled: false,
  latencyCompMs: 0,
  hitWindowMs: 100,
  beatsVisible: 8,
  leadInBeats: 0,
};

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function buildReference(raw: RawMidi) {
  const ppq = raw.header.ticksPerBeat ?? 480;
  const tempos: Array<{ tick: number; usPerQn: number }> = [];
  const signatures: Array<{ tick: number; n: number; d: number }> = [];
  const noteOns = new Map<string, number[]>();
  const notes: Array<{ tick: number; endTick: number; midi: number }> = [];
  raw.tracks.forEach((track, trackIndex) => {
    let tick = 0;
    for (const event of track) {
      tick += event.deltaTime;
      if (event.type === 'setTempo') tempos.push({ tick, usPerQn: event.microsecondsPerBeat as number });
      if (event.type === 'timeSignature') signatures.push({ tick, n: event.numerator as number, d: event.denominator as number });
      const key = `${trackIndex}:${event.channel}:${event.noteNumber}`;
      const isOn = event.type === 'noteOn' && (event.velocity as number) > 0;
      const isOff = event.type === 'noteOff' || (event.type === 'noteOn' && (event.velocity as number) === 0);
      if (isOn) noteOns.set(key, [...(noteOns.get(key) ?? []), tick]);
      if (isOff) {
        const starts = noteOns.get(key);
        const start = starts?.shift();
        if (start !== undefined) notes.push({ tick: start, endTick: tick, midi: event.noteNumber as number });
      }
    }
  });
  tempos.sort((a, b) => a.tick - b.tick);
  signatures.sort((a, b) => a.tick - b.tick);
  if (tempos.length === 0 || tempos[0].tick > 0) tempos.unshift({ tick: 0, usPerQn: 500000 });
  if (signatures.length === 0 || signatures[0].tick > 0) signatures.unshift({ tick: 0, n: 4, d: 4 });

  const seconds = (tick: number): number => {
    let total = 0;
    for (let i = 0; i < tempos.length; i += 1) {
      const start = tempos[i].tick;
      if (start >= tick) break;
      const end = Math.min(tick, tempos[i + 1]?.tick ?? Infinity);
      total += ((end - start) / ppq) * (tempos[i].usPerQn / 1e6);
    }
    return total;
  };

  const lastTick = Math.max(0, ...notes.map((note) => note.endTick));
  const bars: Array<{ startTick: number; barlineTick: number; meter: string; midBarSignature: boolean }> = [];
  let tick = 0;
  let sigIndex = 0;
  while (tick < lastTick) {
    while (sigIndex + 1 < signatures.length && signatures[sigIndex + 1].tick <= tick) sigIndex += 1;
    const sig = signatures[sigIndex];
    const length = (ppq * 4 * sig.n) / sig.d;
    const nextSig = signatures[sigIndex + 1]?.tick;
    const midBar = nextSig !== undefined && nextSig > tick && nextSig < tick + length;
    const barlineTick = midBar ? nextSig! : tick + length;
    bars.push({ startTick: tick, barlineTick, meter: `${sig.n}/${sig.d}`, midBarSignature: midBar });
    tick = barlineTick;
  }
  return {
    ppq,
    tempos: tempos.map((t) => ({ tick: t.tick, bpm: round(60000000 / t.usPerQn) })),
    signatures: signatures.map((s) => ({ tick: s.tick, meter: `${s.n}/${s.d}` })),
    lastTick,
    notes: notes.sort((a, b) => a.tick - b.tick || a.midi - b.midi),
    bars,
    seconds,
  };
}

function runSession(song: ParsedSong, loopRange: { startMeasure: number; endMeasure: number } | null, tempo: number) {
  const session = new GameSession(song, { ...SESSION, loopRange, tempoMultiplier: tempo });
  const { startSec, endSec } = getLoopRangeSeconds(song, loopRange);
  const scheduled = song.notes
    .filter((note) => note.startSec >= startSec && note.startSec < endSec)
    .sort((a, b) => a.startSec - b.startSec || a.midi - b.midi);
  session.play(0);
  for (const note of scheduled) {
    const timestamp = ((note.startSec - startSec) / tempo) * 1000;
    session.ingestInputEvent({ type: 'noteon', source: 'computer-keyboard', sourceId: 'probe', timestamp, note: note.midi, velocity: 100 });
    session.ingestInputEvent({ type: 'noteoff', source: 'computer-keyboard', sourceId: 'probe', timestamp: timestamp + 1, note: note.midi, velocity: 0 });
  }
  const result = session.getFinalResult();
  return { startSec, endSec, scheduledTicks: scheduled.map((note) => note.ticks ?? -1), result };
}

let failures = 0;
const report: Record<string, unknown> = {};
for (const file of files) {
  const name = basename(file).replace(/\.midi?$/i, '');
  const bytes = readFileSync(file);
  const raw = parseMidi(new Uint8Array(bytes));
  const ref = buildReference(raw);
  const song = parseMidiFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { songId: name, title: name });
  const boundaries = song.measureBoundaries ?? [];
  const checks: Array<{ check: string; ok: boolean; detail?: unknown }> = [];
  const check = (label: string, ok: boolean, detail?: unknown) => {
    checks.push({ check: label, ok, ...(ok ? {} : { detail }) });
    if (!ok) failures += 1;
  };

  // Reference comparison
  check('measure count equals reference bar count', boundaries.length === ref.bars.length, { product: boundaries.length, reference: ref.bars.length });
  ref.bars.forEach((bar, index) => {
    const product = boundaries[index];
    if (!product) return;
    const isLast = index === ref.bars.length - 1;
    const expectedEndTick = isLast ? Math.min(bar.barlineTick, ref.lastTick) : bar.barlineTick;
    check(`bar ${index + 1} ticks [${bar.startTick}, ${expectedEndTick}]`, product.startTick === bar.startTick && product.endTick === expectedEndTick, { product: [product.startTick, product.endTick] });
    const startSec = ref.seconds(bar.startTick);
    const endSec = ref.seconds(expectedEndTick);
    check(`bar ${index + 1} seconds [${round(startSec)}, ${round(endSec)}] (SMF tempo map)`, Math.abs(product.startSec - startSec) < EPS && Math.abs(product.endSec - endSec) < EPS, { product: [round(product.startSec), round(product.endSec)] });
  });
  const noteSecMismatches = song.notes
    .filter((note) => note.ticks !== undefined && Math.abs(note.startSec - ref.seconds(note.ticks)) > EPS)
    .map((note) => ({ tick: note.ticks, product: round(note.startSec), reference: round(ref.seconds(note.ticks!)) }));
  check('note start seconds follow the SMF tempo map', noteSecMismatches.length === 0, noteSecMismatches.slice(0, 6));
  check('song BPM equals the tempo in force at tick 0', Math.abs(song.bpm - ref.tempos[0].bpm) < EPS, { product: song.bpm, reference: ref.tempos[0].bpm });

  // Consumer agreement: every note's measure index must be the bar whose ticks contain it.
  const consumerMismatches = song.notes.flatMap((note) => {
    const expected = ref.bars.findIndex((bar, i) => note.ticks! >= bar.startTick && (i === ref.bars.length - 1 || note.ticks! < bar.barlineTick));
    const actual = getMeasureIndexForTime(song, note.startSec);
    return expected === actual ? [] : [{ tick: note.ticks, expected, actual }];
  });
  check('getMeasureIndexForTime agrees with reference bars for every note', consumerMismatches.length === 0, consumerMismatches.slice(0, 6));
  check('getMeasureCount equals boundary count', getMeasureCount(song) === boundaries.length, getMeasureCount(song));
  check('hand filter keeps measure boundaries', filterSongByHand(song, 'right').measureBoundaries === song.measureBoundaries && filterSongByHand(song, 'left').measureBoundaries === song.measureBoundaries);

  // GameSession: every measure as a one-bar loop, plus the full song at 0.5 tempo.
  const sessionProblems: unknown[] = [];
  boundaries.forEach((boundary, index) => {
    const run = runSession(song, { startMeasure: index, endMeasure: index }, 1);
    const expectedTicks = song.notes.filter((note) => getMeasureIndexForTime(song, note.startSec) === index).map((note) => note.ticks);
    const buckets = run.result.measureAccuracy.map((entry) => entry.measure);
    const loopOk = Math.abs(run.startSec - boundary.startSec) < EPS && Math.abs(run.endSec - boundary.endSec) < EPS;
    const notesOk = JSON.stringify([...run.scheduledTicks].sort((a, b) => a - b)) === JSON.stringify([...expectedTicks].sort((a, b) => (a ?? 0) - (b ?? 0)));
    const bucketsOk = expectedTicks.length === 0 ? buckets.length === 0 : buckets.length === 1 && buckets[0] === index;
    const hitsOk = run.result.perfectHits === expectedTicks.length && run.result.misses === 0;
    if (!loopOk || !notesOk || !bucketsOk || !hitsOk) sessionProblems.push({ measure: index, loop: [round(run.startSec), round(run.endSec)], scheduled: run.scheduledTicks, expectedTicks, buckets, perfect: run.result.perfectHits, misses: run.result.misses });
  });
  check('GameSession one-bar loops schedule exactly that bar and bucket it under the same index', sessionProblems.length === 0, sessionProblems.slice(0, 4));
  const full = runSession(song, null, 0.5);
  const expectedBuckets = [...new Set(song.notes.map((note) => getMeasureIndexForTime(song, note.startSec)))].sort((a, b) => a - b);
  check('GameSession full run at tempo 0.5 buckets every note under its measure', JSON.stringify(full.result.measureAccuracy.map((e) => e.measure)) === JSON.stringify(expectedBuckets) && full.result.perfectHits === song.notes.length, { buckets: full.result.measureAccuracy, perfect: full.result.perfectHits, notes: song.notes.length });

  // Hand-written oracle
  const entry = oracle[name];
  if (entry) {
    if (entry.boundaries) {
      const actual = boundaries.map((b) => [b.startTick, b.endTick, round(b.startSec), round(b.endSec)]);
      const ok = entry.boundaries.length === actual.length && entry.boundaries.every((b, i) => b[0] === actual[i][0] && b[1] === actual[i][1] && Math.abs(b[2] - actual[i][2]) < 1e-5 && Math.abs(b[3] - actual[i][3]) < 1e-5);
      check('oracle: boundaries', ok, { oracle: entry.boundaries, product: actual });
    }
    if (entry.measureCount !== undefined) check('oracle: measure count', getMeasureCount(song) === entry.measureCount, getMeasureCount(song));
    for (const [tick, measure] of Object.entries(entry.noteMeasure ?? {})) {
      const note = song.notes.find((n) => n.ticks === Number(tick));
      const actual = note ? getMeasureIndexForTime(song, note.startSec) : 'no note';
      check(`oracle: note at tick ${tick} in measure index ${measure}`, actual === measure, actual);
    }
    for (const [tick, sec] of Object.entries(entry.noteSec ?? {})) {
      const note = song.notes.find((n) => n.ticks === Number(tick));
      check(`oracle: note at tick ${tick} starts at ${sec}s`, note !== undefined && Math.abs(note.startSec - sec) < 1e-5, note ? round(note.startSec) : 'no note');
    }
    for (const loop of entry.loops ?? []) {
      const run = runSession(song, { startMeasure: loop.range[0], endMeasure: loop.range[1] }, 1);
      check(`oracle: loop ${loop.range.join('-')} is [${loop.sec.join(', ')}]s with notes ${loop.noteTicks.join(',')}`,
        Math.abs(run.startSec - loop.sec[0]) < 1e-5 && Math.abs(run.endSec - loop.sec[1]) < 1e-5 && JSON.stringify(run.scheduledTicks) === JSON.stringify(loop.noteTicks),
        { sec: [round(run.startSec), round(run.endSec)], notes: run.scheduledTicks });
    }
    if (entry.durationSec !== undefined) check(`oracle: durationSec ${entry.durationSec}`, Math.abs(song.durationSec - entry.durationSec) < 1e-5, song.durationSec);
    if (entry.startBpm !== undefined) check(`oracle: song BPM ${entry.startBpm}`, Math.abs(song.bpm - entry.startBpm) < 1e-5, song.bpm);
  }

  const summary = {
    file,
    ppq: ref.ppq,
    tempos: ref.tempos,
    signatures: ref.signatures,
    lastNoteOffTick: ref.lastTick,
    tracks: song.tracks.map((t) => `${t.name} (${t.assignment})`),
    referenceBars: ref.bars.map((b) => ({ ...b, startSec: round(ref.seconds(b.startTick)), barlineSec: round(ref.seconds(b.barlineTick)) })),
    productBoundaries: boundaries.map((b) => [b.startTick, b.endTick, round(b.startSec), round(b.endSec)]),
    productBpm: song.bpm,
    productDurationSec: round(song.durationSec),
    checks,
  };
  report[name] = summary;
  if (!asJson) {
    console.log(`\n== ${name}  (ppq ${ref.ppq}; tempos ${JSON.stringify(ref.tempos)}; meters ${JSON.stringify(ref.signatures)}; last note-off ${ref.lastTick}; tracks ${summary.tracks.join(', ')})`);
    console.log(`   product boundaries ${JSON.stringify(summary.productBoundaries)}  bpm ${song.bpm}  durationSec ${summary.productDurationSec}`);
    console.log(`   reference bars     ${JSON.stringify(summary.referenceBars.map((b) => [b.startTick, b.barlineTick, b.startSec, b.barlineSec, b.meter]))}`);
    if (ref.bars.some((b) => b.midBarSignature)) console.log('   note: a time signature event falls inside a bar; both sides start a new bar at it');
    for (const c of checks) console.log(`   ${c.ok ? 'PASS' : 'FAIL'}  ${c.check}${c.ok ? '' : `  ${JSON.stringify(c.detail)}`}`);
  }
}
if (asJson) console.log(JSON.stringify(report, null, 1));
console.log(`\n${files.length} file(s), ${failures} failed check(s)`);
process.exitCode = failures > 0 ? 1 : 0;
