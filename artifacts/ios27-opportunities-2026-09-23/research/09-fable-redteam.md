# Red team: Fable's iOS 27 shortlist (S1 / S2 / S3)

Independent adversarial review, 2026-09-23. Every claim below was re-verified first-hand against
the working tree at `/Users/kody/Code/patina-merged` or against Apple's published material.
Findings carry CONFIDENCE and SEVERITY. Nothing is filtered by severity.

**Headline:** one of Fable's three load-bearing findings (#5) is factually wrong in a way that
changes the item; S2's stated OS floor is wrong on two independent counts and cannot be compiled
on this machine or in this repo's CI today; and S3 promotes into shared law a grammar that the
codebase already erases one tap later — and that the vision document explicitly refuses by name.

---

## Part 0 — Cross-cutting findings

### C1. "One plumbing item, one model item, one design-system item" is a category quota, not a strategy
**Confidence: high · Severity: high**

The three items are one-of-each by construction. That shape is an engineering portfolio, not a
product bet. Test it against the company's own four-part feature test (CLAUDE.md: which surface,
which studio moment, which stream, which promise):

| | surface | studio moment | stream | promise |
|---|---|---|---|---|
| S1 | #2 (Field) | capture on site | neither directly | "the studio won't notice Patina" — yes |
| S2 | #2 (Field) | capture on site | margin (weakly, via FF&E) | **breaks it** — see S2-c |
| S3 | #2 + #2.5 | none | none | none |

Zero items touch surface #1, the Document — which the company's own file calls "Patina for the
next 12 months." Fable's own finding #15 states the Document has no mobile surface at all, then
proposes nothing about it. Two of three items sit in the same app, in the same screen family (N5 /
onboarding / capture). A shortlist where two items are in one app's capture flow and the third is
a refactor is a wish list from inside `apps/mobile/Capture`.

### C2. S2 cannot be compiled — not on this machine, not in CI
**Confidence: high · Severity: high**

```
$ xcodebuild -version        → Xcode 26.6 (17F113)
$ xcodebuild -showsdks       → iOS SDKs: iOS 26.5 only
$ xcrun --sdk iphoneos --show-sdk-path
  .../Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS26.5.sdk
```

`Attachment`, `OCRTool` and `BarcodeReaderTool` are iOS 27 SDK symbols requiring the Xcode 27
toolchain (Swift 6.4). They do not exist in iPhoneOS26.5.sdk. Worse, the iOS gates in
`.github/workflows/policy-quality.yml:95` and `:104` both run on **`runs-on: macos-15`** — a runner
image that does not ship Xcode 26, let alone 27. S2's true prerequisite list therefore includes an
Xcode upgrade on the dev machine, a CI runner-image bump (macos-15 → macos-26/27), and a
re-validation of both `ios-gate.sh` and `capture-gate.sh`. Fable's brief mentions none of this and
calls S2 a scoped feature.

Side finding, same evidence: Patina (client) already has `IPHONEOS_DEPLOYMENT_TARGET = 26.0` in all
8 build configurations, and CI builds it on macos-15. Either the `ios-patina` advisory gate is
already failing or it is not being triggered. Worth a look independently of this shortlist.
*(Confidence: medium — I did not run the gate. Severity: medium.)*

### C3. S2's OS floor is wrong twice: 26.0 is both insufficient and unnecessary
**Confidence: high · Severity: high**

S2 says "Requires bumping Field's floor from 18.0 to 26.0."

1. **Insufficient.** Text-only `FoundationModels` is iOS 26. The *multimodal* surface S2 is built
   on — image `Attachment`, `OCRTool`, `BarcodeReaderTool` — is new in iOS 27 and needs
   `@available(iOS 27, *)`. A 26.0 floor buys a device cut and still cannot run the proposed
   feature.
