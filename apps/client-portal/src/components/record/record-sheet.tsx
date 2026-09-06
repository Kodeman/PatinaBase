'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Stamp, type StampState } from '@/components/threshold/instruments/stamp';

/* ── THE RECORD OF DECISION ──────────────────────────────────────────────────
   P-26. One sheet, printable, that says what she was asked and what she
   answered — the keepsake the ceremony has owed since Wave 2 sealed it.

   IT IS A PRINT SHEET, NOT A ZONE. `retired-routes.ts` names the carve-out: a
   printable instrument with no in-page equivalent keeps its own address
   instead of folding onto an anchor, on the same reasoning that keeps
   `/decisions/<id>/record` and `/proposals/<id>/record` unfolded — same
   chromeless white overlay, same visibility-scoped print rules, same back
   link into the page the client came from.

   WHAT THE PAPER DOES DIFFERENTLY FROM THE SCREEN
   · White, forced. The Threshold's warm ground is a screen decision; a laser
     printer would either drop it or lay down a field of ink.
   · The stamp stands upright. Every mark pressed on this surface is set at
     -1.1 degrees, which reads as a hand on screen and as a misfeed on paper.
   · No shadows anywhere — the house has none to begin with, and a print
     stylesheet that inherits one prints a grey smear.

   NEVER THE IP ADDRESS. See `lib/record-of-decision.ts`.
   ────────────────────────────────────────────────────────────────────────── */

const LABEL_CLASS =
  'font-mono text-[10px] uppercase tracking-[0.14em] text-[#6B6259]';

export interface RecordSheetProps {
  /** The studio's own name — the letterhead. Never Patina's. */
  studioName: string;
  /** Its mark, when the studio has one on file. */
  studioLogoUrl?: string | null;
  /** What kind of record this is: "Record of decision" / "Record of signature". */
  kindLine: string;
  /** The artifact, named as the plate names it. */
  artifactTitle: string;
  /** "Edition 3 · Issued 12 August" — composed by the caller from real dates. */
  editionLine: string;
  /** The ask itself, in the words it was asked in. */
  question: string;
  /** Her outcome, as the mark. */
  stampState: StampState;
  /** The date beside the word, already in words. */
  stampDateLabel?: string | null;
  /** What the mark is about, under the word. */
  stampSubject: string;
  /**
   * A fact about the EDITION, said in prose under her mark — never a second
   * mark, and never a word that undoes the first one. Today this carries the
   * supersession note, so a record she answered keeps her own outcome as the
   * stamp (P-27).
   */
  stampNote?: string | null;
  /**
   * The label over the signature block: what KIND of act the row records.
   *
   * `W3W-R1-05`: it was the unconditional word "Signed", so a RETURNED record
   * was headed with the word for the act she did not perform. It is now
   * composed from the stored consent method (`signatureBlock`), and a row that
   * records no method is headed "Recorded".
   */
  signatureHeading?: string;
  /** The name she typed, when the record carries one. */
  signedName?: string | null;
  /** When she answered, already in words. */
  signedOn?: string | null;
  /** How she agreed, as a sentence. */
  consentSentence?: string | null;
  /** What the answer let go, in words. */
  releaseSentence?: string | null;
  /** Twelve characters of the artifact's checksum. */
  checksum?: string | null;
  /** Where "Back" goes — the section of the Threshold this record came from. */
  backHref: string;
  backLabel: string;
  /** Anything the particular record adds between the ask and the mark. */
  children?: ReactNode;
}

