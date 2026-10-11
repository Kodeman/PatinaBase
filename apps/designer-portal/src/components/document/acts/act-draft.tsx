'use client';

/**
 * US-25 slice 5 — the body every scoped act sheet shares: who it goes to, the
 * record it is about, the prefilled draft, and one named control.
 *
 * Nothing sends on open. The lead (or the owner) sends with the named control
 * ("Send the chase to Fenmoor Joinery"), and the need is then marked `acted`,
 * waiting on the counterpart (Q8). Any other member sends nothing (Q11): where
 * the draft store holds the letter she saves it for the lead, otherwise the
 * draft is shown read-only. Either way it reads "<Lead> sees this first".
 */

import { useState, type ReactNode } from 'react';
import { useSetNeedState } from '@patina/supabase';
import { Input, Textarea } from '@/components/ui/controls';
import type { DeskNeed } from '@/lib/document/desk-need-list';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import type { ActViewer } from './act-viewer';

export interface ActDraftText {
  subject: string;
  body: string;
}

const LABEL_CLS =
  'mb-1.5 block font-mono text-[12px] uppercase tracking-[0.1em] text-[var(--color-charcoal)]';

const capitalised = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/** SQ-778 N1 — a failed act says what happened and what to do, in one plain
 *  line; the transport's own words stay in the console. */
export const SEND_FAILED = 'Couldn’t send — nothing went out. Try again, or check your connection.';
export const SAVE_FAILED = 'Couldn’t save the draft — nothing was saved. Try again, or check your connection.';

/** The send boundary answered no: nothing went (SQ-751 F2 · SQ-774 R3). */
class SendWithdrawn extends Error {
  constructor(readonly draftHeld: boolean) {
    super('Who leads this project changed, so nothing was sent.');
  }
}

/**
 * Reads the job's lead again and throws `SendWithdrawn` if she may no longer
 * send. A send path calls it immediately before its outward send, after any
 * write that prepares it; `draftHeld` says such a write left a held draft.
 */
export type ConfirmSend = (prepared?: { draftHeld: boolean }) => Promise<void>;

