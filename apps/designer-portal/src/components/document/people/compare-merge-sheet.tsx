"use client";

/**
 * COMPARE & MERGE (direction §3.1's duplicate band, §8 P2, PR-o, crm-model §4).
 *
 * Its own DocSheet, opened from the Directory's duplicate band — never a
 * control inside Reach & access (direction §4).
 *
 * Two columns, field by field, so the studio can see what each card actually
 * holds before one of them folds into the other. PR-o: the OLDER card is
 * pre-picked as the survivor and the pick is FLIPPABLE — "the studio knows
 * which card carries the real history". Both ids stay resolvable afterwards;
 * the merged card is not deleted and not archived.
 *
 * The consequence sentence names what moves and what does not. Consent is the
 * one that does not: `studio_channel_consent` is keyed on the NUMBER, never on
 * a card id, so a merge writes nothing to it and a verdict follows the value
 * it was recorded against (crm-model §4, R-AY).
 */

import { useEffect, useMemo, useState } from "react";
import { GitMerge } from "lucide-react";
import {
  ALL_MERGE_MATCHED_ON,
  MERGE_MATCHED_ON_LABELS,
  useComplianceDocuments,
  useContactRules,
  useMergeStudioContacts,
  usePeopleSeats,
  useStudioContact,
  useStudioContactChannelsFor,
  type MergeMatchedOn,
  type StudioContact,
} from "@patina/supabase";
import { getPartyKindLabel } from "@patina/types";
import {
  contactRuleClause,
  indexContactRules,
} from "@/lib/document/contact-rule";
import { formatLongDate } from "./people-format";
import { peopleEvents } from "@/lib/analytics/people-events";
import { DocSheet } from "../overlays/doc-sheet";
import { DocumentAction, DocumentActionRow } from "../document-action";

const LABEL =
  "font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-subtle)]";

/** The name a card goes by, whichever kind it is. */
export function mergeCardName(card: StudioContact | null | undefined): string {
  if (!card) return "This card";
  return (
    (card.entity_kind === "company" ? card.company_name : card.full_name) ??
    card.company_name ??
    card.full_name ??
    "Unnamed"
  );
}

/**
 * PR-o — the OLDER card is pre-picked. `created_at` is the only age a card
 * carries; ties fall back to the id so the pick is stable across renders.
 */
export function preferredSurvivorId(
  a: Pick<StudioContact, "id" | "created_at"> | null | undefined,
  b: Pick<StudioContact, "id" | "created_at"> | null | undefined,
): string | null {
  if (!a) return b?.id ?? null;
  if (!b) return a.id;
  if (a.created_at === b.created_at) return a.id < b.id ? a.id : b.id;
  return a.created_at < b.created_at ? a.id : b.id;
}

/**
 * What the studio is told before it presses. Names the card that folds, the
 * card that stays, what travels with it, and the two facts that do not move.
 *
 * M2R-2 — PAPER DOES NOT TRAVEL. The sentence used to promise that the merged
 * card's "paper" moved onto the survivor, and round 1's B-1 fix made that
 * false in the ordinary case: `merge_studio_contacts()` (00629 §5) moves an
 * absorbed document ONLY where the survivor already holds a qualifying
 * successor — same doc_type, head of its own chain, in force, expiring no
 * earlier, carrying at least the absorbed row's gates — because
 * `compliance_state()` reduces worst-first over a holder, so moving a lapse
 * would manufacture a block the survivor never earned. On a duplicate-person
 * merge, where the survivor holds no matching certificate, NO paper moves at
 * all. crm-model §4 is the wording: the absorbed card's documents keep their
 * original holder and are superseded, never deleted. The sheet prints the
 * absorbed card's document COUNT two lines above this sentence, so a promise
 * that the count moves is contradicted by the survivor's own count not
 * changing.
 */
export function mergeConsequenceSentence(
  survivorName: string,
  mergedName: string,
): string {
  return (
    `${mergedName}’s seats, channels, contact rule and firm designations move onto ` +
    `${survivorName}. Consent stays with the number, not with the card, so nobody’s yes or no changes. ` +
    `${mergedName}’s paper stays on ${mergedName}’s card and is still readable there; where ` +
    `${survivorName} already holds the same paper, still in force, the older one is marked superseded. ` +
    `${mergedName}’s card is kept as a record of the merge, and both ways of reaching this person still work.`
  );
}

interface FieldRow {
  label: string;
  a: string;
  b: string;
}

