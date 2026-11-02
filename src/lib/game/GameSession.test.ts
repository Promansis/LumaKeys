import { describe, expect, it } from 'vitest';
import { GameSession } from './GameSession';
import type { ParsedSong, SessionConfig } from './types';

const SONG: ParsedSong = {
  id: 'song-1',
  title: 'Exercise',
  ppq: 480,
  bpm: 120,
  durationSec: 3,
  tracks: [
    {
      id: 'track-0',
      name: 'Exercise',
      sourceTrackIndex: 0,
      defaultAssignment: 'right',
      assignment: 'right',
    },
  ],
  notes: [
    {
      id: 'note-0',
      trackId: 'track-0',
      midi: 60,
      name: 'C4',
      velocity: 0.8,
      startSec: 1,
      durationSec: 0.4,
      hand: 'right',
    },
    {
      id: 'note-1',
      trackId: 'track-0',
      midi: 60,
      name: 'C4',
      velocity: 0.8,
      startSec: 1.5,
      durationSec: 0.4,
      hand: 'right',
    },
  ],
};

const DEFAULT_SESSION: SessionConfig = {
  mode: 'luma-keys',
  tempoMultiplier: 1,
  handFilter: 'both',
  loopRange: null,
  waitForInput: false,
  metronomeEnabled: false,
  handSize: 'medium',
  fingeringDisplayMode: 'always',
  pitchBendEnabled: true,
  latencyCompMs: 0,
  hitWindowMs: 100,
  beatsVisible: 8,
  leadInBeats: 2,
};

