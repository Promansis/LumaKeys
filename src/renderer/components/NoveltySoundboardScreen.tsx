import { Info, KeyboardMusic } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from '../../lib/audio/audioEngine';
import { resolvePublicAssetUrl } from '../../lib/audio/publicAssetUrl';
import {
  DEFAULT_SOUNDBOARD_MODE_ID,
  SOUNDBOARD_MAX_MIDI,
  SOUNDBOARD_MIN_MIDI,
  SOUNDBOARD_MODES,
  getSoundboardClipForMidi,
  getSoundboardMode,
  type SoundboardClip,
  type SoundboardModeId,
} from '../../lib/audio/soundboardCatalog';
import { ComputerKeyboardInputService } from '../../lib/input/computerKeyboardInputService';
import type { InputEvent, InputMode } from '../../lib/input/types';
import { MidiInputService } from '../../lib/midi/midiInputService';
import { midiToLabel } from '../../lib/piano/pianoLayout';
import { useTimeoutRegistry } from '../useTimeoutRegistry';
import { AnimalSoundboardCanvas, type AnimalSoundboardBurst } from './AnimalSoundboardCanvas';
import { ImmersiveHud, type ImmersiveHudDestination, type ImmersiveHudNavigationItem } from './ImmersiveHud';
import { inertWhenClosed } from './inertWhenClosed';
import { PianoKeyboard, type KeyboardKeyLabel, type KeyboardOverlayEffect } from './PianoKeyboard';
import { useModalFocusTrap } from '../useModalFocusTrap';

interface NoveltySoundboardScreenProps {
  audioEngine: AudioEngine;
  midiInputService: MidiInputService;
  keyboardInputService: ComputerKeyboardInputService;
  inputMode: InputMode;
  keyboardOverlaySize: 'small' | 'medium' | 'large';
  onBackToMainMenu: () => void;
  onOpenKeyboardSetup: () => void;
  hudNavigationItems?: ImmersiveHudNavigationItem[];
  hudCurrentDestination?: ImmersiveHudDestination;
}

interface FloatingEffect extends KeyboardOverlayEffect {}
interface TimedAnimalBurst extends AnimalSoundboardBurst {}

function formatInputMode(inputMode: InputMode): string {
  if (inputMode === 'both') {
    return 'Both';
  }
  if (inputMode === 'midi') {
    return 'MIDI';
  }
  return 'Computer Keyboard';
}

