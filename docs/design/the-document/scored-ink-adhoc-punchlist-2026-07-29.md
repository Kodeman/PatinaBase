> Punch list for the I107 follow-up sweep — ad-hoc controls still wearing the old 44px grammar.
> Produced by the Scored Ink implementation audit, 2026-07-29. See DECISIONS.md I107.

# Scored Ink clash audit — designer-portal Document surfaces

## Scope note

Literal `grep -rn "min-h-11\|min-w-11"` across `components/document/` + `app/(document)/` returns **72 hits in 38 files**. `coordination/court-bar.tsx` (named in the brief) has **no** `min-h-11`/`min-w-11` — its "+ New open item" button uses fixed padding, no size utility, so it's invisible to that grep. Broadening to the fixed-size variant `h-11 w-11` (no `min-`) turns up **7 more hits in 4 additional files**. `38 + 4 + court-bar = 43 files`, matching the brief's estimate exactly — so the full intended scope is the 72 `min-`-prefixed hits **plus** those 8 extras. All below.

Also excluded from the ad-hoc inventory (not ad-hoc controls at all):
- `document-action.tsx:39` — the `DocumentAction` component's own base class (the thing being restyled, not a clash).
- `proposal-version-history.tsx:71`, `people/directory/add-person-sheet.tsx:398`, `rooms/library/import-sheet.tsx:213` — these are already `<DocumentAction className="min-h-11 …">` usages (a redundant override on a component that already ships `min-h-11 min-w-11`), not bespoke buttons. No fix needed beyond the `DocumentAction` restyle itself.
- `__tests__/document-action.test.tsx:40` — a test assertion, not rendered UI.

## Counts per class

