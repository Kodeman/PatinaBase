# Wave 1 — RE-GATE after the carry-fix

**The Agreement, Composed** · Wave 1 (*loosen the room*) · 2026-09-06/07
Reviewer: re-gate lane. **I did not write this code.**

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration`

```
$ git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration rev-parse --show-toplevel
/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration
$ git rev-parse HEAD
bf86b5dc510f30795bcabddec9d1a749298fad71
$ git branch --show-current
agreement/w1-integration
```

**Verdict: NOT gate-clean.** Every gate is green, both reviewer probes now
refuse, and R18 / R19 / R20 hold as ruled. **R17 is delivered in the database
and half-delivered in the room**: the ruling's second clause — *"the flag-off
seven-facet room … disables Save"* — is not implemented. One further major of
the same class the carry-fix set out to close (the designer's live preview
disagreeing with the homeowner's page) is open. Neither costs data integrity;
both are ruled or preview-honesty gaps. Details in §4.

---

## 1 · The stack is at the carry-fix head, and this is how that was established

The shared local stack was **not reset**. `schema_migrations` alone proves only
a number, and `00575` was edited in place by the carry-fix lane — so the applied
**bodies** were compared to the file, all eighteen of them:

```
$ psql … -c "select version from supabase_migrations.schema_migrations order by version desc limit 8"
 00575 / 00574 / 00573 / 00572 / 00571 / 00569 / 00568 / 00567

$ python3 …  # every CREATE OR REPLACE FUNCTION body in 00575 vs pg_proc.prosrc
functions defined in 00575: 18
MISMATCH (file body not found in applied prosrc): none
```

Spot probes for the four carry-fix edits, read out of `pg_proc` rather than the
file:

| Marker | Function | Applied |
|---|---|---|
| B-7 `SET document_kind = 'design_services'` | `materialize_standard_parts` | `t` |
| R3-5 `COALESCE(v_terms.furnishings_deposit_percent, v_defaults.deposit_percent)` (no literal 50) | `materialize_standard_parts` | `t` |
| B-9 `'effectiveAt', r.effective_at` | `materialize_standard_parts` | `t` |
| B-9 `'effectiveAt', NULLIF(e.rate->>'effectiveAt', '')` | `upsert_agreement_parts` | `t` |
| B11 `is required is a yes or a no` | `upsert_agreement_parts` | `t` |
| B-8 `'parts', '[]'::jsonb` | `get_client_commercial_document_bundle` | `t` |

The stack is the carry-fix tree.

---

## 2 · The reviewer probes, re-run independently

Written fresh for this re-gate rather than read off the lane's suite —
`/private/tmp/claude-501/regate/regate-probe.sql` (the lane's fixture prologue,
lines 47-188 of `agreement_parts_test.sql`, plus my own assertions), run against
the live stack in one transaction that ends `ROLLBACK`.

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f /private/tmp/claude-501/regate/regate-probe.sql ; echo "RC=$?"

NOTICE:  SETUP: composed — ceiling 2400000 / biweekly / 22500
NOTICE:  P16 REFUSES: This agreement is composed from parts. Open it in the
         Contract Room with parts on to change it.  [DETAIL agreement_composed]
         — nothing moved
NOTICE:  P3b (authenticated) REFUSES: permission denied for table
         proposal_service_terms [42501]
NOTICE:  P3b (table owner) REFUSES: This agreement is composed from parts. Open
         it in the Contract Room with parts on to change it.
         [DETAIL agreement_composed]  — the cap still reads 2400000
NOTICE:  CONTROL: the seven-facet room still authors an uncomposed agreement
         (ceiling 500000)
ROLLBACK
RC=0
```

**P16** — the flag-off door (`upsert_design_services_draft`), called by a
co-member of the same studio over a composed draft, is refused with the ruled
sentence and the ruled `agreement_composed` DETAIL. The probe then re-reads the
row: ceiling still 2,400,000, cadence still biweekly, the rate card still
22,500, the five parts untouched. The round-3 divergence (a page signed at
$24,000/biweekly against an authority of $5,000/monthly) is unreachable through
this door.

