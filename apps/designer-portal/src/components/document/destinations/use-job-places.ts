"use client";

import {
  useOrganizations,
  useProject,
  useProjectDestinationLocations,
  useStudioContacts,
  useStudioIdentity,
  useStudioLocations,
} from "@patina/supabase";

/** Directory facts remain studio-visible; an association only marks relevance to a job. */
export function useJobPlaces(projectId: string | null | undefined) {
  const project = useProject(projectId ?? "");
  const p = project.data as
    | {
        studio_id?: string | null;
        designer_id?: string | null;
        site_address?: string | null;
      }
    | undefined;
  const owner = useStudioIdentity({
    designerId: p && !p.studio_id ? p.designer_id : null,
  });
  const organizationId = p?.studio_id || owner.data?.studioId || null;
  const organizations = useOrganizations();
  const directory = useStudioLocations(organizationId);
  const associations = useProjectDestinationLocations(projectId);
  const contacts = useStudioContacts(organizationId);
  const jobLocationIds = new Set(
    (associations.data ?? []).map((row) => row.location_id),
  );
  const locations = (directory.data ?? []).map((location) => {
    const contact = contacts.data?.find(
      (row) => row.id === location.studio_contact_id,
    );
    return {
      ...location,
      receivingParty: contact?.company_name || contact?.full_name || null,
    };
  });
  return {
    organizationId,
    locations,
    jobLocationIds,
    jobPlaces: locations.filter((location) => jobLocationIds.has(location.id)),
    studioAddress: (
      organizations.data?.find((org) => org.id === organizationId) as
        | { address?: unknown }
        | undefined
    )?.address,
    siteAddress: p?.site_address?.trim() || null,
    isLoading:
      project.isLoading ||
      (owner.isLoading && !organizationId) ||
      directory.isLoading ||
      associations.isLoading,
    isError:
      project.isError ||
      directory.isError ||
      associations.isError ||
      contacts.isError,
  };
}
