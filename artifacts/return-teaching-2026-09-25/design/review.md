# Adversarial review: return teaching (Margin Notes), UX options, mockups and architecture

SQ-262 · 25 Sep 2026 · read-only review of `design/ux-options.md` (UX), `design/system-architecture.md` (ARCH), `design/mockups/01–09`, and the three `research/` memos, all at worktree HEAD c6747f0b2. VISION.md and `patina-brand-voice/SKILL.md` were read directly. Every code claim below was checked in the tree. Intended path: `artifacts/return-teaching-2026-09-25/design/review.md`. The sandbox denies writes, so the orchestrator copies it there.

Counts: **3 blocker · 21 major · 23 minor · 5 nit** (52 findings).

## §Findings

### Blockers

**1. `already_knew` silences the notes the design most wants to show.** Blocker · high · ARCH L151–152.
- What: line 151 writes the terminal outcome `already_knew` for any candidate whose `featureKey` the person has ever used. Line 152 keeps `faster_way` notes live for that one call only. On the next evaluation `isTerminal` drops them for good.
- Effect on release notes: a release to a feature she already uses is marked known and never shows. Sample 1 is an example: it is about invoices, and anyone who has sent an invoice has `used.ledger = true`. Framing §2 ranks this case first ("A change to something she already uses first").
- Effect on faster-way notes: every (c) note is, by definition, about a feature she already uses, so every one of them dies after one evaluation.
- The selector also writes state on every render.
- Fix: base `already_knew` on the note's `successEvent`-equivalent signal *after* the release's `shippedOn`, never on "has ever used the feature". Make the selector pure and write outcomes only on display or act.

**2. Phase 1 stores per-person read outcomes where studio members and clients can read them.** Blocker · high on the facts, medium on severity · ARCH L9 vs L77–79.
- What: F1 says Phase 1 "writes only coarse data". But the Phase 1 `seen` map holds `n`, `first`, `last` and `out: acted|dismissed` for each note. That is exactly "which hand read what, and when" (guardrail 8; framing ruling 4 recommends that owners see none of it).
- The readers are wider than co-members; see finding 4.
- Fix: keep teaching state out of `help_state`. Use a new own-row-only table, e.g. `teaching_note_state(user_id PK, state jsonb)` with RLS `user_id = auth.uid()` for both read and write. This fixes three things at once:
  - it closes F1 for this feature;
  - it drops the dependency on SQ-265, the iOS clobber (finding 7) and the patch-function flaws (findings 5, 6 and 8);
  - ruling R-2 stops blocking Phase 2. DM-1 stays a separate PII ruling.

**3. The recommended Option 3 and the `act` slot can never render under the at-rest rule.** Blocker · high · ARCH L121 and L138 vs UX L49, mockups 05/06.
- What: at-rest condition 3 requires no open `[role="dialog"]`, and `if (!x.atRest) return null` applies to every slot. But:
  - `DocSheet` renders `role="dialog"` (`overlays/doc-sheet.tsx:372`);
  - the send sheet is a DocSheet (`send-sheet.tsx:35`) and already watches `useIsMutating` (L359);
  - mockups 05 L93 and 06 L93 draw the note inside `role="dialog" aria-modal="true"` sheets.
- Result: the Accounts, Hours, Galley and send-act placements the recommendation rests on are unreachable.
- Fix: define "at rest" per surface (the dialog that hosts the anchor counts as the surface, not as an interruption). Or move in-place notes onto the page margin behind the sheet after it closes, and redraw mockups 05 and 06 to match.

### Majors

**4. F1 is true but understated.** Major · high · ARCH L9.
- `can_view_profile` (00555 L560–643) admits more than co-members. Its legs include:
  - invoice sides, i.e. the homeowner client;
  - engaged leads, direct orders and room-scan shares;
  - message-thread participants;
  - a studio teammate's engaged lead, plus the co-member and org-roster legs (L624–643).
- `profiles_select_counterparty` (L705–707) makes every column visible to anyone admitted (L217–227).
- 00555 L198–212 records that `projects`, `comms_thread_participants`, `project_team_members` and `room_scan_associations` rows can be self-inserted. So any signed-up designer can manufacture a relationship and read a target's `help_state`.
- Clients can already read a designer's `marginNotes`. The design should say so plainly.

