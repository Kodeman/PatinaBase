"use client";

/**
 * The Trade Agreement composer — P14, R16.
 *
 * Research 02 §7's eight essentials, all present and none optional:
 * flow-down · scope · price · schedule · retainage · pay-when-paid ·
 * insurance · lien waivers. The flow-down key is the one that proves the
 * rule: the field exists, it stays NULL this wave because counsel has not
 * cleared the wording, and there is deliberately no control for it here.
 *
 * R7 — the object's name in every string a person reads is **Trade
 * Agreement**. "Subcontract" is fine in code and in docs and appears in no
 * string below.
 *
 * The sub never signs in here. Sending mints a token link and emails it; the
 * sub opens `/trade/<token>` with no login and signs there, on this object's
 * own signature table, so the prime's two-party signature constraint is
 * untouched.
 */

import { useState } from "react";
import {
  useCreateTradeAgreement,
  useSendTradeAgreement,
} from "@patina/supabase";
import { LIEN_WAIVER_POLICIES, type LienWaiverPolicy } from "@patina/types";
import { Button, Input, Select, Textarea } from "@/components/ui/controls";
import { documentEvents } from "@/lib/analytics/document-events";
import {
  SubPicker,
  type SubChoice,
} from "../../rooms/drafting/agreement/turnkey/sub-picker";
import { toCentsOrNull } from "../../rooms/drafting/agreement/part-kinds";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";

export const LIEN_WAIVER_POLICY_LABELS: Record<LienWaiverPolicy, string> = {
  conditional_then_unconditional: "Conditional, then unconditional on payment",
  unconditional_on_payment: "Unconditional on payment",
  none: "No waivers required",
};

/** AIA A401's own figure, and the default this composer offers. */
export const DEFAULT_PAY_WHEN_PAID_DAYS = 7;

export function TradeAgreementComposer({
  projectId,
  studioId,
  sourceProposalId,
  onDone,
  onCancel,
}: {
  projectId: string;
  studioId: string | null;
  sourceProposalId: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const create = useCreateTradeAgreement(projectId);
  const send = useSendTradeAgreement(projectId);

  const [sub, setSub] = useState<SubChoice | null>(null);
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("");
  const [price, setPrice] = useState("");
  const [startOn, setStartOn] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [sequencing, setSequencing] = useState("");
  const [retainagePercent, setRetainagePercent] = useState("5");
  const [payWhenPaidDays, setPayWhenPaidDays] = useState(
    String(DEFAULT_PAY_WHEN_PAID_DAYS),
  );
  const [insuranceRequired, setInsuranceRequired] = useState(true);
  const [lienWaiverPolicy, setLienWaiverPolicy] = useState<LienWaiverPolicy>(
    "conditional_then_unconditional",
  );
  const [note, setNote] = useState<string | null>(null);

  const priceCents = toCentsOrNull(price);
  const ready =
    sub !== null &&
    title.trim().length > 0 &&
    scope.trim().length > 0 &&
    priceCents !== null &&
    priceCents > 0;

  const submit = async (thenSend: boolean) => {
    if (!sub || priceCents === null) return;
    setNote(null);
    try {
      const id = await create.mutateAsync({
        projectId,
        contactId: sub.contactId,
        sourceProposalId,
        title: title.trim(),
        trade: sub.trade,
        scope: scope.trim(),
        priceCents,
        schedule: {
          startOn: startOn || null,
          durationDays: durationDays ? Number(durationDays) : null,
          sequencing: sequencing.trim() || null,
        },
        retainageBps: Math.round(Number(retainagePercent || "0") * 100),
        payWhenPaidDays: payWhenPaidDays ? Number(payWhenPaidDays) : null,
        insuranceCertificateRequired: insuranceRequired,
        lienWaiverPolicy,
        sovLineIds: [],
      });
      if (thenSend) {
        const result = await send.mutateAsync(id);
        documentEvents.tradeAgreementSent({ project_id: projectId });
        setNote(
          result.emailSent && result.recipient
            ? `Sent to ${result.recipient}.`
            : "Saved. Nothing was emailed.",
        );
      }
      onDone();
    } catch (error) {
      setNote(
        error instanceof Error
          ? error.message
          : "That Trade Agreement could not be saved.",
      );
    }
  };

  return (
    <div className="space-y-4">
      <SubPicker studioId={studioId} value={sub} onChange={setSub} />

      <label className={LABEL}>
        What this covers
        <Input
          className="mt-2"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Cabinetry & millwork"
        />
      </label>

      <label className={LABEL}>
        Scope
        <Textarea
          className="mt-2 min-h-28 normal-case tracking-normal"
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          placeholder="What this trade is responsible for, in your own words."
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={LABEL}>
          Price · dollars
          <Input
            className="mt-2"
            inputMode="decimal"
            aria-label="Price dollars"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </label>
        <label className={LABEL}>
          Retainage · percent
          <Input
            className="mt-2"
            inputMode="decimal"
            aria-label="Retainage percent"
            value={retainagePercent}
            onChange={(event) => setRetainagePercent(event.target.value)}
          />
        </label>
        <label className={LABEL}>
          Starts on
          <Input
            className="mt-2"
            type="date"
            aria-label="Starts on"
            value={startOn}
            onChange={(event) => setStartOn(event.target.value)}
          />
        </label>
        <label className={LABEL}>
          Duration · days
          <Input
            className="mt-2"
            inputMode="numeric"
            aria-label="Duration days"
            value={durationDays}
            onChange={(event) => setDurationDays(event.target.value)}
          />
        </label>
        <label className={LABEL}>
          Paid within · days of the studio being paid
          <Input
            className="mt-2"
            inputMode="numeric"
            aria-label="Pay when paid days"
            value={payWhenPaidDays}
            onChange={(event) => setPayWhenPaidDays(event.target.value)}
          />
        </label>
        <label className={LABEL}>
          Lien waivers
          <Select
            className="mt-2"
            aria-label="Lien waiver policy"
            value={lienWaiverPolicy}
            onChange={(event) =>
              setLienWaiverPolicy(event.target.value as LienWaiverPolicy)
            }
          >
            {LIEN_WAIVER_POLICIES.map((policy) => (
              <option key={policy} value={policy}>
                {LIEN_WAIVER_POLICY_LABELS[policy]}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <label className={LABEL}>
        Sequencing
        <Input
          className="mt-2 normal-case tracking-normal"
          value={sequencing}
          onChange={(event) => setSequencing(event.target.value)}
          placeholder="After rough-in, before tile"
        />
      </label>

      <label className="flex items-center gap-2 text-[12px] text-[var(--color-charcoal)]">
        <input
          type="checkbox"
          checked={insuranceRequired}
          onChange={(event) => setInsuranceRequired(event.target.checked)}
        />
        A certificate of insurance is required before work begins
      </label>

      {note && (
        <p role="status" className="text-[11.5px] text-[var(--color-mocha)]">
          {note}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--doc-ink-border)] pt-4">
        <Button
          disabled={!ready}
          loading={create.isPending || send.isPending}
          onClick={() => void submit(true)}
        >
          Send to the trade
        </Button>
        <Button
          variant="secondary"
          disabled={!ready}
          loading={create.isPending}
          onClick={() => void submit(false)}
        >
          Save as a draft
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
