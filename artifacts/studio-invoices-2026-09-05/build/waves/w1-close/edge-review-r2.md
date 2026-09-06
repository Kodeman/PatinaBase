# W1 edge lane — adversarial review, close round 2

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge`, branch
`studio-invoices/w1-edge`. Range reviewed `72ddcd213..HEAD`; the close round's
own work is `fdecb3e0c` (code + tests) and `312efc120` (notes).

```
$ git -C …/agent-si-edge rev-parse --show-toplevel
/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge
$ git -C …/agent-si-edge branch --show-current
studio-invoices/w1-edge
$ git -C …/agent-si-edge status --porcelain      →  clean
```

**Verdict: fix.** No blocker. Every one of the five brief items is delivered and
every prior-round finding C1-1, C1-2, C1-3 is genuinely closed (each re-proved
below by re-running the exact mutation that used to stay green). One major
remains: the C1-1 fix pinned the *argument* of `invoiceSubjectName` but not its
*result*, so the ruled-out phrase can be reinstated one character further out
with all 241 tests and `deno check` green. Shipped behaviour is correct today;
the gap is in the gate, and the fix is one assertion.

---

## Gates, re-run by this reviewer

```
$ deno test --allow-all --config …/supabase/functions/deno.json …/supabase/functions/_shared/
ok | 241 passed | 0 failed (1s)

$ deno test --allow-all --config …/deno.json …/create-checkout-session/ …/stripe-webhook/
ok | 35 passed | 0 failed (68ms)

$ deno check --config …/deno.json  (the five index.ts)
Check supabase/functions/invoice-send/index.ts
Check supabase/functions/invoice-reminders/index.ts
Check supabase/functions/stripe-webhook/index.ts
Check supabase/functions/invoice-check-intent/index.ts
Check supabase/functions/create-checkout-session/index.ts

$ ls deno.lock supabase/functions/deno.lock
"deno.lock": No such file or directory (os error 2)
"supabase/functions/deno.lock": No such file or directory (os error 2)
```

## Brief items — delivered

| # | Item | Evidence |
|---|---|---|
| 1 | W5-1 SELECT pin | `invoice-subject.test.ts:205-216`. Mutation L (drop `studio_id, title` from invoice-send's SELECT) → `FAILED | 14 passed | 1 failed`. |
| 2 | W5-2 webhook lookup error | `stripe-webhook/index.ts:288,304-306`; pinned at `invoice-subject.test.ts:232-247` (source seam — the function is behind `Deno.serve`, so no unit seam exists; the notes say so). |
| 3 | W5-6 no last-resort name | Rendered: `NO-NAME SUBJECT: "Leah Brandt sent you invoice INV-0031"`, body `"Leah Brandt has sent you an invoice."`, `has 'your studio': false`, ` for ` count 0. Nine nameless letters asserted (`invoice-emails.test.ts:244-320`). |
| 4 | W5-7 "Your page" footer | Rendered `FOOTER MATCHES: ["Your page"]` on the sent letter and the receipt; the "no rung invents a house" test at `:162-181` now asserts `!prose.includes("project")` with no footer stripping. Client default footer is two links (`branded-email.ts:219-226`); the override keeps the same shape, so no compliance link is dropped. |
| 5 | W5-3 "21 functions" | `edge-notes.md:133 ## Deploy set — 20 functions`; the only surviving "21" is `:273`, inside the verbatim round-1 record, carrying its own inline correction. |

**deploySet independently recomputed** (transitive reverse-import closure over
`_shared/{invoice-emails,invoice-subject,studio-identity}.ts` ∪ the five, script
in `$TMPDIR/closure.mjs`): `deploySet count = 20`, and the 20 names match the
notes' list exactly. `morning-brief` is correctly excluded — its only reference
to `notification-digest/logic.ts` is a comment at `render.ts:3`, not an import.

## Prior-round findings — re-verified

- **C1-1 CLOSED.** Mutation I (`invoiceSubjectName(invoice, null)` →
  `invoiceSubjectName(invoice, 'your studio')`, 4 files) → `FAILED | 239 passed
  | 2 failed`. Was green last round.
- **C1-2 CLOSED.** Mutation J (`studioInvoice: !invoice.project_id` →
  `false`, 3 files) → `FAILED | 240 passed | 1 failed`. Was green last round.
- **C1-3 CLOSED.** A call omitting both new fields now fails to compile:
  `TS2345 … is missing the following properties from type
  'InvoiceSentEmailParams': projectName, studioInvoice`. All seven interfaces
  are `projectName: string | null`; the four client-letter interfaces are
  `studioInvoice: boolean`.
