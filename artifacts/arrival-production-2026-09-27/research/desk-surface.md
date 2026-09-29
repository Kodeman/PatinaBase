# Recon: the production Desk surface

Angle: where and how the cinematic "project arrival" mockup would attach to the real Desk in `apps/designer-portal`. Read-only recon; every claim below carries a `file:line` I opened directly.

## (a) Route path(s) and page/layout files

- The designer's post-sign-in home is **`/desk`**, rendered by `apps/designer-portal/src/app/(document)/desk/page.tsx:71` (`export default function DeskPage()`).
- It sits inside the `(document)` route group, laid out by `apps/designer-portal/src/app/(document)/layout.tsx:62` (`DocumentLayout`).
- `middleware.ts:148` and `middleware.ts:158` are the two places that redirect a signed-in designer to `/desk` — from an auth page (`callbackUrl` fallback) and from the public landing page (`/`) respectively. `middleware.ts:12` restricts the whole shell to `designer`/`admin` role domains.
- The unauthenticated landing page (`apps/designer-portal/src/app/page.tsx:70`) also links `/desk` directly as "Enter → Designer Portal".
- Nav confirmation: `desk/page.tsx` carries the comment "Placed here per... The Desk (spec v1.1 §7)" and its own header text; I found no other candidate "home" route — no `(portal)` route group exists (retired by the R21 dissolve per `apps/designer-portal/CLAUDE.md`'s Conventions section, which states `app/(portal)/` was deleted).

## (b) Component tree — down to cards, need/claim/since lines, and the primary action

```
DeskPage  (desk/page.tsx:71, 'use client')
└─ <main>                                                    (desk/page.tsx:328)
   ├─ header: greeting (Playfair) + date + DocumentActionGroup
   │    "Capture a lead" (primary) / "Open a project" (secondary) / "Find anything ⌘K"
   ├─ isError ? whole-desk error state : (
   │    ├─ rosterBlock → <DeskRoster>            (desk-roster.tsx:202)
   │    │    ├─ head row: eyebrow sentence + facet acts ("Only what needs me", "By person")
   │    │    ├─ overdueLine sentence
   │    │    ├─ belowHead  → the Desk-arbiter's one MarginNote (hire-handoff / first-touch / walkthrough-offer / setup-whisper)
   │    │    ├─ dayLine block (optional) — sentence(s) linking to cards below
   │    │    └─ <DocumentActionGroup regionKey="every-job">
   │    │         ├─ <DeskClaimsGrid>  → per card: <DeskClaimCard>   (desk-claim-card.tsx:66)
   │    │         │      1. stage plate + custody mark              (registers, fixed order, DOM = a11y order)
   │    │         │      2. name (Link → jobHref)                   ("name" register)
   │    │         │      3. person · phase line                      ("person" register)
   │    │         │      4. THE NEED SENTENCE                        ("sentence" register — overdueText in terracotta-ink, else needText)
   │    │         │      5. THE ONE ACT (DocumentAction, secondary/tertiary) → href or openLedger()
   │    │         └─ <LedgerHalf> → per row: <DeskLedgerRow>          (desk-ledger-row.tsx:22)
   │    │                1. mark (ring) + custody label + name (Link → jobHref)
   │    │                2. personLine
   │    │                3. "sentence" cell — line.motionText (e.g. "With client since <date>") or "Nothing needs your hand."
   │    │                4. "value" cell — tabular date (motionAnchorDate)
   │    │                5. "act" cell — DocumentAction (tertiary)
   │    ├─ <RecentBoardsStrip />                (desk/page.tsx:459)
   │    ├─ <DeskBoardsReactionRollup />          (desk/page.tsx:460)
   │    └─ <DeskContents prominent?> )           (Studio index / front matter, desk/page.tsx:464/470)
   ├─ <CaptureLeadSheet open={captureOpen} .../>  (overlay, desk/page.tsx:476)
   └─ <OpenProjectSheet open={openProjectOpen} .../> (overlay, desk/page.tsx:482)
```

Card/row detail, verified in `desk-claim-card.tsx`:
- **Project name / primary link**: `desk-claim-card.tsx:145` — `<Link href={line.jobHref} data-register="name">`.
- **Need/claim line**: `desk-claim-card.tsx:170-181` (`data-register="sentence"`) — prints `line.overdueText` (terracotta-ink) or `line.needText`.
- **"Since"/activity line**: not on the card itself but on the at-rest ledger row and the motion chips — `desk-roster-derivation.ts:255` documents the contract: `with_client` chips read "With client since &lt;sent date&gt;" (built at `desk-derivation.ts:1162`: `` `With client since ${fmtDay(row.proposal_sent_at)}` ``); `desk-ledger-row.tsx:76` renders it as `line.motionText ?? 'Nothing needs your hand.'` in the row's "sentence" cell.
- **Primary action per project**: `desk-claim-card.tsx:184-204`, one `DocumentAction` per card/row — either `onClick={() => openLedger(...)}` (opens an overlay sheet) or `href={line.act.href}` (navigates), never two acts on one card (comment at `desk-claim-card.tsx:182`: "6 · the one act, never two").
- Card entrance today: `desk-claim-card.tsx:96-97` applies `desk-settle` (className `desk-settle`, `style={{'--i': index}}`) only when the `settle` prop (from `useSettleOnce()`, `desk-roster.tsx:72-80`) is true — i.e., once per document *session* (a module-level flag, not per-mount), staggered by card index. This is the closest existing "entrance" motion on cards, not a full-viewport overlay.

## (c) `@patina/supabase` hooks / server fetches, and fields read

- `useDeskEngagements()` — portal-local hook, `apps/designer-portal/src/hooks/use-desk-engagements.ts:1-150+`. Reads the `document_state` Postgres view (migration 00188, per its own docstring `use-desk-engagements.ts:2`) via `createBrowserClient()` (`@patina/supabase`, line 29), plus `delivery_events` (00150) for schedule conflicts (`:9`), proposal/milestone/phase rows for schedule signals, receivables, flagged lines (`item_feedback`→`proposal_items`/`proposal_board_items`→`proposals`), and ceremony rows. 60s `refetch` interval; `placeholderData: keepPreviousData`; a "suspicious-empty" guard that verifies the session and throws rather than silently rendering a false-empty Desk (`:14-24`). Returns `{ folders, chips, live, composed }` (`DeskData`, `:60-73`).
- `useProfile()` (`@patina/supabase`, imported `desk/page.tsx:12`) — fields read on the page: `display_name`, `full_name`, `created_at` (`desk/page.tsx:182`, `:215-217`).
- `useOrganizations()` (`@patina/supabase`, `desk/page.tsx:13`) — fields read: `type` (to find the `design_studio` org, `desk/page.tsx:89`), `id`.
- `useOrganizationMembers(studio?.id ?? '')` (`@patina/supabase`, `desk/page.tsx:14`) — fields read: `user_id`, `invited_by`, `handoff_note`, `profiles.full_name`/`profiles.display_name` (`desk/page.tsx:97-103`, `:230`).
- `useAuth()` (portal-local, `@/hooks/use-auth`) — `user.id`, `user.name` (`desk/page.tsx:74`, `:182`).
- `useFeatureFlag('onboarding-teammate-persona')` (portal-local, PostHog-backed) — gates the hire-handoff margin note (`desk/page.tsx:86-87`).
- `useAnsweredNotes()` — inside `DeskRoster` (`desk-roster.tsx:33`, `:215`), feeds `deriveDeskClaims`.
- Not confirmed: whether `document_state` or any of the above is ever read server-side (RSC) rather than client-side — every hook I found is invoked from `'use client'` components; I did not find a server-component data fetch for the Desk.

## (d) Layout shell for a full-viewport overlay layer; server vs. client

- `DeskPage` itself is a **client component** (`'use client';` at `desk/page.tsx:1`).
- `DocumentLayout` (`(document)/layout.tsx:62`) is a **server component** (no `'use client'` directive, exports `metadata`) that composes a long chain of client providers/overlays as children: `DocumentTimeProvider` → `MobileShellProvider` → `HelpStateProvider` → `DocumentHelpProvider` → `DeskWalkthroughProvider` (`layout.tsx:76-135`). Inside that innermost provider, `{children}` (the page) is followed by a flat sibling list of always-mounted overlay components: `LogStrip`, `StudioDrawer`, `CommandBar`, `AccountSheet`, `InvoiceOverlays`, `DraftProposalOverlay`, `ReturnToLeadUndo`, `MobileActionDock`, `MobileBar`, `MobileSheets`, `DeskWalkthrough`, `DeskDoorway` (`layout.tsx:91-134`). This flat list — siblings of `{children}` inside `document-route-shell` — is the layout's own precedent for "chrome that coexists with the open document" (D1, per the layout's docstring `:34-40`).
- The root layout (`app/layout.tsx:52`) is also a server component; it wraps everything in `<Providers>` (client, `providers/providers.tsx:30`) which itself mounts `QueryClientProvider` → `PostHogAnalyticsProvider` → `{children}` + `<Toaster/>` + a dev-only `ReactQueryDevtools` (`providers.tsx:44-57`). No dedicated `#portal-root` / modal-root DOM node exists in either layout — overlays (`CaptureLeadSheet`, `OpenProjectSheet`, the `(document)` layout's sheets) appear to rely on fixed/absolute CSS positioning as ordinary React children rather than `createPortal`; I did not find a `createPortal` call in the files I opened (not exhaustively grepped across every overlay file, so: **not confirmed** that zero overlay in the app uses a portal — only confirmed for the ones cited above).
- **Best mount point for a Desk-only, full-viewport arrival overlay**: inside `desk/page.tsx`'s `<main>` return, as a sibling near the top of the JSX (client component, so it can hold local `useState`/`useEffect` for the 10s-hold-then-fly timer) — it does not need `DocumentLayout` because the arrival is Desk-specific in the mockup (`index.html` = "the Desk"). If the arrival must also run on the five Document routes (`document*.html`), the shared piece belongs in `(document)/layout.tsx`'s sibling-overlay list instead (same pattern as `LogStrip`/`CommandBar`), gated so it fires once per route-type per session rather than on every soft navigation.

## (e) Design tokens in use

- **Fonts**: loaded via `next/font/google` in the root layout — `Inter` (`--font-inter`), `Playfair_Display` weights 400–800 + italic (`--font-heading`), `DM_Mono` (`--font-mono`) — `app/layout.tsx:9-28`, composed into `fontVariables` (`:30`) and applied to `<body>` (`:59`). Not Google `<link>` tags; all three are `next/font` self-hosted.
- **Paper/ink colours**: `globals.css:9-14` — `--color-off-white: #FAF7F2`, `--color-pearl: #E5E2DD`, `--color-clay: #C4A57B`, `--color-aged-oak: #8B7355`, `--color-mocha: #5C4A3C`, `--color-charcoal: #2C2926`; text-grade "ink" companions (`--color-clay-ink`, `--color-terracotta-ink`, etc.) at `globals.css:27-33`, each annotated with its WCAG contrast ratio. The Desk's own paper background is `var(--bg-primary)` (`(document)/layout.tsx:73`), described in that file's docstring as "off-white paper (Desk light restyle)".
- **Easing/duration tokens**: `globals.css:201-208` — `--ease-default`, `--ease-spring`, **`--ease-editorial: cubic-bezier(0.22, 1, 0.36, 1)`**, `--duration-fast/normal/slow/editorial` (150/300/500/700ms), plus a press-clock pair `--press-in: 70ms` / `--press-out: 240ms` (`:212-214`).
- **Existing motion / keyframes** (`globals.css`): `doc-sheet-up` (`:276`, vertical-only overlay settle, D1/spec §10 — "paper never slides in from screen edges"), `doc-raise`/`doc-fade` (`:288`/`:298`, sheet pick-up crossfade), **`doc-breath`** (`:310-321`, "the ONLY ambient motion in the system... opacity swell on the active spine marker"), **`desk-settle`** (`:447-458`, the card stagger described in (b) above, 320ms `--ease-editorial`, `both`, keyed by `--i`), `fold-in`/`fold-arrow-flip` (`:467-491`), `strata-sweep-*` (`:531-543`), and a landing-page-only set (`text-reveal`, `section-enter`, `strata-draw`, `bar-fill`, `:1801-1876`) used by `app/page.tsx` (not by the Desk).
- **`prefers-reduced-motion` handling**: present throughout — `doc-breath` is disabled under `@media (prefers-reduced-motion: reduce)` (`globals.css:322-326`), `desk-settle` likewise (`:502-505`), `strata-sweep` (`:559`), and the landing-page set (`:1873-1878`). This is a real, consistently-applied pattern the arrival must follow.
- **Doctrine on ambient/performed motion (governs whether the arrival is even permitted)**: `docs/design/the-document/DECISIONS.md:381` — R15 ("the breath... the ONLY ambient motion... nothing on the Desk ever moves") — is explicitly **superseded** by **R154** (`DECISIONS.md:11255-11263`, dated 2026-09-27, same day as this recon): *"R154 · Motion freed — the no-motion rule set retired... The Desk and the Document may carry ambient and performed motion; 'the studio won't notice Patina' is a promise about engagement pressure, not about pixels being still."* R154 explicitly resolves R-DM1 from the motion-concepts deck and states R-DM2–R-DM7 plus the cinematic-arrival rulings (R-DM8+) remain open for Kody. **This means the general "no motion on the Desk" objection is doctrinally cleared, but the specific arrival-motion rulings (R-DM2, R-DM8/10/15, etc., per the user's memory) are still open decisions, not yet made.** `DECISIONS.md:10217-10219` separately confirms the R15 breath's `prefers-reduced-motion` fallback survives R154 as "the accessibility floor" even though the ambient-motion ban itself is gone.

## (f) Desk → Document navigation: href pattern, soft nav, and what triggers the arrival

- Every card/row link to a project uses **`next/link`**'s `<Link href={line.jobHref}>` — `desk-claim-card.tsx:145` and `desk-ledger-row.tsx:53`.
- `jobHref` is built once in `desk-roster-derivation.ts:394`: `` const jobHref = `/doc/${row.engagement_id}`; `` — a plain client route to `apps/designer-portal/src/app/(document)/doc/[id]/`. Cards' primary act can instead target `need.deepLink ?? jobHref` (`:399`) or fall back to `chip?.href ?? jobHref` for the ledger's default act (`:402`).
- No explicit `prefetch` prop is passed on either `Link` (`grep` for `prefetch` on both files returned nothing) — they take Next 15's default: automatic viewport-based prefetch for the route shell/loading boundary, since `/doc/[id]` is a dynamic segment.
- **Both `/desk` and `/doc/[id]` are inside the same `(document)` route group and share the one `DocumentLayout`** (confirmed in (a)/(d)), so a `Link` click from a Desk card to a Document is an **App Router soft/client-side navigation** — the layout and its always-mounted overlay siblings (`CommandBar`, `AccountSheet`, etc.) do not unmount, and there is no full document (browser) load. This is the load-bearing fact for the arrival design: **an arrival that plays "on page open" cannot rely on a browser `load`/hydration event when reached via a Desk card click — it must trigger on Next.js route-change (e.g. `usePathname` change, a route-level `useEffect`, or a client transition hook), not on mount alone**, unless the arrival is scoped to only the cases where a genuine document load happens (a fresh tab, a bookmark, a hard refresh, or the middleware's server-redirect into `/desk` after sign-in — all of which *do* produce a real navigation/hydration boundary).
- I did not find (and it is **not confirmed**) any existing client-side navigation *interception* (no `router.push` wrapper, no shared transition context) that the arrival could hook into today — soft navigation here is the default Next.js `<Link>` behavior only.

## Existing "breath"/entrance-animation doctrine (R15/R154) — direct relevance

Already covered fully in (e). Summary for the ship decision: the blanket "nothing moves on the Desk" rule is retired (R154, 2026-09-27), so building a cinematic arrival on the Desk is no longer blocked by doctrine — but the specific arrival rulings the user's memory calls "the call" (R-DM2) and the cinematic-arrival rulings (R-DM8+) are recorded as still open for Kody, not yet decided, and R154 does not itself decide them.

## Gaps / not confirmed

- Whether any hook here is read server-side (RSC) rather than client `'use client'` — not found, and not exhaustively ruled out beyond the hooks actually imported by `desk/page.tsx` and `desk-roster.tsx`.
- Whether any overlay in the app (`CaptureLeadSheet`, `OpenProjectSheet`, the `(document)` layout's sheets) uses `createPortal` — not found in the two files inspected; not grepped across the full overlay directory.
- Exact behavior of Next 15's default dynamic-route prefetch for `/doc/[id]` under this app's `next.config` — not read (out of scope for this angle; flagged for whoever owns the navigation-timing decision).
- No feature-flag currently exists for this work; `apps/designer-portal/CLAUDE.md`'s Conventions section states `the-document-pilot` is retired and any new gated work "mints its own flag through `useFeatureFlag` + `NEXT_PUBLIC_FLAG_OVERRIDES`" — confirmed mechanism (`use-feature-flag.ts:49-60`), but no arrival-specific flag exists yet in this codebase as of this read.
