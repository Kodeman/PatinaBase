'use client';

import { useId, useState } from 'react';
import type { ReactNode } from 'react';

import { ScoredAction } from '@/components/making/scored-action';
import { useMuteLetters, useWriteBack } from '@/hooks/use-project-correspondence';
import type { CorrespondenceLetter, NoticeReceipt } from '@/lib/threshold/correspondence';

import { isTruncated, oneLine } from './previously';

/* ── CORRESPONDENCE, PRINTED ────────────────────────────────────────────────
   The three places the house's post shows: a reply under the note, the record
   of the letters in Previously, and the one act that governs them on the mat.

   THE STUDIO'S HAND IS THE NOTE'S. A letter from the studio is a quotation, so
   it keeps its first person and the note's own display face; a letter the
   client wrote is her own words in plain type, and needs no quoting.

   ABSENCE IS SILENCE, one region at a time: with no thread there is nothing to
   write to and nothing to mute, and each of these renders nothing at all
   rather than an empty field or a disabled act. ──────────────────────────── */

const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });

const HEAD_CLASS =
  'font-mono text-[11px] font-normal uppercase leading-[1.5] tracking-[0.14em] text-[var(--text-muted)]';

const REFUSAL_CLASS = 'mt-2 text-[15px] leading-normal text-[var(--color-error)]';

// ── the reply ───────────────────────────────────────────────────────────────

export interface WriteBackProps {
  /** Null when this house has no thread: nothing to write to, so nothing shows. */
  threadId: string | null;
  today?: Date;
}

export function WriteBack({ threadId, today = new Date() }: WriteBackProps) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [sentOn, setSentOn] = useState<Date | null>(null);
  const [refused, setRefused] = useState(false);
  const writeBack = useWriteBack();
  const fieldId = useId();
  const bodyId = `${fieldId}-body`;

  if (!threadId) return null;

  const send = async () => {
    if (!body.trim()) return;
    setRefused(false);
    try {
      await writeBack.send({ threadId, body: body.trim() });
      setBody('');
      setOpen(false);
      setSentOn(today);
    } catch (reason) {
      // The page prints one fixed line — a server's own words are not this
      // surface's content — but the reason still has to reach somebody, so it
      // goes to the browser log where support can ask for it.
      console.error('write-back refused', reason);
      // The words the client wrote stay in the field: a refusal must not take
      // her letter with it.
      setRefused(true);
    }
  };

  return (
    <div data-testid="write-back" className="mt-4 max-w-[44ch]">
      <ScoredAction
        actionKey="note_write_back"
        regionKey="note"
        surfaceKey="the_threshold"
        variant="tertiary"
        aria-expanded={open}
        aria-controls={fieldId}
        onClick={() => setOpen((was) => !was)}
      >
        {open ? 'Put the pen down' : 'Write back'}
      </ScoredAction>

      <div id={fieldId}>
        {open && (
          <div className="mt-2 border-t border-dotted border-[var(--border-default)] pt-3">
            <label htmlFor={bodyId} className={`${HEAD_CLASS} block`}>
              Your reply
            </label>
            <textarea
              id={bodyId}
              data-testid="write-back-body"
              rows={4}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="mt-2 w-full resize-y border border-[var(--border-default)] bg-transparent p-2.5 text-[15px] leading-relaxed text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--threshold-accent,#8A5F19)]"
            />
            <div className="mt-2">
              <ScoredAction
                actionKey="note_send_reply"
                regionKey="note"
                surfaceKey="the_threshold"
                variant="secondary"
                disabled={body.trim().length === 0}
                loading={writeBack.isPending}
                loadingLabel="Sending"
                onClick={send}
              >
                Send it
              </ScoredAction>
            </div>
          </div>
        )}
      </div>

      {refused && (
        <p role="alert" data-testid="write-back-refused" className={REFUSAL_CLASS}>
          Your letter could not be sent just now.
        </p>
      )}

      {sentOn && !open && (
        <p
          data-testid="write-back-receipt"
          className="mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]"
        >
          {`Sent ${DAY_MONTH.format(sentOn)}`}
        </p>
      )}
    </div>
  );
}

// ── the record ──────────────────────────────────────────────────────────────

function Enclosures({ letter }: { letter: CorrespondenceLetter }) {
  if (letter.enclosures.length === 0) return null;
  return (
    <ul data-testid="letter-enclosures" className="mt-2 max-w-[44ch] list-none">
      {letter.enclosures.map((enclosure) => (
        <li
          key={enclosure.id}
          data-testid="letter-enclosure"
          className="border-t border-dotted border-[var(--border-default)] py-1.5 text-[15px] text-[var(--text-body)]"
        >
          {enclosure.name}
        </li>
      ))}
    </ul>
  );
}

