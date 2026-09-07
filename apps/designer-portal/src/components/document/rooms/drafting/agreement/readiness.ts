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

import type { AgreementPart } from "@patina/types";
import type { CommercialDocument } from "@/lib/document/commercial-documents";
import {
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
 * names no fee. This list is exactly the blocker sentence below: a rate card,
 * a flat fee, a per-phase fee — plus a ceiling, which is itself a stated
 * amount the studio may not exceed.
 */
const FEE_VARIANTS = ["rate_card", "flat", "per_phase", "ceiling"] as const;

/** The blocker that is about the client account rather than the agreement.
 *  Excluded from the attention count, exactly as the seven-facet room
 *  excludes it today. */
const CLIENT_LINK_BLOCKER = "Link a client with an email address.";

export function assessAgreementReadiness({
  document,
  parts,
  recipientEmail,
}: {
  document: CommercialDocument;
  parts: AgreementPart[];
  recipientEmail: string | null | undefined;
}): AgreementReadiness {
  const blockers: AgreementBlocker[] = [];
  const notes: string[] = [];
  const add = (partId: string | null, message: string) =>
    blockers.push({ partId, message });

  // R-1 / R-2 — the document itself, unchanged from the flag-off wording.
  if (
    document.kind !== "design_services" &&
    document.kind !== "service_addendum"
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

  // R-5 — the class floor. An agreement that bills has to name a fee
  // somewhere typed; prose never carries money (R5).
  const namesAFee = parts.some(
    (part) =>
      part.kind === "schedule" &&
      part.variant !== null &&
      (FEE_VARIANTS as readonly string[]).includes(part.variant) &&
      scheduleValueIsSet(part),
  );
  if (!namesAFee) {
    add(
      null,
      "This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.",
    );
  }

  // R-6 — the ceiling is required exactly when a rate card is present and
  // real. This is the DB floor too (00575's `upsert_agreement_parts` raises
  // `an agreement that bills time needs a ceiling`), so the two cannot drift.
  const billsTime = parts.some(
    (part) =>
      part.kind === "schedule" &&
      part.variant === "rate_card" &&
      readRoles(part.payload ?? {}).some(
        (role) => role.roleName.trim().length > 0 && role.hourlyRateCents > 0,
      ),
  );
  if (billsTime) {
    const ceilingPart = parts.find(
      (part) => part.kind === "schedule" && part.variant === "ceiling",
    );
    const ceilingCents = ceilingPart
      ? readCents((ceilingPart.payload ?? {}).cents)
      : null;
    if (ceilingCents === null || ceilingCents <= 0) {
      add(
        ceilingPart?.id ?? null,
        "An agreement that bills hourly needs a ceiling. Add a Ceiling part, or remove the role rates.",
      );
    }
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

/** The blockers that belong to no part — rendered as their own lines under
 *  the count. */
export function documentBlockers(
  readiness: AgreementReadiness,
): AgreementBlocker[] {
  return readiness.blockers.filter((blocker) => blocker.partId === null);
}
