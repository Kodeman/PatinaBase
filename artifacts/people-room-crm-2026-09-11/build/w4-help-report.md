# W4-help — People room help content

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Content only: no migrations, no edge functions, no `--commit` to Sanity.

## 1. Files

| File | What |
|---|---|
| `studios/help-system/scripts/people-help-content.json` | 18 `helpContent` docs — the single source of truth, read by both the `.mjs` runner and the typed `.ts` wrapper (decisions-trio pattern) |
| `studios/help-system/scripts/people-help-content.ts` | Typed view over the JSON (`PEOPLE_HELP_DOCS`), extended beyond the Decisions trio's type union to also cover `helpArticle` (needed for the person-card article) |
| `studios/help-system/scripts/run-people-help-seed.mjs` | Direct `@sanity/client` dry-run/`--commit` runner, `run-decisions-help-seed.mjs` verbatim pattern |
| `studios/help-system/scripts/seed-people-help.ts` | `sanity exec` counterpart, `seed-decisions-help.ts` verbatim pattern |
| `packages/help-system/src/surfaceKeys.ts` | +15 canonical keys under `DesignerPortal.Document`: `PeopleFirm`, `CallSheetSiteAccess`, `CallSheetBringForward`, and (round 1, review MAJOR-5) the twelve the content is authored against |
| `apps/designer-portal/src/lib/help-system/document-surface-keys.ts` | Mirror of the same 15 keys |

Not touched: the pre-existing `people-editing-details-help-content.{json,ts}` /
`run-people-editing-details-help-seed.mjs` / `seed-people-editing-details-help.ts` quartet
(F3, pre-CRM). It authored the old helpArticle at surfaceKey `designer-portal/document/people`
(the list surface). This wave's rewritten article lives at a different, more correct surfaceKey
— `designer-portal/document/people/person` (the card the article is actually about) — under a
new `_id`, so there is no collision and no data loss; the old doc is simply superseded in intent,
not in the repo. Retiring it (or repointing `run-people-editing-details-help-seed.mjs`) is a
follow-up, out of this task's named scope.

## 2. Coverage (18 docs)

| Surface | contentType | Count | What |
|---|---|---|---|
| `designer-portal/document/people` | fieldHelper | 1 | Room intro |
| `designer-portal/document/people` | emptyState | 1 | "Nobody in the room yet" |
| `designer-portal/document/people/word/reach` | tooltip | 1 | Account / Field link / On paper |
| `designer-portal/document/people/word/consent` | tooltip | 1 | Texting / Invited / Opted out / Not asked |
| `designer-portal/document/people/word/paper` | tooltip | 1 | Current / Lapses in 30 days / Lapsed / Not on file |
| `designer-portal/document/people/contact-rule` | tooltip | 1 | The rule clause beside a row |
| `designer-portal/document/people/lens` | tooltip | 1 | MINE · STUDIO |
| `designer-portal/document/people/chips` | tooltip | 1 | The six chips (Everyone · Clients · Crew · Makers · Studio · Firms) |
| `designer-portal/document/people/person` | helpArticle | 1 | "Editing someone's details", rewritten |
| `designer-portal/document/people/person/consent` | tooltip | 1 | Record consent |
| `designer-portal/document/people/person/access-grant` | tooltip | 1 | Mint access / Revoke |
| `designer-portal/document/people/person/authority` | tooltip | 1 | Authority on a seat |
| `designer-portal/document/people/firm` | fieldHelper | 1 | Company card intro |
| `designer-portal/document/people/firm/designations` | tooltip | 1 | Paperwork contact / signer / site contact |
| `designer-portal/document/people/firm/paper` | tooltip | 1 | The firm's Paper region |
| `designer-portal/document/call-sheet/site-access` | fieldHelper | 1 | Site access card intro |
| `designer-portal/document/call-sheet/site-access/told` | tooltip | 1 | The "who was told" notice band |
| `designer-portal/document/call-sheet/bring-forward` | fieldHelper | 1 | The rolodex picker's travel-list state |

Sourced from `direction.md` §3.1–§3.3, §3.7, §3.8 (the four word families), §5 (Reach & access,
consent, grants), and `upload-door-spec.md` for voice consistency with the paperwork-door
copy already ruled. No schema words (`channels_forbidden`, `studio_verdict`, `site_access_mode`,
etc.) appear on any face — every sentence uses the fixture-named, human vocabulary direction.md
itself uses.

