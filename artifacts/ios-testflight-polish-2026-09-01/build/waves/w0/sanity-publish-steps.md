# First Flight · W0 · L0.4 — Kody's publish steps (Sanity `kv3qrinl` / `production`)

> ### ⚠ KODY-RUN. Nothing below was executed.
> This lane read production with GROQ and read the repo. **No `patch_documents`, `create_documents`,
> `publish_documents`, `unpublish_documents` or `run_sanity_cli` call was made, and no Studio session
> was opened.** Every write on this page is yours to run.

Copy to publish: `waves/w0/sanity-tour-copy.md` (three tour bodies + one tooltip body).
Closes the content half of `A4-01`, `C5-01` and the new `L04-N1`.

**Where.** Studio `https://patina-help.sanity.studio/` (`studioHost: 'patina-help'`,
`studios/help-system/sanity.cli.ts:5`; HTTP 200, checked 2026-09-02). Project `kv3qrinl`, dataset
`production`. The only other registered studio is
`https://www.sanity.io/@obSMhE9bd/studio/arzgdpya6fjfzv5ny2gcqz4b` — same project, use either.

---

## The four documents

| # | `_id` | surfaceKey | field to change | new value |
|---|---|---|---|---|
| 1 | `cb2047b7-8ea6-4b6b-9f4d-12e2e66b9c54` | `ios-app/first-launch-tour/step-1-home` | `coachmarkContent.body` | `This is Today — what moved in your house, and what is waiting on you.` |
| 2 | `afb0ff70-4aa0-4d2d-ae11-e16a769160f1` | `ios-app/first-launch-tour/step-2-saved` | `coachmarkContent.heading` | `What needs you` |
| 2 | *(same doc)* | | `coachmarkContent.body` | `Anything waiting on you lands here, dated. Tap a line to go straight to it.` |
| 3 | `6581a570-0c16-487d-b50a-b3950b5f6f71` | `ios-app/first-launch-tour/step-3-profile` | `coachmarkContent.heading` | `Your Studio` |
| 3 | *(same doc)* | | `coachmarkContent.body` | `Your studio — projects, proposals, invoices and files` |
| 4 | `50c728fe-68d2-4403-be5d-b42be3bcd651` | `ios-app/home/match-pill` | `tooltipContent.body` | `Match score blends your room's dimensions, style cues, and palette against this piece. Higher means a better fit for the room you're viewing.` |

Step 1's heading (`Welcome to Patina`) is already correct — leave it.
Optional, and **not a gate**: unpublish `96fe7cf3-f911-4c6e-a879-5fe4d7f26623`
(`ios-app/home/tier-pill`) — a `tooltip` document reading
`PLACEHOLDER pending Leah review — explain tier pill.` that no call site mounts today.

**Do not rename any `surfaceKey`.** They key the documents and are pinned by
`PatinaTests/FirstLaunchTourTests.swift`; renaming orphans the copy.

---

## Route A — the Studio desk (recommended)

1. Open `https://patina-help.sanity.studio/`, sign in, confirm the dataset selector reads
   **`production`**.
2. Find each document. The fastest route is the **Vision** tool (it ships in this studio —
   `sanity.config.ts:12` loads `visionTool()`), pasting the probe query in §"Probe 1" below, then
   clicking through to each `_id`. The desk search on `surfaceKey` also works.
3. For each of the three tour documents, edit **Coachmark Content → Heading / Body** to the values in
   the table. **You will not see a "Tooltip / Field Helper Content" section on these three** — the
   schema hides that object unless `contentType` is `tooltip` / `fieldHelper` / `learnMore`
   (`schemas/helpContent.ts:80-83`). That is fine: `coachmarkContent` is the object the app reads
   (`Models/HelpContent.swift:272-276`), and the hidden mirror is unreachable.
4. For `ios-app/home/match-pill`, edit **Tooltip / Field Helper Content → Body Text**. This field has a
   **hard** 160-character validation (`Rule.required().max(160)`, no `.warning()`); the new sentence is
   141 characters and clears it. The three coachmark caps (heading ≤ 60, body ≤ 120) are warnings only,
   and the new copy clears those too (17 / 14 / 11 and 69 / 75 / 53).
