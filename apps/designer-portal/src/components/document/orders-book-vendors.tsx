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
  useSendMessage,
  useStartVendorBrief,
  useThreadMessages,
  useUser,
} from '@patina/supabase';
import { Stamp } from './stamp';
import { MItem } from './m-item';
import { fmtDay, fmtUsd } from '@/lib/document/format';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

const getSupabase = () => createBrowserClient() as AnyRecord;

const MONO_LABEL =
  'font-mono text-[8.5px] uppercase tracking-[0.08em] text-[rgba(250,247,242,0.4)]';
const ROW_LINK = 'text-[10.5px] text-[var(--color-clay)] hover:underline';
// The vendor message accent — dusty-blue (the message margin kind); MItem
// repaints it clay for the studio's own voice.
const MSG_ACCENT = { border: 'var(--color-dusty-blue)', label: 'var(--color-dusty-blue)' };

type VendorPage = 'terms' | 'thread' | 'orders';

const PO_STAMP: Record<string, { color: string; ink?: string }> = {
  draft: { color: 'var(--color-pearl)', ink: 'rgba(250,247,242,0.6)' },
  confirmed: { color: 'var(--color-dusty-blue)' },
  in_production: { color: 'var(--color-golden-hour)', ink: '#D8BE56' },
  shipped: { color: 'var(--color-golden-hour)', ink: '#D8BE56' },
  delivered: { color: 'var(--color-sage)' },
  cancelled: { color: 'var(--color-terracotta)' },
};

