import type { InputMode, KeyboardAction, KeyboardMapping, KeyboardNoteAction } from './types';

export const INPUT_SETTINGS_CATEGORY = 'input';
export const INPUT_MODE_SETTING_KEY = 'mode';
export const INPUT_KEYBOARD_MAPPING_SETTING_KEY = 'keyboardMapping';

export const DEFAULT_INPUT_MODE: InputMode = 'both';
export const MIN_MIDI_NOTE = 21;
export const MAX_MIDI_NOTE = 108;
export const DEFAULT_KEYBOARD_ROOT_MIDI = 48;
export const KEYBOARD_NOTE_SLOT_COUNT = 34;
export const MIN_OCTAVE_SHIFT = Math.ceil((MIN_MIDI_NOTE - DEFAULT_KEYBOARD_ROOT_MIDI) / 12);
export const MAX_OCTAVE_SHIFT = Math.floor(
  (MAX_MIDI_NOTE - (DEFAULT_KEYBOARD_ROOT_MIDI + KEYBOARD_NOTE_SLOT_COUNT - 1)) / 12,
);

export const KEYBOARD_NOTE_ACTIONS: KeyboardNoteAction[] = [
  'note-0',
  'note-1',
  'note-2',
  'note-3',
  'note-4',
  'note-5',
  'note-6',
  'note-7',
  'note-8',
  'note-9',
  'note-10',
  'note-11',
  'note-12',
  'note-13',
  'note-14',
  'note-15',
  'note-16',
  'note-17',
  'note-18',
  'note-19',
  'note-20',
  'note-21',
  'note-22',
  'note-23',
  'note-24',
  'note-25',
  'note-26',
  'note-27',
  'note-28',
  'note-29',
  'note-30',
  'note-31',
  'note-32',
  'note-33',
];

export const KEYBOARD_ACTIONS: KeyboardAction[] = [...KEYBOARD_NOTE_ACTIONS, 'sustain', 'octave-down', 'octave-up'];

const DEFAULT_MAPPING_CODES: Record<KeyboardAction, string> = {
  'note-0': 'KeyZ',
  'note-1': 'KeyS',
  'note-2': 'KeyX',
  'note-3': 'KeyD',
  'note-4': 'KeyC',
  'note-5': 'KeyV',
  'note-6': 'KeyG',
  'note-7': 'KeyB',
  'note-8': 'KeyH',
  'note-9': 'KeyN',
  'note-10': 'KeyJ',
  'note-11': 'KeyM',
  'note-12': 'Comma',
  'note-13': 'KeyL',
  'note-14': 'Period',
  'note-15': 'Semicolon',
  'note-16': 'Slash',
  'note-17': 'KeyQ',
  'note-18': 'Digit2',
  'note-19': 'KeyW',
  'note-20': 'Digit3',
  'note-21': 'KeyE',
  'note-22': 'Digit4',
  'note-23': 'KeyR',
  'note-24': 'KeyT',
  'note-25': 'Digit6',
  'note-26': 'KeyY',
  'note-27': 'Digit7',
  'note-28': 'KeyU',
  'note-29': 'KeyI',
  'note-30': 'Digit9',
  'note-31': 'KeyO',
  'note-32': 'Digit0',
  'note-33': 'KeyP',
  sustain: 'Space',
  'octave-down': 'BracketLeft',
  'octave-up': 'BracketRight',
};

const UNSUPPORTED_CODES = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'CapsLock',
  'NumLock',
  'ScrollLock',
]);

function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseInputMode(raw: string | null | undefined): InputMode {
  if (raw === 'midi' || raw === 'computer-keyboard' || raw === 'both') {
    return raw;
  }
  return DEFAULT_INPUT_MODE;
}

export function createDefaultKeyboardMapping(): KeyboardMapping {
  const mapping = {} as KeyboardMapping;
  for (const action of KEYBOARD_ACTIONS) {
    mapping[action] = DEFAULT_MAPPING_CODES[action];
  }
  return mapping;
}

