import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  handleSiteRequestGuest,
  type SiteRequestGuestDeps,
  SiteRequestGuestDirectiveError,
  siteRequestGuestRpcDirective,
  type UploadBinding,
} from "./lib.ts";

const TOKEN = "sr_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG";
const HASH = "a".repeat(64);
const ITEM_VERSION = "11111111-1111-4111-8111-111111111111";
const ATTEMPT = "22222222-2222-4222-8222-222222222222";
const MEDIA = "33333333-3333-4333-8333-333333333333";
const DELIVERABLE = "44444444-4444-4444-8444-444444444444";
const CHECKSUM = "b".repeat(64);

const binding: UploadBinding = {
  request_id: "55555555-5555-4555-8555-555555555555",
  item_id: "66666666-6666-4666-8666-666666666666",
  item_version_id: ITEM_VERSION,
  deliverable_id: DELIVERABLE,
  media_id: MEDIA,
  attempt_number: 1,
  bucket_id: "site-requests",
  object_path:
    `55555555-5555-4555-8555-555555555555/${ITEM_VERSION}/1/proof.jpg`,
  upload_state: "pending",
};

function deps(
  overrides: Partial<SiteRequestGuestDeps> = {},
): SiteRequestGuestDeps {
  return {
    sha256Hex: () => Promise.resolve(HASH),
    bootstrap: () =>
      Promise.resolve({ request: { id: binding.request_id }, items: [] }),
    createUpload: () => Promise.resolve(binding),
    signUpload: (_bucket, path) =>
      Promise.resolve({
        signedUrl: "https://storage.test/signed",
        token: "signed",
        path,
      }),
    verifyUpload: () =>
      Promise.resolve({ exists: true, verified: true, sizeBytes: 3 }),
    acknowledgeUpload: () =>
      Promise.resolve({ media_id: MEDIA, upload_state: "received" }),
    deliver: () =>
      Promise.resolve({ deliverable_id: DELIVERABLE, idempotent: false }),
    ...overrides,
  };
}

