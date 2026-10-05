// deno test --allow-all --config supabase/functions/deno.json supabase/functions/board-deck-import-resolve/crops_test.ts
// deno-lint-ignore-file no-import-prefix
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { BoardCropScope } from "../board-asset-cleanup/core.ts";
import { signCrops } from "./crops.ts";

const PROJECT = "44444444-4444-4444-8444-444444444444";
const OWNER = "11111111-1111-4111-8111-111111111111";
const BOARD = "22222222-2222-4222-8222-222222222222";
const PROPOSAL_BOARD = "33333333-3333-4333-8333-333333333333";
const PROJECT_KEY = `${PROJECT}/boards/${BOARD}/66666666-6666-4666-8666-666666666666.webp`;
const PROPOSAL_KEY = `${OWNER}/boards/${PROPOSAL_BOARD}/77777777-7777-4777-8777-777777777777.webp`;

// import id → the board as the database has it.
const SCOPES: Record<string, BoardCropScope> = {
  "project-import": { boardId: BOARD, projectId: PROJECT },
  "proposal-import": { boardId: PROPOSAL_BOARD, projectId: null },
};

function harness() {
  const signed: string[] = [];
  const scoped: string[] = [];
  return {
    signed,
    scoped,
    scopeFor: (importId: string) => {
      scoped.push(importId);
      return Promise.resolve(SCOPES[importId]);
    },
    sign: (bucket: string, path: string) => {
      signed.push(`${bucket}:${path}`);
      return Promise.resolve(`https://signed/${bucket}/${path}`);
    },
  };
}

Deno.test("SQ-387: the look tier signs a project-board crop in project-ffe-working", async () => {
  const { signed, scopeFor, sign } = harness();
  const urls = await signCrops([
    { item_id: "raw", import_id: "project-import", image: PROJECT_KEY },
    {
      item_id: "signed",
      import_id: "project-import",
      image: `https://strata.example/storage/v1/object/sign/project-ffe-working/${PROJECT_KEY}?token=t`,
    },
    // Another project's key and a traversal are never signed.
    {
      item_id: "foreign",
      import_id: "project-import",
      image: `55555555-5555-4555-8555-555555555555/boards/${BOARD}/x.webp`,
    },
    { item_id: "climb", import_id: "project-import", image: `${PROJECT}/boards/${BOARD}/%2e%2e/%2e%2e/x.webp` },
  ], scopeFor, sign);
  assertEquals(signed, [`project-ffe-working:${PROJECT_KEY}`, `project-ffe-working:${PROJECT_KEY}`]);
  assertEquals([...urls.keys()], ["raw", "signed"]);
  assertEquals(urls.get("raw"), `https://signed/project-ffe-working/${PROJECT_KEY}`);
});

Deno.test("SQ-387: a proposal-board crop is signed in proposal-mood-boards as before", async () => {
  const { signed, scopeFor, sign } = harness();
  const urls = await signCrops([
    { item_id: "a", import_id: "proposal-import", image: PROPOSAL_KEY },
    { item_id: "b", import_id: "proposal-import", image: "https://example.com/x.jpg" },
    { item_id: "c", import_id: "proposal-import", image: null },
  ], scopeFor, sign);
  assertEquals(signed, [`proposal-mood-boards:${PROPOSAL_KEY}`]);
  assertEquals([...urls.keys()], ["a"]);
});

Deno.test("SQ-387: an unsigned crop is left out", async () => {
  const { scopeFor } = harness();
  const urls = await signCrops(
    [{ item_id: "a", import_id: "project-import", image: PROJECT_KEY }],
    scopeFor,
    () => Promise.resolve(null),
  );
  assertEquals(urls.size, 0);
});
