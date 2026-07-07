'use client';

/**
 * Note detail (R7.5) — the note plus its captured context, a status timeline,
 * and the thread (replies + reactions). Triage lives here: the status controls
 * render only for a super_admin (Kody) — that admin gate is the whole answer to
 * "where does Kody triage" (the Ledger, admin-only). The author gets react +
 * reopen on a shipped note, and everyone on the thread can reply. The RPCs
 * enforce the same rules server-side, so the gate is UI, not the security line.
 */

import { useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import {
  useFeedbackNote,
  useSignedScreenshotUrl,
  useSetFeedbackStatus,
  useReplyToFeedback,
  useReactToFeedback,
  useIsSuperAdmin,
  type Feedback,
  type FeedbackEvent,
  type FeedbackStatus,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { bucketMeta, statusMeta, weightDots, buildTimeline } from '@/lib/document/feedback';

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function FeedbackDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, isLoading } = useFeedbackNote(id);
  const { user } = useAuth();
  const { isSuperAdmin } = useIsSuperAdmin();
  const setStatus = useSetFeedbackStatus();
  const reply = useReplyToFeedback();
  const react = useReactToFeedback();

  const note = data?.note;
  const events = useMemo(() => data?.events ?? [], [data]);
  const { data: shotUrl } = useSignedScreenshotUrl(note?.screenshot_path);

  const [replyText, setReplyText] = useState('');

  const isAuthor = !!user?.id && note?.created_by === user.id;
  const timeline = useMemo(
    () => (note ? buildTimeline(note.created_at, note.status, events) : []),
    [note, events],
  );

  if (isLoading || !note) {
    return (
      <div className="mx-auto max-w-2xl">
        <BackBar onBack={onBack} />
        <p className="py-8 text-center text-[13px] text-[rgba(250,247,242,0.5)]">Loading…</p>
      </div>
    );
  }

  const bm = bucketMeta(note.bucket);
  const sm = statusMeta(note.status);
  const dots = weightDots(note.weight);

  return (
    <div className="mx-auto max-w-2xl">
      <BackBar onBack={onBack} />

      <div className="mt-2 flex items-center gap-2">
        <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: bm.colorVar }} />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: bm.colorVar }}>
          {bm.label}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[rgba(250,247,242,0.4)]">·</span>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: sm.colorVar }}>
          {sm.label}
        </span>
        {dots > 0 && (
          <span className="ml-auto flex items-center gap-1" aria-label={`weight ${note.weight}`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: i < dots ? 'var(--color-golden-hour)' : 'rgba(250,247,242,0.2)' }} />
            ))}
          </span>
        )}
      </div>

      <p className="mt-3 text-[15px] leading-relaxed text-[var(--color-pearl)]">
        {note.note ? `“${note.note}”` : <span className="text-[rgba(250,247,242,0.4)]">(bucket only — no note)</span>}
      </p>

      {/* Captured context (R7.5.2). */}
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-y border-dashed border-[rgba(250,247,242,0.16)] py-3 font-mono text-[11px] text-[rgba(250,247,242,0.65)]">
        <ContextCell label="Screen" value={note.screen_name} />
        <ContextCell label="Route" value={note.route} />
        <ContextCell label="Version" value={note.app_version} />
        <ContextCell label="Viewport" value={note.viewport} />
      </dl>

      {shotUrl && (
        <a href={shotUrl} target="_blank" rel="noopener noreferrer" className="mt-3 block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shotUrl} alt="Screen at capture" className="max-h-40 w-auto rounded-md border border-[rgba(250,247,242,0.16)]" />
        </a>
      )}

      {/* Timeline (R7.5.3). */}
      <div className="mt-4 flex flex-col gap-2">
        {timeline.map((t, i) => (
          <div key={i} className="flex items-center gap-2 text-[13px] text-[rgba(250,247,242,0.7)]">
            {/* "now" reads via color + a hairline ring (no shadow — D4). */}
            <span
              className={t.now ? 'h-2.5 w-2.5 rounded-full border' : 'h-2 w-2 rounded-full'}
              style={{
                background: t.now ? 'var(--color-golden-hour)' : 'var(--color-sage)',
                borderColor: t.now ? 'var(--color-pearl)' : undefined,
              }}
            />
            {t.label}
            <span className="ml-auto font-mono text-[10px] text-[rgba(250,247,242,0.4)]">{fmtWhen(t.when)}</span>
          </div>
        ))}
      </div>

      <Thread events={events} />

      <TriageActions
        note={note}
        isAdmin={isSuperAdmin}
        isAuthor={isAuthor}
        pending={setStatus.isPending}
        onSetStatus={(status, text) => setStatus.mutate({ id: note.id, status, note: text })}
        onReact={(emoji) => react.mutate({ id: note.id, emoji })}
      />

      {/* Reply — author + admin can add to the thread. */}
      <div className="mt-4 flex items-center gap-2">
        <input
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="Reply…"
          className="flex-1 rounded-md border border-[rgba(250,247,242,0.16)] bg-[rgba(250,247,242,0.04)] px-2.5 py-1.5 text-[13px] text-[var(--color-pearl)] placeholder:text-[rgba(250,247,242,0.35)] focus:border-[var(--color-clay)] focus:outline-none"
        />
        <button
          type="button"
          disabled={!replyText.trim() || reply.isPending}
          onClick={() => { reply.mutate({ id: note.id, text: replyText.trim() }); setReplyText(''); }}
          className="rounded-md border border-[rgba(250,247,242,0.16)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[rgba(250,247,242,0.65)] disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}

