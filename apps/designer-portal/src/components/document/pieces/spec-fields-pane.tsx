"use client";

/**
 * US-21 T-29: the Spec lens's right pane (a4, a6, a14). One line's fields on
 * the working sheet, in a4's order: what we need, maker, product (fill in
 * place or bring one in), image (D15, `selected_media`), finish, material,
 * color, dimensions, exact location, notes, rooms, unit, labor and COM. The
 * stamp is D1's, so it flips to SPECCED the moment a maker is named or the
 * line is filled. No money here (Q7): a dim rough figure points to Price, and
 * every client price, a labor line's included, lives in Price.
 *
 * A released line, a line on an order and a Trade Scope line take no act here,
 * with the reason Rough in prints.
 *
 * Writes: spec columns through `useUpdateProjectFfeSpec` (the authenticated
 * column grant, row_version checked); the maker through
 * `set_project_ffe_line_commercials` (00692); the fill through
 * `place_product_in_project_v2`, which keeps the need label on the thread
 * (D2) and the line's allowance (Q12); the unit and the lead time override
 * through `set_project_ffe_line_build_fields` (00730, 00839).
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import {
  usePlaceProductInProjectV2,
  useSetFfeLineBuildFields,
  useSetFfeLineCommercials,
  useUpdateProjectFfeSpec,
  type ProjectFfeSpec,
  type VendorMatch,
} from "@patina/supabase";
import type {
  BoardOwnerRef,
  FfeDesignDisposition,
  FfeAssignmentScope,
  FfeLineUnit,
  FfeRoomPlacement,
} from "@patina/types";
import { LeadTimeSelect } from "@/components/portal/ffe/lead-time-select";
import { registerBoardOwnerAutosave } from "@/lib/proposal-autosave-registry";
import { ProductPickerModal } from "@/components/portal/proposals/product-picker-modal";
import { leadTimeLabel } from "@/lib/scope/lead-time";
import { writeErrorMessage } from "@/lib/document/write-error";
import {
  LABOR_STAMP_LABEL,
  isLaborLine,
  lineStampLabel,
} from "@/lib/document/stamp-derivation";
import {
  TRADE_SCOPE_REASON,
  pieceLineStage,
  type PieceLineStageRow,
} from "@/lib/document/pieces/line-stage";
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
import { ItemLabelField, ItemLabelPrefix } from "./item-label";
import { LaborAct } from "./labor-act";
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
export type SpecLensLine = PieceLineStageRow & {
  id: string;
  name: string;
  unit?: string | null;
  rough_cents?: number | null;
  budget_min_cents?: number | null;
  link_kind?: string | null;
  project_room_id?: string | null;
  assignment_scope?: string | null;
  design_disposition?: string | null;
  role_identity?: string | null;
  purchase_order_id?: string | null;
  selection_thread_id?: string | null;
  /** The item's own primary picture (00807), shown before the product's. */
  primary_image_url?: string | null;
  /** The item label (00808), printed before the name. */
  doc_code?: string | null;
  /** The designer's lead time override in weeks (00839). */
  lead_time_weeks?: number | null;
  /** What the line already knows (00839): quote, option, catalog, proposal. */
  suggested_lead_time_weeks?: number | null;
  suggested_lead_time_source?: string | null;
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
const MAKER_ON_ORDER_SENTENCE =
  "The line is on an order. Its maker changes through the order.";
const DROP_LINK_SENTENCE = "Drop an image from a web page, or paste its link.";
const LINK_INVALID_SENTENCE =
  "That is not a web link. Paste one that starts with https://.";
export const LEAD_TIME_UNSET_SENTENCE =
  "Not set — the client will see ‘Lead time to be confirmed’";
const LEAD_TIME_SOURCE_WORD: Readonly<Record<string, string>> = {
  quote: "quote",
  configuration: "option",
  catalog: "catalog",
  proposal: "proposal",
};

