# Capture launch — docs index

CWS listing package for Patina Capture v0.3.0, lane W1-D3.

- `cws-listing.md` — paste-ready dashboard fields: name, summary
  (124/132 chars), description, URLs, single-purpose, remote-code, data-use
  disclosure, asset spec, captions, version line.
- `permissions-justification.md` — one paragraph per manifest permission
  plus `https://*/*`, each citing its code path.

Test/verification docs (lane W3-E11):

- `../implementation/product-capture/manual-test-matrix.md` — 7-site
  extraction-quality smoke matrix (session adoption, brand/retailer
  correctness, dimensions/SKU, seconds-to-save) plus 3 edge-case rows
  (Pinterest, offline, duplicate URL).
- `../implementation/product-capture/e2e-prod-walk.md` — all-5-write-paths
  (library/project room/inbox/decision/update) walk against live Strata
  prod, with READ-ONLY verification SQL and a PostHog `product.captured`
  check.
- `../../../artifacts/capture-launch-2026-08-29/walk-sheet.md` — the earlier
  W0-D1 persona walk sheet (Leah/Marcus) that fed CL-R1/R11/R14/R15.

Rulings: `../../../artifacts/capture-launch-2026-08-29/rulings.md` (CL-R6–8,
R10). Plan: `~/.claude/plans/you-are-an-the-reflective-elephant.md`.
