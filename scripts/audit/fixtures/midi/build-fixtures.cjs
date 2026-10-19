// Phase 11 lane C: builds the measure-map MIDI fixtures in this directory (raw events via midi-file).
// Usage: node scripts/audit/fixtures/midi/build-fixtures.cjs scripts/audit/fixtures/midi
const fs = require('fs');
const path = require('path');
const { writeMidi } = require('/media/storage/LumaKeys/node_modules/midi-file');
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const PPQ = 480;
function track0(events) { // events: [{tick, kind, ...}]
  return toDelta([{ tick: 0, type: 'trackName', text: 'Conductor' }, ...events]);
}
function ts(tick, n, d) { return { tick, type: 'timeSignature', numerator: n, denominator: d, metronome: 24, thirtyseconds: 8 }; }
function tempo(tick, bpm) { return { tick, type: 'setTempo', microsecondsPerBeat: Math.round(60000000 / bpm) }; }
function noteTrack(name, notes) { // notes: [tick, dur, midi]
  const ev = [{ tick: 0, type: 'trackName', text: name }];
  for (const [tick, dur, midi] of notes) {
    ev.push({ tick, type: 'noteOn', channel: 0, noteNumber: midi, velocity: 90, order: 1 });
    ev.push({ tick: tick + dur, type: 'noteOff', channel: 0, noteNumber: midi, velocity: 0, order: 0 });
  }
  return toDelta(ev);
}
function toDelta(events) {
  const sorted = events.map((e, i) => ({ ...e, i })).sort((a, b) => a.tick - b.tick || (a.order ?? 0) - (b.order ?? 0) || a.i - b.i);
  let last = 0;
  const res = sorted.map(({ tick, i, order, ...e }) => { const d = tick - last; last = tick; return { deltaTime: d, ...e }; });
  res.push({ deltaTime: 0, type: 'endOfTrack' });
  return res;
}
function write(name, conductor, notes, trackName = 'Right') {
  const data = { header: { format: 1, numTracks: 2, ticksPerBeat: PPQ }, tracks: [track0(conductor), noteTrack(trackName, notes)] };
  fs.writeFileSync(path.join(out, name + '.mid'), Buffer.from(writeMidi(data)));
}
const scale = [60, 62, 64, 65, 67, 69, 71, 72];
const p = (i) => scale[i % scale.length];
// pure 6/8: 18 eighths, full length, last ends 4320
write('pure-6-8', [tempo(0, 120), ts(0, 6, 8)], Array.from({ length: 18 }, (_, i) => [i * 240, 240, p(i)]));
// 6/8 then 3/4 with notes reaching the 3/4 bars
write('6-8-then-3-4-reached', [tempo(0, 120), ts(0, 6, 8), ts(2880, 3, 4)], [
  ...Array.from({ length: 12 }, (_, i) => [i * 240, 240, p(i)]),
  ...Array.from({ length: 6 }, (_, i) => [2880 + i * 480, 480, p(i)]),
]);
// 3/4 then 4/4, tempo 120 -> 60 at tick 3840 (beat 3 of bar 3); last note ends 6240 (mid bar 4)
write('3-4-to-4-4-tempo', [tempo(0, 120), ts(0, 3, 4), ts(2880, 4, 4), tempo(3840, 60)], Array.from({ length: 13 }, (_, i) => [i * 480, 480, p(i)]));
// MuseScore-style pickup: 1/4 bar then 4/4
write('pickup-ts-1-4', [tempo(0, 120), ts(0, 1, 4), ts(480, 4, 4)], [[0, 480, 67], [480, 480, 60], [960, 480, 62], [1440, 480, 64], [1920, 480, 65], [2400, 1920, 67]]);
// pickup encoded as rest in a full 4/4 bar
write('pickup-as-rest', [tempo(0, 120), ts(0, 4, 4)], [[1440, 480, 67], [1920, 480, 60], [2400, 480, 62], [2880, 480, 64], [3360, 480, 65], [3840, 1920, 67]]);
// exact final barline, no time signature event (default 4/4)
write('exact-end-no-ts', [tempo(0, 120)], [[0, 960, 60], [960, 960, 62], [1920, 960, 64], [2880, 960, 65]]);
// no tempo at tick 0; first tempo (60) at 1920
write('late-first-tempo', [ts(0, 4, 4), tempo(1920, 60)], Array.from({ length: 8 }, (_, i) => [i * 480, 480, p(i)]));
console.log(fs.readdirSync(out).join(' '));

// metro-3-4-late-note: 3/4 at 120 BPM, one C4 at tick 28800 (30 s), for metronome timing runs.
{
const t0 = [{ deltaTime: 0, type: 'trackName', text: 'Conductor' }, { deltaTime: 0, type: 'setTempo', microsecondsPerBeat: 500000 }, { deltaTime: 0, type: 'timeSignature', numerator: 3, denominator: 4, metronome: 24, thirtyseconds: 8 }, { deltaTime: 0, type: 'endOfTrack' }];
const t1 = [{ deltaTime: 0, type: 'trackName', text: 'Right' }, { deltaTime: 28800, type: 'noteOn', channel: 0, noteNumber: 60, velocity: 90 }, { deltaTime: 480, type: 'noteOff', channel: 0, noteNumber: 60, velocity: 0 }, { deltaTime: 0, type: 'endOfTrack' }];
fs.writeFileSync(path.join(out, "metro-3-4-late-note.mid"), Buffer.from(writeMidi({ header: { format: 1, numTracks: 2, ticksPerBeat: 480 }, tracks: [t0, t1] })));
}
// pmus-16: 16 quarter notes C4 D4 E4 F4 repeating from tick 960 (1.0 s), 400-tick notes, 4/4 at 120 BPM.
{
const pitches = [60, 62, 64, 65];
const t0 = [{ deltaTime: 0, type: 'trackName', text: 'Conductor' }, { deltaTime: 0, type: 'setTempo', microsecondsPerBeat: 500000 }, { deltaTime: 0, type: 'timeSignature', numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 }, { deltaTime: 0, type: 'endOfTrack' }];
const t1 = [{ deltaTime: 0, type: 'trackName', text: 'Right' }];
let last = 0;
for (let i = 0; i < 16; i += 1) {
  const tick = 960 + i * 480;
  t1.push({ deltaTime: tick - last, type: 'noteOn', channel: 0, noteNumber: pitches[i % 4], velocity: 90 });
  t1.push({ deltaTime: 400, type: 'noteOff', channel: 0, noteNumber: pitches[i % 4], velocity: 0 });
  last = tick + 400;
}
t1.push({ deltaTime: 0, type: 'endOfTrack' });
fs.writeFileSync(path.join(out, "pmus-16.mid"), Buffer.from(writeMidi({ header: { format: 1, numTracks: 2, ticksPerBeat: 480 }, tracks: [t0, t1] })));
}
