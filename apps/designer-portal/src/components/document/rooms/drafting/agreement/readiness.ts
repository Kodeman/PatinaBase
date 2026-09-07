/**
 * Readiness, composed — P2.
 *
 * The seven-facet room asks a fixed question seven times. A composed
 * agreement cannot: the parts are the designer's, and most of them are
 * removable. So readiness is derived from the composition itself — each
 * part's own `required` flag plus the R4 class floor.
 *
 * R4, verbatim: "Parties, signature block, one typed money part for a class
 * that bills; a ceiling part is required whenever a rate card is present.
 * Everything else removable, Exclusions included."
 *
 * This is the UI's answer, not the gate. The real refusals live in
 * `upsert_agreement_parts` (the R4 floor) and `_agreement_requires_rate_card`
 * (send/sign) — a payload pushed past this function still meets them.
 *
 * `assessServiceAgreementReadiness` (lib/document/commercial-documents.ts) is
 * untouched and still serves the flag-off room.
 */

import { DESIGN_BUILD_COPY, type AgreementPart } from "@patina/types";
import type { CommercialDocument } from "@/lib/document/commercial-documents";
import {
  contractSumCents,
  readAllowances,
  readDraws,
  readPricingBasis,
  readSubMarkupBps,
  readSupervision,
  validateAllowances,
  validateDrawSet,
  validateNoDoubleCount,
  validatePricingBasis,
} from "@/lib/document/design-build";
import {
  duplicateMoneyVariants,
  FEE_BASIS_BLOCKER,
  feeBasisParts,
  readBody,
  readCents,
  readItems,
  readRoles,
  scheduleValueIsSet,
} from "./part-kinds";

export interface AgreementBlocker {
  /** The part this blocker belongs to, so the rail can mark the row. Null for
   *  a blocker about the document as a whole (its kind, its state, its
   *  client, the class floor). */
  partId: string | null;
  message: string;
}

export interface AgreementReadiness {
  ready: boolean;
  blockers: AgreementBlocker[];
  /** Advisory only — never gates `ready`. */
  notes: string[];
}

/**
 * The variants that can satisfy the R4 class floor on their own — the fee the
 * agreement charges.
 *
 * NOT `AUTHORITY_VARIANTS` (@patina/types), which is R9's Wave-2 list of what
 * creates billing authority and includes `retainer` and `cadence`. A retainer
 * is money held against a fee and a cadence is when invoices go out; neither
 * one states what the work costs, so an agreement carrying only those still
 * names no fee.
 *
 * R22 — and NOT `ceiling` either. A ceiling is a cap on a fee, not a fee: an
 * agreement whose only money part is "we will not exceed $24,000" never says
 * what the work costs. This list is exactly the blocker sentence below, and
 * exactly what `_agreement_fee_unnamed` (00575) reads, so the panel and the
 * database ask one question.
 */
const FEE_VARIANTS = ["rate_card", "flat", "per_phase"] as const;

/** R18 — the duplicate's sentence, in the RPC's own words ("an agreement
 *  carries only one ceiling", 00575), built in exactly one place because the
 *  rail marks the row with it and the readiness panel prints it. */
export function duplicateMoneyBlocker(label: string): string {
  return `An agreement carries only one ${label}.`;
}

/** The same discipline for the other refusal a rate card can earn at Save:
 *  "every role on the rate card needs a name" (00575, 23514). A second role
 *  added and left blank passed readiness — the check below asks only whether
 *  SOME role is named — so the room offered a save the server refused, and
 *  showed none of the reason. Named here once because the rail marks the row
 *  with it and the readiness panel prints it. */
export const BLANK_ROLE_BLOCKER = "Every role on the rate card needs a name.";

/** R33 — a fee the homeowner never sees never reaches the money row. */
export const HIDDEN_FEE_BLOCKER =
  "This fee is hidden from your client, so it cannot bill.";

/** The turnkey class's own floor (R4, carried): a pricing basis is the typed
 *  money part, and a draw schedule is additionally required. */
export const TURNKEY_PRICING_BASIS_BLOCKER =
  "A design-build agreement needs a pricing basis.";
