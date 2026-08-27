export const meta = {
  name: 'daily-return-w0-foundation',
  description: 'W0 of the Daily Return build: restart the local stack from main + re-walk (Q12), the piece-detail hotfix (Q10) with review and sim verification, the deck answers section, and a critique of the build plan',
  phases: [
    { title: 'Foundation', detail: 'S0 stack restart + re-walk ∥ H0 hotfix implement ∥ D0 deck answers ∥ P0 plan critique' },
    { title: 'Verify + review', detail: 'H0 sim verification (after S0 frees the simulator) ∥ H0 adversarial review' },
  ],
}

const ROOT = '/Users/kody/Code/patina-merged'
const OUT = `${ROOT}/artifacts/ios-daily-return-2026-08-26`
const R = `${OUT}/research`
const S = `${OUT}/source`
const APP = `${ROOT}/apps/mobile/Patina`
const UDID = '973D1724-90BF-4A0A-B02D-481D561547B3'

const COMMON = `You are one agent in the Daily Return build program for the Patina iOS CLIENT app (apps/mobile/Patina). The orchestrator (Fable) reads only your structured return and your files on disk.
Ground rules:
- Program folder: ${OUT}. Plan: ${S}/build-plan.md (read "Global constraints" first). Rulings: ${S}/rulings-2026-08-27.md.
- Sandbox: xcodebuild, xcrun simctl, osascript, sips, headless Chromium, docker, and the supabase CLI all fail inside the command sandbox ("Operation not permitted", simdiskimaged, .env.local deny) — run exactly those with dangerouslyDisableSandbox: true and everything else sandboxed.
- Never git add -A / git add . ; never commit outside your assigned worktree; never push (the orchestrator pushes); never run git in the main checkout unless your brief says a specific read-only command. Never touch production.
- Every build/gate runs in the foreground; never background xcodebuild and end your turn.
- Report with evidence: command output, diff stats, pass/fail counts, shot filenames — never a paraphrase.
- Your FINAL action must be the StructuredOutput tool call, even on failure.`

const safe = async (label, p) => { try { const r = await p; if (!r) log(`${label}: returned null`); return r } catch (e) { log(`${label}: threw ${e && e.message ? e.message : e}`); return null } }
const REPORT = { type: 'object', required: ['ok', 'files', 'notes'], properties: { ok: { type: 'boolean' }, files: { type: 'array', items: { type: 'string' } }, notes: { type: 'array', items: { type: 'string' } }, failures: { type: 'array', items: { type: 'string' } } } }

phase('Foundation')

