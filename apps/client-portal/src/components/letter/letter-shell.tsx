/**
 * PAGE TWO OF THE LETTER (R6). Same letterhead, same standing sentence word for
 * word, same note, one button. It renders from the FROZEN snapshot and reads no
 * live profile, project, membership, or organization row — so the email and the
 * page cannot disagree even if the studio renames itself between send and click.
 *
 * PP-1 (R2): the studio is on top, Patina is named exactly once, in the
 * colophon, in the smallest type on the page. This is why it does NOT use
 * ClientAuthShell — that shell is Patina's own front door and belongs on
 * /auth/signin, not on a studio's letter.
 */

import type { ReactNode } from 'react';

const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "8 September" — a real date, never a countdown. UTC, so a letter reads the
 *  same wherever it is opened. */
export function longDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${LONG_MONTHS[d.getUTCMonth()]}`;
}

function longDateWithYear(iso: string): string {
  return `${longDate(iso)} ${new Date(iso).getUTCFullYear()}`;
}

export interface LetterSnapshotView {
  kind: 'invite' | 'notice';
  recipientName: string | null;
  studioName: string | null;
  studioLogoUrl: string | null;
  signatureCity: string | null;
  /** NULL when the send resolved no real name — the studio authors the letter
   *  and no placeholder identity is printed. Mirrors the frozen snapshot's own
   *  degradation in supabase/functions/_shared/client-letter.ts. */
  designerFullName: string | null;
  designerGivenName: string | null;
  projectName: string | null;
  standingSentence: string;
  personalMessage: string | null;
  sentAt: string;
  expiresAt: string;
}

const stated = (v: string | null | undefined): string | null =>
  (v ?? '').trim() || null;

/** The studio, the person where there is no studio, and NOTHING where there is
 *  neither — an empty letterhead, never an invented one. */
function letterheadName(s: LetterSnapshotView): string | null {
  return stated(s.studioName) ?? stated(s.designerFullName);
}

export function LetterShell({
  snapshot,
  children,
}: {
  snapshot: LetterSnapshotView;
  children: ReactNode;
}) {
  const name = letterheadName(snapshot);
  const place = [snapshot.signatureCity?.trim(), longDateWithYear(snapshot.sentAt)]
    .filter(Boolean)
    .join(' · ');
  const signature = [snapshot.designerFullName, snapshot.studioName, snapshot.signatureCity]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' · ');
  const note = snapshot.personalMessage?.trim();
  // Who can send another: her given name, then the studio, then nobody. Never a
  // guessed pronoun — the page has no idea of anyone's gender.
  const sender = stated(snapshot.designerGivenName) ?? stated(snapshot.studioName);

  return (
    <main className="mx-auto min-h-screen max-w-[46rem] bg-[#F5F0E6] px-6 py-12 text-[#1F1B16]">
      <header data-testid="letter-letterhead" className="flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-2.5">
            {snapshot.studioLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={snapshot.studioLogoUrl}
                alt={name ?? ''}
                className="h-5 max-h-6 w-auto"
              />
            ) : null}
            {name ? (
              <span className="font-heading text-[1.15rem] font-semibold uppercase tracking-[0.06em]">
                {name.toUpperCase()}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 font-mono text-[11px] tracking-[0.08em] text-[#8C8578]">{place}</p>
        </div>
        {snapshot.recipientName?.trim() ? (
          <p className="text-right text-[13px] text-[#8C8578]">
            Prepared for {snapshot.recipientName.trim()}
          </p>
        ) : null}
      </header>

      <hr className="mt-5 border-t border-[#E6DDCC]" />

      <h1 className="mt-8 font-heading text-[2rem] font-semibold leading-tight">
        {snapshot.projectName?.trim() || 'A page for your work together'}
      </h1>

      <p
        data-testid="letter-standing"
        className="mt-4 max-w-[52ch] text-[1rem] leading-relaxed text-[#4B463E]"
      >
        {snapshot.standingSentence}
      </p>

      {/* ABSENCE IS SILENCE. A studio that says nothing is allowed to say
          nothing — no empty frame, no substitute sentence in her voice. */}
      {note ? (
        <blockquote
          data-testid="letter-note"
          className="mt-6 max-w-[52ch] whitespace-pre-line border-l-[3px] border-[#B08A46] bg-white py-3.5 pl-4 pr-4 font-heading text-[1rem] italic leading-relaxed text-[#4B463E]"
        >
          {note}
        </blockquote>
      ) : null}

      <div className="mt-8">{children}</div>

      {snapshot.kind === 'invite' ? (
        <p data-testid="letter-expiry" className="mt-5 text-[13px] text-[#8C8578]">
          {sender
            ? `The link works until ${longDate(snapshot.expiresAt)}; ${sender} can send another.`
            : `The link works until ${longDate(snapshot.expiresAt)}.`}
        </p>
      ) : null}

      {signature ? (
        <p data-testid="letter-signoff" className="mt-8 text-[1rem] text-[#4B463E]">
          {`— ${signature}`}
        </p>
      ) : null}

      <hr className="mt-10 border-t border-[#E6DDCC]" />

      <footer
        data-testid="letter-colophon"
        className="mt-4 space-y-1 text-[12px] leading-relaxed text-[#8C8578]"
      >
        <p>{name ? `Prepared by ${name} · Sent through Patina` : 'Sent through Patina'}</p>
      </footer>
    </main>
  );
}
