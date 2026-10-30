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

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  useDocumentClientLinkHold,
  useProject,
  useSessionUserId,
} from '@patina/supabase';
import { OfflineRefusal, readWhileOnline } from '@/lib/react-query';
import {
  exportAccountsQbo,
  useAccountPage,
  useGenerateMilestoneInvoice,
  useUpdateMilestoneTrigger,
  type AccountMilestone,
  type MilestoneTriggerInput,
} from '@/hooks/use-account-page';
import { InkAlert, SavingWord } from './work-block';
import type { SectionKey } from '@/lib/document/desk-derivation';
import { fmtDay, fmtUsd } from '@/lib/document/format';
import { assessInvoiceReadiness, billingRefusal } from '@/lib/document/invoice-composer';
import { MESSAGE_WITHHELD } from '@/lib/document/act-names';
import { OPEN_HOUSEHOLD_SHEET_EVENT } from '@/lib/document/registry';
import type { SpotlightHold } from '@/lib/document/spotlight/use-hold-spotlight';
import { CopyAct } from './copy-act';
import {
  formatCurrencyTotal,
  formatMoney,
  isMixed,
  mixedCurrenciesText,
} from '@/lib/currency-totals';
import { DateTextInput } from './date-text-input';
import { openLedger } from './command-bar';
import { openInvoiceComposer, openInvoiceFolio } from './accounts/invoice-overlays';
import { AmendmentSheet } from './overlays/amendment-sheet';
import { DocumentAction, DocumentActionGroup } from './document-action';
import { AccountsQueryFailure } from './accounts/accounts-query-failure';
import { SectionLoadingLine } from './section-loading-line';
import { useCanSeeMargin } from '@/hooks/use-can-see-margin';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { ActFailLine } from '@/components/feedback/act-fail-line';

const SAGE_INK = 'var(--color-sage-ink)';
const TERRACOTTA_INK = 'var(--color-terracotta-ink)';

const TRIGGER_LABELS: Record<string, string> = {
  on_signing: 'on signing',
  on_production_start: 'on production start',
  on_section_settled: 'when a section settles',
  on_date: 'on date',
};

const GATE_SECTIONS: SectionKey[] = ['project', 'install', 'care'];

const SUPPORT_ADDRESS = 'hello@patina.cloud';

/** The window of a Generate held until its project reads; it has no fix. */
const PROJECT_READ = 'project-read';

const PROJECT_UNREAD = "This project couldn't be read. Reload the page to draft its invoice.";

/** US-36 R2 — the milestone draft runs the composer's readiness first: the
 *  RPC drafts a client-less invoice the folio would then offer to send, so a
 *  project with no client (or no studio) holds Generate before anything is
 *  written. Same sentences and the same K5-gated fixes as the composer. */
function useMilestoneDraftHold(projectId: string, wanted: boolean) {
  // F5 — the project's own entity read, never a search of the collection,
  // which can leave out a project that is plainly there.
  const {
    data: entity,
    isLoading: projectLoading,
    isFetching: projectFetching,
    isError: projectFailed,
    refetch: refetchProject,
  } = useProject(wanted ? projectId : '');
  const viewerId = useSessionUserId();
  const cachedProject = wanted && entity?.id === projectId ? entity : null;
  // Readiness needs the project as it stands; without it the RPC would draft
  // unchecked. A re-read in flight, or a failed one, establishes nothing even
  // with an earlier answer cached (unknown = held).
  const projectPending = !!(projectLoading || projectFetching);
  const project = projectPending || projectFailed ? null : cachedProject;
  const wait =
    wanted && !project
      ? projectPending
        ? 'Checking this project before drafting its invoice.'
        : PROJECT_UNREAD
      : null;
  const noClient = !!project && !project.client_id;
  const isLead = !!viewerId && project?.designer_id === viewerId;
  const { data: linkHold } = useDocumentClientLinkHold(noClient && !isLead ? projectId : null);
  const canLinkClient = isLead || linkHold === null;
  const leadLeftStudio = noClient && !isLead && linkHold === 'lead_not_in_studio';
  const leadName =
    project?.designer?.display_name || project?.designer?.full_name || 'the lead designer';
  const projectName = project?.name ?? 'This project';
  const holds = project
    ? assessInvoiceReadiness({
        clientLinked: !noClient,
        canLinkClient,
        clientLinkHold: linkHold ?? null,
        pricingStudioLinked: project.studio_id != null,
        // The composer carries the studio's own K-gated naming; the band walks there.
        canNameStudio: true,
        soloOwnerUnstamped: false,
        selectedRatePendingEntries: [],
        selectedUnpricedLineIds: [],
        selectedAnything: true,
        noClientReason: leadLeftStudio
          ? `The lead on this job has left the studio. Write to ${SUPPORT_ADDRESS} and we'll move the job to someone on your team.`
          : canLinkClient
            ? `${projectName} has no client yet. Link one to bill it.`
            : `${projectName} has no client yet. Ask ${leadName} to link one.`,
        noStudioReason: `${projectName} isn't tied to your studio yet.`,
      }).holds
    : [];
  /** R4 — the one fresh read Generate makes before it drafts: the refusal
   *  sentence, or null when the client and studio are still there. */
  const confirmFresh = async (): Promise<string | null> => {
    let fresh: Awaited<ReturnType<typeof refetchProject>>;
    try {
      // F3 — offline refuses before the read; a drop while it is out refuses then.
      fresh = await readWhileOnline(() => refetchProject());
    } catch (e) {
      return e instanceof OfflineRefusal ? e.message : PROJECT_UNREAD;
    }
    const current = fresh.isError || fresh.data?.id !== projectId ? undefined : fresh.data;
    if (!current) return PROJECT_UNREAD;
    const name = current.name ?? 'This project';
    if (!current.client_id) return `${name} has no client yet.`;
    if (current.studio_id == null) return `${name} isn't tied to your studio yet.`;
    return null;
  };
  return { holds, wait, projectName, canLinkClient, leadLeftStudio, confirmFresh };
}

