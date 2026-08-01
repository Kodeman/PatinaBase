'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { PaymentScheduleBlock } from '@patina/design-system';
import {
  useProjects,
  useProjectInvoices,
  type Invoice,
  type Proposal,
} from '@patina/supabase';
import {
  formatCurrency,
  formatInvoiceDate,
  invoiceBalanceCents,
  isInvoiceOverdue,
  INVOICE_STATUS_LABELS,
  type InvoiceStatus,
} from '@patina/shared';
import { useClientProposals, partitionProposals } from '@/hooks/use-proposals-client';
import { StrataMark } from '@/components/strata-mark';
import { computeInvoiceRollup, visibleInvoices } from './rollup';

// Budget & payments visibility (P2a) — a cross-project rollup of what the
// client has committed to (accepted proposal total + its payment schedule)
// and what they've been billed/paid so far (invoices). Grouped per project
// since both the investment total and the payment schedule are meaningful
// only in the context of a single accepted proposal.
//
// Deliberately renders the proposal-owned payment milestones embedded by the
// client-safe proposal RPC (the schedule the client actually signed), rather
// than the post-activation `project_payment_milestones`
// table BudgetOverview (components/budget-overview.tsx) uses for the FF&E
// spend-cap view on a project's own page — that's a different question
// ("how's the furnishings budget tracking") from this page's ("what did I
// agree to pay, and what have I paid"). Milestones here have no invoice
// linkage (only project_payment_milestones.id is FK'd from
// invoice_line_items.milestone_id — see supabase/migrations/00178_invoices_v1.sql),
// so the schedule renders as informational only; the real payment status
// lives in the invoices rollup below.

const PAYMENT_TERMS_LABELS: Record<string, string> = {
  net_30: 'Net 30',
  due_on_receipt: 'Due on receipt',
  custom: 'Custom terms',
};

function paymentTermsLabel(term: string): string {
  return PAYMENT_TERMS_LABELS[term] ?? term.replace(/_/g, ' ');
}

function invoiceStatusLabel(invoice: Invoice): string {
  if (isInvoiceOverdue(invoice)) return 'Past due';
  const labels: Record<InvoiceStatus, string> = {
    ...INVOICE_STATUS_LABELS,
    sent: 'Awaiting payment',
    partially_paid: 'Partially paid',
  };
  return labels[invoice.status] ?? invoice.status;
}

const sectionLabelStyle: CSSProperties = {
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
};

export default function ClientBudgetPage() {
  const { data: projects, isLoading: projectsLoading, isError: projectsError } = useProjects();
  const {
    data: proposalsData,
    isLoading: proposalsLoading,
    isError: proposalsError,
  } = useClientProposals();

  const isLoading = projectsLoading || proposalsLoading;

  const { accepted } = partitionProposals(proposalsData);
  const acceptedByProject = new Map<string, Proposal[]>();
  for (const proposal of accepted) {
    if (!proposal.project_id) continue;
    const list = acceptedByProject.get(proposal.project_id) ?? [];
    list.push(proposal);
    acceptedByProject.set(proposal.project_id, list);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="type-page-title">Your Budget</h1>
      <p className="type-body mt-2">
        Your investment summary, payment schedule, and invoices — grouped by project.
      </p>

      {isLoading && (
        <div className="flex items-center justify-center py-16" data-testid="budget-loading">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
        </div>
      )}

      {!isLoading && projectsError && (
        <div className="py-16 text-center" data-testid="budget-error">
          <p className="type-body-small" style={{ color: 'var(--color-terracotta, #C77B6E)' }}>
            We couldn&rsquo;t load your budget right now. Try refreshing the page.
          </p>
        </div>
      )}

      {!isLoading && !projectsError && (projects ?? []).length === 0 && (
        <div className="py-16 text-center" data-testid="budget-empty">
          <p className="type-body-small">
            Your budget will appear here once your first project is underway.
          </p>
        </div>
      )}

      {!isLoading &&
        !projectsError &&
        (projects ?? []).map((project, index) => (
          <div key={project.id}>
            {index > 0 && <StrataMark variant="mini" />}
            <ProjectBudgetSection
              projectId={project.id}
              projectName={project.name}
              acceptedProposals={acceptedByProject.get(project.id) ?? []}
              proposalsUnavailable={proposalsError}
            />
          </div>
        ))}
    </div>
  );
}

