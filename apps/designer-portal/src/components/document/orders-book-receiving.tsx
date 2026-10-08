'use client';

/**
 * Receiving (R28, C-9): the front-matter stat line (arriving · awaiting log ·
 * claims · 30-day pass rate — the I23 LedgerFrontMatter precedent) over the
 * warehouse-day queue. Every Inspect mounts the SAME I17 inspection drawer
 * the line unfolds use — one component, two doors. Cleared inspections fold
 * into the Settled group (the margin's Settled-fold pattern).
 *
 * The 30-day inspection window powers both the pass rate and the Cleared
 * fold; the warehouse queue is delivered POs with no inspection yet, with
 * shipped POs listed apart as receivable on arrival (C-19).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useDamageClaims,
  usePurchaseOrders,
  useReceivingInspections,
  useUpdateDamageClaim,
} from '@patina/supabase';
import { LogInspectionDrawer } from '@/components/portal/procurement/log-inspection-drawer';
import { Stamp } from './stamp';
import { receivingFrontMatter } from '@/lib/document/ledger-summary';
import { fmtDay } from '@/lib/document/format';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { DocumentAction, DocumentActionGroup } from './document-action';
import {
  InspectionPhotoStrip,
  inspectionPhotoIds,
} from './line-unfold/inspection-photo-strip';
import { ClaimClockLine } from './line-unfold/claim-clock';
import { ReceivingExceptions, TrackClaimAct } from './buying/exception-overlay';

type AnyRecord = any;

const isoOffsetDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

/**
 * `receiving_inspections.photo_asset_ids` (created 00150:43; 00445/00447 add
 * the RPCs that write it) — media-service MediaAsset UUIDs written by iOS
 * (`SupabaseReceivingService.swift:115`) or the desktop inspection drawer
 * (C-19). The count rides the meta line; claims also show the photo strip.
 */
export function inspectionPhotoLine(photoAssetIds: unknown): string | null {
  const n = inspectionPhotoIds(photoAssetIds).length;
  if (n === 0) return null;
  return `${n} photo${n === 1 ? '' : 's'}`;
}

/**
 * PRC-10 (R84): one figure of the receiving KPI strip — the proposal-watch
 * figures-strip grammar (divided columns, mono label over heading numeral),
 * inked for the laid paper sheet (R96).
 */
function Figure({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0 border-l border-[var(--color-pearl)] px-3 first:border-l-0 first:pl-0 sm:px-4">
      <p className="doc-type-meta font-semibold uppercase tracking-[0.1em] text-[var(--color-quiet-ink)]">
        {label}
      </p>
      <p className="mt-1 truncate font-heading text-[1.05rem] leading-none text-[var(--color-charcoal)]">
        {value}
      </p>
      {sub && (
        <p className="doc-type-meta mt-1 uppercase tracking-[0.06em] text-[var(--color-quiet-ink)]">
          {sub}
        </p>
      )}
    </div>
  );
}

/**
 * PRC-11 (R84): one open damage claim — DamageClaimDrawer's lifecycle ported
 * into the book's row grammar. Review/edit the auto-drafted description and
 * notify the vendor (drafted → vendor_notified), or close it with an
 * optional resolution note (vendor_notified → resolved). Forward-only, the
 * same useUpdateDamageClaim validation. Quiet confirms (R51), inline
 * failures (R83). C-19: the inspection's photos ride beneath as a strip.
 */