- **C1-4, C1-5, C1-6, C1-7, C1-8, C1-9, C1-10 still open** — all outside the
  close brief; re-filed below with fresh evidence where it changed.
- **C1-11** — no longer applies: this round's code commit is `fdecb3e0c
  test(edge): …`, a real code+test commit.

---

## Findings

### R2-1 (major, 0.85) — the banned phrase is still one character out of reach of the gate

C1-1 pinned the *argument*; nothing pins the *result*. Mutation K, appending a
coalesce to the pinned call in all four letter senders:

```
$ grep -rl "const projectName = invoiceSubjectName(invoice, null);" ./*/index.ts
./invoice-check-intent/index.ts  ./invoice-reminders/index.ts
./invoice-send/index.ts          ./stripe-webhook/index.ts
mutation K files: 4
251:  const projectName = invoiceSubjectName(invoice, null) ?? 'your studio';
$ deno test … _shared/    ok | 241 passed | 0 failed (1s)
$ deno check … invoice-send/index.ts    Check … (clean)
```

The call still reads `invoiceSubjectName(invoice, null)`, so the exact-string
assertion at `invoice-subject.test.ts:171-183` passes, the W5-6 argument regex
at `:158-161` passes, and the builder-level `NAMELESS_LETTERS` suite never sees
`null` because the sender now hands it the literal. Every homeowner letter says
"for your studio" with the whole lane green — the ruling W5-6 forbids exactly
that string. Same defect class as C1-1, one layer further out.

**Fix** (one line, in the existing `LETTER_SENDERS` loop): forbid the literal in
code rather than the whole file — the phrase legitimately appears in the
explanatory comments at `invoice-send/index.ts:250` and
`invoice-reminders/index.ts:322`:

```ts
assert(
  !/['"`][^'"`\n]*your studio/i.test(src.replace(/\/\/[^\n]*/g, "")),
  `${name}/index.ts puts "your studio" back on the page (ruling W5-6)`,
);
```

### R2-2 (minor, 0.9) — W5-5/C1-4 still open, and now shown to be reachable

`invoiceSubjectName` uses `??`, not a trim, so a whitespace title survives two
rungs the builders' `forClause`/`subjectTail` trim never reaches. Rendered with
`title = "   "`:

```
STRIPE LINE ITEM: "Invoice INV-0031 —    "
DESK LINE:        "   "
EMAIL SUBJECT:    "Leah Brandt sent you invoice INV-0031"   (safe — trimmed)
```

Sites: `create-checkout-session/index.ts:272-275`;
`invoice-check-intent/index.ts:174`, `stripe-webhook/index.ts:407, 511, 1669`.

New this round: last round's mitigation was "`create_draft_studio_invoice`
requires a non-blank title". The db lane's constraint does **not** carry that —
`00571_studio_invoices.sql:53-58 chk_invoices_anchor` requires only
`project_id IS NOT NULL OR (client_id IS NOT NULL AND studio_id IS NOT NULL)`;
the blank-title guard lives only inside the mint RPC (`:877`). Any other UPDATE
path can leave a whitespace title, so the leak is reachable, not theoretical.
Cosmetic only — no money path, no refusal string.

**Fix**: `invoice.project?.name?.trim() || invoice.title?.trim() || fallback`
(the repo's own convention at `studio-identity.ts:226-232`), plus a blank-title
case in `invoice-subject.test.ts`.

### R2-3 (minor, 0.9) — W5-8/C1-5 unruled and unchanged

`studio-identity.ts:52-70` still always names `p_studio_id` and re-calls with the
argument deleted on `PGRST202`. The db lane drops the old signature
(`00571_studio_invoices.sql` `DROP FUNCTION IF EXISTS
public.resolve_studio_identity(uuid, uuid);`) and the notes make the migration a
hard gate strictly ahead of the 20 functions (`edge-notes.md:905-910`), so the
retry branch only serves a deploy order the lane forbids. It changes the wire
call for all 14 direct studio-identity importers. Orchestrator ruling needed:
keep as belt-and-braces, or trim the retry and keep the always-name half.

### R2-4 (minor, 0.85) — W5-9/C1-6 unruled and unchanged

Two homeowner strings on **project** invoices were rewritten inside a lane whose
scope is "exactly the listed items": `invoice-emails.ts:300` "so the work can
carry on without interruption" (was "so the project can keep moving without
interruption") and `:375` "may pause work already under way" (was "may pause
work on the project"). Both builders are used by `invoice-reminders` for every
project invoice today, so this ships to letters Patina already sends. Reads
correctly; no ruling exists.

### R2-5 (nit, 0.95) — stale `00570`, and the notes state the opposite

Shipped code still says `00570` at `studio-identity.ts:58` ("the pre-00570
function") and `:66` ("Deployed ahead of 00570"), plus the test name at
`studio-identity.test.ts:167`. The db lane's file is `00571_studio_invoices.sql`
(`ls …/agent-si-db/supabase/migrations | tail` → `00568… / 00571… / _pending`;
no 00570 exists). The close notes' advisory at `edge-notes.md:911-916` asserts
"Prose only — no shipped code carries the number", which is false: those two
comments ship to prod in all 14 studio-identity importers. Inert, but the
advisory would mislead the orchestrator into thinking C1-7 is closed.

### R2-6 (nit, 0.9) — the SELECT pin false-reds on a behaviour-preserving reorder

`invoice-subject.test.ts:211` asserts
`/project_id,\s*studio_id,\s*title,\s*invoice_number/`. Mutation M — rewrite one
SELECT as `project_id, title, studio_id, invoice_number`, identical behaviour:

```
$ deno test … _shared/invoice-subject.test.ts    FAILED | 14 passed | 1 failed
```

Order-tolerant assertions scoped to the select block would catch the real
deletion (mutation L) without the false red.

### R2-7 (nit, 0.85) — the new call pin is exact-string, so an equivalent refactor false-reds

`invoice-subject.test.ts:177-181` uses `assertEquals(call,
"invoiceSubjectName(invoice, null)")`. A behaviour-identical rewrite reds the
gate:

```
$ sed -i '' "s/…(invoice, null);/…({ project: invoice.project, title: invoice.title }, null);/" \
    invoice-check-intent/index.ts
