# Sanity push: People room help documents (W7)

Project `kv3qrinl`, dataset `production`, workspace `help-system` (schemaId `_.schemas.help-system`).
Source: `studios/help-system/scripts/people-help-content.json` (18 documents).
Authorization: Kody's program ruling §6 (rulings.md) — help articles drafted and pushed to Sanity as part of the one-deploy-chain; ownership of W7 held by session patina-merged-73 (2026-09-16).

## Identity

`whoami` — Kodeman, `kody.kochaver@gmail.com`, id `gJTb9TbI8`, provider `github`, MCP auth method OAuth.

## Pre-push state (raw perspective, query scoped to People/Call Sheet surfaceKeys)

Found 3 documents:

| _id | surfaceKey | contentType | persona |
|---|---|---|---|
| `helpContent--designer-portal--document--people` | designer-portal/document/people | fieldHelper | all |
| `helpContent--designer-portal--document--people--guide--overview` | designer-portal/document/people/guide/overview | helpArticle | all |
| `helpContent--designer-portal--document--people--person` | designer-portal/document/people/person | fieldHelper | all |

Confirmed before writing:
- The one live document on the collision triple (`designer-portal/document/people`, `fieldHelper`, `all`) — `helpContent--designer-portal--document--people` — was present.
- None of the 17 new draft `_id`s existed yet.

## Ruling applied (patina-merged-73, 2026-09-16)

Document #1 of the source JSON (`helpContent.designer-portal--document--people--intro`, surfaceKey `designer-portal/document/people`, contentType `fieldHelper`, persona `all`) collides with the live document on that same triple. Per ruling, it was pushed as a **replace-in-place** of the live `_id` (`helpContent--designer-portal--document--people`), never as a second document. The other 17 were straight creates under their own draft `_id`s.

## Actions taken

1. `create_documents` — 17 documents created as drafts (`drafts.helpContent.designer-portal--document--people--*` / `drafts.helpContent.designer-portal--document--call-sheet--*`). Result: 17 successful, 0 failed.
2. `patch_documents` — one `set` patch on `helpContent--designer-portal--document--people` (surfaceKey, persona, contentType, `tooltipContent.body` all re-asserted; body replaced with the draft's text). Result: 1 successful, 0 failed. Sanity reported a new draft was created from the published revision (`LeJgS4V95QilRSQVSHvGW2`) and the base content + patch were committed atomically.
3. `publish_documents` — all 18 ids published in one call (the replaced live id plus the 17 new ids). Result: 18/18 published, each returning its `draftId` → `publishedId` pair.

## Post-push verification (published perspective)

Query: `*[_type == "helpContent" && (surfaceKey match "designer-portal/document/people*" || surfaceKey match "designer-portal/document/call-sheet*")]`

**20 documents found** = 18 pushed + 2 pre-existing untouched. All 18 pushed documents present with correct `surfaceKey` / `contentType` / `persona` (all `persona: "all"`):

| _id | surfaceKey | contentType |
|---|---|---|
| `helpContent--designer-portal--document--people` (replaced) | designer-portal/document/people | fieldHelper |
| `helpContent.designer-portal--document--people--empty` | designer-portal/document/people | emptyState |
| `helpContent.designer-portal--document--people--word--reach` | designer-portal/document/people/word/reach | tooltip |
| `helpContent.designer-portal--document--people--word--consent` | designer-portal/document/people/word/consent | tooltip |
| `helpContent.designer-portal--document--people--word--paper` | designer-portal/document/people/word/paper | tooltip |
| `helpContent.designer-portal--document--people--contact-rule` | designer-portal/document/people/contact-rule | tooltip |
| `helpContent.designer-portal--document--people--lens` | designer-portal/document/people/lens | tooltip |
| `helpContent.designer-portal--document--people--chips` | designer-portal/document/people/chips | tooltip |
| `helpContent.designer-portal--document--people--person--editing-details` | designer-portal/document/people/person | helpArticle |
| `helpContent.designer-portal--document--people--person--consent` | designer-portal/document/people/person/consent | tooltip |
| `helpContent.designer-portal--document--people--person--access-grant` | designer-portal/document/people/person/access-grant | tooltip |
| `helpContent.designer-portal--document--people--person--authority` | designer-portal/document/people/person/authority | tooltip |
| `helpContent.designer-portal--document--people--firm--intro` | designer-portal/document/people/firm | fieldHelper |
| `helpContent.designer-portal--document--people--firm--designations` | designer-portal/document/people/firm/designations | tooltip |
| `helpContent.designer-portal--document--people--firm--paper` | designer-portal/document/people/firm/paper | tooltip |
| `helpContent.designer-portal--document--call-sheet--site-access--intro` | designer-portal/document/call-sheet/site-access | fieldHelper |
| `helpContent.designer-portal--document--call-sheet--site-access--told` | designer-portal/document/call-sheet/site-access/told | tooltip |
| `helpContent.designer-portal--document--call-sheet--bring-forward--intro` | designer-portal/document/call-sheet/bring-forward | fieldHelper |

Collision-triple check — query: `*[_type == "helpContent" && surfaceKey == "designer-portal/document/people" && contentType == "fieldHelper" && persona == "all"]`

Result: **exactly 1 document** — `helpContent--designer-portal--document--people`. No duplicate created on that triple.

## Pre-existing People docs — untouched, flagged for Kody's copy review

Neither was created, patched, or published by this run. Listed here per instruction, with each body's first sentence:

- `helpContent--designer-portal--document--people--guide--overview` (surfaceKey `designer-portal/document/people/guide/overview`, contentType `helpArticle`, persona `all`) — first sentence: *"Everyone the studio works with — clients, makers, trades, and field parties — as one directory, with threads, reviews, and each person's whole journey on their page."*
- `helpContent--designer-portal--document--people--person` (surfaceKey `designer-portal/document/people/person`, contentType `fieldHelper`, persona `all`) — first sentence: *"The whole journey on one page — proposals, projects, threads, touchpoints — derived, never a separate log."*

Note: the new helpArticle `helpContent.designer-portal--document--people--person--editing-details` shares the surfaceKey `designer-portal/document/people/person` with the pre-existing fieldHelper doc above, but differs in `contentType` (helpArticle vs fieldHelper), so the two do not collide on the (surfaceKey, contentType, persona) lookup triple `useHelpContent` uses.

## Result

- Pushed: 18 (17 created, 1 replaced-in-place)
- Replaced _id: `helpContent--designer-portal--document--people`
- Verified: true (18/18 present with correct fields; collision triple resolves to exactly one document)
- Flagged for Kody's copy review: `helpContent--designer-portal--document--people--guide--overview`, `helpContent--designer-portal--document--people--person`
- Errors: none
