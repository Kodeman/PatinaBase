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
 * sibling and observed here (§4, C-5): it leaves the viewport exactly when the
 * band begins to stick, which is the one bit of input the pin needs. The
 * letterhead's own frame answers a different question (the rail head's L-6
 * yield) with a different geometry, and is not a substitute for this one.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LENS_ANNOUNCE_DEDUPE_MS,
  LENS_TURN_OUT_MS,
} from '@/lib/document/lens-constants';
import type {
  LensBandModel,
  LensBandLine2,
  LensReadingStop,
} from '@/lib/document/lens-band-derivation';
import { DocumentAction } from './document-action';
import { StandingSheet } from './standing-sheet';

/** Both lines, at every width — the backstop only, after the derivation has
 *  chosen the form that fits (D-B24). */
const LINE_CLIP = 'overflow-hidden text-ellipsis whitespace-nowrap';

/**
 * The same STANDING ITEM, whatever form it is printed in.
 *
 * Compared on the LONG form (N-03): the tier arrives one frame after
 * hydration, so at 390 the model's first correction swaps `long` for `short`
 * — the same fact, different words. Comparing the PRINTED sentence would read
 * that as news and turn the line, blanking the phone's one sentence for 90ms
 * on every single load.
 */
const sameItem = (a: LensBandLine2, b: LensBandLine2) =>
  a.long.sentence === b.long.sentence &&
  a.long.act?.label === b.long.act?.label &&
  a.withheld === b.withheld &&
  a.kind === b.kind;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function LensBand({
  model,
  readingStop = null,
  docId,
  onToTop,
  onPinChange,
  onActed,
  onStandingOpened,
}: {
  model: LensBandModel;
  readingStop?: LensReadingStop | null;
  docId: string;
  /** H4 — the one reversing act, on the household. */
  onToTop?: () => void;
  /** D-B19 — the page carries the pin up to the shell's `data-lens-state`. */
  onPinChange?: (pinned: boolean) => void;
  /** D-B22 — telemetry fires from the page; the band never captures. */
  onActed?: () => void;
  onStandingOpened?: () => void;
}) {
  const { line1 } = model;
  const [printed, setPrinted] = useState<LensBandLine2>(model.line2);
  const [turning, setTurning] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const bandRef = useRef<HTMLElement | null>(null);
  const actRef = useRef<HTMLButtonElement | HTMLAnchorElement | null>(null);

  // C-12 — OD-6 names the `+N MORE` button as BOTH the sheet's trigger and its
  // fallback, so when the door unmounts while the sheet stands open (an act
  // inside it resolves a need and the standing set drops to one) the two point
  // at the same dead node and focus falls to `<body>` — the drop the fallback
  // exists to prevent. The fallback is a chain instead, resolved at close time
  // because `DocSheet` reads `.current` in its cleanup, not at open: the door
  // if it is still standing, else the act line 2 is printing, else the band.
  const fallbackFocusRef = useMemo(
    () => ({
      get current(): HTMLElement | null {
        const door = moreRef.current;
        if (door?.isConnected) return door;
        const act = actRef.current;
        if (act?.isConnected) return act;
        return bandRef.current;
      },
    }),
    [],
  );

  // The sentinel is in frame until it is scrolled past: the band is in flow at
  // s0, so it opens by default and on any engine without the observer.
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setOpen(entry.isIntersecting);
      },
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    onPinChange?.(!open);
  }, [onPinChange, open]);

  // N-03 — the first model this band ever holds is not a turn: nothing was
  // printed before it, and at 390 the pre-hydration model is the wide tier's,
  // corrected one frame later. A turn there is a 90ms blank on every load.
  const hasPrinted = useRef(false);
  useEffect(() => {
    if (model.line2 === printed) {
      hasPrinted.current = true;
      return;
    }
    // Same item — new handler identities, or the tier settling under it.
    // Adopt in place, with no turn.
    if (!hasPrinted.current || sameItem(model.line2, printed)) {
      hasPrinted.current = true;
      setPrinted(model.line2);
      return;
    }
    // L-1 reduced-motion form: the new sentence is printed instantly in place.
    // A 90ms hold at opacity 0 is a blank line, not a shorter crossfade.
    if (prefersReducedMotion()) {
      setPrinted(model.line2);
      setTurning(false);
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

  // C-11 — line 2 is `aria-atomic`, so every later change to it re-reads the
  // WHOLE region. Left in place, the stop line is re-announced by a sentence
  // turn, a new act label or a changed `+N MORE` count — a stop the reader
  // arrived at minutes ago, read out again. Cleared the moment the printed
  // line turns; declared before the write below so a commit that changes both
  // still announces. The write-side dedupe (OD-7) is untouched.
  //
  // Keyed on the WORDS, not on `printed`: the page rebuilds the model object
  // on every settling read, and keying on identity would wipe the stop line
  // the announce effect had just written, one commit later.
  const printedWords = `${printed.kind}|${printed.sentence}|${printed.act?.label ?? ''}|${printed.standingCount}`;
  useEffect(() => {
    setAnnouncement('');
  }, [printedWords]);

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
  const withheld = printed.withheld;
  const moreId = `lens-band-more-${docId}`;

  return (
    <>
      {/* The pin's one bit of input, in flow directly above the sticky band. */}
      <div
        ref={sentinelRef}
        id="doc-ticket-sentinel"
        data-doc-ticket-sentinel
        aria-hidden
      />
      <section
        ref={bandRef}
        aria-label="The job"
        // C-12 — the last rung of the focus chain. Programmatic only: it never
        // enters the tab order.
        tabIndex={-1}
        data-lens-band=""
        data-lens-open={open ? 'true' : 'false'}
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

        {/* The clip lives on the SENTENCE, never on this flex line: the act's
            44px control is inset by -12px into the 19.5px line, so an
            `overflow: hidden` here would cut 12px off its box for painting and
            for hit-testing — and at 390 line 2 is that act's only printing. */}
        <p
          data-lens-line="2"
          data-lens-line2-kind={printed.kind}
          data-lens-line2-form={printed.form}
          aria-live="polite"
          aria-atomic="true"
          className={`flex items-center gap-2 whitespace-nowrap text-[15px] leading-[1.3] ${
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
              ref={actRef}
              actionKey={`lens-band-${printed.kind}`}
              surfaceKey="open-document"
              regionKey="lens-band"
              variant="primary"
              // The 44px target the Scored Ink owns must not grow the declared
              // 56px box, so the control is inset into the 19.5px line.
              className="my-[-12px] shrink-0"
              onClick={() => {
                onActed?.();
                printed.act?.onAct();
              }}
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
              onClick={() => {
                onStandingOpened?.();
                setSheetOpen(true);
              }}
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
        inputs={model.inputs}
        triggerRef={fallbackFocusRef}
      />
    </>
  );
}
