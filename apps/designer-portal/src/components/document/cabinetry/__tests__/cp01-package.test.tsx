/**
 * CP-01 package reading — MOCKED hook data shaped exactly like the native
 * get_project_external_fulfilments reading (00884 via useExternalFulfilmentReadings).
 * These tests prove the rendering and derivation rules only. They do NOT prove
 * the native reader, authenticated activation or any recorded act.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  useCoordinationItems,
  useExternalFulfilmentReadings,
  usePlanRoom,
  useProjectRooms,
  useProjectRoster,
  type ExternalFulfilmentReading,
} from "@patina/supabase";
import { CabinetryChapter } from "../../paper/chapters/cabinetry-chapter";
import { readPackage } from "../package-reading";

jest.mock("@patina/supabase", () => ({
  externalFulfilmentCapability: { status: "inactive", reason: "not_activated", available: false },
  useExternalFulfilmentReadings: jest.fn(),
  usePlanRoom: jest.fn(),
  useProjectRoster: jest.fn(),
  useCoordinationItems: jest.fn(),
  useProjectRooms: jest.fn(),
}));

const ok = (data: unknown) => ({ data, isPending: false, isError: false, refetch: jest.fn() });

const ANA = "a0000000-0000-4000-8000-000000000001";
const SAM = "a0000000-0000-4000-8000-000000000002";
const LEAH = "a0000000-0000-4000-8000-000000000003";
const ISSUE_1 = "i0000000-0000-4000-8000-000000000001";
const ISSUE_2 = "i0000000-0000-4000-8000-000000000002";
const PACKAGE_ID = "p0000000-0000-4000-8000-000000000001";
const ROOM = "r0000000-0000-4000-8000-000000000001";
const DECISION_SHOP = "d0000000-0000-4000-8000-000000000001";
const DECISION_OLD = "d0000000-0000-4000-8000-000000000002";
const DECISION_HW = "d0000000-0000-4000-8000-000000000003";
const MANIFEST = "m0000000-0000-4000-8000-000000000001";
const HASH = "a".repeat(64);

type Event = ExternalFulfilmentReading["reading"]["events"][number];
const event = (seq: number, kind: string, extra: Partial<Event> = {}): Event => ({
  id: `e0000000-0000-4000-8000-0000000000${String(seq).padStart(2, "0")}`,
  fulfilment_id: "f1",
  event_seq: seq,
  event_kind: kind,
  evidence: {},
  evidence_level: "reported",
  recorded_by: ANA,
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

const UNITS = ["k-1", "k-2", "k-3", "k-4", "k-5", "k-6"];

function reading(overrides: Partial<ExternalFulfilmentReading> = {}): ExternalFulfilmentReading {
  return {
    id: "f1",
    project_id: "proj-1",
    scope_edition_id: "s0000000-0000-4000-8000-000000000001",
    package_key: "cp-01",
    units: UNITS,
    kind: "gc_cabinetry",
    buyer_party_kind: "gc",
    payer_party_kind: "gc",
    contracting_party_kind: "gc",
    party_engagement_id: null,
    configuration_id: null,
    reported_price_cents: 2_840_000,
    price_visibility: "studio_only",
    status: "instructed",
    created_by: ANA,
    created_at: "2026-10-01T00:00:00Z",
    client_request_id: "x",
    request_hash: "y",
    reading: {
      package_id: PACKAGE_ID,
      bindings: [
        { id: "b1", fulfilment_id: "f1", decision_id: DECISION_SHOP, units: ["k-1", "k-2"], covers_plan_issue_id: ISSUE_2, covers_configuration_snapshot_hash: null, bound_by: ANA, bound_at: "2026-10-05T00:00:00Z" },
        { id: "b2", fulfilment_id: "f1", decision_id: DECISION_OLD, units: ["k-6"], covers_plan_issue_id: ISSUE_1, covers_configuration_snapshot_hash: null, bound_by: ANA, bound_at: "2026-10-03T00:00:00Z" },
      ],
      verifications: [
        { event_id: "e0000000-0000-4000-8000-000000000003", fulfilment_id: "f1", verified_by: SAM },
        { event_id: "e0000000-0000-4000-8000-000000000004", fulfilment_id: "f1", verified_by: LEAH },
      ],
      manifests: [
        {
          id: MANIFEST, project_id: "proj-1", package_id: PACKAGE_ID, purpose: "fabrication_instruction",
          manifest_hash: HASH, created_by: LEAH, created_at: "2026-10-06T00:00:00Z",
          members: [
            { kind: "plan_issue", id: ISSUE_2, version: 2, sha256: "b".repeat(64) },
            { kind: "coordination_item_revision", id: "rev-1", rev: 3, sha256: "c".repeat(64) },
            { kind: "review_item", id: "sample-1", version: 1, sha256: "d".repeat(64) },
          ],
          typed_members: [],
        },
      ],
      events: [
        event(1, "package_issued", { plan_issue_id: ISSUE_1, evidence: { planIssueId: ISSUE_1, configurationSnapshotHash: null } }),
        event(2, "package_issued", { plan_issue_id: ISSUE_2, evidence: { planIssueId: ISSUE_2, configurationSnapshotHash: null } }),
        // Sam verifies a contract Ana recorded; a verification is never reassigned.
        event(3, "contract_reported", { evidence_level: "verified", verified_by: SAM, verified_at: "2026-10-28T00:00:00Z", verification_seq: 1, evidence: { contractAmountCents: 2_750_000 } }),
        event(4, "fabrication_instruction", {
          evidence_level: "verified", recorded_by: LEAH, actor_id: LEAH, verified_by: LEAH, verified_at: "2026-10-26T12:00:00Z", verification_seq: 2,
          affected_units: ["k-1", "k-2"], manifest_id: MANIFEST, manifest_hash: HASH, authority_id: "auth-1", amount_cents: 900_000,
          evidence_route: "shop_drawing", coverage: [{ unit: "k-1", revisionIds: ["rev-1"] }, { unit: "k-2", revisionIds: ["rev-1"] }],
        }),
        event(5, "hold", { affected_units: ["k-3", "k-4"], evidence: { decisionId: DECISION_HW } }),
        event(6, "hold", { affected_units: ["k-5"], evidence: { decisionId: DECISION_SHOP } }),
        event(7, "release_hold", { releases_event_id: "e0000000-0000-4000-8000-000000000006", evidence: { decisionId: DECISION_SHOP } }),
        event(8, "received", { recorded_by: SAM }),
      ],
    },
    ...overrides,
  } as ExternalFulfilmentReading;
}

const plans = {
  packages: [{ id: PACKAGE_ID, project_id: "proj-1", package_kind: "cabinetry", code: "CP-01", package_key: "cp-01", title: "Kitchen cabinetry", project_room_id: ROOM }],
  issues: [
    { id: ISSUE_1, issue_number: 1, name: "Cabinet issue A", issued_at: "2026-10-02T00:00:00Z", set_checksum: "1".repeat(64), sheet_count: 1 },
    { id: ISSUE_2, issue_number: 2, name: "Cabinet issue B", issued_at: "2026-10-04T00:00:00Z", set_checksum: "2".repeat(64), sheet_count: 2 },
  ],
  issuePrints: [
    { id: "ip-old", issue_id: ISSUE_1, print_id: "pr-old", sheet_number: "K-201", sheet_title: "Elevation (old)", rev_letter: "B", sha256: "e".repeat(64) },
    { id: "ip-2", issue_id: ISSUE_2, print_id: "pr-2", sheet_number: "K-201", sheet_title: "Cabinet elevation", rev_letter: "C", sha256: "f".repeat(64) },
    { id: "ip-1", issue_id: ISSUE_2, print_id: "pr-1", sheet_number: "K-101", sheet_title: "Kitchen plan", rev_letter: "B", sha256: "9".repeat(64) },
  ],
  transmittals: [{ id: "t1", issue_id: ISSUE_2, party_display_name: "Northline Cabinetry", party_company: null, purpose: "fabrication", sent_at: "2026-10-04T00:00:00Z" }],
  tokens: [{ id: "tok1", transmittal_id: "t1", first_opened_at: "2026-10-05T00:00:00Z" }],
  sheets: [], prints: [], batches: [], sheetRooms: [], sheetPackages: [],
};
const roster = [
  { profile_id: ANA, display_name: "Ana Ruiz" },
  { profile_id: SAM, display_name: "Sam Ortiz" },
  { profile_id: LEAH, display_name: "Leah Studio" },
];
const decisions = [
  { id: DECISION_SHOP, title: "Northline shop drawings", status: "approved", due_date: null },
  { id: DECISION_HW, title: "H-14 hardware substitution", status: "open", due_date: "2026-11-02" },
];

function mount(rows: ExternalFulfilmentReading[] | null, rosterRows = roster) {
  (useExternalFulfilmentReadings as jest.Mock).mockReturnValue(
    rows ? ok(rows) : { data: undefined, isPending: false, isError: true, refetch: jest.fn() },
  );
  (usePlanRoom as jest.Mock).mockReturnValue(ok(plans));
  (useProjectRoster as jest.Mock).mockReturnValue(ok(rosterRows));
  (useCoordinationItems as jest.Mock).mockReturnValue(ok(decisions));
  (useProjectRooms as jest.Mock).mockReturnValue(ok([{ id: ROOM, name: "Kitchen" }]));
  return render(<CabinetryChapter projectId="proj-1" />);
}

describe("CP-01 package reading", () => {
  it("holds are partial and independent: unaffected instructed units proceed", () => {
    const model = readPackage(reading());
    const state = Object.fromEntries(model.units.map((u) => [u.unit, u]));
    expect(model.openHolds.map((h) => h.event_seq)).toEqual([5]);
    expect(state["k-3"].holds).toHaveLength(1);
    expect(state["k-4"].holds).toHaveLength(1);
    expect(state["k-5"].holds).toHaveLength(0); // released by event 7
    expect(state["k-1"].instruction?.event_seq).toBe(4);

    mount([reading()]);
    const units = screen.getByRole("region", { name: "Units" });
    expect(within(units).getByText("k-1").closest("li")).toHaveAttribute("data-unit-state", "instructed");
    expect(within(units).getByText("k-1").closest("li")).toHaveTextContent("Instructed (verified) · proceeds");
    expect(within(units).getByText("k-3").closest("li")).toHaveAttribute("data-unit-state", "held");
    expect(within(units).getByText("k-5").closest("li")).toHaveAttribute("data-unit-state", "not-instructed");
    const hold = document.querySelector('[data-hold="e0000000-0000-4000-8000-000000000005"]')!;
    expect(hold.querySelector("[data-held-units]")).toHaveTextContent("k-3, k-4");
    expect(hold.querySelector("[data-proceeding-units]")).toHaveTextContent("k-1, k-2, k-5, k-6");
    // The substitution names its decision and is honest about unrecorded impact.
    expect(hold).toHaveTextContent("H-14 hardware substitution · open · due Nov 2, 2026");
    expect(hold).toHaveTextContent("Price and time impact are not recorded on this hold");
    expect(document.querySelector('[data-hold="e0000000-0000-4000-8000-000000000006"]')).toBeNull();
  });

  it("keeps Sam's verification on Sam and never reattributes it", () => {
    mount([reading()]);
    const contract = document.querySelector('[data-authorship="e0000000-0000-4000-8000-000000000003"]')!;
    expect(contract.querySelector(`[data-recorded-by="${ANA}"]`)).toHaveTextContent("Ana Ruiz");
    expect(contract.querySelector(`[data-verified-by="${SAM}"]`)).toHaveTextContent("Sam Ortiz");
  });

  it("does not substitute a current roster name when the verifier has left the job", () => {
    mount([reading()], roster.filter((row) => row.profile_id !== SAM));
    const contract = document.querySelector('[data-authorship="e0000000-0000-4000-8000-000000000003"]')!;
    expect(contract.querySelector(`[data-verified-by="${SAM}"]`)).toHaveTextContent(
      "A person no longer on this job's roster",
    );
    expect(contract).not.toHaveTextContent("Ana Ruiz · verified");
  });

  it("reads the exact current issue by event sequence, not by timestamp", () => {
    // Event 1 carries the LATER recorded_at; event 2 is still the current issue.
    expect(readPackage(reading()).currentIssue?.plan_issue_id).toBe(ISSUE_2);
    mount([reading()]);
    const issue = document.querySelector(`[data-exact-issue="${ISSUE_2}"]`)!;
    expect(issue).toHaveTextContent("Issue 2 · Cabinet issue B");
    const sheets = within(issue as HTMLElement).getAllByRole("listitem").filter((li) => li.hasAttribute("data-issue-print"));
    expect(sheets.map((li) => li.getAttribute("data-issue-print"))).toEqual(["pr-1", "pr-2"]);
    expect(issue).not.toHaveTextContent("Elevation (old)");
    expect(issue).toHaveTextContent("Sent to Northline Cabinetry for fabrication");
    expect(issue).toHaveTextContent("opened by the recipient Oct 5, 2026");
    expect(issue).toHaveTextContent("Re-issued 1 time");
  });

  it("joins evidence by stable ids and flags evidence bound to an earlier issue", () => {
    mount([reading()]);
    expect(document.querySelector('[data-join="package"]')).toHaveTextContent("CP-01 (cabinetry)");
    expect(document.querySelector('[data-join="site"]')).toHaveTextContent("Kitchen");
    expect(document.querySelector('[data-join="commercial"]')).toHaveTextContent("Edition s0000000 · cp-01");
    expect(document.querySelector(`[data-binding="${DECISION_SHOP}"]`)).toHaveTextContent("Northline shop drawings · approved · units k-1, k-2");
    expect(document.querySelector(`[data-binding="${DECISION_OLD}"]`)).toHaveTextContent("covers an earlier issue");
    expect(document.querySelector('[data-unit="k-6"]')).toHaveTextContent("a new submittal is needed");
    const manifest = document.querySelector(`[data-manifest="${MANIFEST}"]`)!;
    expect([...manifest.querySelectorAll("[data-member-kind]")].map((n) => n.getAttribute("data-member-kind"))).toEqual([
      "plan_issue", "coordination_item_revision", "review_item",
    ]);
  });

  it("names the route: designer intent to maker drawing, or detail to maker verification", () => {
    const { unmount } = mount([reading()]);
    expect(document.querySelector('[data-route="intent-shop-drawing"]')).toHaveTextContent("Designer intent → maker drawing");
    unmount();
    mount([reading({ configuration_id: "c0000000-0000-4000-8000-000000000001" })]);
    expect(document.querySelector('[data-route="detail-verification"]')).toHaveTextContent("Detailed design → maker verification");
  });

  it("shows no GC price by default and no studio PO", () => {
    mount([reading()]);
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
    expect(price).toHaveTextContent("Never a studio price, total, purchase order or invoice");
  });

  it("shows instruction and receipt as separate reported facts", () => {
    mount([reading()]);
    const instruction = document.querySelector("[data-instruction]")!;
    expect(instruction).toHaveTextContent("Instructed units k-1, k-2 · by Leah Studio");
    const receipt = document.querySelector("[data-receipt]")!;
    expect(receipt).toHaveTextContent("Received on site. Receipt is not acceptance.");
    expect(receipt).toHaveTextContent("Reported · recorded by Sam Ortiz");
  });

  it("keeps every inactive act visibly unavailable with its reason", () => {
    mount([reading()]);
    for (const name of ["Record instruction", "Place a hold", "Record receipt", "Verify an event"]) {
      const act = screen.getByRole("button", { name });
      expect(act).toHaveAttribute("aria-disabled", "true");
      const reason = document.getElementById(act.getAttribute("aria-describedby")!.split(" ")[0]);
      expect(reason).toHaveTextContent("These acts are not active yet");
    }
  });

  it("reads only GC cabinetry, and reports a failed read rather than an empty job", () => {
    mount([reading({ id: "f2", kind: "client_furnishing", package_key: "sofa" })]);
    expect(screen.getByText("No GC-bought cabinet package is recorded for this job.")).toBeInTheDocument();
    expect(document.querySelector("[data-cabinet-package]")).toBeNull();
  });

  it("reports a failed reading with a retry", () => {
    mount(null);
    expect(screen.getByRole("alert")).toHaveTextContent("Cabinet packages could not be read");
    expect(screen.queryByText("No GC-bought cabinet package is recorded for this job.")).toBeNull();
    expect(screen.getByRole("button", { name: "Retry cabinet packages" })).toBeInTheDocument();
  });
});
