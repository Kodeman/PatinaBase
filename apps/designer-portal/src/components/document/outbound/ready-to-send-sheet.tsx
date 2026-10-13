'use client';

/**
 * US-31 B5a (`outbound-review`) — the ready-to-send sheet, opened from the
 * Desk's "N ready to send" line. Every message the studio has staged for this
 * job, grouped by who it reaches: Clients · Vendors · Trades. The procurement
 * letters sit under Vendors and keep their own review (DraftReview). A trade's
 * texts read as one "Today's texts (N)" group.
 *
 * Each staged message opens into its review. Any of them can be checked, opened
 * or not, and "Send the N checked" names exactly how many go. Each send saves
 * any edit first, reads the job's lead again (Q11), then hands the stored
 * drafts to outbound-draft-send; each row then says whether it went.
 *
 * A seat that may not send sees and edits everything and saves it for the
 * lead; Send and the batch are held with the lead's line.
 */

import { useMemo, useRef, useState } from 'react';
import {
  OPEN_PROCUREMENT_DRAFT_STATUSES,
  useOutboundDrafts,
  useProcurementDrafts,
  useSendOutboundDrafts,
  useUpdateOutboundDraft,
} from '@patina/supabase';
import { useActViewer } from '../acts/act-viewer';
import { DraftReview } from '../buying/draft-review';
import { DocumentAction } from '../document-action';
import { LABEL_CLS } from '../line-unfold/cell';
import {
  OutboundDraftReview,
  outboundKindLabel,
  type OutboundDraftRow,
  type OutboundDraftText,
  type OutboundSendResult,
} from './outbound-draft-review';

const OPEN_STATUSES = new Set(['awaiting_review', 'sending']);

const GROUPS = [
  { key: 'client', title: 'Clients' },
  { key: 'vendor', title: 'Vendors' },
  { key: 'trade', title: 'Trades' },
] as const;

export const LEAD_CHANGED = 'Who leads this project changed since this opened, so nothing was sent.';
const SEND_UNCONFIRMED =
  'The send could not be confirmed. Some messages may have gone; check each one before sending again.';

