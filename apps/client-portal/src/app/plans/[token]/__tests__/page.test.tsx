import { render, screen } from "@testing-library/react";

import PlanTransmittalPage from "../page";
import { resolvePlanTransmittal } from "../plan-transmittal";

jest.mock("../plan-transmittal", () => ({
  resolvePlanTransmittal: jest.fn(),
}));

const TOKEN = "a".repeat(64);
const PRINT_ID = "50000000-0000-4000-8000-000000000001";
const transmittal = {
  studioName: "Middle West Studio",
  recipientName: "Sal Reyes",
  recipientCompany: "Reyes Tile Co.",
  purpose: "pricing" as const,
  sentAt: "2026-08-01T15:00:00+00:00",
  projectLabel: "Aspen Loft Refresh",
  issueName: "Pricing Set",
  issueDate: "2026-08-01",
  setSha256: "c".repeat(64),
  isCurrentSet: true,
  supersededByName: null,
  supersededAt: null,
  sheets: [
    {
      printId: PRINT_ID,
      number: "A-101",
      title: "First Floor Plan",
      revLetter: "B",
      revDate: "2026-07-30",
      sha256: "d".repeat(64),
      sizeBytes: 204800,
      isCurrent: true,
    },
    {
      printId: "50000000-0000-4000-8000-000000000002",
      number: "E-201",
      title: "Lighting Plan",
      revLetter: "A",
      revDate: "2026-07-28",
      sha256: "e".repeat(64),
      sizeBytes: null,
      isCurrent: true,
    },
  ],
};

describe("/plans/[token]", () => {
  beforeEach(() => {
    jest.mocked(resolvePlanTransmittal).mockReset();
  });

  it("renders the transmittal for a valid link", async () => {
    jest.mocked(resolvePlanTransmittal).mockResolvedValue(transmittal);
    render(
      await PlanTransmittalPage({
        params: Promise.resolve({ token: TOKEN }),
      }),
    );

    // Masthead is the recipient's company when there is one.
    expect(
      screen.getByRole("heading", { name: "Reyes Tile Co." }),
    ).toBeInTheDocument();
    // The provenance sentence, purpose included.
    expect(
      screen.getByText(/Pricing Set for pricing on August 1, 2026/),
    ).toBeInTheDocument();
    expect(screen.getByText(/by Middle West Studio\./)).toBeInTheDocument();
    // The vitals line.
    expect(
      screen.getByText("Aspen Loft Refresh · Pricing Set · 2 sheets"),
    ).toBeInTheDocument();
    // Sheet rows: rev badges, numbers, titles, per-sheet rev line.
    expect(screen.getByLabelText("Revision B")).toHaveTextContent("B");
    expect(screen.getByLabelText("Revision A")).toHaveTextContent("A");
    expect(screen.getByText("A-101")).toBeInTheDocument();
    expect(screen.getByText("First Floor Plan")).toBeInTheDocument();
    expect(screen.getByText("Rev B · July 30, 2026")).toBeInTheDocument();
    // Open goes to the print route in a fresh tab, never a raw storage URL.
    const openLinks = screen.getAllByRole("link", { name: "Open" });
    expect(openLinks).toHaveLength(2);
    expect(openLinks[0]).toHaveAttribute(
      "href",
      `/plans/${TOKEN}/print/${PRINT_ID}`,
    );
    expect(openLinks[0]).toHaveAttribute("target", "_blank");
    expect(openLinks[0]).toHaveAttribute("rel", "noopener noreferrer");
    // Current set: the foot line shows, the superseded band does not.
    expect(
      screen.getByText("This set is current as of today."),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("plans-superseded-band"),
    ).not.toBeInTheDocument();
  });

  it("falls back to the recipient name when there is no company", async () => {
    jest
      .mocked(resolvePlanTransmittal)
      .mockResolvedValue({ ...transmittal, recipientCompany: null });
    render(
      await PlanTransmittalPage({
        params: Promise.resolve({ token: TOKEN }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Sal Reyes" }),
    ).toBeInTheDocument();
  });

  it("shows a quiet band — and no link to the newer set — when the set is superseded", async () => {
    jest.mocked(resolvePlanTransmittal).mockResolvedValue({
      ...transmittal,
      isCurrentSet: false,
      supersededByName: "Issue 3",
      supersededAt: "2026-08-05T12:00:00+00:00",
    });
    render(
      await PlanTransmittalPage({
        params: Promise.resolve({ token: TOKEN }),
      }),
    );

    const band = screen.getByTestId("plans-superseded-band");
    expect(band).toHaveTextContent(
      "The set has moved since this was sent — you are viewing the set you were sent. A newer issue went out August 5, 2026.",
    );
    // Deliberately no path to the newer set: no link in the band, and the
    // superseding issue's name appears nowhere.
    expect(band.querySelector("a")).toBeNull();
    expect(screen.queryByText(/Issue 3/)).not.toBeInTheDocument();
    // A superseded set is not "current as of today".
    expect(
      screen.queryByText("This set is current as of today."),
    ).not.toBeInTheDocument();
  });

  it("claims no newer issue when the resolver names none (a re-filed sheet also moves the set)", async () => {
    jest.mocked(resolvePlanTransmittal).mockResolvedValue({
      ...transmittal,
      isCurrentSet: false,
    });
    render(
      await PlanTransmittalPage({
        params: Promise.resolve({ token: TOKEN }),
      }),
    );

    const band = screen.getByTestId("plans-superseded-band");
    expect(band).toHaveTextContent(
      "The set has moved since this was sent — you are viewing the set you were sent.",
    );
    expect(band).not.toHaveTextContent(/newer issue went out/i);
  });

  // Every failure mode is the SAME calm dead link, byte for byte — a probing
  // caller learns nothing from the DOM about WHY a link is dead.
  it("renders a byte-identical dead link for every failure mode", async () => {
    const failureRenders: string[] = [];

    // A bad-format token (the resolver's gate answers null).
    jest.mocked(resolvePlanTransmittal).mockResolvedValue(null);
    const badFormat = render(
      await PlanTransmittalPage({
        params: Promise.resolve({ token: "not-a-token" }),
      }),
    );
    failureRenders.push(badFormat.container.innerHTML);
    badFormat.unmount();

    // A well-formed token the resolver rejects (revoked/expired/unknown).
    jest.mocked(resolvePlanTransmittal).mockResolvedValue(null);
    const resolverMiss = render(
      await PlanTransmittalPage({
        params: Promise.resolve({ token: TOKEN }),
      }),
    );
    failureRenders.push(resolverMiss.container.innerHTML);
    resolverMiss.unmount();

    // The bounce back from a failed print redirect.
    jest.mocked(resolvePlanTransmittal).mockReset();
    const unavailable = render(
      await PlanTransmittalPage({
        params: Promise.resolve({ token: TOKEN }),
        searchParams: Promise.resolve({ unavailable: "1" }),
      }),
    );
    failureRenders.push(unavailable.container.innerHTML);

    expect(failureRenders[0]).toContain("plans-dead-link");
    expect(failureRenders[0]).toContain("This link isn’t available");
    expect(failureRenders[1]).toBe(failureRenders[0]);
    expect(failureRenders[2]).toBe(failureRenders[0]);
  });

  it("never resolves the token when bouncing back from a failed download", async () => {
    render(
      await PlanTransmittalPage({
        params: Promise.resolve({ token: TOKEN }),
        searchParams: Promise.resolve({ unavailable: "1" }),
      }),
    );

    expect(screen.getByTestId("plans-dead-link")).toBeInTheDocument();
    expect(resolvePlanTransmittal).not.toHaveBeenCalled();
  });
});