5. **Publish each document. Do not leave a draft.** See the draft trap below.
6. Run every probe in the last section.

### The draft trap — read before publishing

`SanityHelpClient` sends **no `perspective` parameter** (`SanityHelpClient.swift:309-315` and
`:417-425`), and the pinned API version is `v2024-01-01`, whose default perspective is **`raw`**.
`raw` includes `drafts.*`. The queries end in `[0]`, so with both a published document and a draft of
it in the dataset, **two rows match and `[0]` picks one of them non-deterministically** — the app can
read either version, and can read a different one on the next launch.

Right now the dataset has **zero** drafts (`count(*[_id in path("drafts.**")])` → `0`, 2026-09-02), so
this is a trap you create by leaving one, not one that exists. Publish every document you touch, then
run Probe 3.

---

## Route B — MCP, exact call shape (do not run it from this session)

Use this if you would rather not open the desk. **`patch_documents` writes the draft — it never
touches published content** (its own description says so), so the publish call is mandatory, not
optional. `ifRevisionId` is the optimistic lock; the revisions below were read 2026-09-02, and a
mismatch means someone edited in between — re-read before retrying rather than dropping the guard.

**Call 1 — patch (creates `drafts.*`):**

```
mcp__claude_ai_Sanity__patch_documents(
  resource = {"projectId": "kv3qrinl", "dataset": "production"},
  intent   = "publishing the reviewed iOS first-launch tour copy for TestFlight round one",
  documents = {
    "cb2047b7-8ea6-4b6b-9f4d-12e2e66b9c54": {
      "ifRevisionId": "H0TXRhQg7UgtzK6p9t3CG8",
      "patches": [{ "set": {
        "coachmarkContent.body": "This is Today — what moved in your house, and what is waiting on you."
      }}]
    },
    "afb0ff70-4aa0-4d2d-ae11-e16a769160f1": {
      "ifRevisionId": "H0TXRhQg7UgtzK6p9t3CG8",
      "patches": [{ "set": {
        "coachmarkContent.heading": "What needs you",
        "coachmarkContent.body": "Anything waiting on you lands here, dated. Tap a line to go straight to it."
      }}]
    },
    "6581a570-0c16-487d-b50a-b3950b5f6f71": {
      "ifRevisionId": "H0TXRhQg7UgtzK6p9t3CG8",
      "patches": [{ "set": {
        "coachmarkContent.heading": "Your Studio",
        "coachmarkContent.body": "Your studio — projects, proposals, invoices and files"
      }}]
    },
    "50c728fe-68d2-4403-be5d-b42be3bcd651": {
      "ifRevisionId": "8wKiQzKRXIkGb61329gDKa",
      "patches": [{ "set": {
        "tooltipContent.body": "Match score blends your room's dimensions, style cues, and palette against this piece. Higher means a better fit for the room you're viewing."
      }}]
    }
  }
)
```

**Call 2 — publish (mandatory; clears the drafts Call 1 made):**

```
mcp__claude_ai_Sanity__publish_documents(
  resource = {"projectId": "kv3qrinl", "dataset": "production"},
  intent   = "publishing the reviewed iOS first-launch tour copy for TestFlight round one",
  ids = [
    "cb2047b7-8ea6-4b6b-9f4d-12e2e66b9c54",
    "afb0ff70-4aa0-4d2d-ae11-e16a769160f1",
    "6581a570-0c16-487d-b50a-b3950b5f6f71",
    "50c728fe-68d2-4403-be5d-b42be3bcd651"
  ]
)
```

**Call 3 — optional, the stale `tooltipContent` mirrors on the three coachmark documents.** They are
unreachable by the app and invisible in the desk; this only stops a Studio full-text search for
"Daily Room" or "+ Add" from returning a hit. It is **not** a gate — skip it under time pressure.

