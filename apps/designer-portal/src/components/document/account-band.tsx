'use client';

/**
 * The Account Page (R26) — a settled-bar band at the top of the Project
 * section: collapsed to one honest line (budget · committed · margin %),
 * unfolding in place to the by-room variance table (DM Mono numerals; SAGE
 * under, TERRACOTTA over — never red/green), the margin line, the
 * designer-earnings block, and payment milestones with inline trigger
 * config. Actions: Generate invoice (drafts into the Money margin,
 * review-then-send) · Export (QBO, the procurement exporter reused).
 *
 * STUDIO EYES ONLY — excluded from the client mirror, enforced by CI test.
 */

import { useEffect, useState } from 'react';
import {
  exportAccountsQbo,
  useAccountPage,
  useGenerateMilestoneInvoice,
  useUpdateMilestoneTrigger,
  type AccountMilestone,
} from '@/hooks/use-account-page';
import type { SectionKey } from '@/lib/document/desk-derivation';
import { fmtDay, fmtUsd } from '@/lib/document/format';
import { DateTextInput } from './date-text-input';
import { openLedger } from './command-bar';
import { openInvoiceComposer, openInvoiceFolio } from './accounts/invoice-overlays';
import { AmendmentSheet } from './overlays/amendment-sheet';
import { DocumentAction, DocumentActionGroup } from './document-action';
import { AccountsQueryFailure } from './accounts/accounts-query-failure';
import { SectionLoadingLine } from './section-loading-line';

const SAGE_INK = '#85947C';
const TERRACOTTA_INK = 'var(--color-terracotta-ink)';

const TRIGGER_LABELS: Record<string, string> = {
  on_signing: 'on signing',
  on_production_start: 'on production start',
  on_section_settled: 'when a section settles',
  on_date: 'on date',
};

const GATE_SECTIONS: SectionKey[] = ['project', 'install', 'care'];

