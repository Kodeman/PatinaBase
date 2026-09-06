'use client';

import Link from 'next/link';
import { forwardRef, useCallback, useEffect, useId, useRef, useState } from 'react';
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from 'react';

import { makingEvents } from '@/lib/analytics/events';

/* ── The Scored Ink (I107), ported to the client portal ─────────────────────
   A proofreader never draws a box around a word: they rule under it, and the
   rule is the instruction. So an action is a word with its scoring underneath
   — no border, no fill, no plate. What remains is ink (.da-pool, z 0), the
   word and its two scores (.da-label, z 1), and an honest 44px control box
   (.da-act). The invisible .da-hit child is a testable witness to that box,
   not a simulated hit area.

   Everything that moves is triggered by hover/press/focus and is stilled under
   prefers-reduced-motion; the grammar itself lives in globals.css under the
   matching "The Scored Ink (I107)" block, copied class-for-class from the
   designer portal so an act inks identically on both sides of the table.
   Colour and depth are value only — never a shadow.

   This is the client portal's own copy on purpose: no @patina/* package owns
   the grammar yet, and The Making needs the language today. The one departure
   from the designer's DocumentAction is telemetry — that file reports through
   `document-events.ts` (desk and command-bar vocabulary, meaningless here), so
   this one reports through `makingEvents`. The action-group wrapper and its
   one-primary-per-region dev warning are not ported; The Making's regions are
   composed by hand and each names its own region key. ────────────────────── */

export type ScoredActionVariant =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'danger';
export type ScoredActionPresentation = 'inline' | 'mobile_dock';

const BASE_CLASS =
  'da-act relative inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-2 whitespace-nowrap px-[6px] pt-[4px] pb-[10px] font-mono text-[12px] uppercase no-underline disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

const VARIANT_CLASS: Record<ScoredActionVariant, string> = {
  primary: 'da-primary font-medium tracking-[0.12em]',
  secondary: 'da-secondary font-normal tracking-[0.1em]',
  tertiary: 'da-tertiary font-light tracking-[0.1em]',
  danger: 'da-danger font-medium tracking-[0.12em]',
};

interface ScoredActionBaseProps {
  /** Stable telemetry key for this act, e.g. `sign_furnishings`. */
  actionKey: string;
  /** Defaults to `the_making`. */
  surfaceKey?: string;
  /** The region of the surface this act sits in, e.g. `gate`, `toll`. */
  regionKey?: string;
  variant?: ScoredActionVariant;
  presentation?: ScoredActionPresentation;
  loading?: boolean;
  loadingLabel?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
}

type ScoredActionButtonProps = ScoredActionBaseProps &
  Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'children' | 'className' | 'disabled' | 'onClick'
  > & {
    href?: never;
    disabled?: boolean;
    onClick?: (event: MouseEvent<HTMLButtonElement>) => void | Promise<void>;
  };

type ScoredActionLinkProps = ScoredActionBaseProps &
  Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    'children' | 'className' | 'href' | 'onClick'
  > & {
    href: string;
    disabled?: boolean;
    onClick?: (event: MouseEvent<HTMLAnchorElement>) => void | Promise<void>;
    /** next/link's own prop — already forwarded with the rest of the anchor
     *  props below. Named here so an act can decline viewport prefetching,
     *  which a bearer-token route must (00574 · the pay link). */
    prefetch?: boolean;
  };

export type ScoredActionProps = ScoredActionButtonProps | ScoredActionLinkProps;

function restoreFocus(ref: RefObject<HTMLElement | null> | undefined) {
  if (!ref?.current) return;
  window.requestAnimationFrame(() => ref.current?.focus());
}

/* The ink knows where it was touched: park the contact point on the control as
   --ink-x/--ink-y so the pool's clip-path circle opens from exactly there.
   Works identically for the button and the Link render. */
