"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronRight,
  CircleDashed,
  FileClock,
  FileText,
  RefreshCw,
  Share2,
  Sparkles,
} from "lucide-react";
import {
  useCreateSpecBookShare,
  useFinalizeSpecBookIssue,
  usePrepareSpecBookIssue,
  useProjectV2,
  useRenderSpecBookArtifact,
  useSpecBookWorkbench,
  useUpdateProjectFfeSpec,
  useUpdateSpecBookItemSetting,
  type ProjectFfeSpec,
  type SpecBookArtifact,
  type SpecBookAudience,
  type SpecBookIssueType,
  type SpecBookReadiness,
  type SpecBookWorkItem,
} from "@patina/supabase";
import {
  Button,
  FilterPill,
  Input,
  Select,
  Textarea,
} from "@/components/ui/controls";
import { useHydrated } from "@/hooks/use-hydrated";
import { specBookEvents } from "@/lib/analytics/spec-book-events";
import { resolveClientPortalOrigin } from "@/lib/client-portal-url";
import { ConfigurationSnapshotCard } from "@/components/document/configuration-snapshot-card";
import { extractConfigurationSnapshotEnvelope } from "@/components/document/rooms/piece/custom-commission-model";
import {
  audienceAllows,
  buildNaDeclarationUpdate,
  displayResolvedValue,
  editableSpecSeed,
  hasIssuedDrift,
  resolveSpecValue,
  runSpecBookPreflight,
  type SpecField,
} from "@/lib/spec-books/model";

const AUDIENCES: Array<{
  id: SpecBookAudience;
  label: string;
  description: string;
}> = [
  {
    id: "client",
    label: "Client",
    description: "Selection, client pricing, care",
  },
  { id: "vendor", label: "Vendor", description: "Order-facing facts" },
  {
    id: "installer",
    label: "Installer",
    description: "Location and install notes",
  },
  { id: "internal", label: "Internal", description: "Complete frozen record" },
  { id: "care", label: "Care", description: "Care and warranty only" },
];

type WorkspaceView = "workbench" | "preview" | "preflight" | "history";
type ReadinessFilter = "all" | SpecBookReadiness | "unassigned" | "drift";

function readinessLabel(value: SpecBookReadiness | undefined): string {
  return (value ?? "draft").replace("_", " ");
}

