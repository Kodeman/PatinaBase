"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useCreateSpecBookShare,
  usePrepareSpecBookIssue,
  useProjectFfeReadiness,
  useProjectV2,
  useRenderSpecBookArtifact,
  useSpecBookWorkbench,
  useUpdateProjectFfeSpec,
  useUpdateSpecBookItemSetting,
  type ProjectFfeSpec,
  type SpecBookArtifact,
  type SpecBookAudience,
  type SpecBookIssueType,
  type SpecBookWorkItem,
} from "@patina/supabase";
import type { FfeAssignmentScope } from "@patina/types";
import { Input, Select, Textarea } from "@/components/ui/controls";
import { DocumentAction } from "@/components/document/document-action";
import { EmptyState } from "@/components/document/empty-state";
import { useHydrated } from "@/hooks/use-hydrated";
import { useAssignLineRoom, useDocumentRooms } from "@/hooks/use-document-rooms";
import { useCanSeeMargin } from "@/hooks/use-can-see-margin";
import { specBookEvents } from "@/lib/analytics/spec-book-events";
import { resolveClientPortalOrigin } from "@/lib/client-portal-url";
import { ConfigurationSnapshotCard } from "@/components/document/configuration-snapshot-card";
import { DimensionFields } from "@/components/document/dimension-fields";
import { extractConfigurationSnapshotEnvelope } from "@/components/document/rooms/piece/custom-commission-model";
import {
  audienceAllows,
  buildNaDeclarationUpdate,
  displayResolvedValue,
  editableSpecSeed,
  hasIssuedDrift,
  resolveSpecValue,
  runSpecBookPreflight,
  type ResolvedSpecValue,
  type SpecField,
} from "@/lib/spec-books/model";

const AUDIENCES: Array<{
  id: SpecBookAudience;
  label: string;
  description: string;
  /** What the edition shows, in one sentence (the print preview). */
  sentence: string;
}> = [
  {
    id: "client",
    label: "Client",
    description: "Line, client pricing, care",
    sentence: "The client edition shows the piece, its room and the client note.",
  },
  {
    id: "vendor",
    label: "Vendor",
    description: "Order-facing facts",
    sentence: "The vendor edition shows the facts an order needs and the vendor note.",
  },
  {
    id: "installer",
    label: "Installer",
    description: "Location and install notes",
    sentence: "The installer edition shows where each piece goes and the install note.",
  },
  {
    id: "internal",
    label: "Internal",
    description: "Complete frozen record",
    sentence: "The internal edition is the complete frozen record.",
  },
  {
    id: "care",
    label: "Care",
    description: "Care and warranty only",
    sentence: "The care edition shows care and warranty only.",
  },
];

type WorkspaceView = "workbench" | "preview" | "preflight" | "history";
type DerivedReadiness = "ready" | "incomplete" | "checking" | "unavailable";
type ReadinessFilter = "all" | "ready" | "incomplete" | "unassigned" | "drift";

export function specBookArtifactRetryLabel(
  artifactStatus: SpecBookArtifact["status"],
  revisionStatus: string,
): "Render" | "Retry" | "Finalize" | null {
  if (artifactStatus === "pending") return "Render";
  if (artifactStatus === "failed") return "Retry";
  if (artifactStatus === "ready" && revisionStatus !== "issued") {
    return "Finalize";
  }
  return null;
}

/* US-28 S7b — the spec book (U-Q18; specimens/specbook-{1440,390}.html).
   State is an ink word (U-Q13): the word is the state, never a pigment, and a
   missing field names itself instead of hiding behind a tooltip.

   Readiness (get_project_ffe_readiness, 00733) names what a line lacks by
   schema key. No key ever reaches the screen: each known key has its plain
   words, listed in the order a designer settles them, and an unknown key is
   left unnamed (the line still reads Incomplete). */
const MISSING_WORDS = new Map<string, string>([
  ["finish", "No finish"],
  ["removed", "Removed"],
  ["releaseBlock", "On hold"],
  ["parent_not_ready", "Waits on its piece"],
  ["designDisposition", "Not chosen yet"],
  ["selection", "No library piece"],
  ["vendor", "No maker"],
  ["itemType", "Fixed or allowance not set"],
  ["clientPrice", "No client price"],
  ["allowanceCeiling", "No allowance ceiling"],
  ["quantity", "No quantity"],
  ["room", "No room"],
  ["name", "No name"],
  ["documentCode", "No document code"],
  ["image", "No image"],
  ["sku", "No SKU"],
  ["material", "No material"],
  ["color_fabric", "No colour / fabric"],
  ["colorFabric", "No colour / fabric"],
  ["selected_dimensions", "No dimensions"],
  ["dimensions", "No dimensions"],
  ["exact_location", "No location"],
  ["exactLocation", "No location"],
]);
const MISSING_ORDER = [...MISSING_WORDS.keys()];

/** What a line lacks, in plain words and settling order. */
function missingWords(missingFields: readonly string[]): string[] {
  const known = missingFields
    .filter((field) => MISSING_WORDS.has(field))
    .sort((a, b) => MISSING_ORDER.indexOf(a) - MISSING_ORDER.indexOf(b));
  return [...new Set(known.map((field) => MISSING_WORDS.get(field) as string))];
}

/** The line's finish is empty and not declared as not applying. */
function finishMissing(item: SpecBookWorkItem): boolean {
  const finish = resolveSpecValue(item, "finish");
  return finish.value == null && !finish.na;
}

const FACT_LABELS: Record<SpecField, string> = {
  sku: "SKU",
  finish: "Finish",
  material: "Material",
  color_fabric: "Colour / fabric",
  selected_dimensions: "Dimensions",
  exact_location: "Exact location",
};

const FACT_FIELDS: SpecField[] = [
  "sku",
  "finish",
  "material",
  "color_fabric",
  "selected_dimensions",
  "exact_location",
];

/** Where a fact comes from, in words (SPEC §S7b.4). */
const SOURCE_WORDS: Record<ResolvedSpecValue["source"], string> = {
  project_override: "Set for this job",
  ffe_line: "From the line",
  product_master: "From the library piece",
  studio_custom: "Not specified",
  declaration: "Does not apply",
};

/** The state word. A row names the first thing a line lacks and counts the
 *  rest; the opened piece (`full`) names them all. A line without a finish
 *  leads with "No finish", as its "Add a finish" act does (SPEC §S7b p1). */
function readinessWord(
  value: DerivedReadiness,
  missingFields: readonly string[] = [],
  item?: SpecBookWorkItem,
  full = false,
): { text: string; quiet: boolean } {
  switch (value) {
    case "ready":
      return { text: "Ready", quiet: false };
    case "checking":
      return { text: "Checking", quiet: true };
    case "unavailable":
      return { text: "Readiness unavailable", quiet: true };
    default: {
      const words = missingWords(
        item && finishMissing(item) ? ["finish", ...missingFields] : missingFields,
      );
      if (words.length === 0) return { text: "Incomplete", quiet: false };
      if (full || words.length === 1) {
        return { text: words.join(" · "), quiet: false };
      }
      return { text: `${words[0]} and ${words.length - 1} more`, quiet: false };
    }
  }
}

function ReadinessWord({
  status,
  missingFields = [],
  item,
  full = false,
}: {
  status: DerivedReadiness;
  missingFields?: readonly string[];
  item?: SpecBookWorkItem;
  full?: boolean;
}) {
  const word = readinessWord(status, missingFields, item, full);
  return (
    <span className={word.quiet ? "word word--quiet" : "word"}>
      {word.text}
    </span>
  );
}