2. **Unnecessary.** Swift availability gating plus weak linking (`FoundationModels.framework` set
   Optional; `#if canImport` + `#available`) lets a target with an 18.0 deployment target call an
   iOS 26/27 API. Apple's own cross-development guidance covers exactly this. The blunt
   floor-raise is a workaround for a known Xcode annoyance ("Unable to resolve dependency
   'FoundationModels'" when *any* target compiling the shared file is below 26), not a requirement
   — and in Field's case the fix for that annoyance is to keep the FoundationModels adapter out of
   `CaptureKit`/`CaptureKitMocks`/test targets, which the existing protocol seam already makes easy.

Net: the device cut S2 proposes buys nothing. The set of devices that can actually run S2 is
`iOS 27 ∧ A17 Pro+ ∧ Apple Intelligence enabled ∧ model downloaded` — strictly smaller than an iOS
26 floor, and reachable from an 18.0 floor without cutting anyone.

### C4. The "Designer-Taught Intelligence moat" (finding #8) is a moat around an empty field
**Confidence: high · Severity: high**

Fable presents the Aesthete Engine as a live, defensible asset whose only problem is surfacing.
The repo says otherwise. `apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaEmptyState.swift:98`:

> `A3-01`. Production's `get_aesthete_matches` returns zero rows for every tester: `products` holds
> one `catalog`/`published` row, named "Smoke Test Ceramic Lamp", with no image.

`artifacts/ios-testflight-polish-2026-09-01/research/40-result-summary.md:96` carries A3-01 as a
**T0/blocker at confidence 0.97, prod-verified**: 15 product rows total, 1 visible to a tester, 0
with images. The engine's embeddings and Bradley-Terry refit are real code; the corpus they run
over is one $20 ceramic lamp. The binding constraint on Patina's intelligence story is *catalogue
data*, not iOS API surface. Every item on this shortlist is downstream of a problem none of them
touch.

### C5. Finding #7 is the strongest thing in Fable's evidence base and it is not on the shortlist
**Confidence: high · Severity: high**

Verified: `supabase/functions/project-ffe-document-extract/index.ts` calls
`stage_project_ffe_document_extraction`; the RPC is defined in `00437_ffe_service_boundaries.sql:163`,
ACL-hardened in `00444_ffe_service_acl_replay_hardening.sql:22`, and **exercised by two SQL test
files** (`supabase/tests/ffe/service_boundaries_test.sql:283`,
`supabase/tests/ffe/release_lineage_compat_test.sql:306`). Across the whole repo there are 23 hits
for the function name and **not one is a caller from a portal, an app, or a cron**. It is
registered in `config.toml:628`, which means it is deployed and reachable.

So: a complete, tested, permission-hardened, already-paid-for PDF→FF&E extractor with a validated
commit path, sitting on surface #1, with no front door. The company's problem is not a shortage of
model capability. It is a shortage of callers.

### C6. Finding #6 (no push in Field) is confirmed and is a bigger user win than S3
**Confidence: high · Severity: high**

`apps/mobile/Capture/Capture/Capture.entitlements` contains only `application-groups`,
`applesignin`, and `associated-domains` — no `aps-environment`. A grep for
`aps-environment|UNUserNotificationCenter|registerForRemoteNotifications` across the entire Capture
tree returns **zero**. Field genuinely cannot be reached. The person holding it is the one furthest
from a desk, on a job site, and the studio's only channel to them today is SMS (the 10DLC rail,
which is mid-campaign-update per the working tree).

This is a capability the app does not have, for the user with the least alternative. S3 is a
refactor of a chip. See Part 4.

### C7. The family's one live model call is pinned to a model from May 2025
**Confidence: high · Severity: medium**

`supabase/functions/companion-message/index.ts:252` → `model: "claude-sonnet-4-20250514"`. That id
is roughly sixteen months old as of today. Before the company adds a *second* model dependency on a
new platform behind a hardware gate, the one model call it already ships is running on a pinned
model nobody has revisited. Cheap to fix, and it is the kind of thing that makes "we should adopt
Apple's model" read as novelty-seeking.

---

## Part 1 — S1: "The entry that was promised"

**Verdict: KEEP-WITH-CHANGES** — split in two, resequence, and drop the framing.

### S1-a. Fable's finding #5 is factually wrong. Field does *not* start a Live Activity today.
**Confidence: high · Severity: high**

`apps/mobile/Capture/Capture/Info.plist` — read in full — contains exactly two keys:
`POSTHOG_API_KEY` and `CFBundleURLTypes`. There is **no `NSSupportsLiveActivities`**, and
`scripts/generate_project.rb` emits no `INFOPLIST_KEY_NSSupportsLiveActivities` (it emits nine
`INFOPLIST_KEY_*` settings; that is not among them). Without that key,
`ActivityAuthorizationInfo().areActivitiesEnabled` is false, and
`CaptureLiveActivityController.start()` returns at line 38:

