'use client';

/**
 * The Vendors page (R28, C-7): each vendor page carries terms, open POs,
 * and the thread — vendor comms in the margin's message grammar, PO-anchored
 * chips deep-linking into documents. "+ Brief vendor" (R29 colophon) opens
 * it pre-addressed with the document's project.
 *
 * The thread resolves through vendors.contact_profile_id (00207): the
 * vendor_brief threads whose vendor-side participant is the company's comms
 * profile. A vendor without a profile has no thread yet — the page says so
 * quietly instead of pretending.
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBrowserClient,
  useSendMessage,
  useStartVendorBrief,
  useThreadMessages,
} from '@patina/supabase';
import { Stamp } from './stamp';
import { fmtDay, fmtUsd } from '@/lib/document/format';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

const getSupabase = () => createBrowserClient() as AnyRecord;

const MONO_LABEL =
  'font-mono text-[8.5px] uppercase tracking-[0.08em] text-[rgba(250,247,242,0.4)]';
const ROW_LINK = 'text-[10.5px] text-[var(--color-clay)] hover:underline';

const PO_STAMP: Record<string, { color: string; ink?: string }> = {
  draft: { color: 'var(--color-pearl)', ink: 'rgba(250,247,242,0.6)' },
  confirmed: { color: 'var(--color-dusty-blue)' },
  in_production: { color: 'var(--color-golden-hour)', ink: '#D8BE56' },
  shipped: { color: 'var(--color-golden-hour)', ink: '#D8BE56' },
  delivered: { color: 'var(--color-sage)' },
  cancelled: { color: 'var(--color-terracotta)' },
};

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

/** One brief's messages in the margin's message grammar + the reply line. */
function VendorThread({ threadId, projectName }: { threadId: string; projectName: string | null }) {
  const qc = useQueryClient();
  const { data: pages } = useThreadMessages(threadId) as { data: AnyRecord };
  const send = useSendMessage();
  const [body, setBody] = useState('');

  const messages: AnyRecord[] = useMemo(() => {
    const flat = (pages?.pages ?? []).flat();
    return flat.slice(0, 12).reverse(); // oldest → newest down the page
  }, [pages]);

  return (
    <div className="mt-1.5">
      <p className={MONO_LABEL}>The thread{projectName ? ` · ${projectName}` : ''}</p>
      <ul className="mb-2 mt-1 space-y-1.5">
        {messages.map((m) => (
          <li key={m.id} className="text-[11px] leading-relaxed text-[rgba(250,247,242,0.75)]">
            <span className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-[rgba(250,247,242,0.45)]">
              {m.system ? 'The book' : (m.sender?.full_name ?? 'Message')} · {fmtDay(m.created_at)}
            </span>
            <br />
            {m.body}
          </li>
        ))}
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
              { threadId, body: body.trim() },
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
    <div className="mt-2">
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
  const vendor = vendors.find((v) => v.id === selectedId) ?? null;

  const openPos = useMemo(
    () =>
      (orders ?? []).filter(
        (o) =>
          o.vendor_id === selectedId && o.status !== 'cancelled' && o.status !== 'delivered',
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

      <div className="mb-3 border-b border-[rgba(250,247,242,0.12)] pb-2">
        <h3 className="font-heading text-[15px] font-medium text-[var(--color-off-white)]">
          {vendor.name}
        </h3>
        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.05em] text-[rgba(250,247,242,0.4)]">
          {[vendor.default_payment_terms?.replace(/_/g, ' '), vendor.trade_account_email]
            .filter(Boolean)
            .join(' · ') || 'No terms on file'}
          {vendor.trade_portal_url && (
            <>
              {' · '}
              <a
                href={vendor.trade_portal_url}
                target="_blank"
                rel="noreferrer"
                className="normal-case text-[var(--color-clay)] hover:underline"
              >
                trade portal →
              </a>
            </>
          )}
        </p>
      </div>

      {/* Open POs — PO-anchored chips deep-linking into documents. */}
      <p className={MONO_LABEL}>Open orders · {openPos.length}</p>
      <ul className="mb-4 mt-1">
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

      {/* The thread (margin message grammar). */}
      {vendor.contact_profile_id && (threads ?? []).length > 0 && thread ? (
        <>
          {(threads ?? []).length > 1 && (
            <p className="mb-1 font-mono text-[8.5px] uppercase tracking-[0.05em] text-[rgba(250,247,242,0.35)]">
              {(threads ?? []).map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveThreadId(t.id)}
                  className={`${
                    t.id === thread.id
                      ? 'text-[var(--color-clay)]'
                      : 'text-[rgba(250,247,242,0.45)] hover:text-[var(--color-clay)]'
                  }`}
                >
                  {i > 0 ? ' · ' : ''}
                  {t.project?.name ?? 'General'}
                </button>
              ))}
            </p>
          )}
          <VendorThread threadId={thread.id} projectName={thread.project?.name ?? null} />
        </>
      ) : vendor.contact_profile_id ? (
        <p className="text-[11px] italic text-[rgba(250,247,242,0.4)]">
          No thread with {vendor.name} yet.
        </p>
      ) : null}

      <BriefComposer
        vendor={vendor}
        briefProjectId={briefProjectId}
        briefProjectName={briefProjectName}
        onOpened={() => void qc.invalidateQueries({ queryKey: ['vendor-threads'] })}
      />
    </div>
  );
}