export function ReadyToSendSheet({ projectId }: { projectId: string }) {
  const viewer = useActViewer(projectId);
  const outbound = useOutboundDrafts({ projectId });
  const procurement = useProcurementDrafts(projectId, OPEN_PROCUREMENT_DRAFT_STATUSES);
  const sendDrafts = useSendOutboundDrafts();
  const update = useUpdateOutboundDraft();

  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const [results, setResults] = useState<ReadonlyMap<string, OutboundSendResult>>(new Map());
  const [sendingIds, setSendingIds] = useState<ReadonlySet<string>>(new Set());
  const [batchError, setBatchError] = useState<string | null>(null);
  // Unsaved edits, by draft id: each send saves its own first.
  const edits = useRef(new Map<string, OutboundDraftText>());

  const leadName = viewer.leadFirstName ?? 'the lead';
  const canSend = viewer.ready && viewer.canSend;

  // A message stays on the sheet while it is open, and once this sheet sent
  // it, so its row can say how the send went.
  const rows = useMemo(
    () =>
      (outbound.data ?? [])
        .filter((d) => OPEN_STATUSES.has(d.status) || results.has(d.id))
        .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0)),
    [outbound.data, results],
  );
  const letters = procurement.data ?? [];

  const checkable = (d: OutboundDraftRow) =>
    canSend &&
    d.status === 'awaiting_review' &&
    !results.get(d.id)?.ok &&
    Boolean(d.to_address?.trim());
  const checkedIds = rows.filter((d) => checked.has(d.id) && checkable(d)).map((d) => d.id);

  const toggleChecked = (ids: readonly string[], on: boolean) =>
    setChecked((was) => {
      const next = new Set(was);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const toggleOpened = (id: string) =>
    setOpened((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onEdit = (id: string, text: OutboundDraftText | null) => {
    if (text) edits.current.set(id, text);
    else edits.current.delete(id);
  };

  /** Saves the edits, reads the lead again, sends; throws when nothing went. */
  const sendIds = async (ids: string[]) => {
    setBatchError(null);
    setSendingIds(new Set(ids));
    try {
      for (const id of ids) {
        const text = edits.current.get(id);
        if (!text) continue;
        await update.mutateAsync({ id, subject: text.subject.trim(), body: text.body });
        edits.current.delete(id);
      }
      if (viewer.recheck && !(await viewer.recheck())) throw new Error(LEAD_CHANGED);
      let answer: Awaited<ReturnType<typeof sendDrafts.mutateAsync>>;
      try {
        answer = await sendDrafts.mutateAsync(ids);
      } catch (e) {
        console.error('[ready-to-send] send failed', e);
        throw new Error(SEND_UNCONFIRMED);
      }
      setResults((was) => {
        const next = new Map(was);
        for (const r of answer?.results ?? []) next.set(r.id, r);
        return next;
      });
      toggleChecked(
        (answer?.results ?? []).filter((r) => r.ok).map((r) => r.id),
        false,
      );
    } finally {
      setSendingIds(new Set());
    }
  };

  const sendChecked = () => {
    sendIds(checkedIds).catch((e: Error) => setBatchError(e.message || SEND_UNCONFIRMED));
  };

  const busy = sendDrafts.isPending || update.isPending;
  const waiting = rows.some((d) => d.status === 'awaiting_review' && !results.get(d.id)?.ok);
  const empty = rows.length === 0 && letters.length === 0;

  const renderRow = (d: OutboundDraftRow) => {
    const result = results.get(d.id);
    const isOpen = opened.has(d.id);
    const label = outboundKindLabel(d.kind);
    const to = d.to_address?.trim() || 'no address on file';
    return (
      <li key={d.id} data-outbound-row={d.id} className="border-t border-[var(--color-pearl)] py-2">
        <div className="flex items-center gap-2">
          <label className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center">
            <input
              type="checkbox"
              aria-label={`Check ${label} to ${to}`}
              checked={checked.has(d.id) && checkable(d)}
              disabled={!checkable(d) || busy}
              onChange={(e) => toggleChecked([d.id], e.target.checked)}
              className="h-4 w-4 accent-[var(--color-clay)]"
            />
          </label>
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={`outbound-review-${d.id}`}
            onClick={() => toggleOpened(d.id)}
            className="flex min-h-11 min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
          >
            <span className="min-w-0 [overflow-wrap:anywhere]">
              <span className="text-[14px] text-[var(--text-primary)]">{label}</span>
              <span className="text-[12px] text-[var(--text-muted)]">{` · To ${to}`}</span>
            </span>
            <span className="text-[12px] text-[var(--text-muted)]" data-outbound-row-state>
              {result
                ? result.ok
                  ? 'Sent'
                  : "Couldn't send"
                : d.status === 'sending'
                  ? 'Sending'
                  : isOpen
                    ? 'Close'
                    : 'Open'}
            </span>
          </button>
        </div>
        {isOpen && (
          <div id={`outbound-review-${d.id}`} className="pl-[52px] max-sm:pl-0">
            <OutboundDraftReview
              draft={d}
              canSend={viewer.canSend}
              ready={viewer.ready}
              leadName={leadName}
              sending={sendingIds.has(d.id)}
              result={result}
              onEdit={onEdit}
              onSend={sendIds}
            />
          </div>
        )}
        {!isOpen && result && !result.ok && (
          <p role="alert" className="pl-[52px] text-[11px] text-[var(--color-terracotta-ink)] max-sm:pl-0">
            {`Couldn't send: ${(result.error || 'no reason was given').replace(/\.$/, '')}.`}
          </p>
        )}
      </li>
    );
  };

  return (
    <div data-testid="ready-to-send-sheet" className="flex flex-col gap-6">
      <p className="doc-type-body text-[var(--text-body)]">
        Nothing here leaves until it is sent from this sheet.
      </p>
      {outbound.isLoading && (
        <p className="text-[13px] text-[var(--text-muted)]">Reading what is ready to send…</p>
      )}
      {outbound.isError && (
        <p role="alert" className="text-[13px] text-[var(--color-terracotta-ink)]">
          The staged messages could not be read. Close this and try again.
        </p>
      )}
      {!outbound.isLoading && empty && (
        <p className="text-[13px] text-[var(--text-muted)]">Nothing is waiting to send on this project.</p>
      )}

      {GROUPS.map((group) => {
        const own = rows.filter((d) => d.recipient_kind === group.key);
        const texts = group.key === 'trade' ? own.filter((d) => d.channel === 'sms') : [];
        const singles = own.filter((d) => !texts.includes(d));
        const groupLetters = group.key === 'vendor' ? letters : [];
        if (singles.length === 0 && texts.length === 0 && groupLetters.length === 0) return null;
        const textIds = texts.filter(checkable).map((d) => d.id);
        const allTexts = textIds.length > 0 && textIds.every((id) => checked.has(id));
        return (
          <section
            key={group.key}
            aria-labelledby={`ready-to-send-${group.key}`}
            data-outbound-group={group.key}
          >
            <h3
              id={`ready-to-send-${group.key}`}
              className={`${LABEL_CLS} border-b border-[var(--border-default)] pb-1.5`}
            >
              {group.title}
            </h3>
            {singles.length > 0 && <ul>{singles.map(renderRow)}</ul>}
            {texts.length > 0 && (
              <div data-outbound-texts className="border-t border-[var(--color-pearl)] pt-1">
                <div className="flex items-center gap-2">
                  <label className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center">
                    <input
                      type="checkbox"
                      aria-label={`Check all of today's texts`}
                      checked={allTexts}
                      disabled={textIds.length === 0 || busy}
                      onChange={(e) => toggleChecked(textIds, e.target.checked)}
                      className="h-4 w-4 accent-[var(--color-clay)]"
                    />
                  </label>
                  <p className="text-[14px] font-medium text-[var(--text-primary)]">
                    {`Today's texts (${texts.length})`}
                  </p>
                </div>
                <ul className="pl-[44px] max-sm:pl-3">{texts.map(renderRow)}</ul>
              </div>
            )}
            {groupLetters.map((letter) => (
              <DraftReview key={letter.id} draft={letter} surfaceKey="desk" regionKey="ready-to-send" />
            ))}
          </section>
        );
      })}

      {waiting && (
        <div className="sticky bottom-0 z-10 -mx-6 flex flex-col gap-1.5 border-t border-[var(--color-pearl)] bg-[var(--doc-paper,#FAF7F2)] px-6 py-3 sm:-mx-9 sm:px-9">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <DocumentAction
              actionKey="send-checked-outbound"
              surfaceKey="desk"
              regionKey="ready-to-send"
              variant="primary"
              held={!canSend}
              aria-describedby={canSend ? undefined : 'ready-to-send-lead'}
              disabled={!canSend || checkedIds.length === 0 || busy}
              loading={sendDrafts.isPending}
              loadingLabel="Sending"
              onClick={sendChecked}
            >
              {`Send the ${checkedIds.length} checked`}
            </DocumentAction>
          </div>
          {!viewer.ready ? (
            <p id="ready-to-send-lead" className="text-[12px] text-[var(--text-muted)]">
              Loading who leads this project…
            </p>
          ) : !viewer.canSend ? (
            <p id="ready-to-send-lead" data-act-lead-first className="text-[12px] text-[var(--color-mocha)]">
              {`${leadName.charAt(0).toUpperCase()}${leadName.slice(1)} sees this first.`}
            </p>
          ) : null}
          {batchError && (
            <p role="alert" className="text-[12px] text-[var(--color-terracotta-ink)]">
              {batchError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
