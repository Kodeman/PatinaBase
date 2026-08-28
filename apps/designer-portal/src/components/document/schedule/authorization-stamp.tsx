/**
 * The second stamp track (Authorized Schedule deck, slide 8 — the legend).
 *
 * Track one says where a piece is in the world. This one says whether the
 * client has agreed to buy it, and under which numbered instrument. It borrows
 * the Stamp's visual grammar exactly — DM Mono 600 uppercase, 1.5px border,
 * −1.5° rotation, transparent fill — so the two tracks read as one hand.
 *
 * Unreleased is quiet: an em dash where a stamp would be. Absence is a state,
 * drawn as absence, because most of a schedule is unreleased most of the time
 * and it should not read as a page of warnings.
 */

import { Stamp } from '../stamp';
import type { LineAuthorization } from '@/lib/document/authorization-derivation';

interface StampFace {
  label: string;
  color: string;
  ink: string;
}

/** The face each track wears. Golden hour waits; sage has been agreed to. */
export function authorizationStampFace(
  auth: LineAuthorization,
): StampFace | null {
  switch (auth.track) {
    case 'draft':
      return {
        label: `Draft · A${auth.number}`,
        color: 'var(--color-aged-oak)',
        ink: '#8B7355',
      };
    case 'awaiting':
      return {
        label: `Awaiting signature · A${auth.number}`,
        color: 'var(--color-golden-hour)',
        ink: 'var(--color-golden-hour-ink)',
      };
    case 'authorized':
      return {
        label: `Authorized · A${auth.number}`,
        color: 'var(--color-sage)',
        ink: 'var(--color-sage-ink)',
      };
    default:
      return null;
  }
}

export function AuthorizationStamp({
  auth,
  /** An unreleased line the reader can still see the column for. */
  showAbsence = true,
}: {
  auth: LineAuthorization;
  showAbsence?: boolean;
}) {
  const face = authorizationStampFace(auth);

  if (!face) {
    if (!showAbsence) return null;
    return (
      <span
        data-authorization-track="none"
        aria-label="Not yet released for authorization"
        className="inline-block whitespace-nowrap px-[9px] font-mono text-[11px] text-[var(--text-muted)]"
      >
        —
      </span>
    );
  }

  return (
    <span data-authorization-track={auth.track} className="inline-block">
      <Stamp label={face.label} color={face.color} ink={face.ink} />
    </span>
  );
}
