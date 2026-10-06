"use client";

/**
 * C-13 · Studio locations — the places a studio's goods go: its receiving
 * warehouse (one marked the default receiver), its studio, workrooms,
 * storage, and a job site when that is the right call. On a company card
 * the list is that firm's locations and a new one hangs off the card; in the
 * studio account settings it is every location the studio keeps.
 *
 * The Order Assistant's ship-to lists these first (receivers ahead of the
 * rest); the default receiver is marked there, never preselected (R-PB3).
 * Writes go through upsert_studio_location / archive_studio_location (00697).
 */

import { useState } from "react";
import {
  useArchiveStudioLocation,
  useStudioLocations,
  useUpsertStudioLocation,
  type StudioLocationAddress,
  type StudioLocationKind,
  type StudioLocationRequest,
  type StudioLocationRow,
} from "@patina/supabase";
import { formatStudioAddress } from "@/components/portal/procurement/order-assistant/ship-to-choice";
import { DocumentAction } from "../document-action";

export const LOCATION_KINDS: ReadonlyArray<{ value: StudioLocationKind; label: string }> = [
  { value: "receiver", label: "Receiver" },
  { value: "studio", label: "Studio" },
  { value: "workroom", label: "Workroom" },
  { value: "storage", label: "Storage" },
  { value: "site", label: "Site" },
];

const KIND_WORD = Object.fromEntries(LOCATION_KINDS.map((k) => [k.value, k.label])) as Record<
  string,
  string
>;

export const NO_LOCATIONS_SENTENCE = "No locations on file.";

type TriState = "" | "yes" | "no";

export interface LocationForm {
  kind: StudioLocationKind;
  label: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  /** Kept from the row; there is no input for it. */
  country: string;
  receivingHours: string;
  dock: TriState;
  liftgate: TriState;
  storageFreeDays: string;
  storageRate: string;
  receivingFee: string;
  instructions: string;
  isDefaultReceiver: boolean;
}

export const EMPTY_LOCATION_FORM: LocationForm = {
  kind: "receiver",
  label: "",
  street: "",
  city: "",
  state: "",
  zip: "",
  country: "",
  receivingHours: "",
  dock: "",
  liftgate: "",
  storageFreeDays: "",
  storageRate: "",
  receivingFee: "",
  instructions: "",
  isDefaultReceiver: false,
};

const tri = (v: boolean | null): TriState => (v == null ? "" : v ? "yes" : "no");
const fromTri = (v: TriState): boolean | null => (v === "" ? null : v === "yes");
const cents = (v: number | null) => (v == null ? "" : (v / 100).toFixed(2));

export function locationFormFromRow(row: StudioLocationRow): LocationForm {
  const a = (row.address ?? {}) as StudioLocationAddress;
  return {
    kind: row.kind as StudioLocationKind,
    label: row.label,
    street: a.street ?? "",
    city: a.city ?? "",
    state: a.state ?? "",
    zip: a.zip ?? "",
    country: a.country ?? "",
    receivingHours: row.receiving_hours ?? "",
    dock: tri(row.has_dock),
    liftgate: tri(row.needs_liftgate),
    storageFreeDays: row.storage_free_days == null ? "" : String(row.storage_free_days),
    storageRate: cents(row.storage_rate_cents_month),
    receivingFee: cents(row.receiving_fee_cents_piece),
    instructions: row.instructions ?? "",
    isDefaultReceiver: row.is_default_receiver,
  };
}

function parseDollars(input: string, what: string): number | null {
  const v = input.trim().replace(/^\$/, "");
  if (!v) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(v)) throw new Error(`${what} is not an amount.`);
  return Math.round(Number(v) * 100);
}

/**
 * The upsert_studio_location request a form makes, every column present so
 * an edit writes what the form shows. Throws with the words to show when the
 * form cannot be saved.
 */
