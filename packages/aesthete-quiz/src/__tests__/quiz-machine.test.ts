/**
 * State-machine tests — the pure reducer that useStyleQuiz() wraps.
 * Timestamps travel on actions, so dwell timings are asserted exactly.
 */
import { describe, expect, it } from 'vitest';
import { QuizNetworkError } from '../core/errors';
import {
  buildAnswers,
  canAdvance,
  createInitialQuizState,
  currentQuestion,
  isComplete,
  isLastQuestion,
  quizReducer,
  type QuizAction,
  type QuizState,
} from '../core/quiz-machine';

function run(state: QuizState, ...actions: QuizAction[]): QuizState {
  return actions.reduce(quizReducer, state);
}

/** Answer everything, advancing with deterministic timestamps (1s per question). */
function answerAll(start = 1_000): QuizState {
  let s = createInitialQuizState(start);
  s = run(
    s,
    { type: 'SELECT_OPTION', question: 'visual_resonance', option: 'warm_minimal' },
    { type: 'NEXT', at: start + 1_000 },
    { type: 'TOGGLE_OPTION', question: 'lifestyle', option: 'family' },
    { type: 'TOGGLE_OPTION', question: 'lifestyle', option: 'entertaining' },
    { type: 'NEXT', at: start + 2_000 },
    { type: 'SELECT_OPTION', question: 'material', option: 'weathered_oak' },
    { type: 'NEXT', at: start + 3_000 },
    { type: 'SELECT_OPTION', question: 'investment', option: 'heirloom' },
    { type: 'NEXT', at: start + 4_000 },
    { type: 'SELECT_OPTION', question: 'catalyst', option: 'new_home' },
  );
  return s;
}

describe('progression', () => {
  it('starts on Q1, in_progress, unable to advance', () => {
    const s = createInitialQuizState(1_000);
    expect(s.step).toBe(0);
    expect(s.status).toBe('in_progress');
    expect(currentQuestion(s).key).toBe('visual_resonance');
    expect(canAdvance(s)).toBe(false);
  });

  it('NEXT is refused until the current question is answered', () => {
    const s = createInitialQuizState(1_000);
    expect(run(s, { type: 'NEXT', at: 2_000 }).step).toBe(0);
    const answered = run(s, { type: 'SELECT_OPTION', question: 'visual_resonance', option: 'cool_modern' });
    expect(canAdvance(answered)).toBe(true);
    expect(run(answered, { type: 'NEXT', at: 2_000 }).step).toBe(1);
  });

  it('multi-select toggles on/off and gates NEXT on minSelections', () => {
    let s = run(
      createInitialQuizState(0),
      { type: 'SELECT_OPTION', question: 'visual_resonance', option: 'warm_minimal' },
      { type: 'NEXT', at: 100 },
    );
    expect(currentQuestion(s).key).toBe('lifestyle');
    expect(canAdvance(s)).toBe(false); // minSelections 1
    s = run(s, { type: 'TOGGLE_OPTION', question: 'lifestyle', option: 'sanctuary' });
    expect(s.answers.lifestyle).toEqual(['sanctuary']);
    expect(canAdvance(s)).toBe(true);
    s = run(s, { type: 'TOGGLE_OPTION', question: 'lifestyle', option: 'sanctuary' });
    expect(s.answers.lifestyle).toEqual([]);
    expect(canAdvance(s)).toBe(false);
  });

  it('BACK returns without losing answers; step floors at 0', () => {
    let s = run(
      createInitialQuizState(0),
      { type: 'SELECT_OPTION', question: 'visual_resonance', option: 'eclectic_curated' },
      { type: 'NEXT', at: 500 },
      { type: 'BACK', at: 900 },
    );
    expect(s.step).toBe(0);
    expect(s.answers.visual_resonance).toBe('eclectic_curated');
    s = run(s, { type: 'BACK', at: 950 });
    expect(s.step).toBe(0);
  });

  it('re-selecting overwrites a single-select answer', () => {
    const s = run(
      createInitialQuizState(0),
      { type: 'SELECT_OPTION', question: 'visual_resonance', option: 'warm_minimal' },
      { type: 'SELECT_OPTION', question: 'visual_resonance', option: 'classic_comfort' },
    );
    expect(s.answers.visual_resonance).toBe('classic_comfort');
  });
});

