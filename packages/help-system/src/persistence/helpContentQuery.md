# Help Content GROQ Query — Canonical Contract

**Status:** Authoritative (Sprint 4, Wave 10, S4-2)
**Owners:** Help-System package + iOS Patina app
**Last updated:** 2026-05-19 (closes risk R3 — GROQ persona-fallback divergence)

This document is the single source of truth for the GROQ query that
fetches a single `helpContent` document from Sanity, on both web and iOS.
Both clients **must** implement the same chain, in the same order, with
the same parameter names, so the same `(surfaceKey, contentType, persona)`
triple resolves to the same Sanity `_id` on every platform.

Drift between the two implementations is risk R3 from the help-system
plan — keep them in lockstep when you change anything here.

---

## 1. Inputs and types

| Input | Shape | Examples |
|---|---|---|
| `surfaceKey` | `string` matching `/^[a-z0-9-]+(\/[a-z0-9-]+)+$/` | `"designer-portal/pipeline/project-list"`, `"designer-portal/pipeline/project-list/empty-active"` |
| `contentType` | `'tooltip' \| 'fieldHelper' \| 'emptyState' \| 'learnMore' \| 'coachmark' \| 'helpArticle' \| 'welcomeModal' \| 'video'` | `"tooltip"` |
| `persona` | `'designer' \| 'maker' \| 'consumer' \| 'admin' \| 'all'` | `"designer"` |

**Persona sentinel.** The Sanity schema models the persona-agnostic
case as the string `"all"` (see `studios/help-system/schemas/helpContent.ts`,
field `persona`). On the wire, every query carries a non-null persona
string. On iOS the call-side type is `Persona?`; a `nil` value is
projected to the string `"all"` at the wire boundary so iOS still issues
exactly one of the steps below.

---

## 2. Canonical fallback chain (4 steps + null)

For input `(surfaceKey, contentType, persona)`:

1. **Exact match** — `surfaceKey + contentType + persona`
2. **Persona-agnostic at exact key** — `surfaceKey + contentType + 'all'`
   (skipped iff the caller already passed `persona === 'all'`)
3. **Parent key + exact persona** — `parentSurfaceKey + contentType + persona`
   (skipped iff `surfaceKey` has no `/` — i.e. a single-segment key, which
   the surface-key regex disallows anyway, so in practice always run)
4. **Parent key + persona-agnostic** — `parentSurfaceKey + contentType + 'all'`
   (skipped iff persona === 'all', same reason as step 2)
5. **No match** — return `null` and emit a single `console.warn`/`print`.

**Parent key derivation.** The parent surface key is everything before
the last `/` in the original surface key:

- `"designer-portal/pipeline/project-list/empty-active"` →
  `"designer-portal/pipeline/project-list"`
- `"designer-portal/today"` → `"designer-portal"` (but the parent itself
  is not a valid surface key per the ≥2-segment regex, so step 3/4 are
  best-effort — Sanity simply returns null and the chain falls through).

Each step issues one GROQ query. Steps short-circuit: the first hit
returns immediately; we never keep walking the chain after a successful
match.

---

## 3. GROQ query shape (per step)

Every step uses **the same** GROQ query body with parameterised inputs:

```groq
*[_type == "helpContent" && surfaceKey == $sk && contentType == $ct && persona == $p][0]
```

| Param | Type | Notes |
|---|---|---|
| `$sk` | string | Either the original `surfaceKey` (steps 1, 2) or the parent key (steps 3, 4). |
| `$ct` | string | Always the original `contentType`. |
| `$p` | string | Either the original persona (steps 1, 3) or the literal string `"all"` (steps 2, 4). |

The trailing `[0]` constrains Sanity to return the first matching
document. Authors are expected to keep `(surfaceKey, contentType, persona)`
unique per content-document family, so `[0]` is functionally
deterministic.

