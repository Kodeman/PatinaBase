'use client';

/**
 * The Vendors page (R28, C-7): each vendor page is a small book — a bookbar
 * (Terms · Thread · Orders · N), DM-mono page links never tabs. Terms carries
 * the trade account + the "+ Brief vendor" opener; Thread carries the vendor
 * comms in the margin's .mitem grammar (the studio's own posts read "You" in
 * clay) with a PO-anchored deep-link into the document; Orders carries the
 * open POs. "+ Brief vendor" (R29 colophon) opens this pane pre-addressed.
 *
 * The thread resolves through vendors.contact_profile_id (00207): the
 * vendor_brief threads whose vendor-side participant is the company's comms
 * profile. A vendor without a profile has no thread yet — the page says so.
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBrowserClient,
  useProcurementItems,
  useSendMessage,
  useStartVendorBrief,
  useThreadMessages,
  useUser,
} from '@patina/supabase';
import {
  OrderAssistant,
  type OrderAssistantFFEItem,
  type OrderAssistantProject,
  type OrderAssistantVendor,
} from '@/components/portal/procurement/order-assistant';
import { Stamp } from './stamp';
import { MItem } from './m-item';
import {
  DocumentAction,
  DocumentActionGroup,
  DocumentActionRow,
} from './document-action';
import { fmtDay, fmtUsd } from '@/lib/document/format';

type AnyRecord = any;

const getSupabase = () => createBrowserClient() as AnyRecord;

const MONO_LABEL =
  'doc-type-meta uppercase tracking-[0.08em] text-[var(--color-quiet-ink)]';
const ROW_LINK =
  'da-score-hover doc-type-meta inline-flex min-h-11 min-w-11 items-center text-[var(--color-quiet-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]';
// The vendor message accent — dusty-blue (the message margin kind); MItem
// repaints it clay for the studio's own voice.
const MSG_ACCENT = {
  border: 'var(--color-dusty-blue)',
  label: 'var(--color-dusty-blue)',
};

type VendorPage = 'terms' | 'thread' | 'orders';

const PO_STAMP: Record<string, { color: string; ink?: string }> = {
  draft: { color: 'var(--color-aged-oak)', ink: 'var(--color-aged-oak)' },
  confirmed: { color: 'var(--color-dusty-blue)' },
  in_production: { color: 'var(--color-golden-hour)', ink: '#D8BE56' },
  shipped: { color: 'var(--color-golden-hour)', ink: '#D8BE56' },
  delivered: { color: 'var(--color-sage)' },
  cancelled: { color: 'var(--color-terracotta)' },
};

const termsLabel = (vendor: AnyRecord): string =>
  vendor.default_payment_terms
    ? vendor.default_payment_terms.replace(/_/g, ' ')
    : 'terms n/a';

// ─── PRC-24 (R84): "Order all —" — the multi-line Order Assistant ──────────

/**
 * An item is orderable when approved and not yet on a PO; decision-blocked
 * items are excluded up front so the assistant never opens on a batch it
 * would refuse. Ported from the by-vendor page's W3-T3a gate
 * (app/(portal)/portal/procurement/by-vendor/page.tsx — isOrderable).
 */
const isOrderable = (it: AnyRecord): boolean => {
  if (it.status !== 'approved' || it.purchase_order_id) return false;
  if (it.blocked && it.blocked_by_decision_id) return false;
  return !!it.vendor_id;
};

/** One assistant session — one (vendor, project) pair → one PO (W3-T3a). */
interface PendingOrder {
  vendor: OrderAssistantVendor;
  project: OrderAssistantProject;
  ffeItems: OrderAssistantFFEItem[];
}

/**
 * The vendor page's whole-queue ordering act: every approved-unordered FF&E
 * line the studio holds with this vendor, fed to the existing OrderAssistant
 * (all steps, same atomic create-PO RPC + sidemark + coverage vote). One PO
 * covers one project, so a multi-project vendor enqueues one session per
 * (vendor, project) and the assistant walks the queue — the by-vendor page's
 * exact mechanism, in the book's DM-mono grammar. PRC-09's order-all rides
 * this same act.
 */