```swift
guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
```

So the claim "Field STARTS a Live Activity today … but nothing renders" is wrong. Nothing is
requested, either. The controller is dead code on device, not a running activity missing a view.

This cuts both ways and both matter:
- It makes the gap **larger** than Fable described (two missing pieces, not one).
- It makes the first fix **smaller and much cheaper** than Fable described: adding
  `NSSupportsLiveActivities` is one line in the generator. That one line is independently testable
  — after it, `isRunning` becomes true on a device and you learn whether the ContentState the
  uploader feeds is even correct, *before* anyone designs a Lock Screen presentation.

### S1-b. "Smallest version: one intent + one control + the Lock Screen presentation" is not small
**Confidence: high · Severity: medium-high**

`grep -n new_target scripts/generate_project.rb` returns five targets: CaptureKit, CaptureKitMocks,
Capture, CaptureTests, CaptureUITests. **None is an app extension.** Both `CaptureWidgets/` and
`CaptureShareExtension/` are empty directories — Field has two extension-shaped holes and zero
extension machinery.

Because the Xcode project is generated by Ruby, adding a widget extension is not "File > New >
Target." It is: teach `generate_project.rb` to emit an `:app_extension` target; give it its own
Info.plist keys, entitlements and App Group; add an "Embed App Extensions" copy phase; add a second
consumer of the **dynamic, hand-embedded** PatinaDesignKit product (the generator's own comment at
line ~268 records that `xcodebuild` does not auto-embed dynamic package products and the device
`.app` dyld-crashed until they wrote the embed phase by hand — a widget extension is a second place
that trap fires); set target membership for the intent on *both* the app and the extension (the
canonical "Cannot find 'MyIntent' in scope" failure); and re-run the deterministic
`rm -rf Capture.xcodeproj` regeneration with its two-pass UUID fixup. There is a known prior trap
here in the team's own memory (`feedback_capture_pbxproj_regen_worktree_trap`).

That is a real week, not a slice. It may still be worth it — but it should be costed honestly and
it should not be the "smallest version."

### S1-c. The conventional fix for the actual broken promise already exists in the codebase
**Confidence: high · Severity: medium**

`Capture/Features/Settings/SettingsScreen.swift:189-205` already ships `actionButtonRow`, whose
"Rebind" button does:

```swift
if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
```

The dead O4 button needs the same two lines. `OnboardingFlowView.swift:102` constructs
`ReadyScreen(analytics: analytics, onStart: onComplete)` and never passes
`onSetHardwareEntry`, so it takes the default `{}` — confirmed. Passing the settings-open closure
there fixes the shipped lie **today, with no App Intent, no ControlWidget, and no new target.**

This matters for sequencing: the "promise with nothing behind it" is not one problem, it is two
independent ones, and the cheap half is a one-line change that could ship this afternoon.

### S1-d. A pre-existing bug Fable did not find: every device is told to map the Action Button
**Confidence: high · Severity: medium**

`ReadyScreen.swift:18` → `var hardwareEntry: HardwareEntry = .actionButton`. The live call site
(`OnboardingFlowView.swift:102`) does not pass it. The file's own header comment says "Non-Pro
devices skip the Action Button tip and surface the Control Center control instead" — that branch
exists (line 74/76, 87) and is **never taken in production**. An iPhone 14, an SE, or any
Action-Button-less device is currently instructed: "Map the Action Button to Patina Field." On a
job site, with a crew on whatever phones they have.

This is a shipped-copy defect, discoverable in two minutes, and it is more embarrassing than the
dead button. Neither S1 nor the evidence base mentions it.

### S1-e. There is no API that binds an Action Button. S1 cannot deliver "the entry that was promised."
**Confidence: medium · Severity: medium**

Action Button assignment is performed by the *user* in Settings. Shipping a `ControlWidget` makes
the app *eligible* to appear under Settings → Action Button → Controls (and in Control Center, and
on the Lock Screen — one control definition, three placements, unchanged in model since iOS 18). A
plain `AppShortcut` is reachable via the Action Button's separate **Shortcut** option without any
control. Either way, the app cannot set it.

So the item's own title over-promises. "The entry that was promised" would be honestly titled "make
the promised entry possible, and stop the button that pretends to do it."

