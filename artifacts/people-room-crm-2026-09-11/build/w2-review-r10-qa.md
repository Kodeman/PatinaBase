# W2 review — round 10 — runtime QA (local production build)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `412937520` ("fix(people-room): W2 round-9 findings") —
at or after the required `23e922802`.

**Run status: NOT PERFORMED. Stopped at the mandated pre-flight gate.**

The task's own procedure states: *"lsof -ti :3000 must be empty (report and stop if not)."* It was
not empty when this round started, so no reset, build, server start, Playwright run, or manual walk
was attempted. Nothing in this session touched the local database, the worktree's build output, or
port 3000.

---

## 0. What was checked, in order

1. `lsof -ti :3000` → returned two PIDs, **not empty**:

   ```
   10392
   10787
   ```

2. `lsof -i :3000` for detail:

   ```
   COMMAND   PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
   node    10392 kody   13u  IPv6 0x20ea096bd0d3f748      0t0  TCP *:hbci (LISTEN)
   node    10392 kody   26u  IPv6 0xfebfa7a1c2c5a456      0t0  TCP localhost:hbci->localhost:59714 (ESTABLISHED)
   curl    10787 kody    5u  IPv6 0x6c252c39721033d3      0t0  TCP localhost:59714->localhost:hbci (ESTABLISHED)
   ```

   A `node` process (pid 10392) is LISTENING on port 3000 (`hbci` is `/etc/services`'s name for
   3000), with one established connection from a `curl` process (pid 10787) — i.e. something else,
   started outside this session, is already bound to the port this QA round is required to own
   exclusively.

3. A behavior probe against that listener, to characterize it rather than guess:

   ```
   $ curl -sS -m 3 -o /dev/null -w "HTTP_STATUS:%{http_code}\n" http://127.0.0.1:3000/
   curl: (28) Operation timed out after 3009 milliseconds with 0 bytes received
   HTTP_STATUS:000
   ```

   The socket is bound but not answering HTTP within 3 seconds — consistent with a hung or stuck
   process from an earlier session (possibly a prior QA round's `next start` that was not cleanly
   killed, or an unrelated dev server), not with a healthy, servable build. Whatever it is, it is not
   this round's server, and the task's own words are explicit that this state is a stop condition,
   not a "route around it" condition.

4. No further action was taken: no `supabase:reset`, no `next build`, no `next start`, no
   Playwright run, no sign-in, no screenshots, no `kill`. Killing the existing listener was not
   attempted — it is a process this session did not start, on a machine possibly shared with other
   concurrent agent sessions per `patina-parallel-work`, and the task's instructions authorize this
   session to kill only the server *it* starts, at the end of its own walk. Terminating an unknown
   process on a shared box is exactly the kind of unilateral, unrequested destructive action the
   project's conventions ask agents to avoid without an explicit ask.

---

## 1. Consequence for this round's scope

Everything downstream of the gate is unattempted and unverified this round:

- Playwright specs under `apps/designer-portal/e2e/people/` — **not run**.
- The six-task Leah walk (Okonkwo seed) — **not run**; no screenshots were produced under
  `build/qa-w2-r10/`.
- SPEC §5 acceptance-string checks, the CR4-1 hairline-vs-near-black check, console/hydration
  checks — **not performed**.
- Re-check of `w2-fix-log-r9.md`'s five fixes (QA-R9-1, CR9-1, CR9-2, CR9-3, CR9-4) against a live
  build — **not performed**.

None of this round's prior findings (r1–r9) can be marked fixed or open on the strength of this
session; the last runtime evidence on file remains `w2-review-r5-qa.md` (round 5) plus whatever a
round 6–9 runtime pass may have added, none of which this session re-verified.

## 2. What is owed before round 10 can run

1. Identify and, with explicit authorization, stop whatever is bound to port 3000 (pid 10392 and its
   client pid 10787 as of this check), or wait for the box to free it if it belongs to a concurrent
   session that is expected to finish.
2. Re-run `lsof -ti :3000` and confirm empty.
3. Re-run this round's full procedure from `supabase:reset` onward.

---

## 3. Findings

Only one, and it is a process/environment blocker rather than a product defect — it is reported
because the task's own gate makes it dispositive for this round, not because it fits the product
severity rubric (a wrong fact on a face, a forbidden string, a broken Leah task, etc.). No product
surface was reached this round, so no SPEC, hairline, consent-write, or site-access-code finding can
be reported either as present or as absent.

| ID | Severity | Confidence | Claim | Fix |
|---|---|---|---|---|
| QA-R10-1 | blocking | high | Port 3000 was already bound (pid 10392, `node`, LISTEN; pid 10787, `curl`, ESTABLISHED against it) when this round's procedure required `lsof -ti :3000` to be empty before any reset/build/start. The listener does not answer HTTP within 3s, so it is not a healthy server this round could safely share or reuse. Per the task's own instruction ("report and stop if not"), the round was stopped before touching the database, the build, or the port. | Free port 3000 (stop the process, or confirm with whoever owns pid 10392 that it can be killed) and re-run round 10 from the top. This is not a code change and nothing here is attributable to the People-room build itself. |

---

## 4. Task table

Not produced. No Leah task was walked this round; see §1.
