/**
 * CP-01 package reading. The reading is the RPC-shaped payload of
 * get_project_external_fulfilments (00884), built from the native
 * e2e/round8/cabinetry-cp01-fixture.sql rows (same ids, actors and events), and
 * it reaches the chapter through the REAL useExternalFulfilmentReadings hook and
 * its validator. Only the Supabase transport is mocked (createBrowserClient.rpc);
 * the drawing record, roster, decisions, rooms and configuration joins are mocked
 * hook results. This proves the reading and rendering rules against the hook's
 * contract. It does NOT prove the native reader, authenticated activation or any
 * recorded act (see the native readback and the Playwright spec).
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import {
  useCoordinationItems,
  useExternalFulfilmentReadings,
  usePlanRoom,
  useProductConfiguration,
  useProjectRooms,
  useProjectRoster,
  type ExternalFulfilmentReading,
} from "@patina/supabase";
import { CabinetryChapter } from "../../paper/chapters/cabinetry-chapter";
import { readPackage } from "../package-reading";

const mockRpc = jest.fn();
jest.mock("@patina/supabase/client", () => ({
  ...jest.requireActual("@patina/supabase/client"),
  createBrowserClient: () => ({ rpc: mockRpc }),
}));
jest.mock("@patina/supabase", () => ({
  ...jest.requireActual("@patina/supabase"),
  usePlanRoom: jest.fn(),
  useProjectRoster: jest.fn(),
  useCoordinationItems: jest.fn(),
  useProjectRooms: jest.fn(),
  useProductConfiguration: jest.fn(),
}));

const ok = (data: unknown) => ({ data, isPending: false, isError: false, refetch: jest.fn() });
const failed = { data: undefined, isPending: false, isError: true, refetch: jest.fn() };
const pending = { data: undefined, isPending: true, isError: false, refetch: jest.fn() };

// Ids, actors and facts of cabinetry-cp01-fixture.sql.
const cp = (n: number) => `f2079000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const DESIGNER = "f0180000-0000-4000-8000-000000000002";
const SAM = cp(11);
const ANA = cp(12);
const PROJECT = cp(201);
const EDITION = cp(301);
const FULFILMENT = cp(401);
const DECISION_SHOP = cp(601);
const DECISION_HW = cp(602);
const REVISION = cp(701);
const PACKAGE_ID = cp(801);
const GC_SEAT = cp(811);
const ISSUE_A = cp(821);
const ISSUE_B = cp(822);
const AUTHORITY = cp(850);
const MANIFEST = cp(851);
// Beyond the native fixture, for scenarios it does not seed.
const DECISION_OLD = cp(603);
const DECISION_K5 = cp(604);
const ISSUE_C = cp(823);
const CONFIG = cp(861);
const ROOM = cp(951);
const H1 = "1".repeat(64);
const H2 = "2".repeat(64);

type Event = ExternalFulfilmentReading["reading"]["events"][number];
type Binding = ExternalFulfilmentReading["reading"]["bindings"][number];
type TypedMember = ExternalFulfilmentReading["reading"]["manifests"][number]["typed_members"][number];

const event = (seq: number, kind: string, extra: Partial<Event> = {}): Event => ({
  id: cp(1000 + seq),
  fulfilment_id: FULFILMENT,
  event_seq: seq,
  event_kind: kind,
  evidence: {},
  evidence_level: "reported",
  recorded_by: DESIGNER,
  // Deliberately NOT monotonic with event_seq: order is the server's sequence.
  recorded_at: `2026-10-${String(30 - seq).padStart(2, "0")}T12:00:00Z`,
  verified_by: null,
  verified_at: null,
  verification_seq: null,
  affected_units: null,
  releases_event_id: null,
  plan_issue_id: null,
  actor_id: null,
  authority_id: null,
  manifest_id: null,
  manifest_hash: null,
  amount_cents: null,
  evidence_route: null,
  coverage: null,
  ...extra,
});

const typedMember = (n: number, column: keyof TypedMember, value: string): TypedMember => ({
  id: cp(n),
  manifest_id: MANIFEST,
  approval_artifact_id: null,
  coordination_item_revision_id: null,
  custom_commission_revision_id: null,
  plan_issue_id: null,
  plan_issue_print_id: null,
  plan_print_id: null,
  po_spec_snapshot_id: null,
  product_configuration_id: null,
  review_item_id: null,
  [column]: value,
});

const binding = (n: number, decision: string, units: string[], issue: string, hash: string | null = null): Binding => ({
  id: cp(n),
  fulfilment_id: FULFILMENT,
  decision_id: decision,
  units,
  covers_plan_issue_id: issue,
  covers_configuration_snapshot_hash: hash,
  bound_by: DESIGNER,
  bound_at: "2026-10-05T00:00:00Z",
});

const verified = (seq: number, kind: string, verificationSeq: number, extra: Partial<Event> = {}) =>
  event(seq, kind, {
    evidence_level: "verified",
    verified_by: SAM,
    verified_at: "2026-10-28T00:00:00Z",
    verification_seq: verificationSeq,
    ...extra,
  });

/** The native CP-01 reading, plus a k-6 submittal bound to the superseded issue A. */
function nativeReading(): ExternalFulfilmentReading {
  return {
    id: FULFILMENT,
    project_id: PROJECT,
    scope_edition_id: EDITION,
    package_key: "pkg.cp01",
    units: ["k-1", "k-2", "k-3", "k-4", "k-5", "k-6"],
    kind: "gc_cabinetry",
    buyer_party_kind: "gc",
    payer_party_kind: "gc",
    contracting_party_kind: "gc",
    party_engagement_id: GC_SEAT,
    configuration_id: null,
    reported_price_cents: 2_840_000,
    price_visibility: "studio_only",
    status: "received",
    created_by: DESIGNER,
    created_at: "2026-10-01T00:00:00Z",
    client_request_id: "cp01-fulfilment",
    request_hash: "fixture",
    reading: {
      package_id: PACKAGE_ID,
      bindings: [
        binding(501, DECISION_SHOP, ["k-1", "k-2"], ISSUE_B),
        binding(502, DECISION_OLD, ["k-6"], ISSUE_A),
      ],
      verifications: [{ event_id: cp(1003), fulfilment_id: FULFILMENT, verified_by: SAM }],
      manifests: [
        {
          id: MANIFEST,
          project_id: PROJECT,
          package_id: PACKAGE_ID,
          purpose: "fabrication_instruction",
          manifest_hash: "c".repeat(64),
          created_by: DESIGNER,
          created_at: "2026-10-06T00:00:00Z",
          members: [
            { kind: "plan_issue", id: ISSUE_B, version: 2, sha256: "2".repeat(64) },
            { kind: "coordination_item_revision", id: REVISION, rev: 1, sha256: "7".repeat(64) },
          ],
          typed_members: [
            typedMember(852, "plan_issue_id", ISSUE_B),
            typedMember(853, "coordination_item_revision_id", REVISION),
          ],
        },
      ],
      events: [
        event(1, "package_issued", { plan_issue_id: ISSUE_A, evidence: { planIssueId: ISSUE_A, configurationSnapshotHash: null } }),
        event(2, "package_issued", { plan_issue_id: ISSUE_B, evidence: { planIssueId: ISSUE_B, configurationSnapshotHash: null } }),
        // Recorded by the designer, verified by Sam: Sam's verification stays Sam's.
        verified(3, "contract_reported", 1, { evidence: { contractAmountCents: 2_750_000 } }),
        event(4, "fabrication_instruction", {
          evidence: { manifestId: MANIFEST, authorizingPartyId: GC_SEAT },
          affected_units: ["k-1", "k-2"],
          authority_id: AUTHORITY,
          manifest_id: MANIFEST,
          manifest_hash: "c".repeat(64),
          amount_cents: 900_000,
          actor_id: DESIGNER,
          evidence_route: "shop_drawing",
          coverage: [
            { unit: "k-1", revisionIds: [REVISION] },
            { unit: "k-2", revisionIds: [REVISION] },
          ],
        }),
        event(5, "hold", { affected_units: ["k-3", "k-4"], evidence: { decisionId: DECISION_HW } }),
        event(6, "hold", { affected_units: ["k-5"], evidence: { decisionId: DECISION_SHOP } }),
        event(7, "release_hold", {
          releases_event_id: cp(1006),
          evidence: { releasesEventId: cp(1006), decisionId: DECISION_SHOP },
        }),
        event(8, "received"),
      ],
    },
  };
}

