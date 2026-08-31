# T1 — Technical architecture: the field-note pipeline and capture→project landing

**Date:** 2026-08-24 · **Agent:** T1 (read-only repo survey + design) · **Program:** Patina Field → true field companion
**Inputs:** [D1 field-app] `01-field-app-map.md` · [D2 backend] `02-backend-contract.md` · [D3 portal-flow] `03-portal-project-flow.md` · [D4 rulings] `04-intent-and-rulings.md` · [D5 substrate] `05-patina-substrate.md` · [D6 external] `06-external-research.md` · [D7 delivery] `07-delivery-infra.md`
**Method:** every discovery report read in full, then primary sources re-read in the repo. File:line citations throughout. Design proposals are marked **PROPOSED**; anything I could not prove from code is marked **(inference)**.

> **Read this first — three corrections to the discovery set, verified against source.**
>
> 1. **[D1] is right and [D5]/[D7] are wrong about voice audio.** `SpeechVoiceNoteService.swift` declares `private let mediaDirectory: URL?` (:22) and `private var audioFilename: String?` (:23). `mediaDirectory` is stored in `init` and **never read again**; `audioFilename` is **only ever read**, at :107, and assigned nowhere. Its own header comment ("The raw audio file is always kept alongside the text") is false — D5 §2.15 and D7 §Ready both quote that comment rather than the code. The three call sites *do* pass a real directory (`RecognitionScreens.swift:64`, `SiteScanHostScreen.swift:212`, `SiteScanContextCapture.swift:237` all pass `container.store.mediaDirectory()`), so the fix is entirely inside one file. **No audio has ever left a Field device.**
> 2. **`agent_tasks` cannot be the designer-facing draft surface.** Its only SELECT policy is admin-domain (`agent_tasks_select_admin`, `00297_agent_tasks_queue.sql:203-214` — `user_roles JOIN roles WHERE r.domain = 'admin'`). Leah reads nothing. The queue is the *job ledger*; the drafts need their own designer-scoped table. [D2 §8] correctly flagged the "pick a mechanism deliberately" question; this is the deciding fact.
> 3. **`commit_field_capture`'s inbox branch silently drops project routing.** `00235_commit_field_capture_rpc.sql:204-217` sets `status='inbox'` and returns; `project_id` / `project_room_id` / `shelf` are only written in the library branch (:255-266). Every note-shaped capture — which by definition goes to the inbox — arrives at the server with no project column. This is the single biggest schema-level obstacle to "lands in the right place."

---

## 0 · The shape of the answer, in one page

```
 iOS (Patina Field)                    Supabase                          Designer portal
 ─────────────────────                 ────────────────────────────      ─────────────────────
 hold mic / Action Button
   │
   ├─ AVAudioFile tap  ──────────► <AppGroup>/CaptureMedia/voice-*.m4a
   ├─ SFSpeechRecognizer (rotating 50s segments) ──► on-device DRAFT transcript
   │                                                 (orientation only — R114.1)
   ▼
 Specimen(capture_kind='note')  ──► SwiftData outbox (App Group, survives kill)
   │
   ├─ upload  ──────────────────► capture-media/<uid>/<clientToken>/voice-000.m4a
   └─ commit_field_capture  ────► field_captures  (status='inbox', NOW carrying project_id)
                                        │
                                        │  pg_cron */2m  →  invoke_edge_function
                                        ▼
                                  transcribe-field-note        ← 00340 derive-scan-photo-media pattern
                                   (Cloudflare Workers AI Whisper)
                                        │  stamps server_transcript + transcript_state
                                        │
                                        └─ enqueue_agent_task('field_note.structure', awaiting_review)
                                                     │
                                             pg_cron */2m
                                                     ▼
                                             structure-field-note        ← dispatch-scan-modal claim pattern
                                              (Claude Haiku 4.5, forced tool use)
                                                     │
                                                     ▼
                                             field_note_drafts  ◄── DESIGNER-READABLE (RLS: owner + project team)
                                             kind ∈ task|decision|measurement|
                                                    product_mention|preference|note
                                             state = 'proposed'
                                                     │
                                                     │  confirm_field_note_draft()   ← review_sms_message pattern
                                                     ▼
                                             project_tasks · client_decisions ·
                                             margin_notes · project_ffe_items
                                                                                    Desk "From the field"
                                                                                    margin_items 'field_note'
```

**Nothing on that path auto-mutates a business table.** The LLM's only write is a `field_note_drafts` row at `state='proposed'`; a human RPC call turns one into work. That satisfies AGENTS.md's "drafts land `awaiting_review`", R114.1's two-tier trust framing [D4 §2], and I53's confidence-gated shape [D4 §2] — while diverging from SMS on one point (SMS auto-applies at ≥0.8; this does not), which needs a Kody ruling (§7, K-04).

---

## 1 · Capture pipeline design

### 1.1 Deployment target — what is actually available

`apps/mobile/Capture/scripts/generate_project.rb:17` → `DEPLOYMENT = '18.0'`, applied to all four targets (`:28-30, :129`). [D6] independently confirmed 18.0 across all 8 build configs in the generated pbxproj.

Consequences:
- **`SpeechAnalyzer` / `SpeechTranscriber` are unavailable** (iOS 26 floor, [D6 §A1]). They can be adopted behind `if #available(iOS 26, *)` without moving the floor, but the 18.0 path must still exist and must still be correct — so they buy nothing in v1 and add a second code path to test. **PROPOSED: do not adopt in v1.**
- **`SFSpeechRecognizer` is what ships today**, is already permissioned (`generate_project.rb:87` `INFOPLIST_KEY_NSSpeechRecognitionUsageDescription` = "Transcribes your voice notes on-device."), and is already wired into two flows (N4 sheet, F2 mid-scan context capture).
- **WhisperKit is deliberately excluded from v1.** 547–955 MB model download, device-tier gating to iPhone 15 Pro+/8 GB ([D6 §A2]), a new SPM dependency at the app target, and a first-run download UX — all to improve a transcript that the server re-transcription supersedes anyway. It is the right *v3* answer if server transcription proves too slow or Leah works in dead zones for hours; it is the wrong v1 answer. **(judgement, not a finding)**

### 1.2 Recording — the concrete change

The existing engine already has an input tap installed for recognition (`SpeechVoiceNoteService.swift:74-76`). **PROPOSED: write the audio file from that same tap** rather than standing up a second `AVAudioRecorder` and a second `AVAudioSession` category negotiation.

```swift
// inside startLiveTranscription(), after `let format = inputNode.outputFormat(forBus: 0)`
let filename = "voice-\(UUID().uuidString.lowercased())-000.m4a"
let url = mediaDirectory?.appendingPathComponent(filename)
let file = url.flatMap { try? AVAudioFile(forWriting: $0, settings: [
    AVFormatIDKey: kAudioFormatMPEG4AAC,
    AVSampleRateKey: format.sampleRate,
    AVNumberOfChannelsKey: 1,
    AVEncoderBitRateKey: 32_000,
]) }
// inside the installTap block, alongside `self?.request?.append(buffer)`:
try? file?.write(from: buffer)
```

- **Format:** AAC-LC in an `.m4a` container. `LocalCaptureSyncService.mimeType(for:)` (:656-668) already maps `m4a → audio/x-m4a`, and `00234_capture_media_bucket.sql:26-29` already allows `audio/mp4, audio/x-m4a, audio/aac, audio/wav`. Zero downstream change.
- **Bitrate:** 32 kbps mono ≈ **240 KB/min**. A 5-minute note ≈ 1.2 MB; a 30-minute walkthrough ≈ 7 MB — well inside the bucket's 500 MB object limit and cheap on a job-site LTE connection. Speech at 32 kbps AAC is comfortably above what Whisper needs.
- **Failure is non-fatal:** if `AVAudioFile` construction throws, recognition continues and the note ships transcript-only — exactly today's behavior. This preserves the R108.5 "truth-framing over blocking" discipline [D4 §2].

### 1.3 Chunking — the load-bearing correctness detail

`SFSpeechRecognizer` caps at roughly **one minute of audio per recognition request** and ~1,000 requests/device/hour ([D6 §A1]). Today's code installs one request for the whole session, so **any note longer than about a minute silently truncates or errors**. The N4 sheet is hold-to-talk so this rarely bit; a walk-and-talk field note will hit it every time.

**PROPOSED — rotate the recognizer, never the file:**
- A `SegmentRotator` restarts the `SFSpeechAudioBufferRecognitionRequest` + `SFSpeechRecognitionTask` every ~50 s (below the cap, with margin), appending each finalized `bestTranscription.formattedString` to an accumulator with a single space.
- **The `AVAudioFile` is not rotated** — audio stays one continuous file per note. The audio is the durable truth; the on-device transcript is a lossy draft that the server replaces. Boundary word-loss in the draft is acceptable and is *exactly* what server re-transcription fixes.
- Emit `voice.segment_rotated` telemetry so boundary quality can be measured on real notes.
- Cap the note at a configurable ceiling (**PROPOSED: 20 minutes / 24 segments**) and end honestly with a visible "note ended at 20:00" rather than silently stopping.

### 1.4 Interruptions and backgrounding

Nothing in the app observes audio interruptions today (`grep AVAudioSession.interruptionNotification` over `apps/mobile/Capture` → no hits).

**PROPOSED:**
| Event | Handling |
|---|---|
| `AVAudioSession.interruptionNotification` `.began` (call, Siri, alarm) | finalize the current recognition segment, `file.close()`-equivalent (release the `AVAudioFile`), mark the note `interrupted`, keep everything already written |
| `.ended` with `.shouldResume` | open **segment N+1** as a new `.m4a` and resume; the note carries an ordered array of audio paths |
| `.mediaServicesWereResetNotification` | tear down and rebuild the engine; same segment-N+1 rule |
| Route change (AirPods yanked) | keep recording on the new route; surface a one-line honesty state |
| App backgrounded / screen locked | **currently stops.** No `UIBackgroundModes` key exists anywhere — `generate_project.rb` has zero `UIBackgroundModes` lines and `Capture/Info.plist` carries only the `field://` URL scheme (confirmed by [D7 §8] and re-grepped here). |

