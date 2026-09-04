# Client approval experience — 2026-09-03

What a homeowner experiences when Leah's studio asks her to approve something,
and what to build to make receiving and acting on approvals enjoyable rather
than administrative. Research and design only. No repo code was changed.

## Files

- **`proposal.html`** — the deliverable. One self-contained page for Kody and
  Leah: the current-state map, a twenty-item defect ledger, the shared
  "Decision" ceremony rendered as working HTML mock panels, per-surface
  before/after copy, a twenty-nine-proposal master list with dependencies and
  waves, and sixteen consolidated open rulings. Open it in a browser; it needs
  no server and loads only Google Fonts.
- **`discovery/01-designer-approval-creation.md`** — how a designer authors and
  sends both approval families, cited to file and line.
- **`discovery/02-client-portal-journey.md`** — the client portal journey,
  arrival through signature, including The Making.
- **`discovery/03-ios-client-app.md`** — the iOS client app's approval,
  proposal, push and deep-link surfaces.
- **`discovery/04-backend-and-notifications.md`** — schema, RPCs, triggers,
  notification channels, crons, analytics, flags.
- **`ux/01-journey-architecture.md`** — the seven moments and cross-surface
  continuity.
- **`ux/02-ceremony-and-visual-language.md`** — the ceremony grammar, stamps,
  and component inventory.
- **`ux/03-behavior-and-copy.md`** — behavioral principles and every word said
  to a homeowner.
- **`ux/04-ios-native.md`** — the native ceremony, push spec, and Daily Return
  integration.

## How it was produced

Four discovery researchers read the source directly and cited every claim to a
file and line. Four design specialists worked from those reports. A synthesis
lead read all eight in full plus `docs/vision/VISION.md` and the
`patina-brand-voice` skill, resolved the conflicts between lanes, deduplicated
the four proposal lists into one, and wrote the page. Every line of
client-facing copy quoted as a proposal is written against the vision and the
voice skill. Claims that could not be confirmed in code are marked unclear in
the appendix rather than smoothed over.

Prepared 3 September 2026.