**P3b** — run twice. As the reviewer originally wrote it, a co-member with plain
SQL as `authenticated` now gets `42501 permission denied` (R17(c) took the
grant). Escalated to the **table owner**, past RLS and past the ACL, the
trigger refuses in the same sentence with the same token and the cap still
reads 2,400,000. The cap cannot be erased.

**Control** — an *uncomposed* agreement is unmoved: the seven-facet room still
authors it (ceiling 500,000). The refusal is scoped to composition, not to the
door.

The three R17 walls, read in the migration:

- (a) `guard_agreement_projection_write` (00575:2273-2318) — BEFORE
  INSERT/UPDATE/DELETE on **both** projection tables, keyed on the
  transaction-local GUC `app.agreement_projection`, which only
  `upsert_agreement_parts` sets and immediately restores (00575:2752/2754/2775,
  plus the `EXCEPTION WHEN OTHERS` restore).
- (b) the typed refusal in `upsert_design_services_draft` (00575:2104-2110),
  standing **after** the access and kind checks so a stranger still learns only
  "access denied".
- (c) `REVOKE INSERT, UPDATE, DELETE … FROM authenticated, anon` on both tables,
  `GRANT SELECT` kept (00575:2333-2338).

I re-checked (c)'s premise myself: no product code writes either table. Every
hit across `apps/`, `packages/`, `supabase/functions/` and `services/` is a
`.select()` — `use-commercial-documents.ts:396,401`,
`commercial-document-notify/index.ts:363` — plus one e2e fixture insert that
runs as service_role against a proposal with no parts yet. In the database,
`prosrc` regex over every `public` function finds exactly two writers:
`_project_agreement_terms` (the projection) and `create_service_addendum`, which
writes only the **new** addendum proposal — which carries no parts, so the
trigger lets it through and the addendum path is not broken by R17.

---

## 3 · The ruled items R17-R21, verified against the diff

### R17 · One source of truth per document — **(a) and (c) hold; (b) is half-delivered**

(a) and (c) are quoted above and proved by §2. (b) is delivered in the database
and **not** in the room.

The ruling: *"…and the flag-off seven-facet room shows it as one plain sentence
… **and disables Save**."*

The sentence does reach her — the room prints the RPC's `error.message` verbatim:

```tsx
// service-agreement-drafting-room.tsx:262-269
    } catch (error) {
      setSaveNote(
        error instanceof Error
          ? error.message
          : "The agreement could not be saved.",
      );
```

Save is never disabled:

```tsx
// service-agreement-drafting-room.tsx:345-351
              <Button
                onClick={() => void persist()}
                loading={save.isPending}
                disabled={!dirty}
              >
                {dirty ? "Save agreement" : "Saved"}
              </Button>
```

`grep -n "parts\|composed"` over the whole file returns only the flag branch and
its comments — the flag-off room never reads the composition. It could have:
`fetchCommercialDocumentBundle` already puts `parts` on the bundle
(`use-commercial-documents.ts:148 / :416 / :444`) and the flag-off editor is
handed `bundle.data`. See finding **F1**.

### R18 · One part per money variant — **holds**

The Add menu is filtered against the composition, not rendered unconditionally:

```ts
// part-kinds.ts:174-200
export const SINGLE_INSTANCE_VARIANTS: Record<string, string> = {
  rate_card: "rate card", ceiling: "ceiling", retainer: "retainer",
  cadence: "billing cadence", procurement: "furnishings deposit",
};
export function addPartOptions(parts: AgreementPart[]): AddPartOption[] {
  const taken = takenSingleInstanceVariants(parts);
  return ADD_PART_OPTIONS.filter(
    (option) => !(option.variant && taken.has(option.variant)),
  );
}
```

wired at `parts-rail.tsx:119` — `<AddPartMenu options={addPartOptions(parts)} …>`.
Readiness reports the duplicate in the RPC's own words:

