import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  MAX_REVIEW_MEDIA_BYTES,
  parseAuthorizedMedia,
  parseMediaRequest,
  sha256Hex,
} from "./lib.ts";

const editionId = "123e4567-e89b-42d3-a456-426614174000";
const assetId = "123e4567-e89b-42d3-a456-426614174001";
const projectId = "123e4567-e89b-42d3-a456-426614174002";
const actorId = "123e4567-e89b-42d3-a456-426614174003";
const record = {
  assetId,
  bucket: "project-review-media",
  path: `${projectId}/reviews/${editionId}/${"a".repeat(64)}.jpg`,
  checksumSha256: "b".repeat(64),
  sizeBytes: 1024,
  contentType: "image/jpeg",
};

Deno.test("media resolver accepts only exact bounded frozen derivative records", () => {
  assertEquals(parseMediaRequest({ editionId }), { editionId });
  assertEquals(parseMediaRequest({ editionId: "  " }), null);
  const manifest = { editionId, projectId, actorId, media: [record] };
  assertEquals(parseAuthorizedMedia(manifest, editionId, actorId)?.assets.length, 1);
  assertEquals(parseAuthorizedMedia({ ...manifest, actorId: assetId }, editionId, actorId), null);
  assertEquals(parseAuthorizedMedia({ ...manifest, media: [{ ...record, path: `${assetId}/reviews/a.jpg` }] }, editionId, actorId), null);
  assertEquals(parseAuthorizedMedia({ ...manifest, media: [{ ...record, path: `${projectId}/../a.jpg` }] }, editionId, actorId), null);
  assertEquals(parseAuthorizedMedia({ ...manifest, media: [{ ...record, sizeBytes: MAX_REVIEW_MEDIA_BYTES + 1 }] }, editionId, actorId), null);
  assertEquals(parseAuthorizedMedia({ ...manifest, editionId: assetId }, editionId, actorId), null);
});

Deno.test("media hashes use the frozen SHA-256 representation", async () => {
  assertEquals(await sha256Hex(new TextEncoder().encode("x").buffer), "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881");
});