| Class | Count | 
|---|---|
| **A — MUST-FIX** | **39** (34 from the literal grep + 4 from the `h-11/w-11` sweep + court-bar's class-less button) |
| **B — OVERLAY/SHEET** | **34** (32 + 2) |
| **C — NON-ACTION** | **2** |
| Excluded (false positive / not ad-hoc) | 5 |
| **Total surveyed** | 80 hits / 43 files |

Classification method: a hit is **B** only if the enclosing component is architecturally wrapped in `DocSheet`, `DocPaperSheet`, or `RoomSheet` (verified by tracing each component up to its actual mount point, not by directory name alone — several "-sheet.tsx"/"-ledger.tsx" files outside `overlays/` turned out to be **B** because they're mounted inside `studio-drawer.tsx`'s `<DocSheet>`, e.g. `orders-ledger.tsx` → `orders-book-vendors.tsx`, `accounts-receivables-page.tsx`, `account-sheet.tsx`, `feedback-sheet.tsx`, `touchpoint-sheet.tsx`, `add-person-sheet.tsx`, `import-sheet.tsx`, `discovery-call-sheet.tsx`, `mobile-sheets.tsx`'s D13 bottom sheets, `item-composer.tsx` — explicitly documented as "RENDERED AS A DocSheet CHILD"). Everything else was traced to a directly-mounted page (`desk`, `doc/[id]`, `library/page.tsx`→LibraryRoom, `people/page.tsx`→PeopleRoom, `rooms/page.tsx`, `compose/page.tsx`, `drafting/[proposalId]`, `ceremony/[leadId]`) → **A**.

## Full A list (MUST-FIX)

**Desk / doc/[id] page — direct sections**
| File:line | Renders | Restyle rec |
|---|---|---|
| `account-band.tsx:276` | "→ Accounts ↗" clay underline link | Convert to `DocumentAction variant="tertiary"` |
| `phase-timeline.tsx:225` | Unplaced-phase bordered chip picker | Drop border/bg; score-underline chip row |
| `phase-timeline.tsx:248` | "Close" text button, sits directly above a `DocumentActionRow` | Convert to `DocumentAction variant="tertiary"` |
| `folio-strip.tsx:74,84,95,117,377` (5) | Stacked-paper file-chip UI: title link, version toggle, shared/studio toggle, superseded-version chips, folio disclosure — literally the Proof VI "FOLIO" row's neighbor | Retire the bordered stack chrome; render each chip as a scored word, keep the paper-stack visual only as a background device, not per-button borders |
| `margin-rail.tsx:226,237,330` (3) | "Drafts · N ↑/↓" toggle, draft-item row (dashed border), "Settled · N ↑/↓" toggle — directly under the margin's own `DocumentActionGroup` | Match tertiary scored-word treatment; drop the dashed-border row chrome |
| `spine-timer.tsx:16` | Bordered mono timer button on the document spine | Convert to scored-word tertiary treatment |
| `schedule/milestone-composer.tsx:126` | Segmented "kind" picker (bordered pills) inline in the Schedule Spine — the Work block | Score-underline single-select row, no border box |
| `drafting/proposal-mirror.tsx:276` | "Full/Milestone/Curated" visibility-tier bordered chip picker (Drafting Room) | Same — drop border/fill, scored active state |
| `discovery/field-kit.tsx:188` | `ChipMultiSelect` bordered/filled style-tag chips (Discovery facet editors) | Drop border/fill; scored toggle chips |
| `discovery/field-kit.tsx:141,231` *(supplementary `h-11 w-11`)* | Icon-only Remove (×) / Add (+) row buttons in `RowListEditor` | Keep 44px target, drop visible border box, render as bare glyph with hover score |
| `discovery/discovery-schedule-line.tsx:214` | "×" remove-slot icon button, directly above a `DocumentActionRow` | Bare glyph, no visible box, invisible 44px halo |
| `discovery/discovery-schedule-line.tsx:271` | "view the thread →" mocha underline link | Convert to tertiary scored word |
| `compose/composing-page.tsx:450,520` | Overlay-close icon button + pill toggle inside the Compose Room (its own page, `RoomShell`-based) | Score-word treatment for both |

**Room surfaces (Library / People / Drafting / Piece / Rooms-index / Compose — every walk-in Room shares this chrome)**
| File:line | Renders | Restyle rec |
|---|---|---|
| `rooms/room-shell.tsx:126` | "← [Room name]" back-link, in the **same sticky header row** as the Room's `DocumentActionGroup` (passed via the `action` prop) — universal to every Room | Score-word tertiary; drop border-on-hover box |
| `rooms/library/library-card.tsx:254` | Bordered/filled "character" style-tag chip picker on Library card flyout | Drop border/fill |
| `rooms/drafting/schedule-line-unfold.tsx:686` | "×" dismiss icon button, in the same `<li>` as a live `<DocumentAction>Swap</DocumentAction>` | Bare glyph, no border box |
| `rooms/room-view/facts-rail.tsx:138,163` | "Photos"/"Room File" fact-value links (already borderless, just a font/size mismatch vs the scored-word treatment — low severity) | Adopt the scored-word font/size treatment for consistency; no box change needed |
| `rooms/room-view/facts-rail.tsx:189,201` | "Measure" (charcoal-filled toggle) / "Clear" (bordered) buttons — Room View's own toolbar | Drop fill/border; primary/tertiary scored words |
| `rooms/room-view/room-view.tsx:71` | Mode-row tabs (Brief/Discovery/Direction/…) — bottom-border-only, not a boxed control (lowest-severity A: font/size mismatch, not a box clash) | Restyle label treatment to match; keep functional underline-on-active as its own device, distinct from the button scoring |
| `rooms/piece/piece-room.tsx:1220` | "Colophon · provenance & lifecycle" disclosure toggle (no border) | Scored-word disclosure toggle |
| `ceremony/ceremony-slots.tsx:101` *(supplementary `h-11 w-11`)* | "×" remove-slot icon button on the Ceremony page (its own route) | Bare glyph, no box |

**People Room**
| File:line | Renders | Restyle rec |
|---|---|---|
| `people/directory/makers-marketplace.tsx:30,195` | Mono uppercase link style + full-row card-click button | Scored word for the link; row-click target unaffected (no visible chrome to fix there) |
| `people/profile/maker-profile.tsx:546` | "terms & orders →" clay link | Convert to tertiary scored word |
| `people/profile/profile-shell.tsx:84` (`BackLink`) | "← Directory" link | Same |
| `people/views/reviews-view.tsx:255` | 3-tab subnav (bottom-border), same pattern as `room-view.tsx:71` | Same low-severity font/size note |
| `people/directory/ask-bar.tsx:78` *(supplementary `h-11 w-11`)* | Filled clay circle "send" icon button on the People ask-bar | This is the People-room analog of Library's ask send button — likely intentionally iconic (not text); flag for design ruling rather than blind restyle |

**Library Room ask results**
| File:line | Renders | Restyle rec |
|---|---|---|
| `engine/engine-results.tsx:196` | "Place into [project]" bordered/filled picker chips, inline in the Library Room's always-visible ask results (also reused inside the ⌘K command palette overlay) | Drop border/fill; scored picker chips |

**Coordination (called out by name, not caught by any class grep)**
| File:line | Renders | Restyle rec |
|---|---|---|
| `coordination/court-bar.tsx:87-93` | "+ New open item" — solid charcoal-filled, rounded button, in `CoordinationBand` on doc/[id] (the section header "add" action for Coordination, the one section that doesn't use `DocumentAction` for its own add-affordance) | Replace with `DocumentAction variant="primary"`/"secondary" to match the "+ Decision"/"+ Note" pattern used identically elsewhere in the margin |

## B list (overlay/sheet — tolerable short-term)

| File | B hits |
|---|---|
| `orders-book-vendors.tsx` | 9 |
| `orders-ledger.tsx` | 3 |
| `coordination/item-composer.tsx` | 3 |
| `overlays/scan-viewer-sheet.tsx` | 3 |
| `feedback/feedback-sheet.tsx` | 3 |
| `overlays/post-sheet.tsx` | 2 |
| `account/account-sheet.tsx` | 2 |
| `mobile/mobile-sheets.tsx` (D13 bottom sheets) | 2 |
| `overlays/capture-lead-sheet.tsx` | 1 |
| `discovery/discovery-call-sheet.tsx` | 1 |
| `accounts/accounts-receivables-page.tsx` | 1 |
| `people/directory/add-person-sheet.tsx` | 1 |
| `people/ops/touchpoint-sheet.tsx` | 1 |
| `account/interruption-settings.tsx` *(supplementary)* | 1 |
| `account/account-notifications-page.tsx` *(supplementary)* | 1 |
| **Total** | **34** |

## C list (non-action)

- `folder-card.tsx:182` — plain `<div>` layout wrapper (label + arrow), not a pressable element.
- `engine/engine-results.tsx:218` *(supplementary)* — `<span className="... h-11 w-11 ...">` result-thumbnail container, not a control.

## Top-3 highest-visual-impact A items

1. **`rooms/room-shell.tsx:126`** — the "← [Room]" back-link sits in the identical sticky header row as the Room's own `DocumentActionGroup` (via the shared `action` prop), and `RoomShell` is the common chrome for **every** walk-in Room: Library, People, Drafting, Piece, Rooms-index, Compose. Fixing this one component clears the clash from six surfaces at once.
2. **`coordination/court-bar.tsx:87-93`** — a solid charcoal-filled, rounded button, the starkest possible contrast against a bare 26px scored word, sitting in the Coordination section of every open document (`doc/[id]`). It's also the one place in Coordination that skipped `DocumentAction` entirely even though the sibling "+ Decision"/"+ Note" affordances elsewhere in the same document already use it correctly.
3. **`folio-strip.tsx` (5 hits)** — the richest old-grammar construction in the survey: a stacked-paper card with borders, background fills, a version-number pill, and a shared/studio toggle, rendered directly in the Folio row of the Work block — the exact row Proof VI's own context figure uses to show a bare `+FILE` `DocumentAction` living quietly beside file chips.

**Files (with line-refs):**
- `apps/designer-portal/src/components/document/rooms/room-shell.tsx:126`
- `apps/designer-portal/src/components/document/coordination/court-bar.tsx:87-93`
- `apps/designer-portal/src/components/document/folio-strip.tsx:74,84,95,117,377`
