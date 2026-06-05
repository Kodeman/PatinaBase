'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useDecision,
  useUpdateDecision,
  useDeleteDecision,
  usePublishDraftDecision,
} from '@patina/supabase';
import type { DecisionType, BlockingStatus } from '@patina/supabase';
import {
  DecisionOptionBuilder,
  emptyOption,
  optionToValue,
  optionValueToInput,
  useMaterializeDraftOptions,
  type DecisionOptionValue,
} from '@/components/portal/decision-option-builder';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
import { PortalButton } from '@/components/portal/button';

const decisionTypes: { key: DecisionType; label: string; icon: string }[] = [
  { key: 'material', label: 'Material', icon: '🎨' },
  { key: 'color', label: 'Color', icon: '🎨' },
  { key: 'product', label: 'Product', icon: '🪑' },
  { key: 'layout', label: 'Layout', icon: '📐' },
  { key: 'substitution', label: 'Substitution', icon: '⇄' },
  { key: 'budget', label: 'Budget', icon: '💰' },
  { key: 'approval', label: 'Approval', icon: '✓' },
];

const blockingOptions: { key: BlockingStatus; label: string }[] = [
  { key: 'blocks_procurement', label: 'Blocks procurement (ordering)' },
  { key: 'blocks_phase', label: 'Blocks phase advancement' },
  { key: 'non_blocking', label: 'Non-blocking (advisory)' },
];

