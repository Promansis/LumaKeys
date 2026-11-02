import {
  clampOctaveShift,
  createDefaultKeyboardMapping,
  invertKeyboardMapping,
  isSupportedKeyboardCode,
  keyboardActionToMidi,
} from './settings';
import type { InputEvent, KeyboardAction, KeyboardInputState, KeyboardMapping, KeyboardNoteAction } from './types';

const SOURCE_ID = 'computer-keyboard';

type InputListener = (event: InputEvent) => void;
type StateListener = (state: KeyboardInputState) => void;

// A focused button only claims the keys that would activate it. Every other key, including
// the note keys, still reaches the keyboard service, so a click on Resume (or any HUD button)
// does not silence the computer keyboard.
const BUTTON_ACTIVATION_CODES = new Set(['Space', 'Enter', 'NumpadEnter']);

function isEditableTarget(target: EventTarget | null, code: string): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName;
  if (tagName === 'BUTTON') {
    return BUTTON_ACTIVATION_CODES.has(code);
  }
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

// Ctrl, Meta and Alt chords are browser or window shortcuts (Ctrl+0 resets the zoom), not
// notes. Shift stays a velocity modifier.
function hasShortcutModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey;
}

export class ComputerKeyboardInputService {
  private inputListeners = new Set<InputListener>();

  private stateListeners = new Set<StateListener>();

  private mapping: KeyboardMapping = createDefaultKeyboardMapping();

  private inverseMapping = invertKeyboardMapping(this.mapping);

  private heldCodes = new Set<string>();

  private heldActionsByCode = new Map<string, KeyboardAction>();

  private heldNotesByCode = new Map<string, number>();

  private noteOnTimestampsByCode = new Map<string, number>();

  private recentReleaseByNote = new Map<number, { releasedAt: number; holdDurationMs: number }>();

  private octaveShift = 0;

  private suspended = false;

  private initialized = false;

  init(): void {
    if (this.initialized) {
      return;
    }

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.initialized = true;
    this.emitState();
  }

  dispose(): void {
    if (!this.initialized) {
      return;
    }

    this.releaseAllHeldKeys();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.inputListeners.clear();
    this.stateListeners.clear();
    this.initialized = false;
  }

  subscribe(listener: InputListener): () => void {
    this.inputListeners.add(listener);
    return () => {
      this.inputListeners.delete(listener);
    };
  }

  subscribeState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  getState(): KeyboardInputState {
    return {
      octaveShift: this.octaveShift,
      mapping: { ...this.mapping },
    };
  }

  getMapping(): KeyboardMapping {
    return { ...this.mapping };
  }

  setMapping(mapping: KeyboardMapping): void {
    this.mapping = { ...mapping };
    this.inverseMapping = invertKeyboardMapping(this.mapping);
    this.releaseAllHeldKeys();
    this.emitState();
  }

  setSuspended(suspended: boolean): void {
    if (this.suspended === suspended) {
      return;
    }

    this.suspended = suspended;
    if (suspended) {
      this.releaseAllHeldKeys();
    }
  }

  setOctaveShift(nextShift: number): void {
    const clamped = clampOctaveShift(nextShift);
    if (clamped === this.octaveShift) {
      return;
    }

    this.releaseAllHeldKeys();
    this.octaveShift = clamped;
    this.emitState();
  }

  private emitState(): void {
    const state = this.getState();
    this.stateListeners.forEach((listener) => listener(state));
  }