$ deno test … _shared/invoice-subject.test.ts    FAILED | 14 passed | 1 failed
```

Counter-checked the sibling assertion and it is *not* brittle: wrapping
`studioInvoice:` onto the next line at both stripe-webhook sites still passes
(`ok | 15 passed | 0 failed`) because `\s*` spans the newline. Only the
exact-string one is affected. Taste, not a defect — R2-1's fix is worth more.

### R2-8 (nit, 0.5) — designer letters drop the name where the desk line keeps one

With `project = null, title = null`, the three designer-facing letters (A/R
escalation, refund, check-incoming) name nothing, while the `notification_log`
line computed beside each of them leads with `'Studio invoice'`
(`invoice-check-intent/index.ts:174`, `stripe-webhook/index.ts:407, 511, 1669`).
Defensible — the invoice number disambiguates — but it is an asymmetry no
ruling records.

### R2-9 (nit, 0.35) — `String(null)` in a function that ships

`commercial-document-notify/index.ts:309` `projectId: String(invoiceRow.project_id)`
would stringify a null project as `"null"`. Unreachable today (deposit invoices
come from project-bound commercial documents), but the function is in the
20-function deploy set.

### R2-10 (nit, 0.3) — "Studio invoice" reaches a homeowner on the Stripe page

`create-checkout-session/index.ts:274` falls back to
`invoiceSubjectName(invoice, 'Studio invoice')`, which renders on the Checkout
page a homeowner reads as `Invoice INV-0031 — Studio invoice · Middle West
Studio`. The plan (S2) calls "studio invoice" the *designer's* word. Only
reachable when both project name and title are absent. No refusal is breached.

---

## Checked and clean

- Every `project` dereference in the five: no non-optional `invoice.project.*`
  anywhere; `project_id` is `string | null` on all five row types; every
  `notification_log.metadata.project_id` writes the nullable value straight
  through; every `deep_link` and `portalUrl` on an invoice path is
  project-agnostic (`/invoices/<id>`, `/desk?book=accounts…`).
- Checkout return for a null project:
  `https://client.test/?invoice=inv-1&checkout=success&session_id={CHECKOUT_SESSION_ID}#letterbox`
  — same extra params as the project path, braces un-encoded, fragment last
  (`invoice-checkout-core.test.ts:65-100`).
- The webhook's three email sites (`:432`, `:524`, `:1683`) all pass
  `projectName` from the shared seam; the two client ones pass the footer flag,
  the designer-facing refund correctly does not.
- All seven `footerLinks:` sites are paired with `audience: "client"` — no
  designer letter can be handed the client footer.
- `renderBrandedShell` escapes `opts.title` (`branded-email.ts:279`), so the
  invoice title in the subject cannot inject markup into `<title>`.
- The plan's `stripe-rail.test.ts` null-project case (plan `:102`, `:200`) is
  **not** an edge-lane gap — the db lane delivered it (78 added lines on
  `agent-si-db`).
- Notes mirror: `diff -q` between the main-checkout and worktree copies of
  `edge-notes.md` → identical.
