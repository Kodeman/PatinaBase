"use client";

import { useId, useState } from "react";
import { useSetProjectFfePlannedDestination } from "@patina/supabase";
import { useJobPlaces } from "./use-job-places";

export function PlannedDestination({
  projectId,
  itemId,
  locationId,
  canEdit,
}: {
  projectId: string;
  itemId: string;
  locationId: string | null;
  canEdit: boolean;
}) {
  const places = useJobPlaces(projectId);
  const mutation = useSetProjectFfePlannedDestination();
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const planned = places.jobPlaces.find((place) => place.id === locationId);
  const change = async (value: string) => {
    setError(null);
    try {
      await mutation.mutateAsync({
        ffeItemId: itemId,
        locationId: value || null,
      });
    } catch (cause) {
      setError(
        (cause as Error).message ||
          "The planned destination could not be saved.",
      );
    }
  };
  return (
    <div className="mb-3 text-[var(--ink-subtle)]">
      <label htmlFor={id} className="t-body-sm block">
        Planned destination
      </label>
      {canEdit ? (
        <select
          id={id}
          value={locationId ?? ""}
          disabled={places.isLoading || places.isError || mutation.isPending}
          onChange={(event) => void change(event.target.value)}
          className="mt-1 min-h-11 w-full border border-[var(--hairline-strong)] bg-[var(--paper-doc)] px-2 text-[16px] text-[var(--ink)]"
        >
          <option value="">Not planned</option>
          {places.jobPlaces.map((place) => (
            <option key={place.id} value={place.id}>
              {place.label} · {place.kind}
              {place.is_private_home ? " · Private home" : ""}
            </option>
          ))}
        </select>
      ) : (
        <p className="t-body-sm">
          {planned?.label || "Not planned"}
          {planned?.is_private_home && " · Private home"}
        </p>
      )}
      <p className="t-body-sm">
        Planned intent only. The order’s ship-to is the commitment.
      </p>
      {places.isError && <p role="alert">The job places could not be read.</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
