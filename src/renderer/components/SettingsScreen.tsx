import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import {
  DEFAULT_INSTRUMENT_ID,
  getInstrumentDefinition,
  getInstrumentEffectiveReverbPreset,
  INSTRUMENTS,
  isInstrumentSelectable,
  type InstrumentReverbPreset,
} from '../../lib/audio/instrumentCatalog';
import type { AudioEngine } from '../../lib/audio/audioEngine';
import { isRewardUnlocked, REWARD_CATALOG } from '../../lib/rewards/rewardCatalog';
import {
  getSettingCompositeKey,
  getSettingDefault,
} from '../../lib/settings/registry';
import type { InstrumentSamplePackStatus } from '../../shared/ipc';
import { DeckBackdrop } from './DeckBackdrop';
import { LatencyWizard } from './LatencyWizard';
import { LoadingPanel } from './LoadingPanel';
import { toastBus } from './Toast';
import { saveSetting } from '../saveSetting';
import type { InputMode } from '../../lib/input/types';
import type { MidiInputDevice } from '../../lib/midi/types';

const KEY_HEIGHT: Record<'small' | 'medium' | 'large', number> = { small: 28, medium: 45, large: 62 };
// 7 white keys, black keys at positions after C,D,F,G,A (indices 0,1,3,4,5)
const WHITE_KEYS = 7;
const BLACK_KEY_POSITIONS = [0, 1, 3, 4, 5];

function KeyboardSizeThumbnail({ size }: { size: 'small' | 'medium' | 'large' }) {
  const h = KEY_HEIGHT[size];
  const kw = 8; // white key width px
  const bw = 5; // black key width px
  const bh = Math.round(h * 0.6);
  const totalW = WHITE_KEYS * kw + 2; // +2 for stroke
  return (
    <svg
      className="keyboard-size-thumbnail"
      viewBox={`0 0 ${totalW} ${h + 2}`}
      width={totalW}
      height={h + 2}
      aria-hidden="true"
    >
      {Array.from({ length: WHITE_KEYS }, (_, i) => (
        <rect key={i} x={i * kw + 0.5} y={0.5} width={kw - 1} height={h} rx="1" fill="var(--color-text)" opacity="0.12" stroke="var(--color-border)" strokeWidth="0.8" />
      ))}
      {BLACK_KEY_POSITIONS.map((pos) => (
        <rect key={pos} x={pos * kw + kw - bw / 2} y={0.5} width={bw} height={bh} rx="1" fill="var(--color-text)" opacity="0.7" />
      ))}
    </svg>
  );
}

interface SettingsScreenProps {
  audioEngine: AudioEngine;
  inputMode: InputMode;
  midiDevices: MidiInputDevice[];
  midiError: boolean;
  instrumentSamplePackStatuses?: Record<string, InstrumentSamplePackStatus>;
  unlockedRewardIds?: Set<string>;
  pitchBendEnabled: boolean;
  onInstallInstrumentSamplePack: (instrumentId: string) => Promise<void>;
  onRemoveInstrumentSamplePack: (instrumentId: string) => Promise<void>;
  onDeveloperUnlockAll: () => Promise<void>;
  onLearningProgressReset: () => void;
  onSettingChange: (category: string, key: string, value: string) => void;
  onInputModeChange: (nextMode: InputMode) => void;
  onRetryMidi: () => void;
  onUserDataReset: () => void;
  onOpenKeyboardSetup: () => void;
}

type SettingsTab = 'audio' | 'visual' | 'gameplay' | 'input' | 'practice';
type SettingsAccent = SettingsTab | 'danger' | 'info' | 'success' | 'warning';

type SettingsValues = Record<string, string>;

const TAB_LABELS: Record<SettingsTab, string> = {
  audio: 'Audio',
  visual: 'Visual',
  gameplay: 'Gameplay',
  input: 'Input',
  practice: 'Practice',
};

const TAB_META: Record<SettingsTab, { accent: string; kicker: string }> = {
  audio: { accent: 'var(--settings-neon-gold)', kicker: 'Sound' },
  visual: { accent: 'var(--settings-neon-magenta)', kicker: 'Display' },
  gameplay: { accent: 'var(--settings-neon-coral)', kicker: 'Timing' },
  input: { accent: 'var(--settings-info)', kicker: 'Devices' },
  practice: { accent: 'var(--settings-neon-teal)', kicker: 'Goals' },
};

const SETTINGS_TABS = Object.keys(TAB_LABELS) as SettingsTab[];

type SettingsStyle = CSSProperties & {
  '--settings-active-accent'?: string;
  '--entrance-delay'?: string;
  '--settings-range-value'?: string;
};

const FOCUSABLE_MODAL_SELECTOR = [
  'button:not([disabled])',
  'select:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type SettingsActionIcon =
  | 'calibrate'
  | 'check'
  | 'clear'
  | 'keyboard'
  | 'pack'
  | 'retry'
  | 'trash'
  | 'unlock'
  | 'upload'
  | 'x';

function SettingsActionIcon({ icon }: { icon: SettingsActionIcon }) {
  const common = {
    className: 'settings-button-icon',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  };

  switch (icon) {
    case 'calibrate':
      return (
        <svg {...common}>
          <path d="M12 3v4" />
          <path d="M12 17v4" />
          <path d="M3 12h4" />
          <path d="M17 12h4" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    case 'clear':
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M6 7l1 13h10l1-13" />
          <path d="M9 7V4h6v3" />
        </svg>
      );
    case 'keyboard':
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M7 6v12M11 6v12M15 6v12" />
          <path d="M5 14h14" />
        </svg>
      );
    case 'pack':
      return (
        <svg {...common}>
          <path d="M5 8h14l-1 11H6z" />
          <path d="M8 8V5h8v3" />
          <path d="M9 13h6" />
          <path d="M9 16h4" />
        </svg>
      );
    case 'retry':
      return (
        <svg {...common}>
          <path d="M20 11a8 8 0 0 0-14.5-4.6L4 8" />
          <path d="M4 4v4h4" />
          <path d="M4 13a8 8 0 0 0 14.5 4.6L20 16" />
          <path d="M20 20v-4h-4" />
        </svg>
      );
    case 'trash':
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M9 7V4h6v3" />
          <path d="M7 7l1 13h8l1-13" />
        </svg>
      );
    case 'unlock':
      return (
        <svg {...common}>
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 7.6-1.7" />
          <path d="M12 14v2" />
        </svg>
      );
    case 'upload':
      return (
        <svg {...common}>
          <path d="M12 16V4" />
          <path d="m7 9 5-5 5 5" />
          <path d="M5 20h14" />
        </svg>
      );
    case 'x':
      return (
        <svg {...common}>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      );
  }
}