function imageFor(item: SpecBookWorkItem): string | null {
  const selected = item.spec?.selected_media?.[0];
  if (typeof selected === "string") return selected;
  if (
    selected &&
    typeof selected === "object" &&
    "url" in selected &&
    typeof selected.url === "string"
  ) {
    return selected.url;
  }
  if (item.image_url) return item.image_url;
  const images = item.product?.images;
  return Array.isArray(images) && typeof images[0] === "string"
    ? images[0]
    : null;
}

/** SP-19/F57 — the id an FF&E line's `Edit spec details →` lands on. */
function specBookItemDomId(itemId: string) {
  return `spec-book-item-${itemId}`;
}

function specBookFoldDomId(itemId: string) {
  return `spec-book-fold-${itemId}`;
}

/** The line's room as the row's sentence says it. */
function roomWord(item: SpecBookWorkItem): string {
  if (item.room?.name) return item.room.name;
  return roomChoiceOf(item) === "throughout" ? "Throughout" : "No room yet";
}

/** Finish · maker · room: the row's one sentence (SPEC §S7b.4). */
function rowSentence(item: SpecBookWorkItem): string {
  const finishWord = finishMissing(item)
    ? "No finish yet"
    : displayResolvedValue(resolveSpecValue(item, "finish"));
  return [finishWord, item.vendor_name, roomWord(item)]
    .filter(Boolean)
    .join(" · ");
}

/** A piece as a ledger row: a plate where an image exists, the name that
 *  opens it in place, the sentence, the ink word, one tertiary act. */
function PieceRow({
  item,
  readiness,
  missingFields,
  open,
  drift,
  onOpen,
  onClose,
  nameRef,
}: {
  item: SpecBookWorkItem;
  readiness: DerivedReadiness;
  missingFields: readonly string[];
  open: boolean;
  drift: boolean;
  onOpen: (focusField?: SpecField) => void;
  onClose: () => void;
  nameRef?: (node: HTMLButtonElement | null) => void;
}) {
  const image = imageFor(item);
  const name = item.name ?? "Untitled item";
  // The readiness rules never name the finish; the line says it (SPEC §S7b p1).
  const needsFinish = finishMissing(item);
  return (
    <li className="lrow plain">
      <span className="lname">
        <span className="sb-piece">
          {image && (
            <span className="sb-thumb">
              <span className="plate">
                <img src={image} alt="" />
              </span>
            </span>
          )}
          <span>
            <button
              type="button"
              ref={nameRef}
              // SP-19/F57 — the address an `?ffeItemId=` arrival scrolls to.
              id={specBookItemDomId(item.id)}
              className="name t-d4 sb-name"
              aria-expanded={open}
              aria-controls={open ? specBookFoldDomId(item.id) : undefined}
              onClick={() => onOpen()}
            >
              {name}
            </button>
            {item.document_code && (
              <span className="t-meta sb-code">{item.document_code}</span>
            )}
          </span>
        </span>
      </span>
      <span className="lsent">{rowSentence(item)}</span>
      <span className="lwhen sb-words">
        <ReadinessWord
          status={readiness}
          missingFields={missingFields}
          item={item}
        />
        {drift && <span className="word">Changed since issue</span>}
      </span>
      <span className="lact">
        {open ? (
          <DocumentAction
            actionKey="spec-book-put-back"
            variant="tertiary"
            onClick={onClose}
          >
            Put back
          </DocumentAction>
        ) : (
          <DocumentAction
            actionKey={needsFinish ? "spec-book-add-finish" : "spec-book-open"}
            variant="tertiary"
            onClick={() => onOpen(needsFinish ? "finish" : undefined)}
          >
            {needsFinish ? "Add a finish" : "Open"}
          </DocumentAction>
        )}
      </span>
    </li>
  );
}

/** Is this a plain `{...}` object — never an array, string, number, or null?
 *  `selected_dimensions` is typed `Record<string, unknown> | null` but the
 *  jsonb column has carried legacy non-object values; the editor must tolerate
 *  those rather than pretend they're shaped like a fresh dimensions draft. */
function isDimensionsObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// The workbench selects `*` from project_ffe_items, so the line's scope is on
// the row even though SpecBookWorkItem does not name it.
function roomChoiceOf(item: SpecBookWorkItem): string {
  const scope = (item as SpecBookWorkItem & {
    assignment_scope?: FfeAssignmentScope | null;
  }).assignment_scope;
  if (scope === "room" && item.project_room_id) {
    return `room:${item.project_room_id}`;
  }
  return scope === "throughout" ? "throughout" : "unassigned";
}

/** The line's room, in the same three choices as the paper's unfold (R25). */
function LineRoomSelect({
  item,
  onAssigned,
}: {
  item: SpecBookWorkItem;
  onAssigned?: () => void;
}) {
  const { data: rooms } = useDocumentRooms(item.project_id);
  const assignRoom = useAssignLineRoom(item.project_id);
  const current = roomChoiceOf(item);
  const [chosen, setChosen] = useState<string | null>(null);

  // A refreshed row or a refused write both hand the select back to the row.
  // Only the turn into a refusal resets: a retry clears isError while its own
  // write is pending, and the select must keep the new choice until it lands.
  useEffect(() => setChosen(null), [current]);
  useEffect(() => {
    if (assignRoom.isError) setChosen(null);
  }, [assignRoom.isError]);
  useEffect(() => {
    if (assignRoom.isSuccess) onAssigned?.();
  }, [assignRoom.isSuccess, assignRoom.submittedAt, onAssigned]);

  return (
    <div className="mb-5">
      <label className="sb-label">
        Room
        <Select
          className="mt-1.5"
          value={chosen ?? current}
          disabled={assignRoom.isPending}
          onChange={(event) => {
            const value = event.target.value;
            const inRoom = value.startsWith("room:");
            setChosen(value);
            assignRoom.mutate({
              itemId: item.id,
              roomId: inRoom ? value.slice("room:".length) : null,
              assignmentScope: inRoom
                ? "room"
                : (value as "throughout" | "unassigned"),
            });
          }}
        >
          <option value="unassigned">Unassigned</option>
          <option value="throughout">Throughout</option>
          {(rooms ?? []).map((room) => (
            <option key={room.id} value={`room:${room.id}`}>
              {room.name}
            </option>
          ))}
        </Select>
      </label>
      {assignRoom.isError && (
        <p className="t-body-sm sb-warn">
          {assignRoom.error instanceof Error
            ? assignRoom.error.message
            : "The room could not be changed."}
        </p>
      )}
    </div>
  );
}

