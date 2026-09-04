"use client";

import type { ReactNode } from 'react';
import Link from 'next/link';

import { ScoredAction } from '@/components/threshold/instruments/scored-action';
import { PAPERS_TAB_LABEL } from '@/lib/threshold/papers';

import { COLUMN_HEAD_CLASS, LINE_CLASS, SUBLINE_CLASS } from './mat-classes';
import { OtherHouses, type OtherHouse } from './other-houses';

/* ── The mat ────────────────────────────────────────────────────────────────
   What you find by the door on the way out: who is working on the house and
   where, the papers that belong to her, and the two acts every house owes its
   guest — a way to her own details, and a way out.

   "Leave the house" is REQUIRED. The Threshold takes the portal's global
   header off this route, so sign-out lives nowhere else on the page; a mat
   without it traps the client inside her own project.

   The papers are read as lines, not as acts: a paper that opens somewhere is a
   link, a paper the caller opens itself is a button, and a paper that is only
   named is named. Scored ink is reserved for the two acts at the foot, which
   are the only things on this section anybody DOES.

   The mat opts into dimming: on the way out, in the since-yesterday reading,
   it is the one block that can go quiet without hiding an ask. ──────────── */

export interface MatPerson {
  name: string;
  role: string;
  where: string;
}

export interface MatPaper {
  label: string;
  href?: string;
  onOpen?: () => void;
}

export interface MatProps {
  people: MatPerson[];
  papers: MatPaper[];
  /** Every other project this client can open. Empty for a solo client. */
  otherHouses?: OtherHouse[];
  /** Opens the details sheet in place (L7 absorbs /account — never a route). */
  onOpenDetails: () => void;
  /** Whether the details sheet is currently open, for aria-expanded on the act that opens it. */
  detailsOpen?: boolean;
  onSignOut: () => void;
  /** The act that governs the letters, wired next door. */
  correspondence?: ReactNode;
  /** Lays the papers sheet over the page — every paper, not only the named few. */
  onOpenPapers?: () => void;
  /** Whether that sheet is down, so the act can say so where it is read. */
  papersOpen?: boolean;
  /** L6 — "Ask for a change" (scope-change-ask.tsx), house-wide rather than
   * room-scoped. Optional so every other caller of `Mat` is unaffected. */
  extraActs?: ReactNode;
}

function Paper({ paper }: { paper: MatPaper }) {
  if (paper.href) {
    return (
      <Link href={paper.href} className={LINE_CLASS}>
        {paper.label}
      </Link>
    );
  }
  if (paper.onOpen) {
    return (
      <button type="button" onClick={paper.onOpen} className={LINE_CLASS}>
        {paper.label}
      </button>
    );
  }
  return <span className={LINE_CLASS}>{paper.label}</span>;
}

export function Mat({
  people,
  papers,
  otherHouses = [],
  onOpenDetails,
  detailsOpen,
  onSignOut,
  correspondence,
  onOpenPapers,
  papersOpen = false,
  extraActs,
}: MatProps) {
  return (
    <section
      id="mat"
      data-threshold-unit="mat"
      data-dimmable
      data-testid="mat"
      className="mt-[clamp(34px,4vw,58px)] border-t border-[var(--border-default)] pb-[clamp(90px,10vw,140px)] pt-4"
    >
      <p className="font-mono text-[11px] uppercase leading-[1.5] tracking-[0.14em] text-[var(--text-muted)]">
        The mat
      </p>

      <div className="mt-4 grid gap-[clamp(18px,2.6vw,38px)] [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
        <div data-testid="mat-people">
          <h2 className={COLUMN_HEAD_CLASS}>The people, where they work</h2>
          {people.map((person) => (
            <div
              key={`${person.name}-${person.role}`}
              className="border-t border-[var(--border-subtle)] py-2 text-[15px] leading-[1.5] text-[var(--text-body)]"
            >
              <span>{`${person.name} · ${person.role}`}</span>
              {person.where && (
                <span className={SUBLINE_CLASS}>{person.where}</span>
              )}
            </div>
          ))}
        </div>

        <div id="mat-papers" data-testid="mat-papers">
          <h2 className={COLUMN_HEAD_CLASS}>The papers</h2>
          {papers.map((paper, index) => (
            <Paper key={`${paper.label}-${index}`} paper={paper} />
          ))}
          {onOpenPapers && (
            <ScoredAction
              actionKey="mat_papers"
              regionKey="mat"
              surfaceKey="the_threshold"
              variant="tertiary"
              aria-expanded={papersOpen}
              // The sheet exists only while it is open; a dangling IDREF is
              // what a closed one would leave.
              aria-controls={papersOpen ? 'papers-sheet' : undefined}
              onClick={onOpenPapers}
            >
              {PAPERS_TAB_LABEL}
            </ScoredAction>
          )}
        </div>

        <OtherHouses houses={otherHouses} />

        {/* No column head here: "Your details" is the act itself, and a heading
            of the same words would put the name twice in one region. */}
        <div data-testid="mat-details">
          <div className="flex flex-wrap items-baseline gap-x-5">
            <ScoredAction
              actionKey="mat_account"
              regionKey="mat"
              surfaceKey="the_threshold"
              variant="tertiary"
              onClick={onOpenDetails}
              aria-haspopup="dialog"
              aria-expanded={!!detailsOpen}
            >
              Your details
            </ScoredAction>
            <ScoredAction
              actionKey="mat_sign_out"
              regionKey="mat"
              surfaceKey="the_threshold"
              variant="secondary"
              onClick={onSignOut}
            >
              Leave the house
            </ScoredAction>
          </div>
          {extraActs}
          {/* Its own line: an act that governs the letters is not part of the
              client's own record, and reads as one when it sits inside it. */}
          {correspondence && <div className="mt-2">{correspondence}</div>}
        </div>
      </div>
    </section>
  );
}