**5. `help_state_patch` works per note-object, so one device's write erases another's dismissal.** Major · high · ARCH L78–79, L100.
- The leaf the design names is `{teachingNotes,seen,<key>}`, a whole object. Device A holds a stale cache and writes `{n:2,out:null}` after a close. That overwrites device B's `out:"dismissed"`, which breaks "dismiss = forever".
- `ignoredStreak` and `recentUnsolicited` are read-modify-write from per-tab caches, so updates are lost too.
- Fix: make a terminal `out` sticky on the server (a function that refuses to overwrite a terminal value). Patch `out` separately from the counters.

**6. `jsonb_set` does not create missing parents, for any backend.** Major · high · ARCH L100.
- With create_missing = true, `jsonb_set` creates only the last path key. Every earlier key must already exist, or the value comes back unchanged. The design handles this for `teachingNotes` only.
- `{marginNotes,<key>}`, `{featureAnnouncements,<key>}` and `{tours,<id>}` silently no-op for any user whose blob (`DEFAULT '{}'`, 00146 L42) lacks that parent. The new-user margin-note dismissal would be lost.
- The stated mitigation, "the first write patches the whole `{teachingNotes}` sub-tree", races: two tabs or devices that both hydrated without the key each write a whole sub-tree, and the later one erases the earlier one's `seen`.
- Fix: a SQL function that does `COALESCE(help_state->p_path[1], '{}')` at each level, or finding 2's table.

**7. The iOS adapter still overwrites the whole blob, so SQ-265 stays open.** Major · high on the code, medium on exposure · ARCH L100, L260.
- `apps/mobile/Patina/.../SupabaseHelpStateAdapter.swift` L43–58 declares a Codable blob with only `tours` and `featureAnnouncements`. L298–313 writes `.update({help_state: blob})`.
- Swift Codable drops unknown keys, so every iOS tour write erases `marginNotes`, `firstAuthoredAt` and `teachingNotes`.
- ARCH names iOS only for the R-2 table move, not as an SQ-265 writer.
- The e2e helper also writes whole blobs (nit 51).

**8. A SECURITY INVOKER patch breaks under R-2's own DM-1b option.** Major · high · ARCH L90, L260.
- `UPDATE … SET help_state = jsonb_set(help_state, …)` needs column-level SELECT on `help_state`.
- DM-1b (00555 L239–250) is `REVOKE SELECT ON profiles FROM authenticated` followed by a narrow re-grant. After that, the invoker function fails with permission denied.
- Fix: make it SECURITY DEFINER with an `auth.uid()` row pin, or use finding 2's table.

**9. The release cursor silently skips releases.** Major · high · ARCH L70, L268 vs UX L19.
- "Set `lastSeenReleaseId` to manifest head on first-ever load": at the Phase 1 launch every existing designer's first load moves the cursor past every manifest entry, including the example `2026-09-25-galley-po`. Phase 1 teaches nobody anything until a second release is appended.
- "First-ever" means `teachingNotes` is absent. Any full-blob writer (iOS, finding 7) removes it, so the next load resets the cursor to head (skipping unseen releases) and wipes `seen` (bringing back dismissed notes).
- UX instead says "the release cursor starts at account creation". The two docs disagree.

**10. An unknown cursor after a rollback, an old tab, or a mixed deploy.** Major · medium-high · ARCH L55.
- "Rollbacks stay truthful for free" covers only what the bundle announces. The cursor lives in the database.
- After build N+1 sets the cursor to R₊₁ (first load or `markRead`), a rollback to N, or an old SPA tab still on N, sees a cursor id missing from its manifest. `releaseSinceCursor` is then undefined: an `indexOf` of -1 replays every release, or throws.
- Fix: specify "cursor not in manifest → treat as head and write nothing". Add a test for it.

**11. The boundary subscriber counts mutations nobody made.** Major · high · ARCH L125.
- `(document)/doc/[id]/page.tsx:939–944` fires `useMarkFirstDocumentOpened.mutate` on mount for a hand's first document.
- The global `MutationCache.onSuccess` records `lastBoundaryAt` after mount, so an anchor note fires about 1.5 s after the hand first opens a document. In effect that is "on mount", in the first hour, which promotion 3 and framing §2 row 1 rule out.
- Any autosave or fire-and-forget mutation behaves the same way.
- Fix: count only mutations tagged `meta.teachingBoundary = true`, set on the named completion acts.

**12. The hold registry is wired to the wrong file.** Major · high · ARCH L122.
- `use-drafting-state.ts` (header L3–13) is a read-only progress hook with no dirty state. Dirty state lives in each facet editor.
- "This is the only per-surface wiring" understates the work. Until every editor opts in, a note can fire mid-draft: after an autosave, focus outside the editor, 1.5 s later.

