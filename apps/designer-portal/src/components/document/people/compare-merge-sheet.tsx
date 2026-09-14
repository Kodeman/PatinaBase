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
  useStudioContacts,
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
 * THE PAPER MOVES (r3 W3-R3-1). M2R-2 wrote this sentence around round 1's
 * B-1 rule, where an absorbed document moved only if the survivor already held
 * a qualifying successor — and the migration review then measured what that
 * left behind: on a duplicate-card merge, which is the only merge this room
 * offers, the firm's own lapse and the firm's own renewal both ended up on a
 * card no surface can open. 00629 now moves every absorbed document onto the
 * survivor and lets `compliance_state()`'s worst-first reckoning settle the
 * word, writing the supersede edge where a real successor exists. The sheet
 * prints the absorbed card's document COUNT two lines above, so it says so.
 *
 * MAJOR-4 — AND THE LAST CLAUSE SAYS WHAT IS TRUE. "Both ways of reaching this
 * person still work" was a promise about NUMBERS that the RPC did not keep:
 * for any card written after 00593 the scalar `phone_e164` / `email` are the
 * only place a number lives, and the merge unioned the typed channel table
 * alone. 00629 now mints those two scalars as channel rows on the survivor
 * (r3 W3-R3-4), which this sentence states outright; the closing clause is
 * about the ID, which is the thing the merge record actually guarantees.
 */
export function mergeConsequenceSentence(
  survivorName: string,
  mergedName: string,
  /**
   * r4 B-2 — DOES THE CONTACT RULE ACTUALLY MOVE? Only where the survivor
   * carries none: one rule row per subject, so the survivor's own rule wins
   * and the absorbed card keeps its own as history. The sentence said the rule
   * moved either way, which was a wrong fact on a face whenever the survivor
   * already had one. (A merge that would leave a BLOCKING rule behind is
   * refused outright by `merge_contact_rule_conflict`, so the clause below is
   * never omitted over a do-not-contact or a route.)
   */
  survivorHasRule = false,
): string {
  const moves = survivorHasRule
    ? "seats, channels and firm designations"
    : "seats, channels, contact rule and firm designations";
  const ruleStays = survivorHasRule
    ? `${survivorName}’s own contact rule stands, and ${mergedName}’s stays on the folded card as a record. `
    : "";
  return (
    `${mergedName}’s ${moves} move onto ` +
    `${survivorName}, and ${mergedName}’s own number and address travel with them. ` +
    ruleStays +
    // r5 B-1 — the thirteen typed facts travel too, COALESCEd, so the sheet
    // states the rule the studio's choice of survivor actually decides.
    //
    // r11 BLOCKING-1 — AND THE THREE THAT DO NOT REDUCE THAT WAY. 00629's §5
    // UNIONs `trades` and `specialties` and ORs `is_sole_proprietor`
    // (:1717-1724), so the sentence's "the survivor's own words stand" was a
    // wrong fact about three of the fifteen rows the table prints — measured
    // live: survivor `electrical`, folded card `plumbing`, survivor after the
    // merge `{electrical, plumbing}`, neither column, and the flip PR-o offers
    // changed nothing about it. The clause is split rather than softened: a
    // studio flipping the survivor to control a value needs to know which
    // values that lever actually decides.
    `Everything else ${mergedName} holds — the verdict, the notes ` +
    `and the payee facts — travels the same way, and where both cards say ` +
    `something ${survivorName}’s own words stand. ` +
    `The trades and specialties on both cards are kept together, and a card ` +
    `recorded as a sole proprietor keeps that either way. ` +
    `Consent stays with the number, not with the card, so nobody’s yes or no changes. ` +
    `${mergedName}’s paper moves onto ${survivorName} too; where ` +
    `${survivorName} already holds the same paper, still in force, the older one is marked superseded. ` +
    `${mergedName}’s card is kept as a record of the merge, so an old link still opens this person.`
  );
}

