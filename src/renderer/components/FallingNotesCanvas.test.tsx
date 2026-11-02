import { describe, expect, it } from 'vitest';
import type { NoteJudgement, VisibleNote } from '../../lib/game/types';
import { judgementMark, noteFill, type CanvasPalette } from './FallingNotesCanvas';

const palette: CanvasPalette = {
  perfect: '#f5c542',
  good: '#40b56a',
  ok: '#4a90d9',
  miss: '#bf5b44',
  leftHand: '#7c6aff',
  rightHand: '#ff6b9d',
  surface: '#0f121d',
  grid: 'rgba(146, 156, 219, 0.16)',
  hitLine: '#7c6aff',
  text: 'rgba(244, 246, 255, 0.96)',
  selected: '#7c6aff',
};

function note(hand: 'left' | 'right', judgement: NoteJudgement): VisibleNote {
  return {
    id: `${hand}-${judgement}`,
    scheduledIndex: 0,
    midi: 60,
    label: 'C4',
    hand,
    judgement,
    xRatio: 0,
    widthRatio: 0.1,
    topRatio: 0,
    heightRatio: 0.1,
  };
}

const judged: NoteJudgement[] = ['perfect', 'good', 'ok', 'miss'];

describe('noteFill', () => {
  describe('colour-blind mode', () => {
    it('paints a missed note differently from a pending right-hand note', () => {
      expect(noteFill(note('right', 'miss'), true, palette)).not.toBe(noteFill(note('right', 'pending'), true, palette));
    });

    it('paints a good hit differently from a pending left-hand note', () => {
      expect(noteFill(note('left', 'good'), true, palette)).not.toBe(noteFill(note('left', 'pending'), true, palette));
    });

    it('never paints any judged note the colour of a pending note of either hand', () => {
      const pending = [noteFill(note('left', 'pending'), true, palette), noteFill(note('right', 'pending'), true, palette)];
      for (const judgement of judged) {
        for (const hand of ['left', 'right'] as const) {
          expect(pending, `${judgement} ${hand}`).not.toContain(noteFill(note(hand, judgement), true, palette));
        }
      }
    });

    it('keeps the two pending hands apart', () => {
      expect(noteFill(note('left', 'pending'), true, palette)).not.toBe(noteFill(note('right', 'pending'), true, palette));
    });

    it('gives each judgement its own colour', () => {
      const fills = judged.map((judgement) => noteFill(note('left', judgement), true, palette));
      expect(new Set(fills).size).toBe(judged.length);
    });
  });

  describe('judgementMark', () => {
    it('marks every judged note with its own shape in colour-blind mode and leaves pending notes bare', () => {
      const marks = judged.map((judgement) => judgementMark(judgement, true));
      expect(marks.every((mark) => mark !== null)).toBe(true);
      expect(new Set(marks).size).toBe(judged.length);
      expect(judgementMark('pending', true)).toBeNull();
    });

    it('draws no marks in the default palette', () => {
      for (const judgement of [...judged, 'pending' as const]) {
        expect(judgementMark(judgement, false)).toBeNull();
      }
    });
  });

  describe('default palette', () => {
    it('is unchanged: judgements use the theme colours and pending notes use the hand colours', () => {
      expect(noteFill(note('left', 'perfect'), false, palette)).toBe(palette.perfect);
      expect(noteFill(note('left', 'good'), false, palette)).toBe(palette.good);
      expect(noteFill(note('left', 'ok'), false, palette)).toBe(palette.ok);
      expect(noteFill(note('left', 'miss'), false, palette)).toBe(palette.miss);
      expect(noteFill(note('left', 'pending'), false, palette)).toBe(palette.leftHand);
      expect(noteFill(note('right', 'pending'), false, palette)).toBe(palette.rightHand);
    });
  });
});
