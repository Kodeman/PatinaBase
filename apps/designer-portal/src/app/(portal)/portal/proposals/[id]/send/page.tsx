'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProposal, useSendProposal } from '@/hooks/use-proposals';
import { Breadcrumb } from '@/components/portal/breadcrumb';
import { PortalButton } from '@/components/portal/button';
import { LoadingStrata } from '@/components/portal/loading-strata';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposal, isLoading } = useProposal(id) as { data: any; isLoading: boolean };
  const sendProposal = useSendProposal();

  const [recipientEmail, setRecipientEmail] = useState('');
  const [ccEmail, setCcEmail] = useState('');
  const [expiryDays, setExpiryDays] = useState('14');
  const [personalMessage, setPersonalMessage] = useState('');

  // Pre-fill email from client data
  useState(() => {
    if (proposal?.client?.email) {
      setRecipientEmail(proposal.client.email);
    }
  });

  const handleSend = async () => {
    if (!recipientEmail) return;

    const validUntil = expiryDays
      ? new Date(Date.now() + parseInt(expiryDays) * 86400000).toISOString()
      : undefined;

    try {
      await sendProposal.mutateAsync({
        proposalId: id,
        personalMessage: personalMessage || undefined,
        ccEmail: ccEmail || undefined,
        validUntil,
      });
      router.push(`/portal/proposals/${id}`);
    } catch (err) {
      console.error('Failed to send proposal:', err);
    }
  };

  if (isLoading) return <LoadingStrata />;
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

      {/* Form */}
      <div className="grid max-w-[520px] grid-cols-2 gap-x-8 gap-y-5">
        {/* Recipient */}
        <div className="col-span-2 flex flex-col gap-1.5">
          <label className="type-meta-small">Recipient Email</label>
          <input
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            placeholder="client@email.com"
            className="rounded border border-[var(--color-pearl)] bg-white px-3 py-2 text-[0.85rem] outline-none focus:border-[var(--accent-primary)]"
            style={{ fontFamily: 'var(--font-body)' }}
          />
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

      {/* Actions */}
      <div className="mt-8 flex gap-2 border-t border-[var(--border-subtle)] pt-6">
        <PortalButton
          variant="primary"
          onClick={handleSend}
          disabled={!recipientEmail || sendProposal.isPending}
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
