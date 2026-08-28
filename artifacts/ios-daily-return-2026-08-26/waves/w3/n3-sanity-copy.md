# First-launch tour — new Sanity bodies (B-8)

**For Kody.** Three documents in the help-system studio (project `kv3qrinl`), one edit each.
Nothing else in this program needs a CMS change.

---

## Why this is a release gate, not a nicety

The app renders `loaded?.body ?? step.fallback?.body` (`FirstLaunchTour.swift`,
`FirstLaunchTourPopoverCard`). **Sanity wins.** The rewrite has shipped in the binary as the
fallback, and `FirstLaunchTourTests` is green on it, but on the simulator every step still draws the
old sentence out of the CMS — including the one B-7(c) retires:

> *"This is your Daily Room — picks and stories chosen for your space."*

Shots `shots/w3-n3-06-tour-step1-of-3-today-flagon.png` through `-08`. Until these three documents
are edited, a first-launch user on either root is told about a screen that no longer has that name.

---

## The three edits

Surface keys are **unchanged** — they identify the documents, and renaming them orphans the copy.
Only `heading` and `body` change.

### 1 · `ios-app/first-launch-tour/step-1-home`

| | |
|---|---|
| Anchor | Today's greeting header (unchanged) |
| Heading | `Welcome to Patina` *(unchanged)* |
| **Body** | `This is Today — what moved in your house, and what is waiting on you.` |

B-8's sentence, verbatim. It replaces *"This is your Daily Room — picks and stories chosen for your
space."*

### 2 · `ios-app/first-launch-tour/step-2-saved`

| | |
|---|---|
| Anchor | **changed** — the record card on Today (was the "+ Add" button on a daily product card) |
| **Heading** | `What needs you` |
| **Body** | `Anything waiting on you lands here, dated. Tap a line to go straight to it.` |

⚠ **This step has not rendered on a shipped build since W2.** Its old anchor was the "+ Add" capsule
on `DailyProductCard`, which W2 retired — so the tour dropped the step and ran two while declaring
three. Four research walks caught it. The copy it used to hold, *"Save what you love / Add pieces to
a room with + Add — they follow you everywhere,"* describes a control that no longer exists and
should not be carried forward.

The key still reads `step-2-saved`. That is now a historical name — the step is about the record,
not about saving. Left as-is deliberately: renaming it orphans the document.

### 3 · `ios-app/first-launch-tour/step-3-profile`

| | |
|---|---|
| Anchor | the Studio door in Today's header (raw value `profile-monogram`, kept — see below) |
| **Heading** | `Your Studio` |
| **Body** | `Your studio — projects, proposals, invoices and files` |

B-8's sentence, verbatim. It replaces *"Your profile / Rooms, saved pieces, and settings live here."*

The anchor's raw value stays `profile-monogram` even though there has been no monogram since M1: the
string keys this document and is pinned by `FirstLaunchTourTests`, and steward §7·F rules that only
the mount site moves.

---

## After the edit

Relaunch with the tour state cleared — it is **cross-device**, held in `profiles.help_state`, so a
reinstall alone will not bring the tour back:

```sql
update profiles
   set help_state = jsonb_set(coalesce(help_state, '{}'::jsonb), '{tours}', '{}'::jsonb)
 where id = (select id from auth.users where email = 'client@patina.dev');
```

Expect `Step 1 of 3` → `Step 2 of 3` (arrow on the record) → `Step 3 of 3` (arrow on the Studio
control) → `Done`, in the three sentences above.
