// Shared fixture builders for the Phase 11 lane F drivers (WF-007, WF-008, WF-025).
// Builds small MIDI files with @tonejs/midi from the repository's node_modules.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire('/media/storage/LumaKeys/package.json');
const { Midi } = require('@tonejs/midi');
export { Midi };

// tracks: [{ name, notes: [[midi, startBeat, durBeats], ...] }]; seconds = beats * 60 / bpm
export function buildMidi({ bpm, tracks, name }) {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  if (name) midi.header.name = name;
  for (const t of tracks) {
    const tr = midi.addTrack();
    tr.name = t.name;
    for (const [m, startBeat, durBeats] of t.notes) {
      tr.addNote({ midi: m, time: (startBeat * 60) / bpm, duration: (durBeats * 60) / bpm, velocity: 0.8 });
    }
  }
  return Buffer.from(midi.toArray());
}

// beats of material; perBeat notes per beat; chord notes stacked a major third apart; pitches wrap every `wrap` notes
const run = (start, beats, step = 1, { perBeat = 1, chord = 1, wrap = 8 } = {}) => {
  const notes = [];
  for (let b = 0; b < beats; b += 1) {
    for (let i = 0; i < perBeat; i += 1) {
      const idx = b * perBeat + i;
      for (let k = 0; k < chord; k += 1) notes.push([Math.min(108, start + (idx % wrap) * step + k * 4), b + i / perBeat, 0.9 / perBeat]);
    }
  }
  return notes;
};

// Five library fixtures that differ in title, tempo, length, note count, and (computed) difficulty.
export function writeLibraryFixtures(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const specs = [
    // title, bpm, beats, start pitch, note spacing, options
    { title: 'Alpha Waltz', bpm: 90, beats: 30, start: 60, step: 2 },                                   // 20 s, easy
    { title: 'Bravo March', bpm: 190, beats: 16, start: 36, step: 9, perBeat: 4, chord: 4, wrap: 9 },    // 5 s, dense chords, hard
    { title: 'charlie etude', bpm: 60, beats: 90, start: 40, step: 5, perBeat: 4, wrap: 12 },            // 90 s, medium or hard
    { title: 'Delta Scale', bpm: 120, beats: 4, start: 60, step: 2 },                                    // 2 s, easy
    { title: 'Foxtrot Epic', bpm: 60, beats: 200, start: 48, step: 1 },                                  // 200 s, over 3 minutes
  ];
  const out = [];
  for (const sp of specs) {
    const notes = run(sp.start, sp.beats, sp.step, sp);
    const file = path.join(dir, `${sp.title}.mid`);
    fs.writeFileSync(file, buildMidi({ bpm: sp.bpm, tracks: [{ name: 'Piano', notes }] }));
    out.push({ title: sp.title, bpm: sp.bpm, file, durationSec: (sp.beats * 60) / sp.bpm, noteCount: notes.length });
  }
  return out;
}

// Two-track hand fixture. Track names avoid the hand-name patterns so the default comes from pitch.
// Melody (right, above C4): F4 G4 A4 B4 C5 x2 ; Accompaniment (left, below C4): C3 E3 G3 C3 E3 G3
export function writeTwoTrackFixture(dir, title = 'Two Hand Study') {
  fs.mkdirSync(dir, { recursive: true });
  const melody = [[65, 0, 1], [67, 1, 1], [69, 2, 1], [71, 3, 1], [72, 4, 1], [72, 5, 1]];
  const accomp = [[48, 0.5, 1], [52, 1.5, 1], [55, 2.5, 1], [48, 3.5, 1], [52, 4.5, 1], [55, 5.5, 1]];
  const file = path.join(dir, `${title}.mid`);
  fs.writeFileSync(file, buildMidi({ bpm: 80, tracks: [{ name: 'Melody', notes: melody }, { name: 'Accompaniment', notes: accomp }] }));
  return { title, file, melody, accomp };
}
