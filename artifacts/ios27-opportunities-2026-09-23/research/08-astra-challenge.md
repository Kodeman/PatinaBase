# Astra (GPT-6) — adversarial challenge of the iOS 27 shortlist

Independent five-axis challenge, 2026-09-23. Returned as structured output by the
`astra:challenge` agent in workflow `wf_1b4f23cf-9e5`; transcribed here verbatim so the
deck's cited sources are reproducible.

## Biggest risk

The shortlist mistakes API availability and typed output for a trustworthy workflow. S2’s image Attachment, OCRTool and BarcodeReaderTool are iOS 27 APIs, not iOS 26 APIs; raising Field’s minimum to 26 would exclude users without making the proposed implementation available to all remaining users. More seriously, a well-formed generated SKU, trade price or material can still be false. Copying it into a purchasing record behind a dashed chip does not make it safe. Keep the iOS 18 install floor, availability-gate optional intelligence, and preserve evidence and explicit confirmation before authoritative writes. This review checked source and Apple documentation; it did not compile or device-test an implementation.

## Coverage critique

The numerical balance—two Field opportunities and one shared opportunity—is defensible. Equal coverage of two apps would be arbitrary, and Field directly serves the paying studio. But this particular coverage is a product-prioritization failure: it selects a platform repair, a speculative model replacement and a component migration without testing their contribution to The Document or the client’s agreed direction.

The canonical strategy ranks The Document first and calls the Engine the long-term thesis, explicitly not the wedge. The client app deserves scrutiny as the studio-owned front door, not another independent shopping or conversation product. Its source already exposes decisions and shared documents, but its shipped SwiftData schema contains neither, and both list screens can fall back to retry-only states on an empty load. Reliable access to the last shared direction is a stronger client opportunity than importing Field’s badge. Relevant sources are /Users/kody/Code/patina-merged/apps/mobile/Patina/Patina/Core/Persistence/PatinaSchema.swift, /Users/kody/Code/patina-merged/apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionListView.swift and /Users/kody/Code/patina-merged/apps/mobile/Patina/Patina/Features/Documents/DocumentListView.swift. This supports a scoped read/cache opportunity, not a claim that every client workflow is broken.

The missing mobile Document surface is not permission to rebuild the entire portal natively. Carry the next authoritative document or decision, its revision, and the return path to the same record. Keep designer-only purchasing facts out of the homeowner surface. Do not use a new chat interface to regenerate what the designer already approved.

The dormant PDF extractor beats S2 and S3 as the first validation target. Missing Field push is also a stronger candidate than shared badge work, but absence of APNs is not itself evidence of missed work: identify one actual assigned request or changed instruction that Leah currently misses. A narrow, permissioned, deduplicated notification linking to that record is useful; a generic notification center or engagement campaign is not. Push delivery must never become the source of truth or substitute for an in-app pending-work view, and any external-send workflow remains subject to the project’s approval rules.

Mobile access to the existing Aesthete Engine deserves evaluation before a second independent recommendation engine. However, generic visual classification is not designer-taught taste, and opening unrestricted furniture discovery to homeowners could undermine the agreed direction. Likewise, neither an App Group nor Spotlight supplies cross-app semantic retrieval; retain explicit authorized data transfer rather than inventing a shared index.

