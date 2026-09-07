/**
 * The part vocabulary, as the composer needs it.
 *
 * The words themselves are code-resident in `@patina/types` (contract §1 —
 * the `studio_contacts.contact_kind` pattern: no CHECK on the column, one
 * declaration in TypeScript). This module adds only what a UI needs on top of
 * them: what a kind is called, which kinds Wave 1 lets a designer add, what a
 * blank one starts as, and whether a schedule part's typed value is actually
 * filled in.
 *
 * R7 vocabulary: Agreement · Part · Library · Template · Addendum. Never
 * "clause library", never "contract builder", never a column name.
 */

import {
  AUTHORITY_VARIANTS,
  type AgreementPart,
  type AgreementPartKind,
  type AgreementScheduleVariant,
} from "@patina/types";

/** The seven schedule variants Wave 1 can author. The other eight are in the
 *  vocabulary and the renderers handle them, but the rail does not offer them
 *  (build sheet §4.2). */
export const W1_SCHEDULE_VARIANTS = [
  "rate_card",
  "ceiling",
  "retainer",
  "cadence",
  "procurement",
  "flat",
  "per_phase",
] as const;

export type W1ScheduleVariant = (typeof W1_SCHEDULE_VARIANTS)[number];

const KIND_LABELS: Record<AgreementPartKind, string> = {
  clause: "Clause",
  list: "List",
  phases: "Phases",
  schedule: "Schedule",
  attachment: "Attachment",
  attestation: "Attestation",
};

const VARIANT_LABELS: Record<string, string> = {
  rate_card: "Role rates",
  ceiling: "Ceiling",
  retainer: "Retainer",
  cadence: "Billing cadence",
  procurement: "Furnishings deposit",
  flat: "Flat fee",
  per_phase: "Fee by phase",
  percent_of_cost: "Percent of cost",
  percent_of_spend: "Percent of spend",
  cost_plus: "Cost plus",
  day_rate: "Day rate",
  package: "Package",
  pricing_basis: "Pricing basis",
  draws: "Draws",
  allowances: "Allowances",
};

/** What this part is, in one or two words — the rail's kind line. */
export function partKindLabel(
  kind: string,
  variant: string | null | undefined,
): string {
  if (kind === "schedule" && variant) {
    return VARIANT_LABELS[variant] ?? variant.replace(/_/g, " ");
  }
  return KIND_LABELS[kind as AgreementPartKind] ?? kind.replace(/_/g, " ");
}

/** R9 — this variant will create billing authority in Wave 2. In W1 the chip
 *  is the only reader; nothing projects from it. */
export function createsAuthority(variant: string | null | undefined): boolean {
  return (
    variant !== null &&
    variant !== undefined &&
    (AUTHORITY_VARIANTS as readonly string[]).includes(variant)
  );
}

/** True when the composer ships a real editor for this kind/variant. Anything
 *  else opens read-only in `UnsupportedPartCard` — and never throws. */
export function hasEditor(
  kind: string,
  variant: string | null | undefined,
): boolean {
  if (kind === "clause" || kind === "list") return true;
  if (kind !== "schedule") return false;
  return (W1_SCHEDULE_VARIANTS as readonly string[]).includes(variant ?? "");
}

export function blankPayload(
  kind: AgreementPartKind,
  variant: AgreementScheduleVariant | null,
): Record<string, unknown> {
  if (kind === "clause") return { body: "" };
  if (kind === "list") return { items: [] };
  if (kind !== "schedule") return {};
  switch (variant) {
    case "rate_card":
      return { roles: [] };
    case "ceiling":
      return { cents: null };
    case "retainer":
      // R21 — a figure nobody typed is not a figure. A blank money part opens
      // with NO amount, so the client copy prints nothing rather than "$0"
      // and readiness holds the send until the studio writes one. A retainer
      // of zero is still writable, and still means zero — it just has to be
      // written (R-8's "including zero when none is due").
      return {
        cents: null,
        creditRule: "credited",
        activationPolicy: "immediate",
      };
    case "cadence":
      return { cadence: "monthly" };
    case "procurement":
      return { depositPercent: null };
    case "flat":
      return { cents: null };
    case "per_phase":
      return { phases: [] };
    default:
      return {};
  }
}

