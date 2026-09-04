'use client';

import Link from 'next/link';

import { ScoredAction } from '@/components/making/scored-action';

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
   are the only things on this section anybody DOES. ─────────────────────── */

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
  accountHref: '/account';
  onSignOut: () => void;
}

const LINE_CLASS =
  'block w-full border-t border-[var(--border-subtle)] py-2 text-left text-[15px] leading-[1.5] text-[var(--text-body)]';

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

export function Mat({ people, papers, accountHref, onSignOut }: MatProps) {
  return (
    <section
      id="mat"
      data-threshold-unit="mat"
      data-testid="mat"
      className="mt-[clamp(34px,4vw,58px)] border-t border-[var(--border-default)] pb-[clamp(90px,10vw,140px)] pt-4"
    >
      <p className="font-mono text-[11px] uppercase leading-[1.5] tracking-[0.14em] text-[var(--text-muted)]">
        The mat
      </p>

      <div className="mt-4 grid gap-[clamp(18px,2.6vw,38px)] [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
        <div data-testid="mat-people">
          <h3 className="mb-2.5 font-mono text-[11px] font-normal uppercase leading-[1.5] tracking-[0.14em] text-[var(--text-muted)]">
            The people, where they work
          </h3>
          {people.map((person) => (
            <div
              key={`${person.name}-${person.role}`}
              className="border-t border-[var(--border-subtle)] py-2 text-[15px] leading-[1.5] text-[var(--text-body)]"
            >
              <span>{`${person.name} · ${person.role}`}</span>
              {person.where && (
                <span className="block font-mono text-[11px] leading-[1.5] tracking-[0.04em] text-[var(--text-muted)]">
                  {person.where}
                </span>
              )}
            </div>
          ))}
        </div>

        <div id="mat-papers" data-testid="mat-papers">
          <h3 className="mb-2.5 font-mono text-[11px] font-normal uppercase leading-[1.5] tracking-[0.14em] text-[var(--text-muted)]">
            The papers
          </h3>
          {papers.map((paper) => (
            <Paper key={paper.label} paper={paper} />
          ))}
        </div>

        <div data-testid="mat-details">
          <h3 className="mb-2.5 font-mono text-[11px] font-normal uppercase leading-[1.5] tracking-[0.14em] text-[var(--text-muted)]">
            Your details
          </h3>
          <div className="flex flex-wrap items-baseline gap-x-5">
            <ScoredAction
              actionKey="mat_account"
              regionKey="mat"
              surfaceKey="the_threshold"
              variant="tertiary"
              href={accountHref}
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
        </div>
      </div>
    </section>
  );
}
