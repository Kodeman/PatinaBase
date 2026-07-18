import {
  MemorySiteRequestQueueStore,
  processQueuedDelivery,
  shouldAutomaticallyRetrySiteRequest,
  type SiteRequestQueueDeps,
} from "../site-request-queue";
import { SiteRequestApiError } from "../site-request-api";
import type { SiteRequestQueuedDelivery } from "../site-request-types";

const record = (): SiteRequestQueuedDelivery => ({
  id: "22222222-2222-4222-8222-222222222222",
  requestId: "request",
  itemId: "item",
  itemVersionId: "11111111-1111-4111-8111-111111111111",
  kitCode: "K-02",
  state: "queued",
  capturedAt: "2026-07-17T15:00:00.000Z",
  retryCount: 0,
  dimensions: [],
  payload: {
    shots: [
      {
        id: "wide",
        label: "Wide context",
        status: "captured",
        mediaAssetLocalId: "asset",
      },
    ],
  },
  assets: [
    {
      localId: "asset",
      blob: new Blob(["abc"], { type: "image/jpeg" }),
      filename: "wide.jpg",
      mimeType: "image/jpeg",
      checksumSha256: "a".repeat(64),
    },
  ],
});

function deps(request: jest.Mock): SiteRequestQueueDeps {
  return {
    request,
    upload: jest.fn().mockResolvedValue("etag"),
    now: () => new Date("2026-07-17T15:05:00.000Z"),
  };
}