interface FieldRow {
  label: string;
  a: string;
  b: string;
  /**
   * r11 BLOCKING-1 — the clause a row earns when the merge does NOT pick
   * between the two columns. `trades` and `specialties` are UNIONed and
   * `is_sole_proprietor` is OR'd (00629:1717-1724), so printing them as a
   * plain two-column comparison under "the survivor's own words stand" told
   * the studio the survivor pick decides a value it does not decide.
   */
  kept?: string;
}

/**
 * r5 B-1 — THE FACTS THAT TRAVEL, AND THE ONES A SURVIVOR OVERRIDES.
 *
 * The table compared nine fields and none of the thirteen typed facts a card
 * carries was among them — verdict, trades, specialties, notes, warranty, and
 * the whole Payee region (legal name, DBA, remit-to, retainage, tax id, W-9).
 * 00629 now carries every one onto the survivor, COALESCEd, so the survivor's
 * own value wins where it has one — which makes WHICH CARD SURVIVES the lever
 * that decides which of two typed values the room keeps. PR-o calls that
 * choice "the studio knows which card carries the real history", and the
 * studio cannot know it off a table that does not print these.
 *
 * Rendered only where at least one card holds the fact, so the ordinary
 * duplicate — two thin cards sharing a phone — still shows nine rows.
 */
