"use client";

/**
 * AuthorizationsLedger — every instrument on the project, as a ledger:
 * Instrument / Lines / Total / State. A row opens its own sheet.
 *
 * Two kinds of paper share this ledger. A furnishings authorization (A-marks)
 * releases signed schedule items for purchasing; a trade scope (TS-marks)
 * buys work rather than goods. They are numbered in separate sequences,
 * because a studio saying "№ 3" always means one kind of paper or the other.
 *
 * There is no "create" form for a furnishings authorization here — one is
 * released straight from the FF&E schedule (useReleaseForAuthorization), which
 * is the schedule surface's act. A trade scope has no schedule to be released
 * from: it is written, so it begins here, with the head act.
 *
 * A trade row routes by state as well as kind: a draft opens the draft sheet
 * (the work, the party, the bids, the draws — deck slide 15), and a released
 * scope opens the live document (deck slide 17).
 */

import { useState } from "react";
import {
  useProjectInstruments,
  useTradeScopes,
} from "@/hooks/use-commercial-documents";
import {
  instrumentStatusView,
  mergeCommerceLedgerRows,
  money,
  tradeProgressLabel,
  tradeScopeStatusView,
  type CommerceLedgerRow,
  type ProjectInstrumentView,
  type TradeScopeView,
} from "@/lib/document/project-commerce";
import { AuthorizationDetail } from "./authorization-detail";
import { DocumentAction } from "../document-action";
import { TradeScopeDetail } from "./trade/trade-scope-detail";
import { TradeScopeDraftSheet } from "./trade/trade-scope-draft-sheet";

const toneColor = {
  quiet: "var(--text-muted)",
  clay: "var(--color-clay)",
  golden: "var(--color-golden-hour)",
  sage: "var(--color-sage)",
  terracotta: "var(--color-terracotta)",
};

