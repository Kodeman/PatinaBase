# W0 · L0.5 — App Store Connect runbook · **KODY-RUN**

App **6762007888** (`cloud.patina.app`) · CLI `~/.blitz/bin/asc` · credentials already configured at
`~/.blitz/asc-credentials.json` (never printed, never echoed).

**Closes `A2-04`, `A2-05`, `A2-18`, `A2-19`, `A2-20`** — plus `A2-21` (the app name).
**Before state:** [`asc-state-before.md`](./asc-state-before.md), captured 2026-09-02 against the live
API. **Texts this runbook posts:** [`beta-description.md`](./beta-description.md),
[`beta-review-notes.md`](./beta-review-notes.md), [`what-to-test-build-1.md`](./what-to-test-build-1.md)
(the last one is R1 Step 5, not this runbook).

An agent may run `list` / `view`. **Kody runs every `create` / `edit` / `add` below.**

---

## 0. Four things that will bite, found by re-checking every command against the installed binary

### 0.1 ⚠ A boolean flag MUST be written `--flag=value`. A space kills the rest of the line.

The charter's `review edit` block carries `--demo-account-required true \` followed by
`--demo-account-name`, `--demo-account-password` and `--notes`. **Run as written, those last three
flags are silently dropped** and the command still exits 0. Proved on the installed binary with a
read-only command, so the failure mode is observed, not inferred:

```
$ asc testflight groups list --app 6762007888 --internal=true  --output table   → table printed, filter ON
$ asc testflight groups list --app 6762007888 --internal true  --output table   → JSON printed, filter ON
$ asc testflight groups list --app 6762007888 --internal false --output table   → JSON printed, filter ON
$ asc testflight groups list --app 6762007888 --output table --internal true    → table printed, filter ON
```

Two behaviours, both Go's stdlib `flag` package:

1. **The value after a space is ignored.** `--internal false` still filtered to the internal group.
2. **The stray word ends flag parsing.** In runs 2 and 3, `--output table` sat *after* the stray word
   and was never applied — JSON came back. In run 4 it sat *before* and was applied.

So a boolean flag is either bare (`--demo-account-required`) or `=`-joined
(`--demo-account-required=true`). **Never `--flag true`.** Every boolean in this runbook uses `=`.
`asc`'s own `--help` examples (`--gambling false`, `--contains-proprietary-cryptography=false`) are
inconsistent on this; the `=` form is the one that works in both.

### 0.2 ⚠ Run `asc` outside the agent sandbox.

Inside it every call dies with `tls: failed to verify certificate: x509: OSStatus -26276` — the
filtering proxy terminates TLS and `asc` correctly refuses the substituted certificate. Kody's own
terminal is unaffected. An agent re-running the probes needs `dangerouslyDisableSandbox: true`.

### 0.3 The review detail already exists — the verb is `edit`, not `create`.

`testflight review view` returns one `betaAppReviewDetails` row with `attributes: {}`. Its id is
`6762007888` — the same digits as the app id, which reads like a typo and is not. There is no
`testflight review update`; `edit` takes `--id`, never `--app`.

### 0.4 `--demo-account-password` is not a password.

The app has no password field anywhere. The value is the six-digit `test_login_code` from the Strata
Vault, and `beta-review-notes.md` explains that it is typed into the email-code sheet. Apple's field
is called "password"; ours is a code.

---

## 1. Variables — assign at the top, never type a value inline

Five values this lane may not invent, plus two it can. **No angle bracket appears anywhere in this
runbook** (the 2026-08-26 placeholder incident): an unset variable fails the preflight in §2 loudly
instead of reaching Apple as literal text.

```bash
ASC=~/.blitz/bin/asc
APP=6762007888
W0=/Users/kody/Code/patina-merged/artifacts/ios-testflight-polish-2026-09-01/build/waves/w0

# Kody fills these five in before running anything in §3.
FEEDBACK_EMAIL=            # where TestFlight feedback lands
CONTACT_EMAIL=             # App Review's contact for this app
CONTACT_PHONE=             # App Review's contact phone, with country code

DEMO_ACCOUNT_EMAIL=firstflight@patina.cloud   # D11: the clean round-one client account L0.2 mints
DEMO_ACCOUNT_CODE=         # the CURRENT value of the Strata Vault secret `test_login_code`
                           # (D7). Do not echo it; do not commit it.
```

