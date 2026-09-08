# The Agreement, Composed — program report

Three waves plus one hotfix, shipped to production 2026-09-07 → 2026-09-08 under Kody's
in-session instruction *"Deliver the Agreement system to production"* (the full chain:
merge → migrations → edge functions → portals → verify, per wave). Source rulings:
`build/rulings-2026-09-06.md` (R1–R52). Wave detail: `build/waves/{w1,w2,w3}/wave-report.md`
and `deploy-report.md`; hotfix detail: `build/hotfix/r30-deploy-report.md`.

**All three feature flags — `agreement-parts` (W1), `agreement-library` (W2), `design-build`
(W3) — are fail-closed and were NOT created as of the last deploy report for each wave.**
Every studio and homeowner surface below is dark in production until Kody creates the flag
and verifies it against `/flags` with a real-browser UA (project memory: `threshold` matched
everyone on 2026-09-04). The R30 hotfix is the one exception — it ships live, unflagged,
because it repairs an existing production defect (see below).

---

## 1 · What is in production

### Wave 1 — "loosen the room" (merged `61a68919d`, deployed 2026-09-07)

| | |
|---|---|
| Migration | `supabase/migrations/00575_agreement_parts.sql` — applied to Strata |
| Edge functions | none |
| Designer portal | Worker `patina-designer-portal` version **`97bca77d-2b27-4e7c-ada3-78f8ba87ce32`** · rollback `b03f50e1-73e6-42f8-94bd-5de8de5f45c8` |
| Client portal | Worker `patina-client-portal` version **`48624f39-4013-4110-9262-171942bf8c26`** · rollback `58976a1c-4f6f-4af2-9d5e-38980ef2b39f` |
| Flag | `agreement-parts` — fail-closed, **not created** |

Once the flag is live, a designer can open the Contract Room and compose an agreement from
nine standard parts (Services, Deliverables, Exclusions, Role rates, Ceiling, Furnishings
deposit, Retainer, Billing cadence, Terms), add/remove parts, save Studio Agreement defaults
(Account → Studio), and return a composed draft to the seven-facet room. A homeowner reads
and signs the composed agreement as ordered parts instead of the old fixed-facet body. With
the flag absent, both surfaces render byte-identically to pre-Wave-1 — proven by a passing
snapshot test, not just asserted.

### Hotfix R30 — "the origin agreement reaches the homeowner" (merged `253f7afcf`, deployed 2026-09-07, before Wave 2)

| | |
|---|---|
| Migration | none |
| Edge functions | none |
| Client portal | Worker `patina-client-portal` version **`9858b5a6-8b87-4f82-9173-ffde4a76bb35`** · rollback `48624f39-4013-4110-9262-171942bf8c26` |
| Flag | none — ships live, unflagged |

Repairs a real production defect: the 2026-09-04 client-page cutover made the homeowner's
front door project-scoped, so a household with zero projects could not reach a `sent`,
project-less (origin) design-services agreement. A zero-project household now reads and
signs a pending origin agreement at its door exactly as a project-bound one; the retired
`/proposals/[id]` redirect and the studio-invoice front door both keep working beside it.
This directly unblocked the one live production agreement `f72d2912-c14b-4cea-ba6c-5726b14d502c`
(sent 2026-09-04, still unsigned as of this report — no signed-in walk has confirmed her door
renders; see §4).

### Wave 2 — "the Library, fee schedules, the client's copy from parts" (merged `eeda45516`, deployed 2026-09-07)

| | |
|---|---|
| Migrations | `supabase/migrations/00576_agreement_library.sql`, `00577_agreement_fee_schedules.sql` — applied to Strata |
| Edge functions | none |
| Designer portal | Worker version **`7a88a385-cc3e-4dc7-9a2d-0f5c1e737c5a`** · rollback `97bca77d-2b27-4e7c-ada3-78f8ba87ce32` |
| Client portal | Worker version **`33a01d5a-61f4-440c-af2d-9197acda725a`** · rollback `9858b5a6-8b87-4f82-9173-ffde4a76bb35` |
| Flag | `agreement-library` — fail-closed, **not created** |