describe('GameSession', () => {
  it('scores hits inside the timing window and tracks combo', () => {
    const session = new GameSession(SONG, DEFAULT_SESSION);
    session.play(0);
    session.ingestMidiEvent({
      type: 'noteon',
      note: 60,
      velocity: 0.9,
      timestamp: 1000,
      sourceId: 'device-1',
      source: 'midi',
    });

    const snapshot = session.getSnapshot(1000);
    expect(snapshot.score.combo).toBe(1);
    expect(snapshot.score.perfectCount).toBe(1);
    expect(snapshot.visibleNotes.some((note) => note.judgement === 'perfect')).toBe(true);
  });

  it('preserves judged state when tempo or display configuration changes', () => {
    const session = new GameSession(SONG, DEFAULT_SESSION);
    session.play(0);
    session.ingestMidiEvent({
      type: 'noteon',
      note: 60,
      velocity: 0.9,
      timestamp: 1000,
      sourceId: 'device-1',
      source: 'midi',
    });

    const before = session.getSnapshot(1000);
    session.updateSessionConfig({ ...DEFAULT_SESSION, tempoMultiplier: 0.8, fingeringDisplayMode: 'never' }, 1000);
    const after = session.getSnapshot(1000);

    expect(after.score).toEqual(before.score);
    expect(after.visibleNotes.find((note) => note.id === 'note-0')?.judgement).toBe('perfect');
  });

  it('applies stable fingering overrides after a loop filters the schedule', () => {
    const song: ParsedSong = {
      ...SONG,
      measureBoundaries: [
        { startTick: 0, endTick: 600, startSec: 0, endSec: 1.25 },
        { startTick: 600, endTick: 1200, startSec: 1.25, endSec: 2.5 },
      ],
    };
    const session = new GameSession(
      song,
      { ...DEFAULT_SESSION, loopRange: { startMeasure: 1, endMeasure: 1 } },
      [{ songId: song.id, noteIndex: -1, noteId: 'note-1', finger: 5, hand: 'right' }],
    );

    expect(session.getSnapshot(0).visibleNotes.find((note) => note.id === 'note-1')?.finger).toBe(5);
    expect(session.getSnapshot(0).visibleNotes.some((note) => note.id === 'note-0')).toBe(false);
  });

  it('marks overdue notes as misses', () => {
    const session = new GameSession(SONG, DEFAULT_SESSION);
    session.play(0);

    const snapshot = session.getSnapshot(1200);
    expect(snapshot.score.combo).toBe(0);
    expect(snapshot.score.missCount).toBe(1);
    expect(snapshot.visibleNotes.some((note) => note.judgement === 'miss')).toBe(true);
  });

  it('handles repeated same-pitch notes in order', () => {
    const session = new GameSession(SONG, DEFAULT_SESSION);
    session.play(0);

    session.ingestMidiEvent({
      type: 'noteon',
      note: 60,
      velocity: 0.9,
      timestamp: 1000,
      sourceId: 'device-1',
      source: 'midi',
    });
    session.ingestMidiEvent({
      type: 'noteon',
      note: 60,
      velocity: 0.9,
      timestamp: 1500,
      sourceId: 'device-1',
      source: 'midi',
    });

    const snapshot = session.getSnapshot(1500);
    expect(snapshot.score.combo).toBe(2);
    expect(snapshot.score.maxCombo).toBe(2);
    expect(snapshot.visibleNotes.filter((note) => note.judgement === 'perfect')).toHaveLength(2);
  });

  it('waits at the next note in learning mode until the correct note is played', () => {
    const session = new GameSession(SONG, {
      ...DEFAULT_SESSION,
      mode: 'learning',
      waitForInput: true,
    });
    session.play(0);

    expect(session.getSnapshot(1300).currentTimeSec).toBe(1);

    session.ingestMidiEvent({
      type: 'noteon',
      note: 60,
      velocity: 0.8,
      timestamp: 1300,
      sourceId: 'device-1',
      source: 'midi',
    });

    expect(session.getSnapshot(1600).currentTimeSec).toBeGreaterThan(1);
  });

  it('keeps a note active until all sources release it', () => {
    const session = new GameSession(SONG, DEFAULT_SESSION);
    session.play(0);

    session.ingestInputEvent({
      type: 'noteon',
      note: 60,
      velocity: 0.8,
      timestamp: 900,
      sourceId: 'midi-1',
      source: 'midi',
    });
    session.ingestInputEvent({
      type: 'noteon',
      note: 60,
      velocity: 0.8,
      timestamp: 910,
      sourceId: 'computer-keyboard',
      source: 'computer-keyboard',
    });

    session.ingestInputEvent({
      type: 'noteoff',
      note: 60,
      velocity: 0,
      timestamp: 1000,
      sourceId: 'midi-1',
      source: 'midi',
    });

    expect(session.getSnapshot(1000).activeInputNotes).toEqual([60]);

    session.ingestInputEvent({
      type: 'noteoff',
      note: 60,
      velocity: 0,
      timestamp: 1010,
      sourceId: 'computer-keyboard',
      source: 'computer-keyboard',
    });

    expect(session.getSnapshot(1010).activeInputNotes).toEqual([]);
  });

  it('releases a sustained note when only its source disconnects', () => {
    const session = new GameSession(SONG, DEFAULT_SESSION);
    session.ingestInputEvent({
      type: 'noteon', note: 60, timestamp: 900, sourceId: 'midi-1', source: 'midi',
    });
    session.ingestInputEvent({
      type: 'sustain', sustainValue: 127, timestamp: 910, sourceId: 'midi-1', source: 'midi',
    });
    session.ingestInputEvent({
      type: 'noteoff', note: 60, timestamp: 920, sourceId: 'midi-1', source: 'midi',
    });
    session.ingestInputEvent({
      type: 'sustain', sustainValue: 0, timestamp: 930, sourceId: 'midi-1', source: 'midi',
    });

    expect(session.getSnapshot(930).activeInputNotes).toEqual([]);
  });

  it('shows fingering numbers when display mode is always', () => {
    const session = new GameSession(SONG, {
      ...DEFAULT_SESSION,
      fingeringDisplayMode: 'always',
      mode: 'luma-keys',
    });

    const snapshot = session.getSnapshot(0);
    expect(snapshot.visibleNotes.some((note) => note.finger !== undefined)).toBe(true);
    expect(snapshot.upcomingNotes.some((note) => note.finger !== undefined)).toBe(true);
  });

  it('shows fingering numbers only in learning mode when configured that way', () => {
    const hiddenInHero = new GameSession(SONG, {
      ...DEFAULT_SESSION,
      fingeringDisplayMode: 'learning-only',
      mode: 'luma-keys',
    });
    const visibleInLearning = new GameSession(SONG, {
      ...DEFAULT_SESSION,
      fingeringDisplayMode: 'learning-only',
      mode: 'learning',
      waitForInput: true,
    });

    expect(hiddenInHero.getSnapshot(0).visibleNotes.some((note) => note.finger !== undefined)).toBe(false);
    expect(visibleInLearning.getSnapshot(0).visibleNotes.some((note) => note.finger !== undefined)).toBe(true);
  });

  it('hides fingering numbers when display mode is never', () => {
    const session = new GameSession(SONG, {
      ...DEFAULT_SESSION,
      fingeringDisplayMode: 'never',
    });

    const snapshot = session.getSnapshot(0);
    expect(snapshot.visibleNotes.some((note) => note.finger !== undefined)).toBe(false);
    expect(snapshot.upcomingNotes.some((note) => note.finger !== undefined)).toBe(false);
  });


  describe('input while the transport is stopped', () => {
    // Same shape as the audit probe (scripts/audit/paused-input-probe.ts): a note at 0 s
    // before play, and a note 33 ms past a pause point.
    const press = (session: GameSession, ms: number, note = 60, sourceId = 'computer-keyboard') => {
      session.ingestInputEvent({
        type: 'noteon', note, velocity: 0.8, timestamp: ms, sourceId, source: 'computer-keyboard',
      });
    };
    const release = (session: GameSession, ms: number, note = 60, sourceId = 'computer-keyboard') => {
      session.ingestInputEvent({
        type: 'noteoff', note, velocity: 0, timestamp: ms, sourceId, source: 'computer-keyboard',
      });
    };
    const OPENING_SONG: ParsedSong = {
      ...SONG,
      notes: [{ ...SONG.notes[0], id: 'open-0', startSec: 0 }, { ...SONG.notes[1], id: 'open-1', startSec: 1 }],
    };

    it('does not judge a press before the song has started or during the count-in', () => {
      const session = new GameSession(OPENING_SONG, DEFAULT_SESSION);

      press(session, 1000);
      press(session, 2000);

      const snapshot = session.getSnapshot(2100);
      expect(snapshot.score.perfectCount + snapshot.score.goodCount + snapshot.score.okCount).toBe(0);
      expect(snapshot.score.combo).toBe(0);
      expect(snapshot.score.totalScore).toBe(0);
      expect(snapshot.visibleNotes.find((note) => note.id === 'open-0')?.judgement).toBe('pending');
    });

    it('does not judge a press made while paused next to a note', () => {
      const session = new GameSession(OPENING_SONG, DEFAULT_SESSION);
      session.play(0);
      session.pause(950);

      press(session, 5000);

      const snapshot = session.getSnapshot(5100);
      expect(snapshot.score.totalScore).toBe(0);
      expect(snapshot.score.combo).toBe(0);
      expect(snapshot.visibleNotes.find((note) => note.id === 'open-1')?.judgement).toBe('pending');
    });

    it('keeps the pressed note active while stopped so the keyboard still lights', () => {
      const session = new GameSession(OPENING_SONG, DEFAULT_SESSION);

      press(session, 1000);
      expect(session.getSnapshot(1010).activeInputNotes).toEqual([60]);
      release(session, 1100);
      expect(session.getSnapshot(1110).activeInputNotes).toEqual([]);
    });

    it('still judges the same note on time once the song runs', () => {
      const session = new GameSession(OPENING_SONG, DEFAULT_SESSION);
      press(session, 500);
      release(session, 550);
      session.play(3000);

      press(session, 3000);

      const snapshot = session.getSnapshot(3000);
      expect(snapshot.score.perfectCount).toBe(1);
      expect(snapshot.score.combo).toBe(1);
    });

    it('still judges a press while playing, and ignores one far from any note', () => {
      const session = new GameSession(OPENING_SONG, DEFAULT_SESSION);
      session.play(0);

      press(session, 420);
      expect(session.getSnapshot(430).score.totalScore).toBe(0);

      press(session, 1000);
      expect(session.getSnapshot(1000).score.perfectCount).toBe(1);
    });
  });

  describe('a press just before the loop seam', () => {
    // 120 bpm in 4/4 is 2 s a measure, so measure index 1 loops 2 s to 4 s.
    const LOOP_SONG: ParsedSong = {
      ...SONG,
      durationSec: 6,
      notes: [
        { ...SONG.notes[0], id: 'loop-0', midi: 60, name: 'C4', startSec: 2 },
        { ...SONG.notes[0], id: 'loop-1', midi: 62, name: 'D4', startSec: 3 },
      ],
    };
    const LOOP_CONFIG: SessionConfig = { ...DEFAULT_SESSION, loopRange: { startMeasure: 1, endMeasure: 1 } };
    const noteOn = (session: GameSession, ms: number, note: number) => {
      session.ingestInputEvent({
        type: 'noteon', note, velocity: 0.8, timestamp: ms, sourceId: 'midi-1', source: 'midi',
      });
    };

    it('counts a press hitWindow - 1 ms early for the loop first note', () => {
      const session = new GameSession(LOOP_SONG, LOOP_CONFIG);
      session.play(0);

      noteOn(session, 2000 - 99, 60);
      const wrapped = session.getSnapshot(2010);

      expect(wrapped.currentTimeSec).toBeLessThan(0.1 + 2);
      expect(wrapped.score.okCount).toBe(1);
      expect(wrapped.score.combo).toBe(1);
      expect(wrapped.visibleNotes.find((note) => note.id === 'loop-0')?.judgement).toBe('ok');
    });

    it('scores a 15 ms early press as perfect and lets the rest of the pass score', () => {
      const session = new GameSession(LOOP_SONG, LOOP_CONFIG);
      session.play(0);

      noteOn(session, 2000 - 15, 60);
      expect(session.getSnapshot(2000).score.perfectCount).toBe(1);
      noteOn(session, 3000, 62);

      const snapshot = session.getSnapshot(3000);
      expect(snapshot.score.perfectCount).toBe(2);
      expect(snapshot.score.combo).toBe(2);
    });

    it('does not wait on the first note after the wrap in Learn mode', () => {
      const session = new GameSession(LOOP_SONG, { ...LOOP_CONFIG, mode: 'learning', waitForInput: true });
      session.play(0);
      noteOn(session, 100, 60);
      noteOn(session, 1100, 62);
      expect(session.getSnapshot(1100).currentTimeSec).toBe(3);

      noteOn(session, 2100 - 15, 60);
      session.getSnapshot(2100);

      const after = session.getSnapshot(2500);
      expect(after.currentTimeSec).toBeGreaterThan(2);
      expect(after.score.perfectCount).toBe(1);
    });

    it('still counts a press just after the seam, as before', () => {
      const session = new GameSession(LOOP_SONG, LOOP_CONFIG);
      session.play(0);

      noteOn(session, 2020, 60);

      expect(session.getSnapshot(2020).score.perfectCount).toBe(1);
    });

    it('does not carry an early press across a pause', () => {
      const session = new GameSession(LOOP_SONG, LOOP_CONFIG);
      session.play(0);
      noteOn(session, 2000 - 15, 60);
      session.pause(1990);
      session.play(5000);

      const wrapped = session.getSnapshot(5000 + 20);
      expect(wrapped.score.perfectCount).toBe(0);
    });

    it('ignores a press near the seam that no loop-start note answers', () => {
      const session = new GameSession(LOOP_SONG, LOOP_CONFIG);
      session.play(0);

      noteOn(session, 2000 - 15, 62);

      expect(session.getSnapshot(2010).score.totalScore).toBe(0);
    });

    it('does not treat a non-loop song end as a seam', () => {
      const session = new GameSession(SONG, DEFAULT_SESSION);
      session.play(0);
      noteOn(session, 2950, 60);
      expect(session.getSnapshot(2950).score.totalScore).toBe(0);
    });
  });
});
