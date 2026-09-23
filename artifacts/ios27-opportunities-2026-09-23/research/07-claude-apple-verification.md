# Independent Apple Platform Verification — iOS 27

**Research date:** 2026-09-23
**Researcher:** Claude (Opus 5), independent verification pass
**Method:** Live WebSearch + WebFetch against `developer.apple.com`, `apple.com`, `support.apple.com`. Apple's DocC pages are client-rendered SPAs, so symbol-level facts were pulled from the underlying JSON at `https://developer.apple.com/tutorials/data/documentation/<path>.json`, which is the same payload the docs site renders.
**Standing rule applied:** nothing in this document is written from training memory. My knowledge cutoff (May 2026) predates WWDC26 (June 8, 2026) and the iOS 27 release (September 14, 2026) entirely. Every claim below is either tied to a fetched official URL or explicitly marked UNVERIFIED.

---

## 1. iOS 27 status — CONFIRMED SHIPPING

**iOS 27 exists, is generally available, and is the current shipping version as of 2026-09-23.**

| Fact | Value | Source |
|---|---|---|
| Current shipping iOS | **iOS 27.0, build 24A437** | [developer.apple.com/news/releases](https://developer.apple.com/news/releases/) |
| Public release date | **September 14, 2026** | [developer.apple.com/news/releases](https://developer.apple.com/news/releases/) · [Apple Newsroom](https://www.apple.com/newsroom/2026/09/major-updates-for-apples-software-platforms-are-now-available/) |
| Announced at | **WWDC26, June 8, 2026** | WWDC26 guides on developer.apple.com ([iOS guide](https://developer.apple.com/wwdc26/guides/ios/)) |
| Release-date announcement event | September 9, 2026 iPhone event (iPhone 18 Pro / iPhone 18 Pro Max / iPhone Duo) | [Apple Newsroom](https://www.apple.com/newsroom/2026/09/apple-debuts-iphone-18-pro-and-iphone-18-pro-max/) |
| Toolchain | **Xcode 27 (27A266a), released Sept 14, 2026** | [developer.apple.com/news/releases](https://developer.apple.com/news/releases/) |
| Xcode 27 contents | **Swift 6.4**; SDKs for iOS 27, iPadOS 27, tvOS 27, watchOS 27, macOS 27, visionOS 27. Requires a Mac running **macOS Tahoe 26.6 or later**. On-device debugging for iOS 17+. | [Xcode 27 Release Notes](https://developer.apple.com/documentation/Xcode-Release-Notes/xcode-27-release-notes) |
| Companion releases (same day) | iPadOS 27.0 (24A437), macOS 27.0 (26A428), tvOS 27.0 (24J361), visionOS 27.0 (24M362), watchOS 27.0 (24R364) | [developer.apple.com/news/releases](https://developer.apple.com/news/releases/) |

**Version numbering is confirmed** — Apple continued the year-ahead numbering scheme it adopted with the 26 releases. iOS 27 is the successor to iOS 26. Note that macOS 27 carries the marketing name **"Golden Gate"** (per support.apple.com/en-us/121115, which refers to "macOS 27 Golden Gate").

### Point releases in flight (as of 2026-09-23)

- **iOS 27.1** — **not yet released.** Per Apple Developer News, iOS 27.1 ships when **iPhone Duo becomes available on October 23, 2026**, with features purpose-built for the foldable. **Xcode 27.1 beta (27A9269)** was posted September 18, 2026, and includes an SDK + simulator supporting the new poses and orientations.
- **iOS 27.2 beta 2 (24B5089g)** — posted September 21, 2026. **Xcode 27.2 beta (27B5019j)** posted September 16, 2026. Apple currently recommends building and testing with Xcode 27.2 beta for 27.2 work.
- Oddity worth noting: Apple's releases page lists the Xcode 27.2 beta (Sept 16) *before* the Xcode 27.1 beta (Sept 18). Both are real; the 27.1 line is device-specific.

### App Store submission requirements — IMPORTANT CORRECTION

Apple's [Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/) page, fetched 2026-09-23, shows **no iOS 27 SDK requirement**, upcoming or in effect. The currently-enforced rules are:

- **Since April 28, 2026** — "Apps uploaded to App Store Connect must be built with Xcode 26 or later using an SDK for iOS 26, iPadOS 26, tvOS 26, visionOS 26, or watchOS 26."
- **Since September 9, 2026** — "iOS and iPadOS apps uploaded to App Store Connect must target iOS 13 or later."

A search snippet surfaced a claim that the iOS 27 SDK is already required for submission. **I could not verify that against the Upcoming Requirements page and treat it as false or at best premature.** Building with Xcode 26 / iOS 26 SDK remains sufficient for App Store submission today. Practically: adopting iOS 27 APIs is an opt-in choice right now, not a compliance deadline.

---

## 2. Device, language, and region gates (the real constraint layer)

Almost every interesting iOS 27 capability is gated on **Apple Intelligence eligibility**, not just on iOS 27.

**Apple Intelligence–capable devices** (from [apple.com/apple-intelligence](https://www.apple.com/apple-intelligence/) and [support.apple.com/en-us/121115](https://support.apple.com/en-us/121115)):

- iPhone: iPhone Duo, iPhone 18 Pro / 18 Pro Max (A20 Pro); iPhone 17 Pro / 17 Pro Max, iPhone Air (A19 Pro); iPhone 17, 17e (A19); iPhone 16 Pro Max / 16 Pro (A18 Pro), 16 Plus / 16 / 16e (A18); iPhone 15 Pro / 15 Pro Max (A17 Pro).
- iPad: iPad Pro (M1 and later), iPad Air (M1 and later), iPad mini (A17 Pro).
- Mac: MacBook Neo (A18 Pro); MacBook Air / MacBook Pro / iMac / Mac mini (M1 and later); Mac Studio (M1 Max and later); Mac Pro (M2 Ultra).
- Apple Vision Pro (M2 and later). Apple Watch Series 9 / Ultra 2 / SE 3 and later when paired with an eligible iPhone.

**Storage cost:** "Up to 14 GB of storage on device" on the top tier (iPhone 17 Pro/Pro Max, iPhone Air, certain M4 iPads, M3+ Macs with 12 GB+ unified memory, Vision Pro M5); "up to 8 GB" on other eligible models; "up to 1.5 GB" on Apple Watch.

**Supported languages (iOS/iPadOS/macOS 27):** English, Danish, Dutch, French, German, Italian, Norwegian, Portuguese, Spanish, Swedish, Turkish, Vietnamese, Chinese (Simplified and Traditional), Japanese, Korean. Both the **device language and the Siri language** must be set to a supported language.

**Siri AI is narrower and is beta.** Per apple.com: Siri AI is "Available in English to start," is labeled **beta** in the 27 releases, and "will not be initially available in the EU on iOS, iPadOS, and watchOS." Apple Newsroom adds French, Japanese, Korean, Portuguese, and Spanish "coming in October," and states Siri AI plus other new Apple Intelligence features are unavailable in China pending regulatory work.

**China:** Apple Intelligence "will not currently work for supported devices purchased in China mainland," and is also blocked for devices bought elsewhere if the user is in mainland China with a mainland-China Apple Account region.

**Server-backed features carry daily usage limits** that "may vary by feature, request complexity, system demand, system policies, and other factors," with paid expanded access promised "in the future."

**Narrower hardware tier:** Siri voice customization and the improved Dictation both require iPhone 18 Pro/Pro Max, iPhone Duo, iPhone 17 Pro/Pro Max, iPhone Air; iPads with **M4 and later and at least 12 GB unified memory**; Macs with **M3 and later and at least 12 GB unified memory**.

---

## 3. Capability-by-capability verification

### 3.1 Foundation Models framework — the biggest iOS 27 change

Framework availability: **iOS 26.0+** (module level), watchOS 27.0. Requires an Apple Intelligence–capable device for Apple's own models.
Doc: https://developer.apple.com/documentation/FoundationModels

**NEW IN iOS 27 (confirmed on [Foundation Models updates](https://developer.apple.com/documentation/updates/foundationmodels), June 2026 section):**

| Capability | Key symbols | Notes |
|---|---|---|
| **Any LLM provider** behind one API | `LanguageModel` (protocol), `LanguageModelCapabilities`, `LanguageModelExecutor`, `LanguageModelExecutorGenerationChannel`, `LanguageModelExecutorGenerationRequest` | "Adopt the `LanguageModel` protocol to use any large language model — server or on-device — with the Foundation Models framework." Existing `LanguageModelSession` code works unchanged against a conforming provider. |
| **Private Cloud Compute model** | `PrivateCloudComputeLanguageModel`, entitlement `com.apple.developer.private-cloud-compute` | iOS 27 / macOS 27 / watchOS 27 / visionOS 27 or later. **32K context** vs 4K on-device. Reasoning levels `.light` / `.moderate` / `.deep` via `ContextOptions(reasoningLevel:)`. Requires network. Quota surface: `model.quotaUsage.isLimitReached`, `.status`, `.limitIncreaseSuggestion`, `QuotaUsage.resetDate`, error `PrivateCloudComputeLanguageModel.Error.quotaLimitReached(_:)`. Xcode scheme option "Simulated Apple Foundation Models Availability" simulates quota states. |
| **Multimodal image prompting** | `Attachment`, `Attachment(_:orientation:)`, `Attachment.label(_:)`, `ImageAttachmentContent`, `ImageReference`, `ImageReference.resolved(in:)` | Accepts `CGImage`, `CIImage`, `CVPixelBuffer`, and image URLs. Framework does scaling/color conversion for you. Doc explicitly recommends on-device first, PCC if more reasoning/context needed. |
| **Vision tools the model can call** | `OCRTool`, `BarcodeReaderTool` (both in the **Vision** framework, under a new "Foundation Models integration" topic) | Passed via `LanguageModelSession(tools: [OCRTool()])`. Runs on-device. |
| **Dynamic Profiles** | `LanguageModelSession.DynamicProfile`, `LanguageModelSession.DynamicProfileModifier`, `LanguageModelSession.Profile`, `DynamicInstructions`, `DynamicInstructionsForEach`, `LanguageModelSession.SessionProperty`, `SessionPropertyKey`, `SessionPropertyValues`, `@SessionPropertyEntry()` | Swap models, tools, and instructions mid-session. Apple frames this as how you build "agents or skills." |
| **Tool-calling control** | `GenerationOptions.ToolCallingMode` | |
| **Better errors** | `LanguageModelError`, `SystemLanguageModel.Error`, `LanguageModelSession.Error` | Three-way split: model-agnostic / on-device-specific / session-misuse. |
| **New on-device model** | `SystemLanguageModel` (class, iOS 26.0+) | The doc names **three model versions**: iOS 26.0–26.3, iOS 26.4, and **iOS 27.0**. Apple explicitly warns: "Because the model changes when a person updates to iOS 27 … test your prompts with the new model to verify your app's behavior." |
| **Open source** | `github.com/apple/foundation-models-utilities`, `github.com/apple/coreai-models` (CoreAILanguageModel), `github.com/ml-explore/mlx-swift-lm` (MLXLanguageModel), `github.com/apple/python-apple-fm-sdk` | The *system model itself is not open sourced* — these are utility packages and provider adapters. |

**Carried over from iOS 26.x (not new in 27):** `@Generable`, `@Guide`, `GenerationSchema`, `DynamicGenerationSchema`, `Tool`, `Instructions`, `Prompt`, `GenerationOptions`, transcripts. `SystemLanguageModel.contextSize` and `SystemLanguageModel.tokenCount(for:)` arrived in **iOS 26.4 (Feb 2026)**.

**Beta symbols** (only two on the whole framework page): `DataAttachmentRepresentable`, `DataEntryRepresentable`.

**PCC eligibility is a hard gate — read this carefully.** From [developer.apple.com/private-cloud-compute](https://developer.apple.com/private-cloud-compute/), verbatim:

> "Access to PCC is available to developers who meet the following criteria: Are enrolled in the App Store Small Business Program. Have fewer than 2 million first-time app downloads from any of their apps on the App Store. Have the Private Cloud Compute entitlement assigned to their account."

> "developers in the App Store Small Business Program with fewer than two million first time App Store downloads will be able to use Apple Foundation Models running on Private Cloud Compute (PCC) with **no cloud API cost**."

> "If any app subsequently exceeds the 2 million first-time downloads threshold, or the developer is no longer enrolled in the App Store Small Business Program, the developer will be notified and **must migrate to an alternative solution within 6 months**."

Testing installs (TestFlight / ad hoc) do **not** count toward the 2M threshold. Request the entitlement at https://developer.apple.com/contact/request/private-cloud-compute/.

**Language handling:** `SystemLanguageModel.supportsLocale(_:)`, `.supportedLanguages`, and `LanguageModelError.unsupportedLanguageOrLocale(_:)`. Apple warns that **guardrails only apply to supported languages** — a short unsupported-language phrase mixed into supported-language text may bypass both unsupported-language detection and safety flagging.

### 3.2 Evaluations framework — NEW

Availability: **iOS 27.0 / iPadOS 27.0 / macOS 27.0 / visionOS 27.0 / watchOS 27.0 / Xcode 27.0**. No beta flags.
Doc: https://developer.apple.com/documentation/Evaluations

Symbols: `Evaluation` (protocol), `ModelSample`, `Loader`, `SampleGenerator` (actor), `Metric`, `Evaluator`, `MetricsAggregator`, `EvaluationResult`, `ResultColumn`, `ModelJudgeEvaluator`, `ModelJudgePrompt`, `ScoreDimension`, `ToolCallEvaluator`, `TrajectoryExpectation`, `ArgumentMatcher`, `EvaluationTrait` (Swift Testing trait), `EvaluationContext`, `EvaluationRunErrors`.

"The framework works with any model available through Foundation Models, including on-device, Private Cloud Compute, and other models." Integrates with Swift Testing via `EvaluationTrait`. This is the sanctioned way to regression-test a prompt across OS model versions.

### 3.3 Core AI framework — NEW

Availability: **27.0 on every platform** (iOS, iPadOS, Mac Catalyst, macOS, tvOS, visionOS, watchOS). No beta flags.
Doc: https://developer.apple.com/documentation/CoreAI

> "Core AI helps you build, run, and deploy AI models in your app. Designed with Apple silicon in mind, Core AI allows your app to use the latest model architectures and inference techniques across the CPU, GPU, and Neural Engine."

Symbols: `AIModel`, `AIModelAsset`, `InferenceFunction`, `InferenceFunctionDescriptor`, `InferenceValue`, `ImageDescriptor`, `ComputeStream`, `NDArray`, `NDArrayDescriptor`, `AIModelCache`, `ComputeUnitKind`, `SpecializationOptions`, `AssetError`.

Entitlement **`com.apple.developer.background-tasks.continued-processing.inference`** ("Background Inference") lets a background task run inference on the Neural Engine. Per the iOS 27 release notes, background Neural Engine access now *requires* this entitlement, and NE memory is attributed to your app process (visible in the Allocations instrument) — a real behavior change for anything doing background ML.

Tooling: Core AI Optimization (`apple.github.io/coreai-optimization`), Core AI PyTorch Extensions (`apple.github.io/coreai-torch`, v0.4.0), `.aimodel` / `.aimodelc` formats, `coreai-build` CLI, Core AI Debugger app, Core AI instrument and debug gauge in Xcode, `github.com/apple/coreai-models`.

Apple explicitly routes non-neural-network models (decision trees, tabular feature engineering) to **Core ML**, which is otherwise unchanged.

### 3.4 App Intents / Siri / App Schemas — EXPANDED

Framework min iOS: **16.0**. Doc: https://developer.apple.com/documentation/AppIntents
Per-release deltas: https://developer.apple.com/documentation/updates/appintents (organized by date, not OS version; **June 2026 = iOS 27**).

**New in June 2026 (iOS 27), with abstracts verbatim from Apple:**

| Symbol | Kind | Apple's abstract |
|---|---|---|
| `SyncableEntity` | protocol | "An interface that indicates your entity has an identifier that's consistent across devices." |
| `OwnershipProvidingEntity` | protocol | "A type that provides the system with ownership and sharing context for an app entity." |
| `EntityOwnership` | struct | "A type that represents the ownership and sharing characteristics of an app entity." |
| `RelevantEntities` | struct | "A type you use to donate your app's songs, albums, artists, and other media items to play during workouts." |
| `IntentValueRepresentation` | struct | "A transfer representation that enables bidirectional conversion between app entities and system intent values." |
| `RunSystemShortcutIntent` | struct | "An app intent you use in widgets to open another app or perform an App Shortcut, custom shortcut, or system action." |
| `LongRunningIntent` + `performBackgroundTask(options:operation:)` + `LongRunningTaskOptions` | protocol/method/struct | Extends an intent's background runtime with progress reporting. |
| `CancellableIntent` + `IntentCancellationReason` | protocol/struct | Graceful cancellation; distinguishes deliberate cancel from timeout. |
| `UndoableIntent` | protocol | "An interface you use to register undoable actions in your app intent code." |
| `IntentModes` + `IntentSystemContext.currentMode` | struct/property | Declare foreground/background/both via `supportedModes`; branch inside `perform()`. |
| `IntentExecutionTargets` | struct | Which process runs the intent: main app, App Intents extension, or widget extension (`allowedExecutionTargets`). |
| `EntityCollection` | struct | Holds identifiers only, resolving full `AppEntity` instances on demand — avoids resolving every identifier during parameter resolution. |
| `AppUnionValue` + `AppUnionValueCasesProviding` | protocols | Union-type Shortcuts parameters with rich picker UI (paired with the `@UnionValue` macro). |
| `IndexedEntityQuery` | protocol | Spotlight reindexing / retrieval by identifier. |
| `AppIntentError.init(description:)` | initializer | Localized failure descriptions; wraps `CustomLocalizedStringResourceConvertible`. |

**App schema domains** (https://developer.apple.com/documentation/appintents/app-schema-domains) — applied via `@AppIntent(schema:)`, `@AppEntity(schema:)`, `@AppEnum(schema:)`:

- *Primary (Apple Intelligence + Siri):* Audio, Calendar, Camera, Clock, Mail, Maps, Messages, Notes, Phone, Photos, Reminders, **System and in-app search**.
- *Single-purpose:* Assistant (Japan-only side-button launch of voice conversational apps), Visual intelligence.
- *Shortcuts-only (NOT surfaced to Siri/Apple Intelligence):* Books, Browser, Files, Journaling, Presentation, Reader, Spreadsheet, Whiteboard, Word processor.

WWDC26 session 240 ("Build intelligent Siri experiences with App Schemas") confirms the mechanics: schema adoption is **enforced at build time** — adopting `sendMessage` without `draftMessage` produces a build error with a Fix-It. `IndexedEntity` puts your entities into the **system semantic index** so Siri can "match based on meaning, not just text." `EntityStringQuery` is the escape hatch for large/server-side/volatile data (full control, no semantic understanding). Apple's stated testing ladder: AppIntentsTesting → Shortcuts → Spotlight → Siri.

**iOS 27 release-notes churn worth knowing:** `calendar.deleteEvents` was **renamed** to `calendar.deleteEvent`. Release notes also name `notes.createNote`, `notes.updateNote`, `notes.appendText`, `reminders.updateReminder`, `@AppEntity(schema: .photos.asset)`, `maps.startNavigation`, `maps.reportIncident`, `phone.startCall`, `system.open`, and `PlaceDescriptorEntity`.

**App Intents Testing** — a separate framework at `/documentation/appintentstesting`, described as validating "your entire integration through real system pathways, without UI automation" (WWDC26 session 295). **Exact minimum OS version: UNVERIFIED** — no availability metadata appeared on the pages I could fetch.

### 3.5 View annotations / onscreen awareness — EARLIER CAPABILITY (guide is misleading)

The WWDC26 iOS guide lists "View Annotations API (new)". **The symbols predate iOS 27.**

- Article "Providing contextual cues to Apple Intelligence and Siri": **iOS 18.2+** (macOS 15.2, Xcode 16.2).
- `AppEntityUIElement`: **iOS 18.4+** (macOS 15.4, visionOS 2.4, watchOS 11.4).
- APIs: SwiftUI `View.appEntityIdentifier(_:)`, `View.appEntityUIElements(_:)`, `View.userActivity(_:element:_:)`; UIKit/AppKit `AppEntityAnnotatable.appEntityIdentifier`, `UIView.appEntityUIElementProvider`, `UIResponder.userActivity`; plus `NSUserActivity.appEntityIdentifier`, `AppEntityUIElementsContext`, `EntityIdentifier`.
- Also conforming to `AppEntityAnnotatable`: User Notifications mutable configs, `MPNowPlayingInfoCenter.nowPlayingInfo` (key `MPNowPlayingInfoPropertyAppEntityIdentifiers`), `AlarmManager.AlarmConfiguration`.

What *is* new in iOS 27 is that **Siri AI actually consumes this context**, not the API surface. Adoption work here is back-deployable to iOS 18.2/18.4.

### 3.6 Core Spotlight — NEW `SpotlightSearchTool` (high value)

Doc: https://developer.apple.com/documentation/corespotlight/spotlightsearchtool

**`SpotlightSearchTool` — iOS 27.0 / iPadOS 27.0 / Mac Catalyst 27.0 / macOS 27.0 / visionOS 27.0. Confirmed at symbol level. Conforms to `FoundationModels.Tool`.**

> "The `SpotlightSearchTool` type implements the protocol that Foundation Models use to run custom tools when resolving prompts… a note-taking app that runs the prompt 'Find my meeting notes from last Tuesday' can use this tool to make its notes available to the model."

Configuration surface: `SpotlightSearchTool.Configuration`, `Guide`, `GuidanceProfile`, `GuidanceLevel` (`.complete`, `.focused(ContentDomain)`, `.dynamic(GuidanceProfile)`), `ContentDomain`, `FormatLevel` (`.compact`), `CoreSpotlightSource(fetchAttributes:)` with `maximumResultCount`, `FileSource`, `ContactResolver` / `ResolvedContact`, `CustomStage` / `SearchPipelineDataType` / `ScoredSearchableItem`, and the async result stream `searchResults` delivering `SearchReply` (with `queryToken`, `stageToken`, `.status == .partial`).

**Critical caveat, verbatim from Apple:**

> "By default, `SpotlightSearchTool` uses the `complete` option which works best with Private Cloud Compute (PCC) models designed for Apple Intelligence."

> "if you configure it to use the on-device language model without providing a `focused(_:)` guide, Spotlight search exceeds the context window of the model and can't return results."

So: **the headline natural-language-search-over-your-own-content feature is tuned for PCC**, which is behind the Small Business Program entitlement. On-device use requires a `focused(_:)` guide and `FormatLevel.compact`.

Also new June 2026: `CSSearchableIndexDescription`. A **July 2026** entry adds the sample "Searching indexed content with natural language."

Semantic search itself — `CSUserQuery` + `CSUserQueryContext.disableSemanticSearch` — is **June 2024 / iOS 18**, not new.

### 3.7 Speech — EXPANDED

Framework min iOS 10.0; the modern API is newer.
- `SpeechAnalyzer` (**actor**), `SpeechTranscriber`, `DictationTranscriber`, `SpeechDetector`, `SpeechModule`, `LocaleDependentSpeechModule`, `AssetInventory`, `AssetInstallationRequest`, `SpeechModels`, `AnalysisContext`, `SFSpeechLanguageModel`, `SFCustomLanguageModelData` — **`SpeechTranscriber` confirmed iOS 26.0+** (also iPadOS/macOS/tvOS/visionOS 26.0). Swift-only; the Objective-C surface exposes only `SFSpeechLanguageModel` family.
- **New June 2026 (iOS 27):** `AssetInputSequenceProvider` (file/asset audio), `CaptureInputSequenceProvider` (microphone / AV capture device), `AnalyzerInputConverter` (converts `AVAudioBuffer` into `AnalyzerInput`). These remove the hand-rolled AVAudioEngine plumbing that iOS 26 required.
- Locale handling: `SpeechTranscriber.supportedLocales` (includes downloadable), `.installedLocales` (present on device), `supportedLocale(equivalentTo:)`, `.isAvailable`. Apple's guidance: "Use the `isAvailable` or `supportedLocales` properties to see if the current device supports the speech-to-text models used by `SpeechTranscriber`. If it does not, consider disabling the feature or using `DictationTranscriber` instead."
- **On-device vs server is never stated explicitly** on the framework or `SpeechTranscriber` pages. The asset-download model (`AssetInventory`, `installedLocales`) strongly implies local execution, and `DictationTranscriber` is described as "compatible with older devices" — but I am marking the processing location **LIKELY on-device, not verified**.
- The iOS 27 release notes list a **Dictation** system feature: "New on-device model — Keyboard settings → Dictation → 'Advanced Dictation Preview'." That is a system setting, not third-party API, and per apple.com footnote 6 it requires the top hardware tier (iPhone 18 Pro/Duo/17 Pro/Air, M4 iPad w/ 12 GB+, M3 Mac w/ 12 GB+).

### 3.8 Vision — document recognition is NOT new in iOS 27

https://developer.apple.com/documentation/updates/vision has **no June 2026 section**. Its newest entry is **June 2025 (iOS 26)**:

- `RecognizeDocumentsRequest` + `DocumentObservation` — "scan a document and recieve detailed information about its structure and content" (typo Apple's). **iOS 26 capability.**
- `DetectLensSmudgeRequest` + `SmudgeObservation` — iOS 26.

What *is* new for iOS 27 in Vision is the **"Foundation Models integration"** topic: `OCRTool` and `BarcodeReaderTool`, which let the language model call Vision itself during a prompt. Those are surfaced in the Foundation Models June 2026 updates, so I treat them as iOS 27 additions — though **their exact per-symbol minimum OS is UNVERIFIED** (the Vision framework landing page carries no availability metadata at all).

Vision also notes text recognition across **26 languages**. Other relevant existing requests: `RecognizeTextRequest`, `DetectBarcodesRequest`, `DetectDocumentSegmentationRequest`, `GenerateImageFeaturePrintRequest` (visual similarity), `ClassifyImageRequest`, `CoreMLRequest`, `DownloadableAssetsRequest`. Normalized coordinates, origin at **lower-left**.

### 3.9 On-device embeddings / semantic search — NOTHING NEW

- **Natural Language** framework: min iOS 12.0; `NLEmbedding` (static word/sentence embeddings, "Finding similarities between pieces of text"), `NLContextualEmbedding` (**iOS 17.0+**, confirmed at symbol level), `NLContextualEmbeddingKey`, `NLScript`, `NLTagger`, `NLTokenizer`, `NLLanguageRecognizer`, `NLModel`. **No symbols introduced at 27.0. No June 2026 updates section exists for this framework.**
- `NLContextualEmbedding` is explicitly on-device: `hasAvailableAssets` ("whether assets are available on-device"), `requestAssets(completionHandler:)` downloads models, `load()`/`unload()` control residency, `dimension`, `maximumSequenceLength`, `languages`, `scripts`. Apple's own note steers semantic-similarity work back to `NLEmbedding`.
- The iOS 27 story for semantic search is **Core Spotlight** (`IndexedEntity` → system semantic index → `SpotlightSearchTool`), not Natural Language.

### 3.10 RoomPlan / ARKit — NO DOCUMENTED iOS 27 CHANGES

- **RoomPlan**: min **iOS 16.0** (iPadOS 16.0, Mac Catalyst 16.0; no native macOS). **No `/documentation/updates/roomplan` page exists** — it is absent from Apple's Updates index, which lists 84 frameworks. No symbol on the framework page carries a 27.0 introduction.
- Hardware, verbatim: "the framework inspects a device's **camera feed and LiDAR readings**"; "Environment scanning relies on a camera, LiDAR, and other sensors that support augmented reality on iOS and iPad OS devices." **LiDAR is required for capture, not for processing** — Mac Catalyst can decode/encode/export `CapturedRoom` / `CapturedStructure`, and "RoomPlan ignores all capture-session-related calls on macOS apps built with Mac Catalyst" (fails silently — guard by platform, don't rely on errors).
- Symbols: `RoomCaptureView`, `RoomCaptureViewDelegate`, `RoomCaptureSession`, `RoomCaptureSessionDelegate`, `CapturedRoom`, `CapturedStructure`, `CapturedRoomData`, `RoomBuilder`, `StructureBuilder`, `CapturedRoom.USDExportOptions`. Swift-only in practice (Obj-C exposes only version constants).
- **ARKit**: `/documentation/updates/arkit` newest dated section is **June 2024** (`ObjectTrackingProvider`, `RoomTrackingProvider` — both visionOS-flavored). No June 2025 or June 2026 entries. **No documented iOS 27 ARKit changes.**
- **RealityKit**: `/documentation/updates/realitykit` newest section is **June 2025**, no June 2026 — but the **iOS 27 release notes** list RealityKit New Features including `GaussianSplatComponent`, and the symbol page confirms it (below). Treat the RealityKit updates page as stale.

### 3.11 RealityKit Gaussian splats — NEW, and interesting for a design app

`GaussianSplatComponent` — **iOS 27.0 / iPadOS 27.0 / Mac Catalyst 27.0 / macOS 27.0 / visionOS 27.0.** Confirmed at symbol level, not beta. Not on tvOS/watchOS.
Doc: https://developer.apple.com/documentation/realitykit/gaussiansplatcomponent

> "Use a Gaussian splat component to display volumetric imagery captured from real environments… The result is a high-fidelity reproduction of a captured scene that people can view from novel angles."

> "Gaussian splats require a device with **Apple7 GPU family** support."

> "**Important:** Scene lighting doesn't affect a Gaussian splat asset. The color of the rendered output reflects the lighting conditions present during the original capture."

Supporting types: `GaussianSplatResource`, `GaussianSplatResource.BufferResource`, `GaussianSplatResource.BufferDescriptor`, backed by `LowLevelBuffer`. Per-splat properties: position (3 floats), scale (3 floats), rotation quaternion (4 floats), opacity (1 float), spherical harmonics (3+ floats); half precision allowed; AoS or SoA layout.

**Crucially: "The framework doesn't load files directly, so you parse your source format — PLY, USD, or any other container — and populate the buffers yourself."** Apple ships the *renderer*, not a capture pipeline or a file loader. There is an internal splat-count limit; `BufferResource`'s initializer throws if exceeded. `GroundingShadowComponent` produces only an approximate spherical-proxy shadow.

The iOS 27 release notes also carry a top-level "Gaussian Splats" section (Resolved Issues) and a ShaderGraph `DiffuseLightProbeGroupComponent`.

### 3.12 Translation — NO iOS 27 CHANGES

Min **iOS 17.4** / macOS 14.4. No `/documentation/updates/translation` page exists. No symbols introduced at 27.0; no beta flags.
Symbols: `TranslationSession`, `TranslationSession.Configuration`, `LanguageAvailability`, `TranslationError`; SwiftUI modifiers `translationPresentation(isPresented:text:attachmentAnchor:arrowEdge:replacementAction:)`, `translationTask(_:action:)`, `translationTask(source:target:action:)`. Apple documents **no device or language requirements** on this page — check `LanguageAvailability` at runtime.

### 3.13 Live Activities / widgets / controls — ONE new thing

- **ActivityKit**: `/documentation/updates/activitykit` newest dated section is **June 2025**. **No June 2026 entries.** iOS 26 brought Mac menu bar + CarPlay surfacing and `request(attributes:content:pushType:style:alertConfiguration:start:)` scheduling.
- **WidgetKit**: `/documentation/updates/widgetkit` newest dated section is **June 2025**. Framework page shows no availability above 26.0 (visionOS). The WWDC26 iOS guide's line — "widgets customizable through App Intents and dynamic styling" — is **framing of existing capability**, not new API. I verified this against the WWDC26 session 277 transcript, which attributes the App Intents configuration material to WWDC23 and the tinted/clear styling material to WWDC25.
- **The one genuinely new WidgetKit feature**, verbatim from WWDC26 session 277: *"The system extra large portrait family was introduced in visionOS 26. New in macOS, iOS, and iPadOS 27, the **`systemExtraLargePortrait`** family is now available."*
- New for widgets via App Intents in iOS 27: **`RunSystemShortcutIntent`** — open another app or run an App Shortcut / system action from an interactive widget.

### 3.14 Image Playground / Writing Tools — NO NEW THIRD-PARTY API

- **Image Playground** framework: min **iOS 18.1** / macOS 15.1 / visionOS 2.4. **No symbols introduced at 27.0.** The programmatic `ImageCreator` class is flagged **deprecated** — meaning the only supported third-party path is now the system sheet (`imagePlaygroundSheet(...)` SwiftUI modifiers, `ImagePlaygroundViewController`) plus `ImagePlaygroundConcept`, `ImagePlaygroundStyle`, `ImagePlaygroundOptions`. The iOS 27 release notes list Image Playground only under *Resolved Issues*.
- Apple Newsroom advertises "an all-new Image Playground with photorealistic imagery" — that is the **system app / system sheet**, server-backed and subject to daily limits. No new developer API is documented.
- **Writing Tools**: `/documentation/updates/apple-intelligence` has **no June 2025 or June 2026 sections at all** — its newest entry is **February 2025**. Writing Tools API is iOS 18.1/18.2-era: SwiftUI `writingToolsBehavior(_:)`, UIKit `UITextInputTraits.writingToolsBehavior` / `UIBarButtonItem.SystemItem.writingTools`, AppKit equivalents, Genmoji via `NSAdaptiveImageGlyph`. **No iOS 27 changes documented.**

### 3.15 Core ML — UNCHANGED; Core AI is the successor path

`/documentation/updates/coreml` newest dated section is **June 2024** (`MLTensor`, `MLShapedArray` reshape/transpose + `Sendable`, `MLState` stateful predictions, multifunction ML programs, Core ML Tools 8). **No June 2025 or June 2026 entries.** Apple's Core AI page now explicitly scopes Core ML to non-neural-network model types (decision trees, tabular feature engineering).

### 3.16 PaperKit — EXPANDED, and directly relevant to design markup

Framework min **iOS 26.0** (iPadOS/Mac Catalyst/macOS/visionOS 26.0). Builds on PencilKit.
`/documentation/updates/paperkit` has **exactly one dated section: June 2026 (iOS 27)** — meaning the framework's whole element/adornment model landed with iOS 27:

- `PaperMarkup` (background color + ordered markup elements), `Markup` protocol, `MarkupOrderedSet`
- `ImageMarkup`, `ShapeMarkup` (shape **or text box**), `LinkMarkup` (tappable URL), `LoupeMarkup` (magnifier)
- `MarkupInteractions` (per-element move/resize/rotate/delete control)
- `MarkupAdornment` (custom visuals/handles anchored on the canvas, with taps and position changes via the `PaperMarkupViewController` delegate)

Also on the framework page: `MarkupEditViewController` (iOS/iPadOS/visionOS insertion menu), `MarkupToolbarViewController` (macOS), `FeatureSet`, `ShapeConfiguration`, `RenderingOptions`, `MarkupAutoresizing`, `MarkupID`, `MarkupError`. HDR support and custom background views are configurable.

### 3.17 SwiftUI — substantial, and a `@State` behavior change to watch

`/documentation/updates/swiftui` **June 2026** (iOS 27) highlights:

- **`@State` is now a macro** (`State()`), not a property wrapper. Initial-value expressions are evaluated once instead of on every view re-instantiation. **Back-deploys to iOS 17-aligned OSes when built with Xcode 27.** Largely source-compatible, *but* some previously-compiling patterns (declaring `@State private var x = Foo()` and also assigning `x` in an initializer) **no longer compile**. This is a build-time hazard when moving to Xcode 27.
- `ContentBuilder` — unified replacement for `ToolbarContentBuilder`, `CommandsBuilder`, etc.
- Drag-to-reorder: `DynamicViewContent.reorderable()`, `View.reorderContainer(for:isEnabled:move:)`.
- Custom swipe actions outside Lists: `View.swipeActions(edge:allowsFullSwipe:content:onPresentationChanged:)`, `View.swipeActionsContainer()`.
- Toolbars: `ToolbarContent.visibilityPriority(_:)`, `ToolbarOverflowMenu`, `ToolbarItemPlacement.topBarPinnedTrailing`, `View.toolbarMinimizationBehavior(_:for:)`.
- Documents: `ReadableDocument`, `WritableDocument`, `DocumentReader`, `DocumentWriter`, `FileWrapperDocumentReader`, `FileWrapperDocumentWriter`, `URLDocumentConfiguration`, `View.fileExporter(isPresented:document:contentType:defaultFilename:onCompletion:onCancellation:)` — direct file-URL access for large files.
- `AsyncImage` HTTP caching: `View.asyncImageURLSession(_:)`, `AsyncImage.init(request:scale:...)`.
- `TabRole.prominent`; `NavigationTransition.crossFade`; item/error-based `alert(...)` and `confirmationDialog(...)`; gesture input-source filtering via `GestureInputKinds`.
- iOS 27 release notes add: `.toolbarColorScheme(colorScheme, for: .statusBar)`; and **`Text` with `.textSelection(.enabled)` now uses the system text-selection UI when built against the iOS 27 SDK** — Apple advises `.highPriorityGesture()` for custom gestures that must beat system selection.

**There is also a SEPTEMBER 2026 SwiftUI section** covering Arrangement views, Reserved regions, **`DeviceHinge`**, and **`CameraCaptureAccessory`** scene accessories — iPhone Duo / iOS 27.1 material. That ships **October 23, 2026**; treat as ANNOUNCED-NOT-SHIPPED today.

### 3.18 Other iOS 27 release-note items worth flagging

From https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes:

- **Hardware Security**: `arm64e.x1` adds CPA2 for stronger MIE protection — iPhone with A20 Pro+, Macs with M6+, Apple Watch with S11+.
- **Network Security**: system processes (MDM, DDM, ADE, profile install, app install, software update) now require **TLS 1.2 minimum** with ATS-compliant cipher suites and certificates.
- **On Demand Resources / `NSBundleResourceRequest` DEPRECATED** — migrate to **Background Assets**, which in iOS 27 adds localized asset packs delivered per the user's preferred languages.
- **MetricKit**: legacy `MXMetricManager` / `MXMetricPayload` / `MXDiagnosticPayload` family **deprecated** in favor of `MetricManager`, `MetricReport`, `DiagnosticReport` (AsyncStream-based), plus new `ForegroundTerminationMetric`, `BackgroundTerminationMetric`, `MemoryExceptionDiagnostic`, `MetalFrameRateMetric`, `LocationActivityTimeMetric`, `HitchTimeMetric` (replacing `ScrollHitchTimeMetric`).
- **PencilKit**: `__PKStrokeRenderState` → `PKStrokeRenderStateReference`.
- **PhotoKit** deprecations; `PHAsset.addedDate`, `PHAssetResource.originalFilename` behavior notes.
- **StoreKit**: `Transaction.OwnershipType.assigned`, `Transaction.RevocationType.assignmentRevoked`, `Product.SubscriptionInfo.BundledSubscription` (`partnerName`, `partnerId`), `billingPlanType(_:)`.
- New frameworks not otherwise covered: **Music Understanding** (audio analysis across six dimensions, on-device), **NowPlaying** (playback → Lock Screen / Control Center / Dynamic Island / CarPlay), **AudioAccessoryKit**, **Media Sharing Extensions**. Core Image RAW APIs v9. Metal tensors and neural rendering. Game Porting Toolkit 4.
- **macOS 27 is the final release to support Rosetta.**

---

## 4. Things I could NOT verify

1. **Exact minimum OS for `Attachment` / `ImageAttachmentContent` / `ImageReference`** (Foundation Models multimodal). The June 2026 updates page confirms image prompting is an iOS 27 addition, but no per-symbol availability metadata was retrievable.
2. **Exact minimum OS for `OCRTool` / `BarcodeReaderTool`.** The Vision framework landing page carries no `platforms` array at all. Their placement in the Foundation Models June 2026 update is the only dating evidence.
3. **Exact minimum OS for the `AppIntentsTesting` framework** and for the June 2026 App Intents symbols individually. The updates page is date-organized and carries no version annotations; Apple never writes "iOS 27" on it.
4. **Whether `SpeechTranscriber` runs fully on-device.** Strongly implied by the downloadable-asset model, never stated.
5. **Apple's claimed on-device context window for the iOS 27 `SystemLanguageModel`.** The PCC comparison table says 4K on-device vs 32K PCC; third-party reporting claimed Apple did not publish a new on-device number for the 27 model. Query `SystemLanguageModel.contextSize` at runtime rather than hardcoding.
6. **AFM 3 model details** ("AFM 3 Core" 3B dense, "AFM 3 Core Advanced" 20B sparse, Instruction-Following Pruning). These came from third-party blogs (dev.to, ecorpit, chatforest). I found **no Apple page** stating them. The Apple support page does mention "AFM 3 Cloud models in Shortcuts," which corroborates the "AFM 3" generation name only.
7. **The "fm CLI"** — named on the official WWDC26 iOS guide and session 334, but I did not locate a documentation page or download for it.
8. **Any iOS 27 RoomPlan or ARKit change.** Absence of an updates page is not proof of absence of change; it is only the absence of documented change. If room scanning matters, check the WWDC26 session catalog directly.
9. **Whether the Vision "Foundation Models integration" tools work against the on-device model without PCC.** The multimodal article shows `LanguageModelSession(tools: [BarcodeReaderTool()])` with a plain on-device session, which suggests yes, but it is not stated.
10. **`SpotlightSearchTool.Arguments` type-alias semantics.** Its abstract references `NativeSpotlightSearchTool`, `FullArguments`, and `RAGSearchArguments` — symbols that appear nowhere else in Apple's public docs. This reads like leaked internal naming; do not build against those names.
11. **iOS 27.1 contents beyond iPhone Duo support.** Not yet released; only Xcode 27.1 beta SDK notes and the September 2026 SwiftUI section exist.
12. **The claim that the iOS 27 SDK is required for App Store submission.** Contradicted by Apple's own Upcoming Requirements page — current requirement is Xcode 26 / iOS 26 SDK.
13. **Whether WidgetKit gained anything beyond `systemExtraLargePortrait`.** The updates page has no June 2026 section; I relied on the session transcript. Apple may simply not have updated the page.

---

## 5. Source URLs used

**Release / version**
- https://developer.apple.com/news/releases/
- https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes
- https://developer.apple.com/documentation/Xcode-Release-Notes/xcode-27-release-notes
- https://developer.apple.com/news/upcoming-requirements/
- https://www.apple.com/newsroom/2026/09/major-updates-for-apples-software-platforms-are-now-available/
- https://www.apple.com/newsroom/2026/09/apple-debuts-iphone-18-pro-and-iphone-18-pro-max/

**Requirements**
- https://www.apple.com/apple-intelligence/
- https://support.apple.com/en-us/121115
- https://developer.apple.com/private-cloud-compute/

**WWDC26**
- https://developer.apple.com/wwdc26/guides/ios/
- https://developer.apple.com/videos/play/wwdc2026/240/
- https://developer.apple.com/videos/play/wwdc2026/277/

**Frameworks**
- https://developer.apple.com/documentation/FoundationModels
- https://developer.apple.com/documentation/updates/foundationmodels
- https://developer.apple.com/documentation/FoundationModels/adding-server-side-intelligence-with-private-cloud-compute
- https://developer.apple.com/documentation/FoundationModels/analyzing-images-with-multimodal-prompting
- https://developer.apple.com/documentation/FoundationModels/supporting-languages-and-locales-with-foundation-models
- https://developer.apple.com/documentation/FoundationModels/systemlanguagemodel
- https://developer.apple.com/documentation/CoreAI
- https://developer.apple.com/documentation/Evaluations
- https://developer.apple.com/documentation/AppIntents
- https://developer.apple.com/documentation/updates/appintents
- https://developer.apple.com/documentation/appintents/app-schema-domains
- https://developer.apple.com/documentation/appintents/visual-presentation
- https://developer.apple.com/documentation/appintents/providing-contextual-cues-to-apple-intelligence-and-siri
- https://developer.apple.com/documentation/appintents/appentityuielement
- https://developer.apple.com/documentation/updates/corespotlight
- https://developer.apple.com/documentation/corespotlight/spotlightsearchtool
- https://developer.apple.com/documentation/corespotlight/making-your-indexed-content-available-to-foundation-models
- https://developer.apple.com/documentation/speech
- https://developer.apple.com/documentation/speech/speechtranscriber
- https://developer.apple.com/documentation/updates/speech
- https://developer.apple.com/documentation/vision
- https://developer.apple.com/documentation/updates/vision
- https://developer.apple.com/documentation/roomplan
- https://developer.apple.com/documentation/updates/arkit
- https://developer.apple.com/documentation/updates/realitykit
- https://developer.apple.com/documentation/realitykit/gaussiansplatcomponent
- https://developer.apple.com/documentation/translation
- https://developer.apple.com/documentation/widgetkit
- https://developer.apple.com/documentation/updates/widgetkit
- https://developer.apple.com/documentation/updates/activitykit
- https://developer.apple.com/documentation/imageplayground
- https://developer.apple.com/documentation/updates/apple-intelligence
- https://developer.apple.com/documentation/updates/coreml
- https://developer.apple.com/documentation/paperkit
- https://developer.apple.com/documentation/updates/paperkit
- https://developer.apple.com/documentation/naturallanguage
- https://developer.apple.com/documentation/naturallanguage/nlcontextualembedding
- https://developer.apple.com/documentation/updates/swiftui
- https://developer.apple.com/documentation/updates/backgroundtasks
- https://developer.apple.com/documentation/visualintelligence
- https://developer.apple.com/documentation/updates