### S1 — five axes

- **Weak user value:** Partly. The Live Activity half is genuinely valuable for a jobsite user
  watching an offline queue drain. The control/intent half's value depends entirely on users
  completing a manual Settings ritual — and with zero third-party studios, the population that
  would do it is Leah's crew, uncounted.
- **Unsupported API assumptions:** finding #5 is wrong (S1-a). `NSSupportsLiveActivities` omitted.
  "Existing ActivityAttributes needs only a widget extension" is false — it needs the plist key
  *and* an extension target *and* generator work (S1-a, S1-b). ControlWidget floor is iOS 18, so
  that half is fine at Field's current floor — one of the few places the brief is conservative.
- **Excessive complexity:** yes, S1-b — three separable changes bundled as one.
- **Unnecessary divergence/convergence:** mild and in the right direction; Patina (client) has a
  `StaticConfiguration` HouseWidget and therefore already has widget-extension machinery Field
  could learn from. Fable does not mention that Patina has solved this problem once already.
- **Conventional alternative:** S1-c and S1-d — two one-line changes fix the actual user-visible
  lies, before any extension exists.

**Rewrite:** *"Stop lying, then render."* (i) Wire `onSetHardwareEntry` to
`UIApplication.openSettingsURLString` and pass a real `hardwareEntry` derived from device
capability, so non-Pro devices stop being told to map a button they do not have. (ii) Add
`INFOPLIST_KEY_NSSupportsLiveActivities = YES` and verify on a device that
`CaptureLiveActivityController` actually requests an activity and that its ContentState is correct.
(iii) *Only then*, and costed as its own piece of work, teach `generate_project.rb` to emit a widget
extension target and render `CaptureSyncAttributes` on the Lock Screen and Dynamic Island. Drop the
ControlWidget and the App Intent from this item entirely until (iii) lands — the extension is their
prerequisite anyway.

---

## Part 2 — S2: "The tag, read once"

**Verdict: DEMOTE** — a much narrower version is defensible; as written it is the riskiest item on
the list and it contradicts both the company's product thesis and S3.

### S2-a. Toolchain and floor
See **C2** and **C3**. Cannot compile today; floor is wrong twice. *Confidence high, severity high.*

### S2-b. Silent scope explosion: 4 classification fields become 16 commercial ones
**Confidence: high · Severity: high**

Today's N5 (`SmartGuessSheet.swift`, verified) proposes exactly four things: **category, material,
style, colour**. All four are classifications a designer can check against the photo in under a
second, and being wrong costs a tap.

S2 proposes a `@Generable SpecimenDraft` "mapping 1:1 onto the existing Specimen fields," and
Fable's own finding #2 enumerates those: title, maker, **sku**, colorway, materialNote, finish,
**priceTradeCents**, **priceRetailCents**, **currencyCode**, **sourceURL**, note, categoryRaw,
materials[], colors[], styleTags[], voiceTranscript.

That is not the same feature with a better engine. It is a jump from *classification* to
*transcription of commercial facts*. A wrong `colorway` costs a tap. A wrong `sku` costs a wrong
sofa. A wrong `priceTradeCents` costs margin on a stream the company describes as its first dollar.

### S2-c. Provenance laundering — the single most serious finding in this review
**Confidence: high · Severity: high**

Fable's safety argument is: "Values land in the same fields and fly the same dashed `.smartGuess`
provenance chip." That is true for exactly one tap. `SmartGuessSheet.swift:262-299`:

```swift
private func accept() {
    ...
    specimen.setValue(categoryRaw, for: .category, source: promotedSource(categoryRaw, categoryOriginal))
    ...
}
/// Accepted unchanged → .manual (designer-confirmed); corrected → .edited.
private func promotedSource(_ value: String, _ original: String) -> ProvenanceSource {
    value == original ? .manual : .edited
}
```

The primary button — labelled **"Looks right"**, a single tap that accepts *all four fields at
once* — rewrites the provenance of every unchanged value to `.manual`, whose own definition in
`CaptureEnums.swift:51` is **"typed by the designer."** The dashed chip does not persist. It is
erased by the accept path.