type MilestoneDraftHold = ReturnType<typeof useMilestoneDraftHold>;

function askLinkNote(projectName: string): string {
  return `Could you link a client to ${projectName}? I'm drafting its invoice.`;
}

/** Each hold's reason with its fix beside it: the spotlight's window (R186). */
function MilestoneDraftHoldLines({
  hold,
  projectId,
  reasonId,
  regionRefs,
}: {
  hold: MilestoneDraftHold;
  projectId: string;
  reasonId: string;
  regionRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}) {
  const pathname = usePathname();
  const supportRef = useRef<HTMLSpanElement | null>(null);
  const noteRef = useRef<HTMLSpanElement | null>(null);
  return (
    <>
      {hold.wait && (
        <div
          ref={(el) => {
            regionRefs.current[PROJECT_READ] = el;
          }}
          data-hold-region={PROJECT_READ}
          className="mt-1.5 text-[11.5px] text-[var(--color-charcoal)]"
        >
          <p id={`${reasonId}-${PROJECT_READ}`}>{hold.wait}</p>
        </div>
      )}
      {hold.holds.map((h) => (
        <div
          key={h.kind}
          ref={(el) => {
            regionRefs.current[h.kind] = el;
          }}
          data-hold-region={h.kind}
          className="mt-1.5 text-[11.5px] text-[var(--color-charcoal)]"
        >
          {h.kind === 'no-client' && hold.leadLeftStudio ? (
            <p id={`${reasonId}-${h.kind}`}>
              The lead on this job has left the studio. Write to{' '}
              <span ref={supportRef} className="font-mono text-[11px]">
                {SUPPORT_ADDRESS}
              </span>{' '}
              and we&apos;ll move the job to someone on your team.
            </p>
          ) : (
            <p id={`${reasonId}-${h.kind}`}>{h.reason}</p>
          )}
          {h.kind === 'no-client' && hold.leadLeftStudio && (
            <CopyAct
              text={SUPPORT_ADDRESS}
              selectRef={supportRef}
              actionKey="copy-support-address"
              regionKey="payment-milestone"
            >
              Copy the address
            </CopyAct>
          )}
          {h.kind === 'no-client' && !hold.canLinkClient && !hold.leadLeftStudio && (
            <>
              <p className="mt-1 text-[var(--color-aged-oak)]">
                &ldquo;<span ref={noteRef}>{askLinkNote(hold.projectName)}</span>&rdquo;
              </p>
              <CopyAct
                text={askLinkNote(hold.projectName)}
                selectRef={noteRef}
                actionKey="copy-link-client-note"
                regionKey="payment-milestone"
              >
                Copy a note
              </CopyAct>
            </>
          )}
          {h.kind === 'no-client' && hold.canLinkClient && (
            <DocumentAction
              href={`/doc/${projectId}?sheet=household`}
              actionKey="link-milestone-client"
              surfaceKey="accounts"
              regionKey="payment-milestone"
              variant="tertiary"
              onClick={(e) => {
                e.currentTarget.focus();
                if (pathname === `/doc/${projectId}`) {
                  e.preventDefault();
                  window.dispatchEvent(new CustomEvent(OPEN_HOUSEHOLD_SHEET_EVENT));
                }
              }}
            >
              {MESSAGE_WITHHELD.repair}
            </DocumentAction>
          )}
          {h.kind === 'no-studio' && (
            <DocumentAction
              actionKey="name-milestone-studio"
              surfaceKey="accounts"
              regionKey="payment-milestone"
              variant="tertiary"
              onClick={() => openInvoiceComposer({ projectId })}
            >
              Name it in the composer
            </DocumentAction>
          )}
        </div>
      ))}
    </>
  );
}

