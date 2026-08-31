# Kody script — Field Companion device pass, **iPhone 17 Pro Max**

**Confirmed against two real driving sessions on 2026-08-25** (`device-pass-results.md` §1–§3a and
§5). I am attached to your phone and have already driven everything that can be driven without a body
in the room. Those are done and are **not** in this script.

For the **iPhone 13 Pro**, use `device-pass-kody-script-13pro.md` instead — that phone has never had
a build on it and needs a different opening.

**Setup:** phone unlocked, on USB, Auto-Lock Never. Have to hand: AirPods, a wired headset, a second
phone to call you from, and four objects — **a chair, a table lamp, a rug, a cabinet pull**.

**How this works:** I drive the taps and watch the screen. You aim the phone, talk, and say the
things below **out loud** — I grep your timing words out of the transcript afterwards, so a mumbled
"two ten" fails the assertion for the wrong reason. If something goes differently than written, say
so; a surprise is data, not a mistake.

Blocks are independent — stop between any two. Total **~65 minutes**, of which block E is 22 minutes
of standing still.

---

## Read this first — the voice recorder is working

Your flag did it. `field-companion-voice` reached the phone on the first relaunch
(`$feature_flag_called … response = true`), the N4 sheet now opens on **HOLD TO TALK** with a live
mic, and I have taken the whole path end to end: recorded 11 seconds, watched it transcribe
**on device**, attached, saved, routed to Inbox, and confirmed the audio landed in the bucket —
the **first `.m4a` we have ever had** (`voice-ba88acc2-…-000.m4a`, 101,777 bytes).

I also pulled it back down and ran `afinfo` on it: **AAC, mono, 48 000 Hz, 31,778 bps, 10.10 s**
against the store's 10.91 s. So format, sample rate, bitrate and duration are all settled without you.

**That retires block B entirely, and with it the whole file-assertion family** (spec steps 1, 2, 16b,
36, 41). `on_device` is also confirmed live on `voice.finish` — the parked "dead property" question
is closed.

Two things I got wrong in earlier versions of this file, now corrected:

- **The app's media folder was never missing.** `CaptureMedia` sits at the App Group *root*, and the
  tool I was listing with only ever shows `Library`, `Documents` and `tmp`. It has been there all
  along — three sessions of "the directory doesn't exist" were a tooling blind spot, not a defect.
- **The ">20 KB means it wrote audio" check doesn't work.** That file carries a 61,440-byte header
  before the first byte of audio, so an empty recording would sail past 20 KB. I'll use `afinfo`'s
  audio-bytes on the synced copy instead.

**What is left is genuinely only what needs your voice, your hands, or a room.** Roughly **50 minutes**,
down from 65 — and the two longest blocks are the ones that actually earn their time.

**You are signed in and set up.** Phone online, Airplane Mode off, WDA attached, nothing owed by you.

---

## Block C — four real objects (8 min) · needs your hands

Only a real camera settles this. I have now shown the reader returns **two different categories off
two different real frames** — your floor came back `Table` and a fabric bag came back `textile`, both
badged GUESS, neither inventing a material. So the "everything comes back the same category" failure
mode is largely de-risked; what is left is your four objects giving four distinct reads.

6. Aim at the **chair**, filling the frame, good light. I fire the shutter.
7. Watch the card; say the **category it lands on**, and whether it arrived **a beat after** the card
   rather than with it.
8. Same for the **table lamp**. 9. The **rug**. 10. The **cabinet pull**.
    ⚠ If all four come back the **same** category, say so. If a card claims a material — "Oak",
    "bouclé" — that was **not written on a label in the shot**, say so; that is the invented-material
    failure.
11. Aim at a **wall defect** — damaged baseboard, drywall seam, a bad scuff. Say whether a category
    appears **at all**. Expected: **nothing recorded.** I then check S3 recommends **Inbox**.
    *(I have already confirmed S3 renders and badges "Inbox — finish later" as RECOMMENDED for a
    capture carrying an unconfirmed guess. The half that needs you is the no-category-at-all case.)*

---

## Block D — the rotation check (5 min) · needs your voice

Segments rotate every 50 seconds. **Every take I recorded came back `segments=1`** — all were under
50 seconds, so rotation itself is still completely unproven. This block and block E are the only
things that test it, which is what makes them worth your 27 minutes.