export function SelectionEditor({
  item,
  readiness = "checking",
  missingFields = [],
  onSaved,
  onRoomAssigned,
  heading,
  focusField,
  onClose,
  foot,
}: {
  item: SpecBookWorkItem;
  readiness?: DerivedReadiness;
  missingFields?: readonly string[];
  onSaved?: () => void;
  onRoomAssigned?: () => void;
  /** The fold's eyebrow lead: code · chapter. */
  heading?: string;
  /** "Add a finish" opens the fold on this field, focused. */
  focusField?: SpecField;
  /** "Put back · Esc": closes the fold. */
  onClose?: () => void;
  /** The fold's own acts after the save (preview, the edition check). */
  foot?: ReactNode;
}) {
  const fieldRefs = useRef<Partial<Record<string, HTMLInputElement | null>>>(
    {},
  );
  useEffect(() => {
    if (focusField) fieldRefs.current[focusField]?.focus();
  }, [focusField, item.id]);
  const updateSpec = useUpdateProjectFfeSpec();
  // R1: the trade price shows only to a viewer who may see margin.
  const canSeeMargin = useCanSeeMargin();
  const [draft, setDraft] = useState<Record<string, string>>(
    item.spec ? editableSpecSeed(item.spec) : {},
  );
  const [dimensionsValue, setDimensionsValue] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [rawDimensionsMode, setRawDimensionsMode] = useState(false);
  const [rawDimensionsText, setRawDimensionsText] = useState("");
  const [naField, setNaField] = useState<SpecField>("finish");
  const [naReason, setNaReason] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setDraft(item.spec ? editableSpecSeed(item.spec) : {});
    const raw: unknown = item.spec?.selected_dimensions ?? null;
    if (raw == null) {
      setDimensionsValue(null);
      setRawDimensionsMode(false);
      setRawDimensionsText("");
    } else if (isDimensionsObject(raw)) {
      setDimensionsValue(raw);
      setRawDimensionsMode(false);
      setRawDimensionsText(JSON.stringify(raw, null, 2));
    } else {
      // Legacy non-object value on file — tolerate it via the raw JSON
      // escape hatch rather than coercing it into a shape it never had.
      setDimensionsValue(null);
      setRawDimensionsMode(true);
      setRawDimensionsText(JSON.stringify(raw, null, 2));
    }
    setFeedback(null);
    // Keyed on the line and its spec, not the row: a room change refetches
    // the row and must not wipe a draft the designer has not saved.
  }, [item.id, item.spec]);

  const set = (field: string, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const switchToRawDimensions = () => {
    setRawDimensionsText(
      dimensionsValue ? JSON.stringify(dimensionsValue, null, 2) : "",
    );
    setRawDimensionsMode(true);
    setFeedback(null);
  };

  const switchToStructuredDimensions = () => {
    if (!rawDimensionsText.trim()) {
      setDimensionsValue(null);
      setRawDimensionsMode(false);
      setFeedback(null);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawDimensionsText);
    } catch {
      setFeedback(
        'Dimensions must be valid JSON, for example {"width":"32 in"}.',
      );
      return;
    }
    if (!isDimensionsObject(parsed)) {
      setFeedback(
        'The structured editor needs an object like {"width":"32 in"} — keep editing it as raw JSON, or clear the field and start fresh.',
      );
      return;
    }
    setDimensionsValue(parsed);
    setRawDimensionsMode(false);
    setFeedback(null);
  };

  const save = async () => {
    if (!item.spec) return;
    setFeedback(null);
    let dimensions: Record<string, unknown> | null = null;
    if (rawDimensionsMode) {
      if (rawDimensionsText.trim()) {
        try {
          dimensions = JSON.parse(rawDimensionsText);
        } catch {
          setFeedback(
            'Dimensions must be valid JSON, for example {"width":"32 in"}.',
          );
          return;
        }
      }
    } else {
      dimensions = dimensionsValue;
    }
    try {
      await updateSpec.mutateAsync({
        projectId: item.project_id,
        specId: item.spec.id,
        expectedRowVersion: item.spec.row_version,
        changes: {
          sku: draft.sku?.trim() || null,
          finish: draft.finish?.trim() || null,
          material: draft.material?.trim() || null,
          color_fabric: draft.color_fabric?.trim() || null,
          selected_dimensions: dimensions,
          exact_location: draft.exact_location?.trim() || null,
          client_notes: draft.client_notes?.trim() || null,
          trade_notes: draft.trade_notes?.trim() || null,
          install_notes: draft.install_notes?.trim() || null,
          care_notes: draft.care_notes?.trim() || null,
          warranty_notes: draft.warranty_notes?.trim() || null,
        },
      });
      setFeedback("Line saved.");
      onSaved?.();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Line could not be saved.",
      );
    }
  };

  const declareNa = async () => {
    if (!item.spec || !naReason.trim()) {
      setFeedback("An N/A declaration requires a reason.");
      return;
    }
    try {
      await updateSpec.mutateAsync({
        projectId: item.project_id,
        specId: item.spec.id,
        expectedRowVersion: item.spec.row_version,
        changes: {
          na_declarations: {
            ...item.spec.na_declarations,
            ...buildNaDeclarationUpdate(naField, naReason),
          },
        },
      });
      setNaReason("");
      setFeedback(`${naField.replaceAll("_", " ")} marked N/A.`);
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Declaration could not be saved.",
      );
    }
  };

  const putBack = onClose ? (
    <DocumentAction
      actionKey="spec-book-put-back-esc"
      variant="tertiary"
      onClick={onClose}
    >
      Put back · Esc
    </DocumentAction>
  ) : null;

  if (!item.spec) {
    return (
      <div className="sb-editor">
        <p className="sb-warn">
          This schedule line has no project line record. Route or repair it
          before editing; the product itself remains safe.
        </p>
        {putBack && <div className="sb-foot">{putBack}</div>}
      </div>
    );
  }


  const textFields = [
    ["sku", "SKU"],
    ["finish", "Finish"],
    ["material", "Material"],
    ["color_fabric", "Color / fabric"],
    ["exact_location", "Exact location"],
  ] as const;
  const configuration = extractConfigurationSnapshotEnvelope(item.spec);
  const configurationSnapshot =
    configuration?.snapshot && typeof configuration.snapshot === "object"
      ? (configuration.snapshot as Record<string, unknown>)
      : null;
  const isCustomConfiguration =
    configurationSnapshot?.configurationMode === "custom";
  const revisionClosed =
    Boolean(item.purchase_order_id) ||
    ["ordered", "production", "shipped", "delivered", "installed"].includes(
      item.status,
    ) ||
    isCustomConfiguration;
  const canReviseConfiguration =
    Boolean(configuration?.hash) && !revisionClosed;

  return (
    <div
      className="sb-editor"
      onKeyDown={(event) => {
        if (event.key === "Escape" && onClose) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <p className="eb sb-spec-head">
        {heading && <span>{heading}</span>}
        <span>Project line · v{item.spec.row_version}</span>
        <ReadinessWord
          status={readiness}
          missingFields={missingFields}
          item={item}
          full
        />
      </p>

      <dl className="sb-facts">
        {item.vendor_name && (
          <>
            <dt>Maker</dt>
            <dd>{item.vendor_name}</dd>
          </>
        )}
        {FACT_FIELDS.map((field) => {
          const resolved = resolveSpecValue(item, field);
          return (
            <Fragment key={field}>
              <dt>{FACT_LABELS[field]}</dt>
              <dd>
                {displayResolvedValue(resolved)}
                {/* An empty fact says "Not specified" once, with no source
                    under it (SPEC §S7b p3). */}
                {(resolved.value != null || resolved.na) && (
                  <span className="t-meta">
                    {SOURCE_WORDS[resolved.source]}
                    {resolved.verifiedAt
                      ? ` · verified ${new Date(resolved.verifiedAt).toLocaleDateString()}`
                      : ""}
                  </span>
                )}
              </dd>
            </Fragment>
          );
        })}
        {item.lead_time && (
          <>
            <dt>Lead time</dt>
            <dd>{item.lead_time}</dd>
          </>
        )}
        {canSeeMargin && item.trade_price_cents != null && (
          <>
            <dt>Trade price</dt>
            <dd>
              <span className="lfig">
                ${(item.trade_price_cents / 100).toFixed(2)}
              </span>
            </dd>
          </>
        )}
      </dl>

      {configuration && (
        <div className="sb-group">
          <ConfigurationSnapshotCard
            snapshot={configuration.snapshot}
            configurationHash={configuration.hash}
            approvedHash={configuration.approvedHash}
            lockedAt={configuration.lockedAt}
            label="Project product configuration"
          />
          {item.product_id && configuration.configurationId && (
            <div className="sb-foot">
              <p className="t-body-sm sb-help basis-full">
                {revisionClosed
                  ? "Released lines and their custom promises stay intact; changes begin on a new project line."
                  : "A replacement creates a new snapshot and returns this line to approval."}
              </p>
              <DocumentAction
                actionKey="spec-book-configuration"
                variant="tertiary"
                href={
                  !canReviseConfiguration
                    ? `/library/${item.product_id}`
                    : `/library/${item.product_id}?projectId=${encodeURIComponent(item.project_id)}&ffeItemId=${encodeURIComponent(item.id)}&configurationId=${encodeURIComponent(configuration.configurationId)}&snapshotHash=${encodeURIComponent(configuration.hash ?? "")}`
                }
              >
                {!canReviseConfiguration
                  ? "View source piece"
                  : "Review or revise configuration"}
              </DocumentAction>
            </div>
          )}
        </div>
      )}

      <section className="sb-group" aria-label="Edit the specification">
        <p className="eb sb-group-head">Edit the specification</p>
        <LineRoomSelect key={item.id} item={item} onAssigned={onRoomAssigned} />

        <div className="grid gap-4 sm:grid-cols-2">
          {textFields.map(([field, label]) => (
            <label key={field} className="sb-label">
              {label}
              <Input
                ref={(node) => {
                  fieldRefs.current[field] = node;
                }}
                className="mt-1.5"
                value={draft[field] ?? ""}
                onChange={(event) => set(field, event.target.value)}
              />
            </label>
          ))}
          <div className="sb-label sm:col-span-2">
            <span>Specified dimensions</span>
            <div className="mt-1.5 normal-case tracking-normal">
              {rawDimensionsMode ? (
                <div>
                  <Textarea
                    className="min-h-20 font-mono text-[12px]"
                    value={rawDimensionsText}
                    placeholder='{"width":"32 in","height":"30 in"}'
                    onChange={(event) =>
                      setRawDimensionsText(event.target.value)
                    }
                  />
                  <DocumentAction
                    actionKey="spec-book-dimension-fields"
                    variant="tertiary"
                    onClick={switchToStructuredDimensions}
                  >
                    Use dimension fields
                  </DocumentAction>
                </div>
              ) : (
                <div>
                  <DimensionFields
                    value={dimensionsValue}
                    onChange={setDimensionsValue}
                  />
                  <DocumentAction
                    actionKey="spec-book-dimension-json"
                    variant="tertiary"
                    onClick={switchToRawDimensions}
                  >
                    Advanced: edit dimensions as JSON
                  </DocumentAction>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {(
            [
              ["client_notes", "Client note"],
              ["trade_notes", "Vendor note"],
              ["install_notes", "Install note"],
              ["care_notes", "Care"],
              ["warranty_notes", "Warranty"],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="sb-label">
              {label}
              <Textarea
                className="mt-1.5 min-h-20"
                value={draft[field] ?? ""}
                onChange={(event) => set(field, event.target.value)}
              />
            </label>
          ))}
        </div>

        <div className="sb-group">
          <p className="sb-label">Mark field not applicable</p>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-[150px_1fr_auto] sm:items-center">
            <Select
              aria-label="Field that does not apply"
              value={naField}
              onChange={(event) => setNaField(event.target.value as SpecField)}
            >
              <option value="sku">SKU / product code</option>
              <option value="finish">Finish</option>
              <option value="material">Material</option>
              <option value="color_fabric">Color / fabric</option>
              <option value="selected_dimensions">Dimensions</option>
              <option value="exact_location">Location</option>
            </Select>
            <Input
              aria-label="Reason for not applicable"
              value={naReason}
              placeholder="Explain why this field does not apply"
              onChange={(event) => setNaReason(event.target.value)}
            />
            <DocumentAction
              actionKey="spec-book-mark-na"
              variant="secondary"
              onClick={() => void declareNa()}
            >
              Mark N/A
            </DocumentAction>
          </div>
        </div>
      </section>

      {feedback && (
        <p className="t-body-sm sb-help" role="status" aria-live="polite">
          {feedback}
        </p>
      )}
      <div className="sb-foot">
        <DocumentAction
          actionKey="spec-book-save"
          variant="terminal"
          loading={updateSpec.isPending}
          onClick={() => void save()}
        >
          {/* The one filled act names the change (SPEC §S7b p3). */}
          {focusField === "finish" ? "Save the finish" : "Save the specification"}
        </DocumentAction>
        {putBack}
        {foot}
      </div>
    </div>
  );
}

function AudiencePreview({
  item,
  audience,
  footLine,
}: {
  item: SpecBookWorkItem | null;
  audience: SpecBookAudience;
  /** The sheet's foot: the book and its edition, as it prints. */
  footLine: string;
}) {
  // R1 — trade price and markup show only to a viewer who may see margin.
  const canSeeMargin = useCanSeeMargin();
  if (!item) {
    return <p className="empty-t">Choose an item to preview its sheet.</p>;
  }
  const image = imageFor(item);
  const publicFields: SpecField[] = [
    "sku",
    "finish",
    "material",
    "color_fabric",
    "selected_dimensions",
  ];
  const notes = audienceAllows(audience, "install_notes")
    ? item.spec?.install_notes
    : audienceAllows(audience, "vendor_notes")
      ? item.spec?.trade_notes
      : audienceAllows(audience, "care_notes")
        ? [item.spec?.care_notes, item.spec?.warranty_notes]
            .filter(Boolean)
            .join("\n\n")
        : audienceAllows(audience, "client_notes")
          ? item.spec?.client_notes
          : null;
  return (
    <article className="sb-page" aria-label={`${audience} edition, item sheet`}>
      <p className="sb-page-meta t-meta">
        <span>{audience} edition · item sheet</span>
        {item.document_code && <span>{item.document_code}</span>}
      </p>
      <h2 className="t-d2">{item.name}</h2>
      {(audienceAllows(audience, "room") ||
        audienceAllows(audience, "quantity")) && (
        <p className="sb-sub">
          {audienceAllows(audience, "room")
            ? (item.room?.name ?? "Unassigned")
            : null}
          {audienceAllows(audience, "room") &&
          audienceAllows(audience, "quantity")
            ? " · "
            : null}
          {audienceAllows(audience, "quantity")
            ? `Quantity ${item.quantity ?? "—"}`
            : null}
        </p>
      )}
      {image && (
        <span className="plate">
          <img src={image} alt="" />
        </span>
      )}
      <dl className="sb-facts">
        {publicFields
          .filter((field) => audienceAllows(audience, field))
          .map((field) => (
            <Fragment key={field}>
              <dt>{FACT_LABELS[field]}</dt>
              <dd>{displayResolvedValue(resolveSpecValue(item, field))}</dd>
            </Fragment>
          ))}
        {audienceAllows(audience, "exact_location") && (
          <>
            <dt>Exact location</dt>
            <dd>
              {displayResolvedValue(resolveSpecValue(item, "exact_location"))}
            </dd>
          </>
        )}
        {canSeeMargin && audienceAllows(audience, "trade_price") && (
          <>
            <dt>Trade price</dt>
            <dd>
              <span className="lfig">
                {item.trade_price_cents == null
                  ? "—"
                  : `$${(item.trade_price_cents / 100).toFixed(2)}`}
              </span>
            </dd>
            <dt>Markup</dt>
            <dd>
              <span className="lfig">{item.markup_percent ?? "—"}%</span>
            </dd>
          </>
        )}
      </dl>
      {notes && <p className="sb-note">{notes}</p>}
      <p className="sb-page-foot t-meta">{footLine}</p>
    </article>
  );
}

export function SpecBookWorkspace({ projectId }: { projectId: string }) {
  const hydrated = useHydrated();
  // SP-19/F57 — an FF&E line's `Edit spec details →` addresses one line
  // (`/doc/{id}/spec-book?ffeItemId=…`). Spec-book items ARE
  // `project_ffe_items` rows (use-spec-books.ts), so the id matches directly.
  const requestedItemId = useSearchParams()?.get("ffeItemId") ?? null;
  const workbench = useSpecBookWorkbench(projectId);
  const project = useProjectV2(projectId) as {
    data: { name?: string; title?: string } | undefined;
  };
  const updateSetting = useUpdateSpecBookItemSetting(projectId);
  const prepareIssue = usePrepareSpecBookIssue();
  const renderArtifact = useRenderSpecBookArtifact(projectId);
  const createShare = useCreateSpecBookShare(projectId);

  const [view, setView] = useState<WorkspaceView>("workbench");
  const [readiness, setReadiness] = useState<ReadinessFilter>("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  // The piece unfolded in place under its row: one at a time, null at rest.
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [openFocusField, setOpenFocusField] = useState<SpecField | null>(null);
  const nameRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [previewAudience, setPreviewAudience] =
    useState<SpecBookAudience>("client");
  const [audiences, setAudiences] = useState<SpecBookAudience[]>([
    "client",
    "internal",
  ]);
  const [issueType, setIssueType] = useState<SpecBookIssueType>("full");
  const [issueReason, setIssueReason] = useState("");
  const [warningReason, setWarningReason] = useState("");
  const [issueFeedback, setIssueFeedback] = useState<string | null>(null);
  const [shareResult, setShareResult] = useState<{
    artifactId: string;
    url: string;
  } | null>(null);
  const openedRef = useRef(false);

  const data = workbench.data;
  const selectionIds = useMemo(
    () => (data?.items ?? []).map((item) => item.id),
    [data?.items],
  );
  const readinessQuery = useProjectFfeReadiness(selectionIds);
  const readinessBySelection = useMemo(
    () => new Map((readinessQuery.data ?? []).map((entry) => [entry.selectionId, entry])),
    [readinessQuery.data],
  );
  const derivedReadiness = useCallback((selectionId: string): DerivedReadiness => {
    if (readinessQuery.isLoading) return "checking";
    if (readinessQuery.isError) return "unavailable";
    return readinessBySelection.get(selectionId)?.ready === true ? "ready" : "incomplete";
  }, [readinessBySelection, readinessQuery.isError, readinessQuery.isLoading]);
  const missingReadinessFields = useCallback(
    (selectionId: string) => readinessBySelection.get(selectionId)?.missingFields ?? [],
    [readinessBySelection],
  );
  const latestIssued = useMemo(
    () =>
      data?.revisions.find((revision) => revision.status === "issued") ?? null,
    [data?.revisions],
  );
  const selectedItem =
    data?.items.find((item) => item.id === selectedItemId) ??
    data?.items[0] ??
    null;
  const preflight = useMemo(
    () => runSpecBookPreflight(data?.items ?? [], audiences),
    [data?.items, audiences],
  );
  const visibleItems = useMemo(() => {
    const items = data?.items ?? [];
    if (readiness === "all") return items;
    if (readiness === "unassigned") {
      return items.filter((item) => !item.project_room_id);
    }
    if (readiness === "drift") {
      return items.filter((item) =>
        hasIssuedDrift(item, latestIssued?.issued_at ?? null),
      );
    }
    return items.filter((item) => derivedReadiness(item.id) === readiness);
  }, [data?.items, derivedReadiness, latestIssued?.issued_at, readiness]);

  // The book's Sections are its chapters, by trade (00767, V20 U-Q18), in
  // the hook's order (position, then title). A trade or hand-made chapter has
  // no room, so a line matches its chapter by chapter_id; the legacy room
  // fallback holds only where both sides name a room (SQ-842 F4). A line no
  // chapter takes files under Unsorted. A chapter shows only while it holds
  // an active line (SQ-842 F8b); a filter that empties it prints a sentence.
  const groups = useMemo(() => {
    const chapters = (data?.chapters ?? []).filter(
      (chapter) => chapter.included !== false,
    );
    const chapterOf = new Map<string, string>();
    for (const item of data?.items ?? []) {
      const chapter =
        chapters.find((entry) => item.setting?.chapter_id === entry.id) ??
        (!item.setting?.chapter_id && item.project_room_id
          ? chapters.find(
              (entry) =>
                entry.project_room_id != null &&
                entry.project_room_id === item.project_room_id,
            )
          : undefined) ??
        chapters.find((entry) => entry.trade === "unsorted");
      chapterOf.set(item.id, chapter?.id ?? "unsorted");
    }
    const isActive = (item: SpecBookWorkItem) =>
      !(item as SpecBookWorkItem & { removed_at?: string | null }).removed_at;
    const holdsActive = (chapterId: string) =>
      (data?.items ?? []).some(
        (item) => chapterOf.get(item.id) === chapterId && isActive(item),
      );
    const result = chapters
      .filter((chapter) => holdsActive(chapter.id))
      .map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        items: visibleItems.filter((item) => chapterOf.get(item.id) === chapter.id),
      }));
    if (holdsActive("unsorted")) {
      result.push({
        id: "unsorted",
        title: "Unsorted",
        items: visibleItems.filter((item) => chapterOf.get(item.id) === "unsorted"),
      });
    }
    return result;
  }, [data?.chapters, data?.items, visibleItems]);

  useEffect(() => {
    if (!data || openedRef.current) return;
    openedRef.current = true;
    specBookEvents.opened({
      project_id: projectId,
      item_count: data.items.length,
    });
  }, [data, projectId]);

  useEffect(() => {
    if (selectedItemId || !data?.items[0]) return;
    const requested = requestedItemId
      ? data.items.find((item) => item.id === requestedItemId)
      : undefined;
    // The book opens at rest (SPEC §S7b p1). Only an addressed line arrives
    // unfolded, since its `Edit spec details →` asked for that line.
    setSelectedItemId((requested ?? data.items[0]).id);
    if (requested) setOpenItemId(requested.id);
  }, [data?.items, requestedItemId, selectedItemId]);

  const scrolledToRef = useRef<string | null>(null);
  useEffect(() => {
    if (!requestedItemId || scrolledToRef.current === requestedItemId) return;
    const row = document.getElementById(specBookItemDomId(requestedItemId));
    if (!row) return;
    scrolledToRef.current = requestedItemId;
    // jsdom has no layout, so the method is absent there.
    row.scrollIntoView?.({ block: "center" });
  }, [data?.items, requestedItemId, selectedItemId]);

  const toggleAudience = (audience: SpecBookAudience) => {
    setAudiences((current) =>
      current.includes(audience)
        ? current.filter((value) => value !== audience)
        : [...current, audience],
    );
  };

  const runPreflight = () => {
    setView("preflight");
    specBookEvents.preflightCompleted({
      project_id: projectId,
      audience_count: audiences.length,
      blocker_count: preflight.blockers.length,
      warning_count: preflight.warnings.length,
    });
  };

  const issue = useCallback(async () => {
    if (!data || audiences.length === 0) return;
    setIssueFeedback(null);
    if (!preflight.ready) {
      setIssueFeedback("Resolve blocking preflight items before issuing.");
      setView("preflight");
      return;
    }
    if (preflight.warnings.length > 0 && !warningReason.trim()) {
      setIssueFeedback("Acknowledging warnings requires a reason.");
      setView("preflight");
      return;
    }
    if (issueType !== "full" && !issueReason.trim()) {
      setIssueFeedback("A replacement or addendum requires a reason.");
      return;
    }
    specBookEvents.issueAttempted({
      project_id: projectId,
      issue_type: issueType,
      audiences,
      warning_count: preflight.warnings.length,
    });
    const issueStarted = performance.now();
    try {
      const prepared = await prepareIssue.mutateAsync({
        projectId,
        specBookId: data.book.id,
        audiences,
        issueType,
        reason: issueReason.trim() || null,
        baseRevisionId:
          issueType === "full" ? null : (latestIssued?.id ?? null),
        idempotencyKey: crypto.randomUUID(),
        warningAcknowledgements: preflight.warnings.map((warning) => ({
          code: warning.code,
          reason: warningReason.trim(),
        })),
      });
      const rendered = await Promise.all(
        prepared.artifacts.map(async (artifact) => {
          const renderStarted = performance.now();
          try {
            const result = await renderArtifact.mutateAsync(artifact.id);
            specBookEvents.artifactRendered({
              project_id: projectId,
              artifact_id: artifact.id,
              audience: artifact.audience,
              duration_ms: Math.round(performance.now() - renderStarted),
            });
            return result;
          } catch (error) {
            specBookEvents.artifactFailed({
              project_id: projectId,
              artifact_id: artifact.id,
              audience: artifact.audience,
              error: error instanceof Error ? error.message : "unknown",
            });
            throw error;
          }
        }),
      );
      specBookEvents.issued({
        project_id: projectId,
        revision_id: prepared.revision.id,
        issue_type: issueType,
        duration_ms: Math.round(performance.now() - issueStarted),
      });
      setIssueFeedback(
        rendered.some((result) => result.finalized)
          ? "Revision issued. Every audience artifact is durable."
          : "Every audience artifact rendered. Issue status is refreshing.",
      );
      setView("history");
    } catch (error) {
      setIssueFeedback(
        error instanceof Error
          ? error.message
          : "The issue could not complete.",
      );
    }
  }, [
    audiences,
    data,
    issueReason,
    issueType,
    latestIssued?.id,
    preflight,
    prepareIssue,
    projectId,
    renderArtifact,
    warningReason,
  ]);

  const retryArtifact = async (artifact: SpecBookArtifact) => {
    setIssueFeedback(null);
    specBookEvents.artifactRetry({
      project_id: projectId,
      artifact_id: artifact.id,
      audience: artifact.audience,
    });
    try {
      const result = await renderArtifact.mutateAsync(artifact.id);
      if (result.finalized) {
        setIssueFeedback(
          `${artifact.audience} artifact finalized and the revision is issued.`,
        );
      } else if (artifact.status === "ready") {
        setIssueFeedback(
          `${artifact.audience} artifact remains ready. Other editions must finish before the revision can issue.`,
        );
      } else {
        setIssueFeedback(
          `${artifact.audience} artifact rendered. Other editions still need attention.`,
        );
      }
    } catch (error) {
      setIssueFeedback(
        error instanceof Error ? error.message : "Retry failed.",
      );
    }
  };

  const shareArtifact = async (artifact: SpecBookArtifact) => {
    setIssueFeedback(null);
    try {
      const result = await createShare.mutateAsync({
        artifactId: artifact.id,
        label: `${artifact.audience} spec book`,
        expiresAt: null,
      });
      const clientPortalBase = resolveClientPortalOrigin(
        window.location.origin,
      );
      const url = `${clientPortalBase}/field/spec-book/${result.token}`;
      setShareResult({ artifactId: artifact.id, url });
      specBookEvents.shareCreated({
        project_id: projectId,
        artifact_id: artifact.id,
        audience: artifact.audience,
        expires: Boolean(result.expires_at),
      });
    } catch (error) {
      setIssueFeedback(
        error instanceof Error
          ? error.message
          : "Share link could not be created.",
      );
    }
  };

  if (!hydrated || workbench.isLoading) {
    return (
      <main className="sb-ground" aria-busy>
        <div className="sb-main">
          <p className="empty-t sb-wait" role="status" aria-live="polite">
            Opening the working book…
          </p>
        </div>
      </main>
    );
  }

  if (workbench.error || !data) {
    return (
      <main className="sb-ground">
        <div className="sb-main">
          <h1 className="t-d2 sb-wait">The working book could not be opened.</h1>
          <p className="t-body sb-help">
            {workbench.error instanceof Error
              ? workbench.error.message
              : "The project may not be available to this studio."}
          </p>
          <div className="sb-foot">
            <DocumentAction
              actionKey="spec-book-try-again"
              variant="secondary"
              onClick={() => {
                void workbench.refetch();
              }}
            >
              Try again
            </DocumentAction>
          </div>
        </div>
      </main>
    );
  }

  const projectName = project.data?.name ?? project.data?.title ?? "Project";
  // The workspace is named by its job (SPEC §S7b p1); the preview prints the
  // stored title, the one issuance freezes into the PDF.
  const bookTitle = project.data
    ? `${projectName} · specification book`
    : "Specification book";
  const printedTitle = data?.book.title.trim() || bookTitle;
  const issueBusy =
    prepareIssue.isPending ||
    renderArtifact.isPending;
  const hasLines = data.items.length > 0;
  const workingEdition =
    data.revisions.reduce(
      (high, revision) =>
        revision.status === "issued"
          ? Math.max(high, revision.revision_number)
          : high,
      0,
    ) + 1;
  const editionWord = `Edition ${workingEdition}`;
  const frontSentence = preflight.ready
    ? preflight.warnings.length > 0
      ? `Nothing blocks ${editionWord.toLowerCase()}; ${preflight.warnings.length === 1 ? "one warning needs" : `${preflight.warnings.length} warnings need`} a reason before it issues.`
      : `Everything is ready for ${editionWord.toLowerCase()}.`
    : `${preflight.blockers.length === 1 ? "One thing stands" : `${preflight.blockers.length} things stand`} between this book and ${editionWord.toLowerCase()}. ${preflight.blockers[0]?.message ?? ""}`;
  const openPiece = (itemId: string, focusField?: SpecField) => {
    setSelectedItemId(itemId);
    setOpenItemId(itemId);
    setOpenFocusField(focusField ?? null);
  };
  const putBack = (itemId: string) => {
    setOpenItemId(null);
    setOpenFocusField(null);
    window.requestAnimationFrame(() => nameRefs.current[itemId]?.focus());
  };

  return (
    <main className="sb-ground">
      <div className="sb-main">
        <header className="hline">
          <div className="hline-l">
            <DocumentAction
              actionKey="spec-book-back"
              variant="tertiary"
              href={
                requestedItemId
                  ? `/doc/${projectId}#line-${requestedItemId}`
                  : `/doc/${projectId}`
              }
            >
              ← {projectName}
            </DocumentAction>
            <h1 className="t-d2">{bookTitle}</h1>
            <span className="t-meta sb-title-meta">
              {editionWord} · working copy
            </span>
          </div>
          {hasLines && (
            <div className="hline-r">
              <DocumentAction
                actionKey="spec-book-run-checks"
                variant="secondary"
                onClick={runPreflight}
              >
                Run issue checks
              </DocumentAction>
            </div>
          )}
        </header>
        <div className="rule-strong" role="presentation" />
        <nav aria-label="Spec book workspace" className="filters sb-tabs">
          {(
            [
              ["workbench", "Specification"],
              ["preview", "Audience editions"],
              ["preflight", "Issue readiness"],
              ["history", "Revision history"],
            ] as Array<[WorkspaceView, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              aria-current={view === id ? "page" : undefined}
            >
              {label}
            </button>
          ))}
        </nav>

        {view === "workbench" &&
          (!hasLines ? (
            <EmptyState
              eyebrow="Specification"
              act={
                <DocumentAction
                  actionKey="spec-book-open-pieces"
                  variant="secondary"
                  href={`/doc/${projectId}/pieces`}
                >
                  Open the pieces
                </DocumentAction>
              }
            >
              No pieces in this book yet. Add pieces to {projectName} and they
              arrive here by trade.
            </EmptyState>
          ) : (
            <>
              <p className="sb-front t-body">
                <span className="word word--quiet">Issue readiness</span>
                {frontSentence}
              </p>
              <div className="sb-body">
                <nav className="sb-index" aria-label="In this book">
                  <p className="eb">In this book</p>
                  <ol>
                    {groups.map((group) => (
                      <li key={group.id}>
                        <a href={`#chapter-${group.id}`}>{group.title}</a>
                      </li>
                    ))}
                  </ol>
                  <p className="eb sb-index-show">Show</p>
                  <div className="filters">
                    {(
                      [
                        ["all", "All"],
                        ["incomplete", "Incomplete"],
                        ["ready", "Ready"],
                        ["unassigned", "Unassigned"],
                        ["drift", "Changed since issue"],
                      ] as Array<[ReadinessFilter, string]>
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={readiness === value}
                        onClick={() => setReadiness(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </nav>

                <div aria-label="Specification register" role="region">
                  {groups.map((group) => (
                    <section
                      key={group.id}
                      id={`chapter-${group.id}`}
                      aria-label={group.title}
                      className="section sb-chapter"
                    >
                      <div className="sec-head">
                        <p className="eb">
                          <svg
                            className="orn"
                            viewBox="0 0 34 12"
                            aria-hidden="true"
                            focusable="false"
                          >
                            <path d="M0 2h34M0 6h28M0 10h20" />
                          </svg>
                          <span>{group.title}</span>
                        </p>
                      </div>
                      {group.items.length === 0 ? (
                        <p className="empty-s">
                          Nothing in {group.title} matches the filter.
                        </p>
                      ) : (
                        <div className="ledger">
                          <ul className="rows">
                            {group.items.map((item) => {
                              const open = openItemId === item.id;
                              const itemReadiness = derivedReadiness(item.id);
                              const itemMissing = missingReadinessFields(item.id);
                              const drift = hasIssuedDrift(
                                item,
                                latestIssued?.issued_at ?? null,
                              );
                              const image = imageFor(item);
                              return (
                                <Fragment key={item.id}>
                                  <PieceRow
                                    item={item}
                                    readiness={itemReadiness}
                                    missingFields={itemMissing}
                                    open={open}
                                    drift={drift}
                                    onOpen={(field) => openPiece(item.id, field)}
                                    onClose={() => putBack(item.id)}
                                    nameRef={(node) => {
                                      nameRefs.current[item.id] = node;
                                    }}
                                  />
                                  {open && (
                                    <li
                                      id={specBookFoldDomId(item.id)}
                                      className="sb-open"
                                      aria-label={`${item.name ?? "Untitled item"}, the specification`}
                                    >
                                      <div
                                        className={
                                          image ? "sb-spec has-plate" : "sb-spec"
                                        }
                                      >
                                        {image ? (
                                          <div>
                                            <span className="plate">
                                              <img src={image} alt="" />
                                            </span>
                                          </div>
                                        ) : null}
                                        <div>
                                          {drift && (
                                            <div className="sb-drift">
                                              <p className="t-body-sm">
                                                Source changed after revision{" "}
                                                {latestIssued?.revision_number}.
                                              </p>
                                              <div className="sb-foot">
                                                {(
                                                  [
                                                    ["accept_source", "Accept source"],
                                                    ["preserve_override", "Keep override"],
                                                    ["acknowledge", "Acknowledge"],
                                                  ] as const
                                                ).map(([decision, label]) => (
                                                  <DocumentAction
                                                    key={decision}
                                                    actionKey={`spec-book-drift-${decision}`}
                                                    variant="tertiary"
                                                    onClick={() =>
                                                      specBookEvents.driftDecision({
                                                        project_id: projectId,
                                                        item_id: item.id,
                                                        decision,
                                                      })
                                                    }
                                                  >
                                                    {label}
                                                  </DocumentAction>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                          <SelectionEditor
                                            item={item}
                                            readiness={itemReadiness}
                                            missingFields={itemMissing}
                                            onRoomAssigned={workbench.refetch}
                                            heading={[item.document_code, group.title]
                                              .filter(Boolean)
                                              .join(" · ")}
                                            focusField={openFocusField ?? undefined}
                                            onClose={() => putBack(item.id)}
                                            foot={
                                              <>
                                                <DocumentAction
                                                  actionKey="spec-book-preview-sheet"
                                                  variant="tertiary"
                                                  onClick={() => {
                                                    setSelectedItemId(item.id);
                                                    setPreviewAudience("client");
                                                    setView("preview");
                                                  }}
                                                >
                                                  Preview the client sheet
                                                </DocumentAction>
                                                {item.setting && (
                                                  <label className="check">
                                                    <input
                                                      className="check-input"
                                                      type="checkbox"
                                                      checked={item.setting.included}
                                                      disabled={updateSetting.isPending}
                                                      onChange={(event) =>
                                                        updateSetting.mutate({
                                                          settingId: item.setting!.id,
                                                          changes: {
                                                            included: event.target.checked,
                                                          },
                                                        })
                                                      }
                                                    />
                                                    <span className="check-box" aria-hidden="true">
                                                      <svg viewBox="0 0 14 14">
                                                        <path d="M2.5 7.5l3 3 6-7" />
                                                      </svg>
                                                    </span>
                                                    In {editionWord.toLowerCase()}
                                                  </label>
                                                )}
                                              </>
                                            }
                                          />
                                        </div>
                                      </div>
                                    </li>
                                  )}
                                </Fragment>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              </div>
            </>
          ))}

        {view === "preview" && (
          <div className="sb-preview">
            <div>
              <div className="sb-picks">
                <p className="eb">Edition for</p>
                <div className="filters">
                  {AUDIENCES.map((audience) => (
                    <button
                      key={audience.id}
                      type="button"
                      aria-pressed={previewAudience === audience.id}
                      onClick={() => setPreviewAudience(audience.id)}
                    >
                      {audience.label}
                    </button>
                  ))}
                </div>
                <p className="t-body-sm sb-help">
                  {
                    AUDIENCES.find((audience) => audience.id === previewAudience)
                      ?.sentence
                  }
                </p>
              </div>
              <div className="sb-picks">
                <label className="sb-label">
                  Specification sheet
                  <Select
                    className="mt-1.5"
                    value={selectedItem?.id ?? ""}
                    onChange={(event) => setSelectedItemId(event.target.value)}
                  >
                    {data.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.document_code} · {item.name}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
            </div>
            <section aria-label={`${previewAudience} edition preview`}>
              <AudiencePreview
                item={selectedItem}
                audience={previewAudience}
                footLine={`${printedTitle} · ${editionWord}`}
              />
            </section>
          </div>
        )}

        {view === "preflight" && (
          <div className="sb-issue">
            <div>
              <div className="sb-issue-head">
                <span
                  className={preflight.ready ? "word" : "word word--od"}
                >
                  {preflight.ready ? "Ready" : "Blocked"}
                </span>
                <h2 className="t-d2">
                  {preflight.ready
                    ? "Ready to issue"
                    : `${preflight.blockers.length} blockers remain`}
                </h2>
                <p className="t-body-sm sb-help">
                  {preflight.warnings.length} warnings · {data.items.length}{" "}
                  lines checked
                </p>
              </div>

              <section className="section" aria-label="Issue blockers">
                <div className="sec-head">
                  <p className="eb">Issue blockers</p>
                </div>
                {preflight.blockers.length === 0 ? (
                  <p className="empty-s">No blockers.</p>
                ) : (
                  <div className="ledger">
                    <ul className="rows">
                      {preflight.blockers.map((issue, index) => (
                        <li
                          key={`${issue.code}-${issue.itemId}-${index}`}
                          className="lrow sb-issue-row"
                        >
                          <span className="lsent">{issue.message}</span>
                          {issue.itemId && (
                            <span className="lact">
                              <DocumentAction
                                actionKey="spec-book-resolve-issue"
                                variant="tertiary"
                                onClick={() => {
                                  openPiece(issue.itemId!);
                                  setView("workbench");
                                }}
                              >
                                Resolve issue
                              </DocumentAction>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              <section className="section" aria-label="Issue warnings">
                <div className="sec-head">
                  <p className="eb">Issue warnings</p>
                </div>
                {preflight.warnings.length === 0 ? (
                  <p className="empty-s">No warnings.</p>
                ) : (
                  <div className="ledger">
                    <ul className="rows">
                      {preflight.warnings.map((issue, index) => (
                        <li
                          key={`${issue.code}-${issue.itemId}-${index}`}
                          className="lrow sb-issue-row"
                        >
                          <span className="lsent">{issue.message}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {preflight.warnings.length > 0 && (
                  <label className="sb-label sb-group">
                    Issue-with-warnings reason
                    <Textarea
                      className="mt-1.5"
                      value={warningReason}
                      placeholder="Explain why you are issuing with these warnings"
                      onChange={(event) => setWarningReason(event.target.value)}
                    />
                  </label>
                )}
              </section>
            </div>

            <div className="sb-picks-col">
              <p className="eb">Issue specification set</p>
              <div>
                {AUDIENCES.map((audience) => (
                  <label key={audience.id} className="check">
                    <input
                      className="check-input"
                      type="checkbox"
                      checked={audiences.includes(audience.id)}
                      onChange={() => toggleAudience(audience.id)}
                    />
                    <span className="check-box" aria-hidden="true">
                      <svg viewBox="0 0 14 14">
                        <path d="M2.5 7.5l3 3 6-7" />
                      </svg>
                    </span>
                    <span>
                      {audience.label}
                      <span className="t-body-sm sb-check-sub">
                        {audience.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <label className="sb-label sb-group">
                Issue type
                <Select
                  className="mt-1.5"
                  value={issueType}
                  onChange={(event) =>
                    setIssueType(event.target.value as SpecBookIssueType)
                  }
                >
                  <option value="full">Full issue</option>
                  <option value="replacement" disabled={!latestIssued}>
                    Full replacement
                  </option>
                  <option value="addendum" disabled={!latestIssued}>
                    Changed-items addendum
                  </option>
                </Select>
              </label>
              {issueType !== "full" && (
                <label className="sb-label sb-group">
                  Issue reason
                  <Textarea
                    className="mt-1.5"
                    value={issueReason}
                    onChange={(event) => setIssueReason(event.target.value)}
                  />
                </label>
              )}
              {issueFeedback && (
                <p className="t-body-sm sb-help" role="status">
                  {issueFeedback}
                </p>
              )}
              <div className="sb-foot">
                <DocumentAction
                  actionKey="spec-book-issue"
                  variant="terminal"
                  loading={issueBusy}
                  disabled={!preflight.ready || audiences.length === 0}
                  onClick={() => void issue()}
                >
                  Issue {audiences.length} edition
                  {audiences.length === 1 ? "" : "s"}
                </DocumentAction>
              </div>
              <p className="t-body-sm sb-help">
                Issuing freezes an immutable revision. Each audience renders
                independently and failed artifacts retry in place.
              </p>
            </div>
          </div>
        )}

        {view === "history" && (
          <div>
            <div className="sec-head sb-history-head">
              <div>
                <p className="eb">Issued revision register</p>
                <h2 className="t-d2">Revisions</h2>
              </div>
              {latestIssued && (
                <DocumentAction
                  actionKey="spec-book-addendum"
                  variant="secondary"
                  onClick={() => {
                    setIssueType("addendum");
                    setView("preflight");
                    specBookEvents.addendumStarted({
                      project_id: projectId,
                      base_revision_id: latestIssued.id,
                    });
                  }}
                >
                  Create specification addendum
                </DocumentAction>
              )}
            </div>

            {issueFeedback && (
              <p className="t-body-sm sb-help" role="status">
                {issueFeedback}
              </p>
            )}

            {data.revisions.length === 0 ? (
              <p className="empty-t sb-wait">No revisions issued yet.</p>
            ) : (
              data.revisions.map((revision) => {
                const artifacts = data.artifacts.filter(
                  (artifact) => artifact.revision_id === revision.id,
                );
                return (
                  <section
                    key={revision.id}
                    className="section sb-revision"
                    aria-label={`Revision ${revision.revision_number}`}
                  >
                    <div className="sec-head">
                      <p className="eb">
                        <span>Revision {revision.revision_number}</span>
                        <span>
                          {revision.issue_type} · {revision.status}
                        </span>
                        <span>{new Date(revision.created_at).toLocaleString()}</span>
                      </p>
                    </div>
                    {revision.reason && (
                      <p className="t-body sb-help">{revision.reason}</p>
                    )}
                    <div className="ledger">
                      <ul className="rows">
                        {artifacts.map((artifact) => {
                          const retryLabel = specBookArtifactRetryLabel(
                            artifact.status,
                            revision.status,
                          );
                          return (
                            <li key={artifact.id} className="lrow sb-artifact-row">
                              <span className="lname sb-artifact-name">
                                {artifact.audience} PDF
                              </span>
                              <span className="lsent">
                                <span
                                  className={
                                    artifact.status === "failed"
                                      ? "word word--od"
                                      : "word"
                                  }
                                >
                                  {artifact.status}
                                </span>
                                {artifact.error_message
                                  ? ` ${artifact.error_message}`
                                  : ""}
                              </span>
                              <span className="lact sb-artifact-acts">
                                {retryLabel && (
                                  <DocumentAction
                                    actionKey={`spec-book-artifact-${retryLabel.toLowerCase()}`}
                                    variant="tertiary"
                                    loading={renderArtifact.isPending}
                                    onClick={() => void retryArtifact(artifact)}
                                  >
                                    {retryLabel}
                                  </DocumentAction>
                                )}
                                {artifact.status === "ready" && (
                                  <DocumentAction
                                    actionKey="spec-book-artifact-share"
                                    variant="tertiary"
                                    loading={createShare.isPending}
                                    onClick={() => void shareArtifact(artifact)}
                                  >
                                    Share issued set
                                  </DocumentAction>
                                )}
                              </span>
                              {shareResult?.artifactId === artifact.id && (
                                <label className="sb-label sb-share">
                                  Copy this tokenized link now; the raw token is
                                  shown only once.
                                  <Input
                                    readOnly
                                    className="mt-1.5 font-mono text-[12px]"
                                    value={shareResult.url}
                                    onFocus={(event) =>
                                      event.currentTarget.select()
                                    }
                                  />
                                </label>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </section>
                );
              })
            )}
          </div>
        )}
      </div>
    </main>
  );
}