```
mcp__claude_ai_Sanity__patch_documents(
  resource = {"projectId": "kv3qrinl", "dataset": "production"},
  intent   = "removing retired mirror copy from iOS tour documents",
  documents = {
    "cb2047b7-8ea6-4b6b-9f4d-12e2e66b9c54": { "patches": [{ "unset": ["tooltipContent"] }] },
    "afb0ff70-4aa0-4d2d-ae11-e16a769160f1": { "patches": [{ "unset": ["tooltipContent"] }] },
    "6581a570-0c16-487d-b50a-b3950b5f6f71": { "patches": [{ "unset": ["tooltipContent"] }] }
  }
)
```
…followed by the same `publish_documents` ids. `unset` is safe here: `HelpContent` decodes
`coachmarkContent` first and only reaches for `tooltipContent` when the coachmark object is absent
(`Models/HelpContent.swift:263-282`), which it never is on these three.

**Call 4 — optional, `tier-pill`:**

```
mcp__claude_ai_Sanity__unpublish_documents(
  resource = {"projectId": "kv3qrinl", "dataset": "production"},
  intent   = "retiring an unused placeholder tooltip before the TestFlight round",
  ids = ["96fe7cf3-f911-4c6e-a879-5fe4d7f26623"]
)
```

⚠ `unpublish_documents` moves the document **back to drafts** — that is exactly the state the draft
trap warns about. Because nothing queries `ios-app/home/tier-pill` today the practical risk is nil,
but Probe 3 will then report one draft. If you would rather keep the drafts count at zero, replace
this call with a `patch_documents` + `publish_documents` pair setting `tooltipContent.body` to real
copy — or simply skip it and take the W2 row.

---

## The probes to run after — all read-only

### Probe 1 — the three tour bodies

> PROGRAM.md §3 · L0.4 prints this probe with `"body": pt::text(body)`. **That projection returns
> `null`.** `body` is not a top-level portable-text field on `helpContent`; the tour copy lives at
> `coachmarkContent.body`, a plain `text`. Verified 2026-09-02 by running the same `pt::text(body)`
> projection over a superset (`surfaceKey match "ios-app*"`): all sixteen rows came back with
> `"body": null`, the three tour rows included. Use this instead.

```
mcp__claude_ai_Sanity__query_documents(
  resource = {"projectId": "kv3qrinl", "dataset": "production"},
  perspective = "raw",
  query = '*[_type=="helpContent" && surfaceKey match "ios-app/first-launch-tour*"]
            | order(surfaceKey asc)
            { _id, surfaceKey, _updatedAt,
              "heading": coachmarkContent.heading,
              "body": coachmarkContent.body }'
)
```

**Expect** three rows, `_updatedAt` today, and exactly:

```
step-1-home    Welcome to Patina  | This is Today — what moved in your house, and what is waiting on you.
step-2-saved   What needs you     | Anything waiting on you lands here, dated. Tap a line to go straight to it.
step-3-profile Your Studio        | Your studio — projects, proposals, invoices and files
```

**Fail** if any row still contains `Daily Room`, `+ Add`, or the heading `Your profile`.

### Probe 2 — the match-pill tooltip, through the app's own request

The exact URL shape `SanityHelpClient.buildQueryURL` produces:

```bash
curl -sS -G 'https://kv3qrinl.api.sanity.io/v2024-01-01/data/query/production' \
  --data-urlencode 'query=*[_type == "helpContent" && surfaceKey == $sk && contentType == $ct && persona == $p][0]' \
  --data-urlencode '$sk="ios-app/home/match-pill"' \
  --data-urlencode '$ct="tooltip"' \
  --data-urlencode '$p="all"'
```

**Expect** HTTP 200 and `result.tooltipContent.body` equal to the new sentence.
**Fail** on any occurrence of `PLACEHOLDER`.

### Probe 3 — no drafts left behind

```bash
curl -sS -G 'https://kv3qrinl.api.sanity.io/v2024-01-01/data/query/production' \
  --data-urlencode 'query=count(*[_id in path("drafts.**")])'
```

**Expect** `"result":0`. Anything else means an unpublished edit is live in the `raw` view the app
reads — go back and publish it. (The one legitimate exception is Call 4 above, which parks
`tier-pill` in drafts by design.)

### Probe 4 — the "AI" and banned-word sweep, re-run on *published* content

The repo-side compiled-string sweep is clean; this copy lives outside the repo, so the sweep has to be
re-run here. This closes the lane — the pre-publish sweep in `sanity-tour-copy.md` §6 does not.