function VendorOrderAll({ vendor }: { vendor: AnyRecord }) {
  const { data: items } = useProcurementItems({ vendorId: vendor.id }) as {
    data: AnyRecord[] | undefined;
  };
  const orderable = useMemo(() => (items ?? []).filter(isOrderable), [items]);
  const [queue, setQueue] = useState<PendingOrder[]>([]);
  const active = queue[0] ?? null;

  // Catalog vendors keep their Patina-handled path (W1.5.5) — no manual POs.
  // NOTE: a live queue keeps the mount alive even as the created POs drain
  // the orderable list (invalidateFfeCaches refetches mid-walk) — otherwise
  // the assistant's created step would vanish under the designer.
  if (vendor.is_patina_catalog || (orderable.length === 0 && !active))
    return null;

  const orderAll = () => {
    const assistantVendor: OrderAssistantVendor = {
      id: vendor.id,
      name: vendor.name,
      default_payment_terms: vendor.default_payment_terms ?? null,
      trade_portal_url: vendor.trade_portal_url ?? undefined,
      trade_account_email: vendor.trade_account_email ?? undefined,
      is_patina_catalog: vendor.is_patina_catalog ?? false,
      orders_email: vendor.orders_email ?? null,
      contact_info: vendor.contact_info ?? null,
    };
    const byProject = new Map<string, AnyRecord[]>();
    for (const it of orderable) {
      const list = byProject.get(it.project_id) ?? [];
      list.push(it);
      byProject.set(it.project_id, list);
    }
    setQueue(
      Array.from(byProject.entries()).map(([pid, list]) => ({
        vendor: assistantVendor,
        project: { id: pid, name: list[0].project?.name ?? 'Project' },
        ffeItems: list.map((it) => ({
          id: it.id,
          name: it.name,
          room: it.room?.name,
          line_total_cents: it.line_total_cents ?? 0,
          // Dual pricing (00185/00186): the assistant totals
          // COALESCE(trade, unit) × qty, matching the RPC's server total.
          quantity: it.quantity ?? 1,
          unit_price_cents: it.unit_price_cents ?? null,
          trade_price_cents: it.trade_price_cents ?? null,
          blocked: it.blocked,
          blocked_by_decision_id: it.blocked_by_decision_id ?? null,
          blocked_reason: it.blocked_reason,
          spec: it.spec ?? null,
          configurationSnapshot:
            it.configurationSnapshot ?? it.configuration_snapshot ?? null,
          configurationSnapshotHash:
            it.configurationSnapshotHash ??
            it.configuration_snapshot_hash ??
            null,
          configurationLockedAt:
            it.configurationLockedAt ?? it.configuration_locked_at ?? null,
        })),
      })),
    );
  };

  return (
    <>
      {orderable.length > 0 && (
        <DocumentActionGroup
          surfaceKey="orders"
          regionKey="vendor-order-all"
          className="mb-2 justify-between"
          aria-label="Vendor ordering actions"
        >
          <DocumentAction
            actionKey="order-all-vendor-items"
            variant="primary"
            onClick={orderAll}
            trailing="→"
          >
            Order all — {orderable.length} item
            {orderable.length === 1 ? '' : 's'}
          </DocumentAction>
          <span className={MONO_LABEL}>approved · unordered</span>
        </DocumentActionGroup>
      )}
      {/* D4 inside the book: the shared assistant carries shadow-xl in the
          old zones — strip it here without touching it (the R3/line-unfold
          precedent). */}
      {active && (
        <div className="contents [&_.shadow-xl]:shadow-none">
          <OrderAssistant
            open
            onOpenChange={(open: boolean) => {
              if (!open) setQueue((q) => q.slice(1));
            }}
            vendor={active.vendor}
            project={active.project}
            ffeItems={active.ffeItems}
            scopeDisclaimer={
              queue.length > 1
                ? `${queue.length} project orders queued for ${active.vendor.name} — you'll confirm each in turn.`
                : undefined
            }
          />
        </div>
      )}
    </>
  );
}

/** The vendor's brief threads, newest first (RLS scopes to the caller). */
function useVendorThreads(contactProfileId: string | null) {
  return useQuery({
    queryKey: ['vendor-threads', contactProfileId],
    enabled: !!contactProfileId,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('comms_threads')
        .select(
          'id, project_id, created_at, last_message_at, project:projects(name), participants:comms_thread_participants!inner(profile_id, role)',
        )
        .eq('kind', 'vendor_brief')
        .eq('participants.profile_id', contactProfileId)
        .eq('participants.role', 'vendor')
        .order('last_message_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as AnyRecord[];
    },
  });
}

/** One brief's messages in the margin's .mitem grammar + the reply line.
 *  A PO-anchored deep-link chip (R28) lets the thread jump to its document. */
