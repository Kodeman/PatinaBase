'use client';

import { StrataMark } from '@/components/strata-mark';

import { ScoredAction } from './scored-action';
import {
  standingSentence,
  standingSubline,
  type StandingSentenceInput,
} from './standing-sentence';

/* ── The masthead ───────────────────────────────────────────────────────────
   A's letterhead ceremony, carrying D's standing sentence.

   Read top to bottom it is a letterhead and nothing else: the strata mark, the
   surface's name in mono, the project in Playfair, one mono vitals line, then
   the sentence that says where the house stands and the mono counts beneath
   it. Three quiet links sit in the corner for the places that keep their own
   routes — the plan, the correspondence, the papers.

   Presentational by construction. Every fact arrives as a prop; the only work
   done here is composition, and even the sentence is composed by the pure
   module next door so the wording can be tested without a DOM.

   `standing: null` is the honest state, not a loading state. The counts the
   sentence is made of resolve client-side, and the date it opens on is the
   client's own — so the server render and the first client paint would
   disagree. Until the surface can say something true, the masthead holds the
   sentence's place and says nothing. The live region is mounted the whole time
   so the sentence is announced when it arrives rather than appearing in
   silence. ──────────────────────────────────────────────────────────────── */

interface CornerLink {
  href: string;
  label: string;
  actionKey: string;
}

/**
 * The routes that survive v1 as places of their own. The Making is the surface;
 * these three are still rooms you can walk to.
 */
const CORNER_LINKS: readonly CornerLink[] = [
  { href: '/budget', label: 'The plan', actionKey: 'the_plan' },
  { href: '/messages', label: 'Correspondence', actionKey: 'correspondence' },
  { href: '/documents', label: 'The papers', actionKey: 'the_papers' },
] as const;

export interface MakingMastheadProps {
  /** The project's name, as the studio wrote it. */
  projectName: string;
  /** Where the house is. Omitted from the vitals when the project has none. */
  location?: string | null;
  /** The client-facing phase label — "Procurement", not "Procurement & Order Management". */
  phaseLabel?: string | null;
  /** Today's month and year: "August 2026". See `monthAndYear`. */
  monthLabel?: string | null;
  /**
   * Who this pane is for — the addressee of the letterhead. Omitted (with the
   * whole attribution line) when the surface does not know it.
   */
  preparedFor?: string | null;
  /**
   * Who prepared it. Renders as "Prepared for X by Y." when both facts are
   * present; "Prepared for X." when only the addressee is.
   */
  studioName?: string | null;
  /**
   * The facts the standing sentence is made of, or `null` while the surface
   * cannot yet say something true — before hydration, or while the counts are
   * still in flight.
   */
  standing: StandingSentenceInput | null;
}

interface Vital {
  text: string;
  /** The phase is the one fact in the line worth full ink. */
  emphasis: boolean;
}

function vitalsOf(props: MakingMastheadProps): Vital[] {
  return [
    { text: props.location, emphasis: false },
    { text: props.phaseLabel, emphasis: true },
    { text: props.monthLabel, emphasis: false },
  ].flatMap<Vital>((vital) => {
    const text = vital.text?.trim();
    return text ? [{ text, emphasis: vital.emphasis }] : [];
  });
}

/**
 * The letterhead's attribution — A's `.ssub`, in the serif italic the marker
 * and the gate captions already use. A letterhead that names nobody is just a
 * title, so this is the line that makes it one; it goes silent rather than
 * printing half an attribution.
 */
function attributionOf(props: MakingMastheadProps): string | null {
  const addressee = props.preparedFor?.trim();
  if (!addressee) return null;
  const studio = props.studioName?.trim();
  return studio ? `Prepared for ${addressee} by ${studio}.` : `Prepared for ${addressee}.`;
}

export function MakingMasthead(props: MakingMastheadProps) {
  const { projectName, standing } = props;
  const vitals = vitalsOf(props);
  const attribution = attributionOf(props);
  const subline = standing ? standingSubline(standing) : [];

  return (
    <header
      data-testid="making-masthead"
      className="border-b border-[var(--border-subtle)] pb-8"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <StrataMark variant="mini" />
          <p
            data-testid="making-masthead-eyebrow"
            className="type-meta-small text-[var(--text-muted)]"
          >
            The Making
          </p>
          <h1 data-testid="making-masthead-title" className="type-page-title mt-1">
            {projectName}
          </h1>
          {vitals.length > 0 && (
            <p
              data-testid="making-masthead-vitals"
              className="type-meta-small mt-3 text-[var(--text-muted)]"
            >
              {vitals.map((vital, index) => (
                <span key={vital.text}>
                  {index > 0 && <span aria-hidden="true">{' · '}</span>}
                  <span
                    className={vital.emphasis ? 'text-[var(--text-primary)]' : undefined}
                  >
                    {vital.text}
                  </span>
                </span>
              ))}
            </p>
          )}
          {attribution && (
            <p
              data-testid="making-masthead-attribution"
              className="font-heading mt-2 text-[0.95rem] italic leading-[1.5] text-[var(--text-body)]"
            >
              {attribution}
            </p>
          )}
        </div>

        <nav
          aria-label="Elsewhere in your project"
          data-testid="making-masthead-links"
          className="-mx-[6px] flex flex-wrap items-start sm:mx-0 sm:pt-8"
        >
          {CORNER_LINKS.map((link) => (
            <ScoredAction
              key={link.href}
              href={link.href}
              variant="tertiary"
              actionKey={link.actionKey}
              regionKey="masthead"
            >
              {link.label}
            </ScoredAction>
          ))}
        </nav>
      </div>

      <div aria-live="polite" data-testid="making-standing">
        {standing ? (
          <>
            <p
              data-testid="making-standing-sentence"
              className="type-item-name mt-6 max-w-[52ch] font-normal"
            >
              {standingSentence(standing)}
            </p>
            {subline.length > 0 && (
              <p
                data-testid="making-standing-subline"
                className="type-meta-small mt-3 text-[var(--text-muted)]"
              >
                {subline.join(' · ')}
              </p>
            )}
          </>
        ) : (
          // Same block on the server and the first client paint: the sentence's
          // place, held open, so nothing below it moves when the words land.
          <div
            aria-hidden="true"
            data-testid="making-standing-pending"
            className="mt-6 min-h-[5.4rem]"
          />
        )}
      </div>
    </header>
  );
}
