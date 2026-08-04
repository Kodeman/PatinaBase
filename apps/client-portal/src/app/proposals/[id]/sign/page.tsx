'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useClientProposal } from '@/hooks/use-proposals-client';
import {
  invalidateSignedCommercialDocument,
  useClientCommercialDocument,
} from '@/hooks/use-commercial-client';
import { commercialSummaryFromProposal } from '@/lib/commercial-documents';
import { useAuth } from '@/hooks/use-auth';
import { proposalClientEvents } from '@/lib/analytics/events';
import { QueryFailure } from '@/components/query-failure';

export default function ClientProposalSignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: proposal, isLoading, isError, refetch } = useClientProposal(id);
  const { data: commercialBundle } = useClientCommercialDocument(id);
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <QueryFailure
          title="Unable to load this proposal"
          message="The proposal could not be checked for signing just now."
          onRetry={refetch}
        />
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="type-body-small">Proposal not found.</p>
        <Link
          href="/proposals"
          className="mt-4 inline-flex items-center gap-1 type-meta text-[var(--accent-primary)] no-underline hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to proposals
        </Link>
      </div>
    );
  }

  const commercial = commercialBundle?.document ?? commercialSummaryFromProposal(proposal);
  const isSignable = commercial.state === 'sent';
  if (!isSignable) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="type-body-small">
          This proposal isn&rsquo;t available to sign right now.
        </p>
        <Link
          href={`/proposals/${id}`}
          className="mt-4 inline-flex items-center gap-1 type-meta text-[var(--accent-primary)] no-underline hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to proposal
        </Link>
      </div>
    );
  }

  const isPassedExpiry =
    !!proposal.valid_until &&
    !Number.isNaN(new Date(proposal.valid_until).getTime()) &&
    new Date(proposal.valid_until).getTime() < Date.now();

  if (isPassedExpiry) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="type-body-small">
          This proposal has expired and can no longer be signed. Contact your designer to renew it.
        </p>
        <Link
          href={`/proposals/${id}`}
          className="mt-4 inline-flex items-center gap-1 type-meta text-[var(--accent-primary)] no-underline hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to proposal
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed || name.trim().length < 2 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/proposals/${id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedByName: name.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        projectId?: string | null;
        notificationDelivery?: { state?: string };
      };
      if (!res.ok) {
        throw new Error(body.error || 'Failed to sign proposal.');
      }
      await invalidateSignedCommercialDocument(queryClient, id, body.projectId ?? null);
      proposalClientEvents.signed({ proposalId: id, signedByName: name.trim() });
      router.push(
        body.notificationDelivery?.state === 'pending_retry'
          ? `/proposals/${id}?delivery=pending_retry`
          : `/proposals/${id}`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign proposal.');
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link
        href={`/proposals/${id}`}
        className="mb-6 inline-flex items-center gap-1.5 type-meta no-underline transition hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to proposal
      </Link>

      <h1 className="type-page-title">
        {commercial.kind === 'furnishings_authorization'
          ? `Authorize ${commercial.waveName ?? 'furnishings'}`
          : commercial.kind === 'design_services'
            ? 'Sign Design Services Agreement'
            : commercial.kind === 'service_addendum'
              ? 'Sign Design Services Addendum'
              : 'Sign Proposal'}
      </h1>
      <p className="type-body mt-2">
        {commercial.kind === 'furnishings_authorization'
          ? `By signing, you authorize only the named furnishing lines, quantities, and client prices in “${proposal.title}”.`
          : commercial.kind === 'design_services' || commercial.kind === 'service_addendum'
            ? `By signing, you accept the services, signed role rates, design authorization ceiling, retainer, and terms in “${proposal.title}”. The agreement becomes effective only after the studio countersigns.`
            : `By signing, you accept the scope, investment, and terms outlined in “${proposal.title}”.`}
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <div>
          <label
            htmlFor="signed-name"
            className="type-meta block mb-2"
            style={{ textTransform: 'uppercase', letterSpacing: '0.12em' }}
          >
            Type your full name
          </label>
          <input
            id="signed-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder={user?.name || 'Full name'}
            className="w-full rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-3 font-heading text-xl text-[var(--text-primary)] placeholder:font-sans placeholder:text-base placeholder:text-[var(--text-muted)] focus-visible:focus-ring"
            required
            minLength={2}
          />
          <p className="type-meta-small mt-2 text-[var(--text-muted)]">
            Your typed name acts as your electronic signature.
          </p>
        </div>

        <label className="flex items-start gap-3 type-body-small">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-[var(--border-default)]"
            required
          />
          <span className="text-[var(--text-body)]">
            {commercial.kind === 'furnishings_authorization'
              ? 'I authorize the studio to procure only the named lines at the quantities and client prices shown. I understand any required deposit is a separate payment step.'
              : commercial.kind === 'design_services' || commercial.kind === 'service_addendum'
                ? 'I agree to these design-services terms and understand my signature alone does not authorize work until the studio countersigns.'
                : 'I agree to the scope and investment in this proposal.'}
          </span>
        </label>

        {error && (
          <p
            className="rounded-[3px] border border-patina-terracotta/30 px-3 py-2 type-body-small text-patina-terracotta"
            style={{ background: 'rgba(199, 123, 110, 0.06)' }}
          >
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting || !agreed || name.trim().length < 2}
            className="inline-flex items-center gap-2 rounded-[3px] bg-patina-charcoal px-6 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting
              ? 'Signing…'
              : commercial.kind === 'furnishings_authorization'
                ? 'Sign authorization'
                : 'Sign and accept'}
          </button>
          <Link
            href={`/proposals/${id}`}
            className="inline-flex items-center rounded-[3px] border border-[var(--border-default)] px-5 py-3 text-sm text-[var(--text-muted)] no-underline transition hover:text-[var(--text-primary)]"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
