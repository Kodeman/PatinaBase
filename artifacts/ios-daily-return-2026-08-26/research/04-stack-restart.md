# 04 — Local stack restart from `main` (S0, ruling Q12)

Run 2026-08-27 ~12:03–12:06 UTC from the **main checkout** `/Users/kody/Code/patina-merged`.
No `db reset`, no `--no-backup`, no git commands, no production contact.

**Headline: the restart fixed the two environment faults the whole review was conducted under.**
Every Supabase edge function was 503 during the walk (`02-steward-boot.md` §8.1) and the magic-link
email carried no code (`17-gap-fills.md` §G6). Both were artefacts of a stack booted from a
**deleted worktree**. After restarting from `main`, edge functions boot and the repo's own
magic-link template renders a 6-digit code. Any finding a seat attributed to "Companion is dead"
or "the OTP email has no code" must be re-read against this file.

---

## 1. Before — what the running stack actually was

| Probe | Result |
|---|---|
| `psql … 'select id,invoice_number,status,total_cents from invoices where invoice_number=…'` | `e7000000-0000-0000-0000-00000000d101 \| INV-2026-0142 \| sent \| 425000` — 1 row |
| `docker inspect supabase_studio_supabase \| grep MANAGEMENT_FOLDER` | `EDGE_FUNCTIONS_MANAGEMENT_FOLDER=/Users/kody/Code/patina-merged/.codex/worktrees/agent-ca1/supabase/functions` · `SNIPPETS_MANAGEMENT_FOLDER=…/.codex/worktrees/agent-ca1/supabase/snippets` |
| container uptimes | `supabase_edge_runtime_supabase` **Up 2 days**, `supabase_kong_supabase` Up 2 days, `supabase_db_supabase` Up 43 hours |
| `POST /functions/v1/companion-context` (anon Bearer) | **503** |
| `POST /functions/v1/create-checkout-session` (anon Bearer) | **503** |
| magic-link template server, from inside the auth container: `wget http://supabase_kong_supabase:8088/email/magic_link.html` | **`HTTP/1.1 404 Not Found`** |

`.codex/worktrees/agent-ca1` **does not exist on disk.** The stack was mounting edge functions and
email templates from a path that had been deleted — which is exactly why the edge runtime could not
resolve an entrypoint (`failed to determine entrypoint` / `InvalidWorkerCreation`) and why GoTrue
fell back to its built-in link-only mail. Note this is a *different* worktree name than
`17-gap-fills.md` §G6 recorded (`…/worktrees/agent`); the folder had moved on again by today.

## 2. The restart

```
cd /Users/kody/Code/patina-merged
pnpm supabase:stop     # → {"project_id_filter":"supabase","backup":true,
                       #    "message":"Stopped supabase local development setup."}
pnpm supabase:start    # → pulled supabase/postgrest:v14.1, then
                       #   "Starting database from backup..."
```

`supabase stop` reported **`"backup":true`** and `supabase start` reported **`Starting database from
backup...`** — the data volume was preserved end to end. `supabase:stop` / `supabase:start` are
plain `supabase stop` / `supabase start` (root `package.json`); no destructive flag was available to
pass by accident. `supabase db reset` was **not** run.

Printed on start (values withheld; presence only): `DB_URL` `postgresql://postgres:postgres@127.0.0.1:54322/postgres`,
`API_URL` `http://127.0.0.1:54321`, `FUNCTIONS_URL` `http://127.0.0.1:54321/functions/v1`,
`STUDIO_URL` `http://127.0.0.1:54323`, `MAILPIT_URL`/`INBUCKET_URL` `http://127.0.0.1:54324`,
plus `ANON_KEY`, `SERVICE_ROLE_KEY`, `PUBLISHABLE_KEY`, `SECRET_KEY`, `JWT_SECRET`, S3 protocol keys.

### Anon key vs. the app's hard-coded local literal — still identical

`APIConfiguration.swift:140` (`.local` branch) vs. the key on the running stack, compared by hash so
no key value is written down:

```
running-stack anon  sha256[0:16] = bf1725a8f98bea37
app hard-coded      sha256[0:16] = bf1725a8f98bea37
```

**Match.** `02-steward-boot.md` §2's claim still holds after the restart; no app rebuild is needed.

---

## 3. Proofs

### (a) Provenance — now `main`, not a dead worktree ✅

```
EDGE_FUNCTIONS_MANAGEMENT_FOLDER=/Users/kody/Code/patina-merged/supabase/functions
SNIPPETS_MANAGEMENT_FOLDER=/Users/kody/Code/patina-merged/supabase/snippets
```

