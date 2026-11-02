import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from '../../lib/audio/audioEngine';
import { LatencyWizard } from './LatencyWizard';

function buildAudioEngineStub(): AudioEngine {
  return { playMetronomeClick: vi.fn().mockResolvedValue(undefined) } as unknown as AudioEngine;
}

function Harness({ onApply, onBackdropEscape }: { onApply: (ms: number) => void; onBackdropEscape: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      onKeyDown={(event) => {
        if (event.key === 'Escape') onBackdropEscape();
      }}
    >
      <button onClick={() => setOpen(true)}>Calibrate…</button>
      <button>Behind the dialog</button>
      {open && (
        <LatencyWizard
          audioEngine={buildAudioEngineStub()}
          currentMs={40}
          onApply={onApply}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

async function openWizard(onApply = vi.fn(), onBackdropEscape = vi.fn()) {
  const user = userEvent.setup();
  render(<Harness onApply={onApply} onBackdropEscape={onBackdropEscape} />);
  const trigger = screen.getByRole('button', { name: 'Calibrate…' });
  trigger.focus();
  await user.keyboard('{Enter}');
  return { user, trigger, onApply, onBackdropEscape };
}

describe('LatencyWizard keyboard operation', () => {
  afterEach(() => {
    cleanup();
  });

  it('moves focus into the dialog and keeps Tab inside it', async () => {
    const { user } = await openWizard();
    const dialog = screen.getByRole('dialog', { name: 'Latency Calibration' });

    expect(dialog.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 6; i += 1) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('closes only the dialog on Escape and returns focus to the trigger', async () => {
    const outerKeys = vi.fn();
    const { user, trigger, onBackdropEscape } = await openWizard();
    window.addEventListener('keydown', outerKeys);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    // The app-level listener runs on window; it must not see an unhandled Escape.
    expect(outerKeys.mock.calls.every(([event]) => (event as KeyboardEvent).defaultPrevented)).toBe(true);
    expect(onBackdropEscape).not.toHaveBeenCalled();
    window.removeEventListener('keydown', outerKeys);
  });

  it('closes on Enter when the close button has focus instead of starting a measurement', async () => {
    const { user } = await openWizard();
    const closeButton = screen.getByRole('button', { name: '✕' });
    closeButton.focus();

    await user.keyboard('{Enter}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('still starts and taps from Space or Enter when no button has focus', async () => {
    const { user } = await openWizard();
    const dialog = screen.getByRole('dialog');
    (document.activeElement as HTMLElement).blur();
    dialog.focus();

    await user.keyboard(' ');
    expect(screen.getByText(/Warming up/)).toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(screen.getByText(/Warming up/)).toBeInTheDocument();
  });

  it('applies the measurement from the keyboard and persists it through onApply', async () => {
    const onApply = vi.fn();
    const { user } = await openWizard(onApply);

    await user.click(screen.getByRole('button', { name: 'Start' }));
    for (let i = 0; i < 10; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Tap' }));
    }

    const apply = screen.getByRole('button', { name: /^Apply \d+ ms$/ });
    apply.focus();
    await user.keyboard('{Enter}');

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('persists nothing when Escape closes the dialog', async () => {
    const { user, onApply } = await openWizard();
    await user.keyboard('{Escape}');
    expect(onApply).not.toHaveBeenCalled();
  });

  async function finishMeasurement(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Start' }));
    for (let i = 0; i < 10; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Tap' }));
    }
    expect(screen.getByText('Measurement complete.')).toBeInTheDocument();
  }

  it('persists nothing when Escape closes the dialog after a measurement', async () => {
    const { user, onApply } = await openWizard();
    await finishMeasurement(user);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('counts a tap when Space goes down on the Tap button, before the key is released', async () => {
    const { user } = await openWizard();
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('button', { name: 'Tap' })).toHaveFocus();
    expect(screen.getByText(/Warming up/)).toBeInTheDocument();

    // Hold Space on the focused Tap button without releasing it; three more would finish warm-up.
    await user.keyboard('[Space>]');
    await user.keyboard('[Space>]');
    await user.keyboard('[Space>]');
    expect(screen.getByText(/Measuring — 7 taps to go/)).toBeInTheDocument();
  });

  it('counts a keyboard tap on the Tap button once, not again on release', async () => {
    const { user } = await openWizard();
    await user.click(screen.getByRole('button', { name: 'Start' }));

    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    // Four presses: two warm-up taps and two measured taps, none counted twice.
    expect(screen.getByText(/Measuring — 6 taps to go/)).toBeInTheDocument();
  });

  it('does not apply when Space or Enter is pressed again after the last tap', async () => {
    const onApply = vi.fn();
    const { user } = await openWizard(onApply);
    await user.click(screen.getByRole('button', { name: 'Start' }));
    for (let i = 0; i < 9; i += 1) {
      await user.keyboard(' ');
    }
    // The tenth press finishes the measurement.
    await user.keyboard(' ');
    expect(screen.getByText('Measurement complete.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Apply \d+ ms$/ })).not.toHaveFocus();

    await user.keyboard(' ');
    await user.keyboard('{Enter}');

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Measurement complete.')).toBeInTheDocument();
  });
});