function markInkPoint(event: ReactPointerEvent<HTMLElement>) {
  const target = event.currentTarget;
  const rect = target.getBoundingClientRect();
  target.style.setProperty('--ink-x', `${event.clientX - rect.left}px`);
  target.style.setProperty('--ink-y', `${event.clientY - rect.top}px`);
}

export const ScoredAction = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ScoredActionProps
>(function ScoredAction(
  {
    actionKey,
    surfaceKey = 'the_making',
    regionKey = 'unscoped',
    variant = 'secondary',
    presentation = 'inline',
    loading = false,
    loadingLabel,
    leading,
    trailing,
    restoreFocusRef,
    children,
    className,
    disabled = false,
    href,
    onClick,
    ...rest
  },
  ref,
) {
  const unavailable = disabled || loading;
  const shown = useRef(new Set<string>());
  const shownKey = `${actionKey}:${presentation}`;

  useEffect(() => {
    if (shown.current.has(shownKey)) return;
    shown.current.add(shownKey);
    makingEvents.actionShown({
      surface_key: surfaceKey,
      region_key: regionKey,
      action_key: actionKey,
      variant,
      presentation,
    });
  }, [actionKey, presentation, regionKey, shownKey, surfaceKey, variant]);

  const analytics = {
    surface_key: surfaceKey,
    region_key: regionKey,
    action_key: actionKey,
    variant,
    presentation,
  } as const;

  const content = (
    <>
      {/* the ink, beneath everything — a whisper (tertiary) never floods */}
      {variant !== 'tertiary' && <span aria-hidden className="da-pool" />}
      {loading ? (
        <span
          aria-hidden
          className="relative z-[1] h-2 w-2 animate-pulse rounded-full bg-current opacity-70 motion-reduce:animate-none"
        />
      ) : (
        leading && (
          <span aria-hidden className="da-leading shrink-0">
            {leading}
          </span>
        )
      )}
      <span className="da-label">
        {loading && loadingLabel ? loadingLabel : children}
      </span>
      {trailing && (
        <span aria-hidden className="da-trailing shrink-0">
          {trailing}
        </span>
      )}
      {/* target witness: CSS makes the interactive parent itself >=44px */}
      <span aria-hidden="true" data-action-hit className="da-hit" />
    </>
  );

  const shared = {
    'data-action-key': actionKey,
    'data-action-variant': variant,
    'data-action-region': regionKey,
    'aria-busy': loading || undefined,
    onPointerDown: markInkPoint,
    onPointerMove: markInkPoint,
    className: [BASE_CLASS, VARIANT_CLASS[variant], className ?? ''].join(' '),
  };

  if (href) {
    const linkOnClick = onClick as ScoredActionLinkProps['onClick'];
    const handleClick = async (event: MouseEvent<HTMLAnchorElement>) => {
      if (unavailable) {
        event.preventDefault();
        return;
      }
      makingEvents.actionSelected(analytics);
      try {
        await linkOnClick?.(event);
      } finally {
        restoreFocus(restoreFocusRef);
      }
    };

    return (
      <Link
        {...(rest as Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>)}
        {...shared}
        href={href}
        ref={ref as React.Ref<HTMLAnchorElement>}
        aria-disabled={unavailable || undefined}
        tabIndex={unavailable ? -1 : rest.tabIndex}
        onClick={handleClick}
      >
        {content}
      </Link>
    );
  }

  const buttonOnClick = onClick as ScoredActionButtonProps['onClick'];
  const handleClick = async (event: MouseEvent<HTMLButtonElement>) => {
    if (unavailable) return;
    makingEvents.actionSelected(analytics);
    try {
      await buttonOnClick?.(event);
    } finally {
      restoreFocus(restoreFocusRef);
    }
  };

  return (
    <button
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
      {...shared}
      ref={ref as React.Ref<HTMLButtonElement>}
      type={(rest as ButtonHTMLAttributes<HTMLButtonElement>).type ?? 'button'}
      disabled={unavailable}
      onClick={handleClick}
    >
      {content}
    </button>
  );
});

