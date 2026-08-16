# Start to Signature — delivery record

Program `sts`, closed 2026-08-16 on branch `sts/wave5-closeout`.
Ratified from the deck in this folder (`presentation.html`), the two direction
briefs in `source/`, and Kody's Q1–Q7 rulings recorded in `delivery-plan.md`.

Program decisions live in `docs/design/the-document/DECISIONS.md`, entries
**I137, I137-errata, I138, I139, I140, I140-errata, I141, I141-errata, I142,
I142-errata**, closed by **I143**.

---

## What shipped, per wave

All four waves are merged to `main`. `main` at closeout = `2ed96a20`.

### W1 — Collation and the shared planks · **GA, no flag**

Merge `2f2d9941` · 11 files changed, 1118 insertions(+), 191 deletions(-)
(range `8617ab30..2f2d9941`)

| commit | what |
|---|---|
| `4dda10a1` | Start to Signature W1 — the collation and the shared planks |
| `aaff9ca7` | the send-wall line dates the dispatch, not the first open |
| `f8d212ef` | W1 review corrections — no nudge on paper, a derived wall, a guarded order |
| `74d380ce` | the delivery plan — waves, rulings in force, constraints |
| `2f2d9941` | **merge** sts wave 1 (I137) |

- **The Record moved to the foot.** `PreviousWork` mounts after the active
  section, the account band and the kickoff band, immediately before the
  colophon. A reposition, not a rewrite — props, fold state, the
  awaiting-publish door and the `jumpToSection` marker are unchanged.
- **The index is derived from the paper.** One `PROJECT_PAPER_ORDER` descriptor
  drives paper mount order and the spine's running index —
  approvals → schedule → ffe → money. `DOCUMENT_INDEX_KEYS`,
  `DOCUMENT_INDEX_LABELS` and `regionHeadingId` all read out of it.
- **The add-a-room ruling (SP4).** "Add a room" prints in flow at the foot of
  the FF&E room list, never behind a `···` and never only in the head ledger.
  This answers I135's open flag: a demoted act's home is the body it acts on.
- **The send-wall state line (SP3).** One scored line at `ProposalInstruments`,
  above both walls. `deriveSendWallLine` prints exactly one of {verb, state
  word}; the nudge is withheld on a paper-issued agreement
  (`issued_on_paper`), and `ProposalWatch`'s duplicate nudge is removed so the
  word prints once.
- **SP1 and SP2** were verified already true and ratified rather than rebuilt.

### W2 — The Worktable core · **flag `worktable`, fail-closed**

Merge `c0a3824b` · 16 files changed, 1426 insertions(+), 13 deletions(-)
(range `2f2d9941..c0a3824b`)

| commit | what |
|---|---|
| `d74b7916` | sts wave 2 — the Worktable core behind a fail-closed flag |
| `43377463` | wave 2 review fixes — the accounts follow the pin |
| `c0a3824b` | **merge** sts wave 2 (I138) |

- **The table selector** (`lib/document/table-derivation.ts`) reads
  `active_section` and answers one of four tables: I intake (brief · discovery),
  II speccing (direction, and a proposal still `draft`), III finalize (a
  proposal in the client's hands), IV delivery (project · care → procurement,
  install → install). `deriveSections` is untouched — this is a layer over the
  section grammar, not a replacement (amendment A5).
- **Stale-table pinning (R7).** The composition is snapshotted at mount; a
  derivation that would compose something else arms one scored line, "The table
  is ready to turn — turn it". Data stays live throughout; the pin holds
  composition, never content.
- **The seal announces its own turn** — a sessionStorage marker (flag-on only)
  read once and cleared, printing one quiet line above the Delivery table.
