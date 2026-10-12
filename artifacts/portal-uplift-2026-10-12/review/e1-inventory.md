<!-- SQ-799 (GPT-6 Luna, readonly) ticket comments, saved by the orchestrator 2026-10-12 -->

# US-27 W1a — designer-portal area inventory (part 1/2)

**Basis.** Frozen §3 area list read from `/Users/kody/Code/patina-merged/.claude/worktrees/portal-uplift/artifacts/portal-uplift-2026-10-12/BRIEF.md:43-59`. Code paths/lines below are relative to `apps/designer-portal/src`; product sources are the stated `origin/main` 81b40e732 snapshot. `--paper`, `--paper-doc`, `--rail` are the three root stock aliases (`app/globals.css:1906-1910`).

## 1. The Desk

**Route / ordered composition.** `/desk` is `app/(document)/desk/page.tsx:81-82`, `DeskPage`. The rendered `main` proceeds greeting/date + action header → either coherent error state or roster → Recent Boards → board reaction rollup → Studio Contents (prominent when empty, otherwise after roster) → later desk appendages (`page.tsx:442-599`). Roster is built at `:434`; its row renderer is `DeskRoster`. Actions use `DocumentActionGroup`/`DocumentAction` (`:478-529`).

**Unit/edge/ground.** Jobs use ledger/roster lines, not cards; the page explicitly says Recent Boards has a “doorway shape” distinct from roster grammar (`:575-589`). Greeting/date and metadata are plain text; actions are standalone acts (`:448-529`). Roster, recent strip and rollup are sequential on one main ground; no common enclosing card edge closes their boundaries (`:575-599`). Route-group root applies `--bg-primary` (`app/(document)/layout.tsx:80-82`), not `--paper-doc`. Desk ledger/folio treatments are `globals.css:570-600,1200-1285`; utilities at `page.tsx:446-454,522-524`. No `--card-edge` literal on this route.

**Overlay.** Capture inquiry/create project/find anything launch from the header (`page.tsx:478-529`); CommandBar opens for ⌘K. Account/invoice/proposal/act/help/mobile overlays are shared layout children, not Desk-owned (`layout.tsx:99-152`).

## 2. The Document (job)

**Routes/components.** `app/(document)/doc/[id]/page.tsx:968-982` → `DocumentPage` under `RoomLensProvider`; layout wraps it in hold boundary (`app/(document)/layout.tsx:66-80`). It is a single job paper: schedule provider/body, letterhead/intake, then job sections and rails; explicit RoomsRail at `page.tsx:3209`, BoardsStrip `:3217`, IntakeSpreadHeader `:3655`, RoomFilesSection `:3793`, closing at `:3893`. Subroutes: pieces → `BuildRoom` (`doc/[id]/pieces/page.tsx:44-52,132-187`); plans (`plans/page.tsx:6`, layout `plans/layout.tsx:1`); spec-book (`spec-book/page.tsx:6`, layout `spec-book/layout.tsx:1`); boards (`boards/page.tsx:6`, layout `boards/layout.tsx:1`); finishes print (`pieces/finishes/print/page.tsx:29-45`).

**Units/ground/edges.** Main document is primarily text, rows and act bands on continuous document paper rather than uniform cards; separate room/board rails are compact units (`page.tsx:3209-3217`). Bands can meet on shared paper without an enclosing edge. Shared styling covers type/actions/bands/paper (`globals.css:570-600,820-870,970-1035,1200-1285,1906-1989`). Finishes print uses ruled table rows (`print/page.tsx:41`), a fixed full-view paper-doc surface (`:93-96`), and sticky paper-doc toolbar with strong hairline (`:119`).

**Overlays.** NeedActSheet, account, invoice, command/help, proposal and mobile layers are globally mounted (`layout.tsx:99-142`). Finishes print is route-level fixed `z-[60]`, not modal card (`print/page.tsx:93-119`).

## 3. Rooms

**Routes/components.** `/rooms` → `RoomsIndex` (`app/(document)/rooms/page.tsx:17-21`); `/room/[id]` → `RoomView` inside `RoomShell` (`room/[id]/page.tsx:185-196`); `/room/[id]/file` → `RoomFileView` (`room/[id]/file/page.tsx:26-34`). Index comment specifies room cards with client, type, scan date, dims/area, quality dot, Document reference, mini-plan (`rooms/page.tsx:9-14`). `RoomShell` supplies full-screen grain, head and page child (`components/document/rooms/room-shell.tsx:32-43,128-139`).