```ts
// readiness.ts:113-116
  for (const duplicate of duplicateMoneyVariants(parts)) {
    for (const partId of duplicate.partIds.slice(1)) {
      add(partId, `An agreement carries only one ${duplicate.label}.`);
```

and the five labels are term-for-term the DB's own (`00575:2597-2618`:
`'rate card' / 'ceiling' / 'retainer' / 'billing cadence' /
'furnishings deposit'`, `an agreement carries only one %`). The rail offers no
duplicate action (`onRemove` is its only row act), so no path from the room adds
a second money part. `agreement_parts_test.sql` PASS 22 covers the refusal.

### R19 · Standard parts keep stable keys — **holds**

`createBlankPart` mints `custom.<uuid>` **only** for parts the designer adds
(`part-kinds.ts:238-263`); `materialize_standard_parts` seeds the nine
`patina.*` keys as literals (`00575:2947-2985`) and nothing re-keys them. The
prose projection reads by key **and** asserts the kind, so a `custom.<uuid>`
clause never projects:

```sql
-- 00575:2659-2691
    'scope', COALESCE((
      SELECT ap.payload->>'body' FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.services'
        AND ap.kind = 'clause'
    ), ''),
    … 'deliverables' … part_key = 'patina.deliverables' AND ap.kind = 'list'
    … 'exclusions'   … part_key = 'patina.exclusions'   AND ap.kind = 'list'
    … 'terms'        … part_key = 'patina.terms'        AND ap.kind = 'clause'
```

The parity assertion the ruling names is live:
`agreement_parts_projection_test.sql` → `PASS 1-4: both doors write one
indistinguishable money row`, and `PASS 8: a standard key only projects when the
part has its shape (R5)`.

### R20 · Money projection by kind + variant — **holds, and is recorded**

The five money figures read `ap.kind = 'schedule' AND ap.variant = …` under any
key (`00575:2692-2716`). The build sheet carries the amendment rather than a
silent deviation:

```
build-sheet.md:620   6. **AMENDED BY RULING R20 (2026-09-06).** Derive the FOUR
                     PROSE slots by `part_key` and the FIVE MONEY figures by
                     **kind + variant**, under whatever key the composition gave
                     them, and refuse a second part of any money shape.
build-sheet.md:1096  | 6 | **AMENDED BY R20.** … *(Original: "the terms row is
                     unchanged (R5: only the nine standard keys project)".)*
build-sheet.md:1097  | 7 | **AMENDED BY R20.** … *(Original: "still no
                     projection from it; the `patina.ceiling` value stands".)*
```

Each carries the sentence it replaced. `PASS 6-7` in the projection suite is the
executable half.

### R21 · "Not yet set" survives composition — **the ruled sentence holds; a preview divergence of the same class is open**

The **homeowner's body** — what the ruling names — is correct.
`apps/client-portal/src/components/agreement-parts-body.tsx`:

- `isWritten` (`:62-64`) excludes zero, and Ceiling / Retainer / Flat print
  `<NotYetSet />` for a zero figure (`:186-190`, `:201-215`, `:272-280`);
  the retainer withholds the activation sentence with the figure.
- a zero-percent deposit draws no term (`:238-240`, `:249-251`).
- empty clause and empty list render **nothing at all**: the leaf is `null`
  (`:96-118`) and `PartSection` drops the whole section — `if (leaf === null)
  return null;` (`:359`).

The designer's live preview took the money half in the carry-fix:

```tsx
// designer agreement-parts-body.tsx (carry-fix diff)
+function isWritten(cents: number | null): cents is number {
+  return cents !== null && cents > 0;
+}
+function NotYetSet() {
+  return (
+    <p className="font-heading text-[1.05rem] italic text-[var(--text-muted)]">
+      {AGREEMENT_PART_COPY.notYetSet}
+    </p>
+  );
+}
…
+      if (!isWritten(cents)) return <NotYetSet />;          (ceiling)
+      if (!isWritten(cents)) return <NotYetSet />;          (retainer)
-      if (percent === null && extras.length === 0) return <RecordedLine />;
+      if (!isWritten(percent) && extras.length === 0) return <RecordedLine />;
+      if (!isWritten(cents)) return <NotYetSet />;          (flat)
```

