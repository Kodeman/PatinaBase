'use client';

/**
 * The money region (Wave 4 · W2) — one section, one dominant figure, and four
 * tiers in dependency order: authority → plan → committed → moved. It absorbs
 * the four bands that used to stand apart on the project document: the design
 * authority band, the working budget, the authorizations & trade scopes
 * ledger, and the accounts.
 *
 * Every tier reads the SAME hook the detail surface below it already calls, so
 * the region composes figures the page had already paid for rather than
 * opening new reads.
 *
 * Tier 3 and tier 4 are different money and must never be swapped: tier 3 is
 * what executed instruments contractually owe; tier 4 is the accounts'
 * committed figure — the CLIENT value of schedule lines at ordered and later.
 * Tier 4 is not a disbursement: nothing in the data models money leaving, so
 * the tier never claims funds were released. The product calls both figures
 * "committed" in different places, so the flow caption states the derivation
 * on the page.
 *
 * The region head's ledger reuses the exact mechanisms the accounts band
 * already invokes — the same module-level openers, the same event names —
 * rather than opening a second doorway to the same act. The band itself mounts
 * `headless`, dropping its own duplicate "Draw an invoice" primary since the
 * region head now carries it.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useAccountPage } from '@/hooks/use-account-page';
import {
  useProjectBillingAuthority,
  useProjectInstruments,
  useTradeScopes,
  useWorkingBudget,
} from '@/hooks/use-commercial-documents';
import type { SectionKey } from '@/lib/document/desk-derivation';
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
      <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
        {meaning}
      </span>
    </li>
  );
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
  const authorityQuery = useProjectBillingAuthority(projectId);
  const budgetQuery = useWorkingBudget(projectId);
  const instrumentsQuery = useProjectInstruments(projectId);
  const tradeScopesQuery = useTradeScopes(projectId);
  const accountQuery = useAccountPage(projectId);

  const authority = authorityQuery.data ?? null;
  const authorityFailed = Boolean(authorityQuery.error);
  const authoritySettled = !authorityQuery.isLoading && !authorityFailed;

  const version = budgetQuery.data?.version ?? null;
  const budgetFailed = Boolean(budgetQuery.error);
  const budgetSettled = !budgetQuery.isLoading && !budgetFailed;
  // project_budget_versions.target_total_cents is stamped only when a version
  // publishes (00414's publish RPC), so a draft's stored total is stale. The
  // rows the grid below renders are the honest source for the region's figure.
  const planLines = version?.lines ?? [];
  const planCents = planLines.reduce((sum, line) => sum + line.targetCents, 0);

  const committedFailed = Boolean(instrumentsQuery.error || tradeScopesQuery.error);
  const committedSettled =
    !instrumentsQuery.isLoading && !tradeScopesQuery.isLoading && !committedFailed;
  const executedInstruments = (instrumentsQuery.data ?? []).filter(
    (instrument) => instrument.state === 'executed',
  );
  const executedScopes = (tradeScopesQuery.data ?? []).filter(
    (scope) => scope.state === 'executed',
  );
  const draftScopeCount = (tradeScopesQuery.data ?? []).filter(
    (scope) => scope.state === 'draft',
  ).length;
  const executedCount = executedInstruments.length + executedScopes.length;
  const committedCents =
    executedInstruments.reduce((sum, instrument) => sum + instrument.totalAmountCents, 0) +
    executedScopes.reduce((sum, scope) => sum + scope.clientPriceCents, 0);

  // The same word the accounts band uses for this act, derived the same way.
  const changeOnly = activeSection === 'install' || activeSection === 'care';

  const account = accountQuery.data ?? null;
  const accountFailed = Boolean(accountQuery.isError);
  const accountSettled = !accountQuery.isLoading && !accountFailed;

  const authorityFigure = authorityFailed
    ? 'could not be read'
    : authority
      ? `${money(authority.authorizedCents)} authorized`
      : authoritySettled
        ? 'no design authority recorded yet'
        : null;
  // A version row is created before its lines are derived (00422's
  // derive_working_budget_draft), so a line-less version is a real state — and
  // summing nothing into "$0" would state a plan that does not exist.
  const planFigure = budgetFailed
    ? 'could not be read'
    : version && planLines.length > 0
      ? `${money(planCents)} working budget v${version.version}`
      : version
        ? `working budget v${version.version} · no rooms yet`
        : budgetSettled
          ? 'no working budget yet'
          : null;
  const committedFigure = committedFailed
    ? 'could not be read'
    : !committedSettled
      ? null
      : executedCount === 0
        ? 'nothing executed yet'
        : `${money(committedCents)} · ${executedCount} ${
            executedCount === 1 ? 'instrument' : 'instruments'
          } executed — authorizations and trade scopes`;
  const movedFigure = accountFailed
    ? 'could not be read'
    : !accountSettled
      ? null
      : account && account.committedCents > 0
        ? `${money(account.committedCents)} in motion — ordered through installed`
        : 'nothing in motion yet';

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
  const allSettled = authoritySettled && budgetSettled && committedSettled && accountSettled;
  const defaultFolded = allSettled
    ? committedCents === 0 &&
      executedCount === 0 &&
      (!version || planLines.length === 0) &&
      accountQuiet
    : null;

  // On the table the posture is declared, not derived: money is reference until
  // it is asked for, so the seam needs no read to settle before it can stand.
  const { folded, setFolded } = useRegionFold({
    docId: projectId,
    region: (tableSeam ? 'money-table' : 'money') satisfies RegionFoldKey,
    defaultFolded: tableSeam ? true : defaultFolded,
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

  const headStatus = authority
    ? `${money(authority.remainingCents)} remaining · ${money(committedCents)} committed`
    : 'no authority yet';
  // The table's seam states the same two figures as one sentence: what has been
  // committed, against the authority it is being spent out of.
  const seamSummary = tableSeam
    ? authority
      ? `${money(committedCents)} committed of ${money(authority.authorizedCents)} authority`
      : `${money(committedCents)} committed · no authority yet`
    : authority
      ? `${money(authority.authorizedCents)} authorized · ${money(committedCents)} committed`
      : `no authority yet · ${money(committedCents)} committed`;

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
      <section aria-label="Money" data-index-region="money" className="mb-5">
        <RegionRule />
        <FoldSeam
          headingId={HEADING_ID}
          bodyId={BODY_ID}
          name="Design authority"
          summary={seamSummary}
          onUnfold={() => setFolded(false)}
          surfaceKey="accounts"
          regionKey="money-head"
        />
      </section>
    );
  }

  return (
    <section aria-label="Money" data-index-region="money" className="mb-5">
      <RegionRule />
      <RegionHead
        headingId={HEADING_ID}
        name="Design authority"
        status={headStatus}
        eyebrow="Money · one region"
        surfaceKey="accounts"
        regionKey="money-head"
        actions={ledger}
        bodyId={BODY_ID}
        onFold={() => setFolded(true)}
      />

      <div id={BODY_ID}>
        <ol className="mt-3 space-y-2">
          <Rung
            name="Authority"
            figure={authorityFigure}
            meaning="What the client has agreed to fund"
          />
          <Rung name="Plan" figure={planFigure} meaning="What the plan intends to spend" />
          <Rung
            name="Committed"
            figure={committedFigure}
            meaning="What is contractually owed"
          />
          <Rung
            name="Moved"
            figure={movedFigure}
            meaning="The accounts’ committed figure — client value of lines at ordered and later; not funds disbursed"
          />
        </ol>

        <p className="mt-3 max-w-2xl text-[10.5px] leading-relaxed text-[var(--text-muted)]">
          Authority → plan → committed → moved. Moved is the accounts&rsquo; committed figure
          — the client value of schedule lines at ordered, in production, shipped, delivered
          or installed — not funds disbursed, and not the contractually owed total above it.
          {committedSettled && draftScopeCount > 0
            ? ` ${draftScopeCount} trade ${draftScopeCount === 1 ? 'scope' : 'scopes'} still in draft, counted in neither.`
            : ''}{' '}
          Absorbs today&rsquo;s four separate bands: design authority, working budget,
          authorizations &amp; trade scopes, the accounts.
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
