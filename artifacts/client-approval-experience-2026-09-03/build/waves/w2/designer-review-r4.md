# W2 designer lane — adversarial review, round 4

Reviewer: separate context, did not write this code.
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-designer`
(`git rev-parse --show-toplevel` → the same path), branch `approvals/w2-designer`.
Range: `main..HEAD`, fifteen commits, 22 files, `2314 insertions(+), 18 deletions(-)`.

**Verdict: fix.** One ruled item on this lane's own ground was not delivered (the client
mirror's sage `answered` mark, ruled to mocha on 2026-09-05), and two majors sit at the
wave seam rather than in this branch: nothing anywhere emits `whyAuthorName`, and the web
lane edits the same lines of the same shared file and of two of this lane's own fixtures.
Everything the round-3 review handed back as a blocker or major is genuinely closed.

---

## Gates, run by the reviewer

Each command in its own call, from the lane worktree.

| # | Command | Result |
|---|---|---|
| 1 | `pnpm --filter @patina/designer-portal type-check` | **PASS** — `TC_EXIT=0`, `tsc --noEmit` silent |
| 2 | `pnpm --filter @patina/designer-portal lint` | **EXIT 1** — `✖ 205 problems (2 errors, 203 warnings)`; both errors pre-exist on `main` (`piece-room-save-gate.test.tsx:159` `import/first`, `use-commercial-documents.test.ts:930` `rules-of-hooks`), neither file in this diff |
| 3 | `pnpm --filter @patina/designer-portal test -- src/components/document/approvals/ …red-letter-zone… …signed-stamp… …desk-derivation… …proposal-watch-derivation…` | **PASS** — `Test Suites: 7 passed · Tests: 182 passed` |
| 4 | `pnpm --filter @patina/designer-portal test -- 'src/app/\(document\)/doc/\[id\]/page.test.tsx'` | **PASS** — `1 suite · 101 tests` |
| 5 | `pnpm --filter @patina/supabase type-check` | **PASS** — `SB_TC_EXIT=0` |
| 6 | `pnpm --filter @patina/supabase test -- src/hooks/__tests__/use-project-approvals.test.ts` | **PASS** — `Test Files 1 passed (1) · Tests 21 passed (21)` |
| 7 | *(extra)* `pnpm --filter @patina/designer-portal test -- src/lib/document/__tests__/ src/components/document/` | **1 failed, 357 passed / 358 suites · 1 failed, 4472 passed / 4473 tests** — the single failure is the W1 clock-bound `client-note-composer.test.tsx` (`Taken down Sep 4` vs today's `Sep 5`), ruled to the integration steward on 2026-09-05. Not this branch: the file is absent from `git diff main...HEAD --name-only`. |

No regression from fix pass 3 anywhere in the document neighbourhood.

---

## Round-3 findings, verified one by one

| id | state |
|---|---|
| G-01 attribution deferred | **CLOSED as far as this lane reaches.** `givenName()` is gone; `whyAttribution()` returns the frozen name verbatim (trim-or-null); the render site and the hook doc comment no longer claim a deferral. Matches the 2026-09-05 ruling word for word. The *producer* is still missing — see H-02. |
| G-02 interior newline freezes | **FIXED, three gates.** `rows={1}`; `onKeyDown` preventDefaults Enter (asserted via `createEvent.keyDown` + `defaultPrevented`); `onChange` runs `oneLine()` before the 200-slice; submit re-applies `oneLine().trim()`; `oneLineWhy()` in the hook normalizes on **create and supersede**. Four tests, portal and package, assert the value actually sent. |
| G-03 one `aria-live` for helper + count | **NOT FIXED** (out of pass-3 scope). Carried as H-04. |
| G-04 false supersede comment, dropped `why` | **FIXED.** `SupersedeState` now `Omit<…, 'phaseId' \| 'why'>` with an accurate comment; the hook forwards `p_why` and omits the key when silent, matching `00569:702` `COALESCE(v_why_given, v_old_artifact.why)`. |
| G-05 three/four SIGNED geometries | **NOT FIXED.** Carried as H-05. |
| G-06 dead `useAuth` mock | **FIXED** — removed from `approvals-region-head.test.tsx`; `grep -rn useAuth` over the lane's files → no hits. |
| G-07 red lint pre-existing | **CONFIRMED again**, identical counts. |
| G-08 deploy-order exposure | **OPEN** — still wants one line in the wave report. |
| G-09 −1.1° / no aging | **UNCHANGED.** Carried as H-10. |
| G-10 `SIGNED_STAMP_INK` exported beside its literal | **UNCHANGED**, taste. |
| G-11 optional `why`/`whyAuthorName` on the interface | **UNCHANGED** — and now collides with the web lane's required `why`; folded into H-03. |
| G-13 nothing says the why is optional | **UNCHANGED.** Carried as H-09. |
| G-14 surrogate-pair slice | **UNCHANGED.** Carried as H-11. |
| G-15 `docs:` subject over two `.tsx`/`.ts` paths | history, unchanged. |

---

## Brief compliance, checked against the mid-Wave-2 rulings

**P-13 composer half — delivered.** First field on the paper (`project-approval-document.tsx:763-792`,
test asserts it precedes the first `[data-gate-part]`); label `What would you tell her about this?`;
helper `One line. She reads it under the question.`; `maxLength=200`; optional; live count in words
only from twenty remaining, never a figure. `p_why` is a top-level RPC argument, omitted when empty —
which matches `00569:475-484` (`create_project_approval_decision(p_project_id, p_payload,
p_idempotency_key, p_why text DEFAULT NULL)`) and stays outside `p_payload`, whose key allow-list at
`00569:193-200` would raise. Cap agrees with `00569:214` (`char_length(v_why) > 200`).

**P-13 single line — delivered per ruling.** See G-02 above.

**P-13 attribution — coded to the ruling, unproducible today.** See H-02.

**P-17 designer half — delivered.** `signed-stamp.tsx` carries all four dials, no fill, no shadow,
five unit cases. Pigment now travels: `proposal-watch.tsx`, `proposal-watch-derivation.ts:137`,
`desk-derivation.ts:469,643`, `red-letter-zone.tsx:31`, both stamps in `doc/[id]/page.tsx:3095-3112`.
`grep -rn "color-sage" apps/designer-portal/src/lib/document/desk-derivation.ts` leaves only
`DELIVERED` and `PULSE`, which the ruling keeps sage.

**Designer Desk pigments ruling — one surface short.** See H-01.

**Refusal sweep.** No homeowner-visible string is added by this lane; the only string that reaches a
homeowner is the designer's own typed sentence. Nothing added matches
`AI|overdue|dashboard|task|badge|confetti|celebrat|emoji|shadow|checkmark|✓|✔|Declined` outside
comments and tests that forbid them.

**Hygiene.** Fifteen commits, explicit pathspecs each, Conventional subjects, no `merge(...)`, no
trailers, nothing pushed, no migration minted, no production mutation. `build/` docs force-added.
Working tree clean apart from the sandbox's eight `.env*: Operation not permitted` lines.

---

## Findings

### H-01 · major · 0.9 — the client mirror is the one ruled surface still marking an approval in sage

The 2026-09-05 ruling is explicit: *"Sage stops carrying approval meaning: SIGNED/APPROVED/answered
marks on the Desk, the Record page **and the client mirror** move to mocha ink."* The Desk
(`desk-derivation.ts`) and the Record page (`doc/[id]/page.tsx`) moved. The client mirror did not:

```
apps/designer-portal/src/components/document/client-mirror.tsx:151
  <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--color-sage-ink)]">
    answered{d.responded_at ? ` · ${fmtDay(d.responded_at)}` : ''}