const termsLabel = (vendor: AnyRecord): string =>
  vendor.default_payment_terms ? vendor.default_payment_terms.replace(/_/g, ' ') : 'terms n/a';

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
        className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--color-clay)] hover:opacity-80"
      >
        re: {projectName} →
      </button>
    ) : null;

  return (
    <div className="mt-1.5">
      {deepLink && <div className="mb-1.5">{deepLink}</div>}
      <ul className="mb-2 space-y-1.5">
        {messages.map((m) => {
          const own = !m.system && m.sender_id != null && m.sender_id === user?.id;
          const sender = m.system ? 'The book' : own ? 'You' : (m.sender?.full_name ?? 'Message');
          return (
            <MItem
              key={m.id}
              tone="dark"
              accent={MSG_ACCENT}
              ownVoice={own}
              kindLine={`${sender} · ${fmtDay(m.created_at)}`}
              title={m.body}
            />
          );
        })}
        {messages.length === 0 && (
          <li className="text-[11px] italic text-[rgba(250,247,242,0.4)]">Opening the thread…</li>
        )}
      </ul>
      <div className="flex items-end gap-2">
        <textarea
          rows={2}
          placeholder="Reply…"
          aria-label="Reply to vendor"
          className="flex-1 resize-none rounded-[3px] border border-[rgba(250,247,242,0.15)] bg-transparent px-2 py-1.5 text-[11px] text-[var(--color-off-white)] outline-none placeholder:text-[rgba(250,247,242,0.3)]"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          type="button"
          disabled={!body.trim() || send.isPending}
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
          className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--color-clay)] hover:opacity-80 disabled:opacity-40"
        >
          Send
        </button>
      </div>
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
      <p className="mt-2 text-[11px] italic text-[rgba(250,247,242,0.4)]">
        No comms profile on file for {vendor.name} — link one to open a thread.
      </p>
    );
  }

  return (
    <div className="mt-3 border-t border-[rgba(250,247,242,0.08)] pt-2">
      <p className={MONO_LABEL}>
        + Brief vendor{briefProjectName ? ` · about ${briefProjectName}` : ''}
      </p>
      <div className="mt-1 flex items-end gap-2">
        <textarea
          rows={2}
          placeholder={`Brief ${vendor.name}…`}
          aria-label="Opening brief"
          className="flex-1 resize-none rounded-[3px] border border-[rgba(250,247,242,0.15)] bg-transparent px-2 py-1.5 text-[11px] text-[var(--color-off-white)] outline-none placeholder:text-[rgba(250,247,242,0.3)]"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          type="button"
          disabled={!body.trim() || startBrief.isPending}
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
                  setError(e instanceof Error ? e.message : 'Could not open the brief'),
              },
            );
          }}
          className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--color-clay)] hover:opacity-80 disabled:opacity-40"
        >
          Open brief
        </button>
      </div>
      {error && <p className="mt-1 text-[10px] text-[var(--color-terracotta)]">{error}</p>}
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
    <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-[rgba(250,247,242,0.12)] pb-2">
      <span className="font-heading text-[15px] font-medium text-[var(--color-off-white)]">
        {vendor.name} <em className="not-italic text-[var(--color-clay)]">· vendor</em>
      </span>
      <span className="ml-auto flex flex-wrap items-baseline gap-x-3">
        {pages.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPage(p.key)}
            aria-current={page === p.key ? 'page' : undefined}
            className={`font-mono text-[9px] uppercase tracking-[0.1em] transition-colors ${
              page === p.key
                ? 'text-[var(--color-clay)]'
                : 'text-[rgba(250,247,242,0.45)] hover:text-[rgba(250,247,242,0.8)]'
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
        (o) => o.vendor_id === selectedId && o.status !== 'cancelled' && o.status !== 'delivered',
      ),
    [orders, selectedId],
  );

  const { data: threads } = useVendorThreads(vendor?.contact_profile_id ?? null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const thread =
    (threads ?? []).find((t) => t.id === activeThreadId) ?? (threads ?? [])[0] ?? null;

  const briefProjectName =
    briefProjectId != null
      ? ((orders ?? []).find((o) => (o.project_id ?? o.project?.id) === briefProjectId)?.project
          ?.name ?? null)
      : null;

  if (!vendor) {
    return (
      <ul>
        {vendors.map((v) => (
          <li
            key={v.id}
            className="grid grid-cols-[1fr_auto] items-baseline gap-3 border-b border-[rgba(250,247,242,0.08)] px-1 py-2.5"
          >
            <div>
              <button
                type="button"
                onClick={() => setSelectedId(v.id)}
                className="text-left text-[13px] font-medium text-[var(--color-off-white)] hover:text-[var(--color-clay)]"
              >
                {v.name}
              </button>
              <p className="font-mono text-[9px] uppercase tracking-[0.05em] text-[rgba(250,247,242,0.4)]">
                {[v.default_payment_terms?.replace(/_/g, ' '), v.trade_account_email]
                  .filter(Boolean)
                  .join(' · ') || 'No terms on file'}
              </p>
            </div>
            <button type="button" onClick={() => setSelectedId(v.id)} className={ROW_LINK}>
              open page →
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setSelectedId(null)}
        className="mb-2 font-mono text-[9px] uppercase tracking-[0.07em] text-[rgba(250,247,242,0.45)] hover:text-[var(--color-clay)]"
      >
        ← all vendors
      </button>

      <VendorBookbar vendor={vendor} page={page} openCount={openPos.length} onPage={setPage} />

      {/* ── Terms page: the trade account + the brief opener ── */}
      {page === 'terms' && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-[rgba(250,247,242,0.65)]">
            {[vendor.default_payment_terms?.replace(/_/g, ' '), vendor.trade_account_email]
              .filter(Boolean)
              .join(' · ') || 'No terms on file'}
          </p>
          {vendor.trade_portal_url && (
            <a
              href={vendor.trade_portal_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-[10.5px] text-[var(--color-clay)] hover:underline"
            >
              trade portal →
            </a>
          )}
          {/* R78/R60 cross-link contract: trade lives here; the RELATIONSHIP lives in People. */}
          <a href={`/people?person=${vendor.id}&role=maker`} className="mt-1 block text-[10.5px] text-[var(--color-clay)] hover:underline">their profile · in People →</a>
        </div>
      )}

      {/* ── Orders page: open POs, PO-anchored, deep-link into documents ── */}
      {page === 'orders' && (
        <ul>
          {openPos.map((po) => {
            const stamp = PO_STAMP[po.status] ?? PO_STAMP.draft;
            return (
              <li
                key={po.id}
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-[rgba(250,247,242,0.08)] px-1 py-2"
              >
                <div>
                  <p className="text-[12px] font-medium text-[var(--color-off-white)]">
                    {po.po_number ?? po.vendor_po_number ?? po.sidemark ?? 'PO drafted'}
                  </p>
                  <p className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-[rgba(250,247,242,0.4)]">
                    {[po.project?.name ?? 'Project', po.total_cents != null ? fmtUsd(po.total_cents) : '—']
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <Stamp label={po.status.replace(/_/g, ' ')} color={stamp.color} ink={stamp.ink} />
                <span className="whitespace-nowrap font-mono text-[9.5px] text-[rgba(250,247,242,0.6)]">
                  {po.confirmed_eta ? `~${fmtDay(po.confirmed_eta)}` : '—'}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenDocument(po.project_id ?? po.project?.id ?? null)}
                  className={ROW_LINK}
                >
                  open document →
                </button>
              </li>
            );
          })}
          {openPos.length === 0 && (
            <li className="py-1.5 text-[11px] italic text-[rgba(250,247,242,0.4)]">
              Nothing open with {vendor.name}.
            </li>
          )}
        </ul>
      )}

      {/* ── Thread page: the vendor comms (.mitem grammar) ── */}
      {page === 'thread' && (
        <>
          {!vendor.contact_profile_id ? (
            <p className="text-[11px] italic text-[rgba(250,247,242,0.4)]">
              No comms profile on file for {vendor.name} — link one to open a thread.
            </p>
          ) : (threads ?? []).length > 0 && thread ? (
            <>
              {(threads ?? []).length > 1 && (
                <p className="mb-1 font-mono text-[8.5px] uppercase tracking-[0.05em] text-[rgba(250,247,242,0.35)]">
                  {(threads ?? []).map((t, i) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveThreadId(t.id)}
                      className={
                        t.id === thread.id
                          ? 'text-[var(--color-clay)]'
                          : 'text-[rgba(250,247,242,0.45)] hover:text-[var(--color-clay)]'
                      }
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
            <p className="text-[11px] italic text-[rgba(250,247,242,0.4)]">
              No thread with {vendor.name} yet.
            </p>
          )}
          <BriefComposer
            vendor={vendor}
            briefProjectId={briefProjectId}
            briefProjectName={briefProjectName}
            onOpened={() => void qc.invalidateQueries({ queryKey: ['vendor-threads'] })}
          />
        </>
      )}
    </div>
  );
}
