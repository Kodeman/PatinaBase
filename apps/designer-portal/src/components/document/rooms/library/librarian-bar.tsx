'use client';

/**
 * The librarian (R31/R38) — the Engine's standing presence atop the Library
 * Room. It stands here as part of the Room's identity, but the Engine itself is
 * Slice 3: this slice renders the input and its prompts, and ASKING is honestly
 * deferred (no companion call, no invented results) until the Engine is built.
 * "Designer-Taught Intelligence," never "AI."
 */

import { useState } from 'react';

const PROMPTS = [
  'Walnut credenzas under $3K',
  'What needs teaching?',
  'Warm organic lighting',
];

export function LibrarianBar() {
  const [value, setValue] = useState('');
  const [deferred, setDeferred] = useState(false);

  const ask = () => {
    if (!value.trim()) return;
    // Slice 3 wires this to the companion API behind paper result-lines with
    // a Place → [document] act. Until then, the ask is honestly deferred.
    setDeferred(true);
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
            setDeferred(false);
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
          onClick={ask}
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
            onClick={() => {
              setValue(p);
              setDeferred(true);
            }}
            className="rounded-[20px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-3 py-1.5 text-[0.68rem] text-[var(--text-body)] transition-colors hover:border-[var(--color-clay)] hover:text-[var(--color-charcoal)]"
          >
            {p}
          </button>
        ))}
      </div>

      {deferred && (
        <p className="mx-auto mt-4 max-w-[46ch] font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
          The librarian wakes in the next slice — the Engine answers here, in paper, with one act:
          Place → the document.
        </p>
      )}
    </div>
  );
}