**Units/ground/edges.** Index is cards; the room detail is continuous viewer/workspace. Shell has a bottom-edged sticky head (`room-shell.tsx:128-139`); inner viewer sections belong to `RoomView` and can share the ground. Root is `--doc-paper`, head edge `--doc-ink-border` (`:128-139`), rather than `--paper` cards. Room-local style lives in shell and room-view feature components; global aliases are `globals.css:1906-1925`.

**Overlays.** Drawer, LogStrip and ⌘K persist above the room per `RoomShell` comments (`room-shell.tsx:8-10`); global sheets mount from layout (`app/(document)/layout.tsx:110-142`). Escape leaves only after deeper overlays (`room-shell.tsx:116-125`).

## 4. People

**Route/components.** `/people` is a shim to `PeopleRoom` (`app/(document)/people/page.tsx:10-14`); reusable room frame is RoomShell per page comment (`:4-8`). Render units include directory, person profile and company detail plus inbound/compliance (`components/document/people/views/directory-view.tsx`, `views/person-profile.tsx`, `company-card.tsx`, `directory/person-row.tsx`, `directory/company-row.tsx`, `inbound-queue-band.tsx`, `compliance-table.tsx`).

**Units/edges/ground.** Predominantly ruled rows/sections and tables, not cards: person/company rows bottom-rule `--hairline-strong` (`directory/person-row.tsx:150`, `directory/company-row.tsx:62`); profile/company regions top-rule (`views/person-profile.tsx:97`, `company-card.tsx:84`); compliance cells top-rule (`compliance-table.tsx:145`). “CompanyCard” regions are internally ruled, not a uniform outer card edge. Directory sections/filter bands can share room ground; some have top/bottom rules, not enclosing edge (`directory-view.tsx:457,484,551`). Semantic status is one bordered word with pigments, not filled grading plates (`globals.css:1935-1947`). Paper-doc form surfaces use hairline outline (`company-card.tsx:250`, `record-document-sheet.tsx:32`). Detailed local classes are in these component files; token definitions `globals.css:1906-1962`.

**Overlays.** People-specific sheets/acts: compare-merge (`compare-merge-sheet.tsx:489,539-576`), add person (`directory/add-person-sheet.tsx:203`), record document (`record-document-sheet.tsx:32`), reach/access (`reach-access.tsx:241`), close-seat (`close-seat-act.tsx:153`), paperwork-link (`paperwork-link-act.tsx:41`); these layer on Room. Global account/invoice/command/mobile overlays remain present (`app/(document)/layout.tsx:124-142`).

# US-27 W1a — designer-portal area inventory (part 2/2)

## 5. Library

**Routes/components.** `/library` → `LibraryRoom` (`app/(document)/library/page.tsx:11-15`; route identifies this as first RoomShell tenant at `:4-8`); `/library/[id]` → piece route (`library/[id]/page.tsx:14`); `/library/judgments` wraps content in RoomShell (`library/judgments/page.tsx:109-110`) and defines `JudgmentCard` (`:199-207`).

**Units/edges/ground.** Browse results are piece/image units; judgments explicitly has judgment cards, while detail metadata/text is plain text. Card treatments are therefore local to result types, not a universal room card. RoomShell root is `--doc-paper` and sticky head has `--doc-ink-border` (`components/document/rooms/room-shell.tsx:128-139`); library result/section styles are local to `components/document/rooms/library/*` and judgments page. Sections without result-owned closing edges can bleed on continuous Room ground.

**Overlays.** Room’s shared drawer/log/⌘K persist; document layout mounts account/invoice/command/mobile and other sheets (`app/(document)/layout.tsx:110-142`). Nested RoomShell supports a parent `backTo` route without clearing origin (`room-shell.tsx:62-68,91-100`).

## 6. Boards

**Routes/components.** `/boards` wraps `StudioBoardsView` in Suspense (`app/(document)/boards/page.tsx:3-17`); `/board/[boardId]` renders `MoodBoardPage` (`board/[boardId]/page.tsx:33`), with route layout/error (`board/[boardId]/layout.tsx:1`, `error.tsx:7-20`); job-linked `/doc/[id]/boards` has `ProjectBoardsPage` and its layout (`doc/[id]/boards/page.tsx:6`, `boards/layout.tsx:1`).

