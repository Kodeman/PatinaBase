'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useDecision,
  useUpdateDecisionStatus,
  useDeleteDecision,
  usePublishDraftDecision,
  useDecisionOverrides,
  useProjectFFEItems,
  useClient,
} from '@patina/supabase';
import type { DecisionType, BlockingStatus, DecisionOverride } from '@patina/supabase';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { PortalButton } from '@/components/portal/button';
import { OverrideDecisionModal } from '@/components/portal/override-decision-modal';
import { DecisionCommentThread } from '@/components/portal/decision-comment-thread';
import { useAuth } from '@/hooks/use-auth';

const typeLabels: Record<DecisionType, string> = {
  material: 'Material / Color',
  color: 'Color',
  product: 'Product Selection',
  layout: 'Layout Approval',
  substitution: 'Substitution',
  budget: 'Budget Change',
  approval: 'Phase Approval',
};

const blockingLabels: Record<BlockingStatus, string> = {
  blocks_procurement: 'Blocks procurement (ordering)',
  blocks_phase: 'Blocks phase advancement',
  non_blocking: 'Non-blocking (advisory)',
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { color: string; bg: string }> = {
    draft: { color: 'var(--text-muted)', bg: 'rgba(139, 115, 85, 0.08)' },
    pending: { color: 'var(--color-gold)', bg: 'rgba(232, 197, 71, 0.1)' },
    responded: { color: 'var(--color-sage)', bg: 'rgba(122, 155, 118, 0.1)' },
    expired: { color: 'var(--color-terracotta)', bg: 'rgba(199, 123, 110, 0.1)' },
  };
  const s = styles[status] ?? styles.pending;
  return (
    <span
      className="rounded-sm px-2 py-0.5"
      style={{
        fontFamily: 'var(--font-meta)',
        fontSize: '0.55rem',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: s.color,
        background: s.bg,
      }}
    >
      {status === 'responded' ? 'Resolved' : status}
    </span>
  );
}

