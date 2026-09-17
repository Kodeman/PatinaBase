# L4 — Correspondence · adversarial review

Reviewer: fresh context, did not write this lane. Branch `client-page-2/l4` at `d74f068ca`,
worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l4` (read-only; no edits, no git writes).
Diff read: `git diff origin/main...HEAD` — 13 files, +1359/−6.

Sources compared against: `src/app/messages/page.tsx` (423 lines), `src/app/inbox/page.tsx`,
`src/app/api/inbox/mark-read/route.ts`, `src/components/messages/ThreadSettingsMenu.tsx`,
`packages/supabase/src/hooks/use-comms.ts`, `packages/supabase/src/hooks/use-inbox.ts`,
plan §"L4", spec §3, inventory rows 100/106/143/233/410/411/480/487, and the shipped
`components/threshold` + `components/making` precedents.

## Gate output (run by this review, verbatim)

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l4/apps/client-portal type-check

> @patina/client-portal@0.1.0 type-check /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l4/apps/client-portal
> tsc --noEmit

(no output — clean)
```

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l4/apps/client-portal test -- threshold making

Test Suites: 32 passed, 32 total
Tests:       596 passed, 596 total
Snapshots:   0 total
Time:        8.699 s
Ran all test suites matching /threshold|making/i.
```

```
$ pnpm --dir .../apps/client-portal test -- correspondence

PASS src/lib/threshold/__tests__/correspondence.test.ts
PASS src/hooks/__tests__/use-project-correspondence.test.tsx
PASS src/components/threshold/__tests__/correspondence.test.tsx

