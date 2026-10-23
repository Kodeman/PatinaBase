"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import {
  useAddProjectDestinationLocation,
  useRemoveProjectDestinationLocation,
  useUpsertStudioLocation,
  type StudioLocationRequest,
} from "@patina/supabase";
import { DocSheet } from "../overlays/doc-sheet";
import { DocumentAction } from "../document-action";
import {
  EMPTY_LOCATION_FORM,
  LocationFormFields,
  locationFormFromRow,
} from "../people/studio-locations-editor";
import { formatStudioAddress } from "./location-format";
import { useJobPlaces } from "./use-job-places";

export function JobDestinationsDoor({
  projectId,
  aboveFolio = false,
}: {
  projectId: string;
  aboveFolio?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DocumentAction
        actionKey="open-job-destinations"
        surfaceKey="project"
        regionKey="ffe-head"
        variant="tertiary"
        onClick={() => setOpen(true)}
      >
        Destinations
      </DocumentAction>
      {open && (
        <JobDestinationsSheet
          projectId={projectId}
          onClose={() => setOpen(false)}
          aboveFolio={aboveFolio}
        />
      )}
    </>
  );
}

export function JobDestinationsSheet({
  projectId,
  onClose,
  aboveFolio = false,
}: {
  projectId: string;
  onClose: () => void;
  aboveFolio?: boolean;
}) {
  const places = useJobPlaces(projectId);
  const add = useAddProjectDestinationLocation();
  const remove = useRemoveProjectDestinationLocation();
  const upsert = useUpsertStudioLocation();
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = add.isPending || remove.isPending || upsert.isPending;
  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(
        (cause as Error).message || "The destination could not be saved.",
      );
    }
  };
  const save = async (request: StudioLocationRequest) => {
    const location = await upsert.mutateAsync({
      organizationId: places.organizationId!,
      request: editing === "new" ? request : { ...request, id: editing! },
    });
    if (editing === "new") {
      // Keep the saved place available for retry if associating it with this job fails.
      setEditing(location.id);
      await add.mutateAsync({ projectId, locationId: location.id });
    }
    setEditing(null);
  };
  const current = places.locations.find((place) => place.id === editing);
  const ordered = [
    ...places.jobPlaces,
    ...places.locations.filter((place) => !places.jobLocationIds.has(place.id)),
  ];
  return (
    <DocSheet
      open
      onClose={onClose}
      title="Destinations"
      icon={MapPin}
      aboveFolio={aboveFolio}
    >
      <p className="t-body-sm mb-4">
        Places for this job, saved in the studio directory. Private homes remain
        visible to the studio. Nothing here changes a sent order.
      </p>
      {places.isLoading ? (
        <p role="status">Reading the places…</p>
      ) : places.isError ? (
        <p role="alert">The places could not be read.</p>
      ) : (
        <>
          {!ordered.length && <p className="t-body-sm">No places on file.</p>}
          <ul className="m-0 list-none p-0">
            {ordered.map((place) => (
              <li
                key={place.id}
                className="border-b border-[var(--hairline-strong)] py-3"
              >
                <p className="t-body-sm text-[var(--ink)]">
                  {place.label} · {place.kind}
                  {place.is_private_home && " · Private home"}
                  {places.jobLocationIds.has(place.id) && " · On this job"}
                </p>
                <p className="t-body-sm">
                  {formatStudioAddress(place.address)}
                </p>
                <p className="t-body-sm">
                  Receiving party: {place.receivingParty || "Not recorded"}
                </p>
                {place.receiving_hours && (
                  <p className="t-body-sm">Receives {place.receiving_hours}</p>
                )}
                {place.instructions && (
                  <p className="t-body-sm whitespace-pre-wrap">
                    {place.instructions}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  <DocumentAction
                    actionKey="toggle-job-destination"
                    surfaceKey="project"
                    regionKey="destinations"
                    variant="tertiary"
                    disabled={pending}
                    aria-label={`${places.jobLocationIds.has(place.id) ? "Remove" : "Add"} ${place.label} ${places.jobLocationIds.has(place.id) ? "from" : "to"} this job`}
                    onClick={() =>
                      void run(() =>
                        (places.jobLocationIds.has(place.id)
                          ? remove
                          : add
                        ).mutateAsync({ projectId, locationId: place.id }),
                      )
                    }
                  >
                    {places.jobLocationIds.has(place.id)
                      ? "Remove from job"
                      : "Add to job"}
                  </DocumentAction>
                  <DocumentAction
                    actionKey="edit-job-place"
                    surfaceKey="project"
                    regionKey="destinations"
                    variant="tertiary"
                    disabled={pending}
                    aria-label={`Edit ${place.label}`}
                    onClick={() => setEditing(place.id)}
                  >
                    Edit
                  </DocumentAction>
                </div>
              </li>
            ))}
          </ul>
          <p className="t-body-sm my-3">
            Removing a place clears its planned destinations on lines, not any
            order’s ship-to.
          </p>
          {places.organizationId &&
            (editing ? (
              <LocationFormFields
                key={editing}
                organizationId={places.organizationId}
                idBase="job-place"
                initial={
                  current ? locationFormFromRow(current) : EMPTY_LOCATION_FORM
                }
                saving={pending}
                submitLabel={
                  editing === "new" ? "Add destination" : "Save the location"
                }
                onSubmit={save}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <DocumentAction
                actionKey="add-job-place"
                surfaceKey="project"
                regionKey="destinations"
                variant="secondary"
                onClick={() => setEditing("new")}
              >
                Add destination
              </DocumentAction>
            ))}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </DocSheet>
  );
}
