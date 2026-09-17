# Decisions taken — designer-portal onboarding & learning experience

Interview with Kody, 2026-09-03, against `synthesis/proposal.md` §12. These rulings feed the execution plan; items marked DECISIONS.md need an entry in `docs/design/the-document/DECISIONS.md` when the work lands.

| # | Decision | Ruling | Notes |
|---|---|---|---|
| 1 | May the tour's last step act? | **Yes.** Step 6 "Begin with a lead" opens `CaptureLeadSheet` over the Desk before the tour closes. | Stays outside `/doc/[id]`; the R4 timer starts only on a submitted lead. DECISIONS.md. |
| 2 | Third tour state, "later"? | **Yes.** Add "Show me later" to the WelcomeModal; writes `{atStep: 0}` without `abandoned`, so the walkthrough-offer margin note can re-offer once. | Narrow amendment to `desk-walkthrough-gate.ts` §4.7. DECISIONS.md. |
| 3 | Practice / sample project? | **No.** Teach on the real first document via the `doc-first-touch` margin note. | |
| 4 | Retire `FirstSigninTour`? | **Delete it.** Remove `components/help/first-signin-tour.tsx`, its dead `help-system.welcome-shown.*` localStorage key, and correct PRD 09. | |
| 5 | Margin notes re-arm on a re-cut? | **Yes, version-suffixed keys** (`doc-first-touch@2`), once per version, never on a calendar. | Narrow amendment to R94. DECISIONS.md. |
| 6 | PostHog flag vs R125? | **No flags, except one for the teammate persona** (cross-portal shared type). | Flag name to be minted in the execution plan; retired after the pilot studio confirms. |
| 7 | Who writes the Sanity docs? | **Agents draft to Leah's voice; Kody approves in batches.** Leah reviews only the featured five. Retire the ~120 placeholders not in Waves 1–5. | |
| 8 | Where does the shortcut reference live? | **`?` overlay from the start**, rendering the same content as the Help Center article "The keys" (one source, two doorways). | Kody chose against the synthesis recommendation. Must pass a collision check against Board Room bare keys (`p`, `1`) and the `registry-shortcuts.tsx` input/dialog guards before ship. First bare single-key global outside the `g`-chord family. DECISIONS.md. |
| 9 | Distinct arrival for the first hire? | **Yes, full teammate persona.** Widen `Persona` (`packages/help-system/src/contentTypes.ts`) and the Sanity `helpContent.persona` list; persona-correct WelcomeModal + coachmarks; accept-invite screen names the studio; owner's optional handoff note on the invite. | Behind the one flag from #6. |
| 10 | Client portal in scope? | **Out of scope, by choice.** Designer portal only. Homeowner onboarding is a separate side journey (log in VISION-DECISIONS if raised). | |
| 11 | CS calls doctrine? | **Yes, both calls, run by Kody:** a setting-up conversation in the owner's first two days; a handoff conversation with owner and hire the day she accepts. Stuck signals route to Kody. | DECISIONS.md (interpretation of VISION §2 made explicit). |
| 12 | R96 vs the four-tab Orders sheet | **Amend R96: ledgers may page, documents may not.** Orders stays as shipped; the glossary describes it truthfully. | DECISIONS.md. |
| 13 | Is the drip sending in prod? | **Verified 2026-09-03: SENDING.** Both `automated_sequences` rows ('Designer Onboarding', 'Founding Invite') are `active` on Strata; the `automation-processor` cron (`*/5 * * * *`) has run cleanly for 30 days; all 13 templates show `delivered` sends in `notification_log` in the last 60 days; the two newest designer accounts got W0 within minutes of enrolment. | Full evidence in `synthesis/drip-verification.md`. Open: the sequences were flipped to `active` out-of-band (every migration leaves them `draft`) — record who/when. Retiming (E2–E9 state-triggered) is real work, not a switch-on. |
| 14 | Video | **Two or three, after Wave 1**, hosted on **Cloudflare Stream.** Add the `videoContent` Sanity schema once hosting is provisioned. Candidates: an engagement moving Brief → Proposal; the Capture gesture. | No interface-tour video; coachmarks do that. |

## Consequences for the execution plan

- Wave 1 candidates (unflagged): R-a panel owners for Desk and Document; checklist derives "Invite your crew" on acceptance + new "first hire opened a document" row; delete `FirstSigninTour`; "Show me later"; tour step 6 opens `CaptureLeadSheet`; margin-note state → `profiles.help_state`; `doc-first-touch` note; Library capture-shelf copy; Featured-section fallback; "The keys" article + `?` overlay sharing one content source; ⌘K rows "The words" and "The keys"; glossary (8 entries) under Ideas & vocabulary; Wave-1 20 Sanity articles drafted for batch approval.
- Flagged: teammate persona (#9) + handoff note.
- New events: `zone_flight` (build), `help.glossary.opened`, `help.shortcuts.opened`, `document_first_authored`; confirm `help.empty_state.shown` fires.
- Rulings to write into DECISIONS.md: #1, #2, #5, #8, #11, #12.
- Owed outside code: Cloudflare Stream provisioning; drip verification result; Kody's two CS calls become part of the pilot runbook.
