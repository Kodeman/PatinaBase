# 10 — Code anatomy of The Document's reading shell

All paths relative to `apps/designer-portal/src/` unless prefixed. Current code only.

---

## 1. Shell

**Route file:** `app/(document)/doc/[id]/page.tsx` (2383 lines).

### The grid and its three regimes

The shell root is one `<div>` at `app/(document)/doc/[id]/page.tsx:1761-1765`:

- `data-document-shell` — `page.tsx:1762`
- `data-shell-regime="single-below-1180-compact-to-1439-full-from-1440"` — `page.tsx:1763`
- className — `page.tsx:1764`:
  `relative grid min-h-screen grid-cols-1 overflow-x-clip bg-[var(--doc-paper)] [grid-template-rows:auto_1fr] min-[1180px]:grid-cols-[56px_minmax(0,1fr)] min-[1180px]:[grid-template-rows:none] min-[1440px]:grid-cols-[200px_minmax(0,1fr)_232px] motion-safe:animate-[doc-raise_270ms_ease-out] motion-reduce:animate-[doc-fade_200ms_ease-out]`

| Regime | Columns | Rows | Who occupies what |
|---|---|---|---|
| `<1180` | `grid-cols-1` | `[grid-template-rows:auto_1fr]` | Spine `hidden` (`doc-spine.tsx:44`); margin rail `hidden` (`margin-rail.tsx:258`); paper is the whole grid. Index/margin live in mobile sheets. |
| `1180–1439` | `grid-cols-[56px_minmax(0,1fr)]` | `[grid-template-rows:none]` | 56px spine column (compact rail, `doc-spine.tsx:44` `min-[1180px]:block … w-full … px-1.5`); margin is a **fixed** overlay sheet, not a column (`margin-rail.tsx:258` `min-[1180px]:fixed … w-[min(360px,calc(100vw-56px))]`). |
| `≥1440` | `grid-cols-[200px_minmax(0,1fr)_232px]` | inherited `none` | 200px spine (`min-[1440px]:w-auto min-[1440px]:px-4`), paper centre, 232px margin column (`margin-rail.tsx:258` `min-[1440px]:sticky min-[1440px]:col-start-3 min-[1440px]:w-auto`). |

A 1%-alpha paper-grain layer is painted `absolute inset-0 z-0` at `page.tsx:1768-1777` — deliberately **no z-index on `<main>`** so fixed procurement panels are not trapped (`page.tsx:1783-1786`).

### The paper `<main>`

`page.tsx:1787-1791`:

- `ref={mainRef}` — `page.tsx:1788`
- `data-document-paper` — `page.tsx:1789`
- `data-shelf-open={openShelf ? 'true' : undefined}` — `page.tsx:1790`
- className — `page.tsx:1791`:
  `w-full min-w-0 max-w-[1040px] justify-self-center px-7 pb-32 pt-8 min-[1180px]:px-10 min-[1440px]:px-12`

Measure: **max 1040px**, centred by `justify-self-center`. Horizontal padding 28 → 40 → 48px across the three regimes; top 32px, bottom 128px. Closes at `page.tsx:2305`.

An open shelf shifts that padding: `app/globals.css:1000-1007` sets `[data-document-paper] { transition: padding-left 200ms ease }` and `[data-document-paper][data-shelf-open='true'] { padding-left: 344px }` from 1440px; from 2020px the shift is released back to `3rem` (`app/globals.css:1008-1012`).

### `[data-active-section]` mount and the `mainRef` query

The active-section wrapper is a `<div>` at `page.tsx:1939-1959`:
- `id={sectionAnchorId(row.active_section)}` — `page.tsx:1940`
- `data-active-section` — `page.tsx:1942`
- `tabIndex={-1}` — `page.tsx:1943`
- `className="scroll-mt-24 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"` — `page.tsx:1944`
- drag handlers for folio drop — `page.tsx:1945-1958`

The single `mainRef` read is the **resume landing** effect, `page.tsx:1166-1174`:

```
const el = mainRef.current?.querySelector('[data-active-section]');   // page.tsx:1170
if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6)  // page.tsx:1171
  el.scrollIntoView({ block: 'start' });                              // page.tsx:1172
```

Gated on `readRecentDocumentsInHand().some(d => d.id === row.engagement_id)` (`page.tsx:1169`) — a first-time visitor sees the header, a returning one is dropped at the active section. A second breakpoint read exists at `page.tsx:996` (`window.matchMedia?.('(min-width: 1180px)')` to pick a desktop-vs-mobile focus id).

### Route-group chrome, in mount order

`app/(document)/layout.tsx` — `SkipToPaper` (`layout.tsx:53`) sits *outside* `DocumentRouteBoundary` (`layout.tsx:54`); inside `div.document-route-shell` (`layout.tsx:55`) the provider stack is `DocumentTimeProvider` (58) → `MobileShellProvider` (60) → `HelpStateProvider` (64) → `DocumentHelpProvider` (69) → `DeskWalkthroughProvider` (72). Children then siblings, in this order:

| # | Component | line |
|---|---|---|
| 0 | `SkipToPaper` | `layout.tsx:53` |
| 1 | `{children}` (the paper) | `layout.tsx:73` |
| 2 | `LogStrip` | `layout.tsx:74` |
| 3 | `StudioDrawer` | `layout.tsx:75` |
| 4 | `RegistryShortcuts` (renders nothing) | `layout.tsx:78` |
| 5 | `CommandBar` (⌘K) | `layout.tsx:80` |
| 6 | `InterruptionSettings` | `layout.tsx:82` |
| 7 | `AccountSheet` | `layout.tsx:85` |
| 8 | `InvoiceOverlays` | `layout.tsx:88` |
| 9 | `DraftProposalOverlay` | `layout.tsx:90` |
| 10 | `MobileActionDock` | `layout.tsx:91` |
| 11 | `MobileBar` | `layout.tsx:92` |
| 12 | `MobileSheets` | `layout.tsx:93` |
| 13 | `FeedbackLayer` | `layout.tsx:98` |
| 14 | `DeskWalkthrough` | `layout.tsx:101` |
| 15 | `DeskDoorway` — LAST on purpose, effects run in mount order (`layout.tsx:102-108`) | `layout.tsx:108` |

No `ToastProvider`, ever — `layout.tsx:38-42`; a `toast()` reached from this tree no-ops by design.

---

## 2. Header stack, in mount order

Order below is the order children appear inside `<main>` on a project document with **no** worktable composition (`table === null`, so the ticket takes its letterhead position — `page.tsx:1829`).

### 2.1 `DocLetterhead` — `components/document/doc-letterhead.tsx`

Mounted `page.tsx:1797-1826`. Root: `<header id="document-project-status" tabIndex={-1}>` — `doc-letterhead.tsx:52`, className `doc-rule-mid mb-4 pb-5 pt-3.5 focus-visible:outline …`. **Not sticky.**

Vertical contributions as written: `pt-3.5` = 14px · `pb-5` = 20px · `mb-4` = 16px, plus the `doc-rule-mid` bottom rule.

Contents in order:
1. `<div className="mb-2.5">` + `StrataMark state="active" size="lg" fill={fill}` — `doc-letterhead.tsx:53-55`. `lg` = width 120, bar 4, gap 6 (`strata-mark.tsx:45`) → 3 bars ⇒ **24px tall**; `mb-2.5` = 10px.
2. Title — `LetterheadTitle` when `projectId` (`doc-letterhead.tsx:57`), else a plain `<h1>` (`doc-letterhead.tsx:59-61`). Both: `font-heading text-[40px] font-medium leading-[1.08] tracking-[-0.015em]` (`doc-letterhead.tsx:59`, `letterhead-vitals.tsx:491`, and the editing input at `letterhead-vitals.tsx:509`). 40 × 1.08 ⇒ **43px**.
3. `{client}` — the `HouseholdChip` (`doc-letterhead.tsx:63`; passed at `page.tsx:1806-1816`). Its root button is `mt-1.5 flex items-baseline text-left` (`household-chip.tsx:42`) with a `font-heading text-[1.15rem] italic leading-tight` name (`household-chip.tsx:46`) ⇒ 6px + ~23px.
4. Vitals — `LetterheadVitals` when `projectId` (`doc-letterhead.tsx:65`), else `<p className="mt-1 text-[11px] text-[var(--text-muted)]">` (`doc-letterhead.tsx:67`).
5. `data-in-hand-room` room-lens line, only with a held room — button form `doc-room-lifted mt-2.5 flex min-h-11 …` (`doc-letterhead.tsx:77`), static form `doc-room-lifted mt-2.5 border-l-2 … px-2.5 py-1.5` (`doc-letterhead.tsx:87`).
6. `NeedsSetupChip` — `doc-letterhead.tsx:92`; returns `null` at count 0 (`needs-setup-chip.tsx:30`), else `mt-1.5` (`needs-setup-chip.tsx:33`).

**`LetterheadVitals`** — `components/document/letterhead-vitals.tsx:375-459`. Root `<div className="mt-1">` (`letterhead-vitals.tsx:391`); the vitals line is a `<div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px]">` (`letterhead-vitals.tsx:396`) — deliberately a `div` not a `p` because a `VitalDate`'s FolioPopover mounts a `div` (`letterhead-vitals.tsx:392-395`). Fields: two `VitalDate`s, a budget-band pair (`letterhead-vitals.tsx:419-434`), a contract total (`letterhead-vitals.tsx:443`).

**The Phases fold** — trigger `<button onClick={() => setPhasesOpen(v => !v)}>` printing `Phases ▾ / ▸` at `letterhead-vitals.tsx:445-452`; state `letterhead-vitals.tsx:377`. Body `{phasesOpen && <PhasesFold …/>}` at `letterhead-vitals.tsx:454`. `PhasesFold` (`letterhead-vitals.tsx:276-360`) is `<div className="mt-1.5">` (305) wrapping a `<table>` (306) with an `sr-only` caption (307); per-phase rows print label (313), logged actual (316), a unit (319) and an editable estimate input `w-10` (344) + `h est.` (346). It returns `null` with no phases (`letterhead-vitals.tsx:283`). Not persisted — plain `useState`, resets on unmount.

### 2.2 `JobTicket` — `components/document/job-ticket.tsx`

Mounted `{!table && jobTicket}` at `page.tsx:1829`; the node itself is composed once at `page.tsx:1714-1748` (`JobTicketMount` for a project, `ProjectlessTicketMount` otherwise) and handed to `TableFrame` as `ticket={jobTicket}` at `page.tsx:1975` — `TableFrame` prints it at `worktable/table-frame.tsx:61`, above the table. One node, two mutually exclusive positions (`table-frame.tsx:19-24`).

