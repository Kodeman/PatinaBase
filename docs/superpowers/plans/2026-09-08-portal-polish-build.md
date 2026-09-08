# Portal Polish — Build Plan (three waves: amendments + backend → the house page → the Desk)

> **For agentic workers:** each lane gets its own worktree `.codex/worktrees/agent-pp-<lane>` on branch
> `portal-polish/<lane>` cut from `origin/main`; explicit pathspecs only; Conventional Commit; push the
> lane branch; then a **separate** reviewer in a fresh context; a fix round; then the wave's integration
> lane merges onto `portal-polish/integration`. Lane reports go to
> `artifacts/portal-polish-build-2026-09-08/waves/w<N>/<lane>-impl.md` (durable path), never only the
> scratchpad. Every agent's FINAL action is its structured report — even when steps failed.

**Spec of record:** `docs/superpowers/specs/2026-09-08-portal-polish-build-design.md`.
**Visual truth:** `artifacts/portal-polish-review-2026-09-08/specimens/` — `SPEC.md` §A as amended by §F
(Lane A1 copies it to `docs/design/house-sheet/SPEC.md`; after A1 lands, cite the `docs/` path), and the
three built specimens `client-house.html`, `designer-desk.html`, `decision-moment.html`.
**Rulings:** `artifacts/portal-polish-review-2026-09-08/rulings.md` PP-1…PP-9 (Kody, 2026-09-08).

**Rulings (Kody 2026-09-08):** everyone gets it, **no feature flag**; the whole house page runs as one
program (PP-8); amend the governance rulings **before** any UI lane starts (PP-6); the Desk keeps its
wordmark (PP-9); no dwell timer; the mobile bar's colour and identity block stay as built. Prod
mutations are authorized by "deliver this entire program to prod" — migration, both portals, no
per-step re-asking.

**Deploy path:** `./infra/deploy-portal.sh client` (Worker `patina-client-portal`) and
`./infra/deploy-portal.sh designer` (Worker `patina-designer-portal`); migrations `supabase db push` to
Strata (linked, ref `bkvcixdmuyejfzcijpdg`). Next migration number **00580** (head is
`00579_trade_agreements.sql` — **re-check at merge time**; a parallel program may have minted 00580).

---

## Global constraints (every lane)

- **The sheet is the target.** Seven type steps plus `.t-money`; 24px module; three radii (2px, 3px,
  50% for marks only); three paper stocks; state pigments only. **No new hex literal outside the
  sheet.** No shadows. No pills, badges, status dots, ✓ glyphs, spinners, green success fills, olive.
  No truncation — wrap. A region with nothing to say renders nothing.
- **Absence is silence.** Never guess, never print an error string as content, never a `$0` placeholder,
  never copy that later reverses.
- **No anchor id is renamed.** `#doorstep #key #letterbox #wall #door #road #note #previously #mat
  #mat-papers #ledger #approval-<id> #room-<roomId>` are load-bearing for the middleware 308 map and
  `docs/design/the-client-page/README.md:102-118`. Ids may be **added** (`#changed`); none is renamed.
- **Nothing opens a route.** Everything opens in place.
- Types from `@patina/types` / generated `database.types.ts`. Hooks from `@patina/supabase`; a new hook
  is added only when none exists, exported from the barrel, with a vitest.
- Tests ship with every new file. Client jest floor 70/60/70/70 (`apps/client-portal/jest.config.js:71-78`).
- **Commits:** pathspec-restricted, never `git add -A`, never touch `main` from a lane.
- **Sandbox:** `git worktree add`, `pnpm install`, the Supabase CLI, Chromium and `git push` need the
  Bash sandbox disabled — retry per command on a sandbox error.
- **No lane resets the database or starts a dev server.** See *Shared-state ownership*.
- **Verify `NEXT_PUBLIC_SUPABASE_URL` is `127.0.0.1`** before any destructive local action —
  `apps/*/.env.local` has pointed at Strata prod before.

---

## Shared-state ownership

| Resource | Owner | Rule |
|---|---|---|
| `supabase db reset`, seeds, `pnpm db:generate` | **Wave 1, Lane A2**, then each wave's **integration lane** | No H or D lane resets the DB. Lanes run jest only. |
| Port **3002** (client dev server) | **Wave 2 integration lane** | H lanes never start a dev server. Renders and e2e happen at integration. |
| Port **3000** (designer dev server) | **Wave 3 integration lane** | D lanes never start a dev server. |
| Strata (`supabase db push`, `functions deploy`) | **Wave 1 ship step** only | W2 and W3 deploy portals only; no further migration. |
| `packages/supabase/src/hooks/index.ts` | **Lane A2** only | D6 and H5 consume the hook; neither edits the barrel. |
| `packages/supabase/src/database.types.ts` | **Lane A2** only | Committed as a diff by A2; every later lane rebases onto it. |
| `docs/design/house-sheet/SPEC.md` | **Lane A1** only | Verbatim copy; never re-edited by a build lane. |
| Governance logs (`DECISIONS.md`, `VISION-DECISIONS.md`, designer `CLAUDE.md`) | **Lane A1** only | Append-only; a build lane that wants a rule changed reports it, it does not write it. |
| `supabase/migrations/00580_room_concept_render.sql` | **Lane A2** only | Re-check the head number at merge time. |

---

## Copy strings that tests pin

Change one of these and the named test fails by design — update the test in the same lane.

| String | Pinned at | Lane | Becomes |
|---|---|---|---|
| `Leave the house` | `components/threshold/__tests__/mat.test.tsx:194`; `mat.tsx:166` | H1 | `Sign out` |
| `Prepared by {studio} · Sent through Patina` | `app/pay/[token]/invoice-sheet.tsx:895`, `settling-sheet.tsx:130` | H1 | unchanged text, one shared `<Colophon>` |
| `prepared for` | `components/threshold/__tests__/doorplate.test.tsx` | H1 | unchanged — H1 **adds** an absent-name assertion |
| `Ask for a change` | mat / threshold / scope-change-ask tests | H1 | unchanged; still exactly once per mat |
| `Open the letterbox` | `components/threshold/__tests__/letterbox.test.tsx` | H6 | unchanged |
| en-US dates (`September 11`) | letterbox, house-ledger (`owedDueLine`), earlier-invoices, road-orders, spine-toll, making-spine, approval-ask, ground-floor, standing-sentence, tracking-row | H6 | `legalDate` / `dayMonth`, en-GB |
| en-GB dates | the-note, correspondence, door-acts, previously, story-pole, door-gate, wall-gate, signature-line, scope-change-ask, review-ask, `derive.ts` `DAY_MONTH:269` | H6 | routed through the same helper |
| `/accept/i` | `components/threshold/__tests__/wall-gate.test.tsx` | H4 | label becomes `Accept the finished work · $X` — regex still matches; assert the amount too |
| Story-pole / threshold / e2e copy | `apps/client-portal/tests/threshold.spec.ts` | W2 integration | add: `Sign out`, the landmark ledger, the consequence sentence |
| `retiredChrome` variant table | `apps/designer-portal/src/components/document/__tests__/document-action.test.tsx:29-105` | A1 | add a `terminal` row, `retiredChrome` = none |
| `One thing is overdue — Vandersteen.` | `components/document/desk-roster.test.tsx:16`; `lib/document/__tests__/desk-roster-derivation.test.ts:158` | D1 | unchanged as `overdueLine`; D1's day's line is a **new** rendering of it |

---

# WAVE 1 — Amendments and backend

Two lanes, parallel. Ships a docs commit, migration 00580 pushed to Strata, and a regenerated
`database.types.ts`. **No UI lane starts until A1 has merged** (PP-6: build starts on amended rules).

## Lane A1 — Governance amendments + the house sheet's canonical home

**Goal.** Bring the rules back on. Append the amendments PP-6 requires so every later lane cites a rule
that already says what it is doing, and give the house sheet a home outside `artifacts/`.

**Files (only these).**
```
docs/design/house-sheet/SPEC.md                                    (new — verbatim copy)
docs/design/the-document/DECISIONS.md                              (append only)
docs/vision/VISION-DECISIONS.md                                    (append only)
apps/designer-portal/CLAUDE.md
apps/designer-portal/src/components/document/__tests__/document-action.test.tsx
```