export const TURNKEY_DRAWS_BLOCKER =
  "A design-build agreement needs a draw schedule.";

/** R10 — the attestation gate holds at send, not only at template selection.
 *  An attestation can expire between composing and sending. */
export const TURNKEY_ATTESTATION_BLOCKER =
  "This studio's licensing attestation is not current. Update it in Account → Studio.";

/** R11 — a notice counsel has not cleared cannot travel with an agreement. */
export function heldNoticeBlocker(state: string): string {
  return `The ${state} notice is ${DESIGN_BUILD_COPY.noticeHeldForCounsel.toLowerCase()} and cannot be sent yet. Remove it from this agreement.`;
}

/** The blocker that is about the client account rather than the agreement.
 *  Excluded from the attention count, exactly as the seven-facet room
 *  excludes it today. */
const CLIENT_LINK_BLOCKER = "Link a client with an email address.";

/**
 * What the room knows about the turnkey class, when it is one. Absent — every
 * agreement Waves 1 and 2 compose — none of the design-build questions are
 * asked at all, and this function is the one Wave 2 shipped.
 */
export interface TurnkeyReadinessInput {
  /** A live `studio_license_attestations` row (R10). The send refuses without
   *  one, so the room holds on it rather than letting the studio find out at
   *  the door. */
  attestationLive: boolean;
  /** The jurisdictions counsel HAS cleared. Everything else is held (R11) and
   *  an attachment naming one cannot be sent. */
  enabledJurisdictions: readonly string[];
}