With four eyeball-checkable classifications, that design is reasonable. With a model-generated SKU
and trade price in the same bulk-accept, it is a machine that converts a language model's guess
into a designer's typed value, in one tap, with no residual trail. Downstream — the FF&E schedule,
the proposal, the client-approved budget, the purchase order — every consumer reads `.manual` and
correctly concludes a human typed it. If a bad price is discovered three weeks later, **there is no
query that finds the other rows that came from the same bad batch**, because they are all `.manual`
too.

This is also an internal contradiction: S3 exists to strengthen the provenance contract, and S2
routes commercial values through the one hole in it. If both ship as written, S3 exports a grammar
that S2 has just taught to lie.

### S2-d. OCRTool and BarcodeReaderTool would make the provenance grammar *worse*
**Confidence: high · Severity: high**

Field already runs `VNRecognizeText` (N1, 2 call sites) and a code scanner (N2), and those produce
`.ocr` and `.code` — the two *most trustworthy* sources in the enum, because they are verbatim
reads with no generative step. S2 routes the same photo into a language model that calls OCRTool
internally and emits one `SpecimenDraft`. Every field in that draft is `.smartGuess` — the weakest
source — even the ones that came from a barcode that would have been exact.

So S2 takes two high-confidence, separately-attributable signals and launders them into one
low-confidence, unattributable one. The user-visible result is that a scanned UPC stops saying
"scan" and starts saying "guess." That is a regression in exactly the property the family is
supposed to be building.

### S2-e. Guided generation guarantees the shape, not the values — and the benchmark gap is large
**Confidence: high · Severity: high**

`@Generable` + constrained decoding guarantees the model emits a structurally valid `SpecimenDraft`
with correctly typed fields. It guarantees nothing about whether `priceTradeCents` is the number on
the tag. Published structured-output benchmarking shows exactly this split: models scoring ≥96% on
path recall, structure coverage and type safety drop to **0.69–0.83 value accuracy**, with perfect
response rates of **0.38–0.53**. Apple's own positioning of the ~3B on-device model is summarization,
extraction and classification — explicitly *not* world knowledge — and practitioner reports flag
semantic confusion between similarly-named string properties as a recurring `@Generable` failure.

`SpecimenDraft` as specified has **four** near-synonymous string fields — `colorway`, `materialNote`,
`finish`, `note` — plus `materials[]`, `colors[]` and `styleTags[]`. That is the documented worst
case for field confusion, at a 0.69–0.83 value-accuracy baseline, on fields that become a purchase
order.

A structurally perfect, confidently wrong spec sheet is worse than no spec sheet, because it looks
finished.

### S2-f. The installed-base question is a census, not a statistic
**Confidence: medium · Severity: medium**

Apple Intelligence requires A17 Pro+: iPhone 15 Pro/Pro Max, iPhone Air, iPhone 16 and later.
Third-party estimates put the eligible base near ~940M devices against a ~1.4–1.5B active iPhone
base — call it 40–55%, and note Apple publishes no official figure. But that number is irrelevant
here. There are **zero third-party studios in production**. S2's real addressable population is
Leah's crew, plus trades. Nobody has asked which phones they carry — and a jobsite/trades cohort
skews old and cheap, not Pro. The house census is already an owed item. Running it costs one
question and would settle whether S2 has any users at all. Building first and asking after is
backwards.

### S2-g. Unverified: EU availability of FoundationModels
**Confidence: low · Severity: low**

The evidence base states Siri AI is English-only and **not in the EU** at launch. Whether that
restriction extends to the `FoundationModels` developer API is a *different* question and I could
not verify it. Flagging it as unverified rather than assuming either way. Low practical severity
given Leah is in Minnesota or Madison (itself an open jurisdiction ruling), but it should not be
carried forward as settled.

### S2-h. Context budget vs. a multi-shot capture app
**Confidence: medium · Severity: low**

On-device context is 8192 tokens. One tag photo + OCR text + instructions + a 16-field schema fits.
A multi-shot burst does not — and Field's settings screen advertises "multi-shot hold sensitivity,"
so bursts are a shipped behaviour. Any batching design hits the ceiling and pushes toward PCC (32k),
which is a network call, which reopens every offline assumption the jobsite app is built on.

### S2 — five axes

- **Weak user value:** the honest user story is "the keyword table rots." That is a maintenance
  complaint, not a user complaint. Nobody has evidence that a designer's N5 experience is a top-five
  pain — and the four fields it guesses are the four cheapest to fix by hand.
