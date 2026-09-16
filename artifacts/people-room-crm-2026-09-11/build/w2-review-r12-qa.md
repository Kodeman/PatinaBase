# W2 round 12 QA — Everyone on the Job (people-room-crm-2026-09-11)

**Status: NOT RUN. Stopped at the precondition check per the assigned procedure.**

## Precondition check

Procedure required: `lsof -ti :3000` must be empty (report and stop if not).

Actual result at time of this QA attempt:

```
$ lsof -ti :3000
52297
53385
53400
53422
```

`lsof -i :3000 -P` shows PID 52297 is a `node` process already LISTENING on `*:3000`, with active ESTABLISHED connections from a Firefox process (53385), a Chrome helper process (53400), and a Safari/WebKit networking process (`com.apple...`, 53422) — i.e. a live dev/prod server on :3000 with browser tabs actively connected to it right now. This is not a stale/orphaned listener; it looks like an in-progress session (possibly another agent or the user) already using port 3000.

Per the explicit procedure for this task — "lsof -ti :3000 must be empty (report and stop if not)" — this QA run stops here. No `supabase:reset`, no build, no `next start`, no Playwright run, and no scripted Leah walk was performed. No database state was touched, no screenshots were taken, and nothing was killed on port 3000 (killing another session's live process was not authorized by the procedure and risks destroying someone else's in-progress work per patina-parallel-work).

## What was NOT verified (must be re-run once :3000 is free)

- Playwright specs under `apps/designer-portal/e2e/people/` (chromium) — not run
- Scripted Leah walk (six tasks from direction.md §6, task 5 truncated per R-BM) — not run
- Screenshots at 1440/390 into `build/qa-w2-r12/` — not captured
- SPEC §5 acceptance-string presence check (states directory, person, company, roster, add, access) — not checked
- CR4-1 hairline-vs-near-black rendering check — not checked
- Console errors / hydration warnings — not checked
- Re-check of every finding in `w2-fix-log-r11.md` as fixed/open — not done
- Port-3000-free confirmation at end — moot, since the pre-existing occupant was left untouched

## Recommended next step

Identify and coordinate with whoever/whatever owns PID 52297 on :3000 (check `patina-parallel-work` conventions — likely another concurrent session/worktree using the same port), have them free port 3000, then re-run this QA pass in full.

## Findings

| ID | Severity | Confidence | Summary |
|---|---|---|---|
| QA-R12-1 | blocking | high | Port 3000 was already occupied by a live process (PID 52297, node, LISTENING) with active browser connections (Firefox, Chrome, Safari) at the start of this QA run, violating the stated precondition ("lsof -ti :3000 must be empty (report and stop if not)"). The entire W2 round-12 QA pass (build, e2e, scripted walk, screenshots, acceptance-string check, hairline check, console/hydration check, prior-finding re-check) could not be performed as a result. |
