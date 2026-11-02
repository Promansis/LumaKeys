import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ControlBar } from './ControlBar';

function renderControlBar(tempoLocked?: boolean) {
  render(
    <ControlBar
      canPlay
      isPlaying={false}
      tempo={0.9}
      progress={0}
      songTitle="Ode to Joy"
      currentTimeLabel="0:00"
      durationLabel="0:30"
      tempoLocked={tempoLocked}
      onPlayPause={vi.fn()}
      onRestart={vi.fn()}
      onTempoChange={vi.fn()}
      onSeek={vi.fn()}
    />,
  );
}

describe('ControlBar', () => {
  afterEach(() => {
    cleanup();
  });

  it('disables the tempo slider while the tempo is locked', () => {
    renderControlBar(true);

    expect(screen.getByLabelText(/Tempo/)).toBeDisabled();
    expect(screen.getByLabelText(/Song Position/)).toBeEnabled();
  });

  it('leaves the tempo slider free by default', () => {
    renderControlBar();

    expect(screen.getByLabelText(/Tempo/)).toBeEnabled();
  });
});
