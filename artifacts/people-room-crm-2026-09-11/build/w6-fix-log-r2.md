# W6 fix log — round 2 (F4-new)

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
Branch: `build/people-room-crm-2026-09-11`, HEAD before this fix `c83e119c4`
(`git merge-base --is-ancestor f1f556260 HEAD` → true). Local DB only; **no prod,
no servers started** (port 3000 checked with `lsof -nP -iTCP:3000 -sTCP:LISTEN` —
nothing listening; none started, per the brief's "no servers").

Scope: exactly one finding, `F4-new` (major). Nothing else touched.

---

## F4-new — `addSub()` hard-coded a phone the seed already owns (major) — FIXED

**File:** `apps/designer-portal/e2e/people/person-card.spec.ts`

**Confirmed the claim before fixing.**

- The seed's permanent Frank Bauer card (`d0e10000-0000-0000-0000-000000000015`)
  carries `(612) 555-0115` on `studio_contacts.phone` (`supabase/seed/people_crm_dev.sql:248`),
  again as an `office` channel (`:385`, labelled `'office — do not use'`), and again
  on the seeded engagement row (`:716`).
- The spec filled that exact number for **every** synthetic sub
  (`person-card.spec.ts:44`, pre-fix).
- The collision path is the product's own, from this program's `b4c1ff290`
  ("phone-collision disclosure"): `add-person-sheet.tsx:399-412` matches the typed,
  normalized number against every person card in the studio
  (`(c) => c.entity_kind === "person" && c.phone_e164 === typedPhoneE164`), and
  the sheet states the consequence on its face at `:1481` —
  *"This number is already on file for {name}. The rule and the channel you write
  here land on {name}'s card, and this seat is theirs — not a new person's."*
  So the submission attached to the existing card and no card under the typed
  unique name was ever written; `cardByName(name)` returned null and the
  `expect.poll(...).not.toBeNull()` at `:50` (pre-fix numbering) could only time out
  at 15 s.

**Change.** `addSub()` now derives a per-call number instead of a literal:

```ts
function mobileFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 6000;
  return `(612) 555-${4000 + hash}`;
}
...
await page.getByLabel("Mobile").fill(mobileFor(name));
```

The digits are hashed off the **full** name, which already carries
`uniqueName()`'s per-run suffix (`people-fixture.ts:12-14`), so the number is
unique per run *and* differs between the two `addSub()` calls inside `task 4`
(`Rosa Delgado …` vs `Frank Bauer …`) even when both `uniqueName()` calls land in
the same millisecond and share a suffix — the finding's second collision case.

**Why the 4000–9999 band:** every phone anywhere in `supabase/seed/` is
`(612) 555-NNNN` with `NNNN` ≤ `0308` (51 distinct numbers:
`0101`–`0128`, `0190`, `0201`–`0221`, `0308`; no other area code appears), so the
band cannot intersect seed data by construction, not merely by luck.

**Collision proof (deterministic, no server needed):** replayed `mobileFor` over
200 000 synthetic run-suffixes for the three names the file actually uses:

```
$ node -e '…mobileFor…'   # 200k suffixes × {Rosa Delgado, Frank Bauer, Erin Sato}
same-test collisions: 0 seed collisions: 0
sample: (612) 555-6651 (612) 555-8021 (612) 555-9783
```

**Cleanup is unaffected:** `removePerson()` already deletes
`studio_contact_channels` by `owner_id` (`people-fixture.ts`), so the new channels
are torn down in the same `finally` block as before, leaving nothing behind for a
later run to collide with.

---

## Gates run

| Gate | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit --strict --target ES2022 --module esnext --moduleResolution bundler --lib dom,dom.iterable,esnext --skipLibCheck --esModuleInterop --resolveJsonModule e2e/people/person-card.spec.ts` (from `apps/designer-portal`) | **exit 0**, no diagnostics. (The app's own `type-check` cannot cover this file — `tsconfig.json` `exclude` lists `**/*.spec.ts`.) |
| Lint | `npx eslint e2e/people/person-card.spec.ts` | `File ignored because of a matching ignore pattern` — the designer-portal ESLint config does not lint `e2e/`. No errors. |
| Spec loads + both tests resolve | `npx playwright test e2e/people/person-card.spec.ts --project=chromium --list` (local Supabase env inline, no `.env.local`) | `Total: 2 tests in 1 file` — `task 4 …` and `R-V …`. |

**Not run, stated plainly:** the behavioral gate — executing these two tests
end-to-end — needs a designer-portal server on :3000, which this round's brief
forbids ("no servers"). Nothing on :3000 was found or started. The evidence above
is static + deterministic: the collision mechanism is read out of the product
source that causes it, and the replacement numbers are proven disjoint from both
the seed set and each other across 200 k simulated runs. A behavioral re-run of
`person-card.spec.ts` belongs to the next QA pass.