export interface AddPartOption {
  kind: AgreementPartKind;
  variant: AgreementScheduleVariant | null;
  label: string;
}

/** The menu the rail's `+ Add a part` opens. W1 offers blank kinds only — the
 *  Library picker is Wave 2. */
export const ADD_PART_OPTIONS: AddPartOption[] = [
  { kind: "clause", variant: null, label: "Clause" },
  { kind: "list", variant: null, label: "List" },
  ...W1_SCHEDULE_VARIANTS.map((variant) => ({
    kind: "schedule" as const,
    variant: variant as AgreementScheduleVariant,
    label: VARIANT_LABELS[variant],
  })),
];

/**
 * R18 — an agreement carries only one of each money part.
 *
 * `upsert_agreement_parts` refuses a second one with a `check_violation`
 * ("an agreement carries only one ceiling"), because the projection reads a
 * money part by its SHAPE: two ceilings leave the terms row choosing between
 * them. The words below are the RPC's own words for each part, so the room's
 * sentence and the database's sentence are the same sentence.
 *
 * `flat` and `per_phase` are deliberately absent: they are record-only in W1,
 * nothing projects from them, and an agreement may legitimately state more
 * than one of either.
 */
export const SINGLE_INSTANCE_VARIANTS: Record<string, string> = {
  rate_card: "rate card",
  ceiling: "ceiling",
  retainer: "retainer",
  cadence: "billing cadence",
  procurement: "furnishings deposit",
};

function takenSingleInstanceVariants(parts: AgreementPart[]): Set<string> {
  const taken = new Set<string>();
  for (const part of parts) {
    if (part.kind !== "schedule" || !part.variant) continue;
    if (part.variant in SINGLE_INSTANCE_VARIANTS) taken.add(part.variant);
  }
  return taken;
}

/**
 * What `+ Add a part` may offer against this composition. A money part the
 * agreement already carries is not offered a second time — the menu does not
 * hand a designer an act the save is going to refuse (R18).
 */
export function addPartOptions(parts: AgreementPart[]): AddPartOption[] {
  const taken = takenSingleInstanceVariants(parts);
  return ADD_PART_OPTIONS.filter(
    (option) => !(option.variant && taken.has(option.variant)),
  );
}

/**
 * The money parts this composition carries more than one of, named the way
 * the RPC names them. Readiness reports these so Save can never reach 23514
 * from the room.
 */
