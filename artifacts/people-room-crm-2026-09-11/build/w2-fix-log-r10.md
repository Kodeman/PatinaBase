# W2 round-10 fix log

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, on top of `3c53e1015` ("docs(people-room): W2 round-10
adversarial code review"). Four findings assigned: QA-R10-1, CR10-1, CR10-2, CR10-3. No server
started, no port taken, no database written, nothing touched on Strata.

## QA-R10-1 · blocking · the round-10 QA gate — port 3000

**Not a code change. Reported with evidence; the round is still owed.**

The r10 QA round stopped at its own pre-flight gate because `lsof -ti :3000` named pid 10392
(`node`, LISTEN) and pid 10787 (`curl`, ESTABLISHED), and the listener did not answer HTTP within
3s. That specific process is gone:

```
$ date '+%Y-%m-%d %H:%M:%S %Z'
2026-09-13 09:33:0x CDT
$ lsof -ti :3000 ; echo "EXIT=$?"
EXIT=1            ← no output: the port was EMPTY, and pids 10392 / 10787 are both gone
```

Five minutes later the port was taken again, by a **different and healthy** listener:

```
$ date '+%Y-%m-%d %H:%M:%S %Z'
2026-09-13 09:38:48 CDT
$ lsof -i :3000
node      24785 kody   13u  IPv6  TCP *:hbci (LISTEN)
node      24785 kody   33u  IPv6  TCP localhost:hbci->localhost:61070 (ESTABLISHED)
chrome-he 25372 kody   19u–25u    TCP localhost:610xx->localhost:hbci (CLOSE_WAIT ×6, ESTABLISHED ×1)
$ curl -sS -m 3 -o /dev/null -w "HTTP_STATUS:%{http_code}\n" http://127.0.0.1:3000/
HTTP_STATUS:200
```

So: r10's stuck listener is **cleared** (it was not this build's, and nothing was killed to clear
it), but pid 24785 now holds the port, answers 200, and has a Chrome session attached to it — a
live server belonging to another session on this box. Under `patina-parallel-work` it is not this
task's to kill, and this task's own brief forbids starting servers (`do not start servers`), so the
round-10 QA walk was not attempted here either.

