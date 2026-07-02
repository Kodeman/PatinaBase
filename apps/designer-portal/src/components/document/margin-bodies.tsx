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
  useDecisionOverrides,
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
import { useAuth } from '@/hooks/use-auth';
import { invalidateMarginSurfaces, useSendWeeklyPulse } from '@/hooks/use-margin-items';
import { useEscalateNoteToDecision } from '@/hooks/use-margin-notes';
import { AmendmentSheet } from '@/components/document/overlays/amendment-sheet';
import type { MarginItemRow } from '@/lib/document/margin-derivation';
import { composePulseDraft } from '@/lib/document/compose-pulse-draft';
import { fmtDay, fmtUsd, todayYmd } from '@/lib/document/format';
import { openInvoiceFolio } from './accounts/invoice-overlays';


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

/** The subject-matter taxonomy (00084 decision_type) → a human label for the
 *  kind-line. Mirrors the composer's taxonomy (R55). */
const DECISION_TYPE_LABEL: Record<string, string> = {
  material: 'Material',
  color: 'Color',
  product: 'Product',
  layout: 'Layout',
  substitution: 'Substitution',
  budget: 'Budget',
  approval: 'Approval',
};

/** The Track-5 workflow shapes (00213 coordination_kind) → a label for the
 *  kind-line when an item is NOT a plain selection. */
const COORDINATION_KIND_LABEL: Record<string, string> = {
  selection: 'Selection',
  rfi: 'RFI',
  submittal: 'Submittal',
  signoff: 'Sign-off',
  punch: 'Punch',
};

const COURT_LABEL: Record<string, string> = {
  designer: 'your court',
  client: "client's court",
  gc: 'GC court',
  vendor: 'vendor court',
};

/** The lifecycle word the status line shows (R56 legibility). draft never
 *  reaches the margin (the view filters it). */
function statusWord(state: string): string {
  switch (state) {
    case 'overdue':
      return 'Overdue';
    case 'pending':
      return 'Pending';
    case 'responded':
      return 'Resolved';
    case 'expired':
      return 'Expired';
    default:
      return state;
  }
}

/** "in 3 days" style elapsed between sent and responded — the resolution-record
 *  response time (ported from the /portal detail page). */
function responseDays(sentAt: string | null, respondedAt: string | null): string | null {
  if (!sentAt || !respondedAt) return null;
  const ms = new Date(respondedAt).getTime() - new Date(sentAt).getTime();
  if (Number.isNaN(ms)) return null;
  const days = Math.max(0, Math.round(ms / 86_400_000));
  return days === 0 ? 'same day' : `${days} day${days === 1 ? '' : 's'}`;
}

