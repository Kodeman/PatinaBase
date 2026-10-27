I found 8 remaining issues, listed in order of severity. Two of them contradict fixes you've made. Nothing reaches high severity. Within the files I read, the deliberate scope choices (fixed two-client rule, single-package inheritance, comparison selectors) are stated consistently.

### Medium

**1. The cabinetry reference shows the wrong drawing route.** *Confidence: high.* `study.js:36` (`renderJob`)
- `job-mode` is read from `applied.drawingMode`. The parts table, scenes and team views read from `cabinetContext()`, which is the fixed cabinet-only preset (`drawingMode:'maker'`).
- So after you apply the Design package preset (`drawingMode:'designer'`) and open the reference, the sidebar says "Designer detailed set; Northline verifies." The parts table directly beside it shows S-101 maker shop drawings.
- This partly undoes the "fixed cabinet-only defaults" fix. The fix is to read `job-mode` from `cabinetContext()`.

**2. The clients still sign off work done under the GC's contract.** *Confidence: medium.* `study.js:67, 74` (the "Maker's work accepted" example)
- The scope reads "under the maker appointment held by Ana / GC". The signature list then shows Nora and Eli accepting it, and the proof calls this "acceptance under the maker's contracted scope."
- When the GC holds the contract, the clients aren't party to it. This is the earlier contracting-party problem in a softer form.
- Two options: show the contracting party as the one accepting (or the clients accepting the GC's delivered work under the GC's contract), or call the clients' entry an acknowledgement.
- When the contracting party is unassigned, the line also renders as "held by Unassigned".

**3. The site-verification ownership note contradicts itself when Sam is assigned.** *Confidence: high.* `study.js:51`, ownership column
- The `SM` row always says "Sam authored fixture; assignment needs its own verification."
- With the default measurer (Sam/Northline), the meaning column in the same row says "Verified by Sam / Northline", so the row contradicts itself in the default full-service view.
- The "needs its own verification" wording should only appear when the measurer isn't Sam/Northline.

**4. The "purchasing differs" checkbox probably doesn't hide.** *Confidence: medium.* `round7.css:1` sets `.exception-control{display:flex}`; `study.js:27` sets `.hidden=!c.cabinet`
- Author `display:flex` overrides the browser's built-in `[hidden]{display:none}`. Unless `presentation.css` (which I didn't read) forces `[hidden]` with `!important`, the checkbox stays visible and enabled when cabinetry is excluded.
- Toggling it then changes nothing except marking the arrangement "tailored".
- Fix: `.exception-control[hidden]{display:none}`, or disable the input as well.

### Low

**5. The responsibility hint stays the same for non-cabinet jobs.** *Confidence: high.* `index.html:6`
- Without cabinetry, the fold heading switches to "Who receives and installs / proposed roles" and the preview treats those as job-level roles.
- The hint underneath still says "These are CP-01 responsibilities. Only its purchasing route inherits…", which no longer applies.

**6. The site note always has Northline reporting installation.** *Confidence: high.* `study.js:49` (`site.act`)
- It reads "Northline reports installation evidence" even when the installer is the GC's or a client-appointed installer.
- The scene's own owner line on the same screen names the selected installer, so they disagree.

**7. The panel and the scenes count open decisions differently.** *Confidence: high.* `study.js:51` vs `study.js:24`/`26`
- When the measurer isn't Sam, `renderScene` adds the verification-evidence note to `missing` and reports it as an open "setup decision". The configuration panel and the job summary note count none.
- In the "Before fabrication" scene, the same message also appears twice: once in the Site verification row and again in the Setup decisions row.
- It is missing evidence, not a missing responsibility, so it shouldn't be labelled or counted as a setup decision.

**8. Nothing shows when the draft no longer matches what was applied to the job.** *Confidence: medium.* `study.js:29, 32, 34`
- After you apply an arrangement, any further edit changes the status to "Proposed arrangement saved in this browser." From then on, nothing says the job section is still showing the earlier arrangement.
- The downloaded review notes do mention it (`study.js:93`), but the page itself doesn't. A short "Draft differs from the arrangement on the job" status would cover it.

**Minor wording (low):** "Unassigned" gets inserted straight into sentences:
- "Unassigned owns the proposed maker appointment" (pricing scene, line 45)
- "Unassigned coordinates…" and "Unassigned's explicit instruction" (change scene, line 48)

The open-decision notice in those scenes reduces the risk, but it still reads as if "Unassigned" were a party.

### Checked and consistent
- **Starting arrangements:** none of the four flag any conflicts as configured, and full service keeps the GC as both purchaser and contracting party.
- **Conflict checks:** buyer/contracting party, instruction delegation, third-party payment, and studio contracting or paying without purchasing administration are all flagged without claiming legal rules.
- **Acceptance examples:** "awaiting client", "requested / no response" and "returned with an item" each name an owner and follow-up, and none implies deemed acceptance.
- **Hardware and appliances:** hardware is supplied by Northline within the maker's scope and appliances are client-supplied, consistently across the parts table, supplier view and threads.
- **Jo's routing:** her instructions go through Ana as her contracting party in both team views.
- **Separate reference:** the excluded-cabinetry wording ("GC contracts and instructs; Northline verifies and installs") matches the fixed cabinet-only preset.
- **Source map:** rules 2 and 5 match the single-package inheritance limit and the fixed two-client rule.
