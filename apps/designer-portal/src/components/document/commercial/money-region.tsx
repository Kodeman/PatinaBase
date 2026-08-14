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
 */

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
import { ProjectAuthorityBandForProject } from './project-authority-band';
import { ProjectCommerceSection } from './project-commerce-section';

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
}: {
  projectId: string;
  projectName?: string;
  clientName?: string | null;
  activeSection?: SectionKey | null;
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

  return (
    <section aria-label="Money" className="mb-5">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
        Money · one region
      </p>
      {authority && (
        <p className="mt-1.5 font-heading text-[1.35rem] font-medium leading-tight tracking-[-0.01em] text-[var(--color-charcoal)]">
          Design authority · remaining {money(authority.remainingCents)}
        </p>
      )}

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
        />
      </div>
    </section>
  );
}
