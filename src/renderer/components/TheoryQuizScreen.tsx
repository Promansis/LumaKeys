import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from '../../lib/audio/audioEngine';
import { CHORD_TEMPLATES, detectChord, PITCH_CLASS_NAMES } from '../../lib/theory/chords';
import { ALL_INTERVALS } from '../../lib/theory/intervals';
import { buildScale, SCALE_DEFINITIONS } from '../../lib/theory/scales';
import { shuffle } from '../../lib/theory/shuffle';
import { useTimeoutRegistry } from '../useTimeoutRegistry';

interface TheoryQuizScreenProps {
  audioEngine: AudioEngine;
  onAchievementsUnlocked?: (achievementIds: string[]) => void;
  onSessionComplete?: (payload: { accuracy: number; score: number; totalQuestions: number }) => void;
  onBack?: () => void;
  preset?: { quizType: string };
}

type QuizType = 'chord' | 'scale' | 'interval' | 'mixed' | 'note-reading';

const LINE_SPACING = 18;
const BOTTOM_LINE_Y = 72;
const NOTE_X = 130;
const STAFF_LEFT = 55;
const STAFF_RIGHT = 175;

interface StaffNote {
  name: string;
  step: number;
  ledgerLines: number[];
}

const STAFF_NOTES: StaffNote[] = [
  { name: 'C4', step: -2, ledgerLines: [BOTTOM_LINE_Y + LINE_SPACING] },
  { name: 'D4', step: -1, ledgerLines: [BOTTOM_LINE_Y + LINE_SPACING] },
  { name: 'E4', step: 0, ledgerLines: [] },
  { name: 'F4', step: 1, ledgerLines: [] },
  { name: 'G4', step: 2, ledgerLines: [] },
  { name: 'A4', step: 3, ledgerLines: [] },
  { name: 'B4', step: 4, ledgerLines: [] },
  { name: 'C5', step: 5, ledgerLines: [] },
  { name: 'D5', step: 6, ledgerLines: [] },
  { name: 'E5', step: 7, ledgerLines: [] },
  { name: 'F5', step: 8, ledgerLines: [] },
];

function NoteStaff({ staffNote }: { staffNote: StaffNote }) {
  const noteY = BOTTOM_LINE_Y - staffNote.step * (LINE_SPACING / 2);
  const staffLineYs = [0, 2, 4, 6, 8].map((step) => BOTTOM_LINE_Y - step * (LINE_SPACING / 2));

  return (
    <svg className="note-staff-svg" width={190} height={130} viewBox="0 0 190 130" aria-label="Note on staff">
      <text x={14} y={84} fontSize={68} fontFamily="serif" fill="currentColor" aria-hidden="true">
        {'\u{1D11E}'}
      </text>
      {staffLineYs.map((y) => (
        <line key={y} x1={STAFF_LEFT} y1={y} x2={STAFF_RIGHT} y2={y} stroke="currentColor" strokeWidth={1.5} />
      ))}
      {staffNote.ledgerLines.map((y) => (
        <line key={y} x1={NOTE_X - 14} y1={y} x2={NOTE_X + 14} y2={y} stroke="currentColor" strokeWidth={1.5} />
      ))}
      <ellipse cx={NOTE_X} cy={noteY} rx={8} ry={5.5} fill="currentColor" transform={`rotate(-15, ${NOTE_X}, ${noteY})`} />
      {staffNote.step < 5 ? (
        <line x1={NOTE_X + 7} y1={noteY} x2={NOTE_X + 7} y2={noteY - 36} stroke="currentColor" strokeWidth={1.5} />
      ) : (
        <line x1={NOTE_X - 7} y1={noteY} x2={NOTE_X - 7} y2={noteY + 36} stroke="currentColor" strokeWidth={1.5} />
      )}
    </svg>
  );
}

interface QuizQuestion {
  prompt: string;
  choices: string[];
  answer: string;
  play: () => void;
  staffNote?: StaffNote;
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function TheoryQuizScreen({ audioEngine, onAchievementsUnlocked, onSessionComplete, onBack, preset }: TheoryQuizScreenProps) {
  const { setTrackedTimeout, clearAllTimeouts } = useTimeoutRegistry();
  const savedQuizRef = useRef(false);
  const [quizType, setQuizType] = useState<QuizType>((preset?.quizType as QuizType) || 'chord');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);

