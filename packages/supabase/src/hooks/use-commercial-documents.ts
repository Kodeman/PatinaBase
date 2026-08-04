// Canonical query-key home for commercial documents (design services
// agreements, furnishings authorizations, service addenda). The hooks that
// used to live here have no importers — the client portal reads through
// `apps/client-portal/src/hooks/use-commercial-client.ts` and the designer
// portal through its own app-local `@/hooks/use-commercial-documents.ts`;
// both import only `commercialKeys` from this module, so this stays the
// single source of truth for the key shapes both portals key off of.
export const commercialKeys = {
  all: ['commercial-documents'] as const,
  document: (documentId: string) => ['commercial-documents', documentId] as const,
  clientBundle: (documentId: string) =>
    ['commercial-documents', documentId, 'client-safe'] as const,
  authority: (projectId: string) => ['project-authority', projectId] as const,
  budget: (projectId: string) => ['working-budget', projectId] as const,
  waves: (projectId: string) => ['furnishings-authorizations', projectId] as const,
  sendSnapshot: (documentId: string) =>
    ['commercial-documents', documentId, 'send-snapshot'] as const,
};
