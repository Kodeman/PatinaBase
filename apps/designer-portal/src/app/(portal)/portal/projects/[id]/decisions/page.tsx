'use client';

import { use } from 'react';
import Link from 'next/link';
import { useDecisionsByProject } from '@patina/supabase';
import type {
  ClientDecision,
  DecisionType,
  DecisionStatus,
} from '@patina/supabase';
import { useProject } from '@/hooks/use-projects';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
import { deadlineVariant, bandSurface } from '@/lib/decision-deadline';

const typeLabels: Record<DecisionType, string> = {
  material: 'Material',
  color: 'Color',
  product: 'Product',
  layout: 'Layout',
  substitution: 'Substitution',
  budget: 'Budget',
  approval: 'Approval',
};

function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function DecisionRow({ d }: { d: ClientDecision }) {
  const variant = deadlineVariant(d.due_date, d.status);
  return (
    <Link
      href={`/portal/decisions/${d.id}`}
      className="block no-underline"
    >
      <div
        className="grid grid-cols-1 gap-2 rounded-[3px] border px-4 py-3 transition-colors hover:bg-[var(--surface-subtle)] md:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1.4fr]"
        style={{
          borderColor: 'var(--border-default)',
          marginBottom: '0.5rem',
        }}
      >
        <div className="min-w-0">
          <div
            className="type-label truncate"
            style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}
          >
            {d.title}
          </div>
          <div className="type-meta-small text-[var(--text-muted)]">
            {typeLabels[d.decision_type] ?? d.decision_type}
          </div>
        </div>

        <Field label="Due">
          {d.due_date ? (
            <span
              className="rounded-sm px-1.5 py-0.5"
              style={{
                fontFamily: 'var(--font-meta)',
                fontSize: '0.55rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: variant.color,
                background: bandSurface(variant.band),
              }}
            >
              {formatDate(d.due_date)} {'·'} {variant.label}
            </span>
          ) : (
            <span className="type-meta-small text-[var(--text-muted)]">
              No deadline
            </span>
          )}
        </Field>

        <Field label="Sent">{formatDate(d.sent_at)}</Field>
        <Field label="Viewed">{formatDate(d.viewed_at)}</Field>
        <Field label="Responded">{formatDate(d.responded_at)}</Field>
        <Field label="Selected by">
          <span
            className="block truncate"
            style={{
              fontFamily: 'var(--font-mono, var(--font-body))',
              fontSize: '0.7rem',
              color: 'var(--text-body)',
            }}
            title={d.selected_by ?? undefined}
          >
            {d.selected_by ?? '—'}
          </span>
        </Field>

        <div className="flex items-center justify-end">
          <span className="type-meta-small text-[var(--accent-primary)]">
            View &rarr;
          </span>
        </div>
      </div>
    </Link>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.55rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
          marginBottom: '0.15rem',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.78rem',
          color: 'var(--text-body)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Section({
  title,
  decisions,
}: {
  title: string;
  decisions: ClientDecision[];
}) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-baseline gap-3 border-b border-[var(--border-default)] pb-2">
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 500,
            fontSize: '1.1rem',
            color: 'var(--text-primary)',
          }}
        >
          {title}
        </h2>
        <span className="type-meta-small text-[var(--text-muted)]">
          {decisions.length}
        </span>
      </div>
      {decisions.length === 0 ? (
        <p className="type-meta-small text-[var(--text-muted)]">None</p>
      ) : (
        <div>
          {decisions.map((d) => (
            <DecisionRow key={d.id} d={d} />
          ))}
        </div>
      )}
    </section>
  );
}

const OPEN_STATUSES: DecisionStatus[] = ['pending', 'draft'];

export default function ProjectDecisionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const hydrated = useHydrated();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: project, isLoading: projectLoading } = useProject(id) as {
    data: any;
    isLoading: boolean;
  };
  const { data: decisions = [], isLoading } = useDecisionsByProject(id);

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || projectLoading || isLoading) return <LoadingStrata />;

  const open = decisions.filter((d) => OPEN_STATUSES.includes(d.status));
  const decided = decisions.filter((d) => d.status === 'responded');
  const expired = decisions.filter((d) => d.status === 'expired');

  return (
    <div className="pt-8">
      <div className="type-meta mb-6">
        <Link
          href="/portal/projects"
          className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]"
        >
          Projects
        </Link>
        <span className="mx-2">&rarr;</span>
        <Link
          href={`/portal/projects/${id}`}
          className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]"
        >
          {project?.name ?? 'Project'}
        </Link>
        <span className="mx-2">&rarr;</span>
        <span>Decisions</span>
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
        Decision history
      </h1>
      <p className="type-label-secondary mb-8">
        {decisions.length} total {'·'} {open.length} open {'·'}{' '}
        {decided.length} decided {'·'} {expired.length} expired
      </p>

      <Section title="Open" decisions={open} />
      <Section title="Decided" decisions={decided} />
      <Section title="Expired" decisions={expired} />
    </div>
  );
}
