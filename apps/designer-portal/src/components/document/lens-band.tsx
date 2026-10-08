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

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import {
  LENS_ANNOUNCE_DEDUPE_MS,
  LENS_TURN_OUT_MS,
} from '@/lib/document/lens-constants';
import {
  standingDoorLabel,
  type LensBandModel,
  type LensBandLine2,
  type LensReadingStop,
  type LensVoice,
} from '@/lib/document/lens-band-derivation';
import { DocumentAction } from './document-action';
import { StandingSheet } from './standing-sheet';

/** Slice 2 — the dock (SQ-2C) opens the band's standing sheet with this when
 *  the 390 measure has moved the `Standing · N` door into More (D2). */
export const OPEN_STANDING_SHEET_EVENT = 'document:open-standing-sheet';

/** Both lines, at every width — the backstop only, after the derivation has
 *  chosen the form that fits (D-B24). */
const LINE_CLIP = 'overflow-hidden text-ellipsis whitespace-nowrap';

/** F2-1 — the eyebrow's two halves: the stage word never clips; the job's
 *  name, with its separator, is what ellipsises. */
function Eyebrow({ voice }: { voice: LensVoice }) {
  return (
    <>
      <span className="shrink-0">{voice.eyebrowStage}</span>
      {voice.eyebrowDetail && (
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-pre">
          {` · ${voice.eyebrowDetail}`}
        </span>
      )}
    </>
  );
}

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

/** The same Next, by the same rule: its whole sentence, its act and the door's
 *  count. A flag answering late (null → a voice) is a first print, not a turn. */
const sameVoice = (a: LensVoice | null, b: LensVoice | null) =>
  !a ||
  !b ||
  ((a.next?.sentence ?? a.sentence) === (b.next?.sentence ?? b.sentence) &&
    a.next?.act.label === b.next?.act.label &&
    a.standingCount === b.standingCount);

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * L-1 — line 2 turns: the old sentence fades out for 90ms and the new one is
 * printed in its place. The same item in new words (N-03) is adopted in place.
 */