**The sentinel:** `<div ref={sentinelRef} id={TICKET_SENTINEL_ID} aria-hidden />` — `job-ticket.tsx:347`, id constant `'doc-ticket-sentinel'` at `job-ticket.tsx:56`. It is the ticket's *own*, rendered immediately above the sticky element, because the ticket stands in two positions and a letterhead-anchored sentinel would flip the pin early (`job-ticket.tsx:15-22`). An `IntersectionObserver` at `threshold: 0` sets `pinned = !entry.isIntersecting` — `job-ticket.tsx:218-228`.

**The sticky element:** `<section ref={sectionRef} aria-label="The job" data-job-ticket="">` — `job-ticket.tsx:348-363`, with `data-pinned` (352) and `data-unfolded` (353), className:
`sticky top-0 z-[4] border-y border-[var(--color-pearl)] bg-[var(--doc-paper)] py-2.5` — `job-ticket.tsx:362`. Vertical: `py-2.5` = 10px top and bottom, plus 1px borders top and bottom.

**`--doc-seam-height` publication:** `useLayoutEffect` at `job-ticket.tsx:248-259`. When `!pinned || unfolded` it *removes* the property (`job-ticket.tsx:250-253`); otherwise it measures `sectionRef.current.getBoundingClientRect().height` and sets `--doc-seam-height` on `document.documentElement`, rounded (`job-ticket.tsx:254-255`), with a cleanup that removes it (256-258). Deps: `[pinned, unfolded, seam.identity, seam.exceptions]`. Var name constant at `job-ticket.tsx:60`.

**Fold / pin rules:**
- `wide = useMediaMatch('(min-width: 1440px)', true)` — `job-ticket.tsx:201`, query at `:64`.
- `seamAtRest = useMediaMatch('(max-width: 1179px)', false)` — `job-ticket.tsx:202`, query at `:66`. Below 1180 the ticket **rests as the seam**.
- `unfolded = fold ?? (!pinned && !seamAtRest)` — `job-ticket.tsx:244`. So at ≥1180 unpinned it opens with eight rows; below 1180 it opens as the two-line seam; a reader's explicit `fold` overrides both.
- The reader's fold is **reset on every pin change**: `setFold(null)` in the effect at `job-ticket.tsx:235-242`, which also moves focus to the fold button when the reader was standing inside the ticket (`focusWithin` ref, `job-ticket.tsx:213`; refocus at `:241`).
- `useMediaMatch` is `useSyncExternalStore`-based so the first paint is already correct (`job-ticket.tsx:109-134`).
- Head + fold control keep ONE tree position across both forms (`job-ticket.tsx:364-399`); folded prints `seam.identity` (382, `SEAM_IDENTITY_CLASS` at `:106`) and `seam.exceptions` (383); unfolded prints `head.subject` / `head.phase` (375-378).
- Rows container `<div id={rowsId} className="mt-1.5">` — `job-ticket.tsx:402`; per-row wrapper `data-ticket-row={row.key}` with `border-b border-[rgba(44,41,38,0.10)] last:border-b-0` (`job-ticket.tsx:404-407`).
- Shared row classes: `ROW_CLASS` (`job-ticket.tsx:86-87`, `py-2` + `-mx-1.5 … px-1.5`), `LABEL_CLASS` `w-[5.5rem] … text-[11px]` (`:89-90`), `VALUE_CLASS` `text-[13.5px] leading-snug` (`:92-93`), `DOOR_CLASS` (`:95`), `FOLD_CLASS` (`:97-98`), `META_CLASS` (`:100-101`).

**The eight rows** — `deriveTicket()` at `lib/document/ticket-derivation.ts:780-793`, always in this order (a ninth, `clientcopy`, is pushed only when `input.clientCopy` is set — `:791`):

| # | key | label | door | door site |
|---|---|---|---|---|
| 1 | `rooms` | Rooms | `slot('rooms-rail')` if the pinned table offers it, else `{kind:'expand', rooms}` | `ticket-derivation.ts:440-444` |
| 2 | `pieces` | Pieces | `regionDoor(input,'ffe')` → `unfold-region` or `none` | `:524-531` |
| 3 | `drawings` | Drawings | `{kind:'leaf', shelf:'planroom'}` with a project, else `none` | `:543-547` |
| 4 | `spec` | Spec | `{kind:'leaf', shelf:'specbook'}` with a project, else `none` | `:570-574` |
| 5 | `boards` | Boards | slot `boards-strip` if offered, else `{kind:'leaf', shelf:'moodboards'}` / `none` | `:580-594` |
| 6 | `money` | Money | `regionDoor(input,'money')` | `:653-657` |
| 7 | `dates` | Dates | `regionDoor(input,'schedule')` | `:710-714` |
| 8 | `people` | People | `{kind:'overlay', overlay:'call-sheet', available}` | `:735-741` |
| (9) | `clientcopy` | Copy | `{kind:'leaf', shelf:'clientcopy'}` | `:767-771` |

Door union declared at `ticket-derivation.ts:74-81`. `regionDoor` returns `none` when the spread does not mount that region (`:781-788`); `slotDoor` at `:796-801`; `hasProject` at `:792`. Rendering per door kind is the switch at `job-ticket.tsx:274-340`: `route` → `<a>` (276-280), `leaf` → `<a href>` below 1440 when a route exists else `<button>` (281-297), `slot` → `goToSlot` (298-307, helper at `:142-159`), `unfold-region` → `onUnfoldRegion` (308-317), `overlay` → call sheet (318-325), `none` → inert `<div>` (326-327), `expand` → the room chips (328-339, chip group at `job-ticket.tsx:410-455`). A **dead leaf** (leaf door, not wide, no route) prints no `→` and does not press — `job-ticket.tsx:267,283`.

**The seam derivation** — `deriveTicketSeam(rows, identity)` at `ticket-derivation.ts:826-859`: line one is `identity` (`deriveTicketIdentity`, `:797-802`, `The job · <Section> · <Phase> N of M`), line two is the **worst two** standing exceptions sorted by `RANK_ORDER` (`money-at-risk` 0, `promise-past-due` 1, `piece-stuck` 2 — `:826-830`), then `standingSince`, then ledger order (`:837-847`); a third is dropped whole (`.slice(0,2)`, `:855`); with none, `'Nothing overdue'` (`:853`). `deriveTicketHead` at `:811-818`.

### 2.3 `RedLetterZone` XOR `DocumentGuide` — the ternary

`page.tsx:1838-1847`. Guarded on `guideModel &&`; the red letter wins **only** when `row.engagement_kind === 'project' && enrichedOperationalNeeds && redLetterRows.length > 0 && !deskGuidanceFailed` (`page.tsx:1839-1843`) → `<RedLetterZone rows={redLetterRows} />` (`page.tsx:1844`); otherwise `<DocumentGuide model={guideModel} onActivate={activateGuide} />` (`page.tsx:1846`).

- `RedLetterZone` root: `<section aria-label="Needs attention" className="rounded-[3px] border-l-2 border-[var(--color-terracotta)] bg-[rgba(212,160,144,0.08)] px-3.5 py-2.5">` — `components/document/red-letter-zone.tsx:85-88`. **No outer margin at all.** Returns `null` on an empty list (`red-letter-zone.tsx:82`). One `DocumentActionGroup` for the whole zone (`:95-99`), list `mt-1.5 w-full` (`:100`).
- `DocumentGuide` root: `<section aria-labelledby="document-next-up" className="my-5 border-y border-[var(--color-pearl)] py-4">` — `components/document/document-guide.tsx:75`. Eyebrow (76), `mt-1` flex row (77), `h2 text-[19px]` (79), reason `mt-1 text-[12px]` (80), optional input line `mt-2 text-[11px]` (82), the action hidden below 1180 (`document-guide.tsx:91`).

Not sticky. The two have **different vertical footprints** (`my-5 … py-4` vs none), so the zone that renders changes the y of everything below it.

### 2.4 `LetterheadInstruments` — `components/document/letterhead-instruments.tsx`

Two mutually exclusive mounts: project (`page.tsx:1863-1872`, with `FolioLetterhead` at `page.tsx:1871`) and non-project with a client profile (`page.tsx:1874-1880`). Root is a `DocumentActionGroup surfaceKey="open-document" regionKey="letterhead-actions" className="mt-1"` — `letterhead-instruments.tsx:317-321`. Only vertical contribution at the top level is `mt-1` (4px). The compose panel below it is `mt-2 rounded-[4px] border … p-2.5` (`:360`). Not sticky.

Immediately after: `MobileMarginChips anchorKind="letterhead"` — `page.tsx:1884-1889`; its root is `flex flex-wrap gap-1.5 px-[0.15rem] pb-2 min-[980px]:hidden` (`mobile/mobile-margin-chips.tsx:89`) — invisible at every desktop regime.

### 2.5 The approvals region wrapper — `components/document/approvals/project-approval-document.tsx`

Mounted via `ProjectApprovalDocumentMount` at `page.tsx:1891-1900`; the mount is a pure pass-through returning `null` without a projectId (`project-approval-document-mount.tsx:32-40`).

- **Open:** `<section aria-labelledby="project-approvals-title" data-index-region="approvals" data-project-approval-document className="mt-6 min-w-0 border-y border-[var(--border-subtle)] py-6">` — `project-approval-document.tsx:584-588`. `RegionRule` (589) then `RegionHead` (590-601) then `<div id={APPROVALS_BODY_ID}>` (602).
- **Folded:** `<div data-index-region="approvals">` with **no spacing classes at all** — `project-approval-document.tsx:565` — then `RegionRule` (566) + `FoldSeam` (567-579). Folding this region therefore removes `mt-6 … py-6` = 72px plus two borders from the header stack.

### 2.6 `ScheduleRuleRegion` — `components/document/schedule/schedule-rule-region.tsx`

Mounted at `page.tsx:1930-1937`, inside `ScheduleNavProvider` (`page.tsx:1908`) and `RippleProvider` (`page.tsx:1922`) — both render **no DOM**, so `<main>` stays the Rule's real parent (`page.tsx:1901-1907`).

Both branches use the same root: `<section aria-label="Schedule frame" className="mb-4">` — folded `schedule-rule-region.tsx:181`, open `schedule-rule-region.tsx:199`. Folded prints `RegionRule` + `FoldSeam` + the glance + the phase-advance control (`:182-192`); open prints `RegionRule` (200), `RegionHead` (201-210), body `<div id={BODY_ID} className="mt-2">` (211).

**This is the one `sticky top-0` sibling of the ticket.** `app/globals.css:1026-1028` gives `[data-document-shell] section[aria-label='Schedule rule'] { top: var(--doc-seam-height, 0px) }` so the glance stands *under* the pinned seam instead of painting over it. The glance strip itself carries `className="mt-1"` (`schedule-rule-region.tsx:175`).

