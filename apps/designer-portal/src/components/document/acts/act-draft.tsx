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

import { useRef, useState, type ReactNode } from 'react';
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
 *  line; the transport's own words stay in the console. SQ-777 F1 — the line
 *  says how far the act got, so a partial success never invites a second
 *  send: before the outward call, during it, or after it answered. */
export const SEND_FAILED = 'Couldn’t send — nothing went out. Try again, or check your connection.';
export const SEND_UNCONFIRMED = 'We couldn’t confirm it went out. Check the thread before sending again.';
export const SENT_UNRECORDED = 'Sent. It didn’t record here — try marking it again.';
export const RELEASED_UNRECORDED = 'Release approved. It didn’t record here — try marking it again.';
export const SAVE_FAILED = 'Couldn’t save the draft — nothing was saved. Try again, or check your connection.';
export const SAVE_UNCONFIRMED = 'We couldn’t confirm the draft saved. Check the drafts before trying again.';
export const SAVED_UNRECORDED = 'Draft saved. It didn’t record here — try marking it again.';
export const NOT_SENT_SUPPRESSED =
  'Not sent — this client’s email is turned off or suppressed. Nothing went out.';

/** The send boundary answered no: nothing went (SQ-751 F2 · SQ-774 R3). */
class SendWithdrawn extends Error {
  constructor(readonly draftHeld: boolean) {
    super('Who leads this project changed, so nothing was sent.');
  }
}

/**
 * SQ-781 R2 — the outward call answered, and its receipt says nothing went
 * (a suppressed address). The act is not taken, so nothing records it; the
 * message is the sheet's one plain line.
 */
export class NotSent extends Error {}

/**
 * SQ-781 R3 — what compose_ack_chase_draft raises before its insert (00706):
 * no access to the order (42501), or an order not sent (23514). Only such a
 * refusal says no draft was written; any other failure may follow an insert
 * whose answer was lost, and the RPC does not de-duplicate.
 */
const REFUSED_BEFORE_WRITE = new Set(['42501', '23514']);
const refusedBeforeWrite = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && REFUSED_BEFORE_WRITE.has(String((e as { code?: unknown }).code));

/**
 * Reads the job's lead again and throws `SendWithdrawn` if she may no longer
 * send. A send path calls it immediately before its outward send, after any
 * write that prepares it; `draftHeld` says such a write left a held draft.
 */
export type ConfirmSend = (prepared?: { draftHeld: boolean }) => Promise<void>;

/**
 * SQ-777 F1 — what an act returns once its outward call (or, for a save, the
 * draft's insert) has answered: the steps that only record it here, such as
 * the invoice's chase stamp. Each runs once; a failed one, and those after
 * it, are what "Mark it again" retries. The need's own `acted` mark follows.
 */
export type RecordAct = () => Promise<void>;

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
   *  `confirmSend` immediately before its outward send (SQ-774 R3), so a
   *  failure before that sent nothing and one after it may have. */
  onSend: (text: ActDraftText, confirmSend: ConfirmSend) => Promise<RecordAct | void>;
  /** Q11 — saves the draft for the lead. Absent: a non-lead reads only. It
   *  resolves once the draft is inserted; what follows only records it. */
  onSaveForLead?: (text: ActDraftText) => Promise<RecordAct | void>;
  onDone: () => void;
}) {
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // SQ-751 F2 — the lead changed between open and send; nothing went. 'held':
  // the change came after her draft was held, so it waits for the lead.
  const [revoked, setRevoked] = useState<'unsent' | 'held' | null>(null);
  // SQ-777 F1 — the outward call failed or never answered: it may have gone,
  // so the sheet offers no second send. SQ-781 R3 — likewise a draft whose
  // insert never answered. Holds the line that says which.
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);
  // The act went (or the draft saved) but recording it here failed; the line
  // says which, and only the recording is offered again (never silent).
  const [unrecorded, setUnrecorded] = useState<string | null>(null);
  // The recording steps still to run, in order; a done step leaves the list.
  const recordings = useRef<RecordAct[]>([]);
  const setNeedState = useSetNeedState({ errorSurface: 'inline' });

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

  // Runs what is left of the recording; a failure keeps the rest for retry.
  const runRecordings = async (failed: string) => {
    setPending(true);
    try {
      while (recordings.current.length > 0) {
        await recordings.current[0]();
        recordings.current.shift();
      }
    } catch (e) {
      console.error('[act-sheet] recording failed', e);
      setUnrecorded(failed);
      setPending(false);
      return;
    }
    setPending(false);
    onDone();
  };

  const run = async (
    act: (text: ActDraftText, confirm: ConfirmSend) => Promise<RecordAct | void>,
    acted: boolean,
  ) => {
    setError(null);
    setPending(true);
    // Set once the lead is confirmed: from then on the outward call is under way.
    const progress = { outward: false };
    let recordAct: RecordAct | void = undefined;
    try {
      recordAct = await act(text(), async (prepared) => {
        await confirmSend(prepared);
        progress.outward = true;
      });
    } catch (e) {
      setPending(false);
      if (e instanceof SendWithdrawn) {
        setRevoked(e.draftHeld ? 'held' : 'unsent');
        return;
      }
      if (e instanceof NotSent) {
        setError(e.message);
        return;
      }
      console.error('[act-sheet] act failed', e);
      if (acted && progress.outward) setUnconfirmed(SEND_UNCONFIRMED);
      else if (!acted && !refusedBeforeWrite(e)) setUnconfirmed(SAVE_UNCONFIRMED);
      else setError(acted ? SEND_FAILED : SAVE_FAILED);
      return;
    }
    // SQ-778 N5 — every line holds a state, a pre-project one included: the
    // need's engagement names its studio. Q8 — the act is taken; the need now
    // waits on the counterpart.
    const markActed: RecordAct = async () => {
      await setNeedState.mutateAsync({
        needKey: need.key,
        engagementId: need.projectId,
        action: 'acted',
        ...(counterpart ? { waitingOn: counterpart } : {}),
      });
    };
    recordings.current = [...(recordAct ? [recordAct] : []), ...(acted ? [markActed] : [])];
    await runRecordings(
      !acted ? SAVED_UNRECORDED : regionKey === 'act-release-order' ? RELEASED_UNRECORDED : SENT_UNRECORDED,
    );
  };

  if (unconfirmed) {
    return (
      <p role="alert" data-act-unconfirmed className="mx-auto w-full max-w-[34rem] border-l-2 border-[var(--color-terracotta)] pl-3 text-[14px] text-[var(--color-charcoal)]">
        {unconfirmed}
      </p>
    );
  }

  if (unrecorded) {
    return (
      <div data-act-unmarked className="mx-auto w-full max-w-[34rem] space-y-3">
        <p role="status" className="text-[14px] text-[var(--color-charcoal)]">
          {unrecorded}
        </p>
        <DocumentActionGroup surfaceKey="open-document" regionKey={regionKey} aria-label="Mark it again">
          <DocumentAction
            actionKey={`${regionKey}-mark-again`}
            variant="primary"
            loading={pending}
            loadingLabel="Marking…"
            onClick={() => void runRecordings(unrecorded)}
          >
            Mark it again
          </DocumentAction>
        </DocumentActionGroup>
      </div>
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
          {/* SQ-777 F5 — a hand-off with no name on record is still hers. */}
          {`From ${viewer.handoff.from ?? 'the previous lead'}: `}
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
