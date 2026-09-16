# Current state — the Agreement Room as shipped

Facts only. No findings, no opinions. Every claim in §2–§5 carries a `path:line`
verified against the working tree at `/Users/kody/Code/patina-merged` on
10 September 2026 (branch `main`).

Paths are relative to the repo root. `agreement-composer.tsx` means
`apps/designer-portal/src/components/document/rooms/drafting/agreement/agreement-composer.tsx`
throughout §2; every other file is written in full.

---

## §1 · The page as Kody sees it

The authority for this section is `kody-screenshot.png` in this folder — a
production capture of `/drafting/<id>` taken 10 September 2026, 5:36 AM.

**The capture.** 2884 × 2000 device pixels at 2× device-pixel-ratio, so the CSS
viewport is **≈1442 × 1000**. That is above the room's single breakpoint
(1180px), so the three-column layout is active. The capture is a cropped
region: it begins at the page title. The RoomShell sticky bar and the room
eyebrow line sit above the crop and are not visible in it.

Measurements below are CSS pixels. Values marked **computed** are derived from
the class declarations in §2 at a 1442px viewport; values marked *measured* are
read off the capture and carry roughly ±3% hand-measurement error.

### Top to bottom

| Band | What is there | Extent |
|---|---|---|
| (above the crop) | RoomShell sticky bar; room eyebrow `Yes to the designer · professional services only` | not captured |
| Title | `j.enzenroth@gmail.com — design services agreement`, Playfair, 26.4px (`text-[1.65rem]`). Fits on **one line** at this width. | top ≈14 |
| Subtitle | `Compose the parts this agreement is made of. Furnishings and purchasing stay outside it.` 12.5px | ≈62–72 |
| Three acts | Three boxed buttons in a row: `Preview client copy` · `Return to the seven facets` · `Saved` (the third rendered in a filled tan ground, unavailable) | ≈96–135 |
| Client account | `CLIENT ACCOUNT` mono caps label; a full-width select showing `j.enzenroth@gmail.com` with a chevron; helper sentence `Only the agreement owner can change the client account.` | ≈163–247 |
| Header rule | 1px bottom rule closing the header | ≈271 |
| (gap) | `pt-7` = 28px before the grid | 271–299 |
| The work | Three columns begin | ≈299–306 |

**The header block before the work starts is ≈300 CSS px tall** (title top to
first part row), and that is measured from the crop, i.e. *excluding* the
RoomShell sticky bar and the eyebrow line above it, and excluding the
container's own `py-7` (28px) above the title.

### The three columns

Container: `max-w-[1240px]` with `sm:px-8` (32px) → content band **1176 wide**,
centred, left edge at ≈133 in a 1442 viewport. Gap `gap-9` = 36px.

| Column | Declared | Computed at 1442 | *Measured* left edge |
|---|---|---|---|
| Rail | `260px` | 260 | ≈133 |
| Editor | `minmax(0,1fr)` | **524** | ≈429 |
| Aside | `320px` | 320 | ≈989 |

**Left — the rail (260).** Nine rows, each a drag handle (⠿) at the far left, a
mono-caps eyebrow, the part title at 13px, and a `⋯` row menu at the right. The
eyebrows read, in order: `CLAUSE` · `LIST` · `LIST` · `ROLE RATES · CREATES
AUTHORITY` · `CEILING · CREATES AUTHORITY` · `FURNISHINGS DEPOSIT · CREATES
AUTHORITY · DEPOSIT ONLY` · `RETAINER · CREATES AUTHORITY` · `BILLING CADENCE ·
CREATES AUTHORITY` · `CLAUSE`. Four of the nine wrap their eyebrow to two lines
inside 260px. Titles: Services · Deliverables · Exclusions · Role rates ·
Ceiling · Furnishings deposit · Retainer · Billing cadence · Terms. `Services ·`
and `Terms ·` carry a trailing middle dot (the Required marker). Two rows —
Retainer and Terms — carry a third line reading `NEEDS ATTENTION`. Below the
last row, `+ Add a part`.

**Middle — the editor (524).** Eyebrow `CLAUSE`; heading `Services` in Playfair
italic 20px; an unchecked checkbox labelled `Hidden from your client`; label
`BODY`; a textarea holding `Interior design services, including concept
development, design documentation, and selections.` The textarea is roughly
**508 wide × 172 tall** *measured*, with a resize grip at its bottom-right
corner. Below the textarea the column is empty for the remaining ≈560px of the
capture.

