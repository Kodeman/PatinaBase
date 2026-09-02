# First Flight · W0 · L0.7 — integration notes

Lane **L0.7**, branch `first-flight/w0-l07`. Findings live in `l0.7-coverage-walk.md`; the shot ledger
lives at `shots/w0-l0.7/ledger.md`.

Nothing in this file authorises a production write. §3 is the Kody-run block.

**Notes addressed TO this lane: none.** `build/waves/w0/*-notes.md` was checked at start and at close;
`l03-notes.md` mentions L0.7 only to say the catalogue fixture is additive and that L0.7 resets third.
L0.7 owns no app file, so no lane can address a code note to it.

---

## 1. Notes I am sending

### N1 → **Steward / Fable** · `supabase/config.toml` is shared, and L0.3 and L0.7 both append to it

This lane appends **one** entry to **both** `sql_paths` arrays, immediately after
`./seed/project_documents_tasks.sql`:

```
'./seed/project_documents_tasks.sql', './seed/first-flight-client-fixture.sql', './seed/paint_colors_seed.sql',
```

Both `[db.seed]` (line 60) and `[remotes.staging.db.seed]` (line 88) are edited, because the file's own
**derivation rule** says staging = local minus `00-legacy-grants.sql` minus `99-local-edge-settings.sql`
plus `cloudflare-phase1-staging.sql`, and this fixture is dev-account scaffolding of exactly the kind
the staging array already loads (`dev-accounts.sql`, `decisions.sql`, `invoices.sql`,
`project_documents_tasks.sql`). L0.3 deliberately did **not** touch the staging array for its
catalogue file, on the reasoning that round-one content is not staging scaffolding — that reasoning is
sound and does not apply here.

**Conflict warning.** `sql_paths` is a single long line and **L0.3 appends to the same two lines**
(`l03-notes.md` §O1, after `./seed/products.sql`). A textual merge of `first-flight/w0-l03` and
`first-flight/w0-l07` **will** conflict on lines 60 and 88. The resolution is to take **both**
insertions, in this order:

```
'./seed/products.sql', './seed/catalog/first-flight-catalog.sql', './seed/designer-clients.sql', … './seed/project_documents_tasks.sql', './seed/first-flight-client-fixture.sql', './seed/paint_colors_seed.sql', …
```