**13. The Desk note shifts the layout under her pointer.** Major · medium-high · ARCH L123 and UX L63.
- The note waits for Sanity, the signals RPC, flags and a 1.5 s settle, then inserts about 80–120 px above the roster. UX requires "no space kept".
- She is already reaching for a job card, and the roster jumps: a mid-act interruption.
- Fix: resolve before first paint of the roster, or render the note below the roster head. Never insert above content after the settle.

**14. The measurement is click-through under another name.** Major · high · ARCH L246, L243 vs L254; VISION §6 "Engagement metrics as a success measure".
- The samples' success events are the note's own act: sample 1 "invoice folio opened" (UX L92), sample 2 print (L93), sample 3 "whole-paper sheet opened" (L94), sample 7 "members section opened" (L98).
- So "Task shortened" measures whether she clicked the note, which L254 refuses.
- `dwell_bucket` is time-on-note.
- Fix: the success event must be the downstream task outcome, e.g. an invoice sent with a delivery row read, or a PO drawn from a signed part. Never the note's act. Drop `dwell_bucket`.

**15. Studio one's owner is also staff, so she can see her hands' events.** Major · medium · ARCH L252.
- Leah reviews as "Patina staff" and owns customer one. PostHog person and event views are per identified person (`identifyUser`), and cell suppression covers insights only.
- Guardrail 8 is broken at the analytics layer.
- Fix: send teaching events without a person identity (`$process_person_profile: false`) or hashed per note. State who can open the person view.

**16. The quiet switch does not silence act notes.** Major · high · ARCH L132 vs framing guardrail 4 ("silences everything") and UX L110.
- The quiet branch returns `actOnly(x)` for the act slot.

**17. Phase 1 adds a fifth ungoverned line to the Desk.** Major · high · ARCH L158, L263 vs UX L82.
- Static notes join the arbiter only in Phase 2, while Phase 1 already mounts the release slot. The Desk would stack `desk-first-touch`, the walkthrough offer, `hire-handoff`, the setup whisper, and the new note (`desk/page.tsx:363–425`).
- UX says Step 1 "tames the four ungoverned lines".
- ARCH's arbiter list (L158) also leaves out `StudioSetupWhisper`.

**18. The hook contract cannot carry the copy the mockups draw.** Major · high · ARCH L203–211, L30.
- `TeachingNoteView` has no act label or act href, and `body` is static Sanity text.
- The mockups and samples interpolate live data:
  - "Sonnenberg hours" (01 L30), "See the Sonnenberg invoice" (02 L30);
  - "Print INV-0014" (05 L108);
  - "Tess's hours… Open Tess's seat" (07 L30);
  - "Halvorsen agreement… Ingrid's copy" (03 L106).
- Fix: either add `act {label, hrefTemplate}` plus named bindings resolved client-side, or make every note generic and redraw.

**19. Several UX triggers have no signal in the architecture.** Major · high.
- "Third slow repetition" (UX L47, L51; mockup 06 L15) and "the slow path she took last session" (UX L57; mockup 01 L15). ARCH L176: "No slow-path detectors exist".
- "Uses weekly" (UX L58). ARCH §4 has only has-used booleans.
- "Ranked against the jobs holding her pen" (UX L59; mockup 03 L15). ARCH L225 says "the project she opens", and `useReturnNote()` takes no input.
- UX also puts slow-path counters in `help_state` (L51), which clients can read (finding 4).

**20. The changes page is specified two ways.** Major · high.
- Read state: ARCH L218 and L226 have opening the page call `markRead`, which advances the cursor. UX L43 and mockup 04 L15 say "opening it moves nothing".
- Route: UX L41 and mockup 04 L28 put it at `/help/changes` in the Help Center shell (`(document-help)/help` exists). ARCH L226 puts it at `(document)/changes`.
- ⌘K label: "What changed" (UX L41) vs "What's changed" (ARCH L226).
- Reachability: UX L39 says ⌘K only. ARCH L226 adds the help panel, and mockup 03 L108 and 04 L15 add a since-line link.

**21. The recommended option is neither costed nor phased.** Major · high · ARCH §8 L258–266 vs UX §C L82.
- ARCH's phases hold none of Option 3's anchor placement, per-surface completion events or slow-path counters. Phase 2 has only the `act` slot.
- UX L49 wants completion CustomEvents (`document:invoice-sent` and the others), and none exist in `src/` (grep, 0 hits). ARCH L125 says "no per-feature code".
- The lane-day total (about 21–23) does not cover the recommendation.

