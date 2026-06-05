'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useDecision,
  useDecisionRealtime,
  useUpdateDecisionStatus,
  useUpdateDecision,
  useDeleteDecision,
  usePublishDraftDecision,
  useDecisionOverrides,
  useProjectFFEItems,
  useClient,
} from '@patina/supabase';
import type { DecisionType, BlockingStatus, DecisionOverride } from '@patina/supabase';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
import { Button } from '@/components/ui/controls';
import { PageActionBar } from '@/components/portal/page-action-bar';
import { decisionStatusToTone } from '@/components/ui/controls';
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
  const hydrated = useHydrated();
  const { user } = useAuth();
  const { data: decision, isLoading } = useDecision(decisionId);
  // Live updates: when the client views, selects an option, or comments, the
  // spine's realtime channel invalidates the decision + comment caches so this
  // page reflects the response without a manual refresh (PT-D-2-T1-5).
  useDecisionRealtime(decisionId);
  const updateStatus = useUpdateDecisionStatus();
  const updateDecision = useUpdateDecision();
  const deleteDecision = useDeleteDecision();
  const publishDraft = usePublishDraftDecision();
  const { data: overrides } = useDecisionOverrides(decisionId);
  const { data: ffeItemsRaw } = useProjectFFEItems(decision?.project_id ?? '');
  const { data: decisionClient } = useClient(decision?.designer_client_id ?? '');
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [extending, setExtending] = useState(false);
  const [newDueDate, setNewDueDate] = useState('');

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || isLoading) return <LoadingStrata />;
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

  // Expired-recovery: extend the deadline and reopen in one gesture. Set the
  // new due_date first (useUpdateDecision), then run the spine's expired→pending
  // transition so the client sees a live decision again with a fresh window.
  const handleExtendAndReopen = async () => {
    if (!newDueDate) return;
    try {
      await updateDecision.mutateAsync({
        decisionId: decision.id,
        designerClientId: decision.designer_client_id,
        dueDate: newDueDate,
      });
      await updateStatus.mutateAsync({
        decisionId: decision.id,
        status: 'pending',
        currentStatus: decision.status,
      });
      setExtending(false);
      setNewDueDate('');
    } catch (err) {
      console.error('Failed to extend and reopen decision:', err);
    }
  };

  return (
    <div className="pt-8">
      {/* Page action bar \u2014 status chip + meta cluster on the left (sent date,
          type, linked phase), quick actions on the right. The global SubNav
          breadcrumb carries the decision title, so there is no h1 here. */}
      <PageActionBar
        status={{
          tone: decisionStatusToTone(decision.status),
          label: decision.status === 'responded' ? 'Resolved' : decision.status,
          dot: true,
        }}
        meta={
          <span className="type-label-secondary">
            {decision.sent_at ? `Sent ${formatDate(decision.sent_at)} \u00B7 ` : ''}
            {typeLabels[decision.decision_type] ?? 'Decision'}{' \u00B7 '}
            {decision.linked_phase ?? 'No phase linked'}
          </span>
        }
        actions={
          <>
            {decision.status !== 'responded' && (
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/portal/decisions/${decision.id}/edit`}>Edit</Link>
              </Button>
            )}
            {decision.project_id && (
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/portal/projects/${decision.project_id}`}>
                  View in Project
                </Link>
              </Button>
            )}
          </>
        }
      />

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
          <Button
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
          </Button>
        </div>
      )}

      {/* Expired banner — recover by reopening (keeps the old deadline) or
          extending to a new deadline, both via the spine's expired→pending
          transition (PT-D-2-T1-3). */}
      {decision.status === 'expired' && (
        <div
          className="mb-8 rounded-md px-4 py-3"
          style={{
            background: 'rgba(199, 123, 110, 0.06)',
            border: '1px solid rgba(199, 123, 110, 0.2)',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p
              className="type-body"
              style={{ fontSize: '0.82rem', color: 'var(--text-body)' }}
            >
              This decision expired{' '}
              {decision.due_date ? `on ${formatDate(decision.due_date).split(',').slice(0, 2).join(',')}` : ''}{' '}
              without a response. Reopen it to give your client another chance to respond.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={handleReopen}
                disabled={updateStatus.isPending}
              >
                {updateStatus.isPending ? 'Reopening...' : 'Reopen'}
              </Button>
              {!extending && (
                <Button variant="ghost" onClick={() => setExtending(true)}>
                  Extend deadline
                </Button>
              )}
            </div>
          </div>
          {extending && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="type-meta-small text-[var(--text-muted)]">
                New deadline
              </label>
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="rounded-sm border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 outline-none focus:border-[var(--accent-primary)]"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.82rem',
                  color: 'var(--text-primary)',
                }}
              />
              <Button
                variant="primary"
                onClick={handleExtendAndReopen}
                disabled={!newDueDate || updateDecision.isPending || updateStatus.isPending}
              >
                {updateDecision.isPending || updateStatus.isPending
                  ? 'Reopening...'
                  : 'Extend & reopen'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setExtending(false);
                  setNewDueDate('');
                }}
              >
                Cancel
              </Button>
            </div>
          )}
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
              <Button
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
              </Button>
            )}
            {/* Edit and View-in-Project live in the page action bar above. */}
            {decision.designer_client_id &&
              (canMessageClient ? (
                <Link href={`/portal/clients/${decision.designer_client_id}/messages`}>
                  <Button variant="secondary">View Conversation</Button>
                </Link>
              ) : (
                <Button
                  variant="secondary"
                  disabled
                  title="This client has no registered profile yet — messaging isn't available."
                >
                  View Conversation
                </Button>
              ))}
            {decision.status === 'pending' && (decision.options?.length ?? 0) > 0 && (
              <Button
                variant="secondary"
                onClick={() => setOverrideOpen(true)}
              >
                Override on client&apos;s behalf
              </Button>
            )}
            {(decision.status === 'responded' || decision.status === 'expired') && (
              <Button
                variant="ghost"
                onClick={handleReopen}
                disabled={updateStatus.isPending}
              >
                {updateStatus.isPending ? 'Reopening...' : 'Reopen Decision'}
              </Button>
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
                <Button
                  variant="ghost"
                  onClick={handleDelete}
                  disabled={deleteDecision.isPending}
                >
                  <span style={{ color: 'var(--color-terracotta)' }}>
                    {deleteDecision.isPending ? 'Deleting...' : 'Yes, delete'}
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Keep
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                onClick={() => setConfirmingDelete(true)}
              >
                <span style={{ color: 'var(--color-terracotta)' }}>
                  Delete Decision
                </span>
              </Button>
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