**Background audio decision.** Adding `UIBackgroundModes: [audio]` lets a note survive screen-lock and app-switching — which is the realistic site-walk behavior (phone goes in a pocket, designer keeps talking). It is a real App Review conversation and a real battery/privacy surface. iOS also **forbids starting a recording from the background** ([D6 §D]), so a Control-Center/Action-Button entry must foreground the app for a moment regardless. **PROPOSED: ship v1 without it (foreground-only recording, honest "recording paused" on lock), add it in the slice that adds App Intents, once there is a real note to justify it.** Kody ruling K-07.

Multi-segment audio means `field_captures.voice_audio_path` (a single `TEXT`, `00233:69`) is insufficient — see §2.

### 1.5 Durable local outbox

**Nothing new is needed here; the existing machinery is genuinely strong** and this is the biggest reason not to fork a parallel pipeline.

- `CaptureStore` is a SwiftData store in the App Group `group.cloud.patina.field` with a three-step fallback ladder (`CaptureStore.swift:75-115`), and media lives in `<AppGroup>/CaptureMedia/` (`:495-501`).
- `Specimen.clientToken` is the device-stable idempotency key that becomes `field_captures.client_capture_id` (`UNIQUE`, `00233:30`).
- `LocalCaptureSyncService.enqueue()` never touches the network; `drain()` is per-owner serialized and revalidates `activeOwner` at every await boundary; `LocalSyncError.isDeferrable` leaves a record queued with no retry penalty [D1 §3].
- `CaptureStore.missingRequiredMedia(for:)` (`:510-531`) **already treats `voiceAudioFilename` as required media** and `validateRequiredMedia` throws `CaptureMediaAvailabilityError.missingLocalMedia` if the file is gone. That check has been dead code because the filename is always nil; the moment §1.2 lands it becomes live and correct.
- `uploadMedia(for:...)` (`LocalCaptureSyncService.swift:360-419`) already uploads the voice file, already sets `payload.voice?.audioPath` (:313), and already counts it in progress.

**PROPOSED additive changes only** (SwiftData lightweight migration — `CaptureStore.schema` at `:41-45` has no `VersionedSchema`/`SchemaMigrationPlan`, so new *optional* properties migrate automatically; a new `@Model` class must be added to that `Schema([...])` array):
- `Specimen.captureKindRaw: String?` — `"specimen" | "note" | "context"`, nil ⇒ specimen (back-compat).
- `Specimen.voiceAudioSegmentsRaw: [String]` — ordered filenames; `voiceAudioFilename` keeps carrying segment 0 so the existing payload/mime/validate paths keep working unchanged.
- `Specimen.voiceAudioSha256: String?` — computed at finish, carried in the payload, used as the server-side re-transcription idempotency anchor (§1.9).
- `Specimen.transcriptEditedAt: Date?` — set when the designer edits the draft, so a later server transcript never silently clobbers her words (§1.7).

### 1.6 Storage path convention

Keep `capture-media/<uid>/<clientToken>/<artifact>` exactly. It is enforced by RLS on `(storage.foldername(name))[1] = auth.uid()::text` (`00234:41-43, 50-52, 58-60, 65-67`) and built in exactly one place, lowercased on both segments, with a dedicated test (`CaptureMediaPath.swift`, `CaptureMediaPathTests.swift`).

**PROPOSED artifact names inside that folder:**
```
capture-media/<uid>/<clientToken>/voice-000.m4a      # segment 0 (== voice_audio_path today)
capture-media/<uid>/<clientToken>/voice-001.m4a      # segment 1 after an interruption
capture-media/<uid>/<clientToken>/<photoUUID>.heic   # unchanged
```
Zero policy change, zero bucket change, upsert-idempotent replay preserved (the gateway already uploads with upsert, [D1 §5a step 8]).

> **Do NOT route this through the `media_objects` registry** (00489/00494/00495/00498). 00489's own header scopes it to the GPU splat pipeline and calls it "mutable until a second consumer adopts it" [D2 §1.3]. Becoming that second consumer would freeze a registry that is still moving, for zero v1 benefit. Revisit when dedup/lifecycle actually matters.

### 1.7 On-device draft vs server transcript — the reconciliation rule

R114.1 (2026-07-18) is the governing precedent [D4 §2]: **device output is orientation-only; only server-side processing is the record.** The same two-tier framing that governs the on-device splat preview governs the on-device transcript.

**PROPOSED:**
- The on-device draft lands in `voice_transcript` (existing column) with `transcript_source='device'`.
- The server transcript lands in a **new** `server_transcript` column with `transcript_source` flipped to `'server'`; `voice_transcript` is **never overwritten**.
- The UI reads `COALESCE(server_transcript, voice_transcript)` **unless** `transcript_edited_at IS NOT NULL`, in which case it keeps the designer's text and offers "a cleaner transcript is available" — one tap to view a diff, one tap to accept.
- Copy must never say "AI". The brand rule is absolute and appears in both DECISIONS.md §13 and `.agents/skills/patina-brand-voice/SKILL.md`: the capability is **Designer-Taught Intelligence**, never the two-letter abbreviation [D4 §6]. Honest, mechanism-quiet strings: "cleaned up", "a clearer read of this note".

### 1.8 Server-side trigger — the mechanism decision

Four candidates were on the table. **PROPOSED: a two-stage split, because transcription and structuring are different kinds of work.**

| Candidate | Verdict |
|---|---|
| **Storage webhook** | **Reject.** No Supabase storage webhook is used anywhere in the repo (zero hits across `supabase/functions`). It would be the only one, with no in-house failure precedent. |
| **DB trigger → `pg_net`** | **Reject as the primary path.** The idiom exists (`notify_back_in_stock`, `00258_edge_settings_vault.sql:88+`) but fires one HTTP POST per row insert, is untestable in the SQL suite, has no attempt/park semantics, and `net` is a *known accepted residual service-role-disclosure surface* on prod (MEMORY.md; `supabase/tests/edge_api/public_acl_exception_registry.sql` names the 12 `net` routines as permanent, signed exceptions). Adding new dependence on it is the wrong direction. |
| **pg_cron sweep + edge function** | **Adopt for transcription.** The exact `derive-scan-photo-media` pattern: `00340_scan_photo_derivatives.sql:52-73` — a partial index over the sweep predicate, `cron.schedule(name, '*/5 * * * *', $$SELECT public.invoke_edge_function('derive-scan-photo-media','{}'::jsonb)$$)`, `derive_attempts < 5` terminal park, `derive_error` for triage, a `job_runs` row per invocation, and a **billing guard that checks for eligible rows before any outbound call** (`derive-scan-photo-media/index.ts:38-45`). Transcription is pure derivation writing derived columns on a row the designer already owns — it is the same shape of work. |
| **`agent_tasks` kind** | **Adopt for structuring.** CLAUDE.md: "agents write business data ONLY via `enqueue_agent_task`". LLM structuring produces *proposals about business objects*; it belongs in the audited queue with `status='awaiting_review'`, `confidence`, `idempotency_key`, and `review_agent_task`. `task_type` is an **open set with deliberately no CHECK** (`00297:41`), so a new kind is **zero DDL** — the same free ride `scan_pipeline.refine/fuse/splat` took [D4 §2]. `dispatch-scan-modal` is the in-repo precedent for an edge function claiming tasks via `claim_agent_tasks` on a 5-minute cron [D2 §8]. |

**Why not put transcription in the queue too?** Because `agent_tasks` reads are admin-only (00297:203-214) and transcription produces nothing a human reviews; parking it in the queue adds a review lane nobody uses and makes a two-hop pipeline out of a one-hop derivation. **Why not put structuring on a plain sweep?** Because its output *is* a proposal about business data, and the house rule names the queue for exactly that. This split is defensible in both directions and is the main architectural judgement in this document.

### 1.9 Idempotency keys — every hop

| Hop | Key | Enforcement |
|---|---|---|
| capture row | `client_capture_id` | `UNIQUE` (`00233:30`); `commit_field_capture` is `ON CONFLICT DO UPDATE ... WHERE status NOT IN ('saved','dismissed')` (`00235:147-192`) |
| audio object | `capture-media/<uid>/<clientToken>/voice-NNN.m4a` | upsert PUT — replay overwrites identical bytes |
| audio integrity | `voice_audio_sha256` in the payload → `artifacts_sha256` via `merge_capture_artifact_sha256` (`00235:382-395`) | existing RPC, JSONB-merge |
| transcription | **PROPOSED** `transcribed_sha256` column; the sweep predicate is `transcript_state='pending' AND voice_audio_path IS NOT NULL`, and the function no-ops when `transcribed_sha256 = voice_audio_sha256` | a re-run is free; a *different* sha (re-recorded note) legitimately re-transcribes |
| structuring enqueue | `idempotency_key = 'field_note.structure:' || capture_id || ':' || transcribed_sha256` | `agent_tasks.idempotency_key` is `UNIQUE` (`00297:54`) and `enqueue_agent_task` dedupes with `p_on_conflict` (`_shared/agent-queue.ts:78`) |
| draft rows | **PROPOSED** `UNIQUE (capture_id, extraction_run_id, ordinal)` + a `content_hash`; a new run **supersedes** prior `proposed` rows (`state='superseded'`) rather than duplicating, and never touches `confirmed`/`dismissed` rows | mirrors `site_binder_entries.supersedes_entry_id` [D2 §1.5] |
| confirmation | the confirm RPC is a no-op when `state <> 'proposed'` and returns the existing `created_*_id` | mirrors `commit_field_capture`'s "already saved ⇒ idempotent no-op" (`00235:193-202`) |

### 1.10 LLM structuring — model, schema, grounding

**Reuse the house pattern verbatim.** `supabase/functions/_shared/field-parse.ts` is a working, tested, injectable Claude forced-tool-use module: direct `fetch` to `https://api.anthropic.com/v1/messages` with `x-api-key` + `anthropic-version: 2023-06-01`, `tools: [TOOL]`, `tool_choice: { type: 'tool', name: TOOL_NAME }`, and a `normalizeParse` that **drops any target id the model was not actually shown** (:200-217). `project-ffe-document-extract/index.ts:45-61` is the richer sibling (Sonnet 5, `disable_parallel_tool_use: true`, `validateExtraction` before any write, `stage_project_ffe_document_extraction` as the only landing path).

