# Wave 2 simulator walk — round 3, targeted ("The Decision, Delivered": the ceremony)

- **Worktree** `git -C … rev-parse --show-toplevel` →
  `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-integration`,
  branch `approvals/w2-integration`, HEAD **`df3ca3ffe`**
  ("docs(approvals): the W2 final-fix round, its gates and the rebuilt walk app"), over the
  nine final-fix commits — `805ef7830` (W2R2-M1) and `8cfc27cdd` (W2R1-m1, W2R1-m2, W2R1-n2,
  W2R2-n2, W2R2-n1) are the two this walk judges.
- **App** `…/apps/mobile/Patina/.build/DerivedDataWalk/Build/Products/Debug-iphonesimulator/Patina.app`,
  `Patina.debug.dylib` stamped `2026-09-05 17:07`. The fixes are in the bundle: `strings` finds
  `Your studio` (4), `has your signature` (2),
  `Optional. Your note goes with this returned edition.` (2), `click_through` (2), and
  **zero** `Your designer has your signature`, **zero** `countersign`.
- **Simulator** `29E64516-9C2F-4D77-95D8-55D7B61E017B` (`cae-w1-walk`). Simulator.app in front,
  boot, `defaults write cloud.patina.app DeploymentTarget local`, `simctl install`, launched
  `-DeploymentTarget local`. The session from round 2 was still signed in as
  `client@patina.dev`.
- **HID preflight** — the first tap on the `Your Studio` tab was swallowed (the documented
  behaviour); the second landed and the hub mounted. Every assertion below was re-taken after
  its effect was visible.
- **Stack** local (`127.0.0.1:54322`), **NOT reset**. Ledger tail
  `00571, 00569, 00568, 00567`; `project_approval_artifacts` carries `why` and
  `why_author_name`. 00569 is applied — verified by SELECT before the first act.
- Shots: `walk-shots-r3/` (30 files). Reduce Motion was **already on** when this walk arrived
  (`defaults read com.apple.Accessibility ReduceMotionEnabled` → `1`, left from round 2) and
  stayed on for the whole walk; §4 measures it live in Settings.

## The peer program is seeding and answering the same project, live

Rows whose context reads **"Web walk r3 row."** appeared and were answered under me throughout —
the homeowner's open Stage-2 set moved 12 → 6 → 5 → 6 inside twenty minutes. Nothing below rests
on a peer row. Every row acted on is one **I** minted under a `walk-r3:*` idempotency key through
the real lifecycle RPCs, read back through `list_my_project_decision_reviews`. Where a COUNT is
the evidence (§1) the SQL and the screen reading are taken within a second or two of each other,
and both readings are reported.

## Seed, verified by SELECT through the real projection

`create_project_approval_decision` (as Leah) → `confirm_project_decision_review` (as the frozen
lead) → `publish_client_decision` (as Leah), the fixture's own chain.

| what | id | evidence |
|---|---|---|
| published, **with a why** (to be returned) | `430c9e43-…` | `why = "The slab we held reads warmer than the sample board."`, `whyAuthorName = Leah`, `viewerRole = lead` |
| published, **with a why** (to be approved) | `b906f281-…` | `why = "Choosing walnut now keeps the joinery on one lead time."`, `whyAuthorName = Leah` |
| **expired**, unanswered | `696259fe-…` | `lifecycleStatus = expired`, `disposition = active`, `outcome` NULL |
| legacy proposal, signable | `…cd301` | `status = sent`, `document_kind = legacy`, `designer_client_id` set, `payment_terms = "Fifty percent on signature."` |
| legacy proposal, signable (RM leg) | `…cd302` | same shape, `version 1` |

Homeowner **`client@patina.dev`**, uid `a0000000-…-005`; project **Aspen Loft Refresh**
`b0000000-…-00d1`; designer **Leah Hartwell** `…-004`.

Two seed notes: `client_decisions` has **`due_date`**, not `due_at` (an expired row is stamped
`status='expired'` + a past `due_date` under `session_replication_role='replica'`, because
creation refuses a past due); and `projects.proposal_id` must point at the row being signed —
which is what §3 uses to force the sign failure honestly.

---

## 1 · The Studio hub counts the approvals Today counts (`W2R2-M1`) — **FIXED**

`02-studio-hub.png`, `14-studio-hub-counts-eight.png`, `15-see-all-needs-you.png`,
`28-hub-counts-nine.png`.

Three readings, each with its own SELECT taken beside it:

