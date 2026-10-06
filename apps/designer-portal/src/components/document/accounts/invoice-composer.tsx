"use client";

/**
 * The invoice composer (R74b) — drawing an invoice as an ANTI-WIZARD: one
 * paper sheet, self-composing pull-through sections in a single scroll —
 * Milestones (00204, unbilled ones tickable) · Unbilled time (00177 view,
 * resolved rates shown, R75) · FF&E (00187 coverage bridge, R76) · Ad-hoc
 * lines — plus tax/terms/memo, with running totals via computeInvoiceTotals.
 * No steps, no Next buttons: tick what the invoice should carry, then one
 * "Draft the invoice" act. The draft opens as the folio for issue + send.
 *
 * Prefill contracts (the one-act openers):
 *   initialFfeItemIds  — R76 "Bill →" (the ?ffeItemIds= descendant): arrive
 *                        ticked; covered/unpriced ones fall out with a notice.
 *   initialTimeEntryIds — R75 Bill week / bill-it: arrive ticked, per
 *                        project (the intersection when the composer asks).
 *   initialPurchaseIds — C-25 "Bill N unbilled purchases": arrive ticked.
 *   initialCostLineIds — C-31 "Bill N unbilled riders": arrive ticked.
 *
 * C-31 (00709): a line or a ticked group bills in full or as a deposit (X%),
 * and a line with a live deposit is offered its balance; every line shows
 * what it has had billed and at which stage. Each unbilled purchase and PO
 * rider bills at cost on its own line, overridable (R-PB7). Those lines go
 * through add_invoice_billing_lines once the draft exists — it stamps each
 * purchase and rider in the same transaction, so a second press cannot bill
 * one twice. If it refuses, the draft is deleted, exactly as a failed time
 * claim is compensated below.
 *
 * Time claim: after the draft lands, the selected entries are stamped with
 * invoice_id by claim_time_entries (00595; the 00177 guard then locks them).
 * That RPC gets its own transaction, so a PARTIAL claim has already stamped
 * some rows when the hook throws — the compensation is to delete the
 * just-created draft, which releases them through fk_time_entries_invoice's
 * ON DELETE SET NULL. If that delete ALSO fails the hours stay attached to an
 * abandoned draft and drop out of project_unbilled_time, so the inline error
 * names the draft id and says to void it. Failures render inline (R83); no
 * toasts.
 *
 * R136 — the STUDIO invoice, an invoice with no house (ruling S1). Behind the
 * `studio-invoice` flag the first section is "for" rather than "the document",
 * and its select carries "the studio · no house" ahead of the houses. Choosing
 * it puts the three pull-through sections away — milestones, time and FF&E are
 * all house-bound (S6) — and asks instead for the household (S4), the regarding
 * line (S12), and, only when the designer belongs to more than one active
 * design studio, which studio is billing (S8). Everything below the fold is the
 * composer's own: ad-hoc lines, tax, terms, memo, totals, one Draft act.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useAddInvoiceBillingLines,
  useCreateDraftInvoice,
  useCreateDraftStudioInvoice,
  useDeleteDraftInvoice,
  useFfeInvoiceCoverage,
  useFfeInvoiceStageCoverage,
  useProjectPoCostLines,
  useOrganizations,
  useProjectFFEItems,
  useProjectRoster,
  useProjectInvoices,
  useProjectPaymentMilestones,
  useProjects,
  useClaimTimeEntries,
  useStudioPurchases,
  useUnbilledTime,
} from "@patina/supabase";
import { computeInvoiceTotals, formatCurrency } from "@patina/shared";
import { formatHoursLabel } from "@/lib/time-billing";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { ClientPicker } from "@/components/portal/client-picker";
import { documentEvents } from "@/lib/analytics/document-events";
import { DocumentAction, DocumentActionGroup } from "../document-action";
import {
  EMPTY_ADHOC,
  STUDIO_TARGET,
  activeDesignStudios,
  balanceCents,
  balanceOwedItems,
  buildBillingLines,
  depositCents,
  lineClientPriceCents,
  buildComposerLines,
  canDraftStudioInvoice,
  centsToDollarText,
  isValidDepositPct,
  lineBillingByItem,
  parseOverrideCents,
  partitionFfeBillable,
  purchaseAtCostCents,
  riderAtCostCents,
  riderLabel,
  stageSlotWords,
  unbilledMilestones,
  unbilledPurchases,
  unbilledRiders,
  type ComposerAdhocRow,
  type ComposerFfeItem,
  type ComposerMilestone,
  type ComposerPurchase,
  type ComposerRider,
  type ComposerStageSlot,
  type ComposerStudio,
} from "@/lib/document/invoice-composer";
import { fmtDay } from "@/lib/document/format";
import type { InvoiceComposerContext } from "./invoice-overlays";

const TERRACOTTA_INK = "var(--color-terracotta-ink)";

const LABEL =
  "font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]";
const INPUT =
  "rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 py-1.5 text-[11.5px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none";
const CHECK = "relative top-[1px] accent-[var(--color-clay)]";
const ROW =
  "flex cursor-pointer items-baseline gap-2.5 border-b border-dashed border-[var(--color-pearl)] py-1.5";

// Untyped hook rows (house style — database.types.ts not regenerated).
type AnyRecord = any;

// The houseless choice is made in the "for" select, so it cannot be a
// DocumentAction button — but it is an act, and it rides the same pair every
// other act in this region rides (no new analytics module).
const STUDIO_CHOICE_EVENT = {
  surface_key: "accounts",
  region_key: "invoice-composer",
  action_key: "choose-studio-invoice",
  variant: "secondary",
  presentation: "inline",
} as const;

export function InvoiceComposer({
  context,
  onDrafted,
}: {
  context: InvoiceComposerContext;
  /** The handoff: the draft opens as the folio (issue + send live there).
   *  `projectId` is null for a studio invoice — there is no house to return. */
  onDrafted: (invoiceId: string, projectId: string | null) => void;
}) {
  // One select, two kinds of target: a project id, or the studio sentinel.
  const [target, setTarget] = useState(
    context.mode === "studio" ? STUDIO_TARGET : (context.projectId ?? ""),
  );
  const projectId = target === STUDIO_TARGET ? "" : target;

  // Fail-closed: the houseless choice never renders while the flag is still
  // resolving. A project-scoped opener has already named its house, so it
  // never offers the choice at all.
  const { value: studioInvoiceOn, isLoading: flagLoading } =
    useFeatureFlag("studio-invoice");
  const studioChoiceAvailable =
    studioInvoiceOn && !flagLoading && !context.projectId;
  const studioMode = studioChoiceAvailable && target === STUDIO_TARGET;

  const { data: projects } = useProjects();
  const { data: organizations, isLoading: organizationsLoading } =
    useOrganizations();
  const { data: milestones } = useProjectPaymentMilestones(projectId);
  const { data: projectInvoices } = useProjectInvoices(projectId || null);
  const { data: unbilledTime, isLoading: timeLoading } = useUnbilledTime(
    projectId || null,
  );
  // HT-21 (W5) — names the composer's time rows: project_unbilled_time
  // deliberately carries no author name (00596's dropped profiles join), so
  // the roster (already-read, project-scoped, RLS-clean) supplies it.
  const { data: roster } = useProjectRoster(projectId || null);
  // C-25 / C-31 — the project's purchases and PO riders still owed a client
  // line; each bills at cost on its own line (R-PB7).
  const { data: purchases, isLoading: purchasesLoading } = useStudioPurchases(
    projectId ? { projectId } : null,
  );
  const { data: riders, isLoading: ridersLoading } =
    useProjectPoCostLines(projectId || null);
  const offerablePurchases = useMemo(
    () => unbilledPurchases(purchases as ComposerPurchase[] | undefined),
    [purchases],
  );
  const offerableRiders = useMemo(
    () => unbilledRiders(riders as ComposerRider[] | undefined),
    [riders],
  );
  const { data: ffeItems, isLoading: ffeLoading } =
    useProjectFFEItems(projectId);
  const { data: coverage, isLoading: coverageLoading } = useFfeInvoiceCoverage(
    projectId,
    {
      enabled: !!projectId,
    },
  );
  // C-31 — every live billing slot (full · deposit · balance) per line.
  const { data: stageRows, isLoading: stagesLoading } =
    useFfeInvoiceStageCoverage(projectId || null);
  const billing = useMemo(
    () => lineBillingByItem(stageRows as ComposerStageSlot[] | undefined),
    [stageRows],
  );

  const createDraft = useCreateDraftInvoice({ errorSurface: "inline" });
  const createStudioDraft = useCreateDraftStudioInvoice({
    errorSurface: "inline",
  });
  const deleteDraft = useDeleteDraftInvoice({ errorSurface: "inline" });
  const claimTime = useClaimTimeEntries({ errorSurface: "inline" });
  const addBilling = useAddInvoiceBillingLines({ errorSurface: "inline" });

  // ── Selections ────────────────────────────────────────────────────────────
  const [tickedMilestoneIds, setTickedMilestoneIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [tickedTimeIds, setTickedTimeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [tickedFfeIds, setTickedFfeIds] = useState<Set<string>>(
    () => new Set(),
  );
  // C-31 — the ticked FF&E group bills in full, or as a deposit of X%.
  const [ffeStage, setFfeStage] = useState<"full" | "deposit">("full");
  const [depositPctText, setDepositPctText] = useState("50");
  const [tickedBalanceIds, setTickedBalanceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [tickedPurchaseIds, setTickedPurchaseIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [tickedRiderIds, setTickedRiderIds] = useState<Set<string>>(
    () => new Set(),
  );
  // R-PB7 overrides, by purchase / rider id; absent = bill at cost.
  const [overrides, setOverrides] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [adhoc, setAdhoc] = useState<ComposerAdhocRow[]>([{ ...EMPTY_ADHOC }]);
  // Studio mode's own three fields (S4 · S12 · S8).
  const [studioClientId, setStudioClientId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [chosenStudioId, setChosenStudioId] = useState("");
  const [taxRatePercent, setTaxRatePercent] = useState("0");
  const [termsDays, setTermsDays] = useState("15");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const activeProjects = useMemo(
    () =>
      ((projects ?? []) as AnyRecord[]).filter(
        (p) => p.status === "active" || p.status === "planning",
      ),
    [projects],
  );
  const selectedProject = useMemo(
    () => ((projects ?? []) as AnyRecord[]).find((p) => p.id === projectId),
    [projects, projectId],
  );

  // S8 — the studio line appears only when there is a choice to make.
  const studios = useMemo(
    () => activeDesignStudios((organizations ?? []) as ComposerStudio[]),
    [organizations],
  );
  const multiStudio = studios.length > 1;
  const studioId = chosenStudioId || studios[0]?.id || "";
  // Nothing to bill from: the Draft act can never open, so say so (R83).
  const studioMissing =
    studioMode && !organizationsLoading && studios.length === 0;

  // ── Milestones: billable = pending/outstanding, not on a live invoice ─────
  const offerableMilestones = useMemo(
    () =>
      unbilledMilestones(
        (milestones ?? []) as ComposerMilestone[],
        (projectInvoices ?? []) as AnyRecord[],
      ),
    [milestones, projectInvoices],
  );

  // ── FF&E: every billable line of the project, coverage-partitioned ────────
  const ffeSettled =
    !!projectId && !ffeLoading && !coverageLoading && !stagesLoading;
  const ffePartition = useMemo(
    () =>
      partitionFfeBillable(
        (ffeItems ?? []) as Array<ComposerFfeItem & AnyRecord>,
        ffeSettled ? coverage : undefined,
      ),
    [ffeItems, coverage, ffeSettled],
  );
  // C-31 — a line with a live deposit and no balance yet: offered its balance.
  const balanceOwed = useMemo(
    () => (ffeSettled ? balanceOwedItems(ffePartition.covered, billing) : []),
    [ffeSettled, ffePartition, billing],
  );
  // Every other covered line, with what it has had billed and at which stage.
  const alreadyBilled = useMemo(() => {
    const owed = new Set(balanceOwed.map((i) => i.id));
    return ffePartition.covered.filter((i) => !owed.has(i.id));
  }, [ffePartition, balanceOwed]);
  const depositPct = Number(depositPctText.trim() || NaN);
  const depositPctValid = isValidDepositPct(depositPct);

  // HT-21 — the roster's `profile_id` is the entry's `user_id`; a member the
  // roster doesn't carry (e.g. the project's own designer, who logs time but
  // is not a `project_team_members` row) is left unnamed, matching the
  // pre-HT-21 generic phrasing rather than guessing.
  const memberNames = useMemo(
    () =>
      new Map(
        (roster ?? [])
          .filter((r): r is typeof r & { profile_id: string } => !!r.profile_id)
          .map((r) => [r.profile_id, r.display_name ?? null] as const),
      ),
    [roster],
  );
  const unbilledEntries = useMemo(
    () =>
      (unbilledTime?.entries ?? []).map((entry) => ({
        ...entry,
        member_name: memberNames.get(entry.user_id) ?? null,
      })),
    [unbilledTime, memberNames],
  );
  // MS-01 — hours that are unbilled and authorized but that NOTHING PRICED
  // (rate_source = 'none'). `useUnbilledTime` holds them out of `entries`, so
  // they cannot be ticked, cannot be swept in by "tick all" and cannot be seeded
  // from the ledger's hand-off; `claim_time_entries` refuses them too. They are
  // still shown — printing HT-26's "rate pending" is what tells the studio the
  // rate card is the repair, where silently dropping the hour would have read as
  // the hour going missing.
  const ratePendingEntries = useMemo(
    () =>
      (unbilledTime?.ratePendingEntries ?? []).map((entry) => ({
        ...entry,
        member_name: memberNames.get(entry.user_id) ?? null,
      })),
    [unbilledTime, memberNames],
  );

  // ── Prefill seeding — once per project, after the section queries settle ──
  // (An intersection seed, not a blind copy: covered FF&E items and
  // already-claimed entries fall out here; the notice below narrates it.)
  const [seededFor, setSeededFor] = useState<string | null>(null);
  useEffect(() => {
    if (!projectId || seededFor === projectId) return;
    const wantsFfe = (context.initialFfeItemIds ?? []).length > 0;
    const wantsTime = (context.initialTimeEntryIds ?? []).length > 0;
    const wantsPurchases = (context.initialPurchaseIds ?? []).length > 0;
    const wantsRiders = (context.initialCostLineIds ?? []).length > 0;
    if (wantsFfe && !ffeSettled) return;
    if (wantsTime && (timeLoading || !unbilledTime)) return;
    if (wantsPurchases && (purchasesLoading || !purchases)) return;
    if (wantsRiders && (ridersLoading || !riders)) return;

    if (wantsFfe) {
      const billableIds = new Set(ffePartition.billable.map((i) => i.id));
      const owedIds = new Set(balanceOwed.map((i) => i.id));
      setTickedFfeIds(
        new Set(
          (context.initialFfeItemIds ?? []).filter((id) => billableIds.has(id)),
        ),
      );
      // A line whose deposit is billed arrives with its balance ticked.
      setTickedBalanceIds(
        new Set(
          (context.initialFfeItemIds ?? []).filter((id) => owedIds.has(id)),
        ),
      );
    }
    if (wantsPurchases) {
      const ids = new Set(offerablePurchases.map((p) => p.id));
      setTickedPurchaseIds(
        new Set((context.initialPurchaseIds ?? []).filter((id) => ids.has(id))),
      );
    }
    if (wantsRiders) {
      const ids = new Set(offerableRiders.map((r) => r.id));
      setTickedRiderIds(
        new Set((context.initialCostLineIds ?? []).filter((id) => ids.has(id))),
      );
    }
    if (wantsTime) {
      const entryIds = new Set(unbilledEntries.map((e) => e.id));
      setTickedTimeIds(
        new Set(
          (context.initialTimeEntryIds ?? []).filter((id) => entryIds.has(id)),
        ),
      );
    }
    setSeededFor(projectId);
  }, [
    projectId,
    seededFor,
    context.initialFfeItemIds,
    context.initialTimeEntryIds,
    context.initialPurchaseIds,
    context.initialCostLineIds,
    ffeSettled,
    ffePartition,
    balanceOwed,
    timeLoading,
    unbilledTime,
    unbilledEntries,
    purchasesLoading,
    purchases,
    offerablePurchases,
    ridersLoading,
    riders,
    offerableRiders,
  ]);

  // Switching targets drops every selection — a line must bill an item that
  // belongs to the invoice's own project, and a studio invoice carries none.
  const pickTarget = (next: string) => {
    if (next === STUDIO_TARGET) {
      try {
        documentEvents.actionSelected(STUDIO_CHOICE_EVENT);
      } catch (e) {
        console.error("[analytics] actionSelected threw", e);
      }
    }
    setTarget(next);
    setTickedMilestoneIds(new Set());
    setTickedTimeIds(new Set());
    setTickedFfeIds(new Set());
    setTickedBalanceIds(new Set());
    setTickedPurchaseIds(new Set());
    setTickedRiderIds(new Set());
    setOverrides(new Map());
    setSeededFor(null);
    setError(null);
  };

  // The shown half of the pair, fired once the choice is actually on offer.
  const choiceShown = useRef(false);
  useEffect(() => {
    if (!studioChoiceAvailable || choiceShown.current) return;
    choiceShown.current = true;
    try {
      documentEvents.actionShown(STUDIO_CHOICE_EVENT);
    } catch (e) {
      console.error("[analytics] actionShown threw", e);
    }
  }, [studioChoiceAvailable]);

  // ── Assembly ──────────────────────────────────────────────────────────────
  const taxRate = useMemo(() => {
    const parsed = parseFloat(taxRatePercent);
    return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed / 100;
  }, [taxRatePercent]);

  // S6 — a studio invoice carries ad-hoc lines and nothing else. Milestones,
  // time and FF&E all belong to a house; the RPC refuses their kinds outright.
  const selection = useMemo(
    () =>
      studioMode
        ? { milestones: [], ffeItems: [], timeEntries: [], adhoc }
        : {
            milestones: offerableMilestones.filter((m) =>
              tickedMilestoneIds.has(m.id),
            ),
            ffeItems:
              ffeStage === "full"
                ? ffePartition.billable.filter((i) => tickedFfeIds.has(i.id))
                : [],
            timeEntries: unbilledEntries.filter((e) => tickedTimeIds.has(e.id)),
            adhoc,
          },
    [
      studioMode,
      offerableMilestones,
      tickedMilestoneIds,
      ffePartition,
      tickedFfeIds,
      ffeStage,
      unbilledEntries,
      tickedTimeIds,
      adhoc,
    ],
  );
  const lines = useMemo(() => buildComposerLines(selection), [selection]);
  // C-31 — the lines add_invoice_billing_lines adds once the draft exists.
  const billingLines = useMemo(
    () =>
      studioMode
        ? []
        : buildBillingLines({
            depositItems:
              ffeStage === "deposit"
                ? ffePartition.billable.filter((i) => tickedFfeIds.has(i.id))
                : [],
            depositPct,
            balanceItems: balanceOwed.filter((i) => tickedBalanceIds.has(i.id)),
            billing,
            purchases: offerablePurchases
              .filter((p) => tickedPurchaseIds.has(p.id))
              .map((p) => ({ subject: p, overrideText: overrides.get(p.id) })),
            riders: offerableRiders
              .filter((r) => tickedRiderIds.has(r.id))
              .map((r) => ({ subject: r, overrideText: overrides.get(r.id) })),
          }),
    [
      studioMode,
      ffeStage,
      ffePartition,
      tickedFfeIds,
      depositPct,
      balanceOwed,
      tickedBalanceIds,
      billing,
      offerablePurchases,
      tickedPurchaseIds,
      offerableRiders,
      tickedRiderIds,
      overrides,
    ],
  );
  const billingFiguresMissing = billingLines.some((l) => l.amountCents === null);
  const depositBlocked =
    ffeStage === "deposit" && tickedFfeIds.size > 0 && !depositPctValid;
  // R8/R9 — warned, never blocked: a purchase bought for a line whose client
  // price this invoice also bills, or a non-void invoice already bills
  // (SQ-448: any live slot), bills that piece twice.
  const doubleBilledPurchases = useMemo(() => {
    const billedLines = new Set([...tickedFfeIds, ...tickedBalanceIds, ...billing.keys()]);
    return offerablePurchases.filter(
      (p) =>
        tickedPurchaseIds.has(p.id) &&
        !!p.ffe_item_id &&
        billedLines.has(p.ffe_item_id),
    ).length;
  }, [offerablePurchases, tickedPurchaseIds, tickedFfeIds, tickedBalanceIds, billing]);
  const totals = useMemo(
    () =>
      computeInvoiceTotals(
        [
          ...lines.map((l) => ({
            quantity: l.quantity,
            unit_amount_cents: l.unitAmountCents,
          })),
          ...billingLines.map((l) => ({
            quantity: 1,
            unit_amount_cents: l.amountCents ?? 0,
          })),
        ],
        taxRate,
      ),
    [lines, billingLines, taxRate],
  );
  const lineCount = lines.length + billingLines.length;

  const creating =
    createDraft.isPending ||
    createStudioDraft.isPending ||
    claimTime.isPending ||
    addBilling.isPending ||
    deleteDraft.isPending;
  // Block drafting while a prefilled section is still resolving — otherwise a
  // draft could land moments before its prefill arrives, silently dropping it.
  const prefillPending =
    seededFor !== projectId &&
    ((context.initialFfeItemIds ?? []).length > 0 ||
      (context.initialTimeEntryIds ?? []).length > 0 ||
      (context.initialPurchaseIds ?? []).length > 0 ||
      (context.initialCostLineIds ?? []).length > 0);
  const canDraft = studioMode
    ? canDraftStudioInvoice({
        clientId: studioClientId,
        title,
        studioId,
        lines,
      }) && !creating
    : !!projectId &&
      lineCount > 0 &&
      !billingFiguresMissing &&
      !depositBlocked &&
      !creating &&
      !prefillPending;

  const draft = async () => {
    setError(null);

    if (studioMode) {
      // No project, no milestones, no time to claim — one call, then the folio.
      try {
        const studioInvoiceId = await createStudioDraft.mutateAsync({
          clientId: studioClientId as string,
          studioId,
          title: title.trim(),
          taxRate,
          paymentTermsDays:
            parseInt(termsDays, 10) >= 0 ? parseInt(termsDays, 10) : 15,
          memo: memo.trim() || undefined,
          lines,
        });
        onDrafted(studioInvoiceId, null);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not draft the invoice",
        );
      }
      return;
    }

    const timeLine = lines.find((l) => l.kind === "time");
    let invoice: AnyRecord;
    try {
      invoice = await createDraft.mutateAsync({
        projectId,
        clientId: selectedProject?.client_id ?? null,
        taxRate,
        paymentTermsDays:
          parseInt(termsDays, 10) >= 0 ? parseInt(termsDays, 10) : 15,
        memo: memo.trim() || undefined,
        lines,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not draft the invoice");
      return;
    }

    if (timeLine) {
      const entryIds =
        (timeLine.metadata as { time_entry_ids?: string[] })?.time_entry_ids ??
        [];
      try {
        await claimTime.mutateAsync({
          invoiceId: invoice.id,
          projectId,
          entryIds,
        });
      } catch (e) {
        // claim_time_entries commits in its own transaction (PostgREST), so a
        // partial claim has ALREADY stamped invoice_id on the rows it matched.
        // Deleting the draft releases them through fk_time_entries_invoice's
        // ON DELETE SET NULL. If that delete also fails the hours stay attached
        // to an abandoned draft and vanish from project_unbilled_time — say so,
        // with the id, instead of swallowing it.
        let stranded = false;
        try {
          await deleteDraft.mutateAsync({ invoiceId: invoice.id, projectId });
        } catch {
          stranded = true;
        }
        const reason =
          e instanceof Error ? e.message : "Could not attach the time entries";
        setError(
          stranded
            ? `${reason} The draft ${invoice.id} still holds those hours — void it to release them.`
            : reason,
        );
        return;
      }
    }

    // C-31 — deposits, balances, purchases and riders, through the writer
    // that stamps each subject in the same transaction. One refusal adds
    // nothing; the draft is then deleted (which also releases any claimed
    // hours), so a half-composed invoice never lingers.
    if (billingLines.length > 0) {
      try {
        await addBilling.mutateAsync({
          invoiceId: invoice.id,
          projectId,
          lines: billingLines.map((l) => l.request),
        });
      } catch (e) {
        let stranded = false;
        try {
          await deleteDraft.mutateAsync({ invoiceId: invoice.id, projectId });
        } catch {
          stranded = true;
        }
        // The writer's refusal arrives as a PostgrestError, not an Error.
        const message = (e as { message?: unknown } | null)?.message;
        const reason =
          typeof message === "string" && message
            ? message
            : "Could not add the billing lines";
        setError(
          stranded
            ? `${reason} The draft ${invoice.id} was kept — delete or void it.`
            : reason,
        );
        return;
      }
    }

    onDrafted(invoice.id as string, projectId);
  };

  const skippedFfe = useMemo(() => {
    const wanted = new Set(context.initialFfeItemIds ?? []);
    if (wanted.size === 0) return { covered: 0, unpriced: 0 };
    return {
      covered: ffePartition.covered.filter((i) => wanted.has(i.id)).length,
      unpriced: ffePartition.unpriced.filter((i) => wanted.has(i.id)).length,
    };
  }, [context.initialFfeItemIds, ffePartition]);

  // ── The sheet ─────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-[20px] font-medium text-[var(--color-charcoal)]">
          Draw an invoice
        </h2>
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak,#8B7355)]">
          Studio eyes only
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
        Everything billable pulls through below — tick what this invoice should
        carry, in any order. The draft opens as the folio to issue &amp; send.
      </p>

      {/* ── What it bills: a house, or the studio itself (R136) ─────────── */}
      <div className="mt-3 border-t border-[var(--color-pearl)] pt-2.5">
        <p className={`${LABEL} mb-1`}>
          {studioChoiceAvailable ? "for" : "the document"}
        </p>
        {context.projectId && selectedProject ? (
          <p className="text-[12.5px] font-medium text-[var(--color-charcoal)]">
            {selectedProject.name}
          </p>
        ) : (
          <select
            value={target}
            onChange={(e) => pickTarget(e.target.value)}
            aria-label={studioChoiceAvailable ? "For" : "Project"}
            className={`${INPUT} w-full max-w-[360px] [&_option]:bg-[var(--doc-paper,#FAF7F2)]`}
          >
            <option value="">Pick a document…</option>
            {studioChoiceAvailable && (
              <option value={STUDIO_TARGET}>the studio · no house</option>
            )}
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ── The studio's own three fields (S8 · S4 · S12) ───────────────── */}
      {studioMode && (
        <>
          {multiStudio && (
            <div className="mt-4">
              <p className={`${LABEL} mb-1`}>studio</p>
              <select
                value={studioId}
                onChange={(e) => setChosenStudioId(e.target.value)}
                aria-label="Studio"
                className={`${INPUT} w-full max-w-[360px] [&_option]:bg-[var(--doc-paper,#FAF7F2)]`}
              >
                {studios.map((studio) => (
                  <option key={studio.id} value={studio.id}>
                    {studio.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-4 max-w-[360px]">
            <p className={`${LABEL} mb-1`}>household</p>
            {/* The picker portals to <body>; this sheet is z-[60], so the panel
                is lifted clear of it (client-picker.tsx popoverClassName). */}
            <ClientPicker
              value={studioClientId}
              onChange={setStudioClientId}
              ariaLabel="Household"
              placeholder="Search or add a household…"
              popoverClassName="z-[70]"
            />
          </div>

          <label className="mt-4 flex max-w-[420px] flex-col gap-0.5">
            <span className={LABEL}>regarding</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Design consultation · Sept 2026"
              // 00571 bounds the regarding line at 200 characters.
              maxLength={200}
              className={INPUT}
            />
          </label>
        </>
      )}

      {(studioMode || projectId) && (
        <>
          {!studioMode && (
            <>
              {/* ── Milestones (00204) ─────────────────────────────────────── */}
              <div className="mt-4">
                <p className={`${LABEL} mb-0.5`}>
                  payment milestones · unbilled
                </p>
                {offerableMilestones.length > 0 ? (
                  offerableMilestones.map((m) => (
                    <label key={m.id} className={ROW}>
                      <input
                        type="checkbox"
                        className={CHECK}
                        checked={tickedMilestoneIds.has(m.id)}
                        onChange={(e) =>
                          setTickedMilestoneIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(m.id);
                            else next.delete(m.id);
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--color-charcoal)]">
                        {m.label}
                      </span>
                      <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                        {m.status === "outstanding" ? "due now" : "upcoming"}
                      </span>
                      <span className="font-mono text-[11px] text-[var(--color-charcoal)]">
                        {formatCurrency(m.amount_cents)}
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="py-1 text-[11px] italic text-[var(--text-muted)]">
                    Nothing unbilled — every milestone is on an invoice or paid.
                  </p>
                )}
              </div>

              {/* ── Unbilled time (00177 view — resolved rates, R75/BIL-08) ── */}
              <div className="mt-4">
                <p className={`${LABEL} mb-0.5`}>
                  unbilled time
                  {unbilledEntries.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setTickedTimeIds((prev) =>
                          prev.size === unbilledEntries.length
                            ? new Set()
                            : new Set(unbilledEntries.map((e) => e.id)),
                        )
                      }
                      className="ml-2 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--color-clay-ink)] hover:opacity-80"
                    >
                      {tickedTimeIds.size === unbilledEntries.length
                        ? "clear all"
                        : "tick all"}
                    </button>
                  )}
                </p>
                {timeLoading ? (
                  <p className="py-1 text-[11px] italic text-[var(--text-muted)]">
                    Reading the hours…
                  </p>
                ) : unbilledEntries.length > 0 ? (
                  <>
                    {unbilledEntries.map((entry) => (
                      <label key={entry.id} className={ROW}>
                        <input
                          type="checkbox"
                          className={CHECK}
                          checked={tickedTimeIds.has(entry.id)}
                          onChange={(e) =>
                            setTickedTimeIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(entry.id);
                              else next.delete(entry.id);
                              return next;
                            })
                          }
                        />
                        <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--color-charcoal)]">
                          {/* HT-21 — the composer names the person on every
                              row; unnamed only where the roster carries none
                              (the project's own designer, e.g.). */}
                          {entry.member_name && (
                            <span className="mr-1.5 text-[var(--color-clay-ink)]">
                              {entry.member_name} ·
                            </span>
                          )}
                          {fmtDay(entry.started_at)}
                          {entry.notes && (
                            <span className="ml-1.5 text-[var(--text-muted)]">
                              {entry.notes}
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                          {formatHoursLabel(entry.duration_minutes)} ·{" "}
                          {formatCurrency(entry.resolved_rate_cents)}/h
                        </span>
                        <span className="font-mono text-[11px] text-[var(--color-charcoal)]">
                          {formatCurrency(entry.amount_cents)}
                        </span>
                      </label>
                    ))}
                    <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                      ticked entries bill as one line, dated beneath, and lock
                      to the draft · voiding releases them
                    </p>
                  </>
                ) : ratePendingEntries.length === 0 ? (
                  <p className="py-1 text-[11px] italic text-[var(--text-muted)]">
                    No unbilled hours on this document.
                  </p>
                ) : null}

                {/* MS-01 / HT-26 — an hour nothing priced prints "rate pending",
                    not "$0.00/h · $0.00", and cannot be ticked. Invoicing one
                    would freeze a zero-dollar line under the 00177 invoiced
                    lock. The repair is the studio's rate card. */}
                {!timeLoading && ratePendingEntries.length > 0 && (
                  <>
                    {ratePendingEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className={`${ROW} opacity-60`}
                        data-rate-pending="true"
                      >
                        <input
                          type="checkbox"
                          className={CHECK}
                          checked={false}
                          disabled
                          readOnly
                          aria-label="This hour has no rate yet and cannot be invoiced"
                        />
                        <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--color-charcoal)]">
                          {entry.member_name && (
                            <span className="mr-1.5 text-[var(--color-clay-ink)]">
                              {entry.member_name} ·
                            </span>
                          )}
                          {fmtDay(entry.started_at)}
                          {entry.notes && (
                            <span className="ml-1.5 text-[var(--text-muted)]">
                              {entry.notes}
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                          {formatHoursLabel(entry.duration_minutes)} · rate
                          pending
                        </span>
                        <span className="font-mono text-[11px] text-[var(--text-muted)]">
                          rate pending
                        </span>
                      </div>
                    ))}
                    <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                      {ratePendingEntries.length === 1
                        ? "one hour has no rate yet"
                        : `${ratePendingEntries.length} hours have no rate yet`}{" "}
                      · they cannot be invoiced until the studio prices them ·{" "}
                      <Link
                        href="/desk?account=studio"
                        className="underline decoration-dotted underline-offset-4 hover:text-[var(--color-charcoal)]"
                      >
                        set the studio rate →
                      </Link>
                    </p>
                  </>
                )}
              </div>

              {/* ── FF&E (00187 coverage bridge, R76) ──────────────────────── */}
              <div className="mt-4">
                <p className={`${LABEL} mb-0.5`}>ff&amp;e · uninvoiced</p>
                {ffeSettled && ffePartition.billable.length > 0 && (
                  <div
                    role="radiogroup"
                    aria-label="Bill the ticked lines"
                    className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-charcoal)]"
                  >
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="ffe-stage"
                        className={CHECK}
                        checked={ffeStage === "full"}
                        onChange={() => setFfeStage("full")}
                      />
                      in full
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="ffe-stage"
                        className={CHECK}
                        checked={ffeStage === "deposit"}
                        onChange={() => setFfeStage("deposit")}
                      />
                      as a deposit of
                    </label>
                    <span className="flex items-center gap-1">
                      <input
                        aria-label="Deposit percent"
                        inputMode="decimal"
                        value={depositPctText}
                        disabled={ffeStage !== "deposit"}
                        onChange={(e) => setDepositPctText(e.target.value)}
                        className={`${INPUT} w-[56px] text-right disabled:opacity-50`}
                      />
                      %
                    </span>
                    {ffeStage === "deposit" && !depositPctValid && (
                      <span
                        role="alert"
                        className="font-mono uppercase tracking-[0.05em]"
                        style={{ color: TERRACOTTA_INK }}
                      >
                        a percent above 0, at most 100
                      </span>
                    )}
                  </div>
                )}
                {!ffeSettled ? (
                  <p className="py-1 text-[11px] italic text-[var(--text-muted)]">
                    Reading the schedule…
                  </p>
                ) : ffePartition.billable.length > 0 ? (
                  ffePartition.billable.map((it) => (
                    <label key={it.id} className={ROW}>
                      <input
                        type="checkbox"
                        className={CHECK}
                        checked={tickedFfeIds.has(it.id)}
                        onChange={(e) =>
                          setTickedFfeIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(it.id);
                            else next.delete(it.id);
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--color-charcoal)]">
                        {it.name}
                        {it.room?.name && (
                          <span className="ml-1.5 text-[var(--text-muted)]">
                            {it.room.name}
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                        ×{it.quantity ?? 1}
                      </span>
                      <span className="font-mono text-[11px] text-[var(--color-charcoal)]">
                        {ffeStage === "deposit" && depositPctValid && (
                          <span className="mr-1.5 text-[var(--text-muted)]">
                            deposit{" "}
                            {formatCurrency(
                              depositCents(
                                (it.quantity ?? 1) * (it.unit_price_cents ?? 0),
                                depositPct,
                              ),
                            )}{" "}
                            of
                          </span>
                        )}
                        {formatCurrency(
                          (it.quantity ?? 1) * (it.unit_price_cents ?? 0),
                        )}
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="py-1 text-[11px] italic text-[var(--text-muted)]">
                    Nothing uninvoiced — every priced line is billed.
                  </p>
                )}
                {/* C-31 — balances owed: a live deposit, no balance yet. */}
                {balanceOwed.length > 0 && (
                  <div className="mt-2" data-testid="composer-balances">
                    <p className={`${LABEL} mb-0.5`}>balances owed</p>
                    {balanceOwed.map((it) => {
                      const b = billing.get(it.id);
                      const price = lineClientPriceCents(it) ?? 0;
                      return (
                        <label key={it.id} className={ROW}>
                          <input
                            type="checkbox"
                            className={CHECK}
                            checked={tickedBalanceIds.has(it.id)}
                            onChange={(e) =>
                              setTickedBalanceIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(it.id);
                                else next.delete(it.id);
                                return next;
                              })
                            }
                          />
                          <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--color-charcoal)]">
                            {it.name}
                            <span className="ml-1.5 text-[var(--text-muted)]">
                              {(b?.slots ?? []).map(stageSlotWords).join(" · ")}
                            </span>
                          </span>
                          <span className="font-mono text-[11px] text-[var(--color-charcoal)]">
                            {formatCurrency(
                              balanceCents(price, b?.depositedCents ?? 0),
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {/* What every other line has had billed, and at which stage. */}
                {alreadyBilled.length > 0 && (
                  <details className="mt-1.5" data-testid="composer-billed">
                    <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                      {alreadyBilled.length} line
                      {alreadyBilled.length === 1 ? "" : "s"} already billed
                    </summary>
                    {alreadyBilled.map((it) => (
                      <p
                        key={it.id}
                        className="flex gap-2 py-0.5 text-[11px] text-[var(--text-muted)]"
                      >
                        <span className="min-w-0 flex-1 truncate">{it.name}</span>
                        <span className="font-mono">
                          {(billing.get(it.id)?.slots ?? [])
                            .map(stageSlotWords)
                            .join(" · ") || "invoiced"}
                        </span>
                      </p>
                    ))}
                  </details>
                )}
                {(skippedFfe.covered > 0 ||
                  skippedFfe.unpriced > 0 ||
                  ffePartition.unpriced.length > 0) && (
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                    {[
                      skippedFfe.covered > 0
                        ? `${skippedFfe.covered} asked-for item${skippedFfe.covered === 1 ? "" : "s"} already invoiced · skipped`
                        : null,
                      ffePartition.unpriced.length > 0
                        ? `${ffePartition.unpriced.length} unpriced line${ffePartition.unpriced.length === 1 ? "" : "s"} — set a client price to bill`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>

              {/* ── Purchases (C-25, 00703) — each its own line at cost ────── */}
              {offerablePurchases.length > 0 && (
                <div className="mt-4" data-testid="composer-purchases">
                  <p className={`${LABEL} mb-0.5`}>purchases · unbilled · at cost</p>
                  {offerablePurchases.map((p) => (
                    <AtCostRow
                      key={p.id}
                      id={p.id}
                      ticked={tickedPurchaseIds.has(p.id)}
                      onTick={(on) => setTickedPurchaseIds((prev) => toggled(prev, p.id, on))}
                      costCents={purchaseAtCostCents(p)}
                      override={overrides.get(p.id)}
                      onOverride={(text) => setOverrides((prev) => new Map(prev).set(p.id, text))}
                      label={p.description?.trim() || p.payee_name}
                      detail={`${p.description?.trim() ? `${p.payee_name} · ` : ""}${fmtDay(p.purchased_on)}`}
                    />
                  ))}
                  {doubleBilledPurchases > 0 && (
                    <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--color-aged-oak,#8B7355)]">
                      {doubleBilledPurchases === 1
                        ? "a ticked purchase was bought for a line this or another invoice bills"
                        : `${doubleBilledPurchases} ticked purchases were bought for lines this or another invoice bills`}{" "}
                      · billing both bills the piece twice
                    </p>
                  )}
                </div>
              )}

              {/* ── Riders (C-26, 00704) — each its own line at cost ────────── */}
              {offerableRiders.length > 0 && (
                <div className="mt-4" data-testid="composer-riders">
                  <p className={`${LABEL} mb-0.5`}>riders · unbilled · at cost</p>
                  {offerableRiders.map((r) => (
                    <AtCostRow
                      key={r.id}
                      id={r.id}
                      ticked={tickedRiderIds.has(r.id)}
                      onTick={(on) => setTickedRiderIds((prev) => toggled(prev, r.id, on))}
                      costCents={riderAtCostCents(r)}
                      override={overrides.get(r.id)}
                      onOverride={(text) => setOverrides((prev) => new Map(prev).set(r.id, text))}
                      label={riderLabel(r)}
                      detail={
                        [
                          r.purchase_order?.po_number ? `PO ${r.purchase_order.po_number}` : null,
                          r.actual_cents === null && r.estimate_cents !== null ? "estimate" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Ad-hoc lines ───────────────────────────────────────────── */}
          <div className="mt-4">
            <p className={`${LABEL} mb-1`}>ad-hoc lines</p>
            {adhoc.map((line, i) => (
              <div
                key={i}
                className="mb-1.5 grid grid-cols-[1fr_56px_96px_24px] items-center gap-2"
              >
                <input
                  placeholder="Description — e.g. design consultation"
                  aria-label="Line description"
                  value={line.description}
                  onChange={(e) =>
                    setAdhoc((prev) =>
                      prev.map((l, j) =>
                        j === i ? { ...l, description: e.target.value } : l,
                      ),
                    )
                  }
                  className={INPUT}
                />
                <input
                  placeholder="Qty"
                  aria-label="Quantity"
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(e) =>
                    setAdhoc((prev) =>
                      prev.map((l, j) =>
                        j === i ? { ...l, quantity: e.target.value } : l,
                      ),
                    )
                  }
                  className={`${INPUT} text-right`}
                />
                <input
                  placeholder="Unit $"
                  aria-label="Unit price (dollars)"
                  inputMode="decimal"
                  value={line.unitDollars}
                  onChange={(e) =>
                    setAdhoc((prev) =>
                      prev.map((l, j) =>
                        j === i ? { ...l, unitDollars: e.target.value } : l,
                      ),
                    )
                  }
                  className={`${INPUT} text-right`}
                />
                <button
                  type="button"
                  aria-label="Remove line"
                  onClick={() =>
                    setAdhoc((prev) => prev.filter((_, j) => j !== i))
                  }
                  className="text-[13px] text-[var(--text-muted)] hover:text-[var(--color-terracotta-ink)]"
                >
                  ×
                </button>
              </div>
            ))}
            <DocumentAction
              actionKey="add-invoice-line"
              surfaceKey="accounts"
              regionKey="invoice-lines"
              variant="secondary"
              onClick={() => setAdhoc((prev) => [...prev, { ...EMPTY_ADHOC }])}
              className="mt-1"
            >
              Add line
            </DocumentAction>
          </div>

          {/* ── Terms ──────────────────────────────────────────────────── */}
          <div className="mt-4 grid max-w-[420px] grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-0.5">
              <span className={LABEL}>tax rate (%)</span>
              <input
                inputMode="decimal"
                value={taxRatePercent}
                onChange={(e) => setTaxRatePercent(e.target.value)}
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className={LABEL}>terms (net days)</span>
              <input
                inputMode="numeric"
                value={termsDays}
                onChange={(e) => setTermsDays(e.target.value)}
                className={INPUT}
              />
            </label>
          </div>
          <label className="mt-2.5 flex flex-col gap-0.5">
            <span className={LABEL}>memo · shown to the client</span>
            <textarea
              rows={2}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Thank you…"
              className={`${INPUT} w-full resize-none`}
            />
          </label>

          {/* ── Running totals + the act ───────────────────────────────── */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-pearl)] pt-3">
            <div className="flex items-baseline gap-4">
              <span className="flex items-baseline gap-1.5">
                <span className={LABEL}>subtotal</span>
                <span className="font-mono text-[11px] text-[var(--color-charcoal)]">
                  {formatCurrency(totals.subtotalCents)}
                </span>
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className={LABEL}>tax</span>
                <span className="font-mono text-[11px] text-[var(--color-charcoal)]">
                  {formatCurrency(totals.taxCents)}
                </span>
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className={LABEL}>total</span>
                <span className="font-mono text-[12px] font-semibold text-[var(--color-charcoal)]">
                  {formatCurrency(totals.totalCents)}
                </span>
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                {lineCount} line{lineCount === 1 ? "" : "s"}
              </span>
            </div>
            <DocumentAction
              actionKey="draft-invoice"
              surfaceKey="accounts"
              regionKey="invoice-composer"
              variant="primary"
              disabled={!canDraft}
              loading={creating}
              loadingLabel="Drafting…"
              onClick={() => void draft()}
            >
              Draft the invoice
            </DocumentAction>
          </div>

          {studioMissing && (
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
              no studio to draw from · this account belongs to none yet
            </p>
          )}

          {/* R83 — the inline failure band, at the act site. */}
          {error && (
            <div
              className="mt-2 rounded-[3px] border border-[rgba(196,131,111,0.4)] px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.05em]"
              style={{ color: TERRACOTTA_INK }}
            >
              {error}
              <DocumentActionGroup
                surfaceKey="accounts"
                regionKey="invoice-draft-error"
                className="mt-2"
              >
                <DocumentAction
                  actionKey="retry-draft-invoice"
                  variant="primary"
                  onClick={() => void draft()}
                >
                  Try again
                </DocumentAction>
              </DocumentActionGroup>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function toggled(prev: Set<string>, id: string, on: boolean): Set<string> {
  const next = new Set(prev);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

/**
 * One purchase or rider: tick to bill it on its own line. The billed figure
 * starts at cost and can be overwritten (R-PB7); cost stays beside it, so
 * the studio sees both. No figure (a rider with neither estimate nor actual)
 * holds the Draft act until one is typed.
 */
function AtCostRow({
  id,
  ticked,
  onTick,
  costCents,
  override,
  onOverride,
  label,
  detail,
}: {
  id: string;
  ticked: boolean;
  onTick: (on: boolean) => void;
  costCents: number | null;
  override: string | undefined;
  onOverride: (text: string) => void;
  label: string;
  detail: string;
}) {
  const text = override ?? centsToDollarText(costCents);
  const invalid = ticked && parseOverrideCents(text) === null;
  return (
    <div className={`${ROW} cursor-default`} data-at-cost-row={id}>
      <input
        type="checkbox"
        className={CHECK}
        checked={ticked}
        aria-label={`Bill ${label}`}
        onChange={(e) => onTick(e.target.checked)}
      />
      <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--color-charcoal)]">
        {label}
        {detail && (
          <span className="ml-1.5 text-[var(--text-muted)]">{detail}</span>
        )}
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
        cost {costCents === null ? "—" : formatCurrency(costCents)}
      </span>
      <input
        aria-label={`Billed amount · ${label}`}
        aria-invalid={invalid || undefined}
        inputMode="decimal"
        placeholder="Billed $"
        value={text}
        onChange={(e) => onOverride(e.target.value)}
        className={`${INPUT} w-[96px] text-right`}
        style={invalid ? { borderColor: TERRACOTTA_INK } : undefined}
      />
    </div>
  );
}
