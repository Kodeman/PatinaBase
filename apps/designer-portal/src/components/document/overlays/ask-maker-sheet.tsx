'use client';

/**
 * ASK THE MAKER FOR A DATE — a held draft, never a send (US-19 D6, R37).
 *
 * The sheet opens with the note already drafted (to the maker, a subject, a
 * body; focus on the body) and offers exactly two acts: `Hold for review` and
 * `Discard`. Holding posts to `/api/document/ask-maker-date`, which proves the
 * caller buys for the project through their own RLS and then writes ONE
 * `procurement_drafts` row in `awaiting_review` on the line's PO, server-side.
 * Nothing is emailed and nothing reaches the maker from the sheet.
 *
 * A held note is the studio's own procurement draft: `Open the held draft`
 * opens its DraftReview, the same review the line's Movement cell and the Desk
 * mount, where a studio member sends or discards it. Only that Send press
 * hands it to `procurement-draft-send`. A Discard releases the line for
 * another ask; a send holds it for the rest of the studio day (506-3).
 *
 * `InstallReadingLine` is the Install head's own status line (the reading and
 * its act). It lives here because it owns this sheet's open state and the
 * held-draft read, so the head itself mounts one element behind the
 * `ask-the-paper` flag. Its data hooks run only when the flag is on.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  buyingPhase2Keys,
  useInstallWindow,
  useProcurementDrafts,
  type ProcurementDraftRow,
} from '@patina/supabase';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { Input, Textarea } from '@/components/ui/controls';
import { ACT_LANDING_EVENTS, ACT_TARGET_IDS, NEED_ACT_LABELS } from '@/lib/document/act-names';
import { dayMonth, parseSourceDate } from '@/lib/document/dates';
import {
  LIVE_MAKER_ASK_STATUSES,
  awaitsArrivalDate,
  installReading,
  lineMaker,
  makerAskSentWords,
  pieceName,
  readingDay,
  sentThisStudioDay,
  shownMakerAsk,
  standingMakerAsk,
  type InstallReadingPiece,
  type LineMakerSource,
} from '@/lib/document/install-reading';
import { DraftReview, landOnMakerAddress } from '../buying/draft-review';
import { DocSheet } from './doc-sheet';
import { DocumentAction, DocumentActionGroup } from '../document-action';

/** The line as `useProjectFFEItems` returns it, as far as the note reads it. */
export interface AskMakerPiece extends InstallReadingPiece {
  vendor_id?: string | null;
  vendor_name?: string | null;
  product?: LineMakerSource['product'];
  purchase_order?: {
    delivered_date?: string | null;
    confirmed_eta?: string | null;
    vendor_po_number?: string | null;
    po_number?: string | null;
    vendor_id?: string | null;
    vendor?: { name?: string | null } | null;
  } | null;
}

const ROUTE = '/api/document/ask-maker-date';
const KIND = 'maker_eta_request';
const NO_MAKER = 'No maker is recorded on this line.';

/** The drafted note. It states the recorded fact and asks; it never judges. */
export function askMakerDraft(
  piece: AskMakerPiece,
  today: Date,
): { to: string | null; subject: string; body: string } {
  const maker = lineMaker(piece);
  const po = piece.purchase_order?.vendor_po_number ?? piece.purchase_order?.po_number ?? null;
  const eta = parseSourceDate(piece.purchase_order?.confirmed_eta ?? null);
  const fact = eta
    ? `We had it due ${readingDay(eta, today)}, and it hasn't arrived.`
    : 'We have no arrival date recorded for it.';
  return {
    to: maker,
    subject: `Arrival date: ${pieceName(piece.name)}${po ? ` · PO ${po}` : ''}`,
    body: [
      // R42: the note opens with the maker's name, or with no greeting at all.
      ...(maker ? [`${maker},`] : []),
      `Could you give us an arrival date for this piece?`,
      `${piece.name.trim()}${po ? ` (PO ${po})` : ''}`,
      fact,
      'Thank you.',
    ].join('\n\n'),
  };
}