**Steps.**
1. `cp artifacts/portal-polish-review-2026-09-08/specimens/SPEC.md docs/design/house-sheet/SPEC.md` —
   **byte-identical**, §F included. Do not edit, reflow or summarize it.
2. `DECISIONS.md` — append five entries, each `### R<n> · <title> — 2026-09-08` (H3), each ending with
   its sentinel `*Entries add: R<n> · last id = R<n>*`, each citing `rulings.md` PP-n and the deck.
   Last existing ids: **R138** (`:10749`, sentinel `:10757`), **I152** (`:10220`, adjust entry `:10577`).
   - **R139 amends I107** (`:6584-6611`): the tertiary rest rule is unconditional at ≥3:1
     (`--color-aged-oak #8B7355`, 4.20:1); a fourth `terminal` tier exists — filled charcoal, paper
     text, the amount in the label — used **only** where money moves or a paper is signed; the
     two-score secondary is unchanged; `/pay/<token>`'s Pay act joins the tier rather than keeping its
     own grammar. Cite PP-3, IX02/IX03/IX04/IX10/B01.
   - **R140 amends R126** (`:9981-10108`): the seven-step scale plus the 15px money step is the type
     contract; plate sizes 96–120px above a value threshold; the owed figure outranks the agreed
     figure. **Colour-at-three-sites (`:9992`) and the elevation clause (`:10023-10036`) are unchanged.**
     Cite PP-2, PP-4, PP-5.
   - **R141 amends R135** (`:10701-10722`): the landmark ledger under the doorplate is page furniture,
     not a header — R135's refusal at `:10717` is not reopened; "Sign out" replaces "Leave the house";
     the colophon is page furniture on client surfaces; a consequence sentence stands above every
     terminal act. `--color-error` **stays forbidden**: remove the token from client
     `globals.css:58` if `.da-danger:hover` (`:373-375`) is its only consumer, else re-point that hover
     to `--color-terracotta-ink` — state which, from a grep, in the entry. Cite PP-1, PP-3, PP-5.
   - **R142 · the client imagery doctrine**: the source hierarchy enforced by caption; studio-uploaded
     concept renders labeled on-image "Concept · not installed" at ≥14px, permitted to lead a room band
     when no installed photograph exists; **never** stock, gradients, procedural fills or generated
     rooms; the eleven-pixel rendered floor on drawn geometry. Extends **R107** (the Room View entry at
     `:3765`; note in passing that a second `### R107` exists at `:8044` — the fidelity ladder — and say
     which one this extends). Cite PP-4, PP-7, VC-38/39/40/44/45, C01.
   - **I153 · the house sheet**: `docs/design/house-sheet/SPEC.md` is the type and rhythm contract for
     both portals, applied surface by surface as each is touched. Names the seven steps, `.t-money`,
     the 24px module, three radii, three stocks, the state pigments. Sentinel `last id = I153`.
3. `VISION-DECISIONS.md` — append `## Ruled — 2026-09-08 (portal polish)` then **V9**, in V8's shape
   (`:106-138`): bold **Question / Decision / Consequence for … / Source** labels, closing sentinel
   `*Entries add: C1 · S1–S6 · V1–V7 · V8 · V9 · last id = V9*`. Content: the five principles as ruled
   PP-1…PP-5; **P1 binds client pages only** (PP-1/PP-9 — the Desk keeps its PATINA wordmark and footer
   identity); PP-7's concept renders; rules are back on. State plainly **what this does not license**:
   shadows, badges, dashboards, engagement metrics. Source: Kody, 2026-09-08, `rulings.md`, the deck,
   `synthesis.md`.
4. `apps/designer-portal/CLAUDE.md` — three surgical edits: the **D4** line (`:21`) notes R126's one
   token and that nothing in this program adds depth; **typography-first** (`:23`) references
   `docs/design/house-sheet/SPEC.md`; the **success criterion** (`:48`) is reworded to end
   "…a shadow, a zone, a badge, or a dashboard; the only filled control she ever sees is a terminal act
   where money moves or a paper is signed."
5. `document-action.test.tsx:29-105` — add one row to the `VARIANTS` table:
   `{ variant: 'terminal', retiredChrome: <none> }`. Every other row is unchanged. The row exists so the
   fill that is retired chrome for `primary` is recorded as correct grammar for `terminal` in exactly
   one place.

**Tests to add/update.** Only `document-action.test.tsx`. `shadow-gate.test.ts`, `contrast.test.ts` and
`rail-stock.test.ts` are **not edited** and must stay green — the eslint shadow gate stays, because no
depth was adopted.

**Gate.**
```
pnpm --filter @patina/designer-portal test -- src/components/document/__tests__/document-action.test.tsx \
  src/lib/document/__tests__/shadow-gate.test.ts src/lib/document/__tests__/contrast.test.ts \
  src/components/document/__tests__/rail-stock.test.ts
git diff --stat   # exactly the five files above
```
The `terminal` row will fail until Wave 3's D4 adds the variant — that is expected and correct; A1 marks
it `test.todo`/skipped **with the reason in the test name**, and D4 un-skips it.

**Review checklist.** No past entry edited (diff is append-only in both logs). Sentinel lines advanced in
both. H3 heading level correct in both. Every entry dated 2026-09-08 and citing a PP-n. `SPEC.md` copy is
byte-identical (`diff` it). R140 leaves the colour and elevation clauses of R126 alone. V9 says what it
does not license. CLAUDE.md keeps the shadow ban intact.

**Report:** `artifacts/portal-polish-build-2026-09-08/waves/w1/a1-impl.md` (`-review.md`, `-fix.md`,
`-rereview.md`).

---

## Lane A2 — Concept render backend (PP-7)

**Goal.** Four nullable columns, a private bucket, a widened RPC, one hook — so Wave 2 can render a
concept render and Wave 3 can upload one.

**Files (only these).**
```
supabase/migrations/00580_room_concept_render.sql
supabase/tests/rls/room_concept_render_test.sql
supabase/seed/*                                          (only if a fixture render is needed)
packages/supabase/src/hooks/use-room-concept-render.ts
packages/supabase/src/hooks/__tests__/use-room-concept-render.test.ts
packages/supabase/src/hooks/index.ts
packages/supabase/src/database.types.ts                  (generated)
apps/client-portal/src/lib/threshold/derive.ts           (map onto RoomBandModel.conceptRender)
apps/client-portal/src/lib/threshold/__tests__/derive.test.ts
```

**Steps.**
1. **Read `supabase/migrations/00578_design_build_kind.sql:3451` first** — that is the current body of
   `get_client_project_threshold` (lineage banner at `:27`: 00565:447 → 00578). Copying 00565's body
   silently reverts four days of design-build work.
2. Confirm the head number: `ls supabase/migrations | tail -3`. Head at planning time is
   `00579_trade_agreements.sql`; if another program minted 00580, take the next free number and say so
   in the report.
3. Write `00580_room_concept_render.sql` per patina-db-migrations (hand-numbered, banner naming intent
   and lineage, idempotent, additive):
   - `alter table public.project_rooms add column if not exists concept_render_url text, add column if
     not exists concept_render_caption text, add column if not exists concept_render_uploaded_at
     timestamptz, add column if not exists concept_render_uploaded_by uuid references auth.users(id)`.
     All nullable — no default, no backfill, no destructive step.
   - Bucket `room-renders`, **private** (`public = false`), with a file-size limit and
     `allowed_mime_types` of jpeg/png/webp. Follow the `INSERT INTO storage.buckets … ON CONFLICT`
     idiom already used by `00234_capture_media_bucket.sql` / `00116_comms_attachments_bucket.sql`.
   - Storage policies keyed on the object name's first two path segments
     `<project_id>/<room_id>/…`: studio members of the project may `insert`/`update`/`delete`;
     project clients **and** studio members may `select`. Reuse the existing predicates —
     `app_private.is_project_studio_member` and `app_private.is_project_client` (00565) — never
     redefine them.
   - **Verify** that the four new columns are covered by the existing `project_rooms` policies (read
     the policies; do not assume). If a column-level grant is needed, add it in this file and say so.
   - `CREATE OR REPLACE FUNCTION public.get_client_project_threshold` from the 00578 body **verbatim**,
     with the four fields added to the rooms payload (`conceptRenderUrl`, `conceptRenderCaption`,
     `conceptRenderUploadedAt`, `conceptRenderUploadedBy`). Re-state the grants in the 00578 form.
     Diff old body against new body and confirm the only change is the four keys.