describe("durable site request queue", () => {
  it("retains Blob payloads and explicit queue state in the store", async () => {
    const store = new MemorySiteRequestQueueStore();
    await store.put(record());
    const restored = await store.get(record().id);
    expect(restored?.assets[0].blob.size).toBe(3);
    expect(restored?.assets[0].blob.type).toBe("image/jpeg");
    expect(restored?.state).toBe("queued");
  });

  it("does not claim delivered until signed upload, server receipt, and delivery acknowledgement finish", async () => {
    const states: string[] = [];
    const store = new MemorySiteRequestQueueStore();
    const originalPut = store.put.bind(store);
    store.put = async (value) => {
      states.push(value.state);
      await originalPut(value);
    };
    const request = jest
      .fn()
      .mockResolvedValueOnce({
        mediaId: "33333333-3333-4333-8333-333333333333",
        uploadUrl: "signed",
        uploadToken: "token",
        objectPath: "path",
        bucketId: "site-requests",
        deliverableId: "delivery",
      })
      .mockResolvedValueOnce({ receipt: { upload_state: "received" } })
      .mockResolvedValueOnce({
        delivery: { delivered_at: "2026-07-17T15:04:00.000Z" },
      });
    const result = await processQueuedDelivery(
      record(),
      "opaque-token",
      store,
      deps(request),
    );
    expect(result.state).toBe("delivered");
    expect(states).toContain("uploading");
    expect(states).toContain("awaiting-receipt");
    expect(states.at(-1)).toBe("delivered");
    expect(request.mock.calls[2][2].payload.shots[0]).toEqual({
      id: "wide",
      label: "Wide context",
      status: "captured",
      media_id: "33333333-3333-4333-8333-333333333333",
    });
  });

  it("persists a directive failed state and exponential retry time with the same idempotency key", async () => {
    const store = new MemorySiteRequestQueueStore();
    const request = jest.fn().mockRejectedValue(new Error("offline"));
    const result = await processQueuedDelivery(
      record(),
      "opaque-token",
      store,
      deps(request),
    );
    expect(result).toMatchObject({
      state: "failed",
      retryCount: 1,
      lastError: "network",
      nextRetryAt: "2026-07-17T15:05:01.000Z",
    });
    expect((await store.get(record().id))?.id).toBe(record().id);
  });

  it("keeps an unexpected guest dependency outage in retriable IndexedDB state", async () => {
    const store = new MemorySiteRequestQueueStore();
    const request = jest.fn().mockRejectedValue(
      new SiteRequestApiError(503, "temporary_service_unavailable"),
    );
    const result = await processQueuedDelivery(
      record(),
      "opaque-token",
      store,
      deps(request),
    );
    expect(result).toMatchObject({
      state: "failed",
      retryCount: 1,
      lastError: "temporary_delivery_failure",
      nextRetryAt: "2026-07-17T15:05:01.000Z",
    });
    expect(shouldAutomaticallyRetrySiteRequest(result)).toBe(true);
    expect(await store.get(record().id)).toMatchObject({
      state: "failed",
      terminalReason: undefined,
    });
  });

  it("persists ended access as terminal and never schedules or repeats it", async () => {
    const store = new MemorySiteRequestQueueStore();
    const request = jest
      .fn()
      .mockRejectedValue(new SiteRequestApiError(404, "invalid_or_expired_link"));
    const first = await processQueuedDelivery(
      record(),
      "opaque-token",
      store,
      deps(request),
    );
    expect(first).toMatchObject({
      state: "terminal",
      terminalReason: "access-ended",
      lastError: "access_ended",
    });
    expect(first.nextRetryAt).toBeUndefined();
    expect(shouldAutomaticallyRetrySiteRequest(first)).toBe(false);

    const second = await processQueuedDelivery(
      first,
      "opaque-token",
      store,
      deps(request),
    );
    expect(second.state).toBe("terminal");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("stops automatic retry for immutable checksum and request-version conflicts", async () => {
    for (const [code, terminalReason] of [
      ["receipt_checksum_mismatch", "capture-invalid"],
      ["request_conflict", "request-changed"],
    ] as const) {
      const store = new MemorySiteRequestQueueStore();
      const request = jest.fn().mockRejectedValue(new SiteRequestApiError(409, code));
      const result = await processQueuedDelivery(
        record(),
        "opaque-token",
        store,
        deps(request),
      );
      expect(result).toMatchObject({ state: "terminal", terminalReason });
      expect(result.nextRetryAt).toBeUndefined();
      expect(shouldAutomaticallyRetrySiteRequest(result)).toBe(false);
    }
  });

  it("reports server receipt and local delivery only after acknowledgement", async () => {
    const store = new MemorySiteRequestQueueStore();
    const observed: string[] = [];
    const request = jest
      .fn()
      .mockResolvedValueOnce({
        mediaId: "33333333-3333-4333-8333-333333333333",
        uploadUrl: "signed",
        uploadToken: "token",
        objectPath: "path",
        bucketId: "site-requests",
        deliverableId: "delivery",
      })
      .mockResolvedValueOnce({ receipt: { upload_state: "received" } })
      .mockResolvedValueOnce({
        delivery: { delivered_at: "2026-07-17T15:04:00.000Z" },
      });
    const result = await processQueuedDelivery(
      record(),
      "opaque-token",
      store,
      deps(request),
      {
        serverReceipt: () => observed.push("server-receipt"),
        delivered: () => observed.push("delivered"),
      },
    );
    expect(result.state).toBe("delivered");
    expect(observed).toEqual(["server-receipt", "delivered"]);
  });

  it("delivers K-01 dimensions with the exact configured labels", async () => {
    const store = new MemorySiteRequestQueueStore();
    const measurement = record();
    measurement.kitCode = "K-01";
    measurement.payload = { kit_code: "K-01", display_unit: "in" };
    measurement.assets = [];
    measurement.dimensions = [
      { label: "A · Floor to sill", value_mm: 914 },
      { label: "B · Sill to head", value_mm: 1219 },
    ];
    const request = jest.fn().mockResolvedValue({
      delivery: { delivered_at: "2026-07-17T15:04:00.000Z" },
    });

    const result = await processQueuedDelivery(
      measurement,
      "opaque-token",
      store,
      deps(request),
    );

    expect(result.state).toBe("delivered");
    expect(request).toHaveBeenCalledWith(
      "opaque-token",
      "deliver",
      expect.objectContaining({
        dimensions: [
          { label: "A · Floor to sill", value_mm: 914 },
          { label: "B · Sill to head", value_mm: 1219 },
        ],
      }),
    );
  });

  it("recovers a relaunch after Storage accepted bytes without re-uploading the immutable path", async () => {
    const store = new MemorySiteRequestQueueStore();
    const interrupted = record();
    interrupted.state = "uploading";
    interrupted.assets[0].mediaId = "33333333-3333-4333-8333-333333333333";
    const request = jest
      .fn()
      .mockResolvedValueOnce({
        mediaId: interrupted.assets[0].mediaId,
        uploadUrl: "signed",
        uploadToken: "token",
        objectPath: "path",
        bucketId: "site-requests",
        deliverableId: "delivery",
      })
      .mockResolvedValueOnce({ receipt: { upload_state: "received" } })
      .mockResolvedValueOnce({
        delivery: { delivered_at: "2026-07-17T15:04:00.000Z" },
      });
    const queueDeps = deps(request);
    const result = await processQueuedDelivery(
      interrupted,
      "opaque-token",
      store,
      queueDeps,
    );
    expect(result.state).toBe("delivered");
    expect(queueDeps.upload).not.toHaveBeenCalled();
  });

  it("uploads after a resumed receipt probe proves the object never reached Storage", async () => {
    const store = new MemorySiteRequestQueueStore();
    const interrupted = record();
    interrupted.state = "uploading";
    interrupted.assets[0].mediaId = "33333333-3333-4333-8333-333333333333";
    const request = jest
      .fn()
      .mockResolvedValueOnce({
        mediaId: interrupted.assets[0].mediaId,
        uploadUrl: "signed",
        uploadToken: "token",
        objectPath: "path",
        bucketId: "site-requests",
        deliverableId: "delivery",
      })
      .mockRejectedValueOnce(new SiteRequestApiError(409, "receipt_not_ready"))
      .mockResolvedValueOnce({ receipt: { upload_state: "received" } })
      .mockResolvedValueOnce({
        delivery: { delivered_at: "2026-07-17T15:04:00.000Z" },
      });
    const queueDeps = deps(request);
    const result = await processQueuedDelivery(
      interrupted,
      "opaque-token",
      store,
      queueDeps,
    );
    expect(result.state).toBe("delivered");
    expect(queueDeps.upload).toHaveBeenCalledTimes(1);
  });
});
