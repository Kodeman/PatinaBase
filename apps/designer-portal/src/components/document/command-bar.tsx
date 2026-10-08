'use client';

/**
 * The ⌘K command bar (spec §3): every destination is a document or a ledger,
 * never a zone. Documents render with their fill-state Strata Mark (R15) —
 * the mark answers "how far" right in the result row. Ledgers dispatch an
 * `open-ledger` event the Studio Drawer owns (the drawer holds sheet state).
 *
 * R93 — the Populated Palette: a clean ⌘K opens ALREADY POPULATED, grouped
 * under DM-mono eyebrows (In hand · Recent · This surface · Begin · Rooms &
 * ledgers · Studio) rather than a blank prompt. Every room/ledger/verb is read
 * from the single Studio Surface Registry (registry.tsx) — one icon, one
 * shortcut, no parallel list — so a surface renamed there changes here at once.
 *
 * R38 — the Engine speaks here, with no mode. The same box jumps to a
 * destination OR, for the current query, offers "Ask the Engine" as the last
 * row; choosing it answers inline in paper result-lines, each carrying one act:
 * Place → [document]. The ask leaves no thread; only the placement persists.
 *
 * F1 telemetry rides through `documentEvents.commandBar.*` /
 * `documentEvents.wayfinding.*` — opened (hotkey vs affordance), queried
 * (debounced), selected, zeroResult, and door-opened for room/ledger picks.
 *
 * R3-clean: this is a Document-local paper surface, NOT a design-system
 * Command/Dialog primitive — no shadows, ink border, flat edges.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { FolderPlus, History, Keyboard, LifeBuoy, Presentation, Type } from 'lucide-react';
import { useDeskEngagements } from '@/hooks/use-desk-engagements';
import {
  usePeopleDirectory,
  useProjectFFEItems,
  useProjectInvoices,
  useRecentBoards,
  type PeopleDirectoryRow,
  type RecentBoard,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { openAccount } from './account/account-sheet';
import { openInvoiceComposer, openInvoiceFolio } from './accounts/invoice-overlays';
import { openPost } from './overlays/post-sheet';
import {
  BAND_ACT_SELECTOR,
  isElementRendered,
  topActiveModalDialog,
} from './overlays/active-dialog';
import { openFeedbackSheet } from './feedback/open-feedback';
import { useMobilePrimaryActionValue, type MobilePrimaryAction } from './mobile/mobile-shell';
import { openHelp } from '@/lib/help-system/open-help';
import { openLogTime } from './log-time-sheet';
import { openKeys } from './overlays/keys-sheet';
import { THE_WORDS_HREF } from '@/lib/help-system/keys-reference';
import { CHANGES_HREF, TEACHING_SYSTEM_FLAG } from '@/lib/teaching/constants';
import { HELP_EVENTS, safeCapture } from '@/lib/help-system/help-events';
import { openDraftProposalPicker } from './rooms/drafting/draft-proposal-opener';
import { fillStateForDesk, type FillState } from '@/lib/document/fill-state';
import {
  deskMotion,
  deskNeedText,
  folderTab,
  type DeskFolder,
  type DocumentStateRow,
  type MotionChip,
  type SectionKey,
} from '@/lib/document/desk-derivation';
import {
  DOCUMENT_SCOPED_SURFACES,
  FOCUS_FFE_LINE_EVENT,
  STUDIO_ROOMS,
  STUDIO_LEDGERS,
  STUDIO_VERBS,
  boardsRoutePath,
  focusFfeLinePending,
  landRecordPayment,
  matchPaperSynonyms,
  matchSurfaces,
  type StudioSurface,
} from '@/lib/document/registry';
import { NAMED_ACTS, NEED_ACT_LABELS, STAGE_WORD, ownAct } from '@/lib/document/act-names';
import { installReading } from '@/lib/document/install-reading';
import {
  deriveLineStamp,
  lineStampLabel,
  type LineStampInput,
} from '@/lib/document/stamp-derivation';
import {
  paperRegionsForSection,
  regionHeadingId,
  requestRegionUnfold,
  type DocumentIndexKey,
} from '@/lib/document/document-index';
import { openDraftingRoom } from '@/lib/document/open-drafting-room';
import {
  documentEvents,
  readRecentDocumentsInHand,
  type RecentDocumentInHand,
} from '@/lib/analytics/document-events';
import { authEvents } from '@/lib/analytics/events';
import { StrataMark } from './strata-mark';
import { EngineResults, type InDocument } from './engine/engine-results';
import {
  recentBoardCommandDescriptor,
  startBoardCommandDescriptor,
} from '@/lib/mood-board/navigation';
import { startBoardPending } from '@/lib/document/shelves';
import { DECK_IMPORT_FLAG, DECK_OPEN_EVENT } from '@/hooks/use-board-deck-import-layout';

/** One selectable line. `match` is the lowercased filter text (label + aliases
 *  or keywords); registry surfaces additionally carry their icon + wayfinding
 *  shortcut. Documents keep the Strata Mark as their glyph. */
type PaletteRow =
  | {
      kind: 'document';
      key: string;
      label: string;
      sub: string;
      fill?: FillState;
      hint?: string;
      run: () => void;
      match: string;
    }
  | {
      kind: 'room' | 'ledger' | 'verb';
      key: string;
      label: string;
      sub: string;
      icon: LucideIcon;
      shortcut?: string[];
      run: () => void;
      match: string;
    }
  | {
      kind: 'action';
      key: string;
      label: string;
      sub: string;
      icon?: LucideIcon;
      run: () => void;
      match: string;
    }
  | {
      kind: 'help';
      key: string;
      label: string;
      sub: string;
      icon: LucideIcon;
      /** FR2 507-5 — only the one-voice `Keys` door carries its `?` hint. */
      shortcut?: string[];
      run: () => void;
      match: string;
    }
  | { kind: 'person'; key: string; label: string; sub: string; run: () => void; match: string }
  | { kind: 'engine'; key: string; label: string; sub: string; match: string }
  | {
      // US-19 D4 — a line, region or reading on the paper in hand. `act` is
      // the act Enter takes, printed `↵ {act}` at the row's end.
      kind: 'paper';
      key: string;
      label: string;
      sub: string;
      act?: string;
      run: () => void;
      match: string;
    };

interface PaletteSection {
  eyebrow: string | null;
  rows: PaletteRow[];
  /** US-19 D4 — a printed line above the rows (the dry query's sentence). */
  note?: string;
}

/** FR3 F3-5 — a ⌘K row for the band's Next lands as the band's press does:
 *  the press the letterhead registered for the dock's centre (D7). */
function pressBandNext(next: MobilePrimaryAction) {
  if (next.target.kind === 'press') next.target.onPress();
}

/** US-19 slice 1 — ⌘K searches the open paper, fail-closed. */
const ASK_THE_PAPER_FLAG = 'ask-the-paper';

/** The FF&E row fields ⌘K reads off `useProjectFFEItems` (an untyped hook). */
type PaperLine = LineStampInput & {
  id: string;
  name: string | null;
  vendor_name: string | null;
  po_number?: string | null;
  doc_code?: string | null;
  product?: { brand?: string | null } | null;
  room?: { name?: string | null } | null;
  purchase_order?: {
    po_number?: string | null;
    vendor_po_number?: string | null;
    delivered_date?: string | null;
    confirmed_eta?: string | null;
  } | null;
};

/** The invoice fields ⌘K reads off `useProjectInvoices` (R29). */
type PaperInvoice = { id: string; invoice_number: string | null; status: string };

/** D1's own act for a project paper with nothing to spec or release — the
 *  dry query's first row. Read from act-names, never retyped. */
const QUIET_FACTS = {
  inquiryOpen: false,
  firstMissingEssential: null,
  proposalState: null,
  clientFirstName: null,
  unspecifiedCount: 0,
  releaseEligible: false,
  install: null,
} as const;
const OPEN_THE_PIECES = ownAct('project', QUIET_FACTS)!.label;

/** US-19 FR2 F2-14 / 499-8(5) — under `one-voice` the Contract Room door is
 *  Direction's own act, `Write the proposal`, never `Open the Contract Room`. */
const WRITE_THE_PROPOSAL = ownAct('direction', QUIET_FACTS)!.label;

/** The PO a line prints, in the Order cell's own precedence. */
function linePoNumber(line: PaperLine): string | null {
  const po = line.purchase_order;
  return po?.po_number ?? po?.vendor_po_number ?? line.po_number ?? null;
}

/** Lift the in-hand paper's lines and invoices into the palette. A child, not
 *  a hook call in `CommandBar`, so the queries run only while the flag is on
 *  and a project paper is in hand — flag off, ⌘K fetches nothing new. Same
 *  arguments as `FFESection` and the Money region (R29), so it reads those
 *  queries' cache entries. */
