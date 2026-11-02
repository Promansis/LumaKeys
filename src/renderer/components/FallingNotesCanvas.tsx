import { useEffect, useRef, useState } from 'react';
import type { PlaybackSnapshot, VisibleNote, NoteJudgement } from '../../lib/game/types';
import { getKeyPosition, OCTAVE_C_MIDI } from '../../lib/piano/pianoLayout';

interface FallingNotesCanvasProps {
  snapshot: PlaybackSnapshot;
  onFileDrop: (file: File) => void;
  fingeringEditEnabled?: boolean;
  selectedNoteId?: string | null;
  onNoteSelect?: (note: VisibleNote, anchorPoint: { x: number; y: number }) => void;
  colorBlindMode?: boolean;
  noteLabels?: 'alphabetic' | 'symbols' | 'both' | 'none';
  noteLabelSize?: 'small' | 'medium' | 'large';
}

export interface CanvasPalette {
  perfect: string;
  good: string;
  ok: string;
  miss: string;
  leftHand: string;
  rightHand: string;
  surface: string;
  grid: string;
  hitLine: string;
  text: string;
  selected: string;
}

interface JudgmentPopup {
  id: string;
  x: number;
  y: number;
  label: string;
  colour: string;
  createdAt: number;
  duration: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  colour: string;
  createdAt: number;
  duration: number;
}

interface EffectsState {
  popups: JudgmentPopup[];
  particles: Particle[];
  vignette: { createdAt: number; duration: number } | null;
}

function readCanvasPalette(): CanvasPalette {
  const styles = getComputedStyle(document.documentElement);
  return {
    perfect: styles.getPropertyValue('--color-perfect').trim() || '#f5c542',
    good: styles.getPropertyValue('--color-good').trim() || '#40b56a',
    ok: styles.getPropertyValue('--color-ok').trim() || '#4a90d9',
    miss: styles.getPropertyValue('--color-miss').trim() || '#bf5b44',
    leftHand: styles.getPropertyValue('--hand-left-color').trim() || styles.getPropertyValue('--color-accent').trim() || '#3366cc',
    rightHand: styles.getPropertyValue('--hand-right-color').trim() || styles.getPropertyValue('--color-accent-secondary').trim() || '#dc5b35',
    surface: styles.getPropertyValue('--color-chart-bg').trim() || '#fdf9f1',
    grid: styles.getPropertyValue('--color-chart-grid').trim() || 'rgba(35, 33, 28, 0.08)',
    hitLine: styles.getPropertyValue('--color-accent').trim() || '#1f3d7a',
    text: styles.getPropertyValue('--color-note-text').trim() || 'rgba(255, 250, 244, 0.96)',
    selected: styles.getPropertyValue('--color-accent').trim() || '#1f3d7a',
  };
}

// Colour-blind mode: hand identity and judgement outcome must not share a colour. Pending notes keep
// the two Tol hand colours (blue, pink). Judged notes use lightness steps well away from them
// (near-white, light cyan, near-black) and are also outlined and marked, see judgementMark.
const COLOR_BLIND_HAND_LEFT = '#4477AA';
const COLOR_BLIND_HAND_RIGHT = '#EE6677';
const COLOR_BLIND_GOOD = '#EEEEEE';
const COLOR_BLIND_OK = '#66CCEE';
const COLOR_BLIND_MISS = '#222222';

export type JudgementMarkKind = 'star' | 'check' | 'ring' | 'cross';

/** Shape drawn on a judged note in colour-blind mode so the outcome never relies on colour alone. */
export function judgementMark(judgement: NoteJudgement, colorBlindMode: boolean): JudgementMarkKind | null {
  if (!colorBlindMode) {
    return null;
  }
  switch (judgement) {
    case 'perfect': return 'star';
    case 'good': return 'check';
    case 'ok': return 'ring';
    case 'miss': return 'cross';
    default: return null;
  }
}

export function noteFill(note: VisibleNote, colorBlindMode: boolean, palette: CanvasPalette): string {
  if (colorBlindMode) {
    switch (note.judgement) {
      case 'perfect': return palette.perfect;
      case 'good': return COLOR_BLIND_GOOD;
      case 'ok': return COLOR_BLIND_OK;
      case 'miss': return COLOR_BLIND_MISS;
      default: return note.hand === 'left' ? COLOR_BLIND_HAND_LEFT : COLOR_BLIND_HAND_RIGHT;
    }
  }
  switch (note.judgement) {
    case 'perfect':
      return palette.perfect;
    case 'good':
      return palette.good;
    case 'ok':
      return palette.ok;
    case 'miss':
      return palette.miss;
    default:
      return note.hand === 'left' ? palette.leftHand : palette.rightHand;
  }
}

