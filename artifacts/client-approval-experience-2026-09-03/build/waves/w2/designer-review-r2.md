# Wave 2 — designer lane adversarial review, round 2

Reviewer: a separate context; did not write this code.
Worktree under review: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-designer`
(`git rev-parse --show-toplevel` → `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-designer`).
Branch `approvals/w2-designer`, merge-base `107549568c23b321fe413284de75164bde5852c9` — matches `env.md`.

```
$ git log --oneline main..HEAD
4e74e00a2 docs(approvals): the W2 designer lane fix pass — D1 and D2 closed
ccfb563ef fix(document): SIGNED reads mocha on the Desk too, not only on the watch (D2, R13)
8d6646f1b fix(approvals): the why is signed by the hand that wrote it (D1, P-13)
40be152aa docs(approvals): W2 designer lane adversarial review R1
1861df5d1 docs(approvals): the W2 designer lane log
1ce452104 fix(approvals): SIGNED comes home to mocha on the designer's ground (P-17, R13)
ec16e1145 feat(approvals): the designer's one-line why, first on the composer's paper (P-13)
```

19 files, +1199 / −9. Every commit is pathspec-clean (no `git add -A` residue), Conventional
Commits subjects, no `merge(...)`, no trailers, nothing under `.claude/`, `.agents/` or any `.env`.
No migration minted by this lane; no production mutation run.

---

## Verdict — **fix**

Both prior-round majors (D1, D2) were addressed and both fixes are real. Two new majors stand:
the D1 fix depends on a projection key the backend lane's 00569 does not emit, so the briefed
attribution never renders; and the D2 fix closed two of the four places the designer portal
paints an approval outcome in sage, while the lane log claims it closed "both places that paint it."

---

## Gates, run by the reviewer

Commands were issued as `pnpm --dir <worktree> --filter …` — this agent's cwd resets between Bash
calls, so a bare `cd` silently ran the first attempt against the MAIN checkout. Recorded here
because the same trap will bite the integration steward.

| # | Command | Result |
|---|---|---|
| 1 | `pnpm --dir <wt> --filter @patina/designer-portal type-check` | **PASS** — `tsc --noEmit`, `EXIT=0` |
| 2 | `pnpm --dir <wt> --filter @patina/designer-portal lint` | **EXIT=1** — `✖ 205 problems (2 errors, 203 warnings)`; both errors pre-existing, see F-08 |
| 3 | `pnpm --dir <wt> --filter @patina/designer-portal test -- <7 touched suites>` | **PASS** — `Test Suites: 7 passed, 7 total · Tests: 179 passed, 179 total` |
| 4 | `pnpm --dir <wt> --filter @patina/supabase type-check` | **PASS** — `TC_EXIT=0` |
| 5 | `pnpm --dir <wt> --filter @patina/supabase test -- src/hooks/__tests__/use-project-approvals.test.ts` | **PASS** — `Tests 19 passed (19)` |
| 6 | `pnpm --dir <wt> --filter @patina/admin-portal build` | **PASS** — `EXIT=0`, full route table emitted |

Refusal sweep over the diff (`gate|task|overdue|dashboard|AI|Declined|sage|green|checkmark|badge|
emoji|shadow` on added lines): every hit is a code identifier, a test assertion, or a comment
explaining a refusal. No homeowner-visible string in this diff. The one new client-bound string is
the designer's own `why`, which is hers to write. Composer copy ("What would you tell her about
this?", "One line. She reads it under the question.", "Twenty characters left.") is designer-facing
and clean.

---

## Prior-round findings — status

| Prior | Status |
|---|---|
| D1 (viewer's name on a peer's sentence) | **Fixed in the portal, blocked at the projection** — see F-01 |
| D2 (sage SIGNED on the Desk) | **Half fixed** — Desk + folio dot moved; the Document Record did not, see F-02 |
| D3 (false zero-hit grep claim in the lane log) | **Not corrected** — see F-06 |
| D4 (two SIGNED grammars on one surface) | **Unchanged, now both mocha** — see F-07 |
| D5 (aria-live wraps the whole helper) | **Not fixed** — see F-03 |
| D6 (−1.1deg vs ux/02's −2°) | **De-escalated** — the web lane also draws −1.1deg, so lanes agree and only ux/02 drifts, see F-10 |
| D7 (no newline collapse on the why) | **Not fixed** — see F-04 |
| D8 (supersede drops the why) | **Closed by the backend, stale in the portal** — see F-05 |
| D9 (lint red, pre-existing) | **Unchanged and confirmed pre-existing** — see F-08 |
| D10 (`SIGNED_STAMP_INK` exported vs literal) | Unchanged — F-11 |
| D11 (`why?: string \| null` looser than the parser) | Unchanged — F-12 |

No regression was introduced by either fix commit: the `useAuth` import is gone from the composer,
the 7 touched suites are green, and the whole desk-derivation neighbourhood still passes.

---

## Findings

### F-01 · major · The attribution the brief asked for never renders — 00569 emits no `whyAuthorName`

`project-approval-document.tsx:1075` renders `<GateWhy attribution={givenName(review.whyAuthorName)}>`,
and `use-project-approvals.ts:329` parses `whyAuthorName: nullableString(row, 'whyAuthorName')`.
The row comes from `get_project_decision_reviews`, rewritten in the backend lane's
`00569_approval_why_viewer_role_and_receipt.sql`. Its `jsonb_build_object` carries `'why', artifact.why`
and `'viewerRole', …` and nothing else new:

```
$ grep -rn "whyAuthorName|why_author|whyAuthor" <backend worktree>/supabase <backend worktree>/packages
(no matches)
```

So `givenName(null)` is `null` on every real row and `GateWhy` prints the sentence unsigned, always.
The brief's P-13 sub-item — *"Show the frozen why on the designer's own approval reading view under
the question with `— {given name}`"* — is wired but unobservable. The lane chose the honest half of
the previous review's own remedy ("print the sentence unsigned until an author exists") and flagged
the debt in its log; the choice is right, the wave-level item is still not delivered.

**Fix:** the backend lane adds the author's display name to 00569's projection under exactly the key
`whyAuthorName` (the artifact table would need the composing designer resolved at insert, or a join
to `profiles` on the decision's creator). 00569 is still open in this same wave. If it ships without
it, record explicitly that P-13's attribution is deferred, because the code says it exists.

### F-02 · major · R13 half-lands again: the Document's Record still stamps Signed and Approved in sage

`apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:3097-3102`:

```tsx
const stamp =
  s.key === 'proposal' && seal
    ? { label: `Signed · ${seal.date}`, color: 'var(--color-sage)', ink: 'var(--color-sage-ink)' }
    : approvedGate
      ? { label: `Approved${…}`, color: 'var(--color-sage)', ink: 'var(--color-sage-ink)' }
      : undefined;
