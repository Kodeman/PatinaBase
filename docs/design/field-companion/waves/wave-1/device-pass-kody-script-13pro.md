# Kody script — Field Companion device pass, **iPhone 13 Pro**

Supersedes `device-pass-kody-script.md` **for this phone only**. That script is confirmed against a
real driving session on **Kody's Phone (17 Pro Max, iOS 27)**; keep it for that device.

**Honest framing, because it changes what this script is.** On the 17 Pro Max I drove everything
driveable and struck it out of the script. **On the 13 Pro I drove nothing** — the phone never came
up on USB (`device-pass-results.md` §4.0), so no assertion here has been pre-cleared on *this*
hardware. Two things follow: block A below is new and mandatory, and blocks B–H are shorter than the
17 Pro Max script only where the finding is **device-independent** (a code path either exists or it
does not), never where the hardware could differ.

**Auto-Lock must be Never and the phone must stay unlocked and plugged in for the whole session.**

---

## Block A — get the phone on the wire (2 min, you alone)

Nothing else in this file can start until this passes. This is the entire reason the last attempt
produced no result.

1. Plug the 13 Pro into the Mac with a **data** cable. A charge-only cable presents nothing to macOS
   and looks identical — if in doubt, use the one that came with the phone.
2. **Unlock** the phone. Accept **Trust This Computer** if it appears. Leave it unlocked.
3. Confirm **Settings → Privacy & Security → Developer → AUTOMATION → Enable UI Automation** is ON.
4. Confirm **Settings → Display & Brightness → Auto-Lock → Never**.
5. Tell me, and I run one command. It has to print the phone under `== Devices ==`:
   `xcrun xctrace list devices | head -5`
   If it still says `== Devices Offline ==`, it is the cable or the lock screen — not the app, not
   Xcode, not Developer Mode.

**Nothing else is owed by you before we start.** Both builds are already compiled and signed, and
your 13 Pro is already in the provisioning profile, so there is no build wait and no
"registering device" pause.

---

## Block B — the migration proof (10 min, mostly me)

I install the **pre-fix** build, you take one photo, I install the **fixed** build over it, and we
check the capture survived.

⚠ **Read this before you weigh the result.** I compared the two builds' schemas: the fix adds
*default values* to columns that already existed — **no new column, no new table.** So a store the
pre-fix build writes today already has every column the fixed build wants, and the upgrade is a
migration with nothing to migrate. **This block proves "installing over the old app keeps your
data". It does not prove the July-29 store now opens** — that store had a genuinely missing column,
and only a Simulator test covers it today. I will record it at that strength and not dress it up.

1. I install the pre-fix build and launch it. Sign in if it asks.
2. **Take one photo capture** — anything in front of you, it does not need to be a real specimen —
   and route it to **Inbox**. Say when the card appears.
3. I confirm the row reached the server, then force a relaunch and check the capture is still there.
4. I install the **fixed** build over the top and launch it. I check three things: the store opens on
   rung 1, your capture is still there, and the sync screen shows **no** "nothing is being saved"
   warning.
5. **Take a second photo capture.** I relaunch once more and confirm both are still there.

You do not need to avoid force-quitting this time. The persistence bug from the last pass
(`device-pass-results.md` §3) is fixed in this build — that is what we are testing.

---

## Block C — the voice note, and the thing it unblocks (12 min)

This is the highest-value block in the file. `<AppGroup>/CaptureMedia` has **never been observed to
exist on any device**, and five assertions (spec steps 1, 2, 16b, 36, 41) all read files out of it.
No voice note has ever been recorded on hardware, so we do not know whether that directory is created
at all. **Step 1 below settles it.** The bucket has **zero** `.m4a` objects today, so the first one
to appear is unambiguously ours.

1. **The 10-second note.** In a capture, **Add detail → Voice**. Hold the mic for about **10 seconds**.
   You do **not** have to speak — room tone is fine for this one; I am testing the file, not the
   transcript. **Attach**, then **Save**.
   *(I then check the media directory appeared, that a `voice-<uuid>-000.m4a` is in it and is over
   20 KB, and — after sync — that the matching object landed in `capture-media`.)*