function drawJudgementMark(
  context: CanvasRenderingContext2D,
  kind: JudgementMarkKind,
  fill: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const size = Math.min(width - 8, height - 6, 12);
  if (size < 6) {
    return;
  }
  const cx = x + width / 2;
  const cy = y + height - 3 - size / 2;
  const half = size / 2;
  context.save();
  context.strokeStyle = fill === COLOR_BLIND_MISS ? '#ffffff' : '#111111';
  context.fillStyle = context.strokeStyle;
  context.lineWidth = 2;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  switch (kind) {
    case 'cross':
      context.moveTo(cx - half, cy - half);
      context.lineTo(cx + half, cy + half);
      context.moveTo(cx + half, cy - half);
      context.lineTo(cx - half, cy + half);
      context.stroke();
      break;
    case 'check':
      context.moveTo(cx - half, cy);
      context.lineTo(cx - half * 0.3, cy + half * 0.7);
      context.lineTo(cx + half, cy - half * 0.7);
      context.stroke();
      break;
    case 'ring':
      context.arc(cx, cy, half * 0.8, 0, Math.PI * 2);
      context.stroke();
      break;
    case 'star':
      for (let point = 0; point < 10; point += 1) {
        const radius = point % 2 === 0 ? half : half * 0.45;
        const angle = -Math.PI / 2 + (point * Math.PI) / 5;
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        if (point === 0) {
          context.moveTo(px, py);
        } else {
          context.lineTo(px, py);
        }
      }
      context.closePath();
      context.fill();
      break;
  }
  context.restore();
}

export function FallingNotesCanvas({
  snapshot,
  onFileDrop,
  fingeringEditEnabled = false,
  selectedNoteId = null,
  onNoteSelect,
  colorBlindMode = false,
  noteLabels = 'alphabetic',
  noteLabelSize = 'medium',
}: FallingNotesCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const prevJudgementsRef = useRef<Map<string, NoteJudgement>>(new Map());
  const effectsRef = useRef<EffectsState>({ popups: [], particles: [], vignette: null });
  const [isDropping, setIsDropping] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;
    const devicePixelRatio = window.devicePixelRatio || 1;
    const palette = readCanvasPalette();
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    // Detect judgement transitions and spawn effects
    const now = performance.now();
    const hitY = height * snapshot.hitLineRatio;
    const { popups, particles } = effectsRef.current;

    for (const note of snapshot.visibleNotes) {
      const prev = prevJudgementsRef.current.get(note.id);
      if (prev === 'pending' && note.judgement !== 'pending') {
        const noteX = note.xRatio * width + Math.max(width * note.widthRatio * 0.92, 12) / 2;
        popups.push(spawnPopup(note, noteX, hitY, now, palette));
        particles.push(...spawnParticles(note, noteX, hitY, now, palette));
        if (note.judgement === 'miss') {
          effectsRef.current.vignette = { createdAt: now, duration: 500 };
        }
      }
      prevJudgementsRef.current.set(note.id, note.judgement);
    }

    // Cull stale IDs (notes scrolled off or song restarted)
    const liveIds = new Set(snapshot.visibleNotes.map((n) => n.id));
    for (const id of prevJudgementsRef.current.keys()) {
      if (!liveIds.has(id)) prevJudgementsRef.current.delete(id);
    }

    // Age-cull effects
    effectsRef.current.popups = popups.filter((p) => now - p.createdAt < p.duration);
    effectsRef.current.particles = particles.filter((p) => now - p.createdAt < p.duration);
    if (effectsRef.current.vignette) {
      const v = effectsRef.current.vignette;
      if (now - v.createdAt >= v.duration) effectsRef.current.vignette = null;
    }

    // Draw scene
    context.clearRect(0, 0, width, height);
    drawGrid(context, width, height, snapshot.hitLineRatio, palette);
    drawNotes(context, width, height, snapshot.visibleNotes, selectedNoteId, colorBlindMode, noteLabels, palette, noteLabelSize);

    // Hit line glow (behind the line)
    drawHitLineGlow(context, width, height, snapshot.hitLineRatio, snapshot.score.combo, palette);

    // Hit line
    drawHitLine(context, width, height, snapshot.hitLineRatio, palette);

    // Effects on top
    const eff = effectsRef.current;
    drawParticles(context, eff.particles, now);
    drawPopups(context, eff.popups, now);
    drawVignette(context, width, height, eff.vignette, now);
  }, [colorBlindMode, noteLabels, noteLabelSize, selectedNoteId, snapshot]);

  return (
    <div
      className={`canvas-shell panel ${isDropping ? 'dropping' : ''}`}
      ref={containerRef}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDropping(true);
      }}
      onDragLeave={() => setIsDropping(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDropping(false);
        const file = event.dataTransfer.files[0];
        if (file) {
          onFileDrop(file);
        }
      }}
      onClick={(event) => {
        if (!fingeringEditEnabled || !onNoteSelect || !containerRef.current) {
          return;
        }

        const rect = containerRef.current.getBoundingClientRect();
        const localPoint = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
        const hit = hitTestVisibleNote(localPoint, rect.width, rect.height, snapshot.visibleNotes);
        if (hit) {
          onNoteSelect(hit, localPoint);
        }
      }}
    >
      <div className="canvas-labels">
        <div>
          <p className="eyebrow">Falling Notes</p>
          <h2>Play at the hit line</h2>
        </div>
        <p className="panel-copy">Drag and drop a MIDI file here or use the import button.</p>
      </div>
      <canvas ref={canvasRef} />
    </div>
  );
}