**Units/edges/ground.** Studio boards are image-led board units; canvas detail is neither card list nor ledger. Recent boards in Desk are a distinct strip, not roster rows (`desk/page.tsx:581-589`). Thus board selector tiles/images have card-like treatment, labels/metadata plain text, while canvas sections share a work surface. No global reusable card edge is evident in route wrappers; board styles are component-local plus global CSS. Desk’s strip/rollup/content sequence is a potential unclosed neighboring-ground seam (`desk/page.tsx:581-599`).

**Overlays.** Board errors/unavailable content render in place (`board/[boardId]/error.tsx:7-23`, `page.tsx:16-21`). Global act/account/invoice/⌘K/mobile layers are still mounted (`app/(document)/layout.tsx:99-142`).

## 7. Making papers

**Routes/components.** `/drafting/[proposalId]` → `DraftingRoute` (`app/(document)/drafting/[proposalId]/page.tsx:13`); `/compose` → `ComposeRoute` (`compose/page.tsx:8`); `/ceremony/[leadId]` → `CeremonyPage` (`ceremony/[leadId]/page.tsx:14`). Cold-start proposal overlay is `DraftProposalOverlay` (`app/(document)/layout.tsx:134-135`).

**Units/edges/ground.** These are paper/form flows: composed text, sections and acts, not a grid of cards. Agreement galley is a more fully segmented exception; CSS uses strong hairline dividers and paper-doc/strong-edge sheet treatment (`components/document/rooms/drafting/agreement/galley/galley.css:169,205,233,242,283-284,308,344,416-417,505`). Other adjacent form regions can share paper without an outer closing edge. Global type/action/paper rules: `globals.css:820-870,1906-1989`; galley-local styles above. Outer ground is route-group `--bg-primary` (`app/(document)/layout.tsx:80-82`); working sheets use paper-doc.

**Overlays.** Proposal opener and global NeedActSheet, invoice, command and account remain above the route (`layout.tsx:99-135`).

## 8. Money

**Routes/components.** This area comprises account, invoice/procurement sheets and `app/invoices/[invoiceId]/print/page.tsx` per BRIEF §3 (`BRIEF.md:55-57`). Shared layout imports `AccountSheet`, `InvoiceOverlays` (`app/(document)/layout.tsx:11-13,128-135`); drawer provides sheet-weight ledgers (`components/document/studio-drawer.tsx:316-405,587-622`).

**Units/edges/ground.** Money lines are ledger rows: `.money-rows` is top-ruled by `--hairline-strong` (`app/globals.css:2157`); money typography and rows are `:2092-2173`. Figures and labels are text; folio wrapper is sheet-level rather than every row a card. Groups with only a top border may not close at bottom (`:2157`).

**Overlays.** Account, invoice folio/composer and procurement ledgers sit as sheets over the page; account opens from drawer nameplate/mobile/⌘K (`layout.tsx:128-130`), invoices from Accounts, account band, margin, Hours, FF&E or ⌘K (`:131-133`). Ledgers share one doorway; named room doors remain exposed (`studio-drawer.tsx:316-405,587-622`). Invoice print is a separate route.

## 9. Shared chrome

**Routes/order.** Shared shell `app/(document)/layout.tsx:66-163`; help routes include `(document-help)/help/page.tsx`, `[surfaceKey]/page.tsx`, `topic/[prefix]/page.tsx`, `article/the-keys/page.tsx`, `changes/page.tsx` and help layout; preferences is `app/preferences/page.tsx` with unsubscribe subroute. Layout render sequence: route boundary/providers → ArrivalRoute → page → LogStrip → StudioDrawer → registry/key shortcuts and keys sheet → log time → CommandBar → interruption settings → AccountSheet → InvoiceOverlays → proposal opener → undo → mobile dock/bar/sheets → walkthrough → DeskDoorway (`layout.tsx:80-160`).

**Ground/edges/overlays.** StudioDrawer is a fixed 60px rail with top border (`components/document/studio-drawer.tsx:290`), room active underline (`:316-355`), Ledgers popover with its own border (`:359-405`). It overlays content instead of closing each page’s final section. Shared `.doc-sheet` is paper-doc with 1px strong hairline and baseline rule (`app/globals.css:2026-2037`). Help, empty states and preferences retain component-local style. Layout globally mounts the full account, invoice, proposal, key/command and mobile overlay family (`app/(document)/layout.tsx:115-142`).

## (g) Existing reusable primitives