**Right — the aside (320).** Two messages, then the paper:

1. `2 OF 9 PARTS NEED ATTENTION` — mono caps, 11px, aged-oak, sitting on a top
   rule.
2. `This agreement names no fee. Add a rate card, a flat fee, or a per-phase
   fee.` — 12px, two lines.
3. A bordered white card (8px radius) holding the live client copy, headed
   `THE CLIENT'S COPY · LIVE` in aged-oak mono caps. Inside it, at a text
   measure of **≈280** (320 less `px-5` on both sides):
   `DESIGN SERVICES AGREEMENT · V1`, then the paper's own title —
   **`j.enzenroth@gmail.com — design services agreement` wrapping to three
   lines** (`j.enzenroth@gmail.com` / `— design services` / `agreement`) —
   then `DRAFT`, a rule, then `Services` with its three-line body, then
   `Deliverables` with three em-dash lines (Concept presentation · Design
   documentation · Selection schedules), then `Exclusions`, which the crop cuts
   off.

The same sentence `2 of 9 parts need attention` is also printed by the RoomShell
bar above the crop (§2, RoomShell `count`), so the count appears twice on the
page.

---

## §2 · The code behind each element

### Mount and flags

| Element | Where |
|---|---|
| Room chooses composer vs seven-facet room | `apps/designer-portal/src/components/document/rooms/drafting/service-agreement-drafting-room.tsx:127` (`if (partsOn && !returnedToFacets)`) |
| `<AgreementComposer>` element | `service-agreement-drafting-room.tsx:137-142` |
| Composer file length | `agreement-composer.tsx` — 1089 lines |
| Flag `agreement-parts` read | `service-agreement-drafting-room.tsx:102-103` |
| Flag `agreement-library` read | `agreement-composer.tsx:162-163`; `libraryOn` at `:164` |
| Flag `design-build` read | `agreement-composer.tsx:173-174`; `designBuildOn = libraryOn && designBuildFlag && !designBuildLoading` at `:175` |

### Layout

| Element | Where | Value |
|---|---|---|
| Page container | `agreement-composer.tsx:719` | `mx-auto max-w-[1240px] px-6 py-7 sm:px-8` |
| Header block | `agreement-composer.tsx:720-818` | `<header className="border-b border-[var(--doc-ink-border)] pb-5">` |
| The grid | `agreement-composer.tsx:820` | `grid gap-9 pt-7 min-[1180px]:grid-cols-[260px_minmax(0,1fr)_320px]` — one breakpoint; below 1180px it is a single stack |
| Aside visibility | `agreement-composer.tsx:960` | `hidden min-[1180px]:block` — the live paper is not rendered below 1180px |
| Aside card | `agreement-composer.tsx:961` | `sticky top-[82px] rounded-[8px] border border-[var(--doc-ink-border)] bg-white px-5 py-5` |
| Card head | `agreement-composer.tsx:962-964` | `font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]` · text `The client's copy · live` |
| Compact preview | `agreement-composer.tsx:965` | `<ServiceAgreementPreview {...previewProps} compact />` |
| RoomShell sticky bar | `apps/designer-portal/src/components/document/rooms/room-shell.tsx:122` | `sticky top-0 z-20 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] … py-2 … min-[1180px]:py-3` |
| Seven-facet room grid, for comparison | `service-agreement-drafting-room.tsx:436` | `grid gap-9 pt-7 min-[1180px]:grid-cols-[minmax(0,1fr)_380px]` |

The preview drops its own measure in compact mode:
`apps/designer-portal/src/components/document/commercial/service-agreement-preview.tsx:101`
— `className={compact ? "space-y-5" : "mx-auto max-w-[720px] space-y-7"}`. Inside
the 320px aside there is no max-width; at full size the paper is 720px.

### The header's content and acts

