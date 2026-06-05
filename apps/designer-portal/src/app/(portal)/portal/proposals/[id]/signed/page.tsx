'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProposal } from '@/hooks/use-proposals';
import { useActivateProposal, createBrowserClient } from '@patina/supabase';
import { DetailRow } from '@/components/portal/detail-row';
import { Button } from '@/components/ui/controls';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';

type ConfirmationState = 'idle' | 'sending' | 'sent' | 'failed';

export default function SignedProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const hydrated = useHydrated();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposal, isLoading } = useProposal(id) as { data: any; isLoading: boolean };
  const activateProposal = useActivateProposal();
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState>('idle');

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || isLoading) return <LoadingStrata />;
  if (!proposal) {
    return (
      <p className="type-body py-16 text-center text-[var(--text-muted)]">
        Proposal not found.
      </p>
    );
  }

  const signedDate = proposal.signed_at
    ? new Date(proposal.signed_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : proposal.accepted_at
      ? new Date(proposal.accepted_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : 'Unknown';

  const total = ((proposal.total_amount || 0) / 100).toLocaleString();

  return (
    <div className="pt-8">
      {/* Success state */}
      <div className="py-8 text-center">
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-2xl"
          style={{
            background: 'rgba(122,155,118,0.1)',
            color: 'var(--color-sage)',
          }}
        >
          &#10003;
        </div>
        <h1
          className="mb-1"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: '1.6rem',
            color: 'var(--text-primary)',
          }}
        >
          Proposal Signed
        </h1>
        <p className="type-label-secondary">
          {proposal.signed_by_name || proposal.client?.full_name || 'Client'} signed on {signedDate}
        </p>
      </div>

      {/* What's Next */}
      <div className="mx-auto max-w-[520px]">
        <div className="border-t border-[var(--border-subtle)] pt-6">
          <h3
            className="mb-4"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 500,
              fontSize: '1.25rem',
              lineHeight: 1.35,
            }}
          >
            What&rsquo;s Next?
          </h3>

          {/* Activate Project CTA */}
          {proposal.project_id ? (
            <div
              className="mb-4 rounded-md border p-5"
              style={{
                background: 'rgba(122,155,118,0.04)',
                borderColor: 'rgba(122,155,118,0.15)',
              }}
            >
              <div className="type-label mb-1">Project Activated</div>
              <p
                className="mb-4"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.82rem',
                  color: 'var(--text-body)',
                }}
              >
                This proposal has been activated as a live project. All rooms,
                FF&E items, phases, and payment milestones have been created.
              </p>
              <Button
                variant="primary"
                onClick={() => router.push(`/portal/projects/${proposal.project_id}`)}
                className="!bg-[var(--color-sage)]"
              >
                Go to Project &rarr;
              </Button>
            </div>
          ) : (
            <div
              className="mb-4 rounded-md border p-5"
              style={{
                background: 'rgba(122,155,118,0.04)',
                borderColor: 'rgba(122,155,118,0.15)',
              }}
            >
              <div className="type-label mb-1">Activate as Live Project</div>
              <p
                className="mb-3"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.82rem',
                  color: 'var(--text-body)',
                }}
              >
                Rooms, FF&E schedule, phases, payment milestones, and scope
                boundaries will be created automatically from the proposal data.
                Zero re-entry.
              </p>
              <div className="mb-4">
                <label
                  className="mb-1 block"
                  style={{
                    fontFamily: 'var(--font-meta)',
                    fontSize: '0.58rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-muted)',
                  }}
                >
                  Project Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-[3px] border border-[var(--border-default)] bg-white px-3 py-2 font-body text-sm text-[var(--text-primary)] outline-none"
                />
              </div>
              <Button
                variant="primary"
                disabled={activating}
                onClick={async () => {
                  setActivating(true);
                  setActivationError(null);
                  try {
                    const projectId = await activateProposal.mutateAsync({
                      proposalId: id,
                      startDate,
                    });
                    router.push(`/portal/projects/${projectId}`);
                  } catch (err) {
                    console.error('Activation failed:', err);
                    setActivationError(
                      err instanceof Error ? err.message : 'Activation failed. Please try again.'
                    );
                    setActivating(false);
                  }
                }}
                className="!bg-[var(--color-sage)]"
              >
                {activating ? 'Activating...' : 'Activate Project →'}
              </Button>
              {activationError && (
                <p
                  className="mt-3 rounded-[3px] border px-3 py-2"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.78rem',
                    color: 'var(--color-terracotta, #C77B6E)',
                    background: 'rgba(199,123,110,0.06)',
                    borderColor: 'rgba(199,123,110,0.25)',
                  }}
                >
                  Activation failed: {activationError}
                </p>
              )}
            </div>
          )}

          {/* Download / Send cards */}
          <div className="flex gap-4">
            <a
              href={`/portal/proposals/${id}/preview?print=1`}
              target="_blank"
              rel="noreferrer"
              className="min-w-[200px] flex-1 cursor-pointer rounded-md border border-[var(--color-pearl)] p-4 no-underline transition hover:border-[var(--color-sage)]"
            >
              <div className="type-label mb-0.5" style={{ fontSize: '0.85rem' }}>
                Download PDF
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                }}
              >
                Opens print view (save as PDF)
              </p>
            </a>
            <button
              type="button"
              disabled={confirmation === 'sending'}
              onClick={async () => {
                setConfirmation('sending');
                try {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const supabase = createBrowserClient() as any;
                  const { error } = await supabase.functions.invoke(
                    'proposal-sign-confirmation',
                    { body: { proposalId: id } }
                  );
                  setConfirmation(error ? 'failed' : 'sent');
                } catch {
                  setConfirmation('failed');
                }
              }}
              className="min-w-[200px] flex-1 cursor-pointer rounded-md border border-[var(--color-pearl)] p-4 text-left transition hover:border-[var(--color-sage)] disabled:cursor-wait"
            >
              <div className="type-label mb-0.5" style={{ fontSize: '0.85rem' }}>
                Send Confirmation
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                }}
              >
                {confirmation === 'idle' && 'Email signed copy to client'}
                {confirmation === 'sending' && 'Sending…'}
                {confirmation === 'sent' && 'Sent ✓'}
                {confirmation === 'failed' && 'Send failed — try again'}
              </p>
            </button>
          </div>

          {/* Signed document details */}
          <div className="mt-6 border-t border-[var(--border-subtle)] pt-4">
            <div
              className="mb-2"
              style={{
                fontFamily: 'var(--font-meta)',
                fontSize: '0.62rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
              }}
            >
              Signed Document Details
            </div>
            <DetailRow
              label="Signed By"
              value={proposal.signed_by_name || proposal.client?.full_name || 'Client'}
            />
            <DetailRow label="Signed At" value={signedDate} />
            {proposal.signed_ip && (
              <DetailRow label="IP Address" value={proposal.signed_ip} />
            )}
            <DetailRow
              label="Version"
              value={`v${proposal.version || 1}.0 \u2014 ${proposal.parent_proposal_id ? 'Revision' : 'Original'}`}
            />
            <DetailRow label="Value" value={`$${total}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
