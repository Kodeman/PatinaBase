'use client';

/**
 * The D13 bottom sheets. Paper sheets are document parts (spine, margin item,
 * timer); the drawer is the desk's book list (its six books open the
 * existing charcoal DocSheet ledgers via the open-ledger event — Library,
 * People, and Rooms are Rooms, so the same event walks them in instead). One
 * scrim, scrim-tap dismiss; no shadows (D4). Document/drawer sheets stop at
 * 1180px; the timer alone remains the compact spine's sheet through 1439px.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMarginItems } from '@/hooks/use-margin-items';
import { useCoordinationItems } from '@patina/supabase';
import {
  classifyMarginItems,
  marginDecisionClassificationState,
  MarginDecisionClassificationNotice,
} from '@/lib/document/stage2-approval-exclusions';
import { useDocumentTime } from '@/hooks/document-time-provider';
import {
  marginAccent,
  deriveKindLine,
  partitionMargin,
  type MarginItemRow,
} from '@/lib/document/margin-derivation';
import { ACTIVITIES, fmtElapsed } from '@/lib/document/time-derivation';
import { MarginItemBody } from '../margin-bodies';
import { useHandoffGates } from '../margin-handoff-item';
import { overdueStampLabel } from '@/lib/document/overdue-condition';
import { StrataMark } from '../strata-mark';
import { fillStateAtSection } from '@/lib/document/fill-state';
import { openLedger } from '../command-bar';
import { openAccount } from '../account/account-sheet';
import { MobileAccountHeader } from '../account/mobile-account-header';
import { DocumentAction, DocumentActionRow } from '../document-action';
import { lockBodyScroll } from '../overlays/body-scroll-lock';
import {
  isElementRendered,
  topActiveModalDialog,
} from '../overlays/active-dialog';
import { useMobileShell } from './mobile-shell';

const SHEET_FOCUSABLE = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[contenteditable="true"]:not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableSheetControls(panel: HTMLElement) {
  return Array.from(
    panel.querySelectorAll<HTMLElement>(SHEET_FOCUSABLE),
  ).filter((control) => {
    const style = window.getComputedStyle(control);
    return (
      !control.hidden &&
      !control.matches(':disabled') &&
      control.getAttribute('aria-disabled') !== 'true' &&
      !control.closest('[hidden], [aria-hidden="true"], [inert]') &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    );
  });
}

const LEDGERS: {
  key: string;
  name: string;
  spine: string;
  count: string;
  weight: 'room' | 'sheet';
}[] = [
  // D14: Library, People, and Rooms are Rooms (walk in); the rest are Sheets
  // (pulled over). `name` must lowercase to the registry key — openLedger()
  // dispatches `name.toLowerCase()` and the drawer matches on `key`.
  {
    key: 'library',
    name: 'Library',
    spine: 'var(--color-clay)',
    count: 'a room · walk in',
    weight: 'room',
  },
  {
    key: 'orders',
    name: 'Orders',
    spine: 'var(--color-dusty-blue)',
    count: 'cross-engagement POs',
    weight: 'sheet',
  },
  {
    key: 'accounts',
    name: 'Accounts',
    spine: 'var(--color-sage)',
    count: 'revenue · A/R',
    weight: 'sheet',
  },
  {
    key: 'people',
    name: 'People',
    spine: 'var(--color-terracotta)',
    count: 'a room · walk in',
    weight: 'room',
  },
  {
    key: 'rooms',
    name: 'Rooms',
    spine: 'var(--color-aged-oak)',
    count: 'a room · walk in',
    weight: 'room',
  },
  {
    key: 'hours',
    name: 'Hours',
    spine: 'var(--color-mocha)',
    count: 'this week',
    weight: 'sheet',
  },
];

const MOBILE_MORE_DOORWAY =
  '[data-mobile-edge-owner="document-bar"] [aria-label="More studio actions"]';

const SHEET_RETURN_FALLBACKS: Record<
  'drawer' | 'timer' | 'spine' | 'margin-item',
  readonly string[]
> = {
  drawer: ['[data-studio-books-doorway]', MOBILE_MORE_DOORWAY],
  timer: [
    '[data-compact-spine-timer-doorway]',
    '[data-full-spine-timer] [data-action-key="open-manual-time-entry"]',
    MOBILE_MORE_DOORWAY,
    '[data-studio-books-doorway]',
  ],
  spine: ['[data-document-spine] button', MOBILE_MORE_DOORWAY],
  'margin-item': [
    '[data-margin-trigger]',
    '[data-document-spine] button',
    MOBILE_MORE_DOORWAY,
  ],
};

function focusMobileMoreDoorway() {
  document
    .querySelector<HTMLButtonElement>(MOBILE_MORE_DOORWAY)
    ?.focus({ preventScroll: true });
}

function restoreSheetFocus(
  kind: keyof typeof SHEET_RETURN_FALLBACKS,
  captured: HTMLElement | null,
) {
  window.requestAnimationFrame(() => {
    // A drawer action may replace this sheet with a DocSheet in the same
    // commit. That new modal owns focus; never pull it back to shell chrome.
    if (topActiveModalDialog()) return;

    const candidates = [
      captured,
      ...SHEET_RETURN_FALLBACKS[kind].flatMap((selector) =>
        Array.from(document.querySelectorAll<HTMLElement>(selector)),
      ),
    ];
    const target = candidates.find((candidate): candidate is HTMLElement =>
      Boolean(candidate?.isConnected && isElementRendered(candidate)),
    );
    target?.focus({ preventScroll: true });
  });
}

function Sheet({
  tone,
  kind,
  onClose,
  children,
}: {
  tone: 'paper' | 'dark';
  kind: 'drawer' | 'timer' | 'spine' | 'margin-item';
  onClose: () => void;
  children: React.ReactNode;
}) {
  const compactTimer = kind === 'timer';
  const dialogRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const kindRef = useRef(kind);
  closeRef.current = onClose;
  kindRef.current = kind;

  useEffect(() => {
    const activeElement = document.activeElement;
    const returnFocusTarget =
      activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : null;
    const unlockBodyScroll = lockBodyScroll();
    const focusFrame = window.requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
    });
    const onKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      const panel = panelRef.current;
      if (!dialog || !panel || topActiveModalDialog() !== dialog) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }

      if (event.key !== 'Tab' || event.defaultPrevented) return;
      const controls = focusableSheetControls(panel);
      if (controls.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }

      const first = controls[0];
      const last = controls[controls.length - 1];
      const active = document.activeElement;
      if (active === panel || !panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKeyDown, true);
      unlockBodyScroll();
      restoreSheetFocus(kindRef.current, returnFocusTarget);
    };
  }, []);

  return (
    <div
      ref={dialogRef}
      id={compactTimer ? 'mobile-timer-sheet' : undefined}
      data-mobile-sheet-kind={kind}
      data-mobile-sheet-regime={
        compactTimer ? 'through-1439' : 'below-1180-only'
      }
      className={`fixed inset-0 z-[58] ${
        compactTimer ? 'min-[1440px]:hidden' : 'min-[1180px]:hidden'
      }`}
      role="dialog"
      aria-label={compactTimer ? 'Time in hand' : undefined}
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Dismiss"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[rgba(44,41,38,0.5)]"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        data-mobile-sheet-panel
        className={`absolute inset-x-0 bottom-0 max-h-[80%] overflow-y-auto rounded-t-[14px] pb-[max(0.9rem,env(safe-area-inset-bottom))] motion-safe:animate-[doc-sheet-up_250ms_var(--ease-editorial)] ${
          tone === 'paper'
            ? 'border-t border-[var(--doc-ink-border)] bg-[var(--doc-paper)]'
            : 'border-t border-[rgba(250,247,242,0.18)] bg-[var(--color-charcoal)]'
        } ${
          compactTimer
            ? 'min-[1180px]:left-14 min-[1180px]:right-auto min-[1180px]:w-[28rem] min-[1180px]:rounded-tr-[14px]'
            : ''
        }`}
      >
        <div
          className={`mx-auto mb-1 mt-[9px] h-[4px] w-[36px] rounded-full ${
            tone === 'paper'
              ? 'bg-[var(--color-pearl)]'
              : 'bg-[rgba(250,247,242,0.2)]'
          }`}
        />
        <div className="px-[1.1rem] pb-2 pt-1">{children}</div>
      </div>
    </div>
  );
}

export function MobileSheets() {
  const { sheet, activeDoc, closeSheet, openMarginItem, openSpine } =
    useMobileShell();
  const router = useRouter();
  const projectId = activeDoc?.projectId ?? null;
  const proposalId = activeDoc?.proposalId ?? null;
  const { data: items } = useMarginItems(projectId, proposalId);
  const coordinationQuery = useCoordinationItems(projectId);
  const coordinationItems = coordinationQuery.data;
  const classificationState = marginDecisionClassificationState({
    projectId,
    coordinationItems,
    isLoading:
      coordinationQuery.isLoading === true ||
      coordinationQuery.isPending === true,
    isError: coordinationQuery.isError === true,
  });
  const classifiedMargin = useMemo(
    () =>
      classifyMarginItems(
        items ?? [],
        coordinationItems ?? [],
        classificationState,
      ),
    [classificationState, coordinationItems, items],
  );
  const visibleItems = classifiedMargin.items;

  const { raised, settled } = useMemo(
    () => partitionMargin(visibleItems, new Date()),
    [visibleItems],
  );
  const allItems = useMemo(() => [...raised, ...settled], [raised, settled]);
  // Ruling III: handoffs are margin items, so the mobile summary counts and
  // lists them too — otherwise the highest-ranked thing in the margin is the
  // one thing mobile never mentions.
  const handoffNow = useMemo(() => new Date(), []);
  const { gates: handoffGates } = useHandoffGates({
    projectId,
    clientName: activeDoc?.clientName ?? '',
    now: handoffNow,
  });
  const sheetKind = sheet?.kind ?? null;

  useEffect(() => {
    if (!sheetKind) return;

    const validRegime = window.matchMedia(
      sheetKind === 'timer' ? '(max-width: 1439px)' : '(max-width: 1179px)',
    );
    const closeOutsideRegime = () => {
      if (!validRegime.matches) closeSheet();
    };

    closeOutsideRegime();
    validRegime.addEventListener('change', closeOutsideRegime);
    return () => validRegime.removeEventListener('change', closeOutsideRegime);
  }, [closeSheet, sheetKind]);

  if (!sheet) return null;

  // ── Drawer: the six books ──
  if (sheet.kind === 'drawer') {
    return (
      <Sheet tone="dark" kind="drawer" onClose={closeSheet}>
        {/* The maker's nameplate — tap to open the Account sheet (identity,
            status, settings, sign out). Distinct from the money "Accounts" book
            in the list below. */}
        <MobileAccountHeader
          onOpen={() => {
            focusMobileMoreDoorway();
            closeSheet();
            openAccount();
          }}
        />
        <h2 className="mt-3 font-heading text-[1.05rem] text-[var(--color-pearl)]">
          The drawer{' '}
          <em className="italic text-[var(--color-clay)]">· six books</em>
        </h2>
        <p className="mt-0.5 text-[14px] text-[rgba(250,247,242,0.58)]">
          Pulled over whatever you&apos;re holding. Put back when done.
        </p>
        <ul className="mt-2">
          {LEDGERS.map((l) => (
            <li key={l.key}>
              <button
                type="button"
                onClick={() => {
                  focusMobileMoreDoorway();
                  closeSheet();
                  openLedger(l.name);
                }}
                className="flex w-full items-center gap-3 border-b border-[rgba(250,247,242,0.08)] py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--color-clay)]"
              >
                {l.weight === 'room' ? (
                  <span
                    aria-hidden
                    className="flex shrink-0 flex-col gap-[2px]"
                  >
                    <i className="block h-[2px] w-[15px] rounded-[1px] bg-[var(--color-clay)]" />
                    <i className="block h-[2px] w-[11px] rounded-[1px] bg-[var(--color-clay)] opacity-60" />
                    <i className="block h-[2px] w-[7px] rounded-[1px] bg-[var(--color-clay)] opacity-30" />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="h-[18px] w-[3px] shrink-0 rounded-[1px]"
                    style={{ background: l.spine }}
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-heading text-[14px] font-medium text-[rgba(250,247,242,0.9)]">
                    {l.name}
                    {l.weight === 'room' && (
                      <span
                        aria-hidden
                        className="ml-1.5 font-mono text-[12px] text-[var(--color-clay)] opacity-70"
                      >
                        ↗
                      </span>
                    )}
                  </span>
                  <span className="block font-mono text-[12px] uppercase tracking-[0.05em] text-[rgba(250,247,242,0.58)]">
                    {l.count}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    );
  }

  // ── Timer (paper) ──
  if (sheet.kind === 'timer') {
    return (
      <Sheet tone="paper" kind="timer" onClose={closeSheet}>
        <MobileTimerSheet />
      </Sheet>
    );
  }

  // ── Spine (paper): sections + "In the margin · N" (D3-3) ──
  if (sheet.kind === 'spine') {
    const open = allItems.filter((i) => i.kind !== 'time');
    return (
      <Sheet tone="paper" kind="spine" onClose={closeSheet}>
        <button
          type="button"
          onClick={() => {
            closeSheet();
            router.push('/desk');
          }}
          className="block min-h-11 w-full border-b border-[var(--color-pearl)] py-2 text-left font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]"
        >
          ← Put down · back to the Desk
        </button>
        <ul className="mt-1">
          {(activeDoc?.sections ?? []).map((s) => {
            const inner = (
              <>
                <StrataMark
                  size="sm"
                  fill={fillStateAtSection(s.key)}
                  breathing={s.state === 'active'}
                />
                <span className={s.state === 'future' ? 'opacity-45' : ''}>
                  <span
                    className={`block text-[14px] ${
                      s.state === 'active'
                        ? 'font-semibold text-[var(--color-charcoal)]'
                        : s.state === 'settled'
                          ? 'text-[var(--color-aged-oak)]'
                          : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {s.label}
                  </span>
                  <span className="block font-mono text-[12px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                    {s.sub}
                  </span>
                </span>
              </>
            );
            // Settled + active rows jump to (and unfold) their section via the
            // page's open-section listener; future rows stay inert.
            return (
              <li key={s.key}>
                {s.state === 'future' ? (
                  <div className="flex items-center gap-2.5 py-2">{inner}</div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      closeSheet();
                      window.dispatchEvent(
                        new CustomEvent('document:open-section', {
                          detail: s.key,
                        }),
                      );
                    }}
                    className="flex w-full items-center gap-2.5 py-2 text-left"
                  >
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {/* R25: room headings as jump rows — tap lands on the heading. */}
        {(activeDoc?.rooms ?? []).length > 0 && (
          <>
            <p className="mt-3 border-t border-[var(--color-pearl)] pt-2.5 font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
              Rooms
            </p>
            <ul className="mt-1">
              {(activeDoc?.rooms ?? []).map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      closeSheet();
                      document
                        .getElementById(`doc-room-${r.id}`)
                        ?.scrollIntoView({
                          block: 'start',
                          behavior: 'smooth',
                        });
                    }}
                    className="block w-full py-1.5 text-left font-heading text-[13px] italic text-[var(--color-charcoal)]"
                  >
                    {r.name}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="mt-3 border-t border-[var(--color-pearl)] pt-2.5 font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
          In the margin · {raised.length + handoffGates.length}
        </p>
        <MarginDecisionClassificationNotice
          state={classifiedMargin.decisionState}
        />
        {handoffGates.length > 0 && (
          <ul className="mt-1">
            {handoffGates.map((gate) => (
              <li
                key={gate.id}
                className="mb-1.5 flex w-full items-start gap-2 rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2.5 py-2 text-left"
                style={{ borderLeft: '2.5px solid var(--color-golden-hour)' }}
              >
                <span className="text-[14px] leading-snug text-[var(--color-charcoal)]">
                  {gate.lane} · {gate.terms}
                </span>
                {overdueStampLabel(gate.overdue) && (
                  <span
                    className="ml-auto shrink-0 font-mono text-[12px] font-semibold uppercase tracking-[0.04em]"
                    style={{ color: 'var(--color-charcoal)' }}
                  >
                    {overdueStampLabel(gate.overdue)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {open.length === 0 && handoffGates.length === 0 ? (
          <p className="py-1.5 text-[14px] italic text-[var(--text-muted)]">
            The margin — decisions, messages, and money gather here.
          </p>
        ) : open.length === 0 ? null : (
          <ul className="mt-1">
            {open.map((row) => (
              <li key={`${row.kind}-${row.item_id}`}>
                <button
                  type="button"
                  onClick={() => openMarginItem(row.item_id)}
                  className="mb-1.5 flex w-full items-start gap-2 rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2.5 py-2 text-left"
                  style={{
                    borderLeft: `2.5px solid ${marginAccent(row.kind).border}`,
                  }}
                >
                  <span
                    className="mt-px shrink-0 font-mono text-[12px] font-semibold uppercase tracking-[0.06em]"
                    style={{ color: marginAccent(row.kind).label }}
                  >
                    {deriveKindLine(row)}
                  </span>
                  <span className="text-[14px] leading-snug text-[var(--color-charcoal)]">
                    {row.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    );
  }

  // ── Margin item (paper): the full item + its actions (D3-2) ──
  if (sheet.kind === 'margin-item') {
    const row = allItems.find((i) => i.item_id === sheet.itemId);
    if (!row) {
      // The item left the list (resolved/refetch) — fall back to the spine.
      openSpine();
      return null;
    }
    return (
      <Sheet tone="paper" kind="margin-item" onClose={closeSheet}>
        <span
          className="mb-1 block font-mono text-[12px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: marginAccent(row.kind).label }}
        >
          {deriveKindLine(row)}
        </span>
        <h2 className="font-heading text-[1rem] font-medium leading-tight text-[var(--color-charcoal)]">
          {row.title}
        </h2>
        {row.kind !== 'time' && (
          <div className="mt-1">
            <MarginItemBody
              row={row}
              projectId={projectId}
              clientName={activeDoc?.clientName ?? ''}
              decisionRows={allItems.filter((i) => i.kind === 'decision')}
            />
          </div>
        )}
      </Sheet>
    );
  }

  return null;
}

function MobileTimerSheet() {
  const {
    heldProjectId,
    running,
    paused,
    elapsedSeconds,
    pause,
    resume,
    manualLog,
  } = useDocumentTime();
  const [minutes, setMinutes] = useState('');
  const [activity, setActivity] = useState('design');
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!heldProjectId) setFormOpen(false);
  }, [heldProjectId]);

  const parsed = parseInt(minutes, 10);
  const valid = Number.isFinite(parsed) && parsed >= 1;

  return (
    <div data-mobile-timer-sheet-content>
      <span className="doc-type-meta font-semibold uppercase tracking-[0.08em] text-[var(--color-quiet-ink)]">
        In hand{paused ? ' · paused' : ''}
      </span>
      <p className="mb-2 mt-1 font-mono text-[26px] tracking-[0.04em] text-[var(--color-charcoal)]">
        {fmtElapsed(elapsedSeconds)}
      </p>
      <div className="flex flex-wrap gap-2">
        {running && (
          <button
            type="button"
            onClick={pause}
            className={`${BTN} min-h-11 min-w-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]`}
          >
            Pause
          </button>
        )}
        {paused && (
          <button
            type="button"
            onClick={resume}
            className={`${BTN} min-h-11 min-w-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]`}
          >
            Resume
          </button>
        )}
        <DocumentAction
          actionKey="open-manual-time-entry"
          surfaceKey="mobile-timer"
          regionKey="timer-controls"
          variant="secondary"
          onClick={() => setFormOpen((v) => !v)}
        >
          + Log manually
        </DocumentAction>
      </div>
      {formOpen && (
        <div className="mt-3 space-y-2">
          <input
            type="number"
            min={1}
            placeholder="Minutes"
            aria-label="Minutes"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="doc-type-control min-h-11 w-full rounded-[5px] border border-[var(--color-pearl)] bg-white px-2.5 py-2 text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
          />
          <select
            aria-label="Activity"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            className="doc-type-control min-h-11 w-full rounded-[5px] border border-[var(--color-pearl)] bg-white px-2.5 py-2 text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
          >
            {ACTIVITIES.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
          <DocumentActionRow
            surfaceKey="mobile-timer"
            regionKey="manual-time-entry"
            aria-label="Manual time entry actions"
          >
            <DocumentAction
              actionKey="add-manual-time-entry"
              variant="primary"
              disabled={!valid || busy}
              loading={busy}
              loadingLabel="Adding…"
              onClick={async () => {
                setBusy(true);
                try {
                  await manualLog(parsed, activity);
                  setMinutes('');
                  setFormOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Add entry
            </DocumentAction>
          </DocumentActionRow>
        </div>
      )}
      <p className="mt-3 text-[14px] italic text-[var(--text-muted)]">
        Pick up = clock in. Put down = you decide what logs. Nothing bills
        itself.
      </p>
    </div>
  );
}

const BTN =
  'doc-type-meta min-h-11 min-w-11 rounded-[4px] border border-[var(--color-pearl)] px-3 py-2 font-medium text-[var(--color-charcoal)] active:border-[var(--color-clay)]';
