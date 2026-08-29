# Rulings owed — capture-launch W0-D1

Sixteen calls, each with a recommended default. Tick the box to take the
default; strike it and write the alternative to overrule. Evidence for every
one is in `persona-findings.html` (open it beside this file).

Two scope notes the deck carries too: the extraction figures come from a jsdom
harness, not Chrome — and of the 15 fixtures only the 4 Chrome-rendered ones had
scripts and stylesheets stripped, the 11 `curl` fixtures are raw. Brand does not
render straight out of extraction (`draft.ts:118-119` nulls both vendors); it
appears only after the async Supabase vendor match resolves
(`use-capture-controller.ts:263` → `VENDOR_SET`, `reducer.ts:304`), so on an
unknown retailer or maker it never appears at all.

## How to run the walk

1. `pnpm --filter @patina/extension build` → `apps/extension/build/chrome-mv3-prod`.
2. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → that folder; pin it to the toolbar.
3. Sign in at **app.patina.cloud first**, in a normal tab — the panel adopts that portal session; the QR/email flow is the fallback, not the daily path.
4. Open one project + room for Leah's six URLs, and a room with several **empty** FF&E lines for Marcus's four.
5. Fill one row per URL in `walk-sheet.md`: time-to-save (toolbar click → terminal screen), clicks, fields fixed, fields missing for the tear sheet, retailer/manufacturer correct, badge honesty, one surprise.
6. The four answers that decide rulings: does the destination dropdown reset to "Library only" between Marcus's repeats (CL-R1) · does Pinterest break the live panel or just degrade — the audit's throw was jsdom's selector engine, so degrading is the expectation (CL-R11/R14) · is the confidence badge honest on RH and Instagram (CL-R15) · which tear-sheet fields are simply absent (CL-R1/R12).

## From the program plan

- [ ] **CL-R1** — Which workflow holes close for v1? — default: **build D4 (dimensions/materials/finish in the record form), D5 (sticky route kind + notes) and D6 (SKU from JSON-LD) in W2; lead time and inbox targeting wait for v1.1**
- [ ] **CL-R2** — Does "Send to inbox" stay untargeted? — default: **yes, keep as-is; targeting UI is v1.1**
- [ ] **CL-R3** — Confirm the W1 cut list (offline queue, six placeholder screens, OCR + tesseract, trade region + seven orphan components, `@patina/catalog-ui`) — default: **cut all of it**
- [ ] **CL-R4** — Where do `/privacy` and `/terms` live? — default: **new public routes on the designer portal (app.patina.cloud), which also fixes the two live signup 404s**
- [ ] **CL-R5** — The onboarding privacy claim ("nothing leaves your workspace") — default: **rewrite truthfully (page read only on capture, saves to your workspace, light usage stats), not delete**
- [ ] **CL-R6** — Who produces the five store screenshots? — default: **Kody shoots raw 1280×800 frames; an agent composes them and cuts the 440×280 tile**
- [ ] **CL-R7** — Listing support URL — default: **app.patina.cloud/help if reachable signed-out, else the contact address on the new privacy page**
- [ ] **CL-R8** — Keep the `email_domain` telemetry property? — default: **drop it** (it is the only thing forcing PII onto the analytics disclosure)
- [ ] **CL-R9** — The pending CWS 0.2.0 submission — default: **let it ride; read the dashboard immediately before tagging 0.3.0 and withdraw only then if still pending**
- [ ] **CL-R10** — Internal nouns in primary buttons ("slot", "line", bare "decision") — default: **retire them from primary copy in the wave that touches those surfaces**

## Forced by this lane's data

- [ ] **CL-R11** — Guard the two unwrapped `.closest()` calls (`images.ts:110/114`) in W1 — default: **yes, as defense-in-depth**. Scope honestly: the Pinterest throw (`SyntaxError: unknown pseudo-class selector ':3>*'`) comes from jsdom's nwsapi engine on a constant, pseudo-class-free selector that native Chrome `Element.closest()` cannot throw on — it breaks extraction **in the jsdom audit** and is unlikely to reproduce in Chrome. Those two are still the only unguarded `.closest()` calls in `extraction/` (every other module wraps its selector loop), so one page can never abort the pass.
- [ ] **CL-R12** — Manufacturer ≠ retailer on known retailer domains (DWR, RH, West Elm, CB2, Wayfair, Chairish, 1stDibs) — default: **fix in W2 in the extraction lane; take the brand from the page, keep the domain as retailer only**
- [ ] **CL-R13** — Currency detection (1stDibs came back CHF) — default: **fix — USD-first for US retailer domains, overridden only by explicit currency meta; show the detected currency instead of the hard-coded `$`**
- [ ] **CL-R14** — Known-bad domains (Pinterest, Instagram) — default: **yes — route them to a "we couldn't read this page" outcome with the snapshot fallback and "by hand" beside it; the placeholder R4 screen is being cut in W1, so build this on the terminal screen that survives**
- [ ] **CL-R15** — The confidence badge — default: **hide the raw score; keep the per-field verdigris/rust badges only**
- [ ] **CL-R16** — Vendor capture inserts `vendor_certifications`, which 00058 restricts to `super_admin`/`quality_control` (42501 for every designer; the vendor row lands first and the certification error is never checked, so the chips are silently dropped) — default: **remove the certification chips and the insert from vendor capture in W1's cut lane**; alternative: a migration opening the policy to `authenticated` with a creator check

---

Ruled by: ______________________  Date: ______________