function MilestoneRow({
  m,
  projectId,
  headless,
}: {
  m: AccountMilestone;
  projectId: string;
  /** Inside the Money region the head already carries the inked leader, so a
   *  per-milestone primary would stand a second leader beside it. */
  headless: boolean;
}) {
  const updateTrigger = useUpdateMilestoneTrigger(projectId);
  const generate = useGenerateMilestoneInvoice(projectId);
  const [invoiceNote, setInvoiceNote] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-2 border-b border-dashed border-[var(--color-pearl)] py-1.5 min-[700px]:grid-cols-[minmax(0,1.2fr)_auto_auto_minmax(0,1.4fr)_auto]">
      <span className="text-[11.5px] text-[var(--color-charcoal)]">{m.label}</span>
      <span className="font-mono text-[10px] text-[var(--color-charcoal)]">
        {fmtUsd(m.amount_cents)}
      </span>
      <span className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
        {m.paid_at ? `paid ${fmtDay(m.paid_at)}` : m.status}
      </span>
      <span className="flex items-baseline gap-1.5">
        <select
          value={m.trigger_kind ?? ''}
          onChange={(e) =>
            updateTrigger.mutate({
              milestoneId: m.id,
              triggerKind: (e.target.value || null) as AccountMilestone['trigger_kind'],
              triggerSectionKey: m.trigger_section_key,
              dueDate: m.due_date,
            })
          }
          aria-label={`${m.label} trigger`}
          className="bg-transparent font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--text-muted)] outline-none"
        >
          {/* R33 F4: the honest word for a designer-act milestone is MANUAL. */}
          <option value="">manual</option>
          {Object.entries(TRIGGER_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        {m.trigger_kind === 'on_section_settled' && (
          <select
            value={m.trigger_section_key ?? ''}
            onChange={(e) =>
              updateTrigger.mutate({
                milestoneId: m.id,
                triggerKind: 'on_section_settled',
                triggerSectionKey: (e.target.value || null) as SectionKey | null,
              })
            }
            aria-label={`${m.label} section`}
            className="bg-transparent font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--color-clay-ink)] outline-none"
          >
            <option value="">pick a section</option>
            {GATE_SECTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        {m.trigger_kind === 'on_date' && (
          <DateTextInput
            value={m.due_date ?? null}
            onChange={(value) =>
              updateTrigger.mutate({
                milestoneId: m.id,
                triggerKind: 'on_date',
                dueDate: value,
              })
            }
            ariaLabel={`${m.label} date`}
            className="bg-transparent font-mono text-[9px] text-[var(--color-clay-ink)] outline-none"
          />
        )}
      </span>
      {m.invoice_id ? (
        <DocumentAction
          actionKey="open-milestone-invoice"
          surfaceKey="accounts"
          regionKey="payment-milestone"
          variant="tertiary"
          onClick={() => openInvoiceFolio(m.invoice_id as string)}
        >
          Open invoice
        </DocumentAction>
      ) : (
        <DocumentAction
          actionKey="generate-milestone-invoice"
          surfaceKey="accounts"
          regionKey="payment-milestone"
          variant={headless ? 'secondary' : 'primary'}
          disabled={generate.isPending}
          loading={generate.isPending}
          loadingLabel="Generating…"
          onClick={() => {
            setInvoiceNote(null);
            generate.mutate(m.id, {
              onSuccess: (invoiceId) => openInvoiceFolio(invoiceId),
              onError: (error) =>
                setInvoiceNote(
                  error instanceof Error ? error.message : 'Could not draft this invoice.',
                ),
            });
          }}
          className="text-left"
        >
          Generate invoice
        </DocumentAction>
      )}
      {invoiceNote && (
        <p
          className="col-span-full font-mono text-[8.5px] normal-case tracking-normal"
          style={{ color: TERRACOTTA_INK }}
          role="alert"
        >
          Could not draft the invoice — {invoiceNote}
        </p>
      )}
    </div>
  );
}

export function AccountBand({
  projectId,
  clientName,
  activeSection,
  headless = false,
}: {
  projectId: string;
  clientName?: string | null;
  activeSection?: SectionKey | null;
  /** The Money region now carries the "Draw an invoice" leader on its own
   *  head — a headless band drops its own duplicate of that primary so the
   *  act has exactly one doorway. Everything else (the fold, the variance
   *  table, export, the amendment doorway) stays put: this band is still the
   *  accounts sub-seam inside the region, not merely absorbed. Defaults to
   *  false so the standalone page.tsx mount is byte-identical to before. */
  headless?: boolean;
}) {
  const { data, isLoading, isError, refetch } = useAccountPage(projectId);
  const [open, setOpen] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [amendmentOpen, setAmendmentOpen] = useState(false);
  const changeOnly = activeSection === 'install' || activeSection === 'care';

  useEffect(() => {
    if (!changeOnly) return;
    const openChange = () => setAmendmentOpen(true);
    window.addEventListener('document:open-project-change', openChange);
    return () => window.removeEventListener('document:open-project-change', openChange);
  }, [changeOnly]);

  // The Money region's head ledger dispatches this instead of calling
  // setAmendmentOpen directly — the region has no access to this band's local
  // state, so the band remains the sole owner of its AmendmentSheet.
  useEffect(() => {
    const openAmendment = () => setAmendmentOpen(true);
    window.addEventListener('document:compose-amendment', openAmendment);
    return () => window.removeEventListener('document:compose-amendment', openAmendment);
  }, []);

  if (isLoading) {
    return <SectionLoadingLine label="opening the ledger" className="mt-4" />;
  }

  if (isError) {
    return (
      <AccountsQueryFailure
        title="The project accounts could not be opened."
        message="Budget, commitments, milestones, and invoice actions are unavailable until this read succeeds."
        onRetry={refetch}
      />
    );
  }

  if (!data) {
    return (
      <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
        No account record is available for this project.
      </p>
    );
  }

  const collapsedLine = [
    `${fmtUsd(data.budgetCents)} budget`,
    `${fmtUsd(data.committedCents)} committed`,
    data.marginPct != null ? `${data.marginPct}% margin` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="mt-4 rounded-[5px] bg-[rgba(229,226,221,0.32)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="grid w-full grid-cols-[auto_1fr_auto_auto] items-baseline gap-3 px-3 py-2 text-left"
      >
        <span className="font-heading text-[12.5px] font-medium italic text-[var(--color-charcoal)]">
          The accounts · this project
        </span>
        <span className="truncate font-mono text-[9.5px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
          {collapsedLine}
        </span>
        <span className="font-mono text-[7.5px] uppercase tracking-[0.1em] text-[var(--color-aged-oak,#8B7355)]">
          Studio eyes only
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-clay-ink)]">
          {open ? 'fold ↑' : 'unfold ↓'}
        </span>
      </button>

      {open && (
        <div className="border-t border-[var(--color-pearl)] px-3 pb-3 pt-2">
          {/* Variance by room (× category beneath) — R25's rooms, one source. */}
          <div className="mb-1 grid grid-cols-[1fr_auto_auto_auto] gap-x-4">
            <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Room
            </span>
            <span className="text-right font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Allocated
            </span>
            <span className="text-right font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Committed
            </span>
            <span className="text-right font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Variance
            </span>
          </div>
          {data.rooms.map((r) => (
            <div
              key={r.roomId ?? 'throughout'}
              className="border-b border-dashed border-[var(--color-pearl)] py-1"
            >
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4">
                <span className="text-[11.5px] text-[var(--color-charcoal)]">{r.roomName}</span>
                <span className="text-right font-mono text-[10px] text-[var(--color-charcoal)]">
                  {r.allocatedCents > 0 ? fmtUsd(r.allocatedCents) : '—'}
                </span>
                <span className="text-right font-mono text-[10px] text-[var(--color-charcoal)]">
                  {fmtUsd(r.committedCents)}
                </span>
                <span
                  className="text-right font-mono text-[10px]"
                  style={{
                    color: r.varianceCents >= 0 ? SAGE_INK : TERRACOTTA_INK,
                  }}
                >
                  {r.varianceCents >= 0
                    ? fmtUsd(r.varianceCents) + ' under'
                    : fmtUsd(-r.varianceCents) + ' over'}
                </span>
              </div>
              {r.categories.length > 0 && (
                <p className="mt-px font-mono text-[8.5px] lowercase tracking-[0.03em] text-[var(--text-muted)]">
                  {r.categories
                    .map((c) => `${c.name.replace(/_/g, ' ')} ${fmtUsd(c.committedCents)}`)
                    .join(' · ')}
                </p>
              )}
            </div>
          ))}

          {/* The margin line — trade vs client, with the coverage note. */}
          <p className="mt-2 text-[11px] text-[var(--color-charcoal)]">
            {data.marginPct != null ? (
              <>
                Trade {fmtUsd(data.tradeCostCents)} → client {fmtUsd(data.clientValueCents)} ·{' '}
                <span style={{ color: SAGE_INK }}>{data.marginPct}% margin</span>
              </>
            ) : (
              'No trade pricing on committed lines yet.'
            )}
            <span className="ml-2 font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
              trade cost on {data.tradeCoverage.withTrade} of {data.tradeCoverage.total} committed
              lines
            </span>
          </p>

          {/* The designer-earnings block → Accounts (stub target OK, R26). */}
          <p className="mt-1.5 text-[11px] text-[var(--color-charcoal)]">
            Design fee {fmtUsd(data.designFeeCents)} · est. commissions{' '}
            {fmtUsd(data.estCommissionCents)}
            {/* I107 — the clay underline is retired: a tertiary word takes its
                rule on hover, and the ↗ rides outside the score as a glyph, so
                the rule marks the word and not the doorway. */}
            <DocumentAction
              actionKey="open-accounts-ledger"
              surfaceKey="accounts"
              regionKey="designer-earnings"
              variant="tertiary"
              trailing="↗"
              onClick={() => openLedger('accounts')}
              className="ml-2"
            >
              → Accounts
            </DocumentAction>
          </p>

          {/* Payment milestones — inline trigger config (R26/R23). */}
          {data.milestones.length > 0 && (
            <div className="mt-3">
              <p className="mb-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Payment milestones
              </p>
              {data.milestones.map((m) => (
                <MilestoneRow key={m.id} m={m} projectId={projectId} headless={headless} />
              ))}
            </div>
          )}

          <DocumentActionGroup
            surfaceKey="accounts"
            regionKey="project-account"
            className="mt-2.5 items-center"
          >
            {/* R74b — draw an invoice for THIS engagement: the anti-wizard
                composer, milestones/time/FF&E pulled through pre-scoped.
                Headless drops this: the Money region's head now carries the
                single inked "Draw an invoice" leader for this project. */}
            {!headless && (
              <DocumentAction
                actionKey="draw-project-invoice"
                variant="primary"
                onClick={() => openInvoiceComposer({ projectId })}
              >
                Draw an invoice
              </DocumentAction>
            )}
            {/* R77 — the per-document Hours lens (the drawer pre-addresses
                the ledger with this project once wired through). */}
            <DocumentAction
              actionKey="open-project-hours"
              variant="tertiary"
              onClick={() => openLedger('hours', { projectId })}
            >
              Hours · this project ↗
            </DocumentAction>
            <DocumentAction
              actionKey="export-project-qbo"
              variant="secondary"
              onClick={() => {
                setExportNote('exporting…');
                void exportAccountsQbo(projectId).then((r) =>
                  setExportNote(r.ok ? 'exported ✓' : r.message),
                );
              }}
            >
              Export · QBO
            </DocumentAction>
            {/* R81 — the Amendment: scope changes composed from the money
                band (the margin escalation is the other doorway). */}
            <DocumentAction
              actionKey="compose-project-amendment"
              variant="secondary"
              onClick={() => setAmendmentOpen(true)}
            >
              {changeOnly ? 'Add a change' : 'Amendment'}
            </DocumentAction>
            {exportNote && (
              <span className="font-mono text-[8.5px] text-[var(--text-muted)]">{exportNote}</span>
            )}
          </DocumentActionGroup>
        </div>
      )}
      <AmendmentSheet
        projectId={projectId}
        clientName={clientName ?? ''}
        open={amendmentOpen}
        onClose={() => setAmendmentOpen(false)}
      />
    </div>
  );
}
