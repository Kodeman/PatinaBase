'use client';

/**
 * The librarian (R31/R38) — the Engine's standing presence atop the Library
 * Room, the second of its two homes (the first is ⌘K). Ask, and it answers in
 * paper result-lines from your own shelves, each carrying one act: Place →. No
 * thread, no history, no avatar — the ask leaves nothing behind; only the
 * placement persists. "Designer-Taught Intelligence," never "AI."
 *
 * Aesthete Wave 3C: the answer comes through the shared EngineResults, now
 * backed by the aesthete-ask edge fn (vector + keyword union, 1.5 s budget →
 * "the Engine is resting" FTS fallback). This bar owns only the ask box.
 */

import { useState } from 'react';
import { EngineResults } from '@/components/document/engine/engine-results';

const PROMPTS = [
  'Warm-grain credenzas',
  'What needs teaching?',
  'Organic lighting',
];

export function LibrarianBar({
  onPlaced,
}: {
  onPlaced?: (pieceName: string, whereName: string) => void;
}) {
  const [value, setValue] = useState('');
  const [asking, setAsking] = useState<string | null>(null);

  const ask = (q?: string) => {
    const next = (q ?? value).trim();
    if (!next) return;
    setValue(next);
    setAsking(next);
  };

  return (
    <div className="border-b border-[var(--doc-ink-border)] px-6 pb-9 pt-12 text-center sm:px-9">
      <h1 className="font-heading text-[2.4rem] font-normal leading-[1.05] text-[var(--color-charcoal)] min-[700px]:text-[2.6rem]">
        The <em className="italic text-[var(--color-clay)]">Library</em>
      </h1>
      <p className="mx-auto mt-2 max-w-[46ch] text-[0.82rem] text-[var(--color-aged-oak)]">
        Ask the librarian, or browse the shelves below. Every ask teaches your eye.
      </p>

      <div className="relative mx-auto mt-6 max-w-[580px]">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (asking) setAsking(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') ask();
          }}
          aria-label="Ask the librarian"
          placeholder="Ask the library — “warm-grain sideboards that photograph well”…"
          className="w-full rounded-[8px] border border-[var(--doc-ink-border)] bg-white px-4 py-3 pr-12 text-[0.86rem] text-[var(--color-charcoal)] placeholder:italic placeholder:text-[var(--color-aged-oak)] focus:border-[var(--color-clay)] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => ask()}
          aria-label="Ask"
          className="absolute right-2 top-1/2 flex h-[30px] w-[30px] -translate-y-1/2 items-center justify-center rounded-[6px] bg-[var(--color-clay)] text-white transition-opacity hover:opacity-85"
        >
          →
        </button>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => ask(p)}
            className="rounded-[20px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-3 py-1.5 text-[0.68rem] text-[var(--text-body)] transition-colors hover:border-[var(--color-clay)] hover:text-[var(--color-charcoal)]"
          >
            {p}
          </button>
        ))}
      </div>

      {asking && (
        <div className="mx-auto mt-5 max-w-[680px] text-left">
          <EngineResults query={asking} inDocument={null} onPlaced={onPlaced} />
        </div>
      )}
    </div>
  );
}
