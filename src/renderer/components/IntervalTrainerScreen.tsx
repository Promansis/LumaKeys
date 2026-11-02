import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from '../../lib/audio/audioEngine';
import { EASY_INTERVALS, HARD_INTERVALS, MEDIUM_INTERVALS } from '../../lib/theory/intervals';
import { shuffle } from '../../lib/theory/shuffle';
import { useTimeoutRegistry } from '../useTimeoutRegistry';

interface IntervalTrainerScreenProps {
  audioEngine: AudioEngine;
  onAchievementsUnlocked?: (achievementIds: string[]) => void;
  onSessionComplete?: (payload: { accuracy: number; score: number; totalQuestions: number }) => void;
  onBack?: () => void;
  preset?: { difficulty: string };
}

type IntervalDifficulty = 'easy' | 'medium' | 'hard';

interface TrainerQuestion {
  correctLabel: string;
  choices: string[];
  semitones: number;
  baseMidi: number;
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function buildQuestion(difficulty: IntervalDifficulty): TrainerQuestion {
  const pool = difficulty === 'easy' ? EASY_INTERVALS : difficulty === 'medium' ? MEDIUM_INTERVALS : HARD_INTERVALS;
  const selected = pickRandom(pool);
  const answerPool = pool.map((entry) => entry.label);
  const incorrectChoices = shuffle(answerPool.filter((label) => label !== selected.label)).slice(0, difficulty === 'easy' ? 3 : 5);

  return {
    correctLabel: selected.label,
    choices: shuffle([selected.label, ...incorrectChoices]),
    semitones: selected.semitones,
    baseMidi: 48 + Math.floor(Math.random() * 25),
  };
}

export function IntervalTrainerScreen({
  audioEngine,
  onAchievementsUnlocked,
  onSessionComplete,
  onBack,
  preset,
}: IntervalTrainerScreenProps) {
  const { setTrackedTimeout, clearAllTimeouts } = useTimeoutRegistry();
  const [difficulty, setDifficulty] = useState<IntervalDifficulty>((preset?.difficulty as IntervalDifficulty) || 'easy');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [history, setHistory] = useState<Array<{ question: string; correct: boolean }>>([]);
  const [feedback, setFeedback] = useState<string>('Start a session to hear the first interval.');
  const [currentQuestion, setCurrentQuestion] = useState<TrainerQuestion>(() => buildQuestion('easy'));
  const savedSessionRef = useRef(false);

  const totalQuestions = 10;
  const sessionComplete = questionIndex >= totalQuestions;
  const accuracy = useMemo(() => (questionIndex === 0 ? 0 : (score / questionIndex) * 100), [questionIndex, score]);

  useEffect(() => {
    clearAllTimeouts();
    audioEngine.allNotesOff();
    setCurrentQuestion(buildQuestion(difficulty));
    setQuestionIndex(0);
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setHistory([]);
    setSessionActive(false);
    savedSessionRef.current = false;
  }, [audioEngine, clearAllTimeouts, difficulty]);

  useEffect(() => {
    return () => {
      audioEngine.allNotesOff();
    };
  }, [audioEngine]);

  const playInterval = async (question: TrainerQuestion) => {
    await audioEngine.init();
    await audioEngine.noteOn(question.baseMidi, 0.75);
    setTrackedTimeout(() => {
      audioEngine.noteOff(question.baseMidi);
      void audioEngine.noteOn(question.baseMidi + question.semitones, 0.8);
      setTrackedTimeout(() => {
        audioEngine.noteOff(question.baseMidi + question.semitones);
      }, 400);
    }, 400);
  };

  useEffect(() => {
    if (!sessionActive || sessionComplete) {
      return;
    }
    void playInterval(currentQuestion);
  }, [currentQuestion, sessionActive, sessionComplete]);

  useEffect(() => {
    if (!sessionComplete || savedSessionRef.current) {
      return;
    }

    savedSessionRef.current = true;
    const finalAccuracy = (score / totalQuestions) * 100;
    onSessionComplete?.({
      accuracy: finalAccuracy,
      score,
      totalQuestions,
    });
    void window.appBridge
      ?.saveTheoryResult({
        type: 'interval-trainer',
        score,
        totalQuestions,
        accuracy: finalAccuracy,
        details: {
          difficulty,
          maxStreak,
          history,
        },
      })
      .then((outcome) => {
        onAchievementsUnlocked?.(outcome?.unlockedAchievementIds ?? []);
      });
  }, [difficulty, history, maxStreak, onAchievementsUnlocked, onSessionComplete, score, sessionComplete]);

  const handleAnswer = (choice: string) => {
    if (!sessionActive || sessionComplete) {
      return;
    }

    const isCorrect = choice === currentQuestion.correctLabel;
    const nextStreak = isCorrect ? streak + 1 : 0;
    setFeedback(isCorrect ? 'Correct.' : `Incorrect. Answer: ${currentQuestion.correctLabel}.`);
    setScore((current) => current + (isCorrect ? 1 : 0));
    setStreak(nextStreak);
    setMaxStreak((current) => Math.max(current, nextStreak));
    setHistory((current) => [...current, { question: currentQuestion.correctLabel, correct: isCorrect }]);
    setQuestionIndex((current) => current + 1);

    if (questionIndex + 1 < totalQuestions) {
      setTrackedTimeout(() => {
        setCurrentQuestion(buildQuestion(difficulty));
      }, 500);
    }
  };

  return (
    <main className="app-shell theory-practice-screen" onPointerDownCapture={() => void audioEngine.prepareForPlayback()}>
      <section className="panel theory-screen-hero">
        <div>
          <p className="eyebrow">Interval Trainer</p>
          <h1>{sessionComplete ? 'Session complete' : 'Hear and identify the interval'}</h1>
          <p className="song-title">{feedback}</p>
        </div>
        <div className="transport-buttons">
          {onBack && (
            <button className="secondary-button" onClick={onBack}>
              ← Back
            </button>
          )}
          <button
            className="primary-button"
            onClick={() => {
              setSessionActive(true);
              setQuestionIndex(0);
              setScore(0);
              setStreak(0);
              setMaxStreak(0);
              setHistory([]);
              savedSessionRef.current = false;
              const nextQuestion = buildQuestion(difficulty);
              setCurrentQuestion(nextQuestion);
              setFeedback('Listen closely, then choose the interval.');
              void playInterval(nextQuestion);
            }}
          >
            Start Session
          </button>
          {sessionActive && !sessionComplete ? (
            <button className="secondary-button" onClick={() => void playInterval(currentQuestion)}>
              Replay
            </button>
          ) : null}
        </div>
      </section>

      <section className="panel theory-settings-panel">
        <label>
          <span>Difficulty</span>
          <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as IntervalDifficulty)}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
      </section>

      <section className="status-strip">
        <div className="status-card">
          <span>Question</span>
          <strong>{Math.min(questionIndex + (sessionComplete ? 0 : 1), totalQuestions)} / {totalQuestions}</strong>
        </div>
        <div className="status-card">
          <span>Score</span>
          <strong>{score}</strong>
        </div>
        <div className="status-card">
          <span>Streak</span>
          <strong>{streak}</strong>
        </div>
        <div className="status-card">
          <span>Accuracy</span>
          <strong>{accuracy.toFixed(1)}%</strong>
        </div>
      </section>

      <section className="panel theory-question-panel">
        {sessionComplete ? (
          <div className="theory-summary">
            <h2>Summary</h2>
            <p className="panel-copy">Score {score} / {totalQuestions}. Max streak {maxStreak}.</p>
          </div>
        ) : (
          <div className="theory-choice-grid">
            {currentQuestion.choices.map((choice) => (
              <button key={choice} className="secondary-button theory-choice-button" onClick={() => handleAnswer(choice)}>
                {choice}
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
