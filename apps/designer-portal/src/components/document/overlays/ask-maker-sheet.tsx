'use client';

/**
 * ASK THE MAKER FOR A DATE — a held draft, never a send (US-19, ruling D6).
 *
 * The sheet opens with the note already drafted (to the maker, a subject, a
 * body; focus on the body) and offers exactly two acts: `Hold for review` and
 * `Discard`. No Send control exists on this surface in any state. Holding
 * posts to `/api/document/ask-maker-date`, which proves the caller works on
 * the project through their own RLS and then files ONE `awaiting_review` task
 * on the agent queue with the service role, server-side. Nothing is emailed
 * and nothing reaches the maker: a person sends the held note later.
 *
 * `InstallReadingLine` is the Install head's own status line (the reading and
 * its act). It lives here because it owns this sheet's open state and the
 * held-draft read, so the head itself mounts one element behind the
 * `ask-the-paper` flag. Its data hooks run only when the flag is on.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useInstallWindow } from '@patina/supabase';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { Input, Textarea } from '@/components/ui/controls';
import { ACT_TARGET_IDS } from '@/lib/document/act-names';
import { dayMonth, parseSourceDate } from '@/lib/document/dates';
import {
  installReading,
  pieceName,
  readingDay,
  type InstallReadingPiece,
} from '@/lib/document/install-reading';
import { DocSheet } from './doc-sheet';
import { DocumentAction, DocumentActionGroup } from '../document-action';

/** The line as `useProjectFFEItems` returns it, as far as the note reads it. */
export interface AskMakerPiece extends InstallReadingPiece {
  vendor_name?: string | null;
  purchase_order?: {
    delivered_date?: string | null;
    confirmed_eta?: string | null;
    vendor_po_number?: string | null;
    po_number?: string | null;
  } | null;
}

/** A note held on the queue for review, as the route reads it back. */
export interface HeldMakerDraft {
  taskId: string;
  ffeItemId: string | null;
  askedAt: string;
  makerName: string | null;
  subject: string;
  body: string;
}

const ROUTE = '/api/document/ask-maker-date';
const heldKey = (projectId: string) => ['ask-maker-date', projectId] as const;

/** The drafted note. It states the recorded fact and asks; it never judges. */
export function askMakerDraft(
  piece: AskMakerPiece,
  today: Date,
): { to: string | null; subject: string; body: string } {
  const maker = piece.vendor_name?.trim() || null;
  const po = piece.purchase_order?.vendor_po_number ?? piece.purchase_order?.po_number ?? null;
  const eta = parseSourceDate(piece.purchase_order?.confirmed_eta ?? null);
  const fact = eta
    ? `We had it due ${readingDay(eta, today)}, and it hasn't arrived.`
    : 'We have no arrival date recorded for it.';
  return {
    to: maker,
    subject: `Arrival date: ${pieceName(piece.name)}${po ? ` · PO ${po}` : ''}`,
    body: [
      `Hello ${maker ?? 'there'},`,
      `Could you give us an arrival date for this piece?`,
      `${piece.name.trim()}${po ? ` (PO ${po})` : ''}`,
      fact,
      'Thank you.',
    ].join('\n\n'),
  };
}

export function useHeldMakerDrafts(projectId: string) {
  return useQuery({
    queryKey: heldKey(projectId),
    queryFn: async (): Promise<HeldMakerDraft[]> => {
      const response = await fetch(`${ROUTE}?projectId=${encodeURIComponent(projectId)}`);
      if (!response.ok) throw new Error('Could not read the held notes just now.');
      const json = (await response.json()) as { drafts?: HeldMakerDraft[] };
      return json.drafts ?? [];
    },
  });
}

function useHoldMakerDraft(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { ffeItemId: string; subject: string; body: string }) => {
      const response = await fetch(ROUTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, ...input }),
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(detail?.error ?? 'Could not hold that note just now.');
      }
      return (await response.json()) as { taskId: string | null; askedAt: string | null };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: heldKey(projectId) }),
  });
}

