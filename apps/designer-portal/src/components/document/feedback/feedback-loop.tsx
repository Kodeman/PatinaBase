'use client';

/**
 * Close the loop (R7.6) — when a note ships, the author sees a card that quotes
 * her original note and states what changed, with a quick reaction and a "not
 * quite" that reopens the item (shipped → building). Rendered at the top of the
 * Ledger for her own shipped-and-unseen notes; the capture-button badge is the
 * ambient entry that brings her here.
 */

import { useState } from 'react';
import {
  useReactToFeedback,
  useSetFeedbackStatus,
  type Feedback,
} from '@patina/supabase';

export function ShippedCard({ note }: { note: Feedback }) {
  const react = useReactToFeedback();
  const reopen = useSetFeedbackStatus();
  const [reacted, setReacted] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);

  function sendReaction(emoji: string) {
    setReacted(emoji);
    react.mutate({ id: note.id, emoji });
  }

  return (
    <div className="rounded-xl border border-[color-mix(in_srgb,var(--color-sage)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-sage)_10%,transparent)] p-4">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-sage)]">
        ✓ Shipped · from your note
      </p>
      {note.note && (
        <p className="mt-2 border-l-2 border-[rgba(250,247,242,0.2)] pl-3 text-[13px] italic leading-snug text-[rgba(250,247,242,0.6)]">
          “{note.note}”
        </p>
      )}
      <p className="mt-2 font-heading text-[15px] leading-snug text-[var(--color-pearl)]">
        {note.resolution ?? 'This shipped.'}
      </p>
      <div className="mt-3 flex items-center gap-2">
        {reopening ? (
          <ReopenBox
            pending={reopen.isPending}
            onCancel={() => setReopening(false)}
            onSubmit={(comment) => reopen.mutate({ id: note.id, status: 'building', note: comment })}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => sendReaction('👍')}
              disabled={!!reacted}
              className="rounded-full border border-[color-mix(in_srgb,var(--color-sage)_40%,transparent)] px-2.5 py-1 font-mono text-[11px] text-[var(--color-sage)] disabled:opacity-50"
            >
              👍 {reacted === '👍' ? 'thanks!' : 'Nailed it'}
            </button>
            <button
              type="button"
              onClick={() => sendReaction('🎉')}
              disabled={!!reacted}
              className="rounded-full border border-[rgba(250,247,242,0.16)] px-2.5 py-1 font-mono text-[11px] text-[rgba(250,247,242,0.6)] disabled:opacity-50"
            >
              🎉
            </button>
            <button
              type="button"
              onClick={() => setReopening(true)}
              className="ml-auto font-mono text-[11px] text-[rgba(250,247,242,0.5)] hover:text-[var(--color-pearl)]"
            >
              Not quite →
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ReopenBox({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  onCancel: () => void;
  onSubmit: (comment: string) => void;
}) {
  const [comment, setComment] = useState('');
  return (
    <div className="flex w-full flex-col gap-2">
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="What’s still off?"
        className="w-full rounded-md border border-[rgba(250,247,242,0.16)] bg-[rgba(250,247,242,0.04)] px-2.5 py-1.5 text-[13px] text-[var(--color-pearl)] placeholder:text-[rgba(250,247,242,0.35)] focus:border-[var(--color-clay)] focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => onSubmit(comment.trim())}
          className="rounded-md bg-[var(--color-clay)] px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)] disabled:opacity-50"
        >
          {pending ? 'Reopening…' : 'Reopen'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="font-mono text-[10px] uppercase tracking-[0.08em] text-[rgba(250,247,242,0.5)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