### 2.7 `SectionStageLineMount` — `components/document/section-stage-line-mount.tsx`

The **first child inside** `[data-active-section]` — `page.tsx:1964-1969`. Three shapes, all `<section data-section-stage-line>`:
- loading: `className="mb-1 min-w-0"` + `aria-busy` — `section-stage-line-mount.tsx:83-91`
- error: `className="mb-1 min-w-0"` — `:96-109`
- resolved: delegates to `SectionStageLine`, root `<section … data-section-stage-line className="mb-1 min-w-0 max-w-full overflow-x-clip">` — `workflow/section-stage-line.tsx:42-46`; label `text-[12px] uppercase tracking-[0.09em]` (`:55`); track bands `mt-3 w-full min-w-0 max-w-[21rem] space-y-1.5` (`:71`).

### 2.8 `TableFrame` per-stage mounts — `components/document/worktable/table-frame.tsx`

`page.tsx:1970-1976`. With `composition === null` it is a **pure fragment** — `table-frame.tsx:56` `if (!composition) return <>{children}</>;` — no wrapper element, no spacing. With a composition (`:59-81`):

1. `{ticket}` — `:61`
2. `{pending && <TableTurnLine onTurn={onTurn}/>}` — `:62`
3. `{table === 'delivery' && sealTurn && <SealTurnNote/>}` — `:63-65`
4. `<div data-table={table} data-table-setting={setting}>` — `:66` (no spacing classes)
   - `speccing` → `TableSlot name="rooms-rail"` — `:67-69`
   - `{children}` — `:70`
   - `intake` → `IntakeFutureSeams` — `:71`
   - `speccing` → `scheme`, `boards-strip`, `reach-in` slots — `:72-78`

### 2.9 Estimated px stack at 1440 (project doc, no table, no held room, no setup chip)

Values as written in the classes above; text heights are font-size × the stated leading.

| Band | Contribution | px |
|---|---|---|
| `<main>` `pt-8` (`page.tsx:1791`) | padding | 32 |
| letterhead `pt-3.5` (`doc-letterhead.tsx:52`) | padding | 14 |
| StrataMark `lg` + `mb-2.5` (`doc-letterhead.tsx:53-54`, `strata-mark.tsx:45`) | 24 + 10 | 34 |
| `<h1>` 40px / 1.08 (`doc-letterhead.tsx:59`) | text | 43 |
| HouseholdChip `mt-1.5` + 1.15rem leading-tight (`household-chip.tsx:42,46`) | 6 + 23 | 29 |
| `LetterheadVitals` `mt-1` + 11px line (`letterhead-vitals.tsx:391,396`) | 4 + 17 | 21 |
| letterhead `pb-5` + rule + `mb-4` (`doc-letterhead.tsx:52`) | 20 + 2 + 16 | 38 |
| **letterhead subtotal** | | **~211** |
| ticket sentinel (`job-ticket.tsx:347`) | empty div | 0 |
| ticket `border-y` + `py-2.5` (`job-ticket.tsx:362`) | 2 + 20 | 22 |
| ticket head row (META 11px) (`job-ticket.tsx:374-379`) | text | 15 |
| rows container `mt-1.5` (`job-ticket.tsx:402`) | margin | 6 |
| 8 rows × (`py-2` 16 + 13.5/1.375 ≈ 19 + 1px rule) (`job-ticket.tsx:86-87,404-407`) | 8 × 36 − 1 | 287 |
| **ticket subtotal** | | **~330** |
| `DocumentGuide` `my-5` + `border-y` + `py-4` + ~62 content (`document-guide.tsx:75-88`) | 40 + 2 + 32 + 62 | 136 |
| `LetterheadInstruments` `mt-1` + control row (`letterhead-instruments.tsx:320`) | 4 + 34 | 38 |
| approvals `mt-6` + border + `py-6` (`project-approval-document.tsx:588`) | 24 + 2 + 48 | 74 |
| approvals head + body (`RegionHead` `h2` 24/1.2 + status + rule + prose) | | ~180 |
| `ScheduleRuleRegion` head + `mb-4` (`schedule-rule-region.tsx:199,211`) | | ~120 |
| `SectionStageLineMount` `mb-1` + label (`workflow/section-stage-line.tsx:46,55`) | 4 + 18 | 22 |

**First-region-head y at 1440** — the approvals `<h2 id="project-approvals-title">` (`region/region-head.tsx:128-134`):
32 + 211 + 330 + 136 + 38 + 24 (`mt-6`) + 1 (border) + 24 (`py-6`) + ~14 (`RegionRule` `doc-rule-strong`) ≈ **810px**, i.e. roughly a full viewport below the fold on a 900px-tall window. Folding approvals removes 74; folding the ticket to its seam removes ~308.

---

## 3. Spine

### `components/document/doc-spine.tsx` — every child in order

Root `<aside aria-label="Document spine" data-document-spine data-spine-regime="sheet-below-1180-compact-to-1439-full-from-1440">` — `doc-spine.tsx:38-44`, className at `doc-spine.tsx:44`:
`sticky top-0 z-[2] hidden border-r border-[var(--color-pearl)] bg-[var(--doc-rail-stock)] min-[1180px]:box-border min-[1180px]:block min-[1180px]:h-screen min-[1180px]:w-full min-[1180px]:overflow-x-hidden min-[1180px]:overflow-y-auto min-[1180px]:px-1.5 min-[1180px]:pb-24 min-[1180px]:pt-4 min-[1440px]:w-auto min-[1440px]:px-4 min-[1440px]:pt-6`

| Order | Child | line | classes / behaviour |
|---|---|---|---|
| 1 | `<Link href="/desk">` "Put down" | `doc-spine.tsx:46-55` | `group mb-3 inline-flex min-h-11 w-full min-w-11 items-center justify-center rounded-[3px] font-mono text-[12px] … min-[1440px]:mb-4 min-[1440px]:justify-start min-[1440px]:gap-1 min-[1440px]:px-1.5`; the word is `min-[1180px]:inline` (`:52`) |
| 2 | `<ul>` of seven marks | `doc-spine.tsx:64-120` | `flex flex-col items-center gap-1 min-[1440px]:flex-row min-[1440px]:flex-nowrap min-[1440px]:items-center min-[1440px]:gap-0.5 min-[1440px]:-mx-2` (`:64`); `<li className="w-full shrink-0 min-[1440px]:w-auto">` (`:96`) |
| 2a | inert cell (`future`/`unrecorded`/no `onJump`) | `:98-104` | `flex min-h-11 items-center justify-center min-[1440px]:w-6` |
| 2b | jump button | `:106-115` | `flex min-h-11 w-full min-w-11 items-center justify-center rounded-[4px] transition-colors hover:bg-[rgba(196,165,123,0.08)] … motion-reduce:transition-none min-[1440px]:w-6` |
| 2c | mark pair | `:66-88, 102-103, 113-114` | `size="sm"` below 1440, `size="xs"` (22px) from 1440; `breathing={s.state === 'active'}`; fill from `fillStateAtSection(s.key)` |
| 3 | active-section caption | `doc-spine.tsx:122-136` | `<p className="mt-2.5 hidden min-[1180px]:block">`; label `break-words text-[11px] font-semibold leading-tight … min-[1440px]:text-[12px]` (`:129`), sub `mt-px … font-mono text-[11px] uppercase tracking-[0.05em] … min-[1440px]:text-[12px]` (`:132`) |
| 4 | `{shelved && <div className="hidden min-[1440px]:block">{shelved}</div>}` | `doc-spine.tsx:141` | the running index — **≥1440 only** |
| 5 | `<CompactSpineTimerDoorway />` | `doc-spine.tsx:143` | `mt-3 hidden … min-[1180px]:flex min-[1440px]:hidden` (`spine-timer.tsx:61`) |
| 6 | `<div className="hidden min-[1440px]:mt-4 min-[1440px]:block">` | `doc-spine.tsx:145` | wraps `SpineTimer` (`:146`) and the presence line `mt-2 font-mono text-[11px] uppercase tracking-[0.08em] leading-relaxed text-[var(--text-faint)]` (`:150-154`), printing `Just you · visible to the studio` or `You and …` |

### `components/document/spine-shelved-blocks.tsx`

`DocSpineShelvedBlocks` (`:42-54`) splits on whether this spread prints the Money row (`:48`) so the six-read money ladder is a **conditional mount**, not a disabled query (`:43-47`). `SpineBlocksWithMoney` (`:58-67`) reads `useMoneyLadder` and `selectIndexRung`, falling back to `'Money unread'` / `'Nothing moving yet'` / `'Reading…'` (`:63-65`). `SpineBlocks` (`:69-105`) derives `indexKeys` from `regions` (`:77-80`), calls `useDocumentRunningIndex(indexKeys, projectId)` (`:81`), reads `useProjectFFEItems(projectId)` (`:83-86`) — deliberately **not** deduped with FF&E's own `withLifecycle: true` query (`:8-11`) — and builds the four values (`:88-95`) and entries (`:97-101`). Mounted from the page at `page.tsx:1567`, handed to `DocSpine` as `shelved={shelvedSpine}` (`page.tsx:1780`).

### `components/document/spine-running-index.tsx`

`SpineRunningIndex` (`:33-121`). Entry shape `{key, label, value}` at `:27-31`. Returns `null` on zero entries (`:61`). Root `<div className="mt-4 border-t border-[var(--color-pearl)] pt-3">` (`:64`); heading `<p id="doc-running-index-label" className="mb-2 font-mono text-[11px] uppercase tracking-[0.1em]">On this paper</p>` (`:65-70`); list container `role="group" aria-labelledby="doc-running-index-label" className="relative pl-3"` (`:71-75`).

**The reading line** is one absolutely-positioned rule, not a row border (`:10-12`): `<span aria-hidden className="absolute left-0 w-[2px] bg-[var(--color-clay)] transition-[top,height] duration-200 ease-out motion-reduce:transition-none" style={{top: line.top, height: line.height}} />` — `:76-82`. It is measured off the active button's `offsetTop`/`offsetHeight` in `measure()` (`:45-52`), run in an isomorphic layout effect (`:24-25, 54`) and re-run on `resize` (`:56-59`).

Each entry is a `<button aria-current={current ? 'true':'false'} className="block w-full py-1.5 text-left …">` (`:86-95`) with a `text-[13px] leading-tight` label (`:97-105`, bolding to `font-semibold` when current) and a `mt-px font-mono text-[11px] uppercase tracking-[0.07em]` value (`:106-114`).

### `components/document/spine-timer.tsx`

