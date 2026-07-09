# Patina Mobile Apps

Two native Swift/SwiftUI apps live under `apps/mobile/`, split by audience.
Both share the monorepo's Supabase-first architecture (Supabase Auth/GoTrue,
no NextAuth, same Supabase backend as the portals — Supabase Cloud "Strata"
in prod, per-env URL from each app's `Secrets.swift`) — see the root `CLAUDE.md`.

- **`Patina/`** — **Patina**, the client app (`cloud.patina.app`). Room
  capture, a daily companion experience, style quiz/recommendations, and
  furniture discovery for consumers.
- **`Capture/`** — **Patina Field**, the designer/trades app
  (`cloud.patina.field`, scheme `field://`). Camera-first specimen capture
  plus a Work surface (projects, leads, decisions, messages, receiving,
  pro site-scan) for designers and trades.

QR portal-login approval (scan a portal sign-in QR, confirm with Face ID/
Touch ID) is implemented in both apps: `Patina/Patina/Features/QRAuth/` is
the original implementation; `Capture/Capture/Features/QRApprove/` is a
port of it, rebuilt on CaptureKit's seams.

## Patina (client)

- Xcode project: `Patina/Patina.xcodeproj`. Swift source: `Patina/Patina/`.
- MV-VM + Coordinators; feature-per-folder under `Features/` (Walk/RoomScan
  capture, Home, Companion, StyleQuiz, Collections, Projects, Decisions,
  Messaging, QRAuth, ...).
- Designer-dashboard, receiving, and dual home-mode surfaces were removed —
  that functionality now lives in `Capture` (Patina Field).
- Full details: `Patina/CLAUDE.md`.

## Capture (Patina Field)

- Xcode project is **generated** (`Capture/scripts/generate_project.rb`)
  from `CaptureKit/` (shared substrate), `CaptureKitMocks/` (mock conformers
  for every seam), and `Capture/` (the 51-screen app target).
- The original 8 capture flows (33 screens) plus 8 Work flows added in
  Phase 2 (18 screens: Work dashboard, projects, leads, read-only decisions,
  messages, receiving, QR approval, pro site-scan).
- Mock mode is the Simulator default; real mode (real Supabase auth + sync)
  runs on a physical device, or on the Simulator with `-CaptureForceReal`.
- Full details: `Capture/README.md`.

## Related specs

- Room capture flow spec (pending — not yet in `docs/specs/`).
- Patina Field spec: `docs/design/ios-Capture/patina-mobile-ux-flow.html`.