function formatDate(date: string | null): string {
  if (!date) return '\u2014';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDays(sentAt: string | null, respondedAt: string | null): string {
  if (!sentAt || !respondedAt) return '\u2014';
  const ms = new Date(respondedAt).getTime() - new Date(sentAt).getTime();
  const hours = ms / (1000 * 60 * 60);
  if (hours < 24) {
    const mins = Math.round((hours % 1) * 60);
    return `${Math.floor(hours)} hours ${mins} minutes`;
  }
  return `${Math.round(hours / 24 * 10) / 10} days`;
}

export default function DecisionDetailPage({
  params,
}: {
  params: Promise<{ decisionId: string }>;
}) {
  const { decisionId } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { data: decision, isLoading } = useDecision(decisionId);
  const updateStatus = useUpdateDecisionStatus();
  const deleteDecision = useDeleteDecision();
  const publishDraft = usePublishDraftDecision();
  const { data: overrides } = useDecisionOverrides(decisionId);
  const { data: ffeItemsRaw } = useProjectFFEItems(decision?.project_id ?? '');
  const { data: decisionClient } = useClient(decision?.designer_client_id ?? '');
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (isLoading) return <LoadingStrata />;
  if (!decision) {
    return (
      <p className="type-body py-16 text-center text-[var(--text-muted)]">
        Decision not found.
      </p>
    );
  }

  const selectedOption = decision.options?.find((o) => o.selected);

  // Direct threads require a registered client profile. Without one the legacy
  // /messages route dead-ends, so disable the conversation action (CLI-10).
  const canMessageClient = !!(
    decisionClient?.client?.id || decisionClient?.client_id
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ffeItems = (Array.isArray(ffeItemsRaw) ? ffeItemsRaw : []) as any[];
  const blockedItems = decision.project_id
    ? ffeItems.filter((it) => it?.blocked_by_decision_id === decision.id)
    : [];

  // Both responded→pending (reopen) and expired→pending (recovery) are legal
  // moves under the 00171 guard; passing currentStatus lets the hook reject any
  // illegal transition before the round trip.
  const handleReopen = () => {
    updateStatus.mutate({
      decisionId: decision.id,
      status: 'pending',
      currentStatus: decision.status,
    });
  };

  const handleDelete = async () => {
    try {
      await deleteDecision.mutateAsync({
        decisionId: decision.id,
        designerClientId: decision.designer_client_id,
        projectId: decision.project_id,
      });
      router.push('/portal/decisions');
    } catch (err) {
      console.error('Failed to delete decision:', err);
      setConfirmingDelete(false);
    }
  };

  // Publish a draft → flips to pending, stamps sent_at, and fires
  // notify_decision_required. The hook's WHERE clause only matches draft rows,
  // so this is a no-op for anything already sent.
  const handlePublish = () => {
    publishDraft.mutate({ decisionId: decision.id });
  };

  const canPublish = decision.status === 'draft' && (decision.options?.length ?? 0) >= 2;

  return (
    <div className="pt-8">
      {/* Breadcrumb */}
      <div className="type-meta mb-6">
        <Link
          href="/portal/decisions"
          className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]"
        >
          Decisions
        </Link>
        <span className="mx-2">&rarr;</span>
        <span>{decision.title}</span>
      </div>

      {/* Header */}
      <div className="mb-2 flex items-center gap-3">
        <StatusBadge status={decision.status} />
        {decision.sent_at && (
          <span className="type-meta-small">{'\u00B7'} Sent {formatDate(decision.sent_at)}</span>
        )}
      </div>
      <h1
        className="mb-1"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.5rem',
          fontWeight: 400,
          color: 'var(--text-primary)',
        }}
      >
        {decision.title}
      </h1>
      <p className="type-label-secondary mb-8">
        {typeLabels[decision.decision_type] ?? 'Decision'} {'\u00B7'} {decision.linked_phase ?? 'No phase linked'}
      </p>

      {/* Draft banner \u2014 the client can't see a draft until it's sent. */}
      {decision.status === 'draft' && (
        <div
          className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-md px-4 py-3"
          style={{
            background: 'rgba(139, 115, 85, 0.06)',
            border: '1px solid rgba(139, 115, 85, 0.18)',
          }}
        >
          <p
            className="type-body"
            style={{ fontSize: '0.82rem', color: 'var(--text-body)' }}
          >
            This decision is a draft. Your client can&apos;t see it until you send it.
          </p>
          <PortalButton
            variant="primary"
            onClick={handlePublish}
            disabled={!canPublish || publishDraft.isPending}
            title={
              canPublish
                ? undefined
                : 'Add at least two options before sending to the client.'
            }
          >
            {publishDraft.isPending ? 'Sending...' : 'Send to Client'}
          </PortalButton>
        </div>
      )}

      <div className="grid grid-cols-1 gap-10 md:grid-cols-[1fr_320px]">
        {/* Left column */}
        <div>
          {/* Context */}
          {decision.context && (
            <div className="mb-6">
              <FieldLabel>Context</FieldLabel>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.88rem',
                  color: 'var(--text-body)',
                  lineHeight: 1.55,
                }}
              >
                {decision.context}
              </p>
            </div>
          )}

          {/* Options */}
          <SectionHeader>Options Presented</SectionHeader>
          <div className="mb-6 grid grid-cols-2 gap-4">
            {decision.options
              ?.sort((a, b) => a.sort_order - b.sort_order)
              .map((option) => (
                <div
                  key={option.id}
                  className="relative rounded-md p-4 transition-all"
                  style={{
                    border: option.selected
                      ? '1.5px solid var(--color-sage)'
                      : '1.5px solid var(--color-pearl)',
                    background: option.selected
                      ? 'rgba(122, 155, 118, 0.03)'
                      : 'transparent',
                    opacity: decision.status === 'responded' && !option.selected ? 0.5 : 1,
                  }}
                >
                  {option.selected && (
                    <span
                      className="absolute right-3 top-3 rounded-sm px-1.5 py-0.5"
                      style={{
                        fontFamily: 'var(--font-meta)',
                        fontSize: '0.52rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: 'var(--color-sage)',
                        background: 'rgba(122, 155, 118, 0.1)',
                      }}
                    >
                      {'\u2713'} Selected
                    </span>
                  )}

                  {/* Image placeholder */}
                  {option.image_url ? (
                    <div
                      className="mb-3 rounded"
                      style={{
                        width: '100%',
                        height: 64,
                        backgroundImage: `url(${option.image_url})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    />
                  ) : (
                    <div
                      className="mb-3 rounded"
                      style={{
                        width: '100%',
                        height: 64,
                        background: 'linear-gradient(135deg, var(--color-pearl), var(--color-off-white))',
                      }}
                    />
                  )}

                  <div className="type-label" style={{ fontSize: '0.85rem' }}>
                    {option.name}
                  </div>

                  {option.price != null && (
                    <div
                      className="mt-0.5"
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 600,
                        fontSize: '0.88rem',
                      }}
                    >
                      ${(option.price / 100).toFixed(0)}
                      {option.quantity > 1 && (
                        <span
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontWeight: 400,
                            fontSize: '0.68rem',
                            color: 'var(--text-muted)',
                            marginLeft: 4,
                          }}
                        >
                          {'\u00D7'} {option.quantity} = ${((option.price * option.quantity) / 100).toFixed(0)}
                        </span>
                      )}
                    </div>
                  )}

                  {option.designer_note && (
                    <p
                      className="mt-1"
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        lineHeight: 1.5,
                      }}
                    >
                      {option.designer_note}
                    </p>
                  )}

                  {option.is_recommended && (
                    <span
                      className="mt-2 inline-block rounded-sm px-1.5 py-0.5"
                      style={{
                        fontFamily: 'var(--font-meta)',
                        fontSize: '0.52rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: 'var(--accent-primary)',
                        background: 'rgba(196, 165, 123, 0.08)',
                      }}
                    >
                      {'\u2605'} Your Recommendation
                    </span>
                  )}
                </div>
              ))}
          </div>

          {/* Client's Note */}
          {selectedOption?.client_note && (
            <div className="mb-6">
              <FieldLabel>Client&apos;s Note</FieldLabel>
              <p
                className="mt-1"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.88rem',
                  fontStyle: 'italic',
                  color: 'var(--color-aged-oak)',
                  lineHeight: 1.55,
                }}
              >
                &ldquo;{selectedOption.client_note}&rdquo;
              </p>
            </div>
          )}

          {/* Resolution Record */}
          {decision.status === 'responded' && selectedOption && (
            <>
              <SectionHeader>Resolution Record</SectionHeader>
              <div className="mb-6 space-y-2">
                <DetailRow label="Selected" value={selectedOption.name} />
                <DetailRow label="Selected At" value={formatDate(decision.responded_at)} />
                {selectedOption.price != null && selectedOption.quantity > 0 && (
                  <DetailRow
                    label="Value"
                    value={`$${((selectedOption.price * selectedOption.quantity) / 100).toFixed(0)}`}
                  />
                )}
                <DetailRow
                  label="Response Time"
                  value={formatDays(decision.sent_at, decision.responded_at)}
                />
              </div>
            </>
          )}

          {/* Override audit */}
          {overrides && overrides.length > 0 && (
            <>
              <SectionHeader>Override audit</SectionHeader>
              <div className="mb-6 flex flex-col gap-2">
                {overrides.map((ov: DecisionOverride) => (
                  <div
                    key={ov.id}
                    className="rounded-md border px-3 py-2"
                    style={{ borderColor: 'var(--border-default)' }}
                  >
                    <div
                      className="flex items-baseline justify-between gap-2"
                      style={{ fontSize: '0.78rem' }}
                    >
                      <span
                        className="type-meta-small"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {user && ov.acted_by === user.id ? 'You' : 'Designer'}
                      </span>
                      <span
                        className="type-meta-small"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {ov.consent_method.replace('_', ' ')} {'·'}{' '}
                        {formatDate(ov.created_at)}
                      </span>
                    </div>
                    <p
                      className="mt-1 type-body"
                      style={{
                        fontSize: '0.82rem',
                        color: 'var(--text-body)',
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {ov.consent_evidence}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Discussion */}
          <SectionHeader>Discussion</SectionHeader>
          <div className="mb-6">
            <DecisionCommentThread decisionId={decision.id} />
          </div>
        </div>

        {/* Right column: Connections + Actions */}
        <div>
          <SectionHeader>Connections</SectionHeader>
          <div className="space-y-2">
            {decision.linked_phase && (
              <ConnectionItem
                icon={'\uD83D\uDCC5'}
                label="Phase"
                value={decision.linked_phase}
              />
            )}
            <ConnectionItem
              icon={'\u26A1'}
              label="Blocking"
              value={blockingLabels[decision.blocking_status]}
            />
            {decision.due_date && (
              <ConnectionItem
                icon={'\u23F0'}
                label="Due"
                value={formatDate(decision.due_date).split(',').slice(0, 2).join(',')}
              />
            )}
          </div>

          {blockedItems.length > 0 && (
            <>
              <div className="mt-6">
                <SectionHeader>Blocking</SectionHeader>
                <div className="flex flex-col gap-2">
                  {blockedItems.map((it) => {
                    const name =
                      it?.product?.name ?? it?.item_name ?? 'FF&E item';
                    const roomName = it?.room?.name as string | undefined;
                    return (
                      <div
                        key={it.id}
                        className="flex items-center justify-between gap-2 rounded px-3 py-2"
                        style={{
                          background: 'rgba(199, 123, 110, 0.05)',
                          border: '1px solid rgba(199, 123, 110, 0.18)',
                          fontFamily: 'var(--font-body)',
                          fontSize: '0.78rem',
                          color: 'var(--text-body)',
                        }}
                      >
                        <span className="truncate" style={{ color: 'var(--text-primary)' }}>
                          {name}
                        </span>
                        {roomName && (
                          <span
                            className="type-meta-small"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {roomName}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <div className="my-6 flex flex-col gap-1 py-2">
            <div className="h-[1.5px] w-[60px] rounded-sm bg-[var(--color-mocha)]" />
            <div className="h-[1.5px] w-[48px] rounded-sm bg-[var(--accent-primary)] opacity-70" />
            <div className="h-[1.5px] w-[36px] rounded-sm bg-[var(--accent-primary)] opacity-35" />
          </div>

          {/* Actions */}
          <SectionHeader>Actions</SectionHeader>
          <div className="flex flex-wrap gap-2">
            {/* Draft → publish CTA. Sends the decision to the client and fires
                the decision_required notification (PT-D-2-T1-2). */}
            {decision.status === 'draft' && (
              <PortalButton
                variant="primary"
                onClick={handlePublish}
                disabled={!canPublish || publishDraft.isPending}
                title={
                  canPublish
                    ? undefined
                    : 'Add at least two options before sending to the client.'
                }
              >
                {publishDraft.isPending ? 'Sending...' : 'Send to Client'}
              </PortalButton>
            )}
            {/* A resolved decision carries a signed record; editing happens via
                reopen. Drafts, pending, and expired decisions are editable. */}
            {decision.status !== 'responded' && (
              <Link href={`/portal/decisions/${decision.id}/edit`}>
                <PortalButton variant="secondary">Edit</PortalButton>
              </Link>
            )}
            {decision.project_id && (
              <Link href={`/portal/projects/${decision.project_id}`}>
                <PortalButton variant="secondary">View in Project</PortalButton>
              </Link>
            )}
            {decision.designer_client_id &&
              (canMessageClient ? (
                <Link href={`/portal/clients/${decision.designer_client_id}/messages`}>
                  <PortalButton variant="secondary">View Conversation</PortalButton>
                </Link>
              ) : (
                <PortalButton
                  variant="secondary"
                  disabled
                  title="This client has no registered profile yet — messaging isn't available."
                >
                  View Conversation
                </PortalButton>
              ))}
            {decision.status === 'pending' && (decision.options?.length ?? 0) > 0 && (
              <PortalButton
                variant="secondary"
                onClick={() => setOverrideOpen(true)}
              >
                Override on client&apos;s behalf
              </PortalButton>
            )}
            {decision.status === 'responded' && (
              <PortalButton
                variant="ghost"
                onClick={handleReopen}
                disabled={updateStatus.isPending}
              >
                {updateStatus.isPending ? 'Reopening...' : 'Reopen Decision'}
              </PortalButton>
            )}
          </div>

          {/* Destructive action — kept visually separate with an inline confirm
              so a stray click can't delete a decision and its audit trail. */}
          <div className="mt-4">
            {confirmingDelete ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="type-meta-small text-[var(--text-muted)]">
                  Delete this decision and its history?
                </span>
                <PortalButton
                  variant="ghost"
                  onClick={handleDelete}
                  disabled={deleteDecision.isPending}
                >
                  <span style={{ color: 'var(--color-terracotta)' }}>
                    {deleteDecision.isPending ? 'Deleting...' : 'Yes, delete'}
                  </span>
                </PortalButton>
                <PortalButton
                  variant="ghost"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Keep
                </PortalButton>
              </div>
            ) : (
              <PortalButton
                variant="ghost"
                onClick={() => setConfirmingDelete(true)}
              >
                <span style={{ color: 'var(--color-terracotta)' }}>
                  Delete Decision
                </span>
              </PortalButton>
            )}
          </div>
        </div>
      </div>

      {overrideOpen && (
        <OverrideDecisionModal
          decision={decision}
          options={decision.options ?? []}
          onClose={() => setOverrideOpen(false)}
        />
      )}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="mb-3 border-b border-[var(--border-subtle)] pb-2"
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 500,
        fontSize: '1.1rem',
        color: 'var(--text-primary)',
      }}
    >
      {children}
    </h3>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-meta)',
        fontSize: '0.62rem',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--text-muted)',
        marginBottom: '0.4rem',
      }}
    >
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 py-1" style={{ fontSize: '0.85rem' }}>
      <span
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.62rem',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--text-muted)',
          paddingTop: '0.12rem',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-body)',
          color: 'var(--text-body)',
          lineHeight: 1.5,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ConnectionItem({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded px-3 py-2"
      style={{
        background: 'rgba(139, 156, 173, 0.04)',
        border: '1px solid rgba(139, 156, 173, 0.12)',
        fontFamily: 'var(--font-body)',
        fontSize: '0.78rem',
        color: 'var(--text-body)',
      }}
    >
      <span style={{ fontSize: '0.7rem', color: 'var(--color-dusty-blue)' }}>{icon}</span>
      <strong style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{label}:</strong> {value}
    </div>
  );
}
