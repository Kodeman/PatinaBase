# Kody script — Field Companion combined device pass, **iPhone 17 Pro Max, iOS 27**

One walk, ordered, that closes out **wave 1's owed blocks C–I** (`waves/wave-1/device-pass-kody-script.md`
— A and B are already done: install/sign-in, and the first voice note PASS) **and** wave 3's **Task 33**
gate (`plans/wave-3-plan.md`, "the device pass — a real eight-minute walk at a real address, half of it
in airplane mode"). No agent may mark Task 33 complete; this walk is that gate.

Read every numbered step. After each lettered block, say the line shown — that is your cue to Claude
that the block is over and the effect (a database row, a PostHog event, a file on the phone) should now
exist and can be checked without you.

---

## Before you start

- **Airplane Mode is a one-way door for automation.** The moment it goes on, WDA stops listening —
  not just over WiFi but over the USB tunnel to the phone's own loopback too — and it cannot be
  restarted while offline (iOS won't validate a dev certificate with no network). **That is why the
  airplane-mode work is Block I, last**, and **you** flip the switch both ways, not Claude. Every
  earlier block assumes automation is attached and the phone is online.
- **Never install a `CODE_SIGNING_ALLOWED=NO` build for this.** That's a sim-walk harness build; it is
  not a real device build and this walk proves nothing on it. The build comes from
  `ruby scripts/generate_project.rb && xcodebuild -project Capture.xcodeproj -scheme Capture
  -destination 'generic/platform=iOS' archive`, installed signed.
- **Sign in as a real designer with at least two real projects**: one with **both** `project_rooms`
  and `public.rooms` entries, one with **no registered client** (so its `public.rooms` lane is empty —
  the case §9.7 says degrades silently if it's not handled honestly).
- **The `field-companion-voice` flag (id `845875`) gets read BEFORE any voice step — by Claude, not
  by you.** There is no Settings/Sync toggle in this build that shows it (checked: `SettingsScreen.swift`
  has no flag surface, and there's no debug menu anywhere under `Capture/`). The flag is read via
  `CaptureAnalytics.isFeatureEnabled`, which is `PostHogSDK.shared.isFeatureEnabled(_:)`
  (`PostHogCaptureAnalytics.swift:62-64`) — a client-side evaluation that PostHog also logs server-side
  as a `$feature_flag_called` event carrying `$feature_flag_response`. Claude checks that event for your
  device/designer **before Block C** and reports true/false here rather than assuming last session's
  answer still holds.
- **You cannot take a photo while a C6 voice note is recording, and Block E must stand alone.**
  Read the code before trusting the old script's framing: `ViewfinderModel.micIsAvailable` is
  `featureFlags.isEnabled("field-companion-voice") && mode != .voice`
  (`ViewfinderModel.swift:461`) — that's the **C3 card's own inline mic**, disabled whenever the mode
  is VOICE, specifically so two recorders never fight over one `AVAudioSession`
  (`ViewfinderModel.swift:463-467`). C6 itself (`C6VoiceScreen.swift`) is a **full-bleed mode with no
  shutter control at all** — there's no photo affordance on screen while it's up — and swiping to any
  other mode while it's recording fires `.onDisappear` → `C6VoiceModel.leave()`, which **stops and
  commits the take** (`C6VoiceScreen.swift:246-252`), it does not pause it. So: no, this build does not
  let you shoot a photo mid-note, and Block E (the 20-minute note) below is **not** something to run
  "while doing other blocks" — it gets its own dedicated, uninterrupted stretch, same as wave 1 scoped
  it.
- Setup as before: phone unlocked, on USB **for every block except I**, Auto-Lock Never. To hand:
  AirPods, a wired headset, a second phone to call you from, four objects (**chair, table lamp, rug,
  cabinet pull**), and Speech Recognition access you can flip in Settings.

---

## Order and time

| Block | What | Needs | ~min |
|---|---|---|---|
| C | Four real objects | your hands | 8 |
| G | Recognition switched off | your voice, Settings | 8 |
| E (+ D folded in) | The three-minute markers, then the twenty-minute note | your voice, standing still | 24 |
| F | Interruptions only a real phone can make | a second phone | 15 |
| H | A real room | a room, LiDAR | 10 |
| I | The real-address walk — Task 33's eight minutes, **airplane mode for the middle of it**, last | a real address, your thumb on the radio | ~15 active + 35 backgrounded |

**Total ~80 minutes of attention, plus 35 minutes where the phone sits backgrounded on its own** (get
lunch during that part — that's the point of the step).

Blocks C, G, E, F, H are unchanged in intent from wave 1's script, just reordered so the one-way door
comes last. Block I replaces wave 1's Block I outright: it is Task 33's exact eight-step walk, with
wave 1 Block I's offline-photo and outbox-drain checks folded into steps 3 and 7 rather than run twice.

---

## Block C — four real objects (8 min) · needs your hands

Only a real camera settles this: the reader has already returned two different categories off two real
frames in earlier sessions (floor → `Table`, a fabric bag → `textile`), so what's left is your four
objects giving four distinct reads, not the same one four times.

1. Aim at the **chair**, filling the frame, good light. Shutter fires.
2. Watch the card; say the **category it lands on**, and whether it arrived **a beat after** the card
   rather than with it.
3. Same for the **table lamp**. 4. The **rug**. 5. The **cabinet pull**.
   ⚠ If all four come back the **same** category, say so. If a card claims a material — "Oak",
   "bouclé" — that was **not** written on a label in the shot, say so; that's the invented-material
   failure.
6. Aim at a **wall defect** — damaged baseboard, drywall seam, a bad scuff. Say whether a category
   appears **at all**. Expected: **nothing recorded**, and S3 recommends Inbox for it.
7. Speak a made-up measurement out loud while a card is up — "the alcove's about forty-two and three
   quarters" — and say whether **any number field on screen changed**. Expected: none does — a spoken
   number is a note that says the number, never a measured record (**FC-R16**; wave 6's applier is the
   only thing that could write to `room_file_measurements`, and it doesn't exist yet, so there is
   nothing here that could wire past this).

`say "block C done"`

---

## Block G — recognition switched off (8 min) · needs your voice

8. Settings → Privacy & Security → **Speech Recognition** → **deny** for Patina Field. Leave
   **Microphone** allowed. Tell Claude when done — the cold open and which editor appears get checked.
9. **The 20-second version.** Hold the mic, speak 20 s. While recording, say whether the **orange mic
   dot** lit and whether the **elapsed counter** is running. Release, tap Play, say whether audible.
10. **The 70-second version — the one that matters.** Hold the mic and keep speaking **at least 70
    seconds**, past the 50-second rotation boundary. Say **"fifty gone"** at about 0:55. Watch one
    thing: **does the note end on its own at ~50 seconds?** It must not — counter keeps running, dot
    stays lit, no fall to the typed editor until you lift your finger. Release past 70 s.
11. Turn **Speech Recognition back ON**. Tell Claude when done.

`say "block G done"`

---

## Block E — the three-minute markers, then the twenty-minute note (24 min) · needs your voice

Wave 1 scoped this as two blocks (D, 5 min; E, 22 min). They're the same shape — talk continuously,
watch the transcript, don't stop — so this walk runs them as one uninterrupted take: the first three
minutes carry D's markers, and the take keeps going to the twenty-minute cap instead of being cut and
restarted. **Do not lock the phone and do not touch Stop anywhere in this block** — Block I tests the
lock-mid-note case on a separate take, deliberately.

12. Swipe to **VOICE** (C6) and **tap** to start — not a hold; C6 is tap-to-start/tap-to-stop by design
    (**FC-R11**'s unmissable-chrome posture: the toggle is the shutter-sized, shutter-placed control,
    never ambient). Set the phone down and read aloud continuously.
13. Say clearly **"twenty"** at 0:20, **"one ten"** at 1:10, **"two ten"** at 2:10.
14. Glance at the transcript pane at **1:30**, **2:00**, **2:30**. Each time say whether it's **still
    growing** or **frozen**. *(This is D's rotation check: every take recorded before this program came
    back `segments=1` — under 50 seconds each — so nothing has ever proven rotation past that boundary
    until this take crosses it.)*
15. Keep going. Say **"minute ten"** at 10:30, **"minute twenty"** at 19:30, and keep words coming
    every minute in between.
16. At about **20:00** it should stop **by itself**. When it does, say: the **time it stopped**,
    whether the **orange mic dot** went out **right then**, and read the cap line word for word —
    expected *"This note reached twenty minutes and stopped. Start another when you're ready."*
    (§7.4). If it stops around **50 seconds** instead, say so immediately — that's the pre-fix
    signature and ends the block early.

`say "block E done"`

---

## Block F — interruptions only a real phone can make (15 min) · needs a second phone

Three distinct cases; don't merge them.

17. **A call mid-note.** Note starts, talk 20 s, second phone calls, **answer**, say a sentence, hang
    up. Back in the app, **keep talking 90 s**, saying **"after the call"** as you resume. Say whether
    the transcript is **still updating** at the end.
18. **The crash sequence** — this exact order: note starts, talk 10 s → second phone calls, **answer**
    → **while still on the call**, return to the app and **stop the note** → end the call → **second
    note**, talk 15 s saying **"second note"**. Say whether the app crashed anywhere in that.
19. **Decline a call.** Note starts, talk 10 s, second phone calls, **decline**. Keep talking 15 s,
    stop. Say whether the **orange mic dot** is out afterward. *(Expect this one to misbehave — nothing
    marks it today. Report what you see, not what should happen.)*
20. **AirPods.** Note starts with AirPods **out**, talk 20 s. **Put them in** mid-note — say **"airpods
    in"** — talk 20 s. **Take them out** — say **"airpods out"** — talk 20 s. Stop, then say roughly
    **how long the whole note ran**.
21. **Wired headset.** Note starts on the built-in mic, talk 20 s, **plug in the wired headset** saying
    **"wired in"**, keep talking past **90 seconds total**. Stop.

`say "block F done"`

---

## Block H — a real room (10 min) · needs a room

22. **LiDAR room walk.** Start a site scan; walk a real room properly — corners, walls, floor, the way
    you actually would. Say when you start and when you finish.

`say "block H done"`

---

## Block I — the real-address walk (Task 33's eight minutes, airplane mode for the middle of it) · last, on purpose

This **is** wave 3's Task 33 gate, run verbatim, with wave 1's offline-photo and queue-drain checks
folded into steps 3 and 7 so nothing gets tested twice. ⚠ Simulator runs prove none of this —
`AVFoundation` and `CoreLocation` are mocked on the simulator (`AppContainer.swift:14-19`), which is
exactly the half of wave 3 that matters here: the venue stamp, the learned centroid, the microphone,
and the offline door.

**From here, you flip the radio — Claude cannot.** Automation drops the instant airplane mode goes on
and cannot reattach until it's off again; say each numbered checkpoint out loud (or type it, whichever
channel you have once you're back near a screen) so Claude can verify by effect once it's reconnected,
rather than watching live.

23. Cold launch with **no visit open**. Confirm it lands on **Today** (**FC-R1** — Today is home).
24. **Turn on airplane mode.** Start a visit: **`+ Start a visit`** → project → room → **Start visit**.
    Time it and count the taps — target is **3 taps, ≤8 seconds**. On the kind picker you'll see
    **Site visit / Sourcing** and, once a kind's picked, the **kit** row (Walk-through / Trade walk /
    Install) — pick **Walk-through** here (**FC-R2**: two kinds, three kits, no visit = null kind).
    Note the room step: it should show **both** the project's own rooms and any scan rooms merged by
    name, plus **Whole house** (**FC-R5** — merged by trimmed name, never cross-assigned).
25. Shutter a photo → hold the card's mic → speak ten seconds → release → **Save**. This is airplane
    mode already, so it's also wave 1's offline-photo check: say what the **offline banner** reads —
    expect it names the **outbox depth** ("No signal · saving on device" + a count), not a session
    count.
26. Swipe to **VOICE**, tap to start, talk for **three minutes while walking between rooms**, **lock
    the phone mid-note**, unlock, tap **Stop**. Say whether the transcript kept going past ~60 seconds
    (it must — no truncation), and whether locking read as an honest pause — expect *"Paused — your
    note is saved. Tap to keep going"* (**FC-R9** — foreground-only, honest on lock, never silent) —
    and whether resuming continued as **one note or started a second one**; say which, don't assume.
27. Open **F1 Site scan** and confirm it **collapsed to one line** now that a visit is open.
28. **Background the app for 35 minutes** (get lunch). Reopen it and confirm the **"Still at …?"**
    prompt with **Resume** / **End visit** — the 30-minute stale window (`CaptureVisitPolicy.
    staleConfirmWindow`), not the 12-hour auto-end.
29. **Turn airplane mode off.** Watch the queue drain **with no tap from you** — this is wave 1's
    Block I proper: the capture and note from step 25/26 should sync with nothing prompted.
30. Take one capture with **no visit open** and read the suggestion **out loud in words, with no
    number on screen** — nothing is ever lost, it waits on Today as an unplaced row (**FC-R6**).
31. Repeat step 24 on the **client-less project** — airplane mode goes back on for this — and read
    the honest expansion out loud (expect language that says plainly there are no client rooms here,
    not a silently empty list — **FC-R5**'s other half).
32. **Turn airplane mode off again**, then **end the visit from the tray**. Confirm Today reflects it.

`say "block I done"`

---

## Step 3 — fill the table in, every row, including the ones you didn't reach

Verbatim from `plans/wave-3-plan.md` Task 33. Cross-reference: rows 1, 3–8, 16–19, 21 come from the
walk steps above (23–32); rows 9–10 come from step 26; row 13 from step 27; row 15 from step 28; row
20 spans every block above, not just this one (check C1, C3, C5, F1, and every non-camera screen you
touched all walk). **Any row marked "no" that isn't already in the not-exercised set is a wave-3 bug —
list it by name with a reproduction before the wave is called done.**

| # | Claim under test | Exercised? | Evidence / what actually happened |
|---|---|---|---|
| 1 | Cold launch with no visit lands on Today | ☐ yes ☐ no | |
| 2 | Cold launch inside an active visit lands on C1 with the chip lit | ☐ yes ☐ no | |
| 3 | Door: **3 taps and ≤8 s**, in airplane mode | ☐ yes ☐ no | taps: ___ · seconds: ___ |
| 4 | The offline project list is populated and captioned honestly | ☐ yes ☐ no | caption read: ___ |
| 5 | The merged room picker shows both lanes, and Whole house | ☐ yes ☐ no | |
| 6 | A client-less project says so out loud rather than degrading quietly | ☐ yes ☐ no | line read: ___ |
| 7 | Capture: **2 taps + 1 hold**, project and room attached | ☐ yes ☐ no | taps: ___ |
| 8 | S3 did not appear inside the visit | ☐ yes ☐ no | |
| 9 | C6: tap-to-start / tap-to-stop, three minutes, transcript not truncated at ~60 s | ☐ yes ☐ no | duration: ___ |
| 10 | Locking mid-note paused honestly and lost nothing (FC-R9) | ☐ yes ☐ no | |
| 11 | The audio file exists on device with non-zero size after the note | ☐ yes ☐ no | |
| 12 | A walk-through kit defaulted the note to `conversation` + the affirmation chip | ☐ yes ☐ no | |
| 13 | F1 collapsed to one line inside the visit | ☐ yes ☐ no | |
| 14 | F1 expanded and said so on a non-ownable project | ☐ yes ☐ no | (may be unreachable without a second designer's project) |
| 15 | The 30-minute stale prompt fired, and Resume kept the visit | ☐ yes ☐ no | |
| 16 | Leaving airplane mode drained the queue without a manual retry | ☐ yes ☐ no | |
| 17 | A no-visit capture was born with a suggestion, in words, with no number | ☐ yes ☐ no | reason read: ___ |
| 18 | The unplaced tray listed it, and one tap placed it | ☐ yes ☐ no | |
| 19 | End visit closed the visit and Today reflected it | ☐ yes ☐ no | |
| 20 | Invariant V held on C1, C3, C5, F1 and every non-camera screen | ☐ yes ☐ no | which screen failed: ___ |
| 21 | The word "Inbox" appeared nowhere she can read | ☐ yes ☐ no | |
| 22 | `visit.start`, `visit.end` and `capture.placed` arrived in PostHog | ☐ yes ☐ no | |
| 23 | The 12-hour auto-end | ☐ **not exercised** — an eight-minute walk cannot reach it | verify separately, or accept it on the unit test |
| 24 | The never-across-a-calendar-day rule | ☐ **not exercised** — needs an overnight | verify separately, or accept it on the unit test |
| 25 | The 20-minute / 24-segment cap | ☐ yes ☐ no | Block E above should have exercised this — cross out "not exercised" if it did |

Paste the completed table into the wave report. Rows 23–24 stay honestly "not exercised" — they're
covered by `VisitContextTests` and `VoiceModeTests`, and saying so is the whole point of the column.

---

## Already settled — not in this walk

Driven and confirmed in earlier sessions, re-run only if you want to see them yourself: the entire
voice write path (record → transcribe on device → attach → save → route → upload), format confirmed by
`afinfo` on the synced copy (AAC / mono / 48 kHz / 32 kbps); the install-over/store proof; a full
capture → route → sync to the server; S3 recommending Inbox and S4's "Parked in your inbox" copy; the
C1 mode row and its four-pill swipe cycle; the placement walk (shutter → card → project → room → Done,
3 taps); card label updating with no refresh; placement inheritance to the next capture; S1 entry
points correctly hiding "Done"; tray footer states; the offline banner's outbox depth; the F1 reference-
capture cover and its `screen.F1.context` PostHog hop; server-side `project_id` + `project_room_id` on
the inbox path.

## Not run at any level, and why

- **ASan/Zombies rotation soak** and **the hot-mic probe** need an instrumented build and forced
  failure injection. Reported not run.
- **The disk-fill probe** (under ~200 MB free) is a hardening probe, not a release gate, slow to undo.
  Skip unless you want it.
- **The organic no-LiDAR trigger** for F1's context cover needs a genuinely LiDAR-less device; this
  phone can't prove it.
- **Whether discarding a note deletes its file** — `devicectl` can't list or copy from the App Group
  root where `CaptureMedia` lives, so there's no way to look for orphans from outside the app.
- **W2-4, the sync Live Activity** — needs a sustained sync with work queued; not driven here.
- **FC-R16's applier** — doesn't exist until wave 6; step 7 of Block C only confirms nothing currently
  wires a spoken number anywhere near a measured record, which is all that can be proven pre-wave-6.

---

## Agent verifies — the effect-check per block

Run these **after** the block's `say` line lands, not during. Every name below is taken from the code,
not invented.

**Flag read (before Block C, not after any block):**
- PostHog: query the `$feature_flag_called` event for this device/designer, filter
  `$feature_flag_response` where the flag key is `field-companion-voice` (id `845875`). This is the
  only surface it's visible on — there is no in-app flag display in this build.

**Block C:**
- Supabase: new `field_captures` rows (`capture_kind = 'specimen'`) against the pre-walk baseline,
  one per object shot, with `category`/`materials`/`colors` populated only where a real read landed —
  never four identical categories.
- No row from this block should carry a numeric measurement written outside `notes`/`raw_payload`
  from the spoken-measurement probe (step 7) — `dimensions` should be unchanged by it.

**Block G:**
- PostHog: `voice.start` with `surface` matching the C3/N4 card, and — for step 10 — no
  `voice.segment_rotated` or forced stop anywhere near the 50 s mark; the recording only ends on
  release.

**Block E:**
- PostHog: one `voice.start` (`surface: "c6"`), a chain of `voice.segment_rotated` events (index
  climbing — 24 segments is the cap, at 50 s/segment that's ~20 min), and one `voice.finish` with
  `reason` naming the cap and `segments` at or near 24, `on_device` true.
- Supabase: the resulting `field_captures` row — `capture_kind = 'note'`, `voice_audio_segments`
  a non-empty jsonb array, `voice_transcript` populated, `transcript_source` in
  (`'device'`,`'device_partial'`).
- Storage: new object(s) under the `capture-media` bucket at
  `capture-media/<auth.uid()>/<client_capture_id>/…` for this designer, sized above the ~61 KB header
  floor (the old ">20 KB" floor doesn't work — that header alone clears it).

**Block F:**
- PostHog: `voice.interrupted` with `reason` distinguishing the call-answer case from AirPods/wired
  transitions if the recorder logs those separately; `voice.audio_write_failed` should NOT appear
  unless step 19 (decline) actually breaks something, in which case its `reason`/`buffers` properties
  are the evidence to paste into the bug report.

**Block H:**
- No `field_captures` row required — a LiDAR scan session's evidence is the scan artifact itself
  (F1/site-scan storage path) and a clean `screen.F1.context`-style screen event, not a capture row.

**Block I (Task 33's walk):**
- Supabase `field_captures`, filtered to rows created after Block I's start time:
  - Step 24's visit: rows carrying `visit_id`, `visit_kind = 'site'`, `visit_kit = 'walk_through'`,
    `visit_started_at` set (migration `00532_field_capture_visit_and_suggestion.sql`, section (a)/(c)
    — the `trg_field_captures_visit_projection` trigger projects these off `raw_payload->'visit'`).
  - Step 25's photo+note: `note_setting` (migration `00530_field_capture_notes_and_routing.sql`) should
    read `'conversation'` if the walk-through kit's default held, or `'solo'` if it didn't — that's
    exactly table row 12.
  - Step 30's no-visit capture: `visit_id IS NULL`, `suggested_project_id`/`suggestion_basis` populated
    (basis one of `'visit'|'scan'|'proximity'|'venue'|'calendar'|'transcript'`), `project_id IS NULL`
    until placed from the tray.
  - Check `raw_payload->'visit_projection_errors'` is **empty** on every row from this block — a
    non-empty array there means the device sent a visit/suggestion key the trigger couldn't parse, and
    that's a bug even if the UI looked fine.
- PostHog: `visit.start` (`kind: "site"`, `kit: "walk_through"`, `offline: "true"` for step 24),
  `visit.stale_prompt` (`answer`) for step 28, `capture.placed` (`basis`, `has_room`) or
  `suggestion.accepted` for step 30's placement from the tray, `visit.end` (`duration_min`, `captures`,
  `notes`, `scans`, `unplaced`) for step 32.
- Confirm no `field_captures` row anywhere in this block carries the literal string "Inbox" in any
  designer-facing field — table row 21.
