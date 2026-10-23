I found 2 high-severity bugs, both in the round-four return flow that the new drawing links rely on, plus 4 medium and several low issues. Frozen drafts, the observation → follow-up → revision D chain, and the local-only labels mostly hold up. The trouble is getting to LR-36 and back, and the client-sharing control.

## 1. Findings

**Demonstrated bugs (traced in the code)**

| # | Sev | Conf | Finding | Evidence |
|---|---|---|---|---|
| F1 | **High** | High* | **"Work on LR-36" from the design pages scrolls back to the design button, not the item.** `openLine` scrolls to the first `[data-line="LR-36"]` on the page. The design buttons carry that same attribute, and the Design chapter comes before the FF&E section. The sheet opens out of view and the user is put back on the button they clicked. The presentation's Drawings task ("Open LR-36, then return to the drawing") runs straight into this. LR-02 in the concept view has the same problem. Older round-four calls of `openLine` for LR-36 are hit too while the design overview is on screen. | commerce.js:69 `$(\`[data-line="${id}"]\`)`; design.js:24, 36, 41 `data-line="LR-36"`; job.html:8 (`#design`) comes before :11 (`#pieces`) |
| F2 | **High** (Safari) | Med | **The way back to the drawing depends on the clicked button having focus.** `rememberOrigin` reads `document.activeElement`. In Safari on macOS, clicking a button doesn't focus it, so the origin becomes `#pieces`, labelled "Return to room". The user returns to the FF&E room overview while the URL still says `scene=drawings`. The mechanism is inherited, but the new design-to-FF&E path depends on it. | commerce.js:64 `const a=document.activeElement,anchor=a?.closest('[data-design-origin]…` falls back to `'#pieces'` |
| F3 | Med | Med-High | **The return history goes stale on design routes.** `Commerce.route` clears the saved return points (`origins.length=0`) only when the old router runs. Design scenes take over first, and opening a bench sets `J.ui.open=false` without popping anything. Example: LR-36 → browser Back (`scene=design`) → later "Unfold the FF&E schedule". The return button then reads "Return to room design ↓" and sends the user to the design chapter. | design.js:105 `route(scene)\|\|oldRoute(scene)`; design.js:57, 62 `J.ui.open=false`; commerce.js:67 |
| F4 | Med | High | **The client-sharing button label is always "Keep in studio".** `data().shared` is an object (`{}`), which is always truthy. On first view the disclosure says "Current sheet stays in the sample studio folio" next to a "Keep in studio" button that actually shares. This is exactly the shared-versus-issued boundary under review. | design.js:41 `btn('share',data().shared?'Keep in studio':…)`; design-data.js:4 `shared: {}` |
| F5 | Med | High | **Client sharing follows the sheet, not a revision, so it isn't frozen.** Sharing is stored per sheet (`shared['A-201']`). Share at C, file D, and the client folio now holds D, which the data itself labels "has not been approved or issued". This contradicts the plan's frozen-version rule. It is also why "Current sheet is included" is shown even while viewing superseded B. | design.js:41 `data().shared[ui.drawing]`; design-data.js:17; DESIGN-PLAN.md:15 |
| F6 | Med | High | **Re-rendering closes panels and drops focus.** Share, compare, the survey note and every select change rebuild the whole bench. The "Client visibility" and "Revision and distribution record" panels close again, so the share result is hidden right after clicking. Keyboard focus falls to the page body. On browsers where arrow keys on a closed select fire `change`, each step through Sheet/Revision/Plate size loses focus. | design.js:71–73, 79–81 → `renderWork()`; `<details class="laid-in">` always renders closed |
| F7 | Low-Med | High | **Revision D's text always says "in response to OBS-07".** Review OBS-07 with "measure", then record a new observation (OBS-08) and review it with "revision". The log credits OBS-08, but revision D's description says OBS-07. If D already exists, a second revision request creates a task whose "Open the drawing" button leads to nothing to act on. That path only appears when C is current. | design-data.js:17; design.js:41 (`current()==='C'&&…`), 76, 98 |
| F8 | Low | High | **The record doesn't track this round's actions.** Saved drafts, sharing, new observations and studio follow-ups aren't written to the job record. Only filing D is logged. That weakens "Earlier work stays with the job" for the evidence chain the plan names. | design.js:73, 90, 94, 98 vs 76 (`J.log` only there) |
| F9 | Low | High | **Smaller issues:** <br>• Print CSS hides `#studio-review-form`, but no element has that ID (review forms are `[data-studio-review]`), so those forms still print. <br>• Arriving at A-101 from the overview while comparison is on shows a disabled "Close comparison". <br>• `route()` always unfolds Site, even when the user folded it. <br>• The drawing scroll area has `aria-label` but no role. <br>• The plate buttons have doubled accessible names (alt text plus caption). <br>• Timestamp formats differ: seed "22 Oct, 09:40" vs new entries "Oct 22, 3:15 PM". | design.css:21; design.js:39, 57, 62, 41, 22, 7 |

