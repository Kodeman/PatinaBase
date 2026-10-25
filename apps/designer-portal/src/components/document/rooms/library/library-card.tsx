"use client";

/**
 * LibraryCard — a piece on a shelf as plate and caption (US-28 S10c, V20
 * U-Q20): the plate is a picture mat on a 1px --card-edge, never a card, and
 * the caption names the piece, its maker and the jobs it was used on, each
 * with its job's tick. State is an ink word, never a chip. Teaching happens
 * in place — a needs-teaching piece opens inline Quick Tags (the ~5-minute act,
 * reusing useStyleArchetypes + useAssignStyle) or escalates to Deep Analysis (a
 * paper sheet over the Room). Movement between shelves rides the existing
 * promote / nominate flows. No invented scores: a caption shows only what its
 * row truthfully carries.
 */

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useStyleArchetypes,
  useAssignStyle,
  useProductStyles,
  useSubmitValidation,
  type LayerProductLayer,
} from "@patina/supabase";
import { StrataSweep } from "@/components/ui/strata-sweep";
import { DocumentAction, DocumentActionRow } from "../../document-action";
import {
  capabilityLabels,
  readLibraryConfigurationSummary,
} from "./library-configuration-summary";
import type { ConfigurationMode } from "../piece/piece-configuration-model";
import { usageStageClass, type PieceUse } from "./use-piece-usage";

/** A caption names at most this many jobs; the rest are counted. */
const USED_ON_SHOWN = 2;

export interface LibraryItem {
  id: string;
  name: string;
  brand: string | null;
  images: string[] | null;
  source_url: string | null;
  category: string | null;
  layer: LayerProductLayer;
  price_retail?: number | null;
  configuration_mode?: ConfigurationMode | null;
  configuration_summary?: unknown;
  /** 00232 — where this piece came from. 'field_capture' earns the chip. */
  capture_source?: string | null;
  captured_at?: string | null;
  /** `field_captures.venue_label` for this piece's originating capture (00233),
   *  resolved by the shelf via `useCaptureVenueLabels`. */
  venue_label?: string | null;
}

interface StyleArchetype {
  id: string;
  name: string;
  color_hex: string | null;
}

const SOURCE_HINT: Record<string, string> = {
  chrome_extension: "via the extension",
  mobile_photo: "from a photo",
  url_paste: "pasted",
};