| when | the hub says | `legacy pending` + `stage-2 open` (as the homeowner) |
|---|---|---|
| first mount, before I answered anything | **"Decisions · 15 approvals are waiting on you"** | 3 + 12 = **15** |
| after a cold relaunch | **"Decisions · Eight approvals are waiting on you"** | 3 + 5 = **8** |
| after a later fresh entry | **"Decisions · Nine approvals are waiting on you"** | 3 + 6 = **9** |

The `stage-2 open` half is the projection filtered exactly as `awaitsClientInFeed` filters it —
`lifecycleStatus='pending'`, `disposition='active'`, `outcome` NULL, `sentAt` not null,
`viewerRole <> 'observes'`, reviews complete. Round 2's reading — "Three approvals are waiting on
you" over six open ones, a number that never moved — is gone: the number now includes the six (and
my two), and it **moved** when I answered, 15 → 10 in the same session.

**And "See all" lands somewhere that mentions them.** `15-see-all-needs-you.png`: Today's
`See all that needs you` opens the Studio hub itself, and the hub it opens reads "Decisions ·
Eight approvals are waiting on you". Round 2's second complaint — a homeowner sent from a Today
row saying "Leah asked for your approval" to a hub that did not mention it — is closed with it.

My own two seeded approvals were inside that set before I answered them: both drew in
**"Awaiting your call"** (`04-list-walk-r3-rows.png`, "Approve the island stone as sampled?" and
"Approve walnut for the island joinery?", context "Walk r3 row."), the list
`DecisionsListViewModel` builds from the same projection. Three surfaces, one set.

## 2 · The ceremony's five fixes

### `W2R1-m1` — the composer names the designer once — **FIXED**

`10-return-composer.png`. Under "WHAT SHOULD CHANGE?" the field reads **"Tell Leah what to
change."** and the line beneath it reads **"Optional. Your note goes with this returned
edition."** — no second naming of the same person. No name is asked for a Return.

### `W2R1-m2` — the seal sentence names the studio — **FIXED, both branches**

- **Named:** `22-seal-hartwell-studio-rm.png` — with `profiles.business_name = 'Hartwell Studio'`
  seeded on Leah, the seal reads **"Hartwell Studio has your signature. You'll have a copy."**
  (`sealMoment.next`). The ruled sentence, verbatim.
