'use client';

import Link from 'next/link';
import { forwardRef, useEffect, useRef } from 'react';
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
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