**Why parameterised, not interpolated.** Sanity's HTTP API supports
GROQ parameters via the `$name=<JSON-literal>` query-string convention.
Parameters avoid escaping bugs and keep the query body byte-identical
across all 4 steps — which keeps Sanity's query-plan cache hot.

---

## 4. Failure semantics

Network errors, decoding errors, HTTP non-2xx responses, and `result == null`
all collapse to "no hit" for the current step and let the chain proceed
to the next step. After step 4, the chain emits exactly one warning and
returns `null`. **The caller never sees a thrown exception.** This is
per spec §13.4 — Sanity downtime must not crash the UI.

---

## 5. Examples

### 5.1 Tooltip — exact match wins (step 1)

Inputs: `("designer-portal/today/welcome", "tooltip", "designer")`

Step 1 issues:

```
GET https://kv3qrinl.api.sanity.io/v2024-01-01/data/query/production
  ?query=*[_type == "helpContent" && surfaceKey == $sk && contentType == $ct && persona == $p][0]
  &$sk="designer-portal/today/welcome"
  &$ct="tooltip"
  &$p="designer"
```

Returns the matching `helpContent` document — chain stops.

### 5.2 Field helper — falls back to `persona = 'all'` (step 2)

Inputs: `("designer-portal/projects/new/name", "fieldHelper", "designer")`

- Step 1: `$p="designer"` → miss
- Step 2: `$p="all"` → hit → return.

### 5.3 Coachmark — parent fallback (steps 3/4)

Inputs: `("designer-portal/pipeline/project-list/empty-active", "coachmark", "designer")`

- Step 1: leaf key + `"designer"` → miss
- Step 2: leaf key + `"all"` → miss
- Step 3: parent `"designer-portal/pipeline/project-list"` + `"designer"` → miss
- Step 4: parent + `"all"` → hit → return.

### 5.4 Persona-agnostic caller — step 2/4 skipped

Inputs: `("designer-portal/pipeline/project-list/empty-active", "emptyState", "all")`

- Step 1 (= step 2): leaf key + `"all"` → miss
- Step 3 (= step 4): parent + `"all"` → miss → return `null` + warn.

Only **2** queries are issued — steps 2 and 4 are no-ops because they'd
re-issue the same request as steps 1 and 3.

---

## 6. Parity fixture

The following call **MUST** produce the same Sanity document `_id` on
both web (`useHelpContent`) and iOS (`SanityHelpClient.fetchContent`):

| Input | Expected wire trace |
|---|---|
| `("designer-portal/today/welcome", "tooltip", "designer")` | Step 1 hits |
| `("designer-portal/today/welcome", "tooltip", "consumer")` | Step 1 miss → Step 2 (`persona="all"`) hit |
| `("designer-portal/pipeline/project-list/empty-active", "emptyState", "designer")` | Steps 1–3 miss → Step 4 hit at parent + `"all"` |

If the two clients diverge on any of these, this contract — and the
implementation — is broken. Add a regression test before fixing.

---

## 7. Implementation references

- **Web hook:** `packages/help-system/src/hooks/useHelpContent.ts`
  (function `fetchWithFallback`).
- **Web tests:** `packages/help-system/src/hooks/useHelpContent.test.tsx`.
- **iOS client:** `apps/mobile/Patina/Patina/Features/Help/Services/SanityHelpClient.swift`
  (function `fetchContent(surfaceKey:contentType:persona:)`).
- **iOS tests:** `apps/mobile/Patina/PatinaTests/SanityHelpClientTests.swift`.
- **Sanity schema:** `studios/help-system/schemas/helpContent.ts`
  (field `persona`; `'all'` is the persona-agnostic sentinel).
- **Spec:** `docs/prds/Guide/patina-help-guidance-engineering-handoff.md`
  §7.3.

When changing the chain, update **both clients**, the **tests on both
sides**, and **this document** in the same commit. Drift here re-opens
risk R3.
