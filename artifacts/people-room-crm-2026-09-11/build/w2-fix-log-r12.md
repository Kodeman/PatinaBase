# W2 — fix log, round 12

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, from HEAD `f4cd5c81c` ("docs(people-room): W2 round-12
adversarial code review"). Two findings assigned: `QA-R12-1` (blocking, environment precondition)
and `CR12-1` (major, the consent axis). Nothing else was touched.

---

## QA-R12-1 · blocking · the round-12 QA run never started — :3000 was already taken

**Not a code finding.** The round-12 QA reviewer stopped at its own precondition
(`lsof -ti :3000` must be empty) and performed no build, no `next start`, no Playwright run, no
Leah walk, no screenshots, no SPEC §5 acceptance-string check, no CR4-1 hairline check, no
console/hydration capture and no re-check of `w2-fix-log-r11.md`. Its assigned fix is "identify
what owns the port, have that owner free it, then re-run the whole procedure".

### What owns (owned) the port — identified

At the start of this round the port was still held, by a **different process** than the one the QA
run saw (52297 → 69648), i.e. the occupant had been restarted in between: a live session, not a
stale orphan.

```
$ lsof -ti :3000
69648
73028

$ lsof -i :3000 -P
node      69648 kody   13u  IPv6 … TCP *:3000 (LISTEN)
node      69648 kody   26u  IPv6 … TCP localhost:3000->localhost:50973 (ESTABLISHED)
…seven ESTABLISHED sockets…
chrome-he 73028 kody   19u  IPv6 … TCP localhost:50973->localhost:3000 (ESTABLISHED)

$ lsof -a -p 69648 -d cwd
node    69648 kody  cwd   DIR  …  /Users/kody/Code/patina-merged/.codex/worktrees/agent-portal/apps/designer-portal
```

The listener's working directory names the owner outright: **`.codex/worktrees/agent-portal`**, a
*different* worktree of this repo — a concurrent session under `patina-parallel-work`, with a
browser attached to it. `ps` is refused by this session's Bash sandbox (`operation not permitted:
ps`), and it is refused unsandboxed too on this host, so `cwd` is the identification. Nothing was
killed: the QA reviewer's reasoning stands — killing another worktree's live server is not this
task's to do.

### Where the port stands now

```
$ lsof -ti :3000          # 2026-09-13 11:23:44 CDT
$ echo $?
1                          # no PIDs — the port is FREE
```

`agent-portal`'s server exited on its own between the two checks. **The blocker is cleared; the QA
re-run is unblocked.**

### What this round could and could not do about it

This round's brief is explicit — *"After edits run designer type-check, supabase type-check, jest
for the touched files, and admin-portal build if a shared package changed; **do not start
servers**"* — so the round-12 QA procedure (supabase:reset, inline-env local-prod build,
`next start -p 3000`, `e2e/people` Playwright, the six-task Leah walk, 1440/390 screenshots into
`build/qa-w2-r12/`, the SPEC §5 acceptance-string sweep, CR4-1, console/hydration, the r11
re-check) was **not** run here and is **still owed**. It is now runnable without coordination:
:3000 is free as of 11:23 CDT, and a re-run should re-take the precondition reading first, since
the neighbouring worktree may restart its server at any time.

The gates this round *is* allowed to run were run, below, and are green.

---

## CR12-1 · major · the person card offered SMS consent on a landline and email consent on a 311 portal handle

`apps/designer-portal/src/components/document/people/reach-access.tsx`

### What was wrong

`ChannelRow` chose the consent axis from the channel's KIND alone:

```ts
const consentKind = isPhoneChannel(String(channel.channel_kind)) ? "sms" : "email";
```

`PHONE_KINDS` is `mobile | office | dispatch | after_hours`, so an office landline was classed
`sms` and everything else — `portal_311` included — fell to `email`. `useStudioContactChannels`
filters on `owner_id` only and `ReachAccess` passes `showConsent={isPerson}` to every row, so on a
person card the consent word, the consent sentence and the live "Record consent" disclosure printed
on every line the card held. `PERSON_CHANNEL_KINDS` narrows only the ADD form.

Ten seeded person-owned channels sit outside `mobile | email`, verified in the local database:

```
$ psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "
    select sc.full_name, c.channel_kind, c.value, c.sms_capable
      from studio_contact_channels c join studio_contacts sc on sc.id = c.owner_id
     where c.owner_type = 'person' and c.channel_kind not in ('mobile','email') order by 1;"
    full_name     | channel_kind |      value      | sms_capable
------------------+--------------+-----------------+-------------
 Claire Bissett   | office       | +16125550120    | f
 Dale Whitcomb    | office       | +16125550103    | f
 Frank Bauer      | office       | +16125550115    | f
 Ingrid Halvorsen | office       | +16125550113    | f
 Jim Lindgren     | office       | +16125550117    | f
 Jonah Feld       | office       | +16125550125    | f
 Marcus Hale      | office       | +16125550121    | f
 Ray Thao         | office       | +16125550127    | f
 Ray Thao         | portal_311   | minneapolis-311 | f
 Rosa Delgado     | office       | +16125550114    | f
(10 rows)
```

Each office value is byte-identical to its card's `phone_e164`, and `identity_consent_status`
(00626) reduces `channel_consent_status(org,'sms',n)` over `identity_phone_numbers()` — the card's
number plus every seat's. So "Put it on the books" on Ray Thao's **office** row wrote
`record_channel_consent(org,'sms','+16125550127','granted')` and his Directory row, his seat line
and his Call Sheet row then printed consent `Texting` in sage — for a municipal desk phone, on a
card whose rule clause reads "Never text. Office phone or the 311 portal only." The 311 row wrote
`studio_channel_consent(channel_kind='email', channel_value='minneapolis-311')`: a consent record
on a scheduling portal, inside the one table R-AY makes the single source of truth.

### What changed

A new exported reducer decides the axis from the LINE, and the card renders no consent affordance
at all where there is no axis:

```ts
export function channelConsentAxis(
  channel: Pick<StudioContactChannel, "channel_kind" | "sms_capable">,
): "sms" | "email" | null {
  const kind = String(channel.channel_kind);
  if (isPhoneChannel(kind)) return channel.sms_capable ? "sms" : null;
  return EMAIL_CONSENT_KINDS.has(kind) ? "email" : null;   // email | ap_email
}
```

In `ChannelRow`, `consentKind` is replaced by `consentAxis`, and a single derived
`consentable = showConsent && consentAxis !== null` now gates **all five** consent affordances that
`showConsent` used to gate on its own:

| Affordance | Before | After |
|---|---|---|
| `useChannelConsent(org, kind, value)` | `showConsent ? organizationId : null`, kind always `sms`/`email` | `consentable ? organizationId : null`, kind `consentAxis` (the query is `enabled: Boolean(org && kind && value)`, so a null axis never fires an RPC) |
| `<StateWord family="consent">` | `{showConsent && …}` | `{consentable && …}` |
| the R-Q consent sentence | `{showConsent && sentence && …}` | `{consentable && sentence && …}` |
| the "Record consent" disclosure | `{showConsent && …}` | `{consentable && …}` |
| the opted-out "they can rejoin" line | `{showConsent && …}` | `{consentable && …}` |
| the recording band | `hidden={!showConsent \|\| !recording}` | `hidden={!consentable \|\| !recording}` |

`save()` returns early on a null axis, and both `record_channel_consent` and
`record_channel_reconsent` are handed `consentAxis`, as is `peopleEvents.consentRecorded`. No new
write door: the only doors remain `useRecordChannelConsent` / `useRecordChannelReconsent`
(R-AS / R-AY). Nothing else about the row moved — `channelRowParts`, the `tel:`/`mailto:` target,
the held ground and reason, and "Hold this line" all render exactly as before, so an office line and
a 311 handle are still channels the studio can read and dial, just not channels anybody consents on.

`sms_capable` is the right column for this and `channel_kind` is not, on 00593's own statement:
the backfill leaves `sms_capable` at `false` unless there is SMS-rail evidence (an
`sms_conversations` thread, or a FIELD-kind seat moved off `not_asked`), and it says in terms that
the kind is a placeholder where evidence is missing — *"channel_kind is still `mobile` for a person
… the vocabulary has no 'unknown' and a row needs some kind — but where there is no SMS evidence
the label says so"* (`00593:381-412`; those rows carry `label = '… — line type unconfirmed'`). F-10
Sam Rowe ("never texted") and F-27 Ray Thao ("NEVER texted; scheduled through 311") are exactly the
rows the column exists to keep out of an SMS invite (crm-model §2 CS4-7, `sms_capable`: *"an office
line must not be offered an SMS invite"*).

### Consequence worth a ruling (reported, not acted on)

Nine of the twenty seeded person mobiles carry `sms_capable = false` — Adaeze Okonkwo, Carol
Nyström, Chidi Okonkwo, Kelly Marsh, Leah Hartwell, Owen Ashby, Priya Natarajan, Sam Rowe, Tom
Marrow (the 00593 backfill's "line type unconfirmed" rows). Under this fix those rows lose the
consent word and the "Record consent" act too, which is the rule as written in the finding ("`sms`
only for a phone kind whose `sms_capable` is true") and is what 00593's semantics say. But **no
surface in this build can set `sms_capable` on an existing row**: `useUpdateStudioContactChannel`
accepts `smsCapable` (`use-studio-contacts.ts:838`) and has no caller that passes it, and the only
writer is the Add-channel form, which sets `smsCapable: channelKind === "mobile"` at insert
(`reach-access.tsx`, `saveChannel`). A unique index on `(owner_id, channel_kind, value)` means the
studio cannot re-add the same number to get a capable row either. So for those nine cards the
consent door is closed with no way to reopen it from the room — which is the gap 00593 anticipated
("so W1b's Reach editor can show the studio which lines it is being asked to type") and which this
build does not yet fill. Adding that control is outside this brief ("fix exactly these findings,
nothing else"); it wants a ruling on whether W3 owes a "line type unconfirmed" line plus a way to
confirm it. Nothing in Leah's six tasks depends on it: task 1's Dana Kowalski is `sms_capable = t`,
task 2 is a login and an authority grant, and the Add sheet's own new mobiles are born capable.

### Tests

`apps/designer-portal/src/components/document/people/__tests__/reach-access.test.tsx` — a new
`describe("the consent axis")` with five cases, the first two being the pin the finding asked for:

- Ray Thao's **office** row (`+16125550127`, `sms_capable: false`) renders no
  `[data-state-family="consent"]`, no `[data-consent-sentence]`, and no "Record consent" button.
- Ray Thao's **`portal_311`** row (`minneapolis-311`) renders none of the three either.
- both rows stay on the card — "Office", "311 portal", and the office line still a `tel:` target.
- a `mobile` with `sms_capable: true` still offers the act (positive control).
- `channelConsentAxis` unit table: `mobile`+true → `sms`; `mobile`+false, `office`, `after_hours`,
  `portal_311` → `null`; `email`, `ap_email` → `email`.

The mock's `CONTACT_CHANNEL_KIND_LABELS` gains `office` and `portal_311` so those rows read in
words rather than falling back to the schema string. One pre-existing fixture in
`describe("CR7-3 …")` omitted `sms_capable` entirely on a `mobile` it then pressed "Record consent"
on; it now declares `sms_capable: true`, which is what the row it stands for is.

### Gates

```
$ cd apps/designer-portal && npx tsc --noEmit          # designer type-check
EXIT=0

$ cd packages/supabase && npx tsc --noEmit
EXIT=0

$ cd apps/designer-portal && npx jest src/components/document/people/__tests__/reach-access.test.tsx
Tests:       45 passed, 45 total

$ cd apps/designer-portal && npx jest        # whole suite, the touched file included
Test Suites: 585 passed, 585 total
Tests:       7514 passed, 7514 total          # r12 review's HEAD read 7509; +5 new
Snapshots:   1 passed, 1 total
Time:        25.374 s
```

No shared package changed (both edited files are under `apps/designer-portal/src`), so the
admin-portal build is not owed this round. `e2e/people/company-card.spec.ts:102`'s
`toHaveCount(0)` on `[data-state-family="consent"]` is unaffected — the company variant already
passed `showConsent={false}` — and no e2e spec asserts a consent word on a person card.