Sources: [Strategy file](/Users/kody/Code/patina-merged/docs/vision/VISION.md); [Apple controls](https://developer.apple.com/documentation/widgetkit/creating-controls-to-perform-actions-across-the-system); [Locked-camera capture](https://developer.apple.com/documentation/lockedcameracapture/creating-a-camera-experience-for-the-lock-screen); [Live Activities](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities); [OCRTool](https://developer.apple.com/documentation/vision/ocrtool); [BarcodeReaderTool](https://developer.apple.com/documentation/vision/barcodereadertool); [Attachment](https://developer.apple.com/documentation/foundationmodels/attachment); [Guided generation](https://developer.apple.com/documentation/foundationmodels/generating-swift-data-structures-with-guided-generation); [Model availability](https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel); [Apple Intelligence device requirements](https://support.apple.com/en-us/121115).

## The missing opportunity

Make the existing PDF-to-FF&E pipeline reachable from the studio’s actual document handoff. A designer receiving a vendor PDF on her phone should be able to select the project, submit the document, and finish a source-linked review in The Document instead of retyping the schedule. This directly serves delegation, subscription value and furniture procurement, without an Apple Intelligence hardware gate. The endpoint at /Users/kody/Code/patina-merged/supabase/functions/project-ffe-document-extract/index.ts already authenticates the caller, verifies the uploaded source manifest/hash, invokes extraction, validates the result and calls stage_project_ffe_document_extraction. Import commit machinery exists separately in /Users/kody/Code/patina-merged/supabase/migrations/00435_ffe_ga_rpc_boundaries.sql and /Users/kody/Code/patina-merged/supabase/migrations/00439_ffe_release_command_hardening.sql. My search found no endpoint callers in apps or packages. Important correction: the endpoint stages a batch; it does not itself commit approved FF&E. Source completeness is not evidence that deployment, credentials, current ACLs or operational accuracy have been verified. Start with the existing service and review boundary, not another extractor or a native Document clone. This is model-backed server processing, not a non-AI alternative; the conventional wins are the upload, project selection, review and reuse of existing infrastructure.

## Astra’s recommended shortlist

- 1. The vendor PDF reaches The Document. Validate and expose the existing extraction-to-reviewed-import path; keep one canonical project record and require designer confirmation. Begin with a reachable upload/review flow, then add mobile sharing only if the observed handoff requires it.
- 2. S1, narrowed to honest capture entry. Retain iOS 18; ship one foreground capture intent and one control with accurate user setup guidance. Remove the unsupported no-unlock promise. Treat Live Activity rendering as a separate, measured sync-reassurance slice rather than bundling it into the entry experiment.
- 3. Patina client: the agreed direction remains readable. Surface the existing project-linked shared record and next requested decision, with a user-scoped last-fetched read-only cache, visible freshness and a route back to the authoritative record. Revalidate online before consequential approval; no new shopping feed, chatbot or designer-only data.

## First experiment

Run one paired, non-production test with Leah using one representative vendor PDF containing about ten FF&E rows. Time manual preparation of a correct draft against the existing extractor plus Leah’s source-by-source review and corrections; include upload, waiting and correction time, not just inference time. Counterbalance comparable row groups to reduce familiarity bias. Pass only if reviewed-draft preparation is at least 30% faster, every accepted row is traceable to the PDF, and there are zero incorrect or unsupported accepted maker/SKU/price/currency values. Preserve unknowns rather than filling them. No automatic commit, production mutation or new mobile UI is required. One PDF establishes whether to run a broader trial, not production accuracy.

## Verdict per item (S1 / S2 / S3)

### S1 — **KEEP-WITH-CHANGES**

**weakUserValue**

Medium confidence / medium severity: faster capture is plausibly valuable and directly supports the strategy’s under-ten-second capture promise. Fixing a dead onboarding action is also necessary honesty. But onboarding copy is evidence of a promise, not evidence of demand for three separate integrations. Entry speed and observing background sync solve different jobs and need separate success measures. A Lock Screen upload counter is low value if captures still require later re-entry or never arrive in The Document.

**unsupportedApiAssumptions**

High confidence / high severity: Fable is right that App Intents and ControlWidget can support Action-button entry. The mechanisms are distinct: a person can assign a Shortcut invoking an exposed intent in Settings > Action Button > Shortcut, or on iOS 18+ choose the app’s published control through the Controls route. The same control can separately be installed in Control Center or on the Lock Screen. The app does not assign the hardware button, install controls or guarantee setup on the person’s behalf. An OpenIntent-based control needs app/extension target membership and actual foreground navigation; declaring CaptureSpecimenIntent alone is insufficient. No schema is required for this path. ControlWidget dates to iOS 18, not 27.

High confidence / high severity: the actual ReadyScreen says 'capture without even unlocking to the app.' An ordinary intent opening Field does not implement locked-device camera capture. Apple’s LockedCameraCapture path needs a separate capture extension and CameraCaptureIntent. That extension cannot use the network or read/write the App Group container, so Field’s existing shared-store workflow cannot simply run there. The smallest version must correct that copy, not quietly claim the promise fulfilled. The Pro/non-Pro distinction is also wrong: non-Pro iPhone 16 models have an Action button, while older Pro models do not.

High confidence / medium severity: a widget-extension target is necessary but not sufficient for Live Activities. It needs a registered ActivityConfiguration using the shared attributes, required Lock Screen and Dynamic Island presentations, app support configuration, signing/embedding and lifecycle handling. Apple explicitly requires all iPhone presentations, so 'Lock Screen only' is not the complete documented implementation. The current controller attempts Activity.request, catches failures silently, and always uses staleDate:nil; 'starts a Live Activity today' overstates verified runtime behavior. A Live Activity is not a background-upload entitlement and cannot fetch its own network state. Local ActivityKit updates do not require adding Field’s missing conventional notification rail.

High confidence / medium severity: existing microphone/speech usage-description strings are not permission grants. They do not establish that a new voice path produces no authorization prompt; a button-to-camera intent should not require speech at all.

Sources: https://developer.apple.com/videos/play/wwdc2024/10157/ ; https://developer.apple.com/documentation/widgetkit/creating-controls-to-perform-actions-across-the-system ; https://support.apple.com/guide/shortcuts/run-shortcuts-with-the-action-button-apdfea15680b/ios ; https://developer.apple.com/documentation/lockedcameracapture/creating-a-camera-experience-for-the-lock-screen ; https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities .

**excessiveComplexity**

High confidence / medium severity: S1 hides two products inside one extension task. The generated project requires changes in /Users/kody/Code/patina-merged/apps/mobile/Capture/scripts/generate_project.rb, plus target membership, embedding and provisioning; creating an empty directory is not integration. Fully honoring locked capture adds a third extension and a constrained import lifecycle. Do not take that on merely to preserve inaccurate onboarding copy. Leave the deployment floor at 18 and defer Live Activity UI until sync visibility is shown to be a real problem.

**unnecessaryDivergence**

High confidence / low severity: Field having an Action-button capture entry while Patina does not is appropriate workflow divergence. Share design tokens and navigation conventions where useful, not every system affordance. Do not turn the homeowner app into a specimen-capture tool for symmetry.

**conventionalAlternative**

High confidence / medium severity: immediately remove or correct the dead Set up promise, make the ordinary capture landing screen fast, and provide accurate manual setup instructions. For sync, an in-app queue with last confirmed arrival, retry and explicit locally-saved state may beat a Live Activity. If a lock-screen presentation is justified, it must show stale/failed state honestly and avoid exposing sensitive project or specimen titles while locked.

**rewrite**

Ship a user-configured iOS 18 capture control backed by a foreground intent that opens Field’s existing capture flow. Explain the separate Controls and Shortcuts setup routes without promising automatic assignment or capture while locked. Measure time to a durably saved capture. Separately decide whether a fully configured, privacy-conscious Live Activity materially reduces sync uncertainty.

### S2 — **DEMOTE**

**weakUserValue**

High confidence / high severity: a photo does not contain a trustworthy maker, SKU, trade price, currency, source URL or voice transcript merely because Specimen has corresponding properties. Generating the full persistence shape invites plausible fabrication and unnecessary review. Generic material/style inference is not the studio’s designer-taught taste. The useful job is narrower: read visible tag facts and reduce corrections without losing the original evidence.

High confidence / medium severity: the existing N5 SmartGuessSheet calls guess(image:ocr:codes:) with empty OCR and code arrays at line 209 of /Users/kody/Code/patina-merged/apps/mobile/Capture/Capture/Features/Recognition/SmartGuess/SmartGuessSheet.swift. Its consumer only handles a small suggestion subset. At least this route’s weak material/color output has a missing-input problem before it has a model-quality problem. Other callers may differ; this is not a claim that all recognition paths discard OCR.

**unsupportedApiAssumptions**

High confidence / high severity: OCRTool and BarcodeReaderTool are real Apple API symbols. Apple’s DocC declarations place them in Vision with FoundationModels integration, introduced in iOS 27. Attachment is also introduced in iOS 27. Foundation Models text generation and @Generable date to iOS 26. Therefore the proposed 'requires bumping to 26' is both insufficient for its image path and unnecessary as an app-wide requirement: use a new SDK and availability-gated implementation while retaining iOS 18 fallback behavior.

Apple’s documented supply mechanism is an explicit tools array, for example LanguageModelSession(tools: [OCRTool(), BarcodeReaderTool()]), with FoundationModels and Vision imported. Label image attachments, such as Attachment(image).label("tag"), so image-based tools can identify the image. OCRTool returns recognized text; BarcodeReaderTool returns decoded contents and symbologies, not catalog identity, product truth or prices. Offering tools permits model calls; it does not guarantee they will be called. Both tool documentation pages explicitly say they are unavailable in Simulator.

High confidence / high severity: @Generable constrains output structure, not factual correctness. Strings, optionals, arrays and bounded enums can represent a draft, but schema conformance cannot validate that $399 is retail rather than trade, that a scanned URL identifies this product, or that veneer is solid wood. Use deterministic currency/minor-unit parsing, allowed categories and nullable unknowns; do not generate ownership, IDs, lifecycle fields or a transcript from a still photo. Expected failure handling includes unavailable assets, unsupported language, context overflow, refusal/guardrail failures, decoding failures, cancellation and tool failures. Image tokens and the full output schema consume context. Do not present model-produced confidence numbers as calibrated probabilities.

High confidence / high severity: 'matching SwiftData fields' is not a drop-in service contract. /Users/kody/Code/patina-merged/apps/mobile/Capture/CaptureKit/CaptureKit/Recognition/RecognitionServices.swift defines SmartGuessService returning SmartGuess with FieldSuggestion values and confidence; it does not return SpecimenDraft. The recognition UI, validation and write-precedence rules would need deliberate adaptation.

High confidence / medium severity: hardware support is iPhone 15 Pro/Pro Max, iPhone 16 models and later, and iPhone Air—not all iPhone 15s and not all phones able to install iOS 26/27. Runtime availability also depends on Apple Intelligence being enabled, model readiness and supported language/region. An AI-capable phone on iOS 26 still lacks the proposed iOS 27 image APIs. Do not transfer Siri AI’s separate English/EU restrictions to all Foundation Models use. No user-device distribution was supplied, so no adoption percentage or acceptable exclusion rate can honestly be calculated.

Sources: https://developer.apple.com/documentation/vision/ocrtool ; https://developer.apple.com/documentation/vision/barcodereadertool ; https://developer.apple.com/documentation/foundationmodels/attachment ; https://developer.apple.com/videos/play/wwdc2026/237/ ; https://developer.apple.com/documentation/foundationmodels/generating-swift-data-structures-with-guided-generation ; https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel ; https://support.apple.com/en-us/121115 .

**excessiveComplexity**

High confidence / high severity: raising the install floor is disproportionate for optional enrichment. It strands iOS 18 users and older hardware without eliminating runtime fallback on newer devices. A full-field model also enlarges prompts, latency, correction burden and test coverage unnecessarily. Preserve the current protocol seam and local save path. Trial a small evidence-backed tag draft on a physical eligible iOS 27 device only after repairing the existing OCR handoff and establishing a baseline. Do not add PCC, third-party provider switching or a second taste engine to rescue an unproven feature.

**unnecessaryDivergence**

High confidence / medium severity: local capture assistance in Field and server-backed client services can legitimately differ. What must not diverge is the meaning of confirmed maker/SKU/material data in the shared project record. FoundationModels imports belong in the app’s service adapter, not SDK-free CaptureKit or PatinaDesignKit. Keep the same human confirmation contract on eligible and ineligible devices; capability differences must not create different definitions of truth.

**conventionalAlternative**

High confidence / high severity: run Vision OCR and barcode recognition deterministically, show the relevant crop/text beside ordinary fields, carry scanned identifiers without guessing a catalog match, and let the designer confirm. Preserve missing fields as missing. First supply the OCR/code observations the existing service already accepts. A schema-constrained text extractor can later be benchmarked on OCR text without initially requiring multimodal inference. For vendor PDFs, expose the existing server extractor and review flow rather than building a second implementation on a narrower device population. Plain capture plus a correct short form beats silently generated purchasing data.

### S3 — **DEMOTE**

**weakUserValue**

High confidence / high severity: a shared badge is not a review/correct/approve/recover workflow. It does not preserve source evidence, prevent overwrites, distinguish confirmation from origin, undo a commit, or explain failed sync. The existing grammar is not safe to canonize unchanged: SmartGuessSheet promotes an accepted unchanged guess to .manual, whose badge reads 'typed'; correction becomes .edited and also discards the original source in that field. styleTags has no per-field provenance at all. Those facts contradict the claim that every generated Specimen field can simply carry the existing grammar. Evidence: /Users/kody/Code/patina-merged/apps/mobile/Capture/Capture/Features/Recognition/SmartGuess/SmartGuessSheet.swift and /Users/kody/Code/patina-merged/apps/mobile/Capture/CaptureKit/CaptureKit/Design/ProvenanceBadge.swift.

**unsupportedApiAssumptions**

High confidence / medium severity: no Apple API validates this product claim. The error is architectural and semantic. ProvenanceSource is a persisted Codable raw-value enum in /Users/kody/Code/patina-merged/apps/mobile/Capture/CaptureKit/CaptureKit/Domain/CaptureEnums.swift; it is not merely a visual token. ProvenanceBadge depends on CaptureType and CaptureColor. Moving it unchanged into PatinaDesignKit is not mechanically independent of CaptureKit. A rendering adapter could be shared without moving domain ownership or importing FoundationModels. Neither type-safe generation nor a badge supplies approval semantics.

**excessiveComplexity**

High confidence / medium severity: a family-wide migration before identifying the client app’s exact unconfirmed-value workflow is abstraction without demonstrated payoff. The useful contract is small: preserve origin and supporting evidence, distinguish suggested from human-confirmed, keep corrections attributable, and offer recovery at the failing operation. Implement that at the first concrete use site rather than building a universal provenance framework. Do not migrate existing SwiftData records or rename raw values as incidental design-system cleanup.

**unnecessaryDivergence**

High confidence / high severity: this is forced visual convergence in the wrong place. The canonical /Users/kody/Code/patina-merged/docs/vision/VISION.md explicitly refuses badges; Field’s existing chip is a shipped exception/drift, not authority to spread it. Seek the necessary design ruling rather than resolving that conflict in code. A designer reviewing OCR evidence and a homeowner reading an approved direction need different information density and permissions. Shared semantics can use contextual typography instead of identical chips.

High confidence / high severity: 'the Engine is resting' is a specific Engine fallback, not a family-wide failure line. Field currently uses no Engine for upload or camera operation. Calling an expired session, denied camera permission, missing local model or failed upload a resting Engine is misleading and suppresses the recovery action. Retain the no-'AI' product language, but use truthful operation-specific recovery copy; do not mistake one endpoint’s copy rule for a universal error policy.

**conventionalAlternative**

High confidence / high severity: show a source photo or document excerpt, an editable suggested value and an explicit confirm action. Keep origin separately from review state so accepting a guess does not turn it into 'typed'. After saving, distinguish 'saved on this phone' from server-confirmed arrival and offer retry where needed. In the client app, show what the designer actually shared, its revision and the requested decision—not the studio’s internal extraction uncertainty or trade-price metadata. This beats spending a shortlist slot on moving an enum and a chip.
