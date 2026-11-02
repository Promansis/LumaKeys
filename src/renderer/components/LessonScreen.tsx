import { useEffect, useMemo, useState } from 'react';
import type { Lesson, LearningProgress, LearningTier } from '../../lib/learning/types';
import {
  getFirstIncompleteStepIndex,
  getNextLesson,
  isLessonCompleted,
  isLessonStepCompleted,
} from '../../lib/learning/learningProgress';
import { LessonDiagram } from './LessonDiagram';
import { NotationReadingExercise } from './NotationReadingExercise';

interface LessonScreenProps {
  lesson: Lesson;
  tier: LearningTier;
  curriculum: LearningTier[];
  progress: LearningProgress;
  initialStepIndex?: number;
  /** The last try at a step that missed its pass mark, shown on that step. */
  lastAttempt?: { stepIndex: number; accuracy: number; target: number } | null;
  onBack: () => void;
  onOpenLesson: (lessonId: string) => void;
  onStartDrill: (lessonId: string, stepIndex: number) => void;
  onStartScale: (lessonId: string, stepIndex: number, preset: { root: number; scaleName: string }) => void;
  onStartInterval: (lessonId: string, stepIndex: number, preset: { difficulty: 'easy' | 'medium' | 'hard' }) => void;
  onStartQuiz: (lessonId: string, stepIndex: number, preset: { quizType: 'chord' | 'scale' | 'interval' | 'mixed' }) => void;
  onCompleteStep: (lessonId: string, stepIndex: number) => void;
  onCompleteLesson: (lessonId: string) => void;
}

function splitParagraphs(body?: string): string[] {
  if (!body) {
    return [];
  }
  return body.split(/\n\n+/).map((part) => part.trim()).filter(Boolean);
}

