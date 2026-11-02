import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SongRow } from '../../shared/dbTypes';
import { PlaylistView } from './PlaylistView';

function song(id: string, title: string): SongRow {
  return {
    id,
    title,
    artist: 'Composer',
    tags: [],
  } as unknown as SongRow;
}

const SONGS = [song('a', 'Alpha Waltz'), song('b', 'Bravo Etude'), song('c', 'Charlie Nocturne')];

function renderView(songs: SongRow[], overrides: Partial<Parameters<typeof PlaylistView>[0]> = {}) {
  const props = {
    songs,
    canReorder: true,
    onPlayAll: vi.fn(),
    onStartSession: vi.fn(),
    onRemoveSong: vi.fn(),
    // Never settles by default: the reload has not happened yet.
    onReorderSong: vi.fn((_songId: string, _newOrder: number) => new Promise<void>(() => {})),
    onTagClick: vi.fn(),
    ...overrides,
  };
  const utils = render(<PlaylistView {...props} />);
  return { ...utils, props };
}

describe('PlaylistView reorder buttons', () => {
  afterEach(() => cleanup());

  it('moves a song down and up through onReorderSong with the target index', async () => {
    const { props } = renderView(SONGS, { onReorderSong: vi.fn(() => Promise.resolve()) });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Move down.*Alpha Waltz/ }));
    });
    expect(props.onReorderSong).toHaveBeenLastCalledWith('a', 1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Move up.*Charlie Nocturne/ }));
    });
    expect(props.onReorderSong).toHaveBeenLastCalledWith('c', 1);
  });

  it('disables Move up on the first row and Move down on the last row', () => {
    renderView(SONGS);

    expect(screen.getByRole('button', { name: /Move up.*Alpha Waltz/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Move down.*Charlie Nocturne/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Move up.*Bravo Etude/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Move down.*Bravo Etude/ })).toBeEnabled();
  });

  it('disables every move button while search or filters block reordering', () => {
    renderView(SONGS, { canReorder: false });

    screen.getAllByRole('button', { name: /^Move (up|down)/ }).forEach((button) => {
      expect(button).toBeDisabled();
    });
  });

  it('keeps focus on the moved row and announces the new position once the order updates', () => {
    const { props, rerender } = renderView(SONGS);

    const down = screen.getByRole('button', { name: /Move down.*Alpha Waltz/ });
    down.focus();
    fireEvent.click(down);
    expect(props.onReorderSong).toHaveBeenCalledWith('a', 1);

    rerender(<PlaylistView {...props} songs={[SONGS[1], SONGS[0], SONGS[2]]} />);

    expect(screen.getByRole('button', { name: /Move down.*Alpha Waltz/ })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Moved Alpha Waltz to position 2 of 3.');
  });

  it('moves focus to the other move button when the song reaches the end of the list', () => {
    const { props, rerender } = renderView(SONGS);

    const down = screen.getByRole('button', { name: /Move down.*Bravo Etude/ });
    down.focus();
    fireEvent.click(down);
    rerender(<PlaylistView {...props} songs={[SONGS[0], SONGS[2], SONGS[1]]} />);

    // Move down is now disabled on the last row, so focus lands on Move up instead of being lost.
    expect(screen.getByRole('button', { name: /Move down.*Bravo Etude/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Move up.*Bravo Etude/ })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Moved Bravo Etude to position 3 of 3.');
  });

  it('ignores a second move press until the first reorder settles', () => {
    const { props } = renderView(SONGS);

    fireEvent.click(screen.getByRole('button', { name: /Move down.*Alpha Waltz/ }));
    fireEvent.click(screen.getByRole('button', { name: /Move down.*Alpha Waltz/ }));
    fireEvent.click(screen.getByRole('button', { name: /Move up.*Charlie Nocturne/ }));

    expect(props.onReorderSong).toHaveBeenCalledTimes(1);
    expect(props.onReorderSong).toHaveBeenCalledWith('a', 1);
  });

  it('drops the pending move without announcing when the reorder settles without the new order', async () => {
    // The parent catches a failed reorder, shows its own error and resolves; the order is unchanged.
    const onReorderSong = vi.fn((_songId: string, _newOrder: number) => Promise.resolve());
    const { props, rerender } = renderView(SONGS, { onReorderSong });

    const down = screen.getByRole('button', { name: /Move down.*Alpha Waltz/ });
    down.focus();
    await act(async () => {
      fireEvent.click(down);
    });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    // A later, unrelated reload that happens to put Alpha second must not be announced as this move.
    const other = screen.getByRole('button', { name: /Move up.*Charlie Nocturne/ });
    other.focus();
    rerender(<PlaylistView {...props} songs={[SONGS[1], SONGS[0], SONGS[2]]} />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('button', { name: /Move up.*Charlie Nocturne/ })).toHaveFocus();

    // And the next press is accepted, with an index from the current order.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Move down.*Alpha Waltz/ }));
    });
    expect(onReorderSong).toHaveBeenLastCalledWith('a', 2);
  });
});
