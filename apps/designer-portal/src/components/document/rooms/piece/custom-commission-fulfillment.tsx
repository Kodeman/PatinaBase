"use client";

import { useMemo, useState } from "react";
import { Textarea } from "@/components/ui/controls";
import { DocumentAction, DocumentActionGroup } from "../../document-action";

export type CommissionMilestoneType = "submittal" | "receiving" | "installed";

export interface CommissionMilestoneView {
  id: string;
  milestoneType: CommissionMilestoneType;
  status: string;
  evidence: Record<string, unknown>;
  artifacts: Array<Record<string, unknown>>;
  eventCount?: number;
  updatedAt: string;
}

export interface RecordCommissionMilestoneDraft {
  milestoneType: CommissionMilestoneType;
  status: "approved" | "received" | "installed" | "rejected";
  note: string;
  references: string[];
}

const STAGES: Array<{
  type: CommissionMilestoneType;
  label: string;
  prompt: string;
  completeStatus: "approved" | "received" | "installed";
  completeLabel: string;
  exceptionLabel: string;
}> = [
  {
    type: "submittal",
    label: "Submittal",
    prompt: "Record the reviewed shop drawing, sample, or finish control.",
    completeStatus: "approved",
    completeLabel: "Approve submittal",
    exceptionLabel: "Request revision",
  },
  {
    type: "receiving",
    label: "Receiving",
    prompt: "Record condition, quantity, damage, and delivery evidence.",
    completeStatus: "received",
    completeLabel: "Record received",
    exceptionLabel: "Record exception",
  },
  {
    type: "installed",
    label: "Installed truth",
    prompt: "Record the field-verified result, location, and final evidence.",
    completeStatus: "installed",
    completeLabel: "Confirm installed",
    exceptionLabel: "Record exception",
  },
];

function parseReferences(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

export function CustomCommissionFulfillment({
  milestones,
  isReady = true,
  isBusy = false,
  onRecord,
}: {
  milestones: CommissionMilestoneView[];
  isReady?: boolean;
  isBusy?: boolean;
  onRecord: (draft: RecordCommissionMilestoneDraft) => Promise<void>;
}) {
  const byType = useMemo(
    () =>
      new Map(
        milestones.map((milestone) => [milestone.milestoneType, milestone]),
      ),
    [milestones],
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const submittalApproved = byType.get("submittal")?.status === "approved";
  const receivingComplete = byType.get("receiving")?.status === "received";

  const available = (type: CommissionMilestoneType) =>
    isReady &&
    (type === "submittal" ||
      (type === "receiving" && submittalApproved) ||
      (type === "installed" && receivingComplete));

  const record = async (
    type: CommissionMilestoneType,
    status: RecordCommissionMilestoneDraft["status"],
  ) => {
    const note = notes[type]?.trim() ?? "";
    if (!note) {
      setFeedback("Add a short evidence note before recording this milestone.");
      return;
    }
    setFeedback(null);
    try {
      await onRecord({
        milestoneType: type,
        status,
        note,
        references: parseReferences(references[type] ?? ""),
      });
      setNotes((current) => ({ ...current, [type]: "" }));
      setReferences((current) => ({ ...current, [type]: "" }));
      setFeedback("Milestone recorded in the immutable commission ledger.");
    } catch (cause) {
      setFeedback(
        cause instanceof Error
          ? cause.message
          : "The milestone could not be recorded.",
      );
    }
  };

  return (
    <section className="mt-6 border-t border-[var(--color-pearl)] pt-5">
      <p className="doc-type-meta uppercase tracking-[0.1em] text-[var(--color-clay-ink)]">
        Workshop to field
      </p>
      <h3 className="mt-1 font-heading text-[17px] text-[var(--color-charcoal)]">
        Fulfillment ledger
      </h3>
      <p className="mt-1 max-w-[68ch] text-[11px] leading-relaxed text-[var(--text-muted)]">
        {isReady
          ? "Submittal approval, receiving evidence, and installed truth append to the issued promise. Earlier entries remain part of the audit trail."
          : "Link the issued commission to a purchase order before recording workshop or field evidence."}
      </p>

      <ol className="mt-4 space-y-3">
        {STAGES.map((stage, index) => {
          const milestone = byType.get(stage.type);
          const enabled = available(stage.type);
          const complete = milestone?.status === stage.completeStatus;
          return (
            <li
              key={stage.type}
              className={`border-l-2 pl-3 ${complete ? "border-[var(--color-sage)]" : enabled ? "border-[var(--color-clay)]" : "border-[var(--color-pearl)] opacity-60"}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[12px] font-semibold text-[var(--color-charcoal)]">
                  {index + 1}. {stage.label}
                </p>
                <span className="doc-type-meta uppercase tracking-[0.08em]">
                  {milestone?.status ?? (enabled ? "ready" : "waiting")}
                  {milestone?.updatedAt
                    ? ` · ${dateLabel(milestone.updatedAt)}`
                    : ""}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                {stage.prompt}
              </p>
              {enabled && !complete && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="text-[10px] text-[var(--text-muted)] sm:col-span-2">
                    Evidence note
                    <Textarea
                      rows={2}
                      className="mt-1"
                      value={notes[stage.type] ?? ""}
                      onChange={(event) =>
                        setNotes((current) => ({
                          ...current,
                          [stage.type]: event.target.value,
                        }))
                      }
                      placeholder="What was reviewed, received, or verified?"
                    />
                  </label>
                  <label className="text-[10px] text-[var(--text-muted)] sm:col-span-2">
                    Drawing, photo, or document references · one per line
                    <Textarea
                      rows={2}
                      className="mt-1"
                      value={references[stage.type] ?? ""}
                      onChange={(event) =>
                        setReferences((current) => ({
                          ...current,
                          [stage.type]: event.target.value,
                        }))
                      }
                      placeholder="A-602 rev 4 · receiving-photo-01.jpg"
                    />
                  </label>
                  <DocumentActionGroup
                    surfaceKey="piece"
                    regionKey={`commission-${stage.type}`}
                    className="sm:col-span-2"
                  >
                    <DocumentAction
                      actionKey={`record-${stage.type}-exception`}
                      variant="secondary"
                      disabled={isBusy}
                      onClick={() => void record(stage.type, "rejected")}
                    >
                      {stage.exceptionLabel}
                    </DocumentAction>
                    <DocumentAction
                      actionKey={`complete-${stage.type}`}
                      variant="primary"
                      disabled={isBusy}
                      onClick={() =>
                        void record(stage.type, stage.completeStatus)
                      }
                    >
                      {stage.completeLabel}
                    </DocumentAction>
                  </DocumentActionGroup>
                </div>
              )}
              {milestone && (milestone.eventCount ?? 0) > 0 && (
                <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                  {milestone.eventCount} immutable ledger
                  {milestone.eventCount === 1 ? " entry" : " entries"}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {feedback && (
        <p role="status" className="mt-3 text-[11px] text-[var(--text-muted)]">
          {feedback}
        </p>
      )}
    </section>
  );
}