const S0 = `${COMMON}

ROLE: S0 — steward: restart the local stack from main and re-walk what the review never saw (ruling Q12). Load Skill "patina-local-dev" first (it carries the stop/start/reset footguns) and read ${R}/02-steward-boot.md §2–§8 and ${R}/17-gap-fills.md §G6/§G7.
1. Before stopping: (unsandboxed) psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select id,invoice_number,status,total_cents from invoices where invoice_number='INV-2026-0142'" and record it; docker inspect supabase_studio_supabase | grep -E 'MANAGEMENT_FOLDER' to record the stale worktree provenance.
2. Restart from the MAIN checkout (unsandboxed; no git commands): cd ${ROOT} && pnpm supabase:stop && pnpm supabase:start (supabase stop keeps the data volume by default — do NOT pass --no-backup; do NOT run supabase db reset). Capture the printed URLs/keys presence (never the key values) and confirm the anon key still equals the one the app hard-codes for local (02-steward-boot.md §3 says it matched).
3. Prove: (a) docker inspect supabase_studio_supabase now points at ${ROOT} (not .codex/worktrees/agent); (b) edge functions boot — curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:54321/functions/v1/companion-context with the local anon key as Bearer expects 4xx/2xx, NOT 503; same for create-checkout-session (expect 401/400); (c) the magic-link template now renders a code — POST /auth/v1/otp for client@patina.dev then read Mailpit (curl http://127.0.0.1:54324/api/v1/messages?limit=1 then /api/v1/message/<ID>) and confirm a 6-digit code is in the body; (d) INV-2026-0142 still exists — if not, re-seed exactly per 17-gap-fills.md §G7 (local Postgres only) and say so. If the edge runtime still 503s, try one supabase stop/start more, then report honestly.
4. Re-walk on the booted simulator ${UDID} (the review's app is installed; if not running: xcrun simctl launch ${UDID} cloud.patina.app -DeploymentTarget local; signed in as client@patina.dev — if signed out, password path per 02-steward-boot.md §7; blitz taps per §5, ToolSearch "select:mcp__blitz-iphone__scan_ui,mcp__blitz-iphone__device_action,mcp__blitz-iphone__get_screenshot,mcp__blitz-iphone__describe_screen"): (a) monogram → Profile → Studio → Invoices → INV-2026-0142 → "Pay $4,250.00" → capture the SFSafariViewController Checkout page as ${OUT}/shots/r-01-invoice-pay-tap.png, r-02-checkout-page.png (scroll once, r-03) — note whether an Apple Pay button is visible (Simulator Safari usually cannot show it — say so), note the Stripe test-mode banner if present, then DISMISS without paying; capture the return state r-04. (b) Open the Companion panel and tap a row that calls companion-context (e.g. the top suggested row), capture the reply r-05/r-06; if a conversation composer exists, send one message and capture r-07. Append rows to ${R}/01-shot-ledger.md under a new "## r — re-walk after stack restart (2026-08-27)" table.
5. Write ${R}/04-stack-restart.md (steps, proofs, before/after) and ${R}/05-rewalk.md (what is now sim-verified vs still failing, verbatim on-screen copy). Leave the simulator booted, signed in, on the Daily Room. Return ok:true only if the restart proofs (a)(b)(d) hold.`

const H0 = `${COMMON}

ROLE: H0 — implement the piece-detail hotfix (ruling Q10 = plank SP-01). Read ${S}/shared-planks.md §SP-01 in full, ${R}/33-verify-code-truth.json's F04 note (the trap is .toolbar(.hidden, for: .navigationBar) applied to the whole Group at ProductDetailView.swift:47 while the Back chevron lives only in the success branch), and load Skill "patina-ios-verification".
WORKSPACE PINNING (mandatory): create your worktree from the main checkout with ONE command — git -C ${ROOT} worktree add ${ROOT}/.codex/worktrees/agent-dr-w0-hotfix -b daily-return/w0-hotfix-piece-detail main — then cd into it and verify git rev-parse --show-toplevel ends with agent-dr-w0-hotfix; mkdir .writer.lock.d; copy ${APP}/Patina/App/Configuration/Secrets.swift to the same path inside the worktree (gitignored; never commit it). All commands from now on run inside the worktree.
Deliver exactly this, nothing more:
1. In Core/Network/ProductAPIClient.swift, qualify the ambiguous embed: vendors(name,made_in,brand_story) → vendors!products_vendor_id_fkey(name,made_in,brand_story). Constraint name basis: products.vendor_id is an inline REFERENCES vendors(id) in supabase/migrations/00001_initial_schema.sql:39 (Postgres default name products_vendor_id_fkey; retailer_id at 00011:6 is the second FK that makes the bare embed ambiguous). Confirm against the LOCAL database (unsandboxed psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select conname from pg_constraint where conrelid='public.products'::regclass and contype='f'") and paste the output in your report; note that Strata was not queried (a renamed constraint there would need the same fix re-pointed). Grep the whole app for any other unqualified vendors( embed and qualify each the same way.
2. In Features/ProductDetail/Views/ProductDetailView.swift, give errorView a visible, accessible Back control that pops the screen (reuse the existing back-chevron component the success branch uses; 44×44, accessibilityLabel "Back"), so the error state is never a trap. Keep the retry ("Let's try that again") exactly as is.
3. Tests (Swift Testing, PatinaTests): a case pinning that the products select string contains "vendors!products_vendor_id_fkey(" and does not contain a bare "vendors(" — if the select is not currently a testable constant, extract it to a static let (minimal change) so it is.
4. Gate, in the foreground, unsandboxed: apps/mobile/Patina/scripts/ios-gate.sh all (build + unit + lint-delta vs main) from the worktree. Paste the tail of each tier's output. Do NOT install on the simulator — another agent owns it; record the built .app path under the worktree's DerivedData (or the default DerivedData path xcodebuild used) so the verifier can install it.
5. Commit with pathspecs only the files you touched: git add <files>; git commit -m "fix(ios): qualify the products→vendors embed and give the piece-detail error state a way back" -- <files>. Paste git show --stat. Do not push. rmdir .writer.lock.d at the end.
Return: ok, files, notes (constraint output, gate tails, .app path, commit sha), failures.`

