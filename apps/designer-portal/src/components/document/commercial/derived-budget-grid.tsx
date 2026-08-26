"use client";

/**
 * DerivedBudgetGrid — the working budget as a Room × Category grid whose
 * rows come from the live FF&E schedule, not manual entry.
 *
 *   Room · Category · Scheduled · Target · Authorized
 *
 * Scheduled and Authorized are muted, server-stamped figures (see the
 * "Scheduled/Authorized source" note on mapWorkingBudget in
 * lib/document/project-commerce.ts for why they are read rather than
 * recomputed client-side). Target is the one clay-editable figure — the
 * studio's own planning number for that room × category, written directly
 * via useSetBudgetTargets.
 *
 * Head acts: "Sync from the schedule" (useDeriveWorkingBudget) replaces the
 * draft version's rows with a fresh derive; "Publish checkpoint" freezes the
 * current draft into an immutable snapshot. The checkpoint history list is
 * carried over from the retired BudgetEditor.
 */

import { useEffect, useState } from "react";
import { Button, Input, Textarea } from "@/components/ui/controls";
import { DocumentAction, DocumentActionGroup } from "../document-action";
import {
  useDeriveWorkingBudget,
  useOverrideBudgetCheckpoint,
  usePublishBudgetCheckpoint,
  useProjectBillingAuthority,
  useReplayCommercialNotification,
  useSetBudgetTargets,
  useWorkingBudget,
} from "@/hooks/use-commercial-documents";
import {
  money,
  when,
  type WorkingBudgetLineView,
} from "@/lib/document/project-commerce";
import { SectionLoadingLine } from "../section-loading-line";

function TargetCell({
  versionId,
  line,
  editable,
  onSave,
  saving,
}: {
  versionId: string;
  line: WorkingBudgetLineView;
  editable: boolean;
  onSave: (targetCents: number) => void;
  saving: boolean;
}) {
  const [value, setValue] = useState(String(line.targetCents / 100));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(String(line.targetCents / 100));
  }, [line.targetCents]);

  if (!editable) {
    return (
      <span className="font-medium text-[var(--color-charcoal)]">
        {money(line.targetCents)}
      </span>
    );
  }

  const commit = () => {
    const dollars = Number(value);
    if (!Number.isFinite(dollars) || dollars < 0) {
      setError("Enter zero or more.");
      return;
    }
    setError(null);
    const nextCents = Math.round(dollars * 100);
    if (nextCents === line.targetCents) return;
    onSave(nextCents);
  };

  return (
    <label className="block">
      <span className="sr-only">Target for {line.roomName} · {line.category}</span>
      <Input
        className="w-28 text-right font-mono text-[11px] focus:border-[var(--color-clay)]"
        type="number"
        min="0"
        step="1"
        inputMode="decimal"
        value={value}
        invalid={Boolean(error)}
        disabled={saving}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        aria-label={`Target for ${line.roomName || "Unassigned"} · ${line.category}`}
        data-version-id={versionId}
      />
      {error && (
        <span role="alert" className="mt-1 block text-[9.5px] text-[var(--color-terracotta-ink)]">
          {error}
        </span>
      )}
    </label>
  );
}

