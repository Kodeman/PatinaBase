# Spike W4-T1 — PO PDF rendering inside a Supabase Deno edge function

**Date:** 2026-06-11 · **Status:** Complete · **Gates:** Wave 4 po-send design

## DECISION: Option A — `@react-pdf/renderer` via `npm:` specifier, in the edge function

`@react-pdf/renderer@4.3.0` + `react@19.1.0` render a valid, visually correct PO PDF
under the local Supabase edge runtime (supabase-edge-runtime **1.70.0**, Deno v2.1.4
compat — same image lineage as prod) **on the first attempt, with zero workarounds**.
No fontkit failures, no Node-stream failures, no JSX-transform issues. Options B
(pdf-lib manual layout) and C (render in portal, edge fn only emails) were not needed
and were not exercised.

Proof lives at `supabase/functions/po-pdf-spike/index.ts` (throwaway; keep until
po-send lands, then delete or fold in).

## Working version pins

```ts
import React from 'npm:react@19.1.0';
import { Document, Page, Text, View, StyleSheet, renderToBuffer }
  from 'npm:@react-pdf/renderer@4.3.0';
```

Pin exact versions (repo convention, cf. `npm:stripe@17` in stripe-webhook).
react 19 matches the portals; react-pdf v4 ships react-reconciler 0.31 (React-19
compatible).

## Evidence

Served via the project-standard flow:

```bash
supabase functions serve --env-file supabase/.env.local --no-verify-jwt
curl http://127.0.0.1:54321/functions/v1/po-pdf-spike -o po-spike.pdf
```

| Check | Result |
|---|---|
| HTTP | 200, `Content-Type: application/pdf` |
| File magic / trailer | `%PDF-1.3` … `%%EOF` ✓ |
| Size | 3,056 bytes (1 page) |
| Content | All 15 text runs decode correctly from the content streams: header ("Purchase Order", PO number line), 3-row item table (name/qty/amount), totals line with correct arithmetic ($10,784.00). Non-ASCII ("Bouclé", "·") renders via WinAnsi. Fonts: base-14 Helvetica + Helvetica-Bold, kerned TJ output. |
| Openable | macOS Quick Look thumbnail renders the page exactly as designed (header rule, shaded table head, row rules, totals rule). |

### Timing (curl wall-clock through Kong)

| Scenario | Time |
|---|---|
| True cold — first request ever, empty npm cache (downloads react + react-pdf + transitive deps, compiles, boots worker, renders) | **3.72 s** |
| Steady state, local `oneshot` policy (fresh worker **per request**, modules cached) | **0.27–0.35 s** total; in-worker render 50–126 ms (`x-render-ms` header) |

Memory: edge-runtime container at 363 MiB total for 32 functions; render fits easily
in the 256 MB per-worker limit. CPU: 50–126 ms used vs prod limits of 10 s soft /
20 s hard (`supabase/functions/main/index.ts`) — local serve is stricter (1 s/2 s
CPU) and still passed. Prod's main dispatcher reuses workers (`forceCreate: false`),
so steady-state prod will be at least as fast as the 0.3 s local oneshot numbers.

## Implementation notes for the po-send builder

- **API shape:** `renderToBuffer(element)` (Node export condition) works under Deno
  npm-compat and returns a Node `Buffer`. Wrap as `new Uint8Array(buffer)` for a
  `Response` body, or pass directly to `supabase.storage.from(...).upload(path, buffer,
  { contentType: 'application/pdf' })` — supabase-js accepts ArrayBuffer views.
- **No JSX in edge functions.** Functions are `.ts`; build the tree with
  `React.createElement` (aliased `h` in the spike). The portal template at
  `apps/designer-portal/src/lib/pdf-templates/po-template.tsx` ports mechanically:
  same `StyleSheet.create` object, JSX → `h(...)` calls. (A `.tsx` entrypoint is
  nominally supported by the runtime per `config.toml` comments, but was NOT tested
  in this spike — don't rely on it without proving it.)
- **Fonts:** the PO template only uses `fontFamily: 'Helvetica'` → base-14 built-ins,
  **no `Font.register` needed**, nothing fetched at render time. If Wave 4 wants brand
  fonts (Playfair/Inter), `Font.register({ family, src: url })` + fontkit TTF parsing
  under Deno is **untested** — spike it separately before committing to it.
- **Hyphenation:** default word-hyphenation worked out of the box; no
  `Font.registerHyphenationCallback` needed for this layout.
- **Style gotcha found in the existing portal template:** `po-template.tsx` uses
  `background: '#E5E2DD'` on `tableHead`; react-pdf's prop is `backgroundColor`
  (the spike uses it and the shading paints). When porting, fix to `backgroundColor`
  or the table-head shading silently drops.
- **Local-dev gotcha (cost ~15 min in this spike):** a NEW function directory is NOT
  picked up by the already-running `supabase start` edge runtime — the function map is
  baked into `SUPABASE_INTERNAL_FUNCTIONS_CONFIG` at container creation; even
  `docker restart supabase_edge_runtime_supabase` returns `Function not found`. You
  must re-run `supabase functions serve` (which recreates the container). Prod is NOT
  affected: the self-hosted `main` dispatcher resolves `/home/deno/functions/<name>`
  dynamically per request.
- **Auth:** the spike served with `--no-verify-jwt` for curl convenience. The real
  po-send must keep JWT verification on (default) — do not add a `verify_jwt = false`
  entry in `config.toml` for it.
- **Recommended po-send shape:** edge fn receives `{ poId | itemIds }` → loads rows
  with the service-role client → `renderToBuffer` → upload to `project-documents`
  storage (same path scheme as the legacy route
  `apps/designer-portal/src/app/api/po/generate/route.ts`:
  `{projectId}/po-{poNumber}.pdf`) → email via the existing `_shared/send-email.ts`
  helper → stamp the rows. Single function, no portal round-trip needed.

## What was tried (chronologically)

1. Read the Node-side template + legacy route; confirmed `npm:` precedent
   (`npm:stripe@17` in stripe-webhook / create-checkout-session).
2. Wrote `po-pdf-spike/index.ts` (Option A, `React.createElement`, exact pins).
3. First curl → 404 `Function not found` → diagnosed the baked-functions-config
   gotcha above → re-served via `supabase functions serve`.
4. Second curl → 200 + valid PDF on the first render attempt. No errors of any kind
   from react-pdf, fontkit, or Node-compat shims.
5. Verified: magic/trailer, decompressed content streams, decoded all TJ text ops,
   5 repeat timings, Quick Look visual render.
