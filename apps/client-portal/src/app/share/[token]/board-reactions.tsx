'use client';

/**
 * Guest reactions on an opted-in board share link (board-paths W2a, 00549).
 *
 * This component is mounted ONLY when resolve_board_share() said the link was
 * minted with reactions on — a view-only link renders the plain composition and
 * never loads this file. That is presentation, not security: every tap is
 * re-proved server-side by submit_board_share_reaction(), which checks the raw
 * token's hash, the share's status, expiry, payload integrity, the opt-in flag,
 * and that the pin belongs to the shared board before it writes anything. There
 * is no privileged key here — the browser holds the anon key and the token it
 * was given, exactly as the read path does.
 */

import { useMemo, useState } from 'react';
import { createBrowserClient } from '@patina/supabase';
import {
  BoardComposition,
  type BoardsBlockBoard,
} from '@patina/design-system';

export const GUEST_NOTE_LIMIT = 280;

export type GuestVerdict = 'approved' | 'rejected';

export interface GuestReaction {
  boardItemId: string;
  verdict: GuestVerdict;
  body: string | null;
}

interface BoardReactionsProps {
  token: string;
  board: BoardsBlockBoard;
  reactions: GuestReaction[];
}

type Status = 'idle' | 'saving' | 'saved' | 'error';

function isGuestVerdict(value: unknown): value is GuestVerdict {
  return value === 'approved' || value === 'rejected';
}

/** Narrow the resolve payload's `reactions` array without trusting its shape. */
export function parseGuestReactions(value: unknown): GuestReaction[] {
  if (!Array.isArray(value)) return [];
  const parsed: GuestReaction[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.boardItemId !== 'string') continue;
    if (!isGuestVerdict(row.verdict)) continue;
    parsed.push({
      boardItemId: row.boardItemId,
      verdict: row.verdict,
      body: typeof row.body === 'string' ? row.body : null,
    });
  }
  return parsed;
}

export function BoardReactions({ token, board, reactions }: BoardReactionsProps) {
  const [byItem, setByItem] = useState<Record<string, GuestReaction>>(() =>
    Object.fromEntries(reactions.map((reaction) => [reaction.boardItemId, reaction])),
  );
  const [status, setStatus] = useState<Status>('idle');
  const supabase = useMemo(() => createBrowserClient(), []);

  const send = async (boardItemId: string, verdict: GuestVerdict, body: string | null) => {
    const previous = byItem[boardItemId];
    setByItem((current) => ({
      ...current,
      [boardItemId]: { boardItemId, verdict, body },
    }));
    setStatus('saving');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc('submit_board_share_reaction', {
      p_token: token,
      p_board_item_id: boardItemId,
      p_verdict: verdict,
      p_body: body,
    });
    if (error) {
      setByItem((current) => {
        const next = { ...current };
        if (previous) next[boardItemId] = previous;
        else delete next[boardItemId];
        return next;
      });
      setStatus('error');
      return;
    }
    setStatus('saved');
  };

  const renderPinInteraction = (item: { id?: string | null }) => {
    if (typeof item.id !== 'string') return null;
    const itemId = item.id;
    const current = byItem[itemId];
    return (
      <PinReaction
        reaction={current}
        onVerdict={(verdict) => void send(itemId, verdict, current?.body ?? null)}
        onNote={(body) => {
          if (!current) return;
          void send(itemId, current.verdict, body);
        }}
      />
    );
  };

  return (
    <>
      <BoardComposition
        board={board}
        fit="contain"
        fullBleed
        showNotes
        interactive
        renderPinInteraction={renderPinInteraction}
        className="h-full"
      />
      <p aria-live="polite" className="sr-only">
        {status === 'saving'
          ? 'Sending your reaction'
          : status === 'saved'
            ? 'Your reaction reached the studio'
            : status === 'error'
              ? 'That reaction could not be sent. This link may have been turned off.'
              : ''}
      </p>
      {status === 'error' && (
        <p
          role="alert"
          className="type-body-small border-l-2 border-[var(--border-default)] px-3 py-2 text-[var(--text-primary)]"
        >
          That reaction could not be sent. This link may have been turned off or expired.
        </p>
      )}
    </>
  );
}

function PinReaction({
  reaction,
  onVerdict,
  onNote,
}: {
  reaction: GuestReaction | undefined;
  onVerdict: (verdict: GuestVerdict) => void;
  onNote: (body: string | null) => void;
}) {
  const [note, setNote] = useState(reaction?.body ?? '');

  return (
    <div className="flex w-[150px] flex-col gap-1 rounded-[5px] border border-[var(--border-default)] bg-[var(--bg-surface,#fff)] p-1">
      <div className="flex gap-1">
        <button
          type="button"
          aria-pressed={reaction?.verdict === 'approved'}
          onClick={() => onVerdict('approved')}
          className={`min-h-11 flex-1 rounded-[4px] border px-1 font-mono text-[9px] uppercase tracking-[0.04em] ${
            reaction?.verdict === 'approved'
              ? 'border-[var(--color-sage,#8a9a7b)] text-[var(--color-sage,#8a9a7b)]'
              : 'border-[var(--border-default)] text-[var(--text-muted)]'
          }`}
        >
          Approve
        </button>
        <button
          type="button"
          aria-pressed={reaction?.verdict === 'rejected'}
          onClick={() => onVerdict('rejected')}
          className={`min-h-11 flex-1 rounded-[4px] border px-1 font-mono text-[9px] uppercase tracking-[0.04em] ${
            reaction?.verdict === 'rejected'
              ? 'border-[var(--color-clay,#a66d4f)] text-[var(--color-clay,#a66d4f)]'
              : 'border-[var(--border-default)] text-[var(--text-muted)]'
          }`}
        >
          Pass
        </button>
      </div>
      {reaction && (
        <input
          type="text"
          value={note}
          maxLength={GUEST_NOTE_LIMIT}
          aria-label="Add a note for the studio"
          placeholder="Add a note"
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => {
            const trimmed = note.trim();
            if ((reaction.body ?? '') === trimmed) return;
            onNote(trimmed === '' ? null : trimmed);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          className="min-h-11 w-full rounded-[4px] border border-[var(--border-default)] px-2 text-[11px] text-[var(--text-primary)]"
        />
      )}
    </div>
  );
}
