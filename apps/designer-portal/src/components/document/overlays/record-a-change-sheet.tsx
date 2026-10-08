'use client';

/**
 * Record a change — a router, not a sheet (rulings D5, US-19 slice 1).
 *
 * One question, `What changed?`, and two destinations that each state their
 * own consequence: `On the agreement` opens the existing AmendmentSheet, and
 * `On a piece` hands the Pieces region the prompt `Choose the piece` (a line
 * on a live PO then opens its change order; a line without one unfolds with
 * today's controls). The router itself prints no outcome sentence (ADV-33).
 *
 * Every doorway (the Pieces and Money heads, ⌘K, the unfolded line) only
 * dispatches `document:open-record-a-change`; this mount is its one listener.
 * A dispatch that names a line (`itemId`) skips the question.
 *
 * The router mounts its own AmendmentSheet rather than dispatching
 * `document:open-project-change`: that event's one listener (AccountBand)
 * attaches only at install and care, and at project the band lives inside the
 * Money region, which is not mounted while Money is folded.
 */

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { PencilLine } from 'lucide-react';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { NAMED_ACTS } from '@/lib/document/act-names';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { bandNextAct, isElementRendered } from './active-dialog';
import { AmendmentSheet } from './amendment-sheet';
import { DocSheet } from './doc-sheet';

/** The router's one doorway, named in the US-19 contract. */
export const RECORD_A_CHANGE_EVENT = 'document:open-record-a-change';

/** The router's hand-off to the Pieces region: with an `itemId`, that line's
 *  destination; without one, the `Choose the piece` prompt. */
export const RECORD_A_CHANGE_ON_PIECE_EVENT = 'document:record-a-change-on-piece';

export type RecordAChangeOrigin = 'pieces-head' | 'money-head' | 'cmdk' | 'line';

export interface RecordAChangeDetail {
  origin: RecordAChangeOrigin;
  itemId?: string;
}

export interface RecordAChangeOnPieceDetail {
  itemId?: string;
}

export function openRecordAChange(detail: RecordAChangeDetail): void {
  window.dispatchEvent(
    new CustomEvent<RecordAChangeDetail>(RECORD_A_CHANGE_EVENT, { detail }),
  );
}

function toPiece(itemId?: string): void {
  window.dispatchEvent(
    new CustomEvent<RecordAChangeOnPieceDetail>(RECORD_A_CHANGE_ON_PIECE_EVENT, {
      detail: itemId ? { itemId } : {},
    }),
  );
}

const CHOICES = [
  {
    value: 'piece',
    label: 'On a piece',
    helper: 'Swap, add or remove a piece, or change its finish, size or maker.',
  },
  {
    value: 'agreement',
    label: 'On the agreement',
    helper: 'The scope, the fee or the terms.',
  },
] as const;

type Choice = (typeof CHOICES)[number]['value'];

/** Behind `ask-the-paper` or `one-voice` (FR2 508-1: the Money head's door is
 *  `Record a change` under one-voice whatever ask-the-paper says): with both
 *  off nothing mounts and nothing listens. */
export function RecordAChangeSheet(props: {
  projectId: string;
  clientName: string | null;
}) {
  const askThePaper = useFeatureFlag('ask-the-paper').value;
  const oneVoice = useFeatureFlag('one-voice').value === true;
  if (!askThePaper && !oneVoice) return null;
  return <RecordAChangeRouter {...props} />;
}

function RecordAChangeRouter({
  projectId,
  clientName,
}: {
  projectId: string;
  clientName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [amending, setAmending] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);
  // Walk D18: a ⌘K row is gone by the time the router is put back, so home is
  // then the band's Next act. Read when used, never snapshotted at open.
  const homeRef = useMemo(
    () => ({
      get current(): HTMLElement | null {
        const opener = openerRef.current;
        return opener?.isConnected && isElementRendered(opener) ? opener : bandNextAct();
      },
    }),
    [],
  );
  // P-2: the chooser opens on its first option (nothing is chosen on open).
  const firstChoiceRef = useRef<HTMLInputElement | null>(null);
  const groupName = useId();
  const reasonId = useId();
  const helperId = useId();

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<RecordAChangeDetail | undefined>).detail;
      if (detail?.itemId) {
        toPiece(detail.itemId);
        return;
      }
      const active = document.activeElement;
      openerRef.current =
        active instanceof HTMLElement && active !== document.body ? active : null;
      setChoice(null);
      setOpen(true);
    };
    window.addEventListener(RECORD_A_CHANGE_EVENT, onOpen);
    return () => window.removeEventListener(RECORD_A_CHANGE_EVENT, onOpen);
  }, []);

  const proceed = () => {
    if (!choice) return;
    // Focus goes home before the router is put back, so the destination's own
    // sheet records the pressing control as the place it returns to.
    homeRef.current?.focus({ preventScroll: true });
    setOpen(false);
    if (choice === 'agreement') setAmending(true);
    else toPiece();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLFieldSetElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    proceed();
  };

  return (
    <>
      <DocSheet
        open={open}
        onClose={() => setOpen(false)}
        title={NAMED_ACTS.recordChange}
        icon={PencilLine}
        fallbackFocusRef={homeRef}
        initialFocusRef={firstChoiceRef}
        kind="record-a-change"
      >
        <div data-overlay-record-a-change className="mx-auto max-w-xl">
          <fieldset onKeyDown={onKeyDown}>
            <legend className="font-heading text-xl text-[var(--color-charcoal)]">
              What changed?
            </legend>
            <div className="mt-4 space-y-3">
              {CHOICES.map((option, index) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-3 text-[13px] text-[var(--color-charcoal)]"
                >
                  <input
                    ref={index === 0 ? firstChoiceRef : undefined}
                    type="radio"
                    name={groupName}
                    value={option.value}
                    checked={choice === option.value}
                    onChange={() => setChoice(option.value)}
                    aria-describedby={`${helperId}-${option.value}`}
                    className="mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--color-clay)]"
                  />
                  <span>
                    <span className="block font-medium">{option.label}</span>
                    <span
                      id={`${helperId}-${option.value}`}
                      className="block text-[12px] italic text-[var(--text-muted)]"
                    >
                      {option.helper}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <DocumentActionGroup
            surfaceKey="project"
            regionKey="record-a-change"
            className="mt-5"
          >
            <DocumentAction
              actionKey="continue-record-a-change"
              variant="primary"
              disabled={!choice}
              held={!choice}
              aria-describedby={choice ? undefined : reasonId}
              onClick={proceed}
            >
              Continue
            </DocumentAction>
          </DocumentActionGroup>
          {!choice && (
            <p id={reasonId} className="mt-1 text-[11px] text-[var(--text-muted)]">
              Choose one to continue.
            </p>
          )}
        </div>
      </DocSheet>

      {amending && (
        <AmendmentSheet
          projectId={projectId}
          clientName={clientName ?? ''}
          open
          onClose={() => setAmending(false)}
        />
      )}
    </>
  );
}
