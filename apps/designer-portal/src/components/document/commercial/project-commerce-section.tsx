"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useProposalSendDispatchStatus,
  useRetryProposalSend,
} from "@patina/supabase";
import {
  useCreateFurnishingsAuthorization,
  useFurnishingsAuthorizations,
  useOverrideBudgetCheckpoint,
  usePublishBudgetCheckpoint,
  useProjectBillingAuthority,
  useReplayCommercialNotification,
  useSaveWorkingBudgetDraft,
  useSendFurnishingsAuthorization,
  useWorkingBudget,
} from "@/hooks/use-commercial-documents";
import { useProposals } from "@/hooks/use-proposals";
import {
  furnishingsDepositPosture,
  validateWorkingBudgetLines,
  workingBudgetTotals,
  type FurnishingsWaveView,
  type WorkingBudgetLineDraft,
} from "@/lib/document/project-commerce";
import { Button, Input, Select, Textarea } from "@/components/ui/controls";
import { ProjectFurnishingDraftAction } from "./project-furnishing-draft-action";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

const when = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(value))
    : null;

const newLineId = () => crypto.randomUUID();

const blankLine = (sortOrder: number): WorkingBudgetLineDraft => ({
  id: newLineId(),
  roomId: null,
  roomName: "",
  category: "",
  lowCents: 0,
  targetCents: 0,
  highCents: 0,
  sortOrder,
});

const editableLines = (
  lines: Array<{
    id: string;
    roomId: string | null;
    roomName: string;
    category: string;
    lowCents: number;
    targetCents: number;
    highCents: number;
    sortOrder: number;
  }>,
  clone: boolean,
): WorkingBudgetLineDraft[] =>
  lines.length
    ? lines.map((line, sortOrder) => ({
        ...line,
        id: clone ? newLineId() : line.id,
        sortOrder,
      }))
    : [blankLine(0)];

const depositCopy: Record<
  ReturnType<typeof furnishingsDepositPosture>,
  string
> = {
  draft: "No deposit is due before this authorization is signed.",
  awaiting_signature: "Awaiting client signature; no deposit is due yet.",
  ready_to_execute: "Client signed; studio countersign is still required.",
  preparing_invoice: "Signed; preparing the deposit invoice.",
  invoice_ready: "Deposit invoice ready for client payment.",
};