describe('timings (q{n}_ms, §7.1)', () => {
  it('accumulates dwell per question on NEXT', () => {
    const s = answerAll(1_000);
    expect(s.timings).toEqual({ q1_ms: 1_000, q2_ms: 1_000, q3_ms: 1_000, q4_ms: 1_000 });
  });

  it('accumulates across revisits (BACK then NEXT adds to the same key)', () => {
    let s = run(
      createInitialQuizState(0),
      { type: 'SELECT_OPTION', question: 'visual_resonance', option: 'warm_minimal' },
      { type: 'NEXT', at: 1_000 }, // q1 += 1000
      { type: 'BACK', at: 1_400 }, // q2 += 400
      { type: 'NEXT', at: 1_900 }, // q1 += 500
    );
    expect(s.timings.q1_ms).toBe(1_500);
    expect(s.timings.q2_ms).toBe(400);
  });

  it('SUBMIT_START folds the final question dwell into q5_ms', () => {
    const s = run(answerAll(1_000), { type: 'SUBMIT_START', at: 7_000 });
    expect(s.timings.q5_ms).toBe(2_000); // entered q5 at 5_000
  });

  it('ignores a clock that goes backwards', () => {
    const s = run(
      createInitialQuizState(5_000),
      { type: 'SELECT_OPTION', question: 'visual_resonance', option: 'warm_minimal' },
      { type: 'NEXT', at: 4_000 },
    );
    expect(s.timings.q1_ms).toBeUndefined();
    expect(s.step).toBe(1);
  });
});

describe('completion + payload', () => {
  it('isComplete only after all five answers; buildAnswers returns the §7.1 payload', () => {
    const s = answerAll();
    expect(isLastQuestion(s)).toBe(true);
    expect(isComplete(s)).toBe(true);
    expect(buildAnswers(s)).toEqual({
      visual_resonance: 'warm_minimal',
      lifestyle: ['family', 'entertaining'],
      material: 'weathered_oak',
      investment: 'heirloom',
      catalyst: 'new_home',
    });
  });

  it('buildAnswers throws on an incomplete quiz', () => {
    const s = run(createInitialQuizState(0), {
      type: 'SELECT_OPTION',
      question: 'visual_resonance',
      option: 'warm_minimal',
    });
    expect(isComplete(s)).toBe(false);
    expect(() => buildAnswers(s)).toThrow(/incomplete/);
  });
});

describe('submit lifecycle', () => {
  it('SUBMIT_START is a no-op unless complete', () => {
    const s = run(createInitialQuizState(0), { type: 'SUBMIT_START', at: 100 });
    expect(s.status).toBe('in_progress');
  });

  it('submitting locks input; success stores the result; error is recoverable', () => {
    const submitting = run(answerAll(), { type: 'SUBMIT_START', at: 10_000 });
    expect(submitting.status).toBe('submitting');
    // Locked while in flight:
    expect(
      run(submitting, { type: 'SELECT_OPTION', question: 'material', option: 'soft_linen' }).answers.material,
    ).toBe('weathered_oak');
    expect(run(submitting, { type: 'NEXT', at: 10_100 }).step).toBe(submitting.step);

    const profile = { profile_id: 'p', version: 1 } as never;
    const complete = run(submitting, { type: 'SUBMIT_SUCCESS', result: profile });
    expect(complete.status).toBe('complete');
    expect(complete.result).toBe(profile);

    const failed = run(submitting, { type: 'SUBMIT_ERROR', error: new QuizNetworkError('offline') });
    expect(failed.status).toBe('error');
    expect(failed.error?.kind).toBe('network');
    // Recoverable: changing an answer clears the error and returns to in_progress.
    const retried = run(failed, { type: 'SELECT_OPTION', question: 'catalyst', option: 'refresh' });
    expect(retried.status).toBe('in_progress');
    expect(retried.error).toBeNull();
  });

  it('RESET restores a pristine state', () => {
    const s = run(answerAll(), { type: 'RESET', at: 99_000 });
    expect(s).toEqual(createInitialQuizState(99_000));
  });
});
