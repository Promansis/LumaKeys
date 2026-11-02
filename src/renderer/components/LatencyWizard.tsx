import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioEngine } from '../../lib/audio/audioEngine';
import { useModalFocusTrap } from '../useModalFocusTrap';

interface LatencyWizardProps {
  audioEngine: AudioEngine;
  currentMs: number;
  onApply: (ms: number) => void;
  onClose: () => void;
}

const CLICK_INTERVAL_MS = 600;
const WARMUP_TAPS = 2;
const MEASURE_TAPS = 8;
const TOTAL_TAPS = WARMUP_TAPS + MEASURE_TAPS;

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function LatencyWizard({ audioEngine, currentMs, onApply, onClose }: LatencyWizardProps) {
  const [phase, setPhase] = useState<'intro' | 'tapping' | 'done'>('intro');
  const [tapCount, setTapCount] = useState(0);
  const [resultMs, setResultMs] = useState<number | null>(null);

  const clickTimesRef = useRef<number[]>([]);
  const tapTimesRef = useRef<number[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  // The control that opened the wizard, recorded once so focus can return to it on close.
  const [triggerRef] = useState<{ current: HTMLElement | null }>(() => ({
    current: document.activeElement instanceof HTMLElement ? document.activeElement : null,
  }));

  useModalFocusTrap({ open: true, dialogRef, triggerRef, onEscape: onClose });

  const stopClicks = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startClicks = useCallback(() => {
    clickTimesRef.current = [];
    tapTimesRef.current = [];
    void audioEngine.playMetronomeClick(true);
    clickTimesRef.current.push(performance.now());

    intervalRef.current = setInterval(() => {
      const now = performance.now();
      clickTimesRef.current.push(now);
      void audioEngine.playMetronomeClick(false);
    }, CLICK_INTERVAL_MS);
  }, [audioEngine]);

  useEffect(() => {
    return () => stopClicks();
  }, [stopClicks]);

  const handleTap = useCallback(() => {
    if (phase !== 'tapping') return;

    const now = performance.now();
    tapTimesRef.current.push(now);
    const count = tapTimesRef.current.length;
    setTapCount(count);

    if (count >= TOTAL_TAPS) {
      stopClicks();

      // Pair each tap with the click that immediately preceded it
      const deltas: number[] = [];
      for (let i = WARMUP_TAPS; i < tapTimesRef.current.length; i++) {
        const tapTime = tapTimesRef.current[i];
        // find the most recent click before this tap
        const preceding = clickTimesRef.current.filter((t) => t <= tapTime);
        if (preceding.length === 0) continue;
        const clickTime = preceding[preceding.length - 1];
        deltas.push(tapTime - clickTime);
      }

      if (deltas.length > 0) {
        const computed = Math.round(Math.max(0, Math.min(300, median(deltas))));
        setResultMs(computed);
      } else {
        setResultMs(0);
      }
      setPhase('done');
    }
  }, [phase, stopClicks]);

  const handleStart = useCallback(() => {
    setPhase('tapping');
    setTapCount(0);
    startClicks();
  }, [startClicks]);

  const handleRedo = useCallback(() => {
    setPhase('tapping');
    setTapCount(0);
    setResultMs(null);
    startClicks();
  }, [startClicks]);

  // Each phase swaps its controls, so move focus into the dialog; otherwise it would fall to
  // the page behind when the focused button unmounts. Start and Tap take focus. After the
  // last tap focus goes to the dialog itself, so a stray extra Space or Enter cannot press Apply.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (phase === 'done') {
      dialog.focus();
      return;
    }
    dialog.querySelector<HTMLElement>('.latency-wizard-body .primary-button')?.focus();
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      // A focused button keeps its native Space/Enter activation (close, Start, Try Again, Apply).
      // The Tap button is the exception: a tap is timed on key press, as before, and
      // preventDefault below stops the browser's own click so it is not counted twice.
      if (e.target instanceof Element && e.target.closest('button') && !e.target.closest('.latency-tap-btn')) return;
      e.preventDefault();
      if (phase === 'intro') handleStart();
      else if (phase === 'tapping') handleTap();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, handleStart, handleTap]);

  const measuredTaps = Math.max(0, tapCount - WARMUP_TAPS);

  return (
    <div ref={dialogRef} className="latency-wizard-overlay" role="dialog" aria-modal="true" aria-label="Latency Calibration" tabIndex={-1}>
      <div className="latency-wizard-panel panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Audio Settings</p>
            <h2>Latency Calibration</h2>
          </div>
          <button className="secondary-button" onClick={onClose}>
            ✕
          </button>
        </div>

        {phase === 'intro' && (
          <div className="latency-wizard-body">
            <p>
              Click <strong>Start</strong> (or press Space). You&apos;ll hear a repeating click — tap the button or Space in time with each click.
              The first {WARMUP_TAPS} taps are warm-up; the next {MEASURE_TAPS} are measured.
            </p>
            <p className="latency-wizard-current">
              Current compensation: <strong>{currentMs} ms</strong>
            </p>
            <button className="primary-button" onClick={handleStart}>
              Start
            </button>
          </div>
        )}

        {phase === 'tapping' && (
          <div className="latency-wizard-body">
            <p>
              {tapCount < WARMUP_TAPS
                ? 'Warming up — keep tapping…'
                : `Measuring — ${MEASURE_TAPS - measuredTaps} tap${MEASURE_TAPS - measuredTaps !== 1 ? 's' : ''} to go`}
            </p>
            <div className="latency-wizard-progress">
              {Array.from({ length: MEASURE_TAPS }, (_, i) => (
                <div
                  key={i}
                  className={`latency-wizard-dot ${i < measuredTaps ? 'filled' : ''}`}
                />
              ))}
            </div>
            <button className="primary-button latency-tap-btn" onClick={handleTap}>
              Tap
            </button>
          </div>
        )}

        {phase === 'done' && resultMs !== null && (
          <div className="latency-wizard-body">
            <p>Measurement complete.</p>
            <div className="latency-wizard-result">
              <span>Detected latency</span>
              <strong>{resultMs} ms</strong>
            </div>
            {resultMs === 0 && (
              <p className="latency-wizard-hint">
                0 ms suggests very low system latency or tapping ahead of the beat — you can apply it or try again.
              </p>
            )}
            <div className="latency-wizard-actions">
              <button className="secondary-button" onClick={handleRedo}>
                Try Again
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  onApply(resultMs);
                  onClose();
                }}
              >
                Apply {resultMs} ms
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
