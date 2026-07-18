import {
  SiteRequestApiError,
  bootstrapSiteRequest,
  classifySiteRequestFailure,
  requestSiteRequestGuest,
  uploadToSignedIntent,
} from "../site-request-api";

const options = { baseUrl: "https://supabase.test/", anonKey: "anon-test" };

function response(
  body: Record<string, unknown>,
  status = 200,
  headers: Record<string, string> = {},
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as Response;
}

describe("site request guest API", () => {
  it("uses the opaque token only as the Bearer credential and routes explicit actions", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(response({ request: { items: [] } }));
    await bootstrapSiteRequest("opaque_site_request_token_1234567890abcd", {
      ...options,
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://supabase.test/functions/v1/site-request-guest/bootstrap",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        headers: expect.objectContaining({
          apikey: "anon-test",
          Authorization: "Bearer opaque_site_request_token_1234567890abcd",
        }),
      }),
    );
    expect(fetchImpl.mock.calls[0][1].body).toBe("{}");
  });

  it("collapses unauthorized/expired bootstrap responses to a null context", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(response({ error: "invalid_or_expired_link" }, 404));
    await expect(
      bootstrapSiteRequest("a".repeat(64), { ...options, fetchImpl }),
    ).resolves.toBeNull();
  });

  it("preserves directive API conflicts for the durable queue", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(response({ error: "receipt_not_ready" }, 409));
    await expect(
      requestSiteRequestGuest(
        "a".repeat(64),
        "receipt",
        {},
        { ...options, fetchImpl },
      ),
    ).rejects.toEqual(new SiteRequestApiError(409, "receipt_not_ready"));
  });

  it("classifies ended access and immutable conflicts as terminal", () => {
    expect(
      classifySiteRequestFailure(
        new SiteRequestApiError(404, "invalid_or_expired_link"),
      ),
    ).toEqual({
      retryable: false,
      errorClass: "access-ended",
      safeCode: "access_ended",
    });
    expect(
      classifySiteRequestFailure(
        new SiteRequestApiError(409, "receipt_checksum_mismatch"),
      ),
    ).toEqual({
      retryable: false,
      errorClass: "capture-invalid",
      safeCode: "capture_invalid",
    });
    expect(
      classifySiteRequestFailure(new SiteRequestApiError(409, "request_conflict")),
    ).toEqual({
      retryable: false,
      errorClass: "request-changed",
      safeCode: "request_changed",
    });
  });

  it("keeps network, receipt propagation, and unexpected dependency failures retryable", () => {
    expect(classifySiteRequestFailure(new Error("offline"))).toMatchObject({
      retryable: true,
      errorClass: "transient",
    });
    expect(
      classifySiteRequestFailure(
        new SiteRequestApiError(409, "receipt_not_ready"),
      ),
    ).toMatchObject({ retryable: true, errorClass: "transient" });
    expect(
      classifySiteRequestFailure(
        new SiteRequestApiError(503, "temporary_service_unavailable"),
      ),
    ).toMatchObject({ retryable: true, errorClass: "transient" });
    expect(
      classifySiteRequestFailure(
        new SiteRequestApiError(502, "invalid_upload_path"),
      ),
    ).toMatchObject({ retryable: true, errorClass: "transient" });
    expect(
      classifySiteRequestFailure(
        new SiteRequestApiError(403, "signed_upload_failed"),
      ),
    ).toMatchObject({ retryable: true, errorClass: "transient" });
  });

  it("uploads a Blob only to the server-minted signed URL without upsert", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(response({}, 200, { etag: "storage-etag" }));
    await expect(
      uploadToSignedIntent(
        {
          mediaId: "media",
          deliverableId: "delivery",
          bucketId: "site-requests",
          objectPath: "immutable.jpg",
          uploadUrl: "https://storage.test/signed",
          uploadToken: "signed",
        },
        new Blob(["abc"], { type: "image/jpeg" }),
        "proof.jpg",
        fetchImpl,
      ),
    ).resolves.toBe("storage-etag");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://storage.test/signed",
      expect.objectContaining({
        method: "PUT",
        headers: { "x-upsert": "false" },
        body: expect.any(FormData),
      }),
    );
  });
});