export function assessAgreementReadiness({
  document,
  parts,
  recipientEmail,
  turnkey,
}: {
  document: CommercialDocument;
  parts: AgreementPart[];
  recipientEmail: string | null | undefined;
  turnkey?: TurnkeyReadinessInput;
}): AgreementReadiness {
  const blockers: AgreementBlocker[] = [];
  const notes: string[] = [];
  const add = (partId: string | null, message: string) =>
    blockers.push({ partId, message });

  // R-1 / R-2 — the document itself, unchanged from the flag-off wording.
  if (
    document.kind !== "design_services" &&
    document.kind !== "service_addendum" &&
    document.kind !== "design_build"
  ) {
    add(
      null,
      "Only a design services agreement or addendum can use this send review.",
    );
  }
  if (document.state !== "draft") {
    add(null, "Only a draft agreement can be sent.");
  }

  // R-11 — the DB's UNIQUE (proposal_id, part_key) would raise 23505 at save.
  // Catch it here so the designer sees a sentence instead of a Postgres code.
  const seenKeys = new Set<string>();
  const reportedDuplicates = new Set<string>();
  for (const part of parts) {
    if (seenKeys.has(part.partKey)) {
      if (!reportedDuplicates.has(part.partKey)) {
        reportedDuplicates.add(part.partKey);
        add(part.id, `Two parts share the key ${part.partKey}. Rename one.`);
      }
    }
    seenKeys.add(part.partKey);
  }

  // R18 — one part per money variant. A second ceiling keyed `custom.<uuid>`
  // slips past the key check above but not past the RPC, which raises
  // `an agreement carries only one ceiling` (check_violation) at Save. The
  // Add menu no longer offers the duplicate; this is what catches one that
  // arrives any other way, in the RPC's own words.
  for (const duplicate of duplicateMoneyVariants(parts)) {
    for (const partId of duplicate.partIds.slice(1)) {
      add(partId, duplicateMoneyBlocker(duplicate.label));
    }
  }

  // R18's second half — one fee basis. A flat fee standing beside a fee by
  // phase is one of each, so the per-variant rule above sees nothing, while
  // `upsert_agreement_parts` raises `an agreement carries one fee basis`
  // (check_violation, 00577) at Save. The picker no longer offers the second;
  // this catches one that arrives from a template or a Library part.
  for (const extra of feeBasisParts(parts).slice(1)) {
    add(extra.id, FEE_BASIS_BLOCKER);
  }

  for (const part of parts) {
    const payload = part.payload ?? {};

    // R-12 — the table CHECKs a non-blank title.
    if (!part.title.trim()) {
      add(part.id, "Name this part.");
    }

    // R-4 — `required` is per part, and what "complete" means depends on the
    // kind. Nothing else about a part is mandatory; a part the designer left
    // optional and empty is a choice, not a defect.
    if (part.required) {
      if (part.kind === "clause" && !readBody(payload).trim()) {
        add(part.id, `Write ${part.title.trim() || "this part"}.`);
      }
      if (
        part.kind === "list" &&
        !readItems(payload).some((item) => item.text.trim().length > 0)
      ) {
        add(
          part.id,
          `Add at least one item to ${part.title.trim() || "this part"}.`,
        );
      }
      if (part.kind === "schedule" && !scheduleValueIsSet(part)) {
        add(part.id, `Complete ${part.title.trim() || "this part"}.`);
      }
    }

    // R-7 / R-8 / R-9 / R-10 — the old fixed-facet blockers, now conditional
    // on the part being present at all. A removed retainer asks nothing.
    if (part.kind === "schedule" && part.variant === "rate_card") {
      const roles = readRoles(payload);
      if (
        roles.length > 0 &&
        !roles.some(
          (role) => role.roleName.trim().length > 0 && role.hourlyRateCents > 0,
        )
      ) {
        add(part.id, "Add at least one role with an hourly rate.");
      }
      // Every role, not just one of them: the RPC walks the whole array and
      // refuses on the first blank name, so a named role standing beside a
      // blank one is a save the server will not take.
      if (roles.some((role) => role.roleName.trim().length === 0)) {
        add(part.id, BLANK_ROLE_BLOCKER);
      }
    }

    if (part.kind === "schedule" && part.variant === "retainer") {
      const cents = readCents(payload.cents);
      if (cents === null || cents < 0) {
        add(
          part.id,
          "Set a valid retainer amount, including zero when none is due.",
        );
      }
      if (
        typeof payload.activationPolicy !== "string" ||
        payload.activationPolicy.length === 0
      ) {
        add(part.id, "Choose when the agreement becomes active.");
      }
    }

    if (part.kind === "schedule" && part.variant === "cadence") {
      if (typeof payload.cadence !== "string" || payload.cadence.length === 0) {
        add(part.id, "Choose a billing cadence.");
      }
    }

    // R21 — a money part with no figure in it. A blank Flat fee or Fee by
    // phase opens with NO amount (part-kinds' `blankPayload`), so the client
    // copy prints nothing rather than "$0"; this is the sentence that says
    // the studio still has to write one. Zero is writable and means zero —
    // it is an unwritten amount, not a zero one, that holds the send.
    if (
      part.kind === "schedule" &&
      !part.required && // a required one already said "Complete {title}." above
      (part.variant === "flat" || part.variant === "per_phase") &&
      !scheduleValueIsSet(part)
    ) {
      add(part.id, `Set the amount for ${part.title.trim() || "this part"}.`);
    }

    // R-10 keeps the soft behavior the seven-facet room has today: an unset
    // deposit is a decision the studio has not made, and the release RPC
    // falls back to 50% on its own. Only an out-of-bounds value blocks.
    if (part.kind === "schedule" && part.variant === "procurement") {
      const percent = readCents(payload.depositPercent);
      if (percent === null) {
        notes.push(
          "No furnishings deposit set — authorizations will default to 50%.",
        );
      } else if (percent < 0 || percent > 100) {
        add(
          part.id,
          "Set the furnishings deposit percent, including zero when none is due.",
        );
      }
    }
  }

  // R21/R3-3 — the R4 floor reads only the parts the homeowner reads. A fee
  // the studio kept to itself (`client_visible = false`) is a fee the
  // agreement does not name to the person signing it, so it cannot be what
  // satisfies "one typed money part for a class that bills"; and a rate card
  // the client never sees still bills her time, so it still needs a ceiling
  // she can see.
  const clientFacing = parts.filter((part) => part.clientVisible !== false);

  // R33 — a hidden fee bills nobody. `upsert_agreement_parts` projects only
  // client-visible fee parts into the money row, so a studio-only flat fee
  // that carries a figure is a figure that goes nowhere: it is not what the
  // homeowner consents to, it is not on the copy she keeps, and it is not what
  // the executed authority charges. Say so where she typed it, rather than
  // letting her believe the number is doing something.
  const hiddenFees = parts.filter(
    (part) =>
      part.clientVisible === false &&
      part.kind === "schedule" &&
      part.variant !== null &&
      (FEE_VARIANTS as readonly string[]).includes(part.variant) &&
      scheduleValueIsSet(part),
  );
  for (const part of hiddenFees) {
    add(part.id, HIDDEN_FEE_BLOCKER);
  }

  // ── The turnkey class's own floor (R4, carried; build sheet §3 PART 11).
  //
  // A design-build agreement carries no rate card, so it never reaches the
  // fee/ceiling pair below. Its typed money part is the pricing basis, its
  // draw schedule is additionally required, and both are validated by the
  // same functions `send_commercial_document` calls — so the room asks the
  // question the send is going to ask.
  const isTurnkey = document.kind === "design_build";
  if (isTurnkey && turnkey) {
    const pricingBasisPart =
      parts.find(
        (part) => part.kind === "schedule" && part.variant === "pricing_basis",
      ) ?? null;
    const drawsPart =
      parts.find(
        (part) => part.kind === "schedule" && part.variant === "draws",
      ) ?? null;
    const allowancesPart =
      parts.find(
        (part) => part.kind === "schedule" && part.variant === "allowances",
      ) ?? null;

    if (!pricingBasisPart) add(null, TURNKEY_PRICING_BASIS_BLOCKER);
    if (!drawsPart) add(null, TURNKEY_DRAWS_BLOCKER);

    const basis = readPricingBasis(pricingBasisPart?.payload ?? {});
    if (pricingBasisPart) {
      const refusal = validatePricingBasis(basis);
      if (refusal) add(pricingBasisPart.id, refusal);
    }
    if (drawsPart) {
      const refusal = validateDrawSet(
        pricingBasisPart ? contractSumCents(basis) : null,
        readDraws(drawsPart.payload ?? {}),
      );
      if (refusal) add(drawsPart.id, refusal);
    }
    if (allowancesPart) {
      const refusal = validateAllowances(
        readAllowances(allowancesPart.payload ?? {}),
        basis,
      );
      if (refusal) add(allowancesPart.id, refusal);
    }

    // §4.3 — supervision is paid once. The refusal is about a PAIR, so it is
    // reported on the part the designer is most likely looking at when it
    // fires: the supervision clause.
    const supervisionPart =
      parts.find(
        (part) =>
          part.kind === "clause" && part.partKey === "patina.supervision_fee",
      ) ?? null;
    const doubleCount = validateNoDoubleCount({
      supervision: supervisionPart
        ? readSupervision(supervisionPart.payload ?? {})
        : null,
      subMarkupBps: readSubMarkupBps(pricingBasisPart?.payload ?? {}),
    });
    if (doubleCount) add(supervisionPart?.id ?? null, doubleCount);

    // R10 — the gate holds at send too. An attestation that expired between
    // composing and sending locks the agreement, and the room says so rather
    // than letting the send fail with a database sentence.
    if (!turnkey.attestationLive) add(null, TURNKEY_ATTESTATION_BLOCKER);

    // R11 — a notice counsel has not cleared must not reach a client.
    const cleared = new Set(turnkey.enabledJurisdictions);
    for (const part of parts) {
      if (part.kind !== "attachment") continue;
      const jurisdiction = (part.payload ?? {}).jurisdiction;
      if (typeof jurisdiction !== "string" || !jurisdiction) continue;
      if (!cleared.has(jurisdiction)) {
        add(part.id, heldNoticeBlocker(jurisdiction));
      }
    }
  }

  // R-5 — the class floor. An agreement that bills has to name a fee
  // somewhere typed; prose never carries money (R5).
  const namesAFee = clientFacing.some(
    (part) =>
      part.kind === "schedule" &&
      part.variant !== null &&
      (FEE_VARIANTS as readonly string[]).includes(part.variant) &&
      scheduleValueIsSet(part),
  );
  // A hidden fee IS a fee the designer typed, so telling her the agreement
  // "names no fee. Add a rate card, a flat fee, or a per-phase fee." over a
  // Flat fee row she is looking at reads as the room losing her work. The
  // hidden-fee sentence above already says the true thing — the fee is there
  // and cannot bill — so it stands alone and this one steps aside.
  //
  // The turnkey class is exempt: it carries no rate card, no flat fee and no
  // per-phase fee — its typed money part is the pricing basis, asked above.
  if (!isTurnkey && !namesAFee && hiddenFees.length === 0) {
    add(
      null,
      "This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.",
    );
  }

  // R-6 — the ceiling is required exactly when a rate card is present and
  // real. Asked twice, because two different floors are in play and the room
  // must hold on either one:
  //
  //   · R21's — the homeowner's copy. A rate card she reads needs a ceiling
  //     she reads, or she has signed uncapped time.
  //   · the database's — `_agreement_floor_unmet` (00575) reads EVERY part,
  //     visible or not, and refuses the send. A room that answered only the
  //     first question would call a hidden rate card ready and then watch the
  //     send fail with `an agreement that bills time needs a ceiling`.
  const billsTime = (scope: AgreementPart[]) =>
    scope.some(
      (part) =>
        part.kind === "schedule" &&
        part.variant === "rate_card" &&
        readRoles(part.payload ?? {}).some(
          (role) => role.roleName.trim().length > 0 && role.hourlyRateCents > 0,
        ),
    );
  const cappedBy = (scope: AgreementPart[]) =>
    scope.find((part) => {
      if (part.kind !== "schedule" || part.variant !== "ceiling") return false;
      const cents = readCents((part.payload ?? {}).cents);
      return cents !== null && cents > 0;
    }) ?? null;

  const uncappedForTheClient =
    billsTime(clientFacing) && !cappedBy(clientFacing);
  const uncappedForTheDatabase = billsTime(parts) && !cappedBy(parts);
  if (uncappedForTheClient || uncappedForTheDatabase) {
    const ceilingPart = parts.find(
      (part) => part.kind === "schedule" && part.variant === "ceiling",
    );
    add(
      ceilingPart?.id ?? null,
      "An agreement that bills hourly needs a ceiling. Add a Ceiling part, or remove the role rates.",
    );
  }

  // R-3 — last, as it is today.
  if (!recipientEmail?.trim()) {
    add(null, CLIENT_LINK_BLOCKER);
  }

  return { ready: blockers.length === 0, blockers, notes };
}

