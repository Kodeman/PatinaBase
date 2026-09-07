'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Stamp, type StampState } from '@/components/threshold/instruments/stamp';

/* ── THE RECORD OF DECISION ──────────────────────────────────────────────────
   P-26. One sheet, printable, that says what she was asked and what she
   answered — the keepsake the ceremony has owed since Wave 2 sealed it.

   IT IS A PRINT SHEET, NOT A ZONE. `/invoices/[id]/print` set the precedent
   and `retired-routes.ts` names it: a printable instrument has no in-page
   equivalent, so it keeps its own address instead of folding onto an anchor.
   These two routes follow it exactly — same chromeless white overlay, same
   visibility-scoped print rules, same back link into the page the client came
   from.

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

/* ── THE SNAPSHOT IS SOMEBODY ELSE'S MARKUP ──────────────────────────────────
   The executed agreement is the ONE place this portal sets HTML it did not
   write, and the strings inside it are part titles and part bodies a designer
   typed. `public._render_agreement_snapshot_html` escapes every one of them on
   the way in, and that escaping is the contract — but it is a contract kept in
   a database function, on the far side of a deploy, and a keepsake rendered
   inside the homeowner's signed-in session is the wrong place to trust a
   single layer.

   So the markup is made inert here as well, before it is set: no script or
   style element, no frame or plugin element, no `on*` handler attribute, and
   no `javascript:` URL. A snapshot the renderer escaped correctly passes
   through this untouched — there is nothing in it for these rules to find.
   ────────────────────────────────────────────────────────────────────────── */
// Paired first, so a script's SOURCE does not survive as visible text on the
// sheet once its tags are gone.
const SCRIPT_BLOCKS = /<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const INERT_ELEMENTS =
  /<\s*\/?\s*(script|style|iframe|object|embed|link|meta|base|form)\b[^>]*>/gi;
const EVENT_ATTRIBUTES = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+)/gi;
const SCRIPT_URLS =
  /\s(?:href|src|xlink:href)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s"'>]*)/gi;

export function inertSnapshotHtml(html: string): string {
  return html
    .replace(SCRIPT_BLOCKS, '')
    .replace(INERT_ELEMENTS, '')
    .replace(EVENT_ATTRIBUTES, '')
    .replace(SCRIPT_URLS, '');
}

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
  /**
   * WHAT she agreed to — the consent line she actually ticked, as her
   * signature's own metadata recorded it on the day (Wave 2, P6).
   *
   * Never re-composed from the agreement's parts at read time: the parts can
   * be superseded by an addendum, and a record that quietly restates today's
   * terms is a record of a signature nobody gave. Null on every signature
   * written before the composer, which prints nothing here.
   */
  agreedSentence?: string | null;
  /**
   * R12 — the agreement as it stood when the studio countersigned, frozen at
   * execution and never re-rendered. Server-composed HTML from the
   * client-visible parts; the keepsake styles it and adds nothing to it.
   */
  executedHtml?: string | null;
  /** Twelve characters of the frozen agreement's own checksum. */
  executedChecksum?: string | null;
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
  agreedSentence = null,
  executedHtml = null,
  executedChecksum = null,
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
          {agreedSentence && (
            <p
              data-testid="record-agreed"
              style={{
                fontSize: '0.9rem',
                lineHeight: 1.6,
                marginTop: '0.5rem',
                maxWidth: '52ch',
              }}
            >
              {agreedSentence}
            </p>
          )}
        </section>

        {/* R12. THE AGREEMENT AS IT WAS EXECUTED, not as it reads today. The
            markup is composed by the database at countersign and stored
            whole; nothing here re-renders it from the parts, and the mark
            below is the frozen document's own, which is what makes the sheet
            checkable years later. No PDF: this is the copy she keeps. */}
        {executedHtml && (
          <section className="mb-10 border-t pt-4" style={{ borderColor: '#E5E2DD' }}>
            <p className={LABEL_CLASS}>The agreement as executed</p>
            <div
              data-testid="record-executed"
              style={{ fontSize: '0.95rem', lineHeight: 1.6, marginTop: '0.75rem' }}
              // The snapshot is server-composed by
              // `_render_agreement_snapshot_html`, which escapes every
              // interpolated string and emits no script or style. The client
              // never composes it and never edits it — and it is made inert
              // here anyway, because one escaping layer on the far side of a
              // deploy is not enough for the only markup this portal sets.
              dangerouslySetInnerHTML={{ __html: inertSnapshotHtml(executedHtml) }}
            />
            {executedChecksum && (
              <p className={`${LABEL_CLASS} mt-4`} data-testid="record-executed-checksum">
                {`Mark ${executedChecksum}`}
              </p>
            )}
          </section>
        )}
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
