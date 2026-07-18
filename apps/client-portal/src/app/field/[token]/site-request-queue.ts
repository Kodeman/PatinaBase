import {
  SiteRequestApiError,
  classifySiteRequestFailure,
  requestSiteRequestGuest,
  sha256Blob,
  uploadToSignedIntent,
  type SiteRequestUploadIntent,
} from "./site-request-api";
import type {
  SiteRequestQueueAsset,
  SiteRequestQueuedDelivery,
} from "./site-request-types";

export interface SiteRequestQueueStore {
  put(record: SiteRequestQueuedDelivery): Promise<void>;
  get(id: string): Promise<SiteRequestQueuedDelivery | undefined>;
  list(requestId: string): Promise<SiteRequestQueuedDelivery[]>;
  delete(id: string): Promise<void>;
}

const DB_NAME = "patina-field-site-requests";
const STORE_NAME = "deliveries";

export class IndexedDbSiteRequestQueueStore implements SiteRequestQueueStore {
  private open(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined")
      return Promise.reject(new Error("indexeddb_unavailable"));
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("indexeddb_open_failed"));
    });
  }

  private async request<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = run(transaction.objectStore(STORE_NAME));
      let result: T;
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () =>
        reject(request.error ?? new Error("indexeddb_request_failed"));
      transaction.oncomplete = () => {
        db.close();
        resolve(result);
      };
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("indexeddb_transaction_failed"));
    });
  }

  async put(record: SiteRequestQueuedDelivery): Promise<void> {
    await this.request("readwrite", (store) => store.put(record));
  }

  get(id: string): Promise<SiteRequestQueuedDelivery | undefined> {
    return this.request("readonly", (store) => store.get(id));
  }

  async list(requestId: string): Promise<SiteRequestQueuedDelivery[]> {
    const all = await this.request<SiteRequestQueuedDelivery[]>(
      "readonly",
      (store) => store.getAll(),
    );
    return all
      .filter((record) => record.requestId === requestId)
      .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  }

  async delete(id: string): Promise<void> {
    await this.request("readwrite", (store) => store.delete(id));
  }
}

export class MemorySiteRequestQueueStore implements SiteRequestQueueStore {
  private readonly records = new Map<string, SiteRequestQueuedDelivery>();
  async put(record: SiteRequestQueuedDelivery) {
    this.records.set(record.id, cloneRecord(record));
  }
  async get(id: string) {
    const record = this.records.get(id);
    return record ? cloneRecord(record) : undefined;
  }
  async list(requestId: string) {
    return Array.from(this.records.values())
      .filter((record) => record.requestId === requestId)
      .map(cloneRecord);
  }
  async delete(id: string) {
    this.records.delete(id);
  }
}

function cloneRecord(
  record: SiteRequestQueuedDelivery,
): SiteRequestQueuedDelivery {
  return {
    ...record,
    payload: JSON.parse(JSON.stringify(record.payload)) as Record<
      string,
      unknown
    >,
    dimensions: record.dimensions.map((dimension) => ({ ...dimension })),
    assets: record.assets.map((asset) => ({ ...asset, blob: asset.blob })),
  };
}

export interface SiteRequestQueueDeps {
  request<T>(
    token: string,
    action: "upload-intent" | "receipt" | "deliver",
    body: Record<string, unknown>,
  ): Promise<T>;
  upload(
    intent: SiteRequestUploadIntent,
    blob: Blob,
    filename: string,
  ): Promise<string | undefined>;
  now(): Date;
}

export interface SiteRequestQueueObserver {
  serverReceipt?(record: SiteRequestQueuedDelivery): void;
  delivered?(record: SiteRequestQueuedDelivery): void;
  error?(
    record: SiteRequestQueuedDelivery,
    classification: ReturnType<typeof classifySiteRequestFailure>,
  ): void;
}

const defaultDeps: SiteRequestQueueDeps = {
  request: (token, action, body) =>
    requestSiteRequestGuest(token, action, body),
  upload: (intent, blob, filename) =>
    uploadToSignedIntent(intent, blob, filename),
  now: () => new Date(),
};

async function saveState(
  store: SiteRequestQueueStore,
  record: SiteRequestQueuedDelivery,
  state: SiteRequestQueuedDelivery["state"],
): Promise<void> {
  record.state = state;
  await store.put(record);
}

function uploadBody(
  record: SiteRequestQueuedDelivery,
  asset: SiteRequestQueueAsset,
) {
  return {
    itemVersionId: record.itemVersionId,
    clientAttemptId: record.id,
    filename: asset.filename,
    mimeType: asset.mimeType,
    checksumSha256: asset.checksumSha256,
    sizeBytes: asset.blob.size,
  };
}

function deliveryPayload(
  record: SiteRequestQueuedDelivery,
): Record<string, unknown> {
  const mediaByLocalId = new Map(
    record.assets.map((asset) => [asset.localId, asset.mediaId]),
  );
  const payload = JSON.parse(JSON.stringify(record.payload)) as Record<
    string,
    unknown
  >;
  if (Array.isArray(payload.shots)) {
    payload.shots = payload.shots.map((shot) => {
      if (!shot || typeof shot !== "object" || Array.isArray(shot)) return shot;
      const row = { ...(shot as Record<string, unknown>) };
      if (typeof row.mediaAssetLocalId === "string") {
        row.media_id = mediaByLocalId.get(row.mediaAssetLocalId);
        delete row.mediaAssetLocalId;
      }
      return row;
    });
  }
  return payload;
}

