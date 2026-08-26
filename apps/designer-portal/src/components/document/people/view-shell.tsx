'use client';

/**
 * Shared People Room chrome: the seven stable views, their relationship-index
 * navigation, and the quiet title / empty-state primitives each view uses.
 * Typography carries the hierarchy; the only pigment is the Strata mark and
 * active state. No shadows, lifts, menu/listbox ARIA, or dashboard furniture.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PeopleView } from './types';

export interface PeopleViewOption {
  key: PeopleView;
  name: string;
}

export interface PeopleViewGroup {
  key: 'directory' | 'relationships' | 'practice';
  name: string;
  views: readonly PeopleViewOption[];
}

/** The seven existing views, regrouped without changing a key or destination. */
export const PEOPLE_VIEW_GROUPS: readonly PeopleViewGroup[] = [
  {
    key: 'directory',
    name: 'Directory',
    views: [{ key: 'directory', name: 'Directory' }],
  },
  {
    key: 'relationships',
    name: 'Relationships',
    views: [
      { key: 'threads', name: 'Threads' },
      { key: 'nurture', name: 'Nurture' },
      { key: 'reviews', name: 'Reviews' },
    ],
  },
  {
    key: 'practice',
    name: 'Practice',
    views: [
      { key: 'portfolio', name: 'Portfolio' },
      { key: 'outreach', name: 'Outreach' },
      { key: 'your-eye', name: 'Your Eye' },
    ],
  },
];

export const PEOPLE_VIEW_KEYS: readonly PeopleView[] =
  PEOPLE_VIEW_GROUPS.flatMap((group) => group.views.map((view) => view.key));

/** The receiving end of `/people?view=<key>` redirects. */
export function peopleViewFromParam(raw: string | null): PeopleView | null {
  if (!raw) return null;
  return (PEOPLE_VIEW_KEYS as readonly string[]).includes(raw)
    ? (raw as PeopleView)
    : null;
}

export interface PeopleEngineNudge {
  count: number;
  name: string;
  since: string;
}

function viewName(view: PeopleView): string {
  return (
    PEOPLE_VIEW_GROUPS.flatMap((group) => group.views).find(
      (option) => option.key === view,
    )?.name ?? view
  );
}

/** One mark per true group, instead of a decorative mark on every view row. */
function RelationshipIndexMark() {
  return (
    <span
      aria-hidden
      className="flex w-[18px] shrink-0 flex-col items-start gap-[2px]"
    >
      <i className="block h-[2px] w-[18px] rounded-[1px] bg-[var(--color-clay)]" />
      <i className="block h-[2px] w-[12px] rounded-[1px] bg-[var(--color-clay)] opacity-60" />
      <i className="block h-[2px] w-[7px] rounded-[1px] bg-[var(--color-clay)] opacity-30" />
    </span>
  );
}