function VendorThread({
  thread,
  onOpenDocument,
}: {
  thread: AnyRecord;
  onOpenDocument: (projectId: string | null) => void;
}) {
  const qc = useQueryClient();
  const { user } = useUser();
  const { data: pages } = useThreadMessages(thread.id) as { data: AnyRecord };
  const send = useSendMessage();
  const [body, setBody] = useState('');

  const messages: AnyRecord[] = useMemo(() => {
    const flat = (pages?.pages ?? []).flat();
    return flat.slice(0, 12).reverse(); // oldest → newest down the page
  }, [pages]);

  const projectName = thread.project?.name ?? null;
  const deepLink =
    thread.project_id && projectName ? (
      <button
        type="button"
        onClick={() => onOpenDocument(thread.project_id)}
        className="da-score-hover doc-type-meta inline-flex min-h-11 min-w-11 items-center uppercase tracking-[0.1em] text-[var(--color-quiet-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
      >
        re: {projectName} →
      </button>
    ) : null;

  return (
    <div className="mt-1.5">
      {deepLink && <div className="mb-1.5">{deepLink}</div>}
      <ul className="mb-2 space-y-1.5">
        {messages.map((m) => {
          const own =
            !m.system && m.sender_id != null && m.sender_id === user?.id;
          const sender = m.system
            ? 'The book'
            : own
              ? 'You'
              : (m.sender?.full_name ?? 'Message');
          return (
            <MItem
              key={m.id}
              tone="paper"
              accent={MSG_ACCENT}
              ownVoice={own}
              kindLine={`${sender} · ${fmtDay(m.created_at)}`}
              title={m.body}
            />
          );
        })}
        {messages.length === 0 && (
          <li className="doc-type-body italic text-[var(--color-quiet-ink)]">
            Opening the thread…
          </li>
        )}
      </ul>
      <DocumentActionRow
        surfaceKey="orders"
        regionKey="vendor-thread-reply"
        className="min-w-0 flex-col items-stretch sm:flex-row sm:items-end"
        aria-label="Vendor reply actions"
      >
        <textarea
          rows={2}
          placeholder="Reply…"
          aria-label="Reply to vendor"
          className="doc-type-control min-h-11 w-full min-w-0 flex-1 resize-none rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 py-2 text-[var(--color-charcoal)] placeholder:text-[var(--text-faint)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <DocumentAction
          actionKey="send-vendor-reply"
          variant="primary"
          disabled={!body.trim() || send.isPending}
          loading={send.isPending}
          loadingLabel="Sending…"
          onClick={() =>
            send.mutate(
              { threadId: thread.id, body: body.trim() },
              {
                onSuccess: () => {
                  setBody('');
                  void qc.invalidateQueries({ queryKey: ['comms'] });
                  void qc.invalidateQueries({ queryKey: ['vendor-threads'] });
                },
              },
            )
          }
        >
          Send
        </DocumentAction>
      </DocumentActionRow>
    </div>
  );
}

/** The "+ Brief vendor" composer — R29's pre-addressed landing. */
function BriefComposer({
  vendor,
  briefProjectId,
  briefProjectName,
  onOpened,
}: {
  vendor: AnyRecord;
  briefProjectId: string | null;
  briefProjectName: string | null;
  onOpened: () => void;
}) {
  const startBrief = useStartVendorBrief();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!vendor.contact_profile_id) {
    return (
      <p className="doc-type-body mt-2 italic text-[var(--color-quiet-ink)]">
        No comms profile on file for {vendor.name} — link one to open a thread.
      </p>
    );
  }

  return (
    <div className="mt-3 border-t border-[var(--color-pearl)] pt-2">
      <p className={MONO_LABEL}>
        + Brief vendor{briefProjectName ? ` · about ${briefProjectName}` : ''}
      </p>
      <DocumentActionRow
        surfaceKey="orders"
        regionKey="vendor-brief"
        className="mt-1 min-w-0 flex-col items-stretch sm:flex-row sm:items-end"
        aria-label="Vendor brief actions"
      >
        <textarea
          rows={2}
          placeholder={`Brief ${vendor.name}…`}
          aria-label="Opening brief"
          className="doc-type-control min-h-11 w-full min-w-0 flex-1 resize-none rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 py-2 text-[var(--color-charcoal)] placeholder:text-[var(--text-faint)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <DocumentAction
          actionKey="open-vendor-brief"
          variant="primary"
          disabled={!body.trim() || startBrief.isPending}
          loading={startBrief.isPending}
          loadingLabel="Opening…"
          onClick={() => {
            setError(null);
            startBrief.mutate(
              {
                vendorProfileId: vendor.contact_profile_id,
                projectId: briefProjectId ?? undefined,
                initialMessage: body.trim(),
              },
              {
                onSuccess: () => {
                  setBody('');
                  onOpened();
                },
                onError: (e: unknown) =>
                  setError(
                    e instanceof Error ? e.message : 'Could not open the brief',
                  ),
              },
            );
          }}
        >
          Open brief
        </DocumentAction>
      </DocumentActionRow>
      {error && (
        <p className="doc-type-body mt-1 text-[var(--color-terracotta)]">
          {error}
        </p>
      )}
    </div>
  );
}

