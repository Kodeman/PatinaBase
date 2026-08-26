# D6 — External Research: Voice Transcription, LLM Structuring, Competitor UX, and iOS Platform Affordances for a Field Companion

**Scope**: Patina Field (bundle `cloud.patina.field`, scheme `field://`) targets **iOS 18.0** (confirmed: `IPHONEOS_DEPLOYMENT_TARGET = 18.0` in every build config at `apps/mobile/Capture/Capture.xcodeproj/project.pbxproj:1412,1448,1480,1517,1554,1590,1636,1662`; `Info.plist` at `apps/mobile/Capture/Capture/Info.plist` declares only the `field://` URL scheme, no other platform-affordance keys are present in that file today). This is an important constraint threaded through Section A and D below: **SpeechAnalyzer/SpeechTranscriber requires iOS 26**, which is newer than Patina Field's current deployment target — any recommendation that leans on it needs either a deployment-target bump or a runtime `#available` fallback path.

All claims below are sourced from web search/fetch results gathered 2026-08-24 (Anthropic pricing page fetched directly; others are search-result syntheses — treated as reasonably reliable for order-of-magnitude figures, flagged as **[inference]** where a source was thin or indirect). This file does not touch any other repo path.

---

## A. Transcription options for iOS field voice notes (2026)

### A1. On-device: Apple's own frameworks

**SpeechAnalyzer / SpeechTranscriber (new in iOS 26)**
- Apple's modular successor to `SFSpeechRecognizer`, introduced at WWDC25 ("Bring advanced speech-to-text to your app with SpeechAnalyzer," session 277, `developer.apple.com/videos/play/wwdc2025/277/`). Built on `AsyncSequence`, Swift-concurrency-friendly. [Sources: picovoice.ai/blog/ios-speech-recognition, callstack.com blog, blakecrosley.com/blog/speech-framework-vs-sfspeechrecognizer]
- Two shipping modules as of iOS 26: `SpeechTranscriber` (speech-to-text) and `SpeechDetector` (voice-activity detection). Modules attach/detach dynamically mid-session; each module only sees audio from the point it was attached. [dev.to/arshtechpro/wwdc-2025-...]
- **Fully on-device.** Language assets are downloaded and managed through the system asset catalog (not bundled in-app) — this is the same asset-management pattern as on-device Siri/dictation languages, meaning first use of a new locale may require a background download and a first-run UX for "downloading language pack."
- **Claimed 2× faster than Whisper Large V3 Turbo** on equivalent transcription tasks, per Apple's own proprietary model comparison cited secondhand [dev.to/arshtechpro — **inference**, not independently verified against a benchmark source in this pass].
- **Supported locales (from `SpeechTranscriber.supportedLocales`, WWDC25 + community-verified as of 2026)**: ar_SA, da_DK, de_AT, de_CH, de_DE, en_AU, en_CA, en_GB, en_IE, en_IN, en_NZ, en_SG, en_US, en_ZA, es_CL, es_ES, es_MX, es_US, fi_FI, fr_BE, fr_CA, fr_CH, fr_FR, he_IL, it_CH, it_IT, ja_JP, ko_KR, ms_MY, nb_NO, nl_BE, nl_NL, pt_BR, ru_RU, sv_SE, th_TH, tr_TR, vi_VN, yue_CN, zh_CN, zh_HK, zh_TW — i.e. broad English/EU/major-Asian coverage but not exhaustive. [Source: medium.com/@itsuki.enjoy/swift-speechtranscriber...]
- For locales outside that list (or pre-iOS-26 devices), Apple offers `DictationTranscriber`, which mirrors `SFSpeechRecognizer`'s language/device support but drops the old requirement that users manually enable Siri/keyboard dictation for a language in Settings. [same source]
- **Availability floor: iOS 26+ only** (plus specific hardware — the WWDC session notes "all platforms but watchOS with certain hardware requirements"). This is the single most consequential fact for Patina Field: the app's current 18.0 floor is 8 major versions behind this API.
- Long-form/file-based transcription is a first-class mode (not just live streaming) — well-suited to "record now, transcribe on save" field capture. [callstack.com blog title: "On-Device Speech Transcription with Apple SpeechAnalyzer and AI SDK"]