function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  hitLineRatio: number,
  palette: CanvasPalette,
): void {
  context.fillStyle = palette.surface;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = palette.grid;
  context.lineWidth = 1;
  for (const midi of OCTAVE_C_MIDI) {
    const x = getKeyPosition(midi).leftPercent / 100 * width;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }

  for (let index = 1; index <= 4; index += 1) {
    const y = height * hitLineRatio * index / 4;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
}

function drawNotes(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  notes: VisibleNote[],
  selectedNoteId: string | null,
  colorBlindMode: boolean,
  noteLabels: 'alphabetic' | 'symbols' | 'both' | 'none',
  palette: CanvasPalette,
  noteLabelSize: 'small' | 'medium' | 'large' = 'medium',
): void {
  const labelPx = noteLabelSize === 'small' ? 10 : noteLabelSize === 'large' ? 15 : 12;
  const fingerPx = noteLabelSize === 'small' ? 9 : noteLabelSize === 'large' ? 13 : 11;
  for (const note of notes) {
    const x = note.xRatio * width;
    const noteWidth = Math.max(width * note.widthRatio * 0.92, 12);
    const y = note.topRatio * height;
    const noteHeight = Math.max(note.heightRatio * height, 14);

    const fill = noteFill(note, colorBlindMode, palette);
    context.fillStyle = fill;
    context.fillRect(x + 2, y, noteWidth - 4, noteHeight);

    const mark = judgementMark(note.judgement, colorBlindMode);
    if (mark) {
      // Dark outer and light inner outline read against both light and dark themes.
      context.strokeStyle = '#111111';
      context.lineWidth = 3;
      context.strokeRect(x + 2, y, noteWidth - 4, noteHeight);
      context.strokeStyle = '#ffffff';
      context.lineWidth = 1.5;
      context.strokeRect(x + 2, y, noteWidth - 4, noteHeight);
      drawJudgementMark(context, mark, fill, x + 2, y, noteWidth - 4, noteHeight);
    }

    if (selectedNoteId === note.id) {
      context.strokeStyle = palette.selected;
      context.lineWidth = 2;
      context.strokeRect(x + 1, y - 1, noteWidth - 2, noteHeight + 2);
    }

    if (noteLabels !== 'none') {
      context.fillStyle = palette.text;
      context.font = `${labelPx}px "Segoe UI", system-ui, sans-serif`;
      context.textAlign = 'center';
      context.fillText(note.label, x + noteWidth / 2, y + Math.min(labelPx + 6, noteHeight - 4));
    }

    if (note.finger !== undefined) {
      context.fillStyle = palette.text;
      context.font = `bold ${fingerPx}px "Segoe UI", system-ui, sans-serif`;
      context.textAlign = 'center';
      context.fillText(String(note.finger), x + noteWidth / 2, y + Math.min(labelPx + 20, noteHeight - 4));
    }
  }
}

function hitTestVisibleNote(
  point: { x: number; y: number },
  width: number,
  height: number,
  notes: VisibleNote[],
): VisibleNote | null {
  const matches = notes.filter((note) => {
    const x = note.xRatio * width;
    const noteWidth = Math.max(width * note.widthRatio * 0.92, 12);
    const y = note.topRatio * height;
    const noteHeight = Math.max(note.heightRatio * height, 14);

    return point.x >= x && point.x <= x + noteWidth && point.y >= y && point.y <= y + noteHeight;
  });

  if (matches.length === 0) {
    return null;
  }

  return matches.sort((left, right) => {
    const leftArea = left.widthRatio * left.heightRatio;
    const rightArea = right.widthRatio * right.heightRatio;
    if (leftArea !== rightArea) {
      return leftArea - rightArea;
    }
    return left.topRatio - right.topRatio;
  })[0];
}

function drawHitLine(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  hitLineRatio: number,
  palette: CanvasPalette,
): void {
  const y = height * hitLineRatio;
  context.strokeStyle = palette.hitLine;
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(0, y);
  context.lineTo(width, y);
  context.stroke();
}

function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return clean.split('').map((c) => parseInt(c + c, 16)).join(',');
  }
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16)).join(',');
}