export function AskMakerSheet({
  open,
  onClose,
  projectId,
  piece,
  held,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  piece: AskMakerPiece;
  /** A note already held for this piece: the sheet shows it and offers no act. */
  held: HeldMakerDraft | null;
}) {
  const draft = useMemo(() => askMakerDraft(piece, new Date()), [piece]);
  const [subject, setSubject] = useState(held?.subject ?? draft.subject);
  const [body, setBody] = useState(held?.body ?? draft.body);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const hold = useHoldMakerDraft(projectId);
  const to = held ? held.makerName : draft.to;
  const canHold = subject.trim().length > 0 && body.trim().length > 0;

  // DocSheet focuses its panel in a frame on open; its effect runs before this
  // one (child first), so this frame lands focus on the body after it.
  useEffect(() => {
    if (!open || held) return;
    const frame = window.requestAnimationFrame(() => bodyRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, held]);

  const askedDay = held ? dayMonth(held.askedAt) : null;

  return (
    <DocSheet
      open={open}
      onClose={onClose}
      title="Ask the maker for a date"
      icon={CalendarClock}
      kind="ask-maker-date"
    >
      <div data-overlay-ask-maker className="mx-auto w-full max-w-[34rem] space-y-5">
        <p className="text-[14px] text-[var(--color-charcoal)]">
          <span className="mr-2 font-mono text-[12px] uppercase tracking-[0.1em]">To</span>
          {to ?? 'No maker is recorded on this line.'}
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
            value={subject}
            readOnly={held !== null}
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
            readOnly={held !== null}
            maxLength={4000}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>

        {held ? (
          <p className="text-[13px] text-[var(--color-mocha)]">
            {askedDay ? `Held for review ${askedDay}. ` : 'Held for review. '}
            Nothing reaches the maker until a person sends it.
          </p>
        ) : (
          <>
            {hold.isError && (
              <p
                role="alert"
                className="border-l-2 border-[var(--color-terracotta)] pl-3 text-[14px] text-[var(--color-charcoal)]"
              >
                {hold.error.message}
              </p>
            )}
            <p className="text-[13px] text-[var(--color-mocha)]">
              A held note waits for review. Nothing reaches the maker until a person sends it.
            </p>
            <DocumentActionGroup
              surfaceKey="open-document"
              regionKey="ask-maker-sheet"
              aria-label="Ask the maker for a date"
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
                    { onSuccess: onClose },
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
  const heldQuery = useHeldMakerDrafts(projectId);
  const [sheetOpen, setSheetOpen] = useState(false);

  // A window read in flight or failed is not "no window is held"
  // (install-window-ceremony.tsx), so until it settles nothing offers to hold one.
  const windowHeld = !windowQuery.isSuccess || windowQuery.data != null;
  const reading = useMemo(
    () => installReading(items, new Date(), windowHeld),
    [items, windowHeld],
  );
  if (!reading) return null;

  const piece = items.find((item) => String(item.id) === reading.firstItemId) ?? null;
  const asks = reading.act?.targetId === ACT_TARGET_IDS.installReading;
  const held = asks
    ? (heldQuery.data ?? []).find((draft) => draft.ffeItemId === reading.firstItemId) ?? null
    : null;
  const askedDay = held ? dayMonth(held.askedAt) : null;
  const actLabel = held ? 'Open the held draft' : reading.act?.label ?? null;

  const press = () => {
    switch (reading.act?.targetId) {
      case ACT_TARGET_IDS.installReading:
        setSheetOpen(true);
        break;
      case ACT_TARGET_IDS.installWindow:
        landOn('[data-install-window] [data-action-key="open-install-window-ceremony"]');
        break;
      case ACT_TARGET_IDS.punchList:
        landOn('#document-task-controls');
        break;
    }
  };

  return (
    <div
      data-install-reading={reading.state}
      className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1"
    >
      <p className="text-[12.5px] text-[var(--color-mocha)]">
        {reading.sentence}
        {held && (
          <span className="block">
            {askedDay ? `Asked ${askedDay} · draft held for review` : 'Draft held for review'}
          </span>
        )}
      </p>
      {actLabel && (
        <DocumentAction
          id={asks ? ACT_TARGET_IDS.installReading : undefined}
          actionKey={held ? 'open-held-maker-draft' : 'install-reading-act'}
          surfaceKey="project"
          regionKey="install-reading"
          variant="inked"
          onClick={press}
        >
          {actLabel}
        </DocumentAction>
      )}
      {sheetOpen && piece && (
        <AskMakerSheet
          open
          onClose={() => setSheetOpen(false)}
          projectId={projectId}
          piece={piece}
          held={held}
        />
      )}
    </div>
  );
}