- **Unsupported API assumptions:** C2 (no SDK, no CI), C3 (floor wrong twice), S2-e (`@Generable`
  reliability overstated), S2-d (tool use presented as free when it costs provenance fidelity).
- **Excessive complexity:** the floor bump is the headline, but the real cost is an SDK upgrade, a
  CI runner-image bump, a weak-linking or target-partitioning decision, a second code path that must
  be maintained forever because the Vision heuristic stays as fallback, and an evaluation harness
  nobody has budgeted.
- **Unnecessary divergence:** S2 makes Field the only app in the family with an on-device model
  while the company's actual intelligence asset is server-side and shared. It forks the intelligence
  story along an app boundary for no product reason.
- **Conventional alternative — and it is better:** the SKU and the maker are *already in the OCR
  text and the scanned code*. A vendor-prefix table plus a GS1/UPC lookup gives an **exact, citable**
  value carrying `.ocr`/`.code` provenance. And the deeper point: `SmartGuessKeywords` does not rot
  because it lacks a language model; it rots because nothing feeds it. Field already records
  `.edited` every time a designer corrects a guess (`promotedSource`, line 297). A table that grows
  from what designers actually correct is **Designer-Taught Intelligence, literally** — the
  company's own product term. A frozen model shipped by Apple is the exact opposite: it is
  Apple-taught, it never learns from Leah, and it cannot be corrected. S2 replaces the company's
  differentiator with a commodity.

**Why DEMOTE and not KILL:** there is a narrow version worth keeping — *category only, on the
devices that have it, as a third `SmartGuessService` implementation behind the existing protocol
seam* (`CaptureKit/Recognition/RecognitionServices.swift:156`), measured against the Vision
heuristic on a labelled set. No floor bump, no price fields, no OCRTool. That is an experiment, not
a feature, and it should be sequenced behind the experiment in Part 5.

---

## Part 3 — S3: "The provenance contract"

**Verdict: KILL as written.** A different, smaller item survives; the proposed one is a refactor
with no user on the other end, it inverts the package architecture, and it promotes a pattern the
vision document refuses by name.

### S3-a. The contract's one real defect is inside Field, and S3 does not fix it
**Confidence: high · Severity: high**

See **S2-c**. `accept()` erases `.smartGuess`. Promoting a grammar to family-wide law before fixing
the hole in it exports the hole to a second app. The valuable work here is one line of policy —
*keep `.smartGuess` until the value is individually confirmed, and never bulk-promote a
machine-suggested commercial value to `.manual`* — and it lives entirely inside
`SmartGuessSheet.swift`. It needs no shared package at all.

### S3-b. It inverts the dependency: a domain enum does not belong in the design system
**Confidence: high · Severity: high**

`ProvenanceSource` lives at `CaptureKit/Domain/CaptureEnums.swift:45`. It is a **domain** type, and
its cases are named after Field's screens — the source comments read `ocr // N1`, `code // N2`,
`measure // N3`, `voice // N4`, `smartGuess // N5`, `imported // E3`. Those are Patina Field's
capture taxonomy, not a design vocabulary.

`PatinaDesignKit/Package.swift` states its charter in the file header:

> SwiftUI/UIKit/CoreText ONLY. Never import Supabase, PostHog, or any other SDK here — this package
> must stay a pure design layer.

Moving `ProvenanceSource` into it makes the *client* app's design system carry the *Field* app's
screen-numbered capture taxonomy. Every future change to Field's recognition pipeline becomes a
change to the shared design package, which is linked into both apps and into CaptureKit as a
dynamic product with a hand-written embed phase. That is a bad trade for a chip.

The correct shape, if anything moves: a presentation-only component in PatinaDesignKit that takes a
label string and a style (solid/dashed), and the domain enum staying in CaptureKit where it belongs,
mapping to that style at the call site.

### S3-c. It is three moves, not one
**Confidence: medium · Severity: medium**

`ProvenanceBadge.swift` depends on `CaptureType.eyebrow` and `CaptureColor.provenance(source)` —
both CaptureKit tokens. Moving the view means moving or re-pointing the type token, moving or
re-implementing the colour function, and moving the enum. Three coupled moves across a package
boundary, in an app whose Xcode project is regenerated from Ruby.

