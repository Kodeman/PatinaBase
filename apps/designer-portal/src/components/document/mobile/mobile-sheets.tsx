"use client";

/**
 * The D13 bottom sheets. Paper sheets are document parts (spine, margin item,
 * timer); the drawer is the desk's book list (its six books open the
 * existing charcoal DocSheet ledgers via the open-ledger event — Library,
 * People, and Rooms are Rooms, so the same event walks them in instead). One
 * scrim, scrim-tap dismiss; no shadows (D4). Document/drawer sheets stop at
 * 1180px; the timer alone remains the compact spine's sheet through 1439px.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMarginItems } from "@/hooks/use-margin-items";
import { useCoordinationItems } from "@patina/supabase";
import {
  classifyMarginItems,
  marginDecisionClassificationState,
  MarginDecisionClassificationNotice,
} from "@/lib/document/stage2-approval-exclusions";
import { useDocumentTime } from "@/hooks/document-time-provider";
import {
  marginAccent,
  deriveKindLine,
  partitionMargin,
  type MarginItemRow,
} from "@/lib/document/margin-derivation";
import { ACTIVITIES, fmtElapsed } from "@/lib/document/time-derivation";
import { MarginItemBody } from "../margin-bodies";
import { useLetterheadMargin } from "@/hooks/use-letterhead-margin";
import { overdueStampLabel } from "@/lib/document/overdue-condition";
import { openLedger } from "../command-bar";
import { openAccount } from "../account/account-sheet";
import { MobileAccountHeader } from "../account/mobile-account-header";
import { DocumentAction, DocumentActionRow } from "../document-action";
import { lockBodyScroll } from "../overlays/body-scroll-lock";
import {
  isElementRendered,
  topActiveModalDialog,
} from "../overlays/active-dialog";
import { useMobileShell } from "./mobile-shell";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { boardsRoutePath } from "@/lib/document/registry";
import {
  paperRegionsForSection,
  DOCUMENT_INDEX_LABELS,
  requestRegionUnfold,
  type DocumentIndexKey,
} from "@/lib/document/document-index";
import { scrollToRegion } from "@/hooks/use-document-running-index";

const SHEET_FOCUSABLE = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[contenteditable="true"]:not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableSheetControls(panel: HTMLElement) {
  return Array.from(
    panel.querySelectorAll<HTMLElement>(SHEET_FOCUSABLE),
  ).filter((control) => {
    const style = window.getComputedStyle(control);
    return (
      !control.hidden &&
      !control.matches(":disabled") &&
      control.getAttribute("aria-disabled") !== "true" &&
      !control.closest('[hidden], [aria-hidden="true"], [inert]') &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  });
}

const LEDGERS: {
  key: string;
  name: string;
  spine: string;
  count: string;
  weight: "room" | "sheet";
}[] = [
  // D14: Library, People, and Rooms are Rooms (walk in); the rest are Sheets
  // (pulled over). `name` must lowercase to the registry key — openLedger()
  // dispatches `name.toLowerCase()` and the drawer matches on `key`.
  {
    key: "library",
    name: "Library",
    spine: "var(--color-clay)",
    count: "a room · walk in",
    weight: "room",
  },
  {
    key: "orders",
    name: "Orders",
    spine: "var(--color-dusty-blue)",
    count: "cross-engagement POs",
    weight: "sheet",
  },
  {
    key: "accounts",
    name: "Accounts",
    spine: "var(--color-sage)",
    count: "revenue · A/R",
    weight: "sheet",
  },
  {
    key: "people",
    name: "People",
    spine: "var(--color-terracotta)",
    count: "a room · walk in",
    weight: "room",
  },
  {
    key: "rooms",
    name: "Rooms",
    spine: "var(--color-aged-oak)",
    count: "a room · walk in",
    weight: "room",
  },
  {
    key: "hours",
    name: "Hours",
    spine: "var(--color-mocha)",
    count: "this week",
    weight: "sheet",
  },
];

const MOBILE_MORE_DOORWAY =
  '[data-mobile-edge-owner="document-bar"] [aria-label="More studio actions"]';

const SHEET_RETURN_FALLBACKS: Record<
  "drawer" | "timer" | "spine" | "margin-item" | "margin",
  readonly string[]
> = {
  drawer: ["[data-studio-books-doorway]", MOBILE_MORE_DOORWAY],
  timer: [
    // The studio drawer's `In hand today` clock is the timer's doorway at
    // every width from W1; the spine's two (`[data-compact-spine-timer-doorway]`,
    // `[data-full-spine-timer]`) went with `spine-timer.tsx` (OD-16).
    "[data-drawer-timer-doorway]",
    MOBILE_MORE_DOORWAY,
    "[data-studio-books-doorway]",
  ],
  spine: ["[data-document-spine] button", MOBILE_MORE_DOORWAY],
  "margin-item": [
    "[data-margin-trigger]",
    "[data-document-spine] button",
    MOBILE_MORE_DOORWAY,
  ],
  // D-B30: the door is the first row of More's "In this document" list.
  margin: ['[data-mobile-document-door="margin"]', MOBILE_MORE_DOORWAY],
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

/** One accessible name per sheet kind — every `role="dialog"` this file opens
 *  names itself, the sections sheet included (it carried none before). */
