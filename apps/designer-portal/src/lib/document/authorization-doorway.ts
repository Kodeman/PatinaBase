import type { DocumentStateRow } from './desk-derivation';
import { commercialDocumentExperience } from './commercial-documents';

export function authorizationDoorwayFor({
  engagementKind,
  projectId,
  proposalId,
  documentKind,
}: {
  engagementKind: DocumentStateRow['engagement_kind'] | null | undefined;
  projectId: string | null | undefined;
  proposalId: string | null | undefined;
  documentKind: string | null | undefined;
}): string | null {
  if (
    engagementKind !== 'proposal' ||
    commercialDocumentExperience(documentKind) !== 'commercial_readonly' ||
    !projectId ||
    !proposalId
  ) {
    return null;
  }

  return `/desk?${new URLSearchParams({
    authorization: proposalId,
    projectId,
  }).toString()}`;
}