function PaperLinesSource({
  projectId,
  onLines,
}: {
  projectId: string;
  onLines: (
    lines: { projectId: string; lines: PaperLine[]; invoices: PaperInvoice[] } | null,
  ) => void;
}) {
  const { data } = useProjectFFEItems(projectId, undefined, { withLifecycle: true }) as {
    data: PaperLine[] | undefined;
  };
  const { data: invoices } = useProjectInvoices(projectId) as {
    data: PaperInvoice[] | undefined;
  };
  useEffect(() => {
    onLines(data ? { projectId, lines: data, invoices: invoices ?? [] } : null);
  }, [data, invoices, onLines, projectId]);
  return null;
}

// The two context-boosted THIS-SURFACE icons, pulled from the registry so they
// can never drift from the canonical verb/room marks.
const DRAW_INVOICE_ICON = STUDIO_VERBS.find((v) => v.key === 'draw-invoice')!.icon;
const DRAFTING_ROOM_ICON = STUDIO_ROOMS.find((r) => r.key === 'drafting-room')!.icon;
// D4' — the ⌘K "Start a board…" creation command borrows the same glyph the
// Boards door itself wears, so a designer sees one icon for boards throughout.
const START_BOARD_ICON = DOCUMENT_SCOPED_SURFACES.find((s) => s.key === 'boards')!.icon;

/** F04 — how each live stage is named in `Where the work stands`. Five of the
 *  seven print the direction's own words; brief and care take the same shape. */
const STAGE_LABELS: Record<SectionKey, string> = {
  brief: 'In brief',
  discovery: 'In discovery',
  direction: 'In direction',
  proposal: 'Out for signature',
  project: 'In procurement',
  install: 'In install',
  care: 'In care',
};

/** Furthest along first: the work nearest the field leads the register. */
const STAGE_ORDER: SectionKey[] = [
  'care',
  'install',
  'project',
  'proposal',
  'direction',
  'discovery',
  'brief',
];

/** What is true of a live document right now — a folder's need line, or an
 *  in-motion chip's own text. Structural so this reads both Desk populations
 *  without importing either shape. */
function liveLine(entry: {
  need?: { text?: string } | null;
  text?: string | null;
}): string | null {
  return entry.need?.text ?? entry.text ?? null;
}

/** Set true by {@link openCaptureLead} when the front door is invoked from a
 *  non-Desk surface; the Desk reads + clears it on mount so the sheet opens
 *  after the navigation lands (the event fires before the Desk's listener is
 *  registered). A plain module flag — the Desk and the command bar are the only
 *  readers. */
export const captureLeadPending = { value: false };

/** Open the Desk's capture-lead front door from anywhere (the Desk listens).
 *  The sheet is mounted on the Desk; ⌘K reaches it via this event so "new lead"
 *  works whether or not you're standing on the Desk. When invoked off the Desk,
 *  the caller routes there and the pending flag carries the intent across. */
export function openCaptureLead() {
  captureLeadPending.value = true;
  window.dispatchEvent(new CustomEvent('document:open-capture-lead'));
}

/** R79 — same pattern as {@link openCaptureLead}: the OpenProjectSheet is
 *  mounted on the Desk; the pending flag carries the intent across a
 *  navigation from any other surface. */
export const openProjectPending = { value: false };

export function openOpenProject() {
  openProjectPending.value = true;
  window.dispatchEvent(new CustomEvent('document:open-open-project'));
}

/** R28/R29/R36 pre-addressing: optional context rides the open-ledger event —
 *  e.g. Brief-a-vendor opens the Orders book onto the Vendors page with the
 *  project in hand; an overdue-invoice Desk need opens the Accounts book onto
 *  Receivables with that invoice in hand. `page` is a free string so each book
 *  validates its own page set (Orders: ledger/week/receiving/vendors; Accounts:
 *  ledger/receivables/earnings). */
export interface OpenLedgerContext {
  page?: string;
  vendorId?: string;
  projectId?: string;
  invoiceId?: string;
  /** C-22: the Orders ledger opens this PO's money band unfolded. */
  purchaseOrderId?: string;
  /** US-19 F3-22 (517-1): the vendor page's own sub-page (Orders: terms /
   *  thread / orders), validated by the book like `page`. */
  vendorPage?: string;
  /** US-19 F3-22 (517-1): the field the landing puts focus on (Orders vendor
   *  terms: `orders-email`). */
  focus?: string;
}

/** Open a Studio Drawer ledger from anywhere (the drawer listens). */
export function openLedger(name: string, context?: OpenLedgerContext) {
  window.dispatchEvent(
    new CustomEvent('document:open-ledger', {
      detail: context ? { name: name.toLowerCase(), context } : name.toLowerCase(),
    }),
  );
}

/** Open the command bar from a click affordance (the Desk's "Find anything").
 *  `query` pre-types the palette — the Desk's stage phrases open ⌘K already
 *  filtered to that stage. */
export function openCommandBar(query?: string) {
  window.dispatchEvent(
    new CustomEvent('document:open-command-bar', {
      detail: query ? { query } : undefined,
    }),
  );
}

/** R79/`openCaptureLead` pattern — the Call Sheet is mounted on `/doc/[id]`
 *  and nowhere else, so a doorway that names a document NOT in hand has to
 *  walk there first: the event fires before that page's listener exists, and
 *  this flag carries the intent across the navigation. The document reads and
 *  clears it on mount. */
export const callSheetPending = { value: false };

/* B03 — the palette a screen reader can drive. The input is not inside the
   list it moves through, so the active row has to be NAMED (aria-activedescendant
   against these ids) rather than merely tinted; the arrow keys below are
   unchanged, and focus never leaves the input. */
const OPTION_ID_PREFIX = 'command-bar-option-';
const optionId = (index: number) => `${OPTION_ID_PREFIX}${index}`;

/* The list is a DOM sibling of the input, so the active option is not a
   descendant of the element that holds focus. ARIA's containment rule for
   aria-activedescendant is satisfied the two ways it allows from a combobox:
   the input OWNS this listbox, and it CONTROLS it. One listbox with a group
   per section — not a listbox per section — so there is one thing to own. */
const RESULTS_ID = 'command-bar-results';