function SettingsTabIcon({ tab }: { tab: SettingsTab }) {
  const common = {
    className: 'settings-tab-icon',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  };

  switch (tab) {
    case 'audio':
      return (
        <svg {...common}>
          <path className="settings-tab-wave" d="M3 13c2.2-5.6 4.4-5.6 6.6 0s4.4 5.6 6.6 0 3.7-5.6 4.8-1.8" />
          <path d="M4 17h16" />
          <path d="M7 6v4" />
          <path d="M12 4v6" />
          <path d="M17 6v4" />
        </svg>
      );
    case 'visual':
      return (
        <svg {...common}>
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
          <rect className="settings-tab-note" x="7" y="4.5" width="3.5" height="4" rx="1" fill="currentColor" stroke="none" />
          <rect className="settings-tab-note" x="13.5" y="10.5" width="4.5" height="4" rx="1" fill="currentColor" stroke="none" />
          <path d="M8.8 8v10" />
          <path d="M15.8 14v4" />
        </svg>
      );
    case 'gameplay':
      return (
        <svg {...common}>
          <path d="M12 3v4" />
          <path d="M12 17v4" />
          <path d="M4 12h4" />
          <path d="M16 12h4" />
          <circle className="settings-tab-pulse" cx="12" cy="12" r="5" />
          <rect x="8" y="5" width="2.8" height="5.2" rx="0.8" fill="currentColor" stroke="none" />
          <rect x="13.2" y="14" width="2.8" height="5" rx="0.8" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'input':
      return (
        <svg {...common}>
          <path d="M12 4a8 8 0 0 1 8 8v2.5a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 14.5V12a8 8 0 0 1 8-8Z" />
          <circle cx="8.5" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="9" r="1" fill="currentColor" stroke="none" />
          <circle cx="15.5" cy="12" r="1" fill="currentColor" stroke="none" />
          <path className="settings-tab-wave" d="M8 18c1.8 2.2 6.2 2.2 8 0" />
        </svg>
      );
    case 'practice':
      return (
        <svg {...common}>
          <path d="M7 5v14" />
          <path d="M17 5v14" />
          <path d="M7 7h10" />
          <path d="M7 17h10" />
          <path className="settings-tab-pulse" d="M12 8v5l3 2" />
          <path d="M5 12c0-3.8 3.2-7 7-7" />
          <path d="M19 12c0 3.8-3.2 7-7 7" />
        </svg>
      );
  }
}

// SettingsNeonBackdrop replaced by shared DeckBackdrop

const DEFAULT_SETTINGS: SettingsValues = {
  'audio.instrumentId': DEFAULT_INSTRUMENT_ID,
  'audio.masterVolume': '80',
  'audio.metronomeVolume': '65',
  'audio.reverbLevel': '20',
  'audio.latencyCompMs': '0',
  'audio.metronomeSound': 'classic',
  'audio.pitchBendEnabled': 'true',
  'audio.instrumentReverbPresets': '{}',
  'visual.theme': 'dark',
  'visual.colorBlindMode': 'false',
  'visual.noteLabels': 'alphabetic',
  'visual.noteLabelSize': 'medium',
  'visual.keyboardOverlaySize': 'medium',
  'visual.beatsVisible': '8',
  'visual.leftHandColor': '',
  'visual.rightHandColor': '',
  'fingering.displayMode': getSettingDefault('fingering', 'displayMode') ?? 'learning-only',
  'gameplay.waitModeDefault': 'false',
  'gameplay.metronomeDefault': getSettingDefault('gameplay', 'metronomeDefault') ?? 'false',
  'gameplay.hitWindowMs': '100',
  'gameplay.leadInBeats': '2',
  'practice.postureReminderMinutes': getSettingDefault('practice', 'postureReminderMinutes') ?? '0',
  'input.midiDeviceId': '',
  'practice.dailyGoalMinutes': getSettingDefault('practice', 'dailyGoalMinutes') ?? '0',
  'practice.breakReminderMinutes': getSettingDefault('practice', 'breakReminderMinutes') ?? '0',
};

const HIGH_FREQUENCY_SETTING_SAVE_DELAY_MS = 220;

interface PendingSettingSave {
  category: string;
  key: string;
  timeoutId: number;
  value: string;
}

interface SettingsRangeFieldProps {
  category: string;
  label: string;
  lastChangedSettingKey: string | null;
  max: number;
  min: number;
  settingKey: string;
  value: string;
  onFlush: (category: string, key: string) => void;
  onQueue: (category: string, key: string, value: string) => void;
}

function getSettingKey(category: string, key: string): string {
  return getSettingCompositeKey(category, key);
}

function getRangeFillPercent(value: string, min: number, max: number): string {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || max <= min) {
    return '0%';
  }

  const clampedValue = Math.min(max, Math.max(min, numericValue));
  return `${((clampedValue - min) / (max - min)) * 100}%`;
}

function clampNumericSetting(value: string, min: number, max: number): string {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return String(min);
  }

  return String(Math.min(max, Math.max(min, Math.round(numericValue))));
}

function parseInstrumentReverbPresets(rawValue: string | null | undefined): Record<string, InstrumentReverbPreset> {
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, InstrumentReverbPreset] =>
        entry[1] === 'short' || entry[1] === 'medium' || entry[1] === 'hall',
      ),
    );
  } catch {
    return {};
  }
}

function SettingsRangeField({
  category,
  label,
  lastChangedSettingKey,
  max,
  min,
  settingKey,
  value,
  onFlush,
  onQueue,
}: SettingsRangeFieldProps) {
  const compositeKey = getSettingKey(category, settingKey);

  return (
    <label className="settings-range-label">
      <span className="settings-field-heading">
        <span>{label}</span>
        <output aria-hidden="true">{value}</output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        data-save-flash={lastChangedSettingKey === compositeKey ? 'true' : undefined}
        style={{ '--settings-range-value': getRangeFillPercent(value, min, max) } as SettingsStyle}
        onBlur={() => onFlush(category, settingKey)}
        onChange={(event) => onQueue(category, settingKey, event.target.value)}
        onKeyUp={() => onFlush(category, settingKey)}
        onPointerUp={() => onFlush(category, settingKey)}
      />
    </label>
  );
}

const DELETE_USER_DATA_REMOVED_LIST =
  'songs, playlists, folders, results, practice history and streak, achievements, fingerings, trouble spots, lesson progress';

function getDeleteUserDataScope(): string {
  return IS_WEB
    ? `${DELETE_USER_DATA_REMOVED_LIST} and saved settings from the server. This affects every browser that uses it. It also removes installed instrument packs from this browser.`
    : `${DELETE_USER_DATA_REMOVED_LIST}, saved settings and installed instrument packs from this device.`;
}