function MilestoneRow({
  m,
  projectId,
  headless,
  draftHolds,
  draftReasonIds,
  confirmDraft,
}: {
  m: AccountMilestone;
  projectId: string;
  /** US-36 R2 — what holds Generate, one spotlight window per hold. */
  draftHolds: SpotlightHold[];
  draftReasonIds?: string;
  /** R4 — the fresh project read before the draft; a sentence refuses it. */
  confirmDraft: () => Promise<string | null>;
  /** Inside the Money region the head already carries the inked leader, so a
   *  per-milestone primary would stand a second leader beside it. */
  headless: boolean;
}) {
  // US-34 N3 — `optimistic-ink` on: the select holds the new trigger at once
  // and a refusal puts it back with one inline line; off: today's write.
  const ink = useFeatureFlag('optimistic-ink').value === true;
  const updateTrigger = useUpdateMilestoneTrigger(projectId, { optimistic: ink });
  const generate = useGenerateMilestoneInvoice(projectId);
  const [invoiceNote, setInvoiceNote] = useState<string | null>(null);
  // F4 — Generate's fresh read is under way: the press is committed and shows
  // it. Unmounting the row retires the act before it can draft.
  const [confirming, setConfirming] = useState(false);
  const actToken = useRef(0);
  useEffect(
    () => () => {
      actToken.current += 1;
    },
    [],
  );
  const [triggerFailed, setTriggerFailed] = useState<MilestoneTriggerInput | null>(null);
  const setTrigger = (input: MilestoneTriggerInput) => {
    if (!ink) {
      updateTrigger.mutate(input);
      return;
    }
    setTriggerFailed(null);
    updateTrigger.mutateAsync(input).catch(() => setTriggerFailed(input));
  };
  const triggerSaving = ink && updateTrigger.pending.some((p) => p.milestoneId === m.id);

  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-2 border-b border-dashed border-[var(--color-pearl)] py-1.5 min-[700px]:grid-cols-[minmax(0,1.2fr)_auto_auto_minmax(0,1.4fr)_auto]">
      <span className="text-[11.5px] text-[var(--color-charcoal)]">{m.label}</span>
      <span className="font-mono text-[11px] text-[var(--color-charcoal)]">
        {fmtUsd(m.amount_cents)}
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
        {m.paid_at ? `paid ${fmtDay(m.paid_at)}` : m.status}
      </span>
      <span className="flex items-baseline gap-1.5">
        <select
          value={m.trigger_kind ?? ''}
          onChange={(e) =>
            setTrigger({
              milestoneId: m.id,
              triggerKind: (e.target.value || null) as AccountMilestone['trigger_kind'],
              triggerSectionKey: m.trigger_section_key,
              dueDate: m.due_date,
            })
          }
          aria-label={`${m.label} trigger`}
          className="bg-transparent font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--text-muted)] outline-none"
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
              setTrigger({
                milestoneId: m.id,
                triggerKind: 'on_section_settled',
                triggerSectionKey: (e.target.value || null) as SectionKey | null,
              })
            }
            aria-label={`${m.label} section`}
            className="bg-transparent font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--color-clay-ink)] outline-none"
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
              setTrigger({
                milestoneId: m.id,
                triggerKind: 'on_date',
                dueDate: value,
              })
            }
            ariaLabel={`${m.label} date`}
            className="bg-transparent font-mono text-[11px] text-[var(--color-clay-ink)] outline-none"
          />
        )}
        {ink && (
          <span aria-busy={triggerSaving || undefined} className="font-mono text-[11px] text-[var(--text-muted)]">
            <SavingWord active={triggerSaving} />
          </span>
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
          disabled={generate.isPending || confirming || draftHolds.length > 0}
          held={draftHolds.length > 0}
          holds={draftHolds}
          aria-describedby={draftHolds.length > 0 ? draftReasonIds : undefined}
          loading={generate.isPending || confirming}
          loadingLabel="Generating…"
          onClick={() => {
            const token = ++actToken.current;
            setInvoiceNote(null);
            setConfirming(true);
            void confirmDraft().then((refusal) => {
              if (actToken.current !== token) return;
              setConfirming(false);
              if (refusal) {
                setInvoiceNote(refusal);
                return;
              }
              generate.mutate(m.id, {
                onSuccess: (invoiceId) => openInvoiceFolio(invoiceId),
                onError: (error) =>
                  setInvoiceNote(
                    error instanceof OfflineRefusal
                      ? error.message
                      : billingRefusal('milestone', error).sentence,
                  ),
              });
            });
          }}
          className="text-left"
        >
          Generate invoice
        </DocumentAction>
      )}
      {triggerFailed && (
        <div className="col-span-full">
          <InkAlert onRetry={() => setTrigger(triggerFailed)}>
            Couldn&rsquo;t save the trigger. It is as it was.
          </InkAlert>
        </div>
      )}
      {invoiceNote && (
        <p
          className="col-span-full font-mono text-[11px] normal-case tracking-normal"
          style={{ color: TERRACOTTA_INK }}
          role="alert"
        >
          Could not draft the invoice — {invoiceNote}
        </p>
      )}
      {/* N12b (R83) — a trigger change that failed; the selects are the retry. */}
      <ActFailLine className="col-span-full" error={updateTrigger.error} />
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
  // R1 — margin % · the trade → client line · est. commissions (client −
  // trade) show only to a viewer who may see margin.
  const canSeeMargin = useCanSeeMargin();
  // FR4 Fix 12 (`one-voice`) — a ratio reads as a fraction; convert it.
  const oneVoice = useFeatureFlag('one-voice').value === true;
  // Standalone, the band is an organ standing BETWEEN two stops on the paper
  // (care → record), so its top edge is the one region gap. Headless it is a
  // sub-seam inside the money region and keeps that region's own rhythm.
  const rootGap = headless ? 'mt-4' : 'mt-[var(--doc-region-gap)]';
  const [open, setOpen] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [amendmentOpen, setAmendmentOpen] = useState(false);
  const changeOnly = activeSection === 'install' || activeSection === 'care';
  const draftHold = useMilestoneDraftHold(
    projectId,
    !!data?.milestones.some((m) => !m.invoice_id),
  );
  const draftReasonId = useId();
  const draftRegions = useRef<Record<string, HTMLDivElement | null>>({});
  const draftHolds: SpotlightHold[] = [
    ...(draftHold.wait
      ? [{ id: PROJECT_READ, label: 'Generate invoice', reason: draftHold.wait }]
      : []),
    ...draftHold.holds.map((h) => ({ id: h.kind, label: h.repair, reason: h.reason })),
  ].map((h) => ({ ...h, target: () => draftRegions.current[h.id] ?? null }));
  const draftReasonIds = draftHolds.map((h) => `${draftReasonId}-${h.id}`).join(' ');

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
    // D-B39/W5-R3 — the same title row the loaded band prints
    // ("The accounts · this project"), so the box this band occupies is the
    // same shape whether it is loading or loaded; the pulse is the only
    // thing that mounts and unmounts inside it, and the title text never
    // changes across that transition.
    return (
      <div className={`${rootGap} rounded-[5px] bg-[rgba(229,226,221,0.32)]`}>
        <div className="grid w-full grid-cols-[auto_1fr_auto_auto] items-baseline gap-3 px-3 py-2 text-left">
          <span className="font-heading text-[12.5px] font-medium italic text-[var(--color-charcoal)]">
            The accounts · this project
            <SectionLoadingLine variant="inline" label="opening the ledger" />
          </span>
          <span aria-hidden />
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-quiet-ink)]">
            Studio eyes only
          </span>
          <span aria-hidden />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <AccountsQueryFailure
        title="Project accounts could not be loaded. Try again."
        message="Budget, commitments, milestones, and invoice actions are unavailable until this read succeeds."
        onRetry={refetch}
      />
    );
  }

  if (!data) {
    return (
      <p
        className={`${rootGap} font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]`}
      >
        No account record is available for this project.
      </p>
    );
  }

  const collapsedLine = [
    `${fmtUsd(data.budgetCents)} budget`,
    `${formatCurrencyTotal(data.committed)} committed`,
    canSeeMargin && data.marginPct != null ? `${data.marginPct}% margin` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={`${rootGap} rounded-[5px] bg-[rgba(229,226,221,0.32)]`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="grid w-full grid-cols-[auto_1fr_auto_auto] items-baseline gap-3 px-3 py-2 text-left"
      >
        <span className="font-heading text-[12.5px] font-medium italic text-[var(--color-charcoal)]">
          Project accounts
        </span>
        <span className="truncate font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
          {collapsedLine}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-quiet-ink)]">
          Studio only
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--color-clay-ink)]">
          {open ? 'fold ↑' : 'unfold ↓'}
        </span>
      </button>

      {open && (
        <div className="border-t border-[var(--color-pearl)] px-3 pb-3 pt-2">
          {/* Variance by room (× category beneath) — R25's rooms, one source. */}
          <div className="mb-1 grid grid-cols-[1fr_auto_auto_auto] gap-x-4">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Room
            </span>
            <span className="text-right font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Budget allocation
            </span>
            <span className="text-right font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Committed
            </span>
            <span className="text-right font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Budget variance
            </span>
          </div>
          {data.rooms.map((r) => (
            <div
              key={r.roomId ?? 'throughout'}
              className="border-b border-dashed border-[var(--color-pearl)] py-1"
            >
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4">
                <span className="text-[11.5px] text-[var(--color-charcoal)]">{r.roomName}</span>
                <span className="text-right font-mono text-[11px] text-[var(--color-charcoal)]">
                  {r.allocatedCents > 0 ? fmtUsd(r.allocatedCents) : '—'}
                </span>
                <span className="text-right font-mono text-[11px] text-[var(--color-charcoal)]">
                  {formatCurrencyTotal(r.committed)}
                </span>
                {r.varianceMixed ? (
                  <span className="text-right font-mono text-[11px] text-[var(--text-muted)]">
                    {mixedCurrenciesText(r.varianceMixed)}
                  </span>
                ) : (
                  <span
                    className="text-right font-mono text-[11px]"
                    style={{
                      color: r.varianceCents >= 0 ? SAGE_INK : TERRACOTTA_INK,
                    }}
                  >
                    {r.varianceCents >= 0
                      ? fmtUsd(r.varianceCents) + ' under'
                      : fmtUsd(-r.varianceCents) + ' over'}
                  </span>
                )}
              </div>
              {r.categories.length > 0 && (
                <p className="mt-px font-mono text-[11px] lowercase tracking-[0.03em] text-[var(--text-muted)]">
                  {r.categories
                    .map((c) => `${c.name.replace(/_/g, ' ')} ${formatCurrencyTotal(c.committed)}`)
                    .join(' · ')}
                </p>
              )}
            </div>
          ))}

          {/* The margin line — trade vs client, with the coverage note. */}
          {canSeeMargin && (
            <p className="mt-2 text-[11px] text-[var(--color-charcoal)]">
              {isMixed(data.margin) ? (
                `Margin: ${mixedCurrenciesText(data.margin.mixed)}.`
              ) : data.marginPct != null ? (
                <>
                  Trade {formatMoney(data.tradeCostCents, data.margin.currency)} → client{' '}
                  {formatMoney(data.clientValueCents, data.margin.currency)} ·{' '}
                  <span style={{ color: SAGE_INK }}>{data.marginPct}% margin</span>
                </>
              ) : (
                'No trade pricing on committed lines yet.'
              )}
              <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                {oneVoice
                  ? data.tradeCoverage.withTrade === data.tradeCoverage.total
                    ? 'trade cost on every committed line'
                    : `${data.tradeCoverage.total - data.tradeCoverage.withTrade} committed without trade cost`
                  : `trade cost on ${data.tradeCoverage.withTrade} of ${data.tradeCoverage.total} committed lines`}
              </span>
            </p>
          )}

          {/* The designer-earnings block → Accounts (stub target OK, R26). */}
          <p className="mt-1.5 text-[11px] text-[var(--color-charcoal)]">
            Design fee {fmtUsd(data.designFeeCents)}
            {canSeeMargin && (
              <>
                {' '}· est. commissions{' '}
                {isMixed(data.margin)
                  ? mixedCurrenciesText(data.margin.mixed)
                  : formatMoney(data.estCommissionCents, data.margin.currency)}
              </>
            )}
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
              <p className="mb-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Payment schedule
              </p>
              {data.milestones.map((m) => (
                <MilestoneRow
                  key={m.id}
                  m={m}
                  projectId={projectId}
                  headless={headless}
                  draftHolds={draftHolds}
                  draftReasonIds={draftReasonIds}
                  confirmDraft={draftHold.confirmFresh}
                />
              ))}
              <MilestoneDraftHoldLines
                hold={draftHold}
                projectId={projectId}
                reasonId={draftReasonId}
                regionRefs={draftRegions}
              />
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
                Draft an invoice
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
              Export to QuickBooks Online format
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
              <span className="font-mono text-[11px] text-[var(--text-muted)]">{exportNote}</span>
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