| Element | Where | Text / behaviour |
|---|---|---|
| Room title (RoomShell) | `agreement-composer.tsx:697-701` | `The Contract Room · Design Agreement` (or the design-build title) |
| RoomShell count | `agreement-composer.tsx:703` | `` `${needAttention} of ${parts.length} parts need attention` `` |
| `Review & send` | `agreement-composer.tsx:705-716` | `<DocumentAction actionKey="review-design-agreement" variant="primary" trailing="→" disabled={refusedAtSave \|\| readOnly}>` — it is the RoomShell action, not a page button |
| Eyebrow | `agreement-composer.tsx:721-730` | `Yes to the designer · professional services only` |
| Title | `agreement-composer.tsx:732-734` | `{document.title}` at `font-heading text-[1.65rem]` |
| Subtitle | `agreement-composer.tsx:735-740` | `Compose the parts this agreement is made of. Furnishings and purchasing stay outside it.` |
| `Preview client copy` | `agreement-composer.tsx:744-746` | `variant="secondary"`, opens `previewOpen` |
| `Return to the seven facets` | `agreement-composer.tsx:746-755` (element `:747-754`) | `variant="secondary"`, calls `returnToFacets()`; rendered only when `!readOnly` |
| `Save agreement` / `Saved` | `agreement-composer.tsx:756-762` | `disabled={!dirty \|\| readOnly \|\| refusedAtSave}` at `:759`; label `{dirty ? "Save agreement" : "Saved"}` at `:761` |
| Client account block | `agreement-composer.tsx:765-797` | label at `:766`, `<ClientPicker>` at `:767-783`, owner sentence `Only the agreement owner can change the client account.` at `:785-788` |
| Save note (`role="status"`) | `agreement-composer.tsx:799-806` | e.g. `All agreement changes saved.` |
| Read-only sentences | `agreement-composer.tsx:807-817` | `This agreement has left the studio. Its parts are fixed as sent.` / the design-build variant |

The three acts wrap deliberately on a narrow phone — the code comment at
`agreement-composer.tsx:739-742` records that unwrapped they measured 617px
against a 390px viewport.

### The rail

`apps/designer-portal/src/components/document/rooms/drafting/agreement/parts-rail.tsx`
(434 lines), dnd-kit sortable.

| Element | Where | Value |
|---|---|---|
| Row eyebrow | `parts-rail.tsx:308-328` | `font-mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]`, text = `partKindLabel(kind, variant)` plus the authority chip for schedule parts when `libraryOn` |
| Row title | `parts-rail.tsx:329-340` | `block text-[13px]`; required parts append a middle dot with `aria-label="Required"` (`:332-338`) |
| Hidden-from-client sub-label | `parts-rail.tsx:341-348` | `text-[10.5px]`, `data-client-visible="false"` |
| `needs attention` sub-label | `parts-rail.tsx:349-353` | `block font-mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]`, literal text at `:351` |
| Row menu items | `parts-rail.tsx:378, 384, 390, 397, 403-404` | `Rename` · `Move up` · `Move down` · `Keep in the Library` / `Kept in the Library` · `Remove` |
| Rename in place | `parts-rail.tsx:247-292` | `commitRename` at `:247`; input `aria-label={\`Rename ${part.title}\`}` at `:284`; commits on blur (`:287`) and Enter (`:289`) |
| `+ Add a part` | `parts-rail.tsx:187` | ghost button; opens the Library sheet when `libraryOn`, the add menu otherwise |
| `Start from a template…` | `parts-rail.tsx:191` | ghost button, `libraryOn` only |
| Empty rail sentence | `parts-rail.tsx:180-181` | `This agreement has no parts yet.` |

The nine standard parts are `PATINA_STANDARD_AGREEMENT_PARTS`,
`packages/types/src/agreement.ts:96-106` — in order: `patina.services` (clause,
required) · `patina.deliverables` (list) · `patina.exclusions` (list) ·
`patina.role_rates` (schedule/rate_card) · `patina.ceiling`
(schedule/ceiling) · `patina.deposit` (schedule/procurement) ·
`patina.retainer` (schedule/retainer) · `patina.cadence` (schedule/cadence) ·
`patina.terms` (clause, required).

### The editor

`apps/designer-portal/src/components/document/rooms/drafting/agreement/part-editor.tsx`
(657 lines). Mounted at `agreement-composer.tsx:861-885`, keyed on
`selected.id`; when nothing is selected the column reads `Pick a part on the
left, or add one.` (`agreement-composer.tsx:898-900`).