export function DerivedBudgetGrid({ projectId }: { projectId: string }) {
  const budgetQuery = useWorkingBudget(projectId);
  const authorityQuery = useProjectBillingAuthority(projectId);
  const deriveBudget = useDeriveWorkingBudget(projectId);
  const publish = usePublishBudgetCheckpoint(projectId);
  const override = useOverrideBudgetCheckpoint(projectId);
  const setTarget = useSetBudgetTargets(projectId);
  const replayNotification = useReplayCommercialNotification();

  const [actionError, setActionError] = useState<string | null>(null);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [showOverride, setShowOverride] = useState(false);
  const [savingLineId, setSavingLineId] = useState<string | null>(null);

  const budget = budgetQuery.data;
  const version = budget?.version ?? null;
  const checkpoint = budget?.checkpoint ?? null;
  const agreementId = authorityQuery.data?.agreementId ?? null;
  const editable = version?.state === "draft";

  if (budgetQuery.isLoading) {
    return <SectionLoadingLine label="Loading working budget" />;
  }

  if (budgetQuery.error) {
    return (
      <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
        The project working budget is unavailable.
      </p>
    );
  }

  const syncFromSchedule = async () => {
    setActionError(null);
    try {
      await deriveBudget.mutateAsync();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The schedule could not be synced into the budget.",
      );
    }
  };

  const publishCheckpoint = async () => {
    if (!version || version.state !== "draft" || !agreementId) return;
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

  const saveTarget = async (line: WorkingBudgetLineView, targetCents: number) => {
    if (!version) return;
    setActionError(null);
    setSavingLineId(line.id);
    try {
      await setTarget.mutateAsync({
        versionId: version.id,
        lineId: line.id,
        targetCents,
      });
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "The target could not be saved.",
      );
    } finally {
      setSavingLineId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
            Working budget{" "}
            {version ? `· version ${version.version}` : "· not started"}
          </p>
          <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[var(--text-muted)]">
            Scheduled and Authorized reflect the schedule as of the last sync —
            Target is the studio&rsquo;s own figure. Planning only; this budget
            grants no purchasing authority.
          </p>
        </div>
        {/* Both stay secondary weight: the Money head's "Draw an invoice" is
            this region's one inked leader (C7), and a working budget grants no
            purchasing authority — neither act may outrank it. */}
        <DocumentActionGroup
          surfaceKey="open-document"
          regionKey="working-budget"
          aria-label="Working budget actions"
        >
          <DocumentAction
            actionKey="working-budget-sync"
            variant="secondary"
            loading={deriveBudget.isPending}
            onClick={syncFromSchedule}
          >
            Sync from the schedule
          </DocumentAction>
          {editable && (
            <DocumentAction
              actionKey="working-budget-publish"
              variant="secondary"
              disabled={publish.isPending || !agreementId || !version}
              loading={publish.isPending}
              onClick={publishCheckpoint}
            >
              Publish checkpoint
            </DocumentAction>
          )}
        </DocumentActionGroup>
      </div>

      {editable && !agreementId && (
        <p className="mt-2 text-[10px] text-[var(--text-muted)]">
          An executed design agreement is required before publishing.
        </p>
      )}

      {version && version.lines.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left text-[11px]">
            <thead className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
              <tr className="border-b border-[var(--doc-ink-border)]">
                <th className="py-2 pr-3">Room</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3 text-right">Scheduled</th>
                <th className="py-2 pr-3 text-right">Target</th>
                <th className="py-2 text-right">Authorized</th>
              </tr>
            </thead>
            <tbody>
              {version.lines.map((line) => (
                <tr
                  key={line.id}
                  className="border-b border-[var(--doc-ink-border)]/60"
                >
                  <td className="py-2 pr-3">{line.roomName || "Unassigned"}</td>
                  <td className="py-2 pr-3">{line.category}</td>
                  <td className="py-2 pr-3 text-right text-[var(--text-muted)]">
                    {money(line.scheduledCents)}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <TargetCell
                      versionId={version.id}
                      line={line}
                      editable={editable}
                      saving={setTarget.isPending && savingLineId === line.id}
                      onSave={(targetCents) => void saveTarget(line, targetCents)}
                    />
                  </td>
                  <td className="py-2 text-right text-[var(--text-muted)]">
                    {money(line.authorizedCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-[11px] text-[var(--text-muted)]">
          {version
            ? "This version has no rooms yet — sync from the schedule to populate it."
            : "No working budget yet — sync from the schedule to start one."}
        </p>
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
          {checkpoint.state === "open" && !showOverride && (
            <Button
              className="mt-2"
              size="sm"
              variant="ghost"
              onClick={() => setShowOverride(true)}
            >
              Record audited override
            </Button>
          )}
          {checkpoint.state === "open" && showOverride && (
            <div className="mt-3 max-w-xl">
              <label className="text-[10px] text-[var(--text-muted)]">
                Required reason
                <Textarea
                  className="mt-1"
                  value={overrideReason}
                  invalid={
                    overrideReason.length > 0 && overrideReason.trim().length < 5
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
        <p role="alert" className="mt-3 text-[11px] text-[var(--color-terracotta-ink)]">
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
