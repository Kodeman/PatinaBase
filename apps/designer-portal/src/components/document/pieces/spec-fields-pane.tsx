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
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import {
  ProjectFfeSpecConflictError,
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
  "font-mono text-[12px] font-medium uppercase leading-none tracking-[.06em] text-[color:var(--sheet-ink-muted,#4A4540)]";
const VALUE_CLS =
  "font-sans text-[15px] leading-[1.5] text-[color:var(--sheet-ink,#1A1816)]";
const INPUT_CLS =
  "min-h-[44px] min-w-0 w-full border-0 border-b border-[color:var(--sheet-rule,#D9D4CC)] bg-transparent px-0 py-1 font-sans text-[15px] leading-[1.5] text-[color:var(--sheet-ink,#1A1816)] placeholder:text-[color:var(--sheet-ink-faint,#6B655E)] focus-visible:border-[color:var(--sheet-rule-strong,#1A1816)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--clay-ink)] aria-[invalid=true]:border-[color:var(--color-terracotta-ink)]";
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

type SpecColumn = keyof SpecChanges;
const TEXT_COLUMNS: ReadonlySet<SpecColumn> = new Set([
  "finish",
  "material",
  "color_fabric",
  "exact_location",
  "trade_notes",
]);

/** Structural equality, independent of key order (JSONB need not keep it). */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => sameJson(item, b[i]))
    );
  }
  const left = Object.keys(a);
  const right = b as Record<string, unknown>;
  return (
    left.length === Object.keys(right).length &&
    left.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        sameJson((a as Record<string, unknown>)[key], right[key]),
    )
  );
}

/** True when every column `changes` names already holds that value in `row`;
 *  text compares trimmed, as saves are. */
function sameColumns(changes: SpecChanges, row: SpecChanges): boolean {
  return (Object.keys(changes) as SpecColumn[]).every((column) =>
    TEXT_COLUMNS.has(column)
      ? String(changes[column] ?? "").trim() === String(row[column] ?? "").trim()
      : sameJson(changes[column] ?? null, row[column] ?? null),
  );
}

/**
 * RC7-E6-3 — the alert for fields whose row another session changed after
 * their edit began: what each now holds.
 */
function conflictText(
  fields: readonly (readonly [string, SpecChanges])[],
  row: SpecChanges,
): string {
  const said = fields.map(([field, changes]) => {
    const columns = Object.keys(changes) as SpecColumn[];
    if (columns.length !== 1 || !TEXT_COLUMNS.has(columns[0])) {
      return `${field} changed in another session.`;
    }
    const value = String(row[columns[0]] ?? "").trim();
    return value
      ? `${field} changed in another session to “${value}”.`
      : `${field} cleared in another session.`;
  });
  return `${said.join(" ")} Save again to replace ${said.length > 1 ? "them" : "it"}.`;
}

/**
 * RC7-E6-3 — a committed edit's three-way link back to its field. `base` is
 * the row value the edit began from; the pane writes only while the row
 * still holds it.
 */
interface SpecEdit {
  /** The keystroke generation this commit hands over. */
  gen: number;
  base: () => SpecChanges;
  /** The row saved this commit: the field builds on it, and is clean again
   *  only if nothing was typed since. */
  ack: (saved: SpecLensSpec) => void;
  /** A conflict was shown: the next save builds on the row as it is now. */
  rebase: (row: SpecLensSpec) => void;
}

/**
 * One spec field's edit: { base, draft, gen }. A clean field (no draft)
 * shows, and so follows, its row. The first keystroke after clean takes the
 * row value as base; each keystroke is a generation, and only a save of the
 * current generation makes the field clean. A field in conflict commits only
 * on its explicit save (Enter) or once it is edited again: leaving it, even
 * by a focus the pane moves, saves nothing over the peer.
 */