export function duplicateMoneyVariants(parts: AgreementPart[]): {
  variant: string;
  label: string;
  partIds: string[];
}[] {
  const byVariant = new Map<string, string[]>();
  for (const part of parts) {
    if (part.kind !== "schedule" || !part.variant) continue;
    if (!(part.variant in SINGLE_INSTANCE_VARIANTS)) continue;
    byVariant.set(part.variant, [
      ...(byVariant.get(part.variant) ?? []),
      part.id,
    ]);
  }
  return [...byVariant.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([variant, partIds]) => ({
      variant,
      label: SINGLE_INSTANCE_VARIANTS[variant],
      partIds,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

let blankCounter = 0;

/** A part that exists only in the composer's local state until Save. The key
 *  is namespaced `custom.<uuid>` because the projection is keyed on
 *  `part_key` (R5) — a custom part must never be mistaken for a standard one
 *  and rewrite the money row. */
export function createBlankPart(input: {
  proposalId: string;
  kind: AgreementPartKind;
  variant: AgreementScheduleVariant | null;
  position: number;
}): AgreementPart {
  const uuid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `local-${Date.now()}-${(blankCounter += 1)}`;
  return {
    id: `new-${uuid}`,
    proposalId: input.proposalId,
    position: input.position,
    kind: input.kind,
    variant: input.variant,
    partKey: `custom.${uuid}`,
    title: partKindLabel(input.kind, input.variant),
    payload: blankPayload(input.kind, input.variant),
    required: false,
    clientVisible: true,
    sourceTemplateKey: null,
    sourcePartId: null,
    updatedAt: null,
  };
}

// ── Payload readers. Defensive by construction: a payload is jsonb, and a
// part authored by a later wave (or by hand) may carry anything at all.

export function readCents(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

export function readBody(payload: Record<string, unknown>): string {
  return typeof payload.body === "string" ? payload.body : "";
}

export interface PartListItem {
  id: string;
  text: string;
  note?: string;
  optional?: boolean;
}

export function readItems(payload: Record<string, unknown>): PartListItem[] {
  if (!Array.isArray(payload.items)) return [];
  return payload.items.flatMap((raw, index) => {
    if (typeof raw === "string") {
      return [{ id: `item-${index}`, text: raw }];
    }
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    return [
      {
        id: typeof item.id === "string" ? item.id : `item-${index}`,
        text: typeof item.text === "string" ? item.text : "",
        note: typeof item.note === "string" ? item.note : undefined,
        optional: item.optional === true ? true : undefined,
      },
    ];
  });
}

export interface PartRole {
  roleName: string;
  hourlyRateCents: number;
  sortOrder: number;
}

export function readRoles(payload: Record<string, unknown>): PartRole[] {
  if (!Array.isArray(payload.roles)) return [];
  return payload.roles.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const role = raw as Record<string, unknown>;
    return [
      {
        roleName: typeof role.roleName === "string" ? role.roleName : "",
        hourlyRateCents: readCents(role.hourlyRateCents) ?? 0,
        sortOrder: Number.isFinite(Number(role.sortOrder))
          ? Number(role.sortOrder)
          : index,
      },
    ];
  });
}

export interface PartPhase {
  key: string;
  label: string;
  cents: number;
}

export function readPhases(payload: Record<string, unknown>): PartPhase[] {
  if (!Array.isArray(payload.phases)) return [];
  return payload.phases.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const phase = raw as Record<string, unknown>;
    return [
      {
        key: typeof phase.key === "string" ? phase.key : `phase-${index}`,
        label: typeof phase.label === "string" ? phase.label : "",
        cents: readCents(phase.cents) ?? 0,
      },
    ];
  });
}

export const CADENCE_OPTIONS = [
  { value: "monthly", label: "Monthly" },
  { value: "biweekly", label: "Every two weeks" },
  { value: "milestone", label: "At named milestones" },
] as const;

export const CREDIT_RULE_OPTIONS = [
  { value: "credited", label: "Credited" },
  { value: "non_refundable", label: "Non-refundable" },
  { value: "replenishing", label: "Replenishing" },
] as const;

export const DEPOSIT_CHIPS = [0, 25, 50, 100] as const;

/**
 * Is this schedule part's typed value actually filled in?
 *
 * Two callers: R-4 (a `required` part must be complete) and R-5 (the class
 * floor needs one money part that says something). A variant with no editor
 * answers `true` — Wave 1 will not block a send on a part it cannot open.
 */
export function scheduleValueIsSet(part: AgreementPart): boolean {
  const payload = part.payload ?? {};
  switch (part.variant) {
    case "rate_card":
      return readRoles(payload).some(
        (role) => role.roleName.trim().length > 0 && role.hourlyRateCents > 0,
      );
    case "ceiling": {
      const cents = readCents(payload.cents);
      return cents !== null && cents > 0;
    }
    case "retainer": {
      const cents = readCents(payload.cents);
      return (
        cents !== null &&
        cents >= 0 &&
        typeof payload.activationPolicy === "string" &&
        payload.activationPolicy.length > 0
      );
    }
    case "cadence":
      return typeof payload.cadence === "string" && payload.cadence.length > 0;
    case "flat": {
      const cents = readCents(payload.cents);
      return cents !== null && cents > 0;
    }
    case "per_phase":
      return readPhases(payload).some((phase) => phase.cents > 0);
    case "procurement": {
      const percent = readCents(payload.depositPercent);
      return percent !== null && percent >= 0 && percent <= 100;
    }
    default:
      return true;
  }
}
