import { afterEach, describe, expect, it } from 'vitest';
import { ComputerKeyboardInputService } from './computerKeyboardInputService';
import { MAX_OCTAVE_SHIFT } from './settings';

function dispatch(
  type: 'keydown' | 'keyup',
  code: string,
  options: {
    repeat?: boolean;
    shiftKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    timeStamp?: number;
    target?: EventTarget;
  } = {},
): KeyboardEvent {
  const event = new KeyboardEvent(type, {
    code,
    repeat: options.repeat,
    shiftKey: options.shiftKey,
    ctrlKey: options.ctrlKey,
    metaKey: options.metaKey,
    altKey: options.altKey,
    bubbles: true,
    cancelable: true,
  });
  if (typeof options.timeStamp === 'number') {
    Object.defineProperty(event, 'timeStamp', {
      configurable: true,
      value: options.timeStamp,
    });
  }
  (options.target ?? window).dispatchEvent(event);
  return event;
}

describe('ComputerKeyboardInputService', () => {
  const services: ComputerKeyboardInputService[] = [];

  afterEach(() => {
    for (const service of services) {
      service.dispose();
    }
    services.length = 0;
  });

  it('emits noteon and noteoff for default note bindings', () => {
    const service = new ComputerKeyboardInputService();
    services.push(service);
    service.init();

    const events: string[] = [];
    const unsub = service.subscribe((event) => {
      if (event.type === 'noteon' || event.type === 'noteoff') {
        events.push(`${event.type}:${event.note}`);
      }
    });

    dispatch('keydown', 'KeyZ');
    dispatch('keyup', 'KeyZ');

    unsub();
    expect(events).toEqual(['noteon:48', 'noteoff:48']);
  });

  it('ignores repeated keydown for the same key', () => {
    const service = new ComputerKeyboardInputService();
    services.push(service);
    service.init();

    const events: string[] = [];
    service.subscribe((event) => {
      if (event.type === 'noteon') {
        events.push(`noteon:${event.note}`);
      }
    });

    dispatch('keydown', 'KeyZ');
    dispatch('keydown', 'KeyZ', { repeat: true });
    dispatch('keyup', 'KeyZ');

    expect(events).toEqual(['noteon:48']);
  });

  it('applies octave shift and clamps to max range', () => {
    const service = new ComputerKeyboardInputService();
    services.push(service);
    service.init();

    for (let i = 0; i < 12; i += 1) {
      dispatch('keydown', 'BracketRight');
      dispatch('keyup', 'BracketRight');
    }

    expect(service.getState().octaveShift).toBe(MAX_OCTAVE_SHIFT);

    const events: number[] = [];
    service.subscribe((event) => {
      if (event.type === 'noteon' && typeof event.note === 'number') {
        events.push(event.note);
      }
    });

    dispatch('keydown', 'KeyP');
    dispatch('keyup', 'KeyP');

    expect(events.at(0)).toBe(105);
  });

  it('releases held notes and sustain on blur', () => {
    const service = new ComputerKeyboardInputService();
    services.push(service);
    service.init();

    const events: string[] = [];
    service.subscribe((event) => {
      if (event.type === 'sustain') {
        events.push(`sustain:${event.sustainValue}`);
      }
      if (event.type === 'noteoff') {
        events.push(`noteoff:${event.note}`);
      }
    });

    dispatch('keydown', 'Space');
    dispatch('keydown', 'KeyZ');
    window.dispatchEvent(new Event('blur'));

    expect(events).toContain('noteoff:48');
    expect(events).toContain('sustain:0');
  });

  it('uses deterministic keyboard velocities for normal and accented notes', () => {
    const service = new ComputerKeyboardInputService();
    services.push(service);
    service.init();

    const velocities: number[] = [];
    service.subscribe((event) => {
      if (event.type === 'noteon' && typeof event.velocity === 'number') {
        velocities.push(event.velocity);
      }
    });

    dispatch('keydown', 'KeyZ', { timeStamp: 100 });
    dispatch('keyup', 'KeyZ', { timeStamp: 180 });
    dispatch('keydown', 'KeyX', { shiftKey: true, timeStamp: 250 });
    dispatch('keyup', 'KeyX', { timeStamp: 330 });

    expect(velocities).toEqual([0.65, 0.92]);
  });

  it('adds a deterministic retrigger boost after a note is released', () => {
    const service = new ComputerKeyboardInputService();
    services.push(service);
    service.init();

    const velocities: number[] = [];
    service.subscribe((event) => {
      if (event.type === 'noteon' && typeof event.velocity === 'number') {
        velocities.push(event.velocity);
      }
    });

    dispatch('keydown', 'KeyZ', { timeStamp: 100 });
    dispatch('keyup', 'KeyZ', { timeStamp: 600 });
    dispatch('keydown', 'KeyZ', { timeStamp: 700 });

    expect(velocities).toHaveLength(2);
    expect(velocities[0]).toBe(0.65);
    expect(velocities[1]).toBeGreaterThan(0.65);
    expect(velocities[1]).toBeLessThanOrEqual(0.73);
  });

  describe('focused controls', () => {
    function setup() {
      const service = new ComputerKeyboardInputService();
      services.push(service);
      service.init();
      const events: string[] = [];
      service.subscribe((event) => {
        if (event.type === 'noteon' || event.type === 'sustain') {
          events.push(event.type === 'noteon' ? `noteon:${event.note}` : `sustain:${event.sustainValue}`);
        }
      });
      return events;
    }

    function mount(tag: 'button' | 'input' | 'select' | 'textarea'): HTMLElement {
      const element = document.createElement(tag);
      document.body.appendChild(element);
      element.focus();
      return element;
    }

    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('plays note keys while a button has focus', () => {
      const events = setup();
      const button = mount('button');

      const down = dispatch('keydown', 'KeyZ', { target: button });
      dispatch('keyup', 'KeyZ', { target: button });

      expect(events).toEqual(['noteon:48']);
      expect(down.defaultPrevented).toBe(true);
    });

    it('leaves Space and Enter to a focused button', () => {
      const events = setup();
      const button = mount('button');

      const space = dispatch('keydown', 'Space', { target: button });
      const enter = dispatch('keydown', 'Enter', { target: button });

      expect(events).toEqual([]);
      expect(space.defaultPrevented).toBe(false);
      expect(enter.defaultPrevented).toBe(false);
    });

    it('still sustains on Space when nothing is focused', () => {
      const events = setup();
      dispatch('keydown', 'Space');
      expect(events).toEqual(['sustain:127']);
    });

    it.each(['input', 'select', 'textarea'] as const)('ignores every key while a %s has focus', (tag) => {
      const events = setup();
      const field = mount(tag);

      const down = dispatch('keydown', 'KeyZ', { target: field });

      expect(events).toEqual([]);
      expect(down.defaultPrevented).toBe(false);
    });
  });

  describe('modifier shortcuts', () => {
    it.each([
      ['ctrlKey', 'Digit0'],
      ['metaKey', 'Digit0'],
      ['altKey', 'KeyZ'],
      ['ctrlKey', 'KeyR'],
    ] as const)('lets %s + %s reach the browser', (modifier, code) => {
      const service = new ComputerKeyboardInputService();
      services.push(service);
      service.init();
      const events: string[] = [];
      service.subscribe((event) => events.push(event.type));

      const down = dispatch('keydown', code, { [modifier]: true });
      const up = dispatch('keyup', code, { [modifier]: true });

      expect(events).toEqual([]);
      expect(down.defaultPrevented).toBe(false);
      expect(up.defaultPrevented).toBe(false);
    });

    it('still plays Digit0 louder with Shift and without a shortcut modifier', () => {
      const service = new ComputerKeyboardInputService();
      services.push(service);
      service.init();
      const velocities: number[] = [];
      service.subscribe((event) => {
        if (event.type === 'noteon' && typeof event.velocity === 'number') {
          velocities.push(event.velocity);
        }
      });

      const plain = dispatch('keydown', 'Digit0', { timeStamp: 100 });
      dispatch('keyup', 'Digit0', { timeStamp: 150 });
      dispatch('keydown', 'Digit0', { shiftKey: true, timeStamp: 900 });
      dispatch('keyup', 'Digit0', { timeStamp: 950 });

      expect(plain.defaultPrevented).toBe(true);
      expect(velocities).toHaveLength(2);
      expect(velocities[1]).toBeGreaterThan(velocities[0]);
    });

    it('releases a held note when Ctrl is pressed before its key comes up', () => {
      const service = new ComputerKeyboardInputService();
      services.push(service);
      service.init();
      const events: string[] = [];
      service.subscribe((event) => events.push(`${event.type}:${event.note}`));

      dispatch('keydown', 'KeyZ');
      const up = dispatch('keyup', 'KeyZ', { ctrlKey: true });

      expect(events).toEqual(['noteon:48', 'noteoff:48']);
      expect(up.defaultPrevented).toBe(false);
    });
  });
});
