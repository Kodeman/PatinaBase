"use client";

/**
 * US-21 T-29: the Spec lens's right pane (a4, a6, a14). One line's fields on
 * the working sheet, in a4's order: what we need, maker, product (fill in
 * place or bring one in), image (D15, `selected_media`), finish, material,
 * color, dimensions, exact location, notes, rooms, unit, labor and COM. The
 * stamp is D1's, so it flips to SPECCED the moment a maker is named or the
 * line is filled. No money here: a dim rough figure points to Price, and a
 * labor line's client price is the one exception (T-21a amendment).
 *
 * Writes: spec columns through `useUpdateProjectFfeSpec` (the authenticated
 * column grant, row_version checked); the maker through
 * `set_project_ffe_line_commercials` (00692); the fill through
 * `place_product_in_project_v2`, which keeps the need label on the thread
 * (D2); the unit through `set_project_ffe_line_build_fields` (00730); a labor
 * line's client price through `set_labor_line_price` (00737).
 */

import { useId, useState, type DragEvent, type ReactNode } from "react";
import {
  usePlaceProductInProjectV2,
  useSetFfeLineBuildFields,
  useSetFfeLineCommercials,
  useSetLaborLinePrice,
  useUpdateProjectFfeSpec,
  type ProjectFfeSpec,
  type VendorMatch,
} from "@patina/supabase";
import type {
  FfeDesignDisposition,
  FfeAssignmentScope,
  FfeLineUnit,
  FfeRoomPlacement,
} from "@patina/types";
import { ProductPickerModal } from "@/components/portal/proposals/product-picker-modal";
import {
  LABOR_STAMP_LABEL,
  deriveLineStage,
  isLaborLine,
  lineStageInputFromRow,
  lineStampLabel,
  type LineStageRow,
} from "@/lib/document/stamp-derivation";
import { lineImageUrl } from "@/lib/document/pieces/spec-progress";
import { ROUGH_IN_UNITS } from "@/lib/document/pieces/rough-in-keys";
import { DimensionFields } from "../dimension-fields";
import {
  MakerMatchLine,
  MakerSearch,
  useAddMaker,
  type MakerOption,
} from "../line-unfold/the-buy-cell";
import { ComToggle } from "./com-toggle";
import { LaborAct, parseRoughCents } from "./labor-act";
import {
  LibraryInlineSearch,
  type LibraryInlineResult,
} from "./library-inline-search";
import {
  PlacementChips,
  perUnit,
  shareText,
  unitWord,
  type PieceRoom,
} from "./placement-chips";

/** A schedule row as the Spec lens reads it (`useProjectFFEItems`). */
export type SpecLensLine = LineStageRow & {
  id: string;
  name: string;
  unit?: string | null;
  rough_cents?: number | null;
  link_kind?: string | null;
  project_room_id?: string | null;
  assignment_scope?: string | null;
  design_disposition?: string | null;
  role_identity?: string | null;
  purchase_order_id?: string | null;
  trade_scope_document_id?: string | null;
  selection_thread_id?: string | null;
  product?: {
    id?: string;
    name?: string | null;
    images?: unknown;
    brand?: string | null;
  } | null;
};

/** The spec row's columns this pane reads and writes. */
export type SpecLensSpec = Pick<
  ProjectFfeSpec,
  | "id"
  | "ffe_item_id"
  | "row_version"
  | "finish"
  | "material"
  | "color_fabric"
  | "selected_dimensions"
  | "exact_location"
  | "trade_notes"
  | "selected_media"
>;

type SpecChanges = Partial<
  Pick<
    ProjectFfeSpec,
    | "finish"
    | "material"
    | "color_fabric"
    | "selected_dimensions"
    | "exact_location"
    | "trade_notes"
    | "selected_media"
  >
>;

export const FILL_PREVIEW_SENTENCE =
  "The need stays on the line. The PO carries the product.";
export const RELEASED_SENTENCE =
  "Released lines change through Record a change.";
const UNIT_LOCKED_SENTENCE =
  "This line is released. Quantity and unit change through Record a change.";
const PRICE_LOCKED_SENTENCE = "Changes through Record a change.";
const MAKER_ON_ORDER_SENTENCE =
  "The line is on an order. Its maker changes through the order.";
