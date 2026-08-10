import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  authorizeSourceArgs,
  MAX_REVIEW_MEDIA_BYTES,
  parseAuthorizedMedia,
  parseAuthorizedSource,
  parseMediaRequest,
  preparedResponse,
  PrepareMediaError,
  prepareReviewMedia,
  registerPreparedArgs,
  registerSourceArgs,
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

function pngFixture(width = 2, height = 3): ArrayBuffer {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set(new TextEncoder().encode("IHDR"), 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes.buffer;
}

Deno.test("media resolver accepts only exact bounded frozen derivative records", () => {
  assertEquals(parseMediaRequest({ editionId }), {
    action: "resolve",
    editionId,
  });
  assertEquals(parseMediaRequest({ action: "resolve", editionId }), {
    action: "resolve",
    editionId,
  });
  assertEquals(parseMediaRequest({ editionId: "  " }), null);
  const manifest = { editionId, projectId, actorId, media: [record] };
  assertEquals(
    parseAuthorizedMedia(manifest, editionId, actorId)?.assets.length,
    1,
  );
  assertEquals(
    parseAuthorizedMedia({ ...manifest, actorId: assetId }, editionId, actorId),
    null,
  );
  assertEquals(
    parseAuthorizedMedia(
      { ...manifest, media: [{ ...record, path: `${assetId}/reviews/a.jpg` }] },
      editionId,
      actorId,
    ),
    null,
  );
  assertEquals(
    parseAuthorizedMedia(
      { ...manifest, media: [{ ...record, path: `${projectId}/../a.jpg` }] },
      editionId,
      actorId,
    ),
    null,
  );
  assertEquals(
    parseAuthorizedMedia(
      {
        ...manifest,
        media: [{ ...record, sizeBytes: MAX_REVIEW_MEDIA_BYTES + 1 }],
      },
      editionId,
      actorId,
    ),
    null,
  );
  assertEquals(
    parseAuthorizedMedia(
      { ...manifest, editionId: assetId },
      editionId,
      actorId,
    ),
    null,
  );
});

Deno.test("media hashes use the frozen SHA-256 representation", async () => {
  assertEquals(
    await sha256Hex(new TextEncoder().encode("x").buffer),
    "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881",
  );
});

Deno.test("prepare request is flat, project-scoped, and private-working only", () => {
  const request = {
    action: "prepare",
    projectId,
    sourceBucket: "project-ffe-working",
    sourcePath: `${projectId}/boards/reference.png`,
    derivativeKind: "display",
  } as const;
  assertEquals(parseMediaRequest(request), request);
  assertEquals(
    parseMediaRequest({ ...request, sourceBucket: "public-mood-boards" }),
    null,
  );
  assertEquals(
    parseMediaRequest({ ...request, sourcePath: `${projectId}/../secret.png` }),
    null,
  );
  assertEquals(
    parseMediaRequest({ ...request, derivativeKind: "cover" }),
    null,
  );
});

Deno.test("prepare orchestration registers, authorizes, copies, verifies, and registers exact RPC metadata", async () => {
  const request = parseMediaRequest({
    action: "prepare",
    projectId,
    sourceBucket: "project-ffe-working",
    sourcePath: `${projectId}/boards/reference.png`,
    derivativeKind: "display",
  });
  if (!request || request.action !== "prepare") throw new Error("fixture");
  const bytes = pngFixture();
  const checksum = await sha256Hex(bytes);
  const sourceAssetId = "423e4567-e89b-42d3-a456-426614174000";
  const preparedAssetId = "523e4567-e89b-42d3-a456-426614174000";
  const objects = new Map<string, ArrayBuffer>([[
    `project-ffe-working:${request.sourcePath}`,
    bytes,
  ]]);
  const events: string[] = [];
  let registeredPath = "";
  const prepared = await prepareReviewMedia(request, actorId, {
    download: async (bucket, path) => {
      events.push(`download:${bucket}`);
      return objects.get(`${bucket}:${path}`) ?? null;
    },
    uploadIfAbsent: async (bucket, path, uploaded) => {
      events.push("upload");
      const key = `${bucket}:${path}`;
      if (objects.has(key)) return false;
      objects.set(key, uploaded.slice(0));
      return true;
    },
    registerSource: async (args) => {
      events.push("registerSource");
      assertEquals(
        args,
        registerSourceArgs(
          request,
          actorId,
          checksum,
          bytes.byteLength,
          "image/png",
        ),
      );
      return {
        sourceAssetId,
        projectId,
        actorId,
        ffeItemId: null,
        bucket: "project-ffe-working",
        path: request.sourcePath,
        checksumSha256: checksum,
        sizeBytes: bytes.byteLength,
        contentType: "image/png",
        mediaKind: "board_reference",
        reused: false,
      };
    },
    authorize: async (args) => {
      events.push("authorize");
      assertEquals(args, authorizeSourceArgs(request, actorId));
      return {
        sourceAssetId,
        projectId,
        actorId,
        bucket: "project-ffe-working",
        path: request.sourcePath,
        checksumSha256: checksum,
        sizeBytes: bytes.byteLength,
        contentType: "image/png",
        width: null,
        height: null,
      };
    },
    register: async (args) => {
      events.push("registerDerivative");
      registeredPath = args.p_derivative_path;
      const source = parseAuthorizedSource(
        {
          sourceAssetId,
          projectId,
          actorId,
          bucket: "project-ffe-working",
          path: request.sourcePath,
          checksumSha256: checksum,
          sizeBytes: bytes.byteLength,
          contentType: "image/png",
          width: null,
          height: null,
        },
        request,
        actorId,
      )!;
      assertEquals(
        args,
        registerPreparedArgs(request, actorId, source, registeredPath, 2, 3),
      );
      return {
        assetId: preparedAssetId,
        sourceAssetId,
        projectId,
        bucket: "project-review-media",
        path: registeredPath,
        checksumSha256: checksum,
        sizeBytes: bytes.byteLength,
        contentType: "image/png",
        derivativeKind: "display",
        width: 2,
        height: 3,
        reused: false,
      };
    },
  });
  assertEquals(registeredPath, `${projectId}/prepared/display/${checksum}.png`);
  assertEquals(events, [
    "download:project-ffe-working",
    "registerSource",
    "authorize",
    "upload",
    "download:project-review-media",
    "registerDerivative",
  ]);
  assertEquals(prepared, {
    assetId: preparedAssetId,
    sourceAssetId,
    projectId,
    bucket: "project-review-media",
    path: registeredPath,
    checksumSha256: checksum,
    sizeBytes: bytes.byteLength,
    contentType: "image/png",
    derivativeKind: "display",
    width: 2,
    height: 3,
    reused: false,
  });
  assertEquals(preparedResponse(prepared), {
    assetId: preparedAssetId,
    checksumSha256: checksum,
    path: registeredPath,
    derivativeKind: "display",
    reused: false,
  });
});

Deno.test("prepare retry reuses an already verified deterministic object", async () => {
  const request = parseMediaRequest({
    action: "prepare",
    projectId,
    sourceBucket: "project-ffe-working",
    sourcePath: `${projectId}/boards/reference.png`,
    derivativeKind: "display",
  });
  if (!request || request.action !== "prepare") throw new Error("fixture");
  const bytes = pngFixture();
  const checksum = await sha256Hex(bytes);
  const sourceAssetId = "423e4567-e89b-42d3-a456-426614174000";
  const path = `${projectId}/prepared/display/${checksum}.png`;
  let uploadAttempts = 0;
  const prepared = await prepareReviewMedia(request, actorId, {
    download: async () => bytes,
    uploadIfAbsent: async () => {
      uploadAttempts += 1;
      return false;
    },
    registerSource: async () => ({
      sourceAssetId,
      projectId,
      actorId,
      ffeItemId: null,
      bucket: "project-ffe-working",
      path: request.sourcePath,
      checksumSha256: checksum,
      sizeBytes: bytes.byteLength,
      contentType: "image/png",
      mediaKind: "board_reference",
      reused: true,
    }),
    authorize: async () => ({
      sourceAssetId,
      projectId,
      actorId,
      bucket: "project-ffe-working",
      path: request.sourcePath,
      checksumSha256: checksum,
      sizeBytes: bytes.byteLength,
      contentType: "image/png",
      width: null,
      height: null,
    }),
    register: async () => ({
      assetId: "523e4567-e89b-42d3-a456-426614174000",
      sourceAssetId,
      projectId,
      bucket: "project-review-media",
      path,
      checksumSha256: checksum,
      sizeBytes: bytes.byteLength,
      contentType: "image/png",
      derivativeKind: "display",
      width: 2,
      height: 3,
      reused: true,
    }),
  });
  assertEquals(uploadAttempts, 1);
  assertEquals(prepared.reused, true);
  assertEquals(prepared.path, path);
});

Deno.test("prepare rejects a derivative that cannot be read back byte-for-byte", async () => {
  const request = parseMediaRequest({
    action: "prepare",
    projectId,
    sourceBucket: "project-ffe-working",
    sourcePath: `${projectId}/boards/reference.png`,
    derivativeKind: "display",
  });
  if (!request || request.action !== "prepare") throw new Error("fixture");
  const bytes = pngFixture();
  const checksum = await sha256Hex(bytes);
  const sourceAssetId = "423e4567-e89b-42d3-a456-426614174000";
  let downloads = 0;
  await assertRejects(
    () =>
      prepareReviewMedia(request, actorId, {
        download: async () =>
          downloads++ === 0 ? bytes : new Uint8Array([1, 2, 3]).buffer,
        uploadIfAbsent: async () => true,
        registerSource: async () => ({
          sourceAssetId,
          projectId,
          actorId,
          ffeItemId: null,
          bucket: "project-ffe-working",
          path: request.sourcePath,
          checksumSha256: checksum,
          sizeBytes: bytes.byteLength,
          contentType: "image/png",
          mediaKind: "board_reference",
          reused: false,
        }),
        authorize: async () => ({
          sourceAssetId,
          projectId,
          actorId,
          bucket: "project-ffe-working",
          path: request.sourcePath,
          checksumSha256: checksum,
          sizeBytes: bytes.byteLength,
          contentType: "image/png",
          width: null,
          height: null,
        }),
        register: async () => null,
      }),
    PrepareMediaError,
    "derivative_integrity_failed",
  );
});
