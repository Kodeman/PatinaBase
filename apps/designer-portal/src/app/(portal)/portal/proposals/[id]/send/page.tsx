'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProposal, useSendProposal, useUpdateProposal } from '@/hooks/use-proposals';
import { Breadcrumb } from '@/components/portal/breadcrumb';
import { PortalButton } from '@/components/portal/button';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
import { ClientPicker } from '@/components/portal/client-picker';
import { useToast } from '@/components/portal/toast-provider';
import { proposalEvents } from '@/lib/analytics';

const EXPIRY_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '21', label: '21 days' },
  { value: '30', label: '30 days' },
  { value: '', label: 'No expiration' },
];

export default function SendProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const hydrated = useHydrated();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposal, isLoading } = useProposal(id) as { data: any; isLoading: boolean };
  const sendProposal = useSendProposal();
  const updateProposal = useUpdateProposal();
  const { toast } = useToast();

  const [recipientEmail, setRecipientEmail] = useState('');
  const [ccEmail, setCcEmail] = useState('');
  const [expiryDays, setExpiryDays] = useState('14');
  const [personalMessage, setPersonalMessage] = useState('');
  const [showAltAddress, setShowAltAddress] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const clientEmail: string | undefined = proposal?.client?.email ?? undefined;

  // Pre-fill the recipient from the linked client's email once it loads,
  // but only when the designer hasn't already typed an address.
  useEffect(() => {
    if (clientEmail) {
      setRecipientEmail((prev) => (prev ? prev : clientEmail));
    }
  }, [clientEmail]);

  const handleSend = async () => {
    if (!proposal?.client_id || !recipientEmail) return;

    setSendError(null);

    const validUntil = expiryDays
      ? new Date(Date.now() + parseInt(expiryDays) * 86400000).toISOString()
      : undefined;

    try {
      const result = await sendProposal.mutateAsync({
        proposalId: id,
        personalMessage: personalMessage || undefined,
        ccEmail: ccEmail || undefined,
        validUntil,
      });
      proposalEvents.sent({
        proposalId: id,
        hasPersonalMessage: !!personalMessage,
        hasCcEmail: !!ccEmail,
        itemCount: proposal?.items?.length ?? 0,
        totalAmount: proposal?.total_amount ?? 0,
      });
      if (!result._emailDispatched) {
        toast(
          'Proposal marked as sent, but the notification email could not be dispatched. Follow up with your client directly.',
          'warning'
        );
      }
      router.push(`/portal/proposals/${id}`);
    } catch (err) {
      console.error('Failed to send proposal:', err);
      setSendError(
        err instanceof Error
          ? err.message
          : 'Could not send the proposal. Please try again.'
      );
    }
  };

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

  const total = ((proposal.total_amount || 0) / 100).toLocaleString();

  return (
    <div className="pt-8">
      <Breadcrumb
        items={[
          { label: 'Proposals', href: '/portal/proposals' },
          { label: proposal.title, href: `/portal/proposals/${id}` },
          { label: 'Send' },
        ]}
      />

      <h1 className="type-section-head mb-1" style={{ fontSize: '1.5rem' }}>
        Send Proposal
      </h1>
      <p className="type-label-secondary mb-8">
        {proposal.title} &middot; v{proposal.version || 1}.0 &middot; ${total}
      </p>

      {/* No-client warning banner */}
      {!proposal.client_id && (
        <div
          className="mb-6 max-w-[520px] rounded-md border p-4"
          style={{
            background: 'rgba(196,124,92,0.06)',
            borderColor: 'rgba(196,124,92,0.2)',
          }}
        >
          <p
            className="mb-1"
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.62rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-terracotta)',
            }}
          >
            Link a client to send
          </p>
          <p
            className="mb-3"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.82rem',
              color: 'var(--text-body)',
            }}
          >
            This proposal isn&rsquo;t linked to a client yet. Choose the client
            it belongs to so they receive the proposal and can sign it.
          </p>
          <div className="max-w-[320px]">
            <ClientPicker
              value={null}
              onChange={(clientId) =>
                updateProposal.mutate({
                  proposalId: id,
                  updates: { client_id: clientId },
                })
              }
              placeholder="Link a client…"
            />
          </div>
        </div>
      )}

      {/* Form */}
      <div className="grid max-w-[520px] grid-cols-2 gap-x-8 gap-y-5">
        {/* Recipient — the linked client */}
        <div className="col-span-2 flex flex-col gap-1.5">
          <label className="type-meta-small">Recipient</label>
          {proposal.client_id ? (
            <div
              className="rounded border border-[var(--color-pearl)] bg-white px-3 py-2 text-[0.85rem]"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              <span className="text-[var(--text-primary)]">
                {proposal.client?.full_name || proposal.client?.email || 'Linked client'}
              </span>
              {proposal.client?.email && (
                <span className="ml-2 text-[var(--text-muted)]">
                  &middot; {proposal.client.email}
                </span>
              )}
            </div>
          ) : (
            <p className="type-label-secondary italic text-[var(--text-muted)]">
              Link a client above to set the recipient.
            </p>
          )}
          <button
            type="button"
            onClick={() => setShowAltAddress((s) => !s)}
            className="type-meta-small mt-0.5 self-start cursor-pointer border-0 bg-transparent text-[var(--accent-primary)] underline-offset-2 hover:underline"
          >
            {showAltAddress ? 'Hide alternate address' : 'Send to a different address'}
          </button>
          {showAltAddress && (
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="client@email.com"
              className="mt-1 rounded border border-[var(--color-pearl)] bg-white px-3 py-2 text-[0.85rem] outline-none focus:border-[var(--accent-primary)]"
              style={{ fontFamily: 'var(--font-body)' }}
            />
          )}
        </div>

        {/* CC */}
        <div className="flex flex-col gap-1.5">
          <label className="type-meta-small">CC (optional)</label>
          <input
            type="email"
            value={ccEmail}
            onChange={(e) => setCcEmail(e.target.value)}
            placeholder="e.g. partner@email.com"
            className="rounded border border-[var(--color-pearl)] bg-white px-3 py-2 text-[0.85rem] outline-none focus:border-[var(--accent-primary)]"
            style={{ fontFamily: 'var(--font-body)' }}
          />
        </div>

        {/* Expiry */}
        <div className="flex flex-col gap-1.5">
          <label className="type-meta-small">Expires After</label>
          <select
            value={expiryDays}
            onChange={(e) => setExpiryDays(e.target.value)}
            className="rounded border border-[var(--color-pearl)] bg-white px-3 py-2 text-[0.85rem] outline-none focus:border-[var(--accent-primary)]"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {EXPIRY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Personal message */}
        <div className="col-span-2 flex flex-col gap-1.5">
          <label className="type-meta-small">Personal Message</label>
          <textarea
            rows={6}
            value={personalMessage}
            onChange={(e) => setPersonalMessage(e.target.value)}
            placeholder="Write a personal note to your client..."
            className="resize-y rounded border border-[var(--color-pearl)] bg-white px-3 py-2 text-[0.85rem] outline-none focus:border-[var(--accent-primary)]"
            style={{ minHeight: 120, fontFamily: 'var(--font-body)' }}
          />
        </div>
      </div>

      {/* Info box */}
      <div
        className="mt-6 max-w-[520px] rounded-md border p-4"
        style={{
          background: 'rgba(139,156,173,0.06)',
          borderColor: 'rgba(139,156,173,0.15)',
        }}
      >
        <p
          className="mb-0.5"
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.62rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-dusty-blue)',
          }}
        >
          What the client will see
        </p>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.82rem',
            color: 'var(--text-body)',
          }}
        >
          A branded email with your personal message and a &ldquo;View Your
          Proposal&rdquo; button. The link opens the full proposal in their
          browser &mdash; same design, same fonts, same layout. They can sign
          digitally at the bottom. You&rsquo;ll be notified when they open,
          view, and sign.
        </p>
      </div>

      {/* Send error */}
      {sendError && (
        <div
          role="alert"
          className="mt-6 max-w-[520px] rounded-md border p-3 text-[0.82rem]"
          style={{
            background: 'rgba(196,124,92,0.06)',
            borderColor: 'rgba(196,124,92,0.2)',
            color: 'var(--color-terracotta)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {sendError}
        </div>
      )}

      {/* Actions */}
      <div className="mt-8 flex gap-2 border-t border-[var(--border-subtle)] pt-6">
        <PortalButton
          variant="primary"
          onClick={handleSend}
          disabled={!proposal.client_id || !recipientEmail || sendProposal.isPending}
          className="!bg-[var(--accent-primary)]"
        >
          {sendProposal.isPending ? 'Sending...' : 'Send Proposal \u2192'}
        </PortalButton>
        <PortalButton variant="secondary" onClick={() => router.push(`/portal/proposals/${id}`)}>
          Save &amp; Send Later
        </PortalButton>
        <PortalButton variant="ghost" onClick={() => router.push(`/portal/proposals/${id}`)}>
          Back to Editor
        </PortalButton>
      </div>
    </div>
  );
}
