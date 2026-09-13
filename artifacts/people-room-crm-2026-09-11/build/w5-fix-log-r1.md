# W5 fix log — review round 1

Scope: exactly the two findings handed over (F1, F2). Nothing else in
`w5-review-r1.md` was touched — findings 3–8 remain open. Files changed live
under `apps/mobile/Capture/**` only.

Gate: `apps/mobile/Capture/scripts/capture-gate.sh all` (sandbox disabled for
the Xcode/CoreSimulator calls; the default sandbox denies CoreSimulatorService,
DerivedData and provisioning-profile access — same condition the review record
notes):

```
✔ build · ✔ tests · ✔ lint · ✔ fc-r3 sweep (inbox) · ✔ fc-r3 sweep (ai) · ✔ principle-4 sweep
```

Simulator: iPhone 17, udid `C8850509-C7DC-43C5-9226-9446404EE98A` (explicit on
every call), mock mode, launched with `capture-run.sh PR1.roster`.

---

## F1 — `SupabaseSiteRequestService` read the frozen legacy consent column (MAJOR)

**File**: `apps/mobile/Capture/Capture/Features/SiteRequests/SupabaseSiteRequestService.swift`

**What changed**

- `partyColumns` no longer selects `sms_consent_status`. `project_parties` is
  still the reader for the seat's own facts (`id, display_name, company_name,
  phone, phone_e164, trade, party_kind`) — it carries `phone_e164` and
  `party_kind`, which `v_project_roster` does not, and the `phoneE164 ?? phone`
  fallback both call sites depend on.
- The consent word now comes from `people_directory_seats` (00626) —
  `seat_id, consent_status`, i.e. `channel_consent_status()` resolved at
  `project_consent_org(project_id)`, the same record-backed reader W5's own
  three screens use. New private `seatConsent(projectID:)` returns
  `[seat_id: consent_status]`.
- Both readers now run it: `hub()` adds `async let partyConsent` beside its five
  existing parallel reads; `fieldParties()` runs the two concurrently.
- `ProjectPartyRow.consentStatus` is gone; `fieldParty` and `assignee` became
  functions taking the record's word. A seat absent from the map, or carrying a
  NULL word (the caller cannot read the deciding record), is **not granted** —
  the only direction this may fail in.

**Why not `v_project_roster`** (the fix line's first suggestion): the view emits
no `phone_e164`, renames `id`→`roster_id` and `party_kind`→`kind`, and UNIONs a
team branch whose `sms_consent_status` is always NULL. `people_directory_seats`
is the other reader the fix line allows ("another reader backed by
`channel_consent_status()`") and is a column-for-column fit.

**Evidence**

1. *Compile-green*: `capture-gate.sh all` as above.
2. *Verified against the local schema* (127.0.0.1:54321 / :54322, reads only —
   no writes, no reset). The exact PostgREST shape the new code issues, run as
   the project's designer of record (`a0000000-…-004`, locally minted 10-minute
   HS256 token):

   ```
   GET /rest/v1/people_directory_seats?select=seat_id,display_name,consent_status
       &project_id=eq.d0e00000-0000-0000-0000-00000000000a&order=display_name
   → 200, 24 rows
     Amara Osei     granted
     Dana Kowalski  granted
     Erin Sato      granted
     …
   ```

   Negative control, same endpoint: `select=seat_id,sms_consent_status` →
   `400 42703 column people_directory_seats.sms_consent_status does not exist`.
   The frozen column is not reachable through the new reader at all.

3. *The divergence is real on the fixture, not hypothetical*: 10 of 31 local
   seats carry a record verdict different from the frozen column —

   ```
   Amara Osei / Dana Kowalski ×2 / Erin Sato ×2 / Luis Ochoa / Ngozi Eze  not_asked → granted
   Joe Wozniak                                                           not_asked → pending
   Pete Rusk ×2                                                          not_asked → opted_out
   ```

   Every `project_parties.sms_consent_status` on this database reads
   `not_asked` (31/31), so before this change `smsConsentGranted` was false for
   every seat on every project and `PunchCourtResolver`/`FieldVerbMenu` could
   never route a text — including for the two seats whose record says
   `opted_out`, where the frozen column would have inverted the moment anything
   wrote the affirmative word to it.

4. *No seat is lost by the second reader*: row parity for the walked project as
   that same designer — `project_parties` 24, `people_directory_seats` 24
   (`Prefer: count=exact`). The assignee population is unchanged.

**Claim level**: compile-green + local-schema-verified (query shape, grants,
verdicts and row parity measured against the local stack). NOT sim-verified and
NOT device-verified — the Simulator runs `CaptureKitMocks`, so this real-service
path is never exercised by the walk below, exactly as the build report's own
ladder states for real-mode code.

---

## F2 — reach and stage words invisible to VoiceOver on dialable rows (MAJOR)

**File**: `apps/mobile/Capture/Capture/Features/People/PeopleSupport.swift`

**What changed**: `PeopleTelLine`'s dialable branch built its label from the
call action alone. It now composes `words` (reach, then stage) ahead of it:

```swift
private func callLabel(_ display: String) -> String {
    guard !words.isEmpty else { return "Call \(display)" }
    return "\(words.joined(separator: ", ")), call \(display)"
}
```

The no-words case (PR2's channel lines pass none) keeps the old string exactly,
and the no-phone branch was already correct and is untouched.

**Evidence — sim-verified.** `describe_screen` / `scan_ui` on the booted
Simulator, PR1 roster, every `people.tel.seat-*` element:

| element | AXLabel before (review r1) | AXLabel now |
|---|---|---|
| `people.tel.seat-F-04` | `Call (612) 555-0104` | `Account, On the job, call (612) 555-0104` |
| `people.tel.seat-F-05` | `Call (612) 555-0105` | `On paper, On the job, call (612) 555-0105` |
| `people.tel.seat-F-02` | `Call (612) 555-0102` | `Account, On the job, call (612) 555-0102` |
| `people.tel.seat-F-06/07/08/09/11/18` | `Call (612) 555-01xx` | `Field link, On the job, call (612) 555-01xx` |

All three reach families (`Account`, `On paper`, `Field link`) and the stage
word now reach VoiceOver. PR2 regression check, `people.channel.ch-09-m`:
`Call (612) 555-0109` — unchanged, as intended (no words on that call site).

**Claim level**: sim-verified.