function LedgerRow({
  row,
  onOpen,
}: {
  row: CommerceLedgerRow;
  onOpen: () => void;
}) {
  const status =
    row.kind === "furnishings"
      ? instrumentStatusView(row.instrument.state)
      : tradeScopeStatusView(row.scope.state);
  const lines =
    row.kind === "furnishings"
      ? String(row.instrument.itemCount)
      : String(row.scope.sectionCount || "—");
  const total =
    row.kind === "furnishings"
      ? money(row.instrument.totalAmountCents)
      : money(row.scope.clientPriceCents);

  return (
    <tr className="border-b border-[var(--doc-ink-border)]/60">
      <td className="py-2 pr-3 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
        {row.mark}
      </td>
      <td className="py-2 pr-3">
        <button
          type="button"
          onClick={onOpen}
          className="text-left text-[12px] font-medium text-[var(--color-charcoal)] underline-offset-2 hover:underline"
        >
          {row.label}
        </button>
        {row.kind === "furnishings" &&
          row.instrument.supersededByNumber != null && (
            <span className="ml-1 text-[10px] text-[var(--text-muted)]">
              → superseded by № {row.instrument.supersededByNumber}
            </span>
          )}
        {row.kind === "trade" && row.scope.state === "executed" && (
          <span className="ml-1 text-[10px] text-[var(--text-muted)]">
            · {tradeProgressLabel(row.scope.progressState)}
          </span>
        )}
      </td>
      <td className="py-2 pr-3 text-right">{lines}</td>
      <td className="py-2 pr-3 text-right font-medium text-[var(--color-charcoal)]">
        {total}
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

export function AuthorizationsLedger({
  projectId,
  projectName = "",
  clientName = "",
}: {
  projectId: string;
  projectName?: string;
  /** Forwarded to both detail sheets, which prefill it on the record-on-paper
   *  act — the same courtesy the design-services act has always had. */
  clientName?: string;
}) {
  const instrumentsQuery = useProjectInstruments(projectId);
  const tradeScopesQuery = useTradeScopes(projectId);
  const [openInstrumentId, setOpenInstrumentId] = useState<string | null>(null);
  const [openTradeId, setOpenTradeId] = useState<string | null>(null);
  const [draftScopeId, setDraftScopeId] = useState<string | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);

  const instruments: ProjectInstrumentView[] = instrumentsQuery.data ?? [];
  const scopes: TradeScopeView[] = tradeScopesQuery.data ?? [];
  const rows = mergeCommerceLedgerRows(instruments, scopes);

  const openInstrument = instruments.find(
    (instrument) => instrument.proposalId === openInstrumentId,
  );
  const openScope = scopes.find((scope) => scope.proposalId === openTradeId);
  const draftScope = scopes.find((scope) => scope.proposalId === draftScopeId);

  const isLoading = instrumentsQuery.isLoading || tradeScopesQuery.isLoading;
  // The two reads fail independently and say so independently: a trade read
  // that cannot answer must never make the furnishings ledger look broken.

  const openRow = (row: CommerceLedgerRow) => {
    if (row.kind === "furnishings") {
      setOpenInstrumentId(row.instrument.proposalId);
      return;
    }
    // A draft is still being written; a released scope is a live document.
    if (row.scope.state === "draft") {
      setDraftScopeId(row.scope.proposalId);
      setDraftOpen(true);
      return;
    }
    setOpenTradeId(row.scope.proposalId);
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
          Authorizations &amp; trade scopes
        </p>
        <DocumentAction
          actionKey="draft-a-trade-scope"
          surfaceKey="project"
          regionKey="authorizations-ledger"
          variant="secondary"
          onClick={() => {
            setDraftScopeId(null);
            setDraftOpen(true);
          }}
        >
          Draft a trade scope
        </DocumentAction>
      </div>
      <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[var(--text-muted)]">
        An authorization releases signed schedule items for purchasing — release
        one from the schedule. A trade scope buys work: written here, bid here,
        signed by the client, then engaged.
      </p>

      {isLoading && (
        <p className="mt-3 text-[11px] text-[var(--text-muted)]">
          Loading authorizations…
        </p>
      )}
      {Boolean(instrumentsQuery.error) && (
        <p role="alert" className="mt-3 text-[11px] text-[var(--color-terracotta)]">
          Authorizations are unavailable.
        </p>
      )}
      {Boolean(tradeScopesQuery.error) && (
        <p role="alert" className="mt-3 text-[11px] text-[var(--color-terracotta)]">
          Trade scopes are unavailable.
        </p>
      )}
      {!isLoading && rows.length === 0 && (
        <p className="mt-3 text-[11px] text-[var(--text-muted)]">
          No furnishings authorizations yet.
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[11px]">
            <thead className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
              <tr className="border-b border-[var(--doc-ink-border)]">
                <th className="py-2 pr-3">Kind</th>
                <th className="py-2 pr-3">Instrument</th>
                <th className="py-2 pr-3 text-right">Lines</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2 text-right">State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <LedgerRow key={row.key} row={row} onOpen={() => openRow(row)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AuthorizationDetail
        projectId={projectId}
        instrument={openInstrument ?? null}
        clientName={clientName}
        open={Boolean(openInstrument)}
        onClose={() => setOpenInstrumentId(null)}
      />

      <TradeScopeDetail
        projectId={projectId}
        projectName={projectName}
        clientName={clientName}
        scope={openScope ?? null}
        open={Boolean(openScope)}
        onClose={() => setOpenTradeId(null)}
      />

      {draftOpen && (
        <TradeScopeDraftSheet
          open
          projectId={projectId}
          proposalId={draftScopeId}
          scopeNumber={draftScope?.number ?? null}
          onCreated={(proposalId) => setDraftScopeId(proposalId)}
          onClose={() => {
            setDraftOpen(false);
            setDraftScopeId(null);
          }}
        />
      )}
    </div>
  );
}