```

The lane's own pass-2 log carried it forward as "a ruling would close the sweep"; the ruling arrived
and pass 3 did not act on it, listing only G-01, G-02 and supersede as in scope. It is the mirror of
what the client sees, so it is exactly the "two pigments for one meaning across the table" the move
exists to close. **Fix:** `var(--color-mocha)` at `:151`, and a case pinning it — there is no
`__tests__/client-mirror.test.tsx` today, so this needs one (render a `responded` decision, assert the
mark's colour and that no `--color-sage` string survives in that subtree).

### H-02 · major · 0.95 — nothing in the repository emits `whyAuthorName`, so every real row still renders unsigned

`project-approval-document.tsx:1092` renders `<GateWhy attribution={whyAttribution(review.whyAuthorName)}>`
and `use-project-approvals.ts:331` parses `whyAuthorName: nullableString(row, 'whyAuthorName')`.
Re-run today against the backend lane at its current head (`0b18be341`):

```
$ git grep -n "whyAuthorName\|why_author" approvals/w2-backend -- supabase packages apps
(no matches)
```

`00569_approval_why_viewer_role_and_receipt.sql:812-905` (`get_project_decision_reviews`) builds the
row with `'why', artifact.why` and `'viewerRole', …` and carries no author of any kind;
`project_approval_artifacts` has no author column, so nothing can be joined portal-side either.

What changed since round 3 is the *claim*: fix pass 3 removed the "NOT YET PRODUCED / DEFERRED"
comments from both the hook and the render site on the strength of the ruling ("the backend lane is
adding the emitter now"). If 00569 merges as it stands, the code now asserts a contract nothing
satisfies and the deferral is no longer written down anywhere in the source.

Not this lane's to fix — the producer is a migration in another worktree. **Fix:** the backend lane
adds the composing designer's display name to `00569`'s `jsonb_build_object` under exactly the key
`whyAuthorName` (`client_decisions.designer_id` exists, denormalised at 00064, so a `LEFT JOIN
profiles` is a one-line change), **or** the orchestrator restores the deferral comments and says so in
the wave report. Silence between those two is the only unacceptable outcome.

### H-03 · major · 0.85 — the web lane rewrites the same lines of the same shared file and of two of this lane's fixtures

`approvals/w2-web` independently edits `packages/supabase/src/hooks/use-project-approvals.ts`:

- it adds `why: string | null` — **required**, where this lane added `why?: string | null` — plus
  `viewerRole: ProjectApprovalViewerRole | null`, in the same interface block;
- it adds `why`/`viewerRole` to `parseProjectApprovalReview` at the same insertion point this lane's
  `why`/`whyAuthorName` lines occupy;
- it edits `packages/supabase/src/hooks/__tests__/use-project-approvals.test.ts`'s `REVIEW` fixture at
  the same two lines this lane's new cases read;
- and it edits **two designer-portal files this lane also owns** —
  `apps/designer-portal/src/components/document/approvals/approvals-region-head.test.tsx` and
  `project-approval-document.test.tsx` — adding `why: null, viewerRole: 'lead'` to each `baseReview`.

Consequences at integration: a textual conflict in four files, and a semantic one. This lane's
`baseReview` fixtures carry no `viewerRole`, so if the web lane's required field lands and its own
fixture hunk is dropped in the merge, `@patina/designer-portal type-check` goes red on `satisfies
ProjectApprovalReview`. **Fix (integration steward):** take the union deliberately — `why: string |
null`, `whyAuthorName: string | null`, `viewerRole: … | null` all required; both fixture hunks; then
re-run `@patina/designer-portal type-check` and both hook suites. Do not let a conflict resolution
drop `whyAuthorName` or the newline normalization in `useCreateProjectApproval`/`useSupersede…`.

### H-04 · minor · 0.85 — the count's live region still re-announces the whole helper sentence

`project-approval-document.tsx:789-792` is unchanged since round 1:

```
<p id="approval-why-help" aria-live="polite" className={META}>
  One line. She reads it under the question.{whyRemaining ? ` ${whyRemaining}` : ''}