`DocumentAction`/`DocumentActionGroup` already express action tiers on Desk (`app/(document)/desk/page.tsx:478-529`). `RoomShell` is reusable full-room ground/head (`components/document/rooms/room-shell.tsx:4-20,128-139`). Desk `DeskRoster`/`.desk-ledger-*` provides row-first vocabulary (`desk/page.tsx:434`; `app/globals.css:570-600`). `.doc-sheet` provides paper-doc bounded box (`globals.css:2026-2037`); `.money-rows` a ruled list (`:2157`). People has top/bottom region rules, directory row primitives, and bordered semantic state-word treatment (`people/views/person-profile.tsx:97`; `people/directory/person-row.tsx:150`; `globals.css:1935-1947`). Eyebrow-style labels are generally inline uppercase mono/type classes, not a single portal-wide component (e.g. drawer `studio-drawer.tsx:401-405`; Desk date/action labels `desk/page.tsx:471-475,493-495`). Six stage pigments exist (`globals.css:164-169`). The “old claim card at 818db6e55” is historical design reference, not a current component in this code snapshot; current shared authority is above, not that old implementation.

## (h) Token audit

Audit searched literal `--card-edge`, `--hairline*`, `--paper*`, `--tab-*` throughout portal `src`, and separated definitions/comments/tests from runtime use. Exact `--card-edge` literal runtime uses: **0** (do not conflate with `--color-card-edge`). Runtime `--hairline*`/`--paper*` occurrences by area: Desk 0; Document 4 (finishes print: `app/(document)/doc/[id]/pieces/finishes/print/page.tsx:41,96,119`, with paper-doc on toolbar and full view); Rooms 0; People 47 across `components/document/people/compare-merge-sheet.tsx`, `paperwork-link-act.tsx`, `inbound-queue-band.tsx`, `views/directory-view.tsx`, `company-card.tsx`, `studio-locations-editor.tsx`, `views/person-profile.tsx`, `close-seat-act.tsx`, `record-document-sheet.tsx`, `directory/person-row.tsx`, `reach-access.tsx`, `access-grant-list.tsx`, `directory/company-row.tsx`, `compliance-table.tsx`, `directory/add-person-sheet.tsx` (representative line citations in §4); Library 0 direct literal uses in inventoried entry components; Boards 0 direct route uses; Making 11 in galley CSS (`:169,205,233,242,283-284,308,344,416-417,505`); Money 1 `.money-rows` (`globals.css:2157`); Shared chrome 0 direct uses except global sheet primitive in CSS. Token definitions/aliases: paper stocks, strong hairline at `globals.css:1906-1925`; sheet primitive consumes paper-doc/strong edge at `:2026-2037`. Six `--tab-*` definitions occur at `globals.css:164-169`; no route-specific tab-edge use found by the literal search. Counts exclude definitions, comments, tests and count each occurrence (so a class with two token names contributes two).

## (i) Usage/prominence ranking

VISION states the product surface order: The Document is first, the studio working surface and “Patina for the next twelve months” (`docs/vision/VISION.md:19-22,56-62`); studio promise is low-notice, not engagement optimization (`:50`). Within portal, evidence-based route prominence: **1 Document (job)**, the core working surface; **2 Desk**, landing/home at `/desk` (`components/document/studio-drawer.tsx:299`) and primary roster; **3 Rooms, tied**, because Rooms/People/Library are the three named room doors always visible in drawer (`:316-355`); **4 Money**, operational but behind Ledgers menu (`:359-405,587-622`); **5 Making papers**, work-flow and proposal-opener destinations, not named room doors (`app/(document)/layout.tsx:134-135`); **6 Boards**, accessible route/recent strip, but not one of the named room doors. Shared chrome is cross-cutting infrastructure rather than a destination, so ranks alongside all routes rather than as a lower-use area. This is a nav/IA inference, not analytics; it does not advocate optimizing engagement.

## (e) CSS map and summary

Global style regions: base palette/stage tokens `app/globals.css:1-170`; Desk folio/ledger `:570-600`; action tiers `:820-870`; document bands/state `:970-1035,1200-1285`; paper aliases/tokens `:1906-1966`; bounded `.doc-sheet` `:2026-2037`; money typography/rows `:2092-2173`. Component CSS includes room shell inline styles `components/document/rooms/room-shell.tsx:32-33,128-139`, People inline Tailwind classes at cited component lines, agreement galley CSS, and board/library feature-local styles. Existing cards/tiles, many well-ruled rows and bounded sheets are real assets; edge grammar/section closure is not yet uniform across all nine areas.
