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

import { usePathname, useRouter } from "next/navigation";
import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  useAddInvoiceBillingLines,
  useDocumentClientLinkHold,
  InvoiceBillingGapError,
  useCreateDraftInvoice,
  useCreateDraftStudioInvoice,
  useStampProjectPricingStudio,
  useDeleteDraftInvoice,
  useFfeInvoiceCoverage,
  useFfeInvoiceStageCoverage,
  useProjectPoCostLines,
  useOrganizationMembers,
  useOrganizations,
  useStudiosEmployingMember,
  useSessionUserId,
  useProjectFFEItems,
  useProjectRoster,
  useProjectInvoices,
  useProjectPaymentMilestones,
  useProjects,
  useClaimTimeEntries,
  useSetLaborLinePrice,
  useStudioPurchases,
  useUnbilledTime,
} from "@patina/supabase";
import { computeInvoiceTotals, formatCurrency } from "@patina/shared";
import { formatHoursLabel } from "@/lib/time-billing";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import {
  selectViewerStudioId,
  useViewerStudio,
} from "@/hooks/use-viewer-studio";
import { ClientPicker } from "@/components/portal/client-picker";
import { documentEvents } from "@/lib/analytics/document-events";
import {
  FOCUS_FFE_LINE_EVENT,
  OPEN_HOUSEHOLD_SHEET_EVENT,
  focusFfeLinePending,
  parkInvoiceComposer,
  parkedInvoiceComposer,
  unparkInvoiceComposer,
  type FocusFfeLineRequest,
} from "@/lib/document/registry";
import { buildRoomHref } from "@/lib/document/pieces/build-room-url";
import { parseRough } from "@/lib/document/pieces/rough-in-keys";
import { isLaborLine } from "@/lib/document/stamp-derivation";
import type { SpotlightHold } from "@/lib/document/spotlight/use-hold-spotlight";
import { MESSAGE_WITHHELD } from "@/lib/document/act-names";
import { topActiveModalDialog } from "../overlays/active-dialog";
import { DocumentAction, DocumentActionGroup } from "../document-action";
import { ActFailLine } from "@/components/feedback/act-fail-line";
import { openAccountPage } from "../account/open-account-page";
import { CopyAct } from "../copy-act";
import { AppError } from "@/lib/error-handler";
import {
  EMPTY_ADHOC,
  STUDIO_TARGET,
  activeDesignStudios,
  balanceCents,
  billingRefusal,
  balanceOwedItems,
  buildBillingLines,
  depositCents,
  lineClientPriceCents,
  assessInvoiceReadiness,
  buildComposerLines,
  deriveInvoiceBillingGap,
  draftInvoiceRefusal,
  centsToDollarText,
  dollarsToCents,
  isValidDepositPct,
  lineBillingByItem,
  parseOverrideCents,
  partitionFfeBillable,
  purchaseAtCostCents,
  refusedBillingLines,
  riderAtCostCents,
  riderLabel,
  stageSlotWords,
  stampStudioRefusal,
  studioInvoiceBlocker,
  unbilledMilestones,
  unbilledPurchases,
  unbilledRiders,
  unfilledAllowanceText,
  type ComposerAdhocRow,
  type ComposerFfeItem,
  type ComposerMilestone,
  type ComposerPurchase,
  type ComposerRider,
  type ComposerStageSlot,
  type ComposerStudio,
  type InvoiceBillingGap,
  type ParkedInvoiceComposer,
  type StudioInvoiceBlocker,
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
  onClose,
}: {
  context: InvoiceComposerContext;
  /** Puts the composer away; Price it parks it first (K7). */
  onClose?: () => void;
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

  const { data: projects, dataUpdatedAt: projectsUpdatedAt = 0 } =
    useProjects();
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
  const { data: riders, isLoading: ridersLoading } = useProjectPoCostLines(
    projectId || null,
  );
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
  // K13 — reopened on a project it parked from (Price it), the composer comes
  // back as it left. An opener that asks for lines of its own starts fresh.
  const [parked] = useState<ParkedInvoiceComposer | null>(() =>
    context.projectId && !asksForLines(context)
      ? parkedInvoiceComposer(context.projectId)
      : null,
  );
  const [tickedMilestoneIds, setTickedMilestoneIds] = useState<Set<string>>(
    () => new Set(parked?.milestoneIds),
  );
  const [tickedTimeIds, setTickedTimeIds] = useState<Set<string>>(
    () => new Set(parked?.timeEntryIds),
  );
  const [tickedFfeIds, setTickedFfeIds] = useState<Set<string>>(
    () => new Set(parked?.ffeItemIds),
  );
  // C-31 — the ticked FF&E group bills in full, or as a deposit of X%.
  const [ffeStage, setFfeStage] = useState<"full" | "deposit">(
    parked?.ffeStage ?? "full",
  );
  const [depositPctText, setDepositPctText] = useState(
    parked?.depositPctText ?? "50",
  );
  const [tickedBalanceIds, setTickedBalanceIds] = useState<Set<string>>(
    () => new Set(parked?.balanceItemIds),
  );
  const [tickedPurchaseIds, setTickedPurchaseIds] = useState<Set<string>>(
    () => new Set(parked?.purchaseIds),
  );
  const [tickedRiderIds, setTickedRiderIds] = useState<Set<string>>(
    () => new Set(parked?.riderIds),
  );
  // R-PB7 overrides, by purchase / rider id; absent = bill at cost.
  const [overrides, setOverrides] = useState<Map<string, string>>(
    () => new Map(parked?.overrides),
  );
  const [adhoc, setAdhoc] = useState<ComposerAdhocRow[]>(
    () => parked?.adhoc ?? [{ ...EMPTY_ADHOC }],
  );
  // Studio mode's own three fields (S4 · S12 · S8).
  const [studioClientId, setStudioClientId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [chosenStudioId, setChosenStudioId] = useState("");
  const [taxRatePercent, setTaxRatePercent] = useState(
    parked?.taxRatePercent ?? "0",
  );
  const [termsDays, setTermsDays] = useState(parked?.termsDays ?? "15");
  const [memo, setMemo] = useState(parked?.memo ?? "");
  // Set by Price it, so leaving keeps the parked work; any other way out
  // (drafting, discarding) clears it.
  const parkingRef = useRef(false);
  useEffect(() => {
    const parkedFor = context.projectId;
    if (!parkedFor) return;
    // Re-asserted for a remount that reran the cleanup below.
    if (parked) parkInvoiceComposer(parkedFor, parked);
    else unparkInvoiceComposer(parkedFor);
    return () => {
      if (!parkingRef.current) unparkInvoiceComposer(parkedFor);
    };
  }, [context.projectId, parked]);
  // `retryable` is decided where the failure is caught: only a transient
  // failure before anything was written may be tried again (act-fail-line.tsx
  // §money writes). `gap` marks a billing-gap refusal, which clears itself once
  // the gap does.
  const [error, setError] = useState<{
    message: string;
    retryable: boolean;
    gap?: InvoiceBillingGap;
  } | null>(null);
  // The billing writer's refusal of one named line, by its subject id: shown
  // beside that line, which the refusal unticked.
  const [refusedLines, setRefusedLines] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [heldBlocker, setHeldBlocker] = useState<ComposerBlocker | null>(null);
  // The server's word on a gap the cached project hides. It stands until the
  // project changes, or a projects read newer than the refusal shows the gap
  // filled — never merely because the stale cache still looks complete.
  const [billingGapOverride, setBillingGapOverride] = useState<{
    projectId: string;
    gap: InvoiceBillingGap;
    seenAt: number;
  } | null>(null);
  const [nameStudioError, setNameStudioError] = useState<string | null>(null);
  // K12 — Name studio asks once, inline, before it stamps.
  const [confirmingName, setConfirmingName] = useState(false);
  const statusId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const forSelectRef = useRef<HTMLSelectElement>(null);
  const householdRef = useRef<HTMLDivElement>(null);
  const regardingRef = useRef<HTMLInputElement>(null);
  const depositPctRef = useRef<HTMLInputElement>(null);
  const nameStudioRef = useRef<HTMLButtonElement>(null);
  const confirmNameRef = useRef<HTMLButtonElement>(null);
  const askNoteRef = useRef<HTMLSpanElement>(null);
  const askRateNoteRef = useRef<HTMLSpanElement>(null);
  const supportAddressRef = useRef<HTMLSpanElement>(null);
  const draftActRef = useRef<HTMLButtonElement>(null);
  // The project whose Link a client opened the household sheet, which hands
  // focus back to it.
  const linkingClientRef = useRef<string | null>(null);
  const pathname = usePathname();
  const viewerId = useSessionUserId();

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
  const stampProjectStudio = useStampProjectPricingStudio();
  // F8 — the studio this viewer answers for, chosen the way hours-ledger's
  // stamp door chooses it (one choice keys every surface).
  const { studio: viewerStudio, candidates: viewerStudios } = useViewerStudio();
  // Someone above her can name it: she holds a seat that is not her own studio.
  const hasStudioOwner = studios.some((studio) => {
    const role = studio.membership?.role;
    return !!role && role !== "owner" && role !== "admin";
  });
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
  const pricedHoursLabelRef = useRef<HTMLParagraphElement>(null);
  const ratePendingEntries = useMemo(
    () =>
      (unbilledTime?.ratePendingEntries ?? []).map((entry) => ({
        ...entry,
        member_name: memberNames.get(entry.user_id) ?? null,
      })),
    [unbilledTime, memberNames],
  );

  const ratePendingMinutes = useMemo(
    () =>
      ratePendingEntries.reduce(
        (total, entry) => total + entry.duration_minutes,
        0,
      ),
    [ratePendingEntries],
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
      // K7 — an asked-for unpriced piece arrives ticked and holds the draft.
      const billableIds = new Set(
        [...ffePartition.billable, ...ffePartition.unpriced].map((i) => i.id),
      );
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
    setRefusedLines(new Map());
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
  const billingFiguresMissing = billingLines.some(
    (l) => l.amountCents === null,
  );
  const depositBlocked =
    ffeStage === "deposit" && tickedFfeIds.size > 0 && !depositPctValid;
  // R8/R9 — warned, never blocked: a purchase bought for a line whose client
  // price this invoice also bills, or a non-void invoice already bills
  // (SQ-448: any live slot), bills that piece twice.
  const doubleBilledPurchases = useMemo(() => {
    const billedLines = new Set([
      ...tickedFfeIds,
      ...tickedBalanceIds,
      ...billing.keys(),
    ]);
    return offerablePurchases.filter(
      (p) =>
        tickedPurchaseIds.has(p.id) &&
        !!p.ffe_item_id &&
        billedLines.has(p.ffe_item_id),
    ).length;
  }, [
    offerablePurchases,
    tickedPurchaseIds,
    tickedFfeIds,
    tickedBalanceIds,
    billing,
  ]);
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
  const overrideGap =
    billingGapOverride?.projectId === projectId ? billingGapOverride.gap : null;
  const billingGap = !studioMode
    ? (overrideGap ?? deriveInvoiceBillingGap(selectedProject))
    : null;
  useEffect(() => {
    if (!billingGapOverride) return;
    const filled =
      billingGapOverride.gap === "no-client"
        ? selectedProject?.client_id != null
        : selectedProject?.studio_id != null;
    if (
      billingGapOverride.projectId !== projectId ||
      (projectsUpdatedAt > billingGapOverride.seenAt && filled)
    ) {
      setBillingGapOverride(null);
    }
  }, [billingGapOverride, projectId, projectsUpdatedAt, selectedProject]);
  // Once the client is linked, Link a client unmounts with its gap row, so the
  // sheet's put-back finds no opener and focus falls to the page. Land on the
  // Draft act instead — after the sheet is put back (it may still lie above
  // the composer), and never over focus that already went somewhere live.
  useEffect(() => {
    if (!linkingClientRef.current) return;
    // Another project's gap is not this link landing.
    if (linkingClientRef.current !== projectId) {
      linkingClientRef.current = null;
      return;
    }
    if (billingGap === "no-client") return;
    linkingClientRef.current = null;
    let frame = 0;
    const land = () => {
      const root = containerRef.current;
      const top = topActiveModalDialog();
      if (root && top && !top.contains(root)) return;
      observer.disconnect();
      frame = window.requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active && active !== document.body && active.isConnected) return;
        // A studio still missing: land on its fix when this viewer has one.
        (nameStudioRef.current ?? draftActRef.current)?.focus();
      });
    };
    // DocSheet portals into <body>, so its put-back is a body child removed.
    const observer = new MutationObserver(land);
    observer.observe(document.body, { childList: true });
    land();
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [billingGap, projectId]);

  const isLead =
    !!viewerId && !!selectedProject && selectedProject.designer_id === viewerId;
  // K5 (00796) — set_document_client answers to the lead or an owner/admin of
  // the project's studio; can_link_document_client is that same predicate.
  // The lead is always admitted, so only anyone else waits on the read.
  const { data: linkHold } = useDocumentClientLinkHold(
    billingGap === "no-client" && !isLead ? projectId : null,
  );
  const canLinkClient = isLead || linkHold === null;
  // SQ-1069 — the lead holds no seat in the studio any more. The setter and
  // reassign_project_lead both refuse this project, so only support can move it.
  const leadLeftStudio =
    billingGap === "no-client" && !isLead && linkHold === "lead_not_in_studio";
  const leadName: string =
    selectedProject?.designer?.display_name ||
    selectedProject?.designer?.full_name ||
    "the lead designer";
  // K8 — the rate-pending group's fix. Rates are set by an owner/admin of the
  // project's pricing studio. She may answer for another studio she owns (00295
  // gives every designer a one-person workspace), so Set switches her to the
  // pricing studio before opening the Account page, whose rate fields follow it.
  const pricingStudioId = selectedProject?.studio_id ?? null;
  const canSetRates =
    !!pricingStudioId &&
    viewerStudios.some((studio) => studio.id === pricingStudioId);
  // One fix per person; the roster leaves the project's own designer unnamed.
  const ratePendingMembers = useMemo(() => {
    const names = new Map<string, string | null>();
    for (const entry of ratePendingEntries) {
      if (names.has(entry.user_id)) continue;
      names.set(
        entry.user_id,
        entry.member_name ??
          (entry.user_id === selectedProject?.designer_id ? leadName : null),
      );
    }
    return [...names].map(([userId, name]) => ({ userId, name }));
  }, [ratePendingEntries, selectedProject?.designer_id, leadName]);
  const { data: pricingStudioMembers } = useOrganizationMembers(
    ratePendingEntries.length > 0 && !canSetRates && selectedProject?.studio_id
      ? selectedProject.studio_id
      : "",
  );
  const pricingStudioOwner = (pricingStudioMembers ?? []).find(
    (member: AnyRecord) => member.role === "owner" && member.status === "active",
  );
  const rateOwnerName: string =
    pricingStudioOwner?.profiles?.display_name ||
    pricingStudioOwner?.profiles?.full_name ||
    "your studio owner";
  const rateNote = askRateNote(
    selectedProject?.name ?? "this project",
    ratePendingMembers.flatMap((member) => (member.name ? [member.name] : [])),
  );
  // F8 — stamp_project_pricing_studio (00606) names a studio only for its
  // owner or admin, and only one that EMPLOYS the designer (an active seat that
  // is neither guest nor owner). The rate-card condition it also checks is not
  // readable here; that refusal comes back through ActFailLine. SQ-1091 — she
  // may own or administer more than the studio she answers for (00295 gives
  // every designer a one-person workspace), so the naming studio is the first of
  // them that employs the lead.
  const { data: employingStudioIds } = useStudiosEmployingMember(
    billingGap === "no-studio" ? viewerStudios.map((studio) => studio.id) : [],
    selectedProject?.designer_id ?? null,
  );
  const namingStudio =
    billingGap === "no-studio"
      ? (viewerStudios.find((studio) =>
          (employingStudioIds ?? []).includes(studio.id),
        ) ?? null)
      : null;
  const canNameStudio = !!namingStudio && !!projectId;
  const { data: viewerStudioMembers } = useOrganizationMembers(
    billingGap === "no-studio" && viewerStudio ? viewerStudio.id : "",
  );
  // R173 — a solo owner (the only active non-guest seat in the one studio she
  // holds) on a project opened before it had a studio. The server keeps that
  // project closed to her (HT-3-g(3)), so the only fix is support's.
  const seatedMembers = (viewerStudioMembers ?? []).filter(
    (member: AnyRecord) =>
      member.status === "active" && member.role !== "guest",
  );
  const soloOwnerUnstamped =
    billingGap === "no-studio" &&
    isLead &&
    !!viewerStudio &&
    studios.length === 1 &&
    studios[0].id === viewerStudio.id &&
    studios[0].membership?.role === "owner" &&
    seatedMembers.length === 1 &&
    seatedMembers[0].user_id === viewerId;
  useEffect(() => setConfirmingName(false), [projectId]);

  // §A5 — the first unmet requirement; the held act names it and lands on it.
  const { holds } = assessInvoiceReadiness({
    clientLinked: !projectId || billingGap !== "no-client",
    canLinkClient,
    clientLinkHold: linkHold ?? null,
    projectExists: !!projectId,
    pricingStudioLinked: billingGap !== "no-studio",
    canNameStudio,
    soloOwnerUnstamped,
    selectedAnything: studioMode || !projectId || lineCount > 0,
    selectedRatePendingEntries: ratePendingEntries
      .filter((entry) => tickedTimeIds.has(entry.id))
      .map((entry) => ({ userId: entry.user_id, memberName: entry.member_name })),
    // K7 — a ticked unpriced piece holds the draft; it never bills at $0.
    selectedUnpricedLineIds: ffePartition.unpriced
      .filter((item) => tickedFfeIds.has(item.id))
      .map((item) => item.id),
    unpricedLineNames: Object.fromEntries(
      ffePartition.unpriced.map((item) => [item.id, item.name]),
    ),
    noClientReason: blockerReason("no-client", {
      projectName: selectedProject?.name ?? "This project", canLinkClient, leadLeftStudio, leadName,
      canNameStudio, soloOwnerUnstamped, hasStudioOwner, studioLoading: organizationsLoading,
    }),
    noStudioReason: blockerReason("no-studio", {
      projectName: selectedProject?.name ?? "This project", canLinkClient, leadLeftStudio, leadName,
      canNameStudio, soloOwnerUnstamped, hasStudioOwner, studioLoading: organizationsLoading,
    }),
  });
  const readinessBlocker: ComposerBlocker | null =
    holds[0]?.kind === "nothing-selected" ? "lines" : holds[0]?.kind ?? null;
  const blocker: ComposerBlocker | null = readinessBlocker ?? (studioMode
    ? studioInvoiceBlocker({ clientId: studioClientId, title, studioId, lines })
    : !projectId
      ? "no-project"
      : lineCount === 0
        ? "lines"
        : depositBlocked
          ? "deposit"
          : billingFiguresMissing
            ? "billing-figures"
            : prefillPending
              ? "prefill"
              : null);
  const canDraft = blocker === null && !creating;
  // F11 — a reason outlives its blocker by not one render.
  useEffect(() => {
    if (heldBlocker && heldBlocker !== blocker) setHeldBlocker(null);
  }, [heldBlocker, blocker]);
  useEffect(() => {
    if (error?.gap && billingGap !== error.gap) setError(null);
  }, [error, billingGap]);
  const heldReason = heldBlocker
    ? holds.find((hold) => hold.kind === heldBlocker)?.reason ?? blockerReason(heldBlocker, {
        projectName: selectedProject?.name ?? "This project",
        canLinkClient,
        leadLeftStudio,
        leadName,
        canNameStudio,
        soloOwnerUnstamped,
        hasStudioOwner,
        studioLoading: organizationsLoading,
      })
    : null;

  // K1 — pressing the held Draft opens one window per hold. R186: a window
  // spans its reason and its fix, so the fix stays live inside it. A readiness
  // hold finds its window from its own key, never a prefix (another hold's row
  // would match too); the composer's own holds name theirs directly.
  const holdRegion = (el: Element | null | undefined): HTMLElement | null =>
    el?.closest<HTMLElement>("[data-hold-region]") ??
    (el instanceof HTMLElement ? el : null);
  const keyedRegion = (key: string) => () =>
    holdRegion(
      containerRef.current?.querySelector(`[data-focus-key="${key}"]`),
    );
  const spotlightHolds: SpotlightHold[] = [];
  for (const hold of holds) {
    // One window holds every designer's rate-pending hours.
    const pending =
      hold.kind === "rate-pending"
        ? spotlightHolds.find((spot) => spot.id === "rate-pending")
        : undefined;
    if (pending) {
      pending.reason = `${pending.reason} ${hold.reason}`;
      continue;
    }
    spotlightHolds.push({
      id: hold.kind === "rate-pending" ? "rate-pending" : hold.focusKey,
      label: hold.repair,
      reason: hold.reason,
      target: keyedRegion(hold.focusKey),
    });
  }
  const ownHold = (
    kind: ComposerBlocker,
    label: string,
    target: () => Element | null | undefined,
  ) =>
    spotlightHolds.push({
      id: kind,
      label,
      reason: blockerReason(kind, {
        projectName: selectedProject?.name ?? "This project",
        canLinkClient,
        leadLeftStudio,
        leadName,
        canNameStudio,
        soloOwnerUnstamped,
        hasStudioOwner,
        studioLoading: organizationsLoading,
      }),
      target: () => {
        const el = target();
        return el instanceof HTMLElement ? el : null;
      },
    });
  // A missing studio in studio mode and a loading prefill have no fix here.
  if (studioMode) {
    if (!studioClientId)
      ownHold("household", "Household", () => householdRef.current);
    if (!title.trim())
      ownHold("regarding", "Regarding", () =>
        regardingRef.current?.closest("label"),
      );
    if (lines.length === 0)
      ownHold("lines", "Add a line", keyedRegion("invoice-lines"));
  } else if (!projectId) {
    ownHold(
      "no-project",
      "Choose a project",
      () => forSelectRef.current?.parentElement,
    );
  } else {
    if (depositBlocked)
      ownHold("deposit", "Deposit", () =>
        depositPctRef.current?.closest('[role="radiogroup"]'),
      );
    if (billingFiguresMissing)
      ownHold("billing-figures", "Billed amount", () =>
        containerRef.current
          ?.querySelector('[data-at-cost-row] input[aria-invalid="true"]')
          ?.closest("[data-at-cost-row]"),
      );
  }
  // The lines hold's key marks the first unfilled row, then Add line.
  const firstUnfilledAdhoc = adhoc.findIndex(
    (line) =>
      !line.description.trim() || !(dollarsToCents(line.unitDollars) > 0),
  );
  const askFocusKey = holds.find(
    (hold) => hold.kind === billingGap && hold.fixer === "ask",
  )?.focusKey;

  // F5 — a refusal names its purchase, rider or line by the label printed here.
  const billingSubjectName = (id: string): string | null => {
    const purchase = ((purchases ?? []) as ComposerPurchase[]).find(
      (p) => p.id === id,
    );
    if (purchase) return purchase.description?.trim() || purchase.payee_name;
    const rider = ((riders ?? []) as ComposerRider[]).find((r) => r.id === id);
    if (rider) return riderLabel(rider);
    return (
      ((ffeItems ?? []) as ComposerFfeItem[]).find((i) => i.id === id)?.name ??
      null
    );
  };

  const draft = async () => {
    setError(null);
    setRefusedLines(new Map());

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
          draftInvoiceRefusal((e as { message?: unknown } | null)?.message),
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
      // create_draft_invoice refuses in its own words; say it in the composer's.
      const failure: ReturnType<typeof preWriteFailure> =
        e instanceof InvoiceBillingGapError
          ? preWriteFailure(e)
          : draftInvoiceRefusal((e as { message?: unknown } | null)?.message);
      if (failure.gap) {
        setBillingGapOverride({
          projectId,
          gap: failure.gap,
          seenAt: projectsUpdatedAt,
        });
      }
      setError(failure);
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
        const reason = billingRefusal("claim", e).sentence;
        // A money write already ran: never offered again from here.
        setError({
          message: stranded
            ? `${reason} Nothing was billed; the draft still holds those hours. Void it to release them.`
            : `${reason} Nothing was billed.`,
          retryable: false,
        });
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
        // The writer's refusal arrives as a PostgrestError, not an Error, and in
        // the RPC's own words; say it in the composer's, naming the subject.
        const reason = billingRefusal("lines", e, billingSubjectName).sentence;
        // With the draft gone, a refusal that names its line unticks just that
        // line and says why beside it; Draft again bills the rest. A kept draft
        // must be cleared first, so its refusal stays at the act.
        const refused = stranded ? [] : refusedBillingLines(e, billingLines);
        if (refused.length > 0) {
          const notes = new Map<string, string>();
          for (const { request } of refused) {
            const id =
              "purchaseId" in request
                ? request.purchaseId
                : "costLineId" in request
                  ? request.costLineId
                  : request.ffeItemId;
            notes.set(id, `${reason} Nothing was billed.`);
            const untick = (prev: Set<string>) => toggled(prev, id, false);
            if ("purchaseId" in request) setTickedPurchaseIds(untick);
            else if ("costLineId" in request) setTickedRiderIds(untick);
            else if (request.stage === "deposit") setTickedFfeIds(untick);
            else setTickedBalanceIds(untick);
          }
          setRefusedLines(notes);
          return;
        }
        setError({
          message: stranded
            ? `${reason} Nothing was billed; the draft was kept. Delete or void it.`
            : `${reason} Nothing was billed.`,
          retryable: false,
        });
        return;
      }
    }

    onDrafted(invoice.id as string, projectId);
  };

  const skippedFfe = useMemo(() => {
    const wanted = new Set(context.initialFfeItemIds ?? []);
    if (wanted.size === 0) return { covered: 0 };
    return {
      covered: ffePartition.covered.filter((i) => wanted.has(i.id)).length,
    };
  }, [context.initialFfeItemIds, ffePartition]);

  // ── K7 — pricing an unpriced piece ────────────────────────────────────────
  // A labor line takes its client price here, through the Price lens's own
  // writer; any other line is priced in the Price lens, so the composer parks.
  const laborPrice = useSetLaborLinePrice();
  const [laborPriceNotes, setLaborPriceNotes] = useState<
    ReadonlyMap<string, string>
  >(() => new Map());
  const setLaborPriceNote = (itemId: string, note: string | null) =>
    setLaborPriceNotes((prev) => {
      if (note === null && !prev.has(itemId)) return prev;
      const next = new Map(prev);
      if (note === null) next.delete(itemId);
      else next.set(itemId, note);
      return next;
    });
  const priceLaborLine = (item: ComposerFfeItem, cents: number) => {
    setLaborPriceNote(item.id, null);
    laborPrice.mutate(
      { projectId, itemId: item.id, unitPriceCents: cents },
      {
        onError: (cause: unknown) =>
          setLaborPriceNote(
            item.id,
            (cause instanceof Error && cause.message) ||
              `The client price on ${item.name} was not saved. Try again.`,
          ),
      },
    );
  };
  const router = useRouter();
  const priceLensHref = projectId
    ? buildRoomHref(projectId, { lens: "price", room: null })
    : "";
  const priceInPriceLens = (item: ComposerFfeItem) => {
    parkInvoiceComposer(projectId, {
      milestoneIds: [...tickedMilestoneIds],
      timeEntryIds: [...tickedTimeIds],
      ffeItemIds: [...tickedFfeIds],
      ffeStage,
      depositPctText,
      balanceItemIds: [...tickedBalanceIds],
      purchaseIds: [...tickedPurchaseIds],
      riderIds: [...tickedRiderIds],
      overrides: [...overrides],
      adhoc,
      taxRatePercent,
      termsDays,
      memo,
    });
    parkingRef.current = true;
    const request: FocusFfeLineRequest = { itemId: item.id, cell: "price" };
    focusFfeLinePending.request = request;
    onClose?.();
    // A Price lens already open answers at once; one not yet mounted takes
    // the pending request when it mounts. The Document's own Pieces region
    // must never hear it, so the event fires only inside the Build room.
    if (pathname === `/doc/${projectId}/pieces`) {
      window.dispatchEvent(
        new CustomEvent(FOCUS_FFE_LINE_EVENT, { detail: request }),
      );
    }
    router.push(priceLensHref);
  };

  // ── The sheet ─────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef}>
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
            ref={forSelectRef}
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
                {p.client_id == null ? " — no client yet" : ""}
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

          <div ref={householdRef} className="mt-4 max-w-[360px]">
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
              ref={regardingRef}
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
          {/* K1 — the lines hold's window: every line a draft can carry. */}
          <div data-hold-region="invoice-lines">
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
                {/* Where focus lands when the rate sheet closes after pricing:
                    the Set act that opened it has unmounted, and the priced
                    hours now list under this label. */}
                <p ref={pricedHoursLabelRef} tabIndex={-1} className={`${LABEL} mb-0.5`}>
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
                  // K1 — the rate-pending hold's window: the hours and their fix.
                  <div data-hold-region="rate-pending">
                    {ratePendingEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className={`${ROW} opacity-60`}
                        data-rate-pending="true"
                        data-focus-key={`rate-pending:${entry.user_id}`}
                        tabIndex={-1}
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
                      {formatHoursLabel(ratePendingMinutes)} waiting for a rate
                      · they cannot be invoiced until the studio prices them
                    </p>
                    {/* K8 — with no pricing studio there is no rate to set;
                        the studio hold below names that fix. */}
                    {selectedProject?.studio_id &&
                      (canSetRates ? (
                        <div className="flex flex-wrap gap-x-3">
                          {ratePendingMembers.map((member) => (
                            // The Account sheet opens over the composer, onto
                            // this member's rate field; the address is the
                            // same sheet's doorway.
                            <DocumentAction
                              key={member.userId}
                              href="/desk?account=studio"
                              actionKey="set-member-rate"
                              surfaceKey="accounts"
                              regionKey="invoice-composer"
                              variant="tertiary"
                              onClick={(e) => {
                                e.preventDefault();
                                e.currentTarget.focus();
                                if (pricingStudioId)
                                  selectViewerStudioId(pricingStudioId);
                                openAccountPage("studio", {
                                  rateFor: member.userId,
                                  aboveFolio: true,
                                  fallbackFocusRef: pricedHoursLabelRef,
                                });
                              }}
                            >
                              {member.name
                                ? `Set ${member.name}’s rate`
                                : "Set the studio rate"}
                            </DocumentAction>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-1 text-sm text-[var(--color-charcoal)]">
                          <p>Ask {rateOwnerName} to set a rate.</p>
                          {/* M4 — the note goes nowhere on its own. */}
                          <p className="mt-1 text-[var(--color-aged-oak)]">
                            “
                            <span ref={askRateNoteRef}>{rateNote}</span>
                            ”
                          </p>
                          <CopyAct
                            text={rateNote}
                            selectRef={askRateNoteRef}
                            actionKey="copy-set-rate-note"
                          >
                            Copy a note
                          </CopyAct>
                        </div>
                      ))}
                  </div>
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
                        ref={depositPctRef}
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
                    <Fragment key={it.id}>
                      <label className={ROW}>
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
                                  (it.quantity ?? 1) *
                                    (it.unit_price_cents ?? 0),
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
                      <RefusedLineNote note={refusedLines.get(it.id)} />
                    </Fragment>
                  ))
                ) : ffePartition.unfilled.length === 0 ? (
                  <p className="py-1 text-[11px] italic text-[var(--text-muted)]">
                    Nothing uninvoiced — every priced line is billed.
                  </p>
                ) : null}
                {ffeSettled &&
                  ffePartition.unfilled.map((it) => (
                    <label
                      key={it.id}
                      className={`${ROW} cursor-default`}
                      data-testid="composer-unfilled-allowance"
                    >
                      <input
                        type="checkbox"
                        className={CHECK}
                        checked={false}
                        disabled
                        readOnly
                      />
                      <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--text-muted)]">
                        {it.name}
                        {it.room?.name && (
                          <span className="ml-1.5">{it.room.name}</span>
                        )}
                      </span>
                      <span className="font-mono text-[11px] text-[var(--text-muted)]">
                        {unfilledAllowanceText(it)}
                      </span>
                    </label>
                  ))}
                {/* K7 — an unpriced piece is named with its fix: a labor line
                    takes its client price here, any other is priced in the
                    Price lens. It ticks only once priced; one already ticked
                    holds the draft, its reason and fix in one row (R186). */}
                {ffeSettled &&
                  ffePartition.unpriced.map((it) => {
                    const ticked = tickedFfeIds.has(it.id);
                    const focusKey = `price-line:${it.id}`;
                    const hold = holds.find((h) => h.focusKey === focusKey);
                    return (
                      <div
                        key={it.id}
                        data-testid="composer-unpriced-line"
                        data-focus-key={focusKey}
                        tabIndex={-1}
                        className="outline-none"
                      >
                        <label
                          className={`${ROW} ${ticked ? "" : "cursor-default"}`}
                        >
                          <input
                            type="checkbox"
                            className={CHECK}
                            checked={ticked}
                            disabled={!ticked}
                            onChange={(e) =>
                              setTickedFfeIds((prev) =>
                                toggled(prev, it.id, e.target.checked),
                              )
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
                          <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                            not priced
                          </span>
                        </label>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6">
                          {hold && (
                            <p
                              className="text-[11.5px]"
                              style={{ color: TERRACOTTA_INK }}
                            >
                              {hold.reason}
                            </p>
                          )}
                          {isLaborLine(it) ? (
                            <LaborPriceField
                              name={it.name}
                              saving={laborPrice.isPending}
                              onCommit={(cents) => priceLaborLine(it, cents)}
                            />
                          ) : (
                            <DocumentAction
                              href={priceLensHref}
                              actionKey="price-invoice-line"
                              surfaceKey="accounts"
                              regionKey="invoice-composer"
                              variant="tertiary"
                              aria-label={`Price it: ${it.name}`}
                              onClick={(e) => {
                                e.preventDefault();
                                priceInPriceLens(it);
                              }}
                            >
                              Price it
                            </DocumentAction>
                          )}
                        </div>
                        <RefusedLineNote
                          note={
                            laborPriceNotes.get(it.id) ?? refusedLines.get(it.id)
                          }
                        />
                      </div>
                    );
                  })}
                {/* C-31 — balances owed: a live deposit, no balance yet. */}
                {balanceOwed.length > 0 && (
                  <div className="mt-2" data-testid="composer-balances">
                    <p className={`${LABEL} mb-0.5`}>balances owed</p>
                    {balanceOwed.map((it) => {
                      const b = billing.get(it.id);
                      const price = lineClientPriceCents(it) ?? 0;
                      return (
                        <Fragment key={it.id}>
                          <label className={ROW}>
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
                                {(b?.slots ?? [])
                                  .map(stageSlotWords)
                                  .join(" · ")}
                              </span>
                            </span>
                            <span className="font-mono text-[11px] text-[var(--color-charcoal)]">
                              {formatCurrency(
                                balanceCents(price, b?.depositedCents ?? 0),
                              )}
                            </span>
                          </label>
                          <RefusedLineNote note={refusedLines.get(it.id)} />
                        </Fragment>
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
                        <span className="min-w-0 flex-1 truncate">
                          {it.name}
                        </span>
                        <span className="font-mono">
                          {(billing.get(it.id)?.slots ?? [])
                            .map(stageSlotWords)
                            .join(" · ") || "invoiced"}
                        </span>
                      </p>
                    ))}
                  </details>
                )}
                {skippedFfe.covered > 0 && (
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                    {`${skippedFfe.covered} asked-for item${skippedFfe.covered === 1 ? "" : "s"} already invoiced · skipped`}
                  </p>
                )}
              </div>

              {/* ── Purchases (C-25, 00703) — each its own line at cost ────── */}
              {offerablePurchases.length > 0 && (
                <div className="mt-4" data-testid="composer-purchases">
                  <p className={`${LABEL} mb-0.5`}>
                    purchases · unbilled · at cost
                  </p>
                  {offerablePurchases.map((p) => (
                    <AtCostRow
                      key={p.id}
                      id={p.id}
                      ticked={tickedPurchaseIds.has(p.id)}
                      onTick={(on) =>
                        setTickedPurchaseIds((prev) => toggled(prev, p.id, on))
                      }
                      costCents={purchaseAtCostCents(p)}
                      override={overrides.get(p.id)}
                      onOverride={(text) =>
                        setOverrides((prev) => new Map(prev).set(p.id, text))
                      }
                      label={p.description?.trim() || p.payee_name}
                      detail={`${p.description?.trim() ? `${p.payee_name} · ` : ""}${fmtDay(p.purchased_on)}`}
                      refusal={refusedLines.get(p.id)}
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
                  <p className={`${LABEL} mb-0.5`}>
                    riders · unbilled · at cost
                  </p>
                  {offerableRiders.map((r) => (
                    <AtCostRow
                      key={r.id}
                      id={r.id}
                      ticked={tickedRiderIds.has(r.id)}
                      onTick={(on) =>
                        setTickedRiderIds((prev) => toggled(prev, r.id, on))
                      }
                      costCents={riderAtCostCents(r)}
                      override={overrides.get(r.id)}
                      onOverride={(text) =>
                        setOverrides((prev) => new Map(prev).set(r.id, text))
                      }
                      label={riderLabel(r)}
                      detail={[
                        r.purchase_order?.po_number
                          ? `PO ${r.purchase_order.po_number}`
                          : null,
                        r.actual_cents === null && r.estimate_cents !== null
                          ? "estimate"
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      refusal={refusedLines.get(r.id)}
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
                data-adhoc-row
                data-focus-key={
                  i === firstUnfilledAdhoc ? "invoice-lines" : undefined
                }
                className="mb-1.5 grid grid-cols-[minmax(0,1fr)_56px_96px_24px] items-center gap-2"
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
                  className={`${INPUT} min-w-0`}
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
              data-focus-key={
                firstUnfilledAdhoc === -1 ? "invoice-lines" : undefined
              }
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
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
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
            {billingGap && selectedProject && (
              // K1/R186 — the gap hold's window: its reason and every fix act.
              <div
                data-hold-region={billingGap}
                className="w-full basis-full text-sm text-[var(--color-charcoal)]"
              >
                {soloOwnerUnstamped ? (
                  <p
                    data-focus-key={askFocusKey}
                    tabIndex={askFocusKey ? -1 : undefined}
                  >
                    This job was opened before your studio had one home. Write
                    to{" "}
                    <span
                      ref={supportAddressRef}
                      className="font-mono text-[12px]"
                    >
                      {SUPPORT_ADDRESS}
                    </span>{" "}
                    and we&apos;ll set it.
                  </p>
                ) : leadLeftStudio ? (
                  <p
                    data-focus-key={askFocusKey}
                    tabIndex={askFocusKey ? -1 : undefined}
                  >
                    The lead on this job has left the studio. Write to{" "}
                    <span
                      ref={supportAddressRef}
                      className="font-mono text-[12px]"
                    >
                      {SUPPORT_ADDRESS}
                    </span>{" "}
                    and we&apos;ll move the job to someone on your team.
                  </p>
                ) : (
                  <p
                    data-focus-key={askFocusKey}
                    tabIndex={askFocusKey ? -1 : undefined}
                  >
                    {billingGap === "no-client"
                      ? canLinkClient
                        ? `${selectedProject.name} has no client yet. Link one to bill it.`
                        : `${selectedProject.name} has no client yet. Ask ${leadName} to link one.`
                      : canNameStudio
                        ? `${selectedProject.name} isn't tied to your studio yet.`
                        : hasStudioOwner
                          ? `${selectedProject.name} isn't tied to a studio yet. Ask your studio owner to name it.`
                          : `${selectedProject.name} isn't tied to a studio yet. Only a studio that employs its designer can name one.`}
                  </p>
                )}
                {(soloOwnerUnstamped || leadLeftStudio) && (
                  <CopyAct
                    text={SUPPORT_ADDRESS}
                    selectRef={supportAddressRef}
                    actionKey="copy-support-address"
                  >
                    Copy the address
                  </CopyAct>
                )}
                {billingGap === "no-client" && !canLinkClient && !leadLeftStudio && (
                  // M4 — the note goes nowhere on its own; she sends it herself.
                  <p className="mt-1 text-[var(--color-aged-oak)]">
                    “
                    <span ref={askNoteRef}>
                      {askLinkNote(selectedProject.name)}
                    </span>
                    ”
                  </p>
                )}
                {billingGap === "no-client" && !canLinkClient && !leadLeftStudio && (
                  <CopyAct
                    text={askLinkNote(selectedProject.name)}
                    selectRef={askNoteRef}
                    actionKey="copy-link-client-note"
                  >
                    Copy a note
                  </CopyAct>
                )}
                {billingGap === "no-client" && canLinkClient && (
                  // One anchor on every page, so the sheet hands focus back to
                  // it on Esc. On this project's document it opens the sheet in
                  // place, above the folio and its draft; anywhere else it walks
                  // to the sheet's address. Focused on click because Safari
                  // does not focus a link it activates.
                  <DocumentAction
                    data-focus-key="link-client"
                    href={`/doc/${projectId}?sheet=household`}
                    actionKey="link-invoice-client"
                    surfaceKey="accounts"
                    regionKey="invoice-composer"
                    variant="tertiary"
                    onClick={(e) => {
                      e.currentTarget.focus();
                      linkingClientRef.current = projectId;
                      if (pathname === `/doc/${projectId}`) {
                        e.preventDefault();
                        window.dispatchEvent(
                          new CustomEvent(OPEN_HOUSEHOLD_SHEET_EVENT),
                        );
                      }
                    }}
                  >
                    {MESSAGE_WITHHELD.repair}
                  </DocumentAction>
                )}
                {canNameStudio && namingStudio &&(
                  <p className="mt-1">
                    Naming a studio stamps it on every invoice this project
                    sends.
                  </p>
                )}
                {canNameStudio && namingStudio &&(
                  <DocumentAction
                    ref={nameStudioRef}
                    data-focus-key="name-studio"
                    actionKey="name-invoice-studio"
                    surfaceKey="accounts"
                    regionKey="invoice-composer"
                    variant="tertiary"
                    aria-expanded={confirmingName}
                    onClick={() => {
                      setNameStudioError(null);
                      setConfirmingName(true);
                      requestAnimationFrame(() =>
                        confirmNameRef.current?.focus(),
                      );
                    }}
                  >
                    Name studio
                  </DocumentAction>
                )}
                {canNameStudio && namingStudio &&confirmingName && (
                  // K12 — one inline confirm, no modal: the stamp is final.
                  <div
                    role="group"
                    aria-label="Confirm naming the studio"
                    className="mt-1 flex flex-wrap items-center gap-x-3"
                  >
                    <p>Name {namingStudio.name}? This can&apos;t be undone.</p>
                    <DocumentAction
                      ref={confirmNameRef}
                      actionKey="confirm-name-invoice-studio"
                      surfaceKey="accounts"
                      regionKey="invoice-composer"
                      variant="tertiary"
                      loading={stampProjectStudio.isPending}
                      loadingLabel="Naming…"
                      onClick={() => {
                        stampProjectStudio.mutate(
                          { projectId, studioId: namingStudio.id },
                          {
                            onError: (e) => {
                              setConfirmingName(false);
                              nameStudioRef.current?.focus();
                              setNameStudioError(
                                stampStudioRefusal(
                                  (e as { message?: unknown } | null)?.message,
                                  namingStudio.name,
                                ),
                              );
                            },
                          },
                        );
                      }}
                    >
                      Name
                    </DocumentAction>
                    <DocumentAction
                      actionKey="cancel-name-invoice-studio"
                      surfaceKey="accounts"
                      regionKey="invoice-composer"
                      variant="tertiary"
                      onClick={() => {
                        setConfirmingName(false);
                        nameStudioRef.current?.focus();
                      }}
                    >
                      Not yet
                    </DocumentAction>
                  </div>
                )}
                <ActFailLine
                  error={
                    nameStudioError
                      ? new AppError({
                          code: "NAME_STUDIO",
                          message: nameStudioError,
                        })
                      : null
                  }
                  className="mt-1"
                />
              </div>
            )}
            <DocumentAction
              ref={draftActRef}
              actionKey="draft-invoice"
              surfaceKey="accounts"
              regionKey="invoice-composer"
              variant="primary"
              held={!canDraft && !creating}
              disabled={!canDraft && !creating}
              aria-describedby={!canDraft && !creating ? statusId : undefined}
              // K3 — the reason line beside Draft speaks first; the
              // spotlight then lights every hold.
              onHeldActivate={() => {
                if (blocker) setHeldBlocker(blocker);
              }}
              holds={spotlightHolds}
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
          <ActFailLine
            error={
              error
                ? new AppError({
                    code: "INVOICE_DRAFT",
                    message: error.message,
                  })
                : null
            }
            className="mt-2"
            onRetry={error?.retryable ? () => void draft() : undefined}
            retryKey="retry-draft-invoice"
          />
        </>
      )}
      {/* F11 — in the DOM from mount, so a screen reader hears the reason the
          moment it is written; only its words change. */}
      <p
        id={statusId}
        role="status"
        className={
          heldReason ? "mt-2 text-sm text-[var(--color-charcoal)]" : "sr-only"
        }
      >
        {heldReason ?? ""}
      </p>
    </div>
  );
}

/** What holds the Draft act, in the order the composer asks for it. */
type ComposerBlocker =
  | InvoiceBillingGap
  | StudioInvoiceBlocker
  | "no-project"
  | "lines"
  | "billing-figures"
  | "deposit"
  | "prefill"
  | "rate-pending"
  | "price-line"
  | "send-no-recipient";

function blockerReason(
  blocker: ComposerBlocker,
  facts: {
    projectName: string;
    canLinkClient: boolean;
    leadLeftStudio: boolean;
    leadName: string;
    canNameStudio: boolean;
    soloOwnerUnstamped: boolean;
    hasStudioOwner: boolean;
    studioLoading: boolean;
  },
): string {
  switch (blocker) {
    case "no-client":
      return facts.leadLeftStudio
        ? LEAD_LEFT_STUDIO_HOLD
        : facts.canLinkClient
          ? "Link a client before drafting this invoice."
          : `Ask ${facts.leadName} to link a client.`;
    case "no-studio":
      return facts.canNameStudio
        ? "Name the studio before drafting this invoice."
        : facts.soloOwnerUnstamped
          ? `This job was opened before your studio had one home. Write to ${SUPPORT_ADDRESS} and we'll set it.`
          : facts.hasStudioOwner
            ? "Ask your studio owner to name this project’s studio."
            : `${facts.projectName} can’t be billed until a studio that employs its designer names it.`;
    case "no-project":
      return "Choose a project first.";
    case "lines":
      return "Add at least one line first.";
    case "billing-figures":
      return "Add the missing billing figures first.";
    case "deposit":
      return "Adjust the deposit before drafting.";
    case "prefill":
      return "Wait for the invoice details to finish loading.";
    case "household":
      return "Choose the household this invoice is for first.";
    case "regarding":
      return "Add what this invoice is regarding first.";
    case "studio":
      return facts.studioLoading
        ? "Wait for your studio to finish loading."
        : "This account belongs to no studio yet, so there is none to bill from.";
    case "rate-pending":
      return "These hours are waiting for a rate.";
    case "price-line":
      return "Set a client price for this piece.";
    case "send-no-recipient":
      return "This household has no email to send to.";
  }
}

const SUPPORT_ADDRESS = "hello@patina.cloud";
const LEAD_LEFT_STUDIO_HOLD = `The lead on this job has left the studio. Write to ${SUPPORT_ADDRESS} and we'll move the job to someone on your team.`;

/** K5 — the one line a designer who can't link a client copies to its lead. */
function askLinkNote(projectName: string): string {
  return `Could you link a client to ${projectName}? I'm drafting its invoice.`;
}

/** K8 — the one line a designer who can't set rates copies to the owner. */
function askRateNote(projectName: string, memberNames: string[]): string {
  return memberNames.length > 0
    ? `Could you set a rate for ${new Intl.ListFormat("en", { type: "conjunction" }).format(memberNames)}? I'm drafting ${projectName}'s invoice.`
    : `Could you set a rate for the hours on ${projectName}? I'm drafting its invoice.`;
}

/** A refusal before anything was written: a billing gap or a bad request is
 *  the same refusal next time; anything else (a dropped connection, a timeout)
 *  may go through on a second try. */
function preWriteFailure(e: unknown): {
  message: string;
  retryable: boolean;
  gap?: InvoiceBillingGap;
} {
  if (e instanceof InvoiceBillingGapError) {
    const gap: InvoiceBillingGap | undefined =
      e.gap === "client"
        ? "no-client"
        : e.gap === "studio"
          ? "no-studio"
          : undefined;
    return { message: e.message, retryable: false, gap };
  }
  const message =
    e instanceof Error && e.message
      ? e.message
      : "Could not draft the invoice.";
  return {
    message,
    retryable: !/validation|invalid|must be|does not match|not allowed/i.test(
      message,
    ),
  };
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
  refusal,
}: {
  id: string;
  ticked: boolean;
  onTick: (on: boolean) => void;
  costCents: number | null;
  override: string | undefined;
  onOverride: (text: string) => void;
  label: string;
  detail: string;
  refusal?: string;
}) {
  const text = override ?? centsToDollarText(costCents);
  const invalid = ticked && parseOverrideCents(text) === null;
  return (
    <>
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
      <RefusedLineNote note={refusal} />
    </>
  );
}

/** An opener that names lines to tick wants them, not the parked work. */
function asksForLines(context: InvoiceComposerContext): boolean {
  return [
    context.initialFfeItemIds,
    context.initialTimeEntryIds,
    context.initialPurchaseIds,
    context.initialCostLineIds,
  ].some((ids) => (ids ?? []).length > 0);
}

/**
 * K7 — a labor line's client price, typed as the Price lens takes it: blur or
 * Enter saves a readable figure above $0, Esc puts the typing back (and keeps
 * the sheet open). Saved, the line turns priced and its hold clears.
 */
function LaborPriceField({
  name,
  saving,
  onCommit,
}: {
  name: string;
  saving: boolean;
  onCommit: (cents: number) => void;
}) {
  const [draft, setDraft] = useState("");
  // Enter saves; leaving the field saves only what Enter has not.
  const sent = useRef<string | null>(null);
  const commit = (again: boolean) => {
    const cents = parseRough(draft);
    if (cents == null || cents <= 0) return;
    if (!again && sent.current === draft) return;
    sent.current = draft;
    onCommit(cents);
  };
  return (
    <label className="flex items-center gap-1.5">
      <span className={LABEL}>client price</span>
      <input
        aria-label={`Client price, ${name}`}
        inputMode="decimal"
        placeholder="$"
        value={draft}
        readOnly={saving}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(true);
          } else if (e.key === "Escape" && draft !== "") {
            e.preventDefault();
            e.stopPropagation();
            setDraft("");
          }
        }}
        className={`${INPUT} w-24 font-mono`}
      />
    </label>
  );
}

/** Why the billing writer refused this line: said beside it, at its row. */
function RefusedLineNote({ note }: { note: string | undefined }) {
  return (
    <ActFailLine
      error={
        note
          ? new AppError({ code: "INVOICE_LINE_REFUSED", message: note })
          : null
      }
      className="pl-6"
    />
  );
}