/** The transition control set. Admin: any move (Shipped carries a "what
 *  changed" note). Author on a shipped note: react + reopen. */
function TriageActions({
  note,
  isAdmin,
  isAuthor,
  pending,
  onSetStatus,
  onReact,
}: {
  note: Feedback;
  isAdmin: boolean;
  isAuthor: boolean;
  pending: boolean;
  onSetStatus: (status: FeedbackStatus, note?: string) => void;
  onReact: (emoji: string) => void;
}) {
  const [shipOpen, setShipOpen] = useState(false);
  const [shipNote, setShipNote] = useState('');

  if (isAdmin) {
    const next: FeedbackStatus[] = (['noted', 'building', 'shipped', 'archived'] as FeedbackStatus[]).filter(
      (s) => s !== note.status,
    );
    return (
      <div className="mt-4 border-t border-[rgba(250,247,242,0.12)] pt-3">
        <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[rgba(250,247,242,0.4)]">Set status</p>
        <div className="flex flex-wrap items-center gap-2">
          {next.map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => (s === 'shipped' ? setShipOpen(true) : onSetStatus(s))}
              className="rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-40"
              style={{ borderColor: statusMeta(s).colorVar, color: statusMeta(s).colorVar }}
            >
              {statusMeta(s).label}
            </button>
          ))}
        </div>
        {shipOpen && (
          <div className="mt-2 flex flex-col gap-2">
            <input
              value={shipNote}
              onChange={(e) => setShipNote(e.target.value)}
              placeholder="What changed? (shown on her shipped card)"
              className="w-full rounded-md border border-[rgba(250,247,242,0.16)] bg-[rgba(250,247,242,0.04)] px-2.5 py-1.5 text-[13px] text-[var(--color-pearl)] placeholder:text-[rgba(250,247,242,0.35)] focus:border-[var(--color-clay)] focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => { onSetStatus('shipped', shipNote.trim() || undefined); setShipOpen(false); }}
                className="rounded-md bg-[var(--color-sage)] px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)] disabled:opacity-50"
              >
                Mark shipped
              </button>
              <button type="button" onClick={() => setShipOpen(false)} className="font-mono text-[10px] uppercase tracking-[0.08em] text-[rgba(250,247,242,0.5)]">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Author on a shipped note: react + reopen (the same acts the loop card offers).
  if (isAuthor && note.status === 'shipped') {
    return (
      <div className="mt-4 flex items-center gap-2 border-t border-[rgba(250,247,242,0.12)] pt-3">
        <button type="button" onClick={() => onReact('👍')} className="rounded-full border border-[color-mix(in_srgb,var(--color-sage)_40%,transparent)] px-2.5 py-1 font-mono text-[11px] text-[var(--color-sage)]">
          👍 Nailed it
        </button>
        <button type="button" onClick={() => onReact('🎉')} className="rounded-full border border-[rgba(250,247,242,0.16)] px-2.5 py-1 font-mono text-[11px] text-[rgba(250,247,242,0.6)]">
          🎉
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onSetStatus('building', 'Reopened from the note detail.')}
          className="ml-auto font-mono text-[11px] text-[rgba(250,247,242,0.5)] hover:text-[var(--color-pearl)] disabled:opacity-40"
        >
          Not quite →
        </button>
      </div>
    );
  }

  return null;
}

function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="-ml-1 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[rgba(250,247,242,0.5)] hover:text-[var(--color-pearl)]"
    >
      <ChevronLeft className="h-3.5 w-3.5" /> Feedback
    </button>
  );
}

function ContextCell({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-[0.08em] text-[rgba(250,247,242,0.4)]">{label}</dt>
      <dd className="mt-0.5 truncate text-[var(--color-pearl)]">{value ?? '—'}</dd>
    </div>
  );
}

function Thread({ events }: { events: FeedbackEvent[] }) {
  const thread = events.filter((e) => e.kind === 'reply' || e.kind === 'reaction');
  if (!thread.length) return null;
  return (
    <div className="mt-4 flex flex-col gap-2">
      {thread.map((e) => (
        <div key={e.id} className="rounded-lg bg-[rgba(250,247,242,0.05)] px-3 py-2 text-[13px] text-[rgba(250,247,242,0.75)]">
          {e.kind === 'reaction'
            ? <span className="text-[16px]">{String(e.payload?.emoji ?? '👍')}</span>
            : String(e.payload?.text ?? '')}
        </div>
      ))}
    </div>
  );
}
