# W4 · lane D — integration notes

Branch `daily-return/w4-d`, base `1cb71c346`. Everything below is measured against the live local
stack at 00539 unless it names a file and line instead.

---

## 1. The brief's `note` column would have split one fact in two — 00539 hardens `notes` instead

**Deviation, stated first because it is the only one in the lane.**

The brief said: `00539_saved_items_note.sql — ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS note
text`. Measured before writing:

```
$ psql -c "select column_name, data_type, is_nullable from information_schema.columns
           where table_schema='public' and table_name='saved_items'"
 id · user_id · product_id · room_id · name · image_url · brand_name · price_in_cents ·
 notes (text, nullable) · source · created_at · updated_at · price_cents_at_save
```

`note` singular does not exist, so `ADD COLUMN IF NOT EXISTS note text` would have **succeeded** — and
minted a second home for a fact `notes` has held since `00055_saved_items.sql:29`. The iOS write leg
already fills `notes` today:

- `CreateSavedItemPayload.notes: String?` — `apps/mobile/Patina/Patina/Core/Network/RoomsAPIClient.swift:133`
- backed by `TableItemModel.notes: String?` — `Core/Models/TableItemModel.swift:42`

A reader of a new `note` column would therefore have found every row NULL, and H2's Saved row would
have printed nothing where the person had actually written something. That is the honesty rule (C5)
failing from the schema up, not a naming quibble.

So 00539 keeps the intent — the note becomes bounded and documented — on the column that holds it:

1. `ADD COLUMN IF NOT EXISTS notes text` (no-op at or past 00055; kept for replay from an older baseline)
2. `saved_items_notes_length_check` — `CHECK (notes IS NULL OR char_length(notes) <= 2000)`
3. `COMMENT ON COLUMN public.saved_items.notes`

This is the same shape 00535 used when the plan named `room_id` and `room_id` turned out to already
exist (`00535:22-27`): a no-op `ADD COLUMN` plus a banner paragraph saying why. The banner of 00539
carries the full account, and `supabase/tests/rooms/saved_item_note_test.sql` asserts that
`saved_items.note` **does not exist**, so the duplicate cannot be re-minted quietly later.

⚠ One consequence for a future prod push, recorded rather than assumed away: the CHECK **validates
existing rows**. On a stack already holding a note longer than 2000 characters the migration fails
loudly rather than truncating anybody's words. Local is 0 rows; nothing is claimed about Strata.

**For Fable:** if the intent really was a second, differently-scoped column, say so and D will mint
it — but it needs a name that is not a near-homograph of `notes` and a stated writer.

## 2. `RemoteSavedItem` still cannot read the note — H1's file, and it is now measured

Steward §4a predicted this; here it is confirmed. `RemoteSavedItem`
(`Core/Network/RoomsAPIClient.swift:49-59`) decodes nine fields:

```
id · room_id · user_id · product_id · name · image_url · price_in_cents · source · created_at
```

Neither `notes` nor `price_cents_at_save` is among them, though both exist on the table (00055:29,
00535:21) and the **write** leg already sends `notes` (§1). H2's "save date · room · note" cannot be
drawn from the server leg until `RemoteSavedItem` gains `notes` — and `RoomsAPIClient.swift` is
**H1's** file, so this is H1's one-line commit or a steward-applied note, not D's.

The database half is done and needs nothing further from anyone.

## 3. `listRooms()` has no caller — the seeded room is inert until a lane wires it

```
$ grep -rn "listRooms()" --include="*.swift" apps/mobile/Patina
Patina/Core/Network/RoomsAPIClient.swift:214:    public func listRooms() async throws -> [RemoteRoom] {
```

One definition, **zero call sites**. And `RemoteRoom` (`:20-34`) decodes fifteen fields, none of them
`budget_cents` — so even once something calls it, the room's budget does not arrive.

The seeded Guest Bedroom is therefore only visible in the app if H1 (a) calls `listRooms()` or reaches
`rooms` some other way, and (b) adds `budget_cents` to `RemoteRoom`. Both are H1's files. **If H1's
plan is local-first only — the room typed on the device, held in `RoomModel`/`RoomStore`, mirrored
outward — then the seed serves the walk as a second-device / fresh-install fixture rather than as the
row the first screen draws, and that is worth the walker knowing before he wonders why it is absent.**

## 4. Both of the client's project rooms carry `budget_cents = 0` and `committed_cents = 0`

Not D's to change under this brief, raised for a ruling because it lands on H1's walk.

```
$ select pr.name, pr.budget_cents, pr.committed_cents from project_rooms pr
    join projects p on p.id = pr.project_id
   where p.client_id = 'a0000000-0000-0000-0000-000000000005';
 Dining Room | 0 | 0
 Living Room | 0 | 0
```

B M4 says that where a project owns the room the stat reads `committed_cents` and is **labelled** as
such. With both figures at zero, the two project-room cards can only draw `$0 of $0` or fall to the
truthful empty — so the walk will exercise the empty path twice and the labelled-number path never,
on the exact surface this wave is about.

`supabase/seed/decisions.sql` (which seeds these rows, §"Project rooms (00172 room linkage)") is in
D's owned set, so this is one line D can take on Fable's word. Suggested values — the Living Room
matching what `mock/fragments/b-M4.html` prints, the Dining Room a second, different shape so the
walk sees two:

```sql
-- in seed/decisions.sql, after the project_rooms insert
UPDATE public.project_rooms SET budget_cents = 900000, committed_cents = 240000
 WHERE id = 'b0000000-0000-0000-0000-0000000d2c0b';   -- Living Room  ($9,000 · $2,400 committed)
UPDATE public.project_rooms SET budget_cents = 450000, committed_cents = 0
 WHERE id = 'b0000000-0000-0000-0000-0000000d2c0a';   -- Dining Room  ($4,500 · nothing committed yet)
```

D did **not** apply this. Say the word and it is one commit plus a reset.

## 5. What lane D did not touch

- No iOS file. No `RemoteSavedItem`, no `RemoteRoom`, no `RoomsAPIClient` — §2 and §3 are notes, not edits.
- No policy, no grant, no function, no new table ⇒ `seed/00-legacy-grants.sql` was **not** regenerated
  (`grep -c 'GRANT\|REVOKE'` over 00539's non-comment lines = 0).
- No `project_rooms` change (§4), no `decisions.sql` change.
- Nothing against Strata. No `supabase db push`, no edge function deploy, no prod read.
- `packages/supabase/src/database.types.ts` was regenerated and came back **byte-identical** — the
  expected result, since 00539 adds no column; the regen is the evidence for that rather than an
  argument that it should hold.