function BudgetEditor({ projectId }: { projectId: string }) {
  const budgetQuery = useWorkingBudget(projectId);
  const authorityQuery = useProjectBillingAuthority(projectId);
  const saveBudget = useSaveWorkingBudgetDraft(projectId);
  const publish = usePublishBudgetCheckpoint(projectId);
  const override = useOverrideBudgetCheckpoint(projectId);
  const replayNotification = useReplayCommercialNotification();
  const budget = budgetQuery.data;
  const version = budget?.version ?? null;
  const checkpoint = budget?.checkpoint ?? null;
  const agreementId = authorityQuery.data?.agreementId ?? null;

  const [lines, setLines] = useState<WorkingBudgetLineDraft[]>([]);
  const [note, setNote] = useState("");
  const [startingNextVersion, setStartingNextVersion] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [showOverride, setShowOverride] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (budgetQuery.isLoading || !budget) return;
    setLines(editableLines(version?.lines ?? [], false));
    setNote(budget.note ?? "");
    setStartingNextVersion(false);
    setDirty(false);
    setErrors({});
  }, [budget, budgetQuery.isLoading, version?.id, version?.lines]);

  const totals = useMemo(() => workingBudgetTotals(lines), [lines]);
  const editable = !version || version.state === "draft" || startingNextVersion;

  const updateLine = (
    id: string,
    field: keyof WorkingBudgetLineDraft,
    value: string | number,
  ) => {
    setLines((current) =>
      current.map((line) =>
        line.id === id ? { ...line, [field]: value } : line,
      ),
    );
    setDirty(true);
    setErrors((current) => ({ ...current, [id]: "" }));
  };

  const save = async () => {
    const validation = validateWorkingBudgetLines(lines);
    setErrors(validation.errors);
    setActionError(null);
    if (!validation.valid) return;
    try {
      await saveBudget.mutateAsync({ projectId, version, note, lines });
      setStartingNextVersion(false);
      setDirty(false);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The budget could not be saved.",
      );
    }
  };

  const publishCheckpoint = async () => {
    if (
      !version ||
      version.state !== "draft" ||
      dirty ||
      !agreementId
    )
      return;
    setActionError(null);
    setNotificationMessage(null);
    try {
      const result = await publish.mutateAsync({
        versionId: version.id,
        agreementId,
      });
      if (result.notificationDelivery === "pending_retry") {
        setNotificationMessage(
          "The checkpoint is published, but its client notice is pending. Retry it from the published checkpoint below.",
        );
      }
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The checkpoint could not be published.",
      );
    }
  };

  const submitOverride = async () => {
    if (!checkpoint || overrideReason.trim().length < 5) return;
    setActionError(null);
    try {
      await override.mutateAsync({
        checkpointId: checkpoint.id,
        reason: overrideReason,
      });
      setShowOverride(false);
      setOverrideReason("");
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The override was not recorded.",
      );
    }
  };

  if (budgetQuery.isLoading) {
    return (
      <p className="text-[12px] text-[var(--text-muted)]">
        Loading working budget…
      </p>
    );
  }

  if (budgetQuery.error) {
    return (
      <p role="alert" className="text-[11px] text-[var(--color-terracotta)]">
        The project working budget is unavailable.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
            Working budget{" "}
            {version ? `· version ${version.version}` : "· not started"}
          </p>
          <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[var(--text-muted)]">
            Planning range only. This budget is nonbinding and grants no
            purchasing authority.
          </p>
        </div>
        {version?.state === "published" && !startingNextVersion && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setLines(editableLines(version.lines, true));
              setStartingNextVersion(true);
              setDirty(true);
            }}
          >
            Start version {version.version + 1}
          </Button>
        )}
      </div>

      {editable && (
        <div className="mt-4 space-y-3">
          {lines.map((line, index) => (
            <div
              key={line.id}
              className="border border-[var(--doc-ink-border)] bg-white/60 p-3"
            >
              <div className="grid gap-2 md:grid-cols-[1.1fr_1.1fr_repeat(3,minmax(90px,.7fr))_auto]">
                <label className="text-[10px] text-[var(--text-muted)]">
                  Room
                  <Input
                    className="mt-1"
                    aria-label={`Room ${index + 1}`}
                    value={line.roomName}
                    invalid={Boolean(errors[line.id])}
                    onChange={(event) =>
                      updateLine(line.id, "roomName", event.target.value)
                    }
                  />
                </label>
                <label className="text-[10px] text-[var(--text-muted)]">
                  Category
                  <Input
                    className="mt-1"
                    aria-label={`Category ${index + 1}`}
                    value={line.category}
                    invalid={Boolean(errors[line.id])}
                    onChange={(event) =>
                      updateLine(line.id, "category", event.target.value)
                    }
                  />
                </label>
                {(["lowCents", "targetCents", "highCents"] as const).map(
                  (field) => (
                    <label
                      key={field}
                      className="text-[10px] capitalize text-[var(--text-muted)]"
                    >
                      {field.replace("Cents", "")}
                      <Input
                        className="mt-1"
                        aria-label={`${field.replace("Cents", "")} ${index + 1}`}
                        type="number"
                        min="0"
                        step="1"
                        value={line[field] / 100}
                        invalid={Boolean(errors[line.id])}
                        onChange={(event) =>
                          updateLine(
                            line.id,
                            field,
                            Math.round(
                              Math.max(0, Number(event.target.value) || 0) *
                                100,
                            ),
                          )
                        }
                      />
                    </label>
                  ),
                )}
                <Button
                  className="self-end"
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove budget line ${index + 1}`}
                  disabled={lines.length === 1}
                  onClick={() => {
                    setLines((current) =>
                      current.filter((item) => item.id !== line.id),
                    );
                    setDirty(true);
                  }}
                >
                  Remove
                </Button>
              </div>
              {errors[line.id] && (
                <p
                  role="alert"
                  className="mt-2 text-[10px] text-[var(--color-terracotta)]"
                >
                  {errors[line.id]}
                </p>
              )}
            </div>
          ))}
          {errors._form && (
            <p
              role="alert"
              className="text-[10px] text-[var(--color-terracotta)]"
            >
              {errors._form}
            </p>
          )}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setLines((current) => [...current, blankLine(current.length)]);
                setDirty(true);
              }}
            >
              Add room × category
            </Button>
            <p className="text-right font-mono text-[10px] text-[var(--text-muted)]">
              {money(totals.lowCents)} low · {money(totals.targetCents)} target
              · {money(totals.highCents)} high
            </p>
          </div>
          <label className="block text-[10px] text-[var(--text-muted)]">
            Planning note
            <Textarea
              className="mt-1 min-h-16"
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setDirty(true);
              }}
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            {version?.state === "draft" && !startingNextVersion && (
              <Button
                size="sm"
                variant="secondary"
                disabled={
                  dirty ||
                  publish.isPending ||
                  saveBudget.isPending ||
                  !agreementId
                }
                onClick={publishCheckpoint}
              >
                Publish immutable checkpoint
              </Button>
            )}
            <Button
              size="sm"
              loading={saveBudget.isPending}
              disabled={!dirty}
              onClick={save}
            >
              Save draft
            </Button>
          </div>
          {version?.state === "draft" && dirty && (
            <p className="text-right text-[10px] text-[var(--text-muted)]">
              Save the latest changes before publishing.
            </p>
          )}
          {version?.state === "draft" && !dirty && !agreementId && (
            <p className="text-right text-[10px] text-[var(--text-muted)]">
              An executed design agreement is required before publishing.
            </p>
          )}
        </div>
      )}

      {!editable && version && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[11px]">
            <thead className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
              <tr className="border-b border-[var(--doc-ink-border)]">
                <th className="py-2 pr-3">Room</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3 text-right">Low</th>
                <th className="py-2 pr-3 text-right">Target</th>
                <th className="py-2 text-right">High</th>
              </tr>
            </thead>
            <tbody>
              {version.lines.map((line) => (
                <tr
                  key={line.id}
                  className="border-b border-[var(--doc-ink-border)]/60"
                >
                  <td className="py-2 pr-3">{line.roomName}</td>
                  <td className="py-2 pr-3">{line.category}</td>
                  <td className="py-2 pr-3 text-right">
                    {money(line.lowCents)}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium">
                    {money(line.targetCents)}
                  </td>
                  <td className="py-2 text-right">{money(line.highCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {checkpoint && (
        <div className="mt-4 border-l-2 border-[var(--color-sage)] pl-3 text-[11px]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <strong>
              {checkpoint.checkpointCode} · {checkpoint.state}
            </strong>
            <span className="text-[var(--text-muted)]">
              Published {when(checkpoint.publishedAt)}
            </span>
          </div>
          <ol
            aria-label="Budget checkpoint history"
            className="mt-2 space-y-1 text-[var(--text-muted)]"
          >
            <li>Published as an immutable planning snapshot.</li>
            {checkpoint.acknowledgedAt && (
              <li>Client acknowledged {when(checkpoint.acknowledgedAt)}.</li>
            )}
            {checkpoint.overrideAt && (
              <li>
                Designer override recorded {when(checkpoint.overrideAt)}:{" "}
                {checkpoint.overrideReason}
              </li>
            )}
          </ol>
          {agreementId && (
            <Button
              className="mt-2"
              size="sm"
              variant="ghost"
              loading={replayNotification.isPending}
              onClick={async () => {
                setActionError(null);
                setNotificationMessage(null);
                try {
                  const delivery = await replayNotification.mutateAsync({
                    documentId: agreementId,
                    transition: "budget_published",
                    eventId: checkpoint.id,
                  });
                  setNotificationMessage(
                    delivery === "delivered"
                      ? "The working-budget notice is confirmed."
                      : "The checkpoint remains published, but its notice is still pending. You can retry safely.",
                  );
                } catch (error) {
                  setActionError(
                    error instanceof Error
                      ? error.message
                      : "The budget notice could not be retried.",
                  );
                }
              }}
            >
              Resend budget notice
            </Button>
          )}
          {checkpoint.state === "published" && !showOverride && (
            <Button
              className="mt-2"
              size="sm"
              variant="ghost"
              onClick={() => setShowOverride(true)}
            >
              Record audited override
            </Button>
          )}
          {checkpoint.state === "published" && showOverride && (
            <div className="mt-3 max-w-xl">
              <label className="text-[10px] text-[var(--text-muted)]">
                Required reason
                <Textarea
                  className="mt-1"
                  value={overrideReason}
                  invalid={
                    overrideReason.length > 0 &&
                    overrideReason.trim().length < 5
                  }
                  onChange={(event) => setOverrideReason(event.target.value)}
                />
              </label>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setShowOverride(false);
                    setOverrideReason("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  loading={override.isPending}
                  disabled={overrideReason.trim().length < 5}
                  onClick={submitOverride}
                >
                  Record override
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {actionError && (
        <p
          role="alert"
          className="mt-3 text-[11px] text-[var(--color-terracotta)]"
        >
          {actionError}
        </p>
      )}
      {notificationMessage && (
        <p role="status" className="mt-3 text-[11px] text-[var(--color-mocha)]">
          {notificationMessage}
        </p>
      )}
    </div>
  );
}

function WaveDetail({
  wave,
  onSend,
  sending,
}: {
  wave: FurnishingsWaveView;
  onSend: () => void;
  sending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const posture = furnishingsDepositPosture(wave);
  const hasCommittedDelivery = Boolean(
    wave.proposalSendDispatchId && wave.sentAt,
  );
  const deliveryStatus = useProposalSendDispatchStatus({
    proposalId: wave.proposalId,
    dispatchId: wave.proposalSendDispatchId,
    sentAt: wave.sentAt,
    enabled: wave.state !== "draft" && hasCommittedDelivery,
  });
  const retryDelivery = useRetryProposalSend({ errorSurface: "inline" });
  const delivery = deliveryStatus.data;
  return (
    <article className="border-t border-[var(--doc-ink-border)] py-3 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          className="text-left"
          onClick={() => setOpen((value) => !value)}
        >
          <strong className="text-[12px] text-[var(--color-charcoal)]">
            {wave.waveName}
          </strong>
          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
            {wave.state.replace("_", " ")} · {wave.itemCount} item
            {wave.itemCount === 1 ? "" : "s"} · {money(wave.totalAmountCents)}
          </p>
        </button>
        {wave.state === "draft" && (
          <Button size="sm" loading={sending} onClick={onSend}>
            Send for signature
          </Button>
        )}
      </div>
      <p className="mt-2 text-[10.5px] text-[var(--text-muted)]">
        Checkpoint {wave.checkpointId ?? "not linked"} · {depositCopy[posture]}
        {wave.depositRequiredCents > 0
          ? ` Expected deposit ${money(wave.depositRequiredCents)}.`
          : ""}
      </p>
      {wave.state !== "draft" &&
        hasCommittedDelivery &&
        deliveryStatus.isLoading && (
          <p
            role="status"
            className="mt-2 text-[10.5px] text-[var(--text-muted)]"
          >
            Checking email delivery…
          </p>
        )}
      {wave.state !== "draft" && deliveryStatus.isError && (
        <p
          role="alert"
          className="mt-2 text-[10.5px] text-[var(--color-terracotta)]"
        >
          Email delivery status is unavailable. Refresh before retrying.
        </p>
      )}
      {wave.state !== "draft" && !hasCommittedDelivery && (
        <p
          role="alert"
          className="mt-2 text-[10.5px] text-[var(--color-terracotta)]"
        >
          Email delivery status is incomplete. Refresh before retrying.
        </p>
      )}
      {delivery && delivery.state !== "delivered" && (
        <div
          role="status"
          className="mt-2 border-l-2 border-[var(--color-aged-oak)] px-3 text-[11px] text-[var(--text-muted)]"
        >
          <p>
            The authorization is sent, but email delivery is
            {delivery.state === "pending" || delivery.state === "in_flight"
              ? " still being confirmed."
              : " not confirmed."}
            {delivery.retryable
              ? " Retrying uses the existing send and will not create a duplicate."
              : " Confirm delivery with the client directly."}
          </p>
          {delivery.detail && (
            <p className="mt-1 text-[10px]">{delivery.detail}</p>
          )}
          {delivery.retryable && (
            <Button
              className="mt-2"
              size="sm"
              variant="ghost"
              loading={retryDelivery.isPending}
              onClick={async () => {
                setDeliveryError(null);
                try {
                  await retryDelivery.mutateAsync({
                    proposalId: wave.proposalId,
                    dispatchId: delivery.dispatchId,
                    sentAt: delivery.sentAt,
                  });
                } catch (error) {
                  setDeliveryError(
                    error instanceof Error
                      ? error.message
                      : "Email delivery could not be retried.",
                  );
                }
              }}
            >
              Retry email delivery
            </Button>
          )}
        </div>
      )}
      {deliveryError && (
        <p
          role="alert"
          className="mt-2 text-[10.5px] text-[var(--color-terracotta)]"
        >
          {deliveryError}
        </p>
      )}
      {open && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[500px] text-left text-[11px]">
            <thead className="font-mono text-[9px] uppercase text-[var(--text-muted)]">
              <tr>
                <th className="pb-2">Item</th>
                <th className="pb-2">Room</th>
                <th className="pb-2 text-right">Signed qty</th>
                <th className="pb-2 text-right">Client price</th>
              </tr>
            </thead>
            <tbody>
              {wave.items.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-[var(--doc-ink-border)]/60"
                >
                  <td className="py-2 pr-2">
                    {item.name}
                    <span className="block text-[9px] text-[var(--text-muted)]">
                      {item.category}
                    </span>
                  </td>
                  <td className="py-2 pr-2">{item.roomName || "—"}</td>
                  <td className="py-2 pr-2 text-right">{item.quantity}</td>
                  <td className="py-2 text-right">
                    {money(item.clientUnitPriceCents)} each
                    <span className="block text-[9px] text-[var(--text-muted)]">
                      {money(item.clientLineTotalCents)} total
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-[var(--text-muted)]">
            Quantities, client prices, and checkpoint linkage are immutable in
            this authorization snapshot.
          </p>
        </div>
      )}
    </article>
  );
}

function FurnishingsWaves({ projectId }: { projectId: string }) {
  // Cache-shared key with BudgetEditor's own call above — one fetch, one
  // authority read, agreed everywhere on the page.
  const authorityQuery = useProjectBillingAuthority(projectId);
  const wavesQuery = useFurnishingsAuthorizations(projectId);
  // Widened from status:'draft' — hasLegacyEngagement needs the accepted rows
  // too, so this now filters client-side instead of at the query.
  const proposalsQuery = useProposals({ projectId });
  const createWave = useCreateFurnishingsAuthorization(projectId);
  const sendWave = useSendFurnishingsAuthorization(projectId);
  const [waveName, setWaveName] = useState("");
  const [sourceProposalId, setSourceProposalId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const proposals = proposalsQuery.data ?? [];
  const sourceProposals = proposals.filter(
    (proposal: any) =>
      proposal.status === "draft" &&
      proposal.document_kind !== "furnishings_authorization" &&
      proposal.document_kind !== "design_services",
  );
  // Legacy retirement: a project running on a signed pre-rail proposal reads
  // GRANDFATHERED, not "no agreement" — it has real history, just no
  // executed design-services origin for create_furnishing_wave_draft /
  // create_furnishings_authorization to require.
  const hasLegacyEngagement = proposals.some(
    (proposal: any) =>
      proposal.status === "accepted" &&
      (proposal.document_kind == null || proposal.document_kind === "legacy"),
  );

  const authority = authorityQuery.data ?? null;
  const authorityReady =
    authority != null &&
    (authority.state === "active" ||
      authority.state === "retainer_pending" ||
      authority.state === "exhausted");

  const create = async () => {
    setActionError(null);
    try {
      await createWave.mutateAsync({ waveName, sourceProposalId });
      setWaveName("");
      setSourceProposalId("");
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The wave could not be created.",
      );
    }
  };

  return (
    <div>
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
        Furnishings authorization waves
      </p>
      <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[var(--text-muted)]">
        Each named wave snapshots a draft furnishing proposal against the
        acknowledged budget checkpoint. It never creates another project.
      </p>

      {authorityQuery.isLoading || proposalsQuery.isLoading ? (
        <p className="mt-3 text-[11px] text-[var(--text-muted)]">
          Checking the project's design agreement…
        </p>
      ) : authorityQuery.isError ? (
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-terracotta)]">
          The agreement status could not load.{" "}
          <button
            type="button"
            onClick={() => authorityQuery.refetch()}
            className="underline underline-offset-2"
          >
            Retry
          </button>
        </p>
      ) : authorityReady ? (
        <>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1.3fr_auto]">
            <label className="text-[10px] text-[var(--text-muted)]">
              Wave name
              <Input
                className="mt-1"
                value={waveName}
                onChange={(event) => setWaveName(event.target.value)}
                placeholder="Living Room Essentials"
              />
            </label>
            <label className="text-[10px] text-[var(--text-muted)]">
              Draft furnishing proposal
              <div className="mt-1 flex items-center gap-2">
                <Select
                  className="flex-1"
                  value={sourceProposalId}
                  onChange={(event) => setSourceProposalId(event.target.value)}
                >
                  <option value="">Choose a project draft…</option>
                  {sourceProposals.map((proposal: any) => (
                    <option key={proposal.id} value={proposal.id}>
                      {proposal.title ?? "Untitled proposal"}
                    </option>
                  ))}
                </Select>
                <ProjectFurnishingDraftAction projectId={projectId} />
              </div>
            </label>
            <Button
              className="self-end"
              size="sm"
              loading={createWave.isPending}
              disabled={waveName.trim().length < 2 || !sourceProposalId}
              onClick={create}
            >
              Create wave
            </Button>
          </div>
          {!proposalsQuery.isLoading && sourceProposals.length === 0 && (
            <p className="mt-2 text-[10px] text-[var(--text-muted)]">
              Draft a furnishing proposal to begin.
            </p>
          )}
          {actionError && (
            <p
              role="alert"
              className="mt-2 text-[11px] text-[var(--color-terracotta)]"
            >
              {actionError}
            </p>
          )}
        </>
      ) : hasLegacyEngagement ? (
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
          This project was signed under the earlier agreement format.
          Furnishing authorization waves need a design agreement in place.
        </p>
      ) : (
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
          An executed design agreement is required before furnishing
          authorizations.
        </p>
      )}
      <div className="mt-4">
        {wavesQuery.isLoading && (
          <p className="text-[11px] text-[var(--text-muted)]">
            Loading authorization waves…
          </p>
        )}
        {wavesQuery.error && (
          <p
            role="alert"
            className="text-[11px] text-[var(--color-terracotta)]"
          >
            Authorization waves are unavailable.
          </p>
        )}
        {!wavesQuery.isLoading && (wavesQuery.data ?? []).length === 0 && (
          <p className="text-[11px] text-[var(--text-muted)]">
            No furnishings authorization waves yet.
          </p>
        )}
        {(wavesQuery.data ?? []).map((wave) => (
          <WaveDetail
            key={wave.documentId}
            wave={wave}
            sending={
              sendWave.isPending && sendWave.variables === wave.proposalId
            }
            onSend={async () => {
              setActionError(null);
              try {
                await sendWave.mutateAsync(wave.proposalId);
              } catch (error) {
                setActionError(
                  error instanceof Error
                    ? error.message
                    : "The wave could not be sent.",
                );
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function ProjectCommerceSection({ projectId }: { projectId: string }) {
  return (
    <section
      aria-label="Project commercial planning"
      className="mb-5 border border-[var(--doc-ink-border)] bg-[rgba(255,255,255,0.42)] px-4 py-4"
    >
      <BudgetEditor projectId={projectId} />
      <div className="my-5 border-t border-[var(--doc-ink-border)]" />
      <FurnishingsWaves projectId={projectId} />
    </section>
  );
}
