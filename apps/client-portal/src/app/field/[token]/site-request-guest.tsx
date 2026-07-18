"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@patina/design-system";
import {
  IndexedDbSiteRequestQueueStore,
  createQueueAsset,
  processQueuedDelivery,
} from "./site-request-queue";
import {
  dueLabel,
  imperialToMillimetres,
  measureDefinitions,
  metricToMillimetres,
  photoShotDefinitions,
  type SiteRequestBootstrapDTO,
  type SiteRequestItem,
  type SiteRequestQueuedDelivery,
} from "./site-request-types";

interface SiteRequestGuestProps {
  token: string;
  initial: SiteRequestBootstrapDTO;
}

const deliveredStatuses = new Set(["delivered", "approved", "closed"]);

function queueCopy(
  record: SiteRequestQueuedDelivery | undefined,
): string | null {
  if (!record) return null;
  switch (record.state) {
    case "queued":
      return "Saved on this phone · waiting for a connection";
    case "uploading":
      return "Uploading photos…";
    case "awaiting-receipt":
      return "Uploaded · waiting for Patina to confirm receipt";
    case "delivered":
      return "Delivered · received by Patina";
    case "failed":
      return "Could not finish delivery · your capture is still saved";
  }
}

function MeasureCapture({
  dto,
  item,
  onQueue,
  onCancel,
}: {
  dto: SiteRequestBootstrapDTO;
  item: SiteRequestItem;
  onQueue(record: SiteRequestQueuedDelivery): Promise<void>;
  onCancel(): void;
}) {
  const definitions = useMemo(() => measureDefinitions(item), [item]);
  const [unit, setUnit] = useState<"imperial" | "metric">("imperial");
  const [values, setValues] = useState<
    Record<
      string,
      { feet: string; inches: string; sixteenths: string; metric: string }
    >
  >({});
  const [proofs, setProofs] = useState<Record<string, File | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update(
    id: string,
    key: "feet" | "inches" | "sixteenths" | "metric",
    value: string,
  ) {
    setValues((current) => {
      const prior = current[id] ?? {
        feet: "",
        inches: "",
        sixteenths: "0",
        metric: "",
      };
      return { ...current, [id]: { ...prior, [key]: value } };
    });
  }

  async function submit() {
    setError(null);
    setSaving(true);
    try {
      const attemptId = crypto.randomUUID();
      const assets = [];
      const dimensions = [];
      for (const definition of definitions) {
        const value = values[definition.id] ?? {
          feet: "",
          inches: "",
          sixteenths: "0",
          metric: "",
        };
        const valueMm =
          unit === "imperial"
            ? imperialToMillimetres(
                Number(value.feet || 0),
                Number(value.inches || 0),
                Number(value.sixteenths || 0),
              )
            : metricToMillimetres(Number(value.metric), "mm");
        if (valueMm <= 0) throw new Error("missing_measurement");
        const proof = proofs[definition.id];
        const proofAssetLocalId = proof ? crypto.randomUUID() : undefined;
        if (proof && proofAssetLocalId)
          assets.push(await createQueueAsset(proof, proofAssetLocalId));
        dimensions.push({
          label: definition.label,
          value_mm: valueMm,
          proofAssetLocalId,
        });
      }
      await onQueue({
        id: attemptId,
        requestId: dto.request.id,
        itemId: item.id,
        itemVersionId: item.current_version_id,
        kitCode: "K-01",
        state: "queued",
        capturedAt: new Date().toISOString(),
        capturedByName: dto.assignee.display_name,
        payload: {
          kit_code: "K-01",
          display_unit: unit === "imperial" ? "in" : "mm",
        },
        dimensions,
        assets,
        retryCount: 0,
      });
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message === "missing_measurement"
          ? "Enter every measurement before delivering. Your entries have not been lost."
          : "This browser could not save the delivery offline. Keep this page open and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="measure-title" className="space-y-5">
      <div>
        <p className="type-meta">K-01 · Measure set</p>
        <h2 id="measure-title" className="type-page-title mt-1">
          {item.version.title}
        </h2>
        {item.version.room_name && (
          <p className="type-body-small mt-1 text-[var(--text-muted)]">
            {item.version.room_name}
          </p>
        )}
        {typeof item.version.guidance.note === "string" && (
          <p className="type-body mt-3">{item.version.guidance.note}</p>
        )}
      </div>

      <div
        className="flex rounded-full border border-[var(--border-default)] p-1"
        aria-label="Measurement units"
      >
        {(["imperial", "metric"] as const).map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => setUnit(choice)}
            className={`min-h-[44px] flex-1 rounded-full px-3 text-sm ${unit === choice ? "bg-[var(--color-pearl)]" : ""}`}
          >
            {choice === "imperial" ? "Feet · inches" : "Millimetres"}
          </button>
        ))}
      </div>

      {definitions.map((definition) => (
        <fieldset
          key={definition.id}
          className="rounded-xl border border-[var(--border-default)] p-4"
        >
          <legend className="type-item-name px-1">{definition.label}</legend>
          {definition.guidance && (
            <p className="type-body-small mb-3 text-[var(--text-muted)]">
              {definition.guidance}
            </p>
          )}
          {unit === "imperial" ? (
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs">
                Feet
                <input
                  aria-label={`${definition.label} feet`}
                  inputMode="numeric"
                  type="number"
                  min="0"
                  value={values[definition.id]?.feet ?? ""}
                  onChange={(event) =>
                    update(definition.id, "feet", event.target.value)
                  }
                  className="mt-1 min-h-[44px] w-full rounded-lg border px-2 text-base"
                />
              </label>
              <label className="text-xs">
                Inches
                <input
                  aria-label={`${definition.label} inches`}
                  inputMode="numeric"
                  type="number"
                  min="0"
                  max="11.999"
                  step="0.0625"
                  value={values[definition.id]?.inches ?? ""}
                  onChange={(event) =>
                    update(definition.id, "inches", event.target.value)
                  }
                  className="mt-1 min-h-[44px] w-full rounded-lg border px-2 text-base"
                />
              </label>
              <label className="text-xs">
                Fraction
                <select
                  aria-label={`${definition.label} fraction`}
                  value={values[definition.id]?.sixteenths ?? "0"}
                  onChange={(event) =>
                    update(definition.id, "sixteenths", event.target.value)
                  }
                  className="mt-1 min-h-[44px] w-full rounded-lg border px-2 text-base"
                >
                  {Array.from({ length: 16 }, (_, value) => (
                    <option key={value} value={value}>
                      {value === 0 ? "—" : `${value}/16`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <label className="type-body-small">
              Millimetres
              <input
                aria-label={`${definition.label} millimetres`}
                inputMode="decimal"
                type="number"
                min="1"
                step="1"
                value={values[definition.id]?.metric ?? ""}
                onChange={(event) =>
                  update(definition.id, "metric", event.target.value)
                }
                className="mt-1 min-h-[44px] w-full rounded-lg border px-3 text-base"
              />
            </label>
          )}
          <label className="type-body-small mt-4 block text-[var(--text-muted)]">
            Proof photo (optional · keep the tape in frame)
            <input
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
              capture="environment"
              onChange={(event) =>
                setProofs((current) => ({
                  ...current,
                  [definition.id]: event.target.files?.[0],
                }))
              }
              className="mt-2 block w-full text-sm"
            />
          </label>
        </fieldset>
      ))}
      {error && (
        <p
          role="alert"
          className="type-body-small text-[var(--color-terracotta)]"
        >
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" size="lg" disabled={saving} onClick={submit}>
          {saving ? "Saving…" : "Deliver measurements"}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="ghost"
          disabled={saving}
          onClick={onCancel}
        >
          Back
        </Button>
      </div>
    </section>
  );
}

function PhotoCapture({
  dto,
  item,
  onQueue,
  onCancel,
}: {
  dto: SiteRequestBootstrapDTO;
  item: SiteRequestItem;
  onQueue(record: SiteRequestQueuedDelivery): Promise<void>;
  onCancel(): void;
}) {
  const shots = useMemo(() => photoShotDefinitions(item), [item]);
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [skipNotes, setSkipNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    setSaving(true);
    try {
      const assets = [];
      const payloadShots = [];
      for (const shot of shots) {
        const file = files[shot.id];
        const skipNote = skipNotes[shot.id]?.trim();
        if (!file && !skipNote) throw new Error("shot_incomplete");
        if (file) {
          const localId = crypto.randomUUID();
          assets.push(await createQueueAsset(file, localId));
          payloadShots.push({
            id: shot.id,
            label: shot.label,
            status: "captured",
            mediaAssetLocalId: localId,
          });
        } else {
          payloadShots.push({
            id: shot.id,
            label: shot.label,
            status: "skipped",
            skip_note: skipNote,
          });
        }
      }
      await onQueue({
        id: crypto.randomUUID(),
        requestId: dto.request.id,
        itemId: item.id,
        itemVersionId: item.current_version_id,
        kitCode: "K-02",
        state: "queued",
        capturedAt: new Date().toISOString(),
        capturedByName: dto.assignee.display_name,
        payload: { kit_code: "K-02", shots: payloadShots },
        dimensions: [],
        assets,
        retryCount: 0,
      });
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message === "shot_incomplete"
          ? "Add each requested photo, or record why that shot had to be skipped."
          : "This browser could not save the delivery offline. Keep this page open and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="photo-title" className="space-y-5">
      <div>
        <p className="type-meta">K-02 · Detail photos</p>
        <h2 id="photo-title" className="type-page-title mt-1">
          {item.version.title}
        </h2>
        {item.version.room_name && (
          <p className="type-body-small mt-1 text-[var(--text-muted)]">
            {item.version.room_name}
          </p>
        )}
      </div>
      <p className="type-body-small rounded-lg bg-[var(--color-pearl)] p-3">
        Low light? Turn on a work lamp and steady the phone before each shot.
      </p>
      {shots.map((shot, index) => (
        <fieldset
          key={shot.id}
          className="rounded-xl border border-[var(--border-default)] p-4"
        >
          <legend className="type-item-name px-1">
            Shot {index + 1} of {shots.length} · {shot.label}
          </legend>
          {shot.guidance && (
            <p className="type-body-small mb-3 text-[var(--text-muted)]">
              {shot.guidance}
            </p>
          )}
          {shot.referenceUrl && (
            <div className="mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shot.referenceUrl}
                referrerPolicy="no-referrer"
                alt={`Reference framing for ${shot.label}`}
                className="max-h-48 w-full rounded-lg border object-contain"
              />
              <p className="type-meta mt-1">Match this framing</p>
            </div>
          )}
          <label className="type-body-small block rounded-lg border border-dashed border-[var(--accent-primary)] p-4 text-center">
            <span className="mb-2 block">
              Keep the subject inside the guide
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
              capture="environment"
              onChange={(event) =>
                setFiles((current) => ({
                  ...current,
                  [shot.id]: event.target.files?.[0],
                }))
              }
              className="block w-full text-sm"
            />
          </label>
          <label className="type-body-small mt-3 block text-[var(--text-muted)]">
            If you must skip, say why
            <input
              value={skipNotes[shot.id] ?? ""}
              onChange={(event) =>
                setSkipNotes((current) => ({
                  ...current,
                  [shot.id]: event.target.value,
                }))
              }
              placeholder="e.g. room is locked"
              className="mt-1 min-h-[44px] w-full rounded-lg border px-3 text-base"
            />
          </label>
        </fieldset>
      ))}
      {error && (
        <p
          role="alert"
          className="type-body-small text-[var(--color-terracotta)]"
        >
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" size="lg" disabled={saving} onClick={submit}>
          {saving ? "Saving…" : "Deliver photos"}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="ghost"
          disabled={saving}
          onClick={onCancel}
        >
          Back
        </Button>
      </div>
    </section>
  );
}

export function SiteRequestGuest({ token, initial }: SiteRequestGuestProps) {
  const store = useMemo(() => new IndexedDbSiteRequestQueueStore(), []);
  const processing = useRef(new Set<string>());
  const [opened, setOpened] = useState(false);
  const [activeItem, setActiveItem] = useState<SiteRequestItem | null>(null);
  const [records, setRecords] = useState<SiteRequestQueuedDelivery[]>([]);
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [queueError, setQueueError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRecords(await store.list(initial.request.id));
    } catch {
      setQueueError(
        "This browser could not open offline storage. Keep this page open and try again.",
      );
    }
  }, [initial.request.id, store]);

  const run = useCallback(
    async (record: SiteRequestQueuedDelivery) => {
      if (processing.current.has(record.id)) return;
      processing.current.add(record.id);
      try {
        const observedStore = {
          put: async (value: SiteRequestQueuedDelivery) => {
            await store.put(value);
            setRecords((current) => [
              ...current.filter((candidate) => candidate.id !== value.id),
              value,
            ]);
          },
          get: (id: string) => store.get(id),
          list: (requestId: string) => store.list(requestId),
          delete: (id: string) => store.delete(id),
        };
        const result = await processQueuedDelivery(
          record,
          token,
          observedStore,
        );
        setRecords((current) => [
          ...current.filter((candidate) => candidate.id !== result.id),
          result,
        ]);
      } finally {
        processing.current.delete(record.id);
      }
    },
    [store, token],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (!online) return;
    const ready = records.filter(
      (record) =>
        record.state !== "delivered" &&
        (!record.nextRetryAt || Date.parse(record.nextRetryAt) <= Date.now()),
    );
    ready.forEach((record) => {
      void run(record);
    });
    const future = records
      .map((record) =>
        record.nextRetryAt ? Date.parse(record.nextRetryAt) : NaN,
      )
      .filter((time) => Number.isFinite(time) && time > Date.now());
    if (!future.length) return;
    const timer = window.setTimeout(
      () => setRecords((current) => [...current]),
      Math.min(...future) - Date.now(),
    );
    return () => window.clearTimeout(timer);
  }, [online, records, run]);

  async function queue(record: SiteRequestQueuedDelivery) {
    await store.put(record);
    setRecords((current) => [
      ...current.filter((candidate) => candidate.id !== record.id),
      record,
    ]);
    setActiveItem(null);
    setOpened(true);
    if (online) void run(record);
  }

  if (!opened) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-10">
        <p className="type-meta">Patina · Site Request</p>
        <h1 className="type-page-title mt-2">
          {initial.request.designer_name} is asking for {initial.items.length}{" "}
          site item{initial.items.length === 1 ? "" : "s"}.
        </h1>
        <p className="type-body mt-3">
          {initial.request.site_name} ·{" "}
          {dueLabel(initial.request.due_at, initial.request.due_context)}
        </p>
        <p className="type-body-small mt-6 text-[var(--text-muted)]">
          You’ll see this request only. No account or installation is needed.
        </p>
        <Button
          type="button"
          size="lg"
          className="mt-8 min-h-[48px] w-full"
          onClick={() => setOpened(true)}
        >
          Open checklist
        </Button>
      </main>
    );
  }

  if (activeItem?.version.kit_code === "K-01") {
    return (
      <main className="mx-auto min-h-screen max-w-lg px-4 py-8 sm:px-6">
        <MeasureCapture
          dto={initial}
          item={activeItem}
          onQueue={queue}
          onCancel={() => setActiveItem(null)}
        />
      </main>
    );
  }
  if (activeItem?.version.kit_code === "K-02") {
    return (
      <main className="mx-auto min-h-screen max-w-lg px-4 py-8 sm:px-6">
        <PhotoCapture
          dto={initial}
          item={activeItem}
          onQueue={queue}
          onCancel={() => setActiveItem(null)}
        />
      </main>
    );
  }

  const byItem = new Map(records.map((record) => [record.itemId, record]));
  const deliveredCount = initial.items.filter(
    (item) =>
      deliveredStatuses.has(item.status) ||
      byItem.get(item.id)?.state === "delivered",
  ).length;
  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-8 sm:px-6">
      <header className="mb-7">
        <div className="flex items-center justify-between">
          <p className="type-meta">Patina · Site Request</p>
          <span className="type-meta rounded-full bg-[var(--color-pearl)] px-2 py-1">
            Guest
          </span>
        </div>
        <h1 className="type-page-title mt-2">{initial.request.site_name}</h1>
        <p className="type-body-small mt-1 text-[var(--text-muted)]">
          From {initial.request.designer_name}
          {initial.request.studio_name
            ? ` · ${initial.request.studio_name}`
            : ""}{" "}
          · {dueLabel(initial.request.due_at, initial.request.due_context)}
        </p>
        <p className="type-body mt-4">
          {deliveredCount} of {initial.items.length} delivered
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border-subtle)]">
          <div
            className="h-full bg-[var(--accent-primary)]"
            style={{
              width: `${initial.items.length ? (deliveredCount / initial.items.length) * 100 : 0}%`,
            }}
          />
        </div>
      </header>
      {!online && (
        <p
          role="status"
          className="type-body-small mb-4 rounded-lg bg-[var(--color-pearl)] p-3"
        >
          Offline · captures stay on this phone and upload when signal returns.
        </p>
      )}
      {queueError && (
        <p
          role="alert"
          className="type-body-small mb-4 text-[var(--color-terracotta)]"
        >
          {queueError}
        </p>
      )}
      <ol className="space-y-3">
        {initial.items.map((item) => {
          const queuedForItem = byItem.get(item.id);
          // A designer redo is authoritative even if this browser remembers
          // the earlier acknowledged attempt. Keep that history in IndexedDB,
          // but do not let it mask the server-reopened item.
          const isRedo = item.status === "redo" || item.status === "returned";
          const local =
            isRedo && queuedForItem?.state === "delivered"
              ? undefined
              : queuedForItem;
          const delivered =
            deliveredStatuses.has(item.status) || local?.state === "delivered";
          return (
            <li
              key={item.id}
              className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4"
            >
              <div className="flex gap-3">
                <span
                  aria-hidden="true"
                  className={`mt-1 h-2.5 w-2.5 rounded-full ${delivered ? "bg-[var(--accent-primary)]" : "border border-[var(--border-default)]"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="type-item-name">{item.version.title}</p>
                  <p className="type-body-small text-[var(--text-muted)]">
                    {item.version.kit_code === "K-01"
                      ? "Measure set"
                      : "Detail photos"}
                    {item.version.room_name
                      ? ` · ${item.version.room_name}`
                      : ""}
                  </p>
                  {item.redo_note && (
                    <p className="type-body-small mt-2 border-l-2 border-[var(--color-terracotta)] pl-2">
                      Returned: “{item.redo_note}”
                    </p>
                  )}
                  {queueCopy(local) && (
                    <p className="type-body-small mt-2 text-[var(--accent-primary)]">
                      {queueCopy(local)}
                    </p>
                  )}
                </div>
              </div>
              {!delivered && !local && (
                <Button
                  type="button"
                  size="sm"
                  className="mt-3 min-h-[44px] w-full"
                  onClick={() => setActiveItem(item)}
                >
                  Start {item.version.kit_code}
                </Button>
              )}
              {local?.state === "failed" && (
                <Button
                  type="button"
                  size="sm"
                  className="mt-3 min-h-[44px] w-full"
                  onClick={() => void run(local)}
                >
                  Try delivery again
                </Button>
              )}
            </li>
          );
        })}
      </ol>
      {deliveredCount === initial.items.length && initial.items.length > 0 && (
        <section className="mt-8 text-center">
          <p className="text-4xl" aria-hidden="true">
            ✓
          </p>
          <h2 className="type-page-title mt-2">All delivered</h2>
          <p className="type-body-small mt-2 text-[var(--text-muted)]">
            {initial.request.designer_name} has been notified. This link stays
            available for any requested redo.
          </p>
        </section>
      )}
    </main>
  );
}
