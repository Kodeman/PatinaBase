'use client';

/**
 * "Not quite right" — the §8.2 structured correction picker. A quiet inline
 * affordance on the teaching product view: pick the direction the read is off
 * ("More artisan", "Cooler", …), optionally say it in words, and it writes a
 * `taste_corrections` row through `submit_taste_correction` (subject
 * 'spectrum', surface 'teaching'). Corrections feed the nightly refit and
 * bias naming — they never rewrite the product's canonical row here.
 */

import { useState } from 'react';
import { useSubmitTasteCorrection } from '@patina/supabase';
import {
  CORRECTION_CHIPS,
  chipsToDirection,
  toggleChip,
} from '../_lib/correction-chips';

export function CorrectionPicker({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [freeText, setFreeText] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = useSubmitTasteCorrection();

  const send = async () => {
    setError(null);
    const direction = chipsToDirection(selected);
    if (Object.keys(direction).length === 0 && !freeText.trim()) return;
    try {
      await submit.mutateAsync({
        subject: 'spectrum',
        productId,
        direction,
        freeText: freeText.trim() || null,
        surface: 'teaching',
      });
      setSent(true);
      setSelected([]);
      setFreeText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record that.');
    }
  };

  if (sent) {
    return (
      <p className="mt-2 font-body text-[0.78rem] italic text-[var(--text-muted)]">
        Noted — your correction sharpens the Engine&apos;s read.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 font-body text-[0.78rem] italic text-[var(--text-muted)] underline decoration-[var(--color-pearl)] underline-offset-2 hover:text-[var(--text-primary)]"
      >
        Not quite right?
      </button>
    );
  }

  return (
    <div className="mt-3 border-l-2 border-[var(--color-pearl)] pl-3">
      <p className="font-body text-[0.8rem] text-[var(--text-primary)]">
        How does it actually read?
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {CORRECTION_CHIPS.map((chip) => {
          const active = selected.includes(chip.id);
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => setSelected((prev) => toggleChip(prev, chip.id))}
              className={`rounded-full border px-2.5 py-1 font-body text-[0.72rem] transition-colors ${
                active
                  ? 'border-[var(--accent-primary)] bg-[rgba(196,165,123,0.12)] text-[var(--text-primary)]'
                  : 'border-[var(--color-pearl)] text-[var(--text-muted)] hover:border-[var(--accent-primary)]'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
      <input
        className="mt-2 w-full rounded-[3px] border border-[var(--color-pearl)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-body text-[0.78rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
        placeholder="In your words, if it helps…"
      />
      {error && <p className="mt-1.5 font-body text-[0.72rem] text-red-700">{error}</p>}
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={submit.isPending || (selected.length === 0 && !freeText.trim())}
          onClick={() => void send()}
          className="rounded-[3px] border border-[var(--color-pearl)] px-3 py-1 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--text-primary)] disabled:opacity-40"
        >
          {submit.isPending ? 'Recording…' : 'Record correction'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setSelected([]);
            setFreeText('');
          }}
          className="font-body text-[0.72rem] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          Never mind
        </button>
      </div>
    </div>
  );
}
