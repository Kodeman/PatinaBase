'use client';

/**
 * Composer option builder — Track 5 (the selection case of the item composer).
 *
 * A THIN array wrapper over the shipped `DecisionOptionBuilder` (the same
 * library-first option card the decision composer / proposal builder / project
 * detail all share). It owns the `DecisionOptionValue[]` array — add, remove,
 * and where generated siblings land (P1-6) — and nothing else: the option
 * FIELDS (library picker, image upload, price /
 * quantity / deltas, "save as draft") are NOT reimplemented here, they come
 * verbatim from `DecisionOptionBuilder`. On publish the composer calls
 * `useMaterializeDraftOptions()` then maps each value through
 * `optionValueToInput` into `useCreateCoordinationItem`'s `options` input — that
 * mapping lives in item-composer.tsx, not here (this is purely the array shell).
 *
 * Zero shadows (D4): the only chrome is the DecisionOptionBuilder card's own 1px
 * pearl border + a single "+ option" / "Remove" affordance in the paper grammar.
 */

import {
  DecisionOptionBuilder,
  emptyOption,
  type DecisionOptionValue,
} from '@/components/portal/decision-option-builder';

export interface ComposerOptionBuilderProps {
  /** The current option values (DecisionOptionValue from decision-option-builder). */
  value: DecisionOptionValue[];
  onChange: (next: DecisionOptionValue[]) => void;
}

export function ComposerOptionBuilder({ value, onChange }: ComposerOptionBuilderProps) {
  const setAt = (index: number, next: DecisionOptionValue) =>
    onChange(value.map((o, i) => (i === index ? next : o)));

  const removeAt = (index: number) => onChange(value.filter((_, i) => i !== index));

  const add = () => onChange([...value, emptyOption()]);

  /**
   * P1-6 — "Compare across a group" hands back one sibling per compared value.
   * They land beside the option they were built from, in the maker's own order.
   * The generator marks its baseline as the recommendation; that only stands if
   * the designer has not already recommended something, because a selection has
   * exactly one recommendation.
   */
  const placeSiblings = (index: number, siblings: DecisionOptionValue[]) => {
    const alreadyRecommended = value.some((option) => option.isRecommended);
    const placed = alreadyRecommended
      ? siblings.map((option) => ({ ...option, isRecommended: false }))
      : siblings;
    onChange([...value.slice(0, index + 1), ...placed, ...value.slice(index + 1)]);
  };

  return (
    <div className="flex flex-col gap-3">
      {value.map((option, index) => (
        <DecisionOptionBuilder
          key={index}
          index={index}
          value={option}
          onChange={(next) => setAt(index, next)}
          // The first two options are the floor of a selection — keep them
          // un-removable so a selection always offers a real choice.
          onRemove={value.length > 2 ? () => removeAt(index) : undefined}
          onGenerateSiblings={(siblings) => placeSiblings(index, siblings)}
        />
      ))}

      <button
        type="button"
        onClick={add}
        className="self-start font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--color-clay-ink)] hover:opacity-80"
      >
        + Option
      </button>
    </div>
  );
}