function variant(mutate: (row: ExternalFulfilmentReading) => void) {
  const row = nativeReading();
  mutate(row);
  return row;
}

const plans = {
  packages: [{ id: PACKAGE_ID, project_id: PROJECT, package_kind: "cabinetry", code: "CP-01", package_key: "pkg.cp01", title: "Kitchen cabinetry", project_room_id: ROOM }],
  issues: [
    { id: ISSUE_A, issue_number: 1, name: "CP01 cabinet issue A", issued_at: "2026-10-02T00:00:00Z", set_checksum: "1".repeat(64), sheet_count: 1 },
    { id: ISSUE_B, issue_number: 2, name: "CP01 cabinet issue B", issued_at: "2026-10-04T00:00:00Z", set_checksum: "2".repeat(64), sheet_count: 2 },
  ],
  issuePrints: [
    { id: "ip-old", issue_id: ISSUE_A, print_id: "pr-old", sheet_number: "K-201", sheet_title: "Elevation (old)", rev_letter: "B", sha256: "e".repeat(64) },
    { id: "ip-2", issue_id: ISSUE_B, print_id: "pr-2", sheet_number: "K-201", sheet_title: "Cabinet elevation", rev_letter: "C", sha256: "f".repeat(64) },
    { id: "ip-1", issue_id: ISSUE_B, print_id: "pr-1", sheet_number: "K-101", sheet_title: "Kitchen plan", rev_letter: "B", sha256: "9".repeat(64) },
  ],
  transmittals: [{ id: "t1", issue_id: ISSUE_B, party_display_name: "Northline Cabinetry", party_company: null, purpose: "fabrication", sent_at: "2026-10-04T00:00:00Z" }],
  tokens: [{ id: "tok1", transmittal_id: "t1", first_opened_at: "2026-10-05T00:00:00Z" }],
  sheets: [], prints: [], batches: [], sheetRooms: [], sheetPackages: [],
};
// v_project_roster has no implicit-owner row, so the owning designer is absent.
const roster = [
  { profile_id: SAM, display_name: "CP01 Sam Ortiz" },
  { profile_id: ANA, display_name: "CP01 Ana Ruiz" },
];
const decisions = [
  { id: DECISION_SHOP, title: "CP01 Northline shop drawings", status: "approved", due_date: null },
  { id: DECISION_HW, title: "CP01 H-14 hardware substitution", status: "open", due_date: "2026-11-02" },
];

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function serve(rows: ExternalFulfilmentReading[]) {
  // The RPC returns JSON, so the payload crosses a JSON boundary as it would natively.
  const payload = JSON.parse(JSON.stringify(rows));
  mockRpc.mockImplementation(async (name: string, args: { p_project_id: string }) =>
    name === "get_project_external_fulfilments" && args.p_project_id === PROJECT
      ? { data: payload, error: null }
      : { data: null, error: new Error(`unexpected rpc ${name}`) },
  );
}

