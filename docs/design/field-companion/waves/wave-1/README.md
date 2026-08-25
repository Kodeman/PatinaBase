# Wave 1 — SDD ledger snapshots

Verbatim snapshots, taken at branch head `45d24c340`, of the Wave 1 SDD ledger that lived in the gitignored `.superpowers/sdd/field-companion-plan/`.
`progress.md` is the task-by-task ledger, `rulings-index.txt` every conductor ruling indexed by line, `device-pass-spec.md` the consolidated device pass.
That device pass is the ONLY correctness mechanism for this wave's app-target code — `capture-gate.sh test` runs the CaptureKit scheme, which does not link it.