- **Unnamed:** `20-seal-your-studio.png` — with `business_name` NULL (the seed's own state) it
  reads **"Your studio has your signature. You'll have a copy."** A studio in the general, never
  the nearest person. Round 2 read "Leah Hartwell has your signature."
- `signingStudio` is the resolver behind both; `business_name` was restored to NULL at the end.

### `W2R1-n2` — the refused signature is body ink — **FIXED**

`19-sign-failure.png`. Forced by leaving `projects.proposal_id` NULL, so `sign_proposal` refuses
and nothing is signed (`select … from proposals where id='…cd301'` → `status=sent`,
`signed_at` NULL at that moment). The sentence "We couldn't record your signature. Nothing has
been signed." measures **RGB(92,74,60)** = `#5C4A3C` = `PatinaColors.mocha` =
`Text.secondary`'s light value, at **7.86:1** — not `errorDeep` `#9C4C3F` = RGB(156,76,63), which
is what round 2 measured. Zero greenish pixels on the frame.

**The one-character route is unreachable, as the brief allowed for.** With the consent box ticked
and `M` in the name field, `proposalSign.confirm` measures `enabled: false`
(`ProposalSignActCopy.signatureFloor = 2`); completing the name flipped it to `true`. So the
failure was forced through the RPC instead, which is round 2's own method.

### `W2R2-n2` — the studio's terms are printed verbatim — **FIXED**

`18-sign-act-terms-verbatim.png`, `21-sign-act-rm.png`. The sign act's TERMS row reads
**"Fifty percent on signature."** on both proposals — round 2 read "Fifty Percent On Signature."
The proposal detail prints it the same way (`Fifty percent on signature.`), so the two surfaces
no longer disagree about the studio's own sentence.

### `W2R2-n1` — under Reduce Motion the seal arrives without the slide — **FIXED**

Measured in flight: `simctl io recordVideo` across the whole sign act, frames pulled at 30 fps
with an `AVAssetImageGenerator` (`requestedTimeTolerance*` = `.zero`), 463 frames.

- **The cover arrives in ONE frame.** Per-frame mean absolute difference over the arrival:
  `…, f149 0.02, f150 5.79, f151 0.06, f152 0.04, …` — a single 5.79 spike at `t=5000 ms` and
  nothing before or after it. Round 2's slide was ~65 pt spread over ~330 ms, which cannot look
  like that.
- **The stamp's band does not move or scale.** Over frames `f151 → f162` the stamp band's
  bounding box is **constant** at x 95–419, y 1007–1127 (325 × 121 px) while its mean ink
  darkens **221.8 → 134.2** and then holds — a pure cross-fade, ~370 ms, exactly what
  `SealMomentView`'s `reduceMotion` branch promises.
- Frames kept: `23-rm-settle-t-before.png`, `24-rm-settle-t33ms.png`, `25-rm-settle-t200ms.png`,
  `26-rm-settle-t400ms.png`.
- **The setting is real and the platform's own switch is still off**
  (`27-reduce-motion-on.png`): Settings → Accessibility → Motion, `REDUCE_MOTION` AXValue
  **"1"**, `REDUCE_MOTION_REDUCE_SLIDE_ANIMATIONS` ("Prefer Cross-Fade Transitions") AXValue
  **"0"** — its default. The cover honours `reduceMotion` itself, which is the whole of the fix.

## 3 · Regression spot-checks

### Approve — typed name + hold, first press — **PASS**

`05-approval-b-why-doors.png`, `06-approve-signature-rule.png`, `07-signature-typed.png`,
`08-after-approve.png`.

The why and its author draw ("Choosing walnut now keeps the joinery on one lead time." / "—
Leah"), the signature rule appears only under a chosen Approve, `decisionDetail.approval.submit`
measured `enabled: false` empty and `true` with the name on it, and one 1.6 s press landed it:

```
select status, answer, client_consent_method, client_signature, client_consented_at
  from client_decisions where id='b906f281-…'
 responded | approved | electronic_signature | Margaret Whitfield | 2026-09-05 22:20:16.433+00
receipts: created walk-r3:b-create · review_confirmed walk-r3:b-review ·
          published publish-v1:b906f281-… · responded 8EE9D464-…   ← exactly one responded
```

APPROVED stamp measured on `08`: interior **RGB(250,247,242)** = the page ground (no fill), word
**RGB(92,74,60)** mocha at **7.86:1**, rule RGB(111,95,82). No checkmark, no green.

### Return, the RETURNED stamp, and her own note — **PASS**

`09-approval-a-deeplink.png` (cold deep link `…/decisions/430c9e43-…`),
`11-return-note-typed.png`, `12-returned-stamp-discussion.png`.

One 1.6 s press:

```
select status, answer, client_consent_method, client_signature from client_decisions where id='430c9e43-…'
 responded | changes_requested | click_through | (null)
select author_id, body from decision_comments where decision_id='430c9e43-…'
 a0000000-…-005 | The stone reads too warm beside the walnut.
receipts: created walk-r3:a-create · review_confirmed walk-r3:a-review ·
          published publish-v1:430c9e43-… · responded FF8327A7-…   ← exactly one responded
```

**THE DISCUSSION / YOU · SEP 5, 2026 / "The stone reads too warm beside the walnut."** draws
immediately after the submit, beside RETURNED and "You returned this edition for revision."
RETURNED stamp: interior = page ground (no fill), word RGB(44,41,38) at **13.5:1**, rule
RGB(144,115,70). No sage on the frame.

**On the consent token.** Return records `client_consent_method = 'click_through'`, not the
ruling's literal `portal_clickthrough`. The column's own constraint is
`CHECK (client_consent_method IS NULL OR = ANY ('electronic_signature','click_through','paper'))`
— the ruled spelling would be refused outright, and the wave report already carries this as
advisory 2. The ruling's meaning (never NULL; a press-and-hold is a click-through) is what
shipped. Recorded, not filed.

### The lapsed approval says it closed — **PASS**

`17-stamp-expired.png`. EXPIRED stamp beside **"This approval closed before it was answered. Your
designer can send it again."** Rule RGB(109,98,88), word RGB(78,67,57) at **8.99:1**, interior =
page ground. `W2R1-B1` stays closed.

### Nothing sage, no checkmark status — **PASS**

A full-frame scan for any pixel where green exceeds both red and blue returns **zero** on every
ceremony screen measured: `02`, `05`, `08`, `10`, `12`, `17`, `18`, `19`, `22`, `29`, `30`.

- `29-proposals-list.png`: the **ACCEPTED (9)** header measures RGB(92,74,60) mocha at
  **7.86:1** — `W2R1-M1` stays closed.
- `30-legacy-option-choice.png` (an answered legacy option choice): the chosen option draws a
  **mocha** rule and the words **"Your choice"** at RGB(92,74,60), **7.52:1**, with **no glyph**
  anywhere and zero greenish pixels — `W2R1-M2` stays closed. The stamp beside it is APPROVED,
  bordered, unfilled.

---

## Findings

**No blocker. No major.** All five findings this round was sent to judge are closed on the device.

### `W2R3-n1` · nit · the hub's number is a snapshot, and re-entering the tab does not refresh it

`13-studio-hub-after-two-answers.png`. After I answered two approvals the hub moved 15 → **Ten**,
correctly. It then stayed at "Ten" across **three** consecutive Today→Studio re-entries while the
homeowner's real set fell to 8 (the peer program was answering its own rows underneath). A cold
relaunch read 8, and a later entry read 9 — both exact. So the merge is right and the *fetch* is
what is occasional: `StudioHubViewModel` keeps its loaded sources and a tab re-entry inside a live
session did not re-run them. Harmless on a phone that only its owner acts on, visible the moment
two actors share a project. Outside this round's scope; noted for whoever owns the hub's refresh
policy.

### `W2R1-n3` · nit · numerals survive where the neighbouring words spell counts — **UNCHANGED**

`28-hub-counts-nine.png`: "**14** things need your eye" and "Awaiting you · **14**" sit beside
"**Nine** approvals are waiting on you", "In progress · **one**", "Conversation · **two**",
"Money & documents · **five**". `29-proposals-list.png`: "AWAITING YOUR REVIEW (**3**)",
"ACCEPTED (**9**)". Ruled a Wave 3 sweep item (P-24 residue) at the Wave 2 walks; restated only
so the sweep has a current list.

### `W2R1-n4` · nit · the Stage-2 card carries no kind chip where the legacy row does — **UNCHANGED**

`03-decision-list.png` vs `04-list-walk-r3-rows.png`. On "Awaiting your call" the legacy rows
draw `Approval` / `Color` / `Product` chips; every Stage-2 approval draws none. Nothing is
mislabelled — the detail carries the APPROVAL eyebrow. Restates `W1R3-n3`.

---

## Closed this round

| finding | round 2 | round 3 |
|---|---|---|
| `W2R2-M1` the Studio hub never counts a Stage-2 approval | major | **FIXED** — three readings, each equal to the merged set by SELECT: 15=3+12, 8=3+5, 9=3+6; and "See all that needs you" lands on the hub that says it |
| `W2R1-m1` the composer names the designer two ways | minor | **FIXED** — `10`: "Tell Leah what to change." over "Optional. Your note goes with this returned edition." |
| `W2R1-m2` the seal names a person where the ruling names a studio | minor | **FIXED** — `22`: "Hartwell Studio has your signature."; `20`: "Your studio has your signature." where no studio name exists |
| `W2R1-n2` the signature failure is the one red sentence | nit | **FIXED** — `19`: RGB(92,74,60) mocha at 7.86:1, not `#9C4C3F` |
| `W2R2-n2` the sign act title-cases the studio's terms | nit | **FIXED** — `18`, `21`: "Fifty percent on signature." verbatim |
| `W2R2-n1` under Reduce Motion the seal still slides | nit | **FIXED** — one-frame arrival (diff 5.79 at f150, neighbours ≤0.06), stamp band constant 325×121 px while ink 221.8 → 134.2 |

---

## Housekeeping

- **Local stack**, all mutations local, on a stack a peer program is also using. Minted:
  three approvals under `walk-r3:*` (`430c9e43` returned, `b906f281` approved, `696259fe`
  expired via replica mode); two legacy proposals `…cd301` / `…cd302`, both signed by the app
  (`accepted`, `signed_by_name = Margaret Whitfield`).
- **Restored to their seeded values:** `profiles.business_name` for Leah (→ NULL, verified) and
  `projects.proposal_id` (→ NULL, verified). Reduce Motion left ON, the state this walk found.
- **The ledger was not touched** — `00571, 00569, 00568, 00567` before and after. No reset.
- **Nothing was pushed. No production mutation. No product code was written.**
- **Harness notes.** `simctl list` answered on the first try this round (no `killall -9` needed).
  A `device_actions` batch fired at a `.fullScreenCover` that was still presenting loses its
  taps — the sign act came up with the consent unticked and the field empty; re-issuing the taps
  singly landed them. `describe_after`'s point probe can return the screen the app was on a beat
  earlier; the screenshot is the arbiter. `Read` on a PNG is the cheapest way to read a screen —
  a full `describe_screen` runs 4–6k tokens.
- **Still unobservable, unchanged:** the seal's haptic (no Taptic Engine on a simulator) and the
  lock screen's two app-defined actions (an AX custom action cannot be invoked by this harness).
- Simulator shut down at the end; not deleted.