/** The vendor pane's bookbar — DM-mono page links, never tabs (R28). */
function VendorBookbar({
  vendor,
  page,
  openCount,
  onPage,
}: {
  vendor: AnyRecord;
  page: VendorPage;
  openCount: number;
  onPage: (p: VendorPage) => void;
}) {
  const pages: { key: VendorPage; label: string }[] = [
    { key: 'terms', label: `Terms · ${termsLabel(vendor)}` },
    { key: 'thread', label: 'Thread' },
    { key: 'orders', label: `Orders · ${openCount}` },
  ];
  return (
    <div className="mb-3 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--color-pearl)] pb-1">
      <span className="font-heading text-[15px] font-medium text-[var(--color-charcoal)]">
        {vendor.name}{' '}
        <em className="not-italic text-[var(--color-quiet-ink)]">· vendor</em>
      </span>
      <span className="ml-auto flex flex-wrap items-center gap-x-3">
        {pages.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPage(p.key)}
            aria-current={page === p.key ? 'page' : undefined}
            className={`da-score-hover doc-type-meta inline-flex min-h-11 min-w-11 items-center uppercase tracking-[0.1em] transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)] ${
              page === p.key
                ? 'da-score-on text-[var(--color-charcoal)]'
                : 'text-[var(--color-quiet-ink)] hover:text-[var(--color-charcoal)]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </span>
    </div>
  );
}

export function VendorsBookPage({
  vendors,
  orders,
  initialVendorId,
  briefProjectId,
  onOpenDocument,
}: {
  vendors: AnyRecord[];
  orders: AnyRecord[];
  initialVendorId: string | null;
  /** R29 pre-addressing: the document the brief is about. */
  briefProjectId: string | null;
  onOpenDocument: (projectId: string | null) => void;
}) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(initialVendorId);
  const [page, setPage] = useState<VendorPage>('thread');
  const vendor = vendors.find((v) => v.id === selectedId) ?? null;

  const openPos = useMemo(
    () =>
      (orders ?? []).filter(
        (o) =>
          o.vendor_id === selectedId &&
          o.status !== 'cancelled' &&
          o.status !== 'delivered',
      ),
    [orders, selectedId],
  );

  const { data: threads } = useVendorThreads(
    vendor?.contact_profile_id ?? null,
  );
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const thread =
    (threads ?? []).find((t) => t.id === activeThreadId) ??
    (threads ?? [])[0] ??
    null;

  const briefProjectName =
    briefProjectId != null
      ? ((orders ?? []).find(
          (o) => (o.project_id ?? o.project?.id) === briefProjectId,
        )?.project?.name ?? null)
      : null;

  if (!vendor) {
    return (
      <ul className="min-w-0">
        {vendors.map((v) => (
          <li
            key={v.id}
            className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--color-pearl)] px-1 py-3"
          >
            <div className="min-w-[12rem] flex-1">
              <button
                type="button"
                onClick={() => setSelectedId(v.id)}
                className="da-score-hover doc-type-body inline-flex min-h-11 min-w-11 items-center text-left font-medium text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
              >
                {v.name}
              </button>
              <p className="doc-type-meta uppercase tracking-[0.05em] text-[var(--color-quiet-ink)]">
                {[
                  v.default_payment_terms?.replace(/_/g, ' '),
                  v.trade_account_email,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'No terms on file'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(v.id)}
              className={ROW_LINK}
            >
              open page →
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setSelectedId(null)}
        className={`${ROW_LINK} mb-2 uppercase tracking-[0.07em]`}
      >
        ← all vendors
      </button>

      <VendorBookbar
        vendor={vendor}
        page={page}
        openCount={openPos.length}
        onPage={setPage}
      />

      {/* ── Terms page: the trade account + the brief opener ── */}
      {page === 'terms' && (
        <div>
          <p className="doc-type-body uppercase tracking-[0.06em] text-[var(--color-charcoal)]">
            {[
              vendor.default_payment_terms?.replace(/_/g, ' '),
              vendor.trade_account_email,
            ]
              .filter(Boolean)
              .join(' · ') || 'No terms on file'}
          </p>
          {vendor.trade_portal_url && (
            <a
              href={vendor.trade_portal_url}
              target="_blank"
              rel="noreferrer"
              className={`${ROW_LINK} mt-1`}
            >
              trade portal →
            </a>
          )}
          {/* R78/R60 cross-link contract: trade lives here; the RELATIONSHIP lives in People. */}
          <a
            href={`/people?person=${vendor.id}&role=maker`}
            className={`${ROW_LINK} mt-1`}
          >
            their profile · in People →
          </a>
        </div>
      )}

      {/* ── Orders page: open POs, PO-anchored, deep-link into documents ── */}
      {page === 'orders' && (
        <>
          {/* PRC-24: the whole approved-unordered queue, one act. Keyed so a
            vendor switch never carries another vendor's queue along. */}
          <VendorOrderAll key={vendor.id} vendor={vendor} />
          <ul>
            {openPos.map((po) => {
              const stamp = PO_STAMP[po.status] ?? PO_STAMP.draft;
              return (
                <li
                  key={po.id}
                  data-orders-vendor-po-row
                  className="border-b border-[var(--color-pearl)] px-1 py-3"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                    <p className="doc-type-body min-w-[11rem] flex-1 font-medium text-[var(--color-charcoal)]">
                      {po.po_number ??
                        po.vendor_po_number ??
                        po.sidemark ??
                        'PO drafted'}
                    </p>
                    <Stamp
                      label={po.status.replace(/_/g, ' ')}
                      color={stamp.color}
                      ink={stamp.ink}
                    />
                    <span className="doc-type-meta whitespace-nowrap text-[var(--color-charcoal)]">
                      {po.confirmed_eta ? `~${fmtDay(po.confirmed_eta)}` : '—'}
                    </span>
                  </div>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="doc-type-meta min-w-[12rem] flex-1 uppercase tracking-[0.05em] text-[var(--color-quiet-ink)]">
                      {[
                        po.project?.name ?? 'Project',
                        po.total_cents != null ? fmtUsd(po.total_cents) : '—',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        onOpenDocument(po.project_id ?? po.project?.id ?? null)
                      }
                      className={ROW_LINK}
                    >
                      open document →
                    </button>
                  </div>
                </li>
              );
            })}
            {openPos.length === 0 && (
              <li className="doc-type-body py-2 italic text-[var(--color-quiet-ink)]">
                Nothing open with {vendor.name}.
              </li>
            )}
          </ul>
        </>
      )}

      {/* ── Thread page: the vendor comms (.mitem grammar) ── */}
      {page === 'thread' && (
        <>
          {!vendor.contact_profile_id ? (
            <p className="doc-type-body italic text-[var(--color-quiet-ink)]">
              No comms profile on file for {vendor.name} — link one to open a
              thread.
            </p>
          ) : (threads ?? []).length > 0 && thread ? (
            <>
              {(threads ?? []).length > 1 && (
                <p className="doc-type-meta mb-1 uppercase tracking-[0.05em] text-[var(--color-quiet-ink)]">
                  {(threads ?? []).map((t, i) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveThreadId(t.id)}
                      className={`da-score-hover inline-flex min-h-11 min-w-11 items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)] ${
                        t.id === thread.id
                          ? 'da-score-on text-[var(--color-charcoal)]'
                          : 'text-[var(--color-quiet-ink)] hover:text-[var(--color-charcoal)]'
                      }`}
                    >
                      {i > 0 ? ' · ' : ''}
                      {t.project?.name ?? 'General'}
                    </button>
                  ))}
                </p>
              )}
              <VendorThread thread={thread} onOpenDocument={onOpenDocument} />
            </>
          ) : (
            <p className="doc-type-body italic text-[var(--color-quiet-ink)]">
              No thread with {vendor.name} yet.
            </p>
          )}
          <BriefComposer
            vendor={vendor}
            briefProjectId={briefProjectId}
            briefProjectName={briefProjectName}
            onOpened={() =>
              void qc.invalidateQueries({ queryKey: ['vendor-threads'] })
            }
          />
        </>
      )}
    </div>
  );
}