### (b) Edge functions boot — the 503 wall is gone ✅

Same command shape as the before-probe, anon key as Bearer:

| function | before | after |
|---|---|---|
| `companion-context` | 503 | **401** |
| `companion-message` | 503 | **401** |
| `create-checkout-session` | 503 | **400** |
| `morning-brief` | 503 | **200** |

401/400/200 are the functions themselves answering (anon token rejected / bad body / OK). No 503.
Only one stop/start cycle was needed. `docker logs supabase_edge_runtime_supabase` now shows
`serving the request with supabase/functions/<name>` lines instead of boot errors.

Confirmed again from the **app**, not just curl — Kong access log, `Patina/1 CFNetwork` user-agent:

```
"POST /functions/v1/companion-context HTTP/1.1" 200 230 "-" "Patina/1 CFNetwork/3860.600.12 Darwin/25.5.0"
```

### (c) Magic-link template renders a code ✅

```
docker exec supabase_auth_supabase wget -S http://supabase_kong_supabase:8088/email/magic_link.html
  →  HTTP/1.1 200 OK   Content-Length: 9622        (was 404)

POST /auth/v1/otp {"email":"client@patina.dev","create_user":false}  →  200 {}
GET  :54324/api/v1/messages?limit=1  →  ID 4H5ZkRK6i5r56MctPSMhFS
                                        Subject "Sign in to Patina"   (was "Your sign-in link")
                                        To client@patina.dev, 10624 bytes  (was 804)
```

Body, verbatim:

> Your Patina sign-in code is **677011** — or tap the button to sign in.
> …
> Tap the button to sign in, or enter the code below in the app. Either way works — this request expires in 60 minutes.
> **Your code**
> **677011**
> Sign in to Patina ( http://127.0.0.1:54321/auth/v1/verify?token=64b9e7f7…&type=magiclink&redirect_to=http://127.0.0.1:3000 )

Extractor output: `CODES: ['677011']`. The configured subject (`config.toml:197-199`,
"Sign in to Patina") and the `{{ .Token }}` box at `supabase/templates/magic-link.html:65` are both
live. **G6's blocker is closed by the restart** — the "no code in the email" observation was purely
the dead-worktree template mount, exactly as G6 option 2 predicted.

The redirect target is still `http://127.0.0.1:3000` (the designer portal), not the app — that is a
real config limitation and is unchanged by the restart.

### (d) `INV-2026-0142` survived ✅ — no re-seed needed

```
 e7000000-0000-0000-0000-00000000d101 | INV-2026-0142 | sent | 425000 | 2026-09-01
 invoice_line_items count = 2
```

Identical to the before-row. `17-gap-fills.md` §G7's seed was **not** re-run.

---

## 4. Before / after summary

| | before | after |
|---|---|---|
| stack booted from | `.codex/worktrees/agent-ca1` (deleted) | `/Users/kody/Code/patina-merged` |
| edge functions | **all 503** | boot; 200/400/401 per function |
| Companion (`companion-context`) from the app | 503, empty state | **200**, panel renders |
| magic-link mail | "Your sign-in link", 804 B, link only | "Sign in to Patina", 10.6 KB, **6-digit code** |
| `INV-2026-0142` | present | present, untouched |
| local anon key vs app literal | match | match |
| DB data | — | preserved (`backup:true` → `Starting database from backup...`) |

## 5. Residual local-environment faults (still NOT app defects)

1. **`STRIPE_SECRET_KEY` on the local edge runtime is a placeholder** — `docker inspect
   supabase_edge_runtime_supabase` shows `STRIPE_SECRET_KEY=sk_test_…` of **length 32** (a real
   Stripe `sk_test_` key is ~107 chars), tail `alls`. Every `create-checkout-session` call therefore
   dies at Stripe with `Invalid API Key provided: sk_test_********************alls`
   (`[Error] create-checkout-session: customer creation failed …` in the edge-runtime log; **502** at
   Kong). **Stripe Checkout cannot be reached from the local stack.** See `05-rewalk.md` §2.
2. `aesthete-embed-worker` logs `inference_unconfigured` and `aesthete-dna-draft` logs
   `parked_no_api_key` (no `ANTHROPIC_API_KEY`) — expected locally.
3. `psql` prints a harmless `collation version mismatch` WARNING on every connection (153.121 vs
   153.120). Cosmetic; queries return correct rows.
4. The `[inbucket]` config section still warns as deprecated on every CLI invocation.
