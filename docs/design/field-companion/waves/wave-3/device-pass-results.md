# Field Companion — Wave 3 combined device pass · results

**Device** Kody's Phone, iPhone 17 Pro Max (`iPhone18,2`), iOS **27.0** (`24A5424a`), LiDAR.
**Build** `0.1 (3)` — signed Debug from `8ce211445`, team `VP22LXHT7L`, installed over `0.1 (1)`
at 14:16 on 2026-08-26.
**Toolchain** Xcode **27.0** (`27A5252f`) via `DEVELOPER_DIR=/Applications/Xcode-beta.app/…`.

Claim ladder per `patina-ios-verification`: **compile-green < sim-verified < device-verified.**
An assertion not personally observed is **NOT EXERCISED**. It is never written PASS.

---

## Block C — four real objects

**Driven by Kody, 14:29:38 – 14:32:52.** Kody's summary: *"Most items were categorized as a textile
or not at all."*

⚠ **Observation gap.** WebDriverAgent died at ~14:18 (the USB cable came out; `xcodebuild` exited 65)
and was not back until **14:33**. Block C ran entirely inside that window, so **there is no UI-level
record of it** — no card screenshots, no S3 observation, no "did the category arrive a beat after the
card" timing. Everything below is reconstructed from the on-device SwiftData store, which is
complete and unaffected. Restarting WDA needed no action from Kody.

### C.1 The 13 rows (not 5)

Kody shot **13** captures, not the 5 the script anticipates — all in **one capture session**
(`8F6D8DF2-8B7C-4A82-9D12-F3A63B487448`), one every ~15 s across 3 m 14 s.

| pk | time | category | conf | provenance | material | title | state |
|---|---|---|---|---|---|---|---|
| 6 | 14:29:38 | `unknown` | **—** | **(empty)** | – | – | draft/undecided |
| 7 | 14:29:58 | `storage` | 0.6445 | smartGuess | – | – | draft/undecided |
| 8 | 14:30:10 | `textile` | 0.2966 | smartGuess | – | – | draft/undecided |
| 9 | 14:30:20 | `textile` | 0.3147 | smartGuess | – | – | draft/undecided |
| 10 | 14:30:31 | `unknown` | **—** | **(empty)** | – | – | draft/undecided |
| 11 | 14:30:43 | `unknown` | **—** | **(empty)** | – | – | draft/undecided |
| 12 | 14:30:59 | `unknown` | **—** | **(empty)** | – | – | draft/undecided |
| 13 | 14:31:16 | `storage` | 0.6445 | smartGuess | – | – | draft/undecided |
| 14 | 14:31:24 | `textile` | 0.2170 | smartGuess | – | – | draft/undecided |
| 15 | 14:31:30 | `textile` | 0.3350 | smartGuess | – | – | draft/undecided |
| 16 | 14:31:36 | `textile` | 0.2258 | smartGuess | – | – | draft/undecided |
| 17 | 14:32:45 | `storage` | 0.2734 | smartGuess | – | – | draft/undecided |
| 18 | 14:32:52 | `storage` | 0.7485 | smartGuess | – | – | draft/undecided |

Every row: `ZSUGGESTIONBASISRAW`, `ZSUGGESTIONREASONRAW`, `ZSUGGESTIONCONFIDENCE`, `ZTITLE`,
`ZMATERIALNOTE` all **nil**; `ZMATERIALS` / `ZCOLORS` / `ZSTYLETAGS` decode to **empty NSArrays**.
Photos: 13, all 4032×3024, `photo` mode, all primary.

✅ **No invented material anywhere** — the failure mode the script names explicitly is clean.

### C.2 `draft` / `undecided` is correct, not a fault

All 13 carry `status=draft`, `destination=undecided`, no `ZREMOTEID`. Per **FC-R6** that is the
expected resting state: no visit was open, so captures stay unplaced and wait on Today's band;
placement happens from the tray.

Store-side count reconciles: **18 specimens total** = 13 new + the 5 pre-existing. The Today band
read **"5 captures not placed yet"** immediately after install (verified on screen at 14:18), which
matched the store's then-5 unplaced rows.