| Element | Where | Value |
|---|---|---|
| Kind eyebrow | `part-editor.tsx:94-95` | `partKindLabel(part.kind, part.variant)` |
| Part heading | `part-editor.tsx:113-115` | `font-heading text-[1.25rem] italic` |
| `Hidden from your client` checkbox | `part-editor.tsx:116-126` | native `<input type="checkbox" disabled={readOnly}>`; rendered only when `onToggleClientVisible` is passed, which `agreement-composer.tsx:869-884` gates on `designBuildOn` and refuses on `pricing_basis` / `draws` |
| Hidden help line | `part-editor.tsx:127-131` | `DESIGN_BUILD_COPY.hiddenFromClientHelp` |
| `Body` label | `part-editor.tsx:194-195`, `:608-609` | mono caps |
| Per-kind dispatch | `part-editor.tsx:146` | `<PartEditorBody>` — clause textarea, list, rate card, ceiling, retainer, cadence, flat, per-phase, procurement, and the Wave 2/3 variants |
| Blockers into the editor | `agreement-composer.tsx:867` | `blockers={blockersForPart(readiness, selected.id)}` |

Authority standings and their labels live in
`apps/designer-portal/src/components/document/rooms/drafting/agreement/schedules/index.ts`:
`authorityStanding()` at `:52-65`; `AUTHORITY_STANDING_LABEL` at `:67-71` —
`authority` → `creates authority`, `deposit-only` → `creates authority · deposit
only`, `record-only` → `record only`; `RECORD_ONLY_HELP` at `:75-76` — `This is
recorded on the agreement. It does not create billing authority yet.`

### Saving and sending

| Act | Where | Behaviour |
|---|---|---|
| `persist()` | `agreement-composer.tsx:601-626` | calls the RPC `upsert_agreement_parts`, which replaces the whole ordered array; re-selects by `partKey` because the RPC is DELETE-then-INSERT and every part returns with a new uuid (`:602-606`); sets `All agreement changes saved.` at `:620` |
| `returnToFacets()` | `agreement-composer.tsx:637-648` | calls `discard_agreement_parts`; **no confirmation step** |
| `reviewAndSend()` | `agreement-composer.tsx:652-656` | persists if dirty, then opens the send sheet |
| RPC wrappers | `packages/supabase/src/hooks/use-agreement-parts.ts:203` (`upsert_agreement_parts`), `:247` (`discard_agreement_parts`) | |
| Send | `apps/designer-portal/src/hooks/use-commercial-documents.ts:674-720` | `useSendServiceAgreement` → RPC `send_commercial_document` (`:688`) → edge function `proposal-send` (`:700`) |

### The `Preview client copy` sheet

`agreement-composer.tsx:972-978`:

```
<DocSheet open={previewOpen} onClose={…} title="Client copy preview">
  <ServiceAgreementPreview {...previewProps} />
</DocSheet>
```

`DocSheet`'s default width is `max-w-[640px]`
(`apps/designer-portal/src/components/document/overlays/doc-sheet.tsx:377`; the
`wide` variant is `max-w-[760px]`, documented at `:219`). The paper's own
measure is `max-w-[720px]`
(`.../commercial/service-agreement-preview.tsx:101`). **No full-page proof
route exists** — the composer's only two ways to see the paper are the 320px
aside and this 640px sheet.