/** The reading exactly as the real hook validates and returns it. */
async function validated(row: ExternalFulfilmentReading): Promise<ExternalFulfilmentReading> {
  serve([row]);
  const { result } = renderHook(() => useExternalFulfilmentReadings(PROJECT), { wrapper: wrapper() });
  await waitFor(() => expect(result.current.isPending).toBe(false));
  expect(result.current.error).toBeNull();
  return result.current.data![0];
}

interface MountOptions {
  roster?: unknown;
  plans?: unknown;
  rooms?: unknown;
  configuration?: unknown;
}

async function mount(rows: ExternalFulfilmentReading[], options: MountOptions = {}) {
  serve(rows);
  (usePlanRoom as jest.Mock).mockReturnValue(options.plans ?? ok(plans));
  (useProjectRoster as jest.Mock).mockReturnValue(options.roster ?? ok(roster));
  (useCoordinationItems as jest.Mock).mockReturnValue(ok(decisions));
  (useProjectRooms as jest.Mock).mockReturnValue(options.rooms ?? ok([{ id: ROOM, name: "Kitchen" }]));
  (useProductConfiguration as jest.Mock).mockReturnValue(options.configuration ?? pending);
  const view = render(<CabinetryChapter projectId={PROJECT} />, { wrapper: wrapper() });
  await waitFor(() => expect(screen.queryByText("Reading cabinet packages…")).toBeNull());
  return view;
}