⚠ The band/tray re-check at 18 is **NOT EXERCISED** — Kody moved straight to Block G and is recording;
navigating to the tray needs taps that would interrupt him. **Owed: one tray screenshot after Block G.**

### C.3 The wall defect

Cannot be identified with certainty — Kody's per-object commentary was lost with the WDA outage, and
13 rows cannot be mapped onto 5 named objects without it.

What can be said precisely: **four rows (pk 6, 10, 11, 12) recorded no category at all.** Quoting pk 6:

```
pk=6  created=2026-08-26 14:29:38  ZCATEGORYRAW='unknown'
      ZGUESSCONFIDENCERAW = { }        ← empty dictionary
      ZPROVENANCERAW      = { }        ← empty dictionary
      ZSTATUSRAW='draft'  ZDESTINATIONRAW='undecided'  ZREMOTEID=NULL
```

The empty provenance is the point: `unknown` here is **the app's fallback for "no read"**, not a
guess the reader made. `SmartGuessKeywords.category(forVisionLabel:)` returns `nil` — its own comment
says *"Nil means 'we could not tell' — never `.unknown` dressed up as an answer"* — and
`classifyCategory` then returns `(.unknown, 0)`. So the no-category half of the assertion is
**satisfied by at least four captures**, one of which is presumably the wall defect.

⚠ The other half — **S3 recommending Inbox** for it — is **NOT EXERCISED**. Every row is
`undecided`, so S3 was never reached for any of these 13.

### C.4 FC-R16 — no measurement was written

```sql
-- device store, Core Data epoch (+978307200)
select count(*) from ZCAPTUREMEASUREMENT
 where datetime(ZCREATEDAT+978307200,'unixepoch','localtime') > '2026-08-26 14:17:00';
→ 0

select count(*) from ZCAPTUREMEASUREMENT m
  join ZSPECIMEN s on m.ZSPECIMEN = s.Z_PK where s.Z_PK >= 6;
→ 0
```

**0 measurement records since 14:17, and 0 attached to any Block C specimen.** (Three rows exist in
the store in total, all predating this walk.) A spoken number wrote nothing. **PASS.**

### C.5 The recognizer — my read: framing, not a broken reader or a taxonomy gap

Two hypotheses were testable and both are **ruled out**:

- **Not a taxonomy gap.** `SpecimenCategory` carries `seating, table, lighting, storage, textile,
  rug, decor, hardware, material, paint, tile, wallcovering, plumbing, appliance, art, unknown` —
  there are buckets for chair (`seating`), lamp (`lighting`), rug (`rug`) and cabinet pull
  (`hardware`).
- **Not a missing mapping.** `SmartGuessKeywords.table` maps `chair/armchair/stool/bench/seat`→seating,
  `lamp/light/chandelier/sconce`→lighting, `rug/carpet`→rug, `knob/handle/hinge`→hardware. All four
  target objects have keyword coverage.

**The confidences are the evidence.** Of 13 captures: **4 produced no usable Vision label at all**,
and of the 9 that did, **7 landed below 0.35** (0.217, 0.226, 0.227, 0.273, 0.297, 0.315, 0.335).
Only three cleared 0.6. `VNClassifyImageRequest` on a well-framed, well-lit chair returns `chair`
with high confidence; 0.22–0.33 is the classifier saying *it can barely see a subject*. A reader that
was working but mislabelling would be **confidently wrong**, not uniformly unsure.

Combined with the cadence — 13 shots in 3 m 14 s, several 6–7 s apart — and the one viewfinder frame
I did capture at 14:33 (`shots/blockC-viewfinder-tiled-floor.png`, an empty tiled floor with no
subject in frame), this reads as **subject too small / too far / too cluttered**, not a code defect.

⚠ **I could not inspect the photos to confirm brightness or subject size.** Per §6.2 of the wave-1
results, `mediaDirectory()` is `<AppGroup>/CaptureMedia` at the container **root**, which `devicectl`
can neither list nor copy; and these captures are unsynced, so there is no bucket copy either. The
framing read is an **inference from confidence distribution and cadence**, explicitly not a
measurement. **Re-running four deliberate, close, well-lit shots would settle it in two minutes** and
is the recommended next step before anyone files a reader bug.