The act is labelled `Preview client copy`; the sheet's own title is `Client copy
preview`.

### Same body, both surfaces

`.../commercial/service-agreement-preview.tsx` (291 lines) renders through
`.../commercial/agreement-parts-body.tsx` (594 lines), the same body contract
the client portal's `commercial-document-shell.tsx` uses (R27, R51). Copy
constants are `packages/types/src/agreement-copy.ts`.

### Tests

19 Jest suites under
`apps/designer-portal/src/components/document/rooms/drafting/agreement/__tests__/`
(plus `__snapshots__/`): `add-part-sheet` · `agreement-composer` ·
`agreement-composer-design-build-off` · `agreement-composer-library-off` ·
`agreement-composer-library-on` · `agreement-composer-turnkey` ·
`authority-chip` · `client-visibility` · `draw-ledger` · `no-double-count` ·
`part-editor` · `part-history-strip` · `part-kinds` · `parts-rail` ·
`readiness` · `readiness-turnkey` · `save-as-template-action` ·
`template-picker-sheet` · `turnkey-editors`.

Playwright: `apps/designer-portal/e2e/agreement/agreement-parts.agreement.pw.ts`
and `design-build.pw.ts`, under
`apps/designer-portal/playwright.agreement.config.ts`.

---

## §3 · The send sheet and the return act

### The send sheet

`apps/designer-portal/src/components/document/commercial/service-agreement-send-sheet.tsx`
(215 lines). It is a `DocSheet` at the default 640px, its content capped at
`mx-auto max-w-xl` (`:98`).

| Slot | Line | Text (verbatim) |
|---|---|---|
| Sheet title | `:96` | `Send design agreement` (design-build: `Send design-build agreement`) |
| Eyebrow | `:99-101` | `Yes to the designer` |
| Heading | `:102-103` | `Send for the client signature` |
| Consequence paragraph | `:105-112` | see below |
| Recipient block | `:114-121` | label `Recipient`; value = the client email or `No client email linked` |
| Furnishings deposit block | `:125-135` | `No furnishings deposit set — authorizations will default to 50%.` or `` `Furnishings deposit · ${percent}% on each authorization` `` |
| Notes | `:138-146` | `readiness.notes`, on a golden-hour left rule |
| Ready line | `:151-154` | `Ready to send · every contractual facet is present.` |
| Not-ready block | `:155-166` | head `Finish before sending`, then `readiness.blockers` |
| Optional note | `:168-177` | label `A note to the client · optional`; placeholder `A short personal note to accompany the agreement.` |
| Offline act | `:189-195` | `Record a signature received outside Patina` (a plain underlined text button, 12px) |
| Dismiss act | `:200-202` | `Send later` (ghost) |
| Send act | `:203-209` | `Send agreement →`, `disabled={!readiness.ready}` at `:205` |

The consequence paragraph, `:105-112`, verbatim (the design-services arm):

> `{recipientName} receives` **or** `The client receives` — `the services,
> rates, retainer policy, billing cadence, ceiling, and terms. Their signature
> preserves consent; the agreement still awaits the studio countersignature
> before work is authorized.`

The design-build arm of the same sentence (`:108`): `the price, the schedule of
values, the draw schedule, the allowances, who is doing the work, and the
terms.`

The code comment at `:148-150` records W3R2-17: a sheet carrying a caution
carries only the caution, never `every contractual facet is present` alongside a
warning.

### The return act

Label, verbatim from `packages/types/src/agreement-copy.ts:46`:

> `returnToFacets: "Return to the seven facets"`

Two other constants from the same file bear on this room:

- `:38` — `notYetSet: "Not yet set"` (R21; the doc comment at `:28-37` records
  that `proposal_service_terms.retainer_amount_cents` is `NOT NULL DEFAULT 0`,
  so the first composed agreement always carries a retainer part reading
  `{ cents: 0 }`).
- `:54-55` — `composedElsewhere: "This agreement is composed from parts. It is
  edited in the Contract Room with parts on, where it can also be returned to
  the seven facets."`

The act is a `variant="secondary"` button in the header row
(`agreement-composer.tsx:747-754`). Pressing it calls `returnToFacets()`
(`:637-648`), which awaits `discard.mutateAsync()` and then
`onReturnToFacets?.()`. **There is no confirm step, no consequence sentence
above it, and no undo.** On failure it writes `The agreement could not be
returned to the seven facets.` into the save-note line.

### The seven-facet room it returns to

`service-agreement-drafting-room.tsx`. Header count at `:343` —
`` `${Math.max(0, completed)} of 7 facets written` ``. Layout at `:436` —
`min-[1180px]:grid-cols-[minmax(0,1fr)_380px]`. Seven literal `<AgreementFacet>`
renders at `:438`, `:471`, `:491`, `:546`, `:625`, `:664`, `:686`. The R17
sentence `AGREEMENT_PART_COPY.composedElsewhere` renders at `:418-425`.

---

## §4 · The three flags

