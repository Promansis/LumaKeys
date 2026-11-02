import type * as Tone from 'tone';
import { buildScheduledNotes } from '../game/songUtils';
import type { ParsedSong } from '../game/types';
import {
  DEFAULT_INSTRUMENT_ID,
  getInstrumentEffectiveReverbPreset,
  getInstrumentDefinition,
  getInstrumentSustainReleaseTailSec,
  isInstrumentId,
  REVERB_PRESETS,
  type InstrumentDefinition,
  type InstrumentReverbPreset,
  type InstrumentVoice,
} from './instrumentCatalog';
import { resolvePublicAssetUrl } from './publicAssetUrl';
import { audioBufferToWav } from './wavEncoder';

type ToneModule = typeof import('tone');

let toneModulePromise: Promise<ToneModule> | null = null;

async function loadTone(): Promise<ToneModule> {
  toneModulePromise ??= import('tone');
  return toneModulePromise;
}

function midiToName(tone: ToneModule, midi: number): string {
  return tone.Frequency(midi, 'midi').toNote();
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function percentToDb(tone: ToneModule | null, value: number): number {
  const gain = clampPercent(value) / 100;
  if (gain <= 0) {
    return -60;
  }

  return tone ? tone.gainToDb(gain) : 20 * Math.log10(gain);
}

function resolveVoiceConstructor(tone: ToneModule, voice: InstrumentVoice): any {
  switch (voice) {
    case 'am':
      return tone.AMSynth;
    case 'fm':
      return tone.FMSynth;
    case 'mono':
      return tone.MonoSynth;
    case 'sampler':
    case 'synth':
    default:
      return tone.Synth;
  }
}

// Tone merges sampler options with an explicit-undefined-wins rule, so an absent value must be left out
// of the options object instead of being passed as `undefined` or `null`.
function customSamplerOptions(
  definition: InstrumentDefinition,
  urls: Record<string, string>,
  baseUrl: string | null,
): { urls: Record<string, string>; baseUrl?: string; release?: number } {
  const release = (definition.options as { release?: number }).release;
  return {
    urls,
    ...(baseUrl ? { baseUrl } : {}),
    ...(typeof release === 'number' ? { release } : {}),
  };
}

function createSamplerFallbackDefinition(definition: InstrumentDefinition): InstrumentDefinition {
  return {
    ...definition,
    voice: 'synth',
    options: {
      oscillator: {
        type: 'triangle',
      },
      envelope: {
        attack: 0.01,
        decay: 0.12,
        sustain: 0.32,
        release: 1.3,
      },
    },
  };
}

interface RecordedNoteForExport {
  midi: number;
  velocity: number;
  startTimeSec: number;
  durationSec: number;
}

export class AudioEngine {
  private tone: ToneModule | null = null;
  private sampler: Tone.Sampler | null = null;
  private synth: Tone.PolySynth | null = null;
  private metronomeSynth: Tone.Synth | null = null;
  private masterVolumeNode: Tone.Volume | null = null;
  private instrumentOutputNode: Tone.Volume | null = null;
  private instrumentReverbNode: Tone.Freeverb | null = null;
  private metronomeVolumeNode: Tone.Volume | null = null;
  private oneShotVolumeNode: Tone.Volume | null = null;
  private backingTrackPlayer: Tone.Player | null = null;
  private backingTrackVolumeNode: Tone.Volume | null = null;
  private oneShotPlayers = new Map<string, Tone.Player>();
  private initialized = false;
  private sustainDown = false;
  private heldNotes = new Set<string>();
  private sustainedNotes = new Set<string>();
  private instrumentId = DEFAULT_INSTRUMENT_ID;
  private customSamplerUrls: Record<string, string> | null = null;
  private customSamplerBaseUrl: string | null = null;
  private instrumentReverbPresetOverride: InstrumentReverbPreset | null = null;
  private masterVolumePercent = 80;
  private metronomeVolumePercent = 65;
  private reverbPercent = 20;
  private preparePromise: Promise<void> | null = null;

  private async ensureTone(): Promise<ToneModule> {
    if (this.tone) {
      return this.tone;
    }

    this.tone = await loadTone();
    return this.tone;
  }

  async preload(): Promise<void> {
    await this.ensureTone();
  }

  async unlock(): Promise<void> {
    const tone = await this.ensureTone();

    // Start Tone.js - this creates the AudioContext if needed
    await tone.start();

    // Ensure context is running
    const context = tone.getContext();
    console.log('[AudioEngine] AudioContext state:', context.rawContext.state);
    if (context.rawContext.state === 'suspended') {
      await context.rawContext.resume();
      console.log('[AudioEngine] AudioContext resumed, new state:', context.rawContext.state);
    }
    console.log('[AudioEngine] Audio unlocked successfully');
  }

  async prepareForPlayback(): Promise<void> {
    if (this.initialized) {
      await this.unlock();
      return;
    }

    this.preparePromise ??= this.prepareAudioGraph();
    try {
      await this.preparePromise;
    } finally {
      if (this.initialized) {
        this.preparePromise = null;
      }
    }
  }

  async init(): Promise<void> {
    await this.prepareForPlayback();
  }

  async noteOn(note: number, velocity = 0.8): Promise<void> {
    await this.prepareForPlayback();
    const tone = this.tone!;
    const noteName = midiToName(tone, note);
    console.log('[AudioEngine] noteOn:', noteName, 'velocity:', velocity, 'sampler:', !!this.sampler, 'synth:', !!this.synth);
    this.heldNotes.add(noteName);
    this.sustainedNotes.delete(noteName);
    if (this.sampler) {
      this.sampler.triggerAttack(noteName, tone.now(), velocity);
      return;
    }
    this.synth?.triggerAttack(noteName, tone.now(), velocity);
  }

  noteOff(note: number): void {
    if (!this.tone) {
      return;
    }

    const noteName = midiToName(this.tone, note);
    this.heldNotes.delete(noteName);
    if (this.sustainDown) {
      this.sustainedNotes.add(noteName);
      return;
    }

    this.releaseNote(noteName);
  }

  setSustain(isDown: boolean): void {
    this.sustainDown = isDown;
    if (!isDown) {
      const releaseTailSec = getInstrumentSustainReleaseTailSec(this.instrumentId);
      for (const noteName of [...this.sustainedNotes]) {
        if (!this.heldNotes.has(noteName)) {
          this.releaseNote(noteName, releaseTailSec);
        }
      }
      this.sustainedNotes.clear();
    }
  }

  async playSong(
    song: ParsedSong,
    startSec: number,
    tempoMultiplier: number,
    loopEndSec?: number,
  ): Promise<void> {
    await this.prepareForPlayback();
    const tone = this.tone!;

    this.pauseSong();
    tone.Transport.cancel(0);
    tone.Transport.position = 0;
    tone.Transport.loop = false;
    tone.Transport.loopStart = 0;
    tone.Transport.loopEnd = 0;
    tone.Transport.bpm.value = song.bpm * tempoMultiplier;

    const clampedLoopEndSec =
      typeof loopEndSec === 'number' ? Math.max(startSec, Math.min(loopEndSec, song.durationSec)) : undefined;
    const releaseScale = 1 / tempoMultiplier;

    for (const note of buildScheduledNotes(song)) {
      if (note.startSec < startSec) {
        continue;
      }
      if (typeof clampedLoopEndSec === 'number' && note.startSec >= clampedLoopEndSec) {
        break;
      }

      const startAt = (note.startSec - startSec) / tempoMultiplier;
      const unclampedDurationSec =
        typeof clampedLoopEndSec === 'number'
          ? Math.min(note.durationSec, Math.max(0, clampedLoopEndSec - note.startSec))
          : note.durationSec;
      const duration = Math.max(0.05, unclampedDurationSec * releaseScale);
      tone.Transport.schedule((time: number) => {
        const noteName = midiToName(tone, note.midi);
        if (this.sampler) {
          this.sampler.triggerAttackRelease(noteName, duration, time, note.velocity);
          return;
        }
        this.synth?.triggerAttackRelease(noteName, duration, time, note.velocity);
      }, startAt);
    }

    if (typeof clampedLoopEndSec === 'number' && clampedLoopEndSec > startSec) {
      tone.Transport.loopStart = 0;
      tone.Transport.loopEnd = (clampedLoopEndSec - startSec) / Math.max(tempoMultiplier, 0.01);
      tone.Transport.loop = true;
    }

    tone.Transport.start('+0.02');
  }

  pauseSong(): void {
    if (!this.initialized) {
      return;
    }

    const tone = this.tone;
    if (!tone) {
      return;
    }

    tone.Transport.stop();
    tone.Transport.loop = false;
    tone.Transport.loopStart = 0;
    tone.Transport.loopEnd = 0;
    tone.Transport.cancel(0);
    this.allNotesOff();
  }

  seek(): void {
    if (!this.initialized) {
      return;
    }

    this.pauseSong();
  }

  setTempo(
    song: ParsedSong,
    startSec: number,
    tempoMultiplier: number,
    shouldResume: boolean,
    loopEndSec?: number,
  ): Promise<void> {
    if (!shouldResume) {
      this.seek();
      return Promise.resolve();
    }

    return this.playSong(song, startSec, tempoMultiplier, loopEndSec);
  }

  async playMetronomeClick(accent = false): Promise<void> {
    await this.prepareForPlayback();
    const tone = this.tone!;
    const note = accent ? 'C6' : 'C5';
    this.metronomeSynth?.triggerAttackRelease(note, 0.05, tone.now(), accent ? 0.9 : 0.55);
  }

  allNotesOff(): void {
    this.heldNotes.clear();
    this.sustainedNotes.clear();
    this.sampler?.releaseAll();
    this.synth?.releaseAll();
  }

  async setInstrument(instrumentId: string): Promise<void> {
    const safeInstrumentId = isInstrumentId(instrumentId) ? instrumentId : DEFAULT_INSTRUMENT_ID;
    const definition = getInstrumentDefinition(safeInstrumentId);
    this.instrumentId = definition.id;
    if (!this.initialized) {
      return;
    }

    await this.rebuildInstrument(definition);
  }

  setInstrumentReverbPreset(preset: InstrumentReverbPreset): void {
    this.instrumentReverbPresetOverride = preset;
    this.applyInstrumentReverbPreset();
  }

  setMasterVolume(value: number): void {
    this.masterVolumePercent = clampPercent(value);
    if (this.masterVolumeNode) {
      this.masterVolumeNode.volume.value = percentToDb(this.tone, this.masterVolumePercent);
    }
  }

  setMetronomeVolume(value: number): void {
    this.metronomeVolumePercent = clampPercent(value);
    if (this.metronomeVolumeNode) {
      this.metronomeVolumeNode.volume.value = percentToDb(this.tone, this.metronomeVolumePercent);
    }
  }

  setReverbLevel(value: number): void {
    this.reverbPercent = clampPercent(value);
    if (this.instrumentReverbNode) {
      this.instrumentReverbNode.wet.value = this.reverbPercent / 100;
    }
  }

  setPitchBend(value: number): void {
    const cents = Math.max(-1, Math.min(1, value)) * 200;
    // PolySynth supports detune directly
    if (this.synth) {
      this.synth.set({ detune: cents });
    }
    // Sampler does not expose detune; pitch bend is a no-op for sampler-based instruments
  }

  setModulation(_value: number): void {
    // Reserved for future vibrato depth control
  }

  setMetronomeSound(soundId: string): void {
    if (!this.metronomeSynth) {
      return;
    }
    switch (soundId) {
      case 'wood':
        this.metronomeSynth.set({
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.06 },
        });
        break;
      case 'soft':
        this.metronomeSynth.set({
          oscillator: { type: 'sine' },
          envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 },
        });
        break;
      case 'digital':
        this.metronomeSynth.set({
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.001, decay: 0.02, sustain: 0, release: 0.02 },
        });
        break;
      default: // 'classic'
        this.metronomeSynth.set({
          oscillator: { type: 'square' },
          envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.05 },
        });
        break;
    }
  }

  async loadBackingTrack(src: string): Promise<void> {
    await this.prepareForPlayback();
    const tone = this.tone!;
    this.backingTrackPlayer?.dispose();
    this.backingTrackPlayer = null;
    if (!this.backingTrackVolumeNode) {
      this.backingTrackVolumeNode = new tone.Volume(0).connect(this.masterVolumeNode!);
    }
    this.backingTrackPlayer = new tone.Player(src).connect(this.backingTrackVolumeNode);
    await tone.loaded();
  }

  playBackingTrack(): void {
    if (this.backingTrackPlayer?.loaded) {
      this.backingTrackPlayer.start();
    }
  }

  pauseBackingTrack(): void {
    this.backingTrackPlayer?.stop();
  }

  stopBackingTrack(): void {
    this.backingTrackPlayer?.stop();
  }

  setBackingTrackVolume(value: number): void {
    if (this.backingTrackVolumeNode) {
      this.backingTrackVolumeNode.volume.value = percentToDb(this.tone, clampPercent(value));
    }
  }

  getBackingTrackDuration(): number {
    return this.backingTrackPlayer?.buffer.duration ?? 0;
  }

  async playOneShot(src: string, volumeDb = 0): Promise<void> {
    await this.prepareForPlayback();
    const player = await this.getOrCreateOneShotPlayer(src);
    player.volume.value = volumeDb;
    if (player.state === 'started') {
      player.stop();
    }
    player.start();
  }

  async getOneShotDurationSec(src: string): Promise<number> {
    await this.prepareForPlayback();
    const player = await this.getOrCreateOneShotPlayer(src);
    return player.buffer.duration;
  }

  async setCustomSampler(urls: Record<string, string>, baseUrl?: string | null): Promise<void> {
    this.customSamplerUrls = urls;
    this.customSamplerBaseUrl = baseUrl ?? null;
    if (!this.initialized) {
      return;
    }
    await this.rebuildInstrument(getInstrumentDefinition(this.instrumentId));
  }

  async clearCustomSampler(): Promise<void> {
    this.customSamplerUrls = null;
    this.customSamplerBaseUrl = null;
    if (!this.initialized) {
      return;
    }
    await this.rebuildInstrument(getInstrumentDefinition(this.instrumentId));
  }

  async renderRecordingToWav(notes: RecordedNoteForExport[], durationSec: number): Promise<Uint8Array> {
    const tone = await this.ensureTone();
    const renderDuration = durationSec + 3;
    const definition = getInstrumentDefinition(this.instrumentId);
    const customUrls = this.customSamplerUrls;
    const customBaseUrl = this.customSamplerBaseUrl;

    const toneBuffer = await tone.Offline(async (offlineContext) => {
      let instrument: Tone.Sampler | Tone.PolySynth;

      if (customUrls) {
        instrument = new tone.Sampler(customSamplerOptions(definition, customUrls, customBaseUrl)).toDestination();
        await tone.loaded();
      } else if (definition.voice === 'sampler' && definition.sampleUrls && definition.sampleBaseUrl) {
        const samplerOpts = definition.options as { release?: number };
        instrument = new tone.Sampler({
          urls: definition.sampleUrls,
          baseUrl: resolvePublicAssetUrl(definition.sampleBaseUrl),
          release: samplerOpts.release,
        }).toDestination();
        await tone.loaded();
      } else {
        const fallback = createSamplerFallbackDefinition(definition);
        instrument = new tone.PolySynth(
          resolveVoiceConstructor(tone, fallback.voice),
          fallback.options as never,
        ).toDestination();
      }

      for (const note of notes) {
        offlineContext.transport.schedule((time: number) => {
          const noteName = midiToName(tone, note.midi);
          const duration = Math.max(0.05, note.durationSec);
          if (instrument instanceof tone.Sampler) {
            instrument.triggerAttackRelease(noteName, duration, time, note.velocity);
          } else {
            (instrument as Tone.PolySynth).triggerAttackRelease(noteName, duration, time, note.velocity);
          }
        }, note.startTimeSec);
      }

      offlineContext.transport.start();
    }, renderDuration);

    const audioBuffer = toneBuffer.get();
    if (!audioBuffer) {
      throw new Error('Offline render produced no audio.');
    }

    return audioBufferToWav(audioBuffer);
  }

  private releaseNote(noteName: string, releaseDelaySec = 0): void {
    if (!this.tone) {
      return;
    }

    this.sustainedNotes.delete(noteName);
    const releaseTime = this.tone.now() + Math.max(0, releaseDelaySec);
    if (this.sampler) {
      this.sampler.triggerRelease(noteName, releaseTime);
      return;
    }
    this.synth?.triggerRelease(noteName, releaseTime);
  }

  private async rebuildInstrument(definition: InstrumentDefinition): Promise<void> {
    this.allNotesOff();
    this.sampler?.dispose();
    this.sampler = null;
    this.synth?.dispose();
    this.synth = null;
    await this.loadInstrument(definition);
    this.applyInstrumentReverbPreset();
  }

  private async prepareAudioGraph(): Promise<void> {
    await this.unlock();
    const tone = this.tone!;
    tone.getContext().lookAhead = 0.01;
    console.log('[AudioEngine] Initializing audio nodes...');
    this.masterVolumeNode = new tone.Volume(percentToDb(tone, this.masterVolumePercent)).toDestination();
    this.instrumentReverbNode = new tone.Freeverb({
      roomSize: 0.55,
      dampening: 2500,
      wet: this.reverbPercent / 100,
    }).connect(this.masterVolumeNode);
    this.instrumentOutputNode = new tone.Volume(0).connect(this.instrumentReverbNode);
    this.metronomeVolumeNode = new tone.Volume(percentToDb(tone, this.metronomeVolumePercent)).connect(this.masterVolumeNode);
    this.oneShotVolumeNode = new tone.Volume(0).connect(this.masterVolumeNode);
    console.log('[AudioEngine] Loading instrument...');
    const initialDef = getInstrumentDefinition(this.instrumentId);
    await this.loadInstrument(initialDef);
    this.applyInstrumentReverbPreset();
    this.metronomeSynth = new tone.Synth({
      oscillator: { type: 'square' },
      envelope: {
        attack: 0.001,
        decay: 0.04,
        sustain: 0,
        release: 0.05,
      },
    }).connect(this.metronomeVolumeNode);
    this.initialized = true;
    console.log('[AudioEngine] Initialization complete');
  }

  private async loadInstrument(definition: InstrumentDefinition): Promise<void> {
    const tone = this.tone!;

    console.log('[AudioEngine] loadInstrument - voice:', definition.voice);

    if (this.customSamplerUrls) {
      try {
        this.sampler = new tone.Sampler(
          customSamplerOptions(definition, this.customSamplerUrls, this.customSamplerBaseUrl),
        ).connect(this.instrumentOutputNode!);
        await tone.loaded();
        return;
      } catch (err) {
        console.error('[AudioEngine] Failed to load custom sampler:', err);
        this.sampler?.dispose();
        this.sampler = null;
      }
    }

    if (definition.voice === 'sampler' && definition.sampleUrls && definition.sampleBaseUrl) {
      try {
        console.log('[AudioEngine] Loading sampler from:', definition.sampleBaseUrl);
        console.log('[AudioEngine] Sample URLs:', definition.sampleUrls);
        const samplerOptions = definition.options as { release?: number };
        this.sampler = new tone.Sampler({
          urls: definition.sampleUrls,
          baseUrl: resolvePublicAssetUrl(definition.sampleBaseUrl),
          release: samplerOptions.release,
          onload: () => {
            console.log('[AudioEngine] Sampler onload callback fired');
          },
        }).connect(this.instrumentOutputNode!);
        console.log('[AudioEngine] Waiting for samples to load...');
        await tone.loaded();
        console.log('[AudioEngine] Sampler loaded successfully, loaded state:', this.sampler.loaded);
        return;
      } catch (err) {
        console.error('[AudioEngine] Failed to load sampler:', err);
        this.sampler?.dispose();
        this.sampler = null;
      }

      console.log('[AudioEngine] Using synth fallback for sampler');
      this.synth = this.createPolySynth(createSamplerFallbackDefinition(definition));
      return;
    }

    console.log('[AudioEngine] Creating PolySynth with voice:', definition.voice);
    this.synth = this.createPolySynth(definition);
  }

  private createPolySynth(definition: InstrumentDefinition): Tone.PolySynth {
    if (!this.instrumentOutputNode) {
      throw new Error('Audio engine effect chain is not initialized.');
    }

    const tone = this.tone!;
    return new tone.PolySynth(resolveVoiceConstructor(tone, definition.voice), definition.options as never).connect(
      this.instrumentOutputNode,
    );
  }

  private applyInstrumentReverbPreset(): void {
    if (!this.instrumentReverbNode) {
      return;
    }

    const presetId = getInstrumentEffectiveReverbPreset(
      this.instrumentId,
      this.instrumentReverbPresetOverride ? { [this.instrumentId]: this.instrumentReverbPresetOverride } : {},
    );
    const preset = REVERB_PRESETS[presetId];
    this.instrumentReverbNode.roomSize.value = preset.roomSize;
    this.instrumentReverbNode.dampening = preset.dampening;
  }

  private async getOrCreateOneShotPlayer(src: string): Promise<Tone.Player> {
    if (this.oneShotPlayers.has(src)) {
      return this.oneShotPlayers.get(src)!;
    }

    if (!this.oneShotVolumeNode) {
      throw new Error('Audio engine one-shot output is not initialized.');
    }

    const tone = this.tone!;
    const player = new tone.Player(src).connect(this.oneShotVolumeNode);
    this.oneShotPlayers.set(src, player);
    await tone.loaded();
    return player;
  }
}
