"use client";

/**
 * The Hours ledger (D9: capture in the document, review in the drawer;
 * spec v1.2 §9; R77 full depth): a week of entries across every engagement —
 * document · activity · phase · source · duration, inline-editable until an
 * invoice claims them (00177 guard) — with today/week totals and a batch-add
 * row.
 *
 * R77 gave the ledger its history and its balance:
 *  - WEEK PAGING — ‹ earlier / later › walks back through past weeks.
 *  - ALL-TIME UNBILLED BALANCE — the studio's unclaimed hours as money
 *    (project_unbilled_time, view-resolved rates), with a "bill it →"
 *    handoff into the R74b composer.
 *  - PER-DOCUMENT LENS — an optional OpenLedgerContext prop scopes the whole
 *    ledger to one document (the Account band links in pre-filtered once the
 *    drawer passes its sheet context through).
 *  - DELETE WITH CONFIRM on unbilled entries; billed entries stay immutable.
 *
 * R75: "Bill week → Accounts" (renamed from "Export week → Accounts" in W5,
 * HT-20/HT-21 — the composer hand-off produces an invoice draft, not a file,
 * so "Export" is reserved for the CSV act beside the studio scope below)
 * opens the composer with the shown week's unbilled entries pre-ticked
 * (per-entry include/exclude + resolved rates live there; one act, review
 * before draft). Failures render inline (R83).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  createBrowserClient,
  filterProjectUnbilledEntries,
  useClients,
  useCreateTimeEntry,
  useDeleteTimeEntry,
  useProjectHoursTotal,
  useProjectPricingStudio,
  useStampProjectPricingStudio,
  useStudioHoursRollup,
  useTimeEntryLedger,
  useTimeEntryNote,
  useUpdateTimeEntry,
  type TimeEntryLedgerRow,
  type TimeHoursGroupBy,
} from "@patina/supabase";
import {
  buildTimeExportCsv,
  downloadTimeExportCsv,
  timeExportFilename,
  type TimeExportRow,
} from "@/lib/document/time-export";
import { ACTIVITIES, fmtMinutes } from "@/lib/document/time-derivation";
import { fmtDay, fmtUsd } from "@/lib/document/format";
import { LedgerFrontMatter } from "./ledger-front-matter";
import { hoursUtilization } from "@/lib/document/ledger-summary";
import { openInvoiceComposer } from "./accounts/invoice-overlays";
import type { OpenLedgerContext } from "./command-bar";
import { DocSheetHead } from "./overlays/doc-sheet";
import { STUDIO_LEDGERS } from "@/lib/document/registry";
import { DOCUMENT_SURFACE_KEYS } from "@/lib/help-system/document-surface-keys";
import { DocumentAction, DocumentActionGroup } from "./document-action";
import { ProjectAuthorityBandForProject } from "./commercial/project-authority-band";
import { PendingTimeAuthorizationBand } from "./pending-time-authorization-band";
import { useProjectBillingAuthority } from "@/hooks/use-commercial-documents";
import { useViewerStudio } from "@/hooks/use-viewer-studio";
import {
  isInvoiceEligibleTimeEntry,
  timeBillingStateLabel,
  timeRateProvenance,
} from "@/lib/document/authority-hours";
import { documentEvents } from "@/lib/analytics/document-events";
import {
  BACKDATE_MARK_DAYS,
  BillablePill,
  RateRoleChip,
  RateRoleMark,
  isBackdatedEntry,
  isDayValue,
  isoDateValue,
  startedAtFromDateValue,
  useBillableIntent,
} from "./time-capture";
import type { TimeRateRole } from "@patina/supabase";
import {
  HOURS_MEMBER_SCOPE_EVENT,
  hoursMemberScopePending,
  type HoursMemberScopeDetail,
} from "@/lib/document/open-hours-scope";

// R96 — the registry is the single source of the surface icon (no drift).
const HOURS_ICON = STUDIO_LEDGERS.find((l) => l.key === "hours")!.icon;

type AnyRecord = any;

const getSupabase = () => createBrowserClient() as AnyRecord;

const SOURCE_LABEL: Record<string, string> = {
  timer_auto: "in hand",
  timer_manual: "timer",
  manual_entry: "typed",
};

const TERRACOTTA_INK = "var(--color-terracotta-ink)";

/** HT-8 — the four scopes of one sheet. No page, no tab bar, no leaderboard. */
export type HoursScope = "mine" | "member" | "project" | "studio";

/** HT-36 — how the studio scope's buckets are cut. The five the rollup admits. */
const GROUP_BY: ReadonlyArray<[TimeHoursGroupBy, string]> = [
  ["member", "by person"],
  ["project", "by document"],
  ["day", "by day"],
  ["iso_week", "by week"],
  ["activity", "by activity"],
];

/**
 * The four fields of the batch-add row, on the house sheet's own type step
 * (§A: no inline font-size utility) and at its 44px floor, with `min-w-0` so a
 * grid track may shrink under them (W3-R3-M1 / W3-R3-m6).
 */
const ADD_FIELD_CLASS =
  "min-h-11 w-full min-w-0 rounded-[4px] border border-[var(--color-pearl)] bg-white px-2 py-1.5 t-meta text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none";

/** Local calendar date, not a UTC shift of it — the rollup takes dates. */
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

/** Local Monday 00:00 of the week `offset` weeks before the current one. */
function weekRange(offset: number): { start: Date; end: Date } {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - offset * 7); // back to Monday
  const end = new Date(d);
  end.setDate(end.getDate() + 7);
  return { start: d, end };
}

interface UnbilledInfo {
  amount_cents: number;
  project_id: string;
  authority_rate_id?: string | null;
}