| Flag | Read at | Gates |
|---|---|---|
| `agreement-parts` | `service-agreement-drafting-room.tsx:102-103` | Whether the Contract Room opens the **composer** at all. Off → the seven-facet room. Fail-closed: `useFeatureFlag` starts `{ value: false, isLoading: true }` and the room holds on `AgreementGate` while it answers (`:108-112`). Merely opening the composer materializes the nine standard parts. |
| `agreement-library` | `agreement-composer.tsx:162-164` | `libraryOn`. Gates the studio Library and Template acts — `+ Add a part` opening the Library sheet vs the plain add menu, `Start from a template…`, `Save as template`, `Keep in the Library`, the part-history strip (`agreement-composer.tsx:856`), and the authority chip on schedule rows (`parts-rail.tsx:315-320`). |
| `design-build` | `agreement-composer.tsx:173-175` | `designBuildOn = libraryOn && designBuildFlag && !designBuildLoading` — **nested inside `agreement-library`**. Gates the turnkey class: the `Hidden from your client` toggle (`agreement-composer.tsx:869-884`), the hidden sub-label in the rail (`parts-rail.tsx:341`), jurisdiction attachments, the draw ledger, lien-waiver attachments, and the trade-agreements strip. `turnkeyFrozen` (`:250`) and `turnkeyOn` (`:295`) both derive from it. |

All three are live at 100% in production.

---

## §5 · The readiness model

`apps/designer-portal/src/components/document/rooms/drafting/agreement/readiness.ts`
(584 lines).

### What "needs attention" means

`partsNeedingAttention(readiness)` at `:548-553` counts **distinct parts
carrying at least one blocker**. Its doc comment (`:541-547`) records that the
client-account blocker is excluded because it is not about a part — the same
exclusion the seven-facet counter makes.

The count is rendered twice:

- In the RoomShell bar: `agreement-composer.tsx:703`.
- In the aside's `ReadinessPanel`: `agreement-composer.tsx:1048-1050`, as
  `font-mono text-[11px] font-semibold uppercase tracking-[0.1em]
  text-[var(--color-aged-oak)]` — `{needAttention} of {total} parts need
  attention`.

Blockers are split three ways:

| Function | Line | Renders where |
|---|---|---|
| `partsNeedingAttention` | `:548` | the count, twice |
| `blockersForPart` | `:566-577` | inside the editor, for the selected part (`agreement-composer.tsx:867`) |
| `documentBlockers` | `:580-584` | the aside list (`agreement-composer.tsx:916-918` → `ReadinessPanel` `:1051-1057`) |

`blockersForPart`'s doc comment (`:558-565`) records why it exists: the panel
prints only blockers belonging to no part, and the rail marks a held row with
the bare words `needs attention`, so a part-scoped sentence was authored,
attached, and rendered nowhere.

The rail's mark comes from `blockedIds` (`agreement-composer.tsx:320-326` →
`parts-rail.tsx:349-353`).

### The fee set vs the authority set

**The fee set** — what satisfies the fee floor. The blocker fires when
`!turnkeyFloor && !namesAFee && hiddenFees.length === 0`
(`readiness.ts:487-492`). The sentence, verbatim at `:490`:

> `This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.`

For a `design_build` document the turnkey floor substitutes: its typed money
part is the pricing basis, and the exemption holds only when the turnkey floor
was itself asked (`:480-486`).

**The authority set** — which variants project into
`proposal_service_terms` / the billing authority. Declared by
`authorityStanding()`, `schedules/index.ts:52-65`:

| Standing | Label (`schedules/index.ts:67-71`) | Variants |
|---|---|---|
| `authority` | `creates authority` | the `AUTHORITY_VARIANTS` set — rate_card, ceiling, retainer, cadence, flat, per_phase |
| `deposit-only` | `creates authority · deposit only` | `procurement` (its deposit percent alone; markup basis, freight and terms of sale are prose) |
| `record-only` | `record only` | everything else |

Record-only parts carry one line of help, `schedules/index.ts:75-76`:

> `This is recorded on the agreement. It does not create billing authority yet.`

### The other sentences on record

| Sentence | Where |
|---|---|
| `This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.` | `readiness.ts:490` |
| `This fee is hidden from your client, so it cannot bill.` | R33's readiness copy |
| The ceiling rule — a ceiling is required exactly when a rate card is present and real | `readiness.ts:494-500` (comment), R4 / R-6 |
| `Ready to send · every contractual facet is present.` | `service-agreement-send-sheet.tsx:153` |
| `Finish before sending` | `service-agreement-send-sheet.tsx:158` |

