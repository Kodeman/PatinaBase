'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useClient, useCreateDecision } from '@patina/supabase';
import type { DesignerClient, DecisionType, BlockingStatus } from '@patina/supabase';
import { DecisionOptionBuilder } from '@/components/portal/decision-option-builder';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { PortalButton } from '@/components/portal/button';

interface OptionState {
  name: string;
  imageUrl: string;
  designerNote: string;
  isRecommended: boolean;
  price: string;
}

const emptyOption = (): OptionState => ({
  name: '',
  imageUrl: '',
  designerNote: '',
  isRecommended: false,
  price: '',
});

const decisionTypes: { key: DecisionType; label: string; icon: string }[] = [
  { key: 'material', label: 'Material / Color', icon: '\uD83C\uDFA8' },
  { key: 'product', label: 'Product', icon: '\uD83E\uDE91' },
  { key: 'layout', label: 'Layout', icon: '\uD83D\uDCD0' },
  { key: 'budget', label: 'Budget', icon: '\uD83D\uDCB0' },
  { key: 'approval', label: 'Approval', icon: '\u2713' },
];

const blockingOptions: { key: BlockingStatus; label: string }[] = [
  { key: 'blocks_procurement', label: 'Blocks procurement (ordering)' },
  { key: 'blocks_phase', label: 'Blocks phase advancement' },
  { key: 'non_blocking', label: 'Non-blocking (advisory)' },
];

function parsePriceToCents(price: string): number | undefined {
  const cleaned = price.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return undefined;
  return Math.round(num * 100);
}

export default function NewDecisionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data: client, isLoading } = useClient(id) as {
    data: DesignerClient | undefined;
    isLoading: boolean;
  };
  const createDecision = useCreateDecision();

  const [title, setTitle] = useState('');
  const [context, setContext] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [linkedPhase, setLinkedPhase] = useState('');
  const [decisionType, setDecisionType] = useState<DecisionType>('product');
  const [blockingStatus, setBlockingStatus] = useState<BlockingStatus>('non_blocking');
  const [options, setOptions] = useState<OptionState[]>([emptyOption(), emptyOption()]);

  if (isLoading) return <LoadingStrata />;
  if (!client) {
    return (
      <p className="type-body py-16 text-center text-[var(--text-muted)]">
        Client not found.
      </p>
    );
  }

  const name =
    client.client?.full_name ||
    client.client_name ||
    client.client_email ||
    'Unknown Client';

  const handleSubmit = (status: 'pending' | 'draft') => {
    if (!title.trim()) return;

    createDecision.mutate(
      {
        designerClientId: id,
        title: title.trim(),
        context: context.trim() || undefined,
        dueDate: dueDate || undefined,
        linkedPhase: linkedPhase || undefined,
        decisionType,
        blockingStatus,
        status,
        options: options
          .filter((o) => o.name.trim())
          .map((o) => ({
            name: o.name.trim(),
            imageUrl: o.imageUrl || undefined,
            designerNote: o.designerNote.trim() || undefined,
            isRecommended: o.isRecommended,
            price: parsePriceToCents(o.price),
          })),
      },
      {
        onSuccess: () => router.push(`/portal/clients/${id}/messages`),
      }
    );
  };

  const updateOption = (index: number, value: OptionState) => {
    const next = [...options];
    next[index] = value;
    setOptions(next);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== index));
  };

  return (
    <div className="pt-8">
      {/* Breadcrumb */}
      <div className="type-meta mb-6">
        <Link
          href="/portal/clients"
          className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]"
        >
          Clients
        </Link>
        <span className="mx-2">&rarr;</span>
        <Link
          href={`/portal/clients/${id}`}
          className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]"
        >
          {name}
        </Link>
        <span className="mx-2">&rarr;</span>
        <span>New Decision Request</span>
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
        New Decision
      </h1>
      <p className="type-label-secondary mb-8">
        Build a structured choice for {name}. They&apos;ll see this as an interactive card
        they can respond to directly.
      </p>

      {/* Section: The Choice */}
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

      {/* Section: Options */}
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

      {/* Section: Connections & Timing */}
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

      {/* Impact preview */}
      <div
        className="mt-6 max-w-[580px] rounded-md p-4"
        style={{
          background: 'rgba(196, 165, 123, 0.04)',
          border: '1px solid rgba(196, 165, 123, 0.12)',
        }}
      >
        <div
          className="mb-1"
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.62rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--accent-primary)',
          }}
        >
          What This Decision Connects To
        </div>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.78rem',
            color: 'var(--text-body)',
            lineHeight: 1.8,
          }}
        >
          <div className="mt-1 flex items-center gap-2 rounded px-2 py-1" style={{ background: 'rgba(139, 156, 173, 0.04)', border: '1px solid rgba(139, 156, 173, 0.12)' }}>
            <span style={{ fontSize: '0.7rem' }}>{'\uD83D\uDCCB'}</span> Client: Will appear under &ldquo;Pending Decisions&rdquo; on {name}&apos;s profile
          </div>
          <div className="mt-1 flex items-center gap-2 rounded px-2 py-1" style={{ background: 'rgba(139, 156, 173, 0.04)', border: '1px solid rgba(139, 156, 173, 0.12)' }}>
            <span style={{ fontSize: '0.7rem' }}>{'\uD83D\uDCAC'}</span> Message: Will appear as interactive card in conversation thread
          </div>
          {linkedPhase && (
            <div className="mt-1 flex items-center gap-2 rounded px-2 py-1" style={{ background: 'rgba(139, 156, 173, 0.04)', border: '1px solid rgba(139, 156, 173, 0.12)' }}>
              <span style={{ fontSize: '0.7rem' }}>{'\uD83D\uDCC5'}</span> Phase: Linked to {linkedPhase}
              {blockingStatus !== 'non_blocking' && ' \u2014 ' + (blockingStatus === 'blocks_procurement' ? 'blocks ordering' : 'blocks phase advance')}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div
        className="mt-8 flex gap-2 pt-6"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        <PortalButton
          variant="primary"
          onClick={() => handleSubmit('pending')}
          disabled={!title.trim() || createDecision.isPending}
        >
          {createDecision.isPending ? 'Sending...' : 'Send Decision to Client'}
        </PortalButton>
        <PortalButton variant="secondary" onClick={() => handleSubmit('draft')}>
          Save as Draft
        </PortalButton>
        <PortalButton variant="ghost" onClick={() => router.back()}>
          Cancel
        </PortalButton>
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
