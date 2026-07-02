'use client';
/**
 * Minimal, unstyled question components — shared building blocks for the
 * client portal and the external marketing site. No design-system dependency
 * by design: portals style via className and the data-* hooks
 * (`data-quiz-option`, `data-selected`, `data-quiz-question`, …).
 */
import type { LifestyleOption } from '@patina/types';
import type { ReactNode } from 'react';
import type { AnyQuizQuestion } from '../core/questions';
import type { QuizAnswersDraft, QuizSelection } from '../core/quiz-machine';

export interface QuizOptionButtonProps {
  optionKey: string;
  selected: boolean;
  onSelect: (optionKey: string) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

/** One answer choice. Renders a plain <button> with aria-pressed + data hooks. */
export function QuizOptionButton({
  optionKey,
  selected,
  onSelect,
  disabled,
  className,
  children,
}: QuizOptionButtonProps) {
  return (
    <button
      type="button"
      className={className}
      aria-pressed={selected}
      data-quiz-option={optionKey}
      data-selected={selected ? 'true' : undefined}
      disabled={disabled}
      onClick={() => onSelect(optionKey)}
    >
      {children}
    </button>
  );
}

function isSelected(question: AnyQuizQuestion, answers: QuizAnswersDraft, optionKey: string): boolean {
  if (question.key === 'lifestyle') return answers.lifestyle.includes(optionKey as LifestyleOption);
  return answers[question.key] === optionKey;
}

export interface QuizQuestionViewProps {
  question: AnyQuizQuestion;
  answers: QuizAnswersDraft;
  /** From useStyleQuiz(): single-select answer. */
  onSelect: (selection: QuizSelection) => void;
  /** From useStyleQuiz(): multi-select toggle (lifestyle). */
  onToggleLifestyle: (option: LifestyleOption) => void;
  disabled?: boolean;
  className?: string;
  optionClassName?: string;
  /** Override the option rendering entirely (imagery, custom layout). */
  renderOption?: (option: AnyQuizQuestion['options'][number], selected: boolean) => ReactNode;
}

/** One question: prompt + helper + its options. Unstyled fieldset semantics. */
export function QuizQuestionView({
  question,
  answers,
  onSelect,
  onToggleLifestyle,
  disabled,
  className,
  optionClassName,
  renderOption,
}: QuizQuestionViewProps) {
  const handleSelect = (optionKey: string) => {
    if (question.key === 'lifestyle') {
      onToggleLifestyle(optionKey as LifestyleOption);
    } else {
      // optionKey comes from question.options, so the pair is valid by construction.
      onSelect({ question: question.key, option: optionKey } as QuizSelection);
    }
  };

  return (
    <fieldset
      className={className}
      data-quiz-question={question.key}
      data-quiz-kind={question.kind}
      disabled={disabled}
    >
      <legend data-quiz-prompt>{question.prompt}</legend>
      {question.helper ? <p data-quiz-helper>{question.helper}</p> : null}
      <div role={question.kind === 'multi' ? 'group' : 'radiogroup'} data-quiz-options>
        {question.options.map((option) => {
          const selected = isSelected(question, answers, option.key);
          return (
            <QuizOptionButton
              key={option.key}
              optionKey={option.key}
              selected={selected}
              onSelect={handleSelect}
              disabled={disabled}
              className={optionClassName}
            >
              {renderOption ? (
                renderOption(option, selected)
              ) : (
                <>
                  <span data-quiz-option-label>{option.label}</span>
                  {option.description ? (
                    <span data-quiz-option-description>{option.description}</span>
                  ) : null}
                </>
              )}
            </QuizOptionButton>
          );
        })}
      </div>
    </fieldset>
  );
}

export interface QuizProgressProps {
  step: number; // 0-based
  totalSteps: number;
  className?: string;
}

/** "Question n of 5" progress marker (accessible text, data hooks for dots). */
export function QuizProgress({ step, totalSteps, className }: QuizProgressProps) {
  return (
    <div
      className={className}
      data-quiz-progress
      data-step={step + 1}
      data-total={totalSteps}
      aria-label={`Question ${step + 1} of ${totalSteps}`}
    >
      <span data-quiz-progress-text>
        {step + 1} / {totalSteps}
      </span>
    </div>
  );
}
