"use client";

import { useEffect, useMemo, useState } from "react";
import { Input, Select, Textarea } from "@/components/ui/controls";
import { DocumentAction, DocumentActionGroup } from "../../document-action";
import { RoomSheet } from "../room-sheet";
import { ConfigurationSnapshotCard } from "@/components/document/configuration-snapshot-card";
import {
  CustomCommissionFulfillment,
  type CommissionMilestoneView,
  type RecordCommissionMilestoneDraft,
} from "./custom-commission-fulfillment";
import {
  EMPTY_COMMISSION_BRIEF,
  canEditCommissionRevision,
  canIssueCommission,
  hasCommissionBriefErrors,
  normalizeCommissionStatus,
  parseDrawingReferences,
  validateCommissionBrief,
  type CommissionBriefDraft,
  type CommissionBriefErrors,
  type CommissionRevisionTransitionStatus,
} from "./custom-commission-model";

export interface CommissionProjectChoice {
  id: string;
  name: string;
}

export interface CommissionVendorChoice {
  id: string;
  name: string;
}

/** A view model deliberately kept at the adapter boundary. */
export interface CommissionWorkspaceRevision {
  id: string;
  configurationId: string;
  revisionNumber: number;
  status: string;
  brief: CommissionBriefDraft;
  snapshot: unknown;
  snapshotHash: string | null;
  lockedAt: string | null;
  transitionNote?: string | null;
  createdAt: string;
}

export interface SaveCommissionDraftResult {
  configurationId: string;
  revisionId: string;
}

export interface CustomCommissionWorkspaceProps {
  open: boolean;
  onClose: () => void;
  productName: string;
  projects: CommissionProjectChoice[];
  vendors: CommissionVendorChoice[];
  revisions: CommissionWorkspaceRevision[];
  initialProjectId?: string | null;
  isLoading?: boolean;
  isBusy?: boolean;
  error?: string | null;
  onSaveDraft: (
    brief: CommissionBriefDraft,
    previousRevisionId?: string,
  ) => Promise<SaveCommissionDraftResult>;
  onTransition: (
    revisionId: string,
    target: CommissionRevisionTransitionStatus,
    payload?: {
      note?: string;
      quote?: CommissionBriefDraft["quote"];
      approval?: { designerApproved: boolean; clientApproved: boolean };
    },
  ) => Promise<void>;
  onPrepareQuoteRequest: (
    configurationId: string,
    revisionId: string,
    brief: CommissionBriefDraft,
  ) => Promise<{ draftCreated: boolean; message: string }>;
  onPlaceApproved: (
    configurationId: string,
    projectId: string,
  ) => Promise<void>;
  onPromote: (configurationId: string) => Promise<void>;
  onStartNewCommission: () => void;
  onActiveRevisionChange?: (
    revision: CommissionWorkspaceRevision | null,
  ) => void;
  fulfillmentMilestones?: CommissionMilestoneView[];
  fulfillmentReady?: boolean;
  onRecordMilestone?: (draft: RecordCommissionMilestoneDraft) => Promise<void>;
}

function FieldLabel({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-[12px] text-[var(--text-muted)]">
      <span className="doc-type-meta mb-1 block uppercase tracking-[0.08em]">
        {label}
      </span>
      {children}
      {error && (
        <span className="mt-1 block text-[11px] text-[var(--color-terracotta)]">
          {error}
        </span>
      )}
    </label>
  );
}

function formatRevisionDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusLabel(status: string): string {
  return normalizeCommissionStatus(status).replaceAll("_", " ");
}

