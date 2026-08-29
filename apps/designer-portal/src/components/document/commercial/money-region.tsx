'use client';

/**
 * The money region (Wave 4 · W2) — one section, one dominant figure, and the
 * six-rung ladder in dependency order: budget → plan → authorized → moved →
 * owed → not drawn. It absorbs the four bands that used to stand apart on the
 * project document.
 *
 * Every rung but one reads the SAME hook the detail surface below it already
 * calls, so the region composes figures the page had already paid for. The
 * exception is the vendor-payout read `Moved` needs: nothing else on the page
 * knows what has actually left the studio for the makers.
 *
 * `Authorized` and `Moved` are different money and must never be swapped:
 * `Authorized` is what executed instruments contractually owe; `Moved` is that
 * figure less what `po_payments` records as paid out. The derivation is stated
 * on the row itself so neither can be read as the other.
 *
 * The region head's ledger reuses the exact mechanisms the accounts band
 * already invokes — the same module-level openers, the same event names —
 * rather than opening a second doorway to the same act. The band itself mounts
 * `headless`, dropping its own duplicate "Draw an invoice" primary since the
 * region head now carries it.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useAccountPage } from '@/hooks/use-account-page';
import { useMoneyLadder } from '@/hooks/use-money-ladder';
import type { SectionKey } from '@/lib/document/desk-derivation';
import { type MoneyRung } from '@/lib/document/money-ladder';
import { money } from '@/lib/document/project-commerce';
import { AccountBand } from '../account-band';
import { openInvoiceComposer } from '../accounts/invoice-overlays';
import { openLedger } from '../command-bar';
import { FoldSeam, focusRegionHeading } from '../region/fold-seam';
import { RegionHead, type RegionLedgerEntry } from '../region/region-head';
import { RegionRule } from '../region/region-rule';
import { useRegionFold, type RegionFoldKey } from '../region/use-region-fold';
import { useRegionUnfoldRequest } from '@/hooks/use-region-unfold';
import { ProjectAuthorityBandForProject } from './project-authority-band';
import { ProjectCommerceSection } from './project-commerce-section';

/** The band's Money row is this region's index: it unfolds the region and
 *  scrolls to it. The band rides the top of the paper, so a landing at
 *  `block: 'start'` would put the money under the map that sent the reader
 *  here. The band's height is declared, so the clearance is a constant. */
const SEAM_CLEARANCE = { scrollMarginTop: 'var(--doc-landing-clear)' };

const HEADING_ID = 'money-region-heading';
const BODY_ID = 'money-region-body';

/** One rung. `figure` is null while its source has not answered — a tier that
 *  stated a number and later softened it would be the same lie, briefly. */
function Rung({
  name,
  figure,
  meaning,
}: {
  name: string;
  figure: string | null;
  meaning: string;
}) {
  return (
    <li className="border-t border-[var(--doc-ink-border)] pt-2">
      <p className="text-[12.5px] text-[var(--color-charcoal)]">
        {name}
        {figure ? ` · ${figure}` : ''}
      </p>
      <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
        {meaning}
      </span>
    </li>
  );
}

/** A rung's printed figure: the money and the words that qualify it, or the
 *  rung's honest state when it has no figure to print. */
function figureOf(rung: MoneyRung): string | null {
  if (rung.cents == null) return rung.note || null;
  return rung.note ? `${money(rung.cents)} ${rung.note}` : money(rung.cents);
}