\*F1 assumes `J.$` searches the whole document. design.js uses it that way, but its definition is in job.js lines 1–19, which were outside my range.

**Questions (not shown to be bugs)**

- **Q1: reset.** Does the "Reset fictional sample" action go through `Commerce.reset` (which Design wraps)? Does the seed it restores include `design`? If not, `data().current` throws after reset. Design's reset also leaves `ui.drawing`, `compare`, `scale` and `scanNote` as they were. (design.js:101, 106; reset code not in my range.)
- **Q2: does the field copy reveal studio work?** "A newer studio revision exists" tells Sam about unissued work. Is that intended? A neutral "Await updated set" would keep issued and unissued separate. (design.js:55)
- **Q3: TS-04 versus the approvals chapter.** The scope line shows "Client authorized 14 Oct" and "Trade engaged 16 Oct". Approvals says purchasing authority is "Not granted for this edition", and the console is under revision. Separately, the new-set form defaults to "Pricing" for a trade that is already engaged. Is LR-36 bought as an FF&E item, built by Sam, or both? (design.js:52, 45; job.html:9)

## 2. Design observations

1. **What Sam holds is stated the same way everywhere, which works well.** A-201 / B (IS-02) versus the current studio revision is consistent across the drawing bench, the set aside, the site margin, the field copy and the observation note ("studio is now at C"). Frozen drafts keep their revision and depth, and they warn when they fall behind. That is the strongest part of this round.
2. **Moving between Design and Site has no "return to your place".** The return stack only covers FF&E. Site → "Prepare updated drawing set" leads to a bench whose return buttons go to the room spread, not back to Site. Drawing → "Read the outlet observation" has no way back to the drawing. Only browser Back works.
3. **The chain doesn't visibly close.** Filing D doesn't link to or mark the follow-up task. The task still offers "Open the drawing to study a revision", and the field copy never shows a studio response. Showing OBS-07 → T-10 → A-201/D → DS-0x in one line would make the evidence chain the plan describes visible.

## 3. Claims that need checking against source

- **The "Current source" column of the capability map** (index.html:53), especially:
  - Plan Room with a current-print pointer and older prints
  - client visibility separate from frozen issues with purposes and named recipients
  - the studio-only access card
  - Field Desk "proposed effects and review"
  - the inline concept upload labelled "Concept · not installed"
  - scans keeping room identity and provenance (also design.js:35, "retain their own identities")
- **`assets/north-elevation.svg`** is used unchanged for B, C, D and every frozen print. If it has a revision or depth label drawn into it, the B view and the frozen C/D prints contradict their own captions. That would undercut "Unchanged frozen prints". `room-survey.svg` should likewise be checked against 19′8″ × 15′4″.
- **`J.$` and the reset path** in job.js / actions.js outside my reading range. These decide whether F1 holds as stated and the answer to Q1.