function ViewGroups({
  activeView,
  directoryCount,
  onSelect,
  idPrefix,
}: {
  activeView: PeopleView | null;
  directoryCount?: number;
  onSelect: (view: PeopleView) => void;
  idPrefix: string;
}) {
  return PEOPLE_VIEW_GROUPS.map((group) => {
    const headingId = `${idPrefix}-${group.key}`;
    return (
      <section
        key={group.key}
        aria-labelledby={headingId}
        data-people-view-group={group.key}
      >
        <h2
          id={headingId}
          className="doc-type-meta mb-2 flex items-center gap-2.5 font-semibold uppercase tracking-[0.12em]"
        >
          <RelationshipIndexMark />
          {group.name}
        </h2>
        <ul className="space-y-0.5">
          {group.views.map((option) => {
            const active = activeView === option.key;
            return (
              <li key={option.key}>
                <button
                  type="button"
                  data-people-view-option={option.key}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onSelect(option.key)}
                  className={`doc-type-control relative flex min-h-11 w-full items-center gap-3 border-l-2 py-2 pl-5 pr-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none ${
                    active
                      ? 'border-[var(--color-clay)] font-semibold text-[var(--text-primary)]'
                      : 'border-transparent text-[var(--color-quiet-ink)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="min-w-0 flex-1">{option.name}</span>
                  {option.key === 'directory' &&
                    typeof directoryCount === 'number' && (
                      <span className="doc-type-meta shrink-0 tabular-nums">
                        {directoryCount}
                      </span>
                    )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    );
  });
}

function EngineNudge({
  nudge,
  onOpen,
}: {
  nudge: PeopleEngineNudge;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      data-people-engine-nudge
      onClick={onOpen}
      className="group mt-5 flex min-h-11 w-full flex-col justify-center border-t border-[var(--border-subtle)] pt-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
    >
      <span className="doc-type-meta font-semibold uppercase tracking-[0.1em]">
        The Engine · {nudge.count}{' '}
        {nudge.count === 1 ? 'person drifting' : 'people drifting'}
      </span>
      <span className="doc-type-body mt-1 text-[var(--color-quiet-ink)]">
        <span className="font-heading italic text-[var(--text-primary)]">
          {nudge.name}
        </span>{' '}
        is the strongest dormant tie · {nudge.since}.{' '}
        <span
          aria-hidden
          className="text-[var(--color-quiet-ink)] transition-colors group-hover:text-[var(--color-clay-ink)] motion-reduce:transition-none"
        >
          →
        </span>
      </span>
    </button>
  );
}

export function PeopleDesktopRail({
  activeView,
  directoryCount,
  nudge,
  onSelect,
}: {
  activeView: PeopleView | null;
  directoryCount?: number;
  nudge: PeopleEngineNudge | null;
  onSelect: (view: PeopleView) => void;
}) {
  return (
    <aside
      data-people-desktop-rail
      data-people-active-view={activeView ?? 'profile'}
      className="hidden w-[220px] shrink-0 border-r border-[var(--doc-ink-border)]/40 px-4 py-6 min-[1180px]:block"
    >
      <p className="doc-type-meta mb-6 uppercase tracking-[0.1em]">
        In this room
      </p>
      <nav aria-label="People views" className="space-y-6">
        <ViewGroups
          activeView={activeView}
          directoryCount={directoryCount}
          onSelect={onSelect}
          idPrefix="people-rail-group"
        />
      </nav>
      {nudge && (
        <EngineNudge nudge={nudge} onOpen={() => onSelect('nurture')} />
      )}
    </aside>
  );
}

export function PeopleCompactSelector({
  currentView,
  profileOpen,
  directoryCount,
  nudge,
  onSelect,
}: {
  currentView: PeopleView;
  profileOpen: boolean;
  directoryCount?: number;
  nudge: PeopleEngineNudge | null;
  onSelect: (view: PeopleView) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = 'people-view-selector-panel';
  const currentLabel = profileOpen ? 'Person profile' : viewName(currentView);

  useEffect(() => {
    if (!open) return;

    const onOutsidePointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', onOutsidePointer, true);
    window.addEventListener('keydown', onEscape, true);
    return () => {
      document.removeEventListener('pointerdown', onOutsidePointer, true);
      window.removeEventListener('keydown', onEscape, true);
    };
  }, [open]);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1180px)');
    const closeAtDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    desktop.addEventListener('change', closeAtDesktop);
    return () => desktop.removeEventListener('change', closeAtDesktop);
  }, []);

  const selectView = (next: PeopleView) => {
    onSelect(next);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div
      ref={rootRef}
      data-people-compact-selector
      data-people-current-view={profileOpen ? 'profile' : currentView}
      className="mx-auto w-full max-w-[1100px] px-4 pt-4 sm:px-6 min-[1180px]:hidden"
    >
      <button
        ref={triggerRef}
        type="button"
        data-people-selector-trigger
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Choose People view. Current view: ${currentLabel}`}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-4 border-y border-[var(--border-subtle)] py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
      >
        <span className="min-w-0">
          <span className="doc-type-meta block uppercase tracking-[0.1em]">
            Current view
          </span>
          <span className="doc-type-control block truncate font-semibold">
            {currentLabel}
          </span>
        </span>
        <span className="doc-type-meta shrink-0 uppercase tracking-[0.08em]">
          {open ? 'Close' : 'Change'}{' '}
          <span aria-hidden>{open ? '↑' : '↓'}</span>
        </span>
      </button>

      <nav
        id={panelId}
        hidden={!open}
        data-people-selector-panel
        aria-label="Choose a People view"
        className="space-y-6 border-b border-[var(--border-subtle)] py-5"
      >
        <ViewGroups
          activeView={profileOpen ? null : currentView}
          directoryCount={directoryCount}
          onSelect={selectView}
          idPrefix="people-selector-group"
        />
      </nav>

      {nudge && (
        <EngineNudge nudge={nudge} onOpen={() => selectView('nurture')} />
      )}
    </div>
  );
}

export function ViewHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <h1 className="font-heading text-[1.6rem] font-medium leading-tight text-[var(--color-charcoal)]">
        {title}
      </h1>
      {sub && <p className="doc-type-body mt-1">{sub}</p>}
    </div>
  );
}

/** A quiet notice retained for any view slot still arriving in a later track. */
export function ViewPlaceholder({ track }: { track: string }) {
  return (
    <div className="border-l border-[var(--border-default)] py-3 pl-5">
      <p className="doc-type-body max-w-[52ch] text-[var(--color-quiet-ink)]">
        This view is bound in <span className="font-mono">{track}</span>. The
        Room shell, directory, and navigation contract are in place around it.
      </p>
    </div>
  );
}

/**
 * R94 — the studio's pencil-idiom empty-state teach: what/why in Playfair
 * italic, an en-dash lead, and at most one next move. No card or illustration.
 */
export function EmptyTeach({
  children,
  action,
}: {
  children: ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <p className="px-1 py-8 font-heading text-[15px] italic leading-relaxed text-[var(--color-aged-oak)]">
      – {children}
      {action && (
        <>
          {' '}
          <button
            type="button"
            onClick={action.onClick}
            className="inline-flex min-h-11 items-center font-body text-[16px] font-medium not-italic text-[var(--text-primary)] underline decoration-[var(--color-aged-oak)] decoration-1 underline-offset-4 transition-colors hover:text-[var(--color-mocha)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none"
          >
            {action.label} <span aria-hidden>→</span>
          </button>
        </>
      )}
    </p>
  );
}