function spawnPopup(
  note: VisibleNote,
  x: number,
  hitY: number,
  now: number,
  palette: CanvasPalette,
): JudgmentPopup {
  const labels: Record<string, string> = { perfect: 'PERFECT!', good: 'GOOD', ok: 'OK', miss: 'MISS' };
  const colours: Record<string, string> = {
    perfect: palette.perfect,
    good: palette.good,
    ok: palette.ok,
    miss: palette.miss,
  };
  return {
    id: note.id,
    x,
    y: hitY - 20,
    label: labels[note.judgement] ?? note.judgement.toUpperCase(),
    colour: colours[note.judgement] ?? palette.text,
    createdAt: now,
    duration: 700,
  };
}

function spawnParticles(
  note: VisibleNote,
  x: number,
  hitY: number,
  now: number,
  palette: CanvasPalette,
): Particle[] {
  const counts: Record<string, number> = { perfect: 7, good: 5, ok: 3, miss: 3 };
  const colours: Record<string, string> = {
    perfect: palette.perfect,
    good: palette.good,
    ok: palette.ok,
    miss: palette.miss,
  };
  const count = counts[note.judgement] ?? 0;
  const colour = colours[note.judgement] ?? palette.text;
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.4 - 0.2);
    const speed = 0.06 + Math.random() * 0.08;
    return {
      x,
      y: hitY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 2 + Math.random() * 2,
      colour,
      createdAt: now,
      duration: 400,
    };
  });
}

function drawHitLineGlow(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  hitLineRatio: number,
  combo: number,
  palette: CanvasPalette,
): void {
  const alpha = combo >= 50 ? 0.48 : combo >= 25 ? 0.32 : combo >= 10 ? 0.18 : 0;
  if (alpha === 0) return;

  const y = height * hitLineRatio;
  const spread = 48;
  const rgb = hexToRgb(palette.hitLine);
  const grad = context.createLinearGradient(0, y - spread, 0, y + spread / 2);
  grad.addColorStop(0, `rgba(${rgb},0)`);
  grad.addColorStop(0.5, `rgba(${rgb},${alpha})`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  context.fillStyle = grad;
  context.fillRect(0, y - spread, width, spread + spread / 2);
}

function drawParticles(
  context: CanvasRenderingContext2D,
  particles: Particle[],
  now: number,
): void {
  for (const p of particles) {
    const age = (now - p.createdAt) / p.duration;
    const elapsed = now - p.createdAt;
    context.globalAlpha = 1 - age;
    context.fillStyle = p.colour;
    context.beginPath();
    context.arc(p.x + p.vx * elapsed, p.y + p.vy * elapsed, p.radius * (1 - age * 0.5), 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function drawPopups(
  context: CanvasRenderingContext2D,
  popups: JudgmentPopup[],
  now: number,
): void {
  for (const popup of popups) {
    const age = (now - popup.createdAt) / popup.duration;
    const scale = age < 0.12 ? 1 + (1 - age / 0.12) * 0.25 : 1;
    context.save();
    context.globalAlpha = 1 - age;
    context.translate(popup.x, popup.y - age * 50);
    context.scale(scale, scale);
    context.shadowColor = 'rgba(0,0,0,0.55)';
    context.shadowBlur = 4;
    context.fillStyle = popup.colour;
    context.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(popup.label, 0, 0);
    context.restore();
  }
}

function drawVignette(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  vignette: { createdAt: number; duration: number } | null,
  now: number,
): void {
  if (!vignette) return;
  const age = (now - vignette.createdAt) / vignette.duration;
  if (age >= 1) return;
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.sqrt(cx * cx + cy * cy);
  const alpha = (1 - age) * 0.38;
  const grad = context.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
  grad.addColorStop(0, 'rgba(180,30,20,0)');
  grad.addColorStop(1, `rgba(180,30,20,${alpha})`);
  context.fillStyle = grad;
  context.fillRect(0, 0, width, height);
}