12. I start a note **by tap** (not hold). Talk continuously for **three minutes** — read aloud, do not
    go quiet.
13. Say clearly **"twenty"** at 0:20, **"one ten"** at 1:10, **"two ten"** at 2:10.
14. Glance at the transcript pane at **1:30**, **2:00**, **2:30**. Each time say whether it is **still
    growing** or **frozen**.
15. At 3:00 I stop it. Say whether **the sheet ended on its own** at any point before that.
    *(Pre-fix signature: three minutes of audio under a transcript that stops at ~0:50.)*

---

## Block E — the twenty-minute note (22 min) · needs your voice

The only run that prices rotation at scale — 23 rotations, not one. Set the phone down and read aloud.
**Do not lock it and do not touch Stop.**

16. I start the note.
17. Say **"minute one"** at 0:30, **"minute ten"** at 10:30, **"minute twenty"** at 19:30.
18. Keep words coming every minute — read a book.
19. At about **20:00** it should stop **by itself**. When it does, tell me: the **time it stopped**,
    whether the **orange mic dot went out right then** (not later), and read the cap line **word for
    word**.
20. If it stops around **50 seconds** instead, say so immediately — pre-fix signature, ends the block.

---

## Block F — interruptions only a real phone can make (15 min) · needs a second phone

You need the second phone. Three distinct cases; please do not merge them.

21. **A call mid-note.** Note starts, talk 20 s, second phone calls, **answer**, say a sentence, hang
    up. Back in the app **keep talking 90 s**, saying **"after the call"** as you resume. At the end
    say whether the transcript is **still updating**.
22. **The crash sequence** — this exact order: note starts, talk 10 s → second phone calls, **answer**
    → **while still on the call**, return to the app and **stop the note** → end the call → **second
    note**, talk 15 s saying **"second note"**. Say whether the app crashed at any point.
23. **Decline a call.** Note starts, talk 10 s, second phone calls, **decline**. Keep talking 15 s,
    stop. Say whether the **orange mic dot** is out afterwards.
    *(Expect this one to misbehave — nothing marks it today. Report what you see.)*
24. **AirPods.** Note starts with AirPods **out**; talk 20 s. **Put them in** mid-note — say
    **"airpods in"** — talk 20 s. **Take them out** — say **"airpods out"** — talk 20 s. Stop, then
    tell me roughly **how long the whole note ran**.
25. **Wired headset.** Note starts on the built-in mic, talk 20 s, **plug in the wired headset** saying
    **"wired in"**, keep talking past **90 seconds total**. Stop.

---

## Block G — recognition switched off (8 min) · needs your voice

26. Settings → Privacy & Security → **Speech Recognition** → **deny** for Patina Field. Leave
    **Microphone allowed**. Tell me when done — I do the cold open and check which editor appears.
27. **The 20-second version.** Hold the mic, speak 20 s. While recording, say whether the **orange mic
    dot lit** and whether the **elapsed counter is running**. Release, tap Play, say whether audible.
28. **The 70-second version — this is the one that matters.** Hold the mic and keep speaking **at least
    70 seconds**, past the 50-second rotation boundary. Say **"fifty gone"** at about 0:55. Watch one
    thing and say it out loud: **does the note end on its own at ~50 seconds?** It must not — the
    counter keeps running, the dot stays lit, and the sheet must not fall to the typed editor until
    you lift your finger. Release past 70 s.
    *(Step 27 speaks for only 20 s and cannot catch this. Step 28 proves the rung holds.)*
29. Turn **Speech Recognition back ON** when I say.

---

## Block H — a real room (10 min) · needs a room

30. **LiDAR room walk.** I start a site scan; walk a real room properly — corners, walls, floor, the
    way you actually would. Say when you start and when you finish.

---

## Block I — offline, last on purpose (5 min)

⚠ **Airplane Mode is a one-way door for automation.** WDA stops listening entirely — not just on
WiFi, but on a USB tunnel to the phone's own loopback too — and it cannot be restarted offline
(iOS will not validate a development certificate without a network). **So this runs last, and you
toggle the radios by hand, not me.** This is also why step 31 of the spec (offline capture → restore
signal → queue drains) is still unresolved after two sessions.

