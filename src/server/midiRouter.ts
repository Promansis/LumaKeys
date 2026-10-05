import { Hono } from 'hono';
import { createSongId, importSongFromBuffer, reattachSongFromBuffer } from '../persistence/importSong';
import type { ImportError, ImportedSong } from '../shared/ipc';
import type { ServerDependencies } from './types';
import { MIDI_FILE_LIMIT_BYTES, midiUploadBodyLimit } from './webSecurity';
import { convertMuseScoreToMidi } from './museScore';

const MAX_MIDI_UPLOAD_BYTES = MIDI_FILE_LIMIT_BYTES;

function isMidiFilename(name: string): boolean {
  return /\.(mid|midi)$/i.test(name);
}

export function createMidiRouter({ db, midiStorage }: ServerDependencies) {
  const router = new Hono();

  router.post('/upload', midiUploadBodyLimit(), async (c) => {
    try {
      const formData = await c.req.formData();
      const files = formData.getAll('files');
      const songs = [];
      const errors = [];
      let skipped = 0;

      if (files.length === 0) {
        return c.json({ error: 'No files were uploaded.' }, 400);
      }

      for (const entry of files) {
        if (!(entry instanceof File)) {
          continue;
        }

        const isMuseScore = /\.mscz$/i.test(entry.name);
        const title = entry.name.replace(/\.(mid|midi|mscz)$/i, '') || 'Untitled';
        if (!isMidiFilename(entry.name) && !isMuseScore) {
          errors.push({ filename: entry.name || title, message: 'Only .mid, .midi, and .mscz files can be uploaded.' });
          continue;
        }
        if (entry.size <= 0) {
          errors.push({ filename: title, message: 'The file is empty.' });
          continue;
        }
        if (entry.size > MAX_MIDI_UPLOAD_BYTES) {
          errors.push({ filename: title, message: 'The file is larger than the 10 MB upload limit.' });
          continue;
        }

        try {
          const uploadedBytes = new Uint8Array(await entry.arrayBuffer());
          const bytes = isMuseScore ? await convertMuseScoreToMidi(uploadedBytes) : uploadedBytes;
          const songId = await createSongId(bytes);
          if (db.getSong(songId)) {
            skipped += 1;
            continue;
          }
          songs.push(
            await importSongFromBuffer(bytes, title, {
              db,
              midiStorage,
            }),
          );
        } catch (err) {
          errors.push({ filename: title, message: (err as Error).message });
        }
      }

      return c.json({ songs, errors, skipped });
    } catch (error) {
      return c.json({ error: (error as Error).message }, 500);
    }
  });

  router.post('/:songId/reattach', midiUploadBodyLimit(), async (c) => {
    const songId = c.req.param('songId');
    const song = db.getSong(songId);
    if (!song) {
      return c.json({ error: `Song not found: ${songId}` }, 404);
    }

    try {
      const formData = await c.req.formData();
      const files = formData.getAll('files');
      const reattached: ImportedSong[] = [];
      const errors: ImportError[] = [];
      let skipped = 0;

      if (files.length === 0) {
        return c.json({ error: 'No files were uploaded.' }, 400);
      }

      let entry: File | null = null;
      for (const file of files) {
        if (file instanceof File) {
          entry = file;
          break;
        }
      }
      if (!entry) {
        return c.json({ error: 'No files were uploaded.' }, 400);
      }

      const title = entry.name.replace(/\.(mid|midi)$/i, '') || song.title || 'Untitled';
      if (!isMidiFilename(entry.name)) {
        errors.push({ filename: entry.name || title, message: 'Only .mid and .midi files can be uploaded.' });
      } else if (entry.size <= 0) {
        errors.push({ filename: title, message: 'The file is empty.' });
      } else if (entry.size > MAX_MIDI_UPLOAD_BYTES) {
        errors.push({ filename: title, message: 'The file is larger than the 10 MB upload limit.' });
      } else {
        try {
          reattached.push(
            await reattachSongFromBuffer(songId, new Uint8Array(await entry.arrayBuffer()), title, {
              db,
              midiStorage,
            }),
          );
        } catch (err) {
          errors.push({ filename: title, message: (err as Error).message });
        }
      }

      skipped = Math.max(0, files.filter((file) => file instanceof File).length - 1);
      return c.json({ reattached, skipped, errors });
    } catch (error) {
      return c.json({ error: (error as Error).message }, 500);
    }
  });

  router.get('/:songId', async (c) => {
    const songId = c.req.param('songId');
    const song = db.getSong(songId);
    if (!song) {
      return c.json({ error: `Song not found: ${songId}` }, 404);
    }

    try {
      const bytes = await midiStorage.read(songId);
      const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      c.header('Content-Type', 'audio/midi');
      c.header('Cache-Control', 'private, max-age=3600');
      return c.body(body);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 404);
    }
  });

  return router;
}