- **Slots and seams.** Intake gained honest future seams (non-interactive, named
  out of the running index's own labels); Speccing gained four named, typed,
  empty mount slots for W3.
- **Flag-off parity is guarded**, by W1's `paper-order.test.tsx` (unchanged) and
  by `worktable.test.tsx` on the same page with only the flag flipped.

### W3 — The Speccing table's four tools · **flag `worktable`**

Merge `2bac3e46` · 13 files changed, 2618 insertions(+), 15 deletions(-)
(range `c0a3824b..2bac3e46`)

| commit | what |
|---|---|
| `9bf8e46e` / `4ae78c65` | the Scheme — the loose FF&E scheme on the paper (3a) |
| `df7ac1ce` / `2dd22c8a` | the boards strip — proposal-keyed board tool (3b) |
| `5df2c87c` / `5ce7a170` | the library reach-in — one door for pieces (3c) |
| `761dd9da` / `5d2afdfe` | the Rooms Rail — the Speccing table's room lens (3d) |
| `da7ae80e` | the Speccing table tooled — four slots wired, one room lens |
| `77ec0df2` | W3 review fixes — own doc-code key, dead-lens release, one surface |
| `2bac3e46` | **merge** sts wave 3 (I139) |

- Four slots filled in reading order: **rooms rail** at the table head, then
  **scheme**, **boards strip**, **reach-in** — rooms → the work → the tools.
- All four are keyed on `document_state.proposal_id` (the live chain version),
  never the raw route param.
- **One held room id, owned by the page.** The rail reports the press; the
  scheme and the strip lift that room's things to the front and never hide.
  Deliberately *not* the project room lens — different store, different subject,
  and this one persists at every width (A7).
- **The boards strip reverses I136 for the speccing stage only** (Q1, ratified).
  The shelf remains boards' home everywhere else.

### W4 — Finalize, Delivery and Intake tables · **flag `worktable`**

Merge `2ed96a20` · 35 files changed, 4296 insertions(+), 92 deletions(-)
(range `2bac3e46..2ed96a20`)

| commit | what |
|---|---|
| `83c49f33` / `3f5ccadf` | the Finalize table — headline, leader, Offer, the client's copy (4a) |
| `82f698c0` / `baf19487` | the Delivery table tooled — release lift + Money seam (4b) |
| `b7a236d6` / `e4c9966b` | Table I's spread header — the household chip promoted (4c) |
| `e0b34465` | W4 integration — the offer prints once, the table leads once |
| `ea26ff47` | W4 review corrections — the press descoped, the flags told plainly |
| `65d6bc67` | delivery plan — W4 rulings and the press descope |
| `2ed96a20` | **merge** sts wave 4 (I140–I142) |

- **Finalize:** the verdict roll-up becomes the headline in serif (the
  letterhead whisper stands down on this table only); `deriveFinalizeLeader`
  folds lifecycle × verdicts × the send wall's own answer into at most one act;
  a promoted act is a moved act, not a copied one; the Offer movement mounts as
  fold-open seams under the spread with the Room's own editability and not one
  permission more; `ProposalBlocksReadOnly` drops its Offer blocks so the offer
  prints once; the preview rail becomes the "The client's copy" shelf leaf at
  ≥1440. Gated on `commercialDocumentExperience(...) === 'legacy'`.
- **One leader per table**, ruled at integration and rescoped at review:
  exactly one inked-or-primary act inside `[data-table="finalize"]`. Letterhead
  instruments are chrome and do not count against it.
- **Delivery:** "Release for authorization" lifts to the table head on the
  procurement setting of the project spread; the ceremony itself does not move.
  The FF&E head demotes rather than inking a second release, but keeps its
  release entry whenever the lift is not showing it. Money compresses to one
  scored seam, "$X committed of $Y authority", that unfolds in place.
- **Intake:** a quiet reading-size spread header — name, description, arrival
  source — printed identity only, no affordances (Q6). Narrowed at review to
  the **discovery** spread, because on a brief document `BriefSection` prints
  all three facts immediately below.
- **The press was descoped at review.** `/drafting` stays open in both flag
  states; Amendment A3 is **not** in force in this release.

---

## Gate evidence

Run on this branch, on the tree at `2ed96a20`, 2026-08-16.

### `pnpm --filter @patina/designer-portal type-check`

```
> @patina/designer-portal@0.1.0 type-check /Users/kody/Code/patina-merged/apps/designer-portal
> tsc --noEmit


[exited with code 0]
```

### `pnpm --filter @patina/designer-portal test` (full suite)

```
Test Suites: 403 passed, 403 total
Tests:       4310 passed, 4310 total
Snapshots:   1 passed, 1 total
Time:        17.428 s
Ran all test suites.

[exited with code 0]
```

Both gates are green with **zero failures and zero skips reported**. Note the
standing repo caveat: no CI runs these on push or PR, so this local run is the
only verification that exists for this program.

---

## Flag state, and how to turn `worktable` on locally

The flag is `worktable`, resolved through
`apps/designer-portal/src/hooks/use-feature-flag.ts`. It is **fail-closed**:
`useFeatureFlag` returns `{ value: false, isLoading: true }` on the server and
on first client render, and settles to `value: false` permanently wherever
PostHog can never initialize. The page reads `.value` only
(`const worktableOn = useFeatureFlag('worktable').value`), so an unresolved
flag composes exactly main's paper — there is no flash and no half-state.

There are two ways it can ever be true, and only one of them is usable today.

**1. The env override — the verified local path.** `parseFlagOverride` reads
`NEXT_PUBLIC_FLAG_OVERRIDES`, format `flag-a:true,flag-b:false`. An entry
listed there resolves immediately, with `isLoading: false`, and PostHog is
never consulted. So:

```bash
# apps/designer-portal/.env.local
NEXT_PUBLIC_FLAG_OVERRIDES=worktable:true
```

Then restart the dev server. `NEXT_PUBLIC_*` is inlined at build/dev start, so
the override cannot change without a restart — but it is identical on server
and client, which is why there is no hydration mismatch.

Two cautions. If `.env.local` already carries a `NEXT_PUBLIC_FLAG_OVERRIDES`
line, **append to it** rather than adding a second line — the parser reads one
comma-separated string. And before starting the server, check
`NEXT_PUBLIC_SUPABASE_URL` in that same file: it has legitimately pointed at
Strata **prod** before.

**2. PostHog — the production path, not yet usable.** With no override present,
the value comes from the PostHog flag named `worktable`. Nothing in this repo
creates that flag, and this program never created it; it would have to be
created in the PostHog project and targeted at a cohort before it could be
turned on for anyone. In local dev PostHog additionally needs
`NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV=true` plus a key, or gated UI stays
invisible regardless.

**No deploy occurred, and none was requested.** Nothing from this program is on
`app.patina.cloud` or any other environment. No migrations were written, no
edge functions were touched, no portal was built or deployed. Rollback for the
GA wave is `git revert`; rollback for the flagged waves is leaving the flag off,
which is the state it is in.

---

## Owed / open

Nothing in this section is a defect in the delivered work. Each item was either
scoped out deliberately, ruled to a later release, or is a pre-existing product
gap this program surfaced. All are recorded in DECISIONS I143.

**(a) Kody's flag-on walk is owed.** This is the largest open item. Nothing is
deployed, and the flag has never been turned on in front of a human on a real
screen. Every claim in this record about how the tables *look* rests on code
reading and jest, not on eyes.

**(b) The I114 section↔stage mapping design session is owed by Kody.** Every
wave left `active_section` standing as the sealing authority rather than touch
it. Any future sealing-semantics work is gated on that session.

**(c) The Offer has no editable home on the Speccing table.** This is the reason
the `/drafting` press was descoped at the W4 review. Flag-on, a draft proposal
composes the Speccing table (Scope and Vision tools only), and the Finalize
table's Offer seams are read-only by the Drafting Room's own gate — so with the
Room pressed shut, phases, exclusions, payment milestones and terms could never
be authored on a new proposal at all. Kody's Q5 ruling was a **two-step**
retirement; the brief asked for step two early. Step two is a later release.
Amendment A3 is **not** in force in this release.

**(d) A flagged line on a sent proposal cannot be answered anywhere today.** The
Drafting Room evicts a sent or viewed proposal ("already been issued"), so
"Answer the flags" bounced off the very destination it named. This is
pre-existing — main's Desk `?flagged=1` walk-in has the same defect — and was
surfaced, not caused, by this program. The leader was dropped rather than left
pointing at a wall. Documented in I140-errata as a product debt: *the gap to
close, not the leader to restore.*

**(e) Money does not seam on the install or care spread.** Scoped out in I141:
money does not mount there (W2's accounts either-or gives the accounts to the
band instead), so a money seam on the install spread would be a new mount *and*
a second accounts surface. Bringing money onto the install spread is its own
ruling, and it has not been made.

**(f) The reach-in drops the piece's category and lands lines Unassigned.**
`ffeCategorySlug: null` means a reached-in line lands uncategorized and its doc
code falls back to the name prefix instead of a category code; `scopeRoomId:
null` means the reach does not read the room lens, so lines land Unassigned and
the room is assigned downstream on the line. Both are follow-ons.

**(g) The Scheme omits the verdict chips and the compose-decision wiring.**
Direction-stage client verdicts do not print on the paper — the builder mounts
without the Drafting Room facet's verdict read. Deliberate scope; the named
follow-on is bringing that read to the table.

**(h) The intake header opens one new gated read on a discovery document.** On a
lead document the header is React-Query-deduped against the Brief's own
`useLead` and costs nothing; on a discovery document the lead is not otherwise
read by the page, so the header adds one query, enabled only while the Intake
table's discovery spread is composed.

**(i) Four small items are known and accepted** (W4 errata):

- The client's copy can mount the preview rail twice — the shelf leaf and the
  watch's own rail can both be on the page. Both are reads of the same document.
- The lifted release leader drops focus on press: it dispatches the ceremony's
  window event and unmounts, so focus falls to the body rather than landing in
  the selection surface it opened. An accessibility debt against the lift.
- `onReleaseOffered` is not withdrawn on unmount — the page keeps the last
  value if the section unmounts while offering. Accepted because the lift and
  the section mount and unmount together under the same gate today.
- A zero-leader edge exists on Finalize: every line approved, the nudge withheld
  by the cooldown or the paper guard, and the proposal still out. The table can
  print a headline with no leader under it. Accepted — the wall below still
  states where the document stands.

### Bookkeeping, recorded not repaired

DECISIONS.md is append-only, so two findings from the consistency pass are
recorded in I143 rather than fixed in place:

- **I135 and I136 carry no `Entries add:` trailer** — the only two entries in
  the I126–I142 run without one.
- **The three W4 errata trailers dip** — appended after all three W4 entries,
  they read I140, I141, I142 *after* I142's own trailer. The file's final
  trailer, `last id = I142`, is the true position.
- **I140 must not be read without I140-errata.** I140's body still asserts the
  press, Amendment A3 in force, and "Answer the flags" as the leading verb. All
  three are reversed 111 lines below it. The same holds for I141 and its errata
  on the money seam.

---

## What the team should look at first

The flag-on walk should not start at the top of the paper. These four surfaces
are where a derivation decides what a designer sees, and where jest can prove
the logic but not the judgement.

**1. The Finalize table's derived leader — the single highest-value look.**
`deriveFinalizeLeader` folds proposal lifecycle × the verdict roll-up × the send
wall's own answer into *at most one* verb, and that verb is the loudest thing on
a sent proposal. Three things need eyes at once: that the verb offered is the
one a designer would actually reach for at that moment; that the zero-leader
edge (item i) reads as a calm document rather than a broken one; and that the
send wall below, having given up its verb, still reads as a complete sentence —
the errata split `sendWallStateWord` out precisely because the first version
left an action row with no action. Walk it on a proposal with open flags, one
with everything approved and inside the nudge cooldown, and one issued on paper.

**2. The Delivery table's release lift, and the FF&E head underneath it.** This
is a leader that moved three regions up the page while its ceremony stayed
where it was, and the two surfaces have to agree about who is holding the verb
in every window. The narrow one is `canRelease && !anyEligible` — the head
keeps a visible-but-disabled entry there, and its "No lines are currently
eligible for release." line has to explain a silence the reader can see. Also
worth a look: the focus drop on press (item i) is a debt on paper, but on a real
screen it is the moment the designer loses their place.

**3. The money seam on the project spread.** Two guards decide whether it is
folded — `allSettled ? accountQuiet : null` — and both exist because the first
version told a lie. Watch a cold load: until the reads settle, the region must
stand open with each tier printing its name and no figure, never "$0 committed ·
no authority yet" flipping to the truth. Then load a project with an overdue
invoice and confirm the seam refuses to fold at all. Money is reference until it
is owed, and the Delivery table suppresses the account band's own home — so a
seam that folds over an unquiet account states the receivable nowhere.

**4. The Speccing table's room lens.** One held id lifts a room's things to the
front of the scheme and the boards strip and never hides anything — which is
correct doctrine and also the easiest thing in the program to misread as a
filter. The specific question for a human: with a room in hand, is it obvious
that everything else is still there and merely below? Two adjacent oddities are
worth confirming in the same pass — the lift is group-granular, so the lensed
group comes ahead even of the builder's unassigned-first grouping; and
reached-in lines land Unassigned (item f), so using the reach with a room in
hand produces a line that does *not* join the room you are holding.

If there is time for a fifth: **the stale-table turn line**, on a document whose
composition changes while it is open. The pin is the ceremony this whole program
rests on, and "The table is ready to turn — turn it" is the only place a
designer is asked to consent to the paper re-composing under them.
