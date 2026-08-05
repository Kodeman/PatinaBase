"use client";

/**
 * AuthorizationsLedger — every furnishings authorization on the project, as
 * a ledger: Instrument / Lines / Total / State. A row opens
 * AuthorizationDetail (a DocSheet) for the figures, the what-was-signed
 * table, and the Void act.
 *
 * There is no "create" form here — a new authorization is released straight
 * from the FF&E schedule (useReleaseForAuthorization, ffeItemIds), which is
 * the schedule surface's act, not this ledger's. This ledger only reads and
 * opens what already exists.
 */

import { useState } from "react";
import { useProjectInstruments } from "@/hooks/use-commercial-documents";
import {
  instrumentStatusView,
  money,
  type ProjectInstrumentView,
} from "@/lib/document/project-commerce";
import { AuthorizationDetail } from "./authorization-detail";

const toneColor = {
  quiet: "var(--text-muted)",
  clay: "var(--color-clay)",
  golden: "var(--color-golden-hour)",
  sage: "var(--color-sage)",
  terracotta: "var(--color-terracotta)",
};

function AuthorizationRow({
  instrument,
  onOpen,
}: {
  instrument: ProjectInstrumentView;
  onOpen: () => void;
}) {
  const status = instrumentStatusView(instrument.state);
  return (
    <tr className="border-b border-[var(--doc-ink-border)]/60">
      <td className="py-2 pr-3">
        <button
          type="button"
          onClick={onOpen}
          className="text-left text-[12px] font-medium text-[var(--color-charcoal)] underline-offset-2 hover:underline"
        >
          Authorization № {instrument.number} · {instrument.name}
        </button>
        {instrument.supersededByNumber != null && (
          <span className="ml-1 text-[10px] text-[var(--text-muted)]">
            → superseded by № {instrument.supersededByNumber}
          </span>
        )}
      </td>
      <td className="py-2 pr-3 text-right">{instrument.itemCount}</td>
      <td className="py-2 pr-3 text-right font-medium text-[var(--color-charcoal)]">
        {money(instrument.totalAmountCents)}
      </td>
      <td className="py-2 text-right">
        <span
          className="font-mono text-[9px] uppercase tracking-[0.06em]"
          style={{ color: toneColor[status.tone] }}
        >
          {status.label}
        </span>
      </td>
    </tr>
  );
}

export function AuthorizationsLedger({ projectId }: { projectId: string }) {
  const instrumentsQuery = useProjectInstruments(projectId);
  const [openProposalId, setOpenProposalId] = useState<string | null>(null);
  const instruments = instrumentsQuery.data ?? [];
  const openInstrument = instruments.find(
    (instrument) => instrument.proposalId === openProposalId,
  );

  return (
    <div>
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
        Furnishings authorizations
      </p>
      <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[var(--text-muted)]">
        Each authorization releases signed schedule items for purchasing.
        Release one from the schedule.
      </p>

      {instrumentsQuery.isLoading && (
        <p className="mt-3 text-[11px] text-[var(--text-muted)]">
          Loading authorizations…
        </p>
      )}
      {instrumentsQuery.error && (
        <p role="alert" className="mt-3 text-[11px] text-[var(--color-terracotta)]">
          Authorizations are unavailable.
        </p>
      )}
      {!instrumentsQuery.isLoading && instruments.length === 0 && (
        <p className="mt-3 text-[11px] text-[var(--text-muted)]">
          No furnishings authorizations yet.
        </p>
      )}

      {instruments.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-[11px]">
            <thead className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
              <tr className="border-b border-[var(--doc-ink-border)]">
                <th className="py-2 pr-3">Instrument</th>
                <th className="py-2 pr-3 text-right">Lines</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2 text-right">State</th>
              </tr>
            </thead>
            <tbody>
              {instruments.map((instrument) => (
                <AuthorizationRow
                  key={instrument.documentId}
                  instrument={instrument}
                  onOpen={() => setOpenProposalId(instrument.proposalId)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AuthorizationDetail
        projectId={projectId}
        instrument={openInstrument ?? null}
        open={Boolean(openInstrument)}
        onClose={() => setOpenProposalId(null)}
      />
    </div>
  );
}