export function RecordSheet({
  studioName,
  studioLogoUrl = null,
  kindLine,
  artifactTitle,
  editionLine,
  question,
  stampState,
  stampDateLabel = null,
  stampSubject,
  stampNote = null,
  signatureHeading = 'Signed',
  signedName = null,
  signedOn = null,
  consentSentence = null,
  releaseSentence = null,
  checksum = null,
  backHref,
  backLabel,
  children,
}: RecordSheetProps) {
  return (
    <div
      id="record-print-root"
      data-testid="record-sheet"
      className="fixed inset-0 z-[60] overflow-auto"
      style={{ background: '#FFFFFF', color: '#2B2925' }}
    >
      <style>{`
        @media print {
          /* W3W-R1-n1. The overlay is white, but the page under it kept the
             Threshold's cream — so a printer with background graphics on laid
             a field of ink around the sheet. The paper is white to its own
             edges, and that means the document root as well. */
          html, body {
            background: #FFFFFF !important;
            background-color: #FFFFFF !important;
          }
          body * { visibility: hidden; }
          #record-print-root, #record-print-root * { visibility: visible; }
          #record-print-root {
            position: absolute !important;
            inset: auto !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            overflow: visible !important;
            background: #FFFFFF !important;
          }
          .record-toolbar { display: none !important; }
          /* The mark is set on a slant on screen, by an inline transform.
             A tilted stamp on a laser printer reads as a misfeed, so the
             sheet stands it upright — !important because the slant is
             inline, and an inline style outranks every ordinary rule. */
          #record-print-root [data-stamp-state] {
            transform: none !important;
          }
          /* The house draws no shadows; a print stylesheet that inherits one
             from anywhere lays down a grey smear instead of depth. */
          #record-print-root * {
            box-shadow: none !important;
            text-shadow: none !important;
          }
          @page { margin: 0.75in; }
        }
      `}</style>

      {/* `W3W-R1-08`. Three landmarks, so every word on the sheet sits inside
          one: the toolbar is the page's banner, the sheet is its main, and the
          maker's mark is its contentinfo. axe's `region` rule counted eight
          nodes outside a landmark before this. */}
      <header className="record-toolbar sticky top-0 z-10 flex items-center justify-end gap-3 border-b border-[#E5E2DD] bg-white px-6 py-3">
        <Link
          href={backHref}
          className="inline-flex min-h-[44px] items-center px-3 text-[13px] text-[#2B2925] no-underline hover:opacity-70"
        >
          {`← ${backLabel}`}
        </Link>
        <button
          type="button"
          data-testid="record-print"
          onClick={() => window.print()}
          className="inline-flex min-h-[44px] items-center rounded-md bg-[#2B2925] px-4 text-sm text-white transition hover:opacity-90"
        >
          Print / Save PDF
        </button>
      </header>

      <main
        className="mx-auto max-w-[44rem] px-8 pt-12"
        style={{ fontFamily: 'var(--font-body, Georgia, serif)' }}
      >
        {/* The letterhead is the studio's. Patina does not sign this sheet
            any more than it signs the mail (P-03). A plain block rather than a
            second `<header>`: the banner above is the page's, and two of them
            is the `landmark-unique` failure this sheet's sibling already
            paid for. */}
        <div className="mb-10 flex items-start justify-between gap-6">
          <div>
            {studioLogoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={studioLogoUrl}
                alt={studioName}
                data-testid="record-studio-logo"
                style={{
                  maxHeight: '48px',
                  width: 'auto',
                  marginBottom: '0.6rem',
                  display: 'block',
                }}
              />
            )}
            <p
              data-testid="record-studio-name"
              style={{
                fontFamily: 'var(--font-heading, Georgia, serif)',
                fontSize: '1.45rem',
                fontWeight: 600,
                lineHeight: 1.2,
              }}
            >
              {studioName}
            </p>
          </div>
          <p className={`${LABEL_CLASS} text-right`} data-testid="record-kind">
            {kindLine}
          </p>
        </div>

        <section className="mb-8">
          <p className={LABEL_CLASS}>The edition</p>
          <p
            data-testid="record-artifact-title"
            style={{
              fontFamily: 'var(--font-heading, Georgia, serif)',
              fontSize: '1.2rem',
              fontWeight: 600,
              lineHeight: 1.35,
              marginTop: '0.35rem',
            }}
          >
            {artifactTitle}
          </p>
          <p
            data-testid="record-edition-line"
            style={{ fontSize: '0.9rem', marginTop: '0.2rem' }}
          >
            {editionLine}
          </p>
        </section>

        <section className="mb-8">
          <p className={LABEL_CLASS}>The question</p>
          <p
            data-testid="record-question"
            style={{
              fontFamily: 'var(--font-heading, Georgia, serif)',
              fontSize: '1.05rem',
              lineHeight: 1.5,
              marginTop: '0.35rem',
              maxWidth: '52ch',
            }}
          >
            {question}
          </p>
        </section>

        {children}

        <section className="mb-8">
          <p className={LABEL_CLASS}>The answer</p>
          <p style={{ marginTop: '0.5rem' }}>
            <Stamp
              data-testid="record-stamp"
              state={stampState}
              dateLabel={stampDateLabel}
            >
              {stampSubject}
            </Stamp>
          </p>
          {stampNote && (
            <p
              data-testid="record-stamp-note"
              style={{
                fontSize: '0.9rem',
                lineHeight: 1.6,
                marginTop: '0.75rem',
                maxWidth: '52ch',
              }}
            >
              {stampNote}
            </p>
          )}
          {releaseSentence && (
            <p
              data-testid="record-release"
              style={{ fontSize: '0.9rem', lineHeight: 1.6, marginTop: '0.75rem', maxWidth: '52ch' }}
            >
              {releaseSentence}
            </p>
          )}
        </section>

        <section
          className="mb-10 border-t pt-4"
          style={{ borderColor: '#E5E2DD' }}
          data-testid="record-signature"
        >
          <p className={LABEL_CLASS}>{signatureHeading}</p>
          {signedName && (
            <p
              data-testid="record-signed-name"
              style={{
                fontFamily: 'var(--font-heading, Georgia, serif)',
                fontSize: '1.15rem',
                lineHeight: 1.4,
                marginTop: '0.35rem',
              }}
            >
              {signedName}
            </p>
          )}
          {signedOn && (
            <p
              data-testid="record-signed-on"
              style={{ fontSize: '0.9rem', marginTop: '0.2rem' }}
            >
              {signedOn}
            </p>
          )}
          {consentSentence && (
            <p
              data-testid="record-consent"
              style={{ fontSize: '0.9rem', lineHeight: 1.6, marginTop: '0.5rem' }}
            >
              {consentSentence}
            </p>
          )}
        </section>
      </main>

      {/* The maker's mark, at the plate's edge. Provenance, not a string she
          is being asked to check — and the only place twelve characters of
          the hash survive (R6). It is the page's contentinfo, outside `main`,
          so the sheet's last line is inside a landmark like every other. */}
      <footer
        className="mx-auto max-w-[44rem] border-t px-8 pb-12 pt-4"
        style={{
          borderColor: '#E5E2DD',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '0.58rem',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: '#6B6259',
        }}
      >
        {checksum && (
          <span data-testid="record-checksum">{`Mark ${checksum} · `}</span>
        )}
        <span>{`Kept by ${studioName} · Prepared with Patina`}</span>
      </footer>
    </div>
  );
}
