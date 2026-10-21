import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AnimalSoundboardCanvas } from './AnimalSoundboardCanvas';

const gradientStub = { addColorStop: vi.fn() };

function buildCanvasContextStub() {
  const noop = vi.fn();
  return new Proxy({ fillRect: vi.fn() } as Record<string, unknown>, {
    get(target, property: string) {
      if (property in target) return target[property];
      if (property === 'createLinearGradient' || property === 'createRadialGradient') {
        return vi.fn(() => gradientStub);
      }
      if (property === 'measureText') return vi.fn(() => ({ width: 80 }));
      return noop;
    },
    set() {
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe('AnimalSoundboardCanvas reduced motion', () => {
  let requestFrame: MockInstance<typeof window.requestAnimationFrame>;
  let context: CanvasRenderingContext2D;

  beforeEach(() => {
    context = buildCanvasContextStub();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('schedules no decorative animation frame when reduced motion is preferred', () => {
    mockReducedMotion(true);
    render(<AnimalSoundboardCanvas clips={[]} activeNotes={[60]} recentBursts={[]} />);

    expect(context.fillRect).toHaveBeenCalled();
    expect(requestFrame).not.toHaveBeenCalled();
  });

  it('keeps the animation loop running when reduced motion is not preferred', () => {
    mockReducedMotion(false);
    render(<AnimalSoundboardCanvas clips={[]} activeNotes={[60]} recentBursts={[]} />);

    expect(requestFrame).toHaveBeenCalled();
  });
});
