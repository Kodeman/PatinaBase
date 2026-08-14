'use client';

import Link from 'next/link';
import {
  Children,
  createContext,
  forwardRef,
  Fragment,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from 'react';
import { documentEvents } from '@/lib/analytics/document-events';

export type DocumentActionVariant =
  | 'primary'
  | 'inked'
  | 'secondary'
  | 'tertiary'
  | 'danger';
export type DocumentActionPresentation = 'inline' | 'mobile_dock';

interface ActionRegion {
  surfaceKey: string;
  regionKey: string;
}

const ActionRegionContext = createContext<ActionRegion | null>(null);

/* ── The Scored Ink (I107) ──────────────────────────────────────────────────
   A proofreader never draws a box around a word: they rule under it, and the
   rule is the instruction. So an action is a word with its scoring underneath
   — no border, no fill, no plate. The chrome the eye used to read as "button"
   is gone; what remains is ink (.da-pool, z 0), the word and its two scores
   (.da-label, z 1), and an honest 44px control box (.da-act). The invisible
   .da-hit child is a testable witness to that box, not a simulated hit area.

   Everything that moves is triggered by hover/press/focus (R15) and stilled
   under prefers-reduced-motion; the grammar itself lives in globals.css under
   the matching "The Scored Ink (I107)" block. Colour and depth are value only
   — never a shadow (D4). ─────────────────────────────────────────────────── */
const BASE_CLASS =
  'da-act relative inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-2 whitespace-nowrap px-[6px] pt-[4px] pb-[10px] font-mono text-[12px] uppercase no-underline disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

const VARIANT_CLASS: Record<DocumentActionVariant, string> = {
  primary: 'da-primary font-medium tracking-[0.12em]',
  inked: 'da-inked font-medium tracking-[0.12em]',
  secondary: 'da-secondary font-normal tracking-[0.1em]',
  tertiary: 'da-tertiary font-light tracking-[0.1em]',
  danger: 'da-danger font-medium tracking-[0.12em]',
};

interface DocumentActionBaseProps {
  actionKey: string;
  surfaceKey?: string;
  regionKey?: string;
  variant?: DocumentActionVariant;
  presentation?: DocumentActionPresentation;
  loading?: boolean;
  loadingLabel?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
}

type DocumentActionButtonProps = DocumentActionBaseProps &
  Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'children' | 'className' | 'disabled' | 'onClick'
  > & {
    href?: never;
    disabled?: boolean;
    onClick?: (event: MouseEvent<HTMLButtonElement>) => void | Promise<void>;
  };

type DocumentActionLinkProps = DocumentActionBaseProps &
  Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    'children' | 'className' | 'href' | 'onClick'
  > & {
    href: string;
    disabled?: boolean;
    onClick?: (event: MouseEvent<HTMLAnchorElement>) => void | Promise<void>;
  };

export type DocumentActionProps =
  | DocumentActionButtonProps
  | DocumentActionLinkProps;

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

export const DocumentAction = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  DocumentActionProps
>(function DocumentAction(
  {
    actionKey,
    surfaceKey: explicitSurfaceKey,
    regionKey: explicitRegionKey,
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
  const region = useContext(ActionRegionContext);
  const surfaceKey = explicitSurfaceKey ?? region?.surfaceKey ?? 'document';
  const regionKey = explicitRegionKey ?? region?.regionKey ?? 'unscoped';
  const unavailable = disabled || loading;
  const shown = useRef(new Set<string>());
  const shownKey = `${actionKey}:${presentation}`;

  useEffect(() => {
    if (shown.current.has(shownKey)) return;
    shown.current.add(shownKey);
    documentEvents.actionShown({
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
    const linkOnClick = onClick as DocumentActionLinkProps['onClick'];
    const handleClick = async (event: MouseEvent<HTMLAnchorElement>) => {
      if (unavailable) {
        event.preventDefault();
        return;
      }
      // A capture failure must never block the act itself — the same
      // isolate-and-log pattern as posthog.ts's init-subscriber drain (a
      // throw here is caught, not propagated, so linkOnClick still runs).
      try {
        documentEvents.actionSelected(analytics);
      } catch (error) {
        console.error('[analytics] actionSelected threw', error);
      }
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

  const buttonOnClick = onClick as DocumentActionButtonProps['onClick'];
  const handleClick = async (event: MouseEvent<HTMLButtonElement>) => {
    if (unavailable) return;
    // Same isolate-and-log guard as the Link branch above — a capture
    // failure can never swallow the click's own state update.
    try {
      documentEvents.actionSelected(analytics);
    } catch (error) {
      console.error('[analytics] actionSelected threw', error);
    }
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

DocumentAction.displayName = 'DocumentAction';

interface DocumentActionGroupProps {
  surfaceKey: string;
  regionKey: string;
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
}

/* Leadership is a role, not a look: `primary` and `inked` are two renderings of
   the same "one leader per region" claim, so the ≤1 guard counts them together
   (an inked ledger head beside a primary is still two leaders). */
const LEADER_VARIANTS: readonly DocumentActionVariant[] = ['primary', 'inked'];
const LEADER_SELECTOR = LEADER_VARIANTS.map(
  (variant) => `[data-action-variant="${variant}"]`,
).join(', ');

function countPrimaryActions(children: ReactNode): number {
  let count = 0;
  Children.forEach(children, (child) => {
    if (
      !isValidElement<{
        variant?: DocumentActionVariant;
        children?: ReactNode;
      }>(child)
    )
      return;
    if (child.type === DocumentAction) {
      if (LEADER_VARIANTS.includes(child.props.variant ?? 'secondary'))
        count += 1;
      return;
    }
    if (
      child.type === DocumentActionGroup ||
      child.type === DocumentActionRow
    ) {
      return;
    }
    if (child.type === Fragment || child.props.children) {
      count += countPrimaryActions(child.props.children);
    }
  });
  return count;
}

function ActionRegionFrame({
  surfaceKey,
  regionKey,
  children,
  className,
  compact,
  'aria-label': ariaLabel,
}: DocumentActionGroupProps & { compact: boolean }) {
  const reported = useRef(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const primaryCount = countPrimaryActions(children);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || reported.current) return;
    const renderedPrimaryCount = frameRef.current
      ? Array.from(
          frameRef.current.querySelectorAll<HTMLElement>(LEADER_SELECTOR),
        ).filter(
          (action) =>
            action.closest('[role="group"][data-action-region]') ===
            frameRef.current,
        ).length
      : primaryCount;
    if (renderedPrimaryCount <= 1) return;
    reported.current = true;
    console.error(
      `DocumentActionGroup "${surfaceKey}/${regionKey}" received ${renderedPrimaryCount} primary actions; an actionable region permits at most one.`,
    );
  }, [children, primaryCount, regionKey, surfaceKey]);

  const value = useMemo(
    () => ({ surfaceKey, regionKey }),
    [regionKey, surfaceKey],
  );

  return (
    <ActionRegionContext.Provider value={value}>
      <div
        ref={frameRef}
        role="group"
        aria-label={ariaLabel}
        data-action-region={regionKey}
        className={[
          compact
            ? 'flex flex-wrap items-center gap-2'
            : 'flex flex-wrap items-center gap-x-3 gap-y-2',
          className ?? '',
        ].join(' ')}
      >
        {children}
      </div>
    </ActionRegionContext.Provider>
  );
}

export function DocumentActionGroup(props: DocumentActionGroupProps) {
  return <ActionRegionFrame {...props} compact={false} />;
}

export function DocumentActionRow(props: DocumentActionGroupProps) {
  return <ActionRegionFrame {...props} compact />;
}
