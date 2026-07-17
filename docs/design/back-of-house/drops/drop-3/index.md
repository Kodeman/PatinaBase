# Drop 3 — the Exception Desk, Settlement & the Leah rule (S7)

**Back of House · screenshot drop for design authority · 2026-07-17**

The final build slice: the Exception Desk (case files with a dominant clock,
evidence to R2 via a tokenized client link, and resolution paths written as
sentences whose ledger consequence shows in mono **before** commit),
Settlement (the three-way match with the T3 + pledge (+ T6) posting projected
before commit), and the Leah substitution rule (a second card source on the
existing Mission Control deck). Built on S6's ledger (00360–00363) which gates
this slice.

- **Branch:** `boh/s7-exceptions` off `origin/boh/integration` @ `b348049b`
  (integration tip unchanged under this wave). Migrations **00364** (head was
  00363, no collision). Worktree `.claude/worktrees/agent-boh-s7`.
- **Viewports:** 1440×900 (desk views 01–03) and 390×844 (the Leah card, 04) —
  full-page PNGs for the desk views, viewport PNGs for the two dialog/card
  captures.
- **Feel authority:** `docs/prds/back-of-house-presentation.html` (Exception
  Desk / the Leah rule / the Money sections). Spec §5.5 + §8 (normative).
- **Generator:** `apps/admin-portal/e2e/boh-drop3-screens.spec.ts` — a
  READ-ONLY capture pass (it opens dialogs, never commits/approves), run in
  isolation against a freshly reset + reseeded stack so its own behavioral
  siblings (`boh-exceptions.spec.ts`, `boh-leah-mobile.spec.ts`) haven't
  resolved the seeded fixtures first.
- **Ignore the two corner glyphs** (a small "N" bottom-left, a colored disc
  bottom-right) — local dev-mode overlays, not part of the UI; they do not ship.

## Seed-state recipe (how to reproduce these exact pixels)

```bash
# local stack only — verify DB URL = 127.0.0.1:54322, never Strata
cd supabase && supabase db reset                          # migrations 00001→00364 + reference seeds
supabase functions serve --env-file functions/_tests/test.env --no-verify-jwt   # terminal 2
cd .. && SUPABASE_SERVICE_ROLE_KEY=<local HS256 service key from vault> pnpm seed:fulfillment   # 5 orders through the intake fn
psql "$LOCAL_DB" -f scripts/seed-fulfillment-fixtures.sql             # +4 S1/S3 band fixtures
psql "$LOCAL_DB" -f scripts/seed-fulfillment-exceptions.sql           # +the S7 damage/substitution/settle fixtures
# apps/admin-portal/.env.local → NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
#   + the matching local HS256 anon/service-role keys + NEXT_PUBLIC_ENABLE_FULFILLMENT=true
cd apps/admin-portal && npx playwright test boh-drop3-screens --project=chromium --workers=1
```

The three S7 fixtures (`scripts/seed-fulfillment-exceptions.sql`): **Amara
Brooks** (a delivered LTL order carrying an open **damage** exception — a 4-day
carrier-claim clock + three evidence keys; the case file), **Rowan Calloway**
(a delivered net-30 PO valued so a **$34** freight variance sits inside the
$54.60 tolerance — the settle-ready subject of the settlement dialog), and
**Elena Whitfield** (a **substitution** routed to Leah with a Bouclé
lot-44→lot-47 comparison card — the Leah deck card).

## Page inventory

| File | Screen | State |
|---|---|---|
| `01-exceptions-list.png` | Exception Desk list | Clock-dominant rows, clock-urgency sorted; the Brooks damage case and the Whitfield substitution (with-Leah) present |
| `02-case-file-mono-consequence.png` | Damage case file | Clock hero (`4 DAYS` carrier-claim window), evidence grid, resolution paths as sentences; "File a vendor / carrier claim" selected with the ledger consequence in mono BEFORE commit (`1100 Claims Receivable Dr $1,180.00` / `5200 Damage & Claims Cr $1,180.00`), cause-code + memo, Commit |
| `03-settlement-dialog.png` | Settlement dialog | Three-way match (PO value · vendor invoice · variance), a `+$34.00` in-tolerance variance, the projected T3 + freight true-up + 25% pledge posting in mono before commit |
| `04-leah-substitution-card.png` | Leah deck (mobile) | The substitution card: two swatches (specified vs proposed), the one-line difference, the `PRICE Δ · LEAD Δ · CLIENT` mono strip, full-width `← Pass` / `Approve →` |

## What S7 verified (the package accepts-when, as fact)