function deliveryDimensions(record: SiteRequestQueuedDelivery) {
  const mediaByLocalId = new Map(
    record.assets.map((asset) => [asset.localId, asset.mediaId]),
  );
  return record.dimensions.map((dimension) => ({
    label: dimension.label,
    value_mm: dimension.value_mm,
    ...(dimension.proofAssetLocalId
      ? { proof_media_id: mediaByLocalId.get(dimension.proofAssetLocalId) }
      : {}),
  }));
}

export async function processQueuedDelivery(
  queued: SiteRequestQueuedDelivery,
  token: string,
  store: SiteRequestQueueStore,
  deps: SiteRequestQueueDeps = defaultDeps,
  observer: SiteRequestQueueObserver = {},
): Promise<SiteRequestQueuedDelivery> {
  const record = cloneRecord(queued);
  if (record.state === "delivered" || record.state === "terminal") return record;

  try {
    for (const asset of record.assets) {
      if (asset.receiptAcknowledged) continue;
      const hadMediaId = !!asset.mediaId;
      await saveState(store, record, "uploading");
      const intent = await deps.request<SiteRequestUploadIntent>(
        token,
        "upload-intent",
        uploadBody(record, asset),
      );
      asset.mediaId = intent.mediaId;
      await store.put(record);

      // A relaunch may happen after Storage accepted bytes but before the
      // browser persisted uploadCompleted. Probe receipt first when an
      // idempotent media binding already exists; this avoids an immutable-path
      // re-upload conflict and honestly resumes at the last server-known step.
      if (hadMediaId && !asset.uploadCompleted) {
        await saveState(store, record, "awaiting-receipt");
        try {
          await deps.request(token, "receipt", {
            ...uploadBody(record, asset),
            mediaId: intent.mediaId,
            storageEtag: asset.storageEtag,
          });
          asset.receiptAcknowledged = true;
          await store.put(record);
          continue;
        } catch (error) {
          if (
            !(
              error instanceof SiteRequestApiError &&
              error.code === "receipt_not_ready"
            )
          )
            throw error;
        }
      }

      if (!asset.uploadCompleted) {
        asset.storageEtag = await deps.upload(
          intent,
          asset.blob,
          asset.filename,
        );
        asset.uploadCompleted = true;
        await store.put(record);
      }
      await saveState(store, record, "awaiting-receipt");
      await deps.request(token, "receipt", {
        ...uploadBody(record, asset),
        mediaId: intent.mediaId,
        storageEtag: asset.storageEtag,
      });
      asset.receiptAcknowledged = true;
      await store.put(record);
    }

    await saveState(store, record, "awaiting-receipt");
    const response = await deps.request<{
      delivery: { delivered_at?: string };
    }>(token, "deliver", {
      itemVersionId: record.itemVersionId,
      clientAttemptId: record.id,
      payload: deliveryPayload(record),
      dimensions: deliveryDimensions(record),
      capturedByName: record.capturedByName,
      capturedAt: record.capturedAt,
    });
    record.deliveredAt =
      response.delivery?.delivered_at ?? deps.now().toISOString();
    observer.serverReceipt?.(cloneRecord(record));
    record.retryCount = 0;
    record.nextRetryAt = undefined;
    record.lastError = undefined;
    // Server receipt + delivery are now authoritative. Release potentially
    // large local photo bodies while retaining the compact delivered record
    // needed for honest UI/relaunch state.
    record.assets = record.assets.map((asset) => ({
      ...asset,
      blob: new Blob([], { type: asset.mimeType }),
    }));
    await saveState(store, record, "delivered");
    observer.delivered?.(cloneRecord(record));
    return record;
  } catch (error) {
    const classification = classifySiteRequestFailure(error);
    record.lastError = classification.safeCode;
    observer.error?.(cloneRecord(record), classification);
    if (!classification.retryable) {
      record.nextRetryAt = undefined;
      record.terminalReason = classification.errorClass;
      await saveState(store, record, "terminal");
      return record;
    }

    record.retryCount += 1;
    const delayMs = Math.min(60_000, 1_000 * 2 ** Math.min(record.retryCount - 1, 6));
    record.nextRetryAt = new Date(deps.now().getTime() + delayMs).toISOString();
    record.terminalReason = undefined;
    await saveState(store, record, "failed");
    return record;
  }
}

export function shouldAutomaticallyRetrySiteRequest(
  record: SiteRequestQueuedDelivery,
): boolean {
  return record.state !== "delivered" && record.state !== "terminal";
}

export async function createQueueAsset(
  file: File,
  localId = crypto.randomUUID(),
): Promise<SiteRequestQueueAsset> {
  return {
    localId,
    blob: file,
    filename: file.name || `${localId}.jpg`,
    mimeType: file.type || "image/jpeg",
    checksumSha256: await sha256Blob(file),
  };
}
