interface ControlBarProps {
  canPlay: boolean;
  isPlaying: boolean;
  tempo: number;
  /** Locks the tempo slider, for a run judged at a fixed tempo. */
  tempoLocked?: boolean;
  progress: number;
  songTitle: string;
  currentTimeLabel: string;
  durationLabel: string;
  onImport?: () => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onTempoChange: (value: number) => void;
  onSeek: (progress: number) => void;
  onBackToLibrary?: () => void;
  backLabel?: string;
}

export function ControlBar(props: ControlBarProps) {
  return (
    <section className="control-bar panel">
      <div className="control-row">
        <div>
          <p className="eyebrow">LumaKeys</p>
          <h1>{props.songTitle !== 'No song loaded' ? props.songTitle : 'LumaKeys'}</h1>
        </div>
        <div className="transport-buttons">
          {props.onBackToLibrary ? (
            <button className="secondary-button" onClick={props.onBackToLibrary}>
              {props.backLabel ?? 'Main Menu'}
            </button>
          ) : null}
          {props.onImport ? (
            <button className="secondary-button" onClick={props.onImport}>
              Import MIDI
            </button>
          ) : null}
          <button className="primary-button" onClick={props.onPlayPause} disabled={!props.canPlay}>
            {props.isPlaying ? 'Pause' : 'Play'}
          </button>
          <button className="secondary-button" onClick={props.onRestart} disabled={!props.canPlay}>
            Restart
          </button>
        </div>
      </div>

      <div className="control-grid">
        <label className="tempo-card">
          <span>Tempo</span>
          <strong>{Math.round(props.tempo * 100)}%</strong>
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.01}
            value={props.tempo}
            onChange={(event) => props.onTempoChange(Number(event.target.value))}
            disabled={!props.canPlay || props.tempoLocked}
          />
        </label>

        <label className="progress-card">
          <span>Song Position</span>
          <strong>
            {props.currentTimeLabel} / {props.durationLabel}
          </strong>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={props.progress}
            onChange={(event) => props.onSeek(Number(event.target.value))}
            disabled={!props.canPlay}
          />
        </label>
      </div>
    </section>
  );
}
