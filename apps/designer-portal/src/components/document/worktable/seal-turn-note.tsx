'use client';

/**
 * The note the seal leaves on the Delivery table: what was signed, and what it
 * became. Quiet — the ceremony is that the turn is stated at all, not that it
 * is loud. The date clause is dropped rather than guessed when the destination
 * document does not hold the signing date.
 */

export function SealTurnNote({ signedDate }: { signedDate: string | null }) {
  return (
    <p
      data-seal-turn-note
      className="mb-2 mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]"
    >
      {signedDate
        ? `This proposal was signed ${signedDate} and continued as the project document.`
        : 'This proposal was signed and continued as the project document.'}
    </p>
  );
}