31. Tell me when you are ready. I stage the taps.
32. **You swipe Airplane Mode ON.**
33. Take one photo capture and route it. Say what the offline banner reads — I am checking it shows
    the **outbox depth**, not the session count. *(I have already confirmed it reads "No signal ·
    saving on device" with an outbox chip; what is unproven is the drain afterwards.)*
34. **You swipe Airplane Mode OFF.** Say when. Then leave the app in the foreground and do not touch
    it — the queue should drain **with no tap from either of us**.
35. I re-attach automation and confirm the capture reached the server.

⚠ **I tried the cheap substitute and it does not work.** Pointing the app at an unreachable server
(`-CaptureSupabaseURL`) drops it to the signed-out screen — the session cannot validate, so there is
no capture flow behind it at all. That suggestion is retired. **This block genuinely needs your thumb
on the Airplane Mode switch**, which is why step 31 is still unresolved after three sessions.

---

## Already settled — not in this script

Driven and recorded across §2, §3a and §5; re-run only if you want to see them yourself:
**the entire voice write path** — record → transcribe on device → attach → save → route → upload,
with format confirmed by `afinfo` on the synced copy (AAC / mono / 48 kHz / 32 kbps / duration within
0.81 s) and `voice.start`/`voice.finish` telemetry carrying `transcribing`, `reason`, `segments` and
`on_device` ·
the whole install-over/store proof (store opens clean, nothing reset, your capture survived, the
write-ahead log provably growing) · a full capture → route → **sync to the server** on the fixed
build (`bb79c432…`, `category=textile`) · S3 recommending Inbox and S4's "Parked in your inbox" copy ·
the C1 mode row and its four-pill swipe cycle (no VOICE, no fifth state) · the placement walk
(shutter → card → project → room → Done, 7 taps) · card label updating with no refresh · placement
inheritance to the next capture · the S1 entry points (tray and harness correctly hide "Done") ·
tray footer states ("Place 2", "Review this session") · the offline banner's outbox depth ·
S3 recommending Inbox · the F1 reference-capture cover and its `screen.F1.context` PostHog hop ·
server-side `project_id` + `project_room_id` on the inbox path · **and the whole store/install-over
proof from §5.**

## Not run at any level, and why

- **Spec step 15** (ASan/Zombies rotation soak) and **step 11** (hot-mic probe) need an instrumented
  build and a forced failure injection. Reported **not run**.
- **The disk-fill probe** (under ~200 MB free) is a hardening probe, not a release gate, and slow to
  undo. Skip unless you want it.
- **The organic no-LiDAR trigger** for F1's context cover needs a genuinely LiDAR-less device; the
  eyebrow copy is static, so this phone cannot prove it.
- **Segment rotation** — every take so far was under 50 seconds (`segments=1`), so the 50-second
  boundary has never been crossed on hardware. Blocks D and E are the only tests of it.
- **Whether discarding a note deletes its file** — I cannot check. The media folder sits at the App
  Group root, which `devicectl` can neither list nor copy from, so there is no way to look for
  orphans from outside the app. This needs an in-app assertion, not a device probe.
- **The offline drain (spec step 31)** — needs block I, i.e. your thumb. Unresolved for three sessions.
- **W2-4, the sync Live Activity** — needs a sustained sync with work queued; not driven.

## What I check afterwards

- **PostHog** — `voice.start` (+`transcribing`), `voice.finish` (`reason`, `segments`, `on_device`),
  `voice.segment_rotated`, `voice.interrupted`, `voice.audio_write_failed` (`reason`/`buffers`),
  `voice.empty_transcript`, `capture.place_tapped`, `sync.reconnect_drain`, plus
  `store.reset_incompatible` / `store.in_memory_fallback` (both correctly silent so far).
- **The App Group media listing** — which `voice-<uuid>-NNN.m4a` exist, their **sizes** (the >20 KB
  floor separating "wrote" from "opened"), and that discarded notes left nothing behind.
- **The SwiftData store**, pulled off the phone — specimen voice fields. *(This channel is healthy
  again: §5 pulled it twice and it returns current data, not July's.)*
- **Supabase** — new `field_captures` rows against a baseline of **11**, and new `capture-media`
  objects against **9**, of which **none is audio**.

One limit I hold to honestly: the `.m4a` files **cannot be pulled off the phone** — they sit at the
App Group root, outside the three directories Apple lets `devicectl` copy from. Format and duration
(`afinfo`) get measured on the **synced copy from Supabase** and labelled that way, never as "afinfo
on the local segment". Existence and size come from the on-device listing.
