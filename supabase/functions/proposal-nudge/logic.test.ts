// Deno tests for the pure proposal-nudge helpers.
// Run: deno test supabase/functions/proposal-nudge/logic.test.ts

import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { nudgeRoutesToDigest } from "./logic.ts";

Deno.test("a batching cadence still folds the nudge into her summary (r1 B2)", () => {
  // The two spellings 00572 retired. A portal running yesterday's build still
  // writes them until the trigger normalises the row, and this branch is the
  // summary's only source of proposal lines — reading the old word literally
  // emptied that section the moment the migration applied.
  assertEquals(nudgeRoutesToDigest({ reminder_cadence: "daily_digest" }), true);
  assertEquals(nudgeRoutesToDigest({ reminder_cadence: "immediate" }), false);

  // The three cadences in her own words.
  assertEquals(nudgeRoutesToDigest({ reminder_cadence: "daily" }), true);
  assertEquals(nudgeRoutesToDigest({ reminder_cadence: "weekly_sunday" }), true);
  assertEquals(nudgeRoutesToDigest({ reminder_cadence: "right_away" }), false);
});

Deno.test("a preferences row with no cadence takes the column's own default", () => {
  assertEquals(nudgeRoutesToDigest({ reminder_cadence: null }), true);
  assertEquals(nudgeRoutesToDigest({}), true);
});

Deno.test("no preferences row at all keeps the direct letter she has always had", () => {
  assertEquals(nudgeRoutesToDigest(null), false);
  assertEquals(nudgeRoutesToDigest(undefined), false);
});