ScoredAction.displayName = 'ScoredAction';

/* ── THE HELD ACT (P-18) ─────────────────────────────────────────────────────
   Some acts are terminal: a signature, an acceptance, an outcome recorded
   against a frozen edition. A tap is the wrong shape for those — it is over
   before the hand has agreed with the eye. So the act is HELD: the finger
   rests on the word and the same scored ink fills along the rule beneath it,
   left to right, until the rule is inked and the act is taken.

   IT IS THE SAME INK, NOT A NEW DEVICE. No spinner, no bar, no percentage, no
   ring — `.da-pool` is already the ink this grammar floods on contact, and a
   hold simply gives it a direction and a length. The one addition in
   globals.css is `.da-hold`, which swaps the pool's circular clip for a
   left-to-right inset and hands it the hold's own duration.

   RELEASING EARLY IS A CANCEL, NOT A FAILURE. Nothing is said about it: the
   ink retreats and the word stands unmarked again. Scrolling cancels too — a
   thumb that starts to read is not a thumb that meant to sign.

   THE KEYBOARD HOLDS TOO. Enter or Space held for the same length takes the
   act, so nobody is offered a shorter path to a terminal decision than the
   one the mouse gets. The sentence naming the gesture is on the control for
   every reader (`aria-describedby`); the visible "or press and hold Enter" is
   drawn only when the focus arrived by key, because a pointer user is already
   holding the thing it describes.

   REDUCED MOTION STILLS THE FILL, NOT THE WAIT. The ink arrives at once and
   the hold still takes its length: the delay is the deliberation, and the
   animation was only ever its portrait. ─────────────────────────────────── */

/** The length of a hold, in milliseconds. One beat of deliberation. */
export const HOLD_MS = 900;

/* An assistive click that follows a pointer gesture on this same control is
   that gesture's own tail, not a screen reader taking the act. Browsers fire
   it within a frame or two of the release; the window is generous because a
   test harness's synthetic gesture is slower than a hand. */
const POINTER_TAIL_MS = 700;

/* Which way the last interaction came from. A visible keyboard hint on an act
   the client reached with her thumb is noise, so the hint waits for a key. One
   pair of listeners is shared by every held act on the page and retired with
   the last of them. */
let keyboardModality = false;
let modalityHolders = 0;
const noteKey = () => {
  keyboardModality = true;
};
const notePointer = () => {
  keyboardModality = false;
};

function retainModality(): () => void {
  if (typeof document === 'undefined') return () => {};
  modalityHolders += 1;
  if (modalityHolders === 1) {
    document.addEventListener('keydown', noteKey, true);
    document.addEventListener('pointerdown', notePointer, true);
  }
  return () => {
    modalityHolders -= 1;
    if (modalityHolders === 0) {
      document.removeEventListener('keydown', noteKey, true);
      document.removeEventListener('pointerdown', notePointer, true);
    }
  };
}

function stilled(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  // A stubbed matchMedia can answer with nothing at all; a missing answer is
  // not a request for stillness.
  return !!window.matchMedia('(prefers-reduced-motion: reduce)')?.matches;
}

export interface HoldActionProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'children' | 'className' | 'disabled' | 'onClick'
  > {
  /** Stable telemetry key for this act, e.g. `gate_sign`. */
  actionKey: string;
  surfaceKey?: string;
  regionKey?: string;
  variant?: ScoredActionVariant;
  /**
   * `mobile_dock` keeps the act on the bottom edge of a narrow viewport while
   * its paper is still on screen, so a long document cannot bury it.
   */
  presentation?: ScoredActionPresentation;
  /**
   * The verb the sentence names: "Press and hold to {verb}." Lower case, no
   * full stop — the sentence supplies its own.
   */
  verb: string;
  /** The act itself. Runs once, when the hold reaches its length. */
  onHold: () => void | Promise<void>;
  holdMs?: number;
  loading?: boolean;
  loadingLabel?: ReactNode;
  disabled?: boolean;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
  /** Classes for the word itself. */
  className?: string;
  /** Classes for the act's own box — where a dock's spacing belongs. */
  wrapperClassName?: string;
}