`DEMO_ACCOUNT_EMAIL` is fixed by **D11** and `tester@patina.cloud` is retired from the app's story —
`A3-15` (its notification feed is four designer-portal messages, one deep-linking to a host this app
does not claim) is the reason. **L0.2 must have minted `firstflight@patina.cloud` and added it to the
`test-account-login` allow-list before §3 runs**, or the credential this runbook publishes to Apple
does not work.

---

## 2. Preflight — run this first, and read its output

Every check is a plain file read, so there is no `grep -q` on a large pipe and no `pipefail` SIGPIPE
trap.

```bash
set -u

for f in beta-description.md beta-review-notes.md; do
  test -f "$W0/$f" || { echo "MISSING: $f"; exit 1; }
done

# the one fill token in the drafts. It MUST be gone before the notes reach Apple.
if grep -n 'PASTE_TEST_LOGIN_CODE' "$W0/beta-review-notes.md"; then
  echo "STOP — replace PASTE_TEST_LOGIN_CODE in beta-review-notes.md with the real six-digit code"
  exit 1
fi

for v in FEEDBACK_EMAIL CONTACT_EMAIL CONTACT_PHONE DEMO_ACCOUNT_EMAIL DEMO_ACCOUNT_CODE; do
  eval "val=\${$v:-}"
  test -n "$val" || { echo "STOP — $v is empty"; exit 1; }
done

# both texts are sent verbatim and Apple caps each field at 4000 characters
wc -m "$W0/beta-description.md" "$W0/beta-review-notes.md"
# expected today: 2157 and 3862 — the notes file becomes 3847 once the six-digit code
# replaces the 21-character token, 153 characters under Apple's 4000 cap.
# (what-to-test-build-1.md is 3152, checked in R1 Step 5, same cap.)
# If you add a paragraph to the notes, re-run this line before §3.2.

echo "preflight OK"
```

The two `.md` files contain **body text only** — no headings, no `**`, no front matter — because
`--description "$(cat …)"` and `--notes "$(cat …)"` send the file byte-for-byte to Apple. Anything
added to those files is published. Keep commentary here, not there.

---

## 3. The two writes

### 3.1 TestFlight app localization — closes `A2-05`

The app has **zero** localizations (`total: 0`), so this is `create`. Without it the tester's
TestFlight card is blank and external submission is refused.

```bash
$ASC testflight app-localizations create --app $APP --locale en-US \
  --description "$(cat "$W0/beta-description.md")" \
  --feedback-email "$FEEDBACK_EMAIL" \
  --marketing-url "https://patina.cloud/app" \
  --privacy-policy-url "https://patina.cloud/privacy"
```

If it ever returns a duplicate-resource error, the row exists — resolve the id and switch verbs; the
flags are otherwise identical:

```bash
LOC_ID=$($ASC testflight app-localizations list --app $APP --output json | jq -r '.data[0].id')
$ASC testflight app-localizations update --id "$LOC_ID" \
  --description "$(cat "$W0/beta-description.md")" \
  --feedback-email "$FEEDBACK_EMAIL"
```

⚠ `https://patina.cloud/app` and `https://patina.cloud/privacy` must both resolve before this runs —
Apple fetches them. `C1-30` / `C5-04` (W1 · L1-A) put the same `/privacy` URL on the app's first
screen, so one dead page fails in two places.

### 3.2 Beta App Review detail — closes `A2-04`

Resolve the id from the read, never type it. Note every boolean is `=`-joined (§0.1), and
`--demo-account-required=true` is placed **first** among the demo flags so that even a future
parser change cannot orphan the two values behind it.

```bash
DETAIL_ID=$($ASC testflight review view --app $APP --output json | jq -r '.data[0].id')
test -n "$DETAIL_ID" || { echo "STOP — no review detail id"; exit 1; }

$ASC testflight review edit --id "$DETAIL_ID" \
  --contact-first-name Kody \
  --contact-last-name Kochaver \
  --contact-email "$CONTACT_EMAIL" \
  --contact-phone "$CONTACT_PHONE" \
  --demo-account-required=true \
  --demo-account-name "$DEMO_ACCOUNT_EMAIL" \
  --demo-account-password "$DEMO_ACCOUNT_CODE" \
  --notes "$(cat "$W0/beta-review-notes.md")"
```

`jq -r '.data[0].id'` was run against the live API and returned `6762007888`.

### 3.3 Internal testers — closes `A2-18`

Two people, one group. **Internal Patina** is `71f90727-fc35-4499-824a-3794c06095de` and carries
`hasAccessToAllBuilds: true`, so once these two are testers every upload reaches them without a
`builds add-groups` call. Internal distribution skips Beta App Review entirely, which is how the whole
chain gets proved before Apple is ever asked.

