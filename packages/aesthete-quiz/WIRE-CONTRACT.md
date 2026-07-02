# The Aesthete Engine style quiz — wire contract

**Audience:** any consumer of the quiz — the Patina client portal, and especially the **external PatinaWebsite (marketing) repo**, which does not share this monorepo. This document is the canonical integration contract; the `@patina/aesthete-quiz` package is convenience on top of it.

**Source of truth:** `supabase/migrations/00243_aesthete_client_quiz.sql` (shipped 2026-07-01), which implements design §7.1/§7.2 of `docs/prds/AE/aesthete-engine-system-design.md`. Where the design doc and the shipped migration differ, **the migration wins** — every delta is listed in [§7.1 vs shipped](#71-vs-shipped-delta-table) below.

**Verified live** against the local stack 2026-07-01 (real anon submit; see `scripts/smoke.ts`).

---

## The two RPCs

Both are `SECURITY DEFINER` SQL functions exposed over PostgREST — **not** edge functions. Same endpoint, same anon key, identical from the marketing site and the portal.

| RPC | Method + path | Who may call |
|---|---|---|
| `submit_style_quiz` | `POST {BASE}/rest/v1/rpc/submit_style_quiz` | anon **or** authenticated |
| `claim_quiz_session` | `POST {BASE}/rest/v1/rpc/claim_quiz_session` | authenticated only (anon → **401**) |

`{BASE}` is the Supabase API origin:

| Environment | BASE |
|---|---|
| Production | `https://api.patina.cloud` |
| Local dev | `http://localhost:54321` |

### Headers (every call)

```
Content-Type: application/json
apikey: <SUPABASE_ANON_KEY>
Authorization: Bearer <user JWT if signed in, otherwise the anon key>
```

The `apikey` header is required by Kong. The `Authorization` bearer decides the Postgres role: the anon key ⇒ `anon`, a user JWT ⇒ `authenticated`. (This is exactly the pair supabase-js sends.)

---

## `submit_style_quiz`

### Request

```json
{
  "p_session_key": "c1f00000-0000-4000-8000-000000000000",
  "p_source": "marketing_site",
  "p_answers": {
    "visual_resonance": "warm_minimal",
    "lifestyle": ["family", "entertaining"],
    "material": "weathered_oak",
    "investment": "heirloom",
    "catalyst": "new_home"
  },
  "p_timings": { "q1_ms": 4200, "q2_ms": 3100, "q3_ms": 2500, "q4_ms": 1800, "q5_ms": 1200 },
  "p_attribution": { "utm_source": "…", "posthog_distinct_id": "…" }
}
```

| Param | Required | Notes |
|---|---|---|
| `p_session_key` | ✅ | Client-generated **uuidv4**, persisted in localStorage. See [Session-key semantics](#session-key-semantics). |
| `p_answers` | ✅ | All five keys must be present. `lifestyle` must be a JSON array. `catalyst` may be `null` (the key itself is still required). Total payload < 8 KB. |
| `p_timings` | optional (default `{}`) | Per-question dwell in ms, keyed `q1_ms`…`q5_ms`. Free-form jsonb. |
| `p_source` | optional (default `'web'`) | Free text. Use `'marketing_site'`, `'client_portal'`, or `'ios'`. |
| `p_attribution` | optional (default `{}`) | Free-form jsonb; utm_* and `posthog_distinct_id` are the expected keys. |

### Answer vocabulary (the `quiz_option_loadings` seed, verbatim)

| Question | Key | Kind | Option keys |
|---|---|---|---|
| Q1 visual resonance | `visual_resonance` | single, **strict** | `warm_minimal` · `cool_modern` · `classic_comfort` · `eclectic_curated` |
| Q2 lifestyle | `lifestyle` | multi, lenient | `family` · `entertaining` · `sanctuary` · `work_from_home` |
| Q3 material | `material` | single, **strict** | `weathered_oak` · `brushed_metal` · `soft_linen` · `aged_leather` · `woven_rattan` |
| Q4 investment | `investment` | single, **strict** | `starter` · `curated_comfort` · `heirloom` · `discuss` |
| Q5 catalyst | `catalyst` | single, lenient | `new_home` · `moving` · `milestone` · `refresh` · `just_looking` *(PROVISIONAL — see below)* |

- **Strict** (Q1/Q3/Q4): an unknown option key is a hard error (they drive the profile).
- **Lenient** (Q2/Q5): unknown lifestyle entries are skipped; an unknown catalyst passes through with zero loading. Q5 keys are provisional until quiz content lands (00243 header) — a rename is server-side data work, not a contract change.
- Q5 carries **zero aesthetic loading by design** — it is the lead/readiness tell (§7.2).

### Response — `200`

```json
{
  "profile_id": "c3df6b73-5aa8-41e5-9d59-1f9045b315fc",
  "session_key": "6f54a183-84bc-4d8b-bae9-8bcaa1a11aea",
  "archetype":  { "primary": "Warm Modern", "secondary": "Japandi", "confidence": 0.5 },
  "spectrums":  { "warmth": 0.74, "complexity": -0.5, "formality": -0.23,
                  "timelessness": 0.53, "boldness": -0.24, "craftsmanship": 0.63 },
  "budget":     { "label": "Heirloom", "min_cents": 500000, "max_cents": 1500000, "value_orientation": 0.7 },
  "material_affinities": { "wood": 0.9 },
  "catalyst":   "new_home",

  "spectrum_confidence": { "warmth": 0.74, "complexity": 0.5, "formality": 0.29,
                           "timelessness": 0.53, "boldness": 0.36, "craftsmanship": 0.63 },
  "patina_affinity": 0.4,
  "version": 1
}
```

*(Real response from the 2026-07-01 live smoke. JSON key order is not guaranteed — it's jsonb.)*

| Key | Type | Semantics |
|---|---|---|
| `profile_id` | uuid | The `client_style_profiles` row created by this submit. |
| `session_key` | uuid | Echo of `p_session_key`. |
| `archetype.primary` / `.secondary` | string \| null | Style names from the taxonomy (e.g. "Warm Modern"). Null when nothing accumulated. |
| `archetype.confidence` | number \| null | Primary's **share** of total accumulated archetype weight, ∈ (0, 1]. |
| `spectrums.*` | number | Six values ∈ [−1, 1], rounded to 4 decimals: warmth, complexity, formality, timelessness, boldness, craftsmanship. |
| `budget` | object | Q4 passthrough: `min_cents`/`max_cents` (integers, **cents**; null for `discuss`), `label`, `value_orientation` ω ∈ [−1, 1]. The `discuss` option additionally carries `"lead_signal": true`. |
| `material_affinities` | object | `{material: affinity ∈ [0, 1]}`. |
| `catalyst` | string \| null | Echo of the Q5 answer. |
| `spectrum_confidence` | object | **Additive key.** Per-dimension confidence c_k = min(1, Σ\|δ_k\|·q_w) ∈ [0, 1]. |
| `patina_affinity` | number | **Additive key.** ∈ [0, 1], loaded by Q3 (weathered oak +0.4, aged leather +0.5, woven rattan +0.2). |
| `version` | int | **Additive key.** Profile version for this session key — resubmitting bumps it (an update, not a duplicate). |

### After the submit: matches

Per §7.1 the caller then requests matches with the same capability:

```
POST {BASE}/rest/v1/rpc/get_aesthete_matches
{ "p_session_key": "…", "p_limit": 10 }
```

`get_aesthete_matches` ships in migration 00244 (Wave 2A) and is documented separately — this contract covers the quiz pair only.

---

## `claim_quiz_session`

Bind an anonymous quiz session to the user on signup. **Authenticated only** — the bearer must be a real user JWT (the anon key gets **401**).

### Request

```json
{ "p_session_key": "6f54a183-84bc-4d8b-bae9-8bcaa1a11aea" }
```

### Response — `200`

```json
{
  "session_key": "6f54a183-84bc-4d8b-bae9-8bcaa1a11aea",
  "user_id": "e01db20f-…",
  "profile_id": "c3df6b73-…",
  "claimed_profiles": 2,
  "claimed_sessions": 2,
  "bridged_style_signals": true
}
```

- Binds `user_id` on `quiz_sessions` + `client_style_profiles` where NULL; stamps `conversion_event = 'signup'`.
- Upserts `client_profiles` (archetype, budget_range, style_preferences, quiz_responses) and bridges `user_style_signals` for iOS.
- **Idempotent**: re-claiming your own key succeeds with `claimed_* = 0`.
- **Refuses foreign keys**: a key any version of which belongs to another user → error (42501).
- `bridged_style_signals` is `false` when the user has no `profiles` row yet (bridge skipped, everything else still lands).

---

## Session-key semantics

The session key is a **bearer capability**:

- Client-generated **uuidv4** (`crypto.randomUUID()`), persisted in localStorage so the visitor's profile survives reloads and is claimable after signup. (`@patina/aesthete-quiz` uses storage key `patina.aesthete.session_key`.)
- Anonymous callers can **cause** rows with it but can never read tables — results only ever come back through RPC responses. Unknown keys aren't enumerable.
- **Resubmission is an update**: same key ⇒ previous profile version is retired (`is_current = false`), a new version is written, `version` increments.
- Once a key is claimed by user B: anonymous resubmits still work (the profile stays B's); a **different** signed-in user submitting with it gets a 42501 error.
- Unclaimed anonymous rows are purged after **90 days** (daily janitor), unless referenced by downstream learning data.

## Rate limits (in-DB backstop; Cloudflare is the real wall)

| Limit | Scope | On trip |
|---|---|---|
| 3 submissions / hour | per `session_key` | error — see below |
| 10 submissions / hour | per IP (first `x-forwarded-for` hop; **fail-open** when absent) | error — see below |

⚠ **Rate-limit errors arrive as HTTP 400, not 429** — they're plpgsql exceptions (ERRCODE `P0001`). Detect them by message (see the error table). No CAPTCHA at launch; Cloudflare Turnstile is the retrofit path if abuse appears.

## Error cases

PostgREST error bodies look like `{ "code": "…", "message": "…", "details": …, "hint": … }`.

| Case | HTTP | `code` | `message` contains |
|---|---|---|---|
| Missing/extra answer keys | 400 | P0001 | `answers must carry visual_resonance, lifestyle, material, investment, catalyst` |
| `lifestyle` not an array | 400 | P0001 | `lifestyle must be an array` |
| Unknown Q1/Q3/Q4 option | 400 | P0001 | `unknown visual_resonance/material/investment option "…"` |
| Answers > 8 KB | 400 | P0001 | `exceeds the 8 KB limit` |
| Missing session key | 400 | P0001 | `p_session_key is required` |
| Session rate limit (4th/hr) | 400 | P0001 | `this session has submitted N times in the last hour` |
| IP rate limit (11th/hr) | 400 | P0001 | `too many submissions from this address` |
| Key claimed by another account (submit) | 403 | 42501 | `this session_key belongs to another account` |
| Claim without user JWT | **401** | — | `permission denied` (grant-level; anon has no EXECUTE) |
| Claim of a nonexistent key | 400 | P0001 | `unknown session_key` |
| Claim of another user's key | 403 | 42501 | `already claimed by another account` |

The package maps these to typed errors: `QuizInvalidAnswersError`, `QuizRateLimitError`, `QuizForbiddenError`, `QuizUnknownSessionError`, `QuizNetworkError` (all extend `AestheteQuizError` with `.kind`, `.status`, `.code`, `.hint`).

## curl example

```bash
BASE=https://api.patina.cloud            # or http://localhost:54321
ANON=<SUPABASE_ANON_KEY>
KEY=$(uuidgen | tr '[:upper:]' '[:lower:]')

curl -sS "$BASE/rest/v1/rpc/submit_style_quiz" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON" \
  -H "Authorization: Bearer $ANON" \
  -d '{
    "p_session_key": "'"$KEY"'",
    "p_source": "marketing_site",
    "p_answers": {
      "visual_resonance": "warm_minimal",
      "lifestyle": ["family", "entertaining"],
      "material": "weathered_oak",
      "investment": "heirloom",
      "catalyst": "new_home"
    },
    "p_timings": { "q1_ms": 4200 },
    "p_attribution": { "utm_source": "curl-demo" }
  }'
```

## §7.1 vs shipped (delta table)

Everything §7.1 documents ships verbatim. The deltas are additive or tightening:

| # | §7.1 says | Shipped (00243) | Impact |
|---|---|---|---|
| 1 | Response has 7 keys (profile_id … catalyst) | **+3 additive keys**: `spectrum_confidence`, `patina_affinity`, `version` | None for §7.1 readers; new data if you want it. |
| 2 | `p_source: 'marketing_site' \| 'client_portal' \| 'ios'` | Free text, default `'web'` | Send one of the named values anyway — it's analytics data. |
| 3 | — | `p_answers` capped at **8 KB** | Hard error above the cap. |
| 4 | Rate limit: 10/IP/hour | **Plus 3/hour/session_key**; both surface as **HTTP 400** P0001 (not 429) | Handle 400-with-message as retry-later. |
| 5 | — | Bearer-capability guard: a claimed key refuses submits from a *different* authed user (42501/403) | Only matters after signup. |
| 6 | `archetype.confidence` example `0.78` (no formula) | Defined: primary weight ÷ total accumulated weight ∈ (0, 1]; **null** when nothing accumulated | Treat as nullable share, not a probability. |
| 7 | `budget` example shows 4 keys | Q4 passthrough: `discuss` ⇒ null `min_cents`/`max_cents`, ω +0.2, plus `"lead_signal": true` | Handle nullable range. |
| 8 | catalyst options implied fixed | Q5 vocabulary **provisional** (00243 header); unknown catalyst tolerated server-side | Don't hard-code Q5 copy server-side assumptions. |
| 9 | Claim: "binds… upserts… stamps" (no response shape) | Response shape defined (see above): `{session_key, user_id, profile_id, claimed_profiles, claimed_sessions, bridged_style_signals}` | New, additive. |
| 10 | — | Spectrum values rounded to 4 decimals; `spectrums` ∈ [−1,1], `spectrum_confidence` ∈ [0,1], `patina_affinity` ∈ [0,1] | Display-safe guarantees. |

## Environment values the marketing repo needs

| Variable | Value |
|---|---|
| Supabase URL | `https://api.patina.cloud` |
| Anon key | the production `SUPABASE_ANON_KEY` (safe to ship to browsers; RLS + grants enforce everything) |

No service-role key, no supabase-js, no other endpoint is needed for the quiz.
