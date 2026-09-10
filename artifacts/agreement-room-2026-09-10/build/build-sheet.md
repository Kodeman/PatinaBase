# Build sheet — Direction D · the galley

Ships the Agreement Room per Kody's rulings of 10 September 2026
(`../rulings.md`). Layout: `../specimens/SPEC.md` §4 "Direction I — D" as
**built** in `../specimens/direction-1.html` (which retires SPEC's 1024 notes
column — the galley centres at 664 and the strips interrupt below 1248). Copy:
`../synthesis.md` §5, verbatim.

**Bound by the orchestrator:** no new feature flag (the galley replaces
`AgreementComposer` outright; the `agreement-parts` read leaves the drafting
room); `agreement-library`/`design-build` gate what they gate today; rollback =
redeploy the prior Worker version; no migrations, no edge functions. **Nothing
below requires either** — `discard_agreement_parts` and `_agreement_floor_unmet`
stay in the DB untouched.

---

## §0 · Base

| | |
|---|---|
| `origin/main` tip | **`7eed713b78036549722ba992440d48eaf79590bc`** |
| Worktree | `.codex/worktrees/agent-agreement-galley` — **already exists, already at `7eed713b7`** |
| Branch | `agreement-room/galley` |
| ⚠ local `main` | `b8dd4b7f7` — **157 behind, 2 ahead**. Never build from the primary checkout. |

```sh
sh -c 'cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-agreement-galley && pnpm install'
sh -c 'cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-agreement-galley && pnpm turbo build --filter=@patina/designer-portal^... --filter=@patina/api-client --filter=@patina/aesthete-quiz'
```

`api-client` and `aesthete-quiz` are named explicitly — `^...` has missed them
before. Use `pnpm --dir <wt>` or `sh -c 'cd <wt> && …'`; cwd does not persist.

**Local stack before any lane starts.** Port 3000 is held by the panel's capture
lane (`next start`), PIDs **93829, 94323** at survey time — `kill $(lsof -ti
:3000)` first; a reused server serves the old room and every Playwright assertion
misreads. Two throwaway drafts sit in the local DB (`../shots/README.md`):
`9375507e-8aff-4156-ab9d-fd0f1dea84ee` (Okonkwo house — **its parts were
discarded** by the capture's "Return to the seven facets" step; reopen to
re-materialize) and `65f1616d-4af0-44f9-947a-3977c9be082a` (pristine). Both safe
to drop; reseed with `../shots/tools/seed-draft.mjs`. ⚠ Check
`NEXT_PUBLIC_SUPABASE_URL` in `apps/designer-portal/.env.local` before any
destructive local act — it has pointed at Strata prod before.

---

## §1 · Task ladder

```
T1 foundations ──┬── T2 the galley ──┐
   (one commit)  └── T3 retirements ─┴── T4 tests ── T5 gates+review+walk ── T6 merge+deploy
                     ∥ separate worktrees off T1's commit
```

Six tasks. T1 is a hard barrier: it lands every file **both** T2 and T3 would
otherwise touch (`packages/types`, the shared primitives, the body export), so
the two lanes never collide.

**Disjoint file sets** (each in its own worktree off T1's commit —
`.codex/worktrees/agent-galley-t2`, `…-t3`):

| | T2 · the galley | T3 · retirements + send sheet |
|---|---|---|
| owns | `…/drafting/agreement/agreement-composer.tsx` · new `…/drafting/agreement/galley/*.tsx` · `…/agreement/part-editor.tsx` · `…/agreement/parts-rail.tsx` · `…/agreement/__tests__/agreement-composer*.test.tsx` | `…/drafting/service-agreement-drafting-room.tsx` (+ its 2 tests + `__snapshots__/`) · `…/commercial/service-agreement-send-sheet.tsx` (+ test) · `…/commercial/service-agreement-instruments.tsx` · `packages/types/src/agreement-copy.ts` |
| **must not touch** | the send sheet, `service-agreement-instruments.tsx`, any drafting-room file, `packages/**` | `agreement-composer.tsx`, anything under `…/drafting/agreement/`, `globals.css`, `layout.tsx` |