- `CompactSpineTimerDoorway` (`:37-89`): a button, `da-score-hover mt-3 hidden min-h-11 w-full min-w-11 flex-col items-center justify-center gap-1 py-2 text-center … min-[1180px]:flex min-[1440px]:hidden` (`:61`) — the 1180–1439 form of the timer. Inner stack `doc-type-meta flex max-w-full flex-col items-center leading-[1.15]` (`:65`), a 6px status dot (`:69`), the elapsed figure (`:84`).
- `SpineTimer` (`:91-…`): `<div className="mt-4 hidden rounded-[5px] border border-[var(--color-pearl)] bg-[rgba(252,250,246,0.85)] px-3 py-2.5 min-[980px]:block">` (`:128`) — nested inside `doc-spine.tsx:145`'s `min-[1440px]:block`, so effectively ≥1440. Status line (`:130`), dot (`:133`), the `font-mono text-[17px] tracking-[0.04em]` figure `mb-2 mt-1` (`:140`), a control row `flex flex-wrap gap-1.5` (`:143`) with Pause/Resume (`:145-152`), and a `mt-2 space-y-1.5` note/adjust block (`:165-181`).

### `hooks/use-document-running-index.ts`

- **Band:** `READING_BAND = '-20% 0px -62% 0px'` — `:34`, used as the observer's `rootMargin` at `:112`.
- **Jump lock:** `JUMP_LOCK_MS = 700` (`:35`). Any `document:unfold-region` event sets `activeKey`, sets `lockRef`, and clears it after 700ms (`:166-180`). `resolve()` short-circuits to the locked key when it is attached (`:69-72`).
- **Retries:** `ATTACH_RETRY_MS = 250`, `ATTACH_RETRIES = 8` (`:37-38`) — ~2s. Attachment is a **query, not a subscription** (`:14-18`); `attach()` (`:120-133`) re-queries every root selector, observes what it finds, and re-schedules itself while `attached.size < ordered.length` (`:129-132`). A region mounting after the window is genuinely not picked up (`:17-18`).
- **Fallbacks,** all read the `attached` set rather than the declared list (`:59-66`): locked key → `:69`; nothing attached ⇒ `null` → `:74-77`; **foot of the paper** ⇒ last present key (`:81-87`, `window.innerHeight + scrollY >= scrollHeight - 4`); first key currently intersecting (`:88-92`); otherwise the last root whose `top <= innerHeight * 0.25` (`:93-99`).
- Scroll is rAF-throttled (`:136-145`); `jump` requests the unfold then scrolls (`:182-191`).
- `scrollToRegion(key, projectId)` (`:202-222`) is exported so the ticket performs the identical act (`:198-201`): double-rAF (`:209-210`), `scrollIntoView({block:'start', behavior: reduceMotion ? 'auto':'smooth'})` (`:212-215`), then focus the region heading or the root (`:216-219`).

### `lib/document/document-index.ts`

- Keys: `'schedule' | 'approvals' | 'ffe' | 'money'` — `:17`.
- `PROJECT_PAPER_ORDER` — `:36-57` — in **paper mount order**, not alphabetical: `approvals` (`project-approvals-title`, `:37-41`), `schedule` (`project-schedule-title`, `:42-46`), `ffe` (`ffe-region-heading-${projectId}`, `:47-51`), `money` (`money-region-heading`, `:52-56`). The docstring at `:25-35` states the pairing law: reorder a mount in page.tsx and this array moves with it.
- `WORK_SPREAD_REGIONS` = the order minus `money` and `schedule` (`:71-74`) ⇒ **approvals + ffe only**.
- `paperRegionsForSection` — `:76-82`: `project` ⇒ all four (`:79`); `install` / `care` ⇒ approvals + ffe (`:80`); every other section ⇒ **`[]`** (`:81`), i.e. the four pre-work spreads get no index rows at all.
- Derived exports `DOCUMENT_INDEX_KEYS` (`:85-86`), `DOCUMENT_INDEX_LABELS` (`:88-91`), `regionHeadingId` (throws on an undeclared key, `:93-102`), `regionAnchorSelector` → `[data-index-region="…"]` (`:104-106`).
- `UNFOLD_REGION_EVENT = 'document:unfold-region'` (`:113`) and `requestRegionUnfold` (`:115-120`) — the index cannot unfold a region directly because fold state is region-local (`:108-112`).

### `lib/document/section-derivation.ts` ORDER

`const ORDER: SectionKey[]` — `:59-67` — `brief, discovery, direction, proposal, project, install, care`. Labels at `:69-77`. `deriveSections` (`:156-180`) marks `settled` / `active` / `future` by index against `active_section` (`:157, 166`), ghosts the first four to `unrecorded` for a manual project (`:159-161, 167`) and holds them `future` while lineage is pending (`:162-163, 168`), then picks the sub-label voice (`:170-177`) and returns `{key, label, state, sub}` (`:179`).

### Behaviour per breakpoint

| Width | Spine |
|---|---|
| `<1180` | `hidden` (`doc-spine.tsx:44`). The document index is the mobile spine **sheet**. |
| `1180–1439` | 56px rail: Put down glyph + word, seven `sm` marks stacked vertically, the active caption at `text-[11px]`, `CompactSpineTimerDoorway` (`spine-timer.tsx:61`). **No running index** (`doc-spine.tsx:141`), no full timer, no presence line. |
| `≥1440` | 200px rail: marks travel in one horizontal row as `xs` (`doc-spine.tsx:64,103`), caption at `text-[12px]`, running index block, `SpineTimer`, presence line. |

### The mobile spine sheet — `components/document/mobile/mobile-sheets.tsx`

Sheet kinds `'drawer' | 'timer' | 'spine' | 'margin-item'` — `:129, :182`. The shell is a fixed layer `z-[58]` (`:256`) with a backdrop (`:268`) and a panel `absolute inset-x-0 bottom-0 max-h-[80%] overflow-y-auto rounded-t-[14px] pb-[max(0.9rem,env(safe-area-inset-bottom))] motion-safe:animate-[doc-sheet-up_250ms_var(--ease-editorial)]` (`:274`), a grab handle (`:285`) and `px-[1.1rem] pb-2 pt-1` content (`:291`).

The **spine sheet** is `:441-…`: a top row (`:451`), then `<ul className="mt-1">` of `activeDoc.sections` (`:455-456`), future sections at `opacity-45` (`:464`), each row printing label (`:466`) and sub (`:476`); an inert `<div className="flex items-center gap-2.5 py-2">` for unreachable ones (`:487`) versus a button that dispatches `new CustomEvent('document:open-section', …)` (`:494`) inside `flex w-full items-center gap-2.5 py-2 text-left` (`:499`). Below the sections, a `mt-3 border-t … pt-2.5` sub-heading (`:512`) with its own list (`:515-529`), then `In the margin · N` (`:539-540`) with the margin summary list (`:546-560`) or the empty line (`:569-571`).

---

## 4. Margin

`components/document/margin-rail.tsx` (679 lines). Mounted at `page.tsx:2316-2334` — `ResponsiveMarginRail` wrapping either `DiscoveryMargin` (Discovery only, `page.tsx:2320`) or `MarginRail` (`page.tsx:2322-2332`).

### Modes and widths

- Queries: `COMPACT_MARGIN_QUERY = '(min-width: 1180px)'` (`:79`), `FULL_MARGIN_QUERY = '(min-width: 1440px)'` (`:80`).
- Mode sync effect `:110-128`: both matches tracked; the sheet is force-closed when it is *not* compact or *is* full (`:115-117`), and re-opened when a margin-origin `DocSheet` is on top (`:118-119`).
- `openAsSheet = isCompactShell && !isFullRail && open` (`:200`); `visible = isFullRail || openAsSheet` (`:201`).

| Tier | Form | Width | Source |
|---|---|---|---|
| `<1180` | none — `hidden`, mobile chips + spine-sheet summary carry it | — | `margin-rail.tsx:258`; `page.tsx:2308-2310` |
| `1180–1439` | on-demand **fixed sheet**, modal, focus-trapped, Esc-dismissed | `w-[min(360px,calc(100vw-56px))]` | `margin-rail.tsx:258` |
| `≥1440` | permanent **sticky grid column** | `w-auto` in `col-start-3` = **232px** | `margin-rail.tsx:258`; `page.tsx:1764` |

Full className at `margin-rail.tsx:258-262`:
`z-[32] hidden border-[var(--color-pearl)] bg-[var(--doc-rail-stock)] motion-safe:transition-transform motion-safe:duration-200 motion-reduce:transition-none min-[1180px]:fixed min-[1180px]:inset-y-0 min-[1180px]:right-0 min-[1180px]:block min-[1180px]:h-screen min-[1180px]:w-[min(360px,calc(100vw-56px))] min-[1180px]:overflow-y-auto min-[1180px]:border-l min-[1440px]:sticky min-[1440px]:top-0 min-[1440px]:col-start-3 min-[1440px]:h-screen min-[1440px]:w-auto min-[1440px]:translate-x-0 min-[1440px]:overflow-y-auto` — plus the open/closed transform pair at `:259-262` (`translate-x-0` vs `translate-x-full`, with `min-[1440px]:pointer-events-auto` restoring the rail).

### `data-margin-*` attributes

| Attribute | Element | line |
|---|---|---|
| `data-margin-trigger` | the fixed edge tab, `fixed right-0 top-28 z-[30] hidden … min-[1180px]:inline-flex min-[1440px]:hidden` | `margin-rail.tsx:227-228` |
| `data-margin-panel` | the `<aside>` | `margin-rail.tsx:256` |
| `data-margin-mode` | `'rail'` when `isFullRail`, else `'sheet'` | `margin-rail.tsx:257` |
| `data-margin-close` | the sheet-header close button | `margin-rail.tsx:276` |

The scrim between them is `fixed inset-0 z-[31] hidden cursor-default bg-[rgba(44,40,37,0.08)] min-[1180px]:block min-[1440px]:hidden` (`:242`). Sheet header: `sticky top-0 z-[1] flex min-h-14 items-center justify-between border-b … px-4 min-[1440px]:hidden` (`:264`). Content wrapper: `px-4 pb-24 pt-4 min-[1440px]:pt-6` (`:284`). The sheet registers as a managed modal dialog (`:203-207`) and takes the ref-counted body-scroll lock (`:209-214`); its keydown trap and Esc handling are `:135-198`, deferring to an open anchored popover at `:150-153`.

### Contents in order (`MarginRail`, `:294-679`)