const optionValue = (o: AnyRecord): number | null =>
  o.price != null ? o.price * (o.quantity ?? 1) : null;

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
  const { user } = useAuth();
  const { data: decision } = useDecision(row.item_id) as { data: AnyRecord };
  // R56: the full resolution audit trail (choice / recorded-by / method /
  // evidence / timestamp) — previously a date-only "Resolved · date" line.
  const { data: overrides } = useDecisionOverrides(row.item_id) as { data: AnyRecord[] | undefined };
  const reminder = useSendDecisionReminder();
  const update = useUpdateDecision();
  const override = useApplyDecisionOverride();

  // R11: the override action is personal — "Record Sarah's pick".
  const clientFirstName = (clientName ?? '').trim().split(/\s+/)[0];

  const [extendTo, setExtendTo] = useState(todayYmd());
  const [pickId, setPickId] = useState('');
  const [consent, setConsent] = useState<ConsentMethod>('verbal');
  const [evidence, setEvidence] = useState('');

  if (!decision) return <Quiet>Opening the decision…</Quiet>;
  const options: AnyRecord[] = decision.options ?? decision.client_decision_options ?? [];
  const actionable = row.state === 'overdue' || row.state === 'pending' || row.state === 'expired';

  // A plain selection carries options + the override-consent record. The other
  // four Track-5 shapes (rfi/submittal/signoff/punch) resolve in coordination —
  // apply_decision is selection-only, so the margin shows them read-only (R56).
  const coordinationKind: string = decision.coordination_kind ?? 'selection';
  const isSelection = coordinationKind === 'selection';

  // The kind-line: the subject (decision_type) · the shape+court when not a
  // plain client selection · the approval-gate note.
  const subjectLabel = DECISION_TYPE_LABEL[decision.decision_type as string] ?? null;
  const showShape = !(isSelection && (decision.court ?? 'client') === 'client');
  const kindParts = [
    subjectLabel,
    showShape ? COORDINATION_KIND_LABEL[coordinationKind] : null,
    showShape ? COURT_LABEL[decision.court as string] : null,
    decision.decision_kind === 'approval' ? 'approval gate' : null,
  ].filter(Boolean);

  const selectedOption = options.find((o) => o.selected) ?? null;

  return (
    <div className="border-t border-[var(--color-pearl)] pt-2.5">
      {/* R56 kind-line + status — the subject, the shape/court, the lifecycle word. */}
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {kindParts.length > 0 && (
          <span className="font-mono text-[8px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
            {kindParts.join(' · ')}
          </span>
        )}
        <span className="ml-auto font-mono text-[8px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
          {statusWord(row.state)}
        </span>
      </div>

      {/* R56 rich context — ported from the client mirror to the designer's view. */}
      {decision.context && (
        <p className="mb-2.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
          {decision.context}
        </p>
      )}

      {/* R56 full option attributes — swatch · name · price · ×qty · note · badges.
          Selections only (the other shapes don't carry options). */}
      {isSelection && options.length > 0 && (
        <ul className="mb-2.5 space-y-1.5">
          {options.map((o) => {
            const val = optionValue(o);
            return (
              <li key={o.id} className="flex items-start gap-2 text-[10.5px]">
                {o.image_url ? (
                   
                  <img
                    src={o.image_url}
                    alt=""
                    className="mt-0.5 h-7 w-7 flex-shrink-0 rounded-[3px] border border-[var(--color-pearl)] object-cover"
                  />
                ) : (
                  <span className="mt-0.5 h-7 w-7 flex-shrink-0 rounded-[3px] border border-dashed border-[var(--color-pearl)]" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                    <span className={o.selected ? 'font-semibold text-[var(--color-charcoal)]' : 'text-[var(--text-body)]'}>
                      {o.name}
                    </span>
                    {val != null && (
                      <span className="font-mono text-[9px] text-[var(--color-aged-oak)]">
                        {fmtUsd(val)}
                        {(o.quantity ?? 1) > 1 ? ` · ×${o.quantity}` : ''}
                      </span>
                    )}
                    {o.is_recommended && (
                      <span className="font-mono text-[8px] uppercase text-[var(--color-clay)]">your pick</span>
                    )}
                    {o.selected && (
                      <span className="font-mono text-[8px] uppercase text-[#85947C]">chosen</span>
                    )}
                  </span>
                  {o.designer_note && (
                    <span className="mt-0.5 block text-[9.5px] italic leading-snug text-[var(--text-muted)]">
                      {o.designer_note}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Non-selection coordination shapes resolve in the coordination band; the
          margin shows the recorded answer (when any) read-only (R56). */}
      {!isSelection && (
        <div className="mb-2.5">
          {decision.answer ? (
            <p className="text-[11px] leading-relaxed text-[var(--text-body)]">{decision.answer}</p>
          ) : (
            <Quiet>Resolves in coordination — {COURT_LABEL[decision.court as string] ?? 'in court'}.</Quiet>
          )}
        </div>
      )}

      {isSelection && actionable && (
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

      {/* R56 full resolution audit trail — the choice + recorded-by + consent
          method + evidence + timestamp (was a date-only "Resolved · date" line). */}
      {row.state === 'responded' && (
        <div className="space-y-2 border-t border-dashed border-[var(--color-pearl)] pt-2">
          <p className="font-mono text-[8px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
            Resolution
          </p>
          <div className="space-y-0.5 text-[10.5px] text-[var(--text-body)]">
            {selectedOption && (
              <p>
                <span className="text-[var(--text-muted)]">Chosen: </span>
                <span className="font-medium text-[var(--color-charcoal)]">{selectedOption.name}</span>
                {optionValue(selectedOption) != null ? ` · ${fmtUsd(optionValue(selectedOption)!)}` : ''}
              </p>
            )}
            {decision.answer && !selectedOption && (
              <p>
                <span className="text-[var(--text-muted)]">Answer: </span>
                {decision.answer}
              </p>
            )}
            {decision.responded_at && (
              <p className="text-[var(--text-muted)]">
                {fmtDay(decision.responded_at)}
                {responseDays(decision.sent_at, decision.responded_at)
                  ? ` · ${responseDays(decision.sent_at, decision.responded_at)} to decide`
                  : ''}
              </p>
            )}
          </div>

          {/* The override-consent record(s): how the designer recorded the pick. */}
          {(overrides ?? []).map((ov) => (
            <div
              key={ov.id}
              className="rounded-[4px] border border-[var(--color-pearl)] px-2 py-1.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[8px] uppercase tracking-[0.05em] text-[var(--color-charcoal)]">
                  {user && ov.acted_by === user.id ? 'You recorded' : 'Recorded'}
                </span>
                <span className="font-mono text-[8px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                  {String(ov.consent_method).replace('_', ' ')} · {fmtDay(ov.created_at)}
                </span>
              </div>
              {ov.consent_evidence && (
                <p className="mt-1 whitespace-pre-wrap text-[10px] leading-snug text-[var(--text-body)]">
                  {ov.consent_evidence}
                </p>
              )}
            </div>
          ))}
        </div>
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
  const issue = useIssueInvoice({ errorSurface: 'inline' });
  const send = useSendInvoice({ errorSurface: 'inline' });
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
      <div className="flex flex-wrap items-baseline gap-3">
        {row.state === 'draft' && (
          <button type="button" className={BTN_CLAY} disabled={sending} onClick={reviewAndSend}>
            {sending ? 'Sending…' : 'Review & send invoice'}
          </button>
        )}
        {/* R74a — the folio is where the full invoice lives (record payment,
            resend, void, print); the margin keeps the one-glance narration. */}
        <button
          type="button"
          onClick={() => openInvoiceFolio(row.item_id)}
          className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-clay)] hover:opacity-80"
        >
          open the folio →
        </button>
      </div>
      {row.state !== 'draft' && (
        <Quiet>
          Sent{invoice.sent_at ? ` · ${fmtDay(invoice.sent_at)}` : ''} · awaiting payment
        </Quiet>
      )}
      {error && <p className="mt-1 text-[10px] text-[#C77B6E]">{error}</p>}
    </div>
  );
}

// ── vendor payment (R18 — read-only Money narration) ────────────────────────

export function PoPaymentBody({ row }: { row: MarginItemRow }) {
  const amount = row.payload.amount_cents as number | undefined;
  const vendor = row.payload.vendor_name as string | undefined;
  const poLabel = row.payload.po_label as string | undefined;
  const due = row.payload.due_date as string | undefined;
  return (
    <div className="border-t border-[var(--color-pearl)] pt-2.5">
      <p className="text-[11.5px] text-[var(--text-body)]">
        {amount != null ? fmtUsd(amount) : 'A payment'} to {vendor ?? 'the vendor'}
        {poLabel ? ` on ${poLabel}` : ''}
        {due ? ` — due ${fmtDay(due)}` : ''}.
      </p>
      <Quiet>Settle it from the Orders book; this line rests once paid.</Quiet>
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

export function NoteBody({
  row,
  projectId,
  clientName,
}: {
  row: MarginItemRow;
  projectId: string | null;
  clientName?: string;
}) {
  const toDecision = useEscalateNoteToDecision();
  // R81: the scope-change escalation now opens the Amendment sheet seeded with
  // the note's words — the compose act itself records what the note became
  // (margin_notes.escalated_to_scope_change_id, via useComposeAmendment).
  const [amending, setAmending] = useState(false);
  const busy = toDecision.isPending;

  if (row.state === 'escalated') {
    const became = row.payload.escalated_to_decision_id ? 'a client decision' : 'an amendment';
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
          <button type="button" className={BTN} disabled={busy} onClick={() => setAmending(true)}>
            → Amendment
          </button>
        </div>
      )}
      {toDecision.isError && (
        <p className="mt-1 text-[10px] text-[#C77B6E]">Escalation failed — try again.</p>
      )}
      {projectId && (
        <AmendmentSheet
          projectId={projectId}
          clientName={clientName ?? ''}
          open={amending}
          onClose={() => setAmending(false)}
          seed={{
            title: row.title.length > 70 ? `${row.title.slice(0, 67)}…` : row.title,
            description: row.title,
            noteId: row.item_id,
          }}
        />
      )}
    </div>
  );
}

// ── shared body switch ──────────────────────────────────────────────────────
// One mapping from a margin row to its body, used by both the desktop rail
// and the D13 mobile margin-item sheet so they never drift.
export function MarginItemBody({
  row,
  projectId,
  clientName,
  decisionRows = [],
}: {
  row: MarginItemRow;
  projectId: string | null;
  clientName: string;
  decisionRows?: MarginItemRow[];
}) {
  switch (row.kind) {
    case 'decision':
      return <DecisionBody row={row} projectId={projectId} clientName={clientName} />;
    case 'message':
      return <MessageBody row={row} projectId={projectId} />;
    case 'invoice':
      if (row.payload.po_payment) return <PoPaymentBody row={row} />;
      return <InvoiceBody row={row} projectId={projectId} />;
    case 'pulse':
      return (
        <PulseBody
          row={row}
          projectId={projectId}
          clientName={clientName}
          decisionRows={decisionRows}
        />
      );
    case 'time':
      return null;
    case 'note':
      return <NoteBody row={row} projectId={projectId} clientName={clientName} />;
    default:
      return null;
  }
}