const D0 = `${COMMON}

ROLE: D0 — add the rulings to the deck. Read ${OUT}/mock/deck-parts/DECK.md (the author contract), ${OUT}/mock/deck-parts/14-questions.html (match its card structure and ids), and ${S}/rulings-2026-08-27.md.
1. Write ${OUT}/mock/deck-parts/14b-answers.html: one section id "answers", data-day "+14d", eyebrow "+14D · TWO WEEKS LATER", title "Twelve questions, twelve answers", dated 27 August 2026 — one card per question in the same order as 14-questions.html, each with the question's short name, the ruling verbatim from the rulings file, and the build consequence (one sentence). Follow DECK.md's markup, classes and size budget; no new CSS unless DECK.md permits a scoped block; brand voice.
2. Add "14b-answers.html" to the PARTS order in ${OUT}/mock/deck-parts/build.mjs immediately after "14-questions.html"; add the index entry if the index is generated from data-index-title (check 00-head.html / 99-script.html) and add one line to 15-colophon.html noting the rulings date and file.
3. Rebuild (unsandboxed — sips needs it): cd ${OUT} && node mock/deck-parts/build.mjs. Then run node mock/deck-parts/qa-run.cjs (unsandboxed — Chromium) and confirm: no horizontal scroll at 1440/390, 0 console/page errors, the new section renders in light and dark; capture ${OUT}/mock/deck-qa/answers-1440-light.png and answers-390-dark.png (add the section to the QA section list if it is enumerated).
Return ok, files (the part, the renders, presentation.html size), notes.`

const P0 = `${COMMON}

ROLE: P0 — critic of the build plan. Read ${S}/build-plan.md, then ${S}/direction-b.md §2, §4, §5, §9, §11, ${S}/direction-a.md §5, ${S}/shared-planks.md (every plank's files/size/risk), ${S}/synthesis.md §5 (grafts), ${S}/rulings-2026-08-27.md, ${S}/instruments.md §6 + §6b, ${R}/33-verify-code-truth.json notes (mechanism corrections), and the repo where a claim is load-bearing (does the named file/function exist; is the lane's file set actually disjoint; does ios-gate.sh support running in a worktree; which apps/designer-portal path serves static files for the AASA).
Write ${S}/build-plan-critique.md: (a) spec coverage — every plank, every B §9 W1–W5 item, every ruling, every graft → the wave/lane that carries it, or GAP; (b) contradictions with canon or rulings; (c) lane file-set overlaps that will collide at integration (list the files); (d) sequencing errors (a lane depending on another's unmerged output); (e) missing interfaces (names/signatures neighbours rely on that the plan never states); (f) wrong or unverifiable facts (file paths, line refs, constraint names, flag mechanics); (g) risks the plan understates; (h) what an implementer would need that the plan does not give. Blocking / major / minor, each with the fix. Report every issue; do not filter.`

