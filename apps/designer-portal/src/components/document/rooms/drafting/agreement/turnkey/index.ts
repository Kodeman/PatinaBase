/**
 * The turnkey editors — Wave 3, behind `design-build`.
 *
 * `turnkeyEditorFor` is the single dispatch the part editor asks. It answers
 * null for every variant this folder does not open, and the part editor falls
 * through to whatever Wave 1 and Wave 2 already do — which is what keeps the
 * flag-off room byte identical to the paper Wave 2 shipped: with the flag off
 * the composer supplies no turnkey context, the part editor never asks, and
 * `pricing_basis` / `draws` / `allowances` stay in Wave 1's read-only card.
 */

import type { ComponentType } from "react";
import { AllowancesEditor } from "./allowances-editor";
import { DrawsEditor } from "./draws-editor";
import {
  PricingBasisEditor,
  type TurnkeyEditorProps,
} from "./pricing-basis-editor";
import { SubDisclosureClause } from "./sub-disclosure-clause";
import { SupervisionClause } from "./supervision-clause";
import { TURNKEY_PART_KEYS } from "./context";

export type TurnkeyEditorComponent = ComponentType<TurnkeyEditorProps>;

/** The three schedule variants the turnkey class authors. */
const SCHEDULE_EDITORS: Record<string, TurnkeyEditorComponent> = {
  pricing_basis: PricingBasisEditor,
  draws: DrawsEditor,
  allowances: AllowancesEditor,
};

/**
 * The two clauses that are not plain prose. Both carry a typed field the
 * no-double-count rule reads, and both are keyed rather than variant-matched
 * because a clause has no variant — R19's stable `patina.*` keys are what
 * identifies them, and a custom clause a designer writes is prose and gets
 * the ordinary clause editor.
 */
const CLAUSE_EDITORS: Record<string, TurnkeyEditorComponent> = {
  [TURNKEY_PART_KEYS.subDisclosure]: SubDisclosureClause,
  [TURNKEY_PART_KEYS.supervision]: SupervisionClause,
};

export function turnkeyEditorFor(input: {
  kind: string;
  variant: string | null | undefined;
  partKey: string;
}): TurnkeyEditorComponent | null {
  if (input.kind === "schedule" && input.variant) {
    return SCHEDULE_EDITORS[input.variant] ?? null;
  }
  if (input.kind === "clause") {
    return CLAUSE_EDITORS[input.partKey] ?? null;
  }
  return null;
}

export { TURNKEY_PART_KEYS, findPart, payloadOf } from "./context";
export type { TurnkeyContext } from "./context";
export type { TurnkeyEditorProps } from "./pricing-basis-editor";
export { PricingBasisEditor } from "./pricing-basis-editor";
export { DrawsEditor } from "./draws-editor";
export { AllowancesEditor } from "./allowances-editor";
export { SubDisclosureClause } from "./sub-disclosure-clause";
export { SupervisionClause } from "./supervision-clause";
export { ScheduleOfValues } from "./schedule-of-values";
export { DrawLedger, drawStanding } from "./draw-ledger";
export { JurisdictionAttachments } from "./jurisdiction-attachments";
export { LienWaiverAttachments } from "./lien-waiver-attachments";
export { SubPicker } from "./sub-picker";
export type { SubChoice } from "./sub-picker";
export { turnkeyMoney } from "./money";