  const buildNoteReadingQuestion = (): QuizQuestion & { staffNote: StaffNote } => {
    const note = pickRandom(STAFF_NOTES);
    const otherNames = shuffle(STAFF_NOTES.filter((entry) => entry.name !== note.name).map((entry) => entry.name)).slice(0, 3);
    return {
      prompt: 'Name this note',
      answer: note.name,
      choices: shuffle([note.name, ...otherNames]),
      play: () => {
        const midiMap: Record<string, number> = {
          C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71,
          C5: 72, D5: 74, E5: 76, F5: 77,
        };
        const midi = midiMap[note.name];
        if (midi !== undefined) {
          void audioEngine.init().then(async () => {
            await audioEngine.noteOn(midi, 0.8);
            setTrackedTimeout(() => audioEngine.noteOff(midi), 600);
          });
        }
      },
      staffNote: note,
    };
  };

  const buildQuestion = (type: QuizType): QuizQuestion => {
    if (type === 'mixed') {
      const nextType = pickRandom<QuizType>(['chord', 'scale', 'interval', 'note-reading']);
      return buildQuestion(nextType);
    }

    if (type === 'note-reading') {
      return buildNoteReadingQuestion();
    }

    if (type === 'interval') {
      const interval = pickRandom(ALL_INTERVALS);
      const baseMidi = 55 + Math.floor(Math.random() * 15);
      return {
        prompt: 'Identify the interval',
        answer: interval.label,
        choices: shuffle([
          interval.label,
          ...shuffle(ALL_INTERVALS.filter((entry) => entry.label !== interval.label).map((entry) => entry.label)).slice(0, 3),
        ]),
        play: () => {
          void audioEngine.init().then(async () => {
            await audioEngine.noteOn(baseMidi, 0.8);
            setTrackedTimeout(() => {
              audioEngine.noteOff(baseMidi);
              void audioEngine.noteOn(baseMidi + interval.semitones, 0.8);
              setTrackedTimeout(() => audioEngine.noteOff(baseMidi + interval.semitones), 350);
            }, 350);
          });
        },
      };
    }

    if (type === 'scale') {
      const definition = pickRandom(SCALE_DEFINITIONS.filter((entry) => entry.name !== 'Chromatic'));
      const root = Math.floor(Math.random() * 12);
      const scale = buildScale(root, definition, 1, 4);
      return {
        prompt: 'Identify the scale',
        answer: definition.name,
        choices: shuffle([
          definition.name,
          ...shuffle(SCALE_DEFINITIONS.filter((entry) => entry.name !== definition.name).map((entry) => entry.name)).slice(0, 3),
        ]),
        play: () => {
          void audioEngine.init().then(() => {
            scale.midiNotes.slice(0, -1).forEach((midi, index) => {
              setTrackedTimeout(() => {
                void audioEngine.noteOn(midi, 0.75);
                setTrackedTimeout(() => audioEngine.noteOff(midi), 220);
              }, index * 250);
            });
          });
        },
      };
    }

    const template = pickRandom(CHORD_TEMPLATES);
    const root = Math.floor(Math.random() * 12);
    const notes = template.intervals.map((interval) => 60 + root + interval);
    const label = detectChord(notes)?.label ?? `${PITCH_CLASS_NAMES[root]}${template.quality}`;
    return {
      prompt: 'Identify the chord',
      answer: label,
      choices: shuffle([
        label,
        ...shuffle(
          CHORD_TEMPLATES
            .map((entry) => `${PITCH_CLASS_NAMES[root]}${entry.quality}`)
            .filter((entry) => entry !== label),
        ).slice(0, 3),
      ]),
      play: () => {
        void audioEngine.init().then(() => {
          notes.forEach((midi) => void audioEngine.noteOn(midi, 0.75));
          setTrackedTimeout(() => notes.forEach((midi) => audioEngine.noteOff(midi)), 650);
        });
      },
    };
  };

  const startQuiz = (type: QuizType) => {
    clearAllTimeouts();
    audioEngine.allNotesOff();
    const nextQuestions = Array.from({ length: 10 }, () => buildQuestion(type));
    setQuizType(type);
    setQuestions(nextQuestions);
    setCurrentIndex(0);
    setAnswers([]);
    setIsComplete(false);
    savedQuizRef.current = false;
    nextQuestions[0]?.play();
  };