export function NoveltySoundboardScreen({
  audioEngine,
  midiInputService,
  keyboardInputService,
  inputMode,
  keyboardOverlaySize,
  onBackToMainMenu,
  onOpenKeyboardSetup,
  hudNavigationItems = [],
  hudCurrentDestination = 'soundboard',
}: NoveltySoundboardScreenProps) {
  const { setTrackedTimeout, clearTrackedTimeout, clearAllTimeouts } = useTimeoutRegistry();
  const [activeNotes, setActiveNotes] = useState<number[]>([]);
  const [lastPlayedId, setLastPlayedId] = useState<string | null>(null);
  const [modeId, setModeId] = useState<SoundboardModeId>(DEFAULT_SOUNDBOARD_MODE_ID);
  const [showCredits, setShowCredits] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [floatingEffects, setFloatingEffects] = useState<FloatingEffect[]>([]);
  const [animalBursts, setAnimalBursts] = useState<TimedAnimalBurst[]>([]);
  const [isAnimalMapPinned, setIsAnimalMapPinned] = useState(false);
  const [isAnimalMapHovered, setIsAnimalMapHovered] = useState(false);
  const [isModeSelectorPinned, setIsModeSelectorPinned] = useState(false);
  const [isModeSelectorHovered, setIsModeSelectorHovered] = useState(false);
  const [openModeInfoId, setOpenModeInfoId] = useState<SoundboardModeId | null>(null);
  const [openClipInfoId, setOpenClipInfoId] = useState<string | null>(null);
  const [keyboardOctaveShift, setKeyboardOctaveShift] = useState(keyboardInputService.getState().octaveShift);
  const effectCounterRef = useRef(0);
  const animalMapButtonRef = useRef<HTMLButtonElement | null>(null);
  const animalMapPopoutRef = useRef<HTMLElement | null>(null);
  const modeSelectorButtonRef = useRef<HTMLButtonElement | null>(null);
  const modeSelectorPopoutRef = useRef<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const animalMapHoverCloseTimeoutRef = useRef<number | null>(null);
  const modeSelectorHoverCloseTimeoutRef = useRef<number | null>(null);
  const oneShotPlaybackLockedRef = useRef(false);
  const oneShotUnlockTimeoutRef = useRef<number | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useModalFocusTrap({
    open: overlayVisible,
    dialogRef: overlayRef,
    triggerRef: menuButtonRef,
    onEscape: () => setOverlayVisible(false),
  });

  const mode = useMemo(() => getSoundboardMode(modeId), [modeId]);
  const highlightedNotes = useMemo(() => mode.clips.map((clip) => clip.midi), [mode]);
  const keyLabels = useMemo(
    () =>
      Object.fromEntries(
        mode.clips.map((clip) => [
          clip.midi,
          {
            text: clip.emoji ?? clip.shortLabel,
            title: clip.label,
            ariaLabel: `${midiToLabel(clip.midi)} key: ${clip.label}`,
          } satisfies KeyboardKeyLabel,
        ]),
      ),
    [mode],
  );
  const statusFallback = `${mode.heading}.`;
  const [statusMessage, setStatusMessage] = useState(statusFallback);

  useEffect(() => {
    clearAllTimeouts();
    oneShotPlaybackLockedRef.current = false;
    oneShotUnlockTimeoutRef.current = null;
    setStatusMessage(mode.copy);
    setLastPlayedId(null);
    setActiveNotes([]);
    setFloatingEffects([]);
    setAnimalBursts([]);
    setIsAnimalMapHovered(false);
    setIsAnimalMapPinned(false);
    setIsModeSelectorHovered(false);
    setIsModeSelectorPinned(false);
    setOpenModeInfoId(null);
    setOpenClipInfoId(null);
  }, [clearAllTimeouts, mode]);

  useEffect(() => {
    return () => {
      if (oneShotUnlockTimeoutRef.current !== null) {
        clearTrackedTimeout(oneShotUnlockTimeoutRef.current);
      }
      clearAllTimeouts();
    };
  }, [clearAllTimeouts, clearTrackedTimeout]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      setOverlayVisible((prev) => !prev);
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [overlayVisible]);

  useEffect(() => {
    if (!(isAnimalMapPinned || isModeSelectorPinned)) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (isAnimalMapPinned) {
        if (!animalMapButtonRef.current?.contains(target) && !animalMapPopoutRef.current?.contains(target)) {
          closeAnimalMap(false);
        }
      }
      if (isModeSelectorPinned) {
        if (!modeSelectorButtonRef.current?.contains(target) && !modeSelectorPopoutRef.current?.contains(target)) {
          closeModeSelector(false);
        }
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isAnimalMapPinned, isModeSelectorPinned]);

  const spawnFloatingEffect = (clip: SoundboardClip) => {
    if (!clip.visualSrc || mode.id === 'animals') {
      return;
    }

    const visualSrc = resolvePublicAssetUrl(clip.visualSrc);
    const effectId = `${clip.id}-${effectCounterRef.current}`;
    effectCounterRef.current += 1;
    setFloatingEffects((current) => [
      ...current,
      {
        id: effectId,
        midi: clip.midi,
        src: visualSrc,
        alt: clip.label,
      },
    ]);

    setTrackedTimeout(() => {
      setFloatingEffects((current) => current.filter((effect) => effect.id !== effectId));
    }, 1500);
  };

  const spawnAnimalBurst = (clip: SoundboardClip) => {
    if (mode.id !== 'animals' || !clip.emoji) {
      return;
    }

    const burstId = `${clip.id}-burst-${effectCounterRef.current}`;
    const lane =
      (clip.midi - SOUNDBOARD_MIN_MIDI) / Math.max(1, SOUNDBOARD_MAX_MIDI - SOUNDBOARD_MIN_MIDI);
    const normalizedX = 0.06 + lane * 0.88;
    const randomSeed = Math.random();
    const burst: TimedAnimalBurst = {
      id: burstId,
      clipId: clip.id,
      emoji: clip.emoji,
      label: clip.label,
      accent: clip.accent ?? '#ffb86b',
      startX: normalizedX,
      startY: 0.92,
      targetY: 0.06 + Math.random() * 0.27,
      durationMs: 1900 + randomSeed * 1100,
      wobbleAmplitude: 0.018 + Math.random() * 0.028,
      wobbleFrequency: 1.4 + Math.random() * 1.9,
      wobblePhase: Math.random() * Math.PI * 2,
      createdAt: performance.now(),
    };
    setAnimalBursts((current) => [...current.slice(-11), burst]);
    setTrackedTimeout(() => {
      setAnimalBursts((current) => current.filter((item) => item.id !== burstId));
    }, burst.durationMs + 460);
  };

  const triggerClip = async (clip: SoundboardClip) => {
    setLastPlayedId(clip.id);
    setStatusMessage(`${mode.statusTemplate(clip)} Key ${midiToLabel(clip.midi)}.`);
    spawnFloatingEffect(clip);
    spawnAnimalBurst(clip);

    if (oneShotPlaybackLockedRef.current) {
      return;
    }

    oneShotPlaybackLockedRef.current = true;
    try {
      const src = resolvePublicAssetUrl(clip.src);
      const durationMs = Math.max(100, (await audioEngine.getOneShotDurationSec(src)) * 1000);
      if (oneShotUnlockTimeoutRef.current !== null) {
        clearTrackedTimeout(oneShotUnlockTimeoutRef.current);
      }
      oneShotUnlockTimeoutRef.current = setTrackedTimeout(() => {
        oneShotPlaybackLockedRef.current = false;
        oneShotUnlockTimeoutRef.current = null;
      }, durationMs);
      await audioEngine.playOneShot(src, clip.gainDb);
    } catch {
      oneShotPlaybackLockedRef.current = false;
      if (oneShotUnlockTimeoutRef.current !== null) {
        clearTrackedTimeout(oneShotUnlockTimeoutRef.current);
        oneShotUnlockTimeoutRef.current = null;
      }
    }
  };

  const isAnimalMode = mode.id === 'animals';
  const isAnimalMapOpen = isAnimalMapPinned || isAnimalMapHovered;
  const isModeSelectorOpen = isModeSelectorPinned || isModeSelectorHovered;
  const stageStatus = lastPlayedId
    ? mode.clips.find((clip) => clip.id === lastPlayedId)?.label ?? 'Ready'
    : 'Ready';
  const lastPlayedClip = lastPlayedId ? mode.clips.find((clip) => clip.id === lastPlayedId) : null;
  const focusAfterClose = (ref: { current: HTMLButtonElement | null }) => {
    window.requestAnimationFrame(() => {
      ref.current?.focus();
    });
  };
  const closeOverlay = (returnFocus = false) => {
    setOverlayVisible(false);
    if (returnFocus) {
      focusAfterClose(menuButtonRef);
    }
  };
  const closeAnimalMap = (returnFocus = false) => {
    if (animalMapHoverCloseTimeoutRef.current !== null) {
      clearTrackedTimeout(animalMapHoverCloseTimeoutRef.current);
      animalMapHoverCloseTimeoutRef.current = null;
    }
    setIsAnimalMapPinned(false);
    setIsAnimalMapHovered(false);
    setOpenClipInfoId(null);
    if (returnFocus) {
      focusAfterClose(animalMapButtonRef);
    }
  };
  const closeModeSelector = (returnFocus = false) => {
    if (modeSelectorHoverCloseTimeoutRef.current !== null) {
      clearTrackedTimeout(modeSelectorHoverCloseTimeoutRef.current);
      modeSelectorHoverCloseTimeoutRef.current = null;
    }
    setIsModeSelectorPinned(false);
    setIsModeSelectorHovered(false);
    setOpenModeInfoId(null);
    if (returnFocus) {
      focusAfterClose(modeSelectorButtonRef);
    }
  };
  const keepAnimalMapOpen = () => {
    if (animalMapHoverCloseTimeoutRef.current !== null) {
      clearTrackedTimeout(animalMapHoverCloseTimeoutRef.current);
      animalMapHoverCloseTimeoutRef.current = null;
    }
    setIsAnimalMapHovered(true);
  };
  const scheduleAnimalMapClose = () => {
    if (animalMapHoverCloseTimeoutRef.current !== null) {
      clearTrackedTimeout(animalMapHoverCloseTimeoutRef.current);
    }
    if (isAnimalMapPinned) {
      return;
    }
    animalMapHoverCloseTimeoutRef.current = setTrackedTimeout(() => {
      setIsAnimalMapHovered(false);
      animalMapHoverCloseTimeoutRef.current = null;
    }, 180);
  };
  const keepModeSelectorOpen = () => {
    if (modeSelectorHoverCloseTimeoutRef.current !== null) {
      clearTrackedTimeout(modeSelectorHoverCloseTimeoutRef.current);
      modeSelectorHoverCloseTimeoutRef.current = null;
    }
    setIsModeSelectorHovered(true);
  };
  const scheduleModeSelectorClose = () => {
    if (modeSelectorHoverCloseTimeoutRef.current !== null) {
      clearTrackedTimeout(modeSelectorHoverCloseTimeoutRef.current);
    }
    if (isModeSelectorPinned) {
      return;
    }
    modeSelectorHoverCloseTimeoutRef.current = setTrackedTimeout(() => {
      setIsModeSelectorHovered(false);
      modeSelectorHoverCloseTimeoutRef.current = null;
    }, 180);
  };
  const resolvedHudNavigationItems = hudNavigationItems.map((item) => ({
    ...item,
    onSelect: () => {
      closeOverlay(false);
      closeAnimalMap(false);
      closeModeSelector(false);
      item.onSelect();
    },
  }));

  useEffect(() => {
    const heldByNote = new Map<number, Set<string>>();

    const shouldHandleEvent = (event: InputEvent): boolean => {
      if (inputMode === 'both') {
        return true;
      }
      if (inputMode === 'midi') {
        return event.source === 'midi';
      }
      return event.source === 'computer-keyboard';
    };

    const handleInputEvent = async (event: InputEvent) => {
      if (!shouldHandleEvent(event) || typeof event.note !== 'number') {
        return;
      }

      const clip = getSoundboardClipForMidi(modeId, event.note);
      if (!clip) {
        return;
      }

      if (event.type === 'noteon') {
        const heldSources = heldByNote.get(event.note) ?? new Set<string>();
        heldSources.add(event.sourceId);
        heldByNote.set(event.note, heldSources);
        setActiveNotes([...heldByNote.keys()].sort((left, right) => left - right));
        if (heldSources.size === 1) {
          await triggerClip(clip);
        }
        return;
      }

      if (event.type === 'noteoff') {
        const heldSources = heldByNote.get(event.note);
        if (!heldSources) {
          return;
        }

        heldSources.delete(event.sourceId);
        if (heldSources.size === 0) {
          heldByNote.delete(event.note);
        }
        setActiveNotes([...heldByNote.keys()].sort((left, right) => left - right));
      }
    };

    const unsubscribeMidi = midiInputService.subscribe((event) => {
      void handleInputEvent(event);
    });
    const unsubscribeKeyboard = keyboardInputService.subscribe((event) => {
      void handleInputEvent(event);
    });
    const unsubscribeKeyboardState = keyboardInputService.subscribeState((state) => {
      setKeyboardOctaveShift(state.octaveShift);
    });

    return () => {
      unsubscribeMidi();
      unsubscribeKeyboard();
      unsubscribeKeyboardState();
      setActiveNotes([]);
    };
  }, [audioEngine, inputMode, keyboardInputService, midiInputService, modeId]);

  return (
    <main
      className={`app-shell soundboard-screen app-shell-immersive animal-soundboard-shell ${isAnimalMode ? 'soundboard-animal-mode' : 'soundboard-regular-mode'}`}
      onPointerDownCapture={() => void audioEngine.prepareForPlayback()}
    >
      <ImmersiveHud
        className={`soundboard-hud ${isAnimalMode ? 'animal-soundboard-hud' : 'regular-soundboard-hud'}`}
        externalHover={isAnimalMapHovered || isModeSelectorHovered}
        currentDestination={hudCurrentDestination}
        navigationItems={resolvedHudNavigationItems}
        stats={
        <div className="immersive-hud-stats">
          <div className="immersive-hud-item">
            <span>Mode</span>
            <strong>
              <span className="soundboard-card-emoji" aria-hidden="true">{isAnimalMode ? '🐾' : '🎛️'}</span>
              {mode.label}
            </strong>
          </div>
          <div className="immersive-hud-item">
            <span>Input</span>
            <strong>{formatInputMode(inputMode)}</strong>
          </div>
          <div className="immersive-hud-item">
            <span>Keyboard</span>
            <strong>{keyboardOctaveShift >= 0 ? `+${keyboardOctaveShift}` : keyboardOctaveShift}</strong>
          </div>
          <div className="immersive-hud-item">
            <span>Status</span>
            <strong>
              {lastPlayedClip?.emoji ? (
                <span className="soundboard-card-emoji" aria-hidden="true">{lastPlayedClip.emoji}</span>
              ) : null}
              {stageStatus}
            </strong>
          </div>
        </div>
        }
        actions={
        <div className="animal-soundboard-hud-actions">
          <button
            className="immersive-menu-btn soundboard-map-toggle"
            ref={animalMapButtonRef}
            aria-label={isAnimalMode ? 'Show animal key map' : 'Show sound key map'}
            aria-controls="soundboard-key-map-popout"
            aria-expanded={isAnimalMapOpen}
            onClick={() => {
              if (isAnimalMapPinned) {
                closeAnimalMap(true);
                return;
              }
              setIsAnimalMapPinned(true);
              setIsAnimalMapHovered(false);
            }}
             onMouseEnter={keepAnimalMapOpen}
             onMouseLeave={scheduleAnimalMapClose}
             onFocus={keepAnimalMapOpen}
             onBlur={scheduleAnimalMapClose}
          >
            <KeyboardMusic size={17} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <div
            className="immersive-control-wrap soundboard-mode-control"
             onMouseEnter={keepModeSelectorOpen}
             onMouseLeave={scheduleModeSelectorClose}
          >
            <button
              className="immersive-menu-btn soundboard-mode-toggle"
              ref={modeSelectorButtonRef}
              aria-label="Show soundboard mode controls"
              aria-controls="soundboard-mode-popout"
              aria-expanded={isModeSelectorOpen}
              onClick={() => {
                if (isModeSelectorPinned) {
                  closeModeSelector(true);
                  return;
                }
                setIsModeSelectorPinned(true);
                setIsModeSelectorHovered(false);
              }}
               onFocus={keepModeSelectorOpen}
               onBlur={scheduleModeSelectorClose}
            >
              {mode.label}
            </button>
          </div>
          <button
            className="immersive-menu-btn"
            ref={menuButtonRef}
            aria-controls="soundboard-overlay-panel"
            aria-expanded={overlayVisible}
            onClick={() => setOverlayVisible(true)}
          >
            Menu
          </button>
        </div>
        }
      />

      <div
        className="immersive-canvas-area animal-soundboard-stage"
        onMouseLeave={() => {
          scheduleAnimalMapClose();
          scheduleModeSelectorClose();
        }}
      >
        <AnimalSoundboardCanvas clips={mode.clips} activeNotes={activeNotes} recentBursts={animalBursts} />

        <section
          ref={animalMapPopoutRef}
          className={`panel animal-soundboard-map-popout soundboard-key-map-popout${isAnimalMapOpen ? ' open' : ''}`}
          id="soundboard-key-map-popout"
          aria-label={isAnimalMode ? 'Animal key map' : 'Sound key map'}
          aria-hidden={!isAnimalMapOpen}
          {...inertWhenClosed(isAnimalMapOpen)}
          data-testid="animal-key-map-popout"
           onMouseEnter={keepAnimalMapOpen}
           onMouseLeave={scheduleAnimalMapClose}
        >
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{isAnimalMode ? 'Animal Key Map' : 'Sound Key Map'}</p>
              <h2>{isAnimalMode ? 'Tap any animal' : 'Tap any sound'}</h2>
            </div>
            <p className="panel-copy">{mode.copy}</p>
          </div>
          <div className="soundboard-grid">
            {mode.clips.map((clip) => (
              <div
                key={`${mode.id}-${clip.id}`}
                className={`panel soundboard-clip-card soundboard-key-map-card${lastPlayedId === clip.id ? ' active' : ''}`}
                title={`${clip.label} (${midiToLabel(clip.midi)})`}
              >
                <button
                  className="soundboard-key-map-card-select"
                  onClick={() => void triggerClip(clip)}
                  type="button"
                >
                  <span className="soundboard-card-emoji" aria-hidden="true">{clip.emoji ?? clip.shortLabel}</span>
                  <strong>{clip.label}</strong>
                  <span className="soundboard-shortcut">{midiToLabel(clip.midi)}</span>
                </button>
                <span className="card-info-control soundboard-card-info-control">
                  <span
                    className={`card-info-popover${openClipInfoId === clip.id ? ' open' : ''}`}
                    role="status"
                  >
                    {clip.description ?? `${clip.category} · ${clip.source}`}
                  </span>
                  <button
                    className="card-info-button"
                    aria-label={`${clip.label} info`}
                    aria-pressed={openClipInfoId === clip.id}
                    title={clip.description ?? `${clip.category} · ${clip.source}`}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenClipInfoId((current) => (current === clip.id ? null : clip.id));
                    }}
                  >
                    <Info size={13} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section
          ref={modeSelectorPopoutRef}
          className={`panel soundboard-mode-popout${isModeSelectorOpen ? ' open' : ''}`}
          id="soundboard-mode-popout"
          aria-label="Soundboard mode controls"
          aria-hidden={!isModeSelectorOpen}
          {...inertWhenClosed(isModeSelectorOpen)}
          data-testid="soundboard-mode-popout"
           onMouseEnter={keepModeSelectorOpen}
           onMouseLeave={scheduleModeSelectorClose}
        >
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Soundboard Mode</p>
              <h2>{mode.label}</h2>
            </div>
            <p className="panel-copy">{mode.description}</p>
          </div>
          <div className="free-play-mode-grid">
            {SOUNDBOARD_MODES.map((candidateMode) => (
              <div
                key={candidateMode.id}
                className={`free-play-mode-card soundboard-mode-option${candidateMode.id === modeId ? ' active' : ''}`}
              >
                <button
                  className="free-play-mode-card-select"
                  onClick={() => {
                    setModeId(candidateMode.id);
                    closeModeSelector(true);
                  }}
                  type="button"
                >
                  {candidateMode.label}
                </button>
                <span className="card-info-control">
                  <span
                    className={`card-info-popover${openModeInfoId === candidateMode.id ? ' open' : ''}`}
                    role="status"
                  >
                    {candidateMode.description}
                  </span>
                  <button
                    className="card-info-button"
                    aria-label={`${candidateMode.label} info`}
                    aria-pressed={openModeInfoId === candidateMode.id}
                    title={candidateMode.description}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenModeInfoId((current) => (current === candidateMode.id ? null : candidateMode.id));
                    }}
                  >
                    <Info size={13} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="immersive-keyboard animal-soundboard-keyboard">
        <PianoKeyboard
          activeNotes={activeNotes}
          upcomingNotes={[]}
          highlightedNotes={highlightedNotes}
          highlightColor="chord"
          size={keyboardOverlaySize}
          keyLabels={keyLabels}
          heading={isAnimalMode ? 'Animal keys and pop-up sprites' : 'Mapped novelty triggers'}
          copy={mode.copy}
          minMidi={SOUNDBOARD_MIN_MIDI}
          maxMidi={SOUNDBOARD_MAX_MIDI}
          overlayEffects={floatingEffects}
        />
      </div>

      {overlayVisible && (
        <div
          className="immersive-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeOverlay(true);
            }
          }}
        >
          <div
            ref={overlayRef}
            className="immersive-overlay-panel soundboard-overlay-panel"
            id="soundboard-overlay-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="soundboard-overlay-title"
          >
            <div className="immersive-overlay-header">
              <h2 id="soundboard-overlay-title">{mode.label} Soundboard</h2>
              <div className="immersive-overlay-actions">
                <button className="primary-button" onClick={() => closeOverlay(true)}>
                  Resume
                </button>
                <button className="secondary-button" onClick={onBackToMainMenu}>
                  Back to Main Menu
                </button>
              </div>
            </div>

            <section className="status-strip">
              <div className="status-card">
                <span>Mode</span>
                <strong>{mode.label}</strong>
              </div>
              <div className="status-card">
                <span>Input Mode</span>
                <strong>{formatInputMode(inputMode)}</strong>
              </div>
              <div className="status-card">
                <span>Keyboard Octave</span>
                <strong>{keyboardOctaveShift >= 0 ? `+${keyboardOctaveShift}` : keyboardOctaveShift}</strong>
              </div>
              <div className="status-card">
                <span>Mapped Sounds</span>
                <strong>{mode.clips.length}</strong>
              </div>
              <div className="status-card wide">
                <span>Status</span>
                <strong>{statusMessage}</strong>
              </div>
            </section>

            <section className="panel soundboard-overlay-section">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Soundboard Modes</p>
                  <h2>Choose your stage</h2>
                </div>
                <p className="panel-copy">Switch modes without leaving the immersive soundboard.</p>
              </div>
              <div className="soundboard-mode-grid soundboard-overlay-mode-grid">
                {SOUNDBOARD_MODES.map((candidateMode) => (
                  <button
                    key={candidateMode.id}
                    className={`panel soundboard-mode-card${candidateMode.id === modeId ? ' active' : ''}`}
                    onClick={() => setModeId(candidateMode.id)}
                  >
                    <strong>{candidateMode.label}</strong>
                    <span>{candidateMode.description}</span>
                    <em>{candidateMode.clipSourceLabel}</em>
                  </button>
                ))}
              </div>
            </section>

            <section className="panel soundboard-overlay-section">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Soundboard Controls</p>
                  <h2>Keep the keyboard live</h2>
                </div>
              </div>
              <div className="transport-buttons">
                <button className="secondary-button" onClick={onOpenKeyboardSetup}>
                  Keyboard Setup
                </button>
                <button className={showCredits ? 'primary-button' : 'secondary-button'} onClick={() => setShowCredits((current) => !current)}>
                  {showCredits ? 'Hide Credits' : 'Show Credits'}
                </button>
              </div>
            </section>

            <section className="panel soundboard-overlay-section">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">{isAnimalMode ? 'Animal Key Map' : 'Soundboard Grid'}</p>
                  <h2>{isAnimalMode ? 'Tap any animal' : 'Tap any sound'}</h2>
                </div>
                <p className="panel-copy">{mode.copy}</p>
              </div>
              <div className="soundboard-grid soundboard-overlay-grid">
                {mode.clips.map((clip) => (
                  <button
                    key={`${mode.id}-${clip.id}`}
                    className={`panel soundboard-clip-card${lastPlayedId === clip.id ? ' active' : ''}`}
                    onClick={() => void triggerClip(clip)}
                    title={`${clip.label} (${midiToLabel(clip.midi)})`}
                  >
                    <span className="soundboard-shortcut">{midiToLabel(clip.midi)}</span>
                    <strong>{clip.emoji ? `${clip.emoji} ${clip.label}` : clip.label}</strong>
                    <span>{clip.category}</span>
                    <em>{clip.source}</em>
                  </button>
                ))}
              </div>
            </section>

            {showCredits ? (
              <section className="panel soundboard-overlay-section soundboard-credits-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Credits</p>
                    <h2>{mode.creditsHeading}</h2>
                  </div>
                  <p className="panel-copy">{mode.clipSourceLabel}</p>
                </div>
                <div className="soundboard-credits-list">
                  {mode.clips.map((clip) => (
                    <article key={`${mode.id}-${clip.id}`} className="soundboard-credit-item">
                      <strong>{clip.emoji ? `${clip.emoji} ${clip.label}` : clip.label}</strong>
                      <span>{clip.attribution ?? clip.source}</span>
                      {clip.sourcePage ? (
                        <a href={clip.sourcePage} target="_blank" rel="noreferrer">
                          {clip.sourceTitle ?? clip.source}
                        </a>
                      ) : (
                        <em>{clip.sourceTitle ?? clip.source}</em>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      )}
    </main>
  );
}
