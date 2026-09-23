# Opportunity long-list — Fable draft v0 (pre-Astra-challenge)

Date: 2026-09-23. Grounded in first-hand code reads + verified Apple sources.
Revise after evidence round + Astra challenge.

## Verified platform ground truth (Fable, first-hand)
- iOS 27 released 2026-09-14 (announced WWDC 2026-06-08). Supports iPhone 11+.
- Apple Intelligence / Foundation Models gate: A17 Pro+ => iPhone 15 Pro, 15 Pro Max,
  iPhone Air, iPhone 16+. 16 languages. Siri AI English-only at launch, not in EU.
- FoundationModels NEW in 27: multimodal image `Attachment(...)`, `OCRTool`,
  `BarcodeReaderTool`, Spotlight RAG tool, Dynamic Profiles, `LanguageModel` protocol,
  `PrivateCloudComputeLanguageModel` (32k ctx; free under 2M downloads + SBP).
  On-device ctx 8192, `model.contextSize` / `tokenCount(for:)`.
- App Intents NEW in 27: entity schemas -> Spotlight semantic index w/ attribution;
  intent schemas (no phrases); View Annotations API; App Intents Testing framework.
  CONSTRAINT: schema domains cover common concepts (messages, mail, photos, contacts,
  documents). No design/furniture/field domain. Schema-less intents still reach
  Shortcuts/Spotlight/Widgets; Siri NL invocation is what schemas unlock. [MEDIUM CONF]
  CONSTRAINT: semantic index retrieval is app-sandbox-only — no cross-app retrieval,
  even between our own two apps. [MEDIUM CONF - verify]
- SpeechAnalyzer/SpeechTranscriber: iOS 26, on-device, NOT Apple-Intelligence-gated;
  DictationTranscriber covers older devices/languages. => voice works on ALL devices.
- Core AI (new in 27): bring-your-own on-device models, Apple-Silicon-specialised.
- iOS 27 refreshes system materials, typography, tab and nav bars.

## Codebase ground truth (Fable, first-hand)
- ZERO adoption in BOTH apps: FoundationModels, AppIntent, AppEntity, IndexedEntity,
  CSSearchableIndex, CoreML, NaturalLanguage, SpeechAnalyzer, Translation, WritingTools.
- Field has: Vision (3 files), VNRecognizeText (2), SFSpeechRecognizer (2, legacy),
  ActivityKit (2), RoomPlan (5), ARKit (11). NO WidgetKit. CaptureWidgets/ is EMPTY.
- Patina has: WidgetKit (5), RoomPlan (12), ARKit (19). NO ActivityKit. Vision (1).
- Deployment floor INVERTED: Patina (client) = iOS 26.0; Field (pro) = iOS 18.0,
  set by one constant, generate_project.rb:17.
- Field's "smart guess" = VNClassifyImageRequest + a ~40-word keyword table +
  15 hardcoded materials + 12 hardcoded colours. Its own comment: "the part that
  quietly rots." (HeuristicSmartGuessService.swift, SmartGuessKeywords.swift)
- Field Specimen @Model already has exactly the fields a @Generable draft would emit:
  title, maker, sku, colorway, materialNote, finish, priceTradeCents, priceRetailCents,
  currencyCode, sourceURL, note, category, materials[], colors[], styleTags[],
  voiceTranscript.
- Field ALREADY SHIPS a provenance grammar: ProvenanceSource (manual/ocr/code/measure/
  voice/smartGuess/imported/edited) + ProvenanceBadge chip, DASHED border for
  unconfirmed .smartGuess, .edited on human correction, a11y "Source: guess".
  Patina (client) has NO equivalent.
- Server-side Aesthete Engine already exists: nomic-embed-text/vision-v1.5 768-d int8
  ONNX + Bradley-Terry taste refit. This is the designer-taught moat.