### S3-d. The package floor rests on a comment that is wrong
**Confidence: high · Severity: low**

`PatinaDesignKit/Package.swift` justifies `.iOS("17.6")` with:

> the Patina app target's `IPHONEOS_DEPLOYMENT_TARGET` is 17.6 (despite the "iOS 18+" doc note)

Every one of the **8** `IPHONEOS_DEPLOYMENT_TARGET` entries in `Patina.xcodeproj/project.pbxproj`
reads **26.0**. The comment is stale and it is load-bearing for a floor decision. Small, but it is
the kind of stale fact that S2's floor-bump discussion would have tripped over.

### S3-e. Weak user value — the sharpest objection
**Confidence: high · Severity: high**

Adopt the provenance grammar "in the Patina client app" — to badge *what*? The client app's
machine-suggested surface is (a) the companion chat, which is conversation, not field values, and
(b) recommendations, which **return zero rows in production** (C4). S3 would ship a provenance
vocabulary for values that do not exist, in an app whose product surfaces are empty, for a user
(the homeowner) whom the vision document explicitly says is **not Patina's customer**.

### S3-f. The "Engine is resting" half is a doc change, and there is no iOS surface that could say it
**Confidence: high · Severity: medium**

The copy law is already enforced where it matters — server-side, in `aesthete-ask/index.ts`, on the
degradation path. Meanwhile a grep for `aesthete` across `apps/mobile/` returns only test files and
a doc comment: **neither iOS app calls the engine.** There is no client-side failure state to word,
because there is no client-side call. "Codify it family-wide" is a sentence in a style guide, and
should be shipped as one — for free, today, in the brand-voice skill — not as a third of a
quarter's shortlist.

### S3-g. S3 promotes a pattern the vision document refuses, by name
**Confidence: high · Severity: medium-high**

The strategy constraints Fable itself cites list the explicitly refused UI: *"tab/zone/dashboard
layouts, shadows, red/green status, badges."*

`ProvenanceBadge` is a badge — it is named one. And `CaptureColor.provenance(source)` is a
colour-coded status system; `CaptureEnums.swift:43` documents the palette as
"verdigris = value/success, brass = recognised data, rust = friction/edge." That is a
three-colour status encoding. The component may well have earned a local exception inside Field's
recognition sheets. **Promoting it into PatinaDesignKit makes the refused pattern family law**, in
the shared package, for an app (the client) whose whole design brief is typography-first.

Fable cites the vision document as a constraint on the shortlist and then proposes the one item that
collides with it head-on.

### S3 — five axes

- **Weak user value:** S3-e. No user is on the other end.
- **Unsupported API assumptions:** none of note — this item makes no API claims, which is the one
  thing in its favour. (S3-d is a stale-fact finding, not an API one.)
- **Excessive complexity:** S3-b and S3-c — a cross-package refactor of three coupled types, against
  a generated Xcode project, to move a chip.
- **Forced convergence:** this is the textbook case. Two apps with different users (studio-side
  trades vs. homeowner), different design briefs, and different data. Fable's own evidence (#11)
  shows the *token* layer is converging deliberately and correctly; S3 extends that to the *domain*
  layer, which is where deliberate convergence turns into coupling.
- **Conventional alternative:** write the copy law into the brand-voice skill (one paragraph), and
  fix `accept()` in Field (a few lines). That is the whole delivered value of S3, at ~1% of the cost,
  and it does not touch a shared package.

---

## Part 4 — The questions the brief asked directly

**Is the "one plumbing / one model / one design-system" shape a strategy?** No. See C1. It is a
balanced engineering portfolio presented as a product bet, and the balance is the tell: a real
strategy would concentrate, and the vision document tells you where — the Document.

**Should finding #6 (no push in Field) displace an item?** Yes — it should displace S3. Confirmed
first-hand (C6). It is the only candidate that adds a capability the app *cannot do at all*, for the
user with the least alternative, and it costs an entitlement, a `UNUserNotificationCenter`
registration, and a token upload into a rail Patina already uses (`device_push_tokens`). It needs a
content decision — *what does the studio send to someone on a roof?* — and that decision is a
product conversation with Leah, which is the conversation the company already owes.