```bash
INTERNAL=71f90727-fc35-4499-824a-3794c06095de

$ASC testflight testers add --app $APP --group "$INTERNAL" \
  --email "$CONTACT_EMAIL" --first-name Kody --last-name Kochaver

# Leah — fill her address and surname in the same shape, no angle brackets:
LEAH_EMAIL=
LEAH_LAST=
test -n "$LEAH_EMAIL" || { echo "STOP — LEAH_EMAIL is empty"; exit 1; }
$ASC testflight testers add --app $APP --group "$INTERNAL" \
  --email "$LEAH_EMAIL" --first-name Leah --last-name "$LEAH_LAST"
```

**`MiddleWest Client` (`2231934a-d514-4f96-aae1-1745561f9353`) stays empty.** Leah's clients are added
only after Beta App Review passes and the device pass is clean (R1 Step 7). Adding a tester to an
external group before then sends an invitation the build cannot honour.

---

## 4. Age rating — closes `A2-20`

Today the declaration `d405ec23-68bb-4dfd-b971-18a6c4847ac2` says **false** to messaging and **false**
to user-generated content, while the app ships `Patina/Features/Messaging/` and room photo/scan
capture. Two answers are wrong; the other twenty-three are correct.

**The charter calls this UI-only. It is not — `asc age-rating edit` exists and carries both flags.**
Verified against `--help` on the installed binary. Either path is fine; the CLI is one line and cannot
mis-click a neighbouring question.

```bash
# CLI path. Two flags, nothing else touched. NOT --all-none: that would reset the 23 correct answers.
$ASC age-rating edit --app $APP \
  --messaging-and-chat=true \
  --user-generated-content=true

# then read it back
$ASC age-rating view --app $APP --output json --pretty
```

**UI path, if you would rather see the questionnaire:** App Store Connect → Patina → App Information →
Age Rating → Edit. Answer **yes** to *messaging/chat* (it is moderated and one-to-one with the licensed
designer engaged on the project) and **yes** to *user-generated content* per Apple's definition (room
photos and scans the client captures, plus their notes to their designer). Leave every other answer at
its current value. `beta-review-notes.md` already explains both to the reviewer, so the declaration and
the notes agree.

---

## 5. The remaining UI-only steps

- **App name — `A2-21`.** App Store Connect → Patina → App Information → **Name**. The record says
  "Patina Design"; the built `CFBundleName` is "Patina"; `Info.plist:21` carries a third string. Pick
  **Patina**. The version is still `PREPARE_FOR_SUBMISSION`, so the rename is free.
  (`asc metadata` can also write app-info localizations, but it is a pull/apply/push cycle for one
  field — the UI is the cheaper path here.)
- **Encryption.** With `ITSAppUsesNonExemptEncryption = NO` in the plist (L0.1 / `A2-06`) the question
  stops being asked per upload; the app holds **zero** encryption declarations today and the 2026-05
  build still came back `usesNonExemptEncryption: false`, so the plist answer is carrying it. Answer
  once in the UI only if ASC still prompts after the upload.
- **Signing — `A2-19`.** Do not create profiles by hand. L0.1's archive with
  `-allowProvisioningUpdates` regenerates the App Store profiles for **both** bundle ids
  (`47UZT5FK2Y cloud.patina.app`, `ACZ5623YSY cloud.patina.app.widget`). Today the account holds
  exactly one profile of any type — `2M9A3BAL47 "cloud.patina.app App Store"`, state **INVALID** — and
  none for the widget. If the archive does not fix it, delete `2M9A3BAL47` in Certificates,
  Identifiers & Profiles and re-archive.
- **Groups.** Covered by §3.3. Internal Patina = Kody + Leah; MiddleWest Client stays empty until beta
  review passes.

---

## 6. The read-only probe an agent runs after

Sandbox off (§0.2). Each line states what "pass" looks like.

```bash
ASC=~/.blitz/bin/asc; APP=6762007888

$ASC testflight review view --app $APP --output json --pretty
# PASS: attributes is no longer {} — contactFirstName/LastName/Email/Phone set,
#       demoAccountRequired true, demoAccountName firstflight@patina.cloud, notes non-empty

$ASC testflight app-localizations list --app $APP --output json --pretty
# PASS: total 1, locale en-US, feedbackEmail set, privacyPolicyUrl https://patina.cloud/privacy

$ASC testflight testers list --app $APP --output table
# PASS: 2 rows (was 0)

$ASC testflight groups list --app $APP --output table
# PASS: unchanged — Internal Patina 71f90727-…, MiddleWest Client 2231934a-…

$ASC age-rating view --app $APP --output json --pretty
# PASS: messagingAndChat true, userGeneratedContent true, every other field unchanged

$ASC apps view --id $APP --output json --pretty
# PASS: name "Patina"

$ASC profiles list --profile-type IOS_APP_STORE --output table
# PASS (only AFTER L0.1's archive): two VALID rows — cloud.patina.app and cloud.patina.app.widget.
# The flag is --profile-type. There is no --filter-profile-type.
```