/**
 * How many parts the panel says need attention.
 *
 * Distinct parts carrying at least one blocker. The client-account blocker is
 * excluded because it is not about a part — the same exclusion the
 * seven-facet counter makes today.
 */
export function partsNeedingAttention(readiness: AgreementReadiness): number {
  const ids = new Set<string>();
  for (const blocker of readiness.blockers) {
    if (blocker.partId) ids.add(blocker.partId);
  }
  return ids.size;
}

/**
 * What one part is being held on, in the readiness panel's own words.
 *
 * The panel prints only the blockers that belong to NO part, and the rail
 * marks a held row with the bare words "needs attention" — so a part-scoped
 * sentence (R33's hidden fee, a blank rate-card role, a duplicate money part)
 * was authored, attached, and then rendered nowhere at all. The editor is
 * where the designer typed the thing being refused, so the editor is where it
 * says so.
 */
export function blockersForPart(
  readiness: AgreementReadiness,
  partId: string | null,
): string[] {
  if (!partId) return [];
  const seen = new Set<string>();
  for (const blocker of readiness.blockers) {
    if (blocker.partId === partId) seen.add(blocker.message);
  }
  return [...seen];
}

/** The blockers that belong to no part — rendered as their own lines under
 *  the count. */
export function documentBlockers(
  readiness: AgreementReadiness,
): AgreementBlocker[] {
  return readiness.blockers.filter((blocker) => blocker.partId === null);
}
