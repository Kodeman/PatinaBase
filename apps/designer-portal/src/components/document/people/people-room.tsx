"use client";

/**
 * The People Room (R50 / R57) — the unified relationship layer as a walk-in
 * Room (D14), the second tenant of the reusable Rooms shell. A grouped
 * relationship index becomes a compact disclosure below the desktop canvas;
 * an ask line searches people + history, and a live Engine nudge derives from
 * the nurture queue. Zero shadows (D4), typography-first, origin preserved.
 *
 * Track A owns the shell, the ask bar, and the Directory. The Directory's role
 * filter is LIFTED here (controlled) so the ask bar can route "makers" straight
 * to the filtered roster. Tracks B–D fill their view slots (see ./views, ./types).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  usePeopleDirectory,
  useOrganizations,
  isFieldRosterRole,
  type PartyRole,
} from "@patina/supabase";
import type { ContactScope } from "@patina/types";
import { peopleEvents } from "@/lib/analytics/people-events";
import {
  deriveNurtureQueue,
  directoryEntryCounts,
  directoryHeadLine,
  directoryIdentityRows,
  directoryRolodexOrgId,
  humanizeSince,
} from "@/lib/document/people-derivation";
import {
  DEFAULT_DIRECTORY_CHIP,
  directoryChipFromParam,
  type DirectoryChip,
} from "@/lib/document/directory-roles";
import { RoomShell } from "../rooms/room-shell";
import { DirectoryView, type MakerLens } from "./views/directory-view";
import { PersonProfile } from "./views/person-profile";
import { CompanyCard } from "./company-card";
import { PartyProfileSheet } from "./party-profile-sheet";
import { ThreadsView } from "./views/threads-view";
import { NurtureView } from "./views/nurture-view";
import { ReviewsView } from "./views/reviews-view";
import { PortfolioView } from "./views/portfolio-view";
import { OutreachView } from "./views/outreach-view";
import { YourEyePanel } from "./profile/your-eye";
import { AskBar, routePeopleAsk } from "./directory/ask-bar";
import { DEFAULT_CONTACT_SCOPE } from "./directory/scope-lens";
import { AddPersonSheet } from "./directory/add-person-sheet";
import type { PeopleView, PeopleViewProps } from "./types";
import type { PeopleDirectorySeat } from "@patina/supabase";
import {
  PeopleCompactSelector,
  PeopleDesktopRail,
  peopleViewFromParam,
} from "./view-shell";
import { useDocumentSurface } from "@/lib/help-system/use-document-surface";
import { DOCUMENT_SURFACE_KEYS } from "@/lib/help-system/document-surface-keys";
import { DocumentAction, DocumentActionGroup } from "../document-action";
import { useMobilePrimaryAction } from "../mobile/mobile-shell";

// R21 dissolve — `/people?view=<key>` still receives every permanent redirect
// off the retired zone tree. `peopleViewFromParam` owns that stable key map.
// The `?role=` param map itself (DIRECTORY_ROLES) now lives in
// lib/document/directory-roles.ts — dependency-free, so a spec can pin it
// without importing this whole Room.

export function PeopleRoom() {
  useDocumentSurface(DOCUMENT_SURFACE_KEYS.people); // R89 — scope help to the People room
  const router = useRouter();
  const [view, setView] = useState<PeopleView>("directory");
  const [openPerson, setOpenPerson] = useState<{
    id: string;
    role: PartyRole;
  } | null>(null);
  // Field parties (gc/sub/installer/receiver) open the field-coordination party
  // sheet (SMS thread + field link) rather than the relationship profile (D1:
  // an overlay over the Room, which never unmounts).
  const [openParty, setOpenParty] = useState<{
    id: string;
    role: PartyRole;
  } | null>(null);
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  // The Directory's chip lives here (controlled) so the ask bar and the
  // address can both set it. Six chips now, not eleven (direction §1 line 2);
  // `directoryChipFromParam` forwards every shipped `?role=` link.
  const [chip, setChip] = useState<DirectoryChip>(DEFAULT_DIRECTORY_CHIP);
  // PR-j — the trade line under Crew and Makers is addressable too.
  const [trade, setTrade] = useState("all");
  // The firm card, opened by `?firm=` or by a Directory firm row.
  const [openFirm, setOpenFirm] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<"client" | "maker">("client");
  // R51/R83 — the quiet inline confirmation band the Directory shows after an
  // add (never a toast). Cleared when the designer moves on (view/filter).
  const [notice, setNotice] = useState<string | null>(null);
  // R78 — the Makers filter's lens (roster | marketplace), lifted so walking
  // into a profile and back doesn't drop the designer out of the marketplace.
  const [makerLens, setMakerLens] = useState<MakerLens>("roster");
  // Call Sheet Wave 2 — the MINE · STUDIO lens (slide 8), lifted for the same
  // reason as makerLens. U6 (Wave 4): STUDIO is now the default — see
  // scope-lens.tsx's DEFAULT_CONTACT_SCOPE, the single source of truth.
  const [scope, setScope] = useState<ContactScope>(DEFAULT_CONTACT_SCOPE);
  // F4 — a person to scroll into view + quietly highlight in the Directory
  // once their row is on screen (set by the ?person= deep-link, or by a
  // return from that person's profile). Self-clears on a short timer.
  const [highlightPersonId, setHighlightPersonId] = useState<string | null>(
    null,
  );

  useMobilePrimaryAction({
    actionKey: "add-person",
    surfaceKey: "people",
    regionKey: "room-head",
    label: "Add person",
    target: { kind: "press", onPress: () => setAddOpen(true) },
  });

  // Wave 4 (00420) scope ruling — left STUDIO-wide (unscoped) on purpose.
  // `all` does two jobs here: the Room-wide "N people" count (browse) and the
  // ?person= deep-link role resolution (must reach anyone ⌘K or a cross-link
  // could have named, including a studio-mate's party). Both genuinely need
  // the wide read, so `all` stays unscoped.
  const { data: all } = usePeopleDirectory({ role: "all" });
  // W5 fix — the Engine nudge (relationship-action, `nudge` useMemo below)
  // is a personal to-do, not a browse surface: studio visibility ≠ shared
  // nurture queues. Feeding it from the studio-wide `all` let it surface a
  // studio-mate's dormant tie as if it were the signed-in designer's own
  // relationship to chase. A separate `scope:'mine'` read feeds ONLY the
  // nudge; `all` above is untouched so the count/deep-link uses keep the
  // wide read they actually need.
  const { data: mine } = usePeopleDirectory({ role: "all", scope: "mine" });
  const now = useMemo(() => new Date(), []);

  // Call Sheet Wave 2 — the active studio, for the Companies chip / rolodex
  // marker. Null while the reads are still in flight.
  //
  // QA-R2-1: `orgs.find(o => o.type === 'design_studio')` is a FIRST MATCH over
  // an unordered membership read, and a designer may belong to two design
  // studios (`designer@patina.dev` does). The room's rolodex, its payee markers
  // and its crew names all live under ONE of them, so the guess came back wrong
  // roughly half the time and the company card printed "Unnamed" for its crew.
  // The directory rows carry each card's own `organization_id`, so the org that
  // actually holds the book answers first; the membership list is the fallback,
  // sorted so it never moves between renders.
  const { data: orgs } = useOrganizations();
  const memberOrgId = useMemo(() => {
    const sorted = [...(orgs ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    return (
      sorted.find((o) => o.type === "design_studio")?.id ??
      sorted[0]?.id ??
      null
    );
  }, [orgs]);
  const organizationId = useMemo(
    () => directoryRolodexOrgId(all ?? []) ?? memberOrgId,
    [all, memberOrgId],
  );

  // Deep-link entry (R78/R60/F4): /people?person=<id>&role=<role> opens
  // straight onto a profile — the Orders book's "relationship & profile →"
  // cross-link lands here, and so does ⌘K's person row (F4's receiving end:
  // ⌘K doesn't always know the role, so a bare `?person=<id>` resolves the
  // role from the roster itself once it loads). R82: /people?thread=<id>
  // lands on the Threads view with that conversation open — the Post's
  // Letters carry the designer here (never a copy; the same shared thread
  // the margin renders). Read once on mount from the location itself (the
  // Room is client-only; no Suspense-bound useSearchParams needed) —
  // `deepLinkHandledRef` keeps this from re-firing (and re-opening a profile
  // the designer already closed) once `all` finishes loading or refetches.
  //
  // Params the Room has ANSWERED are erased from the address (`view`, `role`,
  // `add` — the ones that only describe an opening state). `person` and `thread`
  // stay: they name what is on screen, so they keep their share/refresh
  // semantics exactly as they were.
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const stripHandledParams = (keys: string[]) => {
      if (!keys.some((k) => params.get(k) !== null)) return;
      const rest = new URLSearchParams(params.toString());
      for (const k of keys) rest.delete(k);
      const qs = rest.toString();
      router.replace(qs ? `/people?${qs}` : "/people", { scroll: false });
    };
    const person = params.get("person");
    const firm = params.get("firm");
    const roleParam = params.get("role");
    const tradeParam = params.get("trade");
    if (tradeParam) setTrade(tradeParam);
    const thread = params.get("thread");
    const add = params.get("add");
    const viewParam = params.get("view");
    // Call Sheet Wave 2 — an opening-state param exactly like `view`/`role`
    // (never carries identity), so it's read + stripped the same way.
    const scopeParam = params.get("scope");
    const wantedScope: ContactScope | null =
      scopeParam === "mine" || scopeParam === "studio" ? scopeParam : null;
    if (wantedScope) setScope(wantedScope);
    const roles: PartyRole[] = [
      "client",
      "lead",
      "maker",
      "gc",
      "team",
      "sub",
      "installer",
      "receiver",
    ];

    if (person) {
      const urlRole =
        roleParam && (roles as string[]).includes(roleParam)
          ? (roleParam as PartyRole)
          : null;
      const resolved =
        urlRole ?? all?.find((p) => p.person_id === person)?.role ?? null;
      if (!resolved) {
        // No role in the URL, and the roster hasn't resolved this person yet
        // — wait for `all` rather than dropping the deep-link. Once it has
        // loaded and there's still no match, give up quietly.
        if (all) deepLinkHandledRef.current = true;
        return;
      }
      deepLinkHandledRef.current = true;
      setView("directory");
      if (isFieldRosterRole(resolved)) {
        setOpenParty({ id: person, role: resolved });
      } else {
        // Land the chip a click from that row would have left pressed, so
        // backing out of the card shows it in context, not under Everyone.
        setChip(directoryChipFromParam(resolved));
        setHighlightPersonId(person);
        window.setTimeout(() => {
          setHighlightPersonId((h) => (h === person ? null : h));
        }, 2200);
        setOpenPerson({ id: person, role: resolved });
      }
    } else if (firm) {
      // `?firm=` names a company card by its own rolodex id — the same shape
      // `?person=` names a person card with, since v4 keys both on the card.
      deepLinkHandledRef.current = true;
      setView("directory");
      setOpenFirm(firm);
    } else if (thread) {
      deepLinkHandledRef.current = true;
      setPendingThreadId(thread);
      setView("threads");
    } else if (add === "maker" || add === "client") {
      // R78 — ⌘K "Add a maker" lands here and cold-starts the add sheet.
      deepLinkHandledRef.current = true;
      // The dissolve's add-quick-action redirect emits BOTH keys
      // (/portal/clients?add=1 → /people?role=client&add=client), so the roster
      // behind the sheet has to be filtered too — closing the sheet should leave
      // the designer on the Clients tab they asked for, not under "All".
      if (roleParam) setChip(directoryChipFromParam(roleParam));
      setAddKind(add);
      setAddOpen(true);
      // PR-j — only `add` is an opening state that has been answered. `role`,
      // `view`, `scope` and `trade` NAME WHAT IS ON SCREEN and stay in the
      // address, so a narrowed room can be shared and refreshed.
      stripHandledParams(["add"]);
    } else {
      deepLinkHandledRef.current = true;
      // R21 dissolve — the rail and the Directory's role filter are addressable
      // now. `?view=` names a rail view; a BARE `?role=` (no person) filters the
      // Directory, which is what /portal/clients and /portal/vendors became.
      // Both together (`?view=directory&role=maker`) is coherent, so neither
      // clobbers the other; an unknown value is ignored in silence.
      const wantedView = peopleViewFromParam(viewParam);
      if (roleParam) setChip(directoryChipFromParam(roleParam));
      if (wantedView) setView(wantedView);
      else if (roleParam) setView("directory");
      // PR-j — `role`, `view`, `scope` and `trade` stay. Nothing is stripped.
    }
  }, [all, router]);

  // PR-j — THE ADDRESS NAMES WHAT IS ON SCREEN. `?role`, `?view`, `?scope` and
  // `?trade` are kept and kept CURRENT, so a narrowed room can be shared,
  // bookmarked and refreshed into the same narrowing. `?person` and `?firm`
  // name the card that is open. Nothing is written until the deep-link read
  // has run, so the first paint never clobbers the address it was handed.
  useEffect(() => {
    if (!deepLinkHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string | null) => {
      if (value) params.set(key, value);
      else params.delete(key);
    };
    setOrDelete("view", view === "directory" ? null : view);
    setOrDelete("role", chip === DEFAULT_DIRECTORY_CHIP ? null : chip);
    setOrDelete("scope", scope === DEFAULT_CONTACT_SCOPE ? null : scope);
    setOrDelete("trade", trade === "all" ? null : trade);
    setOrDelete("person", openPerson?.id ?? null);
    setOrDelete("firm", openFirm);
    const next = params.toString();
    if (next === window.location.search.replace(/^\?/, "")) return;
    router.replace(next ? `/people?${next}` : "/people", { scroll: false });
  }, [view, chip, scope, trade, openPerson, openFirm, router]);

  // The live Engine nudge: the strongest dormant tie from the nurture queue.
  // Reads `mine` (scope:'mine'), NOT `all` — see the note above `mine`.
  const nudge = useMemo(() => {
    const queue = deriveNurtureQueue(mine ?? [], now);
    const due = queue.filter((e) => e.due);
    const top = due[0];
    if (!top) return null;
    return {
      count: due.length,
      name: top.person.display_name,
      since: humanizeSince(top.person.last_touch_at, now),
    };
  }, [mine, now]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 3600);
  };

  const nav: PeopleViewProps = {
    openPerson: (id, role) => {
      // A manual open supersedes any stray deep-link highlight (F4).
      setHighlightPersonId(null);
      setOpenFirm(null);
      peopleEvents.personCardOpened({
        source: "directory_row",
        seat_count: all?.find((p) => p.person_id === id)?.seat_count ?? null,
      });
      // EVERY Directory row opens the PERSON CARD now — the room's unit is the
      // card, and the card carries the seats beneath it (direction §1 line 1).
      // The seat's own sheet, where the SMS thread lives, is opened from a
      // seat line inside the card, never from the row.
      setOpenPerson({ id, role });
    },
    openThread: (threadId) => {
      setOpenPerson(null);
      setPendingThreadId(threadId);
      setView("threads");
    },
    goView: (v) => {
      setOpenPerson(null);
      // CR3-4: the firm card is chosen ahead of everything else in the body
      // (`openFirm ? <CompanyCard/> : …`), so leaving it standing pinned the
      // card on screen while the rail wrote `?view=threads&firm=<id>` behind
      // it, with the card's own Back the only way out.
      setOpenFirm(null);
      setPendingThreadId(null);
      setNotice(null);
      setHighlightPersonId(null);
      setView(v);
    },
    notify,
  };

  /** Route the directory to a chip AND surface the Directory view. */
  const filterDirectory = (next: DirectoryChip) => {
    setChip(next);
    nav.goView("directory");
  };

  const askEngine = () => {
    const route = routePeopleAsk(ask);
    if (!route) return;
    switch (route.kind) {
      case "nurture":
        nav.goView("nurture");
        notify(
          "The Engine surfaced who is drifting out of touch — see the Nurture queue.",
        );
        break;
      case "directory": {
        filterDirectory(directoryChipFromParam(route.role));
        const what =
          route.role === "maker"
            ? "your makers"
            : route.role === "gc"
              ? "your general contractors"
              : route.role === "lead"
                ? "your open leads"
                : "your roster";
        notify(`Filtered the directory to ${what}.`);
        break;
      }
      case "search":
        // F3 — a real filter now, not a toast: the Directory already reads
        // `ask` live as its search prop, so switching to it is the whole act.
        nav.goView("directory");
        break;
    }
  };

  /**
   * CR9-1 — A SEAT LINE NEVER FABRICATES A KIND.
   *
   * This coerced every non-field seat to `'sub'` before opening
   * `PartyProfileSheet`, which prints the role it is handed twice — the eyebrow
   * "Field crew · Subcontractor" and the Kind row — so a household member
   * (`client_rep`), a city inspector (`other`), a client or a maker's rep all
   * opened a sheet stating a kind the record does not hold, over their real
   * name, with a field-link band and an SMS composer beneath it. Two clicks
   * from the Directory, through both doors R-AA opened (the person card's seat
   * line and the Directory row's seat disclosure).
   *
   * Only the four field-roster kinds have a field sheet to open. Every other
   * seat goes where R-AA already sends a seat line — the PERSON'S CARD, the
   * room's unit, which carries the seat and its facts beneath the human.
   */
  const openSeat = (seat: PeopleDirectorySeat) => {
    if (isFieldRosterRole(seat.party_kind)) {
      setOpenParty({ id: seat.seat_id, role: seat.party_kind });
      return;
    }
    const personId = seat.person_id;
    if (!personId) return;
    // The identity's OWN directory role, read the way the deep-link handler
    // reads it. `usePerson` filters on it, so a guessed role returns no row.
    const resolved =
      all?.find((p) => p.person_id === personId)?.role ?? "contact";
    setOpenFirm(null);
    setOpenParty(null);
    setOpenPerson({ id: personId, role: resolved });
  };

  const body = openFirm ? (
    <CompanyCard
      firmId={openFirm}
      organizationId={organizationId}
      onOpenPerson={(id) => {
        setOpenFirm(null);
        setOpenPerson({ id, role: "contact" });
      }}
      onAnnounce={notify}
      onBack={() => setOpenFirm(null)}
    />
  ) : openPerson ? (
    <PersonProfile
      personId={openPerson.id}
      role={openPerson.role}
      organizationId={organizationId}
      onOpenSeat={openSeat}
      onBack={() => setOpenPerson(null)}
      {...nav}
    />
  ) : view === "directory" ? (
    <DirectoryView
      {...nav}
      chip={chip}
      onChipChange={(next) => {
        setNotice(null);
        setChip(next);
      }}
      trade={trade}
      onTradeChange={setTrade}
      onOpenFirm={(firmId) => {
        peopleEvents.companyCardOpened({
          source: "directory_row",
          paper_state:
            all?.find((p) => p.person_id === firmId)?.paper_state ?? null,
        });
        setOpenFirm(firmId);
      }}
      notice={notice}
      makerLens={makerLens}
      onMakerLens={setMakerLens}
      search={ask}
      highlightPersonId={highlightPersonId}
      organizationId={organizationId}
      scope={scope}
      onScopeChange={setScope}
    />
  ) : view === "threads" ? (
    <ThreadsView {...nav} pendingThreadId={pendingThreadId} />
  ) : view === "nurture" ? (
    <NurtureView {...nav} />
  ) : view === "reviews" ? (
    <ReviewsView {...nav} />
  ) : view === "portfolio" ? (
    <PortfolioView {...nav} />
  ) : view === "your-eye" ? (
    // R21 dissolve — the panel is self-contained (its own hooks, no nav
    // contract); it reads the designer, not a party in the roster.
    <YourEyePanel />
  ) : (
    <OutreachView {...nav} />
  );

  return (
    <RoomShell
      title="The People Room"
      count={
        all
          ? // QA-R2-9: the head counts identities, and a company-only
            // engagement with nobody named is the firm, already counted once.
            directoryHeadLine(directoryEntryCounts(directoryIdentityRows(all)))
          : undefined
      }
      // CR7-1: SPEC §3's preamble is "Both widths must show identical facts",
      // and §6.2's 390 adaptations do not name the head. The count prints on a
      // phone.
      countAtEveryWidth
      action={
        <DocumentActionGroup
          surfaceKey="people"
          regionKey="room-head"
          aria-label="People actions"
        >
          <DocumentAction
            actionKey="add-person"
            variant="primary"
            leading="+"
            onClick={() => setAddOpen(true)}
          >
            Add person
          </DocumentAction>
        </DocumentActionGroup>
      }
    >
      {/* Ask bar — over people + history (derivation-backed v1). */}
      <AskBar value={ask} onChange={setAsk} onAsk={askEngine} />

      <PeopleCompactSelector
        currentView={view}
        profileOpen={!!openPerson || !!openFirm}
        directoryCount={all?.length}
        nudge={nudge}
        onSelect={nav.goView}
      />

      {/* PR-q / C2 — the Directory is the studio's LEDGER, so the room widens
          to the 1200 studio band. The 760px cap was a DocSheet measure, and a
          five-column ledger row cannot live inside one. */}
      <div
        data-people-layout
        data-people-current-view={
          openPerson ? "profile" : openFirm ? "firm" : view
        }
        className="mx-auto flex w-full max-w-[1296px]"
      >
        <PeopleDesktopRail
          activeView={openPerson || openFirm ? null : view}
          directoryCount={all?.length}
          nudge={nudge}
          onSelect={nav.goView}
        />
        {/* Main panel. */}
        <main
          data-people-main-panel
          className="min-w-0 w-full flex-1 px-4 py-6 sm:px-6 min-[1180px]:px-8"
        >
          <div className="mx-auto max-w-[1200px]">{body}</div>
        </main>
      </div>

      {/* Add a person — a paper sheet over the Room. */}
      <AddPersonSheet
        open={addOpen}
        initialKind={addKind}
        // QA-R3-1: the room already knows which studio holds the book.
        organizationId={organizationId}
        onClose={() => setAddOpen(false)}
        onAdded={(message, landOn) => {
          // Land them where they'll show: the Directory, narrowed to the chip
          // the kind just added falls under — with the confirmation INLINE
          // above the roster (R83: no toast; R51's quiet grammar).
          filterDirectory(landOn);
          setNotice(message);
        }}
        // R21 dissolve — /portal/pipeline is gone; open leads are Desk folders.
        onGoToLeads={() => router.push("/desk")}
      />

      {/* Field party sheet — the SMS/field-link surface for a GC / sub /
          installer / receiver, over the Room (D1). */}
      <PartyProfileSheet
        open={!!openParty}
        partyId={openParty?.id ?? null}
        role={openParty?.role ?? "sub"}
        onClose={() => setOpenParty(null)}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          data-people-status
          className="fixed bottom-[var(--doc-shell-floating-bottom)] left-1/2 z-[65] w-[min(38rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[4px] border border-[rgba(250,247,242,0.18)] bg-[var(--color-charcoal)] px-4 py-3 font-body text-[14px] leading-relaxed text-[var(--color-off-white)] motion-safe:animate-[doc-fade_200ms_ease-out]"
        >
          {toast}
        </div>
      )}
    </RoomShell>
  );
}