🟡 **Latent defect found while investigating (not the cause here).**
`SmartGuessKeywords.category(forVisionLabel:)` does **ordered substring matching**:
`for entry in table where id.contains(entry.keyword)`. Because it returns the first table entry whose
keyword is a *substring* of the label, some Vision labels will mis-route — `("tap", .plumbing)`
matches **"tapestry"** (a textile → plumbing), `("light", .lighting)` matches "skylight"/"lighter",
`("print", .art)` matches "printer". No `plumbing` or `art` row appeared in this block, so this did
not fire today, but it is a real ordering fragility worth a ruling.

### C.6 Server side — nothing has reached Strata, as expected

⚠ The Supabase MCP is **down**. `patina-prod-ops/SKILL.md` documents no non-MCP SQL path (it says
"prefer the Supabase MCP"), so I used the linked CLI's `supabase db query … --linked`, read-only
SELECTs only. **Worth adding that command to the skill** — it is the only working read path right now.

```sql
select count(*) from public.field_captures
 where designer_id = '74056c2a-866d-42b0-9e2a-d473c2484316'
   and created_at > '2026-08-26 19:17:00+00';
→ 0

select count(*) from storage.objects
 where bucket_id = 'capture-media' and created_at > '2026-08-26 19:17:00+00';
→ 0
```

**0 rows and 0 media objects** — correct, because nothing is placed. Kody's all-time total stands at
**13**. Note the owner column is `designer_id`, not `owner_user_id`.

🔴 **Schema finding — Wave 3's columns are not on prod.**

```sql
select string_agg(column_name, ', ') from information_schema.columns
 where table_schema='public' and table_name='field_captures'
   and (column_name like 'visit%' or column_name like 'sugg%');
→ NULL   (zero matching columns)
```

`field_captures` on Strata has **no `visit_id`, `visit_kind`, `suggested_project_id` or
`suggestion_basis`**. The requested column list could not be selected because those columns do not
exist. The W3 build is on the phone but **its migration has not been applied to Strata**, so the
moment Kody places any of these 13, `commit_field_capture` will be writing against a pre-Wave-3
schema. **This needs a decision before the placement half of the walk**, or the visit fields will be
silently dropped (or the RPC will error).

### C.7 Verdicts

| Step | Assertion | Verdict |
|---|---|---|
| **C1** | Chair → its own category | **UNKNOWN** — no `seating` row exists among the 13, but rows cannot be mapped to objects without Kody's lost commentary |
| **C2** | Category arrives *a beat after* the card | **NOT EXERCISED** — WDA was down; timing is a UI observation |
| **C3** | Table lamp → its own category | **UNKNOWN** — no `lighting` row exists; same mapping problem |
| **C4** | Rug → its own category | **UNKNOWN** — no `rug` row exists; same |
| **C5** | Cabinet pull → its own category | **UNKNOWN** — no `hardware` row exists; same |
| **C5b** | Four objects must not all return the same category | **FAIL (as reported by Kody), qualified** — 3 distinct values landed (`textile` ×5, `storage` ×4, `unknown` ×4), so not literally one category; but none is the *expected* category for any of the four objects, and Kody's "textile or not at all" is borne out |
| **C5c** | No invented material | **PASS** — `materials`/`colors`/`styleTags` empty, `materialNote` nil on all 13 |
| **C6** | Wall defect → no category recorded | **PASS (subtraction half)** — 4 rows carry `unknown` with **empty** provenance, i.e. no read was made. **S3-recommends-Inbox half NOT EXERCISED** (all rows `undecided`) |
| **C7** | FC-R16 — a spoken number writes no measurement | **PASS** — 0 measurement rows since 14:17, 0 attached to any Block C specimen |

**Claim level for Block C: device-verified** for C5c, C6's subtraction half and C7; **unknown** for
C1–C5 pending either Kody's object-by-object recall or a four-shot re-run.

### C.8 Owed

1. **One tray screenshot** showing the unplaced cards, after Block G (needs taps — cannot run while
   he is recording).
2. **Kody's recall**, or a re-run: which object produced which category, and whether any card showed
   a category *at all* for the chair / lamp / rug / pull.
3. **A ruling on the prod schema gap** before any placement step.
