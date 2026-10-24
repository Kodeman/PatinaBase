"use client";

import { useEffect, useRef, useState } from "react";
import { formatCurrency } from "@patina/shared";
import {
  useAcknowledgeBudgetCheckpoint,
  useProjectWorkingBudget,
} from "@/hooks/use-commercial-client";
import type { WorkingBudgetVersion } from "@/lib/commercial-documents";

function coherentPublishedPlan(
  budget: WorkingBudgetVersion,
  projectId: string,
): boolean {
  const checkpoint = budget.checkpoint;
  if (!checkpoint) return false;
  return [
    budget.state === "published",
    budget.projectId === projectId,
    Boolean(budget.id),
    checkpoint.projectId === projectId,
    checkpoint.versionId === budget.id,
    Boolean(checkpoint.id),
    Boolean(checkpoint.checkpointCode),
    Boolean(checkpoint.evidenceFingerprint),
    Boolean(checkpoint.publishedAt),
    checkpoint.state !== "overridden",
    budget.lines.length > 0,
  ].every(Boolean);
}

function pendingBudgetCheckpoint(budget: WorkingBudgetVersion | null | undefined, projectId: string): string | null {
  return budget && coherentPublishedPlan(budget, projectId) && budget.checkpoint!.state !== "acknowledged"
    ? "the published spending plan" : null;
}

type BudgetReviewProps = { projectId: string; query: ReturnType<typeof useProjectWorkingBudget> };

function budgetReadReady(query: BudgetReviewProps['query']): boolean {
  return !query.isPending && !query.isLoading && !query.isFetching && !query.isError;
}

export function budgetCheckpointProjection(projectId: string, query: BudgetReviewProps['query']) {
  const ready = budgetReadReady(query);
  const ask = ready ? pendingBudgetCheckpoint(query.data, projectId) : null;
  return { ready, ask, showInMenu: Boolean(ask) || !ready };
}

export function BudgetCheckpointMenuAsk({ show }: { show: boolean }) {
  return show ? <li><a href="#budget-checkpoint">Published spending plan</a></li> : null;
}

export function BudgetCheckpointReview({ projectId, query }: BudgetReviewProps) {
  return <PublishedBudget key={projectId} projectId={projectId} query={query} />;
}

function PublishedBudget({ projectId, query }: BudgetReviewProps) {
  let content;
  if (query.isError) {
    content = (
      <>
        <p role="alert">
          The published spending plan could not be loaded. Nothing has been
          acknowledged.
        </p>
        <button type="button" onClick={() => void query.refetch()}>
          Reload spending plan
        </button>
      </>
    );
  } else if (query.isPending || query.isLoading || query.isFetching) {
    content = <p role="status">Loading the published spending plan…</p>;
  } else if (!query.data) {
    content = (
      <p>Your studio has not published a spending plan for review yet.</p>
    );
  } else if (!coherentPublishedPlan(query.data, projectId)) {
    content = (
      <p role="status">
        This spending plan is unavailable for acknowledgement. Ask your studio
        to check the published checkpoint.
      </p>
    );
  } else {
    const budget = query.data;
    content = (
      <PublishedPlan
        key={`${budget.id}:${budget.checkpoint!.id}:${budget.checkpoint!.evidenceFingerprint}`}
        projectId={projectId}
        budget={budget}
        reload={query.refetch}
      />
    );
  }
  return (
    <section
      id="budget-checkpoint"
      aria-label="Published spending plan"
      className="border-t border-[var(--border-default)] py-4"
    >
      <h2 className="t-h3">Published spending plan</h2>
      <p className="t-body my-3">
        A budget checkpoint records planning alignment with your studio. It is
        not a purchase approval, signature, or payment.
      </p>
      {content}
    </section>
  );
}

function PublishedPlan({
  projectId,
  budget,
  reload,
}: {
  projectId: string;
  budget: WorkingBudgetVersion;
  reload: () => Promise<unknown>;
}) {
  const acknowledge = useAcknowledgeBudgetCheckpoint(projectId);
  const checkpoint = budget.checkpoint!;
  const active = useRef(true);
  const acting = useRef(false);
  const [state, setState] = useState<
    "ready" | "pending" | "held" | "acknowledged"
  >("ready");
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const confirm = async () => {
    if (acting.current || state !== "ready") return;
    acting.current = true;
    setState("pending");
    try {
      await acknowledge.mutateAsync(checkpoint.id).then(
        () => {
          if (active.current) setState("acknowledged");
        },
        () => {
          if (active.current) setState("held");
        },
      );
    } finally {
      acting.current = false;
    }
  };
  const reloadPlan = async () => {
    if (acting.current) return;
    acting.current = true;
    try {
      await reload();
      // A new settled read remounts this exact-snapshot instrument. A failed
      // read must not silently re-enable the refused acknowledgement.
    } finally {
      acting.current = false;
    }
  };
  const money = (cents: number) => formatCurrency(cents, budget.currency);
  return (
    <>
      <p className="t-meta">
        Checkpoint {checkpoint.checkpointCode} · Version {budget.version} · ID{" "}
        {checkpoint.id}
      </p>
      <p className="t-meta">Published {checkpoint.publishedAt}</p>
      <div className="my-4 space-y-3">
        {budget.lines.map((line, index) => (
          <div key={index}>
            <h3 className="t-body">
              {line.roomName} · {line.category}
            </h3>
            <dl className="grid grid-cols-3 gap-2 t-meta">
              <div>
                <dt>Low</dt>
                <dd>{money(line.lowCents)}</dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd>{money(line.targetCents)}</dd>
              </div>
              <div>
                <dt>High</dt>
                <dd>{money(line.highCents)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <dl
        className="grid grid-cols-3 gap-2 t-body"
        aria-label="Published plan totals"
      >
        <div>
          <dt>Total low</dt>
          <dd>{money(budget.lowTotalCents)}</dd>
        </div>
        <div>
          <dt>Total target</dt>
          <dd>{money(budget.targetTotalCents)}</dd>
        </div>
        <div>
          <dt>Total high</dt>
          <dd>{money(budget.highTotalCents)}</dd>
        </div>
      </dl>
      {state === "acknowledged" || checkpoint.state === "acknowledged" ? (
        <p role="status" className="mt-3 t-body">
          You acknowledged this spending plan. Purchases still need their
          separate authorization.
        </p>
      ) : state === "held" ? (
        <div role="alert" className="mt-3 t-body">
          <p>
            This checkpoint could not be acknowledged. Reload and review the
            published plan before trying again.
          </p>
          <button type="button" onClick={reloadPlan}>
            Reload spending plan
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="mt-4 min-h-11 underline underline-offset-4"
          disabled={state === "pending"}
          onClick={confirm}
        >
          {state === "pending"
            ? "Acknowledging…"
            : "Acknowledge this spending plan"}
        </button>
      )}
    </>
  );
}
