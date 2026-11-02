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
});