const DROP_LINK_SENTENCE = "Drop an image from a web page, or paste its link.";
const LINK_INVALID_SENTENCE =
  "That is not a web link. Paste one that starts with https://.";

const DISPOSITIONS: ReadonlySet<string> = new Set([
  "candidate",
  "selected",
  "alternate",
]);

const ACT_CLS =
  "inline-flex min-h-[44px] min-w-[44px] items-center font-mono text-[12px] font-medium uppercase tracking-[.06em] text-[color:var(--sheet-ink-muted,#4A4540)] underline decoration-[color:var(--sheet-ink,#1A1816)] decoration-1 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--clay-ink)] aria-disabled:cursor-not-allowed aria-disabled:text-[color:var(--sheet-ink-faint,#6B655E)]";
/** The one heavy act on a surface: a second rule in clay (SPEC §2.5). */
export const INKED_ACT_CLS = `${ACT_CLS} !text-[color:var(--sheet-ink,#1A1816)] border-b border-[color:var(--color-clay)]`;
const LABEL_CLS =
  "font-mono text-[11px] font-medium uppercase leading-none tracking-[.06em] text-[color:var(--sheet-ink-muted,#4A4540)]";
const VALUE_CLS =
  "font-sans text-[15px] leading-[1.5] text-[color:var(--sheet-ink,#1A1816)]";
const INPUT_CLS =
  "w-full border-0 border-b border-[color:var(--sheet-rule,#D9D4CC)] bg-transparent px-0 py-1 font-sans text-[15px] leading-[1.5] text-[color:var(--sheet-ink,#1A1816)] placeholder:text-[color:var(--sheet-ink-faint,#6B655E)] focus-visible:border-[color:var(--sheet-rule-strong,#1A1816)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--clay-ink)]";
const SENTENCE_CLS =
  "max-w-[56ch] font-sans text-[14px] leading-[1.5] text-[color:var(--sheet-ink,#1A1816)]";
const REASON_CLS =
  "font-sans text-[13px] text-[color:var(--sheet-ink-faint,#6B655E)]";

function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `spec-fill-${Date.now()}`;
}

