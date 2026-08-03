'use client';

/**
 * Per-line client verdict controls (Schedule & Boards Wave 2 · C3).
 *
 * Quiet acts on a single proposal line — Approve ✓ / Flag ✗ / Note — plus a
 * verdict chip and a short thread. A verdict NEVER mutates the line; it is the
 * lightweight loop (Decisions stay the consequential instrument). Errors surface
 * INLINE (R83) — no toasts on the client document.
 */

import { useState } from 'react';
import {
  useSubmitVerdict,
  useItemFeedbackThread,
  useReplyToItemFeedback,
  type ItemFeedback,
  type Verdict,
} from '@patina/supabase';

const CHIP: Record<Verdict, { label: string; color: string; bg: string }> = {
  approved: { label: 'Approved', color: '#3f6f4e', bg: 'rgba(63,111,78,0.10)' },
  rejected: { label: 'Flagged', color: '#a5552f', bg: 'rgba(165,85,47,0.10)' },
  comment: { label: 'Noted', color: 'var(--text-muted, #8a8378)', bg: 'rgba(120,116,108,0.10)' },
};

function VerdictChip({ verdict, resolved }: { verdict: Verdict; resolved?: boolean }) {
  const c = CHIP[verdict];
  return (
    <span
      className="type-meta-small inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5"
      style={{ color: c.color, background: c.bg, letterSpacing: '0.04em' }}
    >
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
      {c.label}
      {verdict === 'rejected' && resolved ? ' · cleared' : ''}
    </span>
  );
}

const ACT_BTN =
  'type-meta-small rounded-[3px] border border-[var(--border-subtle)] px-2 py-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] disabled:opacity-40';

export function LineFeedback({
  proposalId,
  itemId,
  boardItemId,
  feedback,
  variant = 'inline',
}: {
  proposalId: string;
  /** Anchor: pass EXACTLY ONE of itemId (a schedule line) or boardItemId (a
   *  board pin, B4). The chip/act/thread UI is otherwise anchor-agnostic. */
  itemId?: string;
  boardItemId?: string;
  /** This anchor's verdicts (the client's own), ascending by created_at. */
  feedback: ItemFeedback[];
  /** Compact canvas treatment; the mutation and validation contract is shared. */
  variant?: 'inline' | 'pin';
}) {
  const submit = useSubmitVerdict();
  const [composing, setComposing] = useState<null | 'rejected' | 'comment'>(null);
  const [draft, setDraft] = useState('');
  const [threadOpen, setThreadOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latest = feedback.length > 0 ? feedback[feedback.length - 1] : null;

  const act = async (verdict: Verdict, body?: string) => {
    setError(null);
    try {
      await submit.mutateAsync(
        boardItemId
          ? { proposalId, boardItemId, verdict, body: body ?? null }
          : { proposalId, proposalItemId: itemId, verdict, body: body ?? null },
      );
      setComposing(null);
      setDraft('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save — try again.');
    }
  };

  const anchorLabel = boardItemId ? 'pin' : 'line';

  return (
    <div
      className={
        variant === 'pin'
          ? 'max-w-[230px] rounded-[3px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 p-1.5 shadow-md backdrop-blur-sm'
          : 'mt-1.5'
      }
      data-feedback-variant={variant}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {latest && <VerdictChip verdict={latest.verdict} resolved={!!latest.resolved_at} />}
        <button
          type="button"
          className={ACT_BTN}
          disabled={submit.isPending}
          onClick={() => act('approved')}
          aria-label={`Approve this ${anchorLabel}`}
        >
          ✓ Approve
        </button>
        <button
          type="button"
          className={ACT_BTN}
          disabled={submit.isPending}
          onClick={() => { setComposing(composing === 'rejected' ? null : 'rejected'); setError(null); }}
        >
          ✗ Flag
        </button>
        <button
          type="button"
          className={ACT_BTN}
          disabled={submit.isPending}
          onClick={() => { setComposing(composing === 'comment' ? null : 'comment'); setError(null); }}
        >
          ✎ Note
        </button>
        {latest && (
          <button
            type="button"
            className="type-meta-small ml-auto text-[var(--text-muted)] underline-offset-2 hover:underline"
            onClick={() => setThreadOpen((v) => !v)}
          >
            {threadOpen ? 'Hide thread' : 'Discuss'}
          </button>
        )}
      </div>

      {composing && (
        <div className="mt-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            autoFocus
            placeholder={composing === 'rejected' ? 'What should change? (optional)' : 'Add a note…'}
            className="type-body-small w-full resize-none rounded-[3px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
          />
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              className={ACT_BTN}
              disabled={submit.isPending || (composing === 'comment' && draft.trim().length === 0)}
              onClick={() => act(composing, draft.trim() || undefined)}
            >
              {composing === 'rejected' ? 'Flag this line' : 'Add note'}
            </button>
            <button type="button" className="type-meta-small text-[var(--text-muted)]" onClick={() => { setComposing(null); setDraft(''); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="type-meta-small mt-1 text-[#a5552f]">{error}</p>}

      {threadOpen && latest && (
        <LineThread feedbackId={latest.id} proposalId={proposalId} body={latest.body} />
      )}
    </div>
  );
}

function LineThread({
  feedbackId,
  proposalId,
  body,
}: {
  feedbackId: string;
  proposalId: string;
  body: string | null;
}) {
  const { data: events } = useItemFeedbackThread(feedbackId);
  const reply = useReplyToItemFeedback();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setError(null);
    try {
      await reply.mutateAsync({ feedbackId, body: text, proposalId });
      setDraft('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send — try again.');
    }
  };

  return (
    <div className="mt-2 border-l-2 border-[var(--border-subtle)] pl-3">
      {body && <p className="type-meta-small text-[var(--text-muted)]">“{body}”</p>}
      <ul className="mt-1 space-y-1">
        {(events ?? [])
          .filter((e) => e.kind === 'replied' || e.kind === 'resolved' || e.kind === 'reopened')
          .map((e) => (
            <li key={e.id} className="type-meta-small text-[var(--text-body)]">
              {e.kind === 'resolved' ? '✓ Resolved by the studio' : e.kind === 'reopened' ? '↺ Reopened' : e.body}
            </li>
          ))}
      </ul>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Reply…"
          className="type-body-small flex-1 rounded-[3px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void send(); } }}
        />
        <button type="button" className={ACT_BTN} disabled={reply.isPending || draft.trim().length === 0} onClick={() => void send()}>
          Send
        </button>
      </div>
      {error && <p className="type-meta-small mt-1 text-[#a5552f]">{error}</p>}
    </div>
  );
}