export function ActDraft({
  need,
  viewer,
  regionKey,
  counterpart,
  record,
  quote = null,
  initial,
  bodyLabel = 'Note',
  sendLabel,
  onSend,
  onSaveForLead,
  onDone,
}: {
  need: DeskNeed;
  viewer: ActViewer;
  regionKey: string;
  /** Who the act reaches; null when the record names no one. */
  counterpart: string | null;
  /** The record the act is about, in one line. */
  record: string;
  /** Words the counterpart already said (a decline reason), quoted. */
  quote?: ReactNode;
  /** The prefilled draft. A null subject means the act has no subject line;
   *  null means the act writes no letter (a release). */
  initial: { subject: string | null; body: string } | null;
  bodyLabel?: string;
  /** The named send control, e.g. "Send the chase to Fenmoor Joinery". */
  sendLabel: string;
  /** The existing send path. Called only by the named control; it awaits
   *  `confirmSend` immediately before its outward send (SQ-774 R3). */
  onSend: (text: ActDraftText, confirmSend: ConfirmSend) => Promise<void>;
  /** Q11 — saves the draft for the lead. Absent: a non-lead reads only. */
  onSaveForLead?: (text: ActDraftText) => Promise<void>;
  onDone: () => void;
}) {
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // SQ-751 F2 — the lead changed between open and send; nothing went. 'held':
  // the change came after her draft was held, so it waits for the lead.
  const [revoked, setRevoked] = useState<'unsent' | 'held' | null>(null);
  // The act went but the Day Sheet could not record it (never silent).
  const [unmarked, setUnmarked] = useState(false);
  const setNeedState = useSetNeedState();

  const mode: 'reading' | 'send' | 'save' | 'read-only' = !viewer.ready
    ? 'reading'
    : viewer.canSend && !revoked
      ? 'send'
      : onSaveForLead
        ? 'save'
        : 'read-only';
  const readOnly = mode === 'read-only';
  const lead = viewer.leadFirstName ?? 'the lead';
  const complete =
    initial === null ||
    (body.trim().length > 0 && (initial.subject === null || subject.trim().length > 0));
  const text = (): ActDraftText => ({ subject: subject.trim(), body: body.trim() });

  // SQ-751 F2 · SQ-774 R3 — the send boundary reads the job's lead again,
  // immediately before the outward send: neither a sheet opened before a
  // reassignment nor a job reassigned while its draft was held sends on the
  // old answer.
  const confirmSend: ConfirmSend = async (prepared) => {
    if (viewer.recheck && !(await viewer.recheck())) {
      throw new SendWithdrawn(prepared?.draftHeld ?? false);
    }
  };

  const run = async (
    act: (text: ActDraftText, confirm: ConfirmSend) => Promise<void>,
    acted: boolean,
  ) => {
    setError(null);
    setPending(true);
    try {
      await act(text(), confirmSend);
    } catch (e) {
      if (e instanceof SendWithdrawn) setRevoked(e.draftHeld ? 'held' : 'unsent');
      else {
        console.error('[act-sheet] act failed', e);
        setError(acted ? SEND_FAILED : SAVE_FAILED);
      }
      setPending(false);
      return;
    }
    // SQ-778 N5 — every line holds a state, a pre-project one included: the
    // need's engagement names its studio.
    if (acted) {
      // Q8 — the act is taken; the need now waits on the counterpart. The
      // send already went, so a failed mark never reads as a failed send.
      try {
        await setNeedState.mutateAsync({
          needKey: need.key,
          engagementId: need.projectId,
          action: 'acted',
          ...(counterpart ? { waitingOn: counterpart } : {}),
        });
      } catch {
        setUnmarked(true);
        setPending(false);
        return;
      }
    }
    setPending(false);
    onDone();
  };

  if (unmarked) {
    return (
      <p role="status" data-act-unmarked className="mx-auto w-full max-w-[34rem] text-[14px] text-[var(--color-charcoal)]">
        It went. The Day Sheet could not record it, so this line may still show there.
      </p>
    );
  }

  if (revoked === 'held') {
    return (
      <p role="status" data-act-revoked="held" className="mx-auto w-full max-w-[34rem] text-[14px] text-[var(--color-charcoal)]">
        {`Who leads this project changed, so nothing was sent. The draft is held for ${lead}.`}
      </p>
    );
  }

  return (
    <div data-act-draft={mode} className="mx-auto w-full max-w-[34rem] space-y-5">
      <p className="text-[14px] text-[var(--color-charcoal)]">
        <span className="mr-2 font-mono text-[12px] uppercase tracking-[0.1em]">
          {regionKey === 'act-release-order' ? 'Vendor:' : 'To'}
        </span>
        {counterpart ?? 'No one is recorded for this.'}
      </p>
      <p data-act-record className="text-[14px] text-[var(--color-charcoal)]">
        <span className="mr-2 font-mono text-[12px] uppercase tracking-[0.1em]">About</span>
        {record}
      </p>
      {quote && (
        <p data-act-quote className="border-l-2 border-[var(--color-charcoal)] pl-3 text-[14px] text-[var(--color-charcoal)]">
          {quote}
        </p>
      )}
      {viewer.handoff && (
        <p data-act-handoff className="text-[13px] text-[var(--color-mocha)]">
          {viewer.handoff.from ? `From ${viewer.handoff.from}: ` : ''}
          {viewer.handoff.note}
        </p>
      )}
      {initial && initial.subject !== null && (
        <div>
          <label htmlFor={`${regionKey}-subject`} className={LABEL_CLS}>
            Subject
          </label>
          <Input
            id={`${regionKey}-subject`}
            value={subject}
            maxLength={300}
            readOnly={readOnly}
            onChange={(event) => setSubject(event.target.value)}
          />
        </div>
      )}
      {initial && (
        <div>
          <label htmlFor={`${regionKey}-body`} className={LABEL_CLS}>
            {bodyLabel}
          </label>
          <Textarea
            id={`${regionKey}-body`}
            rows={8}
            value={body}
            maxLength={4000}
            readOnly={readOnly}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="border-l-2 border-[var(--color-terracotta)] pl-3 text-[14px] text-[var(--color-charcoal)]"
        >
          {error}
        </p>
      )}
      {revoked && (
        <p role="status" data-act-revoked className="text-[14px] text-[var(--color-charcoal)]">
          Who leads this project changed since this opened, so nothing was sent.
        </p>
      )}
      {(mode === 'save' || mode === 'read-only') && (
        <p data-act-lead-first className="text-[13px] text-[var(--color-mocha)]">
          {`${capitalised(lead)} sees this first.`}
        </p>
      )}
      {mode === 'reading' && (
        <p className="text-[13px] text-[var(--text-muted)]">Loading who leads this project…</p>
      )}
      {(mode === 'send' || mode === 'save') && (
        <DocumentActionGroup surfaceKey="open-document" regionKey={regionKey} aria-label={sendLabel}>
          {mode === 'send' ? (
            <DocumentAction
              actionKey={`${regionKey}-send`}
              variant="primary"
              disabled={!complete}
              held={!complete}
              loading={pending}
              loadingLabel={regionKey === 'act-release-order' ? 'Approving…' : 'Sending…'}
              onClick={() => void run(onSend, true)}
            >
              {sendLabel}
            </DocumentAction>
          ) : (
            <DocumentAction
              actionKey={`${regionKey}-save-for-lead`}
              variant="primary"
              disabled={!complete}
              held={!complete}
              loading={pending}
              loadingLabel="Saving…"
              onClick={() => void run(onSaveForLead!, false)}
            >
              {`Save the draft for ${lead}`}
            </DocumentAction>
          )}
        </DocumentActionGroup>
      )}
    </div>
  );
}