- **Preview == posted, proven by assert.** `fulfillment_exceptions.assert.sql`
  E1–E18 (wired into `pnpm test:boh-audit`): each damage T5 path's preview
  ledger lines equal the posted lines byte-for-byte on account+amount (E1–E3),
  the backorder-cancel T4 refund likewise (E9), and the settlement preview
  equals the posted T3+pledge+T6 set (E11); preview writes nothing (E4);
  cause_code is required on close (E5); substitution round-trips
  route→approve→resolved and reject→reopen (E7–E8); the delay path re-dates the
  ETA with no ledger (E10); the $34 variance auto-accepts while a
  beyond-tolerance one demands a typed reason (E11–E12); the tokenized evidence
  flow mints/validates/appends and rejects expired+revoked tokens (E13–E16);
  zero resolved exceptions lack a cause code or (financial paths) a ledger
  entry (E17); every entry posted balances (E18).
- **Full `test:boh-audit` green:** A1–A7 / Q1–Q7 / T1–T5 / L1–L23 / **E1–E18** /
  68 Deno tests (incl. the 12 new `fulfillment-evidence` tests and the
  substitution leak coverage in `fulfillment-notify`).
- **Live e2e (chromium):** `boh-exceptions.spec.ts` 4/4 (list, the mono
  consequence before commit, the `x`-key open→resolve, settlement in/out of
  tolerance through the UI) and `boh-leah-mobile.spec.ts` 1/1 (the substitution
  card appears at 390×844, Approve advances the deck and resolves the
  exception). The substitution approve drafted a `client_note.substitution.v1`
  client note (psql-verified, awaiting operator send).
- Builds: `@patina/admin-portal` and `@patina/client-portal` both green;
  `@patina/fulfillment` 158/158 vitest.

## Known deviations (flagged calls)

1. **Settlement preview is a separate read-only RPC, not a `p_preview` on
   `fulfillment_settle_po`.** The brief offered either a client-side money-strip
   computation or a `p_preview` added to the shipped settle RPC. Chosen: a new
   `fulfillment_settle_po_preview(po_id, vendor_invoice_cents)` that mirrors
   `ledger_post_t3_settle` + `ledger_post_t6_freight_trueup` line-for-line
   (zero-filtered identically). This keeps S6's asserted `fulfillment_settle_po`
   signature untouched (no risk to the L-walk / the shipped route) while still
   giving the preview==posted guarantee at the RPC layer — proven by assert
   E11. The tradeoff: the preview math is a second implementation that must
   track T3/T6 (guarded by E11 comparing it to the real posting).
2. **Evidence upload uses a direct server-side `storage.upload`, not a signed
   upload URL.** The repo has no `createSignedUploadUrl` idiom anywhere; the
   established pattern (field/[token]) is a token-gated server path that uploads
   directly with the service client. The client `/evidence/[token]` page posts
   files to the `fulfillment-evidence` edge function (verify_jwt=false,
   token-gated in-code), which uploads to **`project-documents`** under a
   `fulfillment/evidence/{exception_id}/` prefix (there is no dedicated evidence
   bucket — this matches the PO-PDF convention) and appends the keys via the
   token-gated `fulfillment_append_evidence` RPC (never the admin surface).
3. **Substitution gets its own client-note transition** (not reused
   `eta_change`). A price-Δ-$0 finish swap is not a delay, and `eta_change`'s
   subject/push copy is delay-flavored; a dedicated `substitution` transition +
   renderer was added to the single template source (`fulfillment-templates.ts`,
   mirrored in `@patina/fulfillment/notify.ts`), auto-covered by the leak test's
   transition loop. The client-safe substitution copy is composed in the
   leah-review rule route (it names the item + the plain-language difference,
   never a vendor).
4. **The damage fixture lives on its OWN delivered LTL order (Brooks), not the
   S1 delivered fixture** — an open exception on the S1 delivered order would
   flip it out of the Quiet band that the zero-invisibility `Q5` assert pins;
   Brooks · LTL · concealed damage also matches the presentation's DMG-0031.
5. **The evidence grid renders labelled placeholder tiles** (IMG 01/02/03) when
   a signed URL 404s — the fixture seeds evidence keys without uploading files,
   which is honest and matches the presentation's placeholder look. A real
   client upload (through the token flow) produces real thumbnails.

## Open, unchanged from prior drops

- **Needs Action Now still reads crowded** (Drop 1, R3.3 ratified as landed).
- `fulfillment_update_shipment_eta` still has no standalone operator ETA-slip
  UI (Drop 2 / I11 note); S7's `delay_redate` resolution path now DOES call it
  from the exception desk, which is the first portal surface to write it.