```

Both are approval outcomes on the designer's own paper, in a green, after this branch. ux/02 §5's
table puts **Approved** and **Signed** in `--color-mocha`; R13 is unqualified; the binding palette
line is "SIGNED in mocha (not sage)". The full sweep of designer-portal approval pigments after this
branch:

| Surface | State | Pigment after this branch |
|---|---|---|
| `proposal-watch.tsx` `SignedSeal` | SIGNED | mocha ✔ |
| `proposal-watch-derivation.ts` `deriveStamp` | SIGNED | mocha ✔ |
| `desk-derivation.ts` need line | SIGNED | mocha ✔ |
| `red-letter-zone.tsx` folio dot | signed | mocha ✔ |
| **`doc/[id]/page.tsx:3097`** | **Signed · {date}** | **sage ✘** |
| **`doc/[id]/page.tsx:3101`** | **Approved · {date}** | **sage ✘** |

The fix-pass log states it fixed "both places that paint it." There are four, and the two loudest —
the seal on the Proposal in the Record and the grant on a gate-settled section — were not moved.
Neither file is in the lane brief's named files, but neither were `desk-derivation.ts` or
`red-letter-zone.tsx`, which the lane correctly moved on R13's unqualified reading. Half-moving a
pigment leaves the divergence worse than it was found.

**Also in the same family, one step further out:** `components/document/client-mirror.tsx:151` marks
an answered decision `answered · {date}` in `--color-sage-ink` on the designer's client mirror.

**Fix:** move both `doc/[id]/page.tsx` stamps to `var(--color-mocha)` (border and ink, matching
`STAMP.mocha`), or have the orchestrator defer them explicitly and in writing.

### F-03 · minor · The live count re-announces the static helper sentence on every keystroke

`project-approval-document.tsx:783`:

```tsx
<p id="approval-why-help" aria-live="polite" className={META}>
  One line. She reads it under the question.
  {whyRemaining ? ` ${whyRemaining}` : ''}