It did **not** take the empty-clause/empty-list half. See finding **F2**.

The readiness half of R21 is present: the R4 floor reads only client-visible
parts (`readiness.ts:222` — `const clientFacing = parts.filter((part) =>
part.clientVisible !== false)`), `namesAFee` requires a typed money part
(`:228-238`), and the ceiling question is asked over both scopes
(`:250-277`) so the room holds on whichever floor is lower.

---

## 4 · Findings

Every finding, with severity and confidence. Nothing here is filtered.

### F1 · **major** · 1.00 · R17(b)'s room half is not implemented — the flag-off Save is never disabled

Ruled: *"the flag-off seven-facet room shows it as one plain sentence … and
**disables Save**"*. Implemented: the sentence, only after the refusal. Save
stays enabled forever (`service-agreement-drafting-room.tsx:348 disabled={!dirty}`),
and no line of the flag-off branch reads the composition.

**Reachable state.** `agreement-parts` is a per-person PostHog flag, so a studio
holds one member inside it and one outside — that asymmetry is the entire
premise of probe P16. The co-member outside the flag opens a composed agreement,
sees the seven facets filled from the projection, retypes any of them, presses
**Save agreement**, and gets the work thrown away with one line of muted 11px
text. "Review & send" is worse: it calls `persist()` first (`:271-274`), so the
send sheet never opens and the note is the only explanation.

No money moves and nothing is corrupted — that is what walls (a) and (c) are
for. This is the courtesy half of the ruling, and it was the half that told her
where to go.

**The fix is small and the data is already there.** `bundle.data.parts` is
loaded for every document (`use-commercial-documents.ts:148 / :416 / :444`) and
`ServiceAgreementEditor` is handed the bundle. Passing `composed = parts.length > 0`
into the editor, disabling the Save and Review buttons on it, and seeding
`saveNote` with `AGREEMENT_PART_COPY`'s copy of the same sentence closes it.
Flag-off byte-identity is not at risk: an uncomposed document has no parts and
renders exactly as today, and the ruling itself asked for this behavior.

### F2 · **major** · 1.00 · The designer's preview prints a naked heading where the homeowner's page prints nothing (R21 / R3-6)

The carry-fix closed exactly this class for money — *"the preview prints what the
homeowner will read"* — and left the clause/list half open.

Designer (`apps/designer-portal/src/components/document/commercial/agreement-parts-body.tsx:329-336`):

```tsx
      {sections.map((part) => (
        <section key={part.id} data-part-key={part.partKey}>
          <PartHeading>{part.title}</PartHeading>
          {renderPartBody(part, currency)}
        </section>
      ))}
```

`renderPartBody` returns `null` for an empty clause (`:101`) and an empty list
(`:111`) — so the section survives with its heading and nothing under it.

Homeowner (`apps/client-portal/src/components/agreement-parts-body.tsx:96-118`,
`:342-359`): the leaf is `null` and `PartSection` returns `null`, so the section
is not printed at all.

**Reachable on the first composed agreement.** `materialize_standard_parts`
seeds `patina.exclusions` from `v_terms.exclusions` and `patina.terms` from
`v_terms.terms`; a design-services agreement with no exclusions written, or no
extra terms, seeds an empty list and an empty clause. The designer previews
"Exclusions" as a section of the page; the page the homeowner signs has no such
section.