export function LessonScreen({
  lesson,
  tier,
  curriculum,
  progress,
  initialStepIndex,
  lastAttempt,
  onBack,
  onOpenLesson,
  onStartDrill,
  onStartScale,
  onStartInterval,
  onStartQuiz,
  onCompleteStep,
  onCompleteLesson,
}: LessonScreenProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(initialStepIndex ?? getFirstIncompleteStepIndex(lesson, progress));

  useEffect(() => {
    const nextIndex = typeof initialStepIndex === 'number'
      ? Math.max(0, Math.min(initialStepIndex, Math.max(0, lesson.steps.length - 1)))
      : getFirstIncompleteStepIndex(lesson, progress);
    setCurrentStepIndex(nextIndex);
  }, [initialStepIndex, lesson, progress]);

  const step = lesson.steps[currentStepIndex];
  const completedStepIndexes = progress.completedSteps[lesson.id] ?? [];
  const lessonCompleted = isLessonCompleted(progress, lesson.id);
  const stepCompleted = isLessonStepCompleted(progress, lesson.id, currentStepIndex);
  const allStepsCompleted = lesson.steps.every((_entry, index) => isLessonStepCompleted(progress, lesson.id, index));
  const nextLesson = useMemo(() => {
    const lessonCandidate = getNextLesson(curriculum, lesson.id);
    return lessonCandidate && !lessonCandidate.isStub ? lessonCandidate : null;
  }, [curriculum, lesson.id]);

  if (!step) {
    return (
      <main className="app-shell lesson-screen">
        <section className="panel lesson-empty-state">
          <p className="eyebrow">Lesson</p>
          <h1>{lesson.title}</h1>
          <p className="panel-copy">This lesson is marked as coming soon.</p>
          <button className="secondary-button" onClick={onBack}>Back to Learn</button>
        </section>
      </main>
    );
  }

  const paragraphs = splitParagraphs(step.body);
  const isFinalStep = currentStepIndex === lesson.steps.length - 1;

  const handleMarkTipAndAdvance = () => {
    onCompleteStep(lesson.id, currentStepIndex);
    if (!isFinalStep) {
      setCurrentStepIndex((current) => Math.min(current + 1, lesson.steps.length - 1));
    }
  };

  return (
    <main className="app-shell lesson-screen">
      <section className="panel lesson-screen-hero">
        <div>
          <p className="eyebrow">{tier.title} Tier</p>
          <h1>{lesson.title}</h1>
          <p className="song-title">{lesson.summary}</p>
        </div>
        <div className="lesson-hero-meta">
          <strong>{lesson.estMinutes} min</strong>
          <span>{completedStepIndexes.length} / {lesson.steps.length} steps</span>
        </div>
      </section>

      <section className="lesson-layout">
        <aside className="panel lesson-stepper">
          <p className="eyebrow">Lesson Steps</p>
          <div className="lesson-step-list">
            {lesson.steps.map((entry, index) => {
              const completed = isLessonStepCompleted(progress, lesson.id, index);
              return (
                <button
                  key={`${lesson.id}-step-${index}`}
                  className={`lesson-step-button ${index === currentStepIndex ? 'active' : ''} ${completed ? 'completed' : ''}`}
                  onClick={() => setCurrentStepIndex(index)}
                >
                  <span>{index + 1}</span>
                  <strong>{entry.title}</strong>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="panel lesson-step-card">
          <div className="lesson-step-header">
            <div>
              <p className="eyebrow">Step {currentStepIndex + 1} of {lesson.steps.length}</p>
              <h2>{step.title}</h2>
            </div>
            <div className={`lesson-step-badge ${stepCompleted ? 'completed' : ''}`}>
              {stepCompleted ? 'Completed' : 'In Progress'}
            </div>
          </div>

          {paragraphs.length > 0 ? (
            <div className="lesson-step-copy">
              {paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          ) : null}

          {'diagram' in step && step.diagram ? <LessonDiagram diagram={step.diagram} /> : null}

          <div className="lesson-step-actions">
            {step.kind === 'tip' ? (
              <button className="primary-button" onClick={handleMarkTipAndAdvance}>
                {isFinalStep ? 'Mark Tip Complete' : stepCompleted ? 'Next Step' : 'Complete Tip'}
              </button>
            ) : null}

            {step.kind === 'drill' ? (
              <button className="primary-button" onClick={() => onStartDrill(lesson.id, currentStepIndex)}>
                Start Drill
              </button>
            ) : null}

            {step.kind === 'scale' ? (
              <button
                className="primary-button"
                onClick={() => onStartScale(lesson.id, currentStepIndex, { root: step.root, scaleName: step.scaleName })}
              >
                Start Scale Drill
              </button>
            ) : null}

            {step.kind === 'interval' ? (
              <button
                className="primary-button"
                onClick={() => onStartInterval(lesson.id, currentStepIndex, { difficulty: step.difficulty })}
              >
                Start Interval Trainer
              </button>
            ) : null}

            {step.kind === 'quiz' ? (
              <button
                className="primary-button"
                onClick={() => onStartQuiz(lesson.id, currentStepIndex, { quizType: step.quizType })}
              >
                Start Quiz
              </button>
            ) : null}

            {step.kind === 'notation-reading' ? (
              <NotationReadingExercise
                step={step}
                onComplete={() => onCompleteStep(lesson.id, currentStepIndex)}
              />
            ) : null}

            {step.kind === 'ear-training' ? (
              <div className="lesson-inline-activity">
                <p className="panel-copy">
                  Ear training is available inside the Theory Quiz trainer. Use the button below to start a matching quiz.
                </p>
                <button
                  className="primary-button"
                  onClick={() => onStartQuiz(lesson.id, currentStepIndex, { quizType: 'interval' })}
                >
                  Start Ear Training Quiz
                </button>
              </div>
            ) : null}

            {step.kind === 'rhythm-clapping' ? (
              <div className="lesson-inline-activity">
                <p className="panel-copy">
                  Rhythm clapping drills launch in Play mode at {step.bpm} BPM. Spacebar acts as your clap.
                </p>
                <button
                  className="primary-button"
                  onClick={() => onStartDrill(lesson.id, currentStepIndex)}
                >
                  Start Rhythm Drill
                </button>
              </div>
            ) : null}

            {step.kind !== 'tip' && stepCompleted && !isFinalStep ? (
              <button
                className="secondary-button"
                onClick={() => setCurrentStepIndex((current) => Math.min(current + 1, lesson.steps.length - 1))}
              >
                Next Step
              </button>
            ) : null}

            {lastAttempt && lastAttempt.stepIndex === currentStepIndex && step.kind !== 'tip' ? (
              <span className="lesson-step-note" role="status">
                {lastAttempt.accuracy}% of {lastAttempt.target}% needed. Try again.
              </span>
            ) : null}

            {!stepCompleted && step.kind !== 'tip' ? (
              <span className="lesson-step-note">Complete the activity to unlock the next step.</span>
            ) : null}
          </div>

          <div className="lesson-step-footer">
            <button className="secondary-button" onClick={onBack}>Back to Learn</button>
            <div className="lesson-step-nav">
              <button
                className="secondary-button"
                onClick={() => setCurrentStepIndex((current) => Math.max(0, current - 1))}
                disabled={currentStepIndex === 0}
              >
                Previous
              </button>
              <button
                className="secondary-button"
                onClick={() => setCurrentStepIndex((current) => Math.min(lesson.steps.length - 1, current + 1))}
                disabled={currentStepIndex >= lesson.steps.length - 1}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </section>

      {isFinalStep ? (
        <section className="panel lesson-complete-panel">
          <div>
            <p className="eyebrow">Lesson Completion</p>
            <h2>{lessonCompleted ? 'Lesson complete' : 'Finish the lesson'}</h2>
            <p className="panel-copy">
              {lessonCompleted
                ? 'This lesson is complete. You can review it again or move on to the next lesson.'
                : allStepsCompleted
                  ? 'All steps are complete. Mark the lesson finished to unlock the next one when sequential unlock is on.'
                  : 'Complete every step in this lesson before marking it finished.'}
            </p>
          </div>
          <div className="lesson-complete-actions">
            <button className="primary-button" onClick={() => onCompleteLesson(lesson.id)} disabled={!allStepsCompleted || lessonCompleted}>
              Complete Lesson
            </button>
            {lessonCompleted && nextLesson ? (
              <button className="secondary-button" onClick={() => onOpenLesson(nextLesson.id)}>
                Next Lesson
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