```bash
curl -sS -G 'https://kv3qrinl.api.sanity.io/v2024-01-01/data/query/production' \
  --data-urlencode 'query=*[_type=="helpContent" && surfaceKey match "ios-app*"]{
     surfaceKey, "a": coachmarkContent.heading, "b": coachmarkContent.body,
     "c": tooltipContent.eyebrow, "d": tooltipContent.body }' \
| python3 -c '
import json,re,sys
rows = json.load(sys.stdin)["result"]
ai = re.compile(r"(?<![A-Za-z])AI(?![A-Za-z])")
banned = ["a.i.","artificial intelligence","machine learning","journey","curated",
          "curation","elevated","bespoke","disrupt","revolutioni","powered by",
          "algorithm","luxury","placeholder","daily room","+ add","your profile"]
bad = 0
for r in rows:
    for f in "abcd":
        t = r.get(f) or ""
        hits = (["AI(token)"] if ai.search(t) else []) + [b for b in banned if b in t.lower()]
        if hits:
            bad += 1
            print("HIT", r["surfaceKey"], f, hits, repr(t[:90]))
print("rows:", len(rows), "hits:", bad)
'
```

**Expect** `hits: 0` — with the caveat that the eleven `fieldHelper` placeholders are deliberately
left alone (see `help-doors.md` §4), so until they are rewritten this prints eleven
`HIT … placeholder` lines and one for `tier-pill` if Call 4 was skipped. **The gate is that no
`coachmark` row and no `ios-app/home/match-pill` row appears in the output.**

### Probe 5 — the app actually shows it (simulator, agent-runnable)

Sanity-side probes prove the content; only a launch proves the tour reads it.

- The client caches help content in-memory for 5 minutes (`SanityHelpClient.cacheTTL`, `:64-66`), and
  the cache is per-process — a relaunch clears it. No cache-busting needed.
- The tour's completion state is **cross-device**, held in `profiles.help_state`
  (`SupabaseHelpStateAdapter`), so a reinstall alone will not bring it back for an account that has
  already seen it. Use the **D7/D11 demo account** (`firstflight@patina.cloud`), which has never run
  the tour — no database write required. On the local stack the reset is the SQL in
  `artifacts/ios-daily-return-2026-08-26/waves/w3/n3-sanity-copy.md` §After the edit.
- Fresh-install state: `terminate` → `uninstall` → `xcrun simctl keychain <udid> reset` → `install` →
  re-apply the status-bar override. Explicit udid on every call, never `booted`. Signed Debug build
  only — never `CODE_SIGNING_ALLOWED=NO` for something a walker drives.
- Under **D1a** the walker launches **without** `-PatinaFlags` and must see the four-tab bar.
- Capture with `xcrun simctl io <udid> screenshot` only. Read step 1's card off the shot.

**Expect** `Step 1 of 3` reading *"This is Today — what moved in your house, and what is waiting on
you."*, then step 2 anchored on the record, then `Step 3 of 3` anchored on the **Studio tab** of the
bar (`PatinaTabBar.swift:112-114`) reading *"Your Studio / Your studio — projects, proposals, invoices
and files"*.

**If step 1 still shows the old sentence after a clean relaunch**, check the persona chain before
anything else: every iOS document is `persona: "all"`, the app's `Persona` enum is
`designer|maker|consumer|admin`, and the tour fetches with `persona: .consumer`
(`FirstLaunchTour.swift:894-899`). Resolution depends on step 2 of the fallback chain reaching the
persona-less document (`SanityHelpClient.swift:368-390`). That is the first place to look.

---

## What this page does **not** cover

- **Hiding the six `?` doors.** That is code, in W1 — integration notes at
  `build/waves/w1/l1-c-notes.md` (four doors), `l1-b-notes.md` (Spaces + `R-10`) and one block routed
  to L1-A (QR sign-in). Evidence and per-door reasoning: `waves/w0/help-doors.md`.
- **`R-10`'s HTTP 400.** A `+` in the article-list GROQ that `URLComponents` refuses to
  percent-encode. Diagnosis and the exact fix are in `l1-b-notes.md`; no Sanity change helps it.
- **Authoring the six `ios-app/*` root help articles.** W2, gated on `R-10` — see `help-doors.md` §3.