const [s0, h0, d0, p0] = await parallel([
  () => safe('S0', agent(S0, { label: 'S0 stack restart + re-walk', phase: 'Foundation', model: 'opus', effort: 'high', schema: REPORT })),
  () => safe('H0', agent(H0, { label: 'H0 hotfix implement', phase: 'Foundation', model: 'opus', effort: 'high', schema: REPORT })),
  () => safe('D0', agent(D0, { label: 'D0 deck answers', phase: 'Foundation', model: 'sonnet', schema: REPORT })),
  () => safe('P0', agent(P0, { label: 'P0 plan critique', phase: 'Foundation', model: 'opus', effort: 'high', schema: { type: 'object', required: ['file', 'blocking', 'major', 'minor'], properties: { file: { type: 'string' }, blocking: { type: 'array', items: { type: 'string' } }, major: { type: 'array', items: { type: 'string' } }, minor: { type: 'array', items: { type: 'string' } } } } })),
])
log(`Foundation: S0 ${s0 ? s0.ok : 'NULL'} · H0 ${h0 ? h0.ok : 'NULL'} · D0 ${d0 ? d0.ok : 'NULL'} · P0 ${p0 ? `${p0.blocking.length}/${p0.major.length}/${p0.minor.length}` : 'NULL'}`)

phase('Verify + review')
const [hv, hr] = await parallel([
  () => h0 && h0.ok ? safe('H0 verify', agent(`${COMMON}

ROLE: H0 verifier — sim-verify the hotfix. The hotfix implementer's report: ${JSON.stringify(h0.notes)}. The steward's re-walk report: ${JSON.stringify(s0 && s0.notes)}. Read ${R}/02-steward-boot.md §4–§5 for launch/tap mechanics.
1. Find the hotfix .app (path in the implementer's notes; else the newest Patina.app under ${ROOT}/.codex/worktrees/agent-dr-w0-hotfix/.build or the DerivedData path it names). Unsandboxed: xcrun simctl install ${UDID} <app>; xcrun simctl terminate ${UDID} cloud.patina.app; xcrun simctl launch ${UDID} cloud.patina.app -DeploymentTarget local. The app should still be signed in as client@patina.dev (keychain); if not, sign in per §7.
2. Companion → "View recommendations" (or Profile → Browse pieces) → tap the first product card → capture ${OUT}/shots/r-10-piece-detail-loads.png; scroll → r-11. Confirm via docker logs supabase_kong_supabase --since 2m | grep products that the request carries vendors!products_vendor_id_fkey and returns 200. Tap Back → capture r-12 (returned to the grid). Open two more pieces (r-13, r-14).
3. Append the rows to ${R}/01-shot-ledger.md "## r" table. Leave the simulator booted with the hotfix build installed and signed in. Return ok only if a piece detail rendered with real content and Back worked.`, { label: 'H0 sim verify', phase: 'Verify + review', model: 'sonnet', schema: REPORT })) : Promise.resolve(null),
  () => h0 && h0.ok ? safe('H0 review', agent(`${COMMON}

ROLE: H0 reviewer — adversarial review, separate context from the implementer. Branch daily-return/w0-hotfix-piece-detail in ${ROOT}/.codex/worktrees/agent-dr-w0-hotfix (read-only: git -C <worktree> diff main...HEAD, git show --stat HEAD; do not build; do not commit). Check against ${S}/shared-planks.md §SP-01 and the plan's global constraints: is every unqualified vendors( embed gone (grep the worktree); is the constraint name right (00001_initial_schema.sql:39 inline REFERENCES → products_vendor_id_fkey); does the Back control pop correctly in the error branch given .toolbar(.hidden, for: .navigationBar) on the Group; accessibility label + 44pt; is the test real and does it pin both the positive and the negative; any unrelated change in the diff; Conventional Commit + pathspec; anything the implementer's report claims that the diff does not show. Write ${OUT}/waves/w0/h0-review.md (create the dir). Report every finding with severity + confidence.`, { label: 'H0 review', phase: 'Verify + review', model: 'sonnet', schema: { type: 'object', required: ['file', 'blocking', 'major', 'minor'], properties: { file: { type: 'string' }, blocking: { type: 'array', items: { type: 'string' } }, major: { type: 'array', items: { type: 'string' } }, minor: { type: 'array', items: { type: 'string' } } } } })) : Promise.resolve(null),
])
log(`Verify: ${hv ? hv.ok : 'skipped'} · Review: ${hr ? `${hr.blocking.length}/${hr.major.length}/${hr.minor.length}` : 'skipped'}`)

return { s0, h0, d0, p0, hv, hr }