interface ConfirmActionModalProps {
  busy: boolean;
  confirmLabel: string;
  description: string;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmActionModal({
  busy,
  confirmLabel,
  description,
  title,
  onCancel,
  onConfirm,
}: ConfirmActionModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const titleId = `settings-confirm-title-${confirmLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const descriptionId = `${titleId}-description`;

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) {
        return;
      }

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_MODAL_SELECTOR),
      ).filter((element) => {
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      previousActiveElement?.focus();
    };
  }, [busy, onCancel]);

  return (
    <div
      className="settings-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onCancel();
        }
      }}
    >
      <section
        ref={dialogRef}
        className="panel settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <p className="eyebrow">Confirm Action</p>
        <svg className="settings-warning-icon settings-modal-warning-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
          <path d="M12 3 22 20H2z" />
          <path d="M12 9v5" />
          <path d="M12 17h.01" />
        </svg>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId} className="panel-copy">{description}</p>
        <div className="settings-modal-actions">
          <button
            className="danger-button"
            disabled={busy}
            onClick={() => {
              if (!busy) {
                onConfirm();
              }
            }}
          >
            <SettingsActionIcon icon="trash" />
            {busy ? 'Working...' : confirmLabel}
          </button>
          <button ref={cancelButtonRef} className="secondary-button" disabled={busy} onClick={onCancel}>
            <SettingsActionIcon icon="x" />
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}

interface SettingsGroupCardProps {
  eyebrow?: string;
  title: string;
  description?: string;
  footer?: string;
  children: ReactNode;
  className?: string;
  accent?: SettingsAccent;
}

function SettingsGroupCard({
  eyebrow,
  title,
  description,
  footer,
  children,
  className,
  accent,
}: SettingsGroupCardProps) {
  const accentClassName = accent ? ` settings-accent-${accent}` : '';

  return (
    <article className={`settings-group-card${accentClassName}${className ? ` ${className}` : ''}`}>
      <div className="settings-group-header">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        {description ? <p className="panel-copy">{description}</p> : null}
      </div>
      <div className="settings-group-body">{children}</div>
      {footer ? <p className="settings-group-footer">{footer}</p> : null}
    </article>
  );
}

export function SettingsScreen({
  audioEngine,
  inputMode,
  midiDevices,
  midiError,
  instrumentSamplePackStatuses = {},
  unlockedRewardIds = new Set(),
  pitchBendEnabled,
  onInstallInstrumentSamplePack,
  onRemoveInstrumentSamplePack,
  onDeveloperUnlockAll,
  onLearningProgressReset,
  onSettingChange,
  onInputModeChange,
  onRetryMidi,
  onUserDataReset,
  onOpenKeyboardSetup,
}: SettingsScreenProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('audio');
  const [values, setValues] = useState<SettingsValues>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isResettingProgress, setIsResettingProgress] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isUnlockingDeveloperContent, setIsUnlockingDeveloperContent] = useState(false);
  const [resetTarget, setResetTarget] = useState<'data' | 'progress' | 'developer-unlock' | null>(null);
  const [statusMessage, setStatusMessage] = useState('Loading saved settings.');
  const [samplePackPath, setSamplePackPath] = useState<string | null>(null);
  const [showLatencyWizard, setShowLatencyWizard] = useState(false);
  const [samplePackFileCount, setSamplePackFileCount] = useState(0);
  const [activePackActionInstrumentId, setActivePackActionInstrumentId] = useState<string | null>(null);
  const [isSamplePackActionBusy, setIsSamplePackActionBusy] = useState(false);
  const [settingsSavePulse, setSettingsSavePulse] = useState(0);
  const [queuedSaveCount, setQueuedSaveCount] = useState(0);
  const [lastChangedSettingKey, setLastChangedSettingKey] = useState<string | null>(null);
  const [showAdvancedAudio, setShowAdvancedAudio] = useState(false);
  const tabRefs = useRef<Record<SettingsTab, HTMLButtonElement | null>>({
    audio: null,
    visual: null,
    gameplay: null,
    input: null,
    practice: null,
  });
  const savePulseTimerRef = useRef<number | null>(null);
  const lastChangedTimerRef = useRef<number | null>(null);
  const pendingDebouncedSaveRef = useRef<Map<string, PendingSettingSave>>(new Map());
  const pendingSaveCountRef = useRef(0);

  useEffect(() => {
    return () => {
      if (savePulseTimerRef.current !== null) {
        window.clearTimeout(savePulseTimerRef.current);
      }
      if (lastChangedTimerRef.current !== null) {
        window.clearTimeout(lastChangedTimerRef.current);
      }
      pendingDebouncedSaveRef.current.forEach((pendingSave) => {
        window.clearTimeout(pendingSave.timeoutId);
        void saveSetting(pendingSave.category, pendingSave.key, pendingSave.value);
      });
      pendingDebouncedSaveRef.current.clear();
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      if (!window.appBridge) {
        if (isActive) {
          setStatusMessage('Settings are using defaults because storage is unavailable.');
          setIsLoading(false);
        }
        return;
      }

      try {
        const nextValues: SettingsValues = { ...DEFAULT_SETTINGS };
        const keys = Object.keys(DEFAULT_SETTINGS);
        const resolved = await Promise.all(
          keys.map(async (compositeKey) => {
            const [category, key] = compositeKey.split('.');
            const value = await window.appBridge!.getSetting(category, key);
            return [compositeKey, value] as const;
          }),
        );

        resolved.forEach(([compositeKey, value]) => {
          if (value !== null) {
            nextValues[compositeKey] = value;
          }
        });

        nextValues[getSettingKey('input', 'mode')] = inputMode;
        nextValues[getSettingKey('audio', 'pitchBendEnabled')] = pitchBendEnabled ? 'true' : 'false';
        if (isActive) {
          setValues(nextValues);
        }

        const savedSamplePath = await window.appBridge.getSetting('audio', 'customSamplePackPath');
        if (!IS_WEB && savedSamplePath) {
          try {
            const files = await window.appBridge.listAudioFiles(savedSamplePath);
            if (isActive) {
              setSamplePackPath(savedSamplePath);
              setSamplePackFileCount(files.length);
            }
          } catch {
            if (isActive) {
              setSamplePackPath(savedSamplePath);
              setSamplePackFileCount(0);
              setStatusMessage('Custom sound folder could not be read. Built-in sounds remain available.');
            }
          }
        }

        if (isActive) {
          setStatusMessage('Ready. Changes save automatically.');
        }
      } catch {
        if (isActive) {
          setValues((current) => ({
            ...DEFAULT_SETTINGS,
            [getSettingKey('input', 'mode')]: current[getSettingKey('input', 'mode')] ?? inputMode,
            [getSettingKey('audio', 'pitchBendEnabled')]: pitchBendEnabled ? 'true' : 'false',
          }));
          setStatusMessage('Some saved settings could not be loaded. Defaults are active for this session.');
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      isActive = false;
    };
  }, [inputMode, pitchBendEnabled]);

  useEffect(() => {
    setValues((current) => ({
      ...current,
      [getSettingKey('audio', 'pitchBendEnabled')]: pitchBendEnabled ? 'true' : 'false',
    }));
  }, [pitchBendEnabled]);

  // The input service keeps filtering to the saved device even when it is absent, so the
  // card must say that instead of reading "Any connected device".
  const savedMidiDeviceId = values['input.midiDeviceId'];
  const missingMidiDeviceId = savedMidiDeviceId && !midiDevices.some((device) => device.id === savedMidiDeviceId)
    ? savedMidiDeviceId
    : null;
  const selectedMidiDeviceName = useMemo(
    () => midiDevices.find((device) => device.id === savedMidiDeviceId)?.name ?? 'Any connected device',
    [midiDevices, savedMidiDeviceId],
  );
  const installedPackInstrumentIds = useMemo(
    () =>
      Object.values(instrumentSamplePackStatuses)
        .filter((status) => status.isInstalled)
        .map((status) => status.instrumentId),
    [instrumentSamplePackStatuses],
  );
  const selectedInstrument = getInstrumentDefinition(values['audio.instrumentId']);
  const selectedInstrumentPackStatus = instrumentSamplePackStatuses[selectedInstrument.id];
  const instrumentReverbPresets = useMemo(
    () => parseInstrumentReverbPresets(values['audio.instrumentReverbPresets']),
    [values['audio.instrumentReverbPresets']],
  );
  const selectedInstrumentReverbPreset = getInstrumentEffectiveReverbPreset(
    selectedInstrument.id,
    instrumentReverbPresets,
  );
  const reverbCustomizationUnlocked = isRewardUnlocked('audio:reverb-customization', unlockedRewardIds);
  const isSaveQueued = queuedSaveCount > 0;
  const saveSignalState = isSaving ? 'saving' : isSaveQueued ? 'queued' : settingsSavePulse > 0 ? 'saved' : 'ready';
  const saveSignalLabel = isSaving ? 'Syncing' : isSaveQueued ? 'Queued' : settingsSavePulse > 0 ? 'Saved' : 'Ready';

  const installSelectedInstrumentPack = async () => {
    if (activePackActionInstrumentId !== null) {
      return;
    }

    setActivePackActionInstrumentId(selectedInstrument.id);
    setStatusMessage(`Installing ${selectedInstrumentPackStatus?.packLabel ?? 'instrument pack'}...`);
    try {
      await onInstallInstrumentSamplePack(selectedInstrument.id);
      setStatusMessage(`${selectedInstrumentPackStatus?.packLabel ?? selectedInstrument.label} ready.`);
    } catch {
      setStatusMessage(`${selectedInstrumentPackStatus?.packLabel ?? selectedInstrument.label} could not be installed.`);
      toastBus.push({
        variant: 'error',
        title: 'Install failed',
        message: 'The instrument sounds could not be installed. Check storage access and try again.',
      });
    } finally {
      setActivePackActionInstrumentId(null);
    }
  };

  const removeSelectedInstrumentPack = async () => {
    if (activePackActionInstrumentId !== null) {
      return;
    }

    setActivePackActionInstrumentId(selectedInstrument.id);
    setStatusMessage(`Removing ${selectedInstrumentPackStatus?.packLabel ?? 'instrument pack'}...`);
    try {
      await onRemoveInstrumentSamplePack(selectedInstrument.id);
      setStatusMessage(`${selectedInstrument.label} reverted to bundled audio.`);
    } catch {
      setStatusMessage(`${selectedInstrument.label} sound pack could not be removed.`);
      toastBus.push({
        variant: 'error',
        title: 'Remove failed',
        message: 'The instrument sounds could not be removed. Please try again.',
      });
    } finally {
      setActivePackActionInstrumentId(null);
    }
  };

  const markSettingChanged = (compositeKey: string) => {
    setLastChangedSettingKey(compositeKey);
    if (lastChangedTimerRef.current !== null) {
      window.clearTimeout(lastChangedTimerRef.current);
    }
    lastChangedTimerRef.current = window.setTimeout(() => {
      setLastChangedSettingKey(null);
      lastChangedTimerRef.current = null;
    }, 1150);
  };

  const cancelQueuedSettingSave = (compositeKey: string) => {
    const pendingSave = pendingDebouncedSaveRef.current.get(compositeKey);
    if (!pendingSave) {
      return;
    }

    window.clearTimeout(pendingSave.timeoutId);
    pendingDebouncedSaveRef.current.delete(compositeKey);
    setQueuedSaveCount((current) => Math.max(0, current - 1));
  };

  const saveSettingToBridge = async (category: string, key: string, value: string) => {
    if (!window.appBridge) {
      setStatusMessage('Changed for this session. Storage is unavailable.');
      return;
    }

    pendingSaveCountRef.current += 1;
    setIsSaving(true);
    setStatusMessage('Saving changes...');

    const result = await saveSetting(category, key, value);
    if (result.saved) {
      setStatusMessage('Changes saved.');
      setSettingsSavePulse((current) => current + 1);
      if (savePulseTimerRef.current !== null) {
        window.clearTimeout(savePulseTimerRef.current);
      }
      savePulseTimerRef.current = window.setTimeout(() => {
        setSettingsSavePulse(0);
        savePulseTimerRef.current = null;
      }, 360);
    } else {
      setStatusMessage('Save failed. The change is active for this session only.');
      toastBus.push({
        variant: 'error',
        title: 'Setting not saved',
        message: 'The change is active for this session, but could not be written to storage.',
      });
    }
    pendingSaveCountRef.current = Math.max(0, pendingSaveCountRef.current - 1);
    if (pendingSaveCountRef.current === 0) {
      setIsSaving(false);
    }
  };

  const updateSettingValue = (category: string, key: string, value: string) => {
    const compositeKey = getSettingKey(category, key);
    setValues((current) => ({ ...current, [compositeKey]: value }));
    markSettingChanged(compositeKey);
    onSettingChange(category, key, value);
    return compositeKey;
  };

  const persistSetting = async (category: string, key: string, value: string) => {
    const compositeKey = updateSettingValue(category, key, value);
    cancelQueuedSettingSave(compositeKey);
    await saveSettingToBridge(category, key, value);
  };

  const queueSettingPersist = (category: string, key: string, value: string) => {
    const compositeKey = updateSettingValue(category, key, value);
    cancelQueuedSettingSave(compositeKey);

    if (!window.appBridge) {
      setStatusMessage('Changed for this session. Storage is unavailable.');
      return;
    }

    setStatusMessage('Waiting for input to settle...');
    const timeoutId = window.setTimeout(() => {
      pendingDebouncedSaveRef.current.delete(compositeKey);
      setQueuedSaveCount((current) => Math.max(0, current - 1));
      void saveSettingToBridge(category, key, value);
    }, HIGH_FREQUENCY_SETTING_SAVE_DELAY_MS);

    pendingDebouncedSaveRef.current.set(compositeKey, {
      category,
      key,
      timeoutId,
      value,
    });
    setQueuedSaveCount((current) => current + 1);
  };

  const flushQueuedSettingPersist = (category: string, key: string) => {
    const compositeKey = getSettingKey(category, key);
    const pendingSave = pendingDebouncedSaveRef.current.get(compositeKey);
    if (!pendingSave) {
      return;
    }

    window.clearTimeout(pendingSave.timeoutId);
    pendingDebouncedSaveRef.current.delete(compositeKey);
    setQueuedSaveCount((current) => Math.max(0, current - 1));
    void saveSettingToBridge(pendingSave.category, pendingSave.key, pendingSave.value);
  };

  const persistNumericSetting = (category: string, key: string, value: string, min: number, max: number) => {
    void persistSetting(category, key, clampNumericSetting(value, min, max));
  };

  const selectSettingsTab = (tab: SettingsTab, shouldFocus = false) => {
    setActiveTab(tab);
    if (shouldFocus) {
      tabRefs.current[tab]?.focus();
    }
  };

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, tab: SettingsTab) => {
    const currentIndex = SETTINGS_TABS.indexOf(tab);
    let nextIndex = currentIndex;

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (currentIndex - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length;
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (currentIndex + 1) % SETTINGS_TABS.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = SETTINGS_TABS.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    selectSettingsTab(SETTINGS_TABS[nextIndex], true);
  };

  const browseSamplePack = async () => {
    if (!window.appBridge || isSamplePackActionBusy) {
      return;
    }

    setIsSamplePackActionBusy(true);
    setStatusMessage('Choosing custom sound folder...');
    try {
      const dir = await window.appBridge.pickSampleDirectory();
      if (!dir) {
        setStatusMessage('Ready. Changes save automatically.');
        return;
      }
      const files = await window.appBridge.listAudioFiles(dir);
      setSamplePackPath(dir);
      setSamplePackFileCount(files.length);
      const saveResult = await saveSetting('audio', 'customSamplePackPath', dir);
      if (!saveResult.saved) {
        throw new Error('Setting was not saved.');
      }
      onSettingChange('audio', 'customSamplePackPath', dir);
      setStatusMessage(`Sample pack set: ${files.length} audio file(s) found.`);
      toastBus.push({
        variant: 'success',
        title: 'Sample pack updated',
        message: `Loaded ${files.length} audio file${files.length === 1 ? '' : 's'} from the selected folder.`,
      });
    } catch {
      setStatusMessage('Sample folder could not be opened. Built-in sounds are still active.');
      toastBus.push({
        variant: 'error',
        title: 'Sample folder failed',
        message: 'The selected folder could not be read. Check the folder and try again.',
      });
    } finally {
      setIsSamplePackActionBusy(false);
    }
  };

  const clearSamplePack = async () => {
    if (isSamplePackActionBusy) {
      return;
    }

    setIsSamplePackActionBusy(true);
    try {
      setSamplePackPath(null);
      setSamplePackFileCount(0);
      const saveResult = await saveSetting('audio', 'customSamplePackPath', '');
      if (!saveResult.saved) {
        throw new Error('Setting was not saved.');
      }
      onSettingChange('audio', 'customSamplePackPath', '');
      setStatusMessage('Custom sample folder cleared. Built-in instruments are active.');
      toastBus.push({
        variant: 'info',
        title: 'Sample folder cleared',
        message: 'Built-in instrument sounds are active again.',
      });
    } catch {
      setStatusMessage('Sample folder could not be cleared.');
      toastBus.push({
        variant: 'error',
        title: 'Clear failed',
        message: 'The custom sample folder setting could not be cleared. Please try again.',
      });
    } finally {
      setIsSamplePackActionBusy(false);
    }
  };

  const resetUserData = async () => {
    if (!window.appBridge || isResetting) {
      return;
    }

    setIsResetting(true);
    setStatusMessage('Deleting songs, history, and saved settings...');

    try {
      await window.appBridge.resetUserData();
      window.localStorage.clear();
      setValues(DEFAULT_SETTINGS);
      setSamplePackPath(null);
      setSamplePackFileCount(0);
      setResetTarget(null);
      setStatusMessage('All user data was deleted. LumaKeys is back to defaults.');
      onUserDataReset();
      toastBus.push({
        variant: 'info',
        title: 'User data deleted',
        message: 'Songs, history, and saved settings were removed.',
      });
    } catch {
      setStatusMessage('Delete failed. Some data may still be saved.');
      toastBus.push({
        variant: 'error',
        title: 'Delete failed',
        message: 'Some data may still be saved. Try again before sharing this device.',
      });
    } finally {
      setIsResetting(false);
    }
  };

  const resetLearningProgress = async () => {
    if (!window.appBridge || isResettingProgress) {
      return;
    }

    setIsResettingProgress(true);
    setStatusMessage('Clearing lesson progress and practice history...');

    try {
      await window.appBridge.resetLearningProgress();
      setStatusMessage('Learning progress cleared. Your songs and settings were kept.');
      setResetTarget(null);
      onLearningProgressReset();
      toastBus.push({
        variant: 'success',
        title: 'Learning progress cleared',
        message: 'Lessons, achievements, and practice history were cleared.',
      });
    } catch {
      setStatusMessage('Progress reset failed. Some history may still be saved.');
      toastBus.push({
        variant: 'error',
        title: 'Progress reset failed',
        message: 'Some lesson or practice history may still be saved. Please try again.',
      });
    } finally {
      setIsResettingProgress(false);
    }
  };

  const unlockDeveloperContent = async () => {
    if (isUnlockingDeveloperContent) {
      return;
    }

    setIsUnlockingDeveloperContent(true);
    setStatusMessage('Unlocking test content...');

    try {
      await onDeveloperUnlockAll();
      setResetTarget(null);
      setStatusMessage('Test content unlocked. Clear learning progress to lock it again.');
      toastBus.push({
        variant: 'success',
        title: 'Test content unlocked',
        message: 'All achievements, rewards, lessons, and capstones are now open for testing.',
      });
    } catch {
      setStatusMessage('Unlock failed. Some test content may still be locked.');
      toastBus.push({
        variant: 'error',
        title: 'Unlock failed',
        message: 'Some test content may still be locked. Please try again.',
      });
    } finally {
      setIsUnlockingDeveloperContent(false);
    }
  };

  if (isLoading) {
    return (
      <LoadingPanel
        eyebrow="Settings"
        title="Loading settings"
        message="Reading your saved sound, display, and practice choices."
        className="settings-screen"
      />
    );
  }

  return (
    <main
      className="app-shell settings-screen"
      data-settings-tab={activeTab}
      style={{ '--settings-active-accent': TAB_META[activeTab].accent } as SettingsStyle}
    >
      <div className="settings-layout-shell">
        <section className="panel settings-panel">
          <DeckBackdrop />

          <div className="settings-panel-status" aria-live="polite">
            <div>
              <p className="eyebrow">Settings</p>
              <h1>{TAB_LABELS[activeTab]}</h1>
            </div>
            <p
              key={statusMessage}
              className={`settings-status-message${isSaving ? ' settings-status-message-saving' : ''}`}
            >
              {statusMessage}
            </p>
            <div className="settings-save-signal" data-save-state={saveSignalState} aria-hidden="true">
              <span className="settings-save-signal-dot" />
              <span className="settings-save-signal-dot" />
              <span className="settings-save-signal-dot" />
              <span>{saveSignalLabel}</span>
            </div>
          </div>

          <section className="settings-tab-row" role="tablist" aria-label="Settings sections">
            {SETTINGS_TABS.map((tab, index) => (
              <button
                key={tab}
                id={`settings-tab-${tab}`}
                role="tab"
                aria-label={TAB_LABELS[tab]}
                aria-selected={activeTab === tab}
                aria-controls={`settings-panel-${tab}`}
                tabIndex={activeTab === tab ? 0 : -1}
                ref={(element) => {
                  tabRefs.current[tab] = element;
                }}
                className={`settings-tab-button${activeTab === tab ? ' settings-tab-button-active' : ''}`}
                onClick={() => selectSettingsTab(tab)}
                onKeyDown={(event) => handleTabKeyDown(event, tab)}
                style={{
                  '--entrance-delay': `${80 + index * 55}ms`,
                } as SettingsStyle}
                type="button"
              >
                <SettingsTabIcon tab={tab} />
                <span className="settings-tab-copy">
                  <span className="settings-tab-kicker">{TAB_META[tab].kicker}</span>
                  <span>{TAB_LABELS[tab]}</span>
                </span>
              </button>
            ))}
          </section>

        {activeTab === 'audio' && (
          <div
            key="settings-tabpanel-audio"
            className="settings-content-grid settings-content-grid-audio"
            role="tabpanel"
            id="settings-panel-audio"
            aria-labelledby="settings-tab-audio"
          >
            <SettingsGroupCard eyebrow="Audio" title="Instrument" description="Choose the default voice for playback and practice." accent="audio">
              <div className="settings-grid">
                <label>
                  <span>Instrument</span>
                  <select
                    value={values['audio.instrumentId']}
                    onChange={(event) => void persistSetting('audio', 'instrumentId', event.target.value)}
                  >
                    {INSTRUMENTS.map((instrument) => {
                      const locked = instrument.requiredRewardId
                        ? !isRewardUnlocked(instrument.requiredRewardId, unlockedRewardIds)
                        : false;
                      const unavailable = !isInstrumentSelectable(instrument.id, installedPackInstrumentIds);
                      const packStatus = instrumentSamplePackStatuses[instrument.id];
                      const disabled = locked || unavailable;
                      return (
                        <option key={instrument.id} value={instrument.id} disabled={disabled}>
                          {locked
                            ? `\uD83D\uDD12 ${instrument.label}`
                            : unavailable
                              ? `${instrument.label} (${packStatus?.requiresPackForSelection ? 'Install sounds first' : 'Unavailable'})`
                              : instrument.label}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <article className="settings-note-card settings-note-audio">
                  <span>Instrument Notes</span>
                  <strong>
                    {(() => {
                      const instr = INSTRUMENTS.find((i) => i.id === values['audio.instrumentId']);
                      if (!instr) return 'Choose a built-in voice for practice and playback.';
                      if (!isInstrumentSelectable(instr.id, installedPackInstrumentIds)) {
                        return instrumentSamplePackStatuses[instr.id]?.statusMessage ?? instr.availabilityNote ?? instr.description;
                      }
                      if (instr.requiredRewardId && !isRewardUnlocked(instr.requiredRewardId, unlockedRewardIds)) {
                        const reward = REWARD_CATALOG.find((r) => r.id === instr.requiredRewardId);
                        return reward ? `Locked: ${reward.description}` : 'Locked: earn an achievement to unlock this sound.';
                      }
                      return instr.description;
                    })()}
                  </strong>
                </article>
              </div>
            </SettingsGroupCard>

            <SettingsGroupCard title="Playback Mix" accent="audio" footer="Balance the instrument, room sound, and click before you start practicing.">
              <div className="settings-grid">
                <SettingsRangeField
                  category="audio"
                  label="Master Volume"
                  lastChangedSettingKey={lastChangedSettingKey}
                  max={100}
                  min={0}
                  settingKey="masterVolume"
                  value={values['audio.masterVolume']}
                  onFlush={flushQueuedSettingPersist}
                  onQueue={queueSettingPersist}
                />
                <SettingsRangeField
                  category="audio"
                  label="Reverb Level"
                  lastChangedSettingKey={lastChangedSettingKey}
                  max={100}
                  min={0}
                  settingKey="reverbLevel"
                  value={values['audio.reverbLevel']}
                  onFlush={flushQueuedSettingPersist}
                  onQueue={queueSettingPersist}
                />
                <SettingsRangeField
                  category="audio"
                  label="Metronome Volume"
                  lastChangedSettingKey={lastChangedSettingKey}
                  max={100}
                  min={0}
                  settingKey="metronomeVolume"
                  value={values['audio.metronomeVolume']}
                  onFlush={flushQueuedSettingPersist}
                  onQueue={queueSettingPersist}
                />
                <label>
                  <span>Metronome Sound</span>
                  <select
                    value={values['audio.metronomeSound']}
                    onChange={(event) => void persistSetting('audio', 'metronomeSound', event.target.value)}
                  >
                    <option value="classic">Classic Click</option>
                    <option value="wood">Wood Block</option>
                    <option value="soft">Soft Tap</option>
                    <option value="digital">Bright Digital</option>
                  </select>
                </label>
              </div>
            </SettingsGroupCard>

            <SettingsGroupCard title="Timing Calibration" footer="Use calibration if notes sound early or late when you play." accent="input">
              <div className="settings-grid settings-grid-single">
                <div className="latency-comp-row">
                  <label>
                    <span>Input Delay Fix (ms)</span>
                    <input
                      type="number"
                      min={0}
                      max={300}
                      inputMode="numeric"
                      value={values['audio.latencyCompMs']}
                      onChange={(event) => persistNumericSetting('audio', 'latencyCompMs', event.target.value, 0, 300)}
                    />
                  </label>
                  <button
                    className="secondary-button latency-calibrate-btn"
                    onClick={() => setShowLatencyWizard(true)}
                  >
                    <SettingsActionIcon icon="calibrate" />
                    Calibrate…
                  </button>
                </div>
              </div>
            </SettingsGroupCard>

            <SettingsGroupCard
              title="Advanced Sound Options"
              description="Optional controls for unlocked expression settings and custom sound sources."
              footer={showAdvancedAudio ? 'These settings are useful when you are tuning an instrument or installing alternate sounds.' : undefined}
              accent="info"
              className="settings-advanced-audio-card"
            >
              <div className="settings-grid">
                <article className="settings-note-card settings-note-info settings-advanced-audio-summary">
                  <span>Current Sound Source</span>
                  <strong>
                    {selectedInstrumentPackStatus?.isInstalled
                      ? `${selectedInstrumentPackStatus.packLabel} installed`
                      : samplePackPath
                        ? `${samplePackFileCount} custom file${samplePackFileCount === 1 ? '' : 's'} selected`
                        : 'Built-in sounds active'}
                  </strong>
                </article>
                <button
                  className="secondary-button settings-advanced-toggle"
                  type="button"
                  aria-expanded={showAdvancedAudio}
                  onClick={() => setShowAdvancedAudio((current) => !current)}
                >
                  {showAdvancedAudio ? <SettingsActionIcon icon="x" /> : <SettingsActionIcon icon="pack" />}
                  {showAdvancedAudio ? 'Hide Advanced Options' : 'Show Advanced Options'}
                </button>
              </div>
              {showAdvancedAudio ? (
                <div className="settings-advanced-audio-panel">
                  <label>
                    <span>Pitch Bend</span>
                    <select
                      value={values['audio.pitchBendEnabled'] ?? 'true'}
                      onChange={(event) => void persistSetting('audio', 'pitchBendEnabled', event.target.value)}
                      disabled={!isRewardUnlocked('audio:pitch-bend', unlockedRewardIds)}
                    >
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  </label>
                  <label>
                    <span>{selectedInstrument.label} Reverb Shape</span>
                    <select
                      aria-label={`${selectedInstrument.label} Reverb Shape`}
                      value={selectedInstrumentReverbPreset}
                      onChange={(event) => {
                        const nextPreset = event.target.value as InstrumentReverbPreset;
                        const nextMap = { ...instrumentReverbPresets };
                        if (nextPreset === (selectedInstrument.reverbPreset ?? 'medium')) {
                          delete nextMap[selectedInstrument.id];
                        } else {
                          nextMap[selectedInstrument.id] = nextPreset;
                        }
                        void persistSetting('audio', 'instrumentReverbPresets', JSON.stringify(nextMap));
                      }}
                      disabled={!reverbCustomizationUnlocked}
                    >
                      <option value="short">Small Room</option>
                      <option value="medium">Studio Room</option>
                      <option value="hall">Concert Hall</option>
                    </select>
                  </label>
                  {selectedInstrumentPackStatus ? (
                    <article className="settings-note-card settings-note-info">
                      <span>Selected Instrument</span>
                      <strong>
                        {selectedInstrumentPackStatus.isInstalled
                          ? `${selectedInstrumentPackStatus.packLabel} installed`
                            : selectedInstrumentPackStatus.requiresPackForSelection
                            ? 'Install sounds to use this instrument'
                            : 'Built-in sounds active'}
                      </strong>
                      <div className="settings-sample-pack-buttons">
                        {selectedInstrumentPackStatus.canInstallInApp ? (
                          <button
                            className="secondary-button"
                            disabled={activePackActionInstrumentId === selectedInstrument.id}
                            onClick={() => void installSelectedInstrumentPack()}
                          >
                            <SettingsActionIcon icon={selectedInstrumentPackStatus.installMode === 'manual' ? 'upload' : 'pack'} />
                            {activePackActionInstrumentId === selectedInstrument.id
                              ? 'Working...'
                              : selectedInstrumentPackStatus.installMode === 'manual'
                                ? 'Choose Sound Folder'
                                : 'Install Better Sounds'}
                          </button>
                        ) : null}
                        {selectedInstrumentPackStatus.isInstalled ? (
                          <button
                            className="secondary-button"
                            disabled={activePackActionInstrumentId === selectedInstrument.id}
                            onClick={() => void removeSelectedInstrumentPack()}
                          >
                            <SettingsActionIcon icon="clear" />
                            Use Built-in Sounds
                          </button>
                        ) : null}
                      </div>
                      <em>{selectedInstrumentPackStatus.statusMessage}</em>
                    </article>
                  ) : (
                    <article className="settings-note-card settings-note-info">
                      <span>Instrument Sounds</span>
                      <strong>No extra sound controls are available for this instrument.</strong>
                    </article>
                  )}
                  {!IS_WEB ? (
                    <article className="settings-note-card settings-note-info">
                      <span>Custom Sound Folder</span>
                      {samplePackPath ? (
                        <strong>{samplePackPath} ({samplePackFileCount} file{samplePackFileCount !== 1 ? 's' : ''})</strong>
                      ) : (
                        <strong>No folder selected.</strong>
                      )}
                      <div className="settings-sample-pack-buttons">
                        <button
                          className="secondary-button"
                          disabled={isSamplePackActionBusy}
                          onClick={() => void browseSamplePack()}
                        >
                          <SettingsActionIcon icon="upload" />
                          {isSamplePackActionBusy ? 'Working...' : 'Choose Folder'}
                        </button>
                        {samplePackPath ? (
                          <button
                            className="secondary-button"
                            disabled={isSamplePackActionBusy}
                            onClick={() => void clearSamplePack()}
                          >
                            <SettingsActionIcon icon="clear" />
                            Use Built-in Sounds
                          </button>
                        ) : null}
                      </div>
                      <em>Name files by note, such as A0.mp3, C1.mp3, Ds1.mp3, or Fs1.mp3.</em>
                    </article>
                  ) : (
                    <article className="settings-note-card settings-note-info">
                      <span>Custom Sound Folder</span>
                      <strong>Custom sound folders are available in the desktop app.</strong>
                    </article>
                  )}
                  {!isRewardUnlocked('audio:pitch-bend', unlockedRewardIds) || !reverbCustomizationUnlocked ? (
                    <article className="settings-note-card settings-note-info">
                      <span>Locked Sound Controls</span>
                      <strong>Complete Music Theorist rewards to unlock pitch bend and per-instrument reverb shape.</strong>
                    </article>
                  ) : null}
                </div>
              ) : null}
            </SettingsGroupCard>
          </div>
        )}

        {activeTab === 'visual' && (
          <div
            key="settings-tabpanel-visual"
            className="settings-content-grid settings-content-grid-visual"
            role="tabpanel"
            id="settings-panel-visual"
            aria-labelledby="settings-tab-visual"
          >
            <SettingsGroupCard
              eyebrow="Visual"
              title="Appearance"
              accent="visual"
              footer={
                isRewardUnlocked('theme:neon', unlockedRewardIds)
                  ? 'Neon theme is ready to use.'
                  : 'Unlock the Neon theme reward to use the arcade palette.'
              }
            >
              <div className="settings-grid">
                <label>
                  <span>Theme</span>
                  <select
                    value={values['visual.theme']}
                    onChange={(event) => void persistSetting('visual', 'theme', event.target.value)}
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="warm">Warm</option>
                    <option value="neon" disabled={!isRewardUnlocked('theme:neon', unlockedRewardIds)}>
                      {isRewardUnlocked('theme:neon', unlockedRewardIds) ? 'Neon' : 'Neon (Locked)'}
                    </option>
                  </select>
                </label>
                <label>
                  <span>High Contrast Note Colors</span>
                  <select
                    value={values['visual.colorBlindMode']}
                    onChange={(event) => void persistSetting('visual', 'colorBlindMode', event.target.value)}
                  >
                    <option value="false">Off</option>
                    <option value="true">On</option>
                  </select>
                </label>
              </div>
            </SettingsGroupCard>

            <SettingsGroupCard title="Labels & Keyboard" footer={`Falling notes appear ${values['visual.beatsVisible']} beats before you play them.`} accent="visual">
              <div className="settings-grid">
                <label>
                  <span>Note Labels</span>
                  <select
                    value={values['visual.noteLabels']}
                    onChange={(event) => void persistSetting('visual', 'noteLabels', event.target.value)}
                  >
                    <option value="alphabetic">Alphabetic</option>
                    <option value="symbols">Symbols</option>
                    <option value="both">Both</option>
                    <option value="none">None</option>
                  </select>
                </label>
                <label>
                  <span>Note Label Size</span>
                  <select
                    value={values['visual.noteLabelSize'] ?? 'medium'}
                    onChange={(event) => void persistSetting('visual', 'noteLabelSize', event.target.value)}
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </label>
                <label>
                  <span>Keyboard Overlay Size</span>
                  <div className="keyboard-size-preview-row">
                    <select
                      value={values['visual.keyboardOverlaySize']}
                      onChange={(event) => void persistSetting('visual', 'keyboardOverlaySize', event.target.value)}
                    >
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                    </select>
                    <KeyboardSizeThumbnail size={(values['visual.keyboardOverlaySize'] as 'small' | 'medium' | 'large') ?? 'medium'} />
                  </div>
                </label>
                <SettingsRangeField
                  category="visual"
                  label="Falling Note Preview"
                  lastChangedSettingKey={lastChangedSettingKey}
                  max={16}
                  min={4}
                  settingKey="beatsVisible"
                  value={values['visual.beatsVisible']}
                  onFlush={flushQueuedSettingPersist}
                  onQueue={queueSettingPersist}
                />
                <label>
                  <span>Finger Numbers</span>
                  <select
                    value={values['fingering.displayMode']}
                    onChange={(event) => void persistSetting('fingering', 'displayMode', event.target.value)}
                  >
                    <option value="always">Always</option>
                    <option value="learning-only">Learning Only</option>
                    <option value="never">Never</option>
                  </select>
                </label>
              </div>
            </SettingsGroupCard>

            <SettingsGroupCard title="Hand Colors" footer="Clear a hand color to use the current theme color." accent="info">
              <div className="settings-grid">
                <label>
                  <span>Left Hand Color</span>
                  <input
                    type="color"
                    value={values['visual.leftHandColor'] || '#1f3d7a'}
                    onBlur={() => flushQueuedSettingPersist('visual', 'leftHandColor')}
                    onChange={(event) => queueSettingPersist('visual', 'leftHandColor', event.target.value)}
                  />
                  {values['visual.leftHandColor'] ? (
                    <button
                      className="secondary-button"
                      onClick={() => void persistSetting('visual', 'leftHandColor', '')}
                    >
                      <SettingsActionIcon icon="clear" />
                      Clear Color
                    </button>
                  ) : null}
                </label>
                <label>
                  <span>Right Hand Color</span>
                  <input
                    type="color"
                    value={values['visual.rightHandColor'] || '#9a4c33'}
                    onBlur={() => flushQueuedSettingPersist('visual', 'rightHandColor')}
                    onChange={(event) => queueSettingPersist('visual', 'rightHandColor', event.target.value)}
                  />
                  {values['visual.rightHandColor'] ? (
                    <button
                      className="secondary-button"
                      onClick={() => void persistSetting('visual', 'rightHandColor', '')}
                    >
                      <SettingsActionIcon icon="clear" />
                      Clear Color
                    </button>
                  ) : null}
                </label>
              </div>
            </SettingsGroupCard>
          </div>
        )}

        {activeTab === 'gameplay' && (
          <div
            key="settings-tabpanel-gameplay"
            className="settings-content-grid settings-content-grid-gameplay"
            role="tabpanel"
            id="settings-panel-gameplay"
            aria-labelledby="settings-tab-gameplay"
          >
            <SettingsGroupCard eyebrow="Gameplay" title="New Session Defaults" footer="These choices apply each time you start a new song." accent="gameplay">
              <div className="settings-grid">
                <label>
                  <span>Start With Wait Mode</span>
                  <select
                    value={values['gameplay.waitModeDefault']}
                    onChange={(event) => void persistSetting('gameplay', 'waitModeDefault', event.target.value)}
                  >
                    <option value="false">Off</option>
                    <option value="true">On</option>
                  </select>
                </label>
                <label>
                  <span>Start With Metronome</span>
                  <select
                    value={values['gameplay.metronomeDefault']}
                    onChange={(event) => void persistSetting('gameplay', 'metronomeDefault', event.target.value)}
                  >
                    <option value="false">Off</option>
                    <option value="true">On</option>
                  </select>
                </label>
                <label>
                  <span>Timing Leniency</span>
                  <select
                    value={values['gameplay.hitWindowMs']}
                    onChange={(event) => void persistSetting('gameplay', 'hitWindowMs', event.target.value)}
                  >
                    <option value="50">Strict (50 ms)</option>
                    <option value="100">Standard (100 ms)</option>
                    <option value="150">Relaxed (150 ms)</option>
                    <option value="200">Forgiving (200 ms)</option>
                  </select>
                </label>
                <label>
                  <span>Count-in Before Start</span>
                  <select
                    value={values['gameplay.leadInBeats'] ?? '2'}
                    onChange={(event) => void persistSetting('gameplay', 'leadInBeats', event.target.value)}
                  >
                    <option value="0">None</option>
                    <option value="1">1 beat</option>
                    <option value="2">2 beats</option>
                    <option value="4">4 beats</option>
                  </select>
                </label>
              </div>
            </SettingsGroupCard>
          </div>
        )}

        {activeTab === 'input' && (
          <div
            key="settings-tabpanel-input"
            className="settings-content-grid settings-content-grid-input"
            role="tabpanel"
            id="settings-panel-input"
            aria-labelledby="settings-tab-input"
          >
            <SettingsGroupCard eyebrow="Input" title="Keyboard Input" footer={`Currently listening for: ${inputMode === 'both' ? 'MIDI keyboard and computer keyboard' : inputMode === 'midi' ? 'MIDI keyboard only' : 'computer keyboard only'}.`} accent="input">
              <div className="settings-grid">
                <label>
                  <span>Play Notes With</span>
                  <select
                    value={inputMode}
                    onChange={(event) => {
                      const nextMode = event.target.value as InputMode;
                      onInputModeChange(nextMode);
                      updateSettingValue('input', 'mode', nextMode);
                      setStatusMessage('Input mode updated.');
                    }}
                  >
                    <option value="both">MIDI or Computer Keyboard</option>
                    <option value="midi">MIDI Keyboard Only</option>
                    <option value="computer-keyboard">Computer Keyboard Only</option>
                  </select>
                </label>
                <label>
                  <span>MIDI Device</span>
                  <select
                    value={values['input.midiDeviceId']}
                    onChange={(event) => void persistSetting('input', 'midiDeviceId', event.target.value)}
                  >
                    <option value="">Any connected device</option>
                    {missingMidiDeviceId ? (
                      <option value={missingMidiDeviceId}>Saved device not connected: {missingMidiDeviceId}</option>
                    ) : null}
                    {midiDevices.map((device) => (
                      <option key={device.id} value={device.id}>
                        {device.name}
                      </option>
                    ))}
                  </select>
                </label>
                {midiError ? (
                  <article className="settings-note-card settings-note-danger">
                    <span>MIDI Connection</span>
                    <strong>LumaKeys cannot access your MIDI keyboard. Check browser or system permission, then try again.</strong>
                    <button className="secondary-button settings-note-action" onClick={onRetryMidi}>
                      <SettingsActionIcon icon="retry" />
                      Try MIDI Again
                    </button>
                  </article>
                ) : missingMidiDeviceId ? (
                  <article className="settings-note-card settings-note-danger">
                    <span>Connected Keyboard</span>
                    <strong>Saved device not connected: {missingMidiDeviceId}</strong>
                    <em>Notes from other keyboards are ignored until it returns or you switch.</em>
                    <button
                      className="secondary-button settings-note-action"
                      onClick={() => void persistSetting('input', 'midiDeviceId', '')}
                    >
                      Use any connected device
                    </button>
                  </article>
                ) : (
                  <article className="settings-note-card settings-note-success">
                    <span>Connected Keyboard</span>
                    <strong>{selectedMidiDeviceName}</strong>
                  </article>
                )}
              </div>
            </SettingsGroupCard>

            <SettingsGroupCard title="Computer Keyboard Layout" footer="Change which computer keys play each piano note." accent="input">
              <div className="settings-grid settings-grid-single">
                <button className="secondary-button" onClick={onOpenKeyboardSetup}>
                  <SettingsActionIcon icon="keyboard" />
                  Edit Key Layout
                </button>
              </div>
            </SettingsGroupCard>
          </div>
        )}

        {activeTab === 'practice' && (
          <div
            key="settings-tabpanel-practice"
            className="settings-content-grid settings-content-grid-practice"
            role="tabpanel"
            id="settings-panel-practice"
            aria-labelledby="settings-tab-practice"
          >
            <SettingsGroupCard eyebrow="Practice" title="Goals & Reminders" footer="Set the daily goal to 0 to turn goal tracking off." accent="practice">
              <div className="settings-grid">
                <label>
                  <span>Daily Goal (minutes)</span>
                  <input
                    type="number"
                    min={0}
                    max={600}
                    inputMode="numeric"
                    value={values['practice.dailyGoalMinutes']}
                    onChange={(event) => persistNumericSetting('practice', 'dailyGoalMinutes', event.target.value, 0, 600)}
                  />
                </label>
                <label>
                  <span>Posture Reminder (minutes)</span>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    inputMode="numeric"
                    value={values['practice.postureReminderMinutes']}
                    onChange={(event) => persistNumericSetting('practice', 'postureReminderMinutes', event.target.value, 0, 120)}
                  />
                </label>
                <label>
                  <span>Break Reminder (minutes)</span>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    inputMode="numeric"
                    value={values['practice.breakReminderMinutes']}
                    onChange={(event) => persistNumericSetting('practice', 'breakReminderMinutes', event.target.value, 0, 120)}
                  />
                </label>
              </div>
            </SettingsGroupCard>

            <SettingsGroupCard
              title="Reset Options"
              description="These actions remove progress or data. Each one asks for confirmation before it runs."
              className="settings-danger-zone"
              accent="danger"
            >
              <div className="settings-danger-actions">
                <article className="settings-note-card settings-danger-card">
                  <svg className="settings-warning-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                    <path d="M12 3 22 20H2z" />
                    <path d="M12 9v5" />
                    <path d="M12 17h.01" />
                  </svg>
                  <span>Clear Learning Progress</span>
                  <strong>Removes lesson progress, achievements, and practice history. Keeps songs, playlists, folders, and settings.</strong>
                  <button
                    className="danger-button"
                    disabled={isResettingProgress || resetTarget !== null}
                    onClick={() => setResetTarget('progress')}
                  >
                    <SettingsActionIcon icon="trash" />
                    Clear Learning Progress
                  </button>
                </article>
                <article className="settings-note-card settings-danger-card">
                  <svg className="settings-warning-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                    <path d="M12 3 22 20H2z" />
                    <path d="M12 9v5" />
                    <path d="M12 17h.01" />
                  </svg>
                  <span>Delete User Data</span>
                  <strong>Removes {getDeleteUserDataScope()}</strong>
                  <button
                    className="danger-button"
                    disabled={isResetting || resetTarget !== null}
                    onClick={() => setResetTarget('data')}
                  >
                    <SettingsActionIcon icon="trash" />
                    Delete User Data
                  </button>
                </article>
                {import.meta.env.DEV ? (
                  <article className="settings-note-card settings-danger-card">
                    <svg className="settings-warning-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                      <path d="M12 3 22 20H2z" />
                      <path d="M12 9v5" />
                      <path d="M12 17h.01" />
                    </svg>
                    <span>Test Content</span>
                    <strong>Opens all achievements, rewards, lessons, and capstones for testing. Clear learning progress to lock them again.</strong>
                    <button
                      className="secondary-button"
                      disabled={isUnlockingDeveloperContent || resetTarget !== null}
                      onClick={() => setResetTarget('developer-unlock')}
                    >
                      <SettingsActionIcon icon="unlock" />
                      Unlock Test Content
                    </button>
                  </article>
                ) : null}
              </div>
            </SettingsGroupCard>
          </div>
        )}
        </section>
      </div>
      {resetTarget === 'progress' && (
        <ConfirmActionModal
          busy={isResettingProgress}
          confirmLabel="Clear Learning Progress"
          description="This removes lesson progress, achievements, and practice history. Your songs, playlists, folders, and settings stay in place."
          title="Clear learning progress?"
          onCancel={() => setResetTarget(null)}
          onConfirm={() => {
            void resetLearningProgress();
          }}
        />
      )}
      {resetTarget === 'data' && (
        <ConfirmActionModal
          busy={isResetting}
          confirmLabel="Delete User Data"
          description={`This removes ${getDeleteUserDataScope()}`}
          title="Delete all user data?"
          onCancel={() => setResetTarget(null)}
          onConfirm={() => {
            void resetUserData();
          }}
        />
      )}
      {resetTarget === 'developer-unlock' && (
        <ConfirmActionModal
          busy={isUnlockingDeveloperContent}
          confirmLabel="Unlock Test Content"
          description="This opens every achievement reward and marks all lessons, steps, and capstones complete for testing. Clear learning progress to lock them again."
          title="Unlock test content?"
          onCancel={() => setResetTarget(null)}
          onConfirm={() => {
            void unlockDeveloperContent();
          }}
        />
      )}
      {showLatencyWizard && (
        <LatencyWizard
          audioEngine={audioEngine}
          currentMs={Number(values['audio.latencyCompMs']) || 0}
          onApply={(ms) => void persistSetting('audio', 'latencyCompMs', String(ms))}
          onClose={() => setShowLatencyWizard(false)}
        />
      )}
    </main>
  );
}