/** "Suggested · 9–12 wks · from quote", or null when nothing is suggested. */
export function suggestedLeadTimeText(
  weeks: number | null | undefined,
  source: string | null | undefined,
): string | null {
  const label = leadTimeLabel(weeks);
  if (!label) return null;
  const word = source ? LEAD_TIME_SOURCE_WORD[source] : undefined;
  return word ? `Suggested · ${label} · from ${word}` : `Suggested · ${label}`;
}

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
  "w-full border-0 border-b border-[color:var(--sheet-rule,#D9D4CC)] bg-transparent px-0 py-1 font-sans text-[15px] leading-[1.5] text-[color:var(--sheet-ink,#1A1816)] placeholder:text-[color:var(--sheet-ink-faint,#6B655E)] focus-visible:border-[color:var(--sheet-rule-strong,#1A1816)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--clay-ink)] aria-[invalid=true]:border-[color:var(--color-terracotta-ink)]";
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

/**
 * Decides whether a field's draft is a change worth writing. The base is the
 * server's value, or, while a write of this field is out, the value that write
 * sends: a draft put back to the server's value then is still a change, and
 * is written too. Put back with nothing out, the field is clean again.
 */
function useFieldCommit<T>(
  value: T,
  same: (a: T, b: T) => boolean,
  onSave: (next: T) => Promise<unknown>,
  onRevert: (() => void) | undefined,
) {
  const sending = useRef<{ value: T } | null>(null);
  return (next: T) => {
    const out = sending.current;
    if (same(next, out ? out.value : value)) {
      if (!out) onRevert?.();
      return;
    }
    const sent = { value: next };
    sending.current = sent;
    void onSave(next).finally(() => {
      if (sending.current === sent) sending.current = null;
    });
  };
}