function useSpecEdit<T>(column: SpecColumn, value: T, version: number) {
  const [draft, setDraft] = useState<{ value: T } | null>(null);
  // A save's row, shown until the row this field is handed catches up to it.
  const [saved, setSaved] = useState<{ value: T; version: number } | null>(null);
  const row = saved && saved.version > version ? saved.value : value;
  const gen = useRef(0);
  const base = useRef(row);
  const conflicted = useRef(false);
  const change = (next: T) => {
    if (!draft) base.current = row;
    conflicted.current = false;
    gen.current += 1;
    setDraft({ value: next });
  };
  const edit = (): SpecEdit => {
    if (!draft) base.current = row;
    const at = gen.current;
    return {
      gen: at,
      base: () => ({ [column]: base.current }) as SpecChanges,
      ack: (next) => {
        base.current = next[column] as T;
        conflicted.current = false;
        setSaved({ value: next[column] as T, version: next.row_version });
        if (gen.current === at) setDraft(null);
      },
      rebase: (next) => {
        base.current = next[column] as T;
        conflicted.current = true;
      },
    };
  };
  return {
    shown: draft ? draft.value : row,
    change,
    edit,
    conflicted: () => conflicted.current,
  };
}

/** A text field written on blur or Enter; the pane decides if it changed. */
function SpecText({
  label,
  column,
  value,
  version,
  placeholder,
  multiline,
  unsaved,
  onCommit,
}: {
  label: string;
  column: SpecColumn;
  value: string | null | undefined;
  version: number;
  placeholder?: string;
  multiline?: boolean;
  /** WP-01.6 — its last write failed and the draft still shows. */
  unsaved?: boolean;
  /** The value the field shows now, handed over on blur or Enter. */
  onCommit: (next: string | null, edit: SpecEdit) => void;
}) {
  const { shown, change, edit, conflicted } = useSpecEdit(column, value ?? null, version);
  const draft = shown ?? "";
  const commit = () => {
    const next = draft.trim();
    onCommit(next === "" ? null : next, edit());
  };
  const common = {
    "aria-label": label,
    "aria-invalid": unsaved || undefined,
    value: draft,
    placeholder,
    onBlur: () => {
      if (!conflicted()) commit();
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      // Empty fields let Esc leave the shell; commit their clear before its hold runs.
      if (event.key === "Escape" && event.currentTarget.value === "") {
        event.currentTarget.blur();
      }
      if (event.key === "Enter" && !multiline) {
        event.preventDefault();
        commit();
      }
    },
    className: INPUT_CLS,
  };
  return (
    <Field label={label} wide={multiline}>
      {multiline ? (
        <textarea
          {...common}
          rows={2}
          onChange={(e) => change(e.target.value)}
        />
      ) : (
        <input
          {...common}
          onChange={(e) => change(e.target.value)}
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
 * WP-01.6 — how a child editor (item label, rooms, labor, COM) tells the
 * unfolded sheet's hold about its writes. Only the unfold hands one over.
 */
export interface PaneWriteHold {
  /** A write is out: the fold waits; its refusal holds a waiting close once. */
  track: (write: Promise<unknown>) => void;
  /** Its refused draft still shows (the refusal), or no longer does (null). */
  mark: (message: string | null) => void;
}

/** The child editors that hold through `PaneWriteHold` and print their own alert. */
type ChildField = "Item label" | "Rooms" | "Labor" | "COM";
const CHILD_FIELDS: ReadonlySet<string> = new Set<ChildField>([
  "Item label",
  "Rooms",
  "Labor",
  "COM",
]);

const CONTROL = "input, select, textarea, button";

/** The control a held field's name points at: the field itself, or its first. */
function fieldControl(
  pane: HTMLElement | null,
  field: string,
): HTMLElement | null {
  const named = pane?.querySelector<HTMLElement>(`[aria-label="${field}"]`);
  if (!named) return null;
  return named.matches(CONTROL)
    ? named
    : named.querySelector<HTMLElement>(CONTROL);
}

/**
 * WP-01.6 — the unfolded sheet's close barrier for this pane. It HOLDS the
 * fold; it never replays a write. Return, Esc, Back and the sheet's back link
 * wait while any write from this pane is out, and stay open while a field
 * shows a failed draft (`mark`). Held, it puts the field's alert back and
 * focuses the first such field: the retry is that field's own save of the
 * value it shows. A write that fails while a close waits on it holds that
 * close once, so its alert is seen. Unmounting (a line switch, a lens change)
 * drops the registration: nothing detached can hold a later Return. Without
 * an owner (the `/pieces` route) nothing registers.
 */
function usePaneCloseHold(
  owner: BoardOwnerRef | null,
  paneRef: RefObject<HTMLElement | null>,
  showError: (message: string) => void,
  needLabel: string,
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

  /** A waiting close waits until `write` settles. Never rejects. */
  const busy = (write: Promise<unknown>): Promise<void> => {
    const settled: Promise<void> = write
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        inFlight.current.delete(settled);
        publish();
      });
    inFlight.current.add(settled);
    publish();
    return settled;
  };

  /** A refusal a close that was waiting stops on once, so its alert is seen. */
  const failed = (field: string, message: string) => {
    failures.current += 1;
    lastFailure.current = { field, message };
  };

  /** A write whose refusal (the message its alert shows) holds a close once. */
  const track = (field: string, write: Promise<unknown>): Promise<void> =>
    busy(
      write.catch((error: unknown) => {
        failed(field, errorText(error, "The field was not saved."));
      }),
    );

  /** The field shows a refused draft: it holds until saved or put back. */
  const mark = (field: string, message: string) => {
    unsavedRef.current.set(field, message);
    publish();
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
      for (const named of paneRef.current?.querySelectorAll<HTMLElement>(
        "[aria-label]",
      ) ?? []) {
        const field = named.getAttribute("aria-label")!;
        const message = held.get(field);
        if (message !== undefined) return { field, message };
      }
      const [first] = held;
      return first ? { field: first[0], message: first[1] } : null;
    };
    const waitPending = async () => {
      const seen = failures.current;
      while (inFlight.current.size > 0) {
        await Promise.all([...inFlight.current]);
      }
      const held =
        firstHeld() ??
        (failures.current !== seen ? lastFailure.current : null);
      if (!held) return;
      showErrorRef.current(held.message);
      fieldControl(paneRef.current, held.field)?.focus();
      throw new Error(held.message);
    };
    const registration = registerBoardOwnerAutosave(
      { kind: ownerKind, id: ownerId },
      {
        getSnapshot: () => ({
          dirty: inFlight.current.size > 0 || unsavedRef.current.size > 0,
          flushing: inFlight.current.size > 0,
          error: unsavedRef.current.values().next().value ?? null,
        }),
        flush: waitPending,
        waitPending,
        failureMessage: `Your change to ${needLabel} wasn't saved.`,
      },
    );
    notify.current = registration.notify;
    return () => {
      notify.current = () => {};
      registration.unregister();
    };
  }, [ownerKind, ownerId, paneRef, needLabel]);

  return { busy, failed, track, mark, clear, unsaved };
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
  const hold = usePaneCloseHold(autosaveOwner, paneRef, setError, needLabel);
  /** A write's refusal, shown in the pane's alert and handed to the hold. */
  const refused = (fallback: string, format = errorText) => (e: unknown) => {
    const message = format(e, fallback);
    setError(message);
    throw new Error(message);
  };

  // A write that answers after the pane has gone (a line switch, a lens
  // change, the fold) changes nothing on screen: no alert, selection or focus,
  // and nothing that was waiting to be written is sent.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** A field put back to its saved value: its failure no longer holds. */
  const revert = (field: string) => {
    const message = hold.clear(field);
    if (message !== null) setError((shown) => (shown === message ? null : shown));
  };

  // SQ-1897 (story #38) — one writer per spec row. At most one write of the
  // row is out at a time; a field committed meanwhile waits, then sends
  // against the row_version last answered. A failed write is never sent
  // again by itself: the field stays marked until it saves or is put back.
  // RC7-E6-3 — every commit, queued or not, is checked against the row when
  // it would send: if the row moved from the value the edit began from and
  // now holds something else, the field alerts instead (three-way).
  const acked = useRef<SpecLensSpec | null>(spec);
  if (
    spec &&
    (!acked.current ||
      acked.current.id !== spec.id ||
      spec.row_version >= acked.current.row_version)
  ) {
    acked.current = spec;
  }
  type SpecWrite = {
    changes: SpecChanges;
    edit: SpecEdit;
    sticky: boolean;
  };
  /** Each field's latest commit; an answer to an older one changes nothing. */
  const latestSpec = useRef(new Map<string, SpecWrite>());
  const imageGen = useRef(0);
  const pendingSpec = useRef(new Map<string, SpecWrite>());
  const sendingSpec = useRef<Map<string, SpecWrite> | null>(null);

  /** Fields whose row moved under them: alert, keep the draft, and let the
   *  field's next save build on the row as it is now. */
  const conflict = (fields: [string, SpecWrite][], row: SpecLensSpec) => {
    const message = conflictText(
      fields.map(([field, write]) => [field, write.changes] as const),
      row,
    );
    setError(message);
    hold.failed(fields[0][0], message);
    for (const [field, write] of fields) {
      write.edit.rebase(row);
      if (write.sticky) hold.mark(field, message);
    }
  };

  /** What a commit does against `row`: nothing, an alert, or a write. */
  const check = (field: string, write: SpecWrite, row: SpecLensSpec) => {
    if (sameColumns(write.changes, row)) {
      write.edit.ack(row);
      revert(field);
      return "same" as const;
    }
    if (write.edit && !sameColumns(write.edit.base(), row)) return "conflict" as const;
    return "send" as const;
  };

  const sendSpec = () => {
    const row = acked.current;
    if (sendingSpec.current || !alive.current || !row) return;
    const changes: SpecChanges = {};
    const fields = new Map<string, SpecWrite>();
    const moved: [string, SpecWrite][] = [];
    for (const [field, write] of pendingSpec.current) {
      const next = check(field, write, row);
      if (next === "conflict") moved.push([field, write]);
      if (next !== "send") continue;
      Object.assign(changes, write.changes);
      fields.set(field, write);
    }
    pendingSpec.current.clear();
    if (moved.length > 0) conflict(moved, row);
    if (fields.size === 0) return;
    sendingSpec.current = fields;
    const latest = () =>
      [...fields].filter(([field, write]) => latestSpec.current.get(field) === write);
    void hold.busy(
      updateSpec
        .mutateAsync({
          projectId,
          specId: row.id,
          expectedRowVersion: row.row_version,
          changes,
        })
        .then(
          (saved) => {
            // Gone, its answer publishes nothing: the shared row may already
            // hold a newer version (SQ-1899 F4).
            if (!alive.current) return;
            acked.current = saved;
            onSpecSaved(saved);
            for (const [, write] of fields) write.edit.ack(saved);
            for (const [field] of latest()) revert(field);
          },
          (e: unknown) => {
            if (!alive.current) return;
            const sent = latest();
            // A stale row_version: take the row the other session left, and
            // check each field again against it, as a commit would be.
            const peer =
              e instanceof ProjectFfeSpecConflictError &&
              e.current?.id === row.id &&
              e.current.row_version > row.row_version
                ? e.current
                : null;
            if (!peer) {
              if (sent.length === 0) return;
              const message = errorText(e, "The field was not saved.");
              setError(message);
              hold.failed(sent[0][0], message);
              for (const [field, write] of sent) {
                if (write.sticky) hold.mark(field, message);
              }
              return;
            }
            if (!acked.current || peer.row_version > acked.current.row_version) {
              acked.current = peer;
              onSpecSaved(peer);
            }
            // Each field is checked again when the queue sends.
            for (const [field, write] of sent) pendingSpec.current.set(field, write);
          },
        )
        .finally(() => {
          sendingSpec.current = null;
          sendSpec();
        }),
    );
  };

  /**
   * A field hands over the spec columns it shows and its edit. `field` is its label; a field whose draft stays on
   * screen (`sticky`) holds the unfolded sheet open until it saves or is put
   * back (WP-01.6).
   */
  const writeSpec = (
    field: string,
    changes: SpecChanges,
    edit: SpecEdit,
    sticky = true,
  ) => {
    const row = acked.current;
    if (!row) return;
    const last = latestSpec.current.get(field);
    // The same keystroke generation is already handed over: it decides.
    if (
      last?.edit.gen === edit.gen &&
      (pendingSpec.current.get(field) === last ||
        sendingSpec.current?.get(field) === last)
    ) {
      return;
    }
    const write: SpecWrite = { changes, edit, sticky };
    latestSpec.current.set(field, write);
    pendingSpec.current.delete(field);
    if (sendingSpec.current) {
      pendingSpec.current.set(field, write);
      setError(null);
      return;
    }
    const next = check(field, write, row);
    if (next === "same") return;
    if (next === "conflict") {
      conflict([[field, write]], row);
      // The field keeps its draft, and focus, for its save.
      setTimeout(() => {
        if (alive.current) fieldControl(paneRef.current, field)?.focus();
      }, 0);
      return;
    }
    pendingSpec.current.set(field, write);
    setError(null);
    sendSpec();
  };

  const specField = (field: string) => ({
    unsaved: autosaveOwner != null && hold.unsaved.has(field),
  });

  /** A child editor's link to the hold: the unfold only (WP-01.6, F12). */
  const childHold = (field: ChildField): PaneWriteHold | undefined =>
    autosaveOwner
      ? {
          track: (write) => void hold.track(field, write),
          mark: (message) => {
            if (message === null) hold.clear(field);
            else hold.mark(field, message);
          },
        }
      : undefined;

  // The product the fill preview shows; a fill's answer reads it to know
  // whether its own preview is still the one on screen.
  const pickRef = useRef<FillPick | null>(null);
  const showPick = (next: FillPick | null) => {
    pickRef.current = next;
    setPick(next);
    revert("Product");
  };

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
    void hold.track("Lead time", write);
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
    showPick({ ...next, idempotencyKey: newIdempotencyKey() });
    setFilling(false);
    onAnnounce?.(`${next.name} chosen. Fill this line, or put it back.`);
  };

  const fill = () => {
    if (!pick || place.isPending) return;
    setError(null);
    const filled = pick;
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
      .then(
        () => {
          // Gone (another line was chosen): its selection and focus stay.
          if (!alive.current) return;
          if (pickRef.current === filled) showPick(null);
          onFilled?.(`${needLabel} filled with ${filled.name}.`);
        },
        (e: unknown) => {
          if (!alive.current) return;
          const message = errorText(e, "The line was not filled.");
          setError(message);
          hold.failed("Product", message);
          // The preview still shows the product: it holds until filled,
          // put back or replaced (F2).
          if (pickRef.current === filled) hold.mark("Product", message);
        },
      );
    void hold.busy(write);
  };

  const saveLink = (raw: string) => {
    const url = imageLink(raw);
    if (!url) {
      setImageNote(raw.trim() ? LINK_INVALID_SENTENCE : DROP_LINK_SENTENCE);
      return;
    }
    setImageNote(null);
    setLink("");
    // The link field empties as it sends, so a refusal leaves no draft. Its
    // base is the image the row held when this one was chosen.
    let base: SpecChanges = { selected_media: acked.current?.selected_media };
    imageGen.current += 1;
    writeSpec(
      "Image",
      { selected_media: [{ url }] },
      {
        gen: imageGen.current,
        base: () => base,
        ack: (row) => {
          base = { selected_media: row.selected_media };
        },
        rebase: (row) => {
          base = { selected_media: row.selected_media };
        },
      },
      false,
    );
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
  // Under the unfold, a field still marked keeps its alert after another
  // write clears the pane's last message (SQ-1899 F2). Child editors print
  // their own.
  const shownError =
    error ??
    (autosaveOwner
      ? ([...hold.unsaved].find(([field]) => !CHILD_FIELDS.has(field))?.[1] ??
        null)
      : null);

  return (
    <section
      ref={paneRef}
      data-testid="spec-fields-pane"
      aria-label={`Spec for ${needLabel}`}
      className="flex min-w-0 flex-col gap-6 [overflow-wrap:anywhere]"
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
          hold={childHold("Item label")}
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
                  onClick={() => showPick(null)}
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
            className="flex h-[140px] w-[200px] max-w-full items-center justify-center border border-dashed border-[color:var(--sheet-ink-faint,#6B655E)] p-2 text-center font-mono text-[12px] uppercase leading-[1.4] text-[color:var(--sheet-ink-faint,#6B655E)]"
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
              column="finish"
              version={spec.row_version}
              onCommit={(finish, edit) => writeSpec("Finish", { finish }, edit)}
            />
            <SpecText
              key={`material-${spec.id}`}
              label="Material"
              value={spec.material}
              {...specField("Material")}
              column="material"
              version={spec.row_version}
              onCommit={(material, edit) => writeSpec("Material", { material }, edit)}
            />
            <SpecText
              key={`color-${spec.id}`}
              label="Color"
              value={spec.color_fabric}
              {...specField("Color")}
              column="color_fabric"
              version={spec.row_version}
              onCommit={(color_fabric, edit) => writeSpec("Color", { color_fabric }, edit)}
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
                version={spec.row_version}
                {...specField("Dimensions")}
                onCommit={(selected_dimensions, edit) =>
                  writeSpec(
                    "Dimensions",
                    { selected_dimensions: selected_dimensions as never },
                    edit,
                  )
                }
              />
            </Field>
            <SpecText
              key={`location-${spec.id}`}
              label="Exact location"
              value={spec.exact_location}
              placeholder="See drawings"
              {...specField("Exact location")}
              column="exact_location"
              version={spec.row_version}
              onCommit={(exact_location, edit) =>
                writeSpec("Exact location", { exact_location }, edit)
              }
            />
            <SpecText
              key={`notes-${spec.id}`}
              label="Notes"
              value={spec.trade_notes}
              multiline
              {...specField("Notes")}
              column="trade_notes"
              version={spec.row_version}
              onCommit={(trade_notes, edit) => writeSpec("Notes", { trade_notes }, edit)}
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
            hold={childHold("Rooms")}
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
                hold={childHold("Labor")}
              />
              {locked && <span className={REASON_CLS}>{lockReason}</span>}
            </Field>
            <Field label="COM">
              <ComToggle
                projectId={projectId}
                item={line}
                canEdit={!locked}
                hold={childHold("COM")}
              />
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

      {shownError && (
        <p
          role="alert"
          className="font-sans text-[13px] text-[color:var(--color-terracotta-ink)]"
        >
          {shownError}
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

/** W × D × H, handed over when focus leaves the three fields. */
function DimensionsField({
  value,
  version,
  unsaved,
  onCommit,
}: {
  value: Record<string, unknown> | null;
  version: number;
  /** WP-01.6 — its last write failed and the draft still shows. */
  unsaved?: boolean;
  onCommit: (next: Record<string, unknown> | null, edit: SpecEdit) => void;
}) {
  const { shown, change, edit, conflicted } = useSpecEdit(
    "selected_dimensions",
    value,
    version,
  );
  return (
    <div
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        if (conflicted()) return;
        onCommit(shown, edit());
      }}
    >
      <DimensionFields value={shown} onChange={change} invalid={unsaved} />
    </div>
  );
}