const SHEET_ARIA_LABEL: Record<
  "drawer" | "timer" | "spine" | "margin-item" | "margin",
  string
> = {
  drawer: "Studio actions",
  timer: "Time in hand",
  spine: "Sections of this document",
  "margin-item": "Margin item",
  margin: "The margin",
};

function Sheet({
  tone,
  kind,
  onClose,
  children,
}: {
  tone: "paper" | "dark";
  kind: "drawer" | "timer" | "spine" | "margin-item" | "margin";
  onClose: () => void;
  children: React.ReactNode;
}) {
  const compactTimer = kind === "timer";
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

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }

      if (event.key !== "Tab" || event.defaultPrevented) return;
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

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown, true);
      unlockBodyScroll();
      restoreSheetFocus(kindRef.current, returnFocusTarget);
    };
  }, []);

  return (
    <div
      ref={dialogRef}
      id={compactTimer ? "mobile-timer-sheet" : undefined}
      data-mobile-sheet-kind={kind}
      // W1 — the timer sheet lost its ceiling with `spine-timer.tsx`: the
      // studio drawer's clock is its doorway at 1440 too, so it is the one
      // sheet with no width regime at all.
      data-mobile-sheet-regime={
        compactTimer ? "every-width" : "below-1180-only"
      }
      className={`fixed inset-0 z-[58] ${
        compactTimer ? "" : "min-[1180px]:hidden"
      }`}
      role="dialog"
      aria-label={SHEET_ARIA_LABEL[kind]}
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
          tone === "paper"
            ? "border-t border-[var(--doc-ink-border)] bg-[var(--doc-paper)]"
            : "border-t border-[rgba(250,247,242,0.18)] bg-[var(--color-charcoal)]"
        } ${
          compactTimer
            ? "min-[1180px]:left-14 min-[1180px]:right-auto min-[1180px]:w-[28rem] min-[1180px]:rounded-tr-[14px]"
            : ""
        }`}
      >
        <div
          className={`mx-auto mb-1 mt-[9px] h-[4px] w-[36px] rounded-full ${
            tone === "paper"
              ? "bg-[var(--color-pearl)]"
              : "bg-[rgba(250,247,242,0.2)]"
          }`}
        />
        <div className="px-[1.1rem] pb-2 pt-1">{children}</div>
      </div>
    </div>
  );
}

/** D-B30 — a compact identity line for the margin sheet's row. Only the
 *  fields already on `MarginItemRow` (no per-item detail fetch, which lives
 *  in the margin-item sheet this row opens). */
function marginRowOwner(row: MarginItemRow): string {
  switch (row.kind) {
    case "decision":
    case "pulse":
      return "Client";
    case "message":
      return (row.payload.sender_name as string | undefined) ?? "Client";
    case "invoice":
      return row.payload.po_payment
        ? ((row.payload.vendor_name as string | undefined) ?? "Vendor")
        : "Client";
    case "note":
      return (row.payload.author_name as string | undefined) ?? "You";
    case "field_sms":
      return (row.payload.party_kind as string | undefined) === "vendor"
        ? "Vendor"
        : "Field";
    case "time":
      return "";
  }
}

/** D-B30 — the row's one inline act label, sharing the wording the
 *  margin-item sheet's own body renders (`margin-bodies.tsx`) rather than a
 *  second table. See the comment above the `'margin'` sheet branch for why
 *  the button opens that sheet instead of firing the act from here. */
function marginRowActLabel(row: MarginItemRow): string {
  switch (row.kind) {
    case "decision":
      if (row.state === "expired") return "Extend & reopen";
      if (row.state === "responded") return "Open the record";
      return row.payload.reminder_sent_at ? "Nudge again" : "Send a nudge";
    case "message":
      return "Reply";
    case "invoice":
      if (row.payload.po_payment) return "Open the folio";
      return row.state === "draft" ? "Review & send invoice" : "Open the folio";
    case "pulse":
      return row.state === "sent" ? "Open" : "Send Pulse";
    case "note":
      return row.state === "escalated" ? "Open" : "Client decision";
    case "field_sms":
      return row.state === "needs_review"
        ? "Review on the desk"
        : "Open the thread";
    case "time":
      return "Open";
  }
}

export function MobileSheets({
  ladderValues: ladderValuesProp,
}: {
  /** W2-L1's per-stop derivation. This sheet mounts in
   *  `(document)/layout.tsx`, above the page that derives them, so in product
   *  the values ride `MobileActiveDoc`; the prop is the direct route tests
   *  take. */
  ladderValues?: Partial<Record<DocumentIndexKey, string>>;
} = {}) {
  const { sheet, activeDoc, closeSheet, openMarginItem, openSpine } =
    useMobileShell();
  const ladderValues = ladderValuesProp ?? activeDoc?.ladderValues ?? {};
  const router = useRouter();
  const { value: callSheetOn } = useFeatureFlag("call-sheet");
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
  // Still the whole margin (every anchor kind) — the margin-item sheet below
  // opens any item, line-anchored ones included.
  const allItems = useMemo(() => [...raised, ...settled], [raised, settled]);
  // D-B30: the letterhead- and section-anchored subset + handoff gates, for
  // the Margin sheet (and the bar's door count) — the same hook the deleted
  // 390 chips block used, so the two never disagree.
  const clientName = activeDoc?.clientName ?? "";
  const letterheadMargin = useLetterheadMargin({
    projectId,
    proposalId,
    clientName,
  });
  const sheetKind = sheet?.kind ?? null;

  useEffect(() => {
    if (!sheetKind) return;
    // The timer sheet has no width regime any more: from W1 it is the only
    // place Pause / Resume / `+ Log manually` live, and the studio drawer's
    // clock opens it at 1440 as well as below. Every other sheet still closes
    // when the compact regime ends.
    if (sheetKind === "timer") return;

    const validRegime = window.matchMedia("(max-width: 1179px)");
    const closeOutsideRegime = () => {
      if (!validRegime.matches) closeSheet();
    };

    closeOutsideRegime();
    validRegime.addEventListener("change", closeOutsideRegime);
    return () => validRegime.removeEventListener("change", closeOutsideRegime);
  }, [closeSheet, sheetKind]);

  if (!sheet) return null;

  // ── Drawer: the six books ──
  if (sheet.kind === "drawer") {
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
          The drawer{" "}
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
                {l.weight === "room" ? (
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
                    {l.weight === "room" && (
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
  if (sheet.kind === "timer") {
    return (
      <Sheet tone="paper" kind="timer" onClose={closeSheet}>
        <MobileTimerSheet />
      </Sheet>
    );
  }

  // ── Spine (paper): the ladder for the open spread + "In the margin · N"
  //    (D3-3, W2 reconciliation §13/OD-14). The whole-document section
  //    stepper this sheet used to print is retired: the ladder names the
  //    six regions of the spread actually in hand, which is what the
  //    desktop rail's LensLadder prints for the same spread. ──
  if (sheet.kind === "spine") {
    const activeSectionKey =
      activeDoc?.sections.find((s) => s.state === "active")?.key ?? null;
    const ladderRegions = activeSectionKey
      ? paperRegionsForSection(activeSectionKey)
      : [];
    return (
      <Sheet tone="paper" kind="spine" onClose={closeSheet}>
        <button
          type="button"
          onClick={() => {
            closeSheet();
            router.push("/desk");
          }}
          className="block min-h-11 w-full border-b border-[var(--color-pearl)] py-2 text-left font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]"
        >
          ← Put down · back to the Desk
        </button>
        <ul className="mt-1">
          {ladderRegions.map((region) => {
            const current = activeDoc?.readingIndex === region.key;
            const value = ladderValues[region.key];
            return (
              <li key={region.key}>
                <button
                  type="button"
                  aria-current={current ? "true" : undefined}
                  onClick={() => {
                    closeSheet();
                    requestRegionUnfold(region.key);
                    scrollToRegion(region.key, projectId ?? "");
                  }}
                  className={`flex min-h-11 w-full flex-col justify-center gap-0.5 py-1.5 text-left ${
                    current ? "doc-room-lifted" : ""
                  }`}
                >
                  <span
                    className={`block text-[14px] ${
                      current
                        ? "font-semibold text-[var(--color-charcoal)]"
                        : "text-[var(--color-charcoal)]"
                    }`}
                  >
                    {DOCUMENT_INDEX_LABELS[region.key]}
                  </span>
                  {value && (
                    <span className="block truncate font-mono text-[12px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                      {value}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {/* Override 3 — the four doors every spread scoped to a project
            opens; a pre-work document with no project behind it prints
            none (OD-8). */}
        {projectId && (
          <>
            <p className="mt-3 border-t border-[var(--color-pearl)] pt-2.5 font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
              Filed with this job
            </p>
            <ul className="mt-1">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    closeSheet();
                    router.push(`/doc/${projectId}/plans`);
                  }}
                  className="flex min-h-11 w-full items-center py-1.5 text-left font-heading text-[14px] text-[var(--color-charcoal)]"
                >
                  Plan room
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    closeSheet();
                    router.push(`/doc/${projectId}/spec-book`);
                  }}
                  className="flex min-h-11 w-full items-center py-1.5 text-left font-heading text-[14px] text-[var(--color-charcoal)]"
                >
                  Spec book
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    closeSheet();
                    router.push(boardsRoutePath(projectId));
                  }}
                  className="flex min-h-11 w-full items-center py-1.5 text-left font-heading text-[14px] text-[var(--color-charcoal)]"
                >
                  Boards
                </button>
              </li>
              {callSheetOn && (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      closeSheet();
                      window.dispatchEvent(
                        new CustomEvent("document:open-call-sheet", {
                          detail: { mode: "sheet" },
                        }),
                      );
                    }}
                    className="flex min-h-11 w-full items-center py-1.5 text-left font-heading text-[14px] text-[var(--color-charcoal)]"
                  >
                    Call sheet
                  </button>
                </li>
              )}
            </ul>
          </>
        )}

        {/* DL-04 — the fifth door, on the proposal spread that carries a
            client's copy. The leaf is the page's state, so the sheet asks for
            it by the same wire the call sheet uses rather than holding a
            second copy of it. */}
        {activeDoc?.clientCopy && (
          <>
            {!projectId && (
              <p className="mt-3 border-t border-[var(--color-pearl)] pt-2.5 font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
                Filed with this job
              </p>
            )}
            <ul className={projectId ? "" : "mt-1"}>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    closeSheet();
                    window.dispatchEvent(
                      new CustomEvent("document:open-leaf", {
                        detail: { leaf: "clientcopy" },
                      }),
                    );
                  }}
                  className="flex min-h-11 w-full items-center py-1.5 text-left font-heading text-[14px] text-[var(--color-charcoal)]"
                >
                  The client’s copy
                </button>
              </li>
            </ul>
          </>
        )}

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
                          block: "start",
                          behavior: "smooth",
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
      </Sheet>
    );
  }

  // ── Margin (paper): the letterhead- and section-anchored items + handoff
  //    gates that used to print as chips between the band and the first
  //    region (D-B30). Moved out of the spine sheet above, which keeps only
  //    sections and the doors. Each item's own act lives in the margin-item
  //    sheet (openMarginItem, below) — the inline act here shares that act's
  //    label rather than re-deriving or firing it blind from a compact row;
  //    the real act needs the item's own fetched detail (decision options,
  //    invoice lines, a thread) this list does not hold, so duplicating a
  //    live mutation here would risk a second, divergent path (§5's one-act
  //    invariant). ──
  if (sheet.kind === "margin") {
    const {
      items: marginItems,
      gates,
      decisionState,
      showDecisionNotice,
      count,
      overdueCount,
    } = letterheadMargin;
    return (
      <Sheet tone="paper" kind="margin" onClose={closeSheet}>
        <h2 className="font-heading text-[1.05rem] text-[var(--color-charcoal)]">
          Margin{" "}
          <span className="font-mono text-[13px] font-normal text-[var(--color-aged-oak)]">
            · {count}
          </span>
        </h2>
        {overdueCount > 0 && (
          <p className="mt-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-terracotta-ink)]">
            {overdueCount} overdue
          </p>
        )}
        {showDecisionNotice && (
          <MarginDecisionClassificationNotice state={decisionState} />
        )}
        {gates.length > 0 && (
          <ul className="mt-2">
            {gates.map((gate) => (
              <li
                key={gate.id}
                className="mb-1.5 flex w-full items-start gap-2 rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2.5 py-2 text-left"
                style={{ borderLeft: "2.5px solid var(--color-golden-hour)" }}
              >
                <span className="text-[14px] leading-snug text-[var(--color-charcoal)]">
                  {gate.lane} · {gate.terms}
                </span>
                {overdueStampLabel(gate.overdue) && (
                  <span
                    className="ml-auto shrink-0 font-mono text-[12px] font-semibold uppercase tracking-[0.04em]"
                    style={{ color: "var(--color-charcoal)" }}
                  >
                    {overdueStampLabel(gate.overdue)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {marginItems.length === 0 && gates.length === 0 ? (
          <p className="mt-2 py-1.5 text-[14px] italic text-[var(--text-muted)]">
            The margin — decisions, messages, and money gather here.
          </p>
        ) : marginItems.length === 0 ? null : (
          <ul className="mt-2">
            {marginItems.map((row) => (
              <li
                key={`${row.kind}-${row.item_id}`}
                data-margin-row
                className="mb-1.5 flex items-stretch gap-2 rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)]"
                style={{
                  borderLeft: `2.5px solid ${marginAccent(row.kind).border}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => openMarginItem(row.item_id)}
                  className="min-w-0 flex-1 px-2.5 py-2 text-left"
                >
                  <span
                    className="block font-mono text-[12px] font-semibold uppercase tracking-[0.06em]"
                    style={{ color: marginAccent(row.kind).label }}
                  >
                    {deriveKindLine(row)}
                  </span>
                  <span className="mt-0.5 block text-[14px] leading-snug text-[var(--color-charcoal)]">
                    {row.title}
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                    {marginRowOwner(row)}
                  </span>
                </button>
                <button
                  type="button"
                  data-margin-row-act
                  onClick={() => openMarginItem(row.item_id)}
                  className="shrink-0 self-center px-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-clay-ink)]"
                >
                  {marginRowActLabel(row)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    );
  }

  // ── Margin item (paper): the full item + its actions (D3-2) ──
  if (sheet.kind === "margin-item") {
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
        {row.kind !== "time" && (
          <div className="mt-1">
            <MarginItemBody
              row={row}
              projectId={projectId}
              clientName={activeDoc?.clientName ?? ""}
              decisionRows={allItems.filter((i) => i.kind === "decision")}
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
  const [minutes, setMinutes] = useState("");
  const [activity, setActivity] = useState("design");
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
        In hand{paused ? " · paused" : ""}
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
                  setMinutes("");
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
  "doc-type-meta min-h-11 min-w-11 rounded-[4px] border border-[var(--color-pearl)] px-3 py-2 font-medium text-[var(--color-charcoal)] active:border-[var(--color-clay)]";
