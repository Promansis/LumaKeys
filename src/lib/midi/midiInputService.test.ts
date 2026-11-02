import { afterEach, describe, expect, it, vi } from 'vitest';
import { MidiInputService } from './midiInputService';

function buildInput(id: string): MIDIInput {
  return {
    id,
    name: id,
    manufacturer: 'Test',
    type: 'input',
    state: 'connected',
    connection: 'open',
    onstatechange: null,
    onmidimessage: null,
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as MIDIInput;
}

function buildAccess(inputs: Map<string, MIDIInput>): MIDIAccess {
  return {
    inputs,
    outputs: new Map(),
    sysexEnabled: false,
    onstatechange: null,
    onmidimessage: null,
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'statechange') accessStateChange = listener as EventListener;
    }),
    removeEventListener: vi.fn(),
  } as unknown as MIDIAccess;
}

let accessStateChange: EventListener | null = null;

afterEach(() => {
  accessStateChange = null;
  vi.restoreAllMocks();
});

describe('MidiInputService', () => {
  it('releases held notes before reporting a disconnected device', async () => {
    const input = buildInput('keyboard-1');
    const inputs = new Map([[input.id, input]]);
    const access = buildAccess(inputs);
    const requestMIDIAccess = vi.fn().mockResolvedValue(access);
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: requestMIDIAccess });
    const events: string[] = [];
    const service = new MidiInputService();
    service.subscribe((event) => events.push(`${event.type}:${event.note ?? ''}`));
    service.subscribeDevices((devices) => {
      if (devices.length > 0 || events.length > 0) {
        events.push(`devices:${devices.length}`);
      }
    });

    await service.init();
    input.onmidimessage?.({ data: new Uint8Array([0x90, 60, 100]), timeStamp: 10 } as MIDIMessageEvent);
    inputs.delete(input.id);
    accessStateChange?.(new Event('statechange'));

    expect(events).toEqual(['devices:1', 'noteon:60', 'noteoff:60', 'devices:0']);
    service.dispose();
  });

  it('keeps dropping other devices while the filtered device is absent', async () => {
    const other = buildInput('keyboard-2');
    const inputs = new Map([[other.id, other]]);
    const access = buildAccess(inputs);
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true,
      value: vi.fn().mockResolvedValue(access),
    });
    const events: string[] = [];
    const service = new MidiInputService();
    service.subscribe((event) => events.push(`${event.type}:${event.note ?? ''}`));

    await service.init();
    service.setDeviceFilter('keyboard-1');
    other.onmidimessage?.({ data: new Uint8Array([0x90, 60, 100]), timeStamp: 10 } as MIDIMessageEvent);
    expect(events).toEqual([]);

    service.setDeviceFilter(null);
    other.onmidimessage?.({ data: new Uint8Array([0x90, 60, 100]), timeStamp: 20 } as MIDIMessageEvent);
    expect(events).toEqual(['noteon:60']);
    service.dispose();
  });
});