export function parseKeyboardMapping(raw: string | null | undefined): KeyboardMapping {
  const fallback = createDefaultKeyboardMapping();
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return fallback;
    }

    const next = { ...fallback };
    for (const action of KEYBOARD_ACTIONS) {
      const stored = (parsed as Record<string, unknown>)[action];
      // An explicit null is the stored form of "unbound"; only a missing or unusable entry gets the default.
      if (stored === null) {
        next[action] = null;
        continue;
      }
      const value = normalizeCode(stored);
      if (value === null) {
        continue;
      }
      if (!isSupportedKeyboardCode(value)) {
        continue;
      }
      next[action] = value;
    }
    return next;
  } catch {
    return fallback;
  }
}

export function stringifyKeyboardMapping(mapping: KeyboardMapping): string {
  return JSON.stringify(mapping);
}

export function noteActionToOffset(action: KeyboardNoteAction): number {
  return Number(action.slice(5));
}

function isKeyboardNoteAction(action: KeyboardAction): action is KeyboardNoteAction {
  return action.startsWith('note-');
}

export function keyboardActionToDisplay(action: KeyboardAction): string {
  if (isKeyboardNoteAction(action)) {
    const offset = noteActionToOffset(action);
    return `Slot ${offset + 1}`;
  }
  if (action === 'sustain') {
    return 'Sustain';
  }
  if (action === 'octave-down') {
    return 'Octave Down';
  }
  return 'Octave Up';
}

export function keyboardActionToMidi(action: KeyboardNoteAction, octaveShift: number): number | null {
  const midi = DEFAULT_KEYBOARD_ROOT_MIDI + noteActionToOffset(action) + octaveShift * 12;
  if (midi < MIN_MIDI_NOTE || midi > MAX_MIDI_NOTE) {
    return null;
  }
  return midi;
}

export function invertKeyboardMapping(mapping: KeyboardMapping): Map<string, KeyboardAction> {
  const result = new Map<string, KeyboardAction>();
  for (const action of KEYBOARD_ACTIONS) {
    const code = mapping[action];
    if (!code) {
      continue;
    }
    result.set(code, action);
  }
  return result;
}

export function assignKeyboardCode(mapping: KeyboardMapping, action: KeyboardAction, code: string | null): KeyboardMapping {
  const next = { ...mapping };
  if (code === null) {
    next[action] = null;
    return next;
  }

  for (const key of KEYBOARD_ACTIONS) {
    if (next[key] === code) {
      next[key] = null;
    }
  }
  next[action] = code;
  return next;
}

export function clampOctaveShift(value: number): number {
  return Math.max(MIN_OCTAVE_SHIFT, Math.min(MAX_OCTAVE_SHIFT, Math.round(value)));
}

export function isSupportedKeyboardCode(code: string): boolean {
  if (UNSUPPORTED_CODES.has(code)) {
    return false;
  }
  return /^[A-Za-z0-9]+$/.test(code) || ['Space', 'BracketLeft', 'BracketRight', 'Minus', 'Equal', 'Comma', 'Period', 'Slash', 'Semicolon'].includes(code);
}

export function formatKeyboardCode(code: string | null): string {
  if (!code) {
    return 'Unbound';
  }
  if (code.startsWith('Key')) {
    return code.slice(3);
  }
  if (code.startsWith('Digit')) {
    return code.slice(5);
  }
  if (code === 'Space') {
    return 'Space';
  }
  if (code === 'BracketLeft') {
    return '[';
  }
  if (code === 'BracketRight') {
    return ']';
  }
  if (code === 'Comma') {
    return ',';
  }
  if (code === 'Period') {
    return '.';
  }
  if (code === 'Slash') {
    return '/';
  }
  if (code === 'Semicolon') {
    return ';';
  }
  if (code === 'Minus') {
    return '-';
  }
  return code;
}
