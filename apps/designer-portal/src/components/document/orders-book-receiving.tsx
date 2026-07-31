'use client';

/**
 * Receiving (R28, C-9): the front-matter stat line (arriving · awaiting log ·
 * claims · 30-day pass rate — the I23 LedgerFrontMatter precedent) over the
 * warehouse-day queue. Every Inspect mounts the SAME I17 inspection drawer
 * the line unfolds use — one component, two doors. Cleared inspections fold
 * into the Settled group (the margin's Settled-fold pattern).
 *
 * The 30-day inspection window powers both the pass rate and the Cleared
 * fold; the warehouse queue is delivered POs with no inspection yet.
 */

import { useMemo, useState } from 'react';
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
import { DocumentAction, DocumentActionGroup } from './document-action';

type AnyRecord = any;

const isoOffsetDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

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
 * failures (R83). Photos stay iOS-only, as in the drawer.
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
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Stamp
          label={drafted ? 'claim drafted' : 'vendor notified'}
          color={
            drafted ? 'var(--color-terracotta)' : 'var(--color-golden-hour)'
          }
          ink={drafted ? undefined : '#D8BE56'}
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
            {drafted ? 'Notify vendor' : 'Mark resolved'}
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
            Notify vendor
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
          className="doc-type-body mt-1.5 text-[var(--color-terracotta)]"
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

export function ReceivingBookPage({
  onOpenDocument,
}: {
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
  const { data: draftedClaims } = useDamageClaims({ state: 'drafted' }) as {
    data: AnyRecord[] | undefined;
  };
  const { data: notifiedClaims } = useDamageClaims({
    state: 'vendor_notified',
  }) as {
    data: AnyRecord[] | undefined;
  };

  const [target, setTarget] = useState<AnyRecord | null>(null);
  const [showCleared, setShowCleared] = useState(false);

  const openClaimCount =
    (draftedClaims?.length ?? 0) + (notifiedClaims?.length ?? 0);

  // PRC-11: the open-claims group — drafted first (they need the notify act),
  // then vendor-notified, newest first within each (the hooks' order).
  const openClaims = useMemo(
    () => [...(draftedClaims ?? []), ...(notifiedClaims ?? [])],
    [draftedClaims, notifiedClaims],
  );

  // Warehouse-day queue: delivered POs with no inspection logged, oldest ETA
  // first (the day's work, in arrival order).
  const queue = useMemo(() => {
    const inspectedPoIds = new Set(
      (inspections ?? []).map((i) => i.purchase_order_id),
    );
    return (orders ?? [])
      .filter((po) => po.status === 'delivered' && !inspectedPoIds.has(po.id))
      .sort((a, b) => {
        const ax = a.confirmed_eta ?? a.delivered_date ?? '';
        const bx = b.confirmed_eta ?? b.delivered_date ?? '';
        return ax < bx ? -1 : ax > bx ? 1 : 0;
      });
  }, [orders, inspections]);

  // Cleared inspections (clean, 30-day window) — the Settled fold.
  const cleared = useMemo(
    () => (inspections ?? []).filter((i) => i.outcome === 'clean'),
    [inspections],
  );

  const stats = useMemo(
    () =>
      receivingFrontMatter(
        (orders ?? []) as AnyRecord[],
        (inspections ?? []) as AnyRecord[],
        openClaimCount,
      ),
    [orders, inspections, openClaimCount],
  );

  const isLoading = ordersLoading || inspLoading;

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl">
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
              <li
                key={po.id}
                className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--color-pearl)] px-1 py-3"
              >
                <div className="min-w-[12rem] flex-1">
                  <p className="doc-type-body font-medium text-[var(--color-charcoal)]">
                    {po.po_number ?? po.vendor_po_number ?? po.sidemark ?? 'PO'}{' '}
                    · {po.vendor?.name ?? 'Vendor'}
                  </p>
                  <p className="doc-type-meta uppercase tracking-[0.05em] text-[var(--color-quiet-ink)]">
                    {[
                      po.project?.name ?? 'Project',
                      po.delivered_date
                        ? `delivered ${fmtDay(po.delivered_date)}`
                        : po.confirmed_eta
                          ? `arrived ~${fmtDay(po.confirmed_eta)}`
                          : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-3">
                  <DocumentAction
                    actionKey="inspect-delivery"
                    surfaceKey="orders"
                    regionKey="receiving-row"
                    variant="primary"
                    onClick={() => setTarget(po)}
                  >
                    Inspect
                  </DocumentAction>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenDocument(po.project_id ?? po.project?.id ?? null)
                    }
                    className="da-score-hover doc-type-meta inline-flex min-h-11 min-w-11 items-center whitespace-nowrap text-[var(--color-quiet-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
                  >
                    open document →
                  </button>
                </div>
              </li>
            ))}
            {queue.length === 0 && (
              <li className="doc-type-body py-2 italic text-[var(--color-quiet-ink)]">
                Nothing waiting on the warehouse floor.
              </li>
            )}
          </ul>

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
                        clean · {fmtDay(i.inspected_at)}
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
