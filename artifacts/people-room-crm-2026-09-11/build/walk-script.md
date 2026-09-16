# Prod walk script — People Room CRM

For Kody, once this branch is deployed. Ten checks on `app.patina.cloud` signed in as Leah, then the Patina Field TestFlight (build 5) checks, then what to tell Leah's studio.

**Read `build/w6-qa.md` Finding F2 before doing check 6 below** — automated and live-browser QA both found the Hours button missing from the team-member card. Expect it to still be missing until that fix ships; don't treat it as a surprise.

## Ten checks, signed in as Leah on app.patina.cloud

1. **Open the People Room.** Go to the People tab from the Desk. You should see a head count like "**NN people · N firms**" at the top, and rows for both individual people and companies mixed together.

2. **Open Priya Natarajan's card.** Search or scroll to Priya. Her card should open with her name, role, and contact info at the top.

3. **Look for an "Hours" button on Priya's card.** *Expected per the ruling: present, once, at the top of the card, since Priya is a studio team member.* **Known issue (F2): it will likely be missing.** If you see it, that means the fix shipped — click it and confirm it opens Priya's hours sheet, then tell us.

4. **Open a client's card (e.g. Adaeze Okonkwo on the Okonkwo project).** Confirm there is **no** Hours button on a client's card, even though she has a portal login. This part should already work correctly.

5. **Open the Okonkwo project's Call Sheet.** From the project, open the call sheet/roster view. You should see people grouped by role (GC, subs, etc.) with a "**Key held by…**" line near the top for site access — not a live gate code, just who holds the key.

6. **Check the first phone number on the Call Sheet.** Tap the first name's phone number. **Known issue: QA found the wrong person listed first** (a client's number where a specific team member's should lead). If the order looks right to you, that's good news — tell us.

7. **Add a new person.** From the People Room, add a person as a text-only contact (no portal login) — this should take two or three taps, no email required.

8. **Give a client a portal login and record a dollar authority.** Open a client's card, grant them portal access, then record a specific person's spending authority (a dollar amount they can approve up to). Confirm both show up back on the card.

9. **Mark someone "do not contact" and route their correspondence to someone else.** Open a person's card, find the do-not-contact toggle, and set a different contact as the routing target. Confirm the card reflects both.

10. **Open the Directory on your phone (narrow screen).** Everything should stack cleanly — no sideways scrolling, no cut-off text, no overlapping buttons.

## Patina Field — TestFlight build 5

- Open Patina Field, sign in with your studio account.
- Go to a project's Call Sheet / roster from the Field app. Confirm the same "Key held by…" site-access line appears (never a live code).
- Confirm you can see the People list for a project and open one person's card without a crash or blank screen.
- Airplane-mode check: put the phone in airplane mode, open a project you already loaded, confirm the People/roster screen still shows the last-loaded data instead of a spinner forever.

## What to tell Leah's studio

- The People Room now shows everyone in one place — designers, subs, GCs, and clients — instead of separate lists. Searching and adding people should feel faster.
- **Hold off telling them the Hours button is on the person card yet** — QA found it's not actually showing up for team members right now (see check 3 above); we'll confirm once it's fixed.
- The Call Sheet's "who holds the key" line is new — worth pointing out on the next project walkthrough, but flag that QA also found the names may be in the wrong order at the top (check 6) until we confirm the fix.
- Everything else — adding people, granting portal access, recording spending authority, marking someone do-not-contact — tested clean in QA; safe to walk them through normally.
