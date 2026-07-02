'use client';

/**
 * Quiet draft-provenance marker (design §5.2, copy law §2.1): when the six
 * sliders are prefilled from a `product_dna_drafts` row, the surface says so —
 * softly — as "the Engine's first read". Never a model name, never "AI".
 * Confirmed (canonical) state renders nothing extra: a designer's own save
 * needs no caveat.
 */

export function EngineFirstReadNote({ facts }: { facts?: string[] }) {
  return (
    <div className="mb-3 border-l-2 border-[var(--color-clay,#C4A57B)] pl-3">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[var(--text-muted)]">
        The Engine&apos;s first read
      </p>
      <p className="mt-0.5 font-body text-[0.78rem] italic text-[var(--text-muted)]">
        Prefilled from its reading of this piece — adjust anything and save to confirm.
      </p>
      {facts && facts.length > 0 && (
        <p className="mt-1 font-body text-[0.78rem] text-[var(--text-secondary,var(--text-muted))]">
          {facts.join(' · ')}
        </p>
      )}
    </div>
  );
}