**Integration seam — `parts` into the send sheet.** T1 lands the *declaration*
only: `parts?: AgreementPart[]` on `ServiceAgreementSendSheet`'s prop type (one
line, unused). T2 passes `parts={parts}` from the composer's `sendOpen` block
(`agreement-composer.tsx:1004-1027`) and type-checks green without T3; T3
independently consumes it and plumbs the same prop at the second call site
(`service-agreement-instruments.tsx:377`, which already holds `parts` — it passes
them to the preview at `:374`). The lanes meet at merge with no shared line.

---

## §2 · Per task

### T1 · Foundations — cost **M** (2–3d)

The token layer is larger than the brief assumed. **None** of `--ink`,
`--ink-muted`, `--ink-subtle`, `--ink-faint`, `--rail`, `--paper`, `--paper-doc`,
`--hairline-strong`, `--clay-ink`, `--terracotta-ink`, `--radius-hair`,
`--module` exist in `globals.css`, and **none** of `.t-d1…d3`, `.t-head`,
`.t-body`, `.t-body-sm`, `.t-meta`, `.t-money`, `.t-authorship` exist anywhere
(the real scale is `.type-*` in `packages/patina-design-system/src/styles/
typography.css`) — N-2 understated it. All of it is **additive**, changing no
existing declaration, and lands at `:root`, not room-scoped, because the "Read
the whole paper" overlay renders through a portal outside the room root.

