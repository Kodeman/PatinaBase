'use client';

/**
 * The money ladder, read once. R108 — the Money region and the spine's running
 * index print the same six rungs off the same derivation, so a correction to
 * one can never leave the index reporting a figure the region it points at
 * disagrees with.
 *
 * Every read here is one React Query already holds under the same key with the
 * same args, so a second caller on the same document is a cache hit, not a
 * second fetch. Two of the six (`usePurchaseOrders`, `useProjectInvoices`)
 * carry no `enabled` gate of their own, which is why callers that only
 * sometimes print money mount this hook behind a conditional child rather than
 * calling it and discarding the result.
 */

import { useMemo } from 'react';
import { useProjectInvoices, usePurchaseOrders } from '@patina/supabase';
import {
  useProjectBillingAuthority,
  useProjectInstruments,
  useTradeScopes,
  useWorkingBudget,
} from '@/hooks/use-commercial-documents';
import type { ProjectBillingAuthority } from '@/lib/document/commercial-documents';
import { deriveMoneyLadder, type MoneyLadder } from '@/lib/document/money-ladder';

export interface MoneyLadderRead {
  ladder: MoneyLadder;
  /** The billing authority row itself — the head and the seam state two of its
   *  figures beside the ladder. */
  authority: ProjectBillingAuthority | null;
  /** Executed instruments and trade scopes, in cents — the `Authorized` rung. */
  committedCents: number;
  /** Trade scopes still in draft: counted in no rung, and said so. */
  draftScopeCount: number;
  /** The instruments/scopes read alone has answered. */
  committedSettled: boolean;
  /** Every source behind the ladder has answered. */
  settled: boolean;
  /** At least one source behind the ladder failed. */
  failed: boolean;
}

export function useMoneyLadder(projectId: string): MoneyLadderRead {
  const authorityQuery = useProjectBillingAuthority(projectId);
  const budgetQuery = useWorkingBudget(projectId);
  const instrumentsQuery = useProjectInstruments(projectId);
  const tradeScopesQuery = useTradeScopes(projectId);
  const purchaseOrdersQuery = usePurchaseOrders({ projectId });
  const invoicesQuery = useProjectInvoices(projectId);

  const authority = authorityQuery.data ?? null;
  const authorityFailed = Boolean(authorityQuery.error);
  const authoritySettled = !authorityQuery.isLoading && !authorityFailed;

  const version = budgetQuery.data?.version ?? null;
  const budgetFailed = Boolean(budgetQuery.error);
  const budgetSettled = !budgetQuery.isLoading && !budgetFailed;
  // project_budget_versions.target_total_cents is stamped only when a version
  // publishes (00414's publish RPC), so a draft's stored total is stale. The
  // rows the grid renders are the honest source for the region's figure.
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

  const purchaseOrdersFailed = Boolean(purchaseOrdersQuery.error);
  const purchaseOrdersSettled = !purchaseOrdersQuery.isLoading && !purchaseOrdersFailed;
  const invoicesFailed = Boolean(invoicesQuery.error);
  const invoicesSettled = !invoicesQuery.isLoading && !invoicesFailed;

  const purchaseOrderRows = purchaseOrdersQuery.data;
  const invoiceRows = invoicesQuery.data;
  const authorizedCents = authority ? authority.authorizedCents : null;
  const planLineCount = planLines.length;
  const versionNumber = version?.version ?? null;

  const ladder = useMemo(
    () =>
      deriveMoneyLadder({
        budget: {
          settled: authoritySettled,
          failed: authorityFailed,
          authorizedCents,
        },
        plan: {
          settled: budgetSettled,
          failed: budgetFailed,
          versionNumber,
          lineCount: planLineCount,
          targetCents: planCents,
        },
        authorized: {
          settled: committedSettled,
          failed: committedFailed,
          executedCount,
          committedCents,
        },
        purchaseOrders: {
          settled: purchaseOrdersSettled,
          failed: purchaseOrdersFailed,
          rows: purchaseOrderRows ?? [],
        },
        invoices: {
          settled: invoicesSettled,
          failed: invoicesFailed,
          rows: invoiceRows ?? [],
        },
      }),
    [
      authorizedCents,
      authorityFailed,
      authoritySettled,
      budgetFailed,
      budgetSettled,
      versionNumber,
      planCents,
      planLineCount,
      committedCents,
      committedFailed,
      committedSettled,
      executedCount,
      purchaseOrderRows,
      purchaseOrdersFailed,
      purchaseOrdersSettled,
      invoiceRows,
      invoicesFailed,
      invoicesSettled,
    ],
  );

  return {
    ladder,
    authority,
    committedCents,
    draftScopeCount,
    committedSettled,
    settled:
      authoritySettled &&
      budgetSettled &&
      committedSettled &&
      purchaseOrdersSettled &&
      invoicesSettled,
    failed:
      authorityFailed ||
      budgetFailed ||
      committedFailed ||
      purchaseOrdersFailed ||
      invoicesFailed,
  };
}
