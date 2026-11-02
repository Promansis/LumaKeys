import { describe, expect, it } from 'vitest';
import {
  createDefaultKeyboardMapping,
  KEYBOARD_NOTE_ACTIONS,
  KEYBOARD_NOTE_SLOT_COUNT,
  parseKeyboardMapping,
  stringifyKeyboardMapping,
} from './settings';

describe('input settings', () => {
  it('creates the full 34-note default piano-style mapping', () => {
    const mapping = createDefaultKeyboardMapping();
    const expectedBindings = {
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
    } as const;

    expect(KEYBOARD_NOTE_SLOT_COUNT).toBe(34);
    expect(KEYBOARD_NOTE_ACTIONS).toHaveLength(34);
    for (const [action, code] of Object.entries(expectedBindings)) {
      expect(mapping[action as keyof typeof expectedBindings]).toBe(code);
    }
  });

  it('backfills newly added upper notes when parsing older saved mappings', () => {
    const parsed = parseKeyboardMapping(
      JSON.stringify({
        'note-0': 'KeyA',
        'note-29': 'KeyU',
        sustain: 'Space',
      }),
    );

    expect(parsed['note-0']).toBe('KeyA');
    expect(parsed['note-29']).toBe('KeyU');
    expect(parsed['note-30']).toBe('Digit9');
    expect(parsed['note-31']).toBe('KeyO');
    expect(parsed['note-32']).toBe('Digit0');
    expect(parsed['note-33']).toBe('KeyP');
  });

  it('reads an explicit null as an unbound note, not as the default key', () => {
    const parsed = parseKeyboardMapping(JSON.stringify({ 'note-0': null }));

    expect(parsed['note-0']).toBeNull();
    expect(parsed['note-1']).toBe(createDefaultKeyboardMapping()['note-1']);
  });

  it('gives the default key to a note whose key is missing', () => {
    expect(parseKeyboardMapping(JSON.stringify({}))).toEqual(createDefaultKeyboardMapping());
  });

  it('still falls back to the default for an unusable stored value', () => {
    const defaults = createDefaultKeyboardMapping();
    const parsed = parseKeyboardMapping(JSON.stringify({ 'note-0': 42, 'note-1': 'ShiftLeft' }));

    expect(parsed['note-0']).toBe(defaults['note-0']);
    expect(parsed['note-1']).toBe(defaults['note-1']);
  });

  it('round-trips an unbound note through stringify and parse', () => {
    const mapping = { ...createDefaultKeyboardMapping(), 'note-0': null, 'note-12': 'KeyK' };

    expect(parseKeyboardMapping(stringifyKeyboardMapping(mapping))).toEqual(mapping);
  });
});