function ProjectBudgetSection({
  projectId,
  projectName,
  acceptedProposals,
  proposalsUnavailable,
}: {
  projectId: string;
  projectName: string;
  acceptedProposals: Proposal[];
  proposalsUnavailable: boolean;
}) {
  const { data: invoicesData, isLoading, isError } = useProjectInvoices(projectId);
  const invoices = visibleInvoices(invoicesData ?? []);
  const { paidCents, outstandingCents } = computeInvoiceRollup(invoicesData ?? []);

  return (
    <section className="mt-8">
      <h2 className="type-section-head">{projectName}</h2>

      {acceptedProposals.length === 0 ? (
        <p className="type-body-small mt-4 text-[var(--text-muted)]">
          {proposalsUnavailable
            ? "We couldn't load your proposals right now."
            : 'Your investment summary will appear once you accept a proposal.'}
        </p>
      ) : (
        acceptedProposals.map((proposal) => (
          <AcceptedProposalSummary key={proposal.id} proposal={proposal} />
        ))
      )}

      <div className="mt-6">
        <p className="mb-3 type-meta-small text-[var(--text-muted)]" style={sectionLabelStyle}>
          Invoices
        </p>

        {isLoading && (
          <div className="h-4 w-32 animate-pulse rounded bg-[var(--color-pearl)]" />
        )}

        {!isLoading && isError && (
          <p className="type-body-small" style={{ color: 'var(--color-terracotta, #C77B6E)' }}>
            We couldn&rsquo;t load invoices for this project right now.
          </p>
        )}

        {!isLoading && !isError && invoices.length === 0 && (
          <p className="type-body-small text-[var(--text-muted)]">
            No invoices yet. When your designer sends one, it will appear here.
          </p>
        )}

        {!isLoading && !isError && invoices.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
              <div className="border-b border-[var(--border-default)] pb-3" data-testid="invoices-paid-to-date">
                <p className="type-meta">Paid to date</p>
                <p className="type-data-large mt-1">{formatCurrency(paidCents)}</p>
              </div>
              <div className="border-b border-[var(--border-default)] pb-3" data-testid="invoices-outstanding">
                <p className="type-meta">Outstanding</p>
                <p className="type-data-large mt-1">{formatCurrency(outstandingCents)}</p>
              </div>
            </div>
            <ul className="mt-4 space-y-0">
              {invoices.map((invoice) => (
                <BudgetInvoiceRow key={invoice.id} invoice={invoice} />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

function AcceptedProposalSummary({ proposal }: { proposal: Proposal }) {
  const milestones = proposal.payment_milestones ?? [];
  const terms = proposal.payment_terms;
  const notes = proposal.payment_notes;

  return (
    <div className="mt-4">
      <div className="border-b border-[var(--border-default)] pb-4">
        <p className="type-meta">{proposal.title}</p>
        <p className="type-data-large mt-1">{formatCurrency(proposal.total_amount)}</p>
        {(terms || notes) && (
          <p className="type-body-small mt-2 text-[var(--text-muted)]">
            {terms ? paymentTermsLabel(terms) : null}
            {terms && notes ? ' — ' : null}
            {notes ?? null}
          </p>
        )}
      </div>

      {milestones.length > 0 && (
        <PaymentScheduleBlock milestones={milestones} totalCents={proposal.total_amount} />
      )}
    </div>
  );
}

function BudgetInvoiceRow({ invoice }: { invoice: Invoice }) {
  const balance = invoiceBalanceCents(invoice);
  const showBalance = invoice.status === 'partially_paid';

  return (
    <li>
      <Link
        href={`/invoices/${invoice.id}`}
        className="block border-b border-[var(--border-default)] py-4 no-underline transition hover:bg-[var(--bg-surface)]"
      >
        <div className="flex items-baseline justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p
              className="type-meta"
              style={{
                color: isInvoiceOverdue(invoice)
                  ? 'var(--color-terracotta, #C77B6E)'
                  : 'var(--text-muted)',
              }}
            >
              {invoiceStatusLabel(invoice)}
            </p>
            <h3 className="font-heading text-base text-[var(--text-primary)]">
              {invoice.invoice_number ?? 'Invoice'}
            </h3>
          </div>
          <div className="text-right">
            <p className="font-heading text-base text-[var(--text-primary)]">
              {formatCurrency(showBalance ? balance : invoice.total_cents, invoice.currency)}
            </p>
            {showBalance && (
              <p className="type-meta-small mt-0.5 text-[var(--text-muted)]">
                of {formatCurrency(invoice.total_cents, invoice.currency)}
              </p>
            )}
            {invoice.due_date &&
              (invoice.status === 'sent' || invoice.status === 'partially_paid') && (
                <p className="type-meta-small mt-0.5 text-[var(--text-muted)]">
                  Due {formatInvoiceDate(invoice.due_date)}
                </p>
              )}
          </div>
        </div>
      </Link>
    </li>
  );
}