Diff the result against `asc-state-before.md`. **W0 · L0.5 exits when `testflight review view` returns
populated attributes** (steward.md §8) — the other lines are the same gate's supporting evidence.

---

## 7. Handover to R1 — the ids Step 5 and Step 7 need

Recorded here so `build/waves/r1/asc-ids.md` is a copy, not a re-derivation:

| Name | ID |
|---|---|
| App | `6762007888` |
| Beta App Review detail | `6762007888` |
| Internal Patina (internal group) | `71f90727-fc35-4499-824a-3794c06095de` |
| MiddleWest Client (external group) | `2231934a-d514-4f96-aae1-1745561f9353` |
| Age rating declaration | `d405ec23-68bb-4dfd-b971-18a6c4847ac2` |
| Existing App Store profile (INVALID) | `2M9A3BAL47` |
| Build 2, expired, 2026-05-12 | `9b61ad6c-49da-4356-bd7c-4b8bd8832bad` |

`what-to-test-build-1.md` is **not** posted by this runbook — it goes up in R1 Step 5 against the new
build, after the archive:

```bash
$ASC builds test-notes create --build-id "$BUILD" --locale en-US \
  --whats-new "$(cat "$W0/what-to-test-build-1.md")"
```

`--latest` in R1's `builds info` line is a bare boolean followed by `--platform`, so §0.1 does not
bite there — but check every boolean in R1 the same way before running it.

**Before that runs, apply the standing rule to the notes file:** *What to Test may not send a tester
at a surface that carries an open blocker.* Its ten numbered items were written against the W1 lane
tables as they stand on 2026-09-02 and each is covered by a W1 fix —

| Item | The surface | What makes it safe on build 1 |
|---|---|---|
| 1 first two minutes | Welcome, email code, Apple | L1-A: `A3-06` Google dropped (D3), `P-29` root error, `C1-37`/`P-22` banner + auto-verify, `A3-16` demo credential |
| 2 Today | four-tab root | D1/D1a ship `house-first` on; L1-B `A-81` one count, L1-C `C-06`/`GAP1B-03` header |
| 3 a decision | decision detail + consent sheet | L1-C `GAP1B-01`, `GAP1B-02` (both blockers, both W1) |
| 4 a proposal | Studio → proposal | ⚠ **L0.7 walks this surface in W0 — 8 findings exist across all 629 and none is scheduled.** If L0.7 returns a blocker here, this item comes out and the surface moves to "already known" |
| 5 an invoice, paying | invoice detail → Stripe Checkout | D10 puts a live key on Strata; L1-C `B-28` + `GAP2-24` fix the pay-failure layout |
| 6 messages | thread detail | L1-F `C-13`, `C-14`, `C4-04`; L1-C `C9-05` composer under the dock |
| 7 rooms | Spaces → scan / manual | D12 promotes `GAP4-02`, `GAP4-03`, `GAP4-25` into W1 — all three were dead ends |
| 8 notifications | permission + push | D9: APNs credentials on Strata; L1-F `C2-09` denied-state, `A-80` loading state |
| 9 the widget | Home Screen, medium | D5 ships it fixed; L1-F `GAP7B-02`/`03`/`04`/`05`, `B-16` |
| 10 dark + large text | whole app | L1-D dark tokens; L1-C + `GAP1B-07`, `GAP1B-08`, `P-34` |

Item 4 is the one to re-read on the morning of the invite. Items 5 and 8 exist **only** because D10 and
D9 ruled them live — if either reverses, the item comes out and becomes an "already known" line.

---

## 8. What this runbook does not do

- No production database write, no Vault write, no Supabase call. `firstflight@patina.cloud` is minted
  by **L0.2**'s Kody-run SQL and its allow-list entry, not here.
- No archive, no upload, no build. That is L0.1 then R1 Steps 2–4, on Kody's machine.
- No `builds add-groups`, no `testflight review submit`. Those are R1 Steps 5 and 7, after the device
  pass.
- No external tester is invited. **MiddleWest Client stays empty until beta review passes.**
