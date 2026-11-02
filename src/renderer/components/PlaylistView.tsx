import { useLayoutEffect, useRef, useState } from 'react';
import type { SongRow } from '../../shared/dbTypes';
import { TagChips } from './TagChips';

type MoveDirection = 'up' | 'down';

interface PlaylistViewProps {
  songs: SongRow[];
  canReorder: boolean;
  onPlayAll: () => void;
  onStartSession: (song: SongRow) => void;
  onRemoveSong: (songId: string) => void;
  onReorderSong: (songId: string, newOrder: number) => void;
  onTagClick: (tag: string) => void;
}

export function PlaylistView({
  songs,
  canReorder,
  onPlayAll,
  onStartSession,
  onRemoveSong,
  onReorderSong,
  onTagClick,
}: PlaylistViewProps) {
  const [announcement, setAnnouncement] = useState('');
  const pendingMoveRef = useRef<{ songId: string; toIndex: number; direction: MoveDirection } | null>(null);
  const moveButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  const moveSong = (songId: string, index: number, direction: MoveDirection) => {
    const toIndex = direction === 'up' ? index - 1 : index + 1;
    pendingMoveRef.current = { songId, toIndex, direction };
    onReorderSong(songId, toIndex);
  };

  // The parent reloads the order after the reorder call resolves. Once the moved song shows up at its
  // target position, announce it and put focus back on its move button (the one that was used, or the
  // opposite one when the song reached an end and the used button is now disabled).
  useLayoutEffect(() => {
    const pending = pendingMoveRef.current;
    if (!pending || songs[pending.toIndex]?.id !== pending.songId) {
      return;
    }
    pendingMoveRef.current = null;
    setAnnouncement(`Moved ${songs[pending.toIndex].title} to position ${pending.toIndex + 1} of ${songs.length}.`);
    const opposite: MoveDirection = pending.direction === 'up' ? 'down' : 'up';
    const preferred = moveButtonRefs.current.get(`${pending.songId}:${pending.direction}`);
    const fallback = moveButtonRefs.current.get(`${pending.songId}:${opposite}`);
    (preferred && !preferred.disabled ? preferred : fallback)?.focus();
  }, [songs]);

  const setMoveButtonRef = (songId: string, direction: MoveDirection) => (node: HTMLButtonElement | null) => {
    const key = `${songId}:${direction}`;
    if (node) {
      moveButtonRefs.current.set(key, node);
    } else {
      moveButtonRefs.current.delete(key);
    }
  };

  return (
    <section className="panel playlist-view">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Playlist</p>
          <h2>Ordered Songs</h2>
          {!canReorder && <p className="panel-copy">Clear search and advanced filters to reorder this playlist.</p>}
        </div>
        <button className="primary-button" onClick={onPlayAll} disabled={songs.length === 0}>
          Play All
        </button>
      </div>

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className="playlist-list">
        {songs.map((song, index) => (
          <div
            key={song.id}
            className="playlist-row"
            draggable={canReorder}
            onDragStart={(event) => {
              event.dataTransfer.setData('text/plain', song.id);
            }}
            onDragOver={(event) => {
              if (canReorder) {
                event.preventDefault();
              }
            }}
            onDrop={(event) => {
              if (!canReorder) {
                return;
              }
              event.preventDefault();
              const draggedSongId = event.dataTransfer.getData('text/plain');
              if (draggedSongId && draggedSongId !== song.id) {
                onReorderSong(draggedSongId, index);
              }
            }}
          >
            <div className="playlist-row-main">
              <strong>{index + 1}. {song.title}</strong>
              <span>{song.artist || 'Unknown artist'}</span>
              <TagChips tags={song.tags} onTagClick={onTagClick} />
            </div>
            <div className="transport-buttons">
              <button
                ref={setMoveButtonRef(song.id, 'up')}
                className="secondary-button"
                type="button"
                aria-label={`Move up: ${song.title}`}
                disabled={!canReorder || index === 0}
                onClick={() => moveSong(song.id, index, 'up')}
              >
                Move up
              </button>
              <button
                ref={setMoveButtonRef(song.id, 'down')}
                className="secondary-button"
                type="button"
                aria-label={`Move down: ${song.title}`}
                disabled={!canReorder || index === songs.length - 1}
                onClick={() => moveSong(song.id, index, 'down')}
              >
                Move down
              </button>
              <button className="secondary-button" onClick={() => onStartSession(song)}>
                Play
              </button>
              <button className="secondary-button" onClick={() => onRemoveSong(song.id)}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