Adds: Save-as-template and a studio Library (three seeded templates — Consultation, Design
services, Furnishings only — plus studio-authored ones), a template picker filtered by
document kind, six new fee-schedule variants (per-phase, cost-plus, day-rate, package, etc.),
part change history, the client's copy composed from parts with a frozen execution-snapshot
keepsake, and an addendum's `why` visible to the homeowner. Strata carries 7 executed
authorities all backfilled `retainer_credit_rule = 'credited'`.

### Wave 3 — "turnkey: the design-build class, the Trade Agreement, the licensing gate" (merged `c784aad9d`, deployed 2026-09-08)

| | |
|---|---|
| Migrations | `supabase/migrations/00578_design_build_kind.sql`, `00579_trade_agreements.sql` — applied to Strata |
| Edge functions | `proposal-send`, `commercial-document-notify` (redeployed, learn `design_build`), **new** `trade-agreement-send` (`verify_jwt = true`) |
| Designer portal | Worker version **`6987d9ff-9154-453f-ae89-c7ab4c714d48`** · rollback `7a88a385-cc3e-4dc7-9a2d-0f5c1e737c5a` |
| Client portal | Worker version **`f46e2e19-a806-45d1-853e-28a007533724`** · rollback `33a01d5a-61f4-440c-af2d-9197acda725a` |
| Flag | `design-build` — fail-closed, **not created** |

Adds the turnkey (`design_build`) document kind, gated on a self-attested, Patina-stored
(never-verified) licensing attestation. A designer can build a cost-plus-with-GMP or fixed
pricing basis, a schedule of values (studio-authored under closed book, cost-lines-derived
under open book), a draw schedule with retainage, allowances, and issue draw invoices through
the studio-invoice rail. A designer can send a token-signed Trade Agreement to a subcontractor
who signs at `/trade/[token]` with no Patina login and no visibility into the client, the GMP,
the schedule of values, or any other trade. A homeowner sees a deposit offer that survives a
page reload as a database row, not client memory, and pays it through `/pay/[token]`. Six
jurisdiction notices (WI, MN, IL, CA, NY, MA) and a flow-down clause are seeded, all
`enabled = false`, pending counsel (R11, R16). Strata carries 0 `design_build` proposals as of
deploy — nothing has used this class yet.

---

## 2 · The rulings that shaped it

52 rulings, three of them ("owner") set before any code was written; the rest adopted by the
build under Kody's standing precedent that every ruling in an authorized build is adopted as
recommended (client-approval program, 2026-09-04) unless overturned.

### Proposal rulings (pre-build)

| # | Ruling | Owner |
|---|---|---|
| R1 | Reverse R85 for agreements — a studio Library is a different object from retired `proposal_templates` | Kody |
| R2 | Template scope: studio only, "mine" is a filter | Kody |
| R3 | Owners/admins edit the Library; every active member composes | Leah |
| R4 | The floor: parties, signature block, one typed money part for a billing class; a ceiling required whenever a rate card exists | Kody |
| R5 | Prose never carries money — only `schedule` variants project into terms/authority | Kody |
| R6 | Parts freeze at send; unsend = supersede | Kody |
| R7 | Names: Agreement · Part · Library · Template · Addendum — never "clause library"/"contract builder" | Leah |
| R8 | Client copy: designer's order, per-part `client_visible` | Kody |
| R9 | Which fee variants create billing authority in Wave 2 | Kody |
| R10 | Licensing attestation: self-attested, Patina stores, never verifies; gates the design-build template | Counsel |
| R11 | Jurisdiction notices seeded `enabled = false`; no UI to enable until counsel reviews | Counsel |
| R12 | Client keeps a frozen HTML snapshot at execution; no PDF | Kody |
| R13 | Subs in the client's copy: identities yes, bid ledger never | Leah |
| R14 | Permissions inside the room: not now | Kody |
| R15 | Sign and pay: offer after signature, never gate | Kody |
| R16 | Subs sign inside Patina by token link, no login; flow-down wording ships disabled pending counsel | Kody + Counsel |