export const HoldAction = forwardRef<HTMLButtonElement, HoldActionProps>(
  function HoldAction(
    {
      actionKey,
      surfaceKey = 'the_making',
      regionKey = 'unscoped',
      variant = 'primary',
      presentation = 'inline',
      verb,
      onHold,
      holdMs = HOLD_MS,
      loading = false,
      loadingLabel,
      disabled = false,
      restoreFocusRef,
      children,
      className,
      wrapperClassName,
      ...rest
    },
    ref,
  ) {
    const unavailable = disabled || loading;
    const [holding, setHolding] = useState(false);
    const [keyboardHint, setKeyboardHint] = useState(false);
    // Read after mount, never during render: the server has no media query to
    // answer with, and a class that appears only on the client is a hydration
    // mismatch.
    const [still, setStill] = useState(false);
    const control = useRef<HTMLButtonElement | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const running = useRef(false);
    const pointerAt = useRef(0);
    const shown = useRef(new Set<string>());
    const shownKey = `${actionKey}:${presentation}`;
    const saidId = `hold-${useId().replace(/:/g, '')}`;

    useEffect(() => retainModality(), []);
    useEffect(() => setStill(stilled()), []);

    useEffect(() => {
      if (shown.current.has(shownKey)) return;
      shown.current.add(shownKey);
      makingEvents.actionShown({
        surface_key: surfaceKey,
        region_key: regionKey,
        action_key: actionKey,
        variant,
        presentation,
      });
    }, [actionKey, presentation, regionKey, shownKey, surfaceKey, variant]);

    const ink = useCallback((fill: 0 | 1) => {
      control.current?.style.setProperty('--hold-fill', `${fill}`);
    }, []);

    const stop = useCallback(() => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      running.current = false;
      ink(0);
      setHolding(false);
      if (typeof window !== 'undefined') {
        window.removeEventListener('scroll', stop, true);
      }
    }, [ink]);

    useEffect(() => stop, [stop]);

    /** The act itself, reported once and always the same way. */
    const take = useCallback(() => {
      makingEvents.actionSelected({
        surface_key: surfaceKey,
        region_key: regionKey,
        action_key: actionKey,
        variant,
        presentation,
      });
      void Promise.resolve(onHold()).finally(() => {
        restoreFocus(restoreFocusRef);
      });
    }, [
      actionKey,
      onHold,
      presentation,
      regionKey,
      restoreFocusRef,
      surfaceKey,
      variant,
    ]);

    const start = useCallback(() => {
      if (unavailable || running.current) return;
      running.current = true;
      setHolding(true);
      control.current?.style.setProperty('--hold-ms', `${holdMs}ms`);
      // The fill is a CSS transition on the pool, so it is set on the next
      // frame in a browser and immediately in jsdom; either way the timer,
      // not the paint, is what decides when the act is taken.
      ink(1);
      if (typeof window !== 'undefined') {
        window.addEventListener('scroll', stop, true);
      }
      timer.current = setTimeout(() => {
        timer.current = null;
        running.current = false;
        setHolding(false);
        ink(0);
        if (typeof window !== 'undefined') {
          window.removeEventListener('scroll', stop, true);
        }
        take();
      }, holdMs);
    }, [holdMs, ink, stop, take, unavailable]);

    function onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
      if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
        return;
      }
      // A native button fires click on Enter down and Space up. Neither may
      // reach the act: the only way through this control is the hold.
      event.preventDefault();
      if (event.repeat) return;
      start();
    }

    function onKeyUp(event: ReactKeyboardEvent<HTMLButtonElement>) {
      if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
        return;
      }
      event.preventDefault();
      stop();
    }

    return (
      <span
        data-hold-dock={presentation === 'mobile_dock' ? '' : undefined}
        className={[
          'inline-flex flex-wrap items-center gap-x-3 gap-y-1',
          presentation === 'mobile_dock'
            ? 'max-[600px]:sticky max-[600px]:bottom-0 max-[600px]:z-20 max-[600px]:flex max-[600px]:border-t max-[600px]:border-[var(--border-default)] max-[600px]:bg-[var(--bg-surface)] max-[600px]:py-2'
            : '',
          wrapperClassName ?? '',
        ].join(' ')}
      >
        <button
          {...rest}
          ref={(node) => {
            control.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) ref.current = node;
          }}
          type={rest.type ?? 'button'}
          disabled={unavailable}
          data-action-key={actionKey}
          data-action-variant={variant}
          data-action-region={regionKey}
          data-hold-state={holding ? 'holding' : 'idle'}
          data-hold-ms={holdMs}
          aria-busy={loading || undefined}
          aria-describedby={
            [rest['aria-describedby'], saidId].filter(Boolean).join(' ') || undefined
          }
          className={[
            BASE_CLASS,
            VARIANT_CLASS[variant],
            'da-hold',
            still ? 'da-hold-still' : '',
            className ?? '',
          ].join(' ')}
          onPointerDown={(event) => {
            pointerAt.current = Date.now();
            markInkPoint(event);
            start();
          }}
          onPointerUp={(event) => {
            pointerAt.current = Date.now();
            stop();
            rest.onPointerUp?.(event);
          }}
          onPointerLeave={(event) => {
            pointerAt.current = Date.now();
            stop();
            rest.onPointerLeave?.(event);
          }}
          onPointerCancel={(event) => {
            pointerAt.current = Date.now();
            stop();
            rest.onPointerCancel?.(event);
          }}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onBlur={(event) => {
            setKeyboardHint(false);
            stop();
            rest.onBlur?.(event);
          }}
          onFocus={(event) => {
            setKeyboardHint(keyboardModality);
            rest.onFocus?.(event);
          }}
          /* A hold is the only way in for a hand. Assistive technology has no
             hand: VoiceOver, Voice Control and switch access take an act by
             dispatching a click, and there is nothing to press and hold. That
             click IS the deliberate gesture — it costs several steps to reach
             — so it takes the act at once, exactly as the iOS HoldableModifier
             answers its "Activate" action.

             The pointer tail is the whole guard, and `isTrusted` is deliberately
             NOT consulted: a screen reader activates through the platform
             accessibility API (AXPress / kDoDefault / doAction) and the browser
             then dispatches the click ITSELF, trusted — which is why activating
             a button with VoiceOver or Voice Control counts as user activation
             at all. Testing `isTrusted` would therefore refuse every real
             assistive activation and admit only a scripted one. What separates
             a hand from assistive technology is not trust but history: a hand
             always leaves a pointerdown/pointerup on THIS control within
             POINTER_TAIL_MS before its click, and a physical-keyboard hold
             produces no click at all (both keydown and keyup are prevented). A
             click with no pointer behind it is not a hand. */
          onClick={(event) => {
            event.preventDefault();
            if (unavailable || running.current) return;
            if (Date.now() - pointerAt.current < POINTER_TAIL_MS) return;
            take();
          }}
        >
          {variant !== 'tertiary' && <span aria-hidden className="da-pool" />}
          <span className="da-label">
            {loading && loadingLabel ? loadingLabel : children}
          </span>
          <span aria-hidden="true" data-action-hit className="da-hit" />
        </button>
        {keyboardHint && !unavailable && (
          <span
            aria-hidden="true"
            data-testid={`${actionKey}-key-hint`}
            className="font-mono text-[11px] leading-none tracking-[0.06em] text-[var(--text-muted)]"
          >
            or press and hold Enter
          </span>
        )}
        <span id={saidId} className="sr-only">
          {`Press and hold to ${verb}.`}
        </span>
      </span>
    );
  },
);

HoldAction.displayName = 'HoldAction';
