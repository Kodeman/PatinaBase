# Screenshots

Live QA was driven in Chrome via browser automation. The automation harness captures
screenshots to a transient (non-repo) location, so they are not committed here. The
verification evidence is captured inline in [`../findings.md`](../findings.md) as concrete
database states (exact item rows, totals, RLS results) and observed UI states for every
FFE-## case, which are fully reproducible against the local stack.

Key states observed during the session:
- FF&E empty state (drop zones + 3 add buttons)
- Fixed/Allowance/TBD items grouped by room with correct tags + Estimated Total ($3,890 → $6,640)
- Drag-consume result: Velvet Club Chair ×2 ($2,500) under Primary Bedroom; inbox 5→4
- Post-fix: items appear live without reload; Quick-create Draft succeeds; single heading
