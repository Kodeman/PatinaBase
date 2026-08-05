'use client';

import Link from 'next/link';
import { FileSignature } from 'lucide-react';
import { formatCurrency } from '@patina/shared';
import type { Proposal } from '@patina/supabase';
import { partitionProposals, useClientProposals } from '@/hooks/use-proposals-client';
import { useClientCommercialDocument } from '@/hooks/use-commercial-client';
import {
  commercialSummaryFromProposal,
  type CommercialDocumentKind,
} from '@/lib/commercial-documents';

const KIND_LABEL: Partial<Record<CommercialDocumentKind, string>> = {
  design_services: 'Design services agreement',
  furnishings_authorization: 'Furnishings authorization',
  service_addendum: 'Design services addendum',
  trade_scope: 'Trade scope',
};

/**
 * Instrument cards for commercial documents still awaiting the client's
 * signature on this project — the commercial rail's entry point back into
 * the sign flow. Pulls from useClientProposals' pending group (commercial
 * state 'sent') rather than a dedicated RPC; useClientSelections only tells
 * us the project's origin, not which documents are outstanding.
 */
export function AwaitingSignatureCards({ projectId }: { projectId: string }) {
  const { data } = useClientProposals();
  const { pending } = partitionProposals(data);
  // Filter on the SUMMARY's projectId, not the raw row's. A furnishings
  // authorization is minted straight from the schedule and never runs through
  // activate_proposal_as_project, so proposals.project_id stays NULL on it —
  // its binding to the project lives in project_commercial_documents.
  // list_client_proposals now coalesces the two into the projected `project_id`
  // key, and commercialSummaryFromProposal is where that key is read.
  // Filtering on the raw column showed a client no furnishings authorization
  // to sign, ever.
  const documents = pending.filter((proposal) => {
    const commercial = commercialSummaryFromProposal(proposal);
    return commercial.projectId === projectId && commercial.kind !== 'legacy';
  });

  if (documents.length === 0) return null;

  return (
    <section className="mt-8" data-testid="awaiting-signature-cards">
      <p className="type-meta text-[var(--accent-primary)]">Awaiting your signature</p>
      <div className="mt-3 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
        {documents.map((proposal) => (
          <AwaitingSignatureCard key={proposal.id} proposal={proposal} />
        ))}
      </div>
    </section>
  );
}

function AwaitingSignatureCard({ proposal }: { proposal: Proposal }) {
  const commercial = commercialSummaryFromProposal(proposal);
  // list_client_proposals projects total_amount (cents) directly, so the
  // total needs no extra round trip. It does NOT project deposit_percent —
  // there is no per-document deposit figure on the pending-list row — so the
  // deposit line reads the bundle RPC instead. Bounded to the (small) set of
  // cards actually awaiting signature on this project, never a list-wide
  // fetch.
  const bundle = useClientCommercialDocument(proposal.id);
  // A trade scope carries no per-document deposit percent (get_client_
  // commercial_document_bundle's depositPercent is a furnishings-only figure)
  // — its deposit is simply the first draw in its draw schedule (sortOrder 0,
  // "Deposit · on signature"). adaptTradeScopeDraws already sorts ascending,
  // so draws[0] is that draw whenever one exists.
  const depositRequiredCents =
    bundle.data?.furnishings?.depositRequiredCents ?? bundle.data?.tradeScope?.draws[0]?.amountCents;
  const totalAmountCents =
    typeof proposal.total_amount === 'number' ? proposal.total_amount : null;

  return (
    <Link
      href={`/proposals/${proposal.id}/sign`}
      className="flex items-center justify-between gap-4 py-4 no-underline transition hover:bg-[var(--bg-surface)]"
      data-testid="awaiting-signature-card"
    >
      <div className="flex items-center gap-3">
        <FileSignature className="h-4 w-4 shrink-0 text-[var(--accent-primary)]" aria-hidden />
        <div>
          <p className="type-body-small text-[var(--text-primary)]">{proposal.title}</p>
          <p className="type-meta-small mt-0.5 text-[var(--text-muted)]">
            {KIND_LABEL[commercial.kind] ?? 'Document'}
            {totalAmountCents !== null && totalAmountCents > 0
              ? ` · ${formatCurrency(totalAmountCents)}`
              : ''}
          </p>
          {depositRequiredCents !== undefined && depositRequiredCents > 0 && (
            <p className="type-meta-small mt-0.5 text-[var(--text-muted)]">
              Deposit {formatCurrency(depositRequiredCents)} on signature
            </p>
          )}
        </div>
      </div>
      <span className="type-meta text-[var(--accent-primary)]">Review &amp; sign</span>
    </Link>
  );
}