export function HoursLedger({
  initialContext = null,
}: {
  /** R77 — the per-document lens: `{ projectId }` scopes the ledger. (The
   *  studio drawer passes its sheet context through post-merge wiring.) */
  initialContext?: OpenLedgerContext | null;
}) {
  const updateEntry = useUpdateTimeEntry({ errorSurface: "inline" });
  const createEntry = useCreateTimeEntry({ errorSurface: "inline" });

  // ── The lens + the page ───────────────────────────────────────────────────
  const [lensProjectId, setLensProjectId] = useState<string | null>(
    initialContext?.projectId ?? null,
  );
  // HT-8 — which of the four scopes this sheet is answering. A document in hand
  // opens on that document (HT-9: everyone's hours on it, not the holder's), a
  // person in hand opens on that person, and otherwise the sheet is still mine.
  const [memberScope, setMemberScope] = useState<{
    id: string;
    name: string | null;
  } | null>(
    hoursMemberScopePending.userId
      ? {
          id: hoursMemberScopePending.userId,
          name: hoursMemberScopePending.name,
        }
      : null,
  );
  /** Where this open would land IF the viewer has the lens — captured at mount,
   *  beside `memberScope`, because the module value is cleared straight after. */
  const [landingScope, setLandingScope] = useState<HoursScope>(
    hoursMemberScopePending.userId
      ? "member"
      : initialContext?.projectId
        ? "project"
        : "mine",
  );
  /** `null` until the membership read answers. A sheet that lands first and
   *  corrects itself afterwards told HT-27's instrument that a plain member
   *  read the project scope — she never did — and left her stranded there for
   *  good if the read FAILED, since the correction waited on data that never
   *  came. One settle, one landing, one `time_scope_viewed`. */
  const [scope, setScope] = useState<HoursScope | null>(null);
  const [groupBy, setGroupBy] = useState<TimeHoursGroupBy>("member");
  const [showEntries, setShowEntries] = useState(false);

  useEffect(() => {
    hoursMemberScopePending.userId = null;
    hoursMemberScopePending.name = null;
  }, []);

  // A person handed to a sheet that is already open. The drawer remounts
  // nothing in that case, so without this the click was silent and the module
  // value above outlived it — mis-scoping whatever opened Hours next.
  useEffect(() => {
    const onMemberScope = (event: Event) => {
      const detail = (event as CustomEvent<HoursMemberScopeDetail>).detail;
      if (!detail?.userId) return;
      hoursMemberScopePending.userId = null;
      hoursMemberScopePending.name = null;
      setMemberScope({ id: detail.userId, name: detail.name });
      setLensProjectId(null);
      setShowEntries(false);
      // If the standing read has not answered yet the landing is what the belt
      // below will use; if it has, this is the move itself.
      setLandingScope("member");
      setScope((current) => (current === null ? current : "member"));
    };
    window.addEventListener(HOURS_MEMBER_SCOPE_EVENT, onMemberScope);
    return () =>
      window.removeEventListener(HOURS_MEMBER_SCOPE_EVENT, onMemberScope);
  }, []);
  const [weekOffset, setWeekOffset] = useState(0);
  const { start: weekStart, end: weekEnd } = useMemo(
    () => weekRange(weekOffset),
    [weekOffset],
  );

  const { data: entries, refetch } = useQuery({
    queryKey: ["document-hours-week", weekOffset, lensProjectId],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.id) return [];
      let query = supabase
        .from("project_time_entries")
        // `origin_documents` is HT-27's `project_kind`: there is no
        // `projects.kind` column — what the classifier calls a design-services
        // project is the ORIGIN commercial document's kind
        // (`_is_design_services_project`, 00578:2584), so the alarm reports that
        // and says "non_services" where no origin document exists.
        .select(
          "*, project:projects(name, studio_id, origin_documents:project_commercial_documents(document_kind, is_origin))",
        )
        .eq("user_id", userData.user.id)
        .gte("started_at", weekStart.toISOString())
        .lt("started_at", weekEnd.toISOString())
        .not("duration_minutes", "is", null)
        .order("started_at", { ascending: false });
      if (lensProjectId) query = query.eq("project_id", lensProjectId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AnyRecord[];
    },
  });

  // The repair act and the rate card are the studio's, not a member's: HT-3's
  // card and HT-3-g's stamp both admit an owner or admin only. Which studio
  // that is comes from one ordered, explicit answer (`useViewerStudio`) rather
  // than from the first row of an unordered membership read — a viewer with two
  // studios was otherwise keyed on a different one between loads, and the studio
  // scope named none of them.
  const {
    organizations: orgs,
    studio: viewerStudio,
    isOwnerOrAdmin: viewerIsOwnerOrAdmin,
    isSettled: standingKnown,
  } = useViewerStudio();

  const { data: projects } = useQuery({
    queryKey: ["document-hours-projects"],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("projects")
        // client_id: the CSV export's Client column (W5) reads it against
        // useClients() below — project_unbilled_time/time_entry_ledger carry
        // no client name of their own.
        .select("id, name, status, client_id")
        .order("name");
      if (error) throw error;
      return (data ?? []) as AnyRecord[];
    },
  });

  // W5 (HT-20) — the CSV export's Client column. Reused, not re-fetched:
  // useClients() already reads every designer_clients row RLS lets the
  // caller see.
  //
  // Fix round 1 (finding M1): the map MUST key on `c.client_id` — the
  // profiles.id a designer_clients row is linked to — not `c.id` (the
  // designer_clients row's own id). `projects.client_id` FKs
  // `profiles.id` (projects_client_id_fkey, database.types.ts), never
  // designer_clients.id, so keying on `c.id` left this column empty for
  // every project (measured: 0 of 4 projects with a non-null client_id
  // matched; keying on `c.client_id` matches all 4).
  const { data: designerClients } = useClients();
  const clientNameByProjectId = useMemo(() => {
    const clientNames = new Map(
      (designerClients ?? [])
        .filter((c) => c.client_id)
        .map(
          (c) =>
            [
              c.client_id as string,
              c.client?.full_name ?? c.client_name ?? null,
            ] as const,
        ),
    );
    return new Map(
      (projects ?? []).map((p) => [
        p.id as string,
        p.client_id ? (clientNames.get(p.client_id as string) ?? null) : null,
      ]),
    );
  }, [projects, designerClients]);

  // R23: open section-task estimates give Hours its "of N est." readout.
  const { data: openEstimateMinutes } = useQuery({
    queryKey: ["document-hours-estimates"],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("project_tasks")
        .select("estimate_minutes")
        .eq("status", "todo")
        .not("estimate_minutes", "is", null)
        .not("section_key", "is", null);
      if (error) throw error;
      return ((data ?? []) as AnyRecord[]).reduce(
        (s, t) => s + (t.estimate_minutes ?? 0),
        0,
      ) as number;
    },
  });

  // R77 — the all-time unbilled balance (00177 view: billable, completed,
  // unclaimed, view-resolved rates). A balance, not a flow — it deliberately
  // ignores the shown week; the lens scopes it like everything else.
  const { data: unbilledRows, refetch: refetchUnbilled } = useQuery({
    queryKey: ["document-hours-unbilled", lensProjectId],
    queryFn: async () => {
      let query = getSupabase()
        .from("project_unbilled_time")
        .select(
          "id, project_id, duration_minutes, amount_cents, authority_rate_id, billing_state",
        );
      if (lensProjectId) query = query.eq("project_id", lensProjectId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AnyRecord[];
    },
  });

  const {
    data: pendingAuthorizationRows,
    refetch: refetchPendingAuthorization,
  } = useQuery({
    queryKey: ["document-hours-pending-authorization", lensProjectId],
    queryFn: async () => {
      let query = getSupabase()
        .from("project_time_entries")
        .select("id, project_id, duration_minutes")
        .eq("billable", true)
        .is("invoice_id", null)
        .eq("billing_state", "pending_authorization")
        .not("duration_minutes", "is", null);
      if (lensProjectId) query = query.eq("project_id", lensProjectId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AnyRecord[];
    },
  });

  const unbilledById = useMemo(() => {
    const map = new Map<string, UnbilledInfo>();
    for (const row of unbilledRows ?? [])
      map.set(row.id, {
        amount_cents: row.rated_amount_cents ?? row.amount_cents ?? 0,
        project_id: row.project_id,
        authority_rate_id: row.authority_rate_id ?? null,
      });
    return map;
  }, [unbilledRows]);
  const unbilledMinutes = (unbilledRows ?? []).reduce(
    (s, r) => s + (r.duration_minutes ?? 0),
    0,
  );
  const unbilledCents = (unbilledRows ?? []).reduce(
    (s, r) => s + (r.rated_amount_cents ?? r.amount_cents ?? 0),
    0,
  );
  const unbilledProjects = useMemo(
    () => [...new Set((unbilledRows ?? []).map((r) => r.project_id as string))],
    [unbilledRows],
  );
  const [billingProjectId, setBillingProjectId] = useState(
    initialContext?.projectId ?? "",
  );
  const billingTargetProjectId =
    lensProjectId ??
    (unbilledProjects.length === 1
      ? unbilledProjects[0]
      : unbilledProjects.includes(billingProjectId)
        ? billingProjectId
        : null);
  const billingTargetRows = useMemo(
    () =>
      billingTargetProjectId
        ? filterProjectUnbilledEntries(
            unbilledRows ?? [],
            billingTargetProjectId,
          )
        : [],
    [billingTargetProjectId, unbilledRows],
  );

  const [addProject, setAddProject] = useState(initialContext?.projectId ?? "");
  const [addMinutes, setAddMinutes] = useState("");
  // HT-24 — recorded, never defaulted. An hour typed here used to be filed as
  // design work nobody claimed; unset is a real answer and prints honestly.
  const [addActivity, setAddActivity] = useState("");
  // HT-13 — the add row dates its entry. Without this it sent no `started_at`
  // at all, so paging back a week and typing an hour silently mis-dated it
  // into TODAY, with no warning and no way to correct it afterwards.
  const [addDate, setAddDate] = useState(() => isoDateValue(new Date()));
  // HT-11 — stated, and seeded from the resolved answer for the document
  // picked. Never `?? true`.
  const [addBillable, setAddBillable] = useState(false);
  // The document she last stated billable about (HT-11 · W3-R4-M1).
  const [addStatedFor, setAddStatedFor] = useState<string | null>(null);
  const [addRateRole, setAddRateRole] = useState<TimeRateRole | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  /** R83 — the ledger's quiet inline note (add/delete failures, never a toast). */
  const [note, setNote] = useState<string | null>(null);

  const days = useMemo(() => {
    const byDay = new Map<string, AnyRecord[]>();
    for (const e of entries ?? []) {
      const day = new Date(e.started_at).toDateString();
      byDay.set(day, [...(byDay.get(day) ?? []), e]);
    }
    return [...byDay.entries()];
  }, [entries]);

  const todayKey = new Date().toDateString();
  const todayMin = (entries ?? [])
    .filter((e) => new Date(e.started_at).toDateString() === todayKey)
    .reduce((s, e) => s + (e.duration_minutes ?? 0), 0);
  const weekMin = (entries ?? []).reduce(
    (s, e) => s + (e.duration_minutes ?? 0),
    0,
  );
  const util = hoursUtilization(entries ?? []);

  // R75 — the shown week's exportable share: billable, completed, unclaimed.
  const weekUnbilled = useMemo(
    () => (entries ?? []).filter(isInvoiceEligibleTimeEntry),
    [entries],
  );
  const weekUnbilledProjects = useMemo(
    () => [...new Set(weekUnbilled.map((e) => e.project_id as string))],
    [weekUnbilled],
  );

  // HT-13 — the date follows the PAGE, not the clock. Standing on last week and
  // typing an hour means last week; the current week means today.
  useEffect(() => {
    setAddDate(isoDateValue(weekOffset === 0 ? new Date() : weekStart));
  }, [weekOffset, weekStart]);

  const addIntent = useBillableIntent(addProject || null);
  // HT-11 — billable is STATED. A hand that touches the pill keeps its answer
  // even if the authority read for that document settles a second later; the
  // `addSeededFor` guard alone could not protect it, because it is only written
  // when the read settles (W3-R4-M1).
  const addBillableStated = Boolean(addProject) && addStatedFor === addProject;
  const stateAddBillable = (next: boolean) => {
    setAddStatedFor(addProject);
    setAddBillable(next);
  };
  useEffect(() => {
    setAddStatedFor(null);
  }, [addProject]);
  const addSeededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!addProject || !addIntent.isSettled) return;
    if (addBillableStated) return;
    if (addSeededFor.current === addProject) return;
    addSeededFor.current = addProject;
    setAddBillable(addIntent.billable);
  }, [addProject, addIntent.isSettled, addIntent.billable, addBillableStated]);

  const parsedAdd = parseInt(addMinutes, 10);
  // A cleared date field is not "today" — it is an unanswered question, and
  // the act waits for it (W3-R3-M2).
  // …and neither is an unanswered authority: an hour added before the read
  // settles is written `billable = false` whatever the agreement says, under a
  // pill that reads like a settled answer (W3-R4-M1). Her own statement counts
  // as an answer, so a failed read does not strand the row.
  const addValid =
    addProject &&
    (addIntent.isSettled || addBillableStated) &&
    isDayValue(addDate) &&
    Number.isFinite(parsedAdd) &&
    parsedAdd >= 1;

  const batchAdd = async () => {
    if (!addValid || addBusy) return;
    setAddBusy(true);
    setNote(null);
    const startedMs = Date.now();
    try {
      const written = await createEntry.mutateAsync({
        projectId: addProject,
        durationMinutes: parsedAdd,
        startedAt: startedAtFromDateValue(addDate),
        activity: addActivity || null,
        billable: addBillable,
        rateRole: addRateRole,
        source: "manual_entry",
      });
      // HT-27 — the capture instrument, read off what the server actually
      // stored rather than what the form asked for (the rate is the server's).
      documentEvents.time.entryLogged({
        surface: "hours_ledger",
        source: "manual_entry",
        activity: written.activity ?? null,
        billable: written.billable,
        rate_source: written.rate_source ?? null,
        rate_role: written.rate_role ?? null,
        duration_minutes: written.duration_minutes,
        latency_ms: Date.now() - startedMs,
      });
      setAddMinutes("");
      void refetch();
      void refetchUnbilled();
      void refetchPendingAuthorization();
    } catch (e) {
      setNote(
        `Could not add — ${e instanceof Error ? e.message : "try again"}`,
      );
    } finally {
      setAddBusy(false);
    }
  };

  const commit = (entry: AnyRecord, updates: AnyRecord) => {
    updateEntry.mutate(
      { id: entry.id, projectId: entry.project_id, updates },
      {
        onSuccess: () => {
          for (const field of Object.keys(updates))
            documentEvents.time.entryAdjusted({ field, by_admin: false });
          void refetch();
          void refetchUnbilled();
          void refetchPendingAuthorization();
        },
        onError: (e) =>
          setNote(
            `Could not save — ${e instanceof Error ? e.message : "try again"}`,
          ),
      },
    );
  };

  const lensName =
    lensProjectId != null
      ? ((projects ?? []).find((p) => p.id === lensProjectId)?.name ??
        (entries ?? []).find((e) => e.project_id === lensProjectId)?.project
          ?.name ??
        "one document")
      : null;

  const weekLabel =
    weekOffset === 0
      ? "this week"
      : `week of ${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  // The shown week, as the dates the rollup and the fact view bucket by.
  const fromDate = isoDate(weekStart);
  const toDate = isoDate(new Date(weekEnd.getTime() - 86_400_000));

  // W5 (HT-20) — the studio scope's CSV export. Same fact view, same window
  // as "the entries" toggle beneath the rollup (ScopeEntries) — a second read
  // rather than a lift, since the toggle's rows are not always mounted.
  const studioExport = useTimeEntryLedger({
    studioId: scope === "studio" ? (viewerStudio?.id ?? null) : null,
    from: fromDate,
    to: toDate,
    includeRunning: false,
  });
  const studioExportInvoiceIds = useMemo(
    () => [
      ...new Set(
        (studioExport.data ?? [])
          .map((r) => r.invoice_id)
          .filter((id): id is string => !!id),
      ),
    ],
    [studioExport.data],
  );
  const { data: studioExportInvoices } = useQuery({
    queryKey: ["document-hours-export-invoice-numbers", studioExportInvoiceIds],
    enabled: studioExportInvoiceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("invoices")
        .select("id, invoice_number")
        .in("id", studioExportInvoiceIds);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        invoice_number: string | null;
      }>;
    },
  });
  const invoiceNumberById = useMemo(
    () =>
      new Map(
        (studioExportInvoices ?? []).map((i) => [i.id, i.invoice_number]),
      ),
    [studioExportInvoices],
  );
  const studioExportRows: TimeExportRow[] = useMemo(
    () =>
      (studioExport.data ?? []).map((r) => ({
        ...r,
        client_name: r.project_id
          ? (clientNameByProjectId.get(r.project_id) ?? null)
          : null,
        invoice_number: r.invoice_id
          ? (invoiceNumberById.get(r.invoice_id) ?? null)
          : null,
      })),
    [studioExport.data, clientNameByProjectId, invoiceNumberById],
  );
  const exportCsv = () => {
    const csv = buildTimeExportCsv(studioExportRows);
    downloadTimeExportCsv(csv, timeExportFilename("studio", fromDate));
    documentEvents.time.exportTaken({
      scope: "studio",
      row_count: studioExportRows.length,
      period: `${fromDate}..${toDate}`,
    });
  };

  // The studios the viewer can name, for the pricing-studio fact on a row
  // (HT-3-e(3) — Patina makes the pricing studio visible rather than impossible
  // to move).
  const studioNames = useMemo(
    () => new Map((orgs ?? []).map((org) => [org.id, org.name as string])),
    [orgs],
  );
  // Read off the DOCUMENT, never off the week's entries: the week read above is
  // `.eq('user_id', me)`, so in the project scope — HT-9's whole case, an owner
  // reading a house she has logged nothing on — an entry-derived answer is
  // silently absent, and absence here printed "no studio yet" over a document
  // that names one, under a stamp door the server then refused.
  const lensPricingStudio = useProjectPricingStudio(lensProjectId);
  /** `null` = this document names no studio. `undefined` = not known yet, which
   *  is not the same fact and must print neither a sentence nor a repair. */
  const lensPricingStudioId: string | null | undefined = lensProjectId
    ? lensPricingStudio.isSuccess
      ? (lensPricingStudio.data ?? null)
      : undefined
    : null;

  // HT-8 — the lens is the admin's instrument; a plain member never sees it.
  // The two scoped words appear only with something in hand: the member scope's
  // one door is the person (no staff picker in a money ledger), and "this
  // document" means the one the sheet was opened onto.
  const lensWords: ReadonlyArray<[HoursScope, string]> = useMemo(() => {
    const words: Array<[HoursScope, string]> = [["mine", "mine"]];
    if (memberScope) words.push(["member", memberScope.name ?? "this person"]);
    if (lensProjectId) words.push(["project", "this document"]);
    words.push(["studio", "the studio"]);
    return words;
  }, [memberScope, lensProjectId]);

  // HT-8 — the lens is the admin's instrument, so a viewer who has none can
  // never be left standing in a scope she has no word to leave. Her sheet is her
  // own hours (front matter, her rows, R77's inline edit and delete), scoped to
  // the document in hand, with HT-10-a's document total above them. Deferred to
  // an effect because the role arrives with `useOrganizations`, after mount.
  useEffect(() => {
    if (!standingKnown) return;
    // The landing, once: a viewer with no lens can never be left standing in a
    // scope she has no word to leave, and one with the lens keeps the scope the
    // door she came through asked for. A failed membership read counts as no
    // lens — her own hours are the one thing she is certainly entitled to.
    setScope((current) => {
      if (!viewerIsOwnerOrAdmin) return "mine";
      return current === null ? landingScope : current;
    });
    if (!viewerIsOwnerOrAdmin) setShowEntries(false);
  }, [standingKnown, viewerIsOwnerOrAdmin, landingScope, scope]);

  useEffect(() => {
    if (scope === null) return;
    documentEvents.time.scopeViewed({
      scope,
      group_by: scope === "mine" ? null : groupBy,
    });
  }, [scope, groupBy]);

  return (
    <div className="mx-auto max-w-3xl">
      <DocSheetHead
        icon={HOURS_ICON}
        title="Hours"
        helpKey={DOCUMENT_SURFACE_KEYS.hours}
      />
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-xl text-[var(--color-charcoal)]">
            Hours{" "}
            <em className="italic text-[var(--color-clay-ink)]">
              · {weekLabel}
            </em>
            {lensName && (
              <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
                · {lensName}
                <button
                  type="button"
                  onClick={() => {
                    // Dropping the document drops the scope that was about it:
                    // "this document" loses its word when the lens clears, and a
                    // project scope with no project asked the rollup for the
                    // WHOLE studio under the caption "this document".
                    setLensProjectId(null);
                    setScope((current) =>
                      current === "project" ? "mine" : current,
                    );
                    setShowEntries(false);
                  }}
                  className="ml-1.5 text-[var(--color-clay-ink)] hover:opacity-80"
                >
                  all documents ×
                </button>
              </span>
            )}
          </h2>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.07em] text-[var(--color-aged-oak)]">
            {/* M6-01 — todayMin/weekMin are reduced from the week read, which
                is `.eq('user_id', me)`. Standing outside every scope guard they
                printed the VIEWER's own week two lines above a caption and a
                total naming someone else — and, in the project scope, 'Week · 0
                min' above the document's own hours. They belong to the one
                scope whose week they are. */}
            {scope === "mine" && (
              <>
                {weekOffset === 0 && (
                  <>Today · {fmtMinutes(todayMin)} &nbsp;·&nbsp; </>
                )}
                Week · {fmtMinutes(weekMin)}
              </>
            )}
            {/* R77 — week paging: walk the history, quietly. It governs the
                window in every scope, so it is not gated with the figures. */}
            <button
              type="button"
              onClick={() => setWeekOffset((o) => o + 1)}
              className={`${scope === "mine" ? "ml-3" : ""} text-[var(--color-clay-ink)] hover:opacity-80`}
            >
              ‹ earlier
            </button>
            {weekOffset > 0 && (
              <button
                type="button"
                onClick={() => setWeekOffset((o) => Math.max(0, o - 1))}
                className="ml-2 text-[var(--color-clay-ink)] hover:opacity-80"
              >
                later ›
              </button>
            )}
          </p>
        </div>
        {/* R75's export is the HOLDER's week: `weekUnbilled` is derived from the
            week read, which is `.eq('user_id', me)`. Under a caption naming
            someone else it pre-ticked the viewer's own hours into the composer,
            so it belongs to the one scope whose week it is. */}
        {scope === "mine" && (
          <button
            type="button"
            disabled={weekUnbilled.length === 0}
            title={
              weekUnbilled.length === 0
                ? "Nothing unbilled this week"
                : "Open the invoice composer with this week ticked"
            }
            onClick={() =>
              openInvoiceComposer({
                // One document → land scoped; several → the composer asks and
                // ticks that document's share of the week (R75).
                projectId:
                  weekUnbilledProjects.length === 1
                    ? weekUnbilledProjects[0]
                    : undefined,
                initialTimeEntryIds: weekUnbilled.map((e) => e.id),
              })
            }
            className="whitespace-nowrap rounded-[3px] border border-[rgba(196,165,123,0.4)] px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--color-clay-ink)] transition-colors hover:bg-[var(--color-clay)] hover:text-white disabled:border-[var(--color-pearl)] disabled:text-[var(--color-aged-oak)] disabled:hover:bg-transparent"
          >
            Bill week → Accounts
          </button>
        )}
      </div>

      {/* HT-8 — the scope lens: two to four DM-mono words, scored. Absent for a
          plain member, whose sheet is her own hours and her project totals. */}
      {viewerIsOwnerOrAdmin && lensWords.length > 1 && (
        <p
          role="group"
          aria-label="Hours scope"
          className="mb-4 flex flex-wrap items-baseline gap-x-3 border-b border-[var(--color-pearl)]/70 pb-2"
        >
          {lensWords.map(([key, label]) => {
            const on = scope === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setScope(key);
                  setShowEntries(false);
                }}
                aria-current={on ? "true" : undefined}
                className={`da-score-hover min-h-11 inline-flex items-center t-head transition-colors ${
                  on
                    ? "da-score-on text-[var(--color-charcoal)]"
                    : "text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </p>
      )}

      {/* W5 (HT-20) — the Export act, beside the studio scope. "Export" now
          means a file: the invoice hand-off act below is named "Bill week →
          Accounts" precisely so the two are never confused (plan-v2 §6). */}
      {scope === "studio" && (
        <div className="-mt-2 mb-4">
          <DocumentAction
            actionKey="export-time-csv"
            surfaceKey="hours"
            regionKey="scope-readout"
            variant="tertiary"
            disabled={studioExportRows.length === 0}
            title={
              studioExportRows.length === 0
                ? "Nothing to export this window"
                : "Download every entry in this window as a CSV"
            }
            onClick={exportCsv}
          >
            Export → CSV
          </DocumentAction>
        </div>
      )}

      {/* Until the membership read answers, this sheet does not know whose hours
          it is about, so it says that rather than painting a scope it may have
          to take back. */}
      {scope === null && (
        <p className="py-3 t-body-sm italic text-[var(--color-aged-oak)]">
          Reading&hellip;
        </p>
      )}

      {/* Front-matter (R5): utilization — the shown week + the balance. */}
      {scope === "mine" && (
        <LedgerFrontMatter
          caption="utilization"
          stats={[
            {
              label: `logged ${weekLabel}`,
              value: fmtMinutes(util.totalMinutes),
            },
            ...(util.billablePct !== null
              ? [{ label: "billable", value: `${util.billablePct}%` }]
              : []),
            ...((openEstimateMinutes ?? 0) > 0 && weekOffset === 0
              ? [
                  {
                    label: "of open work est.",
                    value: fmtMinutes(openEstimateMinutes ?? 0),
                  },
                ]
              : []),
          ]}
        />
      )}

      {/* The band is un-scoped: after 00605/00606 an owner reads the STUDIO's
          pending-authority hours, across documents that are not the person the
          member scope names. It stands in the one scope that claims no one
          else's week. */}
      {scope === "mine" && (
        <PendingTimeAuthorizationBand
          rows={pendingAuthorizationRows ?? []}
          projects={projects ?? []}
          onSelectProject={setLensProjectId}
          showStudioRateDoor={viewerIsOwnerOrAdmin}
        />
      )}

      {/* A project-scoped Hours sheet carries the same RPC-owned authority
          readout as the open project document. Studio-wide mode stays a
          cross-project ledger rather than inventing an aggregate cap. */}
      {lensProjectId && (
        <ProjectAuthorityBandForProject projectId={lensProjectId} />
      )}

      {/* A refused or failed read of that column is its own fact, and the only
          money read on this sheet that used to pass in silence: without an arm
          here the project scope rendered no line, no rollup and no sentence, and
          the owner saw the entries act standing alone. */}
      {scope === "project" && lensProjectId && lensPricingStudio.isError && (
        <p
          role="alert"
          className="-mt-1 mb-4 t-head"
          style={{ color: TERRACOTTA_INK }}
        >
          Which studio prices this document could not be read.
        </p>
      )}

      {/* HT-3-e(3) — which studio prices this document's hours, said out loud.
          An unnamed one is why every hour here reads "rate pending". */}
      {scope === "project" &&
        lensProjectId &&
        lensPricingStudioId !== undefined && (
          <PricingStudioLine
            projectId={lensProjectId}
            pricingStudioId={lensPricingStudioId}
            studioName={
              lensPricingStudioId
                ? (studioNames.get(lensPricingStudioId) ?? null)
                : null
            }
            viewerStudioId={viewerStudio?.id ?? null}
            viewerIsOwnerOrAdmin={viewerIsOwnerOrAdmin}
          />
        )}

      {/* HT-10-a — a viewer with no lens reads her own rows only (00606), so the
          one DEFINER function is where the house's hours add up for her. Above
          the rows, per HT-30. An owner has the lens and the rollup instead. */}
      {lensProjectId && standingKnown && !viewerIsOwnerOrAdmin && (
        <MemberProjectTotal projectId={lensProjectId} />
      )}

      {/* HT-30 — the totals are the front matter of the rows that produced
          them, and the rows are one act away (HT-36: aggregate by default).
          The rollup is keyed on the studio whose hours it sums: the viewer's own
          for the member and studio scopes, and — because 00607 filters on the
          entry's pricing studio — the studio that PRICES the document for the
          project scope. Keyed on the viewer's instead, a document another studio
          prices returned zero rows above entries the fact view does read. */}
      {scope !== null &&
        scope !== "mine" &&
        viewerIsOwnerOrAdmin &&
        viewerStudio &&
        (scope === "project" ? (
          lensProjectId && lensPricingStudioId ? (
            <ScopeRollup
              scope={scope}
              studioId={lensPricingStudioId}
              memberId={null}
              memberName={memberScope?.name ?? null}
              projectId={lensProjectId}
              groupBy={groupBy}
              onGroupBy={setGroupBy}
              from={fromDate}
              to={toDate}
              weekLabel={weekLabel}
            />
          ) : lensProjectId && lensPricingStudioId === null ? (
            <p className="mb-4 py-2 t-body-sm italic text-[var(--color-aged-oak)]">
              No studio prices this document yet, so its hours do not add up to
              a studio&rsquo;s week. Name one above and they gain a rate.
            </p>
          ) : null
        ) : (
          <ScopeRollup
            scope={scope}
            studioId={viewerStudio.id}
            // Whose week this is, named: a viewer with two studios reads one of
            // them, and "the studio · this week" said which of them it was not.
            studioName={viewerStudio.name}
            memberId={scope === "member" ? (memberScope?.id ?? null) : null}
            memberName={memberScope?.name ?? null}
            projectId={null}
            groupBy={groupBy}
            onGroupBy={setGroupBy}
            from={fromDate}
            to={toDate}
            weekLabel={weekLabel}
          />
        ))}

      {scope !== null && scope !== "mine" && (
        <div className="mb-4">
          <DocumentAction
            actionKey="show-scope-time-entries"
            surfaceKey="hours"
            regionKey="scope-readout"
            variant="tertiary"
            aria-expanded={showEntries}
            aria-controls="hours-scope-entries"
            onClick={() => setShowEntries((open) => !open)}
          >
            {showEntries ? "Hide the entries" : "The entries"}
          </DocumentAction>
          {showEntries && (
            <div id="hours-scope-entries">
              {/* The member scope carries the SAME studio as its total: 00607
                  filters the rollup on `ledger.studio_id`, so without it here
                  the rows beneath a member's week included every row RLS let the
                  caller read for her — legacy "rate pending" hours the total
                  excludes, and a second studio's for a viewer with two. */}
              <ScopeEntries
                studioId={
                  scope === "studio" || scope === "member"
                    ? (viewerStudio?.id ?? null)
                    : null
                }
                memberId={scope === "member" ? (memberScope?.id ?? null) : null}
                projectId={scope === "project" ? lensProjectId : null}
                from={fromDate}
                to={toDate}
                studioNames={studioNames}
              />
            </div>
          )}
        </div>
      )}

      {/* R77 — the all-time unbilled balance, with its one act.
          HT-30 — it is a money total whose rows this sheet never lists, and it
          is keyed on the lens alone, so in a scope captioned with someone
          else's name it read as that person's balance and put a primary
          billing act under their caption. The one scope it belongs to is the
          one that names nobody else. (The project scope could carry the
          document's own unbilled rows-with-total, but only listed beneath it —
          the entries act there lists the WEEK's ledger rows, a different set —
          so it is hidden rather than captioned into a half-truth.) */}
      {scope === "mine" && unbilledMinutes > 0 && (
        <div className="-mt-2 mb-4 flex flex-wrap items-baseline gap-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
          <span className="text-[var(--color-clay-ink)]">
            unbilled · all time
          </span>
          <span className="text-[var(--color-charcoal)]">
            {fmtUsd(unbilledCents)} · {fmtMinutes(unbilledMinutes)}
          </span>
          {unbilledProjects.length > 1 && (
            <span>· {unbilledProjects.length} documents</span>
          )}
          {!lensProjectId && unbilledProjects.length > 1 && (
            <select
              aria-label="Project to bill"
              value={billingTargetProjectId ?? ""}
              onChange={(event) => setBillingProjectId(event.target.value)}
              className="rounded-[3px] border border-[var(--color-pearl)] bg-white px-2 py-1 text-[11px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none [&_option]:bg-[var(--doc-paper)]"
            >
              <option value="">Choose a document…</option>
              {unbilledProjects.map((projectId) => (
                <option key={projectId} value={projectId}>
                  {(projects ?? []).find((project) => project.id === projectId)
                    ?.name ?? "Untitled project"}
                </option>
              ))}
            </select>
          )}
          <DocumentAction
            actionKey="bill-unbilled-time"
            surfaceKey="hours"
            regionKey="unbilled-balance"
            variant="primary"
            disabled={!billingTargetProjectId || billingTargetRows.length === 0}
            onClick={() =>
              openInvoiceComposer({
                projectId: billingTargetProjectId ?? undefined,
                initialTimeEntryIds: billingTargetRows.map(
                  (row) => row.id as string,
                ),
              })
            }
          >
            Bill it
          </DocumentAction>
        </div>
      )}

      {note && (
        <p
          role="alert"
          className="mb-3 rounded-[3px] border border-[rgba(196,131,111,0.4)] px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.05em]"
          style={{ color: TERRACOTTA_INK }}
        >
          {note}
        </p>
      )}

      {/* The zero-entries state (help-desk Wave 1, copy §E.3): nothing this
          week AND no unbilled balance anywhere reads as "never logged" — the
          teaching state. A designer with history keeps the quiet week lines. */}
      {scope === "mine" &&
        days.length === 0 &&
        (weekOffset === 0 && unbilledMinutes === 0 ? (
          <div className="py-4">
            <p className="font-heading text-[15px] italic text-[var(--color-charcoal)]">
              No hours logged yet
            </p>
            <p className="mt-1.5 max-w-[52ch] text-[12px] leading-relaxed text-[var(--color-aged-oak)]">
              Time logs itself while a document is in your hand; you can also
              add an entry by hand. What you track here is what you draw onto an
              invoice later.
            </p>
          </div>
        ) : (
          <p className="py-3 text-[12px] italic text-[var(--color-aged-oak)]">
            {weekOffset === 0
              ? "Nothing logged this week — pick up a document and the time follows."
              : "Nothing logged that week."}
          </p>
        ))}

      {scope === "mine" &&
        days.map(([day, rows]) => (
          <section key={day} className="mb-4">
            <p className="mb-1 flex items-baseline justify-between font-mono text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--color-clay-ink)]">
              <span>
                {day === todayKey ? "Today" : fmtDay(rows[0].started_at)}
              </span>
              <span className="text-[var(--color-aged-oak)]">
                {fmtMinutes(
                  rows.reduce((s, e) => s + (e.duration_minutes ?? 0), 0),
                )}
              </span>
            </p>
            <ul>
              {rows.map((e) => (
                <EntryRow
                  key={e.id}
                  entry={e}
                  unbilled={unbilledById.get(e.id)}
                  viewerStudioId={viewerStudio?.id ?? null}
                  viewerIsOwnerOrAdmin={viewerIsOwnerOrAdmin}
                  onCommit={commit}
                  onOpenAuthority={setLensProjectId}
                  onDeleted={() => {
                    void refetch();
                    void refetchUnbilled();
                  }}
                />
              ))}
            </ul>
          </section>
        ))}

      {/* Batch add — the prototype's hours-add row. `useCreateTimeEntry` writes
          `user_id = auth.uid()`, so this row logs against the VIEWER whatever
          the caption above says. Standing under another person's name it read
          as a capture row for her hours and wrote them to him; entering an hour
          on someone else's behalf is a deliberate act, not a shared form. */}
      {scope === "mine" && (
        <div className="mt-4">
          {/* Five tracks on a sheet 289px wide laid out at their intrinsic widths and
          walked off the edge: measured at 390, Date started at x=383 and Add
          ended at x=683, with no sideways scroll to reach either. Two columns
          until there is room for five, and every field `min-w-0` so a track can
          actually shrink — WebKit collapsed the date track to 0px otherwise
          (W3-R3-M1). */}
          <div className="grid grid-cols-2 items-center gap-2 min-[700px]:grid-cols-[1.2fr_0.7fr_0.9fr_1fr_auto]">
            <select
              aria-label="Project"
              className={`${ADD_FIELD_CLASS} [&_option]:bg-[var(--doc-paper)]`}
              value={addProject}
              onChange={(e) => setAddProject(e.target.value)}
            >
              <option value="">Document…</option>
              {(projects ?? [])
                .filter((project) => project.status === "active")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <input
              type="number"
              min={1}
              placeholder="Minutes"
              aria-label="Minutes"
              className={ADD_FIELD_CLASS}
              value={addMinutes}
              onChange={(e) => setAddMinutes(e.target.value)}
            />
            {/* HT-13 — the day the hour was worked. Any date; the entry lands on
            `started_at`, not on `created_at`. */}
            <input
              type="date"
              aria-label="Date"
              className={ADD_FIELD_CLASS}
              value={addDate}
              onChange={(e) => setAddDate(e.target.value)}
            />
            <select
              aria-label="Activity"
              className={`${ADD_FIELD_CLASS} [&_option]:bg-[var(--doc-paper)]`}
              value={addActivity}
              onChange={(e) => setAddActivity(e.target.value)}
            >
              {/* HT-24 — the honest first answer, not a silent 'design'. */}
              <option value="">activity not set</option>
              {ACTIVITIES.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
            <DocumentAction
              actionKey="add-time-entry"
              surfaceKey="hours"
              regionKey="batch-entry"
              variant="primary"
              className="col-span-2 min-[700px]:col-span-1"
              disabled={!addValid || addBusy}
              loading={addBusy}
              loadingLabel="Adding…"
              onClick={() => void batchAdd()}
            >
              Add
            </DocumentAction>
          </div>
          {/* HT-11/HT-12/HT-41 — the same controls every other capture surface
          carries, seeded from the resolved answer for the document picked.
          plan-v2 §4's "rate readout" is served HERE by HT-12's reason sentence
          and by nothing else: the resolved rate is not knowable before the row
          is written (`resolve_time_rate_cents` is REVOKEd from `authenticated`,
          00599, W1-R7-04), so a figure re-derived in the browser would be a
          false fact. The written rows carry the real readout. */}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <BillablePill
              value={addBillable}
              onChange={stateAddBillable}
              reason={
                addIntent.isSettled || addIntent.unreadable
                  ? addIntent.sentence
                  : null
              }
              disabled={addBusy}
              surfaceKey="hours"
              regionKey="batch-entry"
            />
            <RateRoleChip
              projectId={addProject || null}
              value={addRateRole}
              onChange={setAddRateRole}
              disabled={addBusy}
            />
            {Date.now() - new Date(startedAtFromDateValue(addDate)).getTime() >
              BACKDATE_MARK_DAYS * 86_400_000 && (
              <span className="t-head text-[var(--color-aged-oak)]">
                backdated
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const SCOPE_CAPTION: Record<HoursScope, string> = {
  mine: "mine",
  member: "this person",
  project: "this document",
  studio: "the studio",
};

/**
 * HT-3-e(3) / HT-3-g — the studio that prices this document's hours. Where the
 * column is unnamed every hour on it resolves 'none', so the line carries the
 * repair: naming it is an act only an owner or admin of a studio that employs
 * the document's designer may take, and the server decides, not this button.
 */
function PricingStudioLine({
  projectId,
  pricingStudioId,
  studioName,
  viewerStudioId,
  viewerIsOwnerOrAdmin,
}: {
  projectId: string;
  pricingStudioId: string | null;
  studioName: string | null;
  viewerStudioId: string | null;
  viewerIsOwnerOrAdmin: boolean;
}) {
  const stampStudio = useStampProjectPricingStudio();
  const [note, setNote] = useState<string | null>(null);

  return (
    <p className="-mt-1 mb-4 flex flex-wrap items-baseline gap-2 t-head text-[var(--color-aged-oak)]">
      <span className="text-[var(--color-clay-ink)]">priced by</span>
      <span className="text-[var(--color-charcoal)]">
        {pricingStudioId
          ? (studioName ?? "another studio")
          : "no studio yet — hours here read “rate pending”"}
      </span>
      {!pricingStudioId && viewerIsOwnerOrAdmin && viewerStudioId && (
        <DocumentAction
          actionKey="stamp-project-pricing-studio"
          surfaceKey="hours"
          regionKey="scope-pricing-studio"
          variant="tertiary"
          disabled={stampStudio.isPending}
          loading={stampStudio.isPending}
          loadingLabel="Naming…"
          onClick={() => {
            setNote(null);
            stampStudio.mutate(
              { projectId, studioId: viewerStudioId },
              {
                onError: (err) =>
                  setNote(
                    err instanceof Error
                      ? err.message
                      : "The studio could not be named on this document.",
                  ),
              },
            );
          }}
        >
          Name your studio
        </DocumentAction>
      )}
      {note && (
        <span role="alert" style={{ color: TERRACOTTA_INK }}>
          {note}
        </span>
      )}
    </p>
  );
}

/**
 * The aggregate a scope answers with (00607, SECURITY INVOKER — RLS decides what
 * it can see, and these props carry no secret). The grand total sits above the
 * buckets that produced it (HT-30), the buckets never carry notes (HT-36), and
 * internal time stands in its own group rather than quietly padding a billable
 * line.
 */
function ScopeRollup({
  scope,
  studioId,
  studioName = null,
  memberId,
  memberName,
  projectId,
  groupBy,
  onGroupBy,
  from,
  to,
  weekLabel,
}: {
  scope: HoursScope;
  studioId: string;
  /** The studio this total belongs to, named — never left to be inferred. */
  studioName?: string | null;
  memberId: string | null;
  memberName: string | null;
  projectId: string | null;
  groupBy: TimeHoursGroupBy;
  onGroupBy: (groupBy: TimeHoursGroupBy) => void;
  from: string;
  to: string;
  weekLabel: string;
}) {
  const rollup = useStudioHoursRollup({
    studioId,
    from,
    to,
    groupBy,
    userId: memberId,
    projectId,
  });
  const rows = rollup.data ?? [];
  const totalMinutes = rows.reduce((sum, row) => sum + row.total_minutes, 0);
  const billableCents = rows.reduce((sum, row) => sum + row.billable_cents, 0);
  const entryCount = rows.reduce((sum, row) => sum + row.entry_count, 0);
  // 00607:151-155 — `billable_minutes`/`billable_cents` and `internal_minutes`
  // can count the SAME row, so a bucket printed in both lists was read twice by
  // anyone adding the page up. The two lists are disjoint: a bucket that is
  // ENTIRELY internal stands under "— internal —" and nowhere else, and a mixed
  // bucket keeps its internal share as a clause on its own row.
  const isAllInternal = (row: (typeof rows)[number]) =>
    row.internal_minutes > 0 && row.internal_minutes === row.total_minutes;
  const internal = rows.filter(isAllInternal);
  const billableBuckets = rows.filter((row) => !isAllInternal(row));

  return (
    <section className="mb-4">
      <p className="t-head text-[var(--color-clay-ink)]">
        {scope === "member"
          ? (memberName ?? SCOPE_CAPTION.member)
          : SCOPE_CAPTION[scope]}
        {studioName ? ` · ${studioName}` : ""} · {weekLabel}
      </p>
      {/* A studio's money is never summed from rows that have not arrived, and
          never from rows that were REFUSED: an unread rollup used to print
          "0 min" as the grand total — above the terracotta line saying it could
          not be read. While it is reading the figure says so; when the read
          fails there is no total at all. */}
      {rollup.isPending ? (
        <p className="mt-0.5 t-money text-[var(--color-aged-oak)]">Reading…</p>
      ) : rollup.isError ? null : (
        <p className="mt-0.5 t-money text-[var(--color-charcoal)]">
          {fmtMinutes(totalMinutes)}
          {billableCents > 0 && (
            <>
              {" "}
              <span className="text-[var(--color-aged-oak)]">·</span>{" "}
              {fmtUsd(billableCents)} billable
            </>
          )}
          {entryCount > 0 && (
            <span className="ml-2 t-head text-[var(--color-aged-oak)]">
              {entryCount} {entryCount === 1 ? "entry" : "entries"}
            </span>
          )}
        </p>
      )}

      <p
        role="group"
        aria-label="Group hours"
        className="mt-1.5 flex flex-wrap items-baseline gap-x-3"
      >
        {GROUP_BY.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onGroupBy(key)}
            aria-current={groupBy === key ? "true" : undefined}
            className={`da-score-hover min-h-11 inline-flex items-center t-head transition-colors ${
              groupBy === key
                ? "da-score-on text-[var(--color-charcoal)]"
                : "text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]"
            }`}
          >
            {label}
          </button>
        ))}
      </p>

      {rollup.isError ? (
        <p
          role="alert"
          className="mt-2 t-head"
          style={{ color: TERRACOTTA_INK }}
        >
          These hours could not be read —{" "}
          {rollup.error instanceof Error ? rollup.error.message : "try again"}
        </p>
      ) : rollup.isPending ? null : rows.length === 0 ? (
        <p className="py-3 t-body-sm italic text-[var(--color-aged-oak)]">
          Nothing logged in this window.
        </p>
      ) : (
        <ul className="mt-2">
          {billableBuckets.map((row) => (
            <li
              key={row.bucket_key}
              className="flex items-baseline justify-between gap-3 border-b border-[var(--color-pearl)] py-1.5"
            >
              <span className="min-w-0 t-body-sm text-[var(--color-charcoal)]">
                {row.bucket_label || row.member_name || "—"}
              </span>
              <span className="shrink-0 t-head text-[var(--color-aged-oak)]">
                {fmtMinutes(row.total_minutes)}
                {row.billable_minutes > 0 &&
                  ` · ${fmtMinutes(row.billable_minutes)} billable`}
                {row.internal_minutes > 0 &&
                  ` · ${fmtMinutes(row.internal_minutes)} internal`}
                {row.billable_cents > 0 && ` · ${fmtUsd(row.billable_cents)}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {internal.length > 0 && (
        <>
          <p className="mt-3 t-head text-[var(--color-aged-oak)]">
            — internal —
          </p>
          <ul>
            {internal.map((row) => (
              <li
                key={`internal-${row.bucket_key}`}
                className="flex items-baseline justify-between gap-3 border-b border-[var(--color-pearl)] py-1.5"
              >
                <span className="min-w-0 t-body-sm text-[var(--color-charcoal)]">
                  {row.bucket_label || row.member_name || "—"}
                </span>
                <span className="shrink-0 t-head text-[var(--color-aged-oak)]">
                  {fmtMinutes(row.internal_minutes)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * HT-10-a — what a rostered member keeps after 00606 narrowed her per-row read
 * to her own rows: the project's total, from the one DEFINER function, which
 * raises for a caller who is not on the project rather than answering zero.
 */
function MemberProjectTotal({ projectId }: { projectId: string }) {
  const total = useProjectHoursTotal(projectId);

  if (total.isError) {
    // Only 42501 is the function's own assert refusing a caller who is not on
    // the project. A network failure, a 500 or a missing RPC told a rostered
    // member something false about her standing.
    const code = (total.error as unknown as { code?: string } | null)?.code;
    return (
      <p
        role="alert"
        className="mb-4 py-2 t-body-sm italic text-[var(--color-aged-oak)]"
      >
        {code === "42501"
          ? "This document’s total is for its team — you are not on it."
          : "This document’s total could not be read."}
      </p>
    );
  }
  const data = total.data;
  return (
    <section className="mb-4">
      {/* HT-30 in substance, not only in order: this figure is the WHOLE team's
          all-time total on the document, and the rows under it are the viewer's
          own seven days — they cannot add up to it, and where she logged
          nothing this week it stood above "Nothing logged this week." So it
          says which is which. */}
      <p className="t-head text-[var(--color-clay-ink)]">
        this document · all time, for its whole team
      </p>
      {/* The function raises for a caller who is not on the project rather than
          answering zero, so a zero printed before it answers is a reading it
          never gave. */}
      {total.isPending ? (
        <p className="mt-0.5 t-money text-[var(--color-aged-oak)]">Reading…</p>
      ) : (
        <p className="mt-0.5 t-money text-[var(--color-charcoal)]">
          {fmtMinutes(data?.minutes ?? 0)}
          {(data?.billable_minutes ?? 0) > 0 && (
            <>
              {" "}
              <span className="text-[var(--color-aged-oak)]">·</span>{" "}
              {fmtMinutes(data?.billable_minutes ?? 0)} billable
            </>
          )}
          {(data?.amount_cents ?? 0) > 0 && (
            <>
              {" "}
              <span className="text-[var(--color-aged-oak)]">·</span>{" "}
              {fmtUsd(data?.amount_cents ?? 0)}
            </>
          )}
        </p>
      )}
      <p className="mt-0.5 t-body-sm italic text-[var(--color-aged-oak)]">
        Below, your own week.
      </p>
    </section>
  );
}

/**
 * The entries behind an aggregate (HT-36's detail act), read from the 00604 fact
 * view — which carries no `notes` column at all, so free text takes a second,
 * explicit act per row and reads the table.
 */
function ScopeEntries({
  studioId,
  memberId,
  projectId,
  from,
  to,
  studioNames,
}: {
  studioId: string | null;
  memberId: string | null;
  projectId: string | null;
  from: string;
  to: string;
  studioNames: Map<string, string>;
}) {
  const ledger = useTimeEntryLedger({
    studioId,
    userId: memberId,
    projectId,
    from,
    to,
    includeRunning: false,
  });
  const rows = ledger.data ?? [];

  if (ledger.isError) {
    return (
      <p role="alert" className="mt-2 t-head" style={{ color: TERRACOTTA_INK }}>
        These entries could not be read —{" "}
        {ledger.error instanceof Error ? ledger.error.message : "try again"}
      </p>
    );
  }
  // "No entries in this window." is an answer, so it waits for one.
  if (ledger.isPending) {
    return (
      <p className="py-2 t-body-sm italic text-[var(--color-aged-oak)]">
        Reading…
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="py-2 t-body-sm italic text-[var(--color-aged-oak)]">
        No entries in this window.
      </p>
    );
  }

  return (
    <ul className="mt-2">
      {rows.map((row) => (
        <ScopeEntryRow key={row.id} row={row} studioNames={studioNames} />
      ))}
    </ul>
  );
}

/** One entry as the studio reads it: the person first, then the document, the
 *  work, the money, and the studio that priced it. Read-only — an adjustment is
 *  made where the hour lives, not in an aggregate. */
function ScopeEntryRow({
  row,
  studioNames,
}: {
  row: TimeEntryLedgerRow;
  studioNames: Map<string, string>;
}) {
  const [showNote, setShowNote] = useState(false);
  // The fact view prints `resolved_rate_cents` (0 where nothing priced the
  // hour), not the entry column — so the provenance is read off the view's own
  // names rather than the table's.
  const provenance = timeRateProvenance(
    {
      hourly_rate_cents: row.resolved_rate_cents,
      rate_source: row.rate_source ?? null,
      rate_role: row.rate_role ?? null,
      billable: row.billable,
      billing_state: row.billing_state ?? null,
    },
    null,
  );

  // HT-26/HT-27's alarm fires wherever an unpriced hour RENDERS, and the scoped
  // rows are exactly where an admin sees other people's unpriced hours — the
  // instrument was blind to all of them while it watched only the viewer's own
  // week. The emitter dedups per entry, so a row an admin also holds herself is
  // still one event. `project_kind` is null here and only here: the fact view
  // (00604) carries no kind and this read must not grow a second query to
  // invent one.
  const scopedRatePending = provenance.kind === "pending";
  const scopedEntryId = row.id;
  const scopedProjectId = row.project_id;
  useEffect(() => {
    if (!scopedRatePending) return;
    documentEvents.time.rateUnresolved({
      entry_id: scopedEntryId,
      project_id: scopedProjectId,
      project_kind: null,
      rate_source: "none",
    });
  }, [scopedRatePending, scopedEntryId, scopedProjectId]);

  return (
    <li className="border-b border-[var(--color-pearl)] px-1 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="t-body-sm text-[var(--color-charcoal)]">
            {row.member_name ?? "A teammate"}
          </p>
          <p className="t-head text-[var(--color-aged-oak)]">
            {[
              row.project_name ?? "Project",
              row.day,
              row.activity ?? "activity not set",
              provenance.kind === "rated"
                ? `${provenance.label} · ${fmtUsd(provenance.hourlyRateCents)}/hr`
                : provenance.label,
              row.amount_cents > 0 ? fmtUsd(row.amount_cents) : null,
              row.studio_id
                ? `priced by ${studioNames.get(row.studio_id) ?? "another studio"}`
                : "no pricing studio",
              // HT-13 — the same derived word the viewer's own rows carry. The
              // fact view keeps both timestamps, so no second read is needed.
              isBackdatedEntry(row) ? "backdated" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 items-baseline gap-2.5">
          <span className="whitespace-nowrap t-head text-[var(--color-charcoal)]">
            {fmtMinutes(row.duration_minutes ?? 0)}
          </span>
          <span
            className="whitespace-nowrap rounded-[3px] border px-1.5 py-[2px] t-head"
            style={
              row.invoice_id
                ? {
                    // HT-40 — the state is the WORD, never the colour. Sage
                    // on paper is ~2.1:1, under WCAG AA's 4.5:1 and under
                    // even the large-text floor, and the studio scope
                    // multiplies these chips. The border keeps the quiet
                    // mark; the label reads in the body ink.
                    borderColor: "var(--color-sage)",
                    color: "var(--color-charcoal)",
                  }
                : {
                    borderColor: "var(--color-pearl)",
                    color: "var(--color-aged-oak)",
                  }
            }
          >
            {timeBillingStateLabel(row)}
          </span>
          <DocumentAction
            actionKey="show-time-entry-note"
            surfaceKey="hours"
            regionKey="scope-entry-row"
            variant="tertiary"
            aria-expanded={showNote}
            aria-controls={`hours-entry-note-${row.id}`}
            onClick={() => setShowNote((open) => !open)}
          >
            {showNote ? "Hide note" : "Note"}
          </DocumentAction>
        </div>
      </div>
      {showNote && (
        <ScopeEntryNote entryId={row.id} id={`hours-entry-note-${row.id}`} />
      )}
    </li>
  );
}

/** HT-36 — free text is read from the table, by an act, one entry at a time.
 *  It is never a column of the rollup or of the fact view. */
function ScopeEntryNote({ entryId, id }: { entryId: string; id: string }) {
  const note = useTimeEntryNote(entryId);

  return (
    <p id={id} className="mt-1 t-body-sm italic text-[var(--color-mocha)]">
      {note.isLoading
        ? "Reading…"
        : note.isError
          ? // An RLS refusal on `project_time_entries` is not an error: the
            // read returns no row and no error, so `maybeSingle()` yields
            // `{ data: null }` and lands on the arm below. Everything `isError`
            // can actually see is a failed read — network, 500, schema cache —
            // and calling that a standing problem told the viewer something
            // untrue about herself.
            "That note could not be read."
          : (note.data ?? "No note on this entry.")}
    </p>
  );
}

/** One entry line — inline-editable until billed; unbilled lines carry their
 *  view-resolved money and the R77 delete-with-confirm. */
function EntryRow({
  entry: e,
  unbilled,
  viewerStudioId,
  viewerIsOwnerOrAdmin,
  onCommit,
  onOpenAuthority,
  onDeleted,
}: {
  entry: AnyRecord;
  unbilled: UnbilledInfo | undefined;
  /** The viewer's own studio — the one a repair may name (HT-3-g(3)). */
  viewerStudioId: string | null;
  viewerIsOwnerOrAdmin: boolean;
  onCommit: (entry: AnyRecord, updates: AnyRecord) => void;
  onOpenAuthority: (projectId: string) => void;
  onDeleted: () => void;
}) {
  const deleteEntry = useDeleteTimeEntry({ errorSurface: "inline" });
  const stampStudio = useStampProjectPricingStudio();
  const [confirming, setConfirming] = useState(false);
  const [rowNote, setRowNote] = useState<string | null>(null);
  const billed = Boolean(e.invoice_id);
  const authority = useProjectBillingAuthority(e.project_id);
  const provenance = timeRateProvenance(e, authority.data);
  const billingLabel = timeBillingStateLabel(e);
  const amountCents = e.rated_amount_cents ?? unbilled?.amount_cents ?? 0;
  const pricingStudioId = (e.project?.studio_id as string | null) ?? null;
  const ratePending = provenance.kind === "pending";
  // HT-27's segmentation: the origin commercial document's kind IS what the
  // classifier means by a design-services project (`_is_design_services_project`,
  // 00578:2584). No origin document = a non-services project, measured.
  const projectKind =
    ((e.project?.origin_documents as AnyRecord[] | undefined) ?? []).find(
      (doc) => doc?.is_origin,
    )?.document_kind ?? "non_services";

  // HT-26/HT-27's alarm — an hour nobody can price. Fires once per entry per
  // session (the emitter dedups); a re-render is not a second unpriced hour.
  useEffect(() => {
    if (!ratePending) return;
    documentEvents.time.rateUnresolved({
      entry_id: e.id as string,
      project_id: e.project_id as string,
      project_kind: projectKind,
      rate_source: "none",
    });
  }, [ratePending, e.id, e.project_id, projectKind]);

  const stamp = () => {
    if (!viewerStudioId) return;
    setRowNote(null);
    stampStudio.mutate(
      { projectId: e.project_id as string, studioId: viewerStudioId },
      {
        onError: (err) =>
          setRowNote(
            err instanceof Error
              ? err.message
              : "The studio could not be named on this document.",
          ),
      },
    );
  };

  const doDelete = async () => {
    setRowNote(null);
    try {
      await deleteEntry.mutateAsync({ id: e.id, projectId: e.project_id });
      documentEvents.time.entryDeleted({ by_admin: false });
      onDeleted();
    } catch (err) {
      setRowNote(err instanceof Error ? err.message : "Could not delete");
      setConfirming(false);
    }
  };

  return (
    <li className="border-b border-[var(--color-pearl)] px-1 py-2">
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3">
        <div className="min-w-0">
          <p className="t-body-sm text-[var(--color-charcoal)]">
            {e.project?.name ?? "Project"}
          </p>
          <p className="t-head text-[var(--color-aged-oak)]">
            {[
              e.phase_key,
              SOURCE_LABEL[e.source] ?? e.source,
              // HT-26 — the rate and where it came from, and never a blank:
              // "rate pending" is a fact, an empty cell is three different
              // facts wearing the same face.
              provenance.kind === "rated"
                ? `${provenance.label} · ${fmtUsd(provenance.hourlyRateCents)}/hr${provenance.version ? ` · v${provenance.version}` : ""}`
                : provenance.label,
              // New rows use the server-rated snapshot; legacy rows retain
              // the project_unbilled_time amount alias.
              amountCents > 0 ? fmtUsd(amountCents) : null,
              // HT-13 — an hour remembered a month late says so, in the row's
              // own ink. A derived word, no column, no colour (HT-40).
              isBackdatedEntry(e) ? "backdated" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {/* HT-11/HT-41 — billable is stated on the row that carries it, and
              (only for a member holding more than one seat) which role priced
              it. A billed entry is history: the pill is held. */}
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <BillablePill
              value={e.billable === true}
              onChange={(next) => onCommit(e, { billable: next })}
              disabled={billed}
              surfaceKey="hours"
              regionKey="time-entry-actions"
            />
            <RateRoleMark
              projectId={e.project_id as string}
              role={(e.rate_role as TimeRateRole | null) ?? null}
            />
          </span>
        </div>
        <select
          aria-label="Activity"
          disabled={billed}
          className="rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-1.5 py-1 text-[11px] text-[var(--color-mocha)] focus:border-[var(--color-clay)] focus:outline-none disabled:opacity-40 [&_option]:bg-[var(--doc-paper)]"
          value={e.activity ?? ""}
          onChange={(ev) => onCommit(e, { activity: ev.target.value || null })}
        >
          <option value="">—</option>
          {ACTIVITIES.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          aria-label="Duration (minutes)"
          disabled={billed}
          className="w-[64px] rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-1.5 py-1 text-right text-[11px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none disabled:opacity-40"
          defaultValue={e.duration_minutes}
          onBlur={(ev) => {
            const v = parseInt(ev.target.value, 10);
            if (Number.isFinite(v) && v >= 1 && v !== e.duration_minutes)
              onCommit(e, { duration_minutes: v });
          }}
        />
        {e.billing_state === "pending_authorization" && !billed ? (
          <button
            type="button"
            aria-label={`Review billing authority for ${e.project?.name ?? "this document"}`}
            onClick={() => onOpenAuthority(e.project_id as string)}
            className="min-h-11 inline-flex items-center whitespace-nowrap rounded-[3px] border border-[var(--color-pearl)] px-1.5 t-head text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]"
          >
            {billingLabel} →
          </button>
        ) : (
          <span
            className="whitespace-nowrap rounded-[3px] border px-1.5 py-[2px] t-head"
            style={
              billed
                ? {
                    // HT-40 — the state is the WORD, never the colour. Sage
                    // on paper is ~2.1:1, under WCAG AA's 4.5:1 and under
                    // even the large-text floor, and the studio scope
                    // multiplies these chips. The border keeps the quiet
                    // mark; the label reads in the body ink.
                    borderColor: "var(--color-sage)",
                    color: "var(--color-charcoal)",
                  }
                : {
                    borderColor: "var(--color-pearl)",
                    color: "var(--color-aged-oak)",
                  }
            }
          >
            {billingLabel}
          </span>
        )}
        {/* R77 — delete-with-confirm; a billed entry is history, immutable. */}
        {!billed ? (
          confirming ? (
            <DocumentActionGroup
              surfaceKey="hours"
              regionKey="delete-entry-confirmation"
              className="items-center"
            >
              <span className="text-[var(--color-aged-oak)]">delete?</span>
              <DocumentAction
                actionKey="confirm-delete-time-entry"
                variant="danger"
                disabled={deleteEntry.isPending}
                loading={deleteEntry.isPending}
                loadingLabel="Deleting…"
                onClick={() => void doDelete()}
              >
                Delete
              </DocumentAction>
              <DocumentAction
                actionKey="cancel-delete-time-entry"
                variant="tertiary"
                onClick={() => setConfirming(false)}
              >
                Keep
              </DocumentAction>
            </DocumentActionGroup>
          ) : (
            <DocumentAction
              actionKey="open-delete-time-entry-confirmation"
              surfaceKey="hours"
              regionKey="time-entry-actions"
              variant="tertiary"
              aria-label="Delete entry"
              onClick={() => setConfirming(true)}
              className="text-[13px] leading-none text-[var(--color-aged-oak)] decoration-transparent hover:text-[var(--color-terracotta-ink)]"
            >
              ×
            </DocumentAction>
          )
        ) : (
          <span aria-hidden className="w-[13px]" />
        )}
      </div>
      {/* HT-26 + HT-3-g — an hour with no rate has two repairs, and which one
          it is depends on whether the document names a pricing studio at all.
          Both are the studio's act: owner or admin only. */}
      {ratePending && viewerIsOwnerOrAdmin && (
        <div className="mt-1 flex flex-wrap items-baseline gap-3">
          {pricingStudioId === null && viewerStudioId ? (
            <DocumentAction
              actionKey="stamp-project-pricing-studio"
              surfaceKey="hours"
              regionKey="time-entry-rate-pending"
              variant="tertiary"
              disabled={stampStudio.isPending}
              loading={stampStudio.isPending}
              loadingLabel="Naming…"
              onClick={stamp}
            >
              Name the studio that prices this document
            </DocumentAction>
          ) : (
            <Link
              href="/desk?account=studio"
              className="min-h-11 inline-flex items-center t-head text-[var(--color-clay-ink)] underline decoration-dotted underline-offset-4 hover:text-[var(--color-charcoal)]"
            >
              Set the studio rate →
            </Link>
          )}
        </div>
      )}
      {rowNote && (
        <p
          role="alert"
          className="mt-1 font-mono text-[11px] uppercase tracking-[0.05em]"
          style={{ color: TERRACOTTA_INK }}
        >
          {rowNote}
        </p>
      )}
    </li>
  );
}