## 3. Registry keys — what's new vs. what's a bare string

Per this task's named scope, exactly 3 new keys were added to the canonical registry
(`packages/help-system/src/surfaceKeys.ts` → `DesignerPortal.Document`) and mirrored
(`apps/designer-portal/.../document-surface-keys.ts`): `PeopleFirm`, `CallSheetSiteAccess`,
`CallSheetBringForward`. `surface-key-parity.test.ts` (6/6) confirms the mirror still agrees with
the canonical registry in both directions after the edit.

ROUND 1 (review MAJOR-5) PROMOTED THE OTHER TWELVE. The finer-grained tooltip surfaceKeys
(`.../people/word/reach`, `.../word/consent`, `.../word/paper`, `.../people/contact-rule`,
`.../people/lens`, `.../people/chips`, `.../people/person/consent`,
`.../people/person/access-grant`, `.../people/person/authority`,
`.../people/firm/designations`, `.../people/firm/paper`, `.../call-sheet/site-access/told`) are
now named constants in `surfaceKeys.ts` and in the mirror, so all seventeen keys the content is
authored against exist in both registries. The Sanity schema's own field description says a
surfaceKey "must match a key from @patina/help-system/surfaceKeys", and
`surface-key-parity.test.ts` checks registry-vs-mirror only — so nothing in CI could see the gap.
The promotion is additive: no `_id` changed and nothing was reseeded.

The original reasoning for each key existing at all still stands: `useHelpContent`'s query is exact-match on
`(surfaceKey, contentType, persona)` (`[0]` — one doc), so six different tooltip concepts sharing
one literal surfaceKey could never resolve independently; each needed its own key regardless of
whether that key is promoted to a named constant. Precedent for an unregistered-but-valid
sub-path exists elsewhere in the same registry file (Inbox's `Concept.Channel` pattern registers
its concept keys; this wave's word/concept keys do not, since promoting them wasn't in scope).
Promoting them later is additive and safe — it does not change any `_id` or any already-seeded
document.

## 4. Voice and caps

ROUND 1 (review MAJOR-6): the 26 em-dashes across the 18 documents are gone — 22 strings
rewritten with a full stop, a colon or a comma pair, and the caps validator re-run afterwards
(several bodies sat close to the 160 cap; none crosses it). The dry run still reports 18 written,
0 errored, and nothing was ever committed to Sanity, so the sweep cost nothing.

Every tooltip/fieldHelper `body` is ≤160 chars, every emptyState `heading` ≤50 and `description`
≤300 (schema `Rule.max()` caps) — checked programmatically against the JSON, not by eye:

```
Total docs: 18
ALL CAPS + UNIQUENESS OK
```

(also checked: no duplicate `_id`, no duplicate `(surfaceKey, contentType, persona)` triple, every
`surfaceKey` matches the schema's `^[a-z0-9-]+(\/[a-z0-9-]+)+$` regex, every helpArticle carries
title + oneSentenceAnswer + a non-empty body array.)

Studio voice, sentence case, no caveats, no hedging — modeled directly on the exact copy already
ruled in `direction.md` §5.6 ("Opted out by text, 3 December 2025, on the Lindqvist kitchen.",
etc.) and the four word families in §3.8, rather than paraphrased.

## 5. Dry run

```
node studios/help-system/scripts/run-people-help-seed.mjs
```