**Does finding #7 mean the real problem is shipping what's built?** Yes, and it is the most
important sentence in the brief. See C5. A complete, tested, ACL-hardened, deployed Claude
PDF→FF&E extractor with zero callers is not an anomaly — it is a pattern this shortlist repeats: an
empty `CaptureWidgets/`, an empty `CaptureShareExtension/`, a Live Activity controller that never
requests, an `onSetHardwareEntry` that goes nowhere, an Aesthete Engine no phone can reach, a
catalogue with one product. **Field's own recognition pipeline is the seventh instance of the same
disease, and S2 proposes to treat it by building an eighth thing.**

**Is the client app's near-zero coverage defensible?** Partly — right answer, absent reasoning, and
the reasoning that justifies it condemns the rest of the list. See the structured verdict.

**Do the "AI" refusal and "not a consumer product in its own right" undercut the proposals?** Yes,
asymmetrically:
- The **"AI" refusal** does not block S2 technically — you can ship an on-device model and never say
  the word. But it exposes the strategic hollowness: "Designer-Taught Intelligence" is a *claim
  about provenance of the intelligence*, and Apple's model is taught by Apple. S2 makes the product
  term false in the one place a designer would notice. The conventional alternative in S2-e —
  growing the table from recorded `.edited` corrections — makes it *true*.
- **"Not a consumer product in its own right"** is fatal to S3's client-app half (S3-e): you would be
  building review/correct/approve UX for a marketing and qualification instrument.
- Neither undercuts S1, which is why S1 is the only survivor.

**The risk of confident wrong values.** See S2-b, S2-c, S2-e. Quantified: `@Generable` guarantees
structure, not values, at a documented 0.69–0.83 value accuracy; the fields S2 adds are SKU and
price; and `accept()` converts them to `.manual` — "typed by the designer" — on one bulk tap,
destroying the trail. What it costs a designer who trusts it: a purchase order for the wrong piece,
against a client-approved budget, on the revenue stream the company calls its first dollar, with no
way to find the sibling errors afterward.

---

## Part 5 — What I would ship, and what I would run first

**My top three:**

1. **Push notifications in Patina Field.** The only proposal that adds a capability the app does not
   have, for the user furthest from a desk. Entitlement + `UNUserNotificationCenter` + token upload
   onto the rail Patina already uses. Gate it on a five-minute product conversation about what the
   studio would actually send.
2. **Give the FF&E extractor a front door — then point Field's camera at it.** Ship a caller for
   `project-ffe-document-extract` in the designer portal (surface #1, the Document, the margin
   stream) behind a per-row confirmation gate. Then extend the *same server-side extractor* to
   accept a captured tag image alongside a PDF, and have Field call it. That is a strictly better S2:
   no Xcode 27, no CI bump, no floor bump, no Apple Intelligence gate, works on every iPhone Field
   supports today, uses the model the company already pays for, keeps the intelligence server-side
   where the company's actual asset lives, and lands the result in the Document instead of a phone.
3. **S1, halved and resequenced** — the rewrite in Part 1: stop the two lies
   (`onSetHardwareEntry`, `hardwareEntry` default), add `NSSupportsLiveActivities` and verify the
   activity actually requests, and only then cost the widget extension as its own piece of work.

**The single smallest experiment to run first**, and the criterion:

> Add one flag-gated route in the designer portal that posts a PDF to the already-deployed
> `project-ffe-document-extract` and renders the staged rows for per-row confirmation — no commit
> path, no new model, no iOS work. Run it against **three real Middle West vendor PDFs** that have
> been hand-keyed into a gold set first.
>
> **Criterion:** field-level exact-match precision on the gold set — **≥95% on SKU and on price,
> ≥90% on maker** — measured before any row may be committed without per-row confirmation.

Why this one: it costs a single route; it uses only things that already exist and are already
tested; it puts the work on surface #1; and it answers S2's central question as a by-product. If a
frontier model reading a full, clean vendor PDF cannot clear 95% on SKU and price, then Apple's ~3B
on-device model reading a phone photo of a creased tag on a job site certainly cannot — and the
company learns that for the price of one route, instead of an SDK upgrade, a CI runner-image bump, a
deployment-floor cut, a new extension target and a permanent second code path.

If it *does* clear the bar, the company has shipped a thing it already owned, on the surface it says
matters most, and has earned the right to ask whether the same job can move onto the phone.
