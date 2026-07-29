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
  ReactNode,
  RefObject,
} from 'react';
import { documentEvents } from '@/lib/analytics/document-events';

export type DocumentActionVariant =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'danger';
export type DocumentActionPresentation = 'inline' | 'mobile_dock';

interface ActionRegion {
  surfaceKey: string;
  regionKey: string;
}

const ActionRegionContext = createContext<ActionRegion | null>(null);

const BASE_CLASS =
  'relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[4px] px-4 py-2 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] no-underline transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

const VARIANT_CLASS: Record<DocumentActionVariant, string> = {
  primary:
    'overflow-hidden border border-[var(--color-charcoal)] bg-[var(--color-charcoal)] text-[var(--color-off-white)] before:absolute before:inset-y-[5px] before:left-0 before:w-[2px] before:bg-[var(--color-clay)] hover:bg-[var(--color-mocha)]',
  secondary:
    'border border-[var(--color-aged-oak)] bg-[var(--bg-primary)] text-[var(--color-charcoal)] hover:border-[var(--color-clay)] hover:bg-[var(--bg-surface)]',
  tertiary:
    'border border-transparent bg-transparent px-2 text-[var(--color-charcoal)] underline decoration-[var(--color-aged-oak)] decoration-1 underline-offset-4 hover:text-[var(--color-clay)] focus-visible:decoration-[var(--color-clay)]',
  danger:
    'border border-[var(--color-terracotta)] bg-[var(--color-terracotta)] text-[var(--color-off-white)] hover:border-[var(--color-charcoal)] hover:bg-[var(--color-charcoal)]',
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
      {loading ? (
        <span
          aria-hidden
          className="h-2 w-2 animate-pulse rounded-full bg-current opacity-70 motion-reduce:animate-none"
        />
      ) : (
        leading && (
          <span aria-hidden className="shrink-0">
            {leading}
          </span>
        )
      )}
      <span>{loading && loadingLabel ? loadingLabel : children}</span>
      {trailing && (
        <span aria-hidden className="shrink-0 opacity-75">
          {trailing}
        </span>
      )}
    </>
  );

  const shared = {
    'data-action-key': actionKey,
    'data-action-variant': variant,
    'data-action-region': regionKey,
    'aria-busy': loading || undefined,
    className: [BASE_CLASS, VARIANT_CLASS[variant], className ?? ''].join(' '),
  };

  if (href) {
    const linkOnClick = onClick as DocumentActionLinkProps['onClick'];
    const handleClick = async (event: MouseEvent<HTMLAnchorElement>) => {
      if (unavailable) {
        event.preventDefault();
        return;
      }
      documentEvents.actionSelected(analytics);
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
    documentEvents.actionSelected(analytics);
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
      if ((child.props.variant ?? 'secondary') === 'primary') count += 1;
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
          frameRef.current.querySelectorAll<HTMLElement>(
            '[data-action-variant="primary"]',
          ),
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