export function carriedRows(
  a: StudioContact | null | undefined,
  b: StudioContact | null | undefined,
  /**
   * r7 B-1 — the three designations are stored as person-card ids, and the
   * sheet may not print an id. The book the two cards live in resolves them,
   * exactly as `company-card.tsx` resolves the same three.
   */
  namesById: ReadonlyMap<string, string> = new Map(),
): FieldRow[] {
  const text = (value: string | null | undefined) =>
    (value ?? "").trim() || null;
  const list = (value: readonly string[] | null | undefined) =>
    value && value.length > 0 ? value.join(", ") : null;
  const bps = (value: number | null | undefined) =>
    value == null ? null : `${(value / 100).toFixed(2).replace(/\.00$/, "")}%`;
  const taxId = (value: string | null | undefined) =>
    text(value) ? `••• ${String(value).trim()}` : null;
  const person = (
    id: string | null | undefined,
    names: ReadonlyMap<string, string>,
  ) => (id ? (names.get(id) ?? "On file") : null);

  // The rows 00629 reduces by KEEPING BOTH rather than by picking one
  // (r11 BLOCKING-1). The clause rides the row, so the table says it wherever
  // the row prints, in the same words as the consequence sentence.
  const keptTogether: Record<string, string> = {
    Trades: "both kept",
    Specialties: "both kept",
    "Sole proprietor": "yes on either card stands",
  };

  const fields: Array<[string, (card: StudioContact) => string | null]> = [
    ["Verdict", (card) => text(card.studio_verdict)],
    ["Trades", (card) => list(card.trades)],
    ["Specialties", (card) => list(card.specialties)],
    ["Notes", (card) => text(card.notes)],
    ["Legal name", (card) => text(card.legal_name)],
    ["Trading as", (card) => text(card.dba_name)],
    ["Remit-to", (card) => text(card.remit_to)],
    ["Retainage", (card) => bps(card.retainage_bps)],
    ["Tax ID", (card) => taxId(card.tax_id_last4)],
    ["W-9 on file", (card) => formatLongDate(card.w9_on_file_at)],
    ["Warranty until", (card) => formatLongDate(card.warranty_until)],
    // r6 M-4 — the fold now carries is_sole_proprietor, and it is a printed
    // line, the document list and the whole Paper region on the person card
    // (person-profile.tsx:381/:423/:577). A fact the merge decides belongs in
    // the table the studio decides it from (R-BN).
    ["Sole proprietor", (card) => (card.is_sole_proprietor ? "Yes" : null)],
    // r7 B-1 — THE THREE DESIGNATIONS THE CARD ITSELF HOLDS.
    //
    // 00629's COALESCE statement now carries them onto the survivor, so which
    // card survives decides which of two paperwork contacts, signers or site
    // contacts the room keeps — and the sheet's own consequence sentence says
    // out loud that "firm designations move onto <survivor>". A fact the merge
    // decides belongs in the table the studio decides it from (R-BN). The
    // Directory firm row's payee marker reads `signer_person_id` directly, and
    // "Chase the renewal" reads `paperwork_contact_person_id` directly, so a
    // blank one is a blank face.
    [
      "Paperwork contact",
      (card) => person(card.paperwork_contact_person_id, namesById),
    ],
    ["Signer", (card) => person(card.signer_person_id, namesById)],
    ["Site contact", (card) => person(card.site_contact_person_id, namesById)],
  ];

  const rows: FieldRow[] = [];
  for (const [label, read] of fields) {
    const left = a ? read(a) : null;
    const right = b ? read(b) : null;
    if (left === null && right === null) continue;
    rows.push({
      label,
      a: left ?? "—",
      b: right ?? "—",
      ...(keptTogether[label] ? { kept: keptTogether[label] } : {}),
    });
  }
  return rows;
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

  /**
   * THE BOOK THE TWO CARDS LIVE IN — one read, two jobs (r7 MAJOR-1, r7 B-1).
   *
   * The FIRM row used to read `card.company_name`, which on a PERSON row is
   * 00417's typed-by-hand snapshot that nothing since the affiliation model
   * (00592) populates: measured, every carded human with a firm carries NULL
   * there while their firm's own card holds the name. `people_directory`'s
   * contact branch COALESCEs `sc.company_name → firm.company_name →
   * firm.full_name`, so the Directory row, the person-card header and this
   * wave's own picker all print "Northgate Electric" where this sheet printed
   * "—" — the same mark the table uses for "not read". The sheet whose whole
   * job is to show what each card holds before one folds may not assert an
   * absence the record contradicts.
   *
   * The same read resolves the three designation ids to names, exactly as
   * `company-card.tsx` does, and it is the same query key that card uses, so
   * React Query serves both from one fetch.
   */
  const bookOrgId = left?.organization_id ?? right?.organization_id ?? null;
  const { data: book } = useStudioContacts(open ? bookOrgId : null, {
    includeArchived: true,
  });
  const namesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of book ?? []) map.set(c.id, mergeCardName(c));
    return map;
  }, [book]);
  const firmNameOf = (card: StudioContact | null | undefined): string => {
    if (!card) return "—";
    const resolved = card.company_id ? namesById.get(card.company_id) : null;
    return resolved ?? (card.company_name?.trim() || "—");
  };

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
      firm: firmNameOf(card),
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
      ...carriedRows(left, right, namesById),
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
    namesById,
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
      // r5 B-1 — "carries everything <merged> held" was false: the RPC moved
      // two columns of fifteen and the room said so in its own status voice.
      // 00629 now carries every typed fact across, COALESCEd, so the true
      // sentence is the one that names the survivor's own words as the ones
      // that stand where both cards spoke.
      // r11 BLOCKING-1 — the announcement carries the same split the
      // consequence sentence does; the two may not disagree about the write.
      onMerged?.(
        `Two cards are now one. ${survivorName} carries what ${mergedName} held, ` +
          `and where both cards said something, ${survivorName}’s own words stand — ` +
          `except the trades and specialties, which are kept together.`,
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
        {/* r5 M-4 — the column head said only "Keeps the card", so a studio
            could pick a card it had PUT AWAY and take the whole identity out
            of the rolodex read. 00629 refuses that merge by name; this says so
            before the press, on the column it is true of. */}
        {card?.archived_at ? (
          <span
            data-survivor-archived={id ?? undefined}
            className={`mt-0.5 block ${LABEL} text-[var(--terracotta-ink)]`}
          >
            Put away
          </span>
        ) : null}
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
              <dt className={`${LABEL} self-center`}>
                {row.label}
                {row.kept && (
                  <span
                    data-compare-kept
                    className="mt-0.5 block normal-case tracking-normal text-[var(--ink-subtle)]"
                  >
                    {row.kept}
                  </span>
                )}
              </dt>
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
          {mergeConsequenceSentence(
            survivorName,
            mergedName,
            !!(survivorId && ruleIndex.get(survivorId)),
          )}
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