`ReadinessPanel` itself is `agreement-composer.tsx:1032-1066`: an
`aria-label="Agreement readiness"` section on a top rule, the count line, the
document-blocker `<ul>` at 12px, and a notes `<ul>` at 11.5px italic.

---

## §6 · Known open items on record

Written before the panel reads it, so a seat can mark its own findings *new* /
*known* / *touches*.

| # | Item | Evidence |
|---|---|---|
| 1 | **N4 — the send sheet still speaks in facets.** A fixed seven-item enumeration on a composition that no longer carries all seven; `facet` in a room where R7 says the unit is a Part; the homeowner's door carries the same fixed enumeration. Recorded fix: build both sentences from the composition's own client-visible parts, say "part", de-duplicate the deposit note. | `artifacts/agreement-composed-2026-09-06/build/waves/w1/walk-web-r2.md:444-467`; live at `service-agreement-send-sheet.tsx:105-112` and `:153` |
| 2 | **W3R3-03 — hiding a fee moves the readiness count with no sentence explaining why.** The reason is present one layer down, in the send sheet. Carried to the main backlog. | `artifacts/agreement-composed-2026-09-06/build/PROGRAM-REPORT.md:279`; `.../build/rulings-2026-09-06.md:99` |
| 3 | **W3R2-06 — the turnkey room keeps design-services chrome.** The `DESIGN_BUILD_COPY` room title/eyebrow/subtitle landed (commit `c40986b74`); **the rename affordance did not** — `proposals.title` has no rename RPC and the composer has no field for one, so a stale title still reaches the keepsake footer. | `.../build/waves/w3/wave-report.md:173` and `:184` |
| 4 | **Aged-oak contrast on `The client's copy · live`.** The label is `text-[var(--color-aged-oak)]` (`agreement-composer.tsx:962`) on the card's `bg-white` (`:961`). `--color-aged-oak: #8B7355` — `apps/designer-portal/src/app/globals.css:13`. Measured 4.48:1. Carried to the main backlog with the viewport meta. | `.../build/rulings-2026-09-06.md:99` |
| 5 | **M5 — the rail was empty on first open (dev only).** A fresh Contract Room called `materialize.mutate(undefined, { onSuccess })`; React Query v5 drops inline callbacks when the observer unmounts first, and `reactStrictMode: true` unmounts once on mount, so the nine seeded rows did not paint until a reload. Confirmed dev-only — a production build painted all nine on first open. Closed as W-01 in Wave 2; the rail now renders from the invalidated query. | `.../build/PROGRAM-REPORT.md:300` |
| 6 | **Two body renderers, unmerged.** A SQL keepsake renderer and the TSX component renderer both draw the agreement body. First recorded in Wave 1 and recurring at every later wave; two open minors (M4 `Contract price` on a `cost_plus` prime, N-i an unset draws part saying `Recorded with your agreement.` where R21 rules it should say nothing) need one ruling covering both. | `.../build/PROGRAM-REPORT.md:221` and `:265` |
| 7 | **No confirmation on the return act.** `Return to the seven facets` calls `discard_agreement_parts` directly. | `agreement-composer.tsx:747-754` → `:637-648` |
| 8 | **The `disabled` attribute on `Saved` and `Send agreement →`.** Both use the native attribute, not `aria-disabled` with a visible reason. | `agreement-composer.tsx:759`; `service-agreement-send-sheet.tsx:205`. The RoomShell action `Review & send` also takes `disabled` at `agreement-composer.tsx:712`, and the `Hidden from your client` checkbox takes `disabled={readOnly}` at `part-editor.tsx:120` |

---

## §7 · Local plates

Local production-build renders of this room **may** exist under
`../shots/current/` — 1440 / 1024 / 390, resting, a clause mid-edit, a money
part carrying the fee-floor blocker, the Preview sheet, the send sheet, and the
seven-facet room after Return. The shot ledger is `../shots/README.md`.

At the time this briefing was written, `../shots/tools/` held `capture.mjs` and
`seed-draft.mjs`, `../shots/current/` was empty, and `../shots/README.md` did
not yet exist. Local capture was time-capped and may have fallen back to the
screenshot alone; the ledger, if present, says which.

**Where a local plate and `kody-screenshot.png` disagree, Kody's screenshot is
the authority.** It is production; the plates are a local build with flags
inlined and seeded fixture data. Shots are not committed.
