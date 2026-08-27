# The Daily Return — Patina iOS client app review (2026-08-26)

## The ask (Kody, verbatim)
"Assemble a team of interior designers, home owners and UX UI designers. Review the Patina iOS
application and create a presentation outlining how the UI and UX flow could be updated to make
the application more sticky and make users want to return and use it everyday. And eventually
purchase through the app. The presentation should be an html presentation including mockups and
UI Screen details."

## Assumptions (stated, not asked — autonomous session)
1. "The Patina iOS application" = the **client** app `apps/mobile/Patina` (bundle `cloud.patina.app`).
   Patina Field (`apps/mobile/Capture`) is out of scope except where a client-side flow depends on it.
2. Evidence = **iOS Simulator (iPhone 17 Pro, iOS 26.5) against the local Supabase stack**, guest
   and signed-in client walks, at main `3cd84ecb3`. No physical device, no prod walk. Camera/LiDAR
   surfaces are code-read only and labelled so.
3. The panel is **simulated** — agent seats playing named Midwest homeowners, interior designers and
   UX/UI practitioners as review lenses. The deck says so plainly; no quote is presented as customer
   research.
4. Direction A stays **within ruled canon** (R01–R33, U01–U46 glossary, no tab bar, marketplace-first
   home with progressive disclosure, editorial Daily Room, Companion as nav). Direction B **may amend**
   canon — every amendment named, priced, and given a rollback. Same rule Kody set for the Document
   wayfinding review on 2026-08-25.
5. "Purchase through the app" is read as **direct orders of maker pieces** (R32 backlog item) plus the
   money rail that already exists (proposals → sign, invoices → Stripe hosted Checkout). Physical goods
   must not use Apple IAP (App Store Review Guideline 3.1.3(e) / 3.1.5(a)); external payment is the
   compliant rail.
6. "Sticky" is read through the brand ("Where Time Adds Value"): rituals worth returning to — the
   room, the piece, the maker, the designer's work, the season — never streak/badge/confetti loops.

## Program shape (sequential Workflows with Fable checkpoints between)
- **W1a Grounding** — G1 code anatomy (Opus) · G2 canon digest (Sonnet) · G3 backend reality
  (Sonnet, read-only) · G4 gap critic (Sonnet) · G5 gap fill (Opus, only if critical gaps).
- **W1b Evidence** — S1 steward builds + boots + signs in (Opus, unsandboxed for xcodebuild/simctl/
  osascript) · E1 guest walk · E2 client walk · E3 dark + Dynamic Type variants · L1 ledger.
- **W2 Panel** — 9 seats (H1–H3 homeowners, D1–D3 designers, U1–U3 UX/UI) run T1–T14 on the
  evidence → collate on disk → 3 refuters (code-truth, canon-truth, repro on the booted sim) →
  verified findings.
- **W3 Directions** — shared planks · Direction A + Direction B (Opus authors) · 4 critics
  (homeowner, designer, feasibility, canon) · v2 · judges J1/J2/J3.
- **W4 Mocks + deck** — iOS mock kit on PatinaDesignKit tokens · 12+ CSS phone mocks with screen
  sheets · deck built from ≤30k-char parts · fact-check · rendered QA (Playwright) · Fable review.
- Then: publish Artifact, pathspec commit, memory + RESUME.md.

## Output root
`artifacts/ios-daily-return-2026-08-26/` — `source/` (plan, instruments, directions, judges),
`research/` (anatomy, digest, backend, panel reports, findings, fact-check, QA), `shots/`
(simulator captures), `mock/` (kit, fragments, deck parts, QA renders), `presentation.html`.
Every agent writes to disk and returns a compact index — never a large payload inline.

## Gates
- W1b gates on the steward's `ready` boolean, never on its notes.
- No agent commits. No agent edits app code. No agent touches prod beyond read-only diagnostics.
- Every workflow agent's FINAL action is the StructuredOutput call, even on failure.

## Provenance
main @ `3cd84ecb3` (2026-08-26). Prior series: June R01–R26 (`docs/design/ios-ux-review/`),
July alignment R27–R33 (`docs/design/ios-alignment-program/`), July U01–U46
(`docs/design/ios-ux-review-2026-07/` incl. `glossary.md`, `DELIVERY.md`).