**PROPOSED `_shared/field-note-extract.ts`** — a twin of `field-parse.ts` (injectable `fetchImpl`/`getEnv` so the SQL/Deno tests run with no network):

```ts
const DEFAULT_MODEL = "claude-haiku-4-5";   // same default as field-parse.ts:50
const TOOL_NAME = "record_field_note_items";

input_schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: { type: "array", items: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind:        { enum: ["task","decision","measurement","product_mention","preference","note"] },
        title:       { type: "string" },              // ≤120 chars, imperative for tasks
        detail:      { type: "string" },
        source_quote:{ type: "string" },              // VERBATIM substring of the transcript
        confidence:  { type: "number" },              // 0..1
        room_hint:   { type: ["string","null"] },     // free text the designer said, NOT an id
        due_hint:    { type: ["string","null"] },     // YYYY-MM-DD resolved against today
        court:       { enum: ["designer","client","gc","vendor","sub","installer","receiver", null] },
        measurement: { type: ["object","null"], properties: {
                         value:{type:"number"}, unit:{enum:["in","ft","mm","cm","m"]},
                         axis:{enum:["width","height","depth","length", null]} } },
        needs_confirmation: { type: "boolean" }
      },
      required: ["kind","title","detail","source_quote","confidence","needs_confirmation"]
    }}
  },
  required: ["items"]
};
```

Anti-hallucination rules, each with a mechanical check in `normalize()` — not a second LLM call:
1. **`source_quote` must be a literal substring of the transcript** (after whitespace normalization). If it is not, the item is dropped. This is [D6 §B2]'s strongest lever and it is trivially checkable.
2. **Never invent an id.** The model is shown project/room/task titles for context but returns `room_hint` as *text*, never a uuid. Resolution to a real `project_rooms.id` happens in Postgres at confirm time, against rows the caller can see. This is `field-parse.ts:212`'s "only trust an id the model was actually shown" rule, taken one step further to "never let it emit an id at all."
3. **Numbers are always `needs_confirmation: true`.** A spoken "thirty-two and a quarter" becoming `32` with a guessed unit is the classic failure ([D6 §B2]). A `measurement` draft never writes a dimension without a tap. This also honors R108.1 — typed anchors only; a spoken measurement is not a measured record [D4 §2].
4. **Flag, don't fill.** A task with no owner and no date comes back with `court: null`, `due_hint: null`, `needs_confirmation: true` — not a confidently assigned task.
5. **Whole transcript in one call.** Even a 20-minute note is ~3k words ≈ 4k tokens; chunking would lose the pronoun/reference resolution that makes extraction useful ([D6 §B2]).

**Confidence gate.** `sms-inbound/pipeline.ts` uses ≥0.8 apply / 0.5–0.8 clarify / <0.5 review (`:547, :574, :586, :605`). **PROPOSED for field notes: no auto-apply at any confidence in v1.** Confidence orders the list and pre-selects the high-confidence items in the confirm sheet; it never commits. Rationale: an inbound SMS is a third party reporting a fact against a *bounded set of open items the model was shown*; a voice note is open-ended authoring against the whole project. The blast radius of a wrong auto-applied task in the designer's own document is higher and the correction cost is hers. This is a deliberate divergence from I53 and needs Kody's word — **K-04**.

### 1.11 Cost model

Volume assumption for the pilot (**inference** — no telemetry exists to ground it; see §7 R-01): 5 designers × 6 notes/day × 2.5 min ≈ **2,250 audio-minutes/month**.

| Line | Rate (source) | @2,250 min/mo | @20,000 min/mo |
|---|---|---|---|
| Cloudflare Workers AI `whisper-large-v3-turbo` | $0.00051/audio-min [D6 §A3] | **$1.15** | $10.20 |
| Claude Haiku 4.5 structuring (~1.5k in / 0.6k out per note) | $1 / $5 per MTok [D6 §B1] | **$4.05** (900 notes) | $36 |
| Supabase storage (32 kbps AAC ≈ 240 KB/min) | ~$0.021/GB-mo | **$0.01** | $0.10 |
| Egress (portal playback) | — | negligible | negligible |
| **Total** | | **≈ $5.25/mo** | **≈ $46/mo** |

Alternatives if Workers AI disappoints: **Groq Whisper turbo** ~$0.00067/min at 217–228× realtime [D6 §A3] — comparable price, dramatically lower latency, but a new vendor. **OpenAI `gpt-4o-mini-transcribe`** $0.003/min — 6× the price and audio leaves to a third party. Cloudflare wins on the one axis that matters beyond price: **the audio never leaves an account Patina already controls** (§1.13).

Structuring cost is immaterial next to nothing; model choice should be driven by extraction quality. **PROPOSED: Haiku 4.5 default, with the model injectable per `field-parse.ts:47` (`deps.model`) so a quality problem is a config flip to `claude-sonnet-5`, not a code change.**

### 1.12 Failure modes and retries

| # | Failure | Detection | Behavior |
|---|---|---|---|
| F1 | `AVAudioFile` won't open (disk full, no App Group) | throw at construction | recognition continues; note ships transcript-only; `voice.audio_write_failed` event; **never blocks the capture** |
| F2 | Speech authorization denied / recognizer unavailable | existing `VoiceNoteError.recognizerUnavailable` | existing typed-note fallback (`VoiceNoteSheet`) — **but the audio should still record**, so the server can transcribe what the device couldn't. This inverts today's all-or-nothing behavior. |
| F3 | Recognition throws mid-note | `AsyncThrowingStream` finishes throwing | keep the audio + the partial draft; mark `transcript_source='device_partial'`; server transcription is the repair |
| F4 | Upload fails (offline) | existing `LocalSyncError.isDeferrable` | record stays `.queued`, no retry penalty; drains on next enqueue / launch reconcile / manual "Retry all". **Gap: no `NWPathMonitor` exists anywhere in the app** [D1 §8] — regained connectivity never auto-drains. §5.6. |
| F5 | Local audio file vanished before upload | `CaptureStore.missingRequiredMedia` (`:517-521`) | `CaptureMediaAvailabilityError` ⇒ record marked **rejected** (review-gated, excluded from bulk drain) — existing, correct |
| F6 | `commit_field_capture` fails | existing safe-harbor `EXCEPTION WHEN OTHERS` (`00235:272-300`) | parks at `status='inbox'` with the error in `raw_payload.conflict`; sync never hard-fails |
| F7 | Transcription vendor down / unconfigured | function checks env + a cheap probe | **skip without touching any row** — the `derive-scan-photo-media` degradation rule (`index.ts:32-37`): nothing burns an attempt against a dead worker; a `job_runs` row records the skip |
| F8 | Transcription returns garbage / empty | empty or < N chars | `transcribe_attempts += 1`, `transcribe_error` stamped; **park at 5 attempts** with `transcript_state='failed'`; the note is still fully usable (device draft + audio playback) |
| F9 | Anthropic call fails | `field-parse.ts:181-197` precedent | `complete_agent_task(outcome:'failed')`; Postgres decides backoff/park (`00297` state machine, max_attempts 5); `groom_agent_tasks` (00300, every 6h) requeues cooled-down failures once |
| F10 | Model returns an unquotable item | `source_quote` substring check | item dropped silently, count recorded in `agent_tasks.artifacts.dropped_count` for calibration |
| F11 | Model returns zero items | valid outcome | task completes `done`, zero drafts; the note stays a note — this is correct, most notes are just notes |
| F12 | Designer confirms a draft whose target vanished | confirm RPC re-resolves under RLS | raises `no_data_found`; the draft returns to `proposed` with a re-pick prompt |
| F13 | Two devices commit the same `client_capture_id` | `UNIQUE` + `ON CONFLICT` | second wins field updates, cannot resurrect a `saved`/`dismissed` row |
| F14 | Stuck `queued` capture (device died mid-upload) | **no server-side detector exists** — [D2 §9.6] is right: `field_captures` has no `confirm-scan-bundle` equivalent | **PROPOSED:** the same sweep that transcribes also parks captures `status='queued' AND synced_at < now() - interval '24 hours'` into `status='inbox'` with an `upload_error` stamp, so a half-uploaded note becomes visible rather than invisible |

### 1.13 PII and consent

This is the part of the design most likely to need a lawyer's eye, and I am flagging rather than deciding.