4. `supabase/tests/rls/room_concept_render_test.sql`: a studio co-member can write under its own
   project prefix; another studio cannot; the project client can select but not insert; a stranger sees
   zero rows; `get_client_project_threshold` emits the four keys for the seeded project and **still**
   emits every key it emitted before (assert the full key set, not just the additions).
5. `use-room-concept-render.ts`: upload to `room-renders` at `<projectId>/<roomId>/<filename>` via
   `supabase.storage`, then update the row's four columns; on success invalidate
   `['project-rooms', projectId]` and the threshold query key. Export from `hooks/index.ts`. Vitest
   covers: upload path composition, the row update payload, both invalidations, and the error path
   (a failed upload never writes the row).
6. `derive.ts`: map the four fields onto `RoomBandModel.conceptRender` (`{ url, caption, uploadedAt,
   uploadedBy }` or `null`). Pure mapping only — no rendering; H5 renders it.
7. Regenerate and commit types:
   `export SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres && pnpm supabase:reset
   && pnpm db:generate`, then commit `packages/supabase/src/database.types.ts`.

**Gate.**
```
pnpm supabase:reset                                   # green
psql "$SUPABASE_DB_URL" -f supabase/tests/rls/room_concept_render_test.sql
<the repo's SQL test runner>                          # 154+ SQL tests green
pnpm db:generate && git diff --stat packages/supabase/src/database.types.ts   # non-empty, committed
pnpm --filter @patina/supabase type-check && pnpm --filter @patina/supabase test
pnpm --filter @patina/client-portal type-check
```

**Review checklist.** The RPC body came from 00578 and the diff is exactly four keys. Every DDL step is
additive and nullable. The bucket is private. Policies scope by `<project_id>/<room_id>` and reuse the
existing predicates. No trade cost or vendor pricing enters the client payload. The hook never writes
the row when the upload fails. `database.types.ts` is committed.

**Report:** `artifacts/portal-polish-build-2026-09-08/waves/w1/a2-impl.md` (+ `-review`, `-fix`,
`-rereview`).

---

## Wave 1 integration, gates and ship

**Integration order:** A1, then A2 (disjoint file sets; A1 first so the amended rules are on the branch
every later wave cuts from).

**Wave gates.**
```
pnpm supabase:reset && <SQL suite>                    # green
pnpm --filter @patina/supabase type-check && test
pnpm --filter @patina/client-portal type-check
pnpm --filter @patina/designer-portal type-check && test -- --ci
pnpm --filter @patina/admin-portal build               # a shared package was edited
git diff --exit-code packages/supabase/src/database.types.ts   # after a fresh db:generate
```

**Deploy (Strata only — no portal ships in W1).**
```
supabase migration list --linked                       # confirm 00579 applied, 00580 pending
supabase db push
supabase migration list --linked                       # 00580 applied
```
Then object probes on Strata: `project_rooms` has the four columns; `storage.buckets` has `room-renders`
with `public = false`; `jsonb_object_keys` of `get_client_project_threshold(<a real project>)`'s rooms
payload contains the four keys **and** every key it carried before.

**Rollback.** A migration is not rolled back. A defect in 00580 is corrected by 00581. The columns are
nullable and unread until Wave 2 ships, so a defective 00580 is inert in prod.

**Ship report:** `artifacts/portal-polish-build-2026-09-08/ship/w1-ship.md`.

---

# WAVE 2 — The house page (client portal)

Six lanes in parallel worktrees. Everything lands in `apps/client-portal`. Deploys to
`patina-client-portal`.

**Lanes that share a file — resolved by ownership, then by order:**

| File | Lanes | Resolution |
|---|---|---|
| `app/globals.css` | **H2** (tokens + type steps) and **H4** (action tiers) | H2 owns the `:root` token block and the `.t-*` classes; H4 owns the `.da-*` / Scored Ink block **only** (from `:193`). Neither touches the other's region. Integrate H2 → H4. |
| `components/threshold/threshold.tsx` | **H3** (landmark ledger, `sections` array `:1254-1264`) and **H5** (room band props) | H3 owns the `sections` array and the ledger mount; H5 owns the band's props. Integrate H3 → H5. |
| `components/threshold/wall-gate.tsx`, `door-gate.tsx` | **H4** (tier + consequence) and **H6** (dates) | H4 first; H6's sweep rebases over it. |
| `components/threshold/letterbox.tsx` | **H6** only (money + dates) | H4 does not touch it; the letterbox's Pay act is H6's, built on H4's variant. |
| `instruments/tracking-row.tsx`, `room-band.tsx` | **H5** only | |
| `app/pay/[token]/invoice-sheet.tsx` | **H1** (colophon extraction, `:895`) and **H4** (Pay act, `:773`) | Different regions of one file. Integrate H1 → H4. |

**Integration order (sequential, tests re-run after each merge):**
**H2 → H1 → H4 → H3 → H5 → H6.**
Tokens and type steps first so every later lane's classes resolve; H1's colophon extraction before H4
touches the same file; H4's tiers before H3/H5/H6 build acts on them; H6's date sweep last so it rebases
over every string every other lane wrote.

---

## Lane H1 — Letterhead, colophon, the mat (PP-1)

**Goal.** The studio is the author and Patina is the press: the page opens with the studio's identity
and closes with a colophon, and the way out is called "Sign out".

**Files.**
```
apps/client-portal/src/components/threshold/instruments/colophon.tsx                 (new)
apps/client-portal/src/components/threshold/instruments/__tests__/colophon.test.tsx  (new)
apps/client-portal/src/components/threshold/mat.tsx
apps/client-portal/src/components/threshold/__tests__/mat.test.tsx
apps/client-portal/src/components/threshold/__tests__/doorplate.test.tsx
apps/client-portal/src/components/threshold/the-note.tsx
apps/client-portal/src/components/threshold/__tests__/the-note.test.tsx
apps/client-portal/src/components/threshold/threshold.tsx        (mount <Colophon> after the mat — this line only)
apps/client-portal/src/app/pay/[token]/invoice-sheet.tsx         (:895 region only)
apps/client-portal/src/app/pay/[token]/settling-sheet.tsx        (:130 region only)
```

**Steps.**
1. `colophon.tsx` — one component, `Prepared by {studioName} · Sent through Patina`, `.t-meta` in
   `--ink-faint`, left-aligned, 24px under a hairline. Renders **nothing** when `studioName` is absent.
2. Replace the inline phrase at `invoice-sheet.tsx:895` and `settling-sheet.tsx:130` with `<Colophon>`.
   The rendered text is byte-identical; only the source moves.
3. Mount `<Colophon>` in `threshold.tsx` after the mat.
4. `doorplate.tsx` is **unchanged in structure** and `useStudioIdentity` (via `threshold.tsx:279`) stays
   the source. Where `user?.name` is absent the right slot already prints nothing — **pin it with a
   test** in `doorplate.test.tsx` so "PREPARED FOR CLIENT USER" can never return.
5. `mat.tsx`: "Leave the house" → **"Sign out"** (`:166`). Drop any column heading whose column has no
   rows. Keep the mat's house-wide "Ask for a change" **exactly once**.
6. `the-note.tsx`: the studio note signs full name · studio · date at `.t-authorship`. Find where the
   signature renders and change it there; do not add a second signature.
7. **Assert no PATINA wordmark** on the Threshold — a test that scans the rendered tree for the
   wordmark and fails if it appears. None exists today; this keeps it that way.

**Tests.** `colophon.test.tsx` (renders the phrase; renders nothing with no studio). `mat.test.tsx:194`
updated to `Sign out`; a heading-with-no-rows case; "Ask for a change" appears once.
`doorplate.test.tsx` gains the absent-name case. `the-note.test.tsx` asserts the three-part signature.
A wordmark-absence test.

**Gate.**
```
pnpm --filter @patina/client-portal type-check
pnpm --filter @patina/client-portal test -- src/components/threshold
npx eslint apps/client-portal/src/components/threshold apps/client-portal/src/app/pay   # 0 NEW errors
```

**Review checklist.** The colophon phrase is unchanged in all three renderings. Nothing else in
`invoice-sheet.tsx` / `settling-sheet.tsx` moved. `doorplate.tsx` is untouched. "Sign out" is reachable
and still calls `onSignOut` — the mat is the only exit, and a mat without it traps the client.
No wordmark added. No route changed.