export function CompareMergeSheet({
  open,
  onClose,
  leftId,
  rightId,
  /** The evidence the Directory's own detection found (crm-model §4 rule 2). */
  matchedOnDefault = "phone",
  onMerged,
}: {
  open: boolean;
  onClose: () => void;
  leftId: string | null;
  rightId: string | null;
  matchedOnDefault?: MergeMatchedOn;
  /** The room's announcer: "Two cards are now one — <name>." */
  onMerged?: (message: string, survivorId: string) => void;
}) {
  const { data: left } = useStudioContact(open ? leftId : null);
  const { data: right } = useStudioContact(open ? rightId : null);

  const [survivorId, setSurvivorId] = useState<string | null>(null);
  const [matchedOn, setMatchedOn] = useState<MergeMatchedOn>(matchedOnDefault);
  const [error, setError] = useState<string | null>(null);
  const merge = useMergeStudioContacts();

  // PR-o's pre-pick, taken once the two cards are in hand and never again, so
  // a flip the studio made is not overwritten by a refetch.
  useEffect(() => {
    if (!open) {
      setSurvivorId(null);
      setError(null);
      setMatchedOn(matchedOnDefault);
      return;
    }
    if (survivorId || !left || !right) return;
    setSurvivorId(preferredSurvivorId(left, right));
  }, [open, left, right, survivorId, matchedOnDefault]);

  const ids = useMemo(
    () => [leftId, rightId].filter((id): id is string => !!id),
    [leftId, rightId],
  );
  const { data: channels } = useStudioContactChannelsFor(open ? ids : []);
  const { data: rules } = useContactRules();
  const ruleIndex = useMemo(() => indexContactRules(rules), [rules]);
  const { data: leftPaper } = useComplianceDocuments(
    open && leftId ? { holderId: leftId } : undefined,
  );
  const { data: rightPaper } = useComplianceDocuments(
    open && rightId ? { holderId: rightId } : undefined,
  );
  const { data: seats } = usePeopleSeats(open ? { all: true } : undefined);

  const seatCount = (cardId: string | null) =>
    cardId
      ? (seats ?? []).filter((seat) => seat.studio_contact_id === cardId).length
      : 0;

  const channelLine = (cardId: string | null, kinds: readonly string[]) => {
    if (!cardId) return "—";
    const found = (channels ?? []).filter(
      (channel) =>
        channel.owner_id === cardId && kinds.includes(channel.channel_kind),
    );
    if (found.length === 0) return "—";
    return found.map((channel) => channel.value).join(", ");
  };

  const rows: FieldRow[] = useMemo(() => {
    const fieldsOf = (
      card: StudioContact | null | undefined,
      id: string | null,
    ) => ({
      name: mergeCardName(card),
      kind: card?.contact_kind
        ? getPartyKindLabel(card.contact_kind) || card.contact_kind
        : "—",
      firm: card?.company_name ?? "—",
      mobile:
        channelLine(id, ["mobile"]) !== "—"
          ? channelLine(id, ["mobile"])
          : (card?.phone ?? "—"),
      email:
        channelLine(id, ["email", "ap_email"]) !== "—"
          ? channelLine(id, ["email", "ap_email"])
          : (card?.email ?? "—"),
      rule:
        (id ? contactRuleClause(ruleIndex.get(id) ?? null) : null) ??
        "No contact rule on file.",
      paper:
        id === leftId
          ? String((leftPaper ?? []).length || "None")
          : String((rightPaper ?? []).length || "None"),
      seats: String(seatCount(id)),
      since: formatLongDate(card?.created_at ?? null) || "—",
    });
    const a = fieldsOf(left, leftId);
    const b = fieldsOf(right, rightId);
    return [
      { label: "Name", a: a.name, b: b.name },
      { label: "What they are", a: a.kind, b: b.kind },
      { label: "Firm", a: a.firm, b: b.firm },
      { label: "Mobile", a: a.mobile, b: b.mobile },
      { label: "Email", a: a.email, b: b.email },
      { label: "Contact rule", a: a.rule, b: b.rule },
      { label: "Papers on file", a: a.paper, b: b.paper },
      { label: "Seats on jobs", a: a.seats, b: b.seats },
      { label: "In the book since", a: a.since, b: b.since },
    ];
    // `channelLine` and `seatCount` close over the same four queries the deps
    // below name, so listing them separately would only re-run the same work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    left,
    right,
    leftId,
    rightId,
    channels,
    ruleIndex,
    leftPaper,
    rightPaper,
    seats,
  ]);

  const survivor = survivorId === rightId ? right : left;
  const merged = survivorId === rightId ? left : right;
  const survivorName = mergeCardName(survivor);
  const mergedName = mergeCardName(merged);
  const mergedId = survivorId === rightId ? leftId : rightId;

  const canMerge = !!survivorId && !!mergedId && survivorId !== mergedId;

  const run = async () => {
    if (!canMerge || !survivorId || !mergedId) return;
    setError(null);
    try {
      await merge.mutateAsync({ survivorId, mergedId, matchedOn });
      peopleEvents.cardsMerged({
        matched_on: matchedOn,
        survivor_flipped: survivorId !== preferredSurvivorId(left, right),
      });
      onMerged?.(
        `Two cards are now one. ${survivorName} carries everything ${mergedName} held.`,
        survivorId,
      );
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The merge did not go through.",
      );
    }
  };

  const columnHead = (
    card: StudioContact | null | undefined,
    id: string | null,
  ) => {
    const chosen = !!id && survivorId === id;
    return (
      <button
        type="button"
        data-survivor-pick={id ?? undefined}
        aria-pressed={chosen}
        onClick={() => id && setSurvivorId(id)}
        className={`min-h-11 w-full rounded-[3px] border px-3 py-2 text-left ${
          chosen
            ? "border-[var(--ink-faint)] bg-[var(--rail)] text-[var(--ink)]"
            : "border-[var(--hairline-strong)] bg-[var(--paper)] text-[var(--ink-subtle)]"
        }`}
      >
        <span className="block t-body-sm text-[var(--ink)]">
          {mergeCardName(card)}
        </span>
        <span className={`mt-0.5 block ${LABEL}`}>
          {chosen ? "Keeps the card" : "Keep this one instead"}
        </span>
      </button>
    );
  };

  return (
    <DocSheet
      open={open}
      onClose={onClose}
      title="Compare these two"
      icon={GitMerge}
      wide
    >
      <div data-compare-merge-sheet>
        <p className={LABEL}>Compare · two cards</p>
        <h2 className="mt-1 font-heading text-[1.35rem] text-[var(--ink)]">
          One person, two cards
        </h2>
        <p className="t-body-sm mt-1 text-[var(--ink-subtle)]">
          Choose the card that stays. The other one folds into it and is kept as
          a record of the merge.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {columnHead(left, leftId)}
          {columnHead(right, rightId)}
        </div>

        <dl
          data-compare-fields
          className="mt-4 border-t border-[var(--hairline-strong)]"
        >
          {rows.map((row) => (
            <div
              key={row.label}
              data-compare-field={row.label}
              className="grid grid-cols-[9rem_1fr_1fr] gap-3 border-b border-[var(--hairline-strong)] py-2"
            >
              <dt className={`${LABEL} self-center`}>{row.label}</dt>
              <dd className="t-body-sm m-0 break-words text-[var(--ink)]">
                {row.a}
              </dd>
              <dd className="t-body-sm m-0 break-words text-[var(--ink)]">
                {row.b}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-4">
          <label className={`${LABEL} mb-1 block`} htmlFor="merge-matched-on">
            What makes these the same person
          </label>
          <select
            id="merge-matched-on"
            value={matchedOn}
            onChange={(e) => setMatchedOn(e.target.value as MergeMatchedOn)}
            className="min-h-11 w-full border-0 border-b border-[var(--hairline-strong)] bg-transparent py-2 text-[0.85rem] text-[var(--ink)] outline-none focus:border-[var(--color-clay)]"
          >
            {ALL_MERGE_MATCHED_ON.map((value) => (
              <option key={value} value={value}>
                {MERGE_MATCHED_ON_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <p
          data-merge-consequence
          className="t-body-sm mt-4 text-[var(--ink-subtle)]"
        >
          {mergeConsequenceSentence(survivorName, mergedName)}
        </p>

        <DocumentActionRow
          surfaceKey="people-room"
          regionKey="compare-merge"
          className="mt-3"
          aria-label="Merge these two cards"
        >
          <DocumentAction
            actionKey="merge-studio-contacts"
            variant="primary"
            onClick={() => void run()}
            disabled={!canMerge || merge.isPending}
            loading={merge.isPending}
            loadingLabel="Merging…"
          >
            {`Merge into ${survivorName}`}
          </DocumentAction>
          <DocumentAction
            actionKey="cancel-merge"
            variant="tertiary"
            onClick={onClose}
          >
            Not the same person
          </DocumentAction>
        </DocumentActionRow>

        {error && (
          <p
            role="alert"
            className="mt-2 text-[0.72rem] text-[var(--terracotta-ink)]"
          >
            {error}
          </p>
        )}
      </div>
    </DocSheet>
  );
}
