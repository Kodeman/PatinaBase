# L4 — Device check: the Library Room on Leah's phone

**Milestone:** R39 review gate. The Rooms **physics** are new (a full-screen paper place you *walk into*, not a sheet you pull) — so, like the D13 mobile walk (I19/I20), they get validated on a real phone before the next Room (the Engine, slice 3) builds on them. **Green = the shell is trustworthy for every future Room.**

**Build under test:** branch `the-document/track3-rooms-library` (commits `81359ca8..a0a57e6b`). Additive only — no migrations; the `the-document-pilot` flag is default-on for the studio; rollback = the same toggle in reverse, and the branch reverts cleanly (the `/library` route is purely additive).

**Device:** Leah's iPhone (LiDAR, iOS 26.5 per the scanning work). Sign in as Leah; the flag resolves on for the studio. Reach it deployed (pilot) or via a local tunnel to :3000.

---

## The walk (touch only — narrate aloud, like the D13 session)

1. **The doorway reads.** From `/desk`, open the bottom bar → "The drawer · five books". Confirm **the Library carries the doorway mark (a Strata spine-tick + "↗", "a room · walk in")** while Orders/Accounts/People/Hours show a single spine bar ("a sheet you pull"). The hand should learn which pull opens which physics *before* tapping. Tap **Library**.
2. **You walked in.** Confirm: the Library is **full-bleed paper**; the **Drawer bar persists** at the thumb edge (D8); **no shadow, no zone, no badge** (D4); the head reads `← …`, `THE LIBRARY · N pieces`, `⊕ Capture`. The librarian title + ask box + the three shelves render on **real data** (My / Studio / Patina), each separated by a Strata rule.
3. **Entering put the document down.** If a project document was open first, confirm walking in **chained the timer out** — the log-offer strip appeared (write-first; adjust or discard). (A Room *is* the thing in hand; it does not run its own timer.)
4. **Capture by thumb.** Tap **⊕ Capture** → a **paper** sheet rises over the Room (the Room stays mounted beneath, D1). Paste a URL or name a piece → **Capture to My Library**. Confirm it **lands raw in My Library** and the head count ticks up.
5. **Teach in place.** On a *Needs teaching* card, tap **Teach →** → inline **Quick Tags** expand on the card (real style archetypes) → pick a character → **Save teaching**. Then tap **Deep analysis →** → a **paper sheet** opens over the Room (style + spectrum + client matching) → **Save full analysis**. Both must be comfortable one-handed.
6. **Leaving returns you.** Tap **← (leave)** → the brief "Putting the Library down…" veil → you land **back where you were** (the prior document or the Desk), and a put-down document picks its timer back up.
7. **Reduced motion.** If Leah runs *Reduce Motion*, repeat 1–6: enter/leave fall to plain fades, the put-down veil is skipped — no jank, nothing lost.

---

## Acceptance — green if all hold

- [ ] The doorway is legible as **walk-in vs pull** before tapping (spine-tick + ↗).
- [ ] The Room is **paper, full-bleed**; the Drawer **persists**; **zero** shadow/zone/badge/dashboard.
- [ ] Entering a Room from a held document **puts it down** (timer chains out, strip offered); leaving **returns to origin**.
- [ ] **Capture** lands raw in My Library by thumb; **promote/nominate** move pieces; **Quick Tags + Deep Analysis** work in place; the foot stat line is **real and not gamified**.
- [ ] Sheets (capture, deep analysis) sit **over** the Room without unmounting it; back-gesture / scrim / Esc close the sheet first, then the Room.
- [ ] Reduced-motion safe.

## Known-and-intended at this gate (don't fail the walk on these)

- **The librarian ask is inert** — the Engine is **slice 3**; the input stands as part of the Room's identity but tapping → asks nothing yet (honest in-product note). Wake it next.
- **Promote / Nominate reuse the existing portal-grammar modals** — correct movement, doc-grammar re-skin pending (flagged, I29 #4).
- **No "studio time" in the Room** — only the held document is put down; the Library doesn't log its own time (I29 #1, awaiting a ruling).
- **The ~390px frame wasn't captured in desktop automation** (the Chrome tool renders at a fixed ~1886px viewport) — **this device walk *is* the mobile validation.**

## If a physic feels wrong

It's a **design** signal, not a bug to silently patch — note it verbatim (what she did, what felt off) and route it back to the session (append to `DECISIONS.md` as a Track-3 note). The shell is meant to be validated once and reused; a wrong physic here is worth catching before the Engine inherits it.
