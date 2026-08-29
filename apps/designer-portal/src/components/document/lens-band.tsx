'use client';

/**
 * The lens band — the one line the paper keeps (C-5).
 *
 * Two lines in a declared 56px box: line one is the job's identity, its stage
 * and one right-flush fact; line two is the sentence that changes (L-1) — the
 * worst standing exception with its act, or the stage's guide sentence when
 * nothing stands. Both lines are single lines by construction (`nowrap` +
 * ellipsis), which is the whole of the height contract.
 *
 * It publishes nothing: no `ResizeObserver`, no CSS variable, no measured
 * height. `--doc-band-height` is a declared constant (D-1), and a name that no
 * longer exists cannot acquire a second writer.
 *
 * `#doc-ticket-sentinel` is rendered here as the band's IMMEDIATE previous
 * sibling: it leaves the viewport exactly when the band would begin to stick.
 */

import { useEffect, useRef, useState } from 'react';
import type {
  LensBandModel,
  LensBandLine2,
  LensReadingStop,
} from '@/lib/document/lens-band-derivation';
import { DocumentAction } from './document-action';
import { StandingSheet } from './standing-sheet';

/** OD-3 — one distinct stop announces at most once in this window. */
const LENS_ANNOUNCE_DEDUPE_MS = 2000;

/** L-1 — the outgoing sentence fades in 90ms; the incoming one in 150ms. */
const LENS_TURN_OUT_MS = 90;

/** Both lines, at every width. The ellipsis is the last resort, after the
 *  derivation's truncation order has been walked. */
const LINE_CLIP = 'overflow-hidden text-ellipsis whitespace-nowrap';

const sameWords = (a: LensBandLine2, b: LensBandLine2) =>
  a.sentence === b.sentence &&
  a.act?.label === b.act?.label &&
  a.standingCount === b.standingCount &&
  a.kind === b.kind;

export function LensBand({
  model,
  open = true,
  readingStop = null,
  docId,
  onToTop,
}: {
  model: LensBandModel;
  /** The letterhead is in frame — the band sits in flow at s0 and line 1
   *  yields everything the letterhead already prints. L2/W4 drive it. */
  open?: boolean;
  readingStop?: LensReadingStop | null;
  docId: string;
  /** H4 — the one reversing act, on the household. */
  onToTop?: () => void;
}) {
  const { line1 } = model;
  const [printed, setPrinted] = useState<LensBandLine2>(model.line2);
  const [turning, setTurning] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (model.line2 === printed) return;
    // Same words, new handler identities: adopt without turning the line.
    if (sameWords(model.line2, printed)) {
      setPrinted(model.line2);
      return;
    }
    setTurning(true);
    const id = window.setTimeout(() => {
      setPrinted(model.line2);
      setTurning(false);
    }, LENS_TURN_OUT_MS);
    return () => window.clearTimeout(id);
  }, [model.line2, printed]);

  const [announcement, setAnnouncement] = useState('');
  const lastAnnouncedKey = useRef<string | null>(null);
  const lastAnnouncedAt = useRef(0);
  const stopKey = readingStop?.key ?? null;
  const stopLine = model.announcement;

  useEffect(() => {
    if (!stopKey || !stopLine) return;
    const now = Date.now();
    if (
      lastAnnouncedKey.current === stopKey &&
      now - lastAnnouncedAt.current < LENS_ANNOUNCE_DEDUPE_MS
    ) {
      return;
    }
    lastAnnouncedKey.current = stopKey;
    lastAnnouncedAt.current = now;
    setAnnouncement(stopLine);
  }, [stopKey, stopLine]);

  const standing = printed.kind === 'standing';
  const withheld = printed.standingCount - 1;
  const moreId = `lens-band-more-${docId}`;

  return (
    <>
      {/* The pin's one bit of input, in flow directly above the sticky band. */}
      <div id="doc-ticket-sentinel" data-doc-ticket-sentinel aria-hidden />
      <section
        aria-label="The job"
        data-lens-band=""
        data-lens-open={open ? 'true' : 'false'}
        data-lens-state={open ? 'rest' : 'reading'}
        className="doc-rule-mid sticky top-0 z-[4] box-border flex h-[var(--doc-band-height,56px)] flex-col justify-center gap-[2px] bg-[var(--doc-paper)]"
      >
        <p
          data-lens-line="1"
          className={`flex items-baseline justify-between gap-4 font-mono text-[11px] uppercase leading-[1.4] tracking-[0.08em] text-[var(--text-muted)] ${LINE_CLIP}`}
        >
          {/* At s0 the letterhead 60px above prints the household at 40px, the
              stage as its arc and the date in its vitals, so both yield; the
              letterhead prints no money, so money keeps its printing. */}
          <span className={`min-w-0 ${LINE_CLIP}`} data-lens-identity>
            {open ? null : (
              <>
                {onToTop ? (
                  <button
                    type="button"
                    onClick={onToTop}
                    data-lens-to-top
                    className="inline p-0 text-left uppercase tracking-[0.08em] text-[var(--text-muted)] underline-offset-[3px] transition-colors hover:text-[var(--text-primary)] hover:underline"
                  >
                    {line1.identity}
                  </button>
                ) : (
                  line1.identity
                )}
                {line1.stage ? ` · ${line1.stage}` : null}
              </>
            )}
          </span>
          <span className="shrink-0 whitespace-nowrap" data-lens-right-flush>
            {open ? line1.moneyOnly : line1.rightFlush}
          </span>
        </p>

        <p
          data-lens-line="2"
          data-lens-line2-kind={printed.kind}
          aria-live="polite"
          aria-atomic="true"
          className={`flex items-center gap-2 text-[15px] leading-[1.3] ${LINE_CLIP} ${
            standing
              ? 'text-[var(--color-terracotta-ink)]'
              : 'text-[var(--text-primary)]'
          }`}
        >
          <span
            data-lens-sentence
            className={`min-w-0 ease-[var(--ease-editorial)] transition-opacity motion-reduce:transition-none ${LINE_CLIP} ${
              turning
                ? 'opacity-0 duration-[90ms]'
                : 'opacity-100 duration-[150ms]'
            }`}
          >
            {printed.sentence}
          </span>
          {printed.act && (
            <DocumentAction
              actionKey={`lens-band-${printed.kind}`}
              surfaceKey="open-document"
              regionKey="lens-band"
              variant="primary"
              // The 44px target the Scored Ink owns must not grow the declared
              // 56px box, so the control is inset into the 19.5px line.
              className="my-[-12px] shrink-0"
              onClick={printed.act.onAct}
            >
              {printed.act.label}
            </DocumentAction>
          )}
          {withheld > 0 && (
            <button
              ref={moreRef}
              id={moreId}
              type="button"
              data-lens-more
              onClick={() => setSheetOpen(true)}
              className="shrink-0 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-terracotta-ink)] underline underline-offset-[3px]"
            >
              +{withheld} MORE
            </button>
          )}
          {/* OD-7 / D-B2 — the L-9 stop announcement rides inside the one live
              region the document has, so a stop change with no sentence change
              is not silent. Nothing here is visible. */}
          <span className="sr-only" data-lens-announce>
            {announcement}
          </span>
        </p>
      </section>
      <StandingSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        items={model.standing}
        triggerRef={moreRef}
      />
    </>
  );
}
