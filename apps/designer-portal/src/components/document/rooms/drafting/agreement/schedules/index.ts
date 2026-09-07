/**
 * The schedule editors, and R9's answer to "does this part create authority?"
 *
 * Wave 1 shipped four money editors inside `part-editor.tsx` (rate card,
 * ceiling, retainer, cadence) and three more beside them (flat, per-phase,
 * furnishings deposit). Wave 2 adds fee schedules, and with them a second
 * question every schedule part now has to answer on its own face: whether the
 * figure in it becomes billing authority, or is only recorded.
 *
 * R9 draws that line. `AUTHORITY_VARIANTS` (@patina/types) is the list — it is
 * never re-declared here, only read — plus `procurement`, which creates
 * authority through its deposit percent and nothing else. Everything left over
 * is **record only**: no terms projection, no authority column, no consent
 * fragment, and a chip that says so.
 *
 * R7 vocabulary: Agreement · Part · Library · Template · Addendum.
 */

import type { ComponentType } from "react";
import {
  AUTHORITY_VARIANTS,
  type AgreementScheduleVariant,
} from "@patina/types";
import { CostPlusEditor } from "./cost-plus-editor";
import { DayRateEditor } from "./day-rate-editor";
import { FlatEditor } from "./flat-editor";
import { PackageEditor } from "./package-editor";
import { PercentEditor } from "./percent-editor";
import { PerPhaseEditor } from "./per-phase-editor";
import { ProcurementEditor } from "./procurement-editor";

export { AUTHORITY_VARIANTS };

export interface ScheduleEditorProps {
  payload: Record<string, unknown>;
  onChange: (payload: Record<string, unknown>) => void;
  readOnly: boolean;
  /**
   * `agreement-library` — both Wave 2 gates resolved to one boolean by the
   * composer. Three of these editors also serve the Wave 1 room, where the
   * fee schedules do not exist yet and neither does the chip above them; with
   * the flag off they render the paper Wave 1 shipped.
   */
  libraryOn?: boolean;
}

export type ScheduleEditorComponent = ComponentType<ScheduleEditorProps>;

/** What this variant does to the money, in R9's three standings. */
export type AuthorityStanding = "authority" | "deposit-only" | "record-only";

export function authorityStanding(
  variant: string | null | undefined,
): AuthorityStanding {
  // `procurement` is on R9's list for its deposit percent alone; the rest of
  // its fields (markup basis, freight, terms of sale) are prose.
  if (variant === "procurement") return "deposit-only";
  if (
    variant !== null &&
    variant !== undefined &&
    (AUTHORITY_VARIANTS as readonly string[]).includes(variant)
  ) {
    return "authority";
  }
  return "record-only";
}

export const AUTHORITY_STANDING_LABEL: Record<AuthorityStanding, string> = {
  authority: "creates authority",
  "deposit-only": "creates authority · deposit only",
  "record-only": "record only",
};

/** The one line of help under a record-only editor. No tooltip, no info icon,
 *  no link (build sheet §4.2). */
export const RECORD_ONLY_HELP =
  "This is recorded on the agreement. It does not create billing authority yet.";

/**
 * The variants this folder opens. The four Wave 1 editors that stayed in
 * `part-editor.tsx` — rate card, ceiling, retainer, cadence — are deliberately
 * absent; `part-editor.tsx` asks this map first and falls through to its own
 * switch, so neither list has to know about the other.
 *
 * `pricing_basis`, `draws` and `allowances` are Wave 3. They are in the
 * vocabulary, they chip `record only`, and they open in Wave 1's
 * read-only card until the wave that authors them lands.
 */
const SCHEDULE_EDITORS: Partial<
  Record<AgreementScheduleVariant, ScheduleEditorComponent>
> = {
  flat: FlatEditor,
  per_phase: PerPhaseEditor,
  procurement: ProcurementEditor,
  percent_of_cost: PercentEditor,
  percent_of_spend: PercentEditor,
  cost_plus: CostPlusEditor,
  day_rate: DayRateEditor,
  package: PackageEditor,
};

export function scheduleEditorFor(
  variant: string | null | undefined,
): ScheduleEditorComponent | null {
  if (!variant) return null;
  return SCHEDULE_EDITORS[variant as AgreementScheduleVariant] ?? null;
}

export {
  CostPlusEditor,
  DayRateEditor,
  FlatEditor,
  PackageEditor,
  PercentEditor,
  PerPhaseEditor,
  ProcurementEditor,
};
