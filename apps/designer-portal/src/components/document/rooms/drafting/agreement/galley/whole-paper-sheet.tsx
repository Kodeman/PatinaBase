"use client";

/**
 * "Read the whole paper" — the agreement, end to end, at the paper's own
 * measure, over the room rather than instead of it.
 *
 * It renders `ServiceAgreementPreview`, which is `AgreementPartsBody`, which
 * is a map over the very `AgreementPartSection` the galley prints (FS-5/FS-13).
 * One code path, two framings — a third renderer would be the drift R27 and
 * N-1 exist to forbid. Never a route: leaving the room to read the paper is
 * the mode switch this whole direction removes.
 */

import { DocSheet } from "../../../../overlays/doc-sheet";
import { ServiceAgreementPreview } from "../../../../commercial/service-agreement-preview";

export function WholePaperSheet({
  open,
  onClose,
  previewProps,
}: {
  open: boolean;
  onClose: () => void;
  previewProps: React.ComponentProps<typeof ServiceAgreementPreview>;
}) {
  return (
    <DocSheet open={open} onClose={onClose} title="The whole paper" wide>
      <ServiceAgreementPreview {...previewProps} />
    </DocSheet>
  );
}