- Terminology collisions (user-facing string counts, Patina/Field/portal):
  Piece 96/3/3 vs Specimen 0/19/0 vs Item 20/35/36 vs Product 33/2/30
  Studio 64/14/26 vs Workspace 2/29/0
  House 18/6/2 vs Project 80/89/22 vs Job 3/28/2 vs Site 0/66/0
  Maker 27/7/4 vs Vendor 3/11/10
- Design systems ACTIVELY CONVERGING already: CaptureColor re-points every token at
  PatinaDesignKit (R28); CaptureApp registers PatinaFonts process-wide (R33).
- Overlapping feature folders in both apps: Account, Companion, Decisions,
  Messages/Messaging, Onboarding, Projects, QRAuth/QRApprove, Settings, Scan.

## VISION constraints that bind the recommendation
- "AI" label is refused, non-negotiable. It is Designer-Taught Intelligence.
- Surface order: The Document (designer portal) > iOS app (studio's front door,
  marketing/qualification instrument, NOT a consumer product) > marketplace.
  => Field is nearer the #1 surface; client Patina is the #2 front door.
- Refused: tab/zone/dashboard UI, shadows, red/green status, badges.
  (TENSION: CaptureColor ships success/warning/error semantic colours.)
- Feature test: which surface, which studio moment, which stream, which promise.

## Long-list (draft — 10)
F = Field, P = Patina client, S = shared, X = cross-app connector

1. [F] **The tag, read once.** Replace HeuristicSmartGuessService with a FoundationModels
   multimodal session: photo Attachment + OCRTool + BarcodeReaderTool -> @Generable
   SpecimenDraft mapping 1:1 onto the existing Specimen fields. Fills the SAME fields,
   flies the SAME dashed .smartGuess chip. Kills the rotting keyword table.
2. [F] **The spoken specimen.** SpeechTranscriber (all devices) for the transcript;
   FoundationModels structures it into fields on capable devices; otherwise the
   transcript attaches exactly as today. Hands-busy, gloved, showroom.
3. [S] **The provenance contract.** Promote ProvenanceSource/ProvenanceBadge out of
   CaptureKit into PatinaDesignKit as the family-wide grammar for every machine-
   suggested value, and adopt it in the client app. The review/correct/approve UX.
4. [F] **Ask your own library.** App Intents IndexedEntity -> Spotlight semantic index
   over the designer's specimens; Spotlight RAG tool for in-app natural-language recall.
   CAUTION: sandbox-only; does not span the two apps. Server pgvector remains the
   cross-surface path.
5. [X] **One vocabulary.** Canonicalise Piece/Specimen/Item/Product,
   Studio/Workspace, House/Project/Job/Site, Maker/Vendor across both apps and the
   portal. PREREQUISITE for 4 and any Siri/App Intents work — entity names are the API.
6. [F] **The receiving eye.** Goods-in inspection (G1-G3): multimodal compare of the
   delivered piece against the specimen record + packing slip OCR; drafts a damage note.
7. [F] **The job in the Dynamic Island.** Field already has ActivityKit for sync;
   extend to the billable-hours timer and the site-scan upload. Fill the EMPTY
   CaptureWidgets target. (Conventional, not AI — include to test the shortlist.)
8. [P] **The house, in your own words.** Client app: structure a homeowner's spoken or
   typed reaction to a proposal into the decision record the designer reads.
9. [P] **The daily return, composed.** Companion/DailyStoryCard copy assembled
   on-device from the client's own room + decision state, instead of server templates.
10. [S] **Scan-to-record.** RoomPlan output + posed photos -> drafted room inventory,
    the one place both apps run the same pipeline (Patina Walk, Field SiteScan).

## Shortlist instinct (pre-challenge)
Top 3: #1 (Field, highest value x lowest risk x kills rotting code),
#3 (shared, the UX contract that makes all the rest legible and consistent),
#5 (cross-app, the unglamorous prerequisite that unlocks #4 and Siri).
Watch: #5 and #3 are enablers, not features — Astra will likely challenge whether a
shortlist of two enablers + one feature is the right allocation. Defend or revise.