const unit = (name: string) => document.querySelector(`[data-unit="${name}"]`)!;

describe("CP-01 package reading", () => {
  it("holds are partial and independent: only instructed, unheld units proceed", async () => {
    const model = readPackage(await validated(nativeReading()), null);
    const state = Object.fromEntries(model.units.map((u) => [u.unit, u]));
    expect(model.openHolds.map((h) => h.event_seq)).toEqual([5]);
    expect(state["k-3"].holds).toHaveLength(1);
    expect(state["k-4"].holds).toHaveLength(1);
    expect(state["k-5"].holds).toHaveLength(0); // released by event 7
    expect(state["k-1"].instruction?.event_seq).toBe(4);
    expect(model.units.filter((u) => u.proceeds).map((u) => u.unit)).toEqual(["k-1", "k-2"]);

    await mount([nativeReading()]);
    expect(unit("k-1")).toHaveAttribute("data-unit-state", "instructed");
    expect(unit("k-1")).toHaveTextContent("Instructed (reported) · proceeds");
    expect(unit("k-3")).toHaveAttribute("data-unit-state", "held");
    for (const name of ["k-5", "k-6"]) {
      expect(unit(name)).toHaveAttribute("data-unit-state", "not-instructed");
      expect(unit(name)).toHaveAttribute("data-unit-proceeds", "false");
      expect(unit(name)).not.toHaveTextContent("proceeds");
    }
    const hold = document.querySelector(`[data-hold="${cp(1005)}"]`)!;
    expect(hold.querySelector("[data-held-units]")).toHaveTextContent("k-3, k-4");
    expect(hold.querySelector("[data-proceeding-units]")).toHaveTextContent(/^k-1, k-2$/);
    expect(hold.querySelector("[data-uninstructed-units]")).toHaveTextContent(/^k-5, k-6$/);
    // The substitution names its decision and is honest about unrecorded impact.
    expect(hold).toHaveTextContent("CP01 H-14 hardware substitution · open · due Nov 2, 2026");
    expect(hold).toHaveTextContent("Price and time impact are not recorded on this hold");
    expect(document.querySelector(`[data-hold="${cp(1006)}"]`)).toBeNull();
  });

  it.each([
    ["installed", "installed"],
    ["cancelled", "cancelled"],
  ])("nothing proceeds once the package is %s", async (status, kind) => {
    const row = variant((r) => {
      r.status = status;
      r.reading.events.push(verified(9, kind, 2));
      r.reading.verifications.push({ event_id: cp(1009), fulfilment_id: FULFILMENT, verified_by: SAM });
    });
    expect(readPackage(await validated(row), null).units.some((u) => u.proceeds)).toBe(false);
    await mount([row]);
    expect(unit("k-1")).toHaveAttribute("data-unit-proceeds", "false");
    expect(unit("k-1")).toHaveTextContent(`Instructed (reported) · package ${status}`);
    expect(unit("k-1")).not.toHaveTextContent("proceeds");
    expect(unit("k-6")).not.toHaveTextContent("a new submittal is needed");
    const hold = document.querySelector(`[data-hold="${cp(1005)}"]`)!;
    expect(hold.querySelector("[data-proceeding-units]")).toHaveTextContent(`none, the package is ${status}`);
  });

  it("keeps Sam's verification on Sam and never reattributes it", async () => {
    await mount([nativeReading()]);
    const contract = document.querySelector(`[data-authorship="${cp(1003)}"]`)!;
    expect(contract).toHaveTextContent(/^Verified · recorded by/);
    expect(contract.querySelector(`[data-recorded-by="${DESIGNER}"]`)).toBeInTheDocument();
    expect(contract.querySelector(`[data-verified-by="${SAM}"]`)).toHaveTextContent("CP01 Sam Ortiz");
    expect(contract.querySelector(`[data-recorded-by="${DESIGNER}"]`)).not.toHaveTextContent("Sam");
  });

  it("names an unresolved person neutrally, never as having left the job", async () => {
    await mount([nativeReading()], { roster: ok(roster.filter((row) => row.profile_id !== SAM)) });
    const contract = document.querySelector(`[data-authorship="${cp(1003)}"]`)!;
    // The owning designer has no roster row; neither name implies departure.
    expect(contract.querySelector(`[data-recorded-by="${DESIGNER}"]`)).toHaveTextContent("A recorded person (name unresolved)");
    expect(contract.querySelector(`[data-verified-by="${SAM}"]`)).toHaveTextContent("A recorded person (name unresolved)");
    expect(document.querySelector("[data-cabinetry-chapter]")).not.toHaveTextContent("no longer on this job");
    expect(contract).not.toHaveTextContent("CP01 Ana Ruiz");
  });

  it("reads the exact current issue by event sequence, not by timestamp", async () => {
    // Event 1 carries the LATER recorded_at; event 2 is still the current issue.
    expect(readPackage(await validated(nativeReading()), null).currentIssue?.plan_issue_id).toBe(ISSUE_B);
    await mount([nativeReading()]);
    const issue = document.querySelector(`[data-exact-issue="${ISSUE_B}"]`)!;
    expect(issue).toHaveTextContent("Issue 2 · CP01 cabinet issue B");
    const sheets = within(issue as HTMLElement).getAllByRole("listitem").filter((li) => li.hasAttribute("data-issue-print"));
    expect(sheets.map((li) => li.getAttribute("data-issue-print"))).toEqual(["pr-1", "pr-2"]);
    expect(issue).not.toHaveTextContent("Elevation (old)");
    expect(issue).toHaveTextContent("Sent to Northline Cabinetry for fabrication");
    expect(issue).toHaveTextContent("opened by the recipient Oct 5, 2026");
    expect(issue).toHaveTextContent("Re-issued 1 time");
    expect([...document.querySelectorAll("[data-event-seq]")].map((n) => n.getAttribute("data-event-seq"))).toEqual(
      ["1", "2", "3", "4", "5", "6", "7", "8"],
    );
  });

  it("renders the recorded issue identity when its contents cannot be read", async () => {
    await mount([nativeReading()], { plans: failed });
    const alert = within(document.querySelector(`[data-exact-issue="${ISSUE_B}"]`) as HTMLElement).getByRole("alert");
    // Fixture issues share their first 8 characters, so only the full id distinguishes them.
    expect(ISSUE_A.slice(0, 8)).toBe(ISSUE_B.slice(0, 8));
    expect(alert).toHaveTextContent(`The recorded issue is ${ISSUE_B}.`);
    expect(alert.querySelector("[data-recorded-issue]")!.textContent).toBe(ISSUE_B);
  });

  it("joins evidence by stable ids and flags evidence bound to an earlier issue", async () => {
    await mount([nativeReading()]);
    expect(document.querySelector('[data-join="package"]')).toHaveTextContent("CP-01 (cabinetry)");
    expect(document.querySelector('[data-join="site"]')).toHaveTextContent("Kitchen");
    expect(document.querySelector('[data-join="commercial"]')).toHaveTextContent(`Edition ${EDITION.slice(0, 8)} · pkg.cp01`);
    expect(document.querySelector(`[data-binding="${DECISION_SHOP}"]`)).toHaveTextContent("CP01 Northline shop drawings · approved · units k-1, k-2");
    expect(document.querySelector(`[data-binding="${DECISION_SHOP}"]`)).not.toHaveTextContent("earlier");
    expect(document.querySelector(`[data-binding="${DECISION_OLD}"]`)).toHaveTextContent("covers an earlier issue or configuration");
    expect(unit("k-1")).toHaveTextContent("Maker evidence bound to the current issue");
    expect(unit("k-6")).toHaveTextContent("a new submittal is needed before instruction");
    const manifest = document.querySelector(`[data-manifest="${MANIFEST}"]`)!;
    expect([...manifest.querySelectorAll("[data-member-kind]")].map((n) => n.getAttribute("data-member-kind"))).toEqual([
      "plan_issue", "coordination_item_revision",
    ]);
  });

  it("never fabricates a whole-job site while the drawing record is unread or failed", async () => {
    const { unmount } = await mount([nativeReading()], { plans: pending });
    expect(document.querySelector('[data-join="site"]')).toHaveTextContent("Reading site…");
    unmount();
    const second = await mount([nativeReading()], { plans: failed });
    expect(document.querySelector('[data-join="site"]')).toHaveTextContent("Site could not be read");
    second.unmount();
    // The native package has no room: only a read drawing record says "Whole job".
    const noRoom = { ...plans, packages: [{ ...plans.packages[0], project_room_id: null }] };
    await mount([nativeReading()], { plans: ok(noRoom) });
    expect(document.querySelector('[data-join="site"]')).toHaveTextContent("Whole job");
  });

  it("a re-issue keeps instructed units on their frozen instruction and asks a submittal only of uninstructed units", async () => {
    const row = variant((r) => {
      r.reading.events.push(event(9, "package_issued", { plan_issue_id: ISSUE_C, evidence: { planIssueId: ISSUE_C, configurationSnapshotHash: null } }));
    });
    const model = readPackage(await validated(row), null);
    expect(model.currentIssue?.plan_issue_id).toBe(ISSUE_C);
    expect(model.units.find((u) => u.unit === "k-1")).toMatchObject({ evidence: "earlier", proceeds: true });
    await mount([row]);
    for (const name of ["k-1", "k-2"]) {
      expect(unit(name)).toHaveTextContent("the recorded instruction keeps its frozen contents");
      expect(unit(name)).not.toHaveTextContent("submittal is needed");
    }
    expect(unit("k-6")).toHaveTextContent("a new submittal is needed before instruction");
  });

  /**
   * Native-valid configured package (00884): the instruction's manifest pins the
   * configuration at H1, and the binding its coverage names carries that same
   * hash, so the reader accepts it.
   */
  const configured = () =>
    variant((r) => {
      r.configuration_id = CONFIG;
      r.reading.events[1].evidence = { planIssueId: ISSUE_B, configurationSnapshotHash: H1 };
      r.reading.manifests[0].members = [
        { kind: "plan_issue", id: ISSUE_B, version: 2, sha256: "2".repeat(64) },
        { kind: "coordination_item_revision", id: REVISION, rev: 1, sha256: "7".repeat(64) },
        { kind: "product_configuration", id: CONFIG, version: 1, sha256: H1 },
      ];
      r.reading.manifests[0].typed_members.push(typedMember(854, "product_configuration_id", CONFIG));
      r.reading.bindings[0].covers_configuration_snapshot_hash = H1;
      r.reading.bindings.push(binding(503, DECISION_K5, ["k-5"], ISSUE_B, H1));
    });

  it("a configuration change stops older evidence from covering, like the native gate", async () => {
    const row = configured();
    const reading = await validated(row);
    const members = reading.reading.manifests[0].members as unknown as Array<Record<string, unknown>>;
    const pinned = members.find((member) => member.kind === "product_configuration");
    expect(pinned).toMatchObject({ id: CONFIG, sha256: reading.reading.bindings[0].covers_configuration_snapshot_hash });
    const at = (snapshot: string | undefined) =>
      Object.fromEntries(readPackage(reading, snapshot).units.map((u) => [u.unit, u.evidence]));
    expect(at(H1)).toMatchObject({ "k-1": "current", "k-5": "current" });
    expect(at(H2)).toMatchObject({ "k-1": "earlier", "k-5": "earlier" });
    expect(at(undefined)).toMatchObject({ "k-1": "unknown", "k-5": "unknown" });

    const { unmount } = await mount([row], { configuration: ok({ id: CONFIG, snapshotHash: H2 }) });
    expect(useProductConfiguration).toHaveBeenCalledWith(CONFIG);
    expect(document.querySelector('[data-route="detail-verification"]')).toHaveTextContent("Detailed design → maker verification");
    expect(unit("k-5")).toHaveTextContent("a new submittal is needed before instruction");
    expect(unit("k-1")).toHaveTextContent("the recorded instruction keeps its frozen contents");
    expect(document.querySelector(`[data-binding="${DECISION_K5}"]`)).toHaveTextContent("covers an earlier issue or configuration");
    unmount();
    const second = await mount([row], { configuration: failed });
    expect(unit("k-5")).toHaveTextContent("evidence coverage is not confirmed");
    expect(unit("k-5")).not.toHaveTextContent("bound to the current issue");
    second.unmount();
    await mount([row], { configuration: ok({ id: CONFIG, snapshotHash: H1 }) });
    expect(unit("k-5")).toHaveTextContent("Maker evidence bound to the current issue");
  });

  it("a failed configuration refetch with retained data does not confirm coverage", async () => {
    // TanStack keeps the last data after a failed background refetch.
    const stale = { data: { id: CONFIG, snapshotHash: H1 }, isPending: false, isError: true, refetch: jest.fn() };
    await mount([configured()], { configuration: stale });
    expect(unit("k-5")).toHaveTextContent("evidence coverage is not confirmed");
    expect(unit("k-5")).not.toHaveTextContent("bound to the current issue");
    expect(document.querySelector(`[data-binding="${DECISION_K5}"]`)).toHaveTextContent("configuration coverage not confirmed");
  });

  it.each([
    ["pending", pending],
    ["failed", failed],
  ])("an instruction against the current issue keeps its frozen contents and invents no mismatch while the configuration is %s", async (_state, configuration) => {
    await mount([configured()], { configuration });
    for (const name of ["k-1", "k-2"]) {
      expect(unit(name)).toHaveTextContent("the recorded instruction keeps its frozen contents");
      expect(unit(name)).toHaveTextContent("Its match to the current configuration is not confirmed");
      expect(unit(name)).not.toHaveTextContent("earlier issue or configuration");
    }
  });

  it("names the route: designer intent to maker drawing", async () => {
    await mount([nativeReading()]);
    expect(document.querySelector('[data-route="intent-shop-drawing"]')).toHaveTextContent("Designer intent → maker drawing");
  });

  it("shows no GC price by default and no studio PO", async () => {
    await mount([nativeReading()]);
    const chapter = document.querySelector("[data-cabinetry-chapter]")!;
    expect(chapter).not.toHaveTextContent("$28,400");
    expect(chapter).not.toHaveTextContent("$27,500");
    expect(chapter).not.toHaveTextContent("$9,000");
    expect(document.querySelector("[data-no-studio-po]")).toHaveTextContent("No studio purchase order, purchase or invoice");
    expect(chapter.querySelector('a[href*="purchase"], a[href*="invoice"]')).toBeNull();
    const toggle = screen.getByRole("button", { name: "Show the GC's reported amounts" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const price = document.querySelector("[data-gc-price]")!;
    expect(price).toHaveTextContent("$28,400.00 (studio only)");
    expect(price).toHaveTextContent("Contract verified: $27,500.00");
    expect(price).toHaveTextContent("Instruction amount: $9,000.00");
    expect(price).toHaveTextContent("Never a studio price, total, purchase order or invoice");
  });

  it("shows instruction and receipt as separate reported facts", async () => {
    await mount([nativeReading()]);
    const instruction = document.querySelector(`[data-instruction="${cp(1004)}"]`)!;
    expect(instruction).toHaveTextContent("Instructed units k-1, k-2 · by A recorded person (name unresolved)");
    const receipt = document.querySelector(`[data-receipt="${cp(1008)}"]`)!;
    expect(receipt).toHaveTextContent("Received on site. Receipt is not acceptance.");
    expect(receipt.querySelector(`[data-authorship="${cp(1008)}"]`)).toHaveTextContent(/^Reported · recorded by/);
    expect(receipt.querySelector(`[data-authorship="${cp(1008)}"]`)).not.toHaveTextContent("verified by");
  });

  it("keeps every inactive act visibly unavailable with its reason", async () => {
    await mount([nativeReading()]);
    for (const name of ["Record instruction", "Place a hold", "Record receipt", "Verify an event"]) {
      const act = screen.getByRole("button", { name });
      expect(act).toHaveAttribute("aria-disabled", "true");
      const reason = document.getElementById(act.getAttribute("aria-describedby")!.split(" ")[0]);
      expect(reason).toHaveTextContent("These acts are not active yet");
    }
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("get_project_external_fulfilments", { p_project_id: PROJECT });
  });

  it("reads only GC cabinetry", async () => {
    await mount([variant((r) => { r.kind = "client_furnishing"; })]);
    expect(screen.getByText("No GC-bought cabinet package is recorded for this job.")).toBeInTheDocument();
    expect(document.querySelector("[data-cabinet-package]")).toBeNull();
  });

  it.each([
    ["a self-verified instruction", (r: ExternalFulfilmentReading) => {
      Object.assign(r.reading.events[3], { evidence_level: "verified", verified_by: DESIGNER, verified_at: "2026-10-26T12:00:00Z", verification_seq: 2 });
      r.reading.verifications.push({ event_id: cp(1004), fulfilment_id: FULFILMENT, verified_by: DESIGNER });
    }],
    ["a release without releasesEventId", (r: ExternalFulfilmentReading) => {
      r.reading.events[6].evidence = { decisionId: DECISION_SHOP };
    }],
    ["a manifest without typed members", (r: ExternalFulfilmentReading) => {
      r.reading.manifests[0].typed_members = [];
    }],
  ])("reports %s as a failed reading with a retry, never a partial package", async (_label, corrupt) => {
    await mount([variant(corrupt)]);
    expect(screen.getByRole("alert")).toHaveTextContent("Cabinet packages could not be read");
    expect(document.querySelector("[data-cabinet-package]")).toBeNull();
    expect(screen.queryByText("No GC-bought cabinet package is recorded for this job.")).toBeNull();
    expect(screen.getByRole("button", { name: "Retry cabinet packages" })).toBeInTheDocument();
  });
});
