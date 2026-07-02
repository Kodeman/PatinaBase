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

import { useState } from 'react';
import {
  exportAccountsQbo,
  useAccountPage,
  useGenerateMilestoneInvoice,
  useUpdateMilestoneTrigger,
  type AccountMilestone,
} from '@/hooks/use-account-page';
import type { SectionKey } from '@/lib/document/desk-derivation';
import { fmtDay, fmtUsd } from '@/lib/document/format';
import { openLedger } from './command-bar';
import { openInvoiceComposer } from './accounts/invoice-overlays';

const SAGE_INK = '#85947C';
const TERRACOTTA_INK = '#C4836F';

const TRIGGER_LABELS: Record<string, string> = {
  on_signing: 'on signing',
  on_production_start: 'on production start',
  on_section_settled: 'when a section settles',
  on_date: 'on date',
};

const GATE_SECTIONS: SectionKey[] = ['project', 'install', 'care'];

function MilestoneRow({ m, projectId }: { m: AccountMilestone; projectId: string }) {
  const updateTrigger = useUpdateMilestoneTrigger(projectId);
  const generate = useGenerateMilestoneInvoice(projectId);

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
            className="bg-transparent font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--color-clay)] outline-none"
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
          <input
            type="date"
            value={m.due_date ?? ''}
            onChange={(e) =>
              updateTrigger.mutate({
                milestoneId: m.id,
                triggerKind: 'on_date',
                dueDate: e.target.value || null,
              })
            }
            aria-label={`${m.label} date`}
            className="bg-transparent font-mono text-[9px] text-[var(--color-clay)] outline-none"
          />
        )}
      </span>
      {m.invoice_id ? (
        <span className="font-mono text-[8.5px] uppercase tracking-[0.05em]" style={{ color: SAGE_INK }}>
          invoice drafted
        </span>
      ) : (
        <button
          type="button"
          disabled={generate.isPending}
          onClick={() => generate.mutate(m.id)}
          className="text-left font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--color-clay)] hover:opacity-80 disabled:opacity-40"
        >
          Generate invoice
        </button>
      )}
    </div>
  );
}

export function AccountBand({ projectId }: { projectId: string }) {
  const { data } = useAccountPage(projectId);
  const [open, setOpen] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);

  if (!data) return null;

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
        <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-clay)]">
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
            <div key={r.roomId ?? 'throughout'} className="border-b border-dashed border-[var(--color-pearl)] py-1">
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
                  style={{ color: r.varianceCents >= 0 ? SAGE_INK : TERRACOTTA_INK }}
                >
                  {r.varianceCents >= 0 ? fmtUsd(r.varianceCents) + ' under' : fmtUsd(-r.varianceCents) + ' over'}
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
              trade cost on {data.tradeCoverage.withTrade} of {data.tradeCoverage.total} committed lines
            </span>
          </p>

          {/* The designer-earnings block → Accounts (stub target OK, R26). */}
          <p className="mt-1.5 text-[11px] text-[var(--color-charcoal)]">
            Design fee {fmtUsd(data.designFeeCents)} · est. commissions {fmtUsd(data.estCommissionCents)}
            <button
              type="button"
              onClick={() => openLedger('accounts')}
              className="ml-2 font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--color-clay)] hover:opacity-80"
            >
              → Accounts ↗
            </button>
          </p>

          {/* Payment milestones — inline trigger config (R26/R23). */}
          {data.milestones.length > 0 && (
            <div className="mt-3">
              <p className="mb-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Payment milestones
              </p>
              {data.milestones.map((m) => (
                <MilestoneRow key={m.id} m={m} projectId={projectId} />
              ))}
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap items-baseline gap-4">
            {/* R74b — draw an invoice for THIS engagement: the anti-wizard
                composer, milestones/time/FF&E pulled through pre-scoped. */}
            <button
              type="button"
              onClick={() => openInvoiceComposer({ projectId })}
              className="rounded-[3px] border border-[rgba(196,165,123,0.5)] px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--color-clay)] transition-colors hover:bg-[var(--color-clay)] hover:text-white"
            >
              Draw an invoice →
            </button>
            {/* R77 — the per-document Hours lens (the drawer pre-addresses
                the ledger with this project once wired through). */}
            <button
              type="button"
              onClick={() => openLedger('hours', { projectId })}
              className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-clay)] hover:opacity-80"
            >
              Hours · this project ↗
            </button>
            <button
              type="button"
              onClick={() => {
                setExportNote('exporting…');
                void exportAccountsQbo(projectId).then((r) =>
                  setExportNote(r.ok ? 'exported ✓' : r.message),
                );
              }}
              className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-clay)] hover:opacity-80"
            >
              Export · QBO
            </button>
            {exportNote && (
              <span className="font-mono text-[8.5px] text-[var(--text-muted)]">{exportNote}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