**The facts.**
- A field voice note will routinely record **other people's voices** — the client on a walk-through, a GC, a homeowner's family — often without them thinking about it.
- **All-party-consent states** (CA, IL, WA, FL, PA, MA, MD, MI, MT, NH, CT, DE, NV, OR) make surreptitious recording of a private conversation a criminal matter. Wisconsin (Middle West Studio's home) is one-party. Leah's clients are not guaranteed to be. **(inference: I did not find any recording-consent policy anywhere under `docs/`; grep for "consent" hits only SMS consent, `project_parties.sms_consent_status`, 00281.)**
- Patina already has a consent vocabulary and a precedent for gating on it: `sms_consent_status` + `consent snapshot` on `site_requests` [D2 §1.4, §1.5].

**PROPOSED controls.**
1. **Never ambient.** No always-on listening, no auto-start on geofence. Recording begins on a deliberate act, ends on a deliberate act or a cap. (This also falls out of iOS's own "can't start recording in the background" rule, [D6 §D].)
2. **Unmissable indicator.** iOS's orange mic dot is not enough on its own — a persistent in-app recording chrome plus (when background audio eventually lands) a Live Activity showing "recording · 4:12". The ActivityKit attributes already exist (`CaptureKit/LiveActivity/CaptureSyncAttributes.swift`) but cannot render without a widget target [D1 §2].
3. **A note is one of two kinds, chosen at start:** *solo note* (Leah talking to herself) or *conversation* (someone else is present). A conversation note shows a one-line "Everyone here knows this is being recorded" affirmation the designer taps. It is a nudge, not legal advice — but it converts an invisible act into a deliberate one, which is both the ethical and the defensible posture.
4. **Audio retention is a policy, not an accident.** **PROPOSED: `field_captures.audio_retention` ∈ `keep | discard_after_transcript | 90_days`, default `90_days`**, with a `field-note-media-maintenance` cron purging expired audio and stamping `voice_audio_purged_at`. The transcript survives; the audio does not. This mirrors `site-request-media-maintenance`'s 90-day purge of unapproved evidence (00375, [D2 §8]) — the house already has this exact shape.
5. **Subprocessor minimization.** Cloudflare Workers AI keeps audio inside Patina's existing Cloudflare account [D6 §A3/§A5] — the same account the portals and services already run in, so it adds **no new subprocessor**. Groq/OpenAI/Deepgram each would. That is worth more than the price difference.
6. **Transcripts are studio-private by default.** `margin_notes` is explicitly designer-authored, studio-visible, **never client-visible** (`use-margin-notes.ts:1-8`). A confirmed field note should inherit that posture; anything that would become client-visible (a `client_decisions` row, a `comms_messages` post) is a deliberate, separate act with its own confirm step. AGENTS.md's "No automated external sends — drafts land `awaiting_review`" applies with full force.
7. **Never a client-facing surface in v1.** PRD O2 ("client visibility into the Site Binder — a share-view, or never?") is explicitly open [D4 §5]. Field notes must not pre-empt that ruling.

---

## 2 · Data model

**Migration numbering.** Filesystem max observed today: **`00513_invoice_numbering_studio_uniqueness.sql`**. Gaps exist at 00487, 00488, 00496, 00497, 00502–00509. **`00512` is parked and unapplied** on branch `followon/sd-caller-hardening-00512` (MEMORY.md; `docs/follow-ups/sd-caller-hardening-00512-followon.md`), so prod's ledger head is 00513 **with 00512 absent** — a hole in the middle of the applied range. Two consequences:
- **Start this program at `00514`.**
- **Re-verify against the live ledger before writing a byte** (`supabase migration list` against Strata, per `patina-db-migrations`). The filesystem is not the ledger, parallel branches reserve numbers, and this program will likely run concurrently with the parked-00512 follow-on.
- Everything below is also subject to the **PUBLIC ACL conformance gate**: any new `public.` routine that is not explicitly `REVOKE ALL ... FROM PUBLIC, anon` will trip `supabase/tests/edge_api/public_acl_exception_registry.sql` / `public_rpc_authorization_contract_test.sql`. The 00437 idiom is the one to copy (`00437_ffe_service_boundaries.sql:516-529`): `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role; GRANT EXECUTE ... TO <exactly the role that needs it>`. MEMORY.md's durable lesson — "prod default-privs auto-grant anon EXECUTE on new public fns" — has bitten twice.

### 2.1 `00514_field_notes_capture_kind.sql` — extend `field_captures`, don't fork it

I considered a fresh `field_notes` table. **Extending wins**, for four evidence-grounded reasons: (a) the entire offline outbox, bucket, RLS, idempotency, guard trigger and upload pipeline already exist and are tested for `field_captures`; (b) R108.2 already rules that non-Pro context capture — photos *and voice notes* — lands in this inbox [D4 §2]; (c) I84 explicitly warns against minting a *third* "Capture Inbox" concept [D4 §2]; (d) a note and a specimen share ~80% of the row (owner, org, venue, photos, voice, provenance, upload state). The cost is 40 mostly-null product columns per note — cheap, and honest about the fact that a market specimen and a site note really are the same *act*.

```sql
ALTER TABLE field_captures
  ADD COLUMN IF NOT EXISTS capture_kind text NOT NULL DEFAULT 'specimen'
    CHECK (capture_kind IN ('specimen','note','context')),

  -- multi-segment audio (interruption-safe). voice_audio_path keeps carrying
  -- segment 0 so every existing reader/writer is untouched.
  ADD COLUMN IF NOT EXISTS voice_audio_segments jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS voice_audio_sha256   text,
  ADD COLUMN IF NOT EXISTS voice_audio_purged_at timestamptz,
  ADD COLUMN IF NOT EXISTS audio_retention text NOT NULL DEFAULT '90_days'
    CHECK (audio_retention IN ('keep','discard_after_transcript','90_days')),

  -- transcript lanes (device draft never overwritten — R114.1)
  ADD COLUMN IF NOT EXISTS transcript_source text
    CHECK (transcript_source IS NULL OR transcript_source IN ('device','device_partial','server','designer')),
  ADD COLUMN IF NOT EXISTS server_transcript   text,
  ADD COLUMN IF NOT EXISTS transcript_segments jsonb,        -- word/segment timings from the vendor
  ADD COLUMN IF NOT EXISTS transcript_edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS transcript_state text NOT NULL DEFAULT 'none'
    CHECK (transcript_state IN ('none','pending','running','done','failed','skipped')),
  ADD COLUMN IF NOT EXISTS transcribed_sha256  text,
  ADD COLUMN IF NOT EXISTS transcribe_attempts smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transcribe_error    text,

  -- structuring lane
  ADD COLUMN IF NOT EXISTS structure_state text NOT NULL DEFAULT 'none'
    CHECK (structure_state IN ('none','pending','running','done','failed','skipped')),
  ADD COLUMN IF NOT EXISTS structured_at timestamptz,

  -- consent posture (§1.13)
  ADD COLUMN IF NOT EXISTS note_setting text
    CHECK (note_setting IS NULL OR note_setting IN ('solo','conversation'));

-- The sweep predicate, indexed (00340:53-55 idiom: static predicates in the
-- WHERE, the cheap counter left to a filter).
CREATE INDEX IF NOT EXISTS idx_field_captures_transcribe_pending
  ON field_captures (created_at)
  WHERE transcript_state = 'pending' AND voice_audio_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_field_captures_note_inbox
  ON field_captures (designer_id, created_at DESC)
  WHERE capture_kind IN ('note','context') AND status = 'inbox';

-- Carried since R112/R113 and never landed: the provenance GIN index
-- [D4 §4 item 9]. useScanContextCaptures does a @> containment filter
-- (use-room-files.ts:361-395) that is a seq scan today.
CREATE INDEX IF NOT EXISTS idx_field_captures_provenance_gin
  ON field_captures USING gin (provenance jsonb_path_ops);
```

**RLS.** The four owner policies (00233:154-169) and `field_captures_org_inbox_select` (:176-188) are inherited unchanged. Two notes:
- Those policies have **no `TO authenticated` clause** — they default to `PUBLIC`. `auth.uid()` is null for `anon` so no rows leak today, but house convention after the mood-board incident is explicit `TO authenticated` (MEMORY.md; 00485). **PROPOSED: restate all five policies `TO authenticated` in this migration** — a one-line-each hardening with no behavior change.
- The **RLS asymmetry** [D2 §9.4, D3 §G6] is now load-bearing rather than cosmetic: `room_files` delegates to `room_scans` visibility (owner + designer-association + studio co-member, 00341) while `field_captures` is owner + org-inbox only. A studio co-member reading a project sees the drawings and an empty note list. **PROPOSED: add `field_captures_project_team_select`** — SELECT to `authenticated` where `project_id IS NOT NULL AND public.is_project_team_member(project_id, auth.uid())` (the helper `review_sms_message` uses, `00282:531`). That makes "everything the studio captured on this project" actually true. **Kody ruling K-03** (per-designer vs per-studio inbox — [D3 §11 Q3]).

### 2.2 `00515_field_capture_inbox_routing.sql` — fix the association hole

The correction from the headline. `commit_field_capture`'s inbox branch (`00235:204-217`) must persist routing:

```sql
CREATE OR REPLACE FUNCTION commit_field_capture(...)  -- same signature, same SECURITY INVOKER
...
  IF p_destination = 'inbox' THEN
    UPDATE field_captures
       SET status          = 'inbox',
           project_id      = COALESCE(p_project_id, project_id),
           project_room_id = COALESCE(p_project_room_id, project_room_id),
           shelf           = COALESCE(p_shelf, shelf)
     WHERE id = v_capture.id
    RETURNING * INTO v_capture;
    ...
```

Safe because `field_captures_guard_routing` (00233:196-256) runs `BEFORE UPDATE` under `SECURITY INVOKER` and rejects a project the caller doesn't own or a room outside it. **But `SiteScan.projectRoomID` is a `public.rooms` id, not a `project_rooms` id** (`ContextCaptureProvenance.swift:29-31`) — so the *scan-context* flow must keep passing `p_project_room_id = NULL` and keep its room in provenance. Only `p_project_id` becomes durable for context captures; `p_project_room_id` becomes durable for note captures where the designer picked a `project_rooms` row.

This leaves **two live association mechanisms**, exactly as [D2 §9.3] warns, but now with a clean rule instead of an accident:

| Association | Column | Provenance | Used by |
|---|---|---|---|
| project | `project_id` (**now durable for all destinations**) | `siteScanContext.projectId` (mirror, for back-compat) | every kind |
| FF&E room | `project_room_id` | — | `specimen`, `note` |
| scan room (`public.rooms`) | — | `siteScanContext.projectRoomId` | `context` only |
| scan pin | — | `siteScanContext.scanId` + `.cameraPose` | `context` only |

**Do not change the flat dotted-key convention.** `use-room-files.ts:361-395` filters `.contains('provenance', {'siteScanContext.scanId': scanId})` and its own comment records that the nested path "matches zero real captures"; `ContextCaptureProvenance.swift:57-63` is the frozen writer. Changing it breaks a shipped reader for no gain.

### 2.3 `00516_field_note_drafts.sql` — the designer-readable proposal table

**Naming.** Not "Capture Inbox" (I84 collision with both `field_captures` and `proposal_captures`), not "request" (three existing senses, R98/PRD/I53) [D4 §6]. `field_note_drafts` — a *draft* is already a live noun in this product (draft proposal, draft invoice, draft product) and it says exactly what the row is.

```sql
CREATE TABLE IF NOT EXISTS public.field_note_drafts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id        uuid NOT NULL REFERENCES field_captures(id) ON DELETE CASCADE,
  designer_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id        uuid REFERENCES projects(id) ON DELETE SET NULL,
  project_room_id   uuid REFERENCES project_rooms(id) ON DELETE SET NULL,

  extraction_run_id uuid NOT NULL,        -- one per structure-field-note pass
  ordinal           int  NOT NULL,
  content_hash      text NOT NULL,        -- sha256(kind|title|source_quote)

  kind              text NOT NULL CHECK (kind IN
                      ('task','decision','measurement','product_mention','preference','note')),
  title             text NOT NULL,
  detail            text NOT NULL DEFAULT '',
  source_quote      text NOT NULL,        -- VERBATIM transcript substring (checked in code)
  confidence        numeric(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  proposed          jsonb NOT NULL DEFAULT '{}',   -- kind-specific: due_hint, court, measurement{}, room_hint
  needs_confirmation boolean NOT NULL DEFAULT true,

  state             text NOT NULL DEFAULT 'proposed'
                      CHECK (state IN ('proposed','confirmed','dismissed','superseded')),
  -- what it became (exactly one non-null when state='confirmed')
  created_task_id        uuid REFERENCES project_tasks(id)     ON DELETE SET NULL,
  created_decision_id    uuid REFERENCES client_decisions(id)  ON DELETE SET NULL,
  created_margin_note_id uuid REFERENCES margin_notes(id)      ON DELETE SET NULL,
  created_ffe_item_id    uuid REFERENCES project_ffe_items(id) ON DELETE SET NULL,

  reviewed_at   timestamptz,
  reviewed_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  model         text,                     -- 'claude-haiku-4-5'
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (capture_id, extraction_run_id, ordinal)
);

CREATE INDEX idx_field_note_drafts_open
  ON public.field_note_drafts (designer_id, created_at DESC) WHERE state = 'proposed';
CREATE INDEX idx_field_note_drafts_capture ON public.field_note_drafts (capture_id);
CREATE INDEX idx_field_note_drafts_project
  ON public.field_note_drafts (project_id, state) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX idx_field_note_drafts_live_content
  ON public.field_note_drafts (capture_id, content_hash) WHERE state = 'proposed';

ALTER TABLE public.field_note_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY field_note_drafts_owner_select ON public.field_note_drafts
  FOR SELECT TO authenticated USING (designer_id = auth.uid());

CREATE POLICY field_note_drafts_team_select ON public.field_note_drafts
  FOR SELECT TO authenticated
  USING (project_id IS NOT NULL AND public.is_project_team_member(project_id, auth.uid()));

-- No INSERT/UPDATE/DELETE policies: writes only through the DEFINER RPCs below
-- and the service-role worker. Same posture as agent_tasks (00297:227-228).
GRANT SELECT ON public.field_note_drafts TO authenticated;
```

**Why a table and not a JSONB column on `field_captures`?** `sms_messages` parks one parse in `parsed_intent` because an SMS is one intent. A three-minute note yields N items that are confirmed, dismissed, and re-run independently, each needing its own FK to what it became and its own index for a Desk population. This is the `site_binder_entries` shape (append-only, approved, supersedable) [D2 §1.5], not the `parsed_intent` shape.

### 2.4 `00517_field_note_rpcs.sql` — the write path

Three RPCs. The applier is `SECURITY DEFINER` and revoked from `authenticated` entirely; the designer-facing RPC authorizes first, then calls it. That is `apply_field_effect` / `review_sms_message` (00282:472, :561-562) copied exactly.

```sql
-- Internal applier: turns ONE confirmed draft into real work. SECURITY DEFINER,
-- revoked from PUBLIC, anon AND authenticated (00282:472 posture).
CREATE FUNCTION public._apply_field_note_draft(p_draft_id uuid, p_patch jsonb)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ ... $$;

-- Designer-facing. Authorizes the caller against the capture's owner OR the
-- project team, applies the (optionally designer-edited) draft, stamps review.
CREATE FUNCTION public.confirm_field_note_draft(
  p_draft_id uuid,
  p_patch    jsonb DEFAULT NULL      -- designer's edits win over the model's proposal
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  -- 1. auth.uid() IS NOT NULL else insufficient_privilege
  -- 2. load draft; NOT FOUND -> no_data_found
  -- 3. authorize: designer_id = auth.uid()
  --      OR (project_id IS NOT NULL AND is_project_team_member(project_id, auth.uid()))
  --    else insufficient_privilege                         <- 00282:530-537 idiom
  -- 4. state <> 'proposed' -> idempotent return of created_* ids
  -- 5. _apply_field_note_draft(...)  -> writes ONE of:
  --      project_tasks | client_decisions (via create_client_decision)
  --      | margin_notes | project_ffe_items (via place/upsert)
  -- 6. state='confirmed', reviewed_at=now(), reviewed_by=auth.uid(), created_*_id
$$;

CREATE FUNCTION public.dismiss_field_note_draft(p_draft_id uuid, p_reason text DEFAULT NULL)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ ... $$;

-- Worker-only: land an extraction run's items. Supersedes prior 'proposed' rows
-- for the same capture; never touches 'confirmed'/'dismissed'.
CREATE FUNCTION public.stage_field_note_drafts(
  p_capture_id uuid, p_run_id uuid, p_model text, p_items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ ... $$;

REVOKE ALL ON FUNCTION public._apply_field_note_draft(uuid, jsonb),
  public.stage_field_note_drafts(uuid, uuid, text, jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stage_field_note_drafts(uuid, uuid, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.confirm_field_note_draft(uuid, jsonb),
  public.dismiss_field_note_draft(uuid, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_field_note_draft(uuid, jsonb),
  public.dismiss_field_note_draft(uuid, text) TO authenticated;
```

**The measurement rule, in SQL.** `_apply_field_note_draft` **must refuse** to write a `room_file_measurements` row from a `measurement` draft. R108.1 and R114.1 both say a spoken number is not a measured record [D4 §2]. A confirmed `measurement` draft writes a `margin_notes` row (or `discovery.site_notes` text) that *says* the number, tagged as spoken — never the published measurement set, never `tolerance_class='verified'`. Kody ruling **K-05**.

### 2.5 `00518_field_note_margin_branch.sql` — make it visible where she reads

`margin_items` gets a `field_note` branch. `00282_sms_core.sql:600-604` documents the discipline: recreate the prior body **verbatim** and append exactly one UNION branch. The `field_sms` branch (`:871-899`) is the byte-for-byte template — same 11 columns, `state` computed from a needs-review predicate, a `payload` JSONB the rail renders:

```sql
select
  'field_note'::text                        as kind,
  fc.id                                     as item_id,
  fc.project_id                             as project_id,
  null::uuid                                as proposal_id,
  'letterhead'::text                        as anchor_kind,
  null::uuid                                as anchor_id,
  case when exists (select 1 from field_note_drafts d
                     where d.capture_id = fc.id and d.state = 'proposed')
       then 'needs_review' else 'logged' end as state,
  coalesce(nullif(fc.title,''), 'Field note') as title,
  left(coalesce(fc.server_transcript, fc.voice_transcript, fc.notes, ''), 140) as detail,
  fc.captured_at                            as ts,
  jsonb_build_object(
    'capture_kind', fc.capture_kind, 'venue_label', fc.venue_label,
    'duration_seconds', fc.voice_duration_seconds,
    'transcript_state', fc.transcript_state,
    'draft_count', (select count(*) from field_note_drafts d
                     where d.capture_id = fc.id and d.state = 'proposed'),
    'photo_count', jsonb_array_length(fc.photos)
  )                                         as payload
from field_captures fc
where fc.capture_kind in ('note','context') and fc.project_id is not null
  and fc.status <> 'dismissed';
```

Then extend `lib/document/margin-derivation.ts:11-19`'s kind union with `field_note`. That is the smallest possible change that puts Leah's own capture in the document she is standing in — and [D3 §10 rec 5] independently arrives at the same seam.

### 2.6 Storage bucket policies

**No change.** `capture-media` (00234) already allows every audio MIME the recorder will produce, is private, is owner-scoped on `foldername[1]`, and has a 500 MB object limit. The only storage-adjacent addition is **read access for the portal**, which is not a policy change — the portal signs URLs server-side with `createSignedUrls`, exactly as `letterhead-instruments.tsx:118-130` already does for `room-scans` (§4.1).

One real gap: the org-inbox SELECT policy on the *row* has no counterpart on the *object* — a studio co-member can read an inbox capture row but cannot read its media (`00234:38-45` gates on `auth.uid()` only). If K-03 rules the inbox studio-wide, the bucket policy needs a matching co-member branch, and that is a `storage.objects` policy owned by `supabase_storage_admin` — i.e. a **platform-admin phase migration**, not an ordinary one (`00483` header spells out this split). Flag as a real sequencing cost of K-03.

---

## 3 · Edge functions

| Function | verify_jwt | Caller(s) | Input | Output | Notes |
|---|---|---|---|---|---|
| **`transcribe-field-note`** | `true` (platform default; **declare it explicitly in `config.toml` for intent**, per the `derive-scan-photo-media` stanza at `config.toml:484-485`) | pg_cron every 2 min; targeted service-role call | `{}` (sweep) · `{ captureId, force? }` | `{ processed, skipped, failed, jobRunId }` | Requires `role === 'service_role'` decoded from the Bearer in-code — `derive-scan-photo-media/index.ts:87-97, 226-229` idiom. **Billing guard**: existence check against the sweep predicate before any outbound HTTP (`index.ts:38-45`). `job_runs` row per invocation. Sweep limit 10, `transcribe_attempts < 5` terminal park. |
| **`structure-field-note`** | `true` (explicit) | pg_cron every 2 min | `{}` · `{ captureId, force? }` | `{ claimed, staged, failed }` | Claims `field_note.structure` tasks via `claim_agent_tasks(['field_note.structure'], 5, 'structure-field-note', '5 minutes')` (`_shared/agent-queue.ts:108-124`); calls `_shared/field-note-extract.ts`; lands via `stage_field_note_drafts`; `complete_agent_task(outcome:'awaiting_review', artifacts:{run_id, item_count, dropped_count}, confidence: mean)`. |
| **`field-note-media-maintenance`** | `true` (explicit) | pg_cron daily | `{}` | `{ purged }` | Purges audio past `audio_retention`, stamps `voice_audio_purged_at`. Mirrors `site-request-media-maintenance` (00375). Slice S2+. |

**Shared modules.**
- **New** `supabase/functions/_shared/field-note-extract.ts` — the Claude forced-tool-use twin of `field-parse.ts`, with `fetchImpl`/`getEnv`/`model` injectable so the Deno tests run offline (`field-parse.ts:44-48` is the exact shape). Ships with a `normalize()` that enforces the five anti-hallucination rules of §1.10 and a `*.test.ts` beside it.
- **New** `supabase/functions/_shared/transcribe.ts` — a thin vendor-swappable transcription client (`transcribe(audio: Uint8Array, opts) → { text, segments, model }`), so a vendor change is one file.
- ⚠ **`_shared/*` edits require redeploying EVERY importing function** (CLAUDE.md, `patina-edge-functions`). These two are new files with no existing importers, so the first deploy is free — but any later edit to `field-parse.ts` (if the two are ever merged) drags `sms-inbound` along.

**Secrets.**
| Name | Used by | Status |
|---|---|---|
| `CF_ACCOUNT_ID`, `CF_AI_TOKEN` | `transcribe-field-note` | **new** — Cloudflare Workers AI REST API |
| `CLAUDE_API_KEY` | `structure-field-note` (via `_shared/field-note-extract.ts`) | **already set** — `field-parse.ts:155` reads it |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | both | runtime-injected |

> ⚠ **The repo uses two different names for the same credential.** `_shared/field-parse.ts:155` reads `CLAUDE_API_KEY`; `project-ffe-document-extract/index.ts:43` and `aesthete-dna-draft/claude.ts:8` read `ANTHROPIC_API_KEY`. Whichever this program picks, document it — a new function reading the wrong one fails open into `intent: 'unclear'` with `confidence: 0` and no error (`field-parse.ts:163`), which is a *silent* degradation.

**Crons** (`cron.schedule` with the guarded unschedule-then-reschedule preamble, `00340:63-73`, and the best-effort `COMMENT ON EXTENSION pg_cron` registry update):

```sql
SELECT cron.schedule('field-note-transcribe-sweep', '*/2 * * * *',
  $$SELECT public.invoke_edge_function('transcribe-field-note', '{}'::jsonb);$$);
SELECT cron.schedule('field-note-structure-sweep', '*/2 * * * *',
  $$SELECT public.invoke_edge_function('structure-field-note', '{}'::jsonb);$$);
SELECT cron.schedule('field-note-media-maintenance', '25 7 * * *',
  $$SELECT public.invoke_edge_function('field-note-media-maintenance', '{}'::jsonb);$$);
```

Two minutes is the tightest cadence in the repo for a user-visible lane (existing sweeps run 5–15 min) and is chosen because a designer who finishes a note and opens the portal within five minutes should not see "still working". `invoke_edge_function` POSTs `apikey` + service-role Bearer (`00258:66-80`), which is what satisfies the in-code `service_role` check.

---

## 4 · Portal surfaces (minimal)

### 4.1 The prerequisite nobody can skip: sign `capture-media`

**No web code references the `capture-media` bucket at all** ([D3 §0.2], re-verified). Until it does, field photos and every second of field audio are unreadable in the portal — which makes every other surface below cosmetic.

**PROPOSED** `packages/supabase/src/hooks/use-capture-media.ts`:
```ts
export function useCaptureMediaUrls(paths: readonly string[], ttlSeconds = 3600)
// batched supabase.storage.from('capture-media').createSignedUrls(paths, ttl)
```
The pattern already exists twice: `letterhead-instruments.tsx:118-130` (batched `createSignedUrls` over `room-scans`) and `useFieldMediaUrl` in `use-party-sms.ts` (MMS). This is [D3 §G2] and it is the cheapest high-value unit of work in the whole program.

### 4.2 Hooks to add (`packages/supabase/src/hooks/use-field-notes.ts`)

Modeled directly on `use-sms-review.ts` (30 s poll, thin typed read, RLS does the scoping, `*Keys` object exported):

```ts
export const fieldNoteKeys = { all: ['field-notes'] as const, capture: (id) => [...] };

useFieldNoteInbox()                 // field_captures WHERE capture_kind IN ('note','context')
                                    //   AND status='inbox', + draft_count, + project join
useFieldNote(captureId)             // one note + its drafts + signed media urls
useFieldNoteDrafts(captureId)       // field_note_drafts WHERE state='proposed', ordinal asc
useProjectFieldNotes(projectId)     // for the document's Project section
useConfirmFieldNoteDraft()          // rpc confirm_field_note_draft
useDismissFieldNoteDraft()          // rpc dismiss_field_note_draft
useRouteFieldCapture()              // existing rpc route_field_capture  (already unused by web!)
useDismissFieldCapture()            // existing rpc dismiss_field_capture (already unused by web!)
```
Export from `packages/supabase/src/hooks/index.ts` following the `use-sms-review` / `use-field-activity` idiom (`index.ts:442-449`).

Note the last two: `route_field_capture` and `dismiss_field_capture` have shipped since 00235 and **have zero web callers** — grep finds them only under `apps/mobile/Capture` [D3 §G1]. Wiring them is free.

### 4.3 Desk — "From the field"

**PROPOSED:** a new population inside `StudioPulse`, beside `FieldDesk` (`desk/page.tsx:376`), reusing `FieldDesk`'s exact construction (`components/document/field/field-desk.tsx:1-16` — "Two populations, both actionable, never KPI tiles").

- **Card** modeled on `SmsReviewCard` (`components/document/field/sms-review-card.tsx`), which [D3 §7] correctly identifies as "the design template for any 'field capture needs your hand' surface": the quote, who/where/when, the proposed effect **in words**, an editable field, then **Apply / Dismiss**.
- For a field note the card shows: venue + project + duration, an inline **audio player** (signed URL), the transcript (server if present, marked), and each `proposed` draft as a row with kind icon, title, its `source_quote`, and per-row Confirm / Dismiss. A "Confirm all high-confidence" affordance is a convenience, not an auto-apply.
- **Placement question.** `StudioPulse` renders a single preview sentence until "Open pulse" is pressed — field work is one click behind a fold [D3 §4.1]. A capture with unconfirmed drafts **is** an act, and [D3 §10 rec 1] argues it should rise to *Needs your hand*. That requires either a new `NeedKind` (`desk-derivation.ts:98-128` has 20, none field-shaped) plus a `document_state` column, or a separate population rendered above the fold. **PROPOSED: separate population above the fold** — three precedents exist for a non-`document_state` Desk population (`FieldDesk`, `OpenRequestsStrip`, `DeskReconnect`) and none of them required touching the view. Kody ruling **K-06**.
- **Register the surface** in `lib/document/registry.tsx` so ⌘K and Desk Contents can reach it — [D3 §1] calls this "the canonical place a new surface must register."

### 4.4 The Document

- **Margin:** the `field_note` branch from §2.5 renders through the existing `margin-derivation.ts` machinery with a new `margin-bodies.tsx` case. Raised while drafts are unconfirmed, settled after — the `field_sms` rule exactly.
- **Project section:** a Field notes block listing this project's notes, each opening the same confirm sheet. This is also the natural place to finally mount `RoomFilesSection` (complete, tested, unmounted — [D3 §G3]) and to union designer-owned scans into the Discovery/letterhead pickers. All three are the same "the designer's own field work has a home in the document" gap.

### 4.5 Naming and flags

- **Surface name: "From the field"** (Desk population) / **"Field notes"** (the registry surface). Explicitly not "Capture Inbox" (I84's two-way collision), not "request" (three senses), not "field kit" (`discovery/field-kit.tsx` is form-field primitives, [D3 §G11]).
- **Flag posture.** Eight fail-closed PostHog flags already gate the portal, and `room-file` + `call-sheet` between them make most existing field surface dark by default [D3 §8]. **PROPOSED: one new flag `field-notes`, and a hard commitment that the flag-on walk happens before the slice is called done.** MEMORY.md records at least four shipped-behind-a-flag surfaces whose flag "has never been seen by a human" — that is the failure mode to design against, not repeat.

---

## 5 · iOS architecture

### 5.1 The bug fix that is 80% of slice 1

`SpeechVoiceNoteService.swift` — write the audio (§1.2), rotate the recognizer (§1.3), handle interruptions (§1.4), compute the sha256, return `audioFilename` + segments. **One file.** Every consumer downstream is already built and waiting: `VoiceNoteResult.audioFilename` (`RecognitionServices.swift:66`), `Specimen.voiceAudioFilename`, `FieldCapturePayload.buildVoice` (`:225-228`), `LocalCaptureSyncService.uploadMedia`'s voice branch (`:401-419`), `mimeType`'s four audio cases (`:661-664`), `CaptureStore.missingRequiredMedia`'s voice check (`:517-521`), `commit_field_capture`'s `voice.audioPath` read (`00235:120`), and `field_captures.voice_audio_path` (`00233:69`). [D1 §8] calls this "the cheapest high-value fix in the app" and that is exactly right.

Also fix, in the same slice: **`requiresOnDeviceRecognition` is never set** (verified — no assignment anywhere in the file), so despite the header's "on-device" claim and the shipped permission string *"Transcribes your voice notes on-device"* (`generate_project.rb:87`), recognition may be going to Apple's servers. That is a permission-string/behavior mismatch with privacy consequences. **PROPOSED: set `request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition` and record which path ran in `transcript_source`.**

### 5.2 New CaptureKit seams (frozen-seam pattern)

`AppContainer` is explicitly "FROZEN for the waves" (`AppContainer.swift:13`) and every Phase-2 flow is injected through a one-line `<Flow>ServiceFactory.make(deps:)` (`:88-99`). Follow it exactly.

**PROPOSED — `CaptureKit/FieldNotes/FieldNoteServices.swift`:**
```swift
public protocol FieldNoteService: Sendable {
    /// Mint a media-less note draft bound to the visit's routing memory.
    @MainActor func beginNote(setting: FieldNoteSetting, in visit: CaptureSessionContext) throws -> UUID
    @MainActor func attachSegment(_ segment: VoiceAudioSegment, to noteID: UUID) throws
    @MainActor func finishNote(_ noteID: UUID, transcript: String, duration: TimeInterval) throws
    /// Server-side drafts for a committed note (read-back for in-app confirm).
    func drafts(forCapture remoteID: String) async throws -> [FieldNoteDraft]
    func confirm(draftID: String, patch: FieldNoteDraftPatch?) async throws -> FieldNoteDraft
    func dismiss(draftID: String, reason: String?) async throws
}
public enum FieldNoteSetting: String, Sendable { case solo, conversation }
public struct VoiceAudioSegment: Sendable { public let filename: String; public let ordinal: Int; public let seconds: Double }
```
plus `Capture/Features/FieldNotes/FieldNoteServiceFactory.swift` (`make(deps: WorkServiceDependencies)`), a `SupabaseFieldNoteService`, and a `MockFieldNoteService` in `CaptureKitMocks` so all 71 screens keep rendering on the Simulator. `AppContainer` gains exactly two lines (`public let fieldNotes: any FieldNoteService` + the factory call in each branch).

**`VoiceNoteService` itself is not changed** — `VoiceNoteResult` already has the right shape and three call sites construct it correctly. Extending it would ripple; fixing its implementation does not.

### 5.3 Models

Additive-only on `Specimen` (§1.5). Confirm SwiftData behavior: `CaptureStore.schema` (`:41-45`) declares six `@Model` types with **no `VersionedSchema` and no `SchemaMigrationPlan`** anywhere in the tree — so new *optional* properties migrate lightweight, but a new `@Model` class must be added to that array and a *required* property with no default would fail the open. Keep everything optional or defaulted.

### 5.4 Screens

| id | screen | what |
|---|---|---|
| **C6 (new)** | Voice note mode | Promote voice to a **fifth `CameraMode`** or a long-press on the WORK pill: mints a media-less draft and starts recording without needing a specimen first. Today N4 is `.voice(UUID)` — it *requires* a specimen to exist [D1 §8 pain 3], so a bare walk-and-talk note is impossible from C1. `ContextCaptureService` already proves a media-less specimen commits fine. |
| **N4 (extend)** | Voice note sheet | live transcript + waveform + segment counter + Pause/Resume + the solo/conversation chip |
| **S1 (unblock)** | Assign & venue | **Put a project chip in C3 and C5** bound to `CaptureRoutingMemory` whose tap presents `.assignVenue`. S1 is currently reachable from exactly three places — the V1 tray footer, S2, and the debug harness (`grep "present(.assignVenue"`) — so the normal capture path offers **no project picker at all** [D1 §5d]. This is the single highest-leverage IA fix in the app and it is independent of everything else in this document. |
| **V1 (fix)** | Session tray | `V1SessionTrayScreen.swift:126` routes only `items.first`. The bulk contract `CaptureSyncService.routeAll` exists and is tested (`CaptureLifecycleTests.sendAllUsesThePerRecordRouteContract`) and nothing calls it. One-line fix. |
| **N6 (new)** | Note review | In-app confirm/dismiss of `field_note_drafts` — same acts as the portal card, so a designer sitting in her car after a walk-through can clear them without a laptop |

`CaptureRoute` / `CaptureSheet` are declared **FROZEN — "Changing a case is a foundation-owner-only edit"** (`CaptureNavigation.swift:4-6`). Adding `.voiceNote` and `.noteReview(String)` is exactly that kind of edit; call it out in the brief rather than letting a wave agent do it quietly. Also add the matching `CaptureScreenID` cases so `capture-shots.sh` and the `-CaptureScreen` harness can reach them — and while there, fix `SiteScanContextScreen`'s orphan id `screen.F1.context`, which is **not** a `CaptureScreenID` case and is therefore invisible to both [D1 §6].

### 5.5 App Intents / Action Button / Control Center

`generate_project.rb` creates **exactly four targets** (`:28-30`, `:129`): `CaptureKit`, `CaptureKitMocks`, `Capture`, `CaptureTests`. `CaptureShareExtension/` and `CaptureWidgets/` are **empty directories with no target-generation code at all** [D1 banner, D7 §4]. There is also zero `import AppIntents` anywhere.

**PROPOSED, in two steps:**
- **Step 1 (no new target):** an `AppIntent` **in the app target** — `StartFieldNoteIntent` with an `AppShortcutsProvider` phrase. That alone gives Siri, Shortcuts, Spotlight, and — via a Shortcut binding — the **Action Button**. It needs no extension, no new Ruby, and works at the 18.0 floor ([D6 §D]). Note the app *already* has a `settings.action_button_rebind` analytics event and an O4 screen that teaches the Action Button [D1 §1] — the affordance is promised in onboarding and does not exist.
- **Step 2 (new target, later slice):** a `CaptureWidgets` WidgetKit extension generated by new Ruby in `generate_project.rb`, carrying (a) an iOS-18 Control Center control for one-swipe capture, (b) a Lock Screen widget showing the active visit, and (c) **the renderer the existing Live Activity has never had** — `CaptureKit/LiveActivity/CaptureSyncAttributes.swift` and `CaptureLiveActivityController` are already built and driven by `LocalCaptureSyncService`, but with no widget extension they cannot render [D1 §2, inference]. One new target pays three debts.

Remember: iOS will not let a background trigger *start* a recording ([D6 §D]) — every entry point must foreground the app for the moment recording begins. Design the control as "opens Field, already recording", not "records silently".

### 5.6 Offline semantics

The transactional layer is already excellent (§1.5). The gaps are contextual:
- **No `NWPathMonitor` exists anywhere in the app** [D1 §8, re-verified]. Drains fire on enqueue, on launch reconcile, and on manual "Retry all" — **regained connectivity never auto-drains**. A designer who walks out of a basement and pockets her phone has notes sitting in the outbox. **PROPOSED: an `NWPathMonitor` → `sync.drain()` + `siteScan.resumePendingUploads(retryFailures: false)`.**
- **`OfflineQueueBanner` is dead code** — referenced only inside its own `#Preview` (`:83-84`). Nothing on the camera surface tells the designer she is offline and queuing. Render it.
- **S1's pickers need the network** — offline they degrade to a banner and the FF&E menu disables, so "the offline capture is exactly the one that can't be placed" [D1 §8]. **PROPOSED: cache the designer's project + `project_rooms` list in `CaptureProjectRef` on every successful W1/P1 fetch**, so the project chip works from a parking garage.
- **Server transcript arrival is asynchronous and may be days later** (a note taken in a dead zone, drained on Thursday). The app must never block on it, must show the device draft immediately marked as a draft, and must honor `transcriptEditedAt` (§1.7).

### 5.7 Telemetry

Extend the existing 64-event taxonomy through the `CaptureAnalytics` seam [D7 §6] — new names in the established dotted style:

```
voice.start · voice.finish · voice.cancel · voice.segment_rotated · voice.interrupted
voice.audio_write_failed · voice.recognizer_unavailable · voice.on_device (bool prop)
note.begin · note.enqueue · note.project_bound · note.project_bound_source (memory|picker|suggested)
note.drafts_seen · note.draft_confirmed · note.draft_dismissed · note.transcript_edited
intent.start_note (App Intent entry) · control.start_note (Control Center entry)
```

> **⚠ Prerequisite #0: Patina Field has never sent a single analytics event.** [D7 §6] queried PostHog live: over 180 days, `surface='field-ios'` returns **zero rows** while `surface='patina-ios'` returns 6,017, and none of Field's 64 event names appear in the taxonomy at all. Root cause: this checkout's `Secrets.swift` has `postHogAPIKey: String? = nil` and no build or script ever sets `POSTHOG_API_KEY`. Instrumenting a new feature into a channel that has never carried a byte is theatre. **Set the key and ship one build first** — it is a one-line change plus a build, and it is the only way any claim in §7 R-01 (volume, note length, confirm rate) ever gets grounded.

Also missing: **Field has no feature-flag mechanism at all** — `CaptureAnalytics` has only `screen`/`event`/`identify`, no `isFeatureEnabled`, even though `posthog-ios` is linked and initialized and the *client* app already calls `PostHogService.shared.isFeatureEnabled(...)` [D7 §7]. If any of this ships gated on the phone, that method has to be added to the seam first.

### 5.8 Verification gates

`cd apps/mobile/Capture && scripts/capture-gate.sh all` — regenerate, `xcodebuild build -scheme Capture`, `xcodebuild test -scheme CaptureKit`, `swiftlint --strict` [D7 §1]. Two honesty caveats to carry into any brief: **lint silently no-ops and still exits 0 if swiftlint isn't on PATH**, and `test` runs logic tests only — `CaptureUITests/` is an empty directory with no generated target, so **Field has zero UI-test coverage**.

New tests that should exist before this is called done, in the style of the 20 existing suites:
- `VoiceRecordingTests` — segment rotation boundaries, transcript concatenation, interruption → segment N+1, sha256 stability, `audioFilename` non-nil after a successful finish (**the regression guard for the bug in §5.1**).
- extend `FieldCapturePayloadTests` — `voice.audioPath` and the new segment array against the 00235 reader (that suite already asserts *every* wire key path).
- extend `UploadStateTests` — the audio Content-Type must be bucket-legal (that suite is literally the M2 MIME drift guard that caught a live Storage 400).
- `FieldNoteDraftTests` — confirm/dismiss idempotency against a stubbed gateway.

Server side: `supabase/tests/field/` already holds `apply_field_effect_test.sql` and `field_links_test.sql` — add `field_note_drafts_rls_test.sql` and `confirm_field_note_draft_test.sql` there. ⚠ MEMORY.md records **71/108 SQL tests currently red** (00483 `pg_temp` fallout) with suite repair owed — do not read a green/red signal from that suite without checking that first.

---

## 6 · Sequencing

Each slice is independently shippable and independently valuable. **S1 delivers the headline promise with no server AI at all.**

### S0 — Prerequisites (days, no product surface)
1. Set `postHogAPIKey` in Field's `Secrets.swift`, ship one build, **confirm `surface='field-ios'` rows appear** [D7 §6].
2. Add `isFeatureEnabled` to `CaptureAnalytics` + `PostHogCaptureAnalytics` + `MockCaptureAnalytics` (fail-closed) [D7 §7].
3. `useCaptureMediaUrls` — the batched `createSignedUrls` hook. Nothing else works without it [D3 §G2].
4. Re-verify the live migration ledger; mint from 00514.

### S1 — "The note survives, and it knows where it is" (no LLM, no server transcription)
- Fix `SpeechVoiceNoteService`: write the audio, rotate the recognizer, handle interruptions, set `requiresOnDeviceRecognition` (§5.1).
- `00514` (capture_kind, audio segments, transcript lanes, indexes) + `00515` (**inbox branch persists project routing** — the association fix).
- iOS: `capture_kind='note'`, media-less note draft, C6 voice mode, **project chip in C3/C5**, `routeAll` wired, `OfflineQueueBanner` rendered, `NWPathMonitor` drain.
- Portal: `use-field-notes.ts` inbox read + signed audio playback + transcript + `route_field_capture`/`dismiss_field_capture` acts; "From the field" on the Desk behind flag `field-notes`.
- **Value delivered:** Leah talks, the audio and transcript survive offline, land against the right project, and she can hear and read them in the portal. That is most of the program's stated goal.
- **Gate:** `capture-gate.sh all` green + a **device** pass (Speech and mic are device-only; Simulator renders the typed fallback) + a flag-on portal walk.

### S2 — "The server hears it better"
- `transcribe-field-note` + `_shared/transcribe.ts` + cron + `job_runs` + attempt/park + billing guard.
- Reconciliation UX on both surfaces (never clobber an edited transcript).
- Stuck-`queued` capture sweep (F14).
- **Value:** transcripts stop being dictation-grade; the >1-minute boundary losses of S1 are repaired.

### S3 — "It becomes work"
- `00516` (`field_note_drafts`) + `00517` (RPCs) + `00518` (`margin_items` branch).
- `_shared/field-note-extract.ts`, `structure-field-note`, `field_note.structure` agent_tasks kind (zero DDL).
- Desk card with per-draft Confirm/Dismiss; in-app N6 review screen.
- **Value:** a spoken "we need to swap that faucet, and the alcove is about 42 and three-quarters" becomes a task she taps once to keep and a note that records the number honestly.

### S4 — "It knows where it is before she tells it"
- `CLVisit` (needs `NSLocationAlwaysAndWhenInUseUsageDescription` — absent today, and a real App Review conversation) + `EventKit` read (needs `NSCalendarsUsageDescription` — absent today) to **suggest** a project. Suggestion only; the chip still confirms.
- App Intents (step 1), then the `CaptureWidgets` target (step 2): Control Center control, Lock Screen widget, and finally a **rendering** Live Activity.
- Background audio (`UIBackgroundModes: [audio]`) if S1–S3 evidence justifies it.
- Auto-association proposals: a draft may carry `project_id` the model inferred, still confirm-gated.

---

## 7 · Risks, unknowns, and the rulings Kody owes

### Risks (with mitigation)

| # | Risk | Mitigation |
|---|---|---|
| R-01 | **Every volume/cost/latency number here is unfounded** — Field has never emitted an analytics event [D7 §6], and no Leah device pilot is confirmed to have happened (M4's literal gate was deferred at R113 and is still listed owed) [D4 §3]. | S0 item 1. Then re-derive §1.11 from real data before any capacity decision. |
| R-02 | **We may be building the wrong wedge.** Leah Session 05 (prepped 2026-08-18) is not yet run — `leah-session-05-findings-template.md` is still blank — and its block 2 ranks "capture/memory" against three *other* MVP wedge candidates [D4 §3, §5]. | Either wait for the session or ship S1 explicitly as the cheap, reversible bet (it is mostly bug-fixes and wiring) and hold S3 for the answer. |
| R-03 | **Consent exposure.** Recording clients in all-party-consent states without a clear affirmation is a real legal risk, and no recording policy exists anywhere in `docs/`. | §1.13 controls; K-01 ruling; get a lawyer's read before any non-Kody designer ships. |
| R-04 | **Prod ledger has a hole at 00512** (parked, unapplied, on a branch that also carries a *known live defect* per MEMORY.md). If it ever lands it applies out of order. | Mint from 00514, verify live, and coordinate with whoever owns the 00512 follow-on before pushing. |
| R-05 | **71/108 SQL tests are currently red** (00483 `pg_temp`), so the suite cannot certify new RLS work. | Treat suite repair as a dependency of S3, or write the new tests to run standalone and say so. |
| R-06 | **Field has no UI tests and no confirmed non-blocking CI status** — `CaptureUITests/` is empty with no target, and the "(advisory)" iOS jobs set no `continue-on-error` [D7 §2]. | Device walks are the real gate. Budget them; do not let "capture-gate.sh green" stand in for one. |
| R-07 | **No distribution pipeline for Field.** No fastlane, no archive step, no confirmed ASC record, no `asc-*` skill library [D7 §9]. Every build is a manual Xcode archive on Kody's machine. | If this program is meant to reach designers beyond Kody, TestFlight setup is a hard dependency of S1, not a nicety. |
| R-08 | **Two incompatible room concepts** (`project_rooms` vs `public.rooms`) will collide the first time a note is captured mid-scan and the designer wants it in an FF&E room. | §2.2's explicit rule; K-02 ruling. |
| R-09 | **Transcript quality on a job site is unmeasured.** Compressor noise, saws, echo in an empty room. Whisper is good; nobody has tested it here. | S2 records `transcript_state` + both transcripts on every note — the corpus for measuring this is a byproduct of shipping S2. |
| R-10 | **Frozen-seam churn.** `CaptureRoute`/`CaptureSheet`/`CaptureScreenID` and `AppContainer` all carry explicit freeze comments; this program edits all four. | Name it in the brief as a foundation-owner edit, do it once at the top of S1, not incrementally per wave. |
| R-11 | **`_shared` blast radius.** If `field-note-extract.ts` is ever merged into `field-parse.ts`, a change drags `sms-inbound` (a live 10DLC path) with it. | Keep them separate files. Redeploy every importer on any `_shared` edit. |
| R-12 | **Storage co-member gap.** If K-03 rules the inbox studio-wide, the `capture-media` object policy needs a co-member branch — a `supabase_storage_admin`-owned policy, i.e. a **platform-admin phase** migration, not an ordinary one (00483 header). | Sequence the ruling before the schema work, not after. |

### Unknowns I could not close from the repo
- Whether **P2 item 10** (the voice-note seam + provenance GIN index) was ever picked up in the later "Rendered Room v2" work — DECISIONS.md's Field Capture coverage stops at R123 (2026-07-29) [D4 §5]. The code says no (§0 correction 1), but a paper answer may exist.
- Whether **`comms_messages` is actually in the `supabase_realtime` publication** on Strata — self-documented as unverified at `SupabaseMessagingService.swift:136-144`. Not on this program's critical path, but it decides whether an in-app "your note came back structured" live-tail is possible.
- Whether **iOS populates `receiving_inspections.photo_asset_ids`** — if it does, there are already unviewable photos in prod [D3 §11 Q2].
- The **`field-media` bucket's** creating migration was not located by either D2 or this pass — it is referenced only in a `use-party-sms.ts` comment.
- Whether **branch protection** actually makes the iOS CI jobs blocking [D7 §2].

### Rulings Kody owes

| # | Ruling | Why it blocks |
|---|---|---|
| **K-01** | **Recording consent posture.** Does a field note require an explicit "everyone here knows" affirmation when marked `conversation`? Is there a jurisdiction rule? | Shapes the capture UI and the retention default; it is the one item with legal exposure. |
| **K-02** | **Audio retention default.** `keep` forever, `discard_after_transcript`, or `90_days` (the site-request precedent)? Per-note override, per-studio setting, or fixed? | Decides a column default, a cron, and what a client's lawyer sees on discovery. |
| **K-03** | **Per-designer or per-studio inbox?** `field_captures` RLS is owner+org-inbox; `room_files` delegates to the broader scan visibility. They disagree today [D2 §9.4, D3 §11 Q3]. | Decides an RLS policy, a storage platform-admin migration (R-12), and whether the surface is a Desk population or a Studio ledger. |
| **K-04** | **Does anything auto-apply?** SMS applies at confidence ≥0.8 (`sms-inbound/pipeline.ts:574`); §1.10 proposes never, for the designer's own notes. | The single biggest trust decision in the pipeline. |
| **K-05** | **Can a spoken measurement ever become a measured record?** §2.4 says no — it becomes a note that says the number. R108.1/R114.1 support that; R108.1's re-open trigger was "field evidence of transcription friction," which this program will generate. | Decides whether `_apply_field_note_draft` may ever touch `room_file_measurements` / `tolerance_class`. |
| **K-06** | **Desk placement:** above the fold in *Needs your hand*, or inside the Studio Pulse fold beside `FieldDesk`? | Decides whether it needs a new `NeedKind` + `document_state` column, or just a population. |
| **K-07** | **Background audio.** Ship `UIBackgroundModes: [audio]` so a note survives screen-lock? | App Review conversation + battery + privacy; changes the whole "phone in pocket" story. |
| **K-08** | **Deployment target.** Stay at 18.0 (WhisperKit later if needed), or move to 26 for `SpeechAnalyzer`? [D6 open question] | Moving to 26 cuts off older devices for a pilot; staying means the on-device draft is dictation-grade until the server transcript lands. |
| **K-09** | **Naming.** "From the field" / "Field notes" — or something else? I84 forbids a third "Capture Inbox"; R98/PRD/I53 make "request" ambiguous three ways. | Names are hard to change after they ship into ⌘K, the Desk, and the margin. |
| **K-10** | **PRD O8** — "when The Document reads the Binder, what renders in the Desk vs. the margin?" The PRD itself flags this as cross-cutting and not Field's call alone [D4 §5]. §4.3/§4.4 answers it *by implementation* for field notes; it deserves an explicit ruling. | Sets the pattern every future field surface follows. |
| **K-11** | **`CLAUDE_API_KEY` vs `ANTHROPIC_API_KEY`** — pick one and document it; the repo currently uses both for the same credential. | A new function reading the wrong one degrades silently to zero-confidence output. |
| **K-12** | **Is TestFlight a dependency?** If field notes are meant to reach designers beyond Kody's own phone, the missing distribution pipeline (R-07) has to be built. | Decides whether S1 ends at "Kody's device" or "Leah's device." |

---

*Read-only survey and design. No repository file was modified other than this report.*