export function LibraryCard({
  item,
  needsTeaching,
  needsValidation = false,
  onDeep,
  onPromote,
  onNominate,
  usedOn = [],
  round8 = false,
}: {
  item: LibraryItem;
  round8?: boolean;
  needsTeaching: boolean;
  /** The jobs this piece is on (usePieceUsage), named in the caption. */
  usedOn?: readonly PieceUse[];
  /** In the validation queue (status='needs_validation') — a read awaiting a
   *  second eye. Distinct from needsTeaching; when set, the fold leads with the
   *  validate lens (R88). */
  needsValidation?: boolean;
  onDeep: (productId: string, name: string) => void;
  onPromote?: (productId: string) => void;
  onNominate?: (productId: string) => void;
}) {
  // One fold, opened by the card's toggle. What it holds depends on the piece's
  // queue state: the validate lens (needs a look) or Quick Tags (needs teaching).
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const pieceHref = `/library/${item.id}${searchParams.size > 0 ? `?${searchParams.toString()}` : ''}`;
  const foldable = needsTeaching || needsValidation;
  const img = item.images?.[0] ?? null;
  const sub =
    item.brand ||
    (item.source_url ? hostOf(item.source_url) : null) ||
    "unknown maker";
  const configuration = readLibraryConfigurationSummary(item);
  const configurationLabels = capabilityLabels(configuration);
  const fieldProvenance = fieldProvenanceLabel(item);
  const shownUses = usedOn.slice(0, USED_ON_SHOWN);
  const moreUses = usedOn.length - shownUses.length;
  const stateWord = needsValidation
    ? "Needs a look"
    : needsTeaching
      ? "Needs teaching"
      : null;

  return (
    <article className="library-plate" data-library-card={item.id}>
      <Link
        href={pieceHref}
        aria-label={`Open ${item.name}`}
        className="plate library-plate-mat"
      >
        {img ? (
          <img src={img} alt="" loading="lazy"  decoding="async"/>
        ) : (
          <span className="library-plate-word">{item.category ?? "piece"}</span>
        )}
      </Link>

      <div className="cap">
        <Link href={pieceHref} className="name t-d4 library-hit">
          {item.name}
        </Link>
        <p className="t-body-sm library-cap-maker">{sub}</p>
        {round8 && (
          <Link href={pieceHref} aria-label={`View reference: ${item.name}`} className="r8-library-reference t-body-sm">
            View reference
          </Link>
        )}
        {shownUses.map((use) => (
          <p
            key={use.projectId}
            className={`t-body-sm library-cap-used tick ${usageStageClass(use.stage)}`}
          >
            Used on {use.title}
          </p>
        ))}
        {moreUses > 0 && (
          <p className="t-body-sm library-cap-used">
            and {moreUses} more {moreUses === 1 ? "job" : "jobs"}
          </p>
        )}

        {(stateWord ||
          fieldProvenance ||
          configurationLabels.length > 0) && (
          <div className="library-cap-words">
            {stateWord && <span className="word">{stateWord}</span>}
            {fieldProvenance && (
              <span className="word word--quiet">{fieldProvenance}</span>
            )}
            {configurationLabels.length > 0 && (
              <ul
                aria-label="Configuration capabilities"
                className="library-cap-words"
              >
                {configurationLabels.map((label) => (
                  <li key={label} className="word word--quiet">
                    {label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {(foldable || onPromote || onNominate) && (
          <div className="library-cap-acts">
            {foldable && (
              <CardLink
                actionKey="open-piece-teaching"
                onClick={() => setOpen((v) => !v)}
              >
                {open ? "Close" : needsValidation ? "Review attribution" : "Add style attribution"}
              </CardLink>
            )}
            {onPromote && (
              <CardLink
                actionKey="promote-piece"
                onClick={() => onPromote(item.id)}
              >
                Add to studio library
              </CardLink>
            )}
            {onNominate && (
              <CardLink
                actionKey="nominate-maker"
                onClick={() => onNominate(item.id)}
              >
                Recommend maker
              </CardLink>
            )}
          </div>
        )}
      </div>

      {open && needsValidation && (
        <InlineValidate
          productId={item.id}
          onDeep={() => onDeep(item.id, item.name)}
        />
      )}

      {open && !needsValidation && needsTeaching && (
        <InlineQuickTags
          productId={item.id}
          onDeep={() => onDeep(item.id, item.name)}
          onSaved={() => setOpen(false)}
        />
      )}
    </article>
  );
}

function CardLink({
  children,
  onClick,
  actionKey,
}: {
  children: React.ReactNode;
  onClick: () => void;
  actionKey: string;
}) {
  return (
    <DocumentAction
      actionKey={actionKey}
      surfaceKey="library"
      regionKey="library-card"
      variant="tertiary"
      onClick={onClick}
    >
      {children}
    </DocumentAction>
  );
}

/** The inline ~5-minute Quick Tags act (R32). Doc grammar over the catalog's
 *  real teaching hooks — pick a primary character, save, or go deep. */
function InlineQuickTags({
  productId,
  onDeep,
  onSaved,
}: {
  productId: string;
  onDeep: () => void;
  onSaved: () => void;
}) {
  const { data: archetypes, isLoading } = useStyleArchetypes();
  const assignStyle = useAssignStyle();
  const [picked, setPicked] = useState<string | null>(null);
  const styles = (archetypes ?? []) as unknown as StyleArchetype[];

  const save = async () => {
    if (!picked) return;
    await assignStyle.mutateAsync({
      productId,
      styleId: picked,
      isPrimary: true,
      confidence: 1.0,
    });
    onSaved();
  };

  return (
    <div className="library-cap-fold motion-safe:animate-[doc-fade_200ms_ease-out]">
      <div className="mb-2 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
        What is its character?
      </div>
      {isLoading ? (
        <StrataSweep size="sm" label="Loading styles" />
      ) : (
        /* Character is chosen by scoring a word, not by filling a pill (I107):
           the picked style takes charcoal ink and a steady rule, the rest sit in
           aged oak and only draw their rule when asked. Each keeps its 44px box
           as invisible padding. */
        <div className="flex flex-wrap gap-1.5">
          {styles.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setPicked((p) => (p === s.id ? null : s.id))}
              className={`inline-flex min-h-11 min-w-11 items-center justify-center px-2.5 py-1 text-[12px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] motion-reduce:transition-none ${
                picked === s.id
                  ? "text-[var(--color-charcoal)]"
                  : "text-[var(--text-body)] hover:text-[var(--color-charcoal)]"
              }`}
            >
              <span
                className={`da-score-hover ${picked === s.id ? "da-score-on" : ""}`}
              >
                {s.name}
              </span>
            </button>
          ))}
        </div>
      )}
      <DocumentActionRow
        surfaceKey="library"
        regionKey="quick-teaching"
        className="mt-3"
        aria-label="Quick attribution actions"
      >
        <DocumentAction
          actionKey="save-piece-teaching"
          variant="primary"
          disabled={!picked || assignStyle.isPending}
          loading={assignStyle.isPending}
          loadingLabel="Saving…"
          onClick={() => void save()}
        >
          Save attribution
        </DocumentAction>
        <DocumentAction
          actionKey="open-deep-analysis"
          variant="secondary"
          onClick={onDeep}
          trailing="→"
        >
          Style and client suitability
        </DocumentAction>
      </DocumentActionRow>
    </div>
  );
}

/** The in-card validate lens (R88) — the teaching queue's `needs_validation`
 *  rows, folded in beside Quick Tags / Deep Analysis. Shows the read on file and
 *  asks for a second eye: Agree confirms it, Disagree flags it for review. Votes
 *  go through the real useSubmitValidation path (errorSurface 'inline' → no
 *  toast, D2/R83). The card's "Attribution review needed" badge lifts on the queue refetch. */
function InlineValidate({
  productId,
  onDeep,
}: {
  productId: string;
  onDeep: () => void;
}) {
  const { data: styleRows, isLoading } = useProductStyles(productId);
  const submit = useSubmitValidation({ errorSurface: "inline" });
  const [done, setDone] = useState<null | "confirm" | "flag">(null);
  const [error, setError] = useState<string | null>(null);

  const read = (
    (styleRows ?? []) as Array<{
      is_primary?: boolean;
      style?: { name?: string | null } | null;
    }>
  )
    .map((r) => ({ name: r.style?.name ?? null, primary: !!r.is_primary }))
    .filter((r): r is { name: string; primary: boolean } => !!r.name)
    .sort((a, b) => Number(b.primary) - Number(a.primary));

  const vote = async (v: "confirm" | "flag") => {
    setError(null);
    try {
      await submit.mutateAsync({ productId, vote: v });
      setDone(v);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not record your judgment.",
      );
    }
  };

  return (
    <div className="library-cap-fold motion-safe:animate-[doc-fade_200ms_ease-out]">
      <div className="mb-2 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
        Does this read look right?
      </div>

      {isLoading ? (
        <StrataSweep size="sm" label="Loading the read" />
      ) : read.length > 0 ? (
        <div className="library-cap-words">
          {read.map((r) => (
            <span
              key={r.name}
              className={r.primary ? "word" : "word word--quiet"}
            >
              {r.name}
              {r.primary ? " · primary" : ""}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[14px] italic text-[var(--color-charcoal)]">
          No read on file — confirm it belongs on the shelf, or flag it for a
          closer look.
        </p>
      )}

      {done ? (
        <p className="mt-3 text-[14px] italic text-[var(--color-charcoal)]">
          {done === "confirm"
            ? "Attribution review recorded."
            : "Flagged for attribution review."}
        </p>
      ) : (
        <DocumentActionRow
          surfaceKey="library"
          regionKey="piece-validation"
          className="mt-3"
          aria-label="Piece validation actions"
        >
          <DocumentAction
            actionKey="confirm-piece-read"
            variant="primary"
            loading={submit.isPending && submit.variables?.vote === "confirm"}
            disabled={submit.isPending}
            loadingLabel="Recording…"
            onClick={() => void vote("confirm")}
          >
            Confirm attribution
          </DocumentAction>
          <DocumentAction
            actionKey="flag-piece-read"
            variant="secondary"
            disabled={submit.isPending}
            loading={submit.isPending && submit.variables?.vote === "flag"}
            loadingLabel="Recording…"
            onClick={() => void vote("flag")}
          >
            Flag attribution for review
          </DocumentAction>
          <DocumentAction
            actionKey="open-deep-analysis"
            variant="tertiary"
            onClick={onDeep}
            trailing="→"
          >
            Style and client suitability
          </DocumentAction>
        </DocumentActionRow>
      )}

      {error && (
        <p className="mt-2 border-l-2 border-[var(--color-terracotta)] pl-2 text-[14px] text-[var(--color-charcoal)]">
          {error}
        </p>
      )}
    </div>
  );
}

/** The Field provenance chip's text (spec §6 Flow 6, plan 4-12).
 *  "Field · High Point, Mar 2026" when the capture carried a venue,
 *  "Field · Mar 2026" when it did not, "Field" when even the date is missing. */
export function fieldProvenanceLabel(
  item: Pick<LibraryItem, 'capture_source' | 'captured_at' | 'venue_label'>,
): string | null {
  if (item.capture_source !== 'field_capture') return null;

  const place = item.venue_label?.trim() || null;
  const when = item.captured_at ? new Date(item.captured_at) : null;
  const month =
    when && !Number.isNaN(when.getTime())
      ? when.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      : null;

  const tail = [place, month].filter(Boolean).join(', ');
  return tail ? `Field · ${tail}` : 'Field';
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export { SOURCE_HINT };