/** An http(s) link, or null. Nothing else becomes an image source. */
export function imageLink(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex min-w-0 flex-col gap-2 ${wide ? "md:col-span-2" : ""}`}
    >
      <span className={LABEL_CLS}>{label}</span>
      {children}
    </div>
  );
}

/** A text field written on blur or Enter, only when it changed. */
function SpecText({
  label,
  value,
  placeholder,
  multiline,
  onSave,
}: {
  label: string;
  value: string | null | undefined;
  placeholder?: string;
  multiline?: boolean;
  onSave: (next: string | null) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const commit = () => {
    const next = draft.trim();
    if (next === (value ?? "").trim()) return;
    onSave(next === "" ? null : next);
  };
  const common = {
    "aria-label": label,
    value: draft,
    placeholder,
    onBlur: commit,
    className: INPUT_CLS,
  };
  return (
    <Field label={label} wide={multiline}>
      {multiline ? (
        <textarea
          {...common}
          rows={2}
          onChange={(e) => setDraft(e.target.value)}
        />
      ) : (
        <input
          {...common}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
        />
      )}
    </Field>
  );
}

type FillPick = {
  productId: string;
  name: string;
  detail: string;
  idempotencyKey: string;
};

export interface SpecFieldsPaneProps {
  projectId: string;
  canSeeMoney: boolean;
  line: SpecLensLine;
  /** The line's spec row; null while it loads or when the line has none. */
  spec: SpecLensSpec | null;
  /** The thread's need label (D2); the line name when it has none. */
  needLabel: string;
  /** A labor line's piece; null on any other line. */
  piece: SpecLensLine | null;
  /** The piece's labor lines (empty on a labor line). */
  laborLines: readonly SpecLensLine[];
  /** This line's room placements. */
  placements: readonly FfeRoomPlacement[];
  rooms: readonly PieceRoom[];
  /** The saved spec row, so the next save carries its row_version. */
  onSpecSaved: (spec: ProjectFfeSpec) => void;
}

export function SpecFieldsPane({
  projectId,
  canSeeMoney,
  line,
  spec,
  needLabel,
  piece,
  laborLines,
  placements,
  rooms,
  onSpecSaved,
}: SpecFieldsPaneProps) {
  const updateSpec = useUpdateProjectFfeSpec();
  const commercials = useSetFfeLineCommercials({ errorSurface: "inline" });
  const buildFields = useSetFfeLineBuildFields();
  const laborPrice = useSetLaborLinePrice();
  const place = usePlaceProductInProjectV2();
  const addMaker = useAddMaker();

  const [error, setError] = useState<string | null>(null);
  const [choosingMaker, setChoosingMaker] = useState(false);
  const [filling, setFilling] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pick, setPick] = useState<FillPick | null>(null);
  const [link, setLink] = useState("");
  const [imageNote, setImageNote] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState<string | null>(null);
  const ids = useId();

  const labor = isLaborLine(line);
  const stage = deriveLineStage(lineStageInputFromRow(line, piece));
  const released = line.ffe_line_authorization != null;
  const onOrder = line.purchase_order_id != null;
  const locked = released || onOrder;
  const quantity = line.quantity ?? 0;
  const productName = line.product_id
    ? (line.product?.name ?? line.name)
    : null;
  const image = lineImageUrl(line, spec);
  const unit = (ROUGH_IN_UNITS as readonly string[]).includes(line.unit ?? "")
    ? (line.unit as FfeLineUnit)
    : "each";

  const saveSpec = (changes: SpecChanges) => {
    if (!spec) return;
    setError(null);
    updateSpec
      .mutateAsync({
        projectId,
        specId: spec.id,
        expectedRowVersion: spec.row_version,
        changes,
      })
      .then(onSpecSaved)
      .catch((e: unknown) =>
        setError(errorText(e, "The field was not saved.")),
      );
  };

  const setMaker = (vendorId: string) => {
    setError(null);
    commercials
      .mutateAsync({ projectId, itemId: line.id, vendorId })
      .then(() => {
        setChoosingMaker(false);
        addMaker.clearMatch();
      })
      .catch((e: unknown) => setError(errorText(e, "The maker was not set.")));
  };

  const chooseMaker = (option: MakerOption) => {
    if (option.kind === "vendor") {
      setMaker(option.id);
      return;
    }
    addMaker
      .add(option.name)
      .then((made) => {
        if (made) setMaker(made.id);
      })
      .catch((e: unknown) =>
        setError(errorText(e, "The maker was not added.")),
      );
  };

  const choose = (next: {
    productId: string;
    name: string;
    detail: string;
  }) => {
    setPick({ ...next, idempotencyKey: newIdempotencyKey() });
    setFilling(false);
  };

  const fill = () => {
    if (!pick || place.isPending) return;
    setError(null);
    const scope = (line.assignment_scope ?? "unassigned") as FfeAssignmentScope;
    const disposition = DISPOSITIONS.has(line.design_disposition ?? "")
      ? (line.design_disposition as Exclude<FfeDesignDisposition, "superseded">)
      : undefined;
    place
      .mutateAsync({
        projectId,
        productId: pick.productId,
        quantity: Math.max(1, quantity),
        itemType: "fixed",
        assignmentScope: scope,
        roomId: scope === "room" ? (line.project_room_id ?? null) : null,
        ...(disposition ? { disposition } : {}),
        duplicateMode: "create",
        placeholderSelectionId: line.id,
        roleConfigurationIdentity: line.role_identity ?? "default",
        idempotencyKey: pick.idempotencyKey,
      })
      .then(() => setPick(null))
      .catch((e: unknown) =>
        setError(errorText(e, "The line was not filled.")),
      );
  };

  const saveLink = (raw: string) => {
    const url = imageLink(raw);
    if (!url) {
      setImageNote(raw.trim() ? LINK_INVALID_SENTENCE : DROP_LINK_SENTENCE);
      return;
    }
    setImageNote(null);
    setLink("");
    saveSpec({ selected_media: [{ url }] });
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const dropped =
      event.dataTransfer
        .getData("text/uri-list")
        .split(/\r?\n/)
        .find((l) => l && !l.startsWith("#")) ||
      event.dataTransfer.getData("text/plain");
    if (dropped) saveLink(dropped);
    else setImageNote(DROP_LINK_SENTENCE);
  };

  const savePrice = () => {
    if (priceDraft == null) return;
    const cents = parseRoughCents(priceDraft);
    if (cents === "invalid") {
      setError("Client price is an amount in dollars, like 85 or 4,800.");
      return;
    }
    setPriceDraft(null);
    if (cents == null || cents === (line.unit_price_cents ?? null)) return;
    setError(null);
    laborPrice
      .mutateAsync({ projectId, itemId: line.id, unitPriceCents: cents })
      .catch((e: unknown) =>
        setError(errorText(e, "The price was not saved.")),
      );
  };

  const makerName = (line.vendor_name ?? "").trim();
  const specFields = spec != null;

  return (
    <section
      data-testid="spec-fields-pane"
      aria-label={`Spec for ${needLabel}`}
      className="flex min-w-0 flex-col gap-6"
    >
      <header className="flex flex-col gap-2">
        <span className={LABEL_CLS}>What we need</span>
        <h2 className="font-heading text-[24px] font-normal leading-[1.2] text-[color:var(--sheet-ink,#1A1816)]">
          {needLabel} · {shareText(quantity, line.unit)}
        </h2>
        {productName && productName !== needLabel && (
          <p className="font-sans text-[13px] leading-[1.4] text-[color:var(--sheet-ink-muted,#4A4540)]">
            {productName}
          </p>
        )}
        <span className="flex flex-wrap items-center gap-2">
          {labor && (
            <span className="stamp stamp--labor">{LABOR_STAMP_LABEL}</span>
          )}
          <span data-testid="spec-stamp" className={`stamp stamp--${stage}`}>
            {lineStampLabel(stage)}
          </span>
        </span>
      </header>

      <div className="grid grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2">
        <Field label="Maker">
          {makerName ? (
            <span className={VALUE_CLS}>{makerName}</span>
          ) : (
            <span
              className={`${VALUE_CLS} text-[color:var(--sheet-ink-faint,#6B655E)]`}
            >
              No maker yet
            </span>
          )}
          {choosingMaker ? (
            <MakerSearch
              disabled={commercials.isPending || addMaker.isPending}
              autoFocus
              onChoose={chooseMaker}
              onCancel={() => setChoosingMaker(false)}
            />
          ) : (
            <span className="flex flex-wrap items-center gap-x-3">
              <button
                type="button"
                className={ACT_CLS}
                aria-disabled={onOrder || undefined}
                aria-describedby={onOrder ? `${ids}-maker` : undefined}
                onClick={() => {
                  if (!onOrder) setChoosingMaker(true);
                }}
              >
                {makerName ? "CHANGE THE MAKER" : "NAME A MAKER"}
              </button>
              {onOrder && (
                <span id={`${ids}-maker`} className={REASON_CLS}>
                  {MAKER_ON_ORDER_SENTENCE}
                </span>
              )}
            </span>
          )}
          {addMaker.match && (
            <MakerMatchLine
              match={addMaker.match}
              disabled={commercials.isPending}
              onUse={(match: VendorMatch) => setMaker(match.id)}
            />
          )}
        </Field>

        <Field label="Product">
          {productName ? (
            <span className={VALUE_CLS}>{productName}</span>
          ) : labor ? (
            <span className={REASON_CLS}>
              Labor isn’t filled with a product.
            </span>
          ) : pick ? (
            <div
              data-testid="fill-preview"
              className="flex flex-col gap-1 border border-[color:var(--sheet-rule-strong,#1A1816)] p-3"
            >
              <span className="font-sans text-[14px] font-medium leading-[1.4] text-[color:var(--sheet-ink,#1A1816)]">
                {needLabel}
              </span>
              <span className="font-sans text-[13px] leading-[1.4] text-[color:var(--sheet-ink-muted,#4A4540)]">
                {pick.detail}
              </span>
              <p className={`${SENTENCE_CLS} mt-2`}>{FILL_PREVIEW_SENTENCE}</p>
              <span className="flex flex-wrap items-center gap-x-6">
                <button
                  type="button"
                  className={INKED_ACT_CLS}
                  aria-busy={place.isPending || undefined}
                  onClick={fill}
                >
                  FILL THIS LINE
                </button>
                <button
                  type="button"
                  className={ACT_CLS}
                  onClick={() => setPick(null)}
                >
                  PUT BACK
                </button>
              </span>
            </div>
          ) : filling ? (
            <LibraryInlineSearch
              autoFocus
              label="Fill with a product"
              onChoose={(row: LibraryInlineResult) => {
                const name = [row.name.trim(), row.finish?.trim()]
                  .filter(Boolean)
                  .join(", ");
                const parts = [name, shareText(quantity, line.unit)];
                if (canSeeMoney && row.price_retail != null)
                  parts.push(perUnit(row.price_retail, "each"));
                choose({
                  productId: row.id,
                  name: row.name,
                  detail: parts.join(" · "),
                });
              }}
              onSearchLibrary={(query) => {
                setPickerSearch(query);
                setPickerOpen(true);
              }}
            />
          ) : (
            <span className="flex flex-wrap items-center gap-x-6">
              <button
                type="button"
                className={ACT_CLS}
                aria-disabled={locked || undefined}
                aria-describedby={locked ? `${ids}-fill` : undefined}
                onClick={() => {
                  if (!locked) setFilling(true);
                }}
              >
                FILL WITH A PRODUCT
              </button>
              <button
                type="button"
                className={ACT_CLS}
                aria-disabled={locked || undefined}
                aria-describedby={locked ? `${ids}-fill` : undefined}
                onClick={() => {
                  if (locked) return;
                  setPickerSearch("");
                  setPickerOpen(true);
                }}
              >
                BRING IN…
              </button>
              {locked && (
                <span id={`${ids}-fill`} className={REASON_CLS}>
                  {RELEASED_SENTENCE}
                </span>
              )}
            </span>
          )}
        </Field>

        <Field label="Image" wide>
          <div
            data-testid="spec-image-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="flex h-[140px] w-[200px] items-center justify-center border border-dashed border-[color:var(--sheet-ink-faint,#6B655E)] p-2 text-center font-mono text-[11px] uppercase leading-[1.4] text-[color:var(--sheet-ink-faint,#6B655E)]"
          >
            {image ? (
              <img
                src={image}
                alt={`The image for ${needLabel}`}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              "Drop an image or paste a link"
            )}
          </div>
          <input
            type="url"
            aria-label="Paste an image link"
            placeholder="https://"
            value={link}
            disabled={!specFields}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveLink(link);
              }
            }}
            onBlur={() => {
              if (link.trim()) saveLink(link);
            }}
            className={`${INPUT_CLS} max-w-[360px]`}
          />
          {imageNote && <span className={REASON_CLS}>{imageNote}</span>}
        </Field>

        {specFields ? (
          <>
            <SpecText
              key={`finish-${spec.id}`}
              label="Finish"
              value={spec.finish}
              onSave={(finish) => saveSpec({ finish })}
            />
            <SpecText
              key={`material-${spec.id}`}
              label="Material"
              value={spec.material}
              onSave={(material) => saveSpec({ material })}
            />
            <SpecText
              key={`color-${spec.id}`}
              label="Color"
              value={spec.color_fabric}
              onSave={(color_fabric) => saveSpec({ color_fabric })}
            />
            <Field label="Dimensions">
              <DimensionsField
                key={`dimensions-${spec.id}`}
                value={
                  (spec.selected_dimensions as Record<
                    string,
                    unknown
                  > | null) ?? null
                }
                onSave={(selected_dimensions) =>
                  saveSpec({
                    selected_dimensions: selected_dimensions as never,
                  })
                }
              />
            </Field>
            <SpecText
              key={`location-${spec.id}`}
              label="Exact location"
              value={spec.exact_location}
              placeholder="See drawings"
              onSave={(exact_location) => saveSpec({ exact_location })}
            />
            <SpecText
              key={`notes-${spec.id}`}
              label="Notes"
              value={spec.trade_notes}
              multiline
              onSave={(trade_notes) => saveSpec({ trade_notes })}
            />
          </>
        ) : (
          <p className={`${SENTENCE_CLS} md:col-span-2`}>
            This line’s spec fields are not here yet.
          </p>
        )}

        <Field label="Rooms" wide>
          <PlacementChips
            projectId={projectId}
            line={{
              id: line.id,
              quantity,
              unit: line.unit ?? "each",
              // No money in Spec (Q7): the chips print shares, never a total.
              unitPriceCents: null,
              projectRoomId: line.project_room_id ?? null,
            }}
            placements={placements}
            rooms={rooms}
            canEdit
          />
        </Field>

        <Field label="Unit">
          <select
            aria-label="Unit"
            value={unit}
            aria-disabled={locked || undefined}
            aria-describedby={locked ? `${ids}-unit` : undefined}
            onChange={(e) => {
              if (locked) return;
              setError(null);
              buildFields
                .mutateAsync({
                  projectId,
                  itemId: line.id,
                  unit: e.target.value as FfeLineUnit,
                })
                .catch((err: unknown) =>
                  setError(errorText(err, "The unit was not saved.")),
                );
            }}
            className={`${INPUT_CLS} max-w-[160px]`}
          >
            {ROUGH_IN_UNITS.map((u) => (
              <option key={u} value={u}>
                {unitWord(u)}
              </option>
            ))}
          </select>
          {locked && (
            <span id={`${ids}-unit`} className={REASON_CLS}>
              {UNIT_LOCKED_SENTENCE}
            </span>
          )}
        </Field>

        {labor && canSeeMoney && (
          <Field label="Client price / unit">
            {released ? (
              <>
                <span className={`${VALUE_CLS} tabular-nums`}>
                  {line.unit_price_cents
                    ? perUnit(line.unit_price_cents, line.unit)
                    : "Not priced"}
                </span>
                <span className={REASON_CLS}>{PRICE_LOCKED_SENTENCE}</span>
              </>
            ) : (
              <input
                aria-label="Client price / unit"
                inputMode="decimal"
                placeholder="$"
                value={
                  priceDraft ??
                  (line.unit_price_cents
                    ? String(line.unit_price_cents / 100)
                    : "")
                }
                onChange={(e) => setPriceDraft(e.target.value)}
                onBlur={savePrice}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    savePrice();
                  }
                }}
                className={`${INPUT_CLS} max-w-[160px] tabular-nums`}
              />
            )}
          </Field>
        )}

        {!labor && (
          <>
            <Field label="Labor">
              <LaborAct
                projectId={projectId}
                piece={line}
                laborLines={laborLines}
                canEdit
              />
            </Field>
            <Field label="COM">
              <ComToggle projectId={projectId} item={line} canEdit />
            </Field>
          </>
        )}
      </div>

      {line.rough_cents != null && (
        <p
          data-testid="spec-rough"
          className="self-end font-sans text-[14px] tabular-nums text-[color:var(--sheet-ink-faint,#6B655E)]"
        >
          ~{perUnit(line.rough_cents, line.unit)}
          {canSeeMoney ? " · set the price in Price" : ""}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="font-sans text-[13px] text-[color:var(--color-terracotta-ink)]"
        >
          {error}
        </p>
      )}

      <ProductPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(result) => {
          setPickerOpen(false);
          const parts = [result.name, shareText(quantity, line.unit)];
          if (canSeeMoney && result.priceCents != null)
            parts.push(perUnit(result.priceCents, "each"));
          choose({
            productId: result.productId,
            name: result.name,
            detail: parts.join(" · "),
          });
        }}
        rooms={rooms.map((room) => ({ id: room.id, name: room.name }))}
        defaultScopeRoomId={line.project_room_id ?? null}
        scope="library"
        initialTab="library"
        initialSearch={pickerSearch}
      />
    </section>
  );
}

/** W × D × H, written when focus leaves the three fields. */
function DimensionsField({
  value,
  onSave,
}: {
  value: Record<string, unknown> | null;
  onSave: (next: Record<string, unknown> | null) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <div
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        if (JSON.stringify(draft) !== JSON.stringify(value)) onSave(draft);
      }}
    >
      <DimensionFields value={draft} onChange={setDraft} />
    </div>
  );
}
