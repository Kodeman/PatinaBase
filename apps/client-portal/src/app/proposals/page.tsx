'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import type { Proposal } from '@patina/supabase';
import { formatCurrency } from '@patina/shared';
import { useClientProposals, partitionProposals } from '@/hooks/use-proposals-client';
import { commercialSummaryFromProposal } from '@/lib/commercial-documents';
import { StrataMark } from '@/components/strata-mark';
import { QueryFailure } from '@/components/query-failure';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const KIND_LABEL = {
  legacy: 'Proposal',
  design_services: 'Design services',
  furnishings_authorization: 'Furnishings authorization',
  service_addendum: 'Service addendum',
} as const;

const STATE_LABEL = {
  draft: 'Draft',
  sent: 'Awaiting your review',
  client_signed: 'Signed by you · awaiting studio',
  executed: 'Executed',
  declined: 'Declined',
  expired: 'Expired',
  superseded: 'Superseded',
} as const;

export default function ClientProposalsPage() {
  const { data, isLoading, isError, refetch } = useClientProposals();
  const { pending, accepted, archived } = partitionProposals(data);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="type-page-title">Your Documents</h1>
      <p className="type-body mt-2">
        Review proposals, design-services agreements, and named furnishings authorizations from your studio.
      </p>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
        </div>
      )}

      {isError && !isLoading && (
        <QueryFailure
          className="mt-8"
          title="Unable to load proposals"
          message="Your proposals are still there, but they could not be opened just now."
          onRetry={refetch}
        />
      )}

      {!isLoading &&
        !isError &&
        pending.length === 0 &&
        accepted.length === 0 &&
        archived.length === 0 && (
          <div className="py-16 text-center">
            <p className="type-body-small">
              No documents yet. Your studio will send them here when they&rsquo;re ready for your review.
            </p>
          </div>
        )}

      {pending.length > 0 && (
        <section className="mt-8">
          <h2 className="type-meta mb-4 text-[var(--accent-primary)]">
            Awaiting your review ({pending.length})
          </h2>
          <ul className="space-y-0">
            {pending.map((p) => (
              <ProposalRow key={p.id} proposal={p} />
            ))}
          </ul>
        </section>
      )}

      {pending.length > 0 && (accepted.length > 0 || archived.length > 0) && <StrataMark variant="mini" />}

      {accepted.length > 0 && (
        <section className="mt-8">
          <h2 className="type-meta mb-4 text-patina-sage">Signed &amp; executed ({accepted.length})</h2>
          <ul className="space-y-0">
            {accepted.map((p) => (
              <ProposalRow key={p.id} proposal={p} />
            ))}
          </ul>
        </section>
      )}

      {archived.length > 0 && (
        <section className="mt-8">
          <h2 className="type-meta mb-4">Archive ({archived.length})</h2>
          <ul className="space-y-0">
            {archived.map((p) => (
              <ProposalRow key={p.id} proposal={p} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ProposalRow({ proposal }: { proposal: Proposal }) {
  const commercial = commercialSummaryFromProposal(proposal);
  const showAmount = commercial.kind === 'legacy' || commercial.kind === 'furnishings_authorization';
  return (
    <li>
      <Link
        href={`/proposals/${proposal.id}`}
        className="block border-b border-[var(--border-default)] py-5 no-underline transition hover:bg-[var(--bg-surface)]"
      >
        <div className="flex items-baseline justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="type-meta text-[var(--text-muted)]">
              {KIND_LABEL[commercial.kind]} · {STATE_LABEL[commercial.state]}
              {commercial.sentAt && ` · sent ${formatDate(commercial.sentAt)}`}
            </p>
            <h3 className="font-heading text-lg text-[var(--text-primary)]">{proposal.title}</h3>
            {proposal.description && (
              <p className="type-body-small mt-1 truncate text-[var(--text-muted)]">
                {proposal.description}
              </p>
            )}
          </div>
          <div className="text-right">
            {showAmount && (
              <p className="font-heading text-base text-[var(--text-primary)]">
                {formatCurrency(proposal.total_amount || 0)}
              </p>
            )}
            {proposal.valid_until && commercial.state !== 'executed' && (
              <p className="type-meta-small mt-0.5 text-[var(--text-muted)]">
                Expires {formatDate(proposal.valid_until)}
              </p>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