</p>
```

The element is simultaneously the textarea's `aria-describedby` target and a polite live region.
Past 180 characters a screen reader announces "One line. She reads it under the question. Twenty
characters left.", then the whole sentence again at nineteen, and so on — twenty times.
**Fix:** keep the description inert and put the count in its own `aria-live` span beside it.

### F-04 · minor · "One line" is a textarea that accepts Enter, and newlines are never collapsed

`<textarea id="approval-why" rows={2} …>`; submit does `why: form.why.trim() || null` (:373) and the
hook does `input.payload.why?.trim()` — both strip ends only. 00569's CHECK is
`char_length(btrim(why)) BETWEEN 1 AND 200`, length only. An embedded `\n` freezes into the
immutable artifact and travels to email, the client Threshold and iOS. `GateWhy` renders it in a
`<p>`, so HTML collapses it and the fault is invisible from the designer's own surface.
**Fix:** `.replace(/\s+/gu, ' ')` at submit, or block Enter in the field.

### F-05 · minor · The supersede comment is now false, and the hook's type accepts a `why` it drops

`project-approval-document.tsx:95` still reads *"`supersede_project_approval_decision` takes no
`p_why` this wave, so the superseding form does not offer one."* The backend lane's 00569 now
declares `supersede_project_approval_decision(…, p_why text DEFAULT NULL)` and, when `p_why` is
absent, carries the predecessor's why forward (`v_why := COALESCE(v_why_given, v_old_artifact.why)`).
So the client-facing consequence of the old D8 is closed — edition 2 keeps her sentence — but the
comment misstates the contract, and the composer offers no way to revise a why that is now revisable.

Related: `useSupersedeProjectApproval`'s input is
`Omit<ProjectApprovalCreatePayload, 'phaseId' | 'sectionKey'>`, which still carries `why?`, while the
RPC args it builds never forward it. A caller (web or iOS lane) can pass `why` to supersede, type-check
clean, and have it silently dropped.
**Fix:** correct the comment; either forward `why` to `p_why` on supersede or `Omit` it from the type.

### F-06 · minor · The lane log still states a grep result that is false

`designer-notes.md` (P-17 section): *"Grepped the whole `components/document` tree for `CheckCircle`,
`<Check`, `checkmark`, `✓` and `✔`: zero hits."*

```
$ grep -rnE "CheckCircle|<Check|checkmark|✓|✔" apps/designer-portal/src/components/document/ | wc -l
      35