</p>
```

The element is both the textarea's `aria-describedby` target and a polite live region, so past 180
characters every keystroke re-announces the description plus the count — twenty announcements of
"One line. She reads it under the question. Four characters left." running. Fourth round open. **Fix:**
keep the description inert; put `{whyRemaining}` in its own `<span aria-live="polite">`.

### H-05 · minor · 0.9 — one page can draw SIGNED two ways; the program draws it four

Pigment is unified, geometry is not:

- `signed-stamp.tsx:44-47` — `-rotate-[1.1deg]`, square, `border-[1.5px]` + doubled rule at
  `inset-[2.5px]`, `tracking-[0.18em]`.
- `proposal-watch.tsx:192` → `stamp.tsx:89-102` — `-rotate-[1.5deg] rounded-[3px] border-[1.5px]
  tracking-[0.1em]`, single rule. For `status = 'accepted'` `deriveStamp` labels it `SIGNED`, so the
  watch row and the `SignedSeal` beneath it are the same word in two shapes on one page.
- `settled-bar.tsx:46` — the Record's `Signed · {date}` / `Approved · {date}` go through that same
  generic `Stamp`: a third instance of the rounded, single-rule, −1.5° shape (confirmed: it passes
  `color`/`ink` straight through, so the pigment is right and only the geometry differs).
- `client-portal/src/components/threshold/instruments/stamp.tsx:287` — 1px border,
  `tracking-[0.1em]`, no semibold, and it ages.

R14 makes the ceremony pieces shared components. **Fix:** a lockstep call at integration, or the split
goes in the wave report in writing so nobody "corrects" one surface back later.

### H-06 · minor · 0.8 — `p_why` on supersede is a capability with no way to reach it

`00569:525-531` declares the parameter and `:505-512` says it exists so *"the composer"* can re-ask on
a revision — the normal sequel to a RETURNED approval. The hook now forwards it (correct), but
`SupersedeState` deliberately `Omit`s `why` and the supersede form offers no field, so the only
reachable behaviour is carry-forward: a designer revising a returned ask cannot change the sentence
that explains it, and the frozen artifact is append-only. The lane calls this an orchestrator call and
says so accurately in the comment. **Fix:** rule it — either add the field to the supersede form (one
`<Field>` reusing `oneLine`/`WHY_MAX_LENGTH`) or record in the wave report that a re-ask cannot be
re-worded this wave.

### H-07 · minor · 0.6 — the controlled textarea moves the caret to the end whenever it collapses whitespace

`project-approval-document.tsx:782-787` rewrites the value through `oneLine()` on every change. React
re-renders with a value shorter than the DOM's, and the browser then puts the caret at the end. Typing
a second space in the middle of an already-written sentence — or pasting into the middle — therefore
throws the cursor to the end of the line. Only whitespace runs trigger it, so ordinary typing is
unaffected. **Fix (if taken):** collapse on paste and on submit only, keeping the plain value while she
types; the submit-side and hook-side `oneLine`/`oneLineWhy` gates already make that safe.

### H-08 · minor · 0.55 — Enter is swallowed without checking for an IME composition

`:779-781` is `onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }}`. During a
CJK composition Enter commits the candidate; preventing it makes the field hostile to IME input.
**Fix:** `if (event.key === 'Enter' && !(event.nativeEvent as KeyboardEvent).isComposing)`.

### H-09 · nit · 0.9 — nothing on the composer says the why is optional

Every neighbouring control passes `required` (`DeltaField`, title, question, phase, artifact, due).
The why is the only optional field on the paper and neither its label nor its helper says so, so the
first field a designer meets reads as mandatory. The brief and the test say optional; only the copy is
silent. One clause on the helper closes it.

### H-10 · nit · 0.9 — −1.1° and no aging step, against a source document that says −2° and ages

`signed-stamp.tsx:44` is `-rotate-[1.1deg]` (per the lane brief, and the web lane's `STAMP_DIALS` agree
at −1.1). `ux/02-ceremony-and-visual-language.md` §1/§5 and `proposal.html` both print −2°, and §5.2
requires one thirty-day aging step (outer 0.88 → 0.74, inner 0.42 → 0.26, word ink unchanged) which the
client's stamp implements (`ages: true`) and the designer's does not. Record both re-rulings in the
wave report.

### H-11 · nit · 0.35 — `.slice(0, WHY_MAX_LENGTH)` can split a surrogate pair

`:784` slices by UTF-16 code unit. A paste whose 200th and 201st units are a surrogate pair leaves a
lone surrogate, which PostgREST/Postgres rejects as an unsupported Unicode escape. Reachable only past
the browser's own `maxLength` truncation. Noted for completeness, unchanged from round 3.

### H-12 · nit · 0.6 — the designer's own reading view still says "Changes requested" and "Needs discussion"

`project-approval-document.tsx:137-146` (`readableStatus`) prints `Changes requested`,
`Needs discussion` and `Pending · overdue`. The program's ruled outcome family is
APPROVED / RETURNED / HELD, and the P-16 re-ruling says reconcile `changes_requested` to one word,
RETURNED on the stamp and "Returned" in prose. No refusal is breached — nothing here is homeowner
copy, and "overdue" is the designer's own word on her own paper — but the reconciliation stops at the
client's edge, so the same state has two names across the table. Orchestrator call; out of this lane's
named files.

### H-13 · nit · 0.5 — a sage `approved` tone survives on the designer's ground outside the ruled three surfaces

`configuration-snapshot-card.tsx:20` maps `approved: 'var(--color-sage)'` in `SAFETY_TONE`. It is a
spec-configuration safety state rather than a client approval outcome, and it is outside the ruling's
named surfaces (Desk / Record page / client mirror), so it is correctly untouched — recorded so the
sweep's boundary is written down rather than rediscovered. (`proposal-instruments.tsx:216-225`'s
sage/terracotta `ok`/`err` pair, flagged in round 3, is likewise still open and still pre-existing.)

### H-14 · nit · 0.9 — P-13 reaches the designer portal only; the two projections iOS reads carry no why

Cross-lane, recorded because P-13 is a four-surface item. `00569` redefines
`get_project_decision_reviews` (the designer portal's read) and emits `why` there. It does **not**
redefine `get_project_decision_review` (singular, the deep-link read) or
`list_my_project_decision_reviews` (the client/iOS inbox read), both of which
`parseProjectApprovalReview` also feeds, and neither iOS lane decodes a `why`
(`git grep -n why approvals/w2-iosc -- …DecisionsAPIClient+ProjectApprovals.swift` → one comment).
So P-13's "iOS row" surface is not delivered this wave. **Fix:** backend widens the other two
projections, or the wave report says P-13 lands on web + designer only.

### H-15 · nit · 0.3 — the composer's label hard-codes the client's gender

`What would you tell her about this?` is the build sheet's own verbatim label, so this is
brief-compliant, but it is the studio-facing copy of a product whose homeowners are not all women.
Recorded, not charged to the lane.

---

## Advisories (not findings)

- **The W1 clock-bound suite is confirmed failing**, reproduced by this reviewer:
  `client-note-composer.test.tsx` expects `Taken down Sep 4` and the clock now reads `Sep 5`
  (1 failed of 4473 across 358 suites). Ruled to the integration steward on 2026-09-05 as a one-line
  frozen clock; nothing in this branch reaches that component.
- **Deploy order (G-08) is still owed one line in the wave report**: a designer who writes a why calls
  a `p_why` signature that does not exist until 00569 lands, and 00569 DROPs the pre-`p_why`
  signatures first, so migrations must precede the designer portal.
- **`whyAuthorName`'s shape** — full display name vs given name — must be decided once, in 00569, and
  every surface must render the one key verbatim. The designer portal now does exactly that
  (`whyAttribution` trims or returns null and shortens nothing).
- **Lint is red on `main`** with the same two errors; do not read it as a Wave 2 regression.
- A rendered check on the designer portal is still owed at integration (no `.env` in a worktree), and
  ux/02's R-C2 wants it specifically for the mocha mark on mocha body ink.
