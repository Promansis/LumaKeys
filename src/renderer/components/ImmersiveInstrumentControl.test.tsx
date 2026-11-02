import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImmersiveInstrumentControl } from './ImmersiveInstrumentControl';

describe('ImmersiveInstrumentControl', () => {
  afterEach(() => {
    cleanup();
  });

  it('pins the instrument popout on click after hover and closes it on a second click', () => {
    render(<ImmersiveInstrumentControl instrumentId="acoustic-piano" onInstrumentChange={vi.fn()} />);

    const toggleButton = screen.getByRole('button', { name: 'Show instrument controls' });
    const popout = screen.getByTestId('immersive-instrument-popout');

    fireEvent.mouseEnter(toggleButton);
    expect(popout).toHaveAttribute('aria-hidden', 'false');

    fireEvent.click(toggleButton);
    fireEvent.mouseLeave(toggleButton);
    expect(popout).toHaveAttribute('aria-hidden', 'false');

    fireEvent.click(toggleButton);
    expect(popout).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the hover popout open while moving from the toggle into the panel', () => {
    render(<ImmersiveInstrumentControl instrumentId="acoustic-piano" onInstrumentChange={vi.fn()} />);

    const toggleButton = screen.getByRole('button', { name: 'Show instrument controls' });
    const popout = screen.getByTestId('immersive-instrument-popout');

    fireEvent.mouseEnter(toggleButton);
    fireEvent.mouseLeave(toggleButton);
    fireEvent.mouseEnter(popout);

    expect(popout).toHaveAttribute('aria-hidden', 'false');
  });

  it('closes the pinned popout when something else is clicked', () => {
    render(
      <div>
        <ImmersiveInstrumentControl instrumentId="acoustic-piano" onInstrumentChange={vi.fn()} />
        <button type="button">Outside</button>
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show instrument controls' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));

    expect(screen.getByTestId('immersive-instrument-popout')).toHaveAttribute('aria-hidden', 'true');
  });

  it('calls through with the selected instrument and closes the popout', () => {
    const onInstrumentChange = vi.fn();

    render(<ImmersiveInstrumentControl instrumentId="acoustic-piano" onInstrumentChange={onInstrumentChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show instrument controls' }));
    fireEvent.click(screen.getByRole('button', { name: 'Organ' }));

    expect(onInstrumentChange).toHaveBeenCalledWith('organ');
    expect(screen.getByTestId('immersive-instrument-popout')).toHaveAttribute('aria-hidden', 'true');
  });

  it('returns focus to the toggle when choosing an instrument closes the popout', async () => {
    render(<ImmersiveInstrumentControl instrumentId="acoustic-piano" onInstrumentChange={vi.fn()} />);

    const toggle = screen.getByRole('button', { name: 'Show instrument controls' });
    fireEvent.click(toggle);
    const option = screen.getByRole('button', { name: 'Organ' });
    option.focus();
    fireEvent.click(option);

    await waitFor(() => expect(toggle).toHaveFocus());
  });

  it('reveals instrument descriptions from compact info controls', () => {
    render(<ImmersiveInstrumentControl instrumentId="acoustic-piano" onInstrumentChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show instrument controls' }));
    fireEvent.click(screen.getByRole('button', { name: 'Organ info' }));

    expect(screen.getByText(/Sampled pipe organ/i)).toBeInTheDocument();
  });

  it('removes the closed instrument popout from the tab order with inert and restores it when open', () => {
    render(<ImmersiveInstrumentControl instrumentId="acoustic-piano" onInstrumentChange={vi.fn()} />);

    const popout = screen.getByTestId('immersive-instrument-popout');
    expect(popout).toHaveAttribute('inert');

    fireEvent.click(screen.getByRole('button', { name: 'Show instrument controls' }));
    expect(popout).not.toHaveAttribute('inert');
  });
});