function OpenClaimRow({
  claim,
  onOpenDocument,
}: {
  claim: AnyRecord;
  onOpenDocument: (projectId: string | null) => void;
}) {
  const qc = useQueryClient();
  const updateClaim = useUpdateDamageClaim({ errorSurface: 'inline' });
  // US-19 F6-8 (D16, `one-voice`) — the paper's word is maker.
  const notifyLabel =
    useFeatureFlag('one-voice').value === true ? 'Notify the maker' : 'Notify vendor';
  const [act, setAct] = useState<'notify' | 'resolve' | null>(null);
  const [description, setDescription] = useState<string>(
    claim.description ?? '',
  );
  const [note, setNote] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const po = claim.inspection?.purchase_order;
  const vendorName = po?.vendor?.name ?? 'Vendor';
  const projectName = po?.project?.name ?? 'Project';
  const drafted = claim.state === 'drafted';

  const run = async (state: 'vendor_notified' | 'resolved') => {
    if (updateClaim.isPending) return;
    setError(null);
    try {
      await updateClaim.mutateAsync({
        id: claim.id,
        state,
        // Notify carries the reviewed description with it (the drawer's
        // review-then-notify); resolve carries the optional note.
        ...(state === 'vendor_notified' ? { description } : {}),
        ...(state === 'resolved' && note.trim()
          ? { resolution_notes: note.trim() }
          : {}),
      });
      // One act, many surfaces (§5): line stamps, unfold, Desk claim need.
      void qc.invalidateQueries({ queryKey: ['project-ffe-items'] });
      void qc.invalidateQueries({ queryKey: ['document-state'] });
      setDone(
        state === 'vendor_notified'
          ? `Vendor notified — ${vendorName} has the claim.`
          : 'Resolved — folded into the record.',
      );
      setAct(null);
    } catch (e) {
      setError((e as Error).message || 'The claim could not be updated.');
    }
  };

  return (
    <li className="border-b border-[var(--color-pearl)] px-1 py-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-[12rem] flex-1">
          <p className="doc-type-body font-medium text-[var(--color-charcoal)]">
            {vendorName} · {projectName}
          </p>
          <p className="doc-type-meta uppercase tracking-[0.05em] text-[var(--color-quiet-ink)]">
            {[
              `drafted ${fmtDay(claim.created_at)}`,
              claim.vendor_notified_at
                ? `vendor notified ${fmtDay(claim.vendor_notified_at)}`
                : null,
              claim.inspection?.outcome ?? null,
              inspectionPhotoLine(claim.inspection?.photo_asset_ids),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {/* C-20: the clock matters until the vendor is told. */}
          {drafted && (
            <ClaimClockLine
              purchaseOrderId={po?.id}
              vendorId={po?.vendor?.id}
              vendorName={vendorName}
              className="doc-type-meta mt-0.5"
            />
          )}
          {/* C-30: an inspection's claim opens an exception — the overlay
              row above then carries its clock and paths. Patina carries a
              catalog order's claim, so the studio is not offered Track it. */}
          {!claim.exception_id && !po?.is_patina_catalog && (
            <TrackClaimAct claimId={claim.id} />
          )}
        </div>
        <Stamp
          label={drafted ? 'claim drafted' : 'vendor notified'}
          color={
            drafted ? 'var(--color-terracotta)' : 'var(--color-golden-hour)'
          }
          ink={drafted ? 'var(--color-terracotta-ink)' : '#D8BE56'}
        />
        <div className="flex flex-wrap items-center gap-x-3">
          <DocumentAction
            actionKey={
              drafted ? 'review-claim-notification' : 'review-claim-resolution'
            }
            surfaceKey="orders"
            regionKey="damage-claim-row"
            variant="secondary"
            onClick={() =>
              setAct((cur) => (cur ? null : drafted ? 'notify' : 'resolve'))
            }
            aria-expanded={act != null}
          >
            {drafted ? notifyLabel : 'Mark resolved'}
          </DocumentAction>
          <button
            type="button"
            onClick={() => onOpenDocument(po?.project?.id ?? null)}
            className="da-score-hover doc-type-meta inline-flex min-h-11 min-w-11 items-center whitespace-nowrap text-[var(--color-quiet-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
          >
            open document →
          </button>
        </div>
      </div>

      <InspectionPhotoStrip photoAssetIds={claim.inspection?.photo_asset_ids} />

      {act === 'notify' && (
        <div className="mt-2 flex min-w-0 flex-col items-stretch gap-2 pl-1 sm:flex-row sm:items-end">
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the damage or shortage before notifying the vendor."
            aria-label="Claim description"
            className="doc-type-control min-h-11 w-full min-w-0 flex-1 resize-none rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 py-2 text-[var(--color-charcoal)] placeholder:text-[var(--text-faint)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
          />
          <DocumentAction
            actionKey="notify-vendor-of-claim"
            surfaceKey="orders"
            regionKey="claim-notification"
            variant="primary"
            disabled={updateClaim.isPending}
            loading={updateClaim.isPending}
            loadingLabel="Notifying…"
            onClick={() => void run('vendor_notified')}
          >
            {notifyLabel}
          </DocumentAction>
        </div>
      )}

      {act === 'resolve' && (
        <div className="mt-2 flex min-w-0 flex-col items-stretch gap-2 pl-1 sm:flex-row sm:items-end">
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="How was it resolved? (replacement shipped, credit issued…)"
            aria-label="Resolution notes"
            className="doc-type-control min-h-11 w-full min-w-0 flex-1 resize-none rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 py-2 text-[var(--color-charcoal)] placeholder:text-[var(--text-faint)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
          />
          <DocumentAction
            actionKey="resolve-damage-claim"
            surfaceKey="orders"
            regionKey="claim-resolution"
            variant="primary"
            disabled={updateClaim.isPending}
            loading={updateClaim.isPending}
            loadingLabel="Resolving…"
            onClick={() => void run('resolved')}
          >
            Mark resolved
          </DocumentAction>
        </div>
      )}

      {done && !error && (
        // R51: the quiet confirmation (the row leaves the open set on refetch).
        <p className="doc-type-body mt-1.5 text-[var(--color-charcoal)]">
          {done}
        </p>
      )}
      {error && (
        // R83: inline at the act — the reason and a retry.
        <div
          role="alert"
          className="doc-type-body mt-1.5 text-[var(--color-terracotta-ink)]"
        >
          <p>{error}</p>
          <DocumentActionGroup
            surfaceKey="orders"
            regionKey="claim-error"
            className="mt-2"
          >
            <DocumentAction
              actionKey="retry-damage-claim"
              variant="primary"
              onClick={() => void run(drafted ? 'vendor_notified' : 'resolved')}
            >
              Try again
            </DocumentAction>
          </DocumentActionGroup>
        </div>
      )}
    </li>
  );
}

/** One receivable PO in the warehouse queue — Inspect mounts the I17 drawer. */
function QueueRow({
  po,
  when,
  onInspect,
  onOpenDocument,
}: {
  po: AnyRecord;
  when: string | null;
  onInspect: () => void;
  onOpenDocument: (projectId: string | null) => void;
}) {
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--color-pearl)] px-1 py-3">
      <div className="min-w-[12rem] flex-1">
        <p className="doc-type-body font-medium text-[var(--color-charcoal)]">
          {po.po_number ?? po.vendor_po_number ?? po.sidemark ?? 'PO'} ·{' '}
          {po.vendor?.name ?? 'Vendor'}
        </p>
        <p className="doc-type-meta uppercase tracking-[0.05em] text-[var(--color-quiet-ink)]">
          {[po.project?.name ?? 'Project', when].filter(Boolean).join(' · ')}
        </p>
        {/* C-20 (D1-08): one dated sentence on a delivered row. */}
        {po.status === 'delivered' && (
          <ClaimClockLine
            purchaseOrderId={po.id}
            vendorId={po.vendor_id ?? po.vendor?.id}
            vendorName={po.vendor?.name ?? 'Vendor'}
            className="doc-type-meta mt-0.5"
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3">
        <DocumentAction
          actionKey="inspect-delivery"
          surfaceKey="orders"
          regionKey="receiving-row"
          variant="primary"
          onClick={onInspect}
        >
          Inspect
        </DocumentAction>
        <button
          type="button"
          onClick={() => onOpenDocument(po.project_id ?? po.project?.id ?? null)}
          className="da-score-hover doc-type-meta inline-flex min-h-11 min-w-11 items-center whitespace-nowrap text-[var(--color-quiet-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
        >
          open document →
        </button>
      </div>
    </li>
  );
}

/**
 * US-19 FR4 Fix 3 (520-4) — `File the claim` at PO grain sets this before it
 * opens the ledger on Receiving; the page spends it once its claims have read,
 * landing on the first open claim's own act (`Notify vendor`, or `Mark
 * resolved` once the vendor is told). The ledger is never the landing.
 */
export const receivingClaimLanding = { pending: false };

const CLAIM_ACT =
  '[data-action-key="review-claim-notification"], [data-action-key="review-claim-resolution"]';

export function ReceivingBookPage({
  projectId,
  onClearProject,
  onOpenDocument,
}: {
  projectId?: string | null;
  onClearProject?: () => void;
  onOpenDocument: (projectId: string | null) => void;
}) {
  const since30 = useMemo(() => isoOffsetDays(-30), []);
  const { data: orders, isLoading: ordersLoading } = usePurchaseOrders() as {
    data: AnyRecord[] | undefined;
    isLoading: boolean;
  };
  const { data: inspections, isLoading: inspLoading } = useReceivingInspections(
    {
      sinceDate: since30,
    },
  ) as { data: AnyRecord[] | undefined; isLoading: boolean };
  const { data: draftedClaims, isLoading: draftedLoading } = useDamageClaims({
    state: 'drafted',
  }) as {
    data: AnyRecord[] | undefined;
    isLoading: boolean;
  };
  const { data: notifiedClaims, isLoading: notifiedLoading } = useDamageClaims({
    state: 'vendor_notified',
  }) as {
    data: AnyRecord[] | undefined;
    isLoading: boolean;
  };

  const [target, setTarget] = useState<AnyRecord | null>(null);
  const [showCleared, setShowCleared] = useState(false);

  // US-16 (C-08): none of these hooks take a project id, so the lens narrows
  // every already-fetched list client-side — same project the Ledger holds.
  const matchesProject = (poLike: AnyRecord | null | undefined) =>
    !projectId || (poLike?.project_id ?? poLike?.project?.id) === projectId;

  const filteredOrders = useMemo(
    () => (orders ?? []).filter((po) => matchesProject(po)),
    [orders, projectId],
  );
  const filteredInspections = useMemo(
    () =>
      (inspections ?? []).filter((i) => matchesProject(i.purchase_order)),
    [inspections, projectId],
  );
  const filteredDraftedClaims = useMemo(
    () =>
      (draftedClaims ?? []).filter((c) =>
        matchesProject(c.inspection?.purchase_order),
      ),
    [draftedClaims, projectId],
  );
  const filteredNotifiedClaims = useMemo(
    () =>
      (notifiedClaims ?? []).filter((c) =>
        matchesProject(c.inspection?.purchase_order),
      ),
    [notifiedClaims, projectId],
  );

  const openClaimCount =
    filteredDraftedClaims.length + filteredNotifiedClaims.length;

  // PRC-11: the open-claims group — drafted first (they need the notify act),
  // then vendor-notified, newest first within each (the hooks' order).
  const openClaims = useMemo(
    () => [...filteredDraftedClaims, ...filteredNotifiedClaims],
    [filteredDraftedClaims, filteredNotifiedClaims],
  );

  // Warehouse-day queue: delivered POs with no inspection logged, oldest ETA
  // first (the day's work, in arrival order). C-19: shipped POs are receivable
  // too (the receipt RPC accepts shipped → received when the box beats the
  // carrier's delivered scan); they list apart so the counts stay honest.
  const [queue, inTransit] = useMemo(() => {
    const inspectedPoIds = new Set(
      filteredInspections.map((i) => i.purchase_order_id),
    );
    const byArrival = (status: string) =>
      filteredOrders
        .filter((po) => po.status === status && !inspectedPoIds.has(po.id))
        .sort((a, b) => {
          const ax = a.confirmed_eta ?? a.delivered_date ?? '';
          const bx = b.confirmed_eta ?? b.delivered_date ?? '';
          return ax < bx ? -1 : ax > bx ? 1 : 0;
        });
    return [byArrival('delivered'), byArrival('shipped')];
  }, [filteredOrders, filteredInspections]);

  // Cleared inspections (clean, 30-day window) — the Settled fold.
  const cleared = useMemo(
    () => filteredInspections.filter((i) => i.outcome === 'clean'),
    [filteredInspections],
  );

  const stats = useMemo(
    () =>
      receivingFrontMatter(
        filteredOrders as AnyRecord[],
        filteredInspections as AnyRecord[],
        openClaimCount,
      ),
    [filteredOrders, filteredInspections, openClaimCount],
  );

  const isLoading = ordersLoading || inspLoading;

  // FR4 Fix 3 — two frames, so the landing follows the sheet's own focus.
  // Never cancelled: StrictMode's second pass finds the flag already spent.
  const pageRef = useRef<HTMLDivElement | null>(null);
  const claimsRead = !isLoading && !draftedLoading && !notifiedLoading;
  useEffect(() => {
    if (!receivingClaimLanding.pending || !claimsRead) return;
    receivingClaimLanding.pending = false;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const control = pageRef.current?.querySelector<HTMLElement>(CLAIM_ACT);
        control?.scrollIntoView?.({ block: 'center' });
        control?.focus({ preventScroll: true });
      }),
    );
  }, [claimsRead]);

  return (
    <div ref={pageRef} className="mx-auto w-full min-w-0 max-w-3xl">
      {/* US-16 (C-08): the lens followed the designer in from the Document —
          quiet, same LensLink grammar as the Ledger (:365-376), not a pill. */}
      {projectId && (
        <div className="mb-3 flex items-center gap-x-2.5 border-b border-[var(--color-pearl)] pb-1">
          <span className="doc-type-meta uppercase tracking-[0.08em] text-[var(--color-quiet-ink)]">
            project ·
          </span>
          <button
            type="button"
            onClick={onClearProject}
            className="da-score-hover doc-type-meta inline-flex min-h-11 min-w-11 items-center uppercase tracking-[0.06em] text-[var(--color-quiet-ink)] transition-colors hover:text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
          >
            all projects
          </button>
        </div>
      )}
      {/* PRC-10 (R84): the four-figure KPI strip — arriving · awaiting log ·
          open claims · received (30d) — in the proposal-watch figures-strip
          grammar. Counts derive from the queries the page already holds
          (receivingFrontMatter, R5-pure). */}
      {!isLoading && (
        <div className="mb-4 grid grid-cols-2 items-stretch gap-y-4 border-y border-[var(--color-pearl)] py-3 sm:grid-cols-4 sm:gap-y-0">
          <Figure
            label="Arriving"
            value={stats.find((s) => s.label === 'Arriving')?.value ?? '0'}
            sub="next 7 days"
          />
          <Figure
            label="Awaiting log"
            value={stats.find((s) => s.label === 'Awaiting log')?.value ?? '0'}
          />
          <Figure label="Open claims" value={String(openClaimCount)} />
          <Figure
            label="Received · 30d"
            value={String((inspections ?? []).length)}
            sub={
              stats.find((s) => s.label === '30-day pass')
                ? `${stats.find((s) => s.label === '30-day pass')!.value} clean`
                : undefined
            }
          />
        </div>
      )}

      {isLoading ? (
        <p className="doc-type-body py-3 italic text-[var(--color-quiet-ink)]">
          Opening the book…
        </p>
      ) : (
        <>
          {/* The warehouse-day queue — delivered, awaiting the log. */}
          <p className="doc-type-meta mb-1 font-semibold uppercase tracking-[0.08em] text-[var(--color-quiet-ink)]">
            Awaiting inspection · {queue.length}
          </p>
          <ul className="mb-5">
            {queue.map((po) => (
              <QueueRow
                key={po.id}
                po={po}
                when={
                  po.delivered_date
                    ? `delivered ${fmtDay(po.delivered_date)}`
                    : po.confirmed_eta
                      ? `arrived ~${fmtDay(po.confirmed_eta)}`
                      : null
                }
                onInspect={() => setTarget(po)}
                onOpenDocument={onOpenDocument}
              />
            ))}
            {queue.length === 0 && (
              <li className="doc-type-body py-2 italic text-[var(--color-quiet-ink)]">
                Nothing waiting on the warehouse floor.
              </li>
            )}
          </ul>

          {/* C-19: shipped, not yet scanned delivered — receivable on arrival. */}
          {inTransit.length > 0 && (
            <>
              <p className="doc-type-meta mb-1 font-semibold uppercase tracking-[0.08em] text-[var(--color-quiet-ink)]">
                Shipped · receive on arrival · {inTransit.length}
              </p>
              <ul className="mb-5">
                {inTransit.map((po) => (
                  <QueueRow
                    key={po.id}
                    po={po}
                    when={
                      po.confirmed_eta
                        ? `shipped · due ~${fmtDay(po.confirmed_eta)}`
                        : 'shipped'
                    }
                    onInspect={() => setTarget(po)}
                    onOpenDocument={onOpenDocument}
                  />
                ))}
              </ul>
            </>
          )}

          {/* C-30: every unresolved exception, with its clock and paths. */}
          <ReceivingExceptions projectId={projectId ?? null} />

          {/* PRC-11: open claims — the lifecycle acts live where the book
              already counts them. */}
          {openClaims.length > 0 && (
            <>
              <p className="doc-type-meta mb-1 font-semibold uppercase tracking-[0.08em] text-[var(--color-quiet-ink)]">
                Open claims · {openClaims.length}
              </p>
              <ul className="mb-5">
                {openClaims.map((c) => (
                  <OpenClaimRow
                    key={c.id}
                    claim={c}
                    onOpenDocument={onOpenDocument}
                  />
                ))}
              </ul>
            </>
          )}

          {/* The Settled fold — cleared inspections, collapsed (R12 pattern). */}
          {cleared.length > 0 && (
            <div className="border-t border-[var(--color-pearl)] pt-2">
              <button
                type="button"
                onClick={() => setShowCleared((v) => !v)}
                aria-expanded={showCleared}
                className="da-score-hover doc-type-meta inline-flex min-h-11 min-w-11 items-center uppercase tracking-[0.07em] text-[var(--color-quiet-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
              >
                Settled · {cleared.length} cleared · 30 days{' '}
                {showCleared ? '↑' : '↓'}
              </button>
              {showCleared && (
                <ul className="mt-1.5 opacity-70">
                  {cleared.map((i) => (
                    <li
                      key={i.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-dashed border-[var(--color-pearl)] px-1 py-2"
                    >
                      <span className="doc-type-body min-w-[12rem] flex-1 text-[var(--color-charcoal)]">
                        {i.purchase_order?.vendor?.name ?? 'Vendor'} ·{' '}
                        {i.purchase_order?.project?.name ?? 'Project'}
                      </span>
                      <span className="doc-type-meta uppercase tracking-[0.05em] text-[var(--color-sage)]">
                        {['clean', fmtDay(i.inspected_at), inspectionPhotoLine(i.photo_asset_ids)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {/* I17: the same inspection drawer the line unfolds mount. */}
      {target && (
        <LogInspectionDrawer
          open
          onOpenChange={(o: boolean) => {
            if (!o) setTarget(null);
          }}
          purchaseOrderId={target.id}
          projectId={target.project_id ?? target.project?.id ?? undefined}
          poLabel={
            target.vendor_po_number ??
            target.po_number ??
            target.sidemark ??
            'PO'
          }
          vendorName={target.vendor?.name ?? 'Vendor'}
          projectName={target.project?.name ?? 'Project'}
        />
      )}
    </div>
  );
}