/**
 * US-19 FR4 520-2 — `Follow up with the maker`: the same held note, addressed
 * by the PO number the paper prints. The body is the designer's to write.
 */
export function followUpDraft(piece: AskMakerPiece): {
  to: string | null;
  subject: string;
  body: string;
} {
  const po = piece.purchase_order?.po_number ?? piece.purchase_order?.vendor_po_number ?? null;
  return {
    to: lineMaker(piece),
    subject: `${po ?? pieceName(piece.name)} — following up`,
    body: '',
  };
}

/** A refused hold, with the draft that stands against it on a 409 (506-3). */
class HoldRefused extends Error {
  constructor(
    message: string,
    readonly draft: ProcurementDraftRow | null,
  ) {
    super(message);
  }
}

function useHoldMakerDraft(projectId: string) {
  const queryClient = useQueryClient();
  // The PO's DraftReview, the Desk drafts list and this line's held read.
  const refreshDrafts = () =>
    queryClient.invalidateQueries({ queryKey: [...buyingPhase2Keys.all, 'drafts'] });
  return useMutation({
    mutationFn: async (input: { ffeItemId: string; subject: string; body: string }) => {
      const response = await fetch(ROUTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, ...input }),
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as {
          error?: string;
          draft?: ProcurementDraftRow | null;
        } | null;
        throw new HoldRefused(
          detail?.error ?? 'Could not hold that note just now.',
          detail?.draft ?? null,
        );
      }
      return (await response.json()) as { draft: ProcurementDraftRow };
    },
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: ['document-state', 'desk'] });
      // Awaited, so the row already reads the held draft when the sheet closes.
      await refreshDrafts();
    },
    // A 409 means a note already stands for this piece: read it back.
    onError: () => void refreshDrafts(),
  });
}