**And a test pins the wrong behavior.**
`agreement-parts-body.test.tsx:290-316` — *"keeps the heading of a part with
nothing written in it"* — asserts `getByRole("heading", { name: "Exclusions" })`
under `payload: { items: [] }`, with the comment *"The client shell prints the
heading either way — a part the studio kept is a part the client can see is
there."* That comment is false for `clause` and `list`; the client shell drops
both. (Its Retainer half is correct: an unset retainer does print heading +
"Recorded with your agreement." on both surfaces. The rate-card half is correct
too — both surfaces print an empty rate card's heading.) The fix is the section
guard plus flipping the clause/list half of that test.

### F3 · **minor** · 0.95 · `carry-fix-notes.md` overstates the shared-sentence fix

The notes say the sentence *"moved into `AGREEMENT_PART_COPY.notYetSet` so
neither surface can drift by retyping it."* Only the designer reads the
constant. The client hardcodes the literal:

```tsx
// apps/client-portal/src/components/agreement-parts-body.tsx:91-93
function NotYetSet() {
  return <p className="type-data-large mt-2 italic text-[var(--text-muted)]">Not yet set</p>;
}
```

That is a deliberate house style there (the file's own header, `:22-23`, says
the money helper is "kept local rather than imported because the shell imports
THIS module"), and the two strings are identical today — so this is a docs
accuracy defect, not a behavior one. The claimed guarantee does not exist.

### F4 · **minor** · 0.75 · Readiness accepts a lone Ceiling as "names a fee"

`readiness.ts:59` — `const FEE_VARIANTS = ["rate_card", "flat", "per_phase",
"ceiling"]`. An agreement whose only typed money part is a Ceiling therefore
passes the R4 "this agreement names no fee" floor, though a ceiling is a cap on
a fee and not a fee. Not a ruled item, and it sits next to the standing backend
advisory **M1-new** (the DB floor asks the ceiling question and nothing else) —
recording it so the pair is ruled together rather than each one separately.

### F5 · **minor** · 1.00 · `pnpm db:generate` silently empties a committed 35,701-line file when `SUPABASE_DB_URL` is unset

Observed in this session. The script is
`supabase gen types typescript --db-url "$SUPABASE_DB_URL" > src/database.types.ts`
(`packages/supabase`), so the shell truncates the target **before** the CLI runs;
with the variable unset the CLI fails and `packages/supabase/src/database.types.ts`
is left at 0 bytes. Restored here with `git checkout --`, and the gate re-run
correctly with `SUPABASE_DB_URL` exported (§5). Repo hygiene for the main
backlog — a `set -o pipefail`-style temp-file-then-`mv` would make the failure
non-destructive. Not this wave's to fix.

### F6 · **advisory** · 1.00 · `scripts/run-sql-tests.sh` needs an unsandboxed shell here

`mktemp -d` in the default `TMPDIR` fails with `Operation not permitted` under
the tool sandbox, and the runner then reports the misleading
`error: no .sql files found under …/supabase/tests`. Re-run unsandboxed it is
fine. Environment note for the next steward, not a defect in the wave.

### Standing, unchanged

The wave report's §7 advisories are unchanged by this re-gate: backend
**M1-new**, **M2** (the package's `use-agreement-parts.ts` is still unimported),
**M3**, client **F-1/F-2** (`composed` still has no producer — grep confirms the
only hits are the client's own adapter and its test), **F-4**, designer **N1**.
The Addendum advisory is confirmed at the source: `create_service_addendum`
copies the terms row and the rate rows to the new proposal and copies **no
parts**, so an addendum arrives uncomposed and authored by the seven-facet room.

---

## 5 · Gates — every one re-run at `bf86b5dc5`, on this stack, in this worktree

| Gate | Command | Result |
|---|---|---|
| SQL suites (all) | `./scripts/run-sql-tests.sh` (unsandboxed) | **rc=0** — total 162 · green 141 · expected-fail 21 · **unexpected-fail 0** · effective-green 162/162 |
| — R17 test (new) | `psql -v ON_ERROR_STOP=1 -f supabase/tests/commercial/agreement_parts_test.sql` | **PASS 1-35**, incl. `PASS 25: one source of truth — the flag-off door, the direct hand and the grant all refuse (R17)`, and 32 (B-7) / 33 (B-8) / 34 (B-9) / 35 (R3-5) |
| — projection | `… agreement_parts_projection_test.sql` | **PASS 1-9** — `PASS 1-4: both doors write one indistinguishable money row`, `PASS 9: the flag-off write path is byte-for-byte 00422` |
| — hardening contract | `… edge_api/public_sd_hardening_contract_test.sql` | PASS |
| — paper issue | `… commercial/design_services_paper_issue_test.sql` | PASS |
| — round-1's mystery red | `… commercial/direct_order_attribution_test.sql` | PASS |
| Reviewer probes | `psql -f …/regate-probe.sql` | **rc=0** — P16 and P3b both refuse (§2) |
| Generated types | `SUPABASE_DB_URL=… pnpm --filter @patina/supabase generate` then `git diff --exit-code packages/supabase/src/database.types.ts` | **rc=0 — in sync** |
| ACL seed | `python3 scripts/generate-legacy-grants.py` then `git diff --exit-code supabase/seed/00-legacy-grants.sql` | **rc=0 — byte-identical** (baseline + 2232 replayed statements) |
| `@patina/types` | `turbo build --filter=@patina/types --force` | 1 successful, uncached |
| `@patina/types` | `type-check` (`tsc --noEmit`) | clean |
| `@patina/supabase` | `type-check` (`tsc --noEmit`) | clean |
| `@patina/supabase` | `test` (vitest) | **87 files passed · 1068 passed \| 12 skipped** |
| designer-portal | `type-check` (`tsc --noEmit`) — the real gate | clean |
| designer-portal | **full** `test` (jest) | **523 suites passed · 6326 tests passed · 2 snapshots · rc=0** |
| client-portal | `type-check` (`tsc --noEmit`) — the real gate | clean |
| client-portal | `test:coverage` (floor 70/60/70/70) | **129 suites · 1995 tests passed** · All files **73.96 / 69.30 / 74.01 / 76.28** — over floor |
| admin-portal | `build` (unsandboxed) — the repo's strictest gate | **✓ Compiled successfully in 18.2s**, 137/137 static pages, full route table |

Every count matches the carry-fix lane's `wave-report.md` §9.1 claim exactly.

**Flag-off byte-identity, re-checked rather than assumed.** The only change to
the seven-facet room versus `origin/main` is the fail-closed flag branch, the
`next/dynamic` composer import (DR13), and `dollars(terms.billingCeilingCents ?? 0)`
— which preserves today's rendering, since the column was `NOT NULL` before F-2.
`service-agreement-preview.tsx`'s 246 changed lines are the `composed ? … : …`
wrapper plus re-indentation of the untouched else branch, with `ceilingIsSet`
gaining the `!== null` arm F-2 requires. The committed snapshot
(`__snapshots__/service-agreement-drafting-room.test.tsx.snap`, 559 lines, new
this wave and unchanged by the carry-fix) pins it and passes.

**Not run, and why.** designer-portal `lint` (2 pre-existing errors, ruled in
R21's last bullet; not on this lane's gate list), the designer agreement e2e and
the client e2e (the brief names the four e2e reds as pre-existing and out of
scope), edge-function `deno test` (`git diff --name-only origin/main HEAD --
supabase/functions/` is empty), and anything touching Strata or Cloudflare.

## 6 · What this lane did NOT do

- Did not reset or write to the shared local Supabase stack. The only writes
  were inside transactions that ended `ROLLBACK`.
- Did not push. No `supabase db push`, no `supabase functions deploy`, no
  `wrangler`. Strata was not contacted.
- Did not change any product code. The one accidental write —
  `packages/supabase/src/database.types.ts` truncated to 0 bytes by the
  `db:generate` redirect (F5) — was restored with `git checkout --` and the file
  is byte-identical to `HEAD` (35,701 lines, `git status` clean).
- Did not touch `.claude/`, `.agents/`, hooks, settings, or any `.env` file.
- Did not create or remove a worktree, and did not use SendMessage.