| Edit | Path:line |
|---|---|
| Token aliases + `.t-*` scale + §A14 fields + `.money-row(s)` + `.studio-note` | `apps/designer-portal/src/app/globals.css` — append, one new block |
| `maximumScale: 1` removed (N-3) | `apps/designer-portal/src/app/layout.tsx:37-41` |
| `held` opt-in on the primitive | `apps/designer-portal/src/components/ui/controls/button.tsx:30,55-70,146` |
| `held` opt-in on `DocumentAction` | `apps/designer-portal/src/components/document/document-action.tsx:53,144,235,267` |
| Per-part export; `PartHeading` → `.t-d3` roman (AM-2); AR-g line | `apps/designer-portal/src/components/document/commercial/agreement-parts-body.tsx:64-70,303,541-594` |
| Copy helpers + `noTotal` (additive only — deletions are T3's) | `packages/types/src/agreement-copy.ts` |
| `parts?: AgreementPart[]` declared, unused | `apps/designer-portal/src/components/document/commercial/service-agreement-send-sheet.tsx:26-49` |
| Editor survives a save (ED-5/N-8) | `agreement-composer.tsx:862` `key={selected.id}` → `key={selected.partKey}`; `:890` already keys on `partKey` |
| aged-oak → ink ramp (N-14) | `agreement-composer.tsx:87,962,1048`; `parts-rail.tsx:160,163,351` |
| **room-shell: no change** | see decision below |

**Token aliases** (additive, `:root`): `--ink`→`#2C2926` · `--ink-muted`→
`var(--text-body)` · `--ink-subtle`→`var(--text-muted)` · `--ink-faint`→
`var(--color-quiet-ink)` (`#65594E`; 5.32:1 on `--rail` — N-6's held pair) ·
`--rail`→`var(--doc-rail-stock)` · `--paper`→`var(--color-off-white)` ·
`--paper-doc`→`var(--doc-paper)` · `--hairline-strong`→`#D8CCB8` ·
`--clay-ink`/`--terracotta-ink`→ the `--color-`-prefixed twins · `--oak`→
`var(--color-aged-oak)` (**non-text only**, N-14) · `--radius-hair`→`2px` ·
`--module`→`24px`.

**`aria-disabled`, decided: an opt-in prop, not a global change.**
`button.tsx:146` and `document-action.tsx:267` both set the native attribute, and
`disabled:opacity-50` sits in both base strings (`button.tsx:30`,
`document-action.tsx:53`). Changing either globally is FS-9's **L** and breaks 34
`toBeDisabled()` sites. Instead a `held?: boolean` prop, default false, every
existing caller byte-identical: `disabled={unavailable && !held}`,
`aria-disabled={unavailable || undefined}`, `data-held`, and
`data-[held=true]:{opacity-100,text-[var(--ink-faint)],bg-[var(--rail)]}`. Only
this room passes it. **T3 also drops the `aria-disabled` clause from
`doc-sheet.tsx:87`'s `getFocusableElements`** (N-4) so a held Send inside the
sheet is reachable by Tab.

**Body export (FS-5).** `renderPartBody` stays private; `AgreementPartsBody`
becomes a map over the new export, not a fork:

```ts
export function partDrawsNothing(
  part: AgreementPart, currency: string, turnkey: boolean,
): boolean;   // true ⇔ renderPartBody(...) === null AND the part is not a
              // turnkey pricing_basis (which drags the SOV section along)

export function AgreementPartSection({
  part, currency, turnkey = false, attachmentLetter, headless = false,
}: {
  part: AgreementPart; currency: string; turnkey?: boolean;
  attachmentLetter?: string;   // derived by the caller from position among
                               // visible attachments — never restarted at "A"
  headless?: boolean;          // FS-7: the galley's own <h3> owns the title,
                               // so the printed section prints no heading
}): React.ReactNode | null;    // null ⇔ partDrawsNothing()
```

`AgreementPartsBody` keeps its exact current output for the preview, the send
path and the overlay — same filters, same sort, same `<section data-part-key>`,
same `ScheduleOfValuesSection` ride-along, same attachment lettering.

**AR-g, and its one client-facing consequence.** The no-total sentence is
`AGREEMENT_PART_COPY.noTotal`, rendered from the designer body when a
client-visible `rate_card` part is present. The client-portal body is a **fork**
(N-1) and is not touched, so the homeowner's copy will not carry it until a
follow-up wave — **flagged as owed, not silently absorbed**; the SQL keepsake
(N-12) is a third surface with the same gap.

**Copy helpers, in `packages/types/src/agreement-copy.ts`:**

```ts
agreementCountWord(n: number): string;   // 1..20 → "one".."twenty"
agreementPartNounPhrase(part: AgreementPart, currency: string): string | null;
  // "the services" · "the $5,000.00 retainer" · "the monthly billing cadence";
  // null ⇔ unwritten
agreementConsequenceSentence(input: {
  recipientName?: string; parts: AgreementPart[]; currency: string;
}): string;   // synthesis §5 #25/#26, verbatim. Enumerates
  // parts.filter(clientVisible !== false && kind !== 'attestation') whose
  // nounPhrase is non-null, in position order, "and" before the last.
  // No name ⇒ "The client receives …" / "their signature".
```

`@patina/types` is the right home (FS-22) — the homeowner's door reads the same
helper in a later wave. It costs two extra gates, named below.

**room-shell, decided: leave `room-shell.tsx:155` alone.** Rendering the action
slot at every width reflows the sticky 3-column grid in *every* room at 390, for
no benefit here. Instead the composer **drops both `action` and `count`** from
its `RoomShell` call (`agreement-composer.tsx:703-717`): one act, one count, both
on the page (FS-12, house rule #7). Nothing outside this room changes.

**Acceptance** (numbered against `SPEC.md` §8):
1. No new native `disabled` in the room's path; every `held` act carries `aria-disabled="true"` + a resolved, visible `aria-describedby` **(checks 1, 7)**.
2. `--ink-faint` on `--rail` computes ≥ 4.5:1 **(check 9)**.
3. `grep -n 'maximum-scale\|maximumScale' apps/designer-portal/src` → 0 **(check 12)**.
4. Every surviving `aged-oak` hit under `…/drafting/agreement/` styles `border-color`/`background`, never `color` **(check 10)**.
5. `partDrawsNothing(unsetDepositPart) === true`; `AgreementPartsBody` output byte-identical to `7eed713b7`'s for the nine-part fixture but for the `PartHeading` class and the AR-g line.
6. `agreementConsequenceSentence` reproduces synthesis §5 strings #25 and #26 exactly.

**Gates:** `pnpm turbo build --filter=@patina/types` → `pnpm --filter
@patina/designer-portal type-check` → `pnpm --filter @patina/designer-portal test
-- src/components/document/commercial src/components/ui` → **`pnpm --filter
@patina/admin-portal build`** (`packages/types` changed; admin's build enforces
types).

---

### T2 · The galley — cost **L** (6–9d)

Rewrites `agreement-composer.tsx` (1089 lines → a smaller composer plus a
`galley/` folder). **Removed:** the 3-column grid (`:820`), the rail and editor
columns, the 320 aside and its `compact` preview (`:960-967`), `ReadinessPanel`
(`:1032-1066`), the three-act header row (`:743-763`), the `Client account` block
(`:765-797` → the inline prepared-for act), the `Preview client copy` sheet
(`:972-978`), the RoomShell `action`/`count` (`:703-717`).

**Created** under `…/drafting/agreement/galley/`:

| File | Shape |
|---|---|
| `part-outline.tsx` | keeps the shipped contract (FS-16): `<nav aria-label="Agreement parts"><ul><li>` — left column ≥1248, an `aria-expanded` disclosure at the galley head below. Rows carry `needs attention`. Foot: `Save as template…` (library-gated). |
| `galley-part.tsx` | one `<section class="part" data-part-key scroll-margin-top:24px>`: `<h3 class="part__head t-d3">` + the fold act (**"Write"**, AR-h) · the standing `.t-head` · the act box (Move up · Move down · **Hide**) · `<AgreementPartSection headless>` · `<div class="fold" hidden>`. |
| `galley-fold.tsx` | `<PartEditor headless>` at 720/664/358, plus the per-part record line. Scroll anchoring, below. |
| `studio-strip.tsx` | `.studio-note` on `--rail`, 2px `--clay-ink` rule, `THE STUDIO` head. Absolute in the right margin ≥1248; in flow, interrupting the sheet, below 1248, where no name-only strip prints and the standings gather into one `.strip--run` (specimen `:640-660`). |
| `readiness-voice.ts` | the sentence composer, below. |
| `whole-paper-sheet.tsx` | `<DocSheet wide>` (760, `doc-sheet.tsx:377`) holding `<ServiceAgreementPreview {...previewProps} />` — the **same** renderer the galley prints, never a third (FS-13; never a route). |

**Edited:** `part-editor.tsx:88-155` gains `headless?: boolean`, suppressing the
whole `<header>` block — the `<h2>` that would print the title twice (FS-7), the
kind eyebrow, the visibility checkbox and the blockers. In the galley the head
carries title and standing, Hide is a part act, and part-scoped blockers print in
the margin strip, which is FS-30's answer. `parts-rail.tsx` is superseded by
`part-outline.tsx` and deleted with its suite (T4).

**Binding shapes:**

```ts
// One open at a time, keyed on the part key — never a uuid (N-8/FS-26,
// because upsert_agreement_parts is DELETE-then-INSERT).
const [openKey, setOpenKey] = useState<string | null>(null);
// `selectedId` is retired; "selected" and "unfolded" are one state (FS-31).
// Everything that used to set selectedId (addPart, addFromLibrary,
// attachNotice, applyTemplate, persist) sets openKey to the part's partKey.

composeReadinessSentence(
  current: AgreementReadiness,
  previous: AgreementReadiness | null,
): string;
// Counts THINGS TO FINISH, not parts. Deduped by message.
//   0            → "Nothing left to finish."
//   1            → "One thing before this can go: {ask}."
//   n            → "{Word} things before this can go: {ask}; {ask}."
//   a blocker in `previous` and not in `current`, with others remaining
//                → "{cleared}. One thing left: {ask}."
```

`readiness.ts`'s `AgreementBlocker` gains two authored fields beside `message`:
`ask` (`"name a fee"` · `"name a ceiling"` · `"link a client"`) and `cleared`
(`"Role rates name the fee"`). An uncoded blocker falls back to its own
`message` — the region is never empty and never wrong (§A10, check 5). It renders
into **one permanent** `<p class="studio-note"><span id="room-status"
role="status" aria-live="polite">` above the galley, present at load, never
conditionally mounted.

**Scroll anchoring (FS-19), the whole fix:** no `overflow-anchor` exists in the
portal; the house pattern is imperative. On the state change that opens or closes
a fold, read the head's `getBoundingClientRect().top` before and restore with
`window.scrollBy` in a `useLayoutEffect` (~15 lines); `html { scroll-padding-top:
60px }` for the sticky bar. The act box is **reserved, not revealed** — the
ghost/live pair at `direction-1.html:577-587` keeps 0px of reflow.

**Acceptance:**
1. Check **18** — Δ = 0px on the part *above* Role rates across an unfold, at 1440 **and** 390. D's crux.
2. Check **13** — an act matching `/review|send/i` present at 390; the 390 act set is not a proper subset of the 1440 set.
3. Checks **14/15** — with `pointerEvents='none'`, Move up twice on Billing cadence: focus stays on that part's control and `#room-status` reads `Billing cadence is now part 7 of 9.` each time.
4. Checks **5/6** — the status node exists at load and rewrites to a full sentence within one frame of a readiness change.
5. Check **8** — activating the held Send writes the reason into `#room-status` and moves focus to the unmet part's head.
6. Check **4** — one `<h1>` (the client's name), one `<h3>` per part, no level skipped, in every state.
7. FS-6 — unset **Furnishings deposit** prints nothing on the paper yet is reachable and openable by Tab through its rest row (`Not written yet. Your client's copy does not print this part.`), and `+ Add a part` is reachable at the seam beside it.
8. The consequence sentence sits directly above the terminal act in every state, `Read the whole paper` beneath it, no `Preview client copy` anywhere.

**Gates:** `pnpm --filter @patina/designer-portal type-check` · `… test --
src/components/document/rooms/drafting/agreement` · `… lint`.

---

### T3 · Retirements + the send sheet — cost **M** (3–4d)

| Act | Path:line |
|---|---|
| Drop the `agreement-parts` read and `returnedToFacets` — the composer is the only room | `service-agreement-drafting-room.tsx:102-103,105,127-142` |
| Delete `ServiceAgreementEditor` (`:199-749`), `AgreementFacet` (`:750-777`), the R17 notice (`:418-425`), the `N of 7 facets written` count (`:343`), the now-unreachable `state !== "draft"` dead end (`:150-156`), and the dead `emptyTerms`/`dollars`/`cents`/`DEFAULT_*`/`labelClass` | same file — 777 → ~120 lines |
| **Keep** the `dynamic()` composer import (`:37-47`) | it still keeps dnd-kit and the editors out of `drafting-room.tsx`'s chunk |
| Delete `AGREEMENT_PART_COPY.returnToFacets` (`:42-46`) and `.composedElsewhere` (`:47-55`) | `packages/types/src/agreement-copy.ts` — safe, see R4 |
| Send sheet → synthesis §5's table | `service-agreement-send-sheet.tsx:99-112` (eyebrow + heading + fixed sentence → the composed one), `:114-121` (Recipient box **cut**), `:125-136` (deposit box **cut** → the caution slot), `:151-154` (`Ready to send · every contractual facet is present.` **cut**, N4 closed), `:168-177` (placeholder → a `.t-meta` line, FS-8), `:200-202` (`Send later` → `Not yet`), `:203-209` (`Send agreement →` → `Send the agreement · $5,000.00 retainer`, `held` + `aria-describedby` at the blocker) |
| Plumb `parts` at the second call site | `service-agreement-instruments.tsx:377-396` — `parts` already in scope at `:374` |
| Drop the `aria-disabled` clause from the focus trap (N-4) | `doc-sheet.tsx:87` |
| Keep `Record a signature received outside Patina` reachable | `:188-195`. **The drafting room at `:732` was one of its two callers**; the survivor is `service-agreement-instruments.tsx:400`. T3 adds `onRecordOffline` to the composer's call at merge, or files it as owed. |

**`assessServiceAgreementReadiness`, decided: KEEP**
(`lib/document/commercial-documents.ts:153-244`). `service-agreement-send-sheet
.tsx:63` calls it as the fallback when no `readinessOverride` is passed, and
`service-agreement-instruments.tsx:377` still reaches that path for a document
with no parts. Its only other caller — `service-agreement-drafting-room.tsx:257`
— dies with the seven-facet room. Nothing in `supabase/`, the client portal or any
edge function uses it; the authoritative gate is SQL (`_agreement_floor_unmet`,
`00575_agreement_parts.sql:387-422`), untouched.

**Acceptance:** the four §4 greps return nothing in the source tree; the sheet
prints one consequence sentence composed from the composition; the caution slot
carries the deposit sentence only when unset; a held Send is reachable by Tab.

**Gates:** `pnpm turbo build --filter=@patina/types` · `pnpm --filter
@patina/designer-portal type-check` · `pnpm --filter @patina/designer-portal
test -- src/components/document/commercial src/components/document/rooms/drafting`
· **`pnpm --filter @patina/admin-portal build`**.

---

### T4 · Tests — cost **M–L** (4–5d)

**Snapshots, measured: 3 files, 11 calls, 3,670 recorded lines** — one more than
N-9 counted. Delete all three and rewrite each call as an assertion on the thing
being proved (library acts absent / turnkey editors absent / the flag-off room
unchanged), never on the tree. Do this **first**: several snapshots pin the very
header row and grid classes this wave deletes.

| `.snap` | Lines | Calls |
|---|---|---|
| `agreement/__snapshots__/agreement-composer-library-off.test.tsx.snap` | 1,568 | 5 (`:282,295,313,326,339`) |
| `agreement/__snapshots__/agreement-composer-design-build-off.test.tsx.snap` | 1,543 | 5 (`:283,295,308,321,334`) |
| `drafting/__snapshots__/service-agreement-drafting-room.test.tsx.snap` | 559 | 1 (`:220`) — dies with the room |

| Suite (lines) | What breaks | Action |
|---|---|---|
| `agreement-composer.test.tsx` (787) | 11 `Save agreement`/`Saved` sites (`:324,328,422,435,478,511,529,647,703,722,739`), 8 `toBeDisabled/Enabled` (`:324,329,435,530,648,649,704,705`), 5 `textbox {name:"Body"}`, the room-shell mock's `data-testid="room-count"` | retarget to the outline, the dated record line, `toHaveAttribute('aria-disabled','true')` |
| `-library-off` (341) · `-design-build-off` (336) | snapshots only | rewrite as named assertions |
| `-library-on` (505) · `-turnkey` (533) | `Save agreement` (`:308,364`/`:313`), `Review & send` `toBeDisabled` (`:531`); the `nav`/`listitem` sites survive (FS-16) | small edits |
| `parts-rail.test.tsx` (370) | deleted with the file; 8 nav/listitem, 5 `toBeDisabled` on the row menu (FS-28) | rewrite as `part-outline.test.tsx` against the same `nav`/`ul`/`li` contract |
| `part-editor.test.tsx` (466) | `headless` | add the case: no `<h2>`, no visibility checkbox, no blocker block |
| `readiness.test.ts` (1002) · `-turnkey` (434) | `ask`/`cleared` on `AgreementBlocker` | extend; `composeReadinessSentence` cases for **all five** §5 sentences incl. the two-item and the transition form |
| `service-agreement-drafting-room.test.tsx` (563) + `.snap` | the whole file tests the seven-facet room ("renders the seven-facet room unchanged when `agreement-parts` is off"; "composed elsewhere", `:520-563`) | delete those describes and the `.snap` |
| `…-composer-key.test.tsx` (168) | mounts the same room | keep — mount identity is still true and still needed |
| `commercial/agreement-parts-body.test.tsx` (836) | `:480-498` asserts the **whole `AGREEMENT_PART_COPY` object by equality**, `returnToFacets` (`:497`) / `composedElsewhere` (`:499`) included | update the expected object; add `partDrawsNothing` + `AgreementPartSection` cases (unset deposit, unwritten clause, lettering past Z, SOV ride-along, `headless`) |
| `commercial/service-agreement-send-sheet.test.tsx` (133) | every cut string; `toBeEnabled` at `:101` | rewrite against §5's table |
| the other 11 agreement suites (≈4,000 lines) | **untouched** | must stay green |

**`held` being opt-in pays for itself.** Of 34 `toBeDisabled()`/`toBeEnabled()`
sites, only the galley's convert; `add-part-sheet` (7), `template-picker-sheet`
(2), `save-as-template-action` (1) and `turnkey-editors` (2) keep native
`disabled` untouched. A portal-wide primitive change would have cost all 34.

**Two scope corrections the inventory surfaced.** (1) **`drafting-room.test.tsx`
(360) must NOT be edited** — its `Preview client copy` / `dialog[name="Client
copy preview"]` assertions (`:264-283`) belong to the **proposal** drafting room,
a different room; AR-d retires the act in the agreement composer only. Leave it
as a regression canary. (2) **`design-build.pw.ts` is not free** — it clicks
`Save agreement` and asserts `All agreement changes saved.` (`:254-255`), so that
step must be retargeted to the record line; its `nav`/`listitem` and
`data-template-locked` assertions survive.

**e2e.** `agreement-parts.agreement.pw.ts` (178): the rail selectors survive by
the nav contract (`:92,95,107,112`); `Preview client copy` (`:165`) → `Read the
whole paper`, and the `article[name="Design services agreement client copy"]`
assertion (`:168`) **survives unchanged** because the overlay renders the same
`ServiceAgreementPreview`; `Save agreement` (`:131-132`) → the record line. New
cases: **(a)** fold/**Write** unfolds beneath the printed part and the part above
does not move; **(b)** keyboard Move up ×2 with focus return and the status
sentence; **(c)** hide-a-part on a **design-services** agreement (AR-e), refused
on `pricing_basis`/`draws` (R48); **(d)** Review & send reachable and openable at
1024 **and** 390; **(e)** the full-read overlay opens at 760 and closes on Esc.
`playwright.agreement.config.ts` keeps its now-inert `agreement-parts:true`
override — it is also what scopes `testMatch`; **kill any reused dev server
first** or its own webServer never boots.

**Gates:** `pnpm --filter @patina/designer-portal test` (whole suite) · `pnpm
--filter @patina/designer-portal test:e2e -- --config
playwright.agreement.config.ts --project=chromium`.

---

### T5 · Gates + adversarial review + walk — cost **S–M** (1–2d)

In the integration worktree, in order: `pnpm turbo build --filter=@patina/types`
→ `pnpm --filter @patina/designer-portal type-check` → `… lint` → `… test` →
`pnpm --filter @patina/admin-portal build` → `pnpm --filter
@patina/designer-portal build` → the e2e config above. Turbo silently skips
workspaces with no script and only designer-portal has a working ESLint config —
green proves less than it looks. Adversarial review in a **separate context**,
implementer never reviewing its own work, every finding with confidence +
severity and no severity filter. Then the walk (§4).

### T6 · Merge + deploy + probes — cost **S**

Merge T2 and T3 onto T1's commit, re-run T5's gates, then
`./infra/deploy-portal.sh designer-portal` — **never** `opennextjs-cloudflare
build` directly: the script rebuilds workspace dists first, and `packages/types`
changed in this wave, which is exactly the failure mode that shipped
`TypeError: proposalTierVisibility is not a function`. No migration, no edge
function, no Strata step. Retire the worktrees at task end.

---

## §3 · Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Scroll anchoring on unfold (FS-19).** No `overflow-anchor` anywhere; 17 imperative `scrollIntoView` sites are the house pattern. At 390 the fold is full-width and the shift is largest. | `useLayoutEffect` measure-and-restore + `scroll-padding-top: 60px`; the act box reserved, never revealed. Check 18 at **both** 1440 and 390, and under `prefers-reduced-motion`. |
| R2 | **`persist()` remounts the editor (ED-5).** DELETE-then-INSERT re-mints every uuid, so an editor keyed on `id` remounts mid-typing — and `reviewAndSend()` saves behind the sheet. | T1 lands `key={selected.partKey}`; T2 retires `selectedId` for `openKey: partKey`. Test: type into Services, Save, assert the textbox keeps focus and value. **No per-part autosave** — Services projects into `scope` and `materialize_standard_parts` seeds it back from `scope` (N-7); the capture lane already contaminated a "pristine" load this way. |
| R3 | **The send sheet has no `parts` (FS-22).** | T1 declares the optional prop; T2 passes it; T3 consumes it and plumbs the second call site, which already holds `parts`. |
| R4 | **Client-portal bundle of the deleted constants.** | Verified: the client portal imports `AGREEMENT_PART_COPY` in two files and touches only `.recorded`, `.notYetSet`, `.ceilingUncapped`, `.cadenceNote`, `.attachmentAcknowledgment`. `returnToFacets`/`composedElsewhere` have **no consumer outside designer-portal** — delete them. The one break is `agreement-parts-body.test.tsx:480-498`, which asserts the whole object. |
| R5 | **Two renderers (N-1) — a third would be a defect.** | The galley prints the designer body through `AgreementPartSection`; "Read the whole paper" prints `ServiceAgreementPreview` → `AgreementPartsBody` → the same export. One code path, two framings. The client fork is untouched, and its paper will **not** carry AR-g's line (owed, §T1). |
| R6 | **AM-2's roman heads reach the client-visible paper.** `PartHeading` (`agreement-parts-body.tsx:64-70`) is Playfair italic; the client fork's heading is separate. | Accepted — N-1's contract is sentences, not styling. Named in the ship report so the client fork can follow. |
| R7 | **The library/design-build sub-features must keep working inside the galley.** | Mount points, all in T2: `+ Add a part` seam act → `AddPartSheet` when `libraryOn`, `add-part-menu` otherwise · templates (`Start from a template…`, `Save as template…`) → the **outline's foot** · `PartHistoryStrip` (keyed `history-${partKey}`) → **inside the open fold**, under the editor · the visibility toggle → a **Hide** part act on every agreement (AR-e), refused on `pricing_basis`/`draws` (R48), readiness-named when it hides a fee (R33) · turnkey editors → **inside the fold** at 720/664/358 · jurisdiction strips, draw ledger, lien waivers and the trade-agreements strip → a **studio run below the paper's foot** at every width, on `--rail` (NO-4), the 320 aside being gone. |
| R8 | **`Save agreement`/`Saved` selector sites** — 15 in Jest (`agreement-composer` ×11, `-library-on` ×2, `-turnkey` ×1, drafting-room ×1, plus 11 snapshot pins) and **two** Playwright steps, not one: `agreement-parts.agreement.pw.ts:131-132` **and `design-build.pw.ts:254-255`**. | Budgeted in T4. No act named `Save agreement` survives — the dated record line replaces it (§A5 "taken"). `design-build.pw.ts` is not a free pass. |
| R10 | **Scope creep into the proposal drafting room.** `drafting-room.tsx` has its own `Preview client copy` act and its own `Client copy preview` dialog, covered by `drafting-room.test.tsx:264-283`. AR-d retires the act in the **agreement composer only**. | T2's file set excludes `drafting-room.tsx`; the suite is left untouched as a canary. If it goes red, the lane over-reached. |
| R9 | **Local main is 157 behind origin/main.** A lane that branches from the primary checkout builds the wrong tree. | Every lane branches from `7eed713b7`; the worktree already sits there. |

---

## §4 · The walk (T5), the probes (T6), the rollback

**Walk.** Local production build, never `next dev`:

```sh
sh -c 'cd <integration-wt>/apps/designer-portal && NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true,agreement-library:true,design-build:true \
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<local> \
  pnpm exec next build --webpack && pnpm exec next start -p 3000'
```
Kill whatever holds :3000 first. Reseed with `../shots/tools/seed-draft.mjs`
(ceiling $24,000, retainer $5,000, monthly, no rate-card rows — the shape that
produces the fee-floor blocker), then attach a client account so the prepared-for
line and the held inline act are both provable. Run at **1440, 1024, 390**,
Leah's thirteen steps minus the retired ones:

1. Open `/drafting/<id>` — the client's name, `Draft`, the prepared-for line, the dated record, **one** readiness sentence.
2. Read the paper top to bottom with no mode switch.
3. Press **Write** on Services — the editor unfolds beneath the printed clause and the clause above does not move.
4. Type; the record reads `… · Services not yet saved`.
5. `Esc` — the fold closes, focus returns to the Services head.
6. Open **Role rates** through its studio rest row; write three rates; the readiness sentence transitions.
7. **Move up** on Billing cadence twice, keyboard only — focus holds, the status names the new position.
8. **Hide** a part; readiness names it (R33). Hide on a `pricing_basis` part — refused (R48).
9. `+ Add a part` at the seam beside the unwritten Furnishings deposit, by Tab.
10. `Save as template…` / `Start from a template…` from the outline's foot.
11. **Review & send** at the paper's foot — at 1024 and 390 too.
12. Read the composed consequence sentence, the held Send, the blocker.
13. **Read the whole paper** — the overlay at 760, the same body, Esc closes it.

Nothing anywhere reads `Return to the seven facets`, `facets written`,
`Preview client copy`, or `Ready to send · every contractual facet is present.`

**Probes (T6), against the live Worker.** Fetch the chunk list from a signed-out
`/drafting/<id>` render and grep the served JS (per
`feedback_deploy_placeholder_incident_2026_08_26.md`). Must **find** `"Write"`
(the fold act), `"One thing before this can go"`, `"Read the whole paper"`. Must
**not find** `"Return to the seven facets"`, `"facets written"`, `"Preview client
copy"`. A 1024-wide signed-out `/drafting/<id>` redirecting to sign-in is
acceptable liveness. `npx wrangler deployments list` — **oldest-first; read the
bottom row**; `/version` returns static defaults and proves nothing.

**Rollback.** Record the live Worker version id from `wrangler deployments list`
(bottom row) **before** deploying, into the ship report. Rollback = redeploy that
version. No flag to flip, no migration to reverse; `discard_agreement_parts`
stays in the database untouched.