```

including `spec-books/spec-book-workspace.tsx:1361  <Check className="h-6 w-6 text-[#66765f]" />` (a
check in a green hex) and `work-block.tsx:310` ("a sage ✓ when done"). The conclusion still holds —
none of the 35 is a signed status on a proposal/approval surface this lane touched — but the
orchestrator reads these logs as evidence. **Fix:** state what was established, drop the zero claim.

### F-07 · minor · Two SIGNED marks on the designer's ground, and a third grammar on the client's

`proposal-watch.tsx:192` still renders the general-purpose `<Stamp label={w.stamp.label} …>` for the
watch row: `-rotate-[1.5deg] rounded-[3px] border-[1.5px] tracking-[0.1em]`, single rule. The new
`SignedStamp` beside it on the same page: `-rotate-[1.1deg]`, no radius, doubled rule at
`inset-[2.5px]`, `tracking-[0.18em]`. Both are now mocha, so the pigment refusal is closed; the
grammar is not. Across portals it splits again — the web lane's
`client-portal/src/components/threshold/instruments/stamp.tsx` draws the same SIGNED at 1px border,
`tracking-[0.1em]`, no `font-semibold`, and with a 30-day aging step the designer's mark does not
implement (the lane discloses the missing aging in its log; the brief named four dials and aging is
not one).
**Fix:** a lockstep decision at integration — route the watch row through the same mark and accept
the designer/client weight difference in writing, or note the split in the wave report.

### F-08 · minor · The designer-portal lint gate exits 1 — both errors pre-existing, in untouched files

```
✖ 205 problems (2 errors, 203 warnings)
piece-room-save-gate.test.tsx:159  error  Definition for rule 'import/first' was not found  import/first
use-commercial-documents.test.ts:930  error  React Hook "useSendTradeRfq" is called in function "mutationFnOf" …  react-hooks/rules-of-hooks
```

Neither file appears in `git diff main...HEAD --name-only`, and the ESLint config is unchanged — main
is red too. Not this lane's defect; recorded so a red lint at merge is not read as a Wave 2 regression.

### F-09 · nit · Deploy order is load-bearing and unstated

The hook omits `p_why` when empty so a why-less create still matches the pre-00569 signature — but a
non-empty why against a portal deployed ahead of the migration hits a signature that does not exist,
and the create fails outright. The rulings' production path (migrations → functions → portals)
already covers this; worth one line in the wave report so nobody reverses it.

### F-10 · nit · −1.1deg is the two lanes' agreed rotation and ux/02's table still says −2°

`signed-stamp.tsx:40` draws `-rotate-[1.1deg]`, per the lane brief. The web lane's stamp dials also
carry `rotation: -1.1` for every stamped state. ux/02 §5's table and `proposal.html`'s gallery still
print −2°. The lanes agree; the source document does not. **Fix:** record the re-ruling in the wave
report so the next reader does not "correct" one surface back to −2°.

### F-11 · nit · A dead `useAuth` mock survives, carrying a comment that describes the fixed bug

`approvals-region-head.test.tsx:36-40` still mocks `@/hooks/use-auth` with the comment *"The region
head renders the full document, which signs a frozen why with the reading designer's given name
(P-13)"*. The component no longer imports `useAuth` at all (`grep -n useAuth
project-approval-document.tsx` → no matches), and the fix-pass log says the mock "is gone with it" —
it is gone from one suite, not this one. Harmless at runtime, actively misleading as documentation.

### F-12 · nit · `SIGNED_STAMP_INK` is exported and asserted while the class hard-codes the token

`export const SIGNED_STAMP_INK = 'var(--color-mocha)'` beside a literal `text-[var(--color-mocha)]` in
the className (Tailwind cannot interpolate). The test does catch drift, hence a nit.

### F-13 · nit · `why?: string | null` is looser than the parser, which always sets the key

`parseProjectApprovalReview` unconditionally sets `why` and `whyAuthorName`; the optional markers
exist so the web lane's object literals keep compiling mid-wave. Documented and defensible; tighten
once the other lanes' fixtures carry the fields.

### F-14 · nit · Mocha is `--text-body`, so the Desk's SIGNED mark is drawn in body ink

`globals.css:14` `--color-mocha: #5C4A3C` and `:74` `--text-body: var(--color-mocha)`. The Desk need
stamp now draws border and word in exactly the body-text colour where it used to carry a distinct
hue. R13 requires the move; only Leah's eye can say whether the mark still reads as a mark. Folded
into the rendered check already owed at integration (`ux/02` R-C2 asks for exactly that).

---

## Advisories (not blocking, not this lane's)

- **Migration number collision in this wave.** `agent-cae-w2-backend` and `agent-cae-w2-iosc` have
  both minted `00569_*` (`00569_approval_why_viewer_role_and_receipt.sql` and
  `00569_stage2_outcome_signature_payload.sql`). The integration steward must renumber one before
  merge. `env.md`'s own instruction — re-check `ls supabase/migrations | tail` at every merge — applies.
- **A W1 suite fails on a date.** `client-note-composer.test.tsx` hardcodes `Sep 4` against a live
  clock and now fails daily. Untouched by this branch; the lane flagged it. Freeze the clock rather
  than re-hardcode.
- **Rendered check still owed** at integration: the composer's first field and its word count past
  180 characters, the frozen why under the question, and the mocha SIGNED on both the proposal watch
  and the Desk against real paper.