function readinessColor(value: SpecBookReadiness | undefined): string {
  switch (value) {
    case "ready":
      return "text-[#66765f]";
    case "blocked":
      return "text-[var(--color-terracotta)]";
    case "incomplete":
      return "text-[#a47f33]";
    default:
      return "text-[var(--text-muted)]";
  }
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

function FieldProvenance({
  item,
  field,
}: {
  item: SpecBookWorkItem;
  field: SpecField;
}) {
  const resolved = resolveSpecValue(item, field);
  return (
    <div className="border-b border-[var(--color-pearl)] py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] capitalize text-[var(--text-muted)]">
          {field.replaceAll("_", " ")}
        </span>
        <span className="max-w-[65%] text-right text-[12px] text-[var(--color-charcoal)]">
          {displayResolvedValue(resolved)}
        </span>
      </div>
      <p className="mt-1 text-right font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {resolved.source.replaceAll("_", " ")}
        {resolved.verifiedAt
          ? ` · verified ${new Date(resolved.verifiedAt).toLocaleDateString()}`
          : ""}
      </p>
    </div>
  );
}

function ReadinessMark({ status }: { status: SpecBookReadiness | undefined }) {
  const ready = status === "ready";
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.08em] ${readinessColor(status)}`}
    >
      {ready ? (
        <Check className="h-3 w-3" />
      ) : (
        <CircleDashed className="h-3 w-3" />
      )}
      {readinessLabel(status)}
    </span>
  );
}

function ItemCard({
  item,
  selected,
  drift,
  onSelect,
}: {
  item: SpecBookWorkItem;
  selected: boolean;
  drift: boolean;
  onSelect: () => void;
}) {
  const image = imageFor(item);
  const finish = resolveSpecValue(item, "finish");
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`grid w-full grid-cols-[72px_1fr_auto] gap-3 border-b px-2 py-3 text-left transition-colors ${
        selected
          ? "border-[var(--color-clay)] bg-[rgba(196,165,123,0.08)]"
          : "border-[var(--color-pearl)] hover:bg-[rgba(196,165,123,0.04)]"
      }`}
    >
      <div className="h-[72px] overflow-hidden bg-[var(--color-pearl)]">
        {image ? (
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[9px] text-[var(--text-muted)]">
            No image
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-[var(--color-charcoal)]">
          {item.document_code ? `${item.document_code} · ` : ""}
          {item.name ?? "Untitled item"}
        </p>
        <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
          {displayResolvedValue(finish)}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <ReadinessMark status={item.spec?.readiness_status} />
          {drift && (
            <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--color-terracotta)]">
              changed since issue
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="mt-1 h-4 w-4 text-[var(--text-muted)]" />
    </button>
  );
}

function SelectionEditor({
  item,
  onSaved,
}: {
  item: SpecBookWorkItem;
  onSaved?: () => void;
}) {
  const updateSpec = useUpdateProjectFfeSpec();
  const [draft, setDraft] = useState<Record<string, string>>(
    item.spec ? editableSpecSeed(item.spec) : {},
  );
  const [naField, setNaField] = useState<SpecField>("finish");
  const [naReason, setNaReason] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setDraft(item.spec ? editableSpecSeed(item.spec) : {});
    setFeedback(null);
  }, [item]);

  const set = (field: string, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const save = async () => {
    if (!item.spec) return;
    setFeedback(null);
    let dimensions: Record<string, unknown> | null = null;
    if (draft.selected_dimensions?.trim()) {
      try {
        dimensions = JSON.parse(draft.selected_dimensions);
      } catch {
        setFeedback(
          'Dimensions must be valid JSON, for example {"width":"32 in"}.',
        );
        return;
      }
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
      setFeedback("Selection saved.");
      onSaved?.();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Selection could not be saved.",
      );
    }
  };

  const setReadiness = async (next: SpecBookReadiness) => {
    if (!item.spec) return;
    const from = item.spec.readiness_status;
    try {
      await updateSpec.mutateAsync({
        projectId: item.project_id,
        specId: item.spec.id,
        expectedRowVersion: item.spec.row_version,
        changes: { readiness_status: next },
      });
      specBookEvents.readinessChanged({
        project_id: item.project_id,
        item_id: item.id,
        from,
        to: next,
      });
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Readiness could not be saved.",
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

  if (!item.spec) {
    return (
      <div className="border border-[var(--color-terracotta)] p-4 text-sm text-[var(--color-terracotta)]">
        This schedule line has no project selection record. Route or repair it
        before editing; the product itself remains safe.
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
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Project selection · v{item.spec.row_version}
          </p>
          <h2 className="mt-1 font-heading text-xl text-[var(--color-charcoal)]">
            {item.name}
          </h2>
        </div>
        <Select
          aria-label="Readiness"
          value={item.spec.readiness_status}
          onChange={(event) =>
            void setReadiness(event.target.value as SpecBookReadiness)
          }
          wrapperClassName="w-36"
        >
          <option value="draft">Draft</option>
          <option value="incomplete">Incomplete</option>
          <option value="ready">Ready</option>
          <option value="blocked">Blocked</option>
        </Select>
      </div>

      {configuration && (
        <div className="mb-5 border-y border-[var(--color-pearl)] py-3">
          <ConfigurationSnapshotCard
            snapshot={configuration.snapshot}
            configurationHash={configuration.hash}
            approvedHash={configuration.approvedHash}
            lockedAt={configuration.lockedAt}
            label="Project configuration"
          />
          {item.product_id && configuration.configurationId && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-pearl)] pt-3">
              <p className="text-[10px] text-[var(--text-muted)]">
                {revisionClosed
                  ? "Ordered and custom promises stay intact; changes begin on a new project line."
                  : "A replacement creates a new snapshot and returns this line to approval."}
              </p>
              <Link
                href={
                  !canReviseConfiguration
                    ? `/library/${item.product_id}`
                    : `/library/${item.product_id}?projectId=${encodeURIComponent(item.project_id)}&ffeItemId=${encodeURIComponent(item.id)}&configurationId=${encodeURIComponent(configuration.configurationId)}&snapshotHash=${encodeURIComponent(configuration.hash ?? "")}`
                }
                className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-clay)] underline-offset-4 hover:underline"
              >
                {!canReviseConfiguration
                  ? "View source piece"
                  : "Review or revise configuration"}
              </Link>
            </div>
          )}
        </div>
      )}

      <div className="mb-5 border-y border-[var(--color-pearl)]">
        {(
          [
            "sku",
            "finish",
            "material",
            "color_fabric",
            "selected_dimensions",
            "exact_location",
          ] as SpecField[]
        ).map((field) => (
          <FieldProvenance key={field} item={item} field={field} />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {textFields.map(([field, label]) => (
          <label key={field} className="text-[11px] text-[var(--text-muted)]">
            {label}
            <Input
              className="mt-1"
              value={draft[field] ?? ""}
              onChange={(event) => set(field, event.target.value)}
            />
          </label>
        ))}
        <label className="text-[11px] text-[var(--text-muted)] sm:col-span-2">
          Selected dimensions
          <Input
            className="mt-1"
            value={draft.selected_dimensions ?? ""}
            placeholder='{"width":"32 in","height":"30 in"}'
            onChange={(event) => set("selected_dimensions", event.target.value)}
          />
        </label>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {(
          [
            ["client_notes", "Client note"],
            ["trade_notes", "Vendor note"],
            ["install_notes", "Install note"],
            ["care_notes", "Care"],
            ["warranty_notes", "Warranty"],
          ] as const
        ).map(([field, label]) => (
          <label key={field} className="text-[11px] text-[var(--text-muted)]">
            {label}
            <Textarea
              className="mt-1 min-h-20"
              value={draft[field] ?? ""}
              onChange={(event) => set(field, event.target.value)}
            />
          </label>
        ))}
      </div>

      <div className="mt-5 border-t border-[var(--color-pearl)] pt-4">
        <p className="text-[11px] font-medium text-[var(--color-charcoal)]">
          Declare a field not applicable
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-[150px_1fr_auto]">
          <Select
            aria-label="Field to mark not applicable"
            value={naField}
            onChange={(event) => setNaField(event.target.value as SpecField)}
          >
            <option value="sku">SKU</option>
            <option value="finish">Finish</option>
            <option value="material">Material</option>
            <option value="color_fabric">Color / fabric</option>
            <option value="selected_dimensions">Dimensions</option>
            <option value="exact_location">Location</option>
          </Select>
          <Input
            aria-label="Reason field is not applicable"
            value={naReason}
            placeholder="Reason required"
            onChange={(event) => setNaReason(event.target.value)}
          />
          <Button variant="secondary" onClick={() => void declareNa()}>
            Mark N/A
          </Button>
        </div>
      </div>

      {feedback && (
        <p
          className="mt-4 text-[11px] text-[var(--text-muted)]"
          role="status"
          aria-live="polite"
        >
          {feedback}
        </p>
      )}
      <div className="mt-5 flex justify-end">
        <Button loading={updateSpec.isPending} onClick={() => void save()}>
          Save selection
        </Button>
      </div>
    </div>
  );
}

function AudiencePreview({
  item,
  audience,
}: {
  item: SpecBookWorkItem | null;
  audience: SpecBookAudience;
}) {
  if (!item) {
    return (
      <p className="py-16 text-center font-heading italic text-[var(--text-muted)]">
        Choose an item to preview its sheet.
      </p>
    );
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
    <div className="mx-auto min-h-[680px] max-w-[540px] bg-white px-10 py-12 text-[#2f302d]">
      <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#857f74]">
        {audience} edition · item sheet
      </p>
      <div className="mt-8 grid grid-cols-[1fr_auto] gap-6">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#857f74]">
            {item.document_code}
          </p>
          <h2 className="mt-2 font-heading text-3xl">{item.name}</h2>
          {(audienceAllows(audience, "room") ||
            audienceAllows(audience, "quantity")) && (
            <p className="mt-2 text-sm text-[#6d6a64]">
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
        </div>
      </div>
      {image && (
        <img
          src={image}
          alt=""
          className="mt-8 aspect-[4/3] w-full object-cover"
        />
      )}
      <dl className="mt-8 grid grid-cols-2 gap-x-8">
        {publicFields
          .filter((field) => audienceAllows(audience, field))
          .map((field) => {
            const value = resolveSpecValue(item, field);
            return (
              <div key={field} className="border-t border-[#ddd8ce] py-3">
                <dt className="text-[10px] uppercase tracking-[0.08em] text-[#857f74]">
                  {field.replaceAll("_", " ")}
                </dt>
                <dd className="mt-1 text-sm">{displayResolvedValue(value)}</dd>
              </div>
            );
          })}
        {audienceAllows(audience, "exact_location") && (
          <div className="border-t border-[#ddd8ce] py-3">
            <dt className="text-[10px] uppercase tracking-[0.08em] text-[#857f74]">
              Exact location
            </dt>
            <dd className="mt-1 text-sm">
              {displayResolvedValue(resolveSpecValue(item, "exact_location"))}
            </dd>
          </div>
        )}
        {audienceAllows(audience, "trade_price") && (
          <>
            <div className="border-t border-[#ddd8ce] py-3">
              <dt className="text-[10px] uppercase tracking-[0.08em] text-[#857f74]">
                Trade price
              </dt>
              <dd className="mt-1 text-sm">
                {item.trade_price_cents == null
                  ? "—"
                  : `$${(item.trade_price_cents / 100).toFixed(2)}`}
              </dd>
            </div>
            <div className="border-t border-[#ddd8ce] py-3">
              <dt className="text-[10px] uppercase tracking-[0.08em] text-[#857f74]">
                Markup
              </dt>
              <dd className="mt-1 text-sm">{item.markup_percent ?? "—"}%</dd>
            </div>
          </>
        )}
      </dl>
      {notes && (
        <div className="mt-8 border-t border-[#b9ad9b] pt-4">
          <p className="whitespace-pre-wrap text-sm leading-6">{notes}</p>
        </div>
      )}
    </div>
  );
}

export function SpecBookWorkspace({ projectId }: { projectId: string }) {
  const hydrated = useHydrated();
  const workbench = useSpecBookWorkbench(projectId);
  const project = useProjectV2(projectId) as {
    data: { name?: string; title?: string } | undefined;
  };
  const bulkUpdateSpec = useUpdateProjectFfeSpec();
  const updateSetting = useUpdateSpecBookItemSetting(projectId);
  const prepareIssue = usePrepareSpecBookIssue();
  const finalizeIssue = useFinalizeSpecBookIssue(projectId);
  const renderArtifact = useRenderSpecBookArtifact(projectId);
  const createShare = useCreateSpecBookShare(projectId);

  const [view, setView] = useState<WorkspaceView>("workbench");
  const [readiness, setReadiness] = useState<ReadinessFilter>("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
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
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);
  const [shareResult, setShareResult] = useState<{
    artifactId: string;
    url: string;
  } | null>(null);
  const openedRef = useRef(false);

  const data = workbench.data;
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
    return items.filter(
      (item) => (item.spec?.readiness_status ?? "draft") === readiness,
    );
  }, [data?.items, latestIssued?.issued_at, readiness]);

  const groups = useMemo(() => {
    const chapters = data?.chapters ?? [];
    const assigned = new Set<string>();
    const result = chapters
      .filter((chapter) => chapter.included !== false)
      .map((chapter) => {
        const items = visibleItems.filter((item) => {
          const belongs =
            item.setting?.chapter_id === chapter.id ||
            (!item.setting?.chapter_id &&
              item.project_room_id === chapter.project_room_id);
          if (belongs) assigned.add(item.id);
          return belongs;
        });
        return { id: chapter.id, title: chapter.title, items };
      });
    const unassigned = visibleItems.filter((item) => !assigned.has(item.id));
    if (unassigned.length > 0) {
      result.push({ id: "unassigned", title: "Unassigned", items: unassigned });
    }
    return result;
  }, [data?.chapters, visibleItems]);

  useEffect(() => {
    if (!data || openedRef.current) return;
    openedRef.current = true;
    specBookEvents.opened({
      project_id: projectId,
      item_count: data.items.length,
    });
  }, [data, projectId]);

  useEffect(() => {
    if (!selectedItemId && data?.items[0]) setSelectedItemId(data.items[0].id);
  }, [data?.items, selectedItemId]);

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

  const markVisibleReady = async () => {
    const candidates = visibleItems.filter(
      (item) => item.spec && item.spec.readiness_status !== "ready",
    );
    if (candidates.length === 0) {
      setBulkFeedback("Every visible selection is already ready.");
      return;
    }
    setBulkFeedback(null);
    try {
      await Promise.all(
        candidates.map((item) =>
          bulkUpdateSpec.mutateAsync({
            projectId,
            specId: item.spec!.id,
            expectedRowVersion: item.spec!.row_version,
            changes: { readiness_status: "ready" },
          }),
        ),
      );
      candidates.forEach((item) =>
        specBookEvents.readinessChanged({
          project_id: projectId,
          item_id: item.id,
          from: item.spec!.readiness_status,
          to: "ready",
        }),
      );
      setBulkFeedback(`${candidates.length} selections marked ready.`);
    } catch (error) {
      setBulkFeedback(
        error instanceof Error
          ? error.message
          : "Bulk readiness update failed.",
      );
    }
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
      await Promise.all(
        prepared.artifacts.map(async (artifact) => {
          const renderStarted = performance.now();
          try {
            await renderArtifact.mutateAsync(artifact.id);
            specBookEvents.artifactRendered({
              project_id: projectId,
              artifact_id: artifact.id,
              audience: artifact.audience,
              duration_ms: Math.round(performance.now() - renderStarted),
            });
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
      await finalizeIssue.mutateAsync(prepared.revision.id);
      specBookEvents.issued({
        project_id: projectId,
        revision_id: prepared.revision.id,
        issue_type: issueType,
        duration_ms: Math.round(performance.now() - issueStarted),
      });
      setIssueFeedback("Revision issued. Every audience artifact is durable.");
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
    finalizeIssue,
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
      await renderArtifact.mutateAsync(artifact.id);
      try {
        await finalizeIssue.mutateAsync(artifact.revision_id);
        setIssueFeedback(
          `${artifact.audience} artifact rendered and the revision is issued.`,
        );
      } catch {
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
      <main className="min-h-screen bg-[var(--doc-paper)] px-8 py-12" aria-busy>
        <p
          className="font-heading italic text-[var(--text-muted)]"
          role="status"
          aria-live="polite"
        >
          Opening the working book…
        </p>
      </main>
    );
  }

  if (workbench.error || !data) {
    return (
      <main className="min-h-screen bg-[var(--doc-paper)] px-8 py-12">
        <h1 className="font-heading text-2xl text-[var(--color-charcoal)]">
          The working book could not be opened.
        </h1>
        <p className="mt-3 max-w-lg text-sm text-[var(--text-muted)]">
          {workbench.error instanceof Error
            ? workbench.error.message
            : "The project may not be available to this studio."}
        </p>
        <Button
          className="mt-5"
          variant="secondary"
          onClick={() => workbench.refetch()}
        >
          Try again
        </Button>
      </main>
    );
  }

  const projectName = project.data?.name ?? project.data?.title ?? "Project";
  const issueBusy =
    prepareIssue.isPending ||
    renderArtifact.isPending ||
    finalizeIssue.isPending;

  return (
    <main className="min-h-screen bg-[var(--doc-paper)] text-[var(--color-charcoal)]">
      <header className="sticky top-0 z-20 border-b border-[var(--color-pearl)] bg-[var(--doc-paper)]/95 px-4 py-3 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-4">
          <Link
            href={`/doc/${projectId}`}
            className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)] hover:text-[var(--color-clay)]"
          >
            ← {projectName}
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-heading text-xl">{data.book.title}</h1>
            <p className="font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Working book · {data.items.length} selections ·{" "}
              {data.revisions.length} revisions
            </p>
          </div>
          <nav
            aria-label="Spec book workspace"
            className="flex items-center gap-1"
          >
            {(
              [
                ["workbench", "Workbench"],
                ["preview", "Audience preview"],
                ["preflight", "Preflight"],
                ["history", "Revisions"],
              ] as Array<[WorkspaceView, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                aria-current={view === id ? "page" : undefined}
                className={`px-3 py-2 font-mono text-[9px] uppercase tracking-[0.08em] ${
                  view === id
                    ? "border-b border-[var(--color-clay)] text-[var(--color-charcoal)]"
                    : "text-[var(--text-muted)]"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          <Button size="sm" variant="secondary" onClick={runPreflight}>
            Preflight
          </Button>
        </div>
      </header>

      {view === "workbench" && (
        <div className="mx-auto grid max-w-[1500px] md:grid-cols-[220px_minmax(340px,1fr)_minmax(360px,0.9fr)]">
          <aside className="border-r border-[var(--color-pearl)] p-4 md:min-h-[calc(100vh-70px)]">
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
              Chapters
            </p>
            <ol className="mt-3 space-y-1">
              {groups.map((group, index) => (
                <li key={group.id}>
                  <a
                    href={`#chapter-${group.id}`}
                    className="flex items-center justify-between gap-2 px-2 py-2 text-[12px] hover:bg-[rgba(196,165,123,0.05)]"
                  >
                    <span>
                      <span className="mr-2 font-mono text-[8px] text-[var(--text-muted)]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {group.title}
                    </span>
                    <span className="font-mono text-[8px] text-[var(--text-muted)]">
                      {group.items.length}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
            <div className="mt-8">
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                Readiness
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    "all",
                    "draft",
                    "incomplete",
                    "ready",
                    "blocked",
                    "unassigned",
                    "drift",
                  ] as ReadinessFilter[]
                ).map((value) => (
                  <FilterPill
                    key={value}
                    active={readiness === value}
                    onClick={() => setReadiness(value)}
                  >
                    {value}
                  </FilterPill>
                ))}
              </div>
              <Button
                className="mt-4 w-full"
                size="sm"
                variant="secondary"
                loading={bulkUpdateSpec.isPending}
                onClick={() => void markVisibleReady()}
              >
                Mark visible ready
              </Button>
              {bulkFeedback && (
                <p
                  className="mt-2 text-[10px] text-[var(--text-muted)]"
                  role="status"
                >
                  {bulkFeedback}
                </p>
              )}
            </div>
          </aside>

          <section
            aria-label="Spec book selections"
            className="border-r border-[var(--color-pearl)]"
          >
            {groups.map((group) => (
              <div
                key={group.id}
                id={`chapter-${group.id}`}
                className="scroll-mt-24"
              >
                <div className="sticky top-[69px] z-10 flex items-center justify-between border-b border-[var(--color-pearl)] bg-[var(--doc-paper)] px-4 py-3">
                  <h2 className="font-heading text-base italic">
                    {group.title}
                  </h2>
                  <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {group.items.length} items
                  </span>
                </div>
                {group.items.length === 0 ? (
                  <p className="px-5 py-6 text-[12px] italic text-[var(--text-muted)]">
                    Nothing in this chapter matches the filter.
                  </p>
                ) : (
                  group.items.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      selected={selectedItem?.id === item.id}
                      drift={hasIssuedDrift(
                        item,
                        latestIssued?.issued_at ?? null,
                      )}
                      onSelect={() => setSelectedItemId(item.id)}
                    />
                  ))
                )}
              </div>
            ))}
          </section>

          <aside className="p-5 md:max-h-[calc(100vh-70px)] md:overflow-y-auto">
            {selectedItem ? (
              <>
                {selectedItem.setting && (
                  <label className="mb-5 flex items-center justify-between gap-4 border-b border-[var(--color-pearl)] pb-3 text-[11px] text-[var(--text-muted)]">
                    Include in publication
                    <input
                      type="checkbox"
                      checked={selectedItem.setting.included}
                      disabled={updateSetting.isPending}
                      onChange={(event) =>
                        updateSetting.mutate({
                          settingId: selectedItem.setting!.id,
                          changes: { included: event.target.checked },
                        })
                      }
                      className="accent-[var(--color-clay)]"
                    />
                  </label>
                )}
                {hasIssuedDrift(
                  selectedItem,
                  latestIssued?.issued_at ?? null,
                ) && (
                  <div className="mb-5 border border-[var(--color-terracotta)] p-3">
                    <p className="text-[11px] font-medium">
                      Source changed after revision{" "}
                      {latestIssued?.revision_number}.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(
                        [
                          ["accept_source", "Accept source"],
                          ["preserve_override", "Keep override"],
                          ["acknowledge", "Acknowledge"],
                        ] as const
                      ).map(([decision, label]) => (
                        <Button
                          key={decision}
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            specBookEvents.driftDecision({
                              project_id: projectId,
                              item_id: selectedItem.id,
                              decision,
                            })
                          }
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                <SelectionEditor item={selectedItem} />
              </>
            ) : (
              <p className="py-16 text-center italic text-[var(--text-muted)]">
                Choose a selection.
              </p>
            )}
          </aside>
        </div>
      )}

      {view === "preview" && (
        <div className="mx-auto grid max-w-[1300px] gap-6 px-5 py-8 lg:grid-cols-[230px_1fr]">
          <aside>
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
              Edition
            </p>
            <div className="mt-3 space-y-2">
              {AUDIENCES.map((audience) => (
                <button
                  key={audience.id}
                  type="button"
                  onClick={() => setPreviewAudience(audience.id)}
                  className={`w-full border px-3 py-3 text-left ${
                    previewAudience === audience.id
                      ? "border-[var(--color-clay)]"
                      : "border-[var(--color-pearl)]"
                  }`}
                >
                  <span className="block text-[12px] font-medium">
                    {audience.label}
                  </span>
                  <span className="mt-1 block text-[10px] text-[var(--text-muted)]">
                    {audience.description}
                  </span>
                </button>
              ))}
            </div>
            <label className="mt-6 block text-[10px] text-[var(--text-muted)]">
              Item sheet
              <Select
                className="mt-1"
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
          </aside>
          <section
            aria-label={`${previewAudience} edition preview`}
            className="overflow-auto bg-[#e7e2d8] p-6"
          >
            <AudiencePreview item={selectedItem} audience={previewAudience} />
          </section>
        </div>
      )}

      {view === "preflight" && (
        <div className="mx-auto grid max-w-[1200px] gap-8 px-5 py-8 lg:grid-cols-[1fr_360px]">
          <section>
            <div className="flex items-center gap-3">
              {preflight.ready ? (
                <Check className="h-6 w-6 text-[#66765f]" />
              ) : (
                <AlertCircle className="h-6 w-6 text-[var(--color-terracotta)]" />
              )}
              <div>
                <h2 className="font-heading text-2xl">
                  {preflight.ready
                    ? "Ready to issue"
                    : `${preflight.blockers.length} blockers remain`}
                </h2>
                <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                  {preflight.warnings.length} warnings · {data.items.length}{" "}
                  selections checked
                </p>
              </div>
            </div>

            <div className="mt-8">
              <h3 className="font-mono text-[9px] uppercase tracking-[0.1em]">
                Blocking
              </h3>
              <ul className="mt-3 divide-y divide-[var(--color-pearl)] border-y border-[var(--color-pearl)]">
                {preflight.blockers.length === 0 ? (
                  <li className="py-4 text-[12px] text-[#66765f]">
                    No blockers.
                  </li>
                ) : (
                  preflight.blockers.map((issue, index) => (
                    <li
                      key={`${issue.code}-${issue.itemId}-${index}`}
                      className="flex items-start justify-between gap-4 py-3"
                    >
                      <span className="text-[12px]">{issue.message}</span>
                      {issue.itemId && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedItemId(issue.itemId!);
                            setView("workbench");
                          }}
                          className="min-h-11 px-2 font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--color-clay)]"
                        >
                          Resolve
                        </button>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="mt-8">
              <h3 className="font-mono text-[9px] uppercase tracking-[0.1em]">
                Warnings
              </h3>
              <ul className="mt-3 divide-y divide-[var(--color-pearl)] border-y border-[var(--color-pearl)]">
                {preflight.warnings.map((issue, index) => (
                  <li
                    key={`${issue.code}-${issue.itemId}-${index}`}
                    className="py-3 text-[12px] text-[var(--text-muted)]"
                  >
                    {issue.message}
                  </li>
                ))}
              </ul>
              {preflight.warnings.length > 0 && (
                <label className="mt-4 block text-[11px] text-[var(--text-muted)]">
                  Warning acknowledgement reason
                  <Textarea
                    className="mt-1"
                    value={warningReason}
                    placeholder="Required to issue with warnings"
                    onChange={(event) => setWarningReason(event.target.value)}
                  />
                </label>
              )}
            </div>
          </section>

          <aside className="border-l border-[var(--color-pearl)] pl-6">
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
              Issue
            </p>
            <div className="mt-4 space-y-2">
              {AUDIENCES.map((audience) => (
                <label
                  key={audience.id}
                  className="flex cursor-pointer items-start gap-3 border border-[var(--color-pearl)] p-3"
                >
                  <input
                    type="checkbox"
                    checked={audiences.includes(audience.id)}
                    onChange={() => toggleAudience(audience.id)}
                    className="mt-0.5 accent-[var(--color-clay)]"
                  />
                  <span>
                    <span className="block text-[12px] font-medium">
                      {audience.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">
                      {audience.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <label className="mt-5 block text-[11px] text-[var(--text-muted)]">
              Issue type
              <Select
                className="mt-1"
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
              <label className="mt-4 block text-[11px] text-[var(--text-muted)]">
                Reason
                <Textarea
                  className="mt-1"
                  value={issueReason}
                  onChange={(event) => setIssueReason(event.target.value)}
                />
              </label>
            )}
            {issueFeedback && (
              <p
                className="mt-4 text-[11px] text-[var(--text-muted)]"
                role="status"
              >
                {issueFeedback}
              </p>
            )}
            <Button
              className="mt-5 w-full"
              loading={issueBusy}
              disabled={!preflight.ready || audiences.length === 0}
              onClick={() => void issue()}
            >
              Issue {audiences.length} edition
              {audiences.length === 1 ? "" : "s"}
            </Button>
            <p className="mt-3 text-[10px] leading-4 text-[var(--text-muted)]">
              Issuing freezes an immutable revision. Each audience renders
              independently and failed artifacts retry in place.
            </p>
          </aside>
        </div>
      )}

      {view === "history" && (
        <div className="mx-auto max-w-[1100px] px-5 py-8">
          <div className="flex items-end justify-between">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                Immutable ledger
              </p>
              <h2 className="mt-2 font-heading text-2xl">Revisions</h2>
            </div>
            {latestIssued && (
              <Button
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
                <Sparkles className="h-4 w-4" />
                Start addendum
              </Button>
            )}
          </div>

          {issueFeedback && (
            <p
              className="mt-5 text-[11px] text-[var(--text-muted)]"
              role="status"
            >
              {issueFeedback}
            </p>
          )}

          <ol className="mt-8 space-y-5">
            {data.revisions.map((revision) => {
              const artifacts = data.artifacts.filter(
                (artifact) => artifact.revision_id === revision.id,
              );
              return (
                <li
                  key={revision.id}
                  className="border-t border-[var(--color-charcoal)] pt-4"
                >
                  <div className="grid gap-5 md:grid-cols-[180px_1fr]">
                    <div>
                      <p className="font-heading text-xl">
                        Revision {revision.revision_number}
                      </p>
                      <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                        {revision.issue_type} · {revision.status}
                      </p>
                      <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                        {new Date(revision.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="space-y-2">
                      {revision.reason && (
                        <p className="mb-3 text-[12px] italic text-[var(--text-muted)]">
                          {revision.reason}
                        </p>
                      )}
                      {artifacts.map((artifact) => (
                        <div
                          key={artifact.id}
                          className="flex flex-wrap items-center gap-3 border border-[var(--color-pearl)] px-3 py-2"
                        >
                          {artifact.status === "ready" ? (
                            <FileText className="h-4 w-4 text-[#66765f]" />
                          ) : artifact.status === "failed" ? (
                            <AlertCircle className="h-4 w-4 text-[var(--color-terracotta)]" />
                          ) : (
                            <FileClock className="h-4 w-4 text-[#a47f33]" />
                          )}
                          <span className="min-w-24 text-[12px] capitalize">
                            {artifact.audience} PDF
                          </span>
                          <span className="flex-1 font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                            {artifact.status}
                            {artifact.error_message
                              ? ` · ${artifact.error_message}`
                              : ""}
                          </span>
                          {(artifact.status === "failed" ||
                            artifact.status === "pending") && (
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={renderArtifact.isPending}
                              onClick={() => void retryArtifact(artifact)}
                            >
                              <RefreshCw className="h-3 w-3" />
                              {artifact.status === "failed"
                                ? "Retry"
                                : "Render"}
                            </Button>
                          )}
                          {artifact.status === "ready" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={createShare.isPending}
                              onClick={() => void shareArtifact(artifact)}
                            >
                              <Share2 className="h-3 w-3" />
                              Share
                            </Button>
                          )}
                          {shareResult?.artifactId === artifact.id && (
                            <div className="basis-full border-t border-[var(--color-pearl)] pt-2">
                              <label className="text-[9px] text-[var(--text-muted)]">
                                Copy this tokenized link now; the raw token is
                                shown only once.
                                <Input
                                  readOnly
                                  className="mt-1 font-mono text-[10px]"
                                  value={shareResult.url}
                                  onFocus={(event) =>
                                    event.currentTarget.select()
                                  }
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {data.revisions.length === 0 && (
            <p className="mt-12 text-center font-heading italic text-[var(--text-muted)]">
              No revisions issued yet.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