**Owed, unchanged:** free port 3000 (or wait for pid 24785's owner to release it), confirm
`lsof -ti :3000` is empty, then run the full W2 QA procedure from `supabase:reset` onward. Nothing
in r1–r10's runtime findings, and none of the three code fixes below, has been re-verified against
a live build in this round — the evidence below is gates and tests, not a walk.

## CR10-1 · blocking · the person card's seat lines and "Send a text" moved nothing

Two controls on the person card called `openSeat`, and for every non-field seat `openSeat` set
`openPerson` to the id already open — the card re-rendered and nothing moved. R-AB sanctions inert
acts in the SPECIMENS, not in the shipped room.

**The seat line now walks to the job.** `people-room.tsx` `openSeat`: field kinds
(gc / sub / installer / receiver) still open the party sheet under their own kind (CR9-1 stands);
every other seat pushes `/doc/<project_id>?sheet=call` — the destination direction §2.1 already
names (`seat ───► /doc/<project>?sheet=call`), which every kind of seat has. A seat the view hands
us with no `project_id` cannot be walked to and still opens the card.

**`?sheet=call` now opens the sheet.** It was an address nothing read: the Call Sheet's doorways
were the `document:open-call-sheet` event and `command-bar.tsx`'s `callSheetPending` flag, so the
link would have landed on the document *beside* the sheet. `doc/[id]/page.tsx`'s existing call-sheet
effect reads `?sheet=call` on arrival, in the same place and the same way it already reads
`callSheetPending`, and the param stays in the bar because it is the address.

**"Send a text" is held unless a FIELD seat carries the thread.** The act opened `liveSeats[0]`
whatever its kind, and only the field party sheet has a composer. It was held on the seed only by
Adaeze Okonkwo's missing consent, so performing Leah task 2 would have made it an *enabled* act,
under "This sends one text to the number on file", that sent nothing. `person-profile.tsx` now
resolves `textableSeat = liveSeats.find(isFieldRosterRole)`, holds the act (`aria-disabled`, never
`disabled`) when there is none, and prints its own sentence beside it — the shape
`MINT_WITHOUT_SEAT_SENTENCE` already uses for a field link with no seat:

> A text goes out from a seat on a job’s field crew, and this person holds none.

Files: `people-room.tsx:396-432`, `views/person-profile.tsx:79-92,308-310,395-415`,
`app/(document)/doc/[id]/page.tsx:1227-1239`.

Evidence — `apps/designer-portal`, `npx jest`:

- `people-room-address.test.tsx` — "walks a household member's seat to the job's Call Sheet, not to
  a field sheet" asserts `router.push('/doc/project-okonkwo?sheet=call')` and no party sheet;
  "falls back to the card for a seat the view hands us with no project"; the field-seat test
  ("opens the field sheet, under its OWN kind") is unchanged and still green. The file's
  `useRouter` mock now returns a stable `mockPush` — it minted a fresh `jest.fn()` per call, so no
  navigation could be asserted.
- `person-profile.test.tsx` — "is held, with its own sentence, when no seat is a field seat"
  (client_rep seat, consent granted: `aria-disabled="true"`, not `disabled`, the sentence above,
  and `onOpenSeat` not called on press); "reaches past a non-field seat to the field seat that
  carries the thread". The pre-existing consent and rule holds are unchanged and still green.

## CR10-2 · major · "No open seat on this project." under a trigger reading "2 seats"

`person-row.tsx` enabled the seats read only when the disclosure opened, so `data` was `undefined`
for the whole first round-trip of **every** expand and `(seats ?? []).length === 0` printed the
empty sentence directly beneath the count that contradicts it. The sentence was also R-V's
*project-scoped* fallback, quoted into the cross-project Directory, which names no project.

The row now reads the query's state, not only its data — `const { data: seats, isFetching } =
usePeopleSeats(...)`, `seatsLoaded = seats !== undefined && !seatsFetching` — and prints nothing
while it loads. The Directory gets its own sentence, `DIRECTORY_NO_SEAT_SENTENCE`:

> No open seat on any job.

R-V's "No open seat on this project." is untouched on the person card (`reach-access.tsx:81`), which
is the region that names a project.

Files: `directory/person-row.tsx:51-59,105-112,250-254`.

Evidence — `person-row-hardening.test.tsx`: "prints nothing under the trigger while the seats are
still being read" (`{data: undefined, isFetching: true}` + a `seat_count: 2` row) and "says the
Directory's own sentence when the read lands empty" (asserts the new sentence present and the
card's project-scoped one absent). R-AA's live-seat-line test is unchanged and still green.

## CR10-3 · major · a bouncing PHONE called an address, then promised texts still reach it

`heldChannelReason` keyed on `channel.status` alone, and the status editor this wave added offers
"It bounces" on every channel kind, so marking Dana Kowalski's mobile as bouncing printed, beside
`(612) 555-0111`:

> This address bounced back, <date>. Texts and calls still reach them.

— a number called an address, and texts promised on the very line just declared held.
`isPhoneChannel` was defined four lines above and used at `:353`, and was not consulted here.

The `bounced` branch now asks the kind (the editor keeps "It bounces" on every kind, because a text
to a number genuinely can bounce):

> Texts to this number bounced back, <date>. Calls still reach them.

The email wording is byte-identical to before. `unsubscribed` / `dead` / the default are
kind-neutral already ("They unsubscribed… Calls still reach them.", "This line is dead", "This line
is held") and were left alone.

Files: `reach-access.tsx:96-118`.

Evidence — `reach-access.test.tsx`: the existing email assertion now passes `channel_kind: "email"`
explicitly and still expects the original string; a new case, "gives a bouncing PHONE its own
words", pins the mobile branch.

## Gates, run at the end of this round

```
$ pnpm --dir <wt>/apps/designer-portal run type-check        → tsc --noEmit, DESIGNER_TC=0
$ pnpm --dir <wt>/packages/supabase  run type-check          → tsc --noEmit, SUPABASE_TC=0
$ cd apps/designer-portal && npx jest --silent -w 2 \
    src/components/document/people src/components/document/roster
  Test Suites: 33 passed, 33 total      Tests: 450 passed, 450 total
$ npx jest --silent -w 2 --testPathPattern 'app/\(document\)/doc'
  Test Suites: 7 passed, 7 total        Tests: 155 passed, 155 total
$ npx eslint <the five changed source files>
  (no output — clean)
```

`admin-portal build` was not run: no shared package changed this round. The whole diff is five
source files and four spec files under `apps/designer-portal/src`.