export function CommandBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { data } = useDeskEngagements();
  // The missing noun beside documents + ledgers (G3): every party in the
  // unified directory is ⌘K-reachable. Small per-designer roster — fetched once
  // and filtered in memory like the rest of the rows.
  // Wave 4 (00420) scope ruling — ⌘K person search stays STUDIO-wide on
  // purpose: searching the whole studio's book is correct here (it's a
  // lookup, not a relationship-action queue), and people-room.tsx's deep-link
  // resolution depends on ⌘K being able to surface a studio-mate's party.
  const { data: people } = usePeopleDirectory();
  const { data: recentBoards = [] } = useRecentBoards(8);
  // Account actions (Settings / Sign out) belong to the "do anything" surface;
  // the identity itself is answered by the persistent nameplate.
  const { user, signOut } = useAuth();
  // D1 registry precedent (drafting-room-here): document-scoped surfaces only
  // ever appear as a "This surface" row, gated on both a project in hand and
  // the surface's own flag — never in the unfiltered doorway lists.
  // "Leave a note" is the Tester Notes doorway; without the flag the widget is
  // not mounted and the row would dispatch its open event into nothing.
  const { value: testerNotesOn } = useFeatureFlag('tester-notes');
  // Return teaching: "What changed" is gated on the teaching system flag,
  // fail-closed — hidden while the flag loads and while it's off.
  const { value: teachingNotesOn } = useFeatureFlag(TEACHING_SYSTEM_FLAG);
  // US-15 — "Bring in a deck", fail-closed on its own flag.
  const { value: deckImportOn } = useFeatureFlag(DECK_IMPORT_FLAG);
  // US-19 D4 — ⌘K searches the open paper first. Fail-closed.
  const { value: askThePaperOn } = useFeatureFlag(ASK_THE_PAPER_FLAG);
  // US-19 D1/Q4 (`one-voice`) — `Where the work stands` names each stage by
  // one of the seven words. Fail-closed.
  const oneVoice = useFeatureFlag('one-voice').value === true;
  // US-19 FR3 F3-5 — the band's Next, as the letterhead registers it for the
  // dock's centre (D7): its act, its sentence, and the band's own press.
  const primaryAction = useMobilePrimaryActionValue();
  const bandNext =
    oneVoice &&
    primaryAction?.regionKey === 'lens-band' &&
    primaryAction.target.kind === 'press' &&
    !primaryAction.disabled
      ? primaryAction
      : null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [asking, setAsking] = useState<string | null>(null);
  // The in-hand paper's lines (PaperLinesSource), and whether the designer
  // chose `Search all jobs` for this query — the studio-wide list, as today.
  const [paperLines, setPaperLines] = useState<{
    projectId: string;
    lines: PaperLine[];
    invoices: PaperInvoice[];
  } | null>(null);
  const [searchAll, setSearchAll] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  // The recent-documents MRU (localStorage) — re-read on each open so a fresh
  // "Recent" group reflects where the designer has actually been.
  const [recent, setRecent] = useState<RecentDocumentInHand[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  // F21 — the element that had focus when ⌘K opened, restored on close.
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // The query a doorway asked the palette to open with, read and cleared by
  // the open effect.
  const pendingQueryRef = useRef<string | null>(null);
  // R97 — skip the mount emission so we only announce real open/close transitions.
  const didMountRef = useRef(false);

  // ⌘K / Ctrl-K toggles; Esc closes (but yields to a deeper overlay first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!open) documentEvents.commandBar.opened({ source: 'hotkey' });
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        e.stopPropagation();
        if (asking) setAsking(null);
        else if (searchAll) {
          // R23 — Esc steps back from all jobs to the paper's own results.
          setSearchAll(false);
          setActive(0);
          inputRef.current?.focus();
        } else {
          // FR3 F3-17 (`one-voice`) — with nothing focused when ⌘K opened,
          // the first Esc lands on the band's act rather than on <body>.
          if (oneVoice && !restoreFocusRef.current) {
            restoreFocusRef.current = document.querySelector<HTMLElement>(BAND_ACT_SELECTOR);
          }
          setOpen(false);
        }
      }
    };
    // The Desk header's "Find anything" button dispatches this — an affordance,
    // not the hotkey (F1 source attribution). `detail.query` pre-types the
    // palette (the Desk's stage phrases): it is stashed rather than set here
    // because the open effect below clears the query on every open.
    const onAffordance = (event: Event) => {
      const query = (event as CustomEvent<{ query?: string }>).detail?.query;
      pendingQueryRef.current = typeof query === 'string' ? query : null;
      if (!open) documentEvents.commandBar.opened({ source: 'affordance' });
      setOpen(true);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    window.addEventListener('document:open-command-bar', onAffordance);
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      window.removeEventListener('document:open-command-bar', onAffordance);
    };
  }, [open, asking, searchAll, oneVoice]);

  // F21 — restore focus to whatever opened ⌘K when it closes. Captured here
  // (not read fresh on close) because by close time the palette's own last
  // focused row/input is `document.activeElement`, not the opener.
  // <body>-avoiding: a capture of `document.activeElement === document.body`
  // (nothing was meaningfully focused — e.g. the hotkey fired with focus
  // already nowhere) restores to nothing rather than parking focus back on
  // the page root. Matches margin-rail.tsx / overlays/doc-sheet.tsx.
  useEffect(() => {
    if (open) {
      const activeElement = document.activeElement;
      restoreFocusRef.current =
        activeElement instanceof HTMLElement && activeElement !== document.body
          ? activeElement
          : null;
      setQuery(pendingQueryRef.current ?? '');
      pendingQueryRef.current = null;
      setActive(0);
      setAsking(null);
      setSearchAll(false);
      setRecent(readRecentDocumentsInHand());
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    const focusTarget = restoreFocusRef.current;
    restoreFocusRef.current = null;
    if (!focusTarget?.isConnected) return;
    requestAnimationFrame(() => {
      // A chosen row closes the palette and runs its act in one handler, so a
      // sheet the row opened has already taken focus by the time this frame
      // runs — restoring here would pull focus back out of an open modal.
      // margin-rail.tsx:141 gates its own focus move the same way.
      if (topActiveModalDialog()) return;
      // Connected is not enough: a display:none opener (a shelf button after
      // the shelf force-closes below 1440) swallows focus() to <body>.
      if (focusTarget.isConnected && isElementRendered(focusTarget)) {
        focusTarget.focus();
      }
    });
  }, [open]);

  // R97 — announce the palette's open state so the Desk Walkthrough can pause
  // (its document-level Enter/Esc handler would otherwise advance/skip the tour
  // while the user is typing here). Skip the mount emission (open starts false).
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    window.dispatchEvent(
      new CustomEvent(open ? 'document:command-bar-opened' : 'document:command-bar-closed'),
    );
  }, [open]);

  // The engagement in hand (if the route is /doc/[id]) — the "In hand" row and
  // the pre-addressing of THIS-SURFACE verbs both read off it. Works for any
  // engagement kind (a proposal carries no project_id, so `inDocument` below
  // stays project-scoped for the Engine, but the row still resumes).
  const inHandRow = useMemo<DocumentStateRow | null>(() => {
    const m = pathname?.match(/^\/doc\/(.+)$/);
    const docId = m?.[1] ?? null;
    if (!docId || !data) return null;
    // The LIVE population, not folders + chips: a document with neither a need
    // nor a motion is in neither of those, and losing it here loses the
    // `In hand` row and every `This surface` act with it.
    return (data.live ?? []).find((r) => r.engagement_id === docId) ?? null;
  }, [pathname, data]);

  // The document in hand for the Engine (R38) — Place → targets it directly.
  // Project-scoped: a still-drafting proposal has no project to place into.
  const inDocument = useMemo<InDocument | null>(() => {
    const pid = inHandRow?.project_id;
    return pid ? { projectId: pid, projectName: folderTab(inHandRow!) } : null;
  }, [inHandRow]);

  const { rendered, flatRows, matchCount } = useMemo(() => {
    const liveDocs = [...(data?.folders ?? []), ...(data?.chips ?? [])];
    // Every live document the Desk saw — see `stageRows` below for why the two
    // derived populations above are not that.
    const liveRows = data?.live ?? [];
    const liveByEngagement = new Map(liveRows.map((r) => [r.engagement_id, r]));

    const documentRow = (r: DocumentStateRow, hint?: string): PaletteRow => ({
      kind: 'document',
      key: `doc:${r.engagement_id}`,
      label: folderTab(r),
      sub: r.title,
      fill: fillStateForDesk(r),
      hint,
      run: () => router.push(`/doc/${r.engagement_id}`),
      match: `${folderTab(r)} ${r.title}`.toLowerCase(),
    });

    // A recent MRU entry: prefer the live Desk row (truthful fill + household);
    // an off-Desk memory falls back to its stored title and a neutral clay mark.
    // F13 — the row prints the document's FULL TITLE. Two documents in one
    // household used to print as two rows reading the same bold family word.
    const recentRow = (entry: RecentDocumentInHand): PaletteRow => {
      const live = liveByEngagement.get(entry.id);
      const title = live?.title ?? entry.title;
      const household = live ? folderTab(live) : (entry.subtitle ?? '');
      return {
        kind: 'document',
        key: `doc:${entry.id}`,
        label: title,
        sub: household,
        ...(live ? { fill: fillStateForDesk(live) } : {}),
        run: () => router.push(`/doc/${entry.id}`),
        match: `${title} ${household}`.toLowerCase(),
      };
    };

    const recentBoardRow = (board: RecentBoard): PaletteRow => {
      const command = recentBoardCommandDescriptor(board, pathname);
      return {
        kind: 'document',
        ...command,
        run: () => router.push(command.href),
      };
    };

    const personRow = (p: PeopleDirectoryRow): PaletteRow => ({
      kind: 'person',
      key: `person:${p.role}:${p.person_id}`,
      // F4 (NAT-23): deep-link onto the exact profile via ?person=, not the bare
      // People Room. The People Room honors ?person= to select the party.
      label: p.display_name,
      sub: `${p.role} · jump to person →`,
      run: () => router.push(`/people?person=${p.person_id}`),
      match: `${p.display_name} ${p.role}`.toLowerCase(),
    });

    // A still-drafting proposal in hand can be walked into the Drafting Room
    // (R93 THIS-SURFACE). Read cheaply off the row we already have — no fetch.
    const draftingProposalId =
      inHandRow &&
      inHandRow.engagement_kind === 'proposal' &&
      inHandRow.proposal_status === 'draft'
        ? inHandRow.proposal_id
        : null;

    // One handler per registry surface, all wired to the openers the drawer/desk
    // already use (R93: no parallel action list). Rooms + orders/accounts/hours
    // route through the drawer's open-ledger event by their registry key; The
    // Post opens its own sheet; the Drafting Room needs a proposal in hand (else
    // it falls to the draft-a-proposal picker, the doorway when none is held).
    const runForSurface = (s: StudioSurface): (() => void) => {
      switch (s.key) {
        case 'capture-lead':
          return () => {
            if (pathname !== '/desk') router.push('/desk');
            openCaptureLead();
          };
        case 'open-project':
          return () => {
            if (pathname !== '/desk') router.push('/desk');
            openOpenProject();
          };
        case 'draft-proposal':
          return () => openDraftProposalPicker();
        case 'draw-invoice':
          return () => openInvoiceComposer();
        // W3 — the one verb that is NOT gated on a document in hand. The
        // "Draw an invoice · <household>" row above appears only with one
        // open, which is exactly when the auto-timer is already running and
        // no form is wanted.
        case 'log-time':
          return () => openLogTime();
        case 'add-maker':
          return () => router.push('/people?add=maker');
        case 'the-post':
          return () => openPost();
        case 'call-sheet':
          // Document-scoped (no standalone destination): the sheet is mounted
          // on /doc/[id] and listens for this event; off that surface it's a
          // silent no-op, same posture as document:open-section.
          return () => window.dispatchEvent(new CustomEvent('document:open-call-sheet'));
        case 'drafting-room':
          return () =>
            openDraftingRoom({
              proposalId: draftingProposalId,
              navigate: (href) => router.push(href),
            });
        default:
          return () => openLedger(s.key);
      }
    };

    // F29/F48/F50/F82 — the four surfaces a document scopes: plan room, spec
    // book, boards, call sheet. `paired` is the off-document form, where
    // the row names the document it will act on (`Spec book · Vandersteen`).
    const runForDocumentSurface = (
      surface: StudioSurface,
      target: DocumentStateRow,
    ): (() => void) => {
      switch (surface.key) {
        case 'plan-room':
          return () => router.push(`/doc/${target.engagement_id}/plans`);
        case 'spec-book':
          return () => router.push(`/doc/${target.project_id}/spec-book`);
        case 'boards':
          return () => router.push(boardsRoutePath(target.engagement_id));
        default:
          // Document-scoped with no standalone destination: the roster sheet is
          // mounted on /doc/[id] and listens for this event. Off that document
          // the event has no listener, so the row walks there first and the
          // pending flag carries the intent across the navigation.
          return () => {
            if (target.engagement_id === inHandRow?.engagement_id) {
              window.dispatchEvent(new CustomEvent('document:open-call-sheet'));
              return;
            }
            callSheetPending.value = true;
            router.push(`/doc/${target.engagement_id}`);
          };
      }
    };

    const documentSurfaceRow = (
      surface: StudioSurface,
      target: DocumentStateRow,
      paired: boolean,
    ): PaletteRow => ({
      kind: surface.kind === 'ledger' ? 'ledger' : 'room',
      key: `${surface.key}-here`,
      label: paired ? `${surface.label} · ${folderTab(target)}` : surface.label,
      sub: paired ? target.title : (surface.subLabel ?? 'this project'),
      icon: surface.icon,
      run: runForDocumentSurface(surface, target),
      match: [surface.label, ...surface.aliases].join(' ').toLowerCase(),
    });

    const surfaceRow = (s: StudioSurface): PaletteRow => {
      const row: PaletteRow = {
        // Host surfaces (Desk, Document) exist only to answer the help panel —
        // they are absent from every list this builds rows from, so the branch
        // is unreachable; it exists to keep the palette's own kind union closed.
        kind: s.kind === 'host' ? 'room' : s.kind,
        key: s.key,
        label: s.label,
        sub: s.subLabel ?? (s.kind === 'room' ? 'room ↗' : 'ledger'),
        icon: s.icon,
        shortcut: s.shortcut,
        run: runForSurface(s),
        match: [s.label, ...s.aliases].join(' ').toLowerCase(),
      };
      // FR2 F2-14 — the Contract Room row is Direction's act row.
      return oneVoice && s.key === 'drafting-room'
        ? {
            ...row,
            kind: 'verb',
            label: WRITE_THE_PROPOSAL,
            match: `${WRITE_THE_PROPOSAL} ${row.match}`.toLowerCase(),
          }
        : row;
    };

    // The studio's own controls — F5 adds "Browse the Help Center" (distinct
    // from the contextual "Help…" panel). Kept filterable so "sign out",
    // "settings", "feedback" still resolve when typed.
    const allUtilityRows: PaletteRow[] = [
      {
        kind: 'help',
        key: 'help-center',
        icon: LifeBuoy,
        label: 'Browse the Help Center',
        sub: 'guides · every surface',
        run: () => router.push('/help'),
        match: 'browse help center guides support articles every surface',
      },
      {
        // Return teaching: the pull door to What changed. No dot, no count.
        kind: 'help',
        key: 'what-changed',
        icon: History,
        label: 'What changed',
        sub: 'changes to the Document, newest first',
        run: () => router.push(CHANGES_HREF),
        match: 'what changed changes release notes updates recent the document',
      },
      {
        // L5 — "The keys": the reference opens as an overlay over whatever is
        // in hand, not a route, so ⌘K never costs you your place. FR2 507-5 —
        // under `one-voice` the leftover `The keys` is gone: the one door is
        // `Keys` with its `?` hint, as the paper's act row prints it.
        kind: 'help',
        key: 'the-keys',
        icon: Keyboard,
        label: oneVoice ? 'Keys' : 'The keys',
        sub: oneVoice ? '' : 'shortcuts, one page',
        ...(oneVoice ? { shortcut: ['?'] } : {}),
        run: () => openKeys('palette'),
        match: 'keys shortcuts keyboard hotkeys chords the keys',
      },
      {
        // L5 — "The words": the Ideas & vocabulary shelf, the glossary's home.
        kind: 'help',
        key: 'the-words',
        icon: Type,
        label: 'The words',
        sub: 'what Patina calls things',
        run: () => {
          safeCapture(HELP_EVENTS.GLOSSARY_OPENED, { source: 'palette' });
          router.push(THE_WORDS_HREF);
        },
        match: 'words glossary vocabulary terms language what things are called the words',
      },
      {
        kind: 'action',
        key: 'help-panel',
        label: 'Help…',
        sub: 'about this surface',
        run: () => openHelp(),
        match: 'help guide docs how to support question learn about this surface',
      },
      {
        // R97 — replay the Desk Walkthrough. Routes to /desk with the replay
        // param; the walkthrough reads it, restart()s, and strips the param.
        kind: 'action',
        key: 'take-walkthrough',
        label: 'Take the walkthrough',
        sub: 'the Desk, in a minute',
        run: () => router.push('/desk?tour=desk-walkthrough'),
        match: 'walkthrough tour show me around orientation intro take the walkthrough',
      },
      {
        kind: 'action',
        key: 'leave-note',
        label: 'Leave a note',
        sub: 'feedback on this screen',
        run: () => openFeedbackSheet(),
        match: 'feedback note comment bug idea working missing change suggestion leave a note',
      },
      {
        kind: 'action',
        key: 'desk',
        label: 'The Desk',
        sub: 'go home',
        run: () => router.push('/desk'),
        match: 'the desk go home',
      },
      {
        kind: 'action',
        key: 'interruptions',
        label: 'Interruptions',
        sub: 'break-through settings',
        run: () => window.dispatchEvent(new CustomEvent('document:open-interruptions')),
        match: 'interruptions break-through settings notifications',
      },
      {
        kind: 'action',
        key: 'settings',
        label: 'Settings',
        sub: 'profile · notifications · security',
        run: openAccount,
        match: 'account profile preferences settings security notifications devices password studio',
      },
      {
        kind: 'action',
        key: 'signout',
        label: 'Sign out',
        sub: user?.email ?? 'end this session',
        run: () => {
          authEvents.logout();
          void signOut();
        },
        match: 'log out logout sign off leave sign out',
      },
    ];
    const utilityRows: PaletteRow[] = allUtilityRows.filter(
      (row) =>
        (row.key !== 'leave-note' || testerNotesOn) &&
        (row.key !== 'what-changed' || teachingNotesOn),
    );

    const addToProjectRow: PaletteRow | null = inHandRow?.project_id && inHandRow.active_section === 'project'
      ? {
          kind: 'verb',
          key: 'add-to-project-here',
          label: 'Add to the job',
          sub: 'this project · Library, link, need, import, or board',
          icon: FolderPlus,
          run: () => window.dispatchEvent(new CustomEvent('document:open-add-to-project', {
            detail: { source: 'command_palette' },
          })),
          match: 'add to project selection ffe furniture library product link import board need',
        }
      : null;
    // US-19 D5 — under `ask-the-paper` the act is `Record a change`, offered at
    // project as well as install and care, and it opens the router (SQ-1B
    // listens) rather than the amendment sheet directly.
    const addChangeRow: PaletteRow | null = askThePaperOn
      ? inHandRow?.project_id &&
        (inHandRow.active_section === 'project' ||
          inHandRow.active_section === 'install' ||
          inHandRow.active_section === 'care')
        ? {
            kind: 'verb',
            key: 'record-a-change-here',
            label: NAMED_ACTS.recordChange,
            sub: 'on a piece or on the agreement',
            icon: FolderPlus,
            run: () =>
              window.dispatchEvent(
                new CustomEvent('document:open-record-a-change', {
                  detail: { origin: 'cmdk' },
                }),
              ),
            match: NAMED_ACTS.recordChange.toLowerCase(),
          }
        : null
      : inHandRow?.project_id &&
      (inHandRow.active_section === 'install' || inHandRow.active_section === 'care')
      ? {
          kind: 'verb',
          key: 'add-project-change-here',
          label: 'Add a change',
          sub: 'this project · amendment workflow',
          icon: FolderPlus,
          run: () => window.dispatchEvent(new CustomEvent('document:open-project-change')),
          match: 'add change amendment project scope',
        }
      : null;

    // F04 — `Where the work stands`: one row per live stage, reduced from the
    // Desk's LIVE rows. No new query; the data is loaded either way.
    //
    // Not `liveDocs`: that is folders + chips, the two DERIVED populations —
    // a document with neither a need nor a motion is in neither, and chips are
    // capped at MAX_MOTION_CHIPS. Counting the studio's stages off them prints
    // an undercount, and a calm studio prints no group at all.
    // FR2 F2-2 — under `one-voice` a stage row's sub-line is the Desk's own
    // sentence (`deskNeedText`) and never prints the word `Band` (R17).
    const lineOf = (entry: DeskFolder | MotionChip): string | null =>
      !oneVoice
        ? liveLine(entry)
        : 'need' in entry
          ? entry.need
            ? deskNeedText(entry.need, true)
            : liveLine(entry)
          : (deskMotion(entry, true)?.text ?? null);
    const lineByEngagement = new Map(
      liveDocs.map((entry) => [entry.row.engagement_id, lineOf(entry)]),
    );
    const stageLabels = oneVoice ? STAGE_WORD : STAGE_LABELS;
    const stageRows: PaletteRow[] = STAGE_ORDER.flatMap((stage) => {
      const inStage = liveRows.filter((r) => r.active_section === stage);
      if (inStage.length === 0) return [];
      // The row a stage opens is the one that has something to say — a need or
      // a motion — so the sub-line is never blank while a live line exists.
      const head =
        inStage.find((r) => lineByEngagement.get(r.engagement_id)) ?? inStage[0];
      const titles = inStage.map((r) => r.title);
      const headLine = lineByEngagement.get(head.engagement_id) ?? null;
      const sub =
        inStage.length === 1
          ? [titles[0], headLine].filter(Boolean).join(' · ')
          : titles.slice(0, 2).join(' · ') +
            (inStage.length > 2 ? ` · +${inStage.length - 2} more` : '');
      return [
        {
          kind: 'document' as const,
          key: `stage:${stage}`,
          label: `${stageLabels[stage]} · ${inStage.length}`,
          sub,
          fill: fillStateForDesk(head),
          run: () => router.push(`/doc/${head.engagement_id}`),
          match: [
            stageLabels[stage],
            stage,
            ...titles,
            ...inStage.map((r) => lineByEngagement.get(r.engagement_id) ?? null),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase(),
        },
      ];
    });

    // The document the four document-scoped surfaces act on: the one in hand,
    // else the most recent project document the Desk knows about. Off that
    // document the rows print paired, so the row says which job it opens.
    const inHandProjectRow = inHandRow?.project_id ? inHandRow : null;
    const pairedDoc: DocumentStateRow | null =
      inHandProjectRow ??
      recent
        .map((r) => liveByEngagement.get(r.id))
        .find((r): r is DocumentStateRow => Boolean(r?.project_id)) ??
      liveRows.find((r) => Boolean(r.project_id)) ??
      null;
    // The `call-sheet` flag is retired (rulings §6) — every document-scoped
    // surface, the Call Sheet included, is live for every studio.
    const documentSurfaces = DOCUMENT_SCOPED_SURFACES;

    // D4' — the creation front door, pre-addressed with the same current/
    // most-recent project every other document-scoped surface pairs to
    // (`pairedDoc`, above). It always routes to the project's Boards page and
    // carries the pending flag that page reads to open the builder itself,
    // rather than a board room — a board has no id until one exists.
    const startBoardRow: PaletteRow | null = pairedDoc?.project_id
      ? (() => {
          const targetProjectId = pairedDoc!.project_id!;
          const command = startBoardCommandDescriptor({
            projectId: targetProjectId,
            projectName: folderTab(pairedDoc!),
          });
          return {
            kind: 'verb',
            key: command.key,
            label: command.label,
            sub: command.sub,
            icon: START_BOARD_ICON,
            run: () => {
              // Scoped to the exact project this row named — an abandoned
              // navigation must not open the builder on a LATER, unrelated
              // project's Boards page (see startBoardPending's own doc).
              startBoardPending.projectId = targetProjectId;
              router.push(command.href);
            },
            match: command.match,
          };
        })()
      : null;

    // US-15 — in a board room the deck sheet opens on that board; elsewhere it
    // routes to the project's Boards page, whose picker offers "From a deck".
    const inBoardRoom = Boolean(pathname?.startsWith('/board/'));
    const deckRow: PaletteRow | null =
      deckImportOn && (inBoardRoom || pairedDoc?.project_id)
        ? {
            kind: 'verb',
            key: 'bring-in-deck',
            label: 'Bring in a deck',
            sub: inBoardRoom ? 'this board · a section per slide' : `${folderTab(pairedDoc!)} · new board from a deck`,
            icon: Presentation,
            run: () => {
              if (inBoardRoom) {
                window.dispatchEvent(new CustomEvent(DECK_OPEN_EVENT));
                return;
              }
              const targetProjectId = pairedDoc!.project_id!;
              startBoardPending.projectId = targetProjectId;
              router.push(boardsRoutePath(targetProjectId));
            },
            match: 'bring in a deck powerpoint pptx import slides deck',
          }
        : null;

    const q = query.trim().toLowerCase();
    let sections: PaletteSection[];
    let matches = 0;

    if (!q) {
      // The populated palette (R93): grouped doorways, no query, always cut
      // below the fold (the list scrolls).
      sections = [];
      if (stageRows.length) {
        sections.push({ eyebrow: 'Where the work stands', rows: stageRows });
      }
      if (inHandRow) {
        sections.push({ eyebrow: 'In hand', rows: [documentRow(inHandRow, 'resume')] });
      }
      if (recentBoards.length) {
        sections.push({
          eyebrow: 'Recent boards',
          rows: recentBoards.slice(0, 4).map(recentBoardRow),
        });
      }
      const recentRows = recent
        .filter((r) => r.id !== inHandRow?.engagement_id)
        .slice(0, 3)
        .map(recentRow);
      if (recentRows.length) sections.push({ eyebrow: 'Recent', rows: recentRows });

      const thisSurface: PaletteRow[] = [];
      if (addToProjectRow) thisSurface.push(addToProjectRow);
      if (addChangeRow) thisSurface.push(addChangeRow);
      if (inHandRow?.project_id) {
        const projectName = folderTab(inHandRow);
        const projectId = inHandRow.project_id;
        thisSurface.push({
          kind: 'verb',
          key: 'draw-invoice-here',
          label: `Draw an invoice · ${projectName}`,
          sub: 'this household · pre-addressed',
          icon: DRAW_INVOICE_ICON,
          run: () => openInvoiceComposer({ projectId }),
          match: '',
        });
      }
      if (draftingProposalId) {
        thisSurface.push({
          kind: oneVoice ? 'verb' : 'room',
          key: 'drafting-room-here',
          label: oneVoice ? WRITE_THE_PROPOSAL : 'Open the Contract Room',
          sub: 'this proposal · boards & lines',
          icon: DRAFTING_ROOM_ICON,
          run: () => router.push(`/drafting/${draftingProposalId}`),
          match: '',
        });
      }
      // D4' — the creation front door, same in-hand gate as the four document
      // surfaces just below (an "open" row and a "start one" row obey the
      // same in-hand rule for what "This surface" may claim).
      if (inHandProjectRow && startBoardRow) thisSurface.push(startBoardRow);
      if (deckRow && (inBoardRoom || inHandProjectRow)) thisSurface.push(deckRow);
      // F29/F48/F50/F82 — all four document-scoped surfaces, never in the
      // unfiltered Rooms & ledgers group below, and only once a project doc is
      // in hand. The call sheet is additionally gated on its own flag.
      if (inHandProjectRow) {
        thisSurface.push(
          ...documentSurfaces.map((surface) =>
            documentSurfaceRow(surface, inHandProjectRow, false),
          ),
        );
      }
      if (thisSurface.length) sections.push({ eyebrow: 'This surface', rows: thisSurface });

      // F37 — the doors you already have stand above the doors that start
      // something new.
      sections.push({
        eyebrow: 'Rooms & ledgers',
        rows: [
          ...STUDIO_ROOMS.filter((s) => s.scope === 'global'),
          ...STUDIO_LEDGERS.filter((s) => s.scope === 'global'),
        ].map(surfaceRow),
      });
      sections.push({ eyebrow: 'Begin', rows: STUDIO_VERBS.map(surfaceRow) });
      sections.push({ eyebrow: 'Studio', rows: utilityRows });
    } else {
      // Typed: filter across documents + registry surfaces (matchSurfaces folds
      // in aliases — "invoicing" finds Draw an invoice, "moodboards" Boards,
      // "po" Orders) + people + the studio's own actions. The Engine is always
      // offered; a dry query recovers to the Help Center.
      const list: PaletteRow[] = [];
      // Concrete boards intentionally precede the one static Boards door for
      // "board" / "moodboard" queries.
      list.push(...recentBoards.map(recentBoardRow).filter((r) => r.match.includes(q)));
      list.push(...liveRows.map((r) => documentRow(r)).filter((r) => r.match.includes(q)));
      if (addToProjectRow?.match.includes(q)) list.push(addToProjectRow);
      if (addChangeRow?.match.includes(q)) list.push(addChangeRow);
      // D4' — typed reach is the current/most-recent project (`pairedDoc`),
      // the same fallback the four document-scoped surfaces use below, not
      // the stricter in-hand-only gate "This surface" enforces above.
      if (startBoardRow?.match.includes(q)) list.push(startBoardRow);
      if (deckRow?.match.includes(q)) list.push(deckRow);
      // Document-scoped registry surfaces (scope: 'document' — registry.tsx's
      // own canon: "only reachable with a document in hand") must pass the
      // same in-hand gate their "This surface" row above is gated on, or a
      // typed query surfaces them with nothing to act on. This is the ⌘K leak
      // fix: "roster"/"who"/"team" used to show Call Sheet with the flag off
      // and/or no project document in hand, and clicking silently no-op'd
      // (the sheet only mounts on /doc/[id], and even there renders nothing
      // past its own flag check). The Drafting Room carries the same scope
      // but a different in-hand shape — its own dispatch below only routes
      // straight into the room when `draftingProposalId` is set; otherwise it
      // falls back to the draft-proposal picker (a working, deliberate
      // doorway shared with the "Draft a design agreement" verb), so gating
      // on that exact condition keeps what's shown in sync with what
      // clicking it will do, rather than hiding a fallback that already works.
      // The four document-scoped surfaces are built below instead, pre-addressed
      // with the document they act on, so they are excluded here rather than
      // rendered twice.
      const documentScoped = new Set(DOCUMENT_SCOPED_SURFACES.map((s) => s.key));
      const isSurfaceReachable = (s: StudioSurface): boolean => {
        if (s.scope !== 'document') return true;
        if (s.key === 'drafting-room') return Boolean(draftingProposalId);
        return Boolean(inHandRow?.project_id);
      };
      list.push(
        ...matchSurfaces(query)
          .filter((s) => !documentScoped.has(s.key))
          .filter(isSurfaceReachable)
          .map(surfaceRow),
      );
      // SP-16/F29/F48/F82 — the same four rows the empty query prints, reachable
      // by typing. Off the document they name the job they open.
      if (pairedDoc) {
        const paired = pairedDoc.engagement_id !== inHandRow?.engagement_id;
        list.push(
          ...documentSurfaces
            .map((surface) => documentSurfaceRow(surface, pairedDoc, paired))
            .filter((r) => r.match.includes(q)),
        );
      }
      if (people) {
        list.push(
          ...people
            .filter((p) => `${p.display_name} ${p.role}`.toLowerCase().includes(q))
            .slice(0, 8)
            .map(personRow),
        );
      }
      list.push(...utilityRows.filter((r) => r.match.includes(q)));
      // F04 — a stage word filters the same group rather than falling through
      // to `No match`.
      const typedStageRows = stageRows.filter((r) => r.match.includes(q));
      matches = list.length + typedStageRows.length;
      // The Engine's ask (R38), offered for every non-empty query. FR2 507-4 /
      // FR3 F3-14 (`one-voice`) — with any paper in hand it reads `Ask the
      // paper: “{q}”`; the Desk, holding no paper, keeps `Ask about “{q}”`.
      const engineRow: PaletteRow = {
        kind: 'engine',
        key: 'engine',
        label:
          oneVoice && inHandRow
            ? `Ask the paper: “${query.trim()}”`
            : `Ask about “${query.trim()}”`,
        sub: 'ASK & PLACE',
        match: '',
      };
      // US-19 D4 / R31 — the dry query never prints Help alone, and its Help
      // row speaks in the paper's voice: `Open Help`, never the feature name.
      const openHelpRow: PaletteRow = {
        kind: 'help',
        key: 'open-help',
        icon: LifeBuoy,
        label: 'Open Help',
        sub: '',
        run: () => router.push('/help'),
        match: '',
      };
      const typed = query.trim();

      // US-19 D4 — with a project paper in hand, the paper answers first:
      // `On this paper` → `Acts on this paper` → `Elsewhere` → the Engine's
      // ask → Help, last. `Search all jobs` switches the sheet in place (R23).
      const paperProject = askThePaperOn && !searchAll ? inHandRow : null;
      const paperProjectId = paperProject?.project_id ?? null;
      if (paperProject && paperProjectId) {
        const synonyms = matchPaperSynonyms(q);
        const resolves = new Set(synonyms.map((group) => group.resolves));
        const terms = [
          q,
          ...synonyms
            .filter((group) => group.resolves === 'each-other')
            .flatMap((group) => group.words),
        ];
        const hits = (text: string) => terms.some((term) => text.includes(term));
        const onThisPaper = paperLines?.projectId === paperProjectId ? paperLines : null;
        const lines = onThisPaper?.lines ?? [];
        const invoices = onThisPaper?.invoices ?? [];
        const section = paperProject.active_section;

        // A region head is `focusRegionHeading`'s target; ask the region to
        // unfold, then land two frames later, once its body has painted.
        const jumpToRegion = (key: DocumentIndexKey) => {
          requestRegionUnfold(key);
          const headingId = regionHeadingId(key, paperProjectId);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const heading = document.getElementById(headingId);
              heading?.scrollIntoView?.({ block: 'start' });
              heading?.focus({ preventScroll: true });
            }),
          );
        };

        // R26 — on an Install paper the install synonyms find the reading
        // itself: its own sentence, act `Open Install`. Only the sentence is
        // read, so the window-held input (which picks the act) is moot.
        const reading =
          section === 'install'
            ? installReading(
                lines.map((line) => ({
                  id: String(line.id),
                  name: line.name ?? '',
                  status: line.status,
                  purchase_order: line.purchase_order,
                })),
                new Date(),
                true,
              )
            : null;
        // FR3 F3-5 (`one-voice`) — when the band's Next is the reading's own act
        // (`Ask the maker for a date`), this row IS the Next row: it ends in
        // that act, is found by its words too, and lands as the band's press.
        const readingNext =
          bandNext && reading?.act?.label === bandNext.label ? bandNext : null;
        const readingMatch = [reading?.sentence, readingNext?.label]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        const readingRows: PaletteRow[] =
          reading && (resolves.has('install-reading') || hits(readingMatch))
            ? [
                {
                  kind: 'paper',
                  key: 'paper-install-reading',
                  label: reading.sentence,
                  sub: '',
                  act: readingNext?.label ?? 'Open Install',
                  run: () =>
                    readingNext
                      ? pressBandNext(readingNext)
                      : window.dispatchEvent(
                          new CustomEvent('document:open-section', { detail: 'install' }),
                        ),
                  match: readingMatch,
                },
              ]
            : [];

        const lineRows: PaletteRow[] = lines.flatMap((line) => {
          const po = linePoNumber(line);
          const maker = line.vendor_name ?? line.product?.brand ?? null;
          const stampWord = lineStampLabel(deriveLineStamp(line).kind) || null;
          const label = line.name ?? '';
          const match = [label, maker, stampWord, po ? `po ${po}` : null, line.room?.name, line.doc_code]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!hits(match) && !(po && resolves.has('open-the-order'))) return [];
          return [
            {
              kind: 'paper' as const,
              key: `paper-line:${line.id}`,
              label,
              sub: [maker, stampWord, po ? `PO ${po}` : null].filter(Boolean).join(' · '),
              act: po ? NAMED_ACTS.openOrder : undefined,
              // ffe-section.tsx lands it: Pieces and the line unfold, the Order
              // cell in view, focus on the PO (R28). The request waits in
              // `focusFfeLinePending` while Pieces is not yet mounted (F1).
              run: () => {
                const request = { itemId: String(line.id), cell: 'order' as const };
                focusFfeLinePending.request = request;
                window.dispatchEvent(new CustomEvent(FOCUS_FFE_LINE_EVENT, { detail: request }));
              },
              match,
            },
          ];
        });
        // R29 — invoice numbers, through the invoice rows the Money region
        // already reads (`useProjectInvoices`).
        const invoiceRows: PaletteRow[] = invoices.flatMap((invoice) => {
          if (!invoice.invoice_number) return [];
          const label = `Invoice ${invoice.invoice_number}`;
          const match = label.toLowerCase();
          if (!hits(match)) return [];
          return [
            {
              kind: 'paper' as const,
              key: `paper-invoice:${invoice.id}`,
              label,
              sub: invoice.status.replace(/_/g, ' '),
              run: () => openInvoiceFolio(invoice.id),
              match,
            },
          ];
        });
        // People on the job: a seat on this project, or the household itself.
        const peopleOnJob = (people ?? []).filter(
          (p) =>
            p.project_id === paperProjectId ||
            (p.role === 'client' && p.display_name === paperProject.client_name),
        );
        const personHits = peopleOnJob
          .filter(
            (p) =>
              hits(`${p.display_name} ${p.role}`.toLowerCase()) ||
              (resolves.has('household') && p.role === 'client'),
          )
          .map(personRow);
        // R27 — no umbrella Money row: the money synonyms name the Money head's
        // own acts, below.
        const regionRows: PaletteRow[] = paperRegionsForSection(section)
          .filter((region) => hits(region.label.toLowerCase()))
          .map((region) => ({
            kind: 'paper' as const,
            key: `paper-region:${region.key}`,
            label: region.label,
            sub: 'this paper',
            run: () => jumpToRegion(region.key),
            match: region.label.toLowerCase(),
          }));
        const paperRows = [
          ...readingRows,
          ...lineRows,
          ...invoiceRows,
          ...personHits,
          ...regionRows,
        ].slice(0, 5);

        const hereKeys = new Set([
          ...DOCUMENT_SCOPED_SURFACES.map((s) => `${s.key}-here`),
          'add-to-project-here',
          'record-a-change-here',
        ]);
        const acts: PaletteRow[] = [];
        // FR3 F3-5 (`one-voice`) — the paper's Next act, first: the band's act
        // over the band's sentence, found by either's words, landing as the
        // band's press. Where Next is a payment it is R27's row below (514-1),
        // and where it is the Install reading's act it is that row above.
        const recordPayment = NEED_ACT_LABELS.payment_due;
        const moneyAsked = resolves.has('money-acts');
        const nextIsPayment = bandNext?.label === recordPayment;
        const nextMatch = bandNext
          ? `${bandNext.label} ${bandNext.sentence ?? ''}`.toLowerCase()
          : '';
        if (bandNext && !readingNext && !nextIsPayment && hits(nextMatch)) {
          acts.push({
            kind: 'action',
            key: 'paper-next',
            label: bandNext.label,
            sub: bandNext.sentence ?? '',
            run: () => pressBandNext(bandNext),
            match: nextMatch,
          });
        }
        if (addChangeRow && (addChangeRow.match.includes(q) || resolves.has('record-a-change'))) {
          acts.push(addChangeRow);
        }
        acts.push(
          ...list.filter((r) => hereKeys.has(r.key) && r.key !== 'record-a-change-here'),
        );
        // R27 — each Money head act as printed is its own row: `Record the
        // payment` first when a payment is due on this job, then `Draw an
        // invoice`. The due payment is the Desk's own `payment_due` need.
        const paymentDue =
          (data?.folders ?? [])
            .filter((folder) => folder.row.engagement_id === paperProject.engagement_id)
            .flatMap((folder) => folder.needs ?? [folder.need])
            .find((need) => need.kind === 'payment_due') ?? null;
        // US-19 F2-3 (P-1) — the row points at the PO line's record-payment
        // control, as the band does; the Orders ledger is not a landing.
        const landingPoId = oneVoice
          ? paymentDue?.ledger?.context?.purchaseOrderId
          : undefined;
        if (bandNext && nextIsPayment) {
          // FR3 F3-5 / 514-1 — Next is a payment: this one row follows
          // whichever payment the band's Next names, and lands as its press.
          if (moneyAsked || hits(nextMatch)) {
            acts.push({
              kind: 'action',
              key: 'record-payment-here',
              label: recordPayment,
              sub: bandNext.sentence ?? '',
              run: () => pressBandNext(bandNext),
              match: nextMatch,
            });
          }
        } else if (paymentDue && (moneyAsked || recordPayment.toLowerCase().includes(q))) {
          acts.push({
            kind: 'action',
            key: 'record-payment-here',
            label: recordPayment,
            sub: paymentDue.text,
            run: () =>
              landingPoId
                ? landRecordPayment(landingPoId)
                : paymentDue.ledger
                  ? openLedger(paymentDue.ledger.name, paymentDue.ledger.context)
                  : openLedger('orders', { page: 'ledger', projectId: paperProjectId }),
            match: recordPayment.toLowerCase(),
          });
        }
        const drawInvoice = 'Draw an invoice';
        if (moneyAsked || drawInvoice.toLowerCase().includes(q)) {
          acts.push({
            kind: 'verb',
            key: 'draw-invoice-here',
            label: drawInvoice,
            sub: '',
            icon: DRAW_INVOICE_ICON,
            run: () => openInvoiceComposer({ projectId: paperProjectId }),
            match: drawInvoice.toLowerCase(),
          });
        }
        // R30 — `Keys`, with its key hint; Enter opens the Keys sheet.
        if (resolves.has('keys') || 'keys'.includes(q)) {
          acts.push({
            kind: 'verb',
            key: 'paper-keys',
            label: 'Keys',
            sub: '',
            icon: Keyboard,
            shortcut: ['?'],
            run: () => openKeys('palette'),
            match: 'keys',
          });
        }

        // FR3 F3-5 — the Next act prints once: a Money or surface row that
        // carries the same act gives way to the Next row.
        if (bandNext) {
          const first = acts.findIndex((r) => r.label === bandNext.label);
          for (let i = acts.length - 1; i > first; i--) {
            if (acts[i].label === bandNext.label) acts.splice(i, 1);
          }
        }
        const onPaper = new Set(paperRows.map((r) => r.key));
        const actLabels = new Set(acts.map((r) => r.label));
        const isHelp = (r: PaletteRow) => r.kind === 'help' || r.key === 'help-panel';
        // FR2 507-5 — the one `Keys` door prints once: an act this paper
        // already prints is not repeated under Help.
        const helpRows = list.filter((r) => isHelp(r) && !actLabels.has(r.label));
        // FR2 F2-11 — a closed job's dry query is one sentence: no pieces row.
        const closed = oneVoice && paperProject.project_status === 'completed';
        // R25 — today's cross-paper hits; an act this paper already prints is
        // not printed twice under another group.
        const elsewhere = list.filter(
          (r) =>
            !hereKeys.has(r.key) && !onPaper.has(r.key) && !isHelp(r) && !actLabels.has(r.label),
        );
        const dry = paperRows.length === 0 && acts.length === 0;
        const searchAllRow: PaletteRow = {
          kind: 'action',
          key: 'search-all-jobs',
          label: `Search all jobs for "${typed}"`,
          sub: '',
          run: () => setSearchAll(true),
          match: '',
        };

        sections = [];
        if (dry) {
          sections.push({
            eyebrow: null,
            note: `Nothing on this paper matches "${typed}".`,
            rows: closed
              ? []
              : [
                  {
                    kind: 'paper',
                    key: 'paper-open-pieces',
                    // FR3 F3-14 / 513-5 (`one-voice`) — zero prints no count.
                    label:
                      oneVoice && lines.length === 0
                        ? OPEN_THE_PIECES
                        : `${OPEN_THE_PIECES} · ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`,
                    sub: '',
                    run: () => jumpToRegion('ffe'),
                    match: '',
                  },
                ],
          });
        } else {
          if (paperRows.length) {
            sections.push({ eyebrow: `On this paper · ${paperProject.title}`, rows: paperRows });
          }
          if (acts.length) sections.push({ eyebrow: 'Acts on this paper', rows: acts });
        }
        // R25 — `Elsewhere` holds these three, in this order, and nothing else.
        sections.push({
          eyebrow: 'Elsewhere',
          rows: [searchAllRow, ...typedStageRows, ...elsewhere],
        });
        // R24 — the Engine's ask stands after Elsewhere, before Help.
        sections.push({ eyebrow: null, rows: [engineRow] });
        const help = helpRows.length ? helpRows : dry ? [openHelpRow] : [];
        if (help.length) sections.push({ eyebrow: 'Help', rows: help });
        matches =
          paperRows.length + acts.length + typedStageRows.length + elsewhere.length + helpRows.length;
      } else if (askThePaperOn && searchAll && inHandRow?.project_id) {
        // R23 — all jobs, in place: today's document and person builders.
        // Esc steps back to the paper; the first result takes focus.
        const allJobs = list.filter((r) => r.key.startsWith('doc:') || r.kind === 'person');
        sections = allJobs.length
          ? [{ eyebrow: 'All jobs', rows: allJobs }]
          : [{ eyebrow: null, note: `Nothing matches "${typed}".`, rows: [] }];
        matches = allJobs.length;
      } else if (matches === 0 && askThePaperOn) {
        // R31 — the Desk's dry query: the sentence, where the work stands,
        // the ask, and one Help row.
        sections = [{ eyebrow: null, note: `Nothing matches "${typed}".`, rows: [] }];
        if (stageRows.length) {
          sections.push({ eyebrow: 'Where the work stands', rows: stageRows });
        }
        sections.push({ eyebrow: null, rows: [engineRow] });
        sections.push({ eyebrow: 'Help', rows: [openHelpRow] });
      } else {
        if (matches === 0) {
          list.push({
            kind: 'help',
            key: 'help-center-recovery',
            icon: LifeBuoy,
            label: 'No match',
            sub: 'Try the Help Center',
            run: () => router.push('/help'),
            match: '',
          });
        }
        // R38: the ask is always offered for a non-empty query — destinations
        // jump, a question asks. No mode.
        list.push(engineRow);
        sections = typedStageRows.length
          ? [
              { eyebrow: 'Where the work stands', rows: typedStageRows },
              { eyebrow: null, rows: list },
            ]
          : [{ eyebrow: null, rows: list }];
      }
    }

    let idx = 0;
    const renderedSections = sections.map((s) => ({
      eyebrow: s.eyebrow,
      note: s.note,
      items: s.rows.map((row) => ({ row, index: idx++ })),
    }));
    return {
      rendered: renderedSections,
      flatRows: sections.flatMap((s) => s.rows),
      matchCount: matches,
    };
  }, [
    query,
    data,
    people,
    recentBoards,
    recent,
    inHandRow,
    router,
    pathname,
    user?.email,
    signOut,
    testerNotesOn,
    teachingNotesOn,
    deckImportOn,
    askThePaperOn,
    oneVoice,
    paperLines,
    searchAll,
    bandNext,
  ]);

  // F1 — queried (debounced ~300ms, not per-keystroke) + zeroResult.
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const t = window.setTimeout(() => {
      documentEvents.commandBar.queried({ query_length: q.length, result_count: matchCount });
      if (matchCount === 0) documentEvents.commandBar.zeroResult({ query_length: q.length });
    }, 300);
    return () => window.clearTimeout(t);
  }, [query, matchCount]);

  /* What the status line counts is what the QUERY found — the No-match
     recovery row and the Engine's ask are offered, not matched, so counting
     the rendered rows would announce "2 results" over the word "No match".
     With no query the palette is the populated set of doorways, and the rows
     ARE the count. */
  const resultCount = query.trim() ? matchCount : flatRows.length;
  const statusNote =
    oneVoice && resultCount === 0 ? (rendered.find((s) => s.note)?.note ?? null) : null;

  // R23 — `Search all jobs` switches the sheet in place, and its first result
  // takes focus (a focused option moves with ↑↓ and Enter, ADV-40).
  useEffect(() => {
    if (!open || !searchAll) return;
    const frame = requestAnimationFrame(() => document.getElementById(optionId(0))?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, searchAll]);

  // Keep the active row in range as the list changes.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, flatRows.length - 1)));
  }, [flatRows.length]);

  const choose = (row: PaletteRow, index: number) => {
    if (row.kind === 'engine') {
      setAsking(query.trim()); // answer inline; don't close the bar
      return;
    }
    if (row.key === 'search-all-jobs') {
      // US-19 D4 — the studio-wide list for the same query; the bar stays.
      row.run();
      setActive(0);
      return;
    }
    documentEvents.commandBar.selected({
      kind: row.kind,
      key: row.key,
      position: index,
      query_length: query.trim().length,
    });
    if (row.kind === 'room' || row.kind === 'ledger') {
      documentEvents.wayfinding.doorOpened({
        key: row.key,
        weight: row.kind === 'room' ? 'room' : 'sheet',
        source: 'palette',
      });
    }
    setOpen(false);
    row.run();
  };

  const renderGlyph = (row: PaletteRow) => {
    if (row.kind === 'document') {
      return row.fill ? (
        <StrataMark size="sm" fill={row.fill} />
      ) : (
        <StrataMark size="sm" state="active" />
      );
    }
    if (row.kind === 'engine') return <StrataMark size="sm" state="active" />;
    if (row.kind === 'person') {
      // A party reads as a quiet terracotta dot — the People spine color
      // (studio-drawer), so the noun's home is legible.
      return (
        <span
          aria-hidden
          className="inline-block h-[8px] w-[8px] shrink-0 rounded-full"
          style={{ background: 'var(--color-terracotta)' }}
        />
      );
    }
    const Icon = 'icon' in row ? row.icon : undefined;
    if (!Icon) {
      // A studio action with no registry icon keeps the flat aged-oak tick.
      return (
        <span
          aria-hidden
          className="inline-block h-[14px] w-[3px] rounded-[1px]"
          style={{ background: 'var(--color-aged-oak)' }}
        />
      );
    }
    return (
      <Icon
        className="h-[15px] w-[15px] shrink-0 text-[var(--color-aged-oak)]"
        strokeWidth={1.5}
        aria-hidden
      />
    );
  };

  const renderTrailing = (row: PaletteRow) => {
    if (row.kind === 'paper' && row.act) {
      return (
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
          ↵ {row.act}
        </span>
      );
    }
    if (row.kind === 'document' && row.hint) {
      return (
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
          {row.hint}
        </span>
      );
    }
    if (
      (row.kind === 'room' ||
        row.kind === 'ledger' ||
        row.kind === 'verb' ||
        row.kind === 'help') &&
      row.shortcut?.length
    ) {
      return (
        <span className="shrink-0 rounded-[3px] border border-[var(--color-pearl)] px-1.5 py-px font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
          {row.shortcut.join(' ')}
        </span>
      );
    }
    return null;
  };

  // US-19 D4 (ADV-40) — the sheet contains focus: Tab wraps inside the panel,
  // and a result row that holds focus moves with ↑↓ like the input does.
  const onPanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      const focusables = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'input, button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    const target = e.target as HTMLElement;
    if (target.getAttribute('role') !== 'option') return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const from = Number(target.id.slice(OPTION_ID_PREFIX.length));
    const next =
      e.key === 'ArrowDown'
        ? Math.min(from + 1, flatRows.length - 1)
        : Math.max(from - 1, 0);
    setActive(next);
    document.getElementById(optionId(next))?.focus();
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command bar"
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh]"
    >
      <button
        type="button"
        aria-label="Close command bar"
        className="absolute inset-0 cursor-default bg-[rgba(44,41,38,0.45)]"
        onClick={() => setOpen(false)}
      />
      <div
        ref={dialogRef}
        onKeyDown={askThePaperOn ? onPanelKeyDown : undefined}
        className="relative w-[min(560px,92vw)] overflow-hidden rounded-[6px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)]"
      >
        {askThePaperOn && inHandRow?.project_id && (
          <PaperLinesSource projectId={inHandRow.project_id} onLines={setPaperLines} />
        )}
        {/* B03 — the pattern completed. A textbox that names an active option
            in a list it controls IS a combobox; without the role, expanded
            state and autocomplete behaviour, a screen reader announces a plain
            field and never says the list is there. Keyboard behaviour is
            unchanged — ArrowUp/Down/Enter below own it, and focus never leaves
            the input. */}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={!asking}
          aria-autocomplete="list"
          aria-activedescendant={
            !asking && flatRows[active] ? optionId(active) : undefined
          }
          aria-controls={asking ? undefined : RESULTS_ID}
          aria-owns={asking ? undefined : RESULTS_ID}
          aria-label="Find anything"
          placeholder="Find a document or a ledger…"
          className="w-full border-b border-[var(--color-pearl)] bg-transparent px-4 py-3 text-[14px] text-[var(--color-charcoal)] placeholder:text-[var(--text-muted)] focus:outline-none"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            if (asking) setAsking(null);
            if (searchAll) setSearchAll(false);
          }}
          onKeyDown={(e) => {
            if (asking) {
              if (e.key === 'Enter') {
                e.preventDefault();
                setAsking(query.trim() || null);
              }
              return;
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, flatRows.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && flatRows[active]) {
              e.preventDefault();
              choose(flatRows[active], active);
            }
          }}
        />

        {asking ? (
          <div className="max-h-[60vh] overflow-y-auto px-4 pb-3 pt-2">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-clay-ink)]">
                Results · “{asking}”
              </span>
              <button
                type="button"
                onClick={() => setAsking(null)}
                className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)] hover:text-[var(--color-charcoal)]"
              >
                ← results
              </button>
            </div>
            <EngineResults query={asking} inDocument={inDocument} />
          </div>
        ) : (
          <div className="max-h-[52vh] overflow-y-auto py-1">
            {statusNote ? (
              // FR2 F2-11 — under `one-voice` a dry query says one sentence:
              // the sheet's own note is the status, never a second
              // `Nothing matches.` beside it.
              <p role="status" className="px-4 pb-1 pt-3 text-[13px] text-[var(--color-charcoal)]">
                {statusNote}
              </p>
            ) : (
              <p role="status" className="sr-only">
                {resultCount === 0
                  ? 'Nothing matches.'
                  : `${resultCount} ${resultCount === 1 ? 'result' : 'results'}`}
              </p>
            )}
            <div role="listbox" id={RESULTS_ID} aria-label="Results">
              {rendered.map((section, sectionIndex) => (
                <div
                  key={`${section.eyebrow ?? 'results'}-${sectionIndex}`}
                  role="group"
                  aria-label={section.eyebrow ?? 'Results'}
                >
                  {section.eyebrow && (
                    <div className="px-4 pb-1 pt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      {section.eyebrow}
                    </div>
                  )}
                  {section.note && section.note !== statusNote && (
                    <p className="px-4 pb-1 pt-3 text-[13px] text-[var(--color-charcoal)]">
                      {section.note}
                    </p>
                  )}
                  <ul role="presentation">
                    {section.items.map(({ row, index }) => (
                      <li key={row.key} role="presentation">
                        <button
                          type="button"
                          id={optionId(index)}
                          role="option"
                          aria-selected={index === active}
                          onMouseEnter={() => setActive(index)}
                          onClick={() => choose(row, index)}
                          className={`flex w-full items-center gap-3 px-4 py-2 text-left ${
                            index === active ? 'bg-[rgba(196,165,123,0.12)]' : ''
                          }`}
                        >
                          {renderGlyph(row)}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-[var(--color-charcoal)]">
                              {row.label}
                            </span>
                            <span className="block truncate font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                              {row.sub}
                            </span>
                          </span>
                          {renderTrailing(row)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* US-19 D4 — `?` printed in the foot line. The `?` key itself is
            KeysShortcut's, which never fires in a field or an open dialog. */}
        {askThePaperOn && (
          <p className="border-t border-[var(--color-pearl)] px-4 py-2 font-mono text-[11px] tracking-[0.06em] text-[var(--text-muted)]">
            ↵ open · ↑↓ move · ? keys · esc close
          </p>
        )}
      </div>
    </div>
  );
}
