# Verified upstream contract gaps (Fable, first-hand, 2026-09-23)

Two of the three recommended opportunities depend on server contracts that do not
exist today. Both were claimed by a subagent and both are confirmed by direct read.
Each becomes a **non-iOS prerequisite workstream** in the delivery plan.

---

## G1 — The FF&E extractor is PDF-only and is *designed* to refuse pricing

`supabase/functions/project-ffe-document-extract/lib.ts`

- `contentType: "application/pdf"` is asserted three times (:17 type, :54 runtime
  validation gate, :68 construction). A captured photo is rejected, not degraded.
- `ExtractionRow` (:19–26) is exactly:
  `pageNumber, provenance{page, confidence}, name, quantity, roomName, category`.
  There is **no maker, SKU, price, currency, finish or lead-time field.**
- Row validation is strict-key: `Object.keys(row).length !== ROW_KEYS.size` rejects.
  Adding a field means changing the type, the validator, the prompt and the caller.
- The prompt (:73) states: *"Never infer approval, authority, pricing, trade cost,
  markup, or a client verdict."* — pricing is an **intentional refusal**, not a gap.

### What this invalidates in the committed deck
`artifacts/ios27-opportunities-2026-09-23/deck/index.html`, Top-1 slide:
1. Success criterion "≥95% on SKU and price, ≥90% on maker" is **unmeasurable** —
   none of those three fields exist, and one is prohibited by policy.
2. "Field's camera posting a tag photo to the same extractor" **cannot work** —
   the extractor rejects non-PDF at :54.

### Consequence for the plan
- Phase-2 front door must be scoped to the fields that exist: name, quantity, room,
  category, page provenance, confidence. Its success criterion becomes *row recall
  and room/category accuracy*, not SKU/price.
- Any maker/SKU ambition is a separate **server** ticket (extend `ExtractionRow`,
  the validator and the prompt) — and the pricing half needs a **policy ruling from
  Kody**, because refusing it was deliberate.
- The tag-photo path needs an image branch in the extractor (or a second function).
  It is not a client-side change and must not be planned as one.

---

## G2 — APNs addresses exactly one bundle, and it is not Field

`supabase/functions/apns-send/index.ts`

- One **global** topic: `const topic = Deno.env.get("APNS_TOPIC")` (:229), passed
  unchanged to `buildApnsHeaders(input, topic, jwt)` (:296).
- Per-token selection covers **environment only** (`.select("token, environment")`,
  :252 and :261) — sandbox vs production host. Never the bundle.
- `public.device_push_tokens` (`supabase/migrations/00335_device_push_tokens.sql:23`)
  has `user_id, token, platform, environment` — **no bundle/app column**, so the
  server cannot tell a Field token from a client token even if it wanted to.
- The two apps have different bundle identifiers:
  - Patina client — `cloud.patina.app` (`Patina.xcodeproj/project.pbxproj:695`)
  - Patina Field — `cloud.patina.field` (`Capture.xcodeproj/project.pbxproj:1964`)
  An APNs `apns-topic` must equal the target bundle id, so one global value can
  reach one app only.

### Consequence for the plan
The Field notification rail is **three** changes, one of which is iOS:
1. **DB** — add a bundle/app column to `device_push_tokens` (new migration),
   backfilled to `cloud.patina.app` for existing rows.
2. **Edge** — `apns-send` selects the topic per token from that column; the env var
   becomes a default for legacy rows. Same APNs auth key works: Apple auth keys are
   team-scoped, so `APNS_KEY_ID`/`APNS_TEAM_ID` are unchanged.
3. **iOS (Field)** — `aps-environment` entitlement (absent today), registration, and
   the token write stamping its own bundle id.
Ordering is strict: 1 → 2 → 3. A Field build that registers before the server can
route writes tokens the rail silently drops.

---

## Toolchain gate — partially lifted 2026-09-23

Kody: *"I will update to xcode 27 before we begin the development."*

- Lifts the local blocker: Xcode 27 ships the iOS 27 SDK, so iOS 27 symbols compile
  and `@available` branches can be exercised.
- Does **not** lift CI: `.github/workflows/policy-quality.yml:95` and `:104` pin
  `runs-on: macos-15`. The iOS gates there cannot build an iOS 27 SDK target.
  → **Work item: bump the iOS CI runner image** (and its Xcode select step) in the
  same wave as the first iOS 27 symbol, or the gate goes red on the PR that lands it.
- Still does not lift the **device** gate: Apple Intelligence needs A17 Pro+, and
  `OCRTool`/`BarcodeReaderTool` do not run in the Simulator. The house census —
  which phones Leah's crew actually carry — remains the blocking unknown.
