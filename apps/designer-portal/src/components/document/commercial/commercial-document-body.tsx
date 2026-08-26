"use client";

import { useCommercialDocument } from "@/hooks/use-commercial-documents";
import { ServiceAgreementPreview } from "./service-agreement-preview";

export function ServiceAgreementDocumentBody({
  proposalId,
  clientName,
}: {
  proposalId: string;
  clientName?: string;
}) {
  const bundle = useCommercialDocument(proposalId);
  if (bundle.isLoading) {
    return (
      <p className="py-3 text-[11.5px] italic text-[var(--text-muted)]">
        Unfolding the agreement…
      </p>
    );
  }
  if (bundle.error || !bundle.data) {
    return (
      <p className="py-3 text-[11.5px] text-[var(--color-terracotta-ink)]">
        Agreement unavailable.
      </p>
    );
  }
  if (!bundle.data.terms) {
    return (
      <p className="py-3 text-[11.5px] italic text-[var(--text-muted)]">
        Nothing drafted yet.
      </p>
    );
  }
  return (
    <ServiceAgreementPreview
      document={bundle.data.document}
      terms={bundle.data.terms}
      rates={bundle.data.rates}
      signatures={bundle.data.signatures}
      clientName={clientName}
    />
  );
}