`first-flight-client-fixture.sql` must stay **after** `project_documents_tasks.sql` (it updates that
file's document rows) and **after** `decisions.sql` (which creates the project it hangs off). It has a
guard clause and skips cleanly with a `RAISE NOTICE` if either prerequisite is absent.

### N2 → **L1-F** (`Features/Messaging/**`) · exact text for the composer clearance

`ThreadDetailView.swift` mounts its composer as the last child of a plain `VStack` and never reserves
the house-first bar's row, so on the shipped root the composer is drawn under the bar and the bar wins
the hit test (**L07-02**, blocker). The Design layer already publishes the metric and
`Features/Money/MoneyScreenChrome.swift:41` is its only caller. Apply the same seam — exact final text
for the change in `ThreadDetailView.swift`:

```swift
            composer
                .padding(.bottom, CompanionHearthMetrics.pinnedFooterClearance(
                    houseFirst: FeatureFlags.shared.isOn(.houseFirst)
                ))
```

and, in the same file, delete the `messages.isEmpty` condition on line 36 so a send failure is
rendered on a thread that has messages (**L07-03**):

```swift
                        } else if let error = viewModel.error {
```

— rendering the error above the composer rather than in place of the transcript. The invoice screen's
failure banner (`06c-invoice-pay-failure.png`) is the pattern to copy: one sentence that says nothing
was lost, plus a recovery.

### N3 → **L1-B** · the Studio hub needs whatever staleness affordance `R-03` lands on Today

`R-03` (T0, L1-B, W1) names Today. Under **D1** the Studio hub is a tab root of its own and has the
identical defect: with the backend unreachable it renders cached counts as current with no signal
(**L07-05**, `07a-studio-stack-down.png`). When `R-03`'s pattern is chosen, apply it to
`StudioHubViewModel` in the same wave. **Constraint from the VISION check:** the affordance must be a
word ("last updated…", "we couldn't reach the studio"), never a dot or a badge — VISION §6.

### N4 → **L1-E** · two copy lines, exact final text

1. **Order detail** — the responsibility paragraph promises an address the screen never prints
   (**L07-04**). Either print `terms.contact` under the paragraph, or change the config text to point
   at the row that is actually on screen:

   > Patina is responsible for this order — for getting it to you, and for putting it right if it
   > arrives damaged or isn't what was described. Tap **Report a problem** above and a person will
   > answer. If a designer is working on your home, they are copied on anything you raise.

2. **Documents alert title** — both open-failure alerts carry the title *"Couldn't open this file"*,
   which contradicts the second body (*"This document isn't available to open yet."*). Give the
   missing-path case its own title:

   > **Not shared yet**
   > This document isn't available to open yet.

### N5 → **L0.2** (demo account, D7 / D11) · set the proposal's visibility tier

`proposals.client_visibility_tier` defaults to **`'milestone'`**, and `get_client_proposal_bundle`
nulls every per-line price on that tier — so the demo account's proposal will open as five line names
and no money against any of them (**L07-07**, `01b-proposal-detail-items.png`). Add to
`build/waves/w0/demo-account.sql`, on the demo proposal:

```sql
client_visibility_tier = 'full',
```

If the tier is deliberately `milestone` for round one, then L1-E's line from L07-07 becomes required
rather than optional, because otherwise a tester reads a rendering bug.

### N6 → **Fable / the steward** · the reset-ownership sequence was broken twice

Two `supabase db reset`s that were not this lane's landed **during** the walk, at
`13:35:47Z` and `13:55:56Z` (measured from `profiles.created_at`, which the seed stamps `NOW()`).
Both ran from a checkout carrying neither this lane's fixture nor L0.3's catalogue file, and both
wiped them. One observation had to be withdrawn as a consequence (walk file §8). If more lanes are
still live on this machine, the sequence in `steward.md` §4 needs restating before the next wave.

---

## 2. The one non-code step this lane's fixture needs after every reset

The openable document needs real bytes behind it. This is a **local** storage write; it is not a code
change and not a production write. Run it after `pnpm supabase:reset`, from the repo root, with the
local stack up:

```bash
SR=$(cd supabase && supabase status -o env | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
python3 - "$TMPDIR/service-agreement-aspen-loft.pdf" <<'PY'
import sys
path = sys.argv[1]
content = (b"BT /F1 18 Tf 72 700 Td (Service Agreement - Aspen Loft Refresh) Tj ET\n"
           b"BT /F1 12 Tf 72 660 Td (Local dev fixture. Patina First Flight W0 L0.7 coverage walk.) Tj ET")
objs = [b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
out, offs = b"%PDF-1.4\n", []
for i, o in enumerate(objs, 1):
    offs.append(len(out)); out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
xref = len(out)
out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
for off in offs: out += b"%010d 00000 n \n" % off
out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
open(path, "wb").write(out)
PY
curl -s -o /dev/null -w "upload HTTP %{http_code}\n" -X POST \
  "http://127.0.0.1:54321/storage/v1/object/project-documents/b0000000-0000-0000-0000-0000000000d1/service-agreement-aspen-loft.pdf" \
  -H "Authorization: Bearer $SR" -H "Content-Type: application/pdf" \
  --data-binary "@$TMPDIR/service-agreement-aspen-loft.pdf"
```

Expect `upload HTTP 200`. Without it, all three documents fail to open — which is still an honest set
of states, but the "opens correctly" case is lost.

---

## 3. Kody-run steps this lane creates

Both are **read-only** and both are about production. Nothing here mutates anything.

### K1 — Does the round-one designer belong to more than one active studio?

This decides whether **L07-01** (proposal signing fails with `studio_id_not_designer_studio`) is live
for round one's cohort. Run it in the **Strata SQL editor** (Supabase dashboard → project
`bkvcixdmuyejfzcijpdg` → SQL Editor), or with `psql` against Strata. It reads three tables and writes
nothing:

```sql
SELECT p.email,
       count(DISTINCT om.organization_id) AS active_design_studios,
       string_agg(DISTINCT o.name, ' | ' ORDER BY o.name) AS studios
FROM public.profiles AS p
JOIN public.organization_members AS om ON om.user_id = p.id
JOIN public.organizations AS o ON o.id = om.organization_id
WHERE om.status = 'active'
  AND om.role <> 'guest'
  AND o.type = 'design_studio'
  AND o.status = 'active'
  AND p.id IN (SELECT DISTINCT designer_id FROM public.proposals WHERE status = 'sent')
GROUP BY p.email
ORDER BY active_design_studios DESC, p.email;
```

**Read it like this.** Any row with `active_design_studios >= 2` is a designer **whose clients cannot
sign a proposal today**. If Leah's row is `1`, L07-01 is latent rather than live for round one and can
be scheduled into W1 rather than blocking build 1. If it is `2` or more, L07-01 blocks build 1 for that
studio and must be fixed or named in What to Test.

### K2 — After the fix lands, the same probe re-run

Re-run **K1** unchanged after L0.2's fix is applied and confirm the answer is the one the fix intends
(either every row reads `1`, or the fix makes the count irrelevant because the studio now comes from
the proposal). No other verification of L07-01 is possible without a real signature, and a real
signature on prod is not a probe.