**SFSpeechRecognizer (available today, back to iOS 10, works fine at the 18.0 floor)**
- `supportsOnDeviceRecognition: Bool` reports whether on-device recognition is possible for that recognizer's locale; `SFSpeechRecognitionRequest.requiresOnDeviceRecognition` can only be honored when `supportsOnDeviceRecognition` is true — otherwise the request silently falls back to sending audio to Apple's servers. [developer.apple.com/documentation/speech/sfspeechrecognizer/supportsondevicerecognition; developer.apple.com forum threads]
- **Hard limit: ~1 minute of audio per recognition request**, plus a **rate limit of ~1,000 requests per device per hour**. [picovoice.ai/blog/ios-speech-recognition, andyibanez.com, Apple docs synthesis] This is the load-bearing constraint for any field voice-note flow built on `SFSpeechRecognizer` today: a 5-minute site-walk voice note requires chunking into ≤1-minute segments and stitching transcripts, with the attendant risk of losing words at segment boundaries.
- On-device model requires initial download and "may not be available immediately after installation" — same asset-download UX concern as SpeechAnalyzer, just via a different (older) mechanism.
- **Bottom line**: `SFSpeechRecognizer` is usable today on the 18.0 floor, but the 1-minute cap makes it a poor fit for anything but short voice tags; a real "walk the room and talk" flow needs either chunking-with-stitching, WhisperKit, or a server path.

### A2. On-device: WhisperKit (Argmax)

- Open-source (MIT), by Argmax — Whisper reimplemented for CoreML/Apple Neural Engine acceleration. Argmax was founded Nov 2023 specifically to deploy commercial-scale on-device inference; Whisper was their first shipped workload. [argmaxinc.com/blog/whisperkit]
- **Device support**: A16, A17 Pro, A18 (i.e., iPhone 15/16/17 generation and comparable iPads). Tiny/base models run on older iPhones; quantized **large-v3(-turbo) variants target iPhone 15 Pro and newer with 8GB RAM**. [github.com/argmaxinc/WhisperKit, huggingface.co/spaces/argmaxinc/whisperkit-benchmarks]
- **Model size**: quantized "turbo" variants run **~547 MB to ~955 MB**, cutting size roughly in half vs. full-precision with minimal WER regression. The SDK itself adds <5 MB to app size — the model is the real footprint, and (like SpeechAnalyzer) would typically be downloaded on first use rather than bundled, to avoid bloating the IPA. [multiple sources, cross-corroborated]
- **Speed**: CoreML scheduler routes attention layers to the Apple Neural Engine; a SwiftUI app "stays responsive" on A17 Pro / M-series. No hard numbers surfaced in this pass for tokens/sec on A17 vs A18 — **[gap, worth a follow-up device benchmark]**.
- As of v1.0.0 (2026-05-01) the repo was renamed `argmaxinc/WhisperKit` → `argmaxinc/argmax-oss-swift`, now bundling WhisperKit + SpeakerKit (diarization) + TTSKit as one Swift package — meaning **on-device diarization is available in the same family**, which matters for multi-voice site-visit notes (designer + client + trade).
- **Works today at iOS 18.0** — no iOS-26 floor requirement, unlike SpeechAnalyzer. This makes WhisperKit the more immediately actionable on-device path for Patina Field unless/until the deployment target moves.

### A3. Server-side APIs