**Report:** `…/waves/w2/h1-impl.md` (+ `-review`, `-fix`, `-rereview`).

---

## Lane H2 — House-sheet tokens and the seven type steps (client)

**Goal.** Give the client portal the tokens and named type classes the other five lanes will use, without
renaming anything ~90 files already read.

**Files.**
```
apps/client-portal/src/app/globals.css                          (:root token block + a new .t-* block ONLY)
apps/client-portal/src/app/__tests__/house-sheet-tokens.test.ts  (new)
```

**Steps.**
1. Add the four tokens the client portal lacks: `--paper-doc #FCFAF6`, `--rail #E8E3DB`,
   `--ink-subtle #5A4E43`, `--sage-ink #5F6B57`. (Verified: the other twelve sheet hexes are already
   present under the portal's own names.)
2. Add **aliases**, never renames: `--oak: var(--color-aged-oak)` (or the client's equivalent
   `#8B7355`), `--ink-faint: var(--color-quiet-ink)`, `--ink: var(--color-charcoal)`,
   `--paper: var(--color-off-white)`, `--clay-ink`, `--golden-ink`, `--terracotta-ink`. Every alias
   points at an existing token; no value is redefined.
3. Implement the seven steps plus the two additions as CSS classes local to this file:
   `.t-d1` (Playfair 34/1.15/500/0/sentence) · `.t-d2` (26/1.20) · `.t-d3` (20/1.30) · `.t-body`
   (Inter 16/1.55) · `.t-body-sm` (14/1.50) · `.t-meta` (DM Mono 12/1.50/.08em **sentence case**) ·
   `.t-head` (DM Mono 11/1.50/500/.08em **UPPER**) · `.t-money` (DM Mono 15/1.5, `tabular-nums`,
   `.02em`) · `.t-authorship` (`.t-d3` in Playfair italic 400). Playfair tracking stays `0` — never
   negative below 40px.
4. Add `.consequence` (Inter 15/1.55, `--ink`, `max-width: 56ch`, `margin: 0 0 12px`) — the floor, used
   by H4 and H6.
5. **Add no hex literal that is not in the sheet.** Do not touch the Scored Ink block from `:193` — that
   is H4's.

**Tests.** `house-sheet-tokens.test.ts`: read `globals.css` as text and assert (a) every one of the
sheet's sixteen tokens resolves, (b) each of the nine `.t-*` classes exists with the sheet's size and
weight, (c) no hex literal appears in the file that is not in the sheet's token list. A contract test,
in the manner of the designer portal's `contrast.test.ts`.

**Gate.**
```
pnpm --filter @patina/client-portal type-check
pnpm --filter @patina/client-portal test -- src/app/__tests__/house-sheet-tokens.test.ts
```

**Review checklist.** No token renamed. No existing value changed. No `.da-*` rule touched. No new hex
outside the sheet. `.t-meta` is sentence case and `.t-head` is upper — swapping them silently breaks
every caption on the page.

**Report:** `…/waves/w2/h2-impl.md` (+ `-review`, `-fix`, `-rereview`).

---

## Lane H3 — Landmark ledger and the story pole (PP-5 / IA-20, IA-23)

**Goal.** Five landmarks under the doorplate that omit themselves when their target is not there, and a
story pole that navigates instead of watching.

**Files.**
```
apps/client-portal/src/components/threshold/landmark-ledger.tsx                   (new)
apps/client-portal/src/components/threshold/__tests__/landmark-ledger.test.tsx    (new)
apps/client-portal/src/components/threshold/story-pole.tsx
apps/client-portal/src/components/threshold/__tests__/story-pole.test.tsx
apps/client-portal/src/components/threshold/doorstep.tsx      (add id="changed"; inline-link the object)
apps/client-portal/src/components/threshold/__tests__/doorstep.test.tsx
apps/client-portal/src/components/threshold/threshold.tsx     (ledger mount + the sections array :1254-1264)
apps/client-portal/src/components/threshold/__tests__/threshold.test.tsx
```

**Steps.**
1. `landmark-ledger.tsx`: five `.t-head` tertiary acts, 44px tall, 24px gaps, wrapping to two rows at
   390 and still above the doorstep. Targets: Where we are → `#doorstep`; What changed → `#changed`;
   What you owe → `#letterbox` (this one carries `data-never-dim`); What needs you → the **first
   rendered** of `#wall` / `#door` / `#approval-<id>`; The papers → `#mat-papers`.
   **A landmark whose target does not render is omitted — never rendered disabled.**
2. `doorstep.tsx`: add `id="changed"` to the since-yesterday block (a **new** id; nothing is renamed).
   The doorstep sentence's object becomes an inline link to its gate — the `.act--inline` grammar (§F-D):
   inherits the sentence's family, size, case and colour, no min-height box, a 1px `--oak` rule 3px under
   the baseline, the same focus ring.
3. `story-pole.tsx`: graduation labels and the held label become anchor links to their section ids. The
   caret (`:231-233`) stays a non-interactive reading mark. At ≤600px, replace the hidden rail
   (`:178 max-[600px]:hidden`) with a **sticky one-line "You are in: {section}" button** that expands
   the same list — matching `specimens/client-house.html`.
4. `threshold.tsx:1254-1264`: extend the `sections` array to include `letterbox` and the first gate
   (`wall` or `door`, whichever renders first), so the caret can land on the money and the ask. Mount
   `<LandmarkLedger>` directly under the doorplate.

**Tests.** Each landmark omitted when its target is absent; `data-never-dim` on What you owe; What needs
you resolves to the first of wall/door/approval. Story pole: labels are links to real ids; the caret is
not a control; the ≤600px bar renders and expands. Threshold: the sections array contains `letterbox`
and the first gate; **no existing anchor id changed** (assert the full id set).

**Gate.**
```
pnpm --filter @patina/client-portal type-check
pnpm --filter @patina/client-portal test -- src/components/threshold
npx eslint apps/client-portal/src/components/threshold
```

**Review checklist.** Every landmark target actually exists in the rendered page (IA-21's failure is a
ledger pointing at ids that do not render). No anchor renamed — cross-check against
`docs/design/the-client-page/README.md:102-118`. The ledger is page furniture under the doorplate, not a
header and not persistent nav (D1). The pole's caret did not become clickable.

**Report:** `…/waves/w2/h3-impl.md` (+ `-review`, `-fix`, `-rereview`).

---

## Lane H4 — Action tiers and the gates (PP-3)

**Goal.** Three tiers by consequence, a rest rule you can see on a phone, and a gate that says what
accepting does.

**Files.**
```
apps/client-portal/src/components/threshold/instruments/scored-action.tsx
apps/client-portal/src/components/threshold/instruments/__tests__/scored-action.test.tsx
apps/client-portal/src/app/globals.css                        (the Scored Ink block from :193 ONLY)
apps/client-portal/src/components/threshold/wall-gate.tsx
apps/client-portal/src/components/threshold/__tests__/wall-gate.test.tsx
apps/client-portal/src/components/threshold/door-gate.tsx
apps/client-portal/src/components/threshold/__tests__/door-gate.test.tsx
apps/client-portal/src/app/pay/[token]/invoice-sheet.tsx      (:773 region only)
```

**Steps.**
1. `ScoredActionVariant` gains `'terminal'`. `VARIANT_CLASS.terminal = 'da-terminal …'`. CSS in the
   Scored Ink block: filled `--color-charcoal`, `--ink-paper` text, `padding: 13px 22px`,
   `min-height: 48px`, `border-radius: 3px`; the label overrides the shared mono caps with **Inter 500,
   16px, sentence case, tracking 0, tabular figures**; no `::before`/`::after` scores; hover `#1F1D1A`;
   active `translateY(1px)`. **The amount lives inside the label** — never a bare verb.
2. Delete `transform: scaleX(0)` at `globals.css:328`. The tertiary rule rests at 1px `--oak`,
   unconditionally — no `@media (hover:none)` variant.
3. Drop `disabled:opacity-50` and `aria-disabled:opacity-50` from `BASE_CLASS`
   (`scored-action.tsx:46-47`). Unavailable reads as `--text-faint` at full opacity with hairline scores;
   a terminal act unavailable keeps its **role**: `--rail` ground, `--ink-faint` text, 1px
   `--hairline-strong` border.
4. `HoldAction` (`:521`) stops using `disabled`: `aria-disabled="true"` plus `aria-describedby` at the
   **visible** reason; the control stays focusable. Activating it while unmet **moves focus to the name
   input and writes the reason into the gate's `role="status"` line** — never a silent no-op.
5. The `sr-only` hold sentence (`:610-612`) becomes a **visible** `.t-meta` caption in `--ink-subtle`
   directly under the act: "Press and hold to accept". `HOLD_MS` stays 900; keyboard parity, scroll
   cancel, silent early release and reduced-motion behaviour are unchanged.
6. Focus: add `:focus-visible { outline: 2px solid var(--color-clay-ink); outline-offset: 2px }`
   **alongside** the proofreader's caret, which stays (`globals.css:430-451`). `outline` does not affect
   layout, so no neighbour resizes.
7. `--color-error` (`globals.css:58`): grep for consumers. If `.da-danger:hover` (`:373-375`) is the only
   one, delete the token and re-point that hover to `--color-terracotta-ink`. If not, keep the token and
   re-point the hover anyway. Report which, with the grep.
8. `wall-gate.tsx`: the accept act becomes `terminal` with the amount in the label
   ("Accept the finished work · $2,980.00"), under a **consequence sentence** at 15px, present in every
   state including unavailable, composed from existing data — `bundle.data.tradeScope.draws[]` filtered
   on `gatesOnAcceptance`, plus `tradeScope.party.displayName` (the fields already read at `:132-147`).
   After acceptance the act **unmounts** and the existing Stamp record stands alone.
9. `door-gate.tsx`: the signature act becomes `terminal` on the same pattern, with its own consequence
   sentence.
10. `invoice-sheet.tsx:773`: replace the bespoke `--pay-act-bg` button with the same tier CSS. Product,
    not page: three action grammars become one.

**Tests.** `scored-action.test.tsx`: the `terminal` variant's classes; no `opacity-50` in `BASE_CLASS`;
tertiary has no `scaleX(0)`; `HoldAction` renders `aria-disabled` and **not** `disabled`, stays in the
tab order, moves focus to the input on unmet activation, and writes the reason to `role="status"`; the
hold caption is visible (not `sr-only`). `wall-gate.test.tsx`: the consequence sentence in every state
including unavailable; the amount in the label (extend `/accept/i` with an amount assertion); the act is
absent once accepted while the stamp remains. Same for `door-gate.test.tsx`.

**Gate.**
```
pnpm --filter @patina/client-portal type-check
pnpm --filter @patina/client-portal test -- src/components/threshold src/app/pay
npx eslint apps/client-portal/src/components/threshold apps/client-portal/src/app/pay
```

**Review checklist.** No `disabled` attribute on any gating act. The consequence sentence is present in
the **unavailable** state, not only the armed one. The hold caption is visible to pointer users. Focus
is an outline **plus** the caret, not instead of it. Terminal appears **only** at wall, door and Pay —
grep for `variant="terminal"` and count. No `opacity: .5` on any state anywhere in the diff. The mobile
`mobile_dock` presentation still works.

**Report:** `…/waves/w2/h4-impl.md` (+ `-review`, `-fix`, `-rereview`).

---

## Lane H5 — Rooms, plates and the concept render slot (PP-4 / PP-7)

**Goal.** Honest imagery at real scale: no rectangles, no hash blocks, no 3.9px type, and the studio's
own concept render where one exists.

**Files.**
```
apps/client-portal/src/components/threshold/room-band.tsx
apps/client-portal/src/components/threshold/__tests__/room-band.test.tsx
apps/client-portal/src/components/threshold/instruments/tracking-row.tsx
apps/client-portal/src/components/threshold/instruments/__tests__/tracking-row.test.tsx
apps/client-portal/src/components/threshold/instruments/piece-silhouette.tsx        (new)
apps/client-portal/src/components/threshold/instruments/__tests__/piece-silhouette.test.tsx (new)
apps/client-portal/src/components/threshold/threshold.tsx    (band props only)
```

**Steps.**
1. **Empty room** (`room-band.tsx:134-158`): the outlined `<rect>` goes. A floor line at full band width
   plus one sentence — "Nothing stands here yet." and the next real step where one is known
   ("The Study comes first."). Never a rectangle. Never a zero.
2. **The eleven-pixel floor**, ported not reinvented: bring `TYPE_FLOOR_PX`, `PLAN_PHONE_TYPE`,
   `planPhoneViewBox()` and the `useSyncExternalStore` phone hook from `plan-key.tsx:24-50` to the band's
   footprint labels (`FOOT_TYPE` at `:70`, used at `:151` and `:230`). Today they render at 3.9px on a
   390 phone. Export the helpers from `plan-key.tsx` and import them — do not copy the arithmetic.
3. **Plates** (`tracking-row.tsx:109`, `:112-118`): 96px at ≥960px when the piece's amount is
   **≥ $2,000**, 64px otherwise.
4. **Placeholder → silhouette**: `piece-silhouette.tsx` draws chair / table / case / light / textile
   generic outlines as inline SVG, 1px `--ink-faint`, one detail line (secondary hatch may use
   `stroke-opacity: .5`; `--rail` is for fills only, never a stroke). Caption
   "Photograph from {maker} to follow" where the maker is known. Never a diagonal hash, never a blank
   fill, never a broken-image glyph.
5. **The stage word prints once**: remove the 9px duplicate at `:187`. `StatusStamp` (`:201-215`) keeps
   its mark, at 11px. The `sr-only` stage sentence and the decorative-hiding contract are unchanged.
6. **Every plate gets a caption line** in `.t-meta`: what · whose · when.
7. **Concept render slot**: when `room.conceptRender` exists (from A2's `derive.ts` mapping), render a
   **3:2 plate at band width above the drawing**, with an on-image label "Concept · not installed" at
   ≥14px, `--ink` on a `--paper-doc` strip, and the caption "{caption} · uploaded by {studio} ·
   {legalDate}". **The drawing stays beneath it.** Where there is no concept render, nothing changes.
8. **Installed photographs do not exist in the data model — do not invent one.** The concept render is
   the only new image source on this page.

**Tests.** Empty room renders a floor line and a sentence and **no `<rect>`**. Footprint labels render
at ≥11px at a 390 viewBox. Plate is 96px above the threshold, 64px below, 64px at ≤600px. The silhouette
renders per category with its caption; the maker clause appears only when a maker is known. The stage
word appears exactly once. Concept render: label ≥14px, caption composed, drawing still present; absent
`conceptRender` renders no slot.

**Gate.**
```
pnpm --filter @patina/client-portal type-check
pnpm --filter @patina/client-portal test -- src/components/threshold
npx eslint apps/client-portal/src/components/threshold
```

**Review checklist.** The eleven-pixel floor is **imported** from `plan-key.tsx`, not re-derived. No
procedural fill, gradient or stock image anywhere in the diff. The concept-render label is on the image
and at least 14px — a label that can be cropped off is not a label. `TrackingRow`'s screen-reader
contract is intact (one `sr-only` stage sentence, decoration hidden, no double reading).

**Report:** `…/waves/w2/h5-impl.md` (+ `-review`, `-fix`, `-rereview`).

---

## Lane H6 — The money block and one date (PP-2)

**Goal.** The figure with an obligation and a date is the largest true type on the page, and the page
prints one date style.

**Files.**
```
apps/client-portal/src/lib/threshold/dates.ts                                   (new)
apps/client-portal/src/lib/threshold/__tests__/dates.test.ts                    (new)
apps/client-portal/src/components/threshold/house-ledger.tsx
apps/client-portal/src/components/threshold/doorstep.tsx        (money region only — H3 owns #changed)
apps/client-portal/src/components/threshold/letterbox.tsx
apps/client-portal/src/lib/threshold/standing.ts                (owedDueLine)
apps/client-portal/src/lib/threshold/derive.ts                  (DAY_MONTH:269)
apps/client-portal/src/components/threshold/{earlier-invoices,road-orders,approval-ask,ground-floor,
  the-note,correspondence,door-acts,previously,story-pole,door-gate,wall-gate,scope-change-ask,
  review-ask}.tsx
apps/client-portal/src/components/threshold/instruments/{spine-toll,making-spine,signature-line,
  standing-sentence,tracking-row}.ts(x)
…plus every touched file's test
```

**Steps.**
1. `lib/threshold/dates.ts`: `legalDate(d)` → "11 September 2026" and `dayMonth(d)` → "11 September",
   both `en-GB`, both accepting the shapes already passed around. These are the **only** two date
   idioms the page may use.
2. Sweep every formatting site above onto the helper. **Verified wider than the research brief:**
   `ground-floor.tsx`, `instruments/standing-sentence.ts` and `instruments/tracking-row.tsx` also format
   en-US; `scope-change-ask.tsx` and `review-ask.tsx` also format en-GB; `story-pole.tsx` and
   `approval-ask.tsx` format **both**. Grep `en-US` and `en-GB` under
   `apps/client-portal/src/components/threshold` and `src/lib/threshold` and leave neither behind.
   Update every test string the sweep changes.
3. **The owed figure is the announced figure**: `.t-d2` (Playfair 26) at the display step, with
   "due {legalDate}" beneath at `.t-meta`. The agreed figure drops below it —
   `house-ledger.tsx:77-88`'s `standsSentence()` stops out-ranking the obligation.
4. **One reconciling sentence** under it, `.t-body` 16px, with every figure in a `.t-money` span:
   "$11,100.00 agreed · $0.00 paid · $4,060.00 owed on INV-2026-0301." The three doorstep figures that
   never reconcile (IX47) become one sentence that does.
5. `letterbox.tsx`: the figure line (`:273-280`) goes to 15px. The letterbox drawing takes the plain
   gloss "Invoice". Rows that are falsy stay filtered (`house-ledger.tsx:107`) — never a `$0`
   placeholder.
6. **Pay becomes a `terminal` act** (H4's variant) with the amount in the label, under the consequence
   sentence: "This opens payment. Nothing is charged until you choose how to pay."
7. `data-never-dim` on the letterbox (`:228`) is untouched — the balance is structurally exempt from any
   dimming pass and stays that way.

**Tests.** `dates.test.ts` (both helpers, month boundaries, a null input). House ledger: the owed figure
is the `.t-d2`; the reconciling sentence names all three figures; falsy rows are still absent. Letterbox:
15px figure line; the "Invoice" gloss; Pay is `terminal` with the amount and a consequence sentence
above it; `data-never-dim` still present. Every swept file's date assertions updated to the en-GB form.

**Gate.**
```
pnpm --filter @patina/client-portal type-check
pnpm --filter @patina/client-portal test -- src/components/threshold src/lib/threshold
npx eslint apps/client-portal/src/components/threshold apps/client-portal/src/lib/threshold
grep -rn "en-US" apps/client-portal/src/components/threshold apps/client-portal/src/lib/threshold   # expect zero
```

**Review checklist.** Exactly one announced figure per money block, and it is the **owed** one. Every
other figure in the block is `.t-money`. No block shows one payment in three families (VC-10). "due 11
September" never appears one line above "due September 11" again. No `$0` placeholder. The date sweep
left no `en-US` behind.

**Report:** `…/waves/w2/h6-impl.md` (+ `-review`, `-fix`, `-rereview`).

---

## Wave 2 integration, gates, deploy

**Integration lane (one agent, owns :3002 and the local stack).**

**Merge order:** `H2 → H1 → H4 → H3 → H5 → H6` onto `portal-polish/integration`, subjects
`chore(portal-polish): merge <lane> — …`. Re-run the merged lane's tests after **each** merge.
Expected conflicts: `globals.css` (H2/H4 — disjoint regions), `threshold.tsx` (H1/H3/H5 — disjoint
regions), `wall-gate.tsx` and `door-gate.tsx` (H4/H6), `invoice-sheet.tsx` (H1/H4). Resolve faithfully;
never resolve by dropping a lane's hunk.

**Wave gates.**
```
pnpm supabase:reset                                        # integration lane only
pnpm --filter @patina/client-portal type-check
pnpm --filter @patina/client-portal test                   # full, with coverage — floor 70/60/70/70
pnpm --filter @patina/client-portal lint                   # 11 pre-existing errors; DO NOT GROW the count
pnpm --filter @patina/client-portal test:e2e -- tests/threshold.spec.ts
```
`threshold.spec.ts` (single chromium project, server on :3002, seed `client-solo@patina.dev`, project
"Cedar Lane Study") is extended to assert: **"Sign out"** in the mat; the landmark ledger with a
landmark omitted when its target is absent; the wall gate's consequence sentence; the owed figure as the
announced figure; the story pole's labels as links.

**Renders.** 1440 and 390 against the local dev server. The Threshold is **signed-in**, so
`artifacts/portal-polish-review-2026-09-08/tools/render.mjs` cannot reach it alone: the integration lane
writes a small Playwright script that signs in as `client-solo@patina.dev` (the helper
`threshold.spec.ts` already uses), navigates to the Cedar Lane Study project, and screenshots at both
widths. Assert: **no console errors**, and
`document.documentElement.scrollWidth <= clientWidth` at both widths. Save under
`artifacts/portal-polish-build-2026-09-08/waves/w2/renders/`.

**Deploy.**
```
pnpm --filter @patina/client-portal type-check     # once more on the merge commit
npx wrangler deployments list --name patina-client-portal    # record the CURRENT id for rollback
./infra/deploy-portal.sh client
npx wrangler deployments list --name patina-client-portal    # oldest-first: read the BOTTOM row
```

**Smoke probes.**
1. `wrangler deployments list` bottom row is the new deployment.
2. Served-chunk grep for a new string: `curl -s https://client.patina.cloud/… | grep -o "Sign out"` —
   and grep the JS chunks, not only the HTML. `/version` proves nothing on the live path.
3. A signed-in Playwright walk against prod with the tester account **if credentials exist in the repo's
   e2e helpers**. They are local-stack pinned today, so unless a prod tester credential is found, record
   this as **owed to Kody: signed-in prod walk of the house page** in the ship report rather than
   claiming it.

**Rollback.** `npx wrangler rollback <previous version id> --name patina-client-portal`, using the id
recorded before the deploy.

**Ship report:** `artifacts/portal-polish-build-2026-09-08/ship/w2-ship.md`.

---

# WAVE 3 — The Desk (designer portal)

Six lanes. Everything lands in `apps/designer-portal` except D6's use of A2's hook. Deploys to
`patina-designer-portal`.

**Lanes that share a file:**

| File | Lanes | Resolution |
|---|---|---|
| `components/document/desk-roster.tsx` | **D1** (day's line) and **D2** (facets on the head) and **D4** (row rule) | D1 owns the block between the head and the first plate; D2 owns the head row; D4 owns the row's `className` at `:110`. Integrate D4 → D2 → D1. |
| `app/(document)/desk/page.tsx` | **D2** (member list wiring) and **D3** (the grid) | D3 owns the container/grid; D2 passes the already-fetched `studioMembers` (`:90`) down. Integrate D3 → D2. |
| `app/globals.css` | **D4** only | |
| `lib/document/desk-roster-derivation.ts` | **D1** and **D2** | D1 adds the day's-line derivation; D2 adds the facet predicates. Integrate D1 → D2. |

**Integration order:** **D4 → D3 → D1 → D2 → D5 → D6.**

---

## Lane D1 — The day's line (PP-2 / IA top-5 #1)

**Goal.** At most three lines under the roster head, every one a view of a roster row — and nothing at
all when nothing needs her.

**Files.**
```
apps/designer-portal/src/components/document/desk-roster.tsx      (the block between head and first plate)
apps/designer-portal/src/components/document/desk-roster.test.tsx
apps/designer-portal/src/lib/document/desk-roster-derivation.ts
apps/designer-portal/src/lib/document/__tests__/desk-roster-derivation.test.ts
apps/designer-portal/src/hooks/use-desk-engagements.ts            (or a sibling hook for answered notes)
apps/designer-portal/src/hooks/__tests__/…                        (its test)
```

**Steps.**
1. Derive at most **three** lines from the roster's existing need model:
   (a) the overdue sentence — `overdueSentence` / `overdueLine`
   (`lib/document/desk-roster-derivation.ts:127`, `:181`) — with the job name as an **inline link** to
   its `data-roster-line` row (`desk-roster.tsx:89`), the clause after the dash in
   `--color-terracotta-ink`;
   (b) the earliest lead deadline line;
   (c) "{client} replied last night — {job}", from `project_notes.answered_at`
   (`supabase/migrations/00565_the_client_page.sql:236`) within the last 24h for the studio's projects.
   This is a **new read** in `use-desk-engagements.ts` or a sibling hook — RLS already scopes
   `project_notes`, so **no RPC and no new table**. Today the hook reads only `item_feedback` verdict
   `rejected` (`:217-232`).
2. "and N more below" as an inline link to the first stage plate when more than three things need her.
3. Render the block between the roster head and the first stage plate, above a 1px `--hairline-strong`
   rule, lines 12px apart at `.t-body`.
4. **When nothing needs her, the band does not render.** Absence is silence — a "Nothing needs you"
   banner above sixteen live jobs is a second queue.
5. **It is not a second queue**: every line links to a row that is already on the page. No line
   introduces a job the roster does not list.

**Tests.** Three lines at 16 jobs; still three at 43 with "and 12 more below"; zero needs → the band
renders nothing; each line's link resolves to a `data-roster-line` on the page; the answered-note line
appears only inside 24h. The existing `overdueLine` assertions
(`desk-roster.test.tsx:16`, `desk-roster-derivation.test.ts:158`) stay green.

**Gate.**
```
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal test -- --ci src/components/document/desk-roster.test.tsx \
  src/lib/document/__tests__/desk-roster-derivation.test.ts src/hooks
npx eslint apps/designer-portal/src/components/document apps/designer-portal/src/lib/document apps/designer-portal/src/hooks
```

**Review checklist.** Never more than three lines. Nothing renders when nothing needs her. Every line
links into the roster. No new queue, no counts-as-tiles, no badge. The overdue trio (head count →
sentence → row mark) is intact — three levels of the same fact, each legible alone.

**Report:** `…/waves/w3/d1-impl.md` (+ `-review`, `-fix`, `-rereview`).

---

## Lane D2 — Roster facets (IA-11/12)

**Goal.** "Only what needs me" and "By person" on the roster head — facets, not a density toggle.

**Files.**
```
apps/designer-portal/src/components/document/desk-roster.tsx      (the head row)
apps/designer-portal/src/components/document/desk-roster.test.tsx
apps/designer-portal/src/lib/document/desk-roster-derivation.ts   (facet predicates)
apps/designer-portal/src/lib/document/__tests__/desk-roster-derivation.test.ts
apps/designer-portal/src/app/(document)/desk/page.tsx             (pass studioMembers down — this only)
```

**Steps.**
1. Two `.t-head` tertiary acts on the roster head row, right of the head sentence, each with
   `aria-pressed`. **Labels never change with state** (IX18).
2. **Only what needs me** filters to rows carrying a mark (`URGENT_NEED_KINDS` at
   `desk-roster-derivation.ts:59` is the existing definition of "needs"). An empty result prints
   "Nothing needs your hand today." — never an empty list.
3. **By person** regroups by `DocumentStateRow.designer_id` (`lib/document/desk-derivation.ts:53`)
   against the `organization_members` profiles **already fetched** at `desk/page.tsx:90`
   (`useOrganizationMembers`). Person plates take `--rail` with `--ink` labels — people are not stages
   and never take a stage pigment. Unassigned rows group under the principal.
4. The head sentence states the active facet in words: "Every job · 16 live · 1 overdue · showing what
   needs you."
5. At 390 the facets wrap to a second line, still above the first plate.

**Tests.** `aria-pressed` toggles; the head sentence names the active facet; "Only what needs me" keeps
only marked rows; empty result prints the sentence; "By person" groups by `designer_id` with unassigned
under the principal; labels are stable across states; stage plates are unchanged when no facet is active.

**Gate.** Same shape as D1.

**Review checklist.** No second data fetch — `useOrganizationMembers` at `:90` is reused. Person plates
carry no stage pigment. Stage grouping survives (IA-02: replacing plates with a text column turns one
heading scan into reading 43 rows). No padding switch anywhere in the diff.

**Report:** `…/waves/w3/d2-impl.md` (+ `-review`, `-fix`, `-rereview`).

---

## Lane D3 — Boards beside the head (IA-17)

**Goal.** The studio's creative work on screen with the day's work instead of ~2,000px below it.

**Files.**
```
apps/designer-portal/src/app/(document)/desk/page.tsx                       (container + grid)
apps/designer-portal/src/components/document/recent-boards-strip.tsx        (a `compact` variant)
apps/designer-portal/src/components/document/__tests__/recent-boards-strip.test.tsx
```

**Steps.**
1. At **≥1280px**, `desk/page.tsx:230`'s `max-w-[1120px]` container becomes a two-column grid: roster
   `minmax(0,1fr)` plus a **260px** rail. Below 1280 the single column is unchanged.
2. `RecentBoardsStrip` gains a `compact` variant: three boards, `BoardCoverArt` at **92px** (`:57`),
   name plus relative time, in the rail. `useRecentBoards(8)` (`:19`) is unchanged — the variant slices.
3. Below 1280 the existing strip stays exactly where it is, after the roster (`page.tsx:442`).
4. **Never above the roster.** The strip is beside the head or below the roster; a hero board that
   pushes the first job off a 1440×900 screen is the failure IA-01 measures.

**Tests.** `compact` renders three boards at 92px; the full strip is unchanged below 1280; the rail
renders only at ≥1280; the roster keeps `minmax(0,1fr)` (no min-width overflow).

**Gate.** Same shape as D1, scoped to `src/app/(document)/desk` and `src/components/document`.

**Review checklist.** No horizontal overflow at 1280, 1440 or 390. Board thumbnails are **drawings or
covers**, never a hero photograph. The roster's first row is still above the fold at 1440×900.

**Report:** `…/waves/w3/d3-impl.md` (+ `-review`, `-fix`, `-rereview`).

---

## Lane D4 — Action CSS, row affordance, and the ⌘K palette (PP-3 / B03)

**Goal.** The same three tiers as the client page, a job name you can see is a link, and a command
palette a screen reader can drive.

**Files.**
```
apps/designer-portal/src/app/globals.css
apps/designer-portal/src/components/document/document-action.tsx
apps/designer-portal/src/components/document/__tests__/document-action.test.tsx
apps/designer-portal/src/components/document/desk-roster.tsx      (:110 className only)
apps/designer-portal/src/components/document/command-bar.tsx
apps/designer-portal/src/components/document/__tests__/command-bar.test.tsx
```

**Steps.**
1. `DocumentActionVariant` gains `'terminal'` — the same CSS as the client's (filled
   `--color-charcoal`, `--ink-paper` text, Inter 500 16px sentence case, 48px, radius 3px, amount in the
   label). **Un-skip the `terminal` row A1 left in `document-action.test.tsx:29-105`.** The Desk has no
   terminal act today; the variant exists so the two portals share one grammar and the test table
   records it once.
2. Delete `transform: scaleX(0)` at `globals.css:693` — the tertiary rule rests at 1px
   `--color-aged-oak`.
3. `.da-secondary` rest score: `rgba(44,41,38,.28)` → `var(--color-aged-oak)` at `globals.css:679`.
4. Drop `disabled:opacity-50` / `aria-disabled:opacity-50` from `BASE_CLASS`
   (`document-action.tsx:52-53`); unavailable is `--text-faint` at full opacity with hairline scores.
5. Focus: add `:focus-visible { outline: 2px solid var(--color-clay-ink); outline-offset: 2px }`
   alongside the existing caret (`globals.css:841-858`) — the caret stays.
6. Roster job names take a **resting** 1px `--color-aged-oak` rule: `desk-roster.tsx:110` and
   `.row-wash-score::after` (`globals.css:409-428`) lose their `scaleX(0)` rest; hover raises to
   `--color-clay` as it does today. `--elevation-sheet` and `desk-settle` (`:436-449`) are **untouched**.
7. **B03 — `command-bar.tsx`**: `aria-modal="true"` on the dialog (`:1073-1076`); `role="listbox"` on the
   results `<ul>` (`~:1145`); `role="option"` + `aria-selected` on each row; `aria-activedescendant` on
   the input pointing at the active option's id; a `role="status"` result count. Keyboard behaviour
   (`~:1105-1113`) is unchanged.

**Tests.** `document-action.test.tsx` — the `terminal` row passes; no `opacity-50` in `BASE_CLASS`; the
other variants' `retiredChrome` assertions unchanged. `command-bar.test.tsx` — `aria-modal`, listbox and
option roles, `aria-selected` follows the active index, `aria-activedescendant` tracks it, the status
line reports the count. A CSS contract test that no `.da-*` rest rule uses `scaleX(0)`.

**Gate.**
```
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal test -- --ci src/components/document src/lib/document
pnpm --filter @patina/designer-portal lint     # 2 known errors; DO NOT GROW the count
# shadow-gate.test.ts must be green and untouched
```

**Review checklist.** `shadow-gate.test.ts`, `contrast.test.ts`, `rail-stock.test.ts` unedited and green.
No `box-shadow` in the diff — `eslint.config.mjs:72-108` will catch it, but check anyway. `--elevation-sheet`
untouched. `desk-settle` untouched. The caret survives alongside the new outline. The palette's keyboard
path still works with the new ARIA.

**Report:** `…/waves/w3/d4-impl.md` (+ `-review`, `-fix`, `-rereview`).

---

## Lane D5 — The mobile bar loses its dwell timer (VISION.md:50)

**Goal.** Remove the timer that watches her; keep the one she opens.

**Files.**
```
apps/designer-portal/src/components/document/mobile/mobile-bar.tsx
apps/designer-portal/src/components/document/mobile/__tests__/mobile-bar.test.tsx
```

**Steps.**
1. Remove the "Today / In hand + elapsed" centre readout fallback at `mobile-bar.tsx:368-381`. When no
   primary action is registered, the centre slot shows **nothing**.
2. The **"Time in hand … review or adjust" row in More** (`:498-514`) **stays** — a timer she opens is a
   tool.
3. The bar's colour and identity block **stay as built** (Kody's ruling). This lane changes the centre
   slot and nothing else.

**Tests.** With no primary action, the centre slot renders nothing (no "Today", no "Hands free", no
elapsed string). With a primary action, the bar is unchanged. The More row still renders the elapsed
time.

**Gate.**
```
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal test -- --ci src/components/document/mobile
```

**Review checklist.** The diff is the centre slot and its test only. `useDocumentTime` is still used by
the More row — do not delete the hook. The bar's colour and identity block are byte-unchanged. No
decorative italic remains in the centre slot.

**Report:** `…/waves/w3/d5-impl.md` (+ `-review`, `-fix`, `-rereview`).

---

## Lane D6 — Concept render upload UI (PP-7)

**Goal.** The studio can put its own render on the client's page, labeled, from where it already works.

**Files.**
```
apps/designer-portal/src/components/document/rooms/concept-render-upload.tsx                 (new)
apps/designer-portal/src/components/document/__tests__/concept-render-upload.test.tsx        (new)
apps/designer-portal/src/components/document/ffe-section.tsx      (one import + one mount at RoomHeading)
```

**Steps.**
1. Mount in the project document's rooms/FF&E area at the existing R25 per-room heading —
   `components/document/ffe-section.tsx:567` `RoomHeading` is the anchor; read the surrounding component
   before placing it. **No new route.**
2. A tertiary act **"Add a concept render"** unfolds: a file input (`accept="image/jpeg,image/png,
   image/webp"`, **≤ 8 MB** enforced client-side with a named reason on rejection), a caption field, and
   the consent line "Labeled 'Concept · not installed' on the client's page".
3. Uses A2's `useRoomConceptRender` hook from `@patina/supabase`. **This lane does not edit
   `packages/supabase`** — if the hook's shape is wrong, report it; A2's owner fixes it.
4. When a render already exists, show it with **"Replace"** and **"Remove"** acts, plus its caption and
   upload date.
5. Errors are quiet and in place — never a toast (R51), never a red banner (`--color-error` is
   forbidden). A failed upload leaves the existing render standing.

**Tests.** The act renders per room; a file over 8 MB is rejected with a named reason and no upload; a
successful upload calls the hook with `{ projectId, roomId, file, caption }`; the existing render shows
with Replace/Remove; Remove clears the four fields; a failed upload leaves the render in place; the
consent line is always visible before upload.

**Gate.**
```
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal test -- --ci src/components/document/__tests__/concept-render-upload.test.tsx
npx eslint apps/designer-portal/src/components/document
```

**Review checklist.** No route added. `ffe-section.tsx`'s diff is one import and one mount. No shadow, no
badge, no toast. The consent line is present **before** the upload, not after. The MIME and size limits
match the bucket's, so the client never gets a server rejection it could have been told about.

**Report:** `…/waves/w3/d6-impl.md` (+ `-review`, `-fix`, `-rereview`).

---

## Wave 3 integration, gates, deploy

**Integration lane (one agent, owns :3000 and the local stack).**

**Merge order:** `D4 → D3 → D1 → D2 → D5 → D6` onto `portal-polish/integration`. Re-run each merged
lane's tests after every merge. Expected conflicts: `desk-roster.tsx` (D4/D1/D2 — disjoint regions),
`desk/page.tsx` (D3/D2), `desk-roster-derivation.ts` (D1/D2).

**Wave gates.**
```
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal test -- --ci        # 476-suite baseline; no suite lost
pnpm --filter @patina/designer-portal lint                # 2 known errors
                                                          # (piece-room-save-gate.test.tsx:159,
                                                          #  use-commercial-documents.test.ts:930)
                                                          # DO NOT GROW the count
# shadow-gate.test.ts green
pnpm --filter @patina/admin-portal build                  # strictest; catches shared-package drift
```

**Renders.** 1440 and 390 of `/desk` against the local dev server on :3000. The Desk is **signed-in**, so
`tools/render.mjs` alone will not reach it: the integration lane writes a Playwright script that signs in
as the seeded designer, opens `/desk`, and screenshots at both widths — at 16 jobs and, if the seed
allows, at a padded roster. Assert no console errors and no horizontal overflow at either width. Save
under `artifacts/portal-polish-build-2026-09-08/waves/w3/renders/`.

**Deploy.**
```
pnpm --filter @patina/designer-portal type-check
npx wrangler deployments list --name patina-designer-portal    # record the CURRENT id for rollback
./infra/deploy-portal.sh designer
npx wrangler deployments list --name patina-designer-portal    # oldest-first: read the BOTTOM row
```

**Smoke probes.**
1. `wrangler deployments list` bottom row is the new deployment.
2. Served-chunk grep for a facet label — `Only what needs me` — in the JS chunks, not only the HTML.
3. A signed-in Playwright walk against prod with the tester account **if** credentials exist in the
   repo's e2e helpers; otherwise record **owed to Kody: signed-in prod walk of the Desk** in the ship
   report. Do not claim a walk that did not happen.

**Rollback.** `npx wrangler rollback <previous version id> --name patina-designer-portal`.

**Ship report:** `artifacts/portal-polish-build-2026-09-08/ship/w3-ship.md`, plus a program report at
`artifacts/portal-polish-build-2026-09-08/ship/PROGRAM.md` naming every ruling delivered, every gate's
final numbers, and everything owed to Kody.

---

## Review protocol (every lane, every wave)

The implementer **never** reviews its own work. Each lane's reviewer runs in a **separate context** with
this brief:

> Review `<lane>`'s diff against `docs/superpowers/plans/2026-09-08-portal-polish-build.md` and
> `docs/design/house-sheet/SPEC.md`. **Report every finding with a severity and a confidence** — never
> filter to high severity only. Check: pathspec discipline (did the lane touch a file it does not own?);
> the house sheet (type steps, tokens, no new hex, no shadow, no pill, no badge, no truncation, no
> `opacity: .5` on a state); the ruling the lane implements, by its PP-n; accessibility (focus, roles,
> `aria-disabled` not `disabled`, 44px targets, contrast); test coverage of the behaviour, not the
> markup; and any copy string changed without its test. Write to
> `artifacts/portal-polish-build-2026-09-08/waves/w<N>/<lane>-review.md`.

The lane then fixes (`<lane>-fix.md`) and the same reviewer re-reviews (`<lane>-rereview.md`).

## Not in this plan

Installed photographs (no data model — R142 forbids inventing one). The standalone invoice's full
re-typesetting beyond the Pay act joining the terminal tier (noted in `rulings.md` as a consequence to
confirm). Any change to the Desk's wordmark or footer identity (PP-9). Any new depth token or shadow.
Any new NestJS service. Any feature flag.