  private emitInput(event: Omit<InputEvent, 'source' | 'sourceId'>): void {
    const fullEvent: InputEvent = {
      ...event,
      source: 'computer-keyboard',
      sourceId: SOURCE_ID,
    };
    this.inputListeners.forEach((listener) => listener(fullEvent));
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (this.suspended) {
      return;
    }

    if (hasShortcutModifier(event)) {
      return;
    }

    if (isEditableTarget(event.target, event.code)) {
      return;
    }

    const action = this.inverseMapping.get(event.code);
    if (!action) {
      return;
    }

    event.preventDefault();

    if (event.repeat || this.heldCodes.has(event.code)) {
      return;
    }

    this.heldCodes.add(event.code);
    this.heldActionsByCode.set(event.code, action);

    if (action === 'sustain') {
      this.emitInput({
        type: 'sustain',
        sustainValue: 127,
        timestamp: event.timeStamp,
      });
      return;
    }

    if (action === 'octave-down') {
      this.setOctaveShift(this.octaveShift - 1);
      return;
    }

    if (action === 'octave-up') {
      this.setOctaveShift(this.octaveShift + 1);
      return;
    }

    const note = keyboardActionToMidi(action as KeyboardNoteAction, this.octaveShift);
    if (note === null) {
      return;
    }

    const baseVelocity = event.shiftKey ? 0.92 : 0.65;
    const recentRelease = this.recentReleaseByNote.get(note);
    const holdBoost =
      recentRelease && recentRelease.releasedAt < event.timeStamp
        ? Math.min(0.08, Math.max(0, recentRelease.holdDurationMs) / 1000 * 0.08)
        : 0;
    const velocity = Math.min(1, baseVelocity + holdBoost);
    this.heldNotesByCode.set(event.code, note);
    this.noteOnTimestampsByCode.set(event.code, event.timeStamp);
    this.emitInput({
      type: 'noteon',
      note,
      velocity,
      timestamp: event.timeStamp,
    });
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    const action = this.heldActionsByCode.get(event.code);
    if (!action) {
      return;
    }

    // A chord key-up still releases the note this service took on key-down, so a held note
    // cannot get stuck when Ctrl is pressed before the key comes up. It just is not swallowed.
    if (!this.suspended && !hasShortcutModifier(event)) {
      event.preventDefault();
    }

    this.heldCodes.delete(event.code);
    this.heldActionsByCode.delete(event.code);

    if (action === 'sustain') {
      this.emitInput({
        type: 'sustain',
        sustainValue: 0,
        timestamp: event.timeStamp,
      });
      return;
    }

    if (action === 'octave-down' || action === 'octave-up') {
      return;
    }

    const note = this.heldNotesByCode.get(event.code);
    const noteOnTimestamp = this.noteOnTimestampsByCode.get(event.code);
    this.heldNotesByCode.delete(event.code);
    this.noteOnTimestampsByCode.delete(event.code);
    if (note === undefined) {
      return;
    }

    this.recentReleaseByNote.set(note, {
      releasedAt: event.timeStamp,
      holdDurationMs:
        typeof noteOnTimestamp === 'number'
          ? Math.max(0, event.timeStamp - noteOnTimestamp)
          : 0,
    });

    this.emitInput({
      type: 'noteoff',
      note,
      velocity: 0,
      timestamp: event.timeStamp,
    });
  };

  private handleWindowBlur = (): void => {
    this.releaseAllHeldKeys();
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.releaseAllHeldKeys();
    }
  };

  private releaseAllHeldKeys(): void {
    if (this.heldActionsByCode.size === 0) {
      return;
    }

    const timestamp = performance.now();
    let sustainWasHeld = false;
    const notesToRelease: number[] = [];

    for (const [code, action] of this.heldActionsByCode.entries()) {
      if (action === 'sustain') {
        sustainWasHeld = true;
        continue;
      }
      if (action === 'octave-down' || action === 'octave-up') {
        continue;
      }
      const note = this.heldNotesByCode.get(code);
      if (note !== undefined) {
        notesToRelease.push(note);
      }
    }

    this.heldCodes.clear();
    this.heldActionsByCode.clear();
    this.heldNotesByCode.clear();
    this.noteOnTimestampsByCode.clear();

    for (const note of notesToRelease) {
      this.emitInput({
        type: 'noteoff',
        note,
        velocity: 0,
        timestamp,
      });
    }

    if (sustainWasHeld) {
      this.emitInput({
        type: 'sustain',
        sustainValue: 0,
        timestamp,
      });
    }
  }
}

export function isBindableCode(code: string): boolean {
  return isSupportedKeyboardCode(code);
}
