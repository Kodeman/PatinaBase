"use client";

import dynamic from "next/dynamic";
import { Button } from "@/components/ui/controls";
import { useCommercialDocument } from "@/hooks/use-commercial-documents";

// DR13 / criterion J — the composer keeps `@dnd-kit`, the part editors and the
// readiness machinery out of `drafting-room.tsx`'s own chunk. The gate the flag
// used to hold is gone; the split it paid for is not.
const AgreementComposer = dynamic(
  () =>
    import("./agreement/agreement-composer").then((mod) => ({
      default: mod.AgreementComposer,
    })),
  {
    ssr: false,
    loading: () => <AgreementGate message="Opening the design agreement…" />,
  },
);

export function ServiceAgreementDraftingRoom({ proposal }: { proposal: any }) {
  const proposalId = String(proposal.id);
  const bundle = useCommercialDocument(proposalId);

  if (bundle.isLoading) {
    return <AgreementGate message="Opening the design agreement…" />;
  }
  if (bundle.error || !bundle.data) {
    return (
      <AgreementGate
        message="The design agreement could not be loaded. Editing stays closed."
        action={
          <Button variant="secondary" onClick={() => void bundle.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    // Keyed on the agreement itself, and on nothing that a save changes.
    // `upsert_agreement_parts` projects through `_project_agreement_terms`,
    // whose upsert ends `updated_at = now()`, so a terms/parts key remounted
    // the composer on EVERY save — throwing the designer back to the first
    // part and wiping the note she had just earned. The composer holds the
    // composition after mount and re-reads the bundle only through props, so
    // one mount per agreement is right.
    <AgreementComposer
      key={proposalId}
      proposal={proposal}
      bundle={bundle.data}
    />
  );
}

function AgreementGate({
  message,
  action,
}: {
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[40vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="doc-type-body text-[var(--color-quiet-ink)]">{message}</p>
      {action}
    </div>
  );
}
