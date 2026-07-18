import {
  MemorySiteRequestQueueStore,
  processQueuedDelivery,
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
  payload: { shots: [{ id: "wide", mediaAssetLocalId: "asset" }] },
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
        bucketId: "site-request-media",
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
      lastError: "offline",
      nextRetryAt: "2026-07-17T15:05:01.000Z",
    });
    expect((await store.get(record().id))?.id).toBe(record().id);
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
        bucketId: "site-request-media",
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
        bucketId: "site-request-media",
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