function request(
  action: string,
  body: Record<string, unknown> = {},
  token = TOKEN,
): Request {
  return new Request(
    `http://localhost/functions/v1/site-request-guest/${action}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

const uploadBody = {
  itemVersionId: ITEM_VERSION,
  clientAttemptId: ATTEMPT,
  filename: "proof.jpg",
  mimeType: "image/jpeg",
  checksumSha256: CHECKSUM,
  sizeBytes: 3,
};

Deno.test(
  "public endpoint still requires a valid opaque Bearer token before hashing or service access",
  async () => {
    let hashed = false;
    const res = await handleSiteRequestGuest(
      request("bootstrap", {}, "short"),
      deps({
        sha256Hex: () => {
          hashed = true;
          return Promise.resolve(HASH);
        },
      }),
    );
    assertEquals(res.status, 401);
    assertFalse(hashed);
    assertEquals(res.headers.get("Cache-Control"), "no-store");
  },
);

Deno.test(
  "bootstrap passes only the SHA-256 hash to the RPC and returns a narrow DTO",
  async () => {
    let received = "";
    const res = await handleSiteRequestGuest(
      request("bootstrap"),
      deps({
        bootstrap: (hash) => {
          received = hash;
          return Promise.resolve({
            request: { id: binding.request_id },
            items: [],
          });
        },
      }),
    );
    assertEquals(res.status, 200);
    assertEquals(received, HASH);
    const text = await res.text();
    assertFalse(text.includes(TOKEN));
    assert(text.includes(binding.request_id));
  },
);

Deno.test(
  "revoked, expired, stolen, and cross-request misses fail closed with one response",
  async () => {
    const res = await handleSiteRequestGuest(
      request("bootstrap"),
      deps({ bootstrap: () => Promise.resolve(null) }),
    );
    assertEquals(res.status, 404);
    assertEquals((await res.json()).error, "invalid_or_expired_link");
  },
);

Deno.test(
  "RPC adapter reserves terminal directives for explicit access, immutable, and validation conflicts",
  () => {
    const immutable = siteRequestGuestRpcDirective({
      message: "idempotency key was reused with different delivery data",
    });
    assert(immutable instanceof SiteRequestGuestDirectiveError);
    assertEquals(immutable.status, 409);
    assertEquals(immutable.code, "request_conflict");
    assertEquals(
      siteRequestGuestRpcDirective({
        message: "invalid or expired site request access",
      })?.code,
      "invalid_or_expired_link",
    );
    assertEquals(
      siteRequestGuestRpcDirective({
        message: "K-01 requires every configured dimension exactly once",
      })?.code,
      "invalid_delivery",
    );
    assertEquals(
      siteRequestGuestRpcDirective({ message: "connection pool exhausted" }),
      null,
    );
  },
);

Deno.test(
  "explicit immutable conflict returns typed 409 without implementation details",
  async () => {
    const res = await handleSiteRequestGuest(
      request("deliver", {
        itemVersionId: ITEM_VERSION,
        clientAttemptId: ATTEMPT,
        payload: {},
        dimensions: [],
      }),
      deps({
        deliver: () =>
          Promise.reject(
            new SiteRequestGuestDirectiveError(409, "request_conflict"),
          ),
      }),
    );
    assertEquals(res.status, 409);
    assertEquals(await res.json(), { error: "request_conflict" });
  },
);

Deno.test(
  "unexpected hash, RPC, Storage signing, verification, and delivery outages return retryable generic 503",
  async () => {
    const cases: Array<{
      req: Request;
      override: Partial<SiteRequestGuestDeps>;
    }> = [
      {
        req: request("bootstrap"),
        override: { sha256Hex: () => Promise.reject(new Error("crypto down")) },
      },
      {
        req: request("bootstrap"),
        override: { bootstrap: () => Promise.reject(new Error("db details")) },
      },
      {
        req: request("upload-intent", uploadBody),
        override: {
          signUpload: () => Promise.reject(new Error("storage down")),
        },
      },
      {
        req: request("receipt", { ...uploadBody, mediaId: MEDIA }),
        override: {
          verifyUpload: () => Promise.reject(new Error("storage down")),
        },
      },
      {
        req: request("deliver", {
          itemVersionId: ITEM_VERSION,
          clientAttemptId: ATTEMPT,
          payload: {},
          dimensions: [],
        }),
        override: { deliver: () => Promise.reject(new Error("db details")) },
      },
    ];
    for (const testCase of cases) {
      const res = await handleSiteRequestGuest(
        testCase.req,
        deps(testCase.override),
      );
      assertEquals(res.status, 503);
      assertEquals(await res.json(), {
        error: "temporary_service_unavailable",
      });
    }
  },
);

Deno.test(
  "upload intent signs only the immutable DB-returned request/version/attempt path",
  async () => {
    let signedPath = "";
    const res = await handleSiteRequestGuest(
      request("upload-intent", uploadBody),
      deps({
        signUpload: (_bucket, path) => {
          signedPath = path;
          return Promise.resolve({
            signedUrl: "https://storage.test/signed",
            token: "signed",
            path,
          });
        },
      }),
    );
    assertEquals(res.status, 200);
    assertEquals(signedPath, binding.object_path);
    const body = await res.json();
    assertEquals(body.mediaId, MEDIA);
    assertEquals(body.objectPath, binding.object_path);
  },
);

Deno.test(
  "upload intent rejects a DB-returned path outside the request/version/attempt prefix",
  async () => {
    const res = await handleSiteRequestGuest(
      request("upload-intent", uploadBody),
      deps({
        createUpload: () =>
          Promise.resolve({
            ...binding,
            object_path: "foreign/escape.jpg",
          }),
      }),
    );
    assertEquals(res.status, 502);
    assertEquals((await res.json()).error, "invalid_upload_path");
  },
);

Deno.test(
  "receipt rebinds checksum then verifies server-downloaded bytes before acknowledging",
  async () => {
    let verifiedChecksum = "";
    let acknowledged = false;
    const res = await handleSiteRequestGuest(
      request("receipt", { ...uploadBody, mediaId: MEDIA }),
      deps({
        verifyUpload: (_bucket, _path, checksum) => {
          verifiedChecksum = checksum;
          return Promise.resolve({
            exists: true,
            verified: true,
            sizeBytes: 3,
          });
        },
        acknowledgeUpload: () => {
          acknowledged = true;
          return Promise.resolve({ media_id: MEDIA, upload_state: "received" });
        },
      }),
    );
    assertEquals(res.status, 200);
    assertEquals(verifiedChecksum, CHECKSUM);
    assert(acknowledged);
  },
);

Deno.test(
  "receipt checksum mismatch never acknowledges delivery evidence",
  async () => {
    let acknowledged = false;
    const res = await handleSiteRequestGuest(
      request("receipt", { ...uploadBody, mediaId: MEDIA }),
      deps({
        verifyUpload: () =>
          Promise.resolve({ exists: true, verified: false, sizeBytes: 3 }),
        acknowledgeUpload: () => {
          acknowledged = true;
          return Promise.resolve({});
        },
      }),
    );
    assertEquals(res.status, 409);
    assertFalse(acknowledged);
  },
);

Deno.test(
  "receipt reports not-ready separately when Storage has no object yet",
  async () => {
    let acknowledged = false;
    const res = await handleSiteRequestGuest(
      request("receipt", { ...uploadBody, mediaId: MEDIA }),
      deps({
        verifyUpload: () =>
          Promise.resolve({ exists: false, verified: false, sizeBytes: 0 }),
        acknowledgeUpload: () => {
          acknowledged = true;
          return Promise.resolve({});
        },
      }),
    );
    assertEquals(res.status, 409);
    assertEquals((await res.json()).error, "receipt_not_ready");
    assertFalse(acknowledged);
  },
);

Deno.test(
  "deliver accepts canonical integer millimetres and preserves the client idempotency key",
  async () => {
    let attempt = "";
    const res = await handleSiteRequestGuest(
      request("deliver", {
        itemVersionId: ITEM_VERSION,
        clientAttemptId: ATTEMPT,
        payload: { kit: "K-01" },
        dimensions: [{ label: "A", value_mm: 2438 }],
        capturedAt: "2026-07-17T15:00:00.000Z",
      }),
      deps({
        deliver: (_hash, input) => {
          attempt = input.clientAttemptId;
          return Promise.resolve({
            deliverable_id: DELIVERABLE,
            idempotent: true,
          });
        },
      }),
    );
    assertEquals(res.status, 200);
    assertEquals(attempt, ATTEMPT);
    assertEquals((await res.json()).delivery.idempotent, true);
  },
);

Deno.test("deliver rejects fractional millimetres before the RPC", async () => {
  let called = false;
  const res = await handleSiteRequestGuest(
    request("deliver", {
      itemVersionId: ITEM_VERSION,
      clientAttemptId: ATTEMPT,
      payload: {},
      dimensions: [{ label: "A", value_mm: 25.4 }],
    }),
    deps({
      deliver: () => {
        called = true;
        return Promise.resolve({});
      },
    }),
  );
  assertEquals(res.status, 422);
  assertFalse(called);
});