```
[W4-help] DRY RUN — seeding 18 people-room help docs…

  📝 fieldHelper designer-portal/document/people (_id=helpContent.designer-portal--document--people--intro)
  📝 emptyState  designer-portal/document/people (_id=helpContent.designer-portal--document--people--empty)
  📝 tooltip     designer-portal/document/people/word/reach (_id=helpContent.designer-portal--document--people--word--reach)
  📝 tooltip     designer-portal/document/people/word/consent (_id=helpContent.designer-portal--document--people--word--consent)
  📝 tooltip     designer-portal/document/people/word/paper (_id=helpContent.designer-portal--document--people--word--paper)
  📝 tooltip     designer-portal/document/people/contact-rule (_id=helpContent.designer-portal--document--people--contact-rule)
  📝 tooltip     designer-portal/document/people/lens (_id=helpContent.designer-portal--document--people--lens)
  📝 tooltip     designer-portal/document/people/chips (_id=helpContent.designer-portal--document--people--chips)
  📝 helpArticle designer-portal/document/people/person (_id=helpContent.designer-portal--document--people--person--editing-details)
  📝 tooltip     designer-portal/document/people/person/consent (_id=helpContent.designer-portal--document--people--person--consent)
  📝 tooltip     designer-portal/document/people/person/access-grant (_id=helpContent.designer-portal--document--people--person--access-grant)
  📝 tooltip     designer-portal/document/people/person/authority (_id=helpContent.designer-portal--document--people--person--authority)
  📝 fieldHelper designer-portal/document/people/firm (_id=helpContent.designer-portal--document--people--firm--intro)
  📝 tooltip     designer-portal/document/people/firm/designations (_id=helpContent.designer-portal--document--people--firm--designations)
  📝 tooltip     designer-portal/document/people/firm/paper (_id=helpContent.designer-portal--document--people--firm--paper)
  📝 fieldHelper designer-portal/document/call-sheet/site-access (_id=helpContent.designer-portal--document--call-sheet--site-access--intro)
  📝 tooltip     designer-portal/document/call-sheet/site-access/told (_id=helpContent.designer-portal--document--call-sheet--site-access--told)
  📝 fieldHelper designer-portal/document/call-sheet/bring-forward (_id=helpContent.designer-portal--document--call-sheet--bring-forward--intro)

[W4-help] dry-run: 18 written, 0 errored
```

No `--commit` was run. Nothing was written to Sanity.

## 6. Gates

| Gate | Command | Result |
|---|---|---|
| help-system build (dist rebuild) | `pnpm --dir packages/help-system build` | green (ESM + CJS + DTS) |
| help-system type-check | `pnpm --dir packages/help-system type-check` | clean |
| designer-portal type-check | `pnpm --dir apps/designer-portal type-check` | clean |
| Surface-key parity (bonus, not in the named gate list — cheap and directly exercises the registry edit) | `npx jest src/lib/help-system/surface-key-parity.test.ts` (in `apps/designer-portal`) | 6/6 pass |
| JSON content validator (ad hoc) | node script checking dup `_id`, dup `(surfaceKey, contentType, persona)`, regex, char caps, helpArticle shape | ALL CAPS + UNIQUENESS OK |
| Dry-run seed | `node studios/help-system/scripts/run-people-help-seed.mjs` | 18 written (dry), 0 errored |

`packages/help-system/dist/` is gitignored; the rebuild is on disk but adds nothing to `git status`.

## 7. Not done / owed

- **The old `people-editing-details-help-*` quartet** (F3, pre-CRM) is untouched — see §1. Whether
  to retire it, or repoint its seed at the new surfaceKey, is a call for whoever owns the People
  room's help-content lifecycle next; it's orphaned in intent (no consumer reads
  `designer-portal/document/people` + `helpArticle` in the panel's ancestor-match query without
  also matching the new, more specific `.../people/person` article first for a person-card
  context — but the old doc still resolves for a bare `/people` room-level lookup).
- **The 12 concept-tooltip surfaceKeys** are promoted as of round 1 (MAJOR-5); §3 is corrected.
- **No UI wiring — NAMED FOLLOW-UP, OWNER: W6 (the portal wave), reported to Fable at round 1.**
  Until a component calls `useHelpContent()` for these keys, all 18 documents are unreachable on
  the face. W6 owns the doorways: the three room-level keys (`peopleFirm`, `callSheetSiteAccess`,
  `callSheetBringForward`) through `useDocumentSurface()`/the sheet-open hook, and the concept
  tooltips through the `?` doorway on the word columns, the contact-rule clause, the lens and the
  chips. If W6 cannot carry it, it is Kody's to reschedule — it is not closed by this round.
  No component in this wave was changed to call `useHelpContent()` against any
  of the 18 surfaceKeys, or to call `useDocumentSurface()`/a sheet-open hook for `peopleFirm`,
  `callSheetSiteAccess`, or `callSheetBringForward` (the existing `peoplePerson` and `callSheet`
  keys are in the same unwired state today — confirmed by grep before starting). Content
  authoring and registry keys only, per this task's scope.
- **No Sanity write.** Every doc above is dry-run only; `--commit` was never invoked, no
  `SANITY_AUTH_TOKEN` was used or needed.
- **No migrations, no edge functions.**