export function locationRequestFromForm(form: LocationForm): StudioLocationRequest {
  const label = form.label.trim();
  if (!label) throw new Error("Give the location a name.");
  const freeDays = form.storageFreeDays.trim();
  if (freeDays && !/^\d+$/.test(freeDays)) throw new Error("Free storage days is not a number.");

  const address: StudioLocationAddress = {};
  for (const key of ["street", "city", "state", "zip", "country"] as const) {
    const v = form[key].trim();
    if (v) address[key] = v;
  }

  return {
    kind: form.kind,
    label,
    address: Object.keys(address).length ? address : null,
    receivingHours: form.receivingHours.trim() || null,
    hasDock: fromTri(form.dock),
    needsLiftgate: fromTri(form.liftgate),
    storageFreeDays: freeDays ? Number(freeDays) : null,
    storageRateCentsMonth: parseDollars(form.storageRate, "Storage rate"),
    receivingFeeCentsPiece: parseDollars(form.receivingFee, "Receiving fee"),
    instructions: form.instructions.trim() || null,
    isDefaultReceiver: form.isDefaultReceiver,
  };
}

/** The facts line: hours, dock, liftgate, storage terms, receiving fee. */
export function locationFacts(row: StudioLocationRow): string[] {
  const facts: string[] = [];
  if (row.receiving_hours) facts.push(`Receives ${row.receiving_hours}`);
  if (row.has_dock != null) facts.push(row.has_dock ? "Dock" : "No dock");
  if (row.needs_liftgate != null)
    facts.push(row.needs_liftgate ? "Needs a liftgate" : "No liftgate needed");
  if (row.storage_free_days != null) facts.push(`${row.storage_free_days} days free storage`);
  if (row.storage_rate_cents_month != null)
    facts.push(`then $${cents(row.storage_rate_cents_month)} a month`);
  if (row.receiving_fee_cents_piece != null)
    facts.push(`$${cents(row.receiving_fee_cents_piece)} a piece to receive`);
  return facts;
}

const FIELD_LABEL = "t-head mb-1 block text-[var(--ink-subtle)]";
const FIELD_INPUT =
  "w-full rounded-[2px] border border-[var(--hairline-strong)] border-b-[var(--ink-faint)] bg-[var(--paper-doc)] p-2 text-[16px] leading-[1.45] text-[var(--ink)]";