**22. Phase 1 has no kill switch.** Major · medium-high · ARCH L266, L262.
- The `teaching-notes` flag arrives only in Phase 2. Phase 1 already moves every backend's write path, tours and margin notes included (L100), so rollback means reverting the deploy.
- Fix: put the adapter switch behind its own flag from day one, or ship it as a separate, earlier PR with the SQ-265 test.

**23. "Dismissed notes stay findable" is only true for releases.** Major · high · UX L39, L64; mockup 04 L15.
- The page lists `releases` (ARCH L218). Dismissed (c) and (d) notes appear nowhere, which contradicts the research's "skipped must stay findable" (§2.8).

**24. Cap-exempt in-place notes have no overall ceiling.** Major · medium · UX L51, L65, L73.
- The limit is one per surface per visit, across Accounts, Hours, the Galley and the Invoice folio, plus one Desk note. That allows five notes in one visit, and UX L73 admits "total exposure is highest".
- VISION §4 says Patina "gets out of the way".
- A note after each send in a month-end invoicing run lands at a fine subtask boundary, not the coarse one the research recommends (§1.3).
- Fix: one unsolicited note per visit across all slots, with in-place notes the preferred slot rather than an exempt one.

### Minors

25. **Visit and cap definitions disagree** · high. UX L25: "first Desk load after 30 minutes away". ARCH L71: "≥4h". ARCH L136 adds a 24-hour spacing rule that UX's caps (1 per visit, 2 per 7 days) don't have.
26. **The ignore threshold disagrees** · high. UX L23 and R-4 say three visits. ARCH L35 defaults `maxDisplays` to 2.
27. **The label date has no fixed meaning** · high. The release date appears in 02 L29 ("11 Sep"), but today's date appears in 01, 06 L106 and 07 L29 ("25 Sep"). A display-date stamp reads like a notification timestamp. Date releases only.
28. **The label position needs a change to the primitive** · high. UX L23 puts the label *above* the sentence. `margin-note.tsx:262` renders `caption` *below* it, as a footnote. ARCH L221 says the only change to the primitive is `onSeen(how)`, and it also doesn't cover an act slot.
29. **The 44px claim is false** · high. UX L106 promises 44px targets. The live × is about 18px (`margin-note.tsx:266–273`, `p-0.5` + `h-3.5`), and the mockups' `.mn-x` is 24×24 (shared CSS). It passes WCAG 2.5.8 AA but not the claim.
30. **Face contradicts framing guardrail 9** · medium. Guardrail 9 says "Inter body, Playfair only for a release headline". UX L88 and every mockup set the sentence in Playfair italic, which matches the live primitive. Rule one way or the other.
31. **Surface-key format is wrong** · high. ARCH L224 uses `'designer.document.galley'`. `surfaceKeys.ts` uses the slash form (`'designer-portal/tours/…'`), and there is no galley key.
32. **Sample 6's success event is wrong** · high. UX L97 uses `source field`, but the CHECK values are `timer_auto|timer_manual|manual_entry|field_visit` (00545, 00595).
33. **"Press t anywhere in the Document" is not true** · high. `log-time-shortcut.tsx` L9–10: `t` does nothing while any dialog is open. Mockup 06 L107 prints the sentence *inside* the Hours sheet, where `t` is dead. The same copy appears in UX L95 and mockups 03 L107 and 04 L34.
34. **Changes-page copy is untrue** · high. Mockup 04 L30 says "written once, by the people who made it", but ARCH §6 L230 has agents draft the entries.
35. **The since-line points at the page** · high. Mockup 03 L108, "The rest is under What changed, in ⌘K", is the reminder that UX L84 refuses.
36. **Mockup 09 promises what the Desk slot won't do** · medium. It says the note "will not appear when this sheet closes". But the Desk slot re-evaluates at rest (ARCH L125, with an in-memory per-visit flag at L268), so the note would appear 1.5 s after she cancels the sheet on the Desk.
37. **The since-line mixes in a faster-way note** · high. Mockup 03 L107, "Press t…", is not a release. `sinceLine.items` are `TeachingReleaseItem` (ARCH L216).
38. **Ruling IDs collide** · high. UX R-2 is the Walkthrough; ARCH R-2 is help_state RLS. Both use the style of the canon R-numbers (R14, R94, R97). Rename them, e.g. UX-1 and AR-1.
39. **Registry names and enums differ** · high. UX L18 uses a Sanity type `marginNote`, which collides again, with audience `owner|any` and kinds a/c/d. ARCH uses `teachingNote`, `owner|hand|all`, and kinds a–e.
40. **The append-only test checks nothing** · medium. ARCH L60 compares against an id list kept in the same file, so any edit that changes both passes. Compare against `git show origin/main:` or a committed snapshot.
41. **The patch function fails silently** · medium. As `LANGUAGE sql` returning void, a path outside the allow-list (or a missing parent, finding 6) does nothing and reports nothing. `p_value` size is unbounded, and only the top key is allow-listed.
42. **Two tabs can break the cap** · medium. With the per-visit flag held in memory (ARCH L268), two open tabs each show a note. Counter writes lose updates (see also finding 5).
43. **"Since you were last here · 14 Aug" can read as surveillance** · low-medium. It tells her Patina tracked her absence. Research §6.2 left this unresolved, and framing forbids "welcome back". Consider dropping the date.
44. **Existing machinery isn't reconciled** · high. Neither doc addresses:
    - the 2026-09-03 onboarding deck: 14 decisions, never executed, including a derived "Invite your crew" checklist that guardrail 7 refuses (`synthesis/decisions.md`);
    - the live "First Six Weeks" drip (00561), next to ARCH §6.6's owner letter;
    - what happens to `FeatureAnnouncementCoachmark` (UX reworks it, ARCH says nothing);
    - the Desk Walkthrough (in ARCH);
    - Patina Field (framing §1 allows notes there).
