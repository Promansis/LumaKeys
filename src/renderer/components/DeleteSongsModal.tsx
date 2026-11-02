import { useEffect, useRef } from 'react';
import { useModalFocusTrap } from '../useModalFocusTrap';

interface DeleteSongsModalProps {
  songCount: number;
  triggerRef: { current: HTMLElement | null };
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteSongsModal({ songCount, triggerRef, onCancel, onConfirm }: DeleteSongsModalProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const noun = songCount === 1 ? 'song' : 'songs';

  useModalFocusTrap({ open: true, dialogRef, triggerRef, onEscape: onCancel });

  // The trap focuses the first control, which is Delete. Cancel takes focus instead.
  useEffect(() => {
    cancelButtonRef.current?.focus();
  }, []);

  return (
    <div
      className="settings-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <section
        ref={dialogRef}
        className="panel settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-songs-title"
        aria-describedby="delete-songs-description"
        tabIndex={-1}
      >
        <p className="eyebrow">Confirm Action</p>
        <h2 id="delete-songs-title">Delete {songCount} {noun}?</h2>
        <p id="delete-songs-description" className="panel-copy">
          This removes {songCount === 1 ? 'the song' : `these ${songCount} songs`} from the library.
          Their results, practice history, fingerings, trouble spots and playlist places go too. It cannot be undone.
        </p>
        <div className="settings-modal-actions">
          <button className="danger-button" onClick={onConfirm}>
            Delete {songCount} {noun}
          </button>
          <button ref={cancelButtonRef} className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}