function LocationFormFields({
  idBase,
  initial,
  saving,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  idBase: string;
  initial: LocationForm;
  saving: boolean;
  submitLabel: string;
  onSubmit: (request: StudioLocationRequest) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<LocationForm>(initial);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof LocationForm>(key: K, value: LocationForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    let request: StudioLocationRequest;
    try {
      request = locationRequestFromForm(form);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setError(null);
    try {
      await onSubmit(request);
    } catch (e) {
      setError((e as Error).message || "The location could not be saved.");
    }
  };

  const text = (key: keyof LocationForm, label: string, extra?: { inputMode?: "numeric" | "decimal"; placeholder?: string }) => (
    <div className="mb-3">
      <label className={FIELD_LABEL} htmlFor={`${idBase}-${key}`}>
        {label}
      </label>
      <input
        id={`${idBase}-${key}`}
        type="text"
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value as never)}
        className={FIELD_INPUT}
        {...extra}
      />
    </div>
  );

  const triSelect = (key: "dock" | "liftgate", label: string, yes: string, no: string) => (
    <div className="mb-3">
      <label className={FIELD_LABEL} htmlFor={`${idBase}-${key}`}>
        {label}
      </label>
      <select
        id={`${idBase}-${key}`}
        value={form[key]}
        onChange={(e) => set(key, e.target.value as TriState)}
        className={FIELD_INPUT}
      >
        <option value="">Not recorded</option>
        <option value="yes">{yes}</option>
        <option value="no">{no}</option>
      </select>
    </div>
  );

  return (
    <fieldset disabled={saving} className="mt-2">
      <div className="mb-3">
        <label className={FIELD_LABEL} htmlFor={`${idBase}-kind`}>
          Kind
        </label>
        <select
          id={`${idBase}-kind`}
          value={form.kind}
          onChange={(e) => set("kind", e.target.value as StudioLocationKind)}
          className={FIELD_INPUT}
        >
          {LOCATION_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      {text("label", "Name")}
      {text("street", "Street")}
      {text("city", "City")}
      {text("state", "State")}
      {text("zip", "Zip")}
      {text("receivingHours", "Receiving hours", { placeholder: "Mon–Fri 8–4" })}
      {triSelect("dock", "Dock", "Has a dock", "No dock")}
      {triSelect("liftgate", "Liftgate", "Needs a liftgate", "No liftgate needed")}
      {text("storageFreeDays", "Free storage days", { inputMode: "numeric" })}
      {text("storageRate", "Storage rate, dollars a month", { inputMode: "decimal" })}
      {text("receivingFee", "Receiving fee, dollars a piece", { inputMode: "decimal" })}
      <div className="mb-3">
        <label className={FIELD_LABEL} htmlFor={`${idBase}-instructions`}>
          Instructions
        </label>
        <textarea
          id={`${idBase}-instructions`}
          rows={2}
          value={form.instructions}
          onChange={(e) => set("instructions", e.target.value)}
          className={FIELD_INPUT}
        />
      </div>
      <label className="t-body-sm mb-3 flex items-center gap-2 text-[var(--ink)]">
        <input
          type="checkbox"
          checked={form.isDefaultReceiver}
          onChange={(e) => set("isDefaultReceiver", e.target.checked)}
        />
        Default receiver
      </label>
      {error && (
        <p role="alert" className="t-body-sm mb-2 text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <DocumentAction
          actionKey="save-studio-location"
          surfaceKey="people"
          regionKey="studio-locations"
          variant="secondary"
          loading={saving}
          loadingLabel="Recording…"
          onClick={() => void submit()}
        >
          {submitLabel}
        </DocumentAction>
        <DocumentAction
          actionKey="cancel-studio-location"
          surfaceKey="people"
          regionKey="studio-locations"
          variant="tertiary"
          onClick={onCancel}
        >
          Cancel
        </DocumentAction>
      </div>
    </fieldset>
  );
}

export function StudioLocationsEditor({
  organizationId,
  studioContactId = null,
  onAnnounce,
}: {
  organizationId: string | null;
  /** The company card these locations hang off; null lists them all. */
  studioContactId?: string | null;
  onAnnounce?: (message: string) => void;
}) {
  const { data: rows, isLoading } = useStudioLocations(organizationId, {
    includeArchived: true,
  });
  const upsert = useUpsertStudioLocation();
  const archive = useArchiveStudioLocation();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [actError, setActError] = useState<string | null>(null);

  if (!organizationId) return null;

  const mine = (rows ?? []).filter(
    (r) => studioContactId == null || r.studio_contact_id === studioContactId,
  );
  const live = mine.filter((r) => !r.archived_at);
  const archived = mine.filter((r) => r.archived_at);
  const idBase = `studio-location-${studioContactId ?? "studio"}`;

  const save = async (request: StudioLocationRequest, id?: string) => {
    await upsert.mutateAsync({
      organizationId,
      request: id ? { ...request, id } : { ...request, studioContactId },
    });
    setEditing(null);
    onAnnounce?.(id ? "Location saved." : "Location added.");
  };

  const act = async (run: () => Promise<unknown>, done: string) => {
    setActError(null);
    try {
      await run();
      onAnnounce?.(done);
    } catch (e) {
      setActError((e as Error).message || "That did not save.");
    }
  };

  return (
    <div data-studio-locations>
      {isLoading ? null : live.length === 0 && editing !== "new" ? (
        <p className="t-body-sm text-[var(--ink-subtle)]">{NO_LOCATIONS_SENTENCE}</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {live.map((row) => {
            const address = formatStudioAddress(row.address);
            const facts = locationFacts(row);
            return (
              <li key={row.id} className="mb-3" data-location-id={row.id}>
                <p className="t-body-sm text-[var(--ink)]">
                  {row.label}
                  <span className="text-[var(--ink-subtle)]">
                    {" · "}
                    {KIND_WORD[row.kind] ?? row.kind}
                    {row.is_default_receiver && " · Default receiver"}
                  </span>
                </p>
                {address && <p className="t-body-sm text-[var(--ink-subtle)]">{address}</p>}
                {facts.length > 0 && (
                  <p className="t-body-sm text-[var(--ink-subtle)]">{facts.join(" · ")}</p>
                )}
                {row.instructions && (
                  <p className="t-body-sm text-[var(--ink-subtle)]">{row.instructions}</p>
                )}
                {editing === row.id ? (
                  <LocationFormFields
                    idBase={`${idBase}-${row.id}`}
                    initial={locationFormFromRow(row)}
                    saving={upsert.isPending}
                    submitLabel="Save the location"
                    onSubmit={(request) => save(request, row.id)}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <div className="mt-1 flex flex-wrap gap-2">
                    <DocumentAction
                      actionKey="edit-studio-location"
                      surfaceKey="people"
                      regionKey="studio-locations"
                      variant="tertiary"
                      aria-label={`Edit ${row.label}`}
                      onClick={() => setEditing(row.id)}
                    >
                      Edit
                    </DocumentAction>
                    {!row.is_default_receiver && (
                      <DocumentAction
                        actionKey="default-studio-location"
                        surfaceKey="people"
                        regionKey="studio-locations"
                        variant="tertiary"
                        aria-label={`Make ${row.label} the default receiver`}
                        disabled={upsert.isPending}
                        onClick={() =>
                          void act(
                            () =>
                              upsert.mutateAsync({
                                organizationId,
                                request: { id: row.id, isDefaultReceiver: true },
                              }),
                            `${row.label} is the default receiver.`,
                          )
                        }
                      >
                        Make default receiver
                      </DocumentAction>
                    )}
                    <DocumentAction
                      actionKey="archive-studio-location"
                      surfaceKey="people"
                      regionKey="studio-locations"
                      variant="tertiary"
                      aria-label={`Archive ${row.label}`}
                      disabled={archive.isPending}
                      onClick={() =>
                        void act(
                          () => archive.mutateAsync({ locationId: row.id }),
                          `${row.label} archived.`,
                        )
                      }
                    >
                      Archive
                    </DocumentAction>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {actError && (
        <p role="alert" className="t-body-sm mb-2 text-[var(--color-terracotta-ink)]">
          {actError}
        </p>
      )}

      {editing === "new" ? (
        <LocationFormFields
          idBase={`${idBase}-new`}
          initial={EMPTY_LOCATION_FORM}
          saving={upsert.isPending}
          submitLabel="Add the location"
          onSubmit={(request) => save(request)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <DocumentAction
          actionKey="add-studio-location"
          surfaceKey="people"
          regionKey="studio-locations"
          variant="tertiary"
          onClick={() => setEditing("new")}
        >
          Add a location
        </DocumentAction>
      )}

      {archived.length > 0 && (
        <div className="mt-4">
          <p className="t-head mb-1 text-[var(--ink-subtle)]">Archived</p>
          <ul className="m-0 list-none p-0">
            {archived.map((row) => (
              <li key={row.id} className="t-body-sm flex flex-wrap items-baseline gap-2 text-[var(--ink-subtle)]">
                {row.label}
                <DocumentAction
                  actionKey="restore-studio-location"
                  surfaceKey="people"
                  regionKey="studio-locations"
                  variant="tertiary"
                  aria-label={`Restore ${row.label}`}
                  disabled={archive.isPending}
                  onClick={() =>
                    void act(
                      () => archive.mutateAsync({ locationId: row.id, archived: false }),
                      `${row.label} restored.`,
                    )
                  }
                >
                  Restore
                </DocumentAction>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
