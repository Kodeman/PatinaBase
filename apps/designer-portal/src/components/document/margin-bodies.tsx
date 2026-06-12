'use client';

/**
 * Margin item bodies — the read content + the four Slice 3 acts (spec §13):
 * decision nudge/extend/record, message reply, invoice send, Pulse send.
 * Every act runs through an existing transactional path (apply_decision /
 * comms insert / issue_invoice + invoice-send / send_weekly_pulse) and then
 * invalidates margin + Desk + lines in one sweep (§5 one-act invariant).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createBrowserClient,
  useApplyDecisionOverride,
  useDecision,
  useIssueInvoice,
  useInvoice,
  useProjectFFEItems,
  useSendDecisionReminder,
  useSendInvoice,
  useSendMessage,
  useThreadMessages,
  useUpdateDecision,
  type ConsentMethod,
} from '@patina/supabase';
import { invalidateMarginSurfaces, useSendWeeklyPulse } from '@/hooks/use-margin-items';
import {
  useEscalateNoteToDecision,
  useEscalateNoteToScopeChange,
} from '@/hooks/use-margin-notes';
import type { MarginItemRow } from '@/lib/document/margin-derivation';
import { composePulseDraft } from '@/lib/document/compose-pulse-draft';
import { fmtDay, fmtUsd } from '@/lib/document/format';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

const BTN =
  'rounded-[4px] border border-[var(--color-pearl)] px-2.5 py-1.5 text-[10.5px] font-medium text-[var(--color-charcoal)] hover:border-[var(--color-clay)] disabled:opacity-50';
const BTN_CLAY =
  'rounded-[4px] border border-[var(--color-clay)] bg-[var(--color-clay)] px-2.5 py-1.5 text-[10.5px] font-medium text-white hover:opacity-90 disabled:opacity-50';
const INPUT =
  'rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2 py-1.5 text-[11px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none';

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="py-1 text-[10.5px] italic text-[var(--text-muted)]">{children}</p>;
}

// ── decision ────────────────────────────────────────────────────────────────

export function DecisionBody({
  row,
  projectId,
  clientName,
}: {
  row: MarginItemRow;
  projectId: string | null;
  clientName?: string;
}) {
  const qc = useQueryClient();
  const { data: decision } = useDecision(row.item_id) as { data: AnyRecord };
  const reminder = useSendDecisionReminder();
  const update = useUpdateDecision();
  const override = useApplyDecisionOverride();

  // R11: the override action is personal — "Record Sarah's pick".
  const clientFirstName = (clientName ?? '').trim().split(/\s+/)[0];

  const [extendTo, setExtendTo] = useState('');
  const [pickId, setPickId] = useState('');
  const [consent, setConsent] = useState<ConsentMethod>('verbal');
  const [evidence, setEvidence] = useState('');

  if (!decision) return <Quiet>Opening the decision…</Quiet>;
  const options: AnyRecord[] = decision.options ?? decision.client_decision_options ?? [];
  const actionable = row.state === 'overdue' || row.state === 'pending' || row.state === 'expired';

  return (
    <div className="border-t border-[var(--color-pearl)] pt-2.5">
      {options.length > 0 && (
        <ul className="mb-2.5 space-y-1">
          {options.map((o) => (
            <li key={o.id} className="flex items-baseline gap-2 text-[10.5px]">
              <span className={o.selected ? 'font-semibold text-[var(--color-charcoal)]' : 'text-[var(--text-body)]'}>
                {o.name}
              </span>
              {o.is_recommended && (
                <span className="font-mono text-[8px] uppercase text-[var(--color-clay)]">your pick</span>
              )}
              {o.selected && (
                <span className="font-mono text-[8px] uppercase text-[#85947C]">chosen</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {actionable && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className={BTN}
              disabled={reminder.isPending}
              onClick={() =>
                reminder.mutate(
                  { decisionId: row.item_id },
                  { onSuccess: () => invalidateMarginSurfaces(qc, projectId) },
                )
              }
            >
              {row.payload.reminder_sent_at ? 'Nudge again' : 'Send a nudge'}
            </button>
            <input
              type="date"
              aria-label="Extend due date to"
              className={INPUT}
              value={extendTo}
              onChange={(e) => setExtendTo(e.target.value)}
            />
            <button
              type="button"
              className={BTN}
              disabled={!extendTo || update.isPending}
              onClick={() =>
                update.mutate(
                  {
                    decisionId: row.item_id,
                    designerClientId: decision.designer_client_id,
                    dueDate: extendTo,
                  },
                  { onSuccess: () => invalidateMarginSurfaces(qc, projectId) },
                )
              }
            >
              Extend
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-t border-dashed border-[var(--color-pearl)] pt-2">
            <select
              aria-label="Client's pick"
              className={INPUT}
              value={pickId}
              onChange={(e) => setPickId(e.target.value)}
            >
              <option value="">Client's pick…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <select
              aria-label="How the client told you"
              className={INPUT}
              value={consent}
              onChange={(e) => setConsent(e.target.value as ConsentMethod)}
            >
              <option value="verbal">Told me (verbal)</option>
              <option value="written">Written note</option>
              <option value="text_excerpt">Text message</option>
              <option value="email_excerpt">Email</option>
            </select>
            <input
              type="text"
              placeholder="When / where (evidence)"
              aria-label="Consent evidence"
              className={`${INPUT} min-w-[140px] flex-1`}
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
            />
            <button
              type="button"
              className={BTN_CLAY}
              disabled={!pickId || !evidence.trim() || override.isPending}
              onClick={() =>
                override.mutate(
                  {
                    decisionId: row.item_id,
                    optionId: pickId,
                    consentMethod: consent,
                    consentEvidence: evidence.trim(),
                  },
                  { onSuccess: () => invalidateMarginSurfaces(qc, projectId) },
                )
              }
            >
              {clientFirstName ? `Record ${clientFirstName}'s pick` : 'Record the pick'}
            </button>
          </div>
        </div>
      )}

      {row.state === 'responded' && (
        <Quiet>Resolved{row.payload.responded_at ? ` · ${fmtDay(row.payload.responded_at as string)}` : ''}.</Quiet>
      )}
    </div>
  );
}

// ── message ─────────────────────────────────────────────────────────────────

export function MessageBody({ row, projectId }: { row: MarginItemRow; projectId: string | null }) {
  const qc = useQueryClient();
  const threadId = row.item_id;
  const { data: pages } = useThreadMessages(threadId) as { data: AnyRecord };
  const send = useSendMessage();
  const [body, setBody] = useState('');
  const markedRef = useRef(false);

  // Opening the item reads the thread (margin 'unread' clears with it).
  useEffect(() => {
    if (markedRef.current) return;
    markedRef.current = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createBrowserClient() as any;
    void supabase
      .rpc('rpc_mark_thread_read', { p_thread_id: threadId })
      .then(() => invalidateMarginSurfaces(qc, projectId));
  }, [threadId, qc, projectId]);

  const messages: AnyRecord[] = useMemo(() => {
    const flat = (pages?.pages ?? []).flat();
    return flat.slice(0, 8).reverse(); // newest page first → render oldest→newest
  }, [pages]);

  return (
    <div className="border-t border-[var(--color-pearl)] pt-2.5">
      <ul className="mb-2 space-y-1.5">
        {messages.map((m) => (
          <li key={m.id} className="text-[10.5px] leading-relaxed text-[var(--text-body)]">
            <span className="font-semibold text-[var(--color-charcoal)]">
              {m.sender?.full_name ?? 'Message'}
            </span>{' '}
            · {fmtDay(m.created_at)}
            <br />
            {m.body}
          </li>
        ))}
      </ul>
      <textarea
        rows={2}
        placeholder="Reply…"
        aria-label="Reply"
        className={`${INPUT} w-full resize-none`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="mt-1.5">
        <button
          type="button"
          className={BTN_CLAY}
          disabled={!body.trim() || send.isPending}
          onClick={() =>
            send.mutate(
              { threadId, body: body.trim() },
              {
                onSuccess: () => {
                  setBody('');
                  invalidateMarginSurfaces(qc, projectId);
                },
              },
            )
          }
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ── invoice ─────────────────────────────────────────────────────────────────

export function InvoiceBody({ row, projectId }: { row: MarginItemRow; projectId: string | null }) {
  const qc = useQueryClient();
  const { data: invoice } = useInvoice(row.item_id) as { data: AnyRecord };
  const issue = useIssueInvoice();
  const send = useSendInvoice();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!invoice) return <Quiet>Opening the invoice…</Quiet>;
  const lines: AnyRecord[] = invoice.line_items ?? [];

  const reviewAndSend = async () => {
    setSending(true);
    setError(null);
    try {
      if (invoice.status === 'draft') {
        await issue.mutateAsync({ invoiceId: row.item_id });
      }
      await send.mutateAsync({ invoiceId: row.item_id, type: 'sent' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      // issue_invoice may have landed even if the email leg failed —
      // re-read every surface either way (§5).
      invalidateMarginSurfaces(qc, projectId);
      void qc.invalidateQueries({ queryKey: ['invoices'] });
      setSending(false);
    }
  };

  return (
    <div className="border-t border-[var(--color-pearl)] pt-2.5">
      <ul className="mb-2 space-y-0.5">
        {lines.slice(0, 5).map((l) => (
          <li key={l.id} className="flex justify-between gap-2 text-[10.5px] text-[var(--text-body)]">
            <span>{l.description}</span>
            <span className="whitespace-nowrap">{fmtUsd(l.amount_cents)}</span>
          </li>
        ))}
        <li className="flex justify-between gap-2 border-t border-[var(--color-pearl)] pt-1 text-[10.5px] font-semibold text-[var(--color-charcoal)]">
          <span>Total</span>
          <span>{fmtUsd(invoice.total_cents ?? 0)}</span>
        </li>
      </ul>
      {row.state === 'draft' && (
        <button type="button" className={BTN_CLAY} disabled={sending} onClick={reviewAndSend}>
          {sending ? 'Sending…' : 'Review & send invoice'}
        </button>
      )}
      {row.state !== 'draft' && (
        <Quiet>
          Sent{invoice.sent_at ? ` · ${fmtDay(invoice.sent_at)}` : ''} · awaiting payment
        </Quiet>
      )}
      {error && <p className="mt-1 text-[10px] text-[#C77B6E]">{error}</p>}
    </div>
  );
}

// ── pulse ───────────────────────────────────────────────────────────────────

export function PulseBody({
  row,
  projectId,
  clientName,
  decisionRows,
}: {
  row: MarginItemRow;
  projectId: string | null;
  clientName: string;
  decisionRows: MarginItemRow[];
}) {
  const { data: ffeItems } = useProjectFFEItems(projectId ?? '') as { data: AnyRecord[] | undefined };
  const sendPulse = useSendWeeklyPulse(projectId);

  const defaultBody = useMemo(() => {
    if (row.detail) return row.detail;
    const weekOf = row.payload.week_of as string | undefined;
    const monday = weekOf ? new Date(`${weekOf}T00:00:00`).getTime() : 0;
    const moved = (ffeItems ?? [])
      .filter((i) => new Date(i.updated_at).getTime() >= monday)
      .filter((i) => ['ordered', 'production', 'shipped', 'delivered', 'installed'].includes(i.status))
      .map((i) => ({ name: i.name as string, state: i.status as string }));
    return composePulseDraft({
      clientFirstName: clientName.trim().split(/\s+/)[0] ?? null,
      moved,
      resolved: decisionRows.filter((d) => d.state === 'responded').map((d) => d.title),
      pending: decisionRows
        .filter((d) => d.state === 'pending' || d.state === 'overdue')
        .map((d) => d.title),
    });
  }, [row.detail, row.payload.week_of, ffeItems, clientName, decisionRows]);

  const [body, setBody] = useState(defaultBody);
  useEffect(() => setBody(defaultBody), [defaultBody]);

  if (row.state === 'sent') {
    return (
      <Quiet>
        Sent{row.payload.sent_at ? ` · ${fmtDay(row.payload.sent_at as string)}` : ''} — archived
        here in the margin.
      </Quiet>
    );
  }

  return (
    <div className="border-t border-[var(--color-pearl)] pt-2.5">
      <p className="mb-1.5 text-[10px] italic text-[var(--text-muted)]">
        Drafted from this week&apos;s stamps — edit before it goes.
      </p>
      <textarea
        rows={4}
        aria-label="Pulse body"
        className={`${INPUT} w-full resize-y`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="mt-1.5">
        <button
          type="button"
          className={BTN_CLAY}
          disabled={!body.trim() || sendPulse.isPending}
          onClick={() => sendPulse.mutate({ pulseId: row.item_id, body: body.trim() })}
        >
          {sendPulse.isPending ? 'Sending…' : 'Send Pulse'}
        </button>
      </div>
      {sendPulse.isError && (
        <p className="mt-1 text-[10px] text-[#C77B6E]">
          {sendPulse.error instanceof Error ? sendPulse.error.message : 'Send failed'}
        </p>
      )}
    </div>
  );
}

// ── note (R14 — the margin's private layer) ─────────────────────────────────

export function NoteBody({ row, projectId }: { row: MarginItemRow; projectId: string | null }) {
  const toDecision = useEscalateNoteToDecision();
  const toScopeChange = useEscalateNoteToScopeChange();
  const busy = toDecision.isPending || toScopeChange.isPending;

  if (row.state === 'escalated') {
    const became = row.payload.escalated_to_decision_id ? 'a client decision' : 'a scope change request';
    return <Quiet>Escalated — now {became}. The note rests here.</Quiet>;
  }

  return (
    <div className="border-t border-[var(--color-pearl)] pt-2.5">
      {row.payload.author_name ? (
        <p className="mb-2 text-[10px] text-[var(--text-muted)]">{String(row.payload.author_name)}</p>
      ) : null}
      {projectId && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={BTN}
            disabled={busy}
            onClick={() =>
              toDecision.mutate({ noteId: row.item_id, projectId, body: row.title })
            }
          >
            → Client decision
          </button>
          <button
            type="button"
            className={BTN}
            disabled={busy}
            onClick={() =>
              toScopeChange.mutate({ noteId: row.item_id, projectId, body: row.title })
            }
          >
            → Scope change
          </button>
        </div>
      )}
      {(toDecision.isError || toScopeChange.isError) && (
        <p className="mt-1 text-[10px] text-[#C77B6E]">Escalation failed — try again.</p>
      )}
    </div>
  );
}