function usePrintedLine<T>(line: T, same: (a: T, b: T) => boolean) {
  const [printed, setPrinted] = useState<T>(line);
  const [turning, setTurning] = useState(false);
  // N-03 — the first model this band ever holds is not a turn: nothing was
  // printed before it, and at 390 the pre-hydration model is the wide tier's,
  // corrected one frame later. A turn there is a 90ms blank on every load.
  const hasPrinted = useRef(false);
  useEffect(() => {
    if (line === printed) {
      hasPrinted.current = true;
      return;
    }
    // Same item — new handler identities, or the tier settling under it.
    // Adopt in place, with no turn.
    if (!hasPrinted.current || same(line, printed)) {
      hasPrinted.current = true;
      setPrinted(line);
      return;
    }
    // L-1 reduced-motion form: the new sentence is printed instantly in place.
    // A 90ms hold at opacity 0 is a blank line, not a shorter crossfade.
    if (prefersReducedMotion()) {
      setPrinted(line);
      setTurning(false);
      return;
    }
    setTurning(true);
    const id = window.setTimeout(() => {
      setPrinted(line);
      setTurning(false);
    }, LENS_TURN_OUT_MS);
    return () => window.clearTimeout(id);
  }, [line, printed, same]);
  return { printed, turning };
}

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
  // Slice 2 (D1, D2) — the stage word on line 1, Next and the door on line 2.
  // Off, the band is exactly the 0b band.
  const voice = useFeatureFlag('one-voice').value === true ? model.voice : null;
  const { printed, turning } = usePrintedLine<LensBandLine2>(model.line2, sameItem);
  const { printed: spoken, turning: voiceTurning } = usePrintedLine<LensVoice | null>(
    voice,
    sameVoice,
  );
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

  // D2 at 390 — when the measure moves the door into the dock's More, the
  // dock opens this same sheet; there is one sheet, and it lives here.
  const speaks = voice !== null;
  useEffect(() => {
    if (!speaks) return;
    const openSheet = () => {
      onStandingOpened?.();
      setSheetOpen(true);
    };
    window.addEventListener(OPEN_STANDING_SHEET_EVENT, openSheet);
    return () => window.removeEventListener(OPEN_STANDING_SHEET_EVENT, openSheet);
  }, [speaks, onStandingOpened]);

  // F2-4 / 498-g — the measure decides, never the tier: the derivation's
  // estimate picks a rung, and while the printed sentence still clips the band
  // drops to the next (the act yields only to the dock, F6-6). Keyed on the rungs' words and
  // the band's width, so new words or a wider window start again at the top.
  const sentenceRef = useRef<HTMLSpanElement | null>(null);
  const [bandWidth, setBandWidth] = useState(0);
  useEffect(() => {
    if (!speaks) return;
    const measure = () => setBandWidth(bandRef.current?.clientWidth ?? 0);
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [speaks]);
  const rungKey = spoken
    ? `${spoken.rungs.map((r) => `${r.form}:${r.sentence}`).join('|')}@${bandWidth}`
    : '';
  const [yielded, setYielded] = useState({ key: '', by: 0 });
  const dropped = yielded.key === rungKey ? yielded.by : 0;
  const rung = spoken
    ? (spoken.rungs[Math.min(dropped, spoken.rungs.length - 1)] ?? spoken)
    : null;
  useLayoutEffect(() => {
    const sentence = sentenceRef.current;
    if (!spoken || !sentence || dropped >= spoken.rungs.length - 1) return;
    if (sentence.scrollWidth > sentence.clientWidth) {
      setYielded({ key: rungKey, by: dropped + 1 });
    }
  }, [spoken, rungKey, dropped]);

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
  const printedWords = spoken
    ? `${spoken.lead ?? ''}|${spoken.sentence}|${spoken.next?.act.label ?? ''}|${spoken.standingCount}`
    : `${printed.kind}|${printed.sentence}|${printed.act?.label ?? ''}|${printed.standingCount}`;
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

  // D10 — a `standing` line is a class 1–2 row: setup never reaches line 2
  // (the derivation keeps it in the sheet's SETUP group), so terracotta here
  // and on the door never paints a setup row.
  const standing = printed.kind === 'standing';
  const withheld = printed.withheld;
  const moreId = `lens-band-more-${docId}`;

  // D2 — Next is painted terracotta only when it names a standing exception;
  // the stage's own act and a setup row are not something gone wrong (D10).
  const spokenRow = spoken?.next?.rowKey ?? null;
  const nextIsException =
    spokenRow !== null && (spoken?.standing.some((item) => item.key === spokenRow) ?? false);
  const door = spoken && spoken.standingCount > 0 && !spoken.doorInDock ? spoken : null;

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
          // D-B38 — line 1 keeps its box whether or not it prints. At s0 the
          // letterhead is saying the identity, the stage and the date, so both
          // halves yield and the `<p>` collapses to zero; the band is a declared
          // 56px `flex-col justify-center`, so line 2 rises 7.7px — a layout
          // shift of the band's own text on a step nothing else caused, which is
          // what D-B34's cause gate caught. `min-h` is the ONE line of 11px mono
          // at `leading-[1.4]` (11 × 1.4 = 15.4px, a literal because the root is
          // 18px and `rem` would not land on the same number).
          className={`flex min-h-[15.4px] items-baseline justify-between gap-4 font-mono text-[11px] uppercase leading-[1.4] tracking-[0.08em] text-[var(--text-muted)] ${LINE_CLIP}`}
        >
          {/* At s0 the letterhead 60px above prints the household at 40px, the
              stage as its arc and the date in its vitals, so both yield; the
              letterhead prints no money, so money keeps its printing. */}
          <span
            className={`min-w-0 ${spoken ? 'flex items-baseline overflow-hidden whitespace-nowrap' : LINE_CLIP}`}
            data-lens-identity
          >
            {spoken ? (
              // D1 — `STAGE · Name` at every stop: the letterhead prints the
              // name but never the stage word, so line 1 does not yield it.
              // No count, plate or badge; the caps are this line's CSS.
              !open && onToTop ? (
                <button
                  type="button"
                  onClick={onToTop}
                  data-lens-to-top
                  className="flex min-w-0 items-baseline p-0 text-left uppercase tracking-[0.08em] text-[var(--text-muted)] underline-offset-[3px] transition-colors hover:text-[var(--text-primary)] hover:underline"
                >
                  <Eyebrow voice={spoken} />
                </button>
              ) : (
                <Eyebrow voice={spoken} />
              )
            ) : open ? null : (
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
            {spoken
              ? open
                ? spoken.moneyOnly
                : spoken.rightFlush
              : open
                ? line1.moneyOnly
                : line1.rightFlush}
          </span>
        </p>

        {/* The clip lives on the SENTENCE, never on this flex line: the act's
            44px control is inset by -12px into the 19.5px line, so an
            `overflow: hidden` here would cut 12px off its box for painting and
            for hit-testing. At 390 under `one-voice` the dock's centre prints
            the act (D7), so the `sentence` rung (F6-6) prints no act here. */}
        {spoken && rung ? (
          <p
            data-lens-line="2"
            data-lens-line2-kind={spoken.next ? 'next' : printed.kind}
            data-lens-line2-form={rung.form}
            data-lens-sentence-rung={rung.form === 'sentence' ? rung.alone : undefined}
            aria-live="polite"
            aria-atomic="true"
            className={`flex items-center gap-2 whitespace-nowrap text-[15px] leading-[1.3] ${
              nextIsException
                ? 'text-[var(--color-terracotta-ink)]'
                : 'text-[var(--text-primary)]'
            }`}
          >
            {rung.lead && (
              <span
                data-lens-next-lead
                className="shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]"
              >
                {rung.lead}
              </span>
            )}
            <span
              ref={sentenceRef}
              data-lens-sentence
              data-part={rung.sentence ? 'headline' : undefined}
              data-arr-long={
                spoken.next &&
                rung.sentence &&
                (rung.form === 'short' || rung.form === 'sentence')
                  ? spoken.next.sentence
                  : undefined
              }
              className={`min-w-0 ease-[var(--ease-editorial)] transition-opacity motion-reduce:transition-none ${LINE_CLIP} ${
                voiceTurning
                  ? 'opacity-0 duration-[90ms]'
                  : 'opacity-100 duration-[150ms]'
              }`}
            >
              {rung.sentence}
            </span>
            {spoken.next && rung.form !== 'sentence' && (
              <DocumentAction
                ref={actRef}
                actionKey="lens-band-next"
                surfaceKey="open-document"
                regionKey="lens-band"
                // D2 — the band's act is a scored word whatever its rest tier:
                // a filled act owes a consequence sentence the 56px band has
                // no room for (D3, R141).
                variant="primary"
                data-part="act"
                className="my-[-12px] shrink-0"
                disabled={spoken.next.act.disabled}
                onClick={() => {
                  onActed?.();
                  spoken.next?.act.onAct();
                }}
              >
                {spoken.next.act.label}
              </DocumentAction>
            )}
            {door && (
              <button
                ref={moreRef}
                id={moreId}
                type="button"
                data-lens-door
                onClick={() => {
                  onStandingOpened?.();
                  setSheetOpen(true);
                }}
                // D2 — `Standing · 3`, the word and the count, in her words:
                // not caps, never a kind summary. F2-22 — terracotta only for
                // money or a signature behind it, clay otherwise.
                className={`ml-auto shrink-0 whitespace-nowrap font-mono text-[11px] tracking-[0.04em] underline underline-offset-[3px] ${
                  door.doorClassOne
                    ? 'text-[var(--color-terracotta-ink)]'
                    : 'text-[var(--color-clay-ink)]'
                }`}
              >
                {standingDoorLabel(door.standingCount)}
              </button>
            )}
            <span className="sr-only" data-lens-announce>
              {announcement}
            </span>
          </p>
        ) : (
        <p
          data-lens-line="2"
          data-lens-line2-kind={printed.kind}
          data-lens-line2-form={printed.form}
          aria-live="polite"
          aria-atomic="true"
          className={`flex items-center gap-2 whitespace-nowrap text-[16px] leading-[1.3] ${
            standing
              ? 'text-[var(--color-terracotta-ink)]'
              : 'text-[var(--text-primary)]'
          }`}
        >
          <span
            data-lens-sentence
            // US-14 — a quiet line prints no sentence; the letterhead's name
            // is then the arrival's headline. D2: the card prints the page's
            // words. A long or medium form is a sentence and is printed as is;
            // only the short form is a label, so the whole sentence rides here.
            data-part={printed.sentence ? 'headline' : undefined}
            data-arr-long={
              printed.sentence && printed.form === 'short' ? printed.long.sentence : undefined
            }
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
              data-part="act"
              // The 44px target the Scored Ink owns must not grow the declared
              // 56px box, so the control is inset into the 19.5px line.
              className="my-[-12px] shrink-0"
              disabled={printed.act.disabled}
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
              // D1 — the door is painted in the register of what it holds: an
              // open input is not an exception, so a door over inputs alone is
              // clay, and terracotta returns the moment one of them is.
              className={`shrink-0 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.08em] underline underline-offset-[3px] ${
                printed.withheldHasException
                  ? 'text-[var(--color-terracotta-ink)]'
                  : 'text-[var(--color-clay-ink)]'
              }`}
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
        )}
      </section>
      <StandingSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        items={voice ? voice.standing : model.standing}
        inputs={voice ? voice.inputs : model.inputs}
        setup={voice ? voice.setup : model.setup}
        grouped={voice !== null}
        // F2-6 — the title reads the door's own count; Next's row is first in
        // its group and not counted.
        count={voice ? voice.standingCount : undefined}
        nextKey={voice?.next?.rowKey ?? null}
        triggerRef={fallbackFocusRef}
      />
    </>
  );
}