45. **Measurement is suppressed at current scale** · medium. With under-5 cell suppression and about 24 prod profiles (00555 L236), almost every per-note aggregate is suppressed. That makes R-5 moot and Phase 3's ~6 lane-days close to idle for months. Say so.
46. **Non-release notes can go live before their code ships** · medium. Only `release` notes are held until the bundle carries them (ARCH L51, L232). A (c) or (d) note about unshipped behaviour goes live the moment it is published in Sanity, unless it carries a flag.
47. **Empty-state first-use notes have no trigger** · medium. UX moment 4 for Option 3 promises them, and ARCH has no such trigger.

### Nits

48. **Wrong success criterion cited** · high. UX L109 cites SC 2.4.11 for reflow. Reflow is SC 1.4.10; 2.4.11 is Focus Not Obscured.
49. **Invented surname** · high. Every mockup's drawer (e.g. 01 L99) says "Leah Hartwell". VISION L25 names her Leah Kochaver.
50. **A live "new" marker the registry should absorb** · high. "Draw an invoice · new" is live copy (`desk-contents.tsx:397`) and appears in every mockup. Log it for retirement.
51. **The e2e helper writes whole blobs** · high. `e2e/helpers/help-state.ts:57,65` should move to the patch path, or its tests will enshrine clobbering.
52. **The label names the system on every note** · low. Framing ruling 1's "no visible name" option serves "won't notice Patina" best. Keep it on the table.

### Load-bearing claims (orchestrator item A)

- **F1: confirmed, and wider than stated.** Evidence: 00555 L624–643, L705–707 and L217–227; see finding 4.
- **F2: confirmed.** `supabaseAdapter.ts` L101–110 has `saveHelpState` write `.update({help_state: blob})`. L386–392 hydrate the tour and announcement cache to `{tours, featureAnnouncements}` only, so its next write drops `marginNotes` and `firstAuthoredAt`. The margin-note and first-authored caches do keep the full blob (L259–285, L310–337).

### Naming split (orchestrator item E)

Confirmed clean: neither doc changes `use-margin-notes.ts` or the `margin_notes` table. ARCH uses `teachingNotes` and `teachingNote` throughout. The one leak is UX's Sanity type `marginNote` (finding 39).

### Rulings (orchestrator item G)

**Can be decided from evidence (no need to ask Kody):**
- ARCH R-4 (do admins count as owners): already ruled by HT-10. The 00606 header says "owner/admin reads the studio's" hours, so follow that.
- ARCH R-5 (holdout): with about 24 profiles and cell suppression, there is no holdout. Decide it.
- ARCH R-3 (Sanity draft-only token): engineering. Check the plan's roles and choose.
- ARCH R-2 (own-row `help_state`): not needed for this feature if finding 2's table is used. DM-1 stays its own ruling.
- UX R-4 (ignore threshold): align it with `maxDisplays` in the doc.
- R-1 (name): UX's own condition ("Margin Notes if it stays a DM Mono label only") already fails. The designer's own notes are announced as "Margin note actions" (`margin-rail.tsx:748`), and Option 3 puts Patina's notes into the margin she authors in. Present Workshop Notes as the evidence-backed default.