All prices below are per-minute of audio unless noted; sourced from 2026 pricing aggregator pages (not first-party for every vendor — treat as directionally correct, verify against the vendor's live pricing page before committing to a integration).

| Provider / model | Price (batch, per min) | Notes |
|---|---|---|
| **OpenAI `whisper-1`** | $0.006/min | Legacy but still served. |
| **OpenAI `gpt-4o-transcribe`** | $0.006/min (also quoted as $2.50/$10 per MTok in/out) | Better accuracy than whisper-1 per OpenAI's own claims (not independently verified here). |
| **OpenAI `gpt-4o-mini-transcribe`** | $0.003/min ($1.25/$5 per MTok) | Cheapest OpenAI tier; one-hour file ≈ $0.18. |
| **OpenAI `gpt-realtime-whisper`** | ~$0.017/min | Live/streaming variant. |
| A newly reported OpenAI model "**GPT-Transcribe**" (2026-07-28 release, per one aggregator) | ~$0.0045/min | **[low-confidence — single-source, unverified against OpenAI's own docs in this pass]**. |
| **Deepgram Nova-3** | $0.0043/min batch, $0.0077/min streaming | Diarization + word-level timestamps reported as included in base price by some sources, itemized ($0.001–0.002/min) by others — **conflicting, verify at contract time**. Bills per-second, so short clips (typical field voice note: 15–90s) cost less than the per-minute headline implies. |
| **AssemblyAI Universal-2** | $0.15/hr batch (~$0.0025/min) base; +$0.02/hr for Speaker ID (name-mapped diarization; basic diarization included free); topic detection/sentiment/entity add-ons stack up to ~$0.45/hr combined | Rich feature add-on model — good if Patina wants entity/topic extraction in the same call, but watch stacking. |
| **Google Cloud Speech-to-Text (Chirp 3)** | $0.016/min | Free tier: 60 min/month (as of March 2026). Dynamic Batch mode offers a discounted rate with ~24h turnaround for non-real-time use. |
| **Groq (Whisper Large v3 Turbo on LPU hardware)** | ~$0.04/hr (~$0.00067/min) | **Cheapest and fastest** of the server options surveyed — 217–228× real-time (an hour of audio in ~15 seconds). 10-second minimum billing per request, so batching short clips matters for cost efficiency. |
| **Cloudflare Workers AI (`whisper-large-v3-turbo`)** | $0.00051/audio-minute (per Cloudflare's own model doc) | Runs on Cloudflare's edge — **directly relevant since Patina's prod infra is already Cloudflare** (Workers/Containers). No documented max file-size/duration in the page fetched; would need a live test. Also supports translation, VAD filtering, hallucination-suppression controls (`condition_on_previous_text`), and WebVTT output with word/segment timing. |

**Diarization / word timestamps summary**: Deepgram and AssemblyAI both offer diarization as a togglable feature (Deepgram appears to bundle it more often; AssemblyAI itemizes speaker *identification* by name separately from basic speaker *separation*). WhisperKit's SpeakerKit sibling gives an on-device diarization option not available from Apple's own frameworks. Cloudflare's Whisper model, per the fetched doc, does **not** appear to expose diarization — only VAD and transcription/translation.

**Cost at volume** (500 min/mo vs 5,000 min/mo, batch/async pricing, rough order-of-magnitude):

| Provider | 500 min/mo | 5,000 min/mo |
|---|---|---|
| Groq (Whisper turbo) | ~$0.34 | ~$3.35 |
| Cloudflare Workers AI (Whisper turbo) | ~$0.26 | ~$2.55 |
| OpenAI gpt-4o-mini-transcribe | ~$1.50 | ~$15.00 |
| Deepgram Nova-3 (batch) | ~$2.15 | ~$21.50 |
| AssemblyAI Universal-2 (+ diarization) | ~$1.42 | ~$14.20 |
| OpenAI whisper-1 / gpt-4o-transcribe | ~$3.00 | ~$30.00 |
| Google Chirp 3 | ~$8.00 (minus free 60 min) | ~$79.00 |

At Patina's likely early field-note volumes (a handful of designers, a few minutes per note), every server option here is cheap in absolute terms — the deciding factors are latency, privacy, diarization needs, and integration effort, not raw cost.

### A4. Decision matrix

| Option | Offline-capable | Noisy-site robustness | Cost @500/5,000 min | Privacy | Swift integration effort | Edge-fn integration effort |
|---|---|---|---|---|---|---|
| SFSpeechRecognizer (on-device) | Yes (if locale downloaded) | Moderate — Apple's dictation-grade model, not tuned for job-site noise | $0 | Best (stays on device) | Low (native, no new deps) — but 1-min chunking logic required | N/A |
| SpeechAnalyzer/SpeechTranscriber | Yes | Likely better than SFSpeechRecognizer (newer model) — **unverified vs. noise specifically** | $0 | Best | **Blocked**: requires iOS 26 floor (app is 18.0) | N/A |
| WhisperKit (on-device) | Yes | Good — Whisper family is known for noise robustness relative to older ASR | $0 (compute) + ~550MB–950MB one-time download | Best | Medium (new dependency, model-download UX, device-tier gating for large-v3) | N/A |
| Groq Whisper (server) | No | Good (server-side Whisper large-v3-turbo) | ~$0.34 / ~$3.35 | Audio leaves device to Groq | Low (simple HTTPS call) | Low — call from a Supabase edge function |
| Cloudflare Workers AI Whisper (server) | No | Good | ~$0.26 / ~$2.55 | Audio leaves device but **stays inside Patina's existing Cloudflare account** | Low | **Lowest** — same infra as prod, could be a Worker binding rather than an external HTTP call |
| OpenAI gpt-4o(-mini)-transcribe (server) | No | Good, possibly best raw accuracy of the API options | ~$1.50–3.00 / ~$15–30 | Audio leaves to OpenAI | Low | Low |
| Deepgram Nova-3 (server) | No | Good, strong diarization | ~$2.15 / ~$21.50 | Audio leaves to Deepgram | Low–Medium (richer API surface) | Low |
| AssemblyAI Universal-2 (server) | No | Good, richest add-on ecosystem (entities/topics/sentiment) | ~$1.42 / ~$14.20 | Audio leaves to AssemblyAI | Low–Medium | Low |

### A5. Recommendation: hybrid on-device draft + server re-transcription

**Recommended pattern**, consistent with the field-companion goal of "minimal friction, works on a job site with bad signal":

1. **Capture**: record audio locally (AVAudioSession, background-audio-capable per Section D).
2. **Immediate on-device draft**: run WhisperKit (not SpeechAnalyzer, since the app floor is 18.0 and SpeechAnalyzer needs 26) against the local recording as soon as it stops, or `SFSpeechRecognizer` chunked at ≤60s if WhisperKit's model-download footprint is judged too heavy for a v1. This gives the designer an immediately-visible, editable draft transcript even with zero bars on-site — matching the "one-handed, busy, on the move" persona and letting them glance-verify before moving on.
3. **Background upload + server re-transcription**: upload the raw audio (small: a 2-minute voice note at typical AAC/Opus compression is a few hundred KB to ~1–2 MB) alongside the on-device draft via the existing capture-media upload path (mirrors the pattern already used for scan bundles per memory: `capture-media/<uid>/<clientToken>/`). A Supabase edge function calls a server transcription API — **Cloudflare Workers AI Whisper is the standout choice given Patina's prod infra is already Cloudflare** (lowest latency to call, likely lowest ops overhead, competitive price) — to produce a higher-quality transcript that supersedes the on-device draft once it lands, plus (optionally) diarization if a richer provider (Deepgram/AssemblyAI) is used instead for multi-speaker site walks.
4. **Reconciliation UI**: when the server transcript returns, diff it against the on-device draft; if the designer already edited the draft, don't silently clobber their edits — surface "an improved transcript is available" rather than overwrite (a pattern to validate with Leah, not assumed here).

**Rationale**: this mirrors the "confirm-scan-bundle" pattern already proven in Patina Field for room scans (instant local artifact + eventual server-side authoritative processing), avoids a hard iOS-26 dependency, keeps a text draft usable with zero connectivity (critical for basements/rural sites), and keeps ongoing per-minute server cost trivial at Patina's likely volume. If/when the deployment target moves past iOS 26, SpeechAnalyzer becomes a strict upgrade over WhisperKit for the on-device leg (no per-app model download, tighter OS integration, reportedly faster) and the same hybrid shape holds — only the on-device engine swaps.

---

## B. Structuring transcripts into actionable items with Claude

### B1. Current Anthropic model IDs and pricing (fetched directly from `platform.claude.com/docs/en/about-claude/pricing`, 2026-08-24)

The current model family (superseding CLAUDE.md's slightly older "Fable/Opus/Sonnet/Haiku" naming) is, per the live pricing table:

| Model | Input | Output | Batch input/output |
|---|---|---|---|
| Claude Fable 5 | $10/MTok | $50/MTok | $5/$25 |
| Claude Mythos 5 (limited availability) | $10/MTok | $50/MTok | $5/$25 |
| Claude Opus 5 | $5/MTok | $25/MTok | $2.50/$12.50 |
| Claude Sonnet 5 | $2/MTok | $10/MTok | $1/$5 |
| Claude Haiku 4.5 | $1/MTok | $5/MTok | $0.50/$2.50 |

(Older Opus 4.x/Sonnet 4.x/Haiku 3.5 remain listed as retired-except-on-Bedrock/GCP.) This confirms CLAUDE.md's existing model-dispatch guidance is current: Sonnet 5 for default execution, Haiku 4.5 for cheap/mechanical work — a transcript-structuring task (see below) is squarely a Haiku- or Sonnet-tier job, not Opus.

Prompt caching: 5-min cache write = 1.25× base input, 1-hr write = 2× base input, cache hit = 0.1× base input. Batch API = 50% off both input/output, min latency trade-off (async). Both stack.

### B2. Extraction pattern: transcript → structured field items

Sourced pattern (spinach.ai/blog/how-to-use-meeting-transcripts-with-claude; dev.to/albert_nahas.../structured-output-with-claude; claude-world.com/guides/g03-meeting-notes-summaries) plus Anthropic's own **strict tool use** docs (`platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use`):

- **Use strict tool use / structured outputs, not prose-then-parse.** Anthropic's `strict: true` flag on a tool definition constrains token sampling via grammar-constrained decoding so the JSON is guaranteed schema-valid on every call — no more "the model wrapped the JSON in a markdown fence" failures. Requirements: `additionalProperties: false` on every object, every property listed in `required`.
- **Field-companion-shaped extraction schema** (illustrative, not a repo artifact):
  ```
  {
    "items": [
      { "type": "task" | "decision" | "measurement" | "product_mention" | "note",
        "text": string,
        "confidence": number (0-1),
        "source_span": string,           // verbatim quote it was derived from
        "room_or_area": string | null,
        "unit": string | null,            // for measurements: "in", "ft", "cm"...
        "value": number | null,           // for measurements
        "needs_confirmation": boolean }
    ]
  }
  ```
- **Ground every extracted item in a verbatim quote (`source_span`)** — this is the single most effective anti-hallucination lever cited across sources: forcing the model to cite the exact transcript substring it derived a claim from makes fabricated tasks/numbers visibly detectable (the quote either exists in the transcript or it doesn't — trivially checkable in code, no second LLM call needed).
- **Flag missing structure rather than inventing it**: the strongest-cited pattern for action items is "require an owner and due date, and instruct Claude to flag any missing details" rather than have the model silently assume one — directly transferable to Patina Field: a task extracted from "we need to swap that faucet" with no owner/room/timeline should come back `needs_confirmation: true`, not a confidently-assigned task.
- **Pitfalls called out across sources**:
  - **Hallucinated tasks**: mitigated by the verbatim-quote requirement above.
  - **Numbers/units drift**: a spoken "thirty-two inches" easily becomes `32` with an assumed/wrong unit, or a transcription error ("32" heard as "3 to") propagates silently. Recommend a **confidence-gated confirmation step** for any `measurement` item before it writes anywhere load-bearing (e.g., before it touches an FF&E spec or a room dimension) — never auto-commit a number extracted from voice to a database field without a human glance, consistent with Patina's existing "drafts land `awaiting_review`" agent-OS rule (AGENTS.md).
  - Full-transcript-in-one-call is preferred over chunking when it fits context, because a model that sees the whole conversation resolves references (pronouns, "that thing we talked about earlier") that a chunked summarizer cannot — relevant for a 10–20 minute site-walk voice note, which fits easily in Sonnet 5/Haiku 4.5's context window at negligible cost.
- **Cost estimate per note**: a 5-minute transcript is roughly 750–1,000 words ≈ 1,000–1,300 tokens input, plus a system/schema prompt (~300–500 tokens) and a modest JSON output (~200–500 tokens for a handful of items). At Haiku 4.5 rates ($1/$5 per MTok) that's well under $0.01/note; even at Sonnet 5 rates ($2/$10/MTok) it's a few cents at most — **structuring cost is immaterial next to transcription cost**, so model choice here should be driven by extraction quality, not price.

---

## C. Adjacent / competitor field UX patterns

Below: 10–15 concrete patterns extracted from named tools, each with a note on Patina-Field applicability. Sourced from vendor blogs/help docs/review aggregators (2026); none of these were driven interactively via a device — descriptions are from public documentation/marketing pages, not hands-on screenshots.

1. **Capture-first, file-later inbox** (CompanyCam, Otter, Limitless philosophy broadly). CompanyCam: snap a photo + talk through what you see; AI generates the report *afterward* — the field worker never stops to categorize mid-capture. **Applicable**: Patina Field's field-note flow should default to "just record/snap," with routing/association (which project, which room) resolved after the fact or inferred, not gated up front.
2. **Auto-tag to project by GPS + geofencing** (CompanyCam: automatically captures, timestamps, GPS-tags, and organizes photos by project via geofencing). **Applicable directly** — Patina Field already has `siteScanContext` project-association infrastructure per memory (project_id null by RPC design, association lives in provenance); GPS/geofence auto-suggestion of "you're probably at Project X" is the natural next layer, using `CLVisit` (Section D) rather than continuous GPS.
3. **Voice-to-report AI daily logs** (CompanyCam's headline feature: "snap a photo, talk through what you see" → AI-generated field report/checklist/caption). **Applicable** as the end-state of the hybrid transcription pipeline in Section A: raw voice + photos → a structured daily/visit report, not just a flat transcript dump.
4. **Review-later inbox distinct from the live record** (Otter's model: transcript lands in an inbox that's tagged/highlighted after the fact by multiple people). **Applicable**: an "unprocessed field notes" inbox on the portal side (Desk-adjacent, matching existing "Desk triage cards" pattern from Field Coordination work) where a design assistant reviews/dispositions voice-note-derived items before they become real tasks — matches the agent-OS "drafts land awaiting_review" rule structurally.
5. **One-thumb / minimal-chrome capture bar** (implied across CompanyCam, Magicplan — job-site apps universally optimize for gloved/one-handed operation). **Applicable**: matches the "Leah" persona (one-handed, busy) explicitly named in the program goal — the capture entry point should be reachable without two-handed navigation.
6. **Lock-screen / Action-button / Control-Center entry points** (Apple's own Quick Notes-style apps, generic pattern per Section D). **Applicable, high-value**: getting from "phone in pocket" to "recording" in one gesture is the single highest-leverage friction removal for a site-visit-interrupted-by-a-thought scenario.
7. **Siri/App Intents voice invocation** ("Hey Siri, quick capture" pattern, generic App Intents pattern). **Applicable**: lets a designer start a Patina Field capture hands-free while carrying materials/measuring — directly serves "retires the tape measure."
8. **Apple Watch quick-entry via Double Tap** (Series 9+/Ultra 2 only; explicitly degrades during walking/stairs/running per Apple's own caveat). **Marginal applicability**: nice-to-have, but hardware-gated (Series 9+) and unreliable exactly during the kind of physical movement a site walk involves — lower priority than phone-based entry points.
9. **AR/LiDAR-assisted measurement replacing the tape measure** (Magicplan: walk the room with LiDAR, walls/doors/windows captured automatically; 20+ supported laser-meter integrations for non-LiDAR devices). **Already partially built** in Patina Field's site-scan rig per memory — worth cross-referencing Magicplan's *report/estimate* output shape (price lists, checklists, forms) as a model for what a scan-to-spec pipeline could generate beyond geometry.
10. **QR-code / on-site instant access to specs** (Programa: trades/builders scan a QR code for the latest specification and installation details, no login). **Applicable and structurally similar to existing infra**: Patina already has `field_link_tokens` + no-login client-portal `/field/[token]` per memory — the same no-friction-access pattern extends naturally to "trade scans QR, sees current spec" during an install day.
11. **Web clipper for product capture at showrooms/supplier sites** (Programa's proprietary web clipper; Houzz Pro's AI-powered mobile Clipper for capturing product details/pricing/images from any mobile browser, iOS-only as of the source). **Applicable**: Patina Field's product-capture flow (per memory: specimens at markets/showrooms) could adopt a similar "point camera or browser at a product, auto-extract details" pattern rather than manual entry — though Patina already has a Chrome extension for desktop clipping; this is the mobile-equivalent gap.
12. **Mood-board mobile *viewing*, desktop-only *editing*** (Houzz Pro: mood boards viewable/shareable on mobile for client-facing moments, but creation/editing requires desktop). **Cautionary pattern, not one to copy uncritically**: this is a real friction point in a competitor's product — Patina should decide deliberately whether field mood-board editing is in scope rather than defaulting to Houzz's mobile-view-only split.
13. **Structured daily-log narrative generation from photos + voice** (CompanyCam: "pulls project data, organizes descriptions into a clear narrative, formats into a polished report"). **Applicable** as an eventual output artifact — a shareable "here's what happened at today's site visit" document generated from the day's captures, echoing the program's stated goal of "field information lands in the right place in the portal's project flow."
14. **Hardware-pendant ambient capture** (Limitless, Plaud: continuous/ambient recording via a wearable, auto-summarized into action items/decisions after the fact, no manual start/stop). **Not directly applicable to a phone-based app** but worth noting as the ceiling of "zero friction" — Patina Field's phone-based capture is a deliberate middle ground between manual note-taking and always-on ambient hardware; the phone-based Action Button / Siri entry points (item 6–7) are the closest achievable approximation without new hardware.
15. **In-app AR measurement tool bundled into an existing PM suite** (Ivy/Houzz Pro: augmented-reality measurement tool alongside to-do lists, time tracking, product library — i.e., the field-capture tools live inside the same app as the rest of the business, not a separate utility). **Validates Patina Field's existing single-app strategy** (one app spans room capture + product capture +, per this program, voice notes) rather than splitting into point-solution apps.

---

## D. iOS platform affordances for "capture on the move"

All of the following are available at Patina Field's actual 18.0 floor except where marked iOS-26-only.

- **App Intents** (iOS 16+, so available today). Declare a Swift struct conforming to `AppIntent` with a `perform()` method; the system then surfaces it through Siri, Shortcuts, Spotlight, Focus filters, widgets, **and Control Center/Action Button** — one intent definition, many entry points. A "Quick Capture" or "Start Site Visit" intent is the natural anchor for items C6/C7 above. [developer.apple.com forums; createwithswift.com/integrating-app-intents-with-control-action]
- **Action Button + Control Center controls** (iOS 18+, so available today at the app's floor). iOS 18 lets third-party apps ship custom Control Center controls via the new Control API; any such control can then be mapped to the **Action Button** on iPhone 15 Pro/16 Pro-and-later hardware (device-dependent, not universal — older non-Pro iPhones and pre-15-Pro devices lack a physical Action Button, though Control Center controls still work for everyone via swipe-down). **Recommendation**: ship a "Start Field Capture" / "New Voice Note" Control Center control now (iOS 18-compatible), which doubles as an Action Button binding on capable hardware for free.
- **Lock Screen widgets** (WidgetKit, iOS 16+). Standard affordance for "at-a-glance, tap-to-jump-in" — e.g., a lock-screen widget showing the active project/site visit with a tap-through into capture, complementary to the Control Center control (control = *action*, widget = *glanceable status*).
- **Live Activities (ActivityKit, iOS 16.1+)**. Interactive cards pinned to the Lock Screen/Dynamic Island for real-time status; iOS 17 added server-push updates. **Max duration: 8 hours active, 12 hours visible on Lock Screen before forced end** — comfortably covers a single site visit or install day but not a multi-day job. A natural fit: an active "Site Visit — Project X" Live Activity showing capture count / elapsed time / a one-tap "add voice note" button, ending automatically or on manual wrap-up. Not found in current search results as a documented pattern for *this specific* field-companion use case — this is an **[inference]** application of a general-purpose capability, worth prototyping rather than assuming validated.
- **Siri voice invocation of App Intents** (iOS 16+; today). "Hey Siri, [custom phrase]" triggers an App Intent hands-free — directly serves the tape-measure-retiring, one-handed persona; no CarPlay dependency needed since this is phone-based dictation-while-busy, not drive-time.
- **Background audio recording rules** (`AVAudioSession`, longstanding API, works at 18.0): the app must declare the `audio` UIBackgroundMode and use `.record` or `.playAndRecord` category to keep recording once backgrounded. **Critical constraint**: iOS will **not, in general, allow starting a new recording while the app is already in the background** — recording must be *initiated* in the foreground (a deliberate privacy guard); once started in the foreground it *can* continue after backgrounding. This shapes the UX: a voice note must be explicitly started while Patina Field is frontmost (e.g., via the Control Center/Action Button entry, which *does* bring the app briefly forward) — it cannot be silently kicked off by a background trigger like a geofence entry without a foreground hop. Also: deactivate the audio session when not actively recording/playing, to avoid being torn down by the system or conflicting with another non-mixable audio app (e.g., a phone call, a podcast).
- **Core Location visit monitoring (`CLVisit`, iOS 8+, works at 18.0)**. The most power-efficient location service available — piggybacks on location data the system is already gathering rather than continuous GPS polling. Requires "Always" location authorization. Delivers `CLVisit` objects with `arrivalDate`/`departureDate`/`coordinate`/`horizontalAccuracy`; `departureDate == .distantFuture` signals "still there" (an arrival-only event). **Precision caveat**: the reported coordinate is a best-estimate center of the visit, not exact — good enough for "probably at Project X's address," not for room-level precision. **Applicable**: this is the mechanism for pattern C2 (auto-suggest project by location) without meaningfully affecting battery life, which matters for an all-day-carry field app.
- **EventKit calendar read** (`EKEventStore`, longstanding, works at 18.0). Requires `NSCalendarsUsageDescription` in Info.plist (not currently present — confirmed by reading `apps/mobile/Capture/Capture/Info.plist`, which today declares only the `field://` URL scheme). Standard read pattern: request access, fetch `EKEvent` objects with `title`/`startDate`/`endDate`/`location` properties. **Applicable directly** to "which project am I at" — cross-referencing a calendar event's title/location against the day's scheduled site visits is a cheap, no-new-permission-model way (once the Info.plist key is added) to pre-fill project context before a designer even opens the app, complementing `CLVisit`.
- **CarPlay-free dictation**: no CarPlay-specific research surfaced anything beyond generic Siri dictation; given the "on the move" framing here is walk-through-a-site rather than drive-time, CarPlay integration appears out of scope for this program and wasn't pursued further.

---

## Summary of load-bearing gaps / open questions for the orchestrator

- SpeechAnalyzer/SpeechTranscriber is gated on an **iOS 26 deployment-target bump** Patina Field does not currently have (confirmed 18.0 across all 8 build configs) — any design that assumes it needs that decision made explicit, not implied.
- WhisperKit device-tier gating (large-v3 variants need iPhone 15 Pro+/8GB RAM) means the on-device transcription *quality* a given designer gets will vary by their specific phone — worth deciding whether that's an acceptable UX inconsistency or whether tier-gating routes older devices straight to server transcription.
- No hands-on device/screenshot evidence was gathered for the competitor apps in Section C (per task scope, this was public-documentation research, not a `controlling-mobile-devices`/App-Store walkthrough) — if the program wants pixel-level UX comparison, that's a separate `analyzing-competitors`-skill pass.
- Deepgram vs. AssemblyAI diarization-inclusion pricing was contradictory across sources and should be verified against each vendor's live pricing page before a build decision, not taken from this file as final.
- The Live Activities "active site visit" application in Section D is an inference, not a confirmed pattern from another field-capture product — worth a small spike/prototype before committing design effort.