function Notice({ notice }: { notice: NoticeReceipt }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  // A receipt folds when it has more to say than the line carries: a subject
  // too long for one line, or the body preview that tells two notices of the
  // same type apart. Where it does not, the line is the whole of it.
  const foldable = isTruncated(notice.label) || notice.detail !== null;

  const line = (
    <>
      <span
        data-testid="notice-date"
        className="min-w-[6.6em] shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]"
      >
        {notice.date ? DAY_MONTH.format(notice.date) : '—'}
      </span>
      <span className="font-heading text-[1.05rem]">{oneLine(notice.label)}</span>
      <span
        aria-hidden="true"
        className="relative top-[-0.28em] mx-2 min-w-[10px] flex-auto border-b border-dotted border-[var(--border-default)]"
      />
      <span
        data-testid="notice-state"
        className="shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-mocha)]"
      >
        Sent
      </span>
    </>
  );

  return (
    <li
      key={notice.id}
      data-testid="notice"
      className="border-t border-[var(--border-default)]"
    >
      {foldable ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((was) => !was)}
          className="flex min-h-[44px] w-full items-baseline gap-3 py-3 text-left"
        >
          {line}
        </button>
      ) : notice.anchor ? (
        <a
          href={notice.anchor}
          data-testid="notice-anchor"
          className="flex min-h-[44px] w-full items-baseline gap-3 py-3 text-inherit no-underline"
        >
          {line}
        </a>
      ) : (
        <p className="flex min-h-[44px] w-full items-baseline gap-3 py-3">{line}</p>
      )}
      {foldable && (
        <div id={bodyId}>
          {open && (
          <div data-testid="notice-body" className="max-w-[56ch] pb-4">
            {isTruncated(notice.label) && (
              <p className="text-[15px] leading-relaxed text-[var(--text-body)]">
                {notice.label}
              </p>
            )}
            {notice.detail && (
              <p
                data-testid="notice-detail"
                className="mt-1 text-[15px] leading-relaxed text-[var(--text-body)]"
              >
                {notice.detail}
              </p>
            )}
            {notice.anchor && (
              <a
                href={notice.anchor}
                data-testid="notice-anchor"
                className="mt-1 inline-block text-[15px] text-[var(--text-body)] no-underline hover:underline"
              >
                Read it here
              </a>
            )}
          </div>
          )}
        </div>
      )}
    </li>
  );
}

export interface LettersProps {
  letters: CorrespondenceLetter[];
  notices: NoticeReceipt[];
  /** The reply, when there is no standing note for it to sit under. */
  reply?: ReactNode;
  hasEarlier?: boolean;
  onEarlier?: () => void;
  earlierPending?: boolean;
}

export function Letters({
  letters,
  notices,
  reply,
  hasEarlier = false,
  onEarlier,
  earlierPending = false,
}: LettersProps) {
  if (letters.length === 0 && notices.length === 0 && !reply) return null;

  return (
    <div data-testid="previously-correspondence" className="mt-6">
      {reply}

      {letters.length > 0 && (
        <>
          <h3 className={HEAD_CLASS}>The letters</h3>
          <ul className="mt-2 list-none">
            {letters.map((letter) => (
              <li
                key={letter.id}
                data-testid="letter"
                data-letter-from={letter.from}
                className="border-t border-dotted border-[var(--border-default)] py-3"
              >
                <p
                  data-testid="letter-dateline"
                  className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]"
                >
                  {[
                    letter.sentAt ? DAY_MONTH.format(letter.sentAt) : null,
                    letter.from === 'you' ? 'you' : letter.authorName ?? 'the studio',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p
                  data-testid="letter-body"
                  className={
                    letter.from === 'studio'
                      ? 'mt-1 max-w-[44ch] whitespace-pre-line font-heading text-[1.05rem] leading-relaxed'
                      : 'mt-1 max-w-[44ch] whitespace-pre-line text-[15px] leading-relaxed text-[var(--text-body)]'
                  }
                >
                  {letter.body}
                </p>
                <Enclosures letter={letter} />
              </li>
            ))}
          </ul>

          {/* A record that stops without saying so is worse than one that
              says where it stops: the act is the rest of the correspondence. */}
          {hasEarlier && onEarlier && (
            <div className="mt-2">
              <ScoredAction
                actionKey="previously_earlier_letters"
                regionKey="previously"
                surfaceKey="the_threshold"
                variant="tertiary"
                loading={earlierPending}
                loadingLabel="Reading"
                onClick={onEarlier}
              >
                Further back
              </ScoredAction>
            </div>
          )}
        </>
      )}

      {notices.length > 0 && (
        <>
          <h3 className={`${HEAD_CLASS} mt-5`}>What the house sent</h3>
          <ul className="mt-2 list-none">
            {notices.map((notice) => (
              <Notice key={notice.id} notice={notice} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ── the act that governs them ───────────────────────────────────────────────

export interface MuteLettersProps {
  threadId: string | null;
  muted: boolean;
}

export function MuteLetters({ threadId, muted }: MuteLettersProps) {
  const mute = useMuteLetters();
  const [refused, setRefused] = useState(false);

  if (!threadId) return null;

  const toggle = () => {
    setRefused(false);
    void mute.toggle({ threadId, muted: !muted }).catch((reason) => {
      console.error('mute refused', reason);
      setRefused(true);
    });
  };

  return (
    <div>
      <ScoredAction
        actionKey="mat_mute_letters"
        regionKey="mat"
        surfaceKey="the_threshold"
        variant="tertiary"
        loading={mute.isPending}
        onClick={toggle}
      >
        {muted ? 'Send the letter notices again' : 'Hold the letter notices'}
      </ScoredAction>
      {refused && (
        <p role="alert" data-testid="mute-refused" className={REFUSAL_CLASS}>
          The letter notices could not be changed just now.
        </p>
      )}
    </div>
  );
}