Test Suites: 3 passed, 3 total
Tests:       35 passed, 35 total
```

No sandbox failures; nothing needed a sandbox-disabled retry. The lane's own quoted gate output
reproduces exactly.

## Absorb list — act by act

Inventory row 100 (`/messages`) names four acts; row 106 (`/inbox`) names two.

| Old act | Source | In place now? |
|---|---|---|
| Reply / send a message | `messages/page.tsx:181-199` | **Partly** — `WriteBack` sends via `useSendMessage` with the old payload shape and fires `clientEvents.messageSend` identically. But it is mounted only inside `TheNote`, which returns null with no standing note → finding 9. |
| Mark thread read | `useMarkThreadRead`, `messages/page.tsx:109-115` | **No** — the hook is never called anywhere in the lane → finding 7. |
| Mute / unmute | `ThreadSettingsMenu.tsx:67-85` | **Partly** — the mutation payload is byte-identical, but the label never flips (finding 2) and a failure is silent (finding 3). |
| Attach (and read attachments) | `MessageAttachmentUploader`, `messages/page.tsx:69-75,384-391` | **No** — neither sending nor rendering → finding 8. |
| Notifications list | `inbox/page.tsx:148-157` | **Yes**, as receipts; titles copied faithfully from `previewOf`/`formatType`; body preview dropped (finding 25). |
| Mark notice read (single / all) | `inbox/page.tsx:74-85,108-117` | **Changed shape** — fires `{ids:'all'}` unconditionally on every arrival → finding 6. |
| Notice deep link on click | `inbox/page.tsx:87-94` | **No** — the receipts are inert `<span>`s → finding 12. |
| Inbox message tab (`useInboxMessages`) | `inbox/page.tsx:167-171` | Superseded by the letters; acceptable. |
| Archive / leave thread, search, typing, read receipts | `/messages` chrome | Deliberately not absorbed; correct for this surface. |

## Byte-fidelity of hooks and payloads

Faithful: `useSendMessage({threadId, body})`; `useMuteThread({threadId, muted})`;
`clientEvents.messageSend(threadId)` after the await; `useInboxNotifications({limit:50})`;
`POST /api/inbox/mark-read` body `{"ids":"all"}`; `noticeLabel` = `previewOf`'s subject →
headline → title → `formatType` chain, character-for-character.

Diverging: the refusal string (finding 20), the notice body preview (25), the mark-read scope (6),
`useMarkThreadRead` (7), attachments (8).

## Security

No path found that exposes another client's or another project's row. `useThreads({projectId})`
scopes server-side by `project_id` and then to threads where the reader has a non-`left_at`,
non-`archived_at` participant row (`use-comms.ts:143-212`); `useInboxNotifications` filters
`.eq('user_id', userId)` under RLS; `/api/inbox/mark-read` re-derives `user.id` server-side from
the session and never trusts the posted ids beyond `.eq('user_id', user.id)`
(`route.ts:11-77`). `WriteBack` can only reach a thread `useThreads` already vetted. No
authorization the old routes enforced is skipped. The only cross-boundary bleed is *within* one
account, one project's notices into another project's record — finding 5, a correctness fault, not
a security one.

## Findings

**1 · blocker · high · `apps/client-portal/src/components/threshold/previously.tsx:52` (with `threshold.tsx:640-647`)**
The new guard `if (entries.length === 0 && !correspondence) return null;` never fires on the real
page: `threshold.tsx` always passes `correspondence={<Letters …/>}`, and a React element is truthy
even when the component renders `null`. A house with no closed instruments, no letters and no
notices now prints a bare "Previously" heading over an empty `<ul>` — an empty region on a surface
whose rule is that absence is silence. *Fix: gate at the call site —
`correspondence={correspondence.letters.length || correspondence.notices.length ? <Letters …/> : undefined}`.*

**2 · major · high · `apps/client-portal/src/components/threshold/correspondence.tsx:219-234`**
The mute act gives no feedback: `muted` is read from `useThreads({projectId})`
(key `['comms','threads',{projectId}]`) but `useMuteThread.onSuccess` invalidates only
`commsKeys.thread(threadId)` (`use-comms.ts:440-442`), so the label stays on
"Stop telling me about letters" until the 10 s `staleTime` lapses and something refetches. The
client clicks and nothing happens. *Fix: invalidate `['comms','threads']` in `useMuteLetters`'
own `onSuccess`, or hold an optimistic local `muted` in `MuteLetters`.*

**3 · major · high · `apps/client-portal/src/components/threshold/correspondence.tsx:230`**
`onClick={() => mute.toggle({...})}` floats a promise whose body is `mutateAsync`; a rejected
mute is an unhandled rejection in the browser and the client is told nothing at all — where
`WriteBack` next door does have a refusal line. *Fix: `void mute.toggle(...).catch(...)` and print
the same one-line `role="alert"` in `var(--color-error)`.*

**4 · major · high · `apps/client-portal/src/lib/threshold/correspondence.ts:84-88`**
`letterMoments` filters only `deleted_at`, where `toLetters` (line 66) also drops `system` and
empty-bodied messages, and neither drops the reader's own hand. Consequences: (a) the client's own
reply ticks `note` + `previously` on her next visit, so the doorstep counts her own letter as
something that changed; (b) a system message ticks both regions while rendering nowhere, so the
count points at a change she cannot find. *Fix: reuse `toLetters`' predicate and add
`message.sender_id !== readerId`, threading `readerId` through as `toLetters` already does.*

**5 · major · high · `apps/client-portal/src/lib/threshold/correspondence.ts:99-110`, `hooks/use-project-correspondence.ts:62`**
`toNotices` maps every `notification_log` row for the reader with no project scope, so on the
multi-project client L8 is building, the notices of every other house are filed under this house's
Previously ("What the house sent" is then false of this house). *Fix: filter to rows whose
`metadata.project_id` (or `deep_link` project segment) matches, and drop rows that carry neither.*

**6 · major · high · `apps/client-portal/src/components/threshold/threshold.tsx:289` + `hooks/use-project-correspondence.ts:113-131`**
Arriving at one house posts `{ids:'all'}`, and the route stamps `read_at` on **every** unread
`notification_log` row for the reader, in every project (`route.ts:47-63`). The old page required
an explicit click and only offered the control when `unreadIds.length > 0` (`inbox/page.tsx:108`);
here the POST fires on every arrival even when nothing is unread, and it silently empties
`useUnreadInboxCount` / `notification-bell.tsx` for surfaces outside this project. The plan asked
for the mark-read to ride the reading mark, not for it to be account-wide. *Fix: pass the ids of
the notices this project actually shows and skip the call when that list is empty.*

**7 · major · high · `apps/client-portal/src/hooks/use-project-correspondence.ts` (whole file)**
`useMarkThreadRead` is never called. Inventory row 100 lists "mark read" as an act of `/messages`,
and `/messages` fired it on every thread view (`messages/page.tsx:109-115`). Without it
`comms_thread_participants.last_read_at` never advances, so `rpc_unread_summary` (and every
consumer of `thread.unread_count` / `useUnreadInboxCount`) keeps counting letters the client has
read on the Threshold. *Fix: call `useMarkThreadRead().mutate(threadId)` in the same hydrated
reading-mark effect that fires `mark_project_read`, guarded on `threadId !== null`.*

**8 · major · high · `apps/client-portal/src/components/threshold/correspondence.tsx:133-210`**
Attachments are absorbed nowhere. `/messages` rendered `msg.attachments` as named files
(`messages/page.tsx:69-75`) and let the client attach on send; inventory row 100 names "attach" as
an act and row 233 marks `MessageAttachmentUploader` dead "unless the reply absorbed" it. A studio
letter that carries a photograph now reads as a letter with no photograph — content silently lost,
not merely an act dropped. *Fix: render each letter's attachments as enclosure lines in the note's
own enclosure grammar; if sending attachments is out of lane, say so explicitly in the report.*

**9 · major · high · `apps/client-portal/src/components/threshold/threshold.tsx:637` + `the-note.tsx:81`**
`WriteBack` is a child of `TheNote`, which returns `null` when `model.note` is null. A house with a
live comms thread but no standing `project_note` shows its letters in Previously with no way to
answer them — the central act of `/messages`, unreachable in a state that is common on real data.
The lane discloses this; it is still an absorb gap the integration lane inherits. *Fix: also mount
`WriteBack` at the head of `Letters` (or render it beside Previously when `model.note` is null).*

**10 · major · medium · `apps/client-portal/src/lib/threshold/derive.ts:549-552`**
The new rule adds `'note'` to `changed` without the `standing &&` guard its neighbour at line 510
carries. With no standing note the doorstep prints `changed.size` one higher than the number of
`[data-threshold-unit][data-changed]` marks on the page, because the note region is not rendered.
*Fix: add `'note'` only when a standing note exists; always add `'previously'`.*

**11 · major · medium · `apps/client-portal/src/hooks/use-project-correspondence.ts:75`**
The settle gate folds in `threadsQuery` and `messagesQuery` but not `noticesQuery.isPending`, so
"What the house sent" appears a beat after the page has settled — the exact fault the lane's own
comment says the gate exists to prevent, one query short. (It does not move `changed`, so the
doorstep count is safe; the region still pops.) *Fix: `|| noticesQuery.isPending`.*

**12 · major · medium · `apps/client-portal/src/components/threshold/correspondence.tsx:180-204`**
Notice deep links are dropped. `/inbox` navigated on click via `metadata.deep_link ?? metadata.url`
(`inbox/page.tsx:39-42,87-94`) and inventory row 106 records that "every `notification_log` row's
`deep_link` renders here". The receipts are inert spans, so a notice about an invoice no longer
takes the client to it. *Fix: where the row's deep link resolves to a Threshold anchor, make the
label an in-page anchor; where it does not, state in the report that those links die with the
route so the retirement plan can rewrite the emitters.*

**13 · minor · high · `apps/client-portal/src/hooks/use-project-correspondence.ts:60-62`**
Realtime is asymmetric: the letters subscribe via `useThreadRealtime`, the notices do not
(`useInboxNotificationsRealtime` is never mounted, though `/inbox` mounted it at line 49). The two
halves of the same Previously block refresh on different clocks. *Fix: mount
`useInboxNotificationsRealtime()` beside `useThreadRealtime`, or state that notices are
arrival-time only.*

**14 · minor · high · `apps/client-portal/src/hooks/use-project-correspondence.ts:59,64-67`**
Only the newest page of letters is ever read: `useThreadMessages` returns 50 newest per page
(`use-comms.ts:262-289`) and nothing calls `fetchNextPage`, so a long correspondence truncates
with no sign it has. A record that silently stops is worse than one that says where it stops.
*Fix: add an "Earlier letters" act over `fetchNextPage`, or print the cap.*

**15 · minor · medium · `apps/client-portal/src/components/threshold/correspondence.tsx:232`**
Voice: "Stop telling me about letters" / "Tell me about letters again" is first person from the
client, where the global constraint is third-person page voice with first person reserved for the
quoted note; every neighbouring mat act is second person ("Your details", "Leave the house").
*Fix: "Hold the letter notices" / "Send the letter notices again".*

**16 · minor · medium · `apps/client-portal/src/components/threshold/correspondence.tsx:184-196`**
The notice line copies Previously's grammar but not its affordance rule: `previously.tsx:107-119`
gives a truncated label a button and a plain `<p>` otherwise, while a long notice subject here is
neither truncated nor foldable and will wrap past the dotted leader, breaking the leader's
alignment on phone. *Fix: run the label through `oneLine`/`isTruncated` (export them from
`previously.tsx`) so the two lists rule the same way.*

**17 · minor · high · `apps/client-portal/src/hooks/__tests__/use-project-correspondence.test.tsx`**
Coverage gaps in the hook suite: `useMuteLetters` is never tested at all (it is only mocked at the
component boundary), and `noticesMock` returns `[]` in every case, so `toNotices` is never
exercised through the hook that ships it. *Fix: add a mute case asserting the `mutateAsync`
payload, and a notices case asserting the mapped receipts.*

**18 · minor · high · `apps/client-portal/src/components/threshold/__tests__/correspondence.test.tsx:206-209`**
The silence test is a false positive: it renders `<Previously entries={[]} />` with
`correspondence` **undefined**, a shape `threshold.tsx` never produces (finding 1). The suite
therefore proves the opposite of the page's behaviour. *Fix: assert with
`correspondence={<Letters letters={[]} notices={[]} />}`, which is the case finding 1's fix makes
pass.*

**19 · minor · medium · `apps/client-portal/src/hooks/__tests__/use-project-correspondence.test.tsx:158`**
`global.fetch = fetchMock` is assigned with no save/restore, leaking a mocked `fetch` into any
later test added to the file. `making/__tests__` mocks are otherwise scoped with
`jest.clearAllMocks()` in `beforeEach`. *Fix: stash the original in `beforeEach` and restore it in
`afterEach`.*

**20 · minor · low · `apps/client-portal/src/components/threshold/correspondence.tsx:110`**
Refusal copy is a rewrite: `/messages` surfaced `err.message` with "Unable to send message." as the
fallback (`messages/page.tsx:193-197`); the Threshold prints a fixed "Your letter could not be sent
just now." This is arguably *correct* under the global "never print an error string as content"
rule, but it means a real server reason (thread archived, RLS refusal) is invisible to both the
client and support. *Fix: keep the fixed line, and `console.error` the caught reason so it reaches
the browser log.*

**21 · nit · high · `apps/client-portal/src/hooks/use-project-correspondence.ts:69-76`**
Three `useMemo` calls live inside the returned object literal. Legal today (unconditional, stable
order), but it hides hook calls in a `return` expression, where a later guard clause added above
would break hooks order silently. *Fix: hoist them to named consts above the return.*

**22 · nit · medium · `apps/client-portal/src/components/threshold/correspondence.tsx:72,76,80`**
`write-back-field` and `write-back-body` are hardcoded document ids, so `aria-controls` and
`htmlFor` collide the moment a second `WriteBack` is mounted — which is exactly what finding 9's
fix does. *Fix: `useId()`.*

**23 · nit · medium · `apps/client-portal/src/lib/threshold/correspondence.ts:53`**
`pickProjectThread`'s `thread.project_id === projectId` filter is dead code in the real path:
`useThreads({projectId})` already applied `.eq('project_id', …)` server-side
(`use-comms.ts:159`). Harmless as a defence, but the doc comment above it claims this is where the
filing happens. *Fix: keep the filter, correct the comment.*

**24 · nit · low · `apps/client-portal/src/components/threshold/mat.tsx:120`**
The mute act is dropped inside the "Your details" group, between the details act and "Leave the
house", so a letters control reads as part of the client's own record. *Fix: give it its own line
in the mat's flow, or a one-word head.*

**25 · nit · low · `apps/client-portal/src/lib/threshold/correspondence.ts:89-97`**
The notice's body preview (`metadata.preview ?? message ?? body`, `inbox/page.tsx:27-31`) is
dropped, so two notices of the same untitled type render as two identical lines ("Proposal Sent",
"Proposal Sent") with nothing to tell them apart. *Fix: append the preview, or fold the duplicate
into one line with a count.*

## Checks that came back clean

- **Hooks discipline.** Every hook in `WriteBack` (`correspondence.tsx:35-39`) and `MuteLetters`
  (`:220`) is above the early return; `useProjectCorrespondence` has no conditional hook; nothing
  touches `window`/`document` at render; `useThreadMessages(undefined)`'s permanent
  `isPending: true` is correctly guarded out of the settle expression
  (`use-project-correspondence.ts:75`). Hydration-safe: the only `new Date()` default is overridden
  by `threshold.tsx`'s memoised `today`, and both `Intl.DateTimeFormat`s pin `en-GB` at module
  scope as `previously.tsx` does.
- **Shared-file discipline.** `mat.tsx` (+3 lines), `the-note.tsx` (+4), `previously.tsx` (+7),
  `derive.ts` (+10), `threshold.tsx` (+22) are all additive optional-slot edits; nothing existing
  was reshaped, and the lane correctly kept its `deriveThreshold` and slot assertions out of
  `derive.test.ts` / `the-note.test.tsx` / `mat.test.tsx` / `previously.test.tsx` to keep the
  merge clean. This should merge against L1/L2/L3/L5/L8 with conflicts only in the import block
  and the `loading` expression. The one substantive shared-file change — `previously.tsx`'s early
  return — is finding 1.
- **VISION §6.** No shadow, no badge, no tab, no header, no "AI"; every act is a `ScoredAction`;
  `var(--color-error)` for the refusal follows the `door-gate.tsx:496-507` precedent and the money
  colours are untouched; "Sent" takes `--color-mocha` exactly as `previously.tsx:90` does.
  (Voice is finding 15.)
- **Accessibility.** No overlay or sheet in this lane, so `role="dialog"` / focus trap / Esc are
  not owed. `aria-expanded`/`aria-controls` on the unfold, a real `<label htmlFor>` on the field,
  `role="alert"` inserted on refusal, `aria-hidden` on the dotted leader, 44 px minimum on the
  acts via `ScoredAction`. (Duplicate-id hazard is nit 22.)
- **Copy never reverses.** The receipt and the refusal are mutually exclusive; the field keeps the
  client's words on a refusal; nothing prints an error string as content.
- **Gates.** `type-check` clean; 596/596 and 35/35 as quoted. The two pre-existing failures the
  lane names (`lib/data/__tests__/orders.test.ts`, `lib/__tests__/portal-access.test.ts`) are
  outside this lane's paths and were not re-verified here.

**Verdict: NOT_MERGEABLE — 1 blocker, 11 majors. Fix findings 1–12 (1, 2, 3, 4 are the smallest
set that makes the surface honest; 7, 8, 9 close the absorb list the plan owes) and re-run
`type-check` + `test -- threshold making correspondence` before the integration lane merges.**