1. First-touch `MarginNote noteKey="doc-first-touch"` `className="mb-5"`, projects only — `:462-468`
2. File-change notes, one `MarginNote` each, `className="mb-4"` — `:469-486`
3. Header row `mb-3 flex items-baseline justify-between` with the `In the margin` label (`:489`) and the capture `DocumentActionGroup` (+ Decision / + Note) — `:488-513`
4. `MarginDecisionClassificationNotice` — `:515-517`
5. Drafts fold — `mb-2` wrapper (`:522`), toggle `aria-expanded={draftsOpen}` (`:524-531`), list `flex flex-col gap-1` (`:534`)
6. The note composer card `mb-2 rounded-[5px] border … p-3` — `:562-563`
7. `MarginHandoffs` — `:618-623`
8. Empty line, suppressed while handoffs exist — `:626-632`
9. `{raised.map(renderItem)}` — `:634`
10. Settled fold — `mt-3 border-t border-dashed … pt-2` (`:640`), toggle (`:642-650`), `{settledOpen && settled.map(renderItem)}` (`:651`)
11. The decision composer `DocSheet` — `:655-675`

### `components/document/margin-item.tsx`

`MarginItem` (`:18-70`). Root `<div>` at `:45-51`: `doc-elevated mb-2 rounded-[4px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] transition-colors duration-150 hover:border-[#CFC8BB]` plus `opacity-65` when resolved (`:46-48`), and an inline `borderLeft: 2.5px solid ${accent.border}` (`:49`). Hover on a line-anchored item highlights its FF&E line (`:36-42`). The whole card head is one button `block w-full px-3 py-2.5 text-left` with `aria-expanded` only when expandable (`:52-67`); the body is `px-3 pb-3` (`:68`).

### `components/document/margin-note.tsx`

Once-per-person, recedes on first use (`:9-11`). Persistence: `localStorage` under `patina:margin-note:<noteKey>` — prefix `:30`, key builder `:32-34`, `hasSeen` `:39-42` (server and a blocked store both read as **seen**, so nothing renders), `hasMarginNoteBeenSeen` `:55-57`, `markMarginNoteSeen` `:63-66`. Visibility is resolved after mount from `suppressed || (seen ?? hasSeen(noteKey))` (`:110-115`); a lifted `seen` hold re-reveals an unseen note (`:86-90`).

### The mobile chips — `components/document/mobile/mobile-margin-chips.tsx`

`MobileMarginChips` (`:22-…`), `anchorKind: 'line' | 'letterhead'` (`:32`). Root `<div className="flex flex-wrap gap-1.5 px-[0.15rem] pb-2 min-[980px]:hidden">` (`:89`) — note the **980px** cut, not 1180. Handoff gates ride only the letterhead anchor (`:83`). Two chip forms share `inline-flex max-w-full items-center gap-1.5 rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] py-[0.32rem] pl-2 pr-2.5 text-[11px]` — static `:98`, pressable `:114` (adds `active:border-[#cfc8bb]`).

---

## 5. Disclosure already shipped

| Mechanism | File | Trigger | Persistence | What unmounts | Folded distinguishable from empty? |
|---|---|---|---|---|---|
| Region fold (three voices) | `components/document/region/use-region-fold.ts:97-142` | `toggle`/`setFolded` from the head's `Fold ↑` or the seam's press | `localStorage`, key `patina:doc-fold:<docId>:<region>` (`:42-46`), values `'1'`/`'0'` (`:56-58`); read in an effect, never in render (`:17-19, 111-114`) | the region **body** — the head and the body are replaced by a `FoldSeam` | **Yes** — the seam always prints a summary sentence, and each region's empty state is a different element |
| — its precedence | `use-region-fold.ts:121` | `forceOpen ? false : (explicit ?? latchedDefault ?? false)` | default is **latched**, not read live (`:104-119`), so a late query cannot yank a region shut (`:11-15`); a fold gesture under `forceOpen` leaves no record (`:129`) | — | — |
| — the seven keys | `use-region-fold.ts:25-40` | `approvals`, `schedule`, `schedule-rule`, `ffe`, `money`, `money-table`, `boards`, `care` — `schedule` vs `schedule-rule` and `money` vs `money-table` are deliberately separate (`:27-31, 34-38`) | per doc, per region | — | — |
| Fold seam | `components/document/region/fold-seam.tsx:46-82` | click ⇒ `onUnfold` only (`:65`); focus is landed by the caller via `focusRegionHeading` (`:41-44`, contract `:8-12`) | none | itself, on the caller's re-render | Yes — name (`:68`), summary (`:71`), `unfold ↓` (`:74-78`). No `aria-controls` because the body is unmounted (`:58-61`) |
| Ticket fold / pin | `components/document/job-ticket.tsx:235-244` | `Fold ↑ / Unfold ↓` button (`:389-398`); pin from the sentinel observer (`:218-228`) | **none** — `fold` resets to `null` on every pin change (`:236`) | the eight rows (`:401`), replaced by the two-line seam (`:381-386`) | Yes — the seam prints identity + exceptions, or `'Nothing overdue'` (`ticket-derivation.ts:853`) |
| Ticket room chips | `job-ticket.tsx:328-339, 410-455` | the Rooms row's `expand` door, `roomsOpen` state (`:205`) | none | the chip group | Yes — `No rooms yet` at `:418-420` |
| Letterhead Phases fold | `components/document/letterhead-vitals.tsx:445-454` | `Phases ▾/▸` button | none (`useState`, `:377`) | the `PhasesFold` table (`:304-357`) | Partly — the trigger is hidden entirely when there are no phases (`:283` returns `null`) |
| The Record | `components/document/previous-work.tsx:36-61` | the `The record · N complete` bar (`:38-48`) | controlled/uncontrolled `open` (`:29-30`), telemetry `documentEvents.historyToggled` (`:31`) | nothing — the body is `hidden={!open}` **and** `{open ? children : null}` (`:59`) | Returns `null` at count 0 (`:34`), so folded-with-content and empty are different |
| Settled bar | `components/document/settled-bar.tsx:51-80` | the bar itself when a review body exists (`:52-61`) | caller state (`page.tsx:2223-2225`, `openSection`) | the review body — `hidden={!open}` + `{open ? children : null}` (`:72-79`) | Yes — the row prints `fold ↑ / unfold ↓` only when expandable (`:40-44`) |
| Shelves leaf | `components/document/shelves/shelf-panel.tsx:65-168` | a ticket `leaf` row (`job-ticket.tsx:289-295`) | none | the whole panel below 1440 when the shelf has a route (`:136` `if (!fullTier && routes) return null`); a shelf carried below 1440 is **routed to its own page** rather than dropped (`:88-94`) | n/a |
| — the paper shift | `app/globals.css:1000-1012` | `[data-document-paper][data-shelf-open='true']` set at `page.tsx:1790` | none | nothing — `padding-left: 344px` from 1440px, released to `3rem` from 2020px | n/a |
| `DocSheet` overlays | `components/document/overlays/doc-sheet.tsx:199-…` | any `open` prop | none | the sheet body; the document beneath stays mounted (D1) | n/a |
| Command bar (⌘K) | `components/document/command-bar.tsx` (mounted `app/(document)/layout.tsx:80`) | hotkey or `document:open-command-bar` | none | the palette | n/a |
| Mobile sheets | `components/document/mobile/mobile-sheets.tsx:182-292` | `MobileBar` handles / `document:open-section` etc. | none | the sheet | n/a |
| `document:*` CustomEvents | `lib/document/document-index.ts:113-120` and the command bar | `requestRegionUnfold(key)` dispatches `document:unfold-region` (`:117-119`); the running-index hook listens (`use-document-running-index.ts:166-180`); each region's own listener unfolds it | — | — | — |

Other `document:*` wires in the tree (dispatch counts across `src`): `document:open-call-sheet` (26 sites; dispatched from `page.tsx:1104-1106`), `document:open-command-bar` (17), `document:open-section` (3, `mobile-sheets.tsx:494`), `document:unfold-region` (1, `document-index.ts:118`), `document:open-margin` (1, `margin-rail.tsx:75-77`), `document:close-shelf` (1), plus `open-ledger`, `open-account`, `open-post`, `open-invoice-*`, `open-feedback`, `open-help`, `open-capture-lead` (`command-bar.tsx:176-178`), `open-open-project` (`command-bar.tsx:186-188`), `new-project-board`, `focus-project-approval`, `start-release`, `start-desk-walkthrough`.

---

## 6. Region heads and spacing

### `components/document/region/region-head.tsx`

Root `<div data-region-head={regionKey} className="grid grid-cols-1 items-start gap-x-4 gap-y-2 min-[1180px]:grid-cols-[1fr_auto]">` — `:118-121`. **It owns no outer spacing** — no `mt-*`, no `mb-*`, no padding. Every gap around a head is the caller's.

- Left column `min-w-0` (`:122`): optional eyebrow `font-mono text-[11px] uppercase tracking-[0.1em]` (`:124`); `<h2 id={headingId} tabIndex={-1} className="font-heading text-[24px] font-medium leading-[1.2] text-[var(--text-primary)] outline-none">` (`:128-134`); status `text-[12.5px] text-[var(--color-mocha)]` (`:135`); at most two exceptions, joined by ` · ` (`:85, 136-145`).
- Right column: `DocumentActionGroup` `justify-start min-[1180px]:justify-end` (`:149-153`), auto-named `${name} actions` (`:92-93`). Entry 0 is **always** `inked` regardless of its declared variant (`:156-157`); a dev-only guard `console.error`s an `inked` variant at index > 0 and a head with neither ledger nor body (`:95-115`). The `Fold ↑` control is appended as a `tertiary` action with `aria-controls={bodyId}` (`:177-187`).
- The two-track grid only exists from 1180px (`:14-19`); below that the heading stacks above the ledger. What moves is layout only — the named action region rides the same element at every width (`:21-24`).

### `components/document/region/region-rule.tsx`

`RegionRule({className, weight = 'strong'})` — `:17-36`. Renders `<div aria-hidden="true" role="presentation" data-rule-weight={weight}>` (`:25-28`) carrying `doc-rule-strong` or `doc-rule-mid` plus the caller's className (`:29-34`). `strong` (the 6px double rule) is the default and stays it; `mid` (1.5px charcoal) is opt-in (`:6-15`).

### Every inter-region spacing site