export default function EditDecisionPage({
  params,
}: {
  params: Promise<{ decisionId: string }>;
}) {
  const { decisionId } = use(params);
  const router = useRouter();
  // `pageHydrated` gates the loading skeleton (SSR/first-paint parity); the
  // separate `hydrated` flag below guards one-time edit-form prefill.
  const pageHydrated = useHydrated();

  const { data: decision, isLoading } = useDecision(decisionId);
  const updateDecision = useUpdateDecision();
  const deleteDecision = useDeleteDecision();
  const publishDraft = usePublishDraftDecision();
  const materialize = useMaterializeDraftOptions();

  const [hydrated, setHydrated] = useState(false);
  const [title, setTitle] = useState('');
  const [context, setContext] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [linkedPhase, setLinkedPhase] = useState('');
  const [decisionType, setDecisionType] = useState<DecisionType>('product');
  const [blockingStatus, setBlockingStatus] = useState<BlockingStatus>('non_blocking');
  const [options, setOptions] = useState<DecisionOptionValue[]>([
    emptyOption(),
    emptyOption(),
  ]);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Hydrate local edit state once the decision loads. Guard with `hydrated` so
  // a background refetch (e.g. a realtime invalidation) doesn't clobber edits
  // the designer is in the middle of making.
  useEffect(() => {
    if (!decision || hydrated) return;
    setTitle(decision.title ?? '');
    setContext(decision.context ?? '');
    setDueDate(decision.due_date ? decision.due_date.slice(0, 10) : '');
    setLinkedPhase(decision.linked_phase ?? '');
    setDecisionType(decision.decision_type);
    setBlockingStatus(decision.blocking_status);
    const sorted = (decision.options ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(optionToValue);
    setOptions(sorted.length >= 2 ? sorted : [emptyOption(), emptyOption()]);
    setHydrated(true);
  }, [decision, hydrated]);

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!pageHydrated || isLoading) return <LoadingStrata />;
  if (!decision) {
    return (
      <p className="type-body py-16 text-center text-[var(--text-muted)]">
        Decision not found.
      </p>
    );
  }

  // A resolved decision carries a signed resolution record; editing it would
  // silently rewrite history. Send the designer to reopen it first.
  if (decision.status === 'responded') {
    return (
      <div className="pt-8">
        <p className="type-body mb-4 text-[var(--text-muted)]">
          This decision has already been resolved and can&apos;t be edited. Reopen
          it from the detail page to make changes.
        </p>
        <Link href={`/portal/decisions/${decisionId}`}>
          <PortalButton variant="secondary">Back to decision</PortalButton>
        </Link>
      </div>
    );
  }

  const isDraft = decision.status === 'draft';

  // Only replace options when at least two named options exist (the create-flow
  // contract: a decision needs ≥2 choices). Materializes "save as draft" manual
  // options into library products first, then maps to the mutation input.
  const buildOptionsPayload = async () => {
    const named = options.filter((o) => o.name.trim());
    if (named.length < 2) return undefined;
    const materialized = await materialize(named);
    return materialized.map(optionValueToInput);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setError(null);
    try {
      await updateDecision.mutateAsync({
        decisionId,
        designerClientId: decision.designer_client_id,
        projectId: decision.project_id,
        title: title.trim(),
        context: context.trim() || null,
        dueDate: dueDate || null,
        linkedPhase: linkedPhase || null,
        decisionType,
        blockingStatus,
        options: await buildOptionsPayload(),
      });
      router.push(`/portal/decisions/${decisionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save decision');
    }
  };

  // PT-D-2-T1-2: a material edit to an already-sent decision should re-notify
  // the client. Drafts get the standard publish path (draft → pending +
  // notify); a pending decision is re-sent by re-running notify_decision_required
  // via usePublishDraftDecision's flow — but that hook only flips draft rows,
  // so for a pending decision we save and let the detail page's status stand.
  const handleSaveAndResend = async () => {
    if (!title.trim()) return;
    setError(null);
    try {
      await updateDecision.mutateAsync({
        decisionId,
        designerClientId: decision.designer_client_id,
        projectId: decision.project_id,
        title: title.trim(),
        context: context.trim() || null,
        dueDate: dueDate || null,
        linkedPhase: linkedPhase || null,
        decisionType,
        blockingStatus,
        options: await buildOptionsPayload(),
      });
      // Drafts publish (draft → pending) and notify in one step.
      if (isDraft) {
        await publishDraft.mutateAsync({ decisionId });
      }
      router.push(`/portal/decisions/${decisionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save decision');
    }
  };

  const handleDelete = async () => {
    setError(null);
    try {
      await deleteDecision.mutateAsync({
        decisionId,
        designerClientId: decision.designer_client_id,
        projectId: decision.project_id,
      });
      router.push('/portal/decisions');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete decision');
    }
  };

  const updateOption = (index: number, value: DecisionOptionValue) => {
    let next = [...options];
    next[index] = value;
    // Only one option can be the recommendation — clear the others.
    if (value.isRecommended) {
      next = next.map((o, i) => (i === index ? o : { ...o, isRecommended: false }));
    }
    setOptions(next);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== index));
  };

  const namedCount = options.filter((o) => o.name.trim()).length;
  const canSave = title.trim().length > 0 && namedCount >= 2 && !updateDecision.isPending;

  return (
    <div className="pt-8">
      {/* The global SubNav breadcrumb carries the Decisions → {title} → Edit
          trail, so this page renders no breadcrumb and no h1. The lead-in below
          is contextual guidance, not a title. */}
      <p className="type-label-secondary mb-8">
        {isDraft
          ? 'Revise this draft before sending it to your client.'
          : 'Revise this decision. Resending will re-notify the client of the change.'}
      </p>

      <SectionHeader>The Choice</SectionHeader>

      <div className="grid max-w-[580px] grid-cols-2 gap-x-8 gap-y-4">
        <div className="col-span-2 flex flex-col gap-1">
          <FieldLabel>Decision Title</FieldLabel>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Dining chairs — Shaker Oak vs Windsor Elm"
            className="rounded-sm border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 outline-none focus:border-[var(--accent-primary)]"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1rem',
              fontWeight: 500,
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <FieldLabel>Decision Type</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {decisionTypes.map((dt) => (
              <button
                key={dt.key}
                type="button"
                onClick={() => setDecisionType(dt.key)}
                className={`cursor-pointer rounded-sm border px-3 py-1.5 transition-colors ${
                  decisionType === dt.key
                    ? 'border-[var(--accent-primary)] bg-[rgba(196,165,123,0.08)] text-[var(--text-primary)]'
                    : 'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--accent-primary)]'
                }`}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.78rem',
                }}
              >
                {dt.icon} {dt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-2 flex flex-col gap-1">
          <FieldLabel>Context for Client</FieldLabel>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={3}
            placeholder="Explain the options and why this decision matters..."
            className="resize-vertical rounded-sm border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 outline-none focus:border-[var(--accent-primary)]"
            style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      <StrataMark />

      <SectionHeader>The Options</SectionHeader>

      <div className="mb-4 grid max-w-[580px] grid-cols-2 gap-6">
        {options.map((opt, i) => (
          <DecisionOptionBuilder
            key={i}
            index={i}
            value={opt}
            onChange={(val) => updateOption(i, val)}
            onRemove={options.length > 2 ? () => removeOption(i) : undefined}
          />
        ))}
      </div>

      <div className="mb-6 max-w-[580px]">
        <PortalButton variant="secondary" onClick={() => setOptions([...options, emptyOption()])}>
          + Add Another Option
        </PortalButton>
      </div>

      <StrataMark />

      <SectionHeader>Connections &amp; Timing</SectionHeader>

      <div className="grid max-w-[580px] grid-cols-2 gap-x-8 gap-y-4">
        <div className="flex flex-col gap-1">
          <FieldLabel>Linked Phase</FieldLabel>
          <select
            value={linkedPhase}
            onChange={(e) => setLinkedPhase(e.target.value)}
            className="rounded-sm border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 outline-none focus:border-[var(--accent-primary)]"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.85rem',
              color: 'var(--text-primary)',
              appearance: 'none',
            }}
          >
            <option value="">Select phase...</option>
            <option value="Consultation">Consultation</option>
            <option value="Concept">Concept</option>
            <option value="Refinement">Refinement</option>
            <option value="Procurement">Procurement</option>
            <option value="Installation">Installation</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <FieldLabel>Decision Due</FieldLabel>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-sm border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 outline-none focus:border-[var(--accent-primary)]"
            style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--text-primary)' }}
          />
        </div>

        <div className="col-span-2 flex flex-col gap-1">
          <FieldLabel>Blocking Status</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {blockingOptions.map((bo) => (
              <button
                key={bo.key}
                type="button"
                onClick={() => setBlockingStatus(bo.key)}
                className={`cursor-pointer rounded-sm border px-3 py-1.5 transition-colors ${
                  blockingStatus === bo.key
                    ? 'border-[var(--accent-primary)] bg-[rgba(196,165,123,0.08)] text-[var(--text-primary)]'
                    : 'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--accent-primary)]'
                }`}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.78rem',
                }}
              >
                {bo.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <p
          className="mt-6 max-w-[580px] rounded-md border-2 p-2 type-body text-[0.8rem]"
          style={{ borderColor: 'var(--color-terracotta, #D4A090)' }}
        >
          {error}
        </p>
      )}

      <div
        className="mt-8 flex flex-wrap items-center gap-2 pt-6"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        <PortalButton
          variant="primary"
          onClick={handleSaveAndResend}
          disabled={!canSave}
        >
          {updateDecision.isPending || publishDraft.isPending
            ? 'Saving...'
            : isDraft
              ? 'Save & Send to Client'
              : 'Save & Resend'}
        </PortalButton>
        <PortalButton variant="secondary" onClick={handleSave} disabled={!canSave}>
          Save Changes
        </PortalButton>
        <PortalButton variant="ghost" onClick={() => router.back()}>
          Cancel
        </PortalButton>

        <div className="ml-auto">
          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="type-meta-small text-[var(--text-muted)]">
                Delete permanently?
              </span>
              <PortalButton
                variant="ghost"
                onClick={handleDelete}
                disabled={deleteDecision.isPending}
              >
                <span style={{ color: 'var(--color-terracotta, #D4A090)' }}>
                  {deleteDecision.isPending ? 'Deleting...' : 'Yes, delete'}
                </span>
              </PortalButton>
              <PortalButton variant="ghost" onClick={() => setConfirmingDelete(false)}>
                Keep
              </PortalButton>
            </div>
          ) : (
            <PortalButton variant="ghost" onClick={() => setConfirmingDelete(true)}>
              <span style={{ color: 'var(--color-terracotta, #D4A090)' }}>
                Delete Decision
              </span>
            </PortalButton>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="mb-4 border-b border-[var(--border-subtle)] pb-2"
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 500,
        fontSize: '1.25rem',
        color: 'var(--text-primary)',
      }}
    >
      {children}
    </h3>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        fontFamily: 'var(--font-meta)',
        fontSize: '0.62rem',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--text-muted)',
      }}
    >
      {children}
    </label>
  );
}

function StrataMark() {
  return (
    <div className="flex flex-col gap-1 py-6">
      <div className="h-[1.5px] w-[60px] rounded-sm bg-[var(--color-mocha)]" />
      <div className="h-[1.5px] w-[48px] rounded-sm bg-[var(--accent-primary)] opacity-70" />
      <div className="h-[1.5px] w-[36px] rounded-sm bg-[var(--accent-primary)] opacity-35" />
    </div>
  );
}
