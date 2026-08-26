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
import { FolderPlus, LifeBuoy } from 'lucide-react';
import { useDeskEngagements } from '@/hooks/use-desk-engagements';
import {
  usePeopleDirectory,
  useRecentBoards,
  type PeopleDirectoryRow,
  type RecentBoard,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { openAccount } from './account/account-sheet';
import { openInvoiceComposer } from './accounts/invoice-overlays';
import { openPost } from './overlays/post-sheet';
import {
  isElementRendered,
  topActiveModalDialog,
} from './overlays/active-dialog';
import { openFeedbackSheet } from './feedback/feedback-sheet';
import { openHelp } from '@/lib/help-system/open-help';
import { openDraftProposalPicker } from './rooms/drafting/draft-proposal-opener';
import { fillStateForDesk, type FillState } from '@/lib/document/fill-state';
import {
  folderTab,
  type DocumentStateRow,
  type SectionKey,
} from '@/lib/document/desk-derivation';
import {
  DOCUMENT_SCOPED_SURFACES,
  STUDIO_ROOMS,
  STUDIO_LEDGERS,
  STUDIO_VERBS,
  boardsRoutePath,
  matchSurfaces,
  type StudioSurface,
} from '@/lib/document/registry';
import { openDraftingRoom } from '@/lib/document/open-drafting-room';
import {
  documentEvents,
  readRecentDocumentsInHand,
  type RecentDocumentInHand,
} from '@/lib/analytics/document-events';
import { authEvents } from '@/lib/analytics/events';
import { StrataMark } from './strata-mark';
import { EngineResults, type InDocument } from './engine/engine-results';
import { recentBoardCommandDescriptor } from '@/lib/mood-board/navigation';

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
      run: () => void;
      match: string;
    }
  | { kind: 'person'; key: string; label: string; sub: string; run: () => void; match: string }
  | { kind: 'engine'; key: string; label: string; sub: string; match: string };

interface PaletteSection {
  eyebrow: string | null;
  rows: PaletteRow[];
}

// The two context-boosted THIS-SURFACE icons, pulled from the registry so they
// can never drift from the canonical verb/room marks.
const DRAW_INVOICE_ICON = STUDIO_VERBS.find((v) => v.key === 'draw-invoice')!.icon;
const DRAFTING_ROOM_ICON = STUDIO_ROOMS.find((r) => r.key === 'drafting-room')!.icon;

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
  const { value: callSheetOn } = useFeatureFlag('call-sheet');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [asking, setAsking] = useState<string | null>(null);
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
        else setOpen(false);
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
  }, [open, asking]);

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

    const surfaceRow = (s: StudioSurface): PaletteRow => ({
      kind: s.kind,
      key: s.key,
      label: s.label,
      sub: s.subLabel ?? (s.kind === 'room' ? 'room ↗' : 'ledger'),
      icon: s.icon,
      shortcut: s.shortcut,
      run: runForSurface(s),
      match: [s.label, ...s.aliases].join(' ').toLowerCase(),
    });

    // The studio's own controls — F5 adds "Browse the Help Center" (distinct
    // from the contextual "Help…" panel). Kept filterable so "sign out",
    // "settings", "feedback" still resolve when typed.
    const utilityRows: PaletteRow[] = [
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

    const addToProjectRow: PaletteRow | null = inHandRow?.project_id && inHandRow.active_section === 'project'
      ? {
          kind: 'verb',
          key: 'add-to-project-here',
          label: 'Add a line',
          sub: 'this project · Library, link, need, import, or board',
          icon: FolderPlus,
          run: () => window.dispatchEvent(new CustomEvent('document:open-add-to-project', {
            detail: { source: 'command_palette' },
          })),
          match: 'add to project selection ffe furniture library product link import board need',
        }
      : null;
    const addChangeRow: PaletteRow | null = inHandRow?.project_id &&
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
    const lineByEngagement = new Map(
      liveDocs.map((entry) => [entry.row.engagement_id, liveLine(entry)]),
    );
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
          label: `${STAGE_LABELS[stage]} · ${inStage.length}`,
          sub,
          fill: fillStateForDesk(head),
          run: () => router.push(`/doc/${head.engagement_id}`),
          match: [
            STAGE_LABELS[stage],
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
    const documentSurfaces = DOCUMENT_SCOPED_SURFACES.filter(
      (surface) => surface.key !== 'call-sheet' || callSheetOn,
    );

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
          kind: 'room',
          key: 'drafting-room-here',
          label: 'Open the Drafting Room',
          sub: 'this proposal · boards & lines',
          icon: DRAFTING_ROOM_ICON,
          run: () => router.push(`/drafting/${draftingProposalId}`),
          match: '',
        });
      }
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
      list.push({
        kind: 'engine',
        key: 'engine',
        label: `Ask about “${query.trim()}”`,
        sub: 'ASK & PLACE',
        match: '',
      });
      sections = typedStageRows.length
        ? [
            { eyebrow: 'Where the work stands', rows: typedStageRows },
            { eyebrow: null, rows: list },
          ]
        : [{ eyebrow: null, rows: list }];
    }

    let idx = 0;
    const renderedSections = sections.map((s) => ({
      eyebrow: s.eyebrow,
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
    callSheetOn,
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

  // Keep the active row in range as the list changes.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, flatRows.length - 1)));
  }, [flatRows.length]);

  const choose = (row: PaletteRow, index: number) => {
    if (row.kind === 'engine') {
      setAsking(query.trim()); // answer inline; don't close the bar
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
    if (row.kind === 'document' && row.hint) {
      return (
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
          {row.hint}
        </span>
      );
    }
    if (
      (row.kind === 'room' || row.kind === 'ledger' || row.kind === 'verb') &&
      row.shortcut?.length
    ) {
      return (
        <span className="shrink-0 rounded-[3px] border border-[var(--color-pearl)] px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
          {row.shortcut.join(' ')}
        </span>
      );
    }
    return null;
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Command bar"
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh]"
    >
      <button
        type="button"
        aria-label="Close command bar"
        className="absolute inset-0 cursor-default bg-[rgba(44,41,38,0.45)]"
        onClick={() => setOpen(false)}
      />
      <div className="relative w-[min(560px,92vw)] overflow-hidden rounded-[6px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)]">
        <input
          ref={inputRef}
          type="text"
          aria-label="Find anything"
          placeholder="Find a document or a ledger…"
          className="w-full border-b border-[var(--color-pearl)] bg-transparent px-4 py-3 text-[14px] text-[var(--color-charcoal)] placeholder:text-[var(--text-muted)] focus:outline-none"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            if (asking) setAsking(null);
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
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--color-clay)]">
                Results · “{asking}”
              </span>
              <button
                type="button"
                onClick={() => setAsking(null)}
                className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)] hover:text-[var(--color-charcoal)]"
              >
                ← results
              </button>
            </div>
            <EngineResults query={asking} inDocument={inDocument} />
          </div>
        ) : (
          <div className="max-h-[52vh] overflow-y-auto py-1">
            {rendered.map((section) => (
              <div key={section.eyebrow ?? 'results'}>
                {section.eyebrow && (
                  <div className="px-4 pb-1 pt-3 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    {section.eyebrow}
                  </div>
                )}
                <ul>
                  {section.items.map(({ row, index }) => (
                    <li key={row.key}>
                      <button
                        type="button"
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
                          <span className="block truncate font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
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
        )}
      </div>
    </div>
  );
}