/** A text field written on blur or Enter, only when it changed. */
function SpecText({
  label,
  value,
  placeholder,
  multiline,
  unsaved,
  onSave,
  onRevert,
}: {
  label: string;
  value: string | null | undefined;
  placeholder?: string;
  multiline?: boolean;
  /** WP-01.6 — its last write failed and the draft still shows. */
  unsaved?: boolean;
  onSave: (next: string | null) => Promise<unknown>;
  /** The draft is the server's value again: nothing is written. */
  onRevert?: () => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const write = useFieldCommit<string | null>(
    value ?? null,
    (a, b) => (a ?? "").trim() === (b ?? "").trim(),
    onSave,
    onRevert,
  );
  const commit = () => {
    const next = draft.trim();
    write(next === "" ? null : next);
  };
  const common = {
    "aria-label": label,
    "aria-invalid": unsaved || undefined,
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

/** A failed write the hold reports: the field's group label and its alert. */
interface HeldField {
  field: string;
  message: string;
}

/**
 * WP-01.6 — the unfolded sheet's close barrier for this pane. It HOLDS the
 * fold; it never replays a write. Return, Esc and the sheet's back link wait
 * while any write from this pane is out, and stay open while a field shows a
 * failed draft (`unsaved`). Held, it puts the field's alert back and focuses
 * the first such field: the retry is that field's own save of the value it
 * shows. A write that fails while a close waits on it holds that close once,
 * so its alert is seen. Unmounting (a line switch, a lens change) drops the
 * registration: nothing detached can hold a later Return. Without an owner
 * (the `/pieces` route) nothing registers, and each write saves at once.
 */
function usePaneCloseHold(
  owner: BoardOwnerRef | null,
  paneRef: RefObject<HTMLElement | null>,
  showError: (message: string) => void,
) {
  const inFlight = useRef(new Set<Promise<void>>());
  const unsavedRef = useRef(new Map<string, string>());
  const [unsaved, setUnsaved] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const failures = useRef(0);
  const lastFailure = useRef<HeldField | null>(null);
  const notify = useRef(() => {});
  const showErrorRef = useRef(showError);
  showErrorRef.current = showError;

  const publish = () => {
    setUnsaved(new Map(unsavedRef.current));
    notify.current();
  };

  /**
   * Tracks a write. `write` rejects with the message its alert shows; a
   * `sticky` field (its draft stays on screen) holds until it saves or is put
   * back. The returned promise never rejects.
   */
  const track = (
    field: string,
    sticky: boolean,
    write: Promise<unknown>,
  ): Promise<void> => {
    const settled: Promise<void> = write
      .then(
        () => {
          if (sticky) unsavedRef.current.delete(field);
        },
        (error: unknown) => {
          const message = errorText(error, "The field was not saved.");
          failures.current += 1;
          lastFailure.current = { field, message };
          if (sticky) unsavedRef.current.set(field, message);
        },
      )
      .finally(() => {
        inFlight.current.delete(settled);
        publish();
      });
    inFlight.current.add(settled);
    publish();
    return settled;
  };

  /** The field's draft is the server's value again: it no longer holds. */
  const clear = (field: string): string | null => {
    const message = unsavedRef.current.get(field) ?? null;
    if (message === null) return null;
    unsavedRef.current.delete(field);
    publish();
    return message;
  };

  const ownerKind = owner?.kind;
  const ownerId = owner?.id;
  useEffect(() => {
    if (!ownerKind || !ownerId) return;
    const firstHeld = (): HeldField | null => {
      const held = unsavedRef.current;
      // The first in reading order, not the first to fail.
      for (const group of paneRef.current?.querySelectorAll<HTMLElement>(
        '[role="group"][aria-label]',
      ) ?? []) {
        const field = group.getAttribute("aria-label")!;
        const message = held.get(field);
        if (message !== undefined) return { field, message };
      }
      const [first] = held;
      return first ? { field: first[0], message: first[1] } : null;
    };
    const registration = registerBoardOwnerAutosave(
      { kind: ownerKind, id: ownerId },
      {
        getSnapshot: () => ({
          dirty: inFlight.current.size > 0 || unsavedRef.current.size > 0,
          flushing: inFlight.current.size > 0,
          error: unsavedRef.current.values().next().value ?? null,
        }),
        flush: async () => {
          const seen = failures.current;
          while (inFlight.current.size > 0) {
            await Promise.all([...inFlight.current]);
          }
          const held =
            firstHeld() ??
            (failures.current !== seen ? lastFailure.current : null);
          if (!held) return;
          showErrorRef.current(held.message);
          paneRef.current
            ?.querySelector<HTMLElement>(
              `[role="group"][aria-label="${held.field}"]`,
            )
            ?.querySelector<HTMLElement>("input, select, textarea, button")
            ?.focus();
          throw new Error(held.message);
        },
      },
    );
    notify.current = registration.notify;
    return () => {
      notify.current = () => {};
      registration.unregister();
    };
  }, [ownerKind, ownerId, paneRef]);

  return { track, clear, unsaved };
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
  /** The pane's heading, which takes focus after a fill or a tap at 390. */
  headingRef?: Ref<HTMLHeadingElement>;
  /** Says a sentence in the lens's polite live region. */
  onAnnounce?: (message: string) => void;
  /** The line was filled; the lens keeps it, focuses its heading and says so. */
  onFilled?: (message: string) => void;
  /** WP-01.6 — the unfold host's owner: spec saves land before it folds. */
  autosaveOwner?: BoardOwnerRef | null;
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
  headingRef,
  onAnnounce,
  onFilled,
  autosaveOwner = null,
}: SpecFieldsPaneProps) {
  const updateSpec = useUpdateProjectFfeSpec();
  const commercials = useSetFfeLineCommercials({ errorSurface: "inline" });
  const buildFields = useSetFfeLineBuildFields();
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
  const fillActRef = useRef<HTMLButtonElement>(null);
  const leadTimeRef = useRef<HTMLDivElement>(null);
  const [leadTimeFocus, setLeadTimeFocus] = useState(false);
  // The lead time's own pending state: Unit writes through the same hook, and
  // a Unit change mid-save must not free the picker while this write is out.
  const [leadTimeSaving, setLeadTimeSaving] = useState(false);
  const ids = useId();

  // A chosen product opens the preview; its act takes focus (F4).
  useEffect(() => {
    if (pick) fillActRef.current?.focus();
  }, [pick]);

  // The picker is disabled while its write is pending, so focus returns to it
  // only once it is live again.
  useEffect(() => {
    if (!leadTimeFocus || leadTimeSaving) return;
    setLeadTimeFocus(false);
    leadTimeRef.current?.querySelector("select")?.focus();
  }, [leadTimeFocus, leadTimeSaving]);

  const labor = isLaborLine(line);
  const read = pieceLineStage(line, piece);
  const stage = read.kind;
  const tradeScope = read.lock === "trade_scope";
  const released =
    line.ffe_line_authorization != null || read.stage === "released";
  const onOrder = line.purchase_order_id != null;
  // Rough in's rule (isLocked): released, on an order, or a Trade Scope line.
  const locked = released || onOrder || read.lock != null;
  const lockReason = tradeScope ? TRADE_SCOPE_REASON : RELEASED_SENTENCE;
  const makerReason = tradeScope
    ? TRADE_SCOPE_REASON
    : onOrder
      ? MAKER_ON_ORDER_SENTENCE
      : RELEASED_SENTENCE;
  const quantity = line.quantity ?? 0;
  const productName = line.product_id
    ? (line.product?.name ?? line.name)
    : null;
  const image = lineImageUrl(line, spec);
  const unit = (ROUGH_IN_UNITS as readonly string[]).includes(line.unit ?? "")
    ? (line.unit as FfeLineUnit)
    : "each";

  const paneRef = useRef<HTMLElement>(null);
  const hold = usePaneCloseHold(autosaveOwner, paneRef, setError);
  /** A write's refusal, shown in the pane's alert and handed to the hold. */
  const refused = (fallback: string, format = errorText) => (e: unknown) => {
    const message = format(e, fallback);
    setError(message);
    throw new Error(message);
  };

  /**
   * Writes spec columns now, as typed. `field` is the field's label; a field
   * whose draft stays on screen (`sticky`) holds the unfolded sheet open
   * until it saves or is put back (WP-01.6).
   */
  const saveSpec = (
    field: string,
    changes: SpecChanges,
    sticky = true,
  ): Promise<void> => {
    if (!spec) return Promise.resolve();
    setError(null);
    return hold.track(
      field,
      sticky,
      updateSpec
        .mutateAsync({
          projectId,
          specId: spec.id,
          expectedRowVersion: spec.row_version,
          changes,
        })
        .then(onSpecSaved)
        .catch(refused("The field was not saved.")),
    );
  };

  /** A field put back to its saved value: its failure no longer holds. */
  const revert = (field: string) => {
    const message = hold.clear(field);
    if (message !== null) setError((shown) => (shown === message ? null : shown));
  };
  const specField = (field: string) => ({
    unsaved: autosaveOwner != null && hold.unsaved.has(field),
    onRevert: () => revert(field),
  });

  const leadTimeOverride = line.lead_time_weeks ?? null;
  const leadTimeSuggestion = suggestedLeadTimeText(
    line.suggested_lead_time_weeks,
    line.suggested_lead_time_source,
  );

  /** Resolves true once saved; a refusal prints in the pane's alert. */
  const saveLeadTime = (leadTimeWeeks: number | null): Promise<boolean> => {
    setError(null);
    setLeadTimeSaving(true);
    onAnnounce?.("Saving the lead time…");
    const write = buildFields
      .mutateAsync({ projectId, itemId: line.id, leadTimeWeeks })
      .then(
        () => {
          onAnnounce?.("Lead time saved.");
        },
        (err: unknown) => {
          // The alert says why; clear the status so the next save is heard.
          onAnnounce?.("");
          return refused("The lead time was not saved.", writeErrorMessage)(
            err,
          );
        },
      );
    void hold.track("Lead time", false, write);
    return write
      .then(
        () => true,
        () => false,
      )
      .finally(() => setLeadTimeSaving(false));
  };

  /** Unless the designer moved on, the picker takes focus once it is live. */
  const keepLeadTimeFocus = (origin: Element | null) => {
    const active = document.activeElement;
    if (
      !active ||
      active === document.body ||
      active === origin ||
      leadTimeRef.current?.contains(active)
    ) {
      setLeadTimeFocus(true);
    }
  };

  const chooseLeadTime = (weeks: number | null) => {
    if (locked || leadTimeSaving) return;
    void saveLeadTime(weeks).then(() => keepLeadTimeFocus(null));
  };

  const revertLeadTime = (origin: Element) => {
    if (locked || leadTimeSaving) return;
    // The act leaves with the override, so focus returns to the picker.
    void saveLeadTime(null).then((saved) => {
      if (saved) keepLeadTimeFocus(origin);
    });
  };

  const setMaker = (vendorId: string) => {
    setError(null);
    void hold.track(
      "Maker",
      false,
      commercials
        .mutateAsync({ projectId, itemId: line.id, vendorId })
        .then(() => {
          setChoosingMaker(false);
          addMaker.clearMatch();
        })
        .catch(refused("The maker was not set.")),
    );
  };

  const chooseMaker = (option: MakerOption) => {
    if (option.kind === "vendor") {
      setMaker(option.id);
      return;
    }
    void hold.track(
      "Maker",
      false,
      addMaker
        .add(option.name)
        .catch(refused("The maker was not added."))
        .then((made) => {
          if (made) setMaker(made.id);
        }),
    );
  };

  const choose = (next: {
    productId: string;
    name: string;
    detail: string;
  }) => {
    setPick({ ...next, idempotencyKey: newIdempotencyKey() });
    setFilling(false);
    onAnnounce?.(`${next.name} chosen. Fill this line, or put it back.`);
  };

  const fill = () => {
    if (!pick || place.isPending) return;
    setError(null);
    const scope = (line.assignment_scope ?? "unassigned") as FfeAssignmentScope;
    const disposition = DISPOSITIONS.has(line.design_disposition ?? "")
      ? (line.design_disposition as Exclude<FfeDesignDisposition, "superseded">)
      : undefined;
    // Q12: an allowance stays an allowance, ceiling and all. A fill decides
    // any other line, so it becomes fixed.
    const allowance = line.item_type === "allowance";
    const write = place
      .mutateAsync({
        projectId,
        productId: pick.productId,
        quantity: Math.max(1, quantity),
        itemType: allowance ? "allowance" : "fixed",
        ...(allowance
          ? {
              budgetMinCents: line.budget_min_cents ?? 0,
              budgetMaxCents: line.budget_max_cents ?? null,
            }
          : {}),
        assignmentScope: scope,
        roomId: scope === "room" ? (line.project_room_id ?? null) : null,
        ...(disposition ? { disposition } : {}),
        // A placeholder fill updates the line in place and never reads the
        // mode; 'reuse' is the RPC's default and Rough in's.
        duplicateMode: "reuse",
        placeholderSelectionId: line.id,
        roleConfigurationIdentity: line.role_identity ?? "default",
        idempotencyKey: pick.idempotencyKey,
      })
      .then(() => {
        setPick(null);
        onFilled?.(`${needLabel} filled with ${pick.name}.`);
      })
      .catch(refused("The line was not filled."));
    void hold.track("Product", false, write);
  };

  const saveLink = (raw: string) => {
    const url = imageLink(raw);
    if (!url) {
      setImageNote(raw.trim() ? LINK_INVALID_SENTENCE : DROP_LINK_SENTENCE);
      return;
    }
    setImageNote(null);
    setLink("");
    // The link field empties as it sends, so a refusal leaves no draft.
    void saveSpec("Image", { selected_media: [{ url }] }, false);
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

  const makerName = (line.vendor_name ?? "").trim();
  const specFields = spec != null;

  return (
    <section
      ref={paneRef}
      data-testid="spec-fields-pane"
      aria-label={`Spec for ${needLabel}`}
      className="flex min-w-0 flex-col gap-6"
    >
      <header className="flex flex-col gap-2">
        <span className={LABEL_CLS}>What we need</span>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-heading text-[24px] font-normal leading-[1.2] text-[color:var(--sheet-ink,#1A1816)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--clay-ink)]"
        >
          {line.doc_code?.trim() ? (
            <>
              <ItemLabelPrefix label={line.doc_code} />{" "}
            </>
          ) : null}
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
        <ItemLabelField
          projectId={projectId}
          itemId={line.id}
          docCode={line.doc_code}
          className="flex min-w-0 flex-col gap-2"
          captionClassName={LABEL_CLS}
        />
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
                aria-disabled={locked || undefined}
                aria-describedby={locked ? `${ids}-maker` : undefined}
                onClick={() => {
                  if (!locked) setChoosingMaker(true);
                }}
              >
                {makerName ? "CHANGE THE MAKER" : "NAME A MAKER"}
              </button>
              {locked && (
                <span id={`${ids}-maker`} className={REASON_CLS}>
                  {makerReason}
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
                  ref={fillActRef}
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
                // No money in Spec (Q7): the product's price is the line's
                // client price, which prints only in Price.
                choose({
                  productId: row.id,
                  name: row.name,
                  detail: `${name} · ${shareText(quantity, line.unit)}`,
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
                  {lockReason}
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
               decoding="async" loading="lazy"/>
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
              {...specField("Finish")}
              onSave={(finish) => saveSpec("Finish", { finish })}
            />
            <SpecText
              key={`material-${spec.id}`}
              label="Material"
              value={spec.material}
              {...specField("Material")}
              onSave={(material) => saveSpec("Material", { material })}
            />
            <SpecText
              key={`color-${spec.id}`}
              label="Color"
              value={spec.color_fabric}
              {...specField("Color")}
              onSave={(color_fabric) => saveSpec("Color", { color_fabric })}
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
                {...specField("Dimensions")}
                onSave={(selected_dimensions) =>
                  saveSpec("Dimensions", {
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
              {...specField("Exact location")}
              onSave={(exact_location) => saveSpec("Exact location", { exact_location })}
            />
            <SpecText
              key={`notes-${spec.id}`}
              label="Notes"
              value={spec.trade_notes}
              multiline
              {...specField("Notes")}
              onSave={(trade_notes) => saveSpec("Notes", { trade_notes })}
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
            canEdit={!locked}
          />
          {locked && <span className={REASON_CLS}>{lockReason}</span>}
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
              void hold.track(
                "Unit",
                false,
                buildFields
                  .mutateAsync({
                    projectId,
                    itemId: line.id,
                    unit: e.target.value as FfeLineUnit,
                  })
                  .catch(refused("The unit was not saved.")),
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
              {tradeScope ? TRADE_SCOPE_REASON : UNIT_LOCKED_SENTENCE}
            </span>
          )}
        </Field>

        <Field label="Lead time">
          <div ref={leadTimeRef}>
            <LeadTimeSelect
              value={leadTimeOverride}
              disabled={locked || leadTimeSaving}
              onChange={chooseLeadTime}
            />
          </div>
          {leadTimeOverride == null ? (
            <span data-testid="spec-lead-time-note" className={REASON_CLS}>
              {leadTimeSuggestion ?? LEAD_TIME_UNSET_SENTENCE}
            </span>
          ) : (
            leadTimeSuggestion && (
              <span className="flex flex-wrap items-center gap-x-3">
                <span data-testid="spec-lead-time-note" className={REASON_CLS}>
                  {leadTimeSuggestion}
                </span>
                <button
                  type="button"
                  className={ACT_CLS}
                  aria-disabled={locked || leadTimeSaving || undefined}
                  aria-describedby={locked ? `${ids}-lead` : undefined}
                  aria-busy={leadTimeSaving || undefined}
                  onClick={(e) => revertLeadTime(e.currentTarget)}
                >
                  USE SUGGESTED
                </button>
              </span>
            )
          )}
          {locked && (
            <span id={`${ids}-lead`} className={REASON_CLS}>
              {lockReason}
            </span>
          )}
        </Field>

        {!labor && (
          <>
            <Field label="Labor">
              <LaborAct
                projectId={projectId}
                piece={line}
                laborLines={laborLines}
                canEdit={!locked}
              />
              {locked && <span className={REASON_CLS}>{lockReason}</span>}
            </Field>
            <Field label="COM">
              <ComToggle projectId={projectId} item={line} canEdit={!locked} />
              {locked && <span className={REASON_CLS}>{lockReason}</span>}
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
          choose({
            productId: result.productId,
            name: result.name,
            detail: `${result.name} · ${shareText(quantity, line.unit)}`,
          });
        }}
        rooms={rooms.map((room) => ({ id: room.id, name: room.name }))}
        defaultScopeRoomId={line.project_room_id ?? null}
        scope="library"
        initialTab="library"
        initialSearch={pickerSearch}
        // No money in Spec, for any seat (Q7/F10; T-55b, F18). The configure
        // step prints option prices, and this fill keeps only the product and
        // its name, so it is skipped here.
        showPrice={false}
        configureStep={false}
      />
    </section>
  );
}

/** W × D × H, written when focus leaves the three fields. */
function DimensionsField({
  value,
  unsaved,
  onSave,
  onRevert,
}: {
  value: Record<string, unknown> | null;
  /** WP-01.6 — its last write failed and the draft still shows. */
  unsaved?: boolean;
  onSave: (next: Record<string, unknown> | null) => Promise<unknown>;
  onRevert?: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const write = useFieldCommit(
    value,
    (a, b) => JSON.stringify(a) === JSON.stringify(b),
    onSave,
    onRevert,
  );
  return (
    <div
      data-unsaved={unsaved || undefined}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        write(draft);
      }}
    >
      <DimensionFields value={draft} onChange={setDraft} />
    </div>
  );
}
