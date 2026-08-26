# Wave 1 — merge review

**Branch:** `feat/field-companion-w1` (Field Companion, Wave 1 "The note survives")
**Diff range reviewed:** `cde7c7628...4ecc29611` (the wave's merge-base → head, including the whole-branch review + fix wave `8751e6a79` X1 · `65737f4ce` N-J · `2b049664e` X3 · `ae8b7b98e` X2 · `4ecc29611`). Any later merge of `origin/main` into the branch is outside this review.
**Reviewed:** 2026-08-25. Read-only; no file in the worktree was touched.
**Reviewer scope:** the seven areas in the brief. Device pass NOT run (phones locked) — `device-pass-spec.md`'s 44 assertions remain unexecuted, and nothing below substitutes for them.

---

## Verdict

# MERGE-WITH-FIXES

Four blockers, all small and all in the iOS half, plus one scope gap that needs a ruling rather than a fix. `00530` is in good shape and I found no correctness defect in it that would stop a prod push. The branch's engineering standard is high — the migration's reasoning is unusually well evidenced, the retention sweep is genuinely stamp-gated, and the X1 fix does close the hole it was written for. What is left is (a) three unsynchronized ARC-bearing fields in the recorder, (b) one ordering race that silently drops the last segment of a capped note, (c) one line in `attach()` that can null a live pointer to durable server audio, and (d) a 31k-line generated-file reformat that will collide with every other lane.

None of the four blockers needs a redesign — all are edits of a dozen lines or fewer. The scope gap (§5.2) is a small build, not an edit, which is why it is a ruling and not a blocker.

### Blockers (fix before merge)

| # | Finding | File:line | Sev | Conf |
|---|---|---|---|---|
| **B1** | Three ARC-bearing fields read/written across the render thread, `rotationQueue`, the Speech callback thread and the main actor with no synchronization | `SpeechVoiceNoteService.swift:83`, `:105`, `:120` | critical | 0.85 |
| **B2** | On the cap path, the consumer's `finish()` can return **before** `endAtCap()` closes and publishes the final segment — up to 50 s of audio is dropped from `VoiceNoteResult` and orphaned on disk | `SpeechVoiceNoteService.swift:512-523`, `:548-560`, `:258-268` | high | 0.7 |
| **B3** | `attach()` unconditionally overwrites `voiceAudioSegmentsRaw` / `voiceAudioFilename` / `voiceTranscriptSourceRaw` with the *current* take (nil when there is none) — an X1-class path that survives the X1 fix and can clear the server's audio pointers | `VoiceNoteSheet.swift:325-327`, `:347-350` | high | 0.6 |
| **B4** | `database.types.ts` carries a whole-file reformat (63,537-line diff around a ~18-line real delta) that main's raw-CLI output does not have | `packages/supabase/src/database.types.ts` | high | 0.95 |

### Not blockers, but owed

Everything in §1–§7 below marked *follow-up*. The five that matter most:

- **Two §15.4 ladder rungs are not built** (§5.2) — "recognizer unavailable → recording still starts" and the 20-minute-cap copy. These are in the spec's *After wave 1* column, so the wave is not complete as specified. Needs either a small build or an explicit deferral ruling; do not record Wave 1 as done without one.
- The SQL test does not cover the `FOUND`/`v_upserted` regression it was restructured to risk (§2.6).
- Nothing anywhere tests the X1 fix itself (§1.7).
- Every per-event `surface` property is silently discarded by a super-property key collision (§4.6).
- `PrivacyInfo.xcprivacy` under-declares six data types before the first TestFlight upload (§7).

---

## 1 · Cross-task destructive interactions (X1 class)

I re-derived the lifecycle end to end from `LocalCaptureSyncService.swift`, `CaptureStore.swift`, `MediaRetentionPolicy.swift`, `FieldCapturePayload.swift` and `00530`.

### 1.1 The lifecycle, as built

```
recorder → segment .m4a in the App Group media dir
         → Specimen.voiceAudioSegmentsRaw = [names]          (VoiceNoteSheet.attach / ContextCaptureService.enqueueVoice)
drain    → uploadMedia:
             voiceFilenames  = voiceAudioSegmentsRaw ?? [voiceAudioFilename]
             stampedRemotePaths = stampedVoicePaths(specimen)   ← THE X1 FIX
             per segment: stamped? answer from the stamp
                          else upload → stamp into voiceAudioRemotePathsRaw
                          else (unreadable) → DROP, lost += 1
         → payload.voice.audioPath/.audioSegments = uploaded paths
         → commit_field_capture(...)  → upsert writes voice_audio_path / voice_audio_segments
receipt  → applyCommitResult: delete every LOCAL file whose name is stamped
drain end→ store.sweepMediaRetention()  (soft-cap sweep, stamp-gated)
```

### 1.2 The X1 fix is real and it does close the hole it was written for — VERIFIED

*(informational, confidence 0.9)*

`stampedVoicePaths` (`LocalCaptureSyncService.swift:463-472`) keys `voiceAudioRemotePathsRaw` by trailing path component, and `uploadMedia:438-439` answers an already-stamped segment from that map instead of re-reading a local file the receipt deleter has already removed. I walked the exact scenario X1 was written against — commit → receipt → local delete → re-commit — and confirmed:

- `voiceUpload.paths` comes back **complete** on the second pass, so `commitCapture:316-319` overwrites `payload.voice.audioPath`/`.audioSegments` with the real storage paths;
- the `lost > 0 && paths.isEmpty` branch at `:320-331`, which is the only code that writes `audioPath = nil, audioSegments = []`, is unreachable while a stamp exists, because stamps are never cleared;
- the stamp is durable before the delete: `uploadMedia:451` saves the context before returning, and the failure paths save via `recordFailure:242`.

I also confirmed the sweep cannot reach unreceipted bytes: `receiptedMediaFiles()` (`CaptureStore.swift:625-656`) admits a voice file only when its basename appears in `voiceAudioRemotePathsRaw`, and `sweepMediaRetention` (`:599-612`) only ever iterates that set. Running the sweep unconditionally at `drainOwned:189` — including after a drain in which commits failed — is therefore safe: a stamp means the bytes reached Storage, not that the RPC succeeded, and that is the correct predicate.

**The `MediaRetentionPolicyTests` back this up honestly** — `:124-141` proves the sweep never deletes an unreceipted file even when it is the oldest and largest, and `:144-169` proves a receipted voice segment is treated exactly like a receipted photo. Good tests.

### 1.3 **B3 — `attach()` can null a live pointer to durable server audio** — HIGH / 0.6

`VoiceNoteSheet.swift:325-327`:

```swift
specimen.voiceAudioFilename    = result?.audioFilename
specimen.voiceAudioSegmentsRaw = result?.audioSegments
```

and `:347-350`:

```swift
specimen.voiceTranscriptSourceRaw = recorded.map { … } ?? "designer"
specimen.voiceDurationSeconds     = recorded?.durationSeconds
```

Both are unconditional writes with no guard for an already-attached recording. The N4 sheet is keyed per specimen (`CaptureSheet.voice(specimenID)`), so it is re-openable on a capture that already carries audio. Sequence:

1. Record, Attach. `voiceAudioSegmentsRaw = [A0, A1]`. Capture syncs; `voiceAudioRemotePathsRaw` stamps land; local files deleted at `LocalCaptureSyncService.swift:687-689`. Server holds the objects and `voice_audio_segments = ["uid/tok/A0","uid/tok/A1"]`.
2. Re-open the voice sheet on the same specimen. **With the flag OFF this is a two-tap path**: `VoiceNoteSheet.swift:62-65` sets `manualFallback = true` and the typed-entry surface appears.
3. Type a correction, tap Attach. `result` is nil → `voiceAudioSegmentsRaw = nil`, `voiceAudioFilename = nil`, `voiceTranscriptSourceRaw = "designer"`.
4. Any subsequent re-commit: `uploadMedia:401-408` derives `voiceFilenames` from `voiceAudioSegmentsRaw` — now empty — so `paths` is empty and `lost` is 0. Neither branch at `commitCapture:316-331` fires. `buildVoice` (`FieldCapturePayload.swift:245-261`) emits `audioPath = nil`, `audioSegments = nil`. `00530:473,477` then writes `voice_audio_path = NULL`, and the omitted key projects to `'[]'` at `00530:337-339` — **`voice_audio_segments = '[]'` over audio sitting intact in Storage.**

The X1 fix does not catch this because it operates on `voiceAudioRemotePathsRaw`, and `stampedVoicePaths` is only consulted for names that are still in `voiceAudioSegmentsRaw`. Nulling the segment list makes the stamps unreachable.

**Minimal fix (blocker):** never clear an existing recording from the typed path.

```swift
if let recorded {
    specimen.voiceAudioFilename       = recorded.audioFilename
    specimen.voiceAudioSegmentsRaw    = recorded.audioSegments
    specimen.voiceTranscriptSourceRaw = recorded.transcript.isEmpty ? "device_partial" : "device"
    specimen.voiceDurationSeconds     = recorded.durationSeconds
} else if specimen.voiceAudioSegmentsRaw?.isEmpty != false {
    specimen.voiceTranscriptSourceRaw = "designer"
}
```

(Superseding a take deliberately is a separate, wave-2 decision; it must delete the old files **and** clear the stamps together, or it re-opens the same hole from the other side.)

### 1.4 **B2 — the capped note's last segment can be dropped** — HIGH / 0.7

`rotate()` at `SpeechVoiceNoteService.swift:512-523` ends the note on the `rotationQueue`: it sets `noteIsActive = false`, yields `isFinal: true`, calls `continuation.finish()`, emits `voice.finish`, and only then hops the *audio* teardown to main via `DispatchQueue.main.async { self?.endAtCap(capped) }`.

`endAtCap` (`:548-560`) is what calls `stopEngineAndCloseSegment()` → `closeCurrentSegment()` → `audioSegments.append(closed.name)` (`:422`).

Meanwhile the consumer reacts to the finished stream. In `VoiceNoteSheet.swift:253` the `for try await` loop falls through to `end()`; in `SiteScanContextCapture.swift:124` it calls `stopVoice(reason: .capped)`. Both reach `finish()`, which at `:258-268` sees `noteIsActive == false` (rotate cleared it) and takes the early return, handing back `audioSegments` **as it stands at that instant**.

If `finish()` wins the main-queue race, the final open segment has not been closed or appended. The result names segments 0..n-1; segment n is never referenced by any specimen, never uploaded, never swept (the sweep only touches stamped files), and sits in the App Group container forever. On a 20-minute note (`VoiceRecordingPolicy.maxNoteSeconds`) that is the last 50 s of what she said.

The comment at `:549-551` asserts "either order is safe". It is not: one order publishes the segment before the result is read, the other does not.

**Minimal fix (blocker):** close the audio *before* finishing the stream. In `rotate()`'s cap branch, replace the async hop with a synchronous teardown ordered ahead of the yield — or, keeping the main-actor hop, move `continuation.yield(isFinal:)` / `continuation.finish()` / `emitFinish(reason: "cap")` inside `endAtCap`, after `stopEngineAndCloseSegment()`. The `guard cappedNoteID == noteID` at `:552` still protects a note that started in the meantime.

### 1.5 Re-take on the N4 sheet orphans the previous take's audio — MEDIUM / 0.85 · *follow-up*

`begin()` (`VoiceNoteSheet.swift:262`) sets `result = nil` and `startLiveTranscription()` (`:185`) resets the service's `audioSegments = []`. Neither deletes take 1's `.m4a` files. They are now referenced by nothing, so `discard()`'s deleter (`:290-292`) cannot see them and the retention sweep will never touch them. Every re-take on the sheet leaks a take.

Combined with §1.6, this means the FC-R19 512 MB soft cap is not a cap: the sweep's candidate set is *only* receipted files, so a device whose overage is entirely unreceipted audio sweeps zero bytes and stays over. That is a documented design choice (`CaptureStore.swift:586-590`) and correct as a safety property — but it should be paired with a deliberate cleanup of superseded takes, or the number in `MediaRetentionPolicy.softCapBytes` is decorative.

### 1.6 Unreceipted audio is unreclaimable by design — LOW / 0.9 · *follow-up*

Stated for the record (see above). A crash mid-recording, a permanently `.rejected` capture, or a take abandoned by a killed app all leave `.m4a` files that nothing will ever delete.

### 1.7 **Nothing tests the X1 fix** — HIGH / 0.9 · *follow-up*

`VoiceAudioWireTests.swift` covers `VoiceNoteResult`'s segment derivation, the payload keys, `captureKind`, the schema version bump, and `missingRequiredMedia`'s exemption of a stamped segment (`:84-92`). It does **not** cover `stampedVoicePaths`, `uploadMedia`'s stamp-answering branch, or `applyCommitResult`'s deleter — because `LocalCaptureSyncService` lives in the app target and has no test at all in this diff. The single most consequential fix in the wave is proven only by reading.

Owed: one test that drives `uploadMedia` with a specimen whose `voiceAudioSegmentsRaw` names a file that does not exist on disk but whose `voiceAudioRemotePathsRaw` carries its stamp, and asserts the returned `paths` is non-empty and `lost == 0`.

### 1.8 Re-commit loop for an inbox capture with a placement — LOW / 0.5 · *follow-up*

`confirmedReceipt` (`:365-375`) requires `committedProductId`, which an inbox capture never has, so an inbox row that stays in the outbox re-runs the full `commitCapture` on every drain. `outbox()` (`CaptureStore.swift:441-447`) keeps a committed row only when `needsProjectPlacement` is true — which requires `placementProjectId` — and `performProjectPlacementIfNeeded` is gated on `receipt.productId`, which inbox never returns. So an inbox capture that ever acquires a placement target re-commits forever with nothing able to clear it. Wave 1 does not produce that combination (notes route via `venue.projectId`, not the placement fields), so this is a latent trap, not a live bug. Worth a guard before wave 4 wires placements to notes.

### 1.9 Minor: whitespace-only `voiceAudioFilename` reaches the server — LOW / 0.7

`buildVoice` uses `.nonEmpty` (no trim) at `FieldCapturePayload.swift:248`, while `uploadMedia:406-407` trims before filtering. A `"   "` filename therefore survives into `voice_audio_path`. Cosmetic; no data loss.

---

## 2 · `00530` for prod

I diffed the function body against `git show db2128934:supabase/migrations/00516_capture_producer_idempotency.sql` line by line.

### 2.1 Authored on 00516's body — VERIFIED, confidence 0.95

The diff is exactly the four documented edits and nothing else. Confirmed unchanged: the signature `(UUID, TEXT, JSONB, UUID, UUID, TEXT, UUID)` and its defaults, `SECURITY INVOKER`, `SET search_path = public, pg_temp`, the whole VALUES/SET column mapping apart from the five new columns, the library branch's product mint and routing, and — critically — the `PERFORM public.enqueue_capture_enrichment_for_producer(...)` wrapper call at `00530:583-590`, with the primitive `enqueue_capture_enrichment` nowhere in the file. The header's lineage note (`00530:4-17`) is accurate; I confirmed by grep that `commit_field_capture` is redefined only by 00235, 00516 and 00530, and that no migration after 00233 redefines the five policies or `field_captures_guard_routing` (00265 mentions the guard only in comments).

### 2.2 Policies byte-identical, and the narrowing really is a no-op — VERIFIED, confidence 0.9

All five predicates at `00530:100-138` match `00233:155-188` character for character, including `om.status = 'active'`. I checked the one thing that could make `TO authenticated` a behavioural narrowing rather than a restatement: a non-`authenticated`, non-BYPASSRLS role that reads `field_captures` today under the PUBLIC policies. `agent_reader` is exactly that — `00299:11` states plainly that `pg_read_all_data` "does NOT carry BYPASSRLS" — but every one of the five predicates keys on `auth.uid()`, which is NULL in a `SET ROLE agent_reader` session, so agent_reader already sees zero rows. Same for `anon`. `service_role` and `postgres` bypass RLS. **The "no behaviour change" claim holds** — but only because of that `auth.uid()` accident, which is worth knowing the next time this idiom is copied.

No exposure window during the swap: the transaction already holds ACCESS EXCLUSIVE from the `ALTER TABLE`, so no session can read the table between `DROP POLICY` and `CREATE POLICY`.

### 2.3 Defensive payload coercion — VERIFIED, confidence 0.9

`00530:307-345` projects all four new reads to legal values and never RAISEs; `00530:283`'s `(v_payload #> '{routing,clear}') = 'true'::jsonb` is a total jsonb comparison, not a `::boolean` cast. The projection whitelists at `:310`, `:318`, `:327` match the CHECK allow-lists at `:42`, `:55`, `:58` exactly. `v_raw_payload`'s CASE at `:353-358` and the two `conflict`-array merges compose on distinct top-level keys as claimed. The named constraints (`field_captures_capture_kind_ck` etc.) are all present and named.

### 2.4 `FOR v_attempt IN 1..2 LOOP` — mechanically correct, confidence 0.9

`v_attempt` is auto-declared by the integer FOR loop and is in scope inside the nested `BEGIN … EXCEPTION` block; bare `RAISE;` inside the handler re-raises the original error even after intervening statements; `EXIT` from a block that carries an exception handler exits the enclosing loop; and the `v_upserted := FOUND` capture at `:503` is the correct fix for the loop's own `FOUND` clobber. `v_upserted` cannot be NULL at `:561` because attempt 2 either EXITs or RAISEs.

### 2.5 **EDIT 4's `WHEN OTHERS` is too wide — a transient upsert error silently un-places a capture** — MEDIUM / 0.6 · *follow-up*

`00530:505` catches **any** exception. The handler then detaches `project_id`/`project_room_id`/`shelf` (`:552-556`) and retries. If the first failure was *not* the routing guard — a serialization failure, a deadlock, a transient FK error — and the retry then succeeds, the capture comes out of the RPC **de-routed**. The inbox branch's `COALESCE(p_project_id, project_id)` restores it only when the caller supplied routing arguments on that same call; a re-commit that carries no routing args leaves the capture un-placed, with `raw_payload.conflict` the only trace.

If the retry also fails the whole transaction aborts and the detach rolls back, so there is no damage on that path — the exposure is specifically *transient failure followed by success*.

The guard's raises are all bare `RAISE EXCEPTION 'field_captures: …'` (`00233:206/212/224/230/240`) → SQLSTATE `P0001`. Narrow the handler:

```sql
EXCEPTION WHEN raise_exception THEN
  IF v_attempt = 2 OR SQLERRM NOT LIKE 'field_captures:%' THEN RAISE; END IF;
```

### 2.6 **The standalone test does not prove several of the claims, and misses the exact regression the loop restructuring risks** — HIGH / 0.85 · *follow-up*

`supabase/tests/field/field_capture_note_routing_test.sql` is well built and unusually honest — its own header (`:110-113`) states that the runner connects as `postgres` and that "Nothing here proves RLS; do not report it as such." That disclaimer is correct and I verified it: `scripts/run-sql-tests.sh:92,184-186` connects as `postgres`, `field_captures` has no `FORCE ROW LEVEL SECURITY` anywhere in `supabase/migrations/`, and the test sets `request.jwt.claims` (`:158-159`) without ever issuing `SET ROLE authenticated`. So `auth.uid()` resolves and the **function logic** is exercised, while **every RLS predicate is bypassed**.

Answering the brief's question directly: **no, nothing RLS-dependent is claimed as proven by the superuser runner.** Case 7 (`:226-274`) proves policy *shape* by reading `pg_policies` — which is role-independent and legitimate — and the file claims nothing more.

Genuinely proven, including the hardest one: the EDIT 4 stale-stored-routing harbor is constructed for real at `:410-458` by re-parenting `project_rooms.id = d1` to another project, not faked. Two harbors in one call producing two `conflict` array entries is proven at `:465-507`.

Not proven at all — and these are the ones to close:

| Claim | Status |
|---|---|
| idempotent no-op branch / the `FOUND` → `v_upserted` regression | **untested** — `destination='library'` is never called, so nothing ever reaches `status IN ('saved','dismissed')`. The test's own header concedes this at `:11-21`. This is the exact defect class `00530:500-503` says the loop could silently reintroduce. |
| `enqueue_capture_enrichment_for_producer` is still called, once per real insert/update | zero references in the test file |
| the provenance GIN index exists with `jsonb_path_ops` | zero references |
| the four named CHECK constraints exist under those names | zero references |
| the ACL (anon has no EXECUTE, authenticated does) | zero references |
| the migration is idempotent on re-run | never applied twice |
| `shelf` persists on the inbox branch | `p_shelf` never passed or asserted |
| the legacy single-**object** `conflict` shape is absorbed into an array | no fixture seeds that shape |
| `capture_kind` defaults to `'specimen'` for a payload with no `captureKind` | asserted only via the malformed-value fallback, never the absent-key branch |

Two softer risks: no assertion ever reads the RPC's own JSONB return value (a wrong `created` flag would be invisible), and case 5's `ASSERT v_project IS NULL` (`:210-211`) is structurally vacuous in isolation — the test authors caught this themselves and added case 15 to cover it.

The file is transaction-wrapped `BEGIN`/`ROLLBACK` (`:119`, `:549`) and leaves nothing behind; safe on a shared local stack.

**CI reality:** neither PR-time gate touches SQL tests. `integration.yml`'s only DB step is `supabase test db` (`:49-50`) — a pgTAP-shaped runner, while every file under `supabase/tests/` including this one uses plain PL/pgSQL `ASSERT` — and `integration.yml` has no `pull_request` trigger. **This test will not run on the PR or on merge.** Run it locally before pushing 00530.

### 2.7 The ACL block does *not* match the canonical idiom it claims to match — LOW / 0.75 · *follow-up*

`00530:772-774` writes `REVOKE ALL … FROM PUBLIC, anon;` + `GRANT EXECUTE … TO authenticated;`. The canonical form at `00437:516-529` is `FROM PUBLIC, anon, authenticated, service_role` followed by an explicit `GRANT`. The comment at `00530:768-771` says the block "matches the canonical idiom for human readers"; it demonstrably differs in two roles. The `service_role` omission is deliberate and documented (`:764-766`) and I agree with the reasoning. The `authenticated` omission is functionally equivalent (the very next statement grants it back, and functions carry only EXECUTE). **Correct behaviour, inaccurate comment** — fix the sentence rather than the SQL.

The `anon` half is a genuine tightening on prod and is the right call, given this repo has been bitten twice (mood board, outbox RPCs).

### 2.8 `00-legacy-grants.sql` — the "untouched" ruling is wrong, and the file being touched is right — MEDIUM / 0.95

The brief asked whether leaving it untouched is right. It was **not** left untouched: `50b7f2228` adds +30 lines regenerating the seed for 00516 and 00530. That is correct and should stay:

- the block is local-only — `supabase/config.toml:60` lists it under `[db.seed]` only, and `:85-87` carries an explicit "NEVER put 00-legacy-grants.sql here" comment on the staging remote, with the file absent from staging's `sql_paths`. There is no prod seed mechanism at all;
- the content mirrors the migrations faithfully (REVOKE on the primitive, GRANT only on the wrapper), and the new 00530 block fixes a pre-existing gap: the older `commit_field_capture` line revoked `FROM PUBLIC` only, without `anon`.

The ruling that recorded it as untouched needs correcting in the ledger. No code change owed.

### 2.9 Prod-dependency check — clean, confidence 0.85

`00530` references only `field_capture_jsonb_text_array` (00235), `extensions.digest`, `enqueue_capture_enrichment_for_producer` (00516), and the `field_captures` columns from 00233 + its own section (a). Extension functions are schema-qualified. Nothing it touches is absent from prod once 00516 is applied. `ADD COLUMN … NOT NULL DEFAULT '<constant>'` takes PG11+'s fast path — no table rewrite. The non-`CONCURRENTLY` GIN build holds the table's existing ACCESS EXCLUSIVE for the duration; on a `field_captures` this size that is seconds, but it is a write-blocking window, so push it off peak.

---

## 3 · The recorder's concurrency

**Judgment: yes, this can crash on a real device, and it is a merge blocker.**

`SpeechVoiceNoteService` is `@unchecked Sendable` (`:29`) — the comment at `:478-480` admits the annotation "silences the compiler, not the race". Three threads plus the main actor touch its stored properties: the audio render thread (the tap block, `:322-352`), the serial `rotationQueue` (`rotate()`, `:501-542`), the Speech framework's own callback thread (`:216-234`, `:535-541`), and MainActor (`start`/`finish`/`endAtCap`/both notification observers).

`request` and `task` are correctly behind `OSAllocatedUnfairLock` (`:67-77`), and `openSegment` is correctly behind one (`:81`) with the write and the frame count taken together (`:326-347`) — that part is genuinely well done. Three fields were missed, and all three hold a class reference that ARC must retain and release.

### 3.1 **B1a — `latestTranscript`** (`:83`) — CRITICAL / 0.85

Written on the Speech callback thread at `:219` and `:539`. Read on `rotationQueue` at `:517-518` and `:526`, and on MainActor at `:286` and `:311`.

This one needs no timing coincidence. `rotate()` deliberately reads `let carried = latestTranscript` at `:526` **before** ending the old request at `:527-528`, so the old recognition task is still live and still delivering partial results — every ~100–300 ms — at the moment of the read. **Every 50 s rotation is a concurrent read/write of a `String`'s COW buffer reference.** A note over 50 s is Wave 1's ordinary case; a 20-minute note does this 23 times.

The failure mode is an ARC retain racing a release: sporadic `EXC_BAD_ACCESS` or a malloc double-free, far from the site, hard to reproduce, and it will be blamed on Speech.

### 3.2 **B1b — `audioSegments`** (`:105`) — CRITICAL / 0.8

Read on `rotationQueue` at `:507` (`segmentCount: audioSegments.count`) and `:534`. Appended to on MainActor in `closeCurrentSegment():422`, which is reached from `finish()`, `endAtCap()`, `endAbandonedNote()`, `reopenEngineAndSegment()` and — the reachable one — the interruption observer's `.began` branch at `:584`.

Concurrent read of an `Array<String>` while another thread appends is a data race on the buffer pointer and on element retains. The reachable sequence is ordinary: a phone call, an alarm, or a Siri activation arriving anywhere near a 50 s boundary; or the designer releasing the mic button at ~50 s, which is where `finish()` and a just-posted `rotate()` meet. This is the crash class the conductor parked, and I agree it is a crash class.

### 3.3 **B1c — `continuation`** (`:120`) — HIGH / 0.6

Read on the render thread at `:350`; written on MainActor at `:188`, `:215` and `:280`. `AsyncThrowingStream.Continuation` wraps a class reference, so the same ARC race applies. The window is narrower — `finish()` stops the engine and removes the tap at `:452-457` before nulling it at `:280` — but `AVAudioEngine.stop()` + `removeTap` do not contractually guarantee that an in-flight tap callback has returned.

### 3.4 Minimal fix for B1

Use the idiom the file already establishes for `request`/`task` — three lock-backed computed properties, no call-site changes:

```swift
private let transcriptBox = OSAllocatedUnfairLock<String>(uncheckedState: "")
private var latestTranscript: String {
    get { transcriptBox.withLockUnchecked { $0 } }
    set { transcriptBox.withLock { $0 = newValue } }
}

private let segmentsBox = OSAllocatedUnfairLock<[String]>(uncheckedState: [])
private var audioSegments: [String] {
    get { segmentsBox.withLockUnchecked { $0 } }
    set { segmentsBox.withLock { $0 = newValue } }
}

private let continuationBox =
    OSAllocatedUnfairLock<AsyncThrowingStream<TranscriptChunk, Error>.Continuation?>(uncheckedState: nil)
private var continuation: AsyncThrowingStream<TranscriptChunk, Error>.Continuation? {
    get { continuationBox.withLockUnchecked { $0 } }
    set { continuationBox.withLock { $0 = newValue } }
}
```

`audioSegments.append(_:)` becomes a non-atomic get-modify-set, which is acceptable here because **all** appends are on the main actor — only the reads are cross-thread, and each individual access is now atomic, which is what removes the ARC race. Worth one line of comment saying so.

### 3.5 The remaining unsynchronized fields are benign — LOW / 0.7 · *informational*

`noteIsActive`, `rotationInFlight`, `reopenInFlight` (Bools), `segmentStartedAt`, `stoppedAt`, `noteStartedAt` (`Date?`), `noteID` (`UUID`), `onDeviceRecognition` (Bool) are all raced but carry no refcount. The worst outcomes are a torn `Date`/`UUID` producing a spurious rotation or an `endAtCap` guard that fails and leaves the mic running. `tapFormat` (`AVAudioFormat?`, a class reference) is written and read only on the main actor — checked, it is fine.

### 3.6 A ~few-ms transcript hole at every rotation — LOW / 0.6 · *informational*

Between `request?.endAudio()` at `:527` and `request = next` at `:532`, the tap at `:325` appends to an ended request. Buffers in that window are lost from the transcript. The audio file is unaffected, which is the point of R114.1, so this is acceptable — but it is why a rotation boundary eats a word.

### 3.7 Locale is hardcoded — MEDIUM / 0.9 · *follow-up*

`:59` — `SFSpeechRecognizer(locale: Locale(identifier: "en-US"))`. A designer on a non-en-US device gets en-US recognition regardless. Fine for a US-only beta; state it as a known limit rather than let it be discovered.

---

## 4 · Fail-closed posture

### 4.1 The flag seam is genuinely fail-closed — VERIFIED, confidence 0.9

`CaptureAnalytics.swift:30` gives the protocol a default `func isFeatureEnabled(_ key: String) -> Bool { false }`, so any conformer that cannot answer answers no. `PostHogCaptureAnalytics.swift:62-65` guards on `enabled` (SDK configured at all) and on a non-empty key before consulting PostHog, and PostHog's own `isFeatureEnabled` returns `false` while flags are still loading. `FeatureFlagSeamTests.swift:27-31` asserts the fail-closed default explicitly rather than only the happy path — the test earns its name.

Both recorder entry points are gated: `SiteScanContextCapture.swift:35-38` exposes `voiceCaptureEnabled` as a computed property re-evaluated every render, `toggleVoice()` re-checks it at `:95`, and the mic pill itself is conditionally rendered at `:242-245` — so with the flag off the affordance is **absent**, not disabled. That is the cleaner of the two gates. `VoiceNoteSheet.swift:62-65` gates the sheet's `.task`; because `manualFallback` starts `false` and the flag check is synchronous with no `await` before it, the window in which the live recorder could render is at most one pass — not exploitable, but the F2 pattern is the one to copy.

**One caveat on the proof** (medium / 0.85): `FeatureFlagSeamTests` only ever instantiates hand-rolled stand-ins (`SilentAnalytics`, `FlaggedAnalytics`). It never touches `PostHogCaptureAnalytics` — the class that actually ships — so what is proven is the protocol default, not the concrete integration, and specifically not what PostHog returns between SDK setup and the first flags fetch. I believe that is `false` (PostHog treats an unloaded flag as disabled), but nothing in this repo demonstrates it. Worth one test against the real conformer with the SDK unconfigured.

### 4.2 With the flag OFF the voice sheet still opens, into typed entry — MEDIUM / 0.8

`VoiceNoteSheet.swift:62-65` sets `manualFallback = true` rather than dismissing. That is a defensible product choice, but it is the entry point for **B3** above, and it means "the flag is off" does not mean "this surface is inert". Either dismiss on a disabled flag, or land B3's fix — the latter is better, since typed notes are useful independent of voice.

### 4.3 The tray's Play control is not flag-gated — LOW / 0.8 · *follow-up*

`V1SessionTrayScreen.swift:141-163` renders the play button whenever `playableSegments` is non-empty, with no flag check. Harmless today (with the flag off no new segments can be produced) but it is a Wave 1 affordance escaping the Wave 1 flag.

### 4.4 `FieldReachability` — the conductor's fix is NOT visibly present; the default is optimistic — MEDIUM / 0.8

`FieldReachability.swift:15` reads `public private(set) var isOnline = true`. Before `NWPathMonitor`'s first `pathUpdateHandler` callback, the app believes it is online. That is fail-**open** in the literal sense.

I do not think it is a defect, and I would not block on it: nothing security- or durability-relevant gates on `isOnline`. The outbox is the real durability mechanism, `drain()` is attempted regardless, and `restored = online && !self.isOnline` (`:35`) means an initial `false` would fire a spurious `onRestore` drain on every launch while an initial `true` correctly stays quiet. Optimistic is the right default *for this variable*.

But the ledger records a fail-open fallback as *found and fixed*, and what is committed still defaults to `true`. **Either the fix is elsewhere and the ledger entry is imprecise, or it did not land.** Reconcile before merge — this is a one-minute check for whoever wrote the entry, and the wave's credibility rests on entries like it.

Two smaller notes on the same file, both correct as written: `start(onRestore:)` is safely re-callable (`:29-31`) because only `monitor.start` is latched while the callback is refreshed each time, which matters since SwiftUI `.task` re-fires; and `deinit { monitor.cancel() }` is safe from a nonisolated deinit because `NWPathMonitor` is thread-safe.

### 4.5 `requiresOnDeviceRecognition` follows the device, and can be `false` — MEDIUM / 0.9

`SpeechVoiceNoteService.swift:208-209`:

```swift
onDeviceRecognition = recognizer.supportsOnDeviceRecognition
request.requiresOnDeviceRecognition = onDeviceRecognition
```

When the device or locale does not support on-device recognition, this sets `false` and **the audio goes to Apple's servers**. That is a deliberate, silent fallback.

The wave handles this honestly on the two surfaces that matter: `4ecc29611` is titled "stop promising on-device only", the `NSSpeechRecognitionUsageDescription` reads *"That happens on this iPhone where it can; otherwise the recording is transcribed by Apple"*, and the `voice.finish` event carries `on_device` as the **resolved** value (`:311-313`) rather than re-reading the capability. Good.

Two gaps remain: nothing tells her **in the moment** which reading she got (`transcriptSource` is `device`/`device_partial` on both paths — see §5.5), and the analytics `on_device` flag is the only way anyone will ever know how often the server path is taken. Consider surfacing the distinction in wave 2 rather than leaving it to the Settings-app permission string.

### 4.6 `surface='field-ios'` is present on every event — but every per-event `surface` is silently discarded — MEDIUM / 0.75

The contract is met: `PostHogCaptureAnalytics.swift:33` registers `["surface": "field-ios"]` as a **super-property**, so it auto-attaches to all ten new events (`voice.start`, `voice.finish`, `voice.segment_rotated`, `voice.interrupted`, `voice.audio_write_failed`, `voice.empty_transcript`, `capture.placed`, `capture.unplaced`, `capture.place_tapped`, `sync.reconnect_drain`).

But `voice.start` (`SpeechVoiceNoteService.swift:177`) and `capture.place_tapped` (`ViewfinderModel.swift`) each pass their **own** `"surface"` property — `"n4"` / `"f2"` / `"c3"` — under the same key. The vendored SDK's merge at `posthog-ios/PostHog/PostHogSDK.swift:551-641` builds registered properties into `props` first and then does `props.merging(callerProps) { current, _ in current }`, **keeping the registered value**. The caller's screen-level tag is dropped on the floor.

Net: the dashboards will find the events, and every one of them will say `field-ios`. Nobody will ever be able to ask "did this voice note start on N4 or F2?" — which is exactly the question a wave whose two recording surfaces behave differently needs to answer. Rename the per-event key to `screen` (or `entry_surface`) and the instrumentation works as intended.

**No PII:** all new events carry counts, durations, reasons and booleans only — `transcript_chars` is a length, `had_audio` a boolean. No transcript text, no coordinates, no email reaches PostHog. *(confidence 0.85)*

---

## 5 · Honesty and copy

### 5.1 "Nothing recorded" is gone — VERIFIED, confidence 0.95

The only remaining occurrence in the whole app is inside a comment explaining its removal (`SiteScanContextCapture.swift:164`). Both surfaces now carry a ladder:

**F2 (`SiteScanContextCapture.swift:167-181`)** — three rungs, keyed correctly off the same local the guard uses:
- nothing captured, error door: *"Voice capture stopped before anything was kept — try the note again."*
- nothing captured, normal: *"Nothing was recorded — try holding the mic a moment longer."*
- audio, no words: *"We couldn't make out the words — the audio is here."*
- words: *"Note saved to this room."*

The fix at `:176-181` — holding the message in a local and assigning once — is real: the shipped code overwrote an honest failure message with the success toast two lines later.

**N4 (`VoiceNoteSheet.swift:81-86`, `:202-212`, `:186-190`)** — the same "We couldn't make out the words — the audio is here." on both the live and the manual-fallback surface, plus a genuinely good repair at `:186-190`: the manual sheet used to call every arrival "Voice capture isn't available here", including the recognition-error door that arrives holding a real recording. It now branches on `hasAudio`.

The primary action re-labels to *"Keep the recording"* when there is audio but no words (`:83-85`, `:215-217`), and `primaryEnabled` accepts audio alone. Before this wave an audio-only take could not be attached at all.

A scope correction to the brief: the two surfaces the ladder applies to are **N4 (`VoiceNoteSheet.swift`) and F2 (`SiteScanContextCapture.swift`)**, which is what §15.4's own warning note says. `V1SessionTrayScreen.swift` carries no ladder copy at all — it lists and plays already-captured notes. Both real surfaces are covered for the rungs that were built.

### 5.2 **Two §15.4 rungs are in the *After wave 1* column and are not built** — HIGH / 0.85 · *scope gap*

I checked every row of §15.4 against the code. Five of seven are delivered (transcription-returns-nothing, N4 audio-with-no-words, audio-file-won't-open, past-one-minute rotation, offline + `NWPathMonitor` + banner). Two are not:

**(a) "Recognizer unavailable / denied → *recording still starts*; the transcript pane says 'We'll write this up when it lands.'"**

`SpeechVoiceNoteService.startLiveTranscription():194-196`:

```swift
guard let recognizer, recognizer.isAvailable else {
    throw VoiceNoteError.recognizerUnavailable
}
```

This throws **before** `AVAudioSession` is configured (`:198-200`) and before `openSegment` (`:211`) — so no audio is captured at all. `VoiceNoteSheet.begin()`'s catch (`:278-282`) and its `.task` (`:62-70`) both just set `manualFallback = true`; F2's `startVoice()` catch shows `toast = "Microphone unavailable"` (`SiteScanContextCapture.swift:132`) and records nothing. The string *"We'll write this up when it lands"* appears **nowhere** in the repo.

That is verbatim the spec's **Today** column, unchanged. It also matters more than a copy gap: `SFSpeechRecognizer.isAvailable` goes false when a locale needs the server and there is no network — i.e. **on a job site with no signal, the recorder refuses outright** and the wave's own thesis ("the audio is the record", R114.1) does not hold on the one door where it is most needed. She is at least told immediately, via the typed-entry surface, so nothing is silently lost — which is why this is a scope gap and not a blocker.

The fix is not large: move the recognizer guard *after* the audio session + `openSegment`, run audio-only when recognition is unavailable, and show the spec's line in the transcript pane. But it is a build, not an edit — so it needs a ruling: **build it now, or defer it to wave 2 explicitly and stop describing Wave 1 as delivering §15.4.**

**(b) "Note hits the 20-minute cap → stops with *'This note reached twenty minutes and stopped. Start another when you're ready.'* — never a silent stop."** — MEDIUM / 0.85

The cap is enforced (`VoiceRecordingPolicy.shouldEnd`, `SpeechVoiceNoteService.rotate():506-524`) and the stop is not silent, but the mandated copy is absent — grep for "twenty minutes" returns nothing outside a comment. `SiteScanContextCapture.stopVoice(reason: .capped)` routes to the same generic messages as a manual stop (`:176-181`), and N4's `end()` says nothing about the cap at all. `VoiceEndReason.capped` is threaded all the way through and then never used to differentiate the copy — the seam is there, the string is missing.

This compounds **B2**: the cap path is simultaneously the least-tested path, the one that can drop its last segment, and the one whose copy is missing. Fix them together.

### 5.3 No forbidden wording introduced — VERIFIED, confidence 0.85

Zero occurrences of "AI" in user-facing strings anywhere in the app. The wave **removes** three user-facing "Inbox" strings (`"Photo added to Inbox"`, `"Voice note added to Inbox"`, and the F2 header's "these land in your Inbox") and introduces none.

### 5.4 One "Inbox" string left behind on the same flow — LOW / 0.85 · *follow-up*

`SiteScanSetupScreen.swift:154` still reads *"…capture reference photos and voice notes for this room instead. They land in your Inbox."* That is the screen immediately before the one this wave cleaned. She will read the old promise and then the new one, one tap apart. Four other pre-existing hits (`S1AssignVenueScreen.swift:328,355`, `S3DestinationScreen.swift:83`, `LocalCaptureSyncService.swift:38`) are outside this wave's surface and can wait.

The wave also removed the F2 `ESCALATE`-class placeholder markers (`SiteScanContextCapture.swift:9`, `:335-341`) and replaced them with real copy. No new placeholders, TODOs or lorem text in the diff.

### 5.5 `transcript_source`, `capture_kind`, `note_setting` values all match 00530's CHECKs — VERIFIED, confidence 0.9

| Producer | Value | CHECK | OK |
|---|---|---|---|
| `VoiceNoteSheet.swift:347-349` | `"device_partial"` / `"device"` / `"designer"` | `00530:55` | ✅ |
| `SiteScanContextCapture.swift:195` | `"device_partial"` / `"device"` | `00530:55` | ✅ |
| `VoiceNoteSheet.swift:350` | `captureKindRaw = "note"` | `00530:42` | ✅ |
| `ContextCaptureService.swift:61` | `captureKindRaw = "context"` | `00530:42` | ✅ |
| `note_setting` | no wave-1 producer (forward-declared) | `00530:58` | ✅ |

Snake_case on both sides, no camelCase drift. Note that `"server"` has no client producer, which is correct — it is wave 6A's. And even if a value did drift, `00530:316-323` projects it to NULL rather than raising, which is the belt to this braces.

One semantic wrinkle: `transcriptSource = "device"` is written whenever recognition produced words, **including when `requiresOnDeviceRecognition` was false and Apple's servers did the reading** (§4.5). The column will therefore over-report on-device provenance. Not a CHECK violation, but the value is less true than its name. Worth a wave-2 decision: either add a `server` producer for that path or rename the app-side meaning.

---

## 6 · Hygiene

### 6.1 **B4 — `database.types.ts` reformat is a live merge hazard** — HIGH / 0.95

`git show main:packages/supabase/src/database.types.ts` and `git show cde7c7628:…` are byte-identical (md5 `1e4da2068da2ba8ddb1b420774a0d38d`) — main's file is raw `supabase gen types typescript` output, with no formatter step in `packages/supabase/package.json:15`. The branch's copy has been through a formatter: it adds trailing semicolons and rewraps long lines. Normalizing both sides (`sed -E 's/;[[:space:]]*$//'` plus trailing-whitespace strip) collapses the 63,918-line diff to **127 lines**, of which ~18 are the genuine `field_captures` additions (`audio_retention`, `capture_kind`, `note_setting`, `transcript_source`, `voice_audio_purged_at`, `voice_audio_segments` across Row/Insert/Update) and ~100 are cosmetic rewraps of untouched signatures.

Landing this reformats ~34k lines of a generated file that several concurrent lanes also regenerate. Every one of them gets a spurious full-file conflict.

**Fix (blocker, cheap):** regenerate on this branch with the committed `generate` script and **no** formatter/format-on-save pass, then confirm the normalized diff against main is only the ~18-line delta. Failing that, isolate the reformat into its own commit so it can be dropped or rebased independently.

### 6.2 No secrets — VERIFIED, confidence 0.92

`Secrets.xcconfig.example:13` carries the literal placeholder `phc_REPLACE_WITH_POSTHOG_PROJECT_KEY`; `BuildSettings.xcconfig:25` defaults `POSTHOG_API_KEY` to empty and `#include?`s the gitignored real file; `.gitignore` correctly adds `Capture/App/Configuration/Secrets.xcconfig`, and no such file is in the diff. `AppConfiguration.swift:135-139` trims the Info.plist value and only uses it when non-empty, so a fresh checkout resolves to `""` and analytics no-ops rather than shipping the placeholder as a key. `archive-testflight.sh` reads `ASC_KEY_ID`/`ASC_ISSUER_ID`/`ASC_PRIVATE_KEY_PATH` from the environment only; `ExportOptions.plist` carries the public team id.

### 6.3 pbxproj / schemes — no unexpected deltas — VERIFIED, confidence 0.88

`generate_project.rb:17-19` does `FileUtils.rm_rf(PROJECT_PATH)` and rebuilds from scratch, so `xcodeproj` mints fresh UUIDs for every object on every run — the 2474-line delta is generator behaviour, not churn. Verified UUID-independently by extracting and diffing the full `name=`/`path=` reference sets from both revisions: **zero references disappeared**, and the 18 additions match the wave's new files exactly. `CODE_SIGN_STYLE`, `DEVELOPMENT_TEAM`, `IPHONEOS_DEPLOYMENT_TARGET = 18.0` and `Capture.entitlements` are byte-identical. Both `.xcscheme` diffs are pure `BlueprintIdentifier` swaps tracking the same target names.

That said, the raw diff is unreviewable by eye. Anyone reviewing a future pbxproj change should use the same set-comparison rather than reading the diff.

### 6.4 `migration-number-reservations.md` — accurate, with one stale row that matters at push time — MEDIUM / 0.85

00521 is recorded (`:82`), the 00530–00535 band is reserved with 00530 marked minted (`:83`, `:153`), and the 00516 row (`:107`) carries an explicit and correct self-correction of an earlier false claim about the `enqueue_capture_enrichment` grant — independently corroborated by the `00-legacy-grants.sql` regeneration. No number is double-booked; nothing contradicts `ls supabase/migrations/`.

**But `:105-107` still says 00514/00515/00516 are "NOT applied to staging or prod", and `:153` says 00530 "cannot be pushed before 00516 is".** Per the standing fact, 00516 **is** on prod as of 2026-08-25 ~09:30Z. Correct those three rows at push time or the next lane's census will read a false blocker.

Separately (medium / 0.55): the new 00530 row asserts "cloudflare-phases Phase 2 stays at or below `00529`", while that program's own row still reads `00494–00497`. The gap 00522–00529 is unexplained. Not a collision — nothing has drawn from it — but it weakens the ledger's single-source guarantee.

### 6.5 Commits and stray files — clean — VERIFIED, confidence 0.9

All 49 non-merge subjects pass `scripts/hooks/patina-hooks.mjs:153-158`. The three merge commits use git's default `Merge remote-tracking branch …` subject, which the hook exempts at `:152-154` — no `merge:` violation. No `.DS_Store`, `.orig`, `.bak`, scratch files, or anything under `artifacts/` or `.superpowers/`. The five files over 100 KB are all legitimate (generated types, generated seed, generated pbxproj, the migration, the reservations doc).

---

## 7 · The privacy manifest

**Answering the brief's question directly: this is an App Store-review follow-up, not a merge blocker and — on the evidence — not a TestFlight-upload blocker either.** The three mechanisms must not be conflated:

**(i) Required-reason APIs (ITMS-91053).** Apple statically scans the uploaded binary for required-reason API categories and emails a warning at processing when no manifest in the bundle declares an approved reason. This is the one that actually bites at upload. The app uses exactly two such categories — `UserDefaults` and file timestamps — and **both are already declared** (`PrivacyInfo.xcprivacy`, `CA92.1` and `3B52.1`). Greps for `systemUptime`, `mach_absolute_time`, `volumeAvailableCapacity`, `statfs` found nothing. **Currently mitigated.** *(confidence 0.65 on the enforcement mechanics, 0.85 on the code facts.)*

One precision note (low-medium / 0.55): several call sites use `UserDefaults(suiteName: CaptureStore.appGroupID)` — an app-group suite (`SettingsScreen.swift:17`, `FieldScanUploadShadowLeg.swift:42-43`, `SupabaseSessionService.swift:92`, `CaptureSessionContext.swift:116`) — while only `CA92.1` ("app itself only") is declared. `1C8F.1` is the app-group reason. Unlikely to trigger anything automated; worth correcting for accuracy.

**(ii) Third-party SDK manifests (ITMS-91061).** `posthog-ios` 3.69.11 ships its own `PrivacyInfo.xcprivacy`, as does its bundled `PHPLCrashReporter` — verified directly in the SPM checkouts. `supabase-swift` 2.55.1 ships none, but it is not on Apple's "commonly used SDK" list to my knowledge *(confidence 0.4 — worth confirming against the live list before the first upload)*. Both are built from source, not prebuilt binaries, so the separate SDK-signature requirement is unlikely to apply.

**(iii) Data-collection declarations inside the xcprivacy.** This section is self-reported. Apple does not automatically reject an upload for a mismatch here; it aggregates into the on-device App Privacy Report and is available to human reviewers, who are expected to find it consistent with the App Store Connect nutrition label. **This is where the gap is, and it is real.**

The committed manifest declares only `NSPrivacyCollectedDataTypeUserID` and `NSPrivacyCollectedDataTypeProductInteraction` — PostHog-shaped. Ground truth, established by grep:

| Missing declaration | Evidence it is collected |
|---|---|
| `NSPrivacyCollectedDataTypePreciseLocation` | `CoreLocationService.swift:16,33,47,124-137`; `VenueStamp.swift:16-18`; uploaded via `FieldCapturePayload.Venue.lat/lng/accuracyM` (`:121-130`) |
| `NSPrivacyCollectedDataTypePhotosorVideos` | camera + PhotosUI capture; uploaded at `SupabaseCaptureGateway.swift:40-43` |
| `NSPrivacyCollectedDataTypeAudioData` | `SpeechVoiceNoteService.swift`; uploaded as `voice.audioPath`/`audioSegments` |
| `NSPrivacyCollectedDataTypeOtherUserContent` | transcripts + free-text notes (`FieldCapturePayload.swift:22-23`, `:98-103`) |
| `NSPrivacyCollectedDataTypeEmailAddress` | `SupabaseSessionService.swift:116,214`; `AccountScreen.swift:98-105` |
| `NSPrivacyCollectedDataTypeDeviceID` | IDFV sent for QR device verification, `SupabasePortalAuthApprovalService.swift:275-277` |

**Recommendation:** add all six as `Linked: true`, `Tracking: false`, purpose `NSPrivacyCollectedDataTypePurposeAppFunctionality` (the closest fit for every one of them given the code — the purpose choice is a product/legal call, confidence 0.55 on my assignment), and fill the App Store Connect nutrition label to match. Do it **before the first upload**, not before merge. *(Severity high, confidence 0.9 that the gap exists; 0.65 that it is not an upload blocker.)*

One open thread (medium / 0.4): PostHog bundles `PHPLCrashReporter`, and `PostHogCaptureAnalytics.swift:29-31` sets only `captureScreenViews` and `captureApplicationLifecycleEvents`, leaving crash capture at the SDK default. If PostHog-iOS enables crash capture by default, `NSPrivacyCollectedDataTypeCrashData` is owed too. Check the SDK default.

Info.plist usage strings are **all present and honest** — supplied as `INFOPLIST_KEY_*` build settings via `generate_project.rb:97-113` with `GENERATE_INFOPLIST_FILE = YES`. Camera, microphone, speech recognition, location-when-in-use, photo library, photo-library-add, Face ID and motion are all covered. **No missing-usage-string crash risk found** for any API the app calls. The speech string is unusually good. The location string (*"Stamps each capture with the venue where you found it."*) does not mention that the coordinates are uploaded — a completeness nit, not an inaccuracy (low / 0.5).

---

## What a designer will feel on the first build

She holds the mic and talks, and for the first time the words appear as she says them and the recording is actually kept — which it never was before, whatever the old header claimed. On a noisy site where the transcript comes back empty she is no longer told "Nothing recorded" and left with nothing; she is told *"We couldn't make out the words — the audio is here,"* the button changes to **Keep the recording**, and she can press Play and hear herself say it. That is the wave's whole promise and, on that door, it lands. Then the capture syncs and the Play button quietly disappears — the phone deletes the local audio the moment the server confirms it, and portal playback is wave 4. The disappearance is deliberate and better than a Play button that plays silence, but the felt experience is that her note becomes *less* playable the moment it succeeds, and nobody has told her why. If she talks past twenty minutes the note stops on its own without saying so in those words, and — until B2 is fixed — the last stretch may not come with her. If she hits Stop right around the fifty-second mark, or takes a phone call mid-note, she is standing on B1's race. If she reopens a note to fix the wording by hand, B3 can take the audio out from under it. And in the deepest basement of the job site, where the phone has no signal and the recognizer reports itself unavailable, the sheet does not record at all — it hands her a keyboard. That is the one place where "the note survives" is still not true, and it is the place the wave was named for.

Fix the four blockers and rule on §5.2, and she will feel exactly one thing: that the app finally kept what she said.

---

## Prod-push order for `00530`

`00530` is safe to push, but **not with a bare `supabase db push`.**

1. **Confirm 00516 is really on prod before anything else.** `00530`'s body is authored on 00516's, and section (c) calls `enqueue_capture_enrichment_for_producer`, which 00516 creates. Pushing 00530 first would leave `commit_field_capture` referencing a function that does not exist. Verify the deployed function body carries the enqueue call — not just that the ledger has a row:
   ```sql
   select prosrc like '%enqueue_capture_enrichment_for_producer%'
     from pg_proc where proname = 'commit_field_capture';
   ```
2. **Enumerate what a push would actually apply.** `supabase migration list` against Strata. `db push` applies every unapplied file in filename order — and `00521_svc_media_shape_reconciliation.sql` sorts between 00516 and 00530. If 00521 is still pending, a blanket push drags an `svc_media` DDL against prod's Prisma-shaped schema along with the Field migration. That is the exact class this repo has been bitten by. **If anything other than 00530 is pending, apply 00530 alone** via the file-based push invariant in `docs/ops/strata-staging.md`.
3. **Run the SQL test locally first** — `scripts/run-sql-tests.sh` on `supabase/tests/field/field_capture_note_routing_test.sql`. CI will not run it: `integration.yml` has no `pull_request` trigger and its DB step is a different runner.
4. **Push off peak.** The migration is one transaction holding ACCESS EXCLUSIVE on `field_captures` across five `ADD COLUMN`s, a non-`CONCURRENTLY` GIN build, and five policy swaps. Seconds on a small table, but writes block for all of it.
5. **Verify after, on prod, read-only:**
   - `\d field_captures` shows the six new columns and the four named CHECKs;
   - `select indexdef from pg_indexes where indexname = 'idx_field_captures_provenance_gin'` mentions `jsonb_path_ops`;
   - all five policies show `roles = {authenticated}` in `pg_policies` with the 00233 predicates;
   - `has_function_privilege('anon', 'public.commit_field_capture(uuid,text,jsonb,uuid,uuid,text,uuid)', 'EXECUTE')` is **false** and the same for `authenticated` is **true**;
   - `commit_field_capture`'s body still contains `enqueue_capture_enrichment_for_producer`.
6. **Correct the ledger rows** at `docs/engineering/migration-number-reservations.md:105-107` and `:153` — 00514/00515/00516 are no longer "NOT applied to prod", and 00530's stated blocker is cleared.
7. **iOS ships after the DB, not with it.** `capture_kind` and the voice columns must exist before a build that writes them reaches any device. The flag stays off until the device pass runs.

`00530` needs no rollback plan beyond the ordinary: every change is additive, the policy restatement is byte-identical, and `commit_field_capture` can be restored by re-applying 00516's body.

---

## Follow-up docket

| Item | Owner surface | Ref |
|---|---|---|
| **Rule on the two unbuilt §15.4 rungs — build now or defer explicitly** | conductor + spec | §5.2 |
| Rename the per-event `surface` key so it stops colliding with the super-property | analytics | §4.6 |
| Test the fail-closed default against `PostHogCaptureAnalytics`, not just the protocol | CaptureTests | §4.1 |
| Test `stampedVoicePaths` / the X1 fix | CaptureTests | §1.7 |
| Delete superseded takes on re-record; decide what makes the soft cap a cap | N4 sheet + CaptureStore | §1.5, §1.6 |
| Guard the inbox+placement re-commit loop before wave 4 | LocalCaptureSyncService | §1.8 |
| Narrow EDIT 4's `WHEN OTHERS` to `raise_exception` + `'field_captures:%'` | next Field migration | §2.5 |
| Close the nine untested 00530 claims — the `FOUND` regression first | field SQL test | §2.6 |
| Fix the ACL comment's canonical-idiom claim | 00530 comment (or a doc note if 00530 is already pushed) | §2.7 |
| Correct the "00-legacy-grants.sql untouched" ruling in the ledger | conductor's ledger | §2.8 |
| Lock-back the remaining raced fields; decide on locale | SpeechVoiceNoteService | §3.5, §3.7 |
| Reconcile the `FieldReachability` fail-open ledger entry | ledger | §4.4 |
| Decide `transcript_source` semantics when Apple's servers did the reading | wave 2 | §5.5 |
| Fix `SiteScanSetupScreen.swift:154`'s "Inbox" | copy | §5.4 |
| Add the six `NSPrivacyCollectedDataType` entries + ASC nutrition label | before first upload | §7 |
| Run `device-pass-spec.md`'s 44 assertions | device pass | — |