function Timeline({
  revisions,
  activeId,
  onSelect,
}: {
  revisions: CommissionWorkspaceRevision[];
  activeId: string | null;
  onSelect: (revision: CommissionWorkspaceRevision) => void;
}) {
  if (revisions.length === 0) {
    return (
      <p className="text-[11px] italic text-[var(--text-muted)]">
        No revisions yet. The first saved brief becomes revision 1.
      </p>
    );
  }
  return (
    <ol
      className="flex gap-2 overflow-x-auto pb-1"
      aria-label="Commission revisions"
    >
      {revisions.map((revision) => (
        <li key={revision.id} className="shrink-0">
          <button
            type="button"
            aria-pressed={revision.id === activeId}
            onClick={() => onSelect(revision)}
            className={`min-w-[126px] border-l-2 px-2.5 py-1.5 text-left transition-colors ${
              revision.id === activeId
                ? "border-[var(--color-clay)] bg-[rgba(196,165,123,0.08)]"
                : "border-[var(--color-pearl)] hover:border-[var(--color-aged-oak)]"
            }`}
          >
            <span className="doc-type-meta block uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Revision {revision.revisionNumber}
            </span>
            <span className="mt-0.5 block text-[11px] capitalize text-[var(--color-charcoal)]">
              {statusLabel(revision.status)}
            </span>
            <span className="block text-[9.5px] text-[var(--text-muted)]">
              {formatRevisionDate(revision.createdAt)}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/**
 * A project-first workshop for one-off cabinetry and furniture. Submitted,
 * quoted, and approved revisions render read-only; changing them always forks
 * a new draft. Placement is an explicit act that locks the approved snapshot.
 */
export function CustomCommissionWorkspace({
  open,
  onClose,
  productName,
  projects,
  vendors,
  revisions,
  initialProjectId = null,
  isLoading = false,
  isBusy = false,
  error = null,
  onSaveDraft,
  onTransition,
  onPrepareQuoteRequest,
  onPlaceApproved,
  onPromote,
  onStartNewCommission,
  onActiveRevisionChange,
  fulfillmentMilestones = [],
  fulfillmentReady = false,
  onRecordMilestone,
}: CustomCommissionWorkspaceProps) {
  const orderedRevisions = useMemo(
    () => [...revisions].sort((a, b) => b.revisionNumber - a.revisionNumber),
    [revisions],
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [startingNew, setStartingNew] = useState(false);
  const active = startingNew
    ? null
    : activeId
      ? (orderedRevisions.find((revision) => revision.id === activeId) ?? null)
      : (orderedRevisions[0] ?? null);
  const [brief, setBrief] = useState<CommissionBriefDraft>({
    ...EMPTY_COMMISSION_BRIEF,
    name: productName,
    projectId: initialProjectId ?? "",
  });
  const [errors, setErrors] = useState<CommissionBriefErrors>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [transitionNote, setTransitionNote] = useState("");
  const firstProjectId = projects[0]?.id;

  useEffect(() => {
    onActiveRevisionChange?.(active);
  }, [active, onActiveRevisionChange]);

  useEffect(() => {
    if (!open) return;
    if (startingNew) return;
    // A mutation may return the next revision id before its invalidated query
    // refetch arrives. Keep the current draft on screen during that gap rather
    // than snapping back to the previous immutable revision.
    if (activeId && !active) return;
    if (active) {
      setBrief(active.brief);
      setActiveId(active.id);
    } else {
      setBrief({
        ...EMPTY_COMMISSION_BRIEF,
        name: productName,
        projectId: initialProjectId ?? firstProjectId ?? "",
      });
    }
    setErrors({});
    setFeedback(null);
    setTransitionNote("");
    // A newly returned revision must reseed the form; project/product defaults
    // are stable inputs for the no-revision case.
  }, [
    active,
    activeId,
    firstProjectId,
    initialProjectId,
    open,
    productName,
    startingNew,
  ]);

  const status = active ? normalizeCommissionStatus(active.status) : "draft";
  const editable = !active || canEditCommissionRevision(active.status);
  const set = <K extends keyof CommissionBriefDraft>(
    key: K,
    value: CommissionBriefDraft[K],
  ) => setBrief((current) => ({ ...current, [key]: value }));
  const setDimension = (
    key: keyof CommissionBriefDraft["dimensions"],
    value: string,
  ) =>
    setBrief((current) => ({
      ...current,
      dimensions: { ...current.dimensions, [key]: value },
    }));
  const setQuote = (key: keyof CommissionBriefDraft["quote"], value: string) =>
    setBrief((current) => ({
      ...current,
      quote: { ...current.quote, [key]: value },
    }));

  const selectRevision = (revision: CommissionWorkspaceRevision) => {
    setStartingNew(false);
    setActiveId(revision.id);
    setBrief(revision.brief);
    setErrors({});
    setFeedback(null);
  };

  const validate = (): boolean => {
    const next = validateCommissionBrief(brief);
    setErrors(next);
    return !hasCommissionBriefErrors(next);
  };

  const saveDraft = async (): Promise<SaveCommissionDraftResult | null> => {
    if (!validate()) return null;
    setFeedback(null);
    try {
      const result = await onSaveDraft(brief, active?.id);
      setStartingNew(false);
      setActiveId(result.revisionId);
      setFeedback("Draft saved. Nothing was sent outside the studio.");
      return result;
    } catch (cause) {
      setFeedback(
        cause instanceof Error
          ? cause.message
          : "The draft could not be saved.",
      );
      return null;
    }
  };

  const transition = async (
    target: CommissionRevisionTransitionStatus,
    success: string,
  ) => {
    let revisionId: string | null = active?.id ?? null;
    if (status === "draft") {
      const saved = await saveDraft();
      revisionId = saved?.revisionId ?? null;
    }
    if (!revisionId) return;
    setFeedback(null);
    try {
      await onTransition(revisionId, target, {
        note: transitionNote.trim() || undefined,
        ...(target === "approved"
          ? {
              approval: {
                designerApproved: brief.designerApproval === "approved",
                clientApproved: brief.clientApproval === "approved",
              },
            }
          : {}),
      });
      setTransitionNote("");
      setFeedback(success);
    } catch (cause) {
      setFeedback(
        cause instanceof Error
          ? cause.message
          : "The revision could not move forward.",
      );
    }
  };

  const recordQuote = async () => {
    if (!active) return;
    const validation = validateCommissionBrief(brief);
    if (!brief.quote.tradeAmount.trim()) {
      validation.tradeQuote =
        "Add the workshop cost before recording the quote.";
    }
    if (!brief.quote.retailAmount.trim()) {
      validation.retailQuote =
        "Add the client quoted price before recording the quote.";
    }
    if (validation.tradeQuote || validation.retailQuote) {
      setErrors(validation);
      return;
    }
    setFeedback(null);
    try {
      await onTransition(active.id, "quoted", {
        note: transitionNote.trim() || "Quote recorded by designer",
        quote: brief.quote,
      });
      setFeedback(
        "Quote revision recorded. It remains inside the studio until review.",
      );
    } catch (cause) {
      setFeedback(
        cause instanceof Error
          ? cause.message
          : "The quote could not be recorded.",
      );
    }
  };

  const prepareQuoteRequest = async () => {
    const saved = await saveDraft();
    if (!saved) return;
    setFeedback(null);
    try {
      await onTransition(saved.revisionId, "submitted", {
        note: transitionNote.trim() || "Prepared for quote review",
      });
      const rfq = await onPrepareQuoteRequest(
        saved.configurationId,
        saved.revisionId,
        brief,
      );
      setTransitionNote("");
      setFeedback(rfq.message);
    } catch (cause) {
      setFeedback(
        cause instanceof Error
          ? cause.message
          : "The commission was saved, but quote review could not be prepared.",
      );
    }
  };

  const forkRevision = async () => {
    setFeedback(null);
    try {
      const nextBrief: CommissionBriefDraft = {
        ...brief,
        designerApproval: "pending",
        clientApproval: "pending",
      };
      const result = await onSaveDraft(nextBrief, active?.id);
      setActiveId(result.revisionId);
      setBrief(nextBrief);
      setFeedback("New draft started. The earlier revision remains unchanged.");
    } catch (cause) {
      setFeedback(
        cause instanceof Error
          ? cause.message
          : "A new revision could not be started.",
      );
    }
  };

  const startNewCommission = () => {
    setStartingNew(true);
    setActiveId(null);
    setBrief({
      ...EMPTY_COMMISSION_BRIEF,
      name: productName,
      projectId: firstProjectId ?? "",
    });
    setErrors({});
    setFeedback(
      "New project commission started. Earlier records remain unchanged.",
    );
    onStartNewCommission();
  };

  const issue = async () => {
    if (!active || !canIssueCommission(brief)) {
      setFeedback("Record both designer and client approval before issuing.");
      return;
    }
    try {
      await onPlaceApproved(active.configurationId, brief.projectId);
      setFeedback(
        "Issued to the project. This snapshot is locked for ordering.",
      );
    } catch (cause) {
      setFeedback(
        cause instanceof Error
          ? cause.message
          : "The commission could not be issued.",
      );
    }
  };

  const promote = async () => {
    if (!active) return;
    setFeedback(null);
    try {
      await onPromote(active.configurationId);
      setFeedback(
        "Saved as a reusable Library family. The project commission remains unchanged.",
      );
    } catch (cause) {
      setFeedback(
        cause instanceof Error
          ? cause.message
          : "The commission could not be saved to the Library.",
      );
    }
  };

  return (
    <RoomSheet
      open={open}
      onClose={onClose}
      title={`Custom commission · ${productName}`}
    >
      <header className="border-b border-[var(--color-pearl)] pb-4">
        <p className="doc-type-meta uppercase tracking-[0.12em] text-[var(--color-clay)]">
          Made to measure
        </p>
        <h2 className="mt-1 font-heading text-[1.55rem] leading-tight text-[var(--color-charcoal)]">
          Custom commission
        </h2>
        <p className="mt-1 max-w-[64ch] text-[0.78rem] leading-relaxed text-[var(--color-aged-oak)]">
          Keep the field dimensions, workshop quote, drawings, and approvals in
          one project record. Submitted work is preserved; changes begin a new
          revision.
        </p>
      </header>

      <section className="border-b border-[var(--color-pearl)] py-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="doc-type-meta uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Revision ledger
          </p>
          <DocumentAction
            actionKey="start-another-custom-commission"
            surfaceKey="piece"
            regionKey="custom-commission-ledger"
            variant="secondary"
            disabled={isBusy}
            onClick={startNewCommission}
          >
            New project commission
          </DocumentAction>
        </div>
        <Timeline
          revisions={orderedRevisions}
          activeId={active?.id ?? null}
          onSelect={selectRevision}
        />
      </section>

      {isLoading ? (
        <p className="py-10 text-center font-heading italic text-[var(--color-aged-oak)]">
          Reading the commission record…
        </p>
      ) : (
        <div className="grid gap-6 py-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            {!editable && (
              <div className="mb-4 border-l-2 border-[var(--color-dusty-blue)] pl-3 text-[11px] text-[var(--text-muted)]">
                Revision {active?.revisionNumber} is {statusLabel(status)} and
                cannot be overwritten. Start a new revision to change the brief.
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <FieldLabel label="Project" error={errors.projectId}>
                <Select
                  value={brief.projectId}
                  onChange={(event) => set("projectId", event.target.value)}
                  disabled={!editable}
                  invalid={!!errors.projectId}
                >
                  <option value="">Choose a project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </FieldLabel>
              <FieldLabel label="Commission name" error={errors.name}>
                <Input
                  value={brief.name}
                  onChange={(event) => set("name", event.target.value)}
                  disabled={!editable}
                  invalid={!!errors.name}
                />
              </FieldLabel>
            </div>

            <div className="mt-3">
              <FieldLabel label="Intent & scope">
                <Textarea
                  rows={3}
                  value={brief.scope}
                  onChange={(event) => set("scope", event.target.value)}
                  disabled={!editable}
                  placeholder="Wall-to-wall cabinetry, integrated desk, cable access, reveal lines…"
                />
              </FieldLabel>
            </div>

            <fieldset className="mt-5 border-t border-[var(--color-pearl)] pt-4">
              <legend className="font-heading text-[15px] text-[var(--color-charcoal)]">
                Field dimensions
              </legend>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(["width", "depth", "height"] as const).map((dimension) => (
                  <FieldLabel
                    key={dimension}
                    label={dimension}
                    error={errors.dimensions}
                  >
                    <Input
                      inputMode="decimal"
                      value={brief.dimensions[dimension]}
                      onChange={(event) =>
                        setDimension(dimension, event.target.value)
                      }
                      disabled={!editable}
                      invalid={!!errors.dimensions}
                    />
                  </FieldLabel>
                ))}
                <FieldLabel label="Unit">
                  <Select
                    value={brief.dimensions.unit}
                    onChange={(event) =>
                      setDimension("unit", event.target.value)
                    }
                    disabled={!editable}
                  >
                    <option value="in">inches</option>
                    <option value="mm">millimeters</option>
                  </Select>
                </FieldLabel>
              </div>
              <div className="mt-3">
                <FieldLabel label="Site conditions & measurement notes">
                  <Textarea
                    rows={2}
                    value={brief.dimensions.siteNotes}
                    onChange={(event) =>
                      setDimension("siteNotes", event.target.value)
                    }
                    disabled={!editable}
                    placeholder="Field verify after flooring; north wall is 3/8 in out of plumb…"
                  />
                </FieldLabel>
              </div>
            </fieldset>

            <fieldset className="mt-5 border-t border-[var(--color-pearl)] pt-4">
              <legend className="font-heading text-[15px] text-[var(--color-charcoal)]">
                Workshop brief
              </legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <FieldLabel label="Material" error={errors.material}>
                  <Input
                    value={brief.material}
                    onChange={(event) => set("material", event.target.value)}
                    disabled={!editable}
                    invalid={!!errors.material}
                    placeholder="rift-sawn white oak"
                  />
                </FieldLabel>
                <FieldLabel label="Finish" error={errors.finish}>
                  <Input
                    value={brief.finish}
                    onChange={(event) => set("finish", event.target.value)}
                    disabled={!editable}
                    invalid={!!errors.finish}
                    placeholder="hand-rubbed clear oil"
                  />
                </FieldLabel>
                <FieldLabel
                  label="Fabricator directory"
                  error={errors.fabricator}
                >
                  <Select
                    value={brief.fabricatorVendorId}
                    onChange={(event) => {
                      const vendor = vendors.find(
                        (item) => item.id === event.target.value,
                      );
                      set("fabricatorVendorId", event.target.value);
                      if (vendor) set("fabricator", vendor.name);
                    }}
                    disabled={!editable}
                    invalid={!!errors.fabricator}
                  >
                    <option value="">Maker not in directory</option>
                    {vendors.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </option>
                    ))}
                  </Select>
                </FieldLabel>
                <FieldLabel label="Fabricator name" error={errors.fabricator}>
                  <Input
                    value={brief.fabricator}
                    onChange={(event) => set("fabricator", event.target.value)}
                    disabled={!editable}
                    invalid={!!errors.fabricator}
                    placeholder="workshop or maker"
                  />
                </FieldLabel>
              </div>
              <div className="mt-3">
                <FieldLabel label="Drawing & attachment references">
                  <Textarea
                    rows={3}
                    value={brief.drawingReferences.join("\n")}
                    onChange={(event) =>
                      set(
                        "drawingReferences",
                        parseDrawingReferences(event.target.value),
                      )
                    }
                    disabled={!editable}
                    placeholder={
                      "A-602 rev 3\nSK-14 desk reveal\nsite-measure-2026-08-02.pdf"
                    }
                  />
                </FieldLabel>
              </div>
            </fieldset>

            <fieldset className="mt-5 border-t border-[var(--color-pearl)] pt-4">
              <legend className="font-heading text-[15px] text-[var(--color-charcoal)]">
                Allowance & quote
              </legend>
              <label className="mt-2 flex items-center gap-2 text-[11px] text-[var(--color-charcoal)]">
                <input
                  type="checkbox"
                  checked={brief.priceOnRequest}
                  onChange={(event) =>
                    set("priceOnRequest", event.target.checked)
                  }
                  disabled={!editable}
                  className="h-4 w-4 accent-[var(--color-clay)]"
                />
                Price on request until the workshop quote is recorded
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <FieldLabel label="Project allowance" error={errors.price}>
                  <Input
                    inputMode="decimal"
                    value={brief.allowance}
                    onChange={(event) => set("allowance", event.target.value)}
                    disabled={!editable}
                    placeholder="$28,500"
                  />
                </FieldLabel>
                <FieldLabel label="Quote reference">
                  <Input
                    value={brief.quote.reference}
                    onChange={(event) =>
                      setQuote("reference", event.target.value)
                    }
                    disabled={status !== "submitted"}
                  />
                </FieldLabel>
                <FieldLabel label="Workshop cost" error={errors.tradeQuote}>
                  <Input
                    inputMode="decimal"
                    value={brief.quote.tradeAmount}
                    onChange={(event) =>
                      setQuote("tradeAmount", event.target.value)
                    }
                    disabled={status !== "submitted"}
                    invalid={!!errors.tradeQuote}
                  />
                </FieldLabel>
                <FieldLabel
                  label="Client quoted price"
                  error={errors.retailQuote}
                >
                  <Input
                    inputMode="decimal"
                    value={brief.quote.retailAmount}
                    onChange={(event) =>
                      setQuote("retailAmount", event.target.value)
                    }
                    disabled={status !== "submitted"}
                    invalid={!!errors.retailQuote}
                  />
                </FieldLabel>
                <FieldLabel label="Lead time · weeks">
                  <Input
                    inputMode="numeric"
                    value={brief.quote.leadTimeWeeks}
                    onChange={(event) =>
                      setQuote("leadTimeWeeks", event.target.value)
                    }
                    disabled={status !== "submitted"}
                  />
                </FieldLabel>
                <FieldLabel label="Quote valid until">
                  <Input
                    type="date"
                    value={brief.quote.validUntil}
                    onChange={(event) =>
                      setQuote("validUntil", event.target.value)
                    }
                    disabled={status !== "submitted"}
                  />
                </FieldLabel>
              </div>
            </fieldset>

            {status === "client_review" && (
              <fieldset className="mt-5 border-l-2 border-[var(--color-clay)] pl-3">
                <legend className="font-heading text-[15px] text-[var(--color-charcoal)]">
                  Approval record
                </legend>
                <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                  Both approvals are required before the configuration can be
                  locked for the project or a purchase order.
                </p>
                <div className="mt-2 flex flex-wrap gap-4">
                  {(["designerApproval", "clientApproval"] as const).map(
                    (key) => (
                      <label
                        key={key}
                        className="flex items-center gap-2 text-[11px] text-[var(--color-charcoal)]"
                      >
                        <input
                          type="checkbox"
                          checked={brief[key] === "approved"}
                          onChange={(event) =>
                            set(
                              key,
                              event.target.checked ? "approved" : "pending",
                            )
                          }
                          className="h-4 w-4 accent-[var(--color-clay)]"
                        />
                        {key === "designerApproval"
                          ? "Designer approved"
                          : "Client approved"}
                      </label>
                    ),
                  )}
                </div>
              </fieldset>
            )}
          </div>

          <aside className="min-w-0 border-l border-[var(--color-pearl)] pl-4">
            <p className="doc-type-meta uppercase tracking-[0.09em] text-[var(--text-muted)]">
              Handoff
            </p>
            {active ? (
              <div className="mt-2">
                <ConfigurationSnapshotCard
                  snapshot={active.snapshot}
                  configurationHash={active.snapshotHash}
                  lockedAt={active.lockedAt}
                  label="Project configuration"
                />
              </div>
            ) : (
              <p className="doc-type-body mt-2 italic text-[var(--text-muted)]">
                Save the first draft to establish its revision and snapshot
                hash.
              </p>
            )}
            <p className="doc-type-body mt-4 leading-relaxed text-[var(--text-muted)]">
              The same frozen configuration follows the FF&amp;E line, spec
              book, quote review, and purchase order. Library edits never
              rewrite an issued record.
            </p>
            {status === "approved" && (
              <DocumentActionGroup
                surfaceKey="piece"
                regionKey="custom-commission-handoff"
                className="mt-4 flex-col items-stretch"
              >
                <DocumentAction
                  actionKey="issue-custom-commission"
                  variant="primary"
                  disabled={isBusy || !canIssueCommission(brief)}
                  onClick={() => void issue()}
                >
                  Issue to project
                </DocumentAction>
                <DocumentAction
                  actionKey="promote-custom-commission"
                  variant="secondary"
                  disabled={isBusy}
                  onClick={() => void promote()}
                >
                  Save as Library family
                </DocumentAction>
              </DocumentActionGroup>
            )}
          </aside>
        </div>
      )}

      {status === "issued" && onRecordMilestone && (
        <CustomCommissionFulfillment
          milestones={fulfillmentMilestones}
          isReady={fulfillmentReady}
          isBusy={isBusy}
          onRecord={onRecordMilestone}
        />
      )}

      <footer className="sticky bottom-0 -mx-6 border-t border-[var(--color-pearl)] bg-[var(--doc-paper)] px-6 py-3 sm:-mx-9 sm:px-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {(feedback || error) && (
              <p
                role={error ? "alert" : "status"}
                className={`text-[12px] ${error ? "text-[var(--color-terracotta)]" : "text-[var(--text-muted)]"}`}
              >
                {error ?? feedback}
              </p>
            )}
          </div>
          <DocumentActionGroup
            surfaceKey="piece"
            regionKey="custom-commission-actions"
          >
            {status === "draft" && (
              <>
                <DocumentAction
                  actionKey="save-custom-commission-draft"
                  variant="secondary"
                  disabled={isBusy}
                  onClick={() => void saveDraft()}
                >
                  Save draft
                </DocumentAction>
                <DocumentAction
                  actionKey="submit-custom-commission"
                  variant="primary"
                  disabled={isBusy}
                  onClick={() => void prepareQuoteRequest()}
                >
                  Prepare quote request
                </DocumentAction>
              </>
            )}
            {status === "submitted" && (
              <DocumentAction
                actionKey="record-custom-commission-quote"
                variant="primary"
                disabled={
                  isBusy ||
                  !brief.quote.tradeAmount.trim() ||
                  !brief.quote.retailAmount.trim()
                }
                onClick={() => void recordQuote()}
              >
                Record quote revision
              </DocumentAction>
            )}
            {status === "quoted" && active && (
              <DocumentAction
                actionKey="send-custom-commission-to-client-review"
                variant="primary"
                disabled={isBusy}
                onClick={() =>
                  void transition(
                    "client_review",
                    "Ready for designer and client approval.",
                  )
                }
              >
                Begin client review
              </DocumentAction>
            )}
            {status === "client_review" && active && (
              <>
                <DocumentAction
                  actionKey="request-custom-commission-revision"
                  variant="secondary"
                  disabled={isBusy}
                  onClick={() =>
                    void transition(
                      "rejected",
                      "Changes requested. Start a new revision to continue.",
                    )
                  }
                >
                  Request revision
                </DocumentAction>
                <DocumentAction
                  actionKey="approve-custom-commission"
                  variant="primary"
                  disabled={isBusy || !canIssueCommission(brief)}
                  onClick={() =>
                    void transition(
                      "approved",
                      "Approved. The snapshot is ready to issue.",
                    )
                  }
                >
                  Record both approvals
                </DocumentAction>
              </>
            )}
            {!editable && status !== "client_review" && (
              <DocumentAction
                actionKey="revise-custom-commission"
                variant="secondary"
                disabled={isBusy}
                onClick={() => void forkRevision()}
              >
                Start new revision
              </DocumentAction>
            )}
            <DocumentAction
              actionKey="close-custom-commission"
              variant="tertiary"
              disabled={isBusy}
              onClick={onClose}
            >
              Close
            </DocumentAction>
          </DocumentActionGroup>
        </div>
      </footer>
    </RoomSheet>
  );
}