export function AskMakerSheet({
  open,
  onClose,
  onHeld = onClose,
  projectId,
  piece,
  held,
  followUp = false,
}: {
  open: boolean;
  onClose: () => void;
  /** After the note is held; the row lands focus on `Open the held draft`. */
  onHeld?: () => void;
  projectId: string;
  piece: AskMakerPiece;
  /** The note already held for this piece: the sheet opens its DraftReview. */
  held: ProcurementDraftRow | null;
  /** FR4 520-2 — the sheet is `Follow up with the maker`'s composer. */
  followUp?: boolean;
}) {
  const draft = useMemo(
    () => (followUp ? followUpDraft(piece) : askMakerDraft(piece, new Date())),
    [piece, followUp],
  );
  const hasMaker = draft.to !== null;
  const title = followUp ? NEED_ACT_LABELS.po_unacknowledged : 'Ask the maker for a date';
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);
  const reviewRef = useRef<HTMLDivElement | null>(null);
  const hold = useHoldMakerDraft(projectId);
  const canHold = subject.trim().length > 0 && body.trim().length > 0;
  // 506-3: the draft a refused hold named, opened from the refusal.
  const [opened, setOpened] = useState<ProcurementDraftRow | null>(null);
  const review = held ?? opened;
  const standing = hold.error instanceof HoldRefused ? hold.error.draft : null;
  // US-19 F3-22 (517-1): Add an address lands on the vendor's terms.
  // US-19 FR4 520-1 (one-voice): the sheet opens on the body when the line
  // has a maker, since the subject is already written; with none, on Subject.
  const oneVoice = useFeatureFlag('one-voice').value === true;

  // DocSheet focuses its panel in a frame on open; its effect runs before this
  // one (child first), so this frame lands focus on the body after it.
  useEffect(() => {
    if (!open || held) return;
    const frame = window.requestAnimationFrame(() =>
      (oneVoice && !hasMaker ? subjectRef.current : bodyRef.current)?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [open, held, oneVoice, hasMaker]);

  // L-10: `Open the held draft` lands on the review it opened, in a frame as
  // the body's focus does, so it lands after DocSheet's own.
  useEffect(() => {
    if (!opened) return;
    const frame = window.requestAnimationFrame(() =>
      reviewRef.current?.querySelector<HTMLElement>('input, textarea, button')?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [opened]);

  return (
    <DocSheet
      open={open}
      onClose={onClose}
      title={title}
      icon={CalendarClock}
      kind={followUp ? 'maker-follow-up' : 'ask-maker-date'}
    >
      <div data-overlay-ask-maker className="mx-auto w-full max-w-[34rem] space-y-5">
        {review ? (
          <div ref={reviewRef}>
            <DraftReview
              draft={review}
              surfaceKey="open-document"
              regionKey="ask-maker-sheet"
              addressee={lineMaker(piece)}
              onAddAddress={() => {
                onClose();
                landOnMakerAddress(piece, { onTerms: oneVoice });
              }}
            />
          </div>
        ) : (
          <>
            <p className="text-[14px] text-[var(--color-charcoal)]">
              <span className="mr-2 font-mono text-[12px] uppercase tracking-[0.1em]">To</span>
              {draft.to ?? NO_MAKER}
            </p>
            <div>
              <label
                htmlFor="ask-maker-subject"
                className="mb-1.5 block font-mono text-[12px] uppercase tracking-[0.1em] text-[var(--color-charcoal)]"
              >
                Subject
              </label>
              <Input
                id="ask-maker-subject"
                ref={subjectRef}
                value={subject}
                maxLength={200}
                onChange={(event) => setSubject(event.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="ask-maker-body"
                className="mb-1.5 block font-mono text-[12px] uppercase tracking-[0.1em] text-[var(--color-charcoal)]"
              >
                Note
              </label>
              <Textarea
                id="ask-maker-body"
                ref={bodyRef}
                rows={10}
                value={body}
                maxLength={4000}
                onChange={(event) => setBody(event.target.value)}
              />
            </div>
            {hold.isError && (
              <div className="flex flex-col items-start gap-1">
                <p
                  role="alert"
                  className="border-l-2 border-[var(--color-terracotta)] pl-3 text-[14px] text-[var(--color-charcoal)]"
                >
                  {hold.error.message}
                </p>
                {standing && (
                  <DocumentAction
                    actionKey="open-held-maker-draft"
                    surfaceKey="open-document"
                    regionKey="ask-maker-sheet"
                    variant="inked"
                    onClick={() => setOpened(standing)}
                  >
                    Open the held draft
                  </DocumentAction>
                )}
              </div>
            )}
            <p className="text-[13px] text-[var(--color-mocha)]">
              A held note waits for review. Nothing reaches the maker until a person sends it.
            </p>
            <DocumentActionGroup
              surfaceKey="open-document"
              regionKey="ask-maker-sheet"
              aria-label={title}
            >
              <DocumentAction
                actionKey="hold-maker-date-request"
                variant="primary"
                disabled={!canHold}
                held={!canHold}
                aria-describedby={canHold ? undefined : 'ask-maker-hold-reason'}
                loading={hold.isPending}
                loadingLabel="Holding…"
                onClick={() =>
                  hold.mutate(
                    { ffeItemId: piece.id, subject: subject.trim(), body: body.trim() },
                    { onSuccess: onHeld },
                  )
                }
              >
                Hold for review
              </DocumentAction>
              <DocumentAction
                actionKey="discard-maker-date-request"
                variant="tertiary"
                onClick={onClose}
              >
                Discard
              </DocumentAction>
            </DocumentActionGroup>
            {!canHold && (
              <p id="ask-maker-hold-reason" className="text-[13px] text-[var(--text-muted)]">
                The note needs a subject and a body.
              </p>
            )}
          </>
        )}
      </div>
    </DocSheet>
  );
}

/** Land on a control another region owns (L-10): bring it into view, focus it. */
function landOn(selector: string) {
  const target = document.querySelector<HTMLElement>(selector);
  target?.scrollIntoView({ block: 'center' });
  target?.focus({ preventScroll: true });
}

/**
 * The Install head's own status line (D6), behind `ask-the-paper`. Flag off,
 * it renders nothing and calls no data hook.
 */
export function InstallReadingLine({
  projectId,
  items,
}: {
  projectId: string;
  /** The schedule's lines; undefined while they load or when the read failed. */
  items: readonly AskMakerPiece[] | undefined;
}) {
  const askThePaper = useFeatureFlag('ask-the-paper');
  if (!askThePaper.value || !items) return null;
  return <InstallReadingLive projectId={projectId} items={items} />;
}

function InstallReadingLive({
  projectId,
  items,
}: {
  projectId: string;
  items: readonly AskMakerPiece[];
}) {
  const windowQuery = useInstallWindow(projectId);
  // Read under procurement_drafts RLS, the authority the route writes under
  // (F4), with the statuses the route refuses on (506-3).
  const draftsQuery = useProcurementDrafts(projectId, LIVE_MAKER_ASK_STATUSES);
  // The held draft as it stood when the sheet opened: a Send or Discard inside
  // the sheet settles the review there instead of flipping it back to a compose.
  const [sheet, setSheet] = useState<{ held: ProcurementDraftRow | null } | null>(null);
  const actRef = useRef<HTMLButtonElement | null>(null);
  const reasonId = useId();
  // US-19 F2-12 (one-voice, V9) — a named act is scored, never the flooded ink.
  const oneVoice = useFeatureFlag('one-voice').value === true;

  // A window read in flight or failed is not "no window is held"
  // (install-window-ceremony.tsx), so until it settles nothing offers to hold one.
  const windowHeld = !windowQuery.isSuccess || windowQuery.data != null;
  const reading = useMemo(
    () => installReading(items, new Date(), windowHeld),
    [items, windowHeld],
  );
  // F3-2 — the band's press, as this render would take it (set below).
  const pressFromBandRef = useRef<(() => boolean) | null>(null);
  const addMakerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!oneVoice) return;
    const onAsk = (event: Event) => {
      if (pressFromBandRef.current?.()) event.preventDefault();
    };
    window.addEventListener(ACT_LANDING_EVENTS.askTheMaker, onAsk);
    return () => window.removeEventListener(ACT_LANDING_EVENTS.askTheMaker, onAsk);
  }, [oneVoice]);
  pressFromBandRef.current = null;
  if (!reading) return null;

  const piece = items.find((item) => String(item.id) === reading.firstItemId) ?? null;
  const asks = reading.act?.targetId === ACT_TARGET_IDS.installReading;
  // The route's own rule (506-3): the line's held or sending note, else one
  // sent this studio day. FR4 517-4 (b, one-voice): a sent note stays printed
  // until a date is recorded, in the cell's words; only one sent this studio
  // day holds the act.
  const now = new Date();
  const lineDrafts = asks
    ? (draftsQuery.data ?? []).filter(
        (draft) => draft.kind === KIND && draft.ffe_item_id === reading.firstItemId,
      )
    : [];
  const standing = !asks
    ? null
    : oneVoice
      ? shownMakerAsk(lineDrafts, now, piece ? awaitsArrivalDate(piece, now) : false)
      : standingMakerAsk(lineDrafts, now);
  const held = standing?.status === 'sent' ? null : standing;
  const sent = standing?.status === 'sent' ? standing : null;
  const sentToday = sent && sentThisStudioDay(sent, now) ? sent : null;
  const askedDay = held ? dayMonth(held.created_at) : null;
  // Until the held read settles the act could be either; offer neither.
  const unsettled = asks && draftsQuery.isPending;
  const maker = piece ? lineMaker(piece) : null;
  // R37: an act that cannot be taken stays, with its reason beneath it.
  const heldReason = !asks || held
    ? null
    : draftsQuery.isError
      ? 'Could not read the held notes just now.'
      : sentToday
        ? `A date request already went to ${maker ?? 'the maker'} today.`
        : piece && !maker
          ? NO_MAKER
          : null;
  // US-19 F3-22 (517-3, one-voice): a sending note is in flight, not held
  // (511-R5): its act reads `Open the draft`.
  const actLabel = unsettled
    ? null
    : held
      ? oneVoice && held.status === 'sending'
        ? 'Open the draft'
        : 'Open the held draft'
      : reading.act?.label ?? null;

  const press = () => {
    switch (reading.act?.targetId) {
      case ACT_TARGET_IDS.installReading:
        setSheet({ held });
        break;
      case ACT_TARGET_IDS.installWindow:
        landOn('[data-install-window] [data-action-key="open-install-window-ceremony"]');
        break;
      case ACT_TARGET_IDS.punchList:
        landOn('#document-task-controls');
        break;
    }
  };

  const addTheMaker = () => {
    if (!piece) return;
    window.dispatchEvent(
      new CustomEvent('document:focus-ffe-line', { detail: { itemId: String(piece.id), cell: 'maker' } }),
    );
  };

  // US-19 F3-2 (one-voice) — the band's act takes the row's own act: the sheet
  // opens on its first field. A held act lands where it can move: a line with
  // no maker on `Add the maker` (the sheet cannot hold a note to nobody),
  // any other reason on the held act, its reason beneath it.
  pressFromBandRef.current = () => {
    if (!asks || unsettled) return false;
    const heldLanding = heldReason === NO_MAKER ? addMakerRef.current : heldReason ? actRef.current : null;
    if (heldReason) {
      heldLanding?.scrollIntoView?.({ block: 'center' });
      heldLanding?.focus({ preventScroll: true });
    } else press();
    return true;
  };

  return (
    <div
      data-install-reading={reading.state}
      className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1"
    >
      <p className="text-[12.5px] text-[var(--color-mocha)]">
        {reading.sentence}
        {(held || sent) && (
          <span className="block">
            {held?.status === 'sending'
              ? 'Sending…'
              : sent
                ? makerAskSentWords(sent)
                : askedDay
                  ? `Asked ${askedDay} · draft held for review`
                  : 'Draft held for review'}
          </span>
        )}
      </p>
      {actLabel && (
        <div className="flex flex-col items-start">
          <div className="flex items-center gap-1">
            <DocumentAction
              ref={actRef}
              id={asks ? ACT_TARGET_IDS.installReading : undefined}
              actionKey={held ? 'open-held-maker-draft' : 'install-reading-act'}
              surfaceKey="project"
              regionKey="install-reading"
              variant={oneVoice ? 'primary' : 'inked'}
              disabled={heldReason !== null}
              held={heldReason !== null}
              aria-describedby={heldReason ? reasonId : undefined}
              onClick={press}
            >
              {actLabel}
            </DocumentAction>
            {heldReason === NO_MAKER && (
              <DocumentAction
                ref={addMakerRef}
                actionKey="install-reading-add-maker"
                surfaceKey="project"
                regionKey="install-reading"
                variant="tertiary"
                onClick={addTheMaker}
              >
                Add the maker
              </DocumentAction>
            )}
          </div>
          {heldReason && (
            <p id={reasonId} className="text-[12px] text-[var(--text-muted)]">
              {heldReason}
            </p>
          )}
        </div>
      )}
      {sheet && piece && (
        <AskMakerSheet
          open
          onClose={() => setSheet(null)}
          onHeld={() => {
            setSheet(null);
            // F7: focus lands on `Open the held draft`, the act it just became.
            window.requestAnimationFrame(() => actRef.current?.focus({ preventScroll: true }));
          }}
          projectId={projectId}
          piece={piece}
          held={sheet.held}
        />
      )}
    </div>
  );
}