| Region | Wrapper classes | file:line |
|---|---|---|
| Letterhead (the stack's own top rule) | `doc-rule-mid mb-4 pb-5 pt-3.5` | `components/document/doc-letterhead.tsx:52` |
| Job ticket | `sticky top-0 z-[4] border-y … py-2.5` | `components/document/job-ticket.tsx:362` |
| Guide (when it renders) | `my-5 border-y … py-4` | `components/document/document-guide.tsx:75` |
| Red letter (when it renders instead) | `rounded-[3px] border-l-2 … px-3.5 py-2.5` — **no margin** | `components/document/red-letter-zone.tsx:85-88` |
| Letterhead instruments | `mt-1` on the action group | `components/document/letterhead-instruments.tsx:320` |
| Approvals — open | `mt-6 min-w-0 border-y border-[var(--border-subtle)] py-6` | `components/document/approvals/project-approval-document.tsx:588` |
| Approvals — folded | *(none)* — bare `<div data-index-region="approvals">` | `approvals/project-approval-document.tsx:565` |
| Approvals — inner request block | `mt-5 min-w-0 border-t border-[var(--color-pearl)] pt-5` | `approvals/project-approval-document.tsx:652` |
| Approvals — record list | `mt-6 min-w-0 border-t border-[var(--color-pearl)] pt-4` | `approvals/project-approval-document.tsx:835` |
| Schedule frame (Rule) — folded | `mb-4` | `components/document/schedule/schedule-rule-region.tsx:181` |
| Schedule frame (Rule) — open | `mb-4`, body `mt-2` | `schedule/schedule-rule-region.tsx:199`, `:211` |
| Stage line | `mb-1 min-w-0` (all three shapes) | `components/document/section-stage-line-mount.tsx:88`, `:101`, `components/document/workflow/section-stage-line.tsx:46` |
| Schedule ledger (Spine) | `mt-2` on `<section data-index-region="schedule">` | `components/document/schedule/schedule-spine.tsx:1055-1060` |
| FF&E region root | `scroll-mt-16` only — **no margin** | `components/document/ffe-section.tsx:1204-1210` |
| FF&E install/selecting head | `mb-1.5 mt-5` | `components/document/ffe-section.tsx:1213` |
| FF&E project head | `RegionRule className="mt-5" weight="strong"`, then head wrapper `mb-1.5` | `components/document/ffe-section.tsx:1290`, `:1302` |
| Money region (both branches) | `mb-5` on `<section data-index-region="money">` | `components/document/commercial/money-region.tsx:227-230`, `:248-251` |
| Money region — seam clearance | `style={SEAM_CLEARANCE}` = `scrollMarginTop: var(--doc-seam-height, 0px)` | `commercial/money-region.tsx:48`, applied `:231`, `:252` |
| Direction / Proposal head (in page) | `mb-1.5 mt-5 flex items-baseline justify-between` | `app/(document)/doc/[id]/page.tsx:2006` |
| Care band — nudge form | `mt-8 border-l-2 border-[var(--color-sage)] px-3.5 py-2.5` | `components/document/care-band.tsx:215-217` |
| Care band — settled form | `mt-8 rounded-[3px] bg-[rgba(168,181,160,0.16)] px-4 py-3.5` | `components/document/care-band.tsx:235` |
| Care band — folded form | `mt-8` wrapping `RegionRule` + `FoldSeam` | `components/document/care-band.tsx:249-251` |
| Care band — open form | `mt-8 rounded-[3px] bg-[rgba(229,221,208,0.5)] px-4 py-3.5` | `components/document/care-band.tsx:303-304` |
| The Record | `mb-5 mt-4` | `components/document/previous-work.tsx:37` |
| Settled bar (each) | `mb-2 scroll-mt-24` | `components/document/settled-bar.tsx:51` |
| Colophon | `mt-14 border-t border-[var(--color-pearl)] pb-6 pt-3` | `components/document/doc-colophon.tsx:102` |

Global scroll clearances that pair with the seam: `[data-document-shell] [data-index-region] { scroll-margin-top: var(--doc-seam-height, 0px) }` (`app/globals.css:1034`) and the FF&E floor `max(var(--doc-seam-height,0px), 4rem)` (`app/globals.css:1037`).

There is **no shared spacing token or wrapper**: the gaps range from `mt-8` (care) through `mt-6` (approvals), `mt-5` (FF&E rule, direction head), `mt-4` (record) and `mt-2` (schedule ledger) to `mb-5` (money) and *nothing at all* (FF&E root, red letter, folded approvals). Each region declares its own; the page never wraps them.

---

## 7. Motion inventory

Source of record is `app/globals.css` (26 `@keyframes` blocks; `grep -c "@keyframes"` → 26). **`apps/designer-portal/tailwind.config.ts` defines no `keyframes` and no `animation` extension** — `grep -n "keyframes\|animation" apps/designer-portal/tailwind.config.ts` returns nothing; `theme.extend` (`tailwind.config.ts:12-79`) carries only `fontFamily`, `maxWidth`, `colors`, `borderRadius`, and `plugins: []` (`:81`). So every `animate-*` class is a hand-declared CSS class and every `animate-[…]` is an arbitrary-value reference to a `globals.css` keyframe.

### Keyframes in the Document's own reading shell

| Keyframe | Defined | Animates | Applied at | Duration / easing |
|---|---|---|---|---|
| `doc-raise` | `app/globals.css:249-256` | `opacity 0→1` + `scale(.986)→none` | `app/(document)/doc/[id]/page.tsx:1764` (`motion-safe:animate-[doc-raise_270ms_ease-out]`); `components/document/rooms/room-shell.tsx:113` | 270ms `ease-out` (300ms `var(--ease-editorial)` in the room shell) |
| `doc-fade` | `app/globals.css:259-263` | `opacity 0→1` | the reduced-motion partner on `page.tsx:1764` and `rooms/room-shell.tsx:113`; 15 `motion-safe:` sites elsewhere; `.doc-sheet-panel` at `app/globals.css:1499` | 200ms `ease-out` (200ms `var(--ease-editorial)` on the sheet panel) |
| `doc-sheet-up` | `app/globals.css:237-246` | `translateY(14px→0)` + `opacity .6→1` | `components/document/overlays/doc-sheet.tsx:373` (240ms); `components/document/mobile/mobile-sheets.tsx:274` (250ms); `components/document/rooms/room-sheet.tsx:106` (300ms) | `var(--ease-editorial)` |
| `doc-breath` | `app/globals.css:271-279` | `opacity 1→.62→1` — the **only** ambient motion in the system | `.doc-breath` at `app/globals.css:281-283`, applied by `components/document/strata-mark.tsx:78` when `breathing` (i.e. the active spine marker, `doc-spine.tsx:73,82`) | 3s `ease-in-out infinite` |
| `fold-in` | `app/globals.css:404-412` | `opacity 0→1` + `translateY(-4px→0)` | `.fold-settle` at `app/globals.css:429-431` → `components/document/region/fold-seam.tsx:66` | 300ms `var(--ease-editorial) both`, wrapped in `@media (prefers-reduced-motion: no-preference)` |
| `fold-arrow-flip` | `app/globals.css:419-425` | `rotate(180deg)→none` | `.fold-arrow-settle` at `app/globals.css:435-437` → `components/document/region/fold-seam.tsx:76` | 300ms `var(--ease-editorial) both`, same no-preference gate |
| `desk-settle` | `app/globals.css:384-391` | `translateY(14px→0)` | `.desk-settle` at `app/globals.css:395-396` → `components/document/desk-roster.tsx:91` | 320ms `var(--ease-editorial) both`, stagger `calc(min(var(--i,0),6)*60ms)` |
| `strata-sweep-1/2/3` | `app/globals.css:468-470, 472-474, 476-478` | `scaleX(0→1)` per phase | `app/globals.css:497, 498, 499` | `var(--strata-cycle, 2.2s) cubic-bezier(0.4,0,0.2,1)` (`:492-496`) |
| `strata-sweep-fade` | `app/globals.css:480-483` | whole-mark `opacity 1→0` | `.strata-sweep` at `app/globals.css:485` | `var(--strata-cycle, 2.2s) ease-in-out infinite` |

Non-shell / marketing keyframes: `text-reveal` (`:1396-1403` → `.animate-text-reveal` `:1439-1441`, used `app/page.tsx:29`) and `section-enter` (`:1408-1415` → `:1443-1445`, used `app/page.tsx:23,51,64`). `fade-in` (`:1230-1235`) is reached only through an inline style at `components/portal/toast-provider.tsx:60`.

**Dead keyframes** — defined, no consumer anywhere in `src`: `page-enter` (`:1239-1249`), `fade-out` (`:1257-1262`), `slide-in-from-top/bottom/left/right` (`:1266-1271, 1275-1280, 1284-1289, 1293-1298`), `collapsible-down/up` (`:1326-1335, 1337-1347`), `shimmer` (`:1349-1356`), `strata-draw` (`:1420-1425`), `bar-fill` (`:1430-1435`), and `pulse-dot` (`:1457-1460`, which is not even wired to a class). Nothing in the reading shell depends on them.

Only three keyframe names ever appear in arbitrary Tailwind `animate-[…]` classes: `doc-raise`, `doc-fade`, `doc-sheet-up`.

### `.row-wash` / `components/document/row-wash.tsx`

- Rule: `app/globals.css:327-334` — `position:absolute; inset:0; z-index:-1; border-radius:2px; pointer-events:none; background: var(--wash, var(--wash-clay)); clip-path: circle(0 at var(--ink-x,50%) var(--ink-y,50%)); transition: clip-path 200ms var(--ease-editorial);`
- Open state: `app/globals.css:339-342` — `.has-wash:hover .row-wash, .has-wash:focus-within .row-wash { clip-path: circle(150% at var(--ink-x,50%) var(--ink-y,50%)); transition-duration: 260ms; }`
- Focus-only override (opens from centre, instantly): `app/globals.css:346-349`.
- The clay underline that opens with it: `.row-wash-score::after` at `app/globals.css:357-369`, `transform`/`background-color` over `var(--duration-fast) var(--ease-editorial)`.
- Component: `markInkPoint` writes `--ink-x`/`--ink-y` in px from `getBoundingClientRect()` (`row-wash.tsx:19-27`); `useRowWash()` returns `{onPointerMove, onPointerEnter}` (`:32-34`) — `onPointerEnter` places the point before the first frame so a fast pointer never opens from a stale centre; `RowWash({tone})` renders an `aria-hidden` span with `--wash`/`--wash-still` (`:39-52`); nine tones at `:8-17`. All timing is CSS; the component has no reduced-motion branch.
- Consumers: `components/document/desk-roster.tsx:23,83,90,95,110` and `components/document/ffe-section.tsx:76,225,394,417,480,484`. **Not** used by the ticket, spine, or region heads today.

### `.doc-elevated`

`app/globals.css:294-296` — `box-shadow: var(--elevation-sheet)`, the token declared once at `app/globals.css:188` (`0 1px 2px rgba(44,41,38,0.08)`). The comment at `app/globals.css:290-293` names it "the ONE depth declaration in this stylesheet". Exactly three consumers: `components/document/studio-drawer.tsx:289`, `components/document/margin-item.tsx:46`, `components/document/overlays/doc-sheet.tsx:371`.

### Easing / duration tokens

Declared in `:root`, `app/globals.css:191-201`:

| Token | Value | Line |
|---|---|---|
| `--ease-default` | `cubic-bezier(0.4, 0, 0.2, 1)` | `app/globals.css:191` |
| `--ease-spring` | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` | `app/globals.css:192` |
| `--ease-editorial` | `cubic-bezier(0.22, 1, 0.36, 1)` | `app/globals.css:193` |
| `--duration-fast` | `150ms` | `app/globals.css:194` |
| `--duration-normal` | `300ms` | `app/globals.css:195` |
| `--duration-slow` | `500ms` | `app/globals.css:196` |
| `--duration-editorial` | `700ms` | `app/globals.css:197` |
| `--press-in` | `70ms` | `app/globals.css:200` |
| `--press-out` | `240ms` | `app/globals.css:201` |

`--ease-editorial` is the house easing: `app/globals.css:335, 368-369, 395, 431, 435, 532-533, 553, 572-573, 595, 643, 674, 691, 919, 1440, 1444, 1449, 1454, 1499`, plus the four TSX arbitrary-value sites (`overlays/doc-sheet.tsx:373`, `mobile/mobile-sheets.tsx:274`, `rooms/room-sheet.tsx:106`, `rooms/room-shell.tsx:113`). `--ease-default` at `app/globals.css:1185, 1254` and `components/portal/toast-provider.tsx:60`. Rule-weight tokens `--rule-hair/--rule-mid/--rule-strong` sit alongside at `app/globals.css:130-132`.

### The `prefers-reduced-motion` blocks

`grep -c "prefers-reduced-motion" app/globals.css` → **12**. That resolves to **9** `@media (prefers-reduced-motion: reduce)` blocks (`grep -n "@media (prefers-reduced-motion: reduce)"` → 9 hits), **1** `no-preference` gate, and **2** prose mentions inside comments (`app/globals.css:270` and `:467`).

| # | Lines | What it neutralises |
|---|---|---|
| 1 | `app/globals.css:283-288` | `.doc-breath { animation: none }` — stills the active spine marker |
| 2 | `app/globals.css:439-458` | `.desk-settle` animation off; `.row-wash` swaps to the flat `var(--wash-still,…)` tint with `transition:none`; hover/focus `clip-path:none`; `.row-wash-score::after` transition off |
| 3 | `app/globals.css:496-503` | `.strata-sweep` + `.strata-fill` animation off, fill pinned at `scaleX(0.6)` |
| 4 | `app/globals.css:833-878` | The whole Scored Ink / `DocumentAction` grammar: transitions off on `.da-act`, `::before`, `.da-pool`, `.da-label` (+ pseudos), `.da-leading`, `.da-trailing`, `.da-tertiary .da-label::before`; hover/active pool clip-paths forced to their end state; the pressed underline thickens to 3px instead of animating |
| 5 | `app/globals.css:955-962` | `.da-score-hover::after` and `.da-glyph-btn` transitions off |
| 6 | `app/globals.css:1013-1016` | `[data-document-paper] { transition: none }` — the shelf-open `padding-left` step-aside becomes instant |
| 7 | `app/globals.css:1188-1195` (in `@layer base`) | `button, a, input, textarea, select { transition-duration: 0ms }` |
| 8 | `app/globals.css:1468-1476` (in `@layer utilities`) | `.animate-text-reveal, .animate-section-enter, .animate-page-enter, .animate-strata-draw, .animate-bar-fill { animation:none!important; opacity:1!important; transform:none!important; clip-path:none!important }` |
| 9 | `app/globals.css:1519-1523` | `.doc-sheet-panel { animation: none }` |
| (gate) | `app/globals.css:429-437` — `@media (prefers-reduced-motion: no-preference)` | The **only** way `.fold-settle` / `.fold-arrow-settle` are ever applied, so the fold seam's settle is opt-in rather than opt-out (`region/fold-seam.tsx:19-25` documents why: the seam must paint visible on the first server frame, held by `animation-fill-mode: both`) |

Not covered by any reduced-motion rule: `.animate-fade-in/.animate-fade-out/.animate-slide-in-*/.animate-shimmer/.animate-collapsible-*` — moot today, since none of them has a consumer.

Tailwind's own `motion-safe:` / `motion-reduce:` variants carry the rest: the shell's raise/fade pair (`page.tsx:1764`), the margin panel's `motion-safe:transition-transform motion-safe:duration-200 motion-reduce:transition-none` (`margin-rail.tsx:258`), the running index's reading line `motion-reduce:transition-none` (`spine-running-index.tsx:79`), the spine jump buttons' `motion-reduce:transition-none` (`doc-spine.tsx:111`), and the margin folds' (`margin-rail.tsx:527, 645`).

### `hooks/useReducedMotion.ts`

24 lines. State starts `false` (`:4`) — so there is one render in which a reduced-motion user still reads `false`. The effect reads `window.matchMedia('(prefers-reduced-motion: reduce)')` (`:7`), sets the real value (`:10`), subscribes to `change` (`:13-15`) and unsubscribes on unmount (`:17,20`).

**No file under `components/document/` imports it.** Its consumers are the catalog/marketing tree — `components/catalog/{empty-state,product-card-animated,product-comparison,floating-action-button,quick-view-modal,back-to-top}.tsx` and `components/timeline/MilestoneCard.tsx`. The Document's motion policy is CSS-media-query only. Anything a lens redesign wants to gate in JS would be the hook's first Document consumer, and would inherit its first-render `false`.

---

## 8. Seam consumers

Every reader of `--doc-seam-height` in `apps/designer-portal` (`grep -rn "doc-seam-height" src e2e`):

| Site | file:line | What it does |
|---|---|---|
| **Producer** — the constant | `components/document/job-ticket.tsx:60` | `const SEAM_HEIGHT_VAR = '--doc-seam-height';` |
| **Producer** — the write | `components/document/job-ticket.tsx:248-259` | `useLayoutEffect`: removes the property when `!pinned \|\| unfolded` (`:250-253`); otherwise sets it on `document.documentElement` to `Math.round(sectionRef.getBoundingClientRect().height)` px (`:254-255`); cleanup removes it (`:256-258`). Deps `[pinned, unfolded, seam.identity, seam.exceptions]`. Doc comment `:28-30`, `:20`. |
| Schedule glance offset | `app/globals.css:1026` | `[data-document-shell] section[aria-label='Schedule rule'] { top: var(--doc-seam-height, 0px); }` — the schedule's own `sticky top-0` glance stands **under** the seam instead of painting over it (rationale `app/globals.css:1019-1025`). |
| Region landing clearance | `app/globals.css:1034` | `[data-document-shell] [data-index-region] { scroll-margin-top: var(--doc-seam-height, 0px); }` — every region root the ticket's rows and the running index land on clears the pinned seam (`scrollToRegion` uses `block:'start'`). |
| FF&E landing floor | `app/globals.css:1037` | `[data-document-shell] [data-index-region='ffe'] { scroll-margin-top: max(var(--doc-seam-height, 0px), 4rem); }` — keeps FF&E's pre-existing 4rem breathing room as a floor. |
| Money region inline clearance | `components/document/commercial/money-region.tsx:48` | `const SEAM_CLEARANCE = { scrollMarginTop: 'var(--doc-seam-height, 0px)' };` — applied as `style={SEAM_CLEARANCE}` on the folded section (`:231`) and the open section (`:252`). Redundant with the `[data-index-region]` rule above but declared locally with its own rationale (`:43-47`). |
| Test — unset by default | `components/document/__tests__/job-ticket.test.tsx:519` | asserts `document.documentElement.style.getPropertyValue('--doc-seam-height')` is `''` while unpinned |
| Test — set when collapsed | `components/document/__tests__/job-ticket.test.tsx:524` | asserts the value matches `/px$/` once the seam is pinned |
| Test — cleared again | `components/document/__tests__/job-ticket.test.tsx:529` | asserts it returns to `''` when the rows are restored |

The var has exactly one writer (the ticket) and three CSS readers plus one inline-style reader. It is set on `document.documentElement`, not on the shell, so it is global for the page while a seam is pinned.

---

## 9. Test blast radius

Paths relative to `apps/designer-portal/`.

### The mandatory set

| File | Assertions that pin the shell | What a lens redesign breaks |
|---|---|---|
| `e2e/document/quiet-responsive-shell.spec.ts` | `[data-document-shell]` visible — `:23`, `:35`. **1440**: spine visible `:162`, spine prints only "On this paper" `:165`, the retired Rooms/shelves blocks stay gone `:168-171`, `[data-job-ticket]` with exactly 8 `[data-ticket-row]` `:173-176`. **1280 / 390**: ticket + 8 rows `:183-185`; at 390 the ticket rests folded until `Unfold` `:190-196`. **1024**: mobile bar `:204`, exactly one `[data-mobile-edge-owner]` `:205`, spine hidden `:206`, margin trigger hidden `:207`, panel `aria-hidden=true` `:208-211`. **1280**: spine width pinned **55–57px** `:224-228`; margin `role=dialog` + `data-margin-mode=sheet` + focus/Escape `:233-238`. **1440**: spine width **≥199px** `:251-253`; `data-margin-mode=rail`, `aria-hidden=false` `:257-258`. | Any change to the shell/spine/ticket/margin selectors, the exact spine widths, the 8-row contract, or the 1180/1280/1440/390 set. |
| `src/components/document/doc-spine.test.tsx` | unrecorded sections get a label but no jump target `:14-19`; `expect(screen.getByText('Put down')).toHaveClass('min-[1180px]:inline')` `:25` and the active label `min-[1180px]:block` `:26-28`; the shelved-blocks wrapper `toHaveClass('hidden', 'min-[1440px]:block')` `:43-46`. | Any change to the spine's 1180/1440 gating or to the label / jump-target / shelved-block structure. |
| `src/components/document/__tests__/job-ticket.test.tsx` | 8 rows in fixed order + head subject/phase `:226-241`; collapse to the two-line seam `:244-253`; `toHaveClass('sticky')` `:259` and `data-pinned='true'` `:262`; unfold in place without losing the pin `:268-276`; seam-at-rest at 390 `:400-421`; `toHaveClass('z-[4]')` `:517`; the `--doc-seam-height` lifecycle `:519, 524, 529`; no shadow on the ticket or any descendant `:533-541`. | The row set/order, the `sticky`/`z-[4]`/`data-pinned` seam contract, and the seam-var lifecycle other pinned elements key off. |
| `src/components/document/__tests__/responsive-document-shell.test.tsx` | `expect(spine).toHaveAttribute('data-spine-regime', 'sheet-below-1180-compact-to-1439-full-from-1440')` `:187-189`; spine class list `:191-195`; timer visibility split `:215-219`; `data-margin-mode='sheet'` + Tab/Escape trap `:234`; `data-margin-mode='rail'` `:317` with `min-[1440px]:sticky` / `min-[1440px]:col-start-3` `:319`; nested sheet ↔ margin handoffs across 1440↔1439 and 1180↔1179 `:322-457`; mobile bar `min-[1180px]:hidden` `:494`; ticket mounts on project/install/care with 8 rows and `data-unfolded='true'` at 1440 `:655-687`; a held room carried 1440→1280→390 `:692-750`. | The single largest concentration of exact regime assertions — the `data-spine-regime` **string literal**, `data-margin-mode` values, and every pinned `min-[1180px]`/`min-[1440px]` class. |
| `src/components/document/__tests__/shelved-spine.test.tsx` | one `aria-current='true'` entry + jump from any `:82-98`; `paperRegionsForSection` per section `:155-197`; "On this paper and nothing else" `:217-236`; row count matches mounted regions `:238-262`; money-ladder reads gated by spread `:274-322`. | Region ordering/labels feeding the index, and the "one block only" spine contract if a redesign re-adds spine furniture. |
| `src/components/document/__tests__/row-wash.test.tsx` | 100 lines pinning `--ink-x`/`--ink-y` and `--wash`/`--wash-still`. | Tangential today — `RowWash` is used only by `desk-roster.tsx` and `ffe-section.tsx`. It becomes live blast radius only if a redesign puts a wash on ticket or region rows. |
| `src/components/document/__tests__/section-stage-line-mount.test.tsx` | non-project reads explicit `activeSection` `:35-49`; project reads live workflow/schedule `:51-122` with the retired "Project handoffs" region asserted gone `:113-115`; loading/error/partial states `:124-164`. | This mount's **position** in the page is what the cutover-contract regex below pins structurally. |
| `src/components/document/region/__tests__/region-head.test.tsx` | head `toHaveClass('grid-cols-1')` + `min-[1180px]:grid-cols-[1fr_auto]`, ledger `justify-start` / `min-[1180px]:justify-end` `:110-120`; the action-region contract (`role=group`, `data-action-region`, `aria-label`) holds unconditionally at both widths `:128-158`. | Any change to region-head grid columns or the ledger's width-gated justification. |
| `src/components/document/region/__tests__/region-rule.test.tsx` | pins the exact recipe shared by `.doc-rule-strong` and the legacy `.doc-region-rule`: `border-bottom:1px solid rgba(44,41,38,.18); border-top:2px solid #2C2926; height:6px` `:59-74`. | Re-weighting or re-drawing the region rule. |
| `src/components/document/region/__tests__/fold-seam.test.tsx` | a folded region's toggle paints visible immediately — no `opacity-0` / `translate-y` flash waiting on a hydration flag `:36-45`. | Any hydration-gated (rather than CSS-keyframe) fold animation. |
| `src/components/document/region/__tests__/row-overflow.test.tsx` | the overflow glyph always renders collapsed and **unmounts** (not hides) its verbs, with `aria-controls` pointing at a real id `:31-44`. | Changing disclosure from unmount to hide. |
| `src/components/document/region/__tests__/use-region-fold.test.tsx` | default-fold derivation, the localStorage key shape, and `events.regionFolded` on toggle `:38-60`. | Changing the fold key format or the persistence contract. |
| `src/lib/document/__tests__/ticket-derivation.test.ts` | 8-row order + one-word labels on every section `:140-166`; pre-work spreads `:177+`; the ninth client-copy row `:327+`; unanswered-PO rank `:382+`; slot anchoring `:424+`; honest empties `:460+`; specimen `:506+`; a row only opens what the spread prints `:579+`; exception counted once `:632+`; Dates register `:674+`; `deriveTicketHead` `:704-716`; `deriveTicketIdentity` `:720-732`; seam worst-two tie-break `:757`, third dropped whole `:764-770`, identity never elided `:772-776`, `Nothing overdue` `:778-782`. | Changing the row set/order/labels or the seam's two-exception, never-abbreviate rule turns this red before any component test. |
| `src/lib/document/__tests__/shadow-gate.test.ts` | exactly one `box-shadow` in `globals.css`, spent only by `.doc-elevated` `:80-95`; **any new shadow anywhere under `src/`** fails except one frozen legacy declaration `:97-105`; no `drop-shadow()` `:107-122`; `--elevation-sheet` declared once `:124-127`; `.doc-elevated` at ≤3 sites `:129-136`. | A blanket tripwire: giving the letterhead, the pinned seam, or a region head any depth fails this regardless of intent. |
| `src/lib/document/__tests__/contrast.test.ts` | `--doc-rail-stock` pinned to `#E8E3DB` `:297-303`; charcoal / muted / clay-ink ≥ 4.5:1 on the rail `:305-311`; **scans exactly `spine-running-index.tsx`, `spine-shelved-blocks.tsx`, `spine-timer.tsx`, `doc-spine.tsx`, `margin-rail.tsx`** and fails on `text-[var(--color-aged-oak)]` or `text-[var(--color-clay)]` there `:313-341`; named rail ink pairs ≥ AA `:343-365`; rail vs paper/desk separation > 1.1 `:367-374`. | Changing the rail colour, introducing a new rail pigment, or **renaming/moving any of those five spine files** (the list is hard-coded). |
| `src/lib/document/__tests__/stage2-approval-cutover-contract.test.ts` | **`:19`** — see below. Companions: `/<MobileMarginChips[\s\S]*?<ProjectApprovalDocumentMount/` `:15-17`; `indexOf('<SectionStageLineMount') > indexOf('<ProjectApprovalDocumentMount')` `:21-23`; `toContain('project?.client_id ?? null')` `:24`; and a `not.toMatch` forbidding `clientProfileId={row.client_profile_id` within 300 chars of the approval mount `:25-27`. | The most brittle test in the radius — see the note below. |

### The trap — `stage2-approval-cutover-contract.test.ts:19`

```js
expect(page).toMatch(
  /data-active-section[\s\S]{0,1500}?<SectionStageLineMount/,
);
```

`page` is the **raw source text** of `app/(document)/doc/[id]/page.tsx`, read with `fs.readFileSync` (`:10`) — not a rendered DOM. The regex forbids more than **1500 characters of source** between the literal `data-active-section` and the literal `<SectionStageLineMount`, in that order. Today that window is `page.tsx:1942` → `page.tsx:1964` and contains the drag handlers (`:1945-1958`) and the R1/M1 comment block (`:1960-1963`) — roughly 900 characters, so the headroom is about 600 characters.

Any restructuring of `page.tsx` that moves `SectionStageLineMount` further from its `data-active-section` wrapper — extracting the section body into a component, adding a `<Suspense>` or provider wrapper, lifting props, or simply adding another comment block or a couple more drag handlers — fails this test with **zero behavioural change**. A lens redesign that reorders the header stack around the active section is very likely to trip it.

### Other files that pin the same concerns

| File | Assertions | Break |
|---|---|---|
| `src/app/(document)/doc/[id]/page.test.tsx` | mounted-region order via the `shelved-spine-regions` testid `:1230-1234`; the ticket's position contract is stated in the describe comment `:1236-1241` and block `:1242-1257`; exactly one `[data-job-ticket]` per document, project or not `:1351-1358`; **the sentinel contract** `:1360-1379` — `#doc-ticket-sentinel` must follow `main header`, precede the ticket, and satisfy `sentinel.nextElementSibling === ticket` (`:1378`). | Moving the ticket relative to the letterhead `<header>`, inserting anything between the sentinel and the ticket, or duplicating the ticket mount. |
| `src/components/document/doc-letterhead.test.tsx` | title `text-[40px]`, `tracking-[-0.015em]`, `text-[var(--text-primary)]`, `<header>` carries `doc-rule-mid` and must NOT match `/border-b\b/` `:69-83`; no shadow on any descendant `:85-97`; the in-hand-room line renders as `<p>` or, with `onReleaseRoom`, as one `[data-release-room]` button — with **no media query, and there must not be one** (`:2-4`, tests `:12-67`). | The 40px title token, the `doc-rule-mid` closing rule, and the `<header>` tag itself (page.test.tsx's sentinel test selects `main header`). |
| `e2e/document/quiet-release-contracts.spec.ts` | Exact `boundingBox()` x-ranges at 320/1179/1180/1439/1280/1440 `:74-161` — e.g. spine width 55–57px with bounds `[0,56]` at the compact tier `:108-118`, and spine ≥199px with paper `[200,1208]` and margin `[1208,1440]` at 1440 `:150-158`. Compact-timer regime `data-spine-timer-regime='compact-only-1180-1439'` `:188-190`; the 1439→1440, 1280→1179 and 1179→1180 focus handoffs `:212-300`. | The deepest pixel-boundary contract in the repo: any column-width change fails it immediately. |
| `e2e/document/workflow-stage-responsive.spec.ts` | `[data-document-shell]` visible at 320px as the paint signal `:30-32`; `[data-workflow-document]` attached `:44-46`; no horizontal overflow `:47`. | Removing `data-document-shell` or `data-workflow-document`; introducing any horizontal overflow at 320. |
| `e2e/document/margin-handoffs.spec.ts` | `[data-margin-panel]` `data-margin-mode` rail/sheet `:66-69`, `:102-105`. | Renaming the margin mode values. |
| `e2e/wp3-screenshots.spec.ts` | keys off `data-margin-mode='sheet'` at 1280 `:183-186`. | Fails **silently** — a broken selector yields wrong screenshots, not a red test. |

### Secondary consumers of the same breakpoints

These do not test the shell but hard-code the literal 1180/1440 boundaries independently, so a regime change has to touch all of them or they keep the old numbers while the layout moves:

`src/components/document/log-strip.test.tsx:52` (`min-[1180px]:bottom-[60px]`) · `src/components/document/mobile/mobile-action-dock.test.tsx:125` (`min-[1180px]:hidden`) · `src/components/document/mobile/mobile-timer-sheet.test.tsx:250-257, 271-273, 326-329` (`data-spine-timer-regime`, `data-mobile-sheet-regime`) · `src/components/document/people/__tests__/people-navigation.test.tsx:42, 108` · `src/components/document/plans/__tests__/plan-confirm-strip.test.tsx:124` · `src/components/document/rooms/drafting/drafting-room.test.tsx:270` (`min-[1440px]:hidden`) · `src/components/document/schedule/__tests__/composition-bar.test.tsx:105-113` · `src/components/document/shelves/shelf-panel.test.tsx:145` (`w-[320px] min-[1440px]:left-[200px]` — pinned to the 200px spine) · `src/components/document/studio-drawer.test.tsx:95` (`min-[1180px]:grid`).