**Missing rulings Kody will ask for:**
- a single visit ceiling across all slots (finding 24);
- whether Phase 1 ships on `help_state` at all (finding 2);
- how this relates to the 09-03 onboarding program and the live drip (finding 44);
- whether Phase 1 gets a flag (finding 22);
- what happens to `FeatureAnnouncementCoachmark` and the "· new" marker.

**Genuinely Kody's or Leah's:** UX R-2 (the Walkthrough), UX R-3 (since-line relevance, after finding 19 is fixed), and framing rulings 2 and 5.

### What is right

- Mockup tokens match `globals.css` exactly, and the fonts (Playfair Display, Inter, DM Mono) match `app/layout.tsx`. There is no Fraunces anywhere.
- The empty state really is empty.
- There is no banned lexicon and no exclamation mark.
- Every ARCH §3–§4 column exists.
- ARCH's list of refused metrics is sound.

## §Verification log

- **Browser attempt.** I tried Playwright 1.58.2 inside the sandbox. Chromium died on launch (SIGTRAP), WebKit timed out, and Firefox launched but `newPage` threw "Cannot read properties of undefined (reading '_page')". No Claude-in-Chrome tools were available. Per the orchestrator note I did not retry outside the sandbox.
- **Static check instead.** All 9 mockups share one byte-identical stylesheet (md5 54296902, 14,921 chars), which I read in full:
  - grids use `minmax(0,…)`;
  - breakpoints at 599, 699, 859 and 1023 collapse the fixed-column grids (`.irow` 78/90/128, `.hrow` 96/76, `.with-margin` 250, `.lrow`);
  - sheets are `min(…, 100% − 32px)`, and flex rows wrap;
  - `overflow-wrap: break-word`;
  - `.da` is `nowrap` but lives inside wrapping flex rows.
- **Static verdict:** no horizontal scroll expected at 390 or 1280. **This was not confirmed by a render.** One unknown remains: `.stage{overflow:hidden}` could clip a tall sheet at 390 in 05, 06 and 09 (low confidence).
- **Tokens:** 12 checked against `globals.css` (`--color-off-white`, pearl, aged-oak, card-edge, doc-rail-stock, text-subtle/muted/faint, mocha, clay, clay-ink, doc-paper).
- **Empty state:** 08 has zero `class="mn"` elements.
- **Copy scans:** for AI, powered by, tip or tour, luxury, curated, elevated, welcome back, coastal, `!`, and Fraunces/Hanken/Plex, across UX, ARCH and all mockups. The only hits describe the existing Walkthrough.
- **Code read** (all at HEAD c6747f0b2):
  - migrations 00555, 00146, 00606, 00545/00595;
  - `supabaseAdapter.ts`, `SupabaseHelpStateAdapter.swift`, `e2e/helpers/help-state.ts`;
  - `margin-note.tsx`, `desk/page.tsx` L355–425, `desk-contents.tsx:397`, `doc/[id]/page.tsx` L930–949;
  - `doc-sheet.tsx:372`, `send-sheet.tsx`, `log-time-shortcut.tsx`, `use-drafting-state.ts`;
  - `react-query.ts`, `command-bar.tsx` L572–598, `sanityClient.ts` L25–30, `surfaceKeys.ts`, `app/layout.tsx`;
  - `resend-webhook/status-map.ts` (confirms "opened" is a real status);
  - a `database.types.ts` column check for 9 tables.

## §Verdict

**Send back.** The UX options doc is close to "present with fixes". The architecture is not:
- Blocker 1 would keep the most important notes from ever showing.
- Blocker 2 ships "which hand read what" to co-members and clients in Phase 1.
- Blocker 3 makes the recommended option unrenderable.

The fixes are bounded:
- a pure selector with a post-release success signal;
- an own-row teaching-state table, which also removes findings 5–8 and the R-2 dependency;
- a per-surface at-rest definition;
- tagged boundary mutations;
- one reconciled spec for the changes page, visit, caps and cursor;
- an `act` field with bindings;
- Option 3 costed into the phases.