  useEffect(() => {
    return () => {
      audioEngine.allNotesOff();
    };
  }, [audioEngine]);

  useEffect(() => {
    if (preset?.quizType) {
      startQuiz((preset.quizType as QuizType) || 'chord');
    }
  }, [preset?.quizType]);

  const score = useMemo(
    () => answers.filter((answer, index) => answer === questions[index]?.answer).length,
    [answers, questions],
  );
  const accuracy = useMemo(
    () => (questions.length === 0 ? 0 : (score / questions.length) * 100),
    [questions.length, score],
  );

  useEffect(() => {
    if (!isComplete || questions.length === 0 || savedQuizRef.current) {
      return;
    }

    savedQuizRef.current = true;
    onSessionComplete?.({
      accuracy,
      score,
      totalQuestions: questions.length,
    });
    void window.appBridge
      ?.saveTheoryResult({
        type: 'quiz',
        score,
        totalQuestions: questions.length,
        accuracy,
        details: { quizType, answers },
      })
      .then((outcome) => {
        onAchievementsUnlocked?.(outcome?.unlockedAchievementIds ?? []);
      });
  }, [accuracy, answers, isComplete, onAchievementsUnlocked, onSessionComplete, questions, quizType, score]);

  const currentQuestion = questions[currentIndex];

  return (
    <main className="app-shell theory-practice-screen" onPointerDownCapture={() => void audioEngine.prepareForPlayback()}>
      <section className="panel theory-screen-hero">
        <div>
          <p className="eyebrow">Theory Quiz</p>
          <h1>{isComplete ? 'Quiz review' : 'Ten-question theory check'}</h1>
          <p className="song-title">Chord, scale, interval, and note-reading identification in a short scored session.</p>
        </div>
        <div className="transport-buttons">
          {onBack && (
            <button className="secondary-button" onClick={onBack}>
              ← Back
            </button>
          )}
          {currentQuestion && !isComplete ? (
            <button className="secondary-button" onClick={() => currentQuestion.play()}>
              Replay Audio
            </button>
          ) : null}
        </div>
      </section>

      {questions.length === 0 && !isComplete ? (
        <section className="panel theory-type-select">
          <button className="primary-button" onClick={() => startQuiz('chord')}>
            Chord ID
          </button>
          <button className="primary-button" onClick={() => startQuiz('scale')}>
            Scale ID
          </button>
          <button className="primary-button" onClick={() => startQuiz('interval')}>
            Interval ID
          </button>
          <button className="primary-button" onClick={() => startQuiz('mixed')}>
            Mixed Checkpoint
          </button>
        </section>
      ) : null}

      {currentQuestion && !isComplete ? (
        <section className="panel theory-question-panel">
          <p className="eyebrow">Question {currentIndex + 1} / {questions.length}</p>
          <h2>{currentQuestion.prompt}</h2>
          {currentQuestion.staffNote ? (
            <div className="note-staff-container">
              <NoteStaff staffNote={currentQuestion.staffNote} />
            </div>
          ) : null}
          <div className="theory-choice-grid">
            {currentQuestion.choices.map((choice) => (
              <button
                key={choice}
                className="secondary-button theory-choice-button"
                onClick={() => {
                  const nextAnswers = [...answers, choice];
                  setAnswers(nextAnswers);
                  if (currentIndex + 1 >= questions.length) {
                    setIsComplete(true);
                    return;
                  }
                  setCurrentIndex((current) => current + 1);
                  setTrackedTimeout(() => questions[currentIndex + 1]?.play(), 300);
                }}
              >
                {choice}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {isComplete ? (
        <section className="panel theory-review-panel">
          <h2>Review</h2>
          <p className="panel-copy">Score {score} / {questions.length}. Accuracy {accuracy.toFixed(1)}%.</p>
          <ul className="theory-review-list">
            {questions.map((question, index) => {
              const correct = answers[index] === question.answer;
              return (
                <li key={`${question.prompt}-${index}`} className={correct ? 'review-correct' : 'review-incorrect'}>
                  <span>{question.prompt}</span>
                  <strong>{correct ? 'Correct' : `Correct answer: ${question.answer}`}</strong>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
