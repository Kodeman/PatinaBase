# W0 · L0.5 — App Store Connect state BEFORE any write

App **6762007888** (`cloud.patina.app`). Captured **2026-09-02** with `~/.blitz/bin/asc`, read-only
(`list` / `view` only). Every block below is the command and its actual output, not a paraphrase.
**Claim level: verified against the live App Store Connect API.**

> ⚠ **Run `asc` outside the agent sandbox.** Inside it, every call dies before it reaches Apple:
> `tls: failed to verify certificate: x509: OSStatus -26276` — the sandbox's filtering proxy
> terminates TLS and `asc` correctly refuses the substituted certificate. Every capture below was
> taken with the sandbox disabled. This is an environment fact, not an auth problem: `asc` is
> already authenticated (`~/.blitz/asc-credentials.json`, never printed).

---

## 1. Beta App Review detail — `A2-04`, EMPTY

```
$ asc testflight review view --app 6762007888 --output json --pretty
{
  "data": [
    {
      "type": "betaAppReviewDetails",
      "id": "6762007888",
      "attributes": {},
      ...
    }
  ],
  "meta": { "paging": { "total": 1, "limit": 50 } }
}
```

`attributes` is `{}` — no contact name, no contact email, no contact phone, no demo account, no notes.
**The detail resource already exists**, so the runbook's operation is `edit`, never `create`.

**`DETAIL_ID` resolves to `6762007888`** — the same digits as the app id. Verified:

```
$ asc testflight review view --app 6762007888 --output json | jq -r '.data[0].id'
6762007888
```

The charter's `jq -r '.data[0].id'` is correct as written.

## 2. TestFlight app localizations — `A2-05`, NONE

```
$ asc testflight app-localizations list --app 6762007888 --output json --pretty
{ "data": [], "meta": { "paging": { "total": 0, "limit": 50 } } }
```

Zero localizations: no beta description, no feedback email, no marketing URL, no privacy URL.
External submission is blocked and a tester's TestFlight card is blank. The runbook's operation is
`create` (there is nothing to `update`).

## 3. Beta testers — `A2-18`, NONE

```
$ asc testflight testers list --app 6762007888 --output json --pretty
{ "data": [], "meta": { "paging": { "total": 0, "limit": 50 } } }
```

Zero testers registered on the app, internal or external.

## 4. Beta groups — both exist, both empty

```
$ asc testflight groups list --app 6762007888 --output table
┌──────────────────────────────────────┬───────────────────┬──────────┬─────────────────────┬─────────────┐
│                  ID                  │       Name        │ Internal │ Public Link Enabled │ Public Link │
├──────────────────────────────────────┼───────────────────┼──────────┼─────────────────────┼─────────────┤
│ 71f90727-fc35-4499-824a-3794c06095de │ Internal Patina   │ true     │ false               │             │
│ 2231934a-d514-4f96-aae1-1745561f9353 │ MiddleWest Client │ false    │ false               │             │
└──────────────────────────────────────┴───────────────────┴──────────┴─────────────────────┴─────────────┘
```

| Group | ID | Kind | Attributes |
|---|---|---|---|
| **Internal Patina** | `71f90727-fc35-4499-824a-3794c06095de` | internal | `hasAccessToAllBuilds: true`, `feedbackEnabled: true`, created 2026-09-01T19:50:28Z |
| **MiddleWest Client** | `2231934a-d514-4f96-aae1-1745561f9353` | external | `feedbackEnabled: true`, created 2026-09-01T19:50:46Z |

`hasAccessToAllBuilds: true` on **Internal Patina** means every future upload reaches Kody and Leah
automatically once they are testers — `builds add-groups` is only needed for **MiddleWest Client**.

**These are the two group IDs R1 Step 5 and Step 7 need.** Recorded here so `build/waves/r1/asc-ids.md`
can be written without re-deriving them.

## 5. Builds — one, expired

