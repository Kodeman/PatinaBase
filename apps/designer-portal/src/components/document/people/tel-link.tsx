'use client';

/**
 * EVERY PHONE IS A LIVE `tel:` LINK, at every width (direction §1 line 9).
 *
 * Its own control, at least 44×44, at least 8px from the row's own control,
 * and NEVER nested inside a button — an `<a>` cannot live in a `<button>`, and
 * a run-on accessible name cannot be tabbed into (C11, SPEC §7 #6). The caller
 * places this as a SIBLING of the row's open control, never inside it.
 *
 * The href is built from digits, so a stored "(612) 555-0111" dials correctly;
 * the LABEL is whatever the studio wrote, unchanged.
 */

/** `+1` for ten digits, `+` for an already-international string, else null —
 *  mirrors the database's `normalize_phone_e164` (00281) closely enough to
 *  dial, and never raises. */
export function telHref(phone: string | null | undefined): string | null {
  const raw = (phone ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `tel:+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `tel:+${digits}`;
  return null;
}

export interface TelLinkProps {
  phone: string | null | undefined;
  /** What prints. Defaults to the phone as the studio wrote it. */
  label?: string;
  /**
   * A name for the ear. Without it a screen reader hears eleven digits with no
   * owner; with it, "Call Dana Kowalski".
   */
  personName?: string | null;
  /**
   * R-X — at 390 the WHOLE line is the target and must be at least 44px tall;
   * at 1440 only the digits are linked. A deliberate mobile adaptation, named
   * in SPEC §6.2, not a parity gap.
   */
  fullWidth?: boolean;
  className?: string;
  onClick?: () => void;
}

export function TelLink({
  phone,
  label,
  personName,
  fullWidth = false,
  className,
  onClick,
}: TelLinkProps) {
  const href = telHref(phone);
  // No number is not a broken link — it is nothing. The surface prints its own
  // sentence where a number is owed and absent.
  if (!href) return null;

  const text = label ?? (phone ?? '').trim();

  return (
    <a
      href={href}
      onClick={onClick}
      aria-label={personName ? `Call ${personName}, ${text}` : undefined}
      data-tel-link
      className={`inline-flex min-h-[44px] items-center font-mono text-[12px] tracking-[0.04em] text-[var(--ink-muted)] underline decoration-[var(--color-clay)] underline-offset-[3px] hover:text-[var(--ink)] ${
        fullWidth ? 'w-full min-w-0' : 'min-w-[44px] justify-center px-1'
      } ${className ?? ''}`}
    >
      {text}
    </a>
  );
}