2. **The 15-second note, spoken.** Read a paragraph aloud, close to the phone, normal voice. Release,
   tap **Play**, and say whether you hear yourself and whether it is **intelligible**.
   *(Only your ear settles this: if the write path throws, the recorder discards the audio and still
   reports success.)*
3. **The stab.** Start a note and release **instantly** — under a fifth of a second. Say "instant done".
4. **The one after it.** A normal 10-second note immediately after, saying **"index check"** in it.
   *(Proves the discarded stab's index gets reused rather than leaving a hole.)*
5. **Bitrate sanity.** Stand **2 metres** back with something noisy running — fan, HVAC, hood — and
   talk 15 seconds at normal volume. Play it back; say whether it would do as a real field note.
   *(32 kbps at 48 kHz is aggressive. This is the last cheap moment to change it.)*

---

## Block D — long enough to rotate (5 min)

Segments rotate every 50 seconds; this checks the note does not die at the first boundary.

6. I start a note **by tap** (not hold). Talk continuously for **three minutes** — read aloud, do not
   go quiet.
7. Say clearly **"twenty"** at 0:20, **"one ten"** at 1:10, **"two ten"** at 2:10.
   *(Say them crisply — I grep these out of the transcript, and a mumbled "two ten" fails the
   assertion for the wrong reason.)*
8. Glance at the transcript pane at **1:30**, **2:00**, **2:30**. Each time say whether it is **still
   growing** or **frozen**.
9. At 3:00 I stop it. Say whether **the sheet ended on its own** at any point before that.
   *(Pre-fix signature: three minutes of audio under a transcript that stops at ~0:50.)*

---

## Block E — the twenty-minute note (22 min)

The only run that prices rotation at scale — 23 rotations, not one. Set the phone down and read aloud.
**Do not lock it, do not force-quit, do not touch Stop.**

10. I start the note.
11. Say **"minute one"** at 0:30, **"minute ten"** at 10:30, **"minute twenty"** at 19:30.
12. Keep words coming every minute — read a book.
13. At about **20:00** it should stop **by itself**. When it does, tell me: the **time it stopped**,
    whether the **orange mic dot went out right then** (not later), and read the cap line **word for
    word**.
14. If it stops around **50 seconds** instead, say so immediately — that is the pre-fix signature and
    it ends the block.

---

## Block F — interruptions only a real phone can make (15 min)

You need a second phone. Three distinct cases; please do not merge them.

15. **A call mid-note.** Note starts, talk 20 s, second phone calls, **answer**, say a sentence, hang
    up. Back in the app **keep talking 90 s**, saying **"after the call"** as you resume. At the end
    say whether the transcript is **still updating**.
16. **The crash sequence** — this exact order: note starts, talk 10 s → second phone calls, **answer**
    → **while still on the call**, return to the app and **stop the note** → end the call → **second
    note**, talk 15 s saying **"second note"**. Say whether the app crashed at any point.
17. **Decline a call.** Note starts, talk 10 s, second phone calls, **decline**. Keep talking 15 s,
    stop. Say whether the **orange mic dot** is out afterwards.
    *(Expect this one to misbehave — nothing marks it today. Report what you see.)*
18. **AirPods.** Note starts with AirPods **out**; talk 20 s. **Put them in** mid-note — say
    **"airpods in"** — talk 20 s. **Take them out** — say **"airpods out"** — talk 20 s. Stop, then
    tell me roughly **how long the whole note ran**.
19. **Wired headset.** Note starts on the built-in mic, talk 20 s, **plug in the wired headset** saying
    **"wired in"**, keep talking past **90 seconds total**. Stop.

---

## Block G — recognition switched off (8 min)

20. Settings → Privacy & Security → **Speech Recognition** → **deny** for Patina Field. Leave
    **Microphone allowed**. Tell me when it is done — I do the cold open and check which editor appears.
21. **The 20-second version.** Hold the mic, speak 20 s. While recording, say whether the **orange mic
    dot lit** and whether the **elapsed counter is running**. Release, tap Play, say whether it is audible.
22. **The 70-second version — this is the one that matters.** Hold the mic and keep speaking **at least
    70 seconds**, past the 50-second rotation boundary. Say **"fifty gone"** at about 0:55. Watch one
    thing and say it out loud: **does the note end on its own at ~50 seconds?** It must not — the
    counter keeps running, the dot stays lit, and the sheet must not fall to the typed editor until
    you lift your finger. Release past 70 s.
    *(Step 21 speaks for only 20 s and cannot catch this. Step 22 is the one that proves the rung holds.)*
23. Turn **Speech Recognition back ON** when I say.

---

## Block H — four real objects and a room (18 min)

Kept in full. On the 17 Pro Max I proved the reader **reads a real frame** (pointed at a floor it
returned `Table`, badged GUESS, inventing no material) — but that was a different camera and a
different iOS, so it does not carry over to this phone.

24. Aim at a **chair**, filling the frame, good light. I fire the shutter. Say the category it lands
    on, and whether it arrived **a beat after** the card rather than with it.
25. Same for a **table lamp**. 26. Same for a **rug**. 27. Same for a **cabinet pull**.
    ⚠ If all four come back the **same** category, say so. If a card claims a material — "Oak",
    "bouclé" — that was **not written on a label in the shot**, say so; that is the invented-material
    failure.
28. Aim at a **wall defect** — damaged baseboard, drywall seam, a bad scuff. Say whether a category
    appears **at all**. Expected: **nothing recorded.** I then check S3 recommends **Inbox**.
29. **LiDAR room walk.** I start a site scan; walk a real room properly — corners, walls, floor. Say
    when you start and when you finish.

---

## Block I — offline, last on purpose (5 min)

⚠ **Airplane Mode is a one-way door for automation.** WDA stops listening entirely — not just on
WiFi, but on a USB tunnel to the phone's own loopback too — and it cannot be restarted offline
(iOS will not validate a development certificate without a network). **So this block runs last, and
you toggle the radios by hand, not me.**

30. Tell me when you are ready. I stage the taps.
31. **You swipe Airplane Mode ON.**
32. Take one photo capture and route it. Say what the offline banner reads — I am checking it shows
    the **outbox depth**, not the session count.
33. **You swipe Airplane Mode OFF.** Say when. Then leave the app in the foreground and do not touch
    it — the queue should drain **with no tap from either of us**.
34. I re-attach automation and confirm the capture reached the server.

*(If you would rather not, say so: I can approximate 32–33 with a build pointed at an unroutable
server, which exercises outbox durability and drain-on-relaunch — but not the offline banner, so
steps 30/31 of the spec stay unsettled. It is a real substitute for some of it, not all of it.)*

---

## Not in this script, and why

- **Spec step 15 (ASan/Zombies rotation soak)** and **step 11 (hot-mic probe)** need an instrumented
  build and a forced failure injection. They will be reported **not run**.
- **The disk-fill probe** (under ~200 MB free) is a hardening probe, not a release gate, and is slow
  to undo. Skip unless you want it.

## What I check afterwards

- **PostHog** — `voice.start` (+`transcribing`), `voice.finish` (`reason`, `segments`, `on_device`),
  `voice.segment_rotated`, `voice.interrupted`, `voice.audio_write_failed` (`reason`/`buffers`),
  `voice.empty_transcript`, `capture.place_tapped`, `sync.reconnect_drain`, and the two new
  store-health events `store.reset_incompatible` / `store.in_memory_fallback`.
- **The App Group media listing** — which `voice-<uuid>-NNN.m4a` exist, their **sizes** (the >20 KB
  floor separating "wrote" from "opened"), and that discarded notes left nothing behind.
- **The SwiftData store**, pulled off the device — specimen voice fields.
- **Supabase** — new `field_captures` rows against a baseline of **11** (newest
  `2026-08-25 17:54:02Z`), and new `capture-media` objects against **9**, of which **none is audio**.

Two limits I hold to honestly:

- The `.m4a` files **cannot be pulled off the phone** — they sit at the App Group root, outside the
  three directories Apple lets `devicectl` copy from. Format and duration (`afinfo`) get measured on
  the **synced copy from Supabase** and labelled that way, never as "afinfo on the local segment".
  Existence and size come from the on-device listing.
- Block B proves data survives an install-over. It does **not** prove the July-29 store migrates —
  see the warning in block B.