### Wave 1 rulings

| # | Ruling |
|---|---|
| R17 | One source of truth per document — once parts exist, only `upsert_agreement_parts` may write `proposal_service_terms`/`_rates` (trigger, typed refusal, and revoked grants, belt and braces) |
| R18 | One part per money variant — the Add menu can't offer a duplicate; readiness reports it as a blocker |
| R19 | Standard parts keep stable `patina.*` keys; a custom prose part never projects |
| R20 | Money projection by kind + variant accepted as built (deviation from the build sheet's §6.2 cases 6–7, ruled not silent) |
| R21 | "Not yet set" survives composition; a composed body never prints $0/0% for an unset money part; empty parts render nothing |
| R22 | The fee floor lives in the database — `_agreement_fee_unnamed` asked at save/send/sign/paper-issue for a client-visible fee schedule part |
| R23 | One data layer — designer portal uses `@patina/supabase` hooks, app-local duplicates deleted |
| R24 | Composition is reversible — "Return to the seven facets" (draft only) calls `discard_agreement_parts` |
| R25 | The homeowner reads parts only — `composed: boolean` on the bundle, never falls back to `serviceTerms` |
| R26 | The e2e assertion is real — a seed file creates one composed agreement for the test studio |
| R27 | One copy constant, both surfaces — designer preview and client body share `AGREEMENT_PART_COPY` |
| R28 | Nothing the designer didn't type prints as a term — `materialize_standard_parts` seeds money only from a designer-set value (amended: a saved billing cadence counts as chosen) |
| R29 | The two-click duplicate-variant path is covered by a jest case proving readiness blocks and Save is disabled |

### Hotfix R30

| # | Ruling |
|---|---|
| R30 | The origin agreement reaches the homeowner — the zero-project door reads pending `design_services` proposals through the existing bundle and renders at `#door`; the kept record's date reads from the client's own signature row, never `proposals.signed_at` |

### Wave 2 rulings

| # | Ruling |
|---|---|
| R31 | Never drop a hardened arity — old arities become thin delegating wrappers with their original grants intact; the grants generator emits one guarded statement per function |
| R32 | The Library belongs to the agreement's studio (project's studio, else the lead designer's ordered active studios), never an arbitrary one for a two-studio owner |
| R33 | Only client-visible fee parts project into terms/authority; the room says "This fee is hidden from your client, so it cannot bill." |
| R34 | The addendum's `why` is client-visible and renders beside the change, on the door and the keepsake |
| R35 | The template picker filters by document kind, not template class — all three seeded templates reachable on a services paper |
| R36 | The record's consent sentence comes from the signature row's `consentSentence`, not re-derived |
| R37 | Deploy notes accepted: `retainer_credit_rule` backfill, `patina.deposit` shape, `copy_agreement_parts_from_authority` test, keepsake/live parity, escaped filter values |
| R38 | No ruling ids in the studio's face — the chip reads "record only", never "(R9)" |
| R39 | Hiding a part gets an act in Wave 3 — R33 stands as defence-in-depth until then |

### Wave 3 rulings

| # | Ruling |
|---|---|
| R40 | One consent sentence, composed from the client-visible projection, on both the door and the record |
| R41 | The closed-book door reads `scheduleOfValues`/`contractSumCents` off the redacted projection, never `costLines` |
| R42 | Lien waivers go through `record_agreement_draw_lien_waiver` exactly — no direct insert |
| R43 | Closed book means studio-authored schedule-of-values lines, never derived from cost lines |
| R44 | One `packages/types/src/agreement.ts` — the designer lane's superset carries every earlier export byte-identical (verification only) |
| R45 | Pin `SET search_path` on the nine functions in 00578/00579 that lacked it |
| R46 | The sub lane executes — the trade e2e's fourth case runs against the reset stack; `/trade` joins the service-worker NetworkOnly list |
| R47 | A question from the origin door files to the agreement's own studio thread, keyed by proposal |
| R48 | The price is never hidden — no hide act exists on `pricing_basis`/`draws`; the RPC and the send door both refuse a hidden price |
| R49 | No double count (supervision fee vs. sub markup) gates the send, named against the pricing basis and every clause carrying a supervision fee |
| R50 | The post-signature receipt/deposit-offer/pay-link region survives a reload, re-derived from the bundle, not client memory |
| R51 | The studio's live preview renders the same redacted projection the door does under closed book |
| R52 | The origin deposit invoice's `project_id` is adopted into the project at countersign, same transaction |

---

## 3 · What the walks proved

| Wave | Last round | Verdict | Money evidence |
|---|---|---|---|
| W1 | round 2 (`walk-web-r2.md`) | **ship — no blocker, no major** | A $24,000 ceiling (2,400,000 cents) countersigned into `project_billing_authorities` with a fingerprint (`465e04b1…`) matching the signature row exactly. A flat-fee agreement with no rate card and no ceiling — the shape round 1's M4 blocked — was sent, paper-signed, and countersigned into an uncapped authority (`billing_ceiling_cents NULL`, `get_project_authority_summary` → `remainingCents: null`, not `exhausted`). |
| W2 | round 3 (`walk-web-r3.md`) | **ship — no blocker, no major; all five round-2 fixes hold** | A per-phase fee schedule ($26,000 across three phases: Concept $8,000 / Design development $12,000 / Documentation $6,000) projected identically into both `proposal_service_terms` and `project_billing_authorities`, with a $24,000 ceiling beside it. The keepsake now matches the live page to the cent (`$24,000`, not `$24,000.00`; `Monthly`, not `monthly`) — the W2R2-05 divergence closed. |
| W3 | round 3 (`walk-web-r3.md`) | **ship — no blocker, no major survives; 12 of round 2's 18 findings closed, 9 minors/nits remain (5 already carried by ruling)** | Cost-plus with GMP: cost basis $71,300.00 · fee 18% ($12,834.00) · GMP $84,134.00. Draws at 10/30/40/20 with 5% retainage computed to the cent (net draws $8,413.40 / $23,978.19 / $31,970.92 / $15,985.46; final retainage release $3,786.03; paid across the schedule $84,134.00). The $8,413.40 deposit invoice survived a full page reload on every house the homeowner owns. Rough-in was billed at its **net** cents ($23,978.19), not the gross draw amount ($25,240.20) — the retainage hold working as designed. |

---

## 4 · What is owed to Kody

| # | Item |
|---|---|
| 1 | Create all three PostHog flags — `agreement-parts`, `agreement-library`, `design-build` — one at a time, and **verify each against `/flags` with a real-browser UA before enabling it** (a flag has matched everyone before: `threshold`, 2026-09-04). Every studio and homeowner surface described in §1 is dark until this happens. |
| 2 | A signed-in production walk of the designer's Contract Room, the Library (Save as template, materialize, the picker), and a turnkey (design-build) composition end to end. No signed-in walk of any kind has been performed in production for any of the three waves — every verification to date is unauthenticated probes, served-chunk greps, and object-level SQL. |
| 3 | A signed-in production walk as the origin homeowner, `f72d2912-c14b-4cea-ba6c-5726b14d502c` — the one decisive check the R30 hotfix exists to enable, and it has never been performed. Confirm her door renders the pending origin agreement and that she can hold to sign it. |
| 4 | A signed-in walk of a sub token (`/trade/[token]`) in production, sent to a real subcontractor — the Trade Agreement send, sign, and lien-waiver-recording path has been exercised only locally with a manually minted token (no Resend key locally). |
| 5 | Repoint `apps/designer-portal/.env.local` off the local Supabase stack. Every one of the four deploys (W1, R30 — not needed there, W2, W3) worked around this by exporting `wrangler.jsonc`'s production `vars` inline for one invocation; the file itself has never been fixed, and the next designer-portal deploy must repeat the workaround or hit the preflight refusal. |
| 6 | Fix the known `STRIPE_SECRET_KEY` account mismatch. No Stripe object has been created or paid in production against Wave 3's draw-invoice rail or deposit offer; the till returns `stripe_not_configured` locally and was worked around with `record_invoice_payment` during the walk, not real Stripe. |
| 7 | Counsel review before enabling any of the six seeded jurisdiction notices (WI, MN, IL, CA, NY, MA — R11) or the seeded flow-down clause on the Trade Agreement (R16). Both ship seeded and disabled by design; only counsel sign-off, then a super-admin toggle, turns either on. |
| 8 | Decide whether to republish the proposal Artifact. The original (`https://claude.ai/code/artifact/d1d0487b-0e7a-4963-ba49-a6703dfa4651`, "The Agreement, Composed", published 2026-09-06) has been deleted from the account; this program report and the rulings file are now the durable record of what it proposed and what was decided. |
| 9 | Rule W2R2-07: no designer act anywhere sets a part hidden from the client — the three add paths hard-code `clientVisible: true` and the only writer of a non-default value is a raw SQL `UPDATE` used to construct walk fixtures. R33 (only client-visible fees bill) is defence-in-depth against a state today's UI cannot create. Either authorize a "hide from client" act on the row menu, or rule that R33 stands as the guard for a state that stays SQL-only. |

---

## 5 · Carried to the main backlog

Every item a wave report or the rulings file explicitly carries forward, deduplicated, one
line each. None of these blocked its wave's ship.

### From Wave 1

| ID | What |
|---|---|
| — | `threshold.spec.ts:221` — seed-accumulation drift (`MULTI_OTHER_HOUSE_COUNT` expects 2, the mat renders 7); proved pre-existing and byte-identical on `origin/main` |
| — | `threshold.spec.ts:158` — timezone fragility (JS-local date math vs. a UTC-running Postgres); green only under `TZ=UTC` |
| — | designer-portal lint — 2 pre-existing errors (`piece-room-save-gate.test.tsx` missing `import/first` rule; `use-commercial-documents.test.ts` `rules-of-hooks`), byte-identical to `origin/main` |
| F3/F4/F5/F7 | The canned Services paragraph stays as today's default sentence; six commercial suites in `KNOWN_FAILURES.md` predate this wave |
| — | Two body implementations (SQL keepsake renderer + TSX component renderer) remain unmerged — first recorded here, recurs at every later wave |

### From hotfix R30

| ID | What |
|---|---|
| N1 | The origin door offers three acts, not four — "Ask a question" is withheld with no `projectId` |
| N2 | No error branch — an exhausted `useClientSafeProposals` retry falls to `ProjectsEmptyState` over the very agreement R30 exists to reach |
| R30-7 | The committed e2e signs through the RPC in `beforeAll`; nothing drives the hold gesture — a coverage gap |
| R30-12 | `partitionProposals(...)` is unmemoized in the component body, defeating two `useMemo`s below it — harmless at current sizes |
| N5 | `apps/client-portal/playwright.config.ts` pins `:3002` with `reuseExistingServer: true` — a concurrent lane's dev server can be silently exercised instead of this branch's build |
| — | The e2e harness's cleanup of throwaway households |

### From Wave 2

| ID | What |
|---|---|
| W2R2-02 | A project-bound, client-signed design-services agreement has no countersign route anywhere in the designer portal — pre-existing shape, seed-only today |
| W2R2-10 | axe `color-contrast` on `--color-aged-oak` (4.48:1 against a 4.5 floor) — 1 node in the Contract Room, 15 in Account → Studio |
| W2R2-11 | A checkmark (✓) glyph as a status indicator in Account → Studio's setup checklist — the one vocabulary-rule hit across both portals |
| — | Account → Studio's PARTS shelf prints a numeric count, against the no-count-chip vocabulary rule |
| W2R2-03 | The build sheet's rollback line says "flag off reverts every surface"; the client body's real switch is the bundle's `composed` key, not a flag — doc correction owed |
| C3-10 | `apps/client-portal/src/lib/commercial-documents.ts` keeps a local `AgreementExecutionSnapshot` duplicate of the `@patina/types` one — redundant, not divergent, worth deleting |
| — | `upsert_agreement_parts` validates `sourcePartId` as a UUID shape only, never as belonging to this agreement's studio — closed at the UI by R32, the RPC-level check is still owed |
| — | `agreement-library-card.tsx` on Account → Studio still resolves its studio via `useOrganizations`, not R32's resolution — a two-studio owner can see an arbitrary shelf there |
| — | The legacy-grants generator still omits 00511's statements for a signature dropped then re-created later in the same file — net ACL correct, the rule is approximate rather than exact |

### From Wave 3

| ID | What |
|---|---|
| R3-6 | A spent trade-agreement-link receipt expires at 30 days and the two doors then disagree |
| R3-7 | The sub-disclosure mode is read off any clause part, unfiltered by `part_key` |
| R3-8 (backend) | The client redaction is a denylist, not an allowlist |
| R3-9 (backend) | A `'studio'` signature party is never written |
| R3-10 | A `FOR ALL` policy sits over a SELECT-only grant |
| R3-11/R3-14/R3-20 | Banner citation drift (RC-10's answer) |
| R3-12 | `materialize_agreement_template` clears rather than restores the lifecycle GUC |
| R3-13 | A dead `service_role` grant on the draw ledger |
| R3-17/R3-18/R3-19 | The CA notice's class, `int4` money on a construction class, a per-row disclosure lookup inside the bundle's aggregate |
| D17 | The studio's live preview still prints "Recorded with your agreement." for `pricing_basis`/`draws`/`allowances` |
| D18 | R39's hide toggle can hide the pricing basis and nothing refuses it |
| D19 | The deposit draw cannot be billed from the studio surface |
| D10/D11/D13/D20/D21, m1–m13 | Designer round-2 minors, ungrouped |
| M1–M9, N-a…N-o | Client minors/nits, notably **M4** (a derived "Contract price" label on a `cost_plus` prime) and **N-i** (an unset draws part says "Recorded with your agreement." where R21 rules it should say nothing) — both need one ruling covering the SQL keepsake and the TSX body together |
| Sub R3-8 | The sub e2e asserts only one of three guest-surface headers |
| Sub R3-9 | The outcome allowlists are pinned against invented shapes rather than 00579's literal answers |
| Sub R3-11…R3-15 | Ungrouped sub-lane minors |
| — | Designer E2E-1 (`playwright.design-build.config.ts`) was never run in this program |
| R3-15 (backend) | `env.md`'s piped `pg_dump \| psql` scratch-DB recipe silently produces a constraint-free clone under libpq 18.4 (also a Lesson, below) |
| — | THE PAPERS sheet still holds nothing for a houseless signed prime — only the doorstep shows it |
| — | The designer's turnkey preview shows authored draws, not the ledger's cents — a second place the same schedule is stated |
| — | `patina.notice_of_cancellation` sits on the rail with no body and no way to fill it until counsel enables a state |
| — | `_agreement_design_build_part` still reads the authored row; `client_visible` is enforced by refusals around it, not by the reader |
| — | A signed origin door now stands on every house until countersign — a household with three houses sees the same paper, receipt, and deposit offer three times |
| — | The deposit offer's `payToken` crosses the client bundle on every load — a bearer credential in a wider surface than a one-time response |
| — | A second direct thread (agreement-keyed vs. plain) can exist between a homeowner and her designer; whether the inbox should distinguish them is not ruled |
| W3R3-01 | The no-double-count rule is named everywhere but the two offending fields lack an error state, and Review & send is not disabled on it — the send is blocked by a refused save, not an unavailable act |
| W3R3-03 | Hiding a fee moves the readiness count with no sentence explaining why (one layer down, in the send sheet, the reason is present) |
| W3R3-04 | With all three flags off, a turnkey document opens the seven-facet design-services form instead of a kind-aware read-only notice |
| W3R3-05 | The countersigned house is named from `proposals.title`, so a turnkey house can be titled "…design services agreement"; the rename act is a build, not a copy fix (Wave 4) |
| W3R3-07 | The adopted deposit invoice is invisible on the studio's own project Money region |
| W3R2-10 | No route back to the executed agreement's text for the homeowner from the house (the keepsake exists; a link from the house is Wave 4) |
| — | axe `color-contrast` (aged-oak) and `meta-viewport` on the turnkey Contract Room |
| — | The checkmark glyph in Account → Studio's checklist (recurs from Wave 2) |
| W3R2-18 | Build-sheet §8 steps 5, 9, 13, 16 still describe pre-ruling behavior — documented, not amended |
| W3R2-07 | Contradictory status chips on a client-signed document (`proposal-watch.tsx` reads `proposals.status`, still `sent` until countersign by design since 00331) — **not fixed**; the rulings file's "fixed" line is wrong, corrected by W3R3-06 |
| W3R2-16 | A revoked-but-unspent `/trade/<token>` renders the 404 page at HTTP 200 — **not fixed**; same correction |

---

## 6 · Lessons

| Lesson | What happened |
|---|---|
| The 5-lane integration brief overflows one steward | Wave 3 merged five lanes (backend, edge, designer, client, sub) at once; the integration steward stopped before running any gate. A separate close-out agent had to both answer the R40–R47 rulings and re-run the entire gate list in the same pass — a heavier hand-off than Waves 1–2's three-lane merges needed. |
| The grants-seed single-statement trap | `00-legacy-grants.sql` replayed 00511's hardening as one `REVOKE` naming seventeen functions, wrapped in a `DO … EXCEPTION WHEN undefined_function THEN NULL END`. Wave 2 dropped one of the seventeen signatures; the whole statement raised, the exception swallowed it, and the other sixteen went un-hardened on every fresh reset — three SQL suites failed for one root cause. Fixed by R31 (one guarded statement per function) and refined once more (W2RG-02) after an unrelated function name ending in `_to` broke the original regex's scan. |
| `pg_dump` on Postgres 18 | `env.md`'s piped `pg_dump \| psql` scratch-database recipe silently produces a constraint-free clone under libpq 18.4 — all three lanes validated Wave 2's migrations against exactly this kind of clone, which is why none of them caught the grants-seed regression above. The corrected form is `pg_dump --no-owner -Fc` piped to a serial `pg_restore`, with `pg_constraint`'s row count checked before trusting the clone. |
| `db:generate` truncation | `pnpm db:generate` truncates `packages/supabase/src/database.types.ts` to 0 bytes whenever `SUPABASE_DB_URL` is unset *or* the Supabase CLI can't reach Docker (i.e., running sandboxed) — the shell redirect opens and truncates the target file before the command can fail. It fired at least three times across this program; recovery each time was `git checkout --` followed by an unsandboxed, `SUPABASE_DB_URL`-exported re-run. |
| StrictMode ate the first-open rail | A freshly opened Contract Room called `materialize.mutate(undefined, { onSuccess })`; React Query v5 drops a mutation's inline callbacks when its observer unmounts before the mutation settles, and `reactStrictMode: true` unmounts every component once on mount — so the nine seeded rows never painted until a reload, on every fresh draft, for two full walk rounds (W1 M5, closed as W-01 in Wave 2). Confirmed dev-only: a production build painted all nine rows on the first open. The durable fix renders the rail from the invalidated query, never from a one-shot mutate callback. |
| `localhost`, never `127.0.0.1`, on Next 16 | Booting either portal's dev server and driving it via `http://127.0.0.1:3000` failed the HMR WebSocket handshake outright — React never hydrated, and every click was inert for twenty seconds of retries. `http://localhost:3000` worked identically. This cost a full boot cycle in the Wave 1 walk (N6) before the walk-env recipe was corrected. |
| The flag override needs `studio-workspaces` too | Account → Studio — and with it the Agreement defaults and Library cards — is gated behind a second, independent fail-closed flag, `studio-workspaces`, on top of `agreement-parts`/`agreement-library`. `NEXT_PUBLIC_FLAG_OVERRIDES` has to name both or the Studio tab never renders at all; this cost the Wave 1 walk a boot cycle (N8) before the recipe named both. |