export function MoneyRegion({
  projectId,
  projectName,
  clientName,
  activeSection,
  tableSeam = false,
}: {
  projectId: string;
  projectName?: string;
  clientName?: string | null;
  activeSection?: SectionKey | null;
  /** W4b — on the Worktable's Delivery table money is reference, not the work:
   *  the region stands as its seam and unfolds in place to exactly this body. */
  tableSeam?: boolean;
}) {
  // R108 — the one derivation the spine's running index also reads, so the
  // index can never summarise a ladder this region disagrees with.
  const {
    ladder,
    authority,
    committedCents,
    draftScopeCount,
    committedSettled,
    settled: ladderSettled,
  } = useMoneyLadder(projectId);
  const accountQuery = useAccountPage(projectId);

  // The same word the accounts band uses for this act, derived the same way.
  const changeOnly = activeSection === 'install' || activeSection === 'care';

  const account = accountQuery.data ?? null;
  const accountFailed = Boolean(accountQuery.isError);
  const accountSettled = !accountQuery.isLoading && !accountFailed;

  // The account's own quiet test. A region that folds on authority/plan/
  // committed alone would hide an overdue invoice on a project that never
  // executed an instrument — the money that is actually chasing the designer.
  // The milestone rows the accounts band renders are the only invoice/
  // receivable signal this region already holds: a milestone carrying an
  // invoice_id has had money drawn against it, and an unpaid 'outstanding'
  // milestone is a receivable whether or not its invoice row was read here.
  const accountMilestones = account?.milestones ?? [];
  const invoicesDrawn = accountMilestones.filter((m) => m.invoice_id != null).length;
  const receivableCount = accountMilestones.filter(
    (m) => !m.paid_at && m.status !== 'paid' && (m.invoice_id != null || m.status === 'outstanding'),
  ).length;
  const accountQuiet = invoicesDrawn === 0 && receivableCount === 0;

  // The fold default is withheld until every source the sparse test reads from
  // has settled — a default computed from a partial read could latch shut a
  // region that is actually busy, or open one that is actually quiet.
  const allSettled = ladderSettled && accountSettled;
  // C-AP-08 — the region opens when it has money to state. Any rung standing
  // at a live figure is live money; so is a receivable the accounts hold that
  // no rung reached, which is the money actually chasing the designer.
  const hasLiveMoney =
    Object.values(ladder).some((rung) => (rung.cents ?? 0) > 0) || !accountQuiet;
  const defaultFolded = allSettled ? !hasLiveMoney : null;

  // On the table the posture is DECLARED rather than derived — money is
  // reference until it is asked for — but the declaration is subject to the
  // same two laws the region's own default obeys:
  //
  //   · It waits for the reads to settle. The seam states figures ("$0
  //     authorized · no budget yet"), so a fold declared before the money
  //     was read would print a sentence it did not know and then flip. The
  //     null is `useRegionFold`'s own refusal of an unsettled default; until
  //     it settles the region stands as it does anywhere else, with each tier
  //     printing no figure rather than a wrong one.
  //   · It yields to the accounts. `accountQuiet` false means an invoice has
  //     been drawn or a milestone is outstanding — the money that is actually
  //     chasing the designer — and the table suppresses the AccountBand's own
  //     home, so a folded seam would state it nowhere at all.
  const tableFolded = allSettled ? accountQuiet : null;
  const { folded, setFolded } = useRegionFold({
    docId: projectId,
    region: (tableSeam ? 'money-table' : 'money') satisfies RegionFoldKey,
    defaultFolded: tableSeam ? tableFolded : defaultFolded,
  });

  // The running index jumps to readable content, never to a seam.
  const openMoneyRegion = useCallback(() => setFolded(false), [setFolded]);
  useRegionUnfoldRequest('money', openMoneyRegion);

  // FoldSeam only calls onUnfold; it unmounts on the caller's re-render and so
  // cannot move focus itself. Land focus on the heading once the body (and its
  // heading) is actually on the page.
  const wasFolded = useRef(folded);
  useEffect(() => {
    if (wasFolded.current && !folded) {
      focusRegionHeading(HEADING_ID);
    }
    wasFolded.current = folded;
  }, [folded]);

  // The head and the seam speak the ladder's own words: rung 1 is `Budget`
  // and rung 3 is `Authorized`. `authority`/`committed` named neither rung
  // after SP-03, and `authority` is the word direction-a §5 sends away.
  const headStatus = authority
    ? `${money(authority.remainingCents)} remaining · ${money(committedCents)} authorized`
    : 'no budget yet';
  // The table's seam states the same two figures as one sentence: what has been
  // authorized, against the budget it is being spent out of.
  const seamSummary = tableSeam
    ? authority
      ? `${money(committedCents)} authorized of ${money(authority.authorizedCents)} budget`
      : `${money(committedCents)} authorized · no budget yet`
    : authority
      ? `${money(authority.authorizedCents)} budget · ${money(committedCents)} authorized`
      : `no budget yet · ${money(committedCents)} authorized`;

  const ledger: RegionLedgerEntry[] = [
    // R74b — draw an invoice for THIS engagement: the anti-wizard composer,
    // milestones/time/FF&E pulled through pre-scoped. Same opener the accounts
    // band's own primary calls — the region head is now the single doorway.
    {
      key: 'draw-project-invoice',
      label: 'Draw an invoice',
      onClick: () => openInvoiceComposer({ projectId }),
    },
    // R81 — the Amendment: scope changes composed from the money region (the
    // margin escalation is the other doorway). The band listens for this
    // event and opens its own AmendmentSheet.
    {
      key: 'compose-project-amendment',
      // The band names this act by the section it is standing in; the region's
      // doorway to the SAME sheet must not name it differently.
      label: changeOnly ? 'Add a change' : 'Amendment',
      variant: 'secondary',
      onClick: () => window.dispatchEvent(new CustomEvent('document:compose-amendment')),
    },
    // R77 — the per-document Hours lens, same opener the band's own tertiary
    // calls.
    {
      key: 'open-project-hours',
      label: 'Hours · this project ↗',
      variant: 'tertiary',
      onClick: () => openLedger('hours', { projectId }),
    },
  ];

  if (folded) {
    return (
      <section
        aria-label="Money"
        data-index-region="money"
        className="mb-5 mt-[var(--doc-region-gap)]"
        style={SEAM_CLEARANCE}
      >
        <RegionRule weight="mid" />
        <FoldSeam
          headingId={HEADING_ID}
          bodyId={BODY_ID}
          name="Money"
          summary={seamSummary}
          onUnfold={() => setFolded(false)}
          surfaceKey="accounts"
          regionKey="money-head"
        />
      </section>
    );
  }

  return (
    <section
      aria-label="Money"
      data-index-region="money"
      className="mb-5 mt-[var(--doc-region-gap)]"
      style={SEAM_CLEARANCE}
    >
      <RegionRule />
      <RegionHead
        headingId={HEADING_ID}
        name="Money"
        status={headStatus}
        eyebrow="The money · one region"
        surfaceKey="accounts"
        regionKey="money-head"
        actions={ledger}
        bodyId={BODY_ID}
        onFold={() => setFolded(true)}
      />

      <div id={BODY_ID}>
        <ol className="mt-3 space-y-2">
          <Rung
            name="Budget"
            figure={figureOf(ladder.budget)}
            meaning="What the client has agreed to fund"
          />
          <Rung
            name="Plan"
            figure={figureOf(ladder.plan)}
            meaning="What the plan intends to spend"
          />
          <Rung
            name="Authorized"
            figure={figureOf(ladder.authorized)}
            meaning="What is contractually owed to makers"
          />
          <Rung
            name="Moved"
            figure={figureOf(ladder.moved)}
            meaning="Committed, not yet paid out"
          />
          <Rung name="Owed" figure={figureOf(ladder.owed)} meaning="The receivable" />
          <Rung
            name="Not drawn"
            figure={figureOf(ladder.notDrawn)}
            meaning="Deposits and holdbacks not yet drawn"
          />
        </ol>

        <p className="mt-3 max-w-2xl text-[11px] leading-relaxed text-[var(--text-muted)]">
          Budget &rarr; plan &rarr; authorized &rarr; moved. Moved is what is ordered and
          not yet paid out &mdash; not the contractually owed total above it.
          {committedSettled && draftScopeCount > 0
            ? ` ${draftScopeCount} trade ${draftScopeCount === 1 ? 'scope' : 'scopes'} still in draft, counted in neither.`
            : ''}
        </p>

        <div className="mt-4">
          <ProjectAuthorityBandForProject projectId={projectId} allowAddendum />
          <ProjectCommerceSection
            projectId={projectId}
            projectName={projectName}
            clientName={clientName ?? undefined}
          />
          <AccountBand
            projectId={projectId}
            clientName={clientName}
            activeSection={activeSection}
            headless
          />
        </div>
      </div>
    </section>
  );
}