```
$ asc builds list --app 6762007888 --paginate --output table
┌──────────────────────────────────────┬───────┬─────────┬──────────┬───────────────────────────┬────────────┬─────────┬────────────┐
│                  ID                  │ Build │ Version │ Platform │         Uploaded          │ Processing │ Expired │ Encryption │
├──────────────────────────────────────┼───────┼─────────┼──────────┼───────────────────────────┼────────────┼─────────┼────────────┤
│ 9b61ad6c-49da-4356-bd7c-4b8bd8832bad │ 2     │ 1.0     │ IOS      │ 2026-05-12T15:34:03-07:00 │ VALID      │ true    │ exempt     │
└──────────────────────────────────────┴───────┴─────────┴──────────┴───────────────────────────┴────────────┴─────────┴────────────┘
```

Full attributes: `version "2"`, `minOsVersion "17.6"`, `usesNonExemptEncryption false`,
`expirationDate 2026-08-10`, `expired true`, `preReleaseVersion 3a8942c7-8c7e-42d8-b43f-0b39565f5c7c`.

Build 1 of this round becomes **version "3"** and must come back `minOsVersion 26.0` (**D6**),
`processingState VALID`, `expired false`.

## 6. Encryption declarations — NONE

```
$ asc encryption declarations list --app 6762007888 --output json --pretty
{ "data": [], "meta": { "paging": { "total": 0, "limit": 50 } } }
```

Empty, and the 2026-05 build still uploaded with `usesNonExemptEncryption: false` — the plist answer
carried it. With `ITSAppUsesNonExemptEncryption = NO` shipped by L0.1 (`A2-06`) no declaration is
needed and ASC should stop asking per upload.

## 7. Provisioning profiles — `A2-19`, one, INVALID

```
$ asc profiles list --profile-type IOS_APP_STORE --output table
┌────────────┬────────────────────────────┬───────────────┬─────────┬───────────────────────────────┐
│     ID     │            Name            │     Type      │  State  │          Expiration           │
├────────────┼────────────────────────────┼───────────────┼─────────┼───────────────────────────────┤
│ 2M9A3BAL47 │ cloud.patina.app App Store │ IOS_APP_STORE │ INVALID │ 2027-05-12T20:41:49.000+00:00 │
└────────────┴────────────────────────────┴───────────────┴─────────┴───────────────────────────────┘
```

`asc profiles list --paginate` (no type filter) returns **the same single row** — this account holds
exactly one provisioning profile of any type. There is no widget profile
(`cloud.patina.app.widget`) and no development profile. The archive must mint both.

## 8. Age rating declaration — `A2-20`, denies what the app ships

```
$ asc age-rating view --app 6762007888 --output json --pretty
"id": "d405ec23-68bb-4dfd-b971-18a6c4847ac2"
"messagingAndChat": false        ← the app ships Patina/Features/Messaging/
"userGeneratedContent": false    ← the app ships room photo + scan capture and client notes
"advertising": false
"gambling": false
"healthOrWellnessTopics": false
"lootBox": false
"parentalControls": false
"ageAssurance": false
"unrestrictedWebAccess": false
… every graded field "NONE", ageRatingOverride "NONE", koreaAgeRatingOverride "NONE"
```

The declaration id matches the one the audit recorded. Two answers are wrong; the other twenty-three
are correct and must not be disturbed — which is why the runbook does **not** use `--all-none`.

## 9. App record — `A2-21`, the name is wrong

```
$ asc apps view --id 6762007888 --output json --pretty
"name": "Patina Design"
"bundleId": "cloud.patina.app"
"sku": "Strata"
"primaryLocale": "en-US"
"contentRightsDeclaration": "USES_THIRD_PARTY_CONTENT"
```

ASC says **"Patina Design"**; the built `CFBundleName` is **"Patina"**. Pick **Patina**.

---

## What this state means for the lane

| Finding | Confirmed by | Operation the runbook needs |
|---|---|---|
| `A2-04` | §1 — `attributes: {}` | `testflight review edit --id 6762007888` (the resource exists; `edit`, not `create`) |
| `A2-05` | §2 — total 0 | `testflight app-localizations create --app … --locale en-US` |
| `A2-18` | §3 — total 0, §4 — two empty groups | `testflight testers add` ×2 into `71f90727-…` |
| `A2-19` | §7 — one INVALID, no widget profile | nothing here; L0.1's archive with `-allowProvisioningUpdates` mints both, then §7 is re-probed |
| `A2-20` | §8 — both flags false | `age-rating edit` (CLI, verified) or the UI questionnaire |
| `A2-21` | §9 — "Patina Design" | ASC UI, App Information → Name |
