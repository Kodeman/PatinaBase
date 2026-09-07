import { fireEvent, render, screen } from "@testing-library/react";
import type { AgreementPartEvent } from "@patina/types";
import { PartHistoryStrip, relativeDay } from "../part-history-strip";

const mockEvents = jest.fn();

jest.mock("@patina/supabase", () => ({
  useAgreementPartEvents: (proposalId: string | null) => mockEvents(proposalId),
}));

const NOW = new Date("2026-09-07T12:00:00Z");
const daysBefore = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

let seq = 0;
function event(
  input: Partial<AgreementPartEvent> & { partKey: string },
): AgreementPartEvent {
  seq += 1;
  return {
    id: input.id ?? `event-${seq}`,
    proposalId: "agreement-1",
    partId: input.partId ?? `part-${seq}`,
    partKey: input.partKey,
    action: input.action ?? "edited",
    actor: input.actor ?? "designer-1",
    actorName: input.actorName ?? null,
    why: input.why ?? null,
    before: null,
    after: null,
    at: input.at ?? daysBefore(1),
  };
}

function renderStrip(events: AgreementPartEvent[], partKey = "patina.ceiling") {
  mockEvents.mockReturnValue({ data: events, isLoading: false });
  return render(
    <PartHistoryStrip proposalId="agreement-1" partKey={partKey} />,
  );
}

beforeEach(() => {
  seq = 0;
  mockEvents.mockReset();
  jest.useFakeTimers().setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("the part history strip", () => {
  it("draws nothing at all when the part has no history", () => {
    const { container } = renderStrip([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("draws nothing when every event belongs to another part", () => {
    const { container } = renderStrip([event({ partKey: "patina.retainer" })]);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the act, the person, and the day", () => {
    renderStrip([
      event({
        partKey: "patina.ceiling",
        action: "edited",
        actorName: "Leah",
        at: daysBefore(3),
      }),
    ]);
    expect(screen.getByText("Edited · Leah · 3 days ago")).toBeInTheDocument();
  });

  it("says `A teammate` when no name was resolved", () => {
    renderStrip([
      event({ partKey: "patina.ceiling", action: "added", actorName: null }),
    ]);
    expect(
      screen.getByText("Added · A teammate · yesterday"),
    ).toBeInTheDocument();
  });

  it("prints the why on its own line", () => {
    renderStrip([
      event({
        partKey: "patina.ceiling",
        actorName: "Leah",
        why: "Added the study to the scope",
      }),
    ]);
    expect(
      screen.getByText("Added the study to the scope"),
    ).toBeInTheDocument();
  });

  it("calls a materialize what the designer did, not what the RPC is named", () => {
    renderStrip([
      event({
        partKey: "patina.ceiling",
        action: "materialized",
        actorName: "Leah",
      }),
    ]);
    expect(
      screen.getByText("Added from a template · Leah · yesterday"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/materialized/i)).not.toBeInTheDocument();
  });

  it("shows five, newest first, behind a disclosure for the rest", () => {
    renderStrip(
      Array.from({ length: 7 }, (_, index) =>
        event({
          partKey: "patina.ceiling",
          actorName: `Person ${index}`,
          at: daysBefore(index + 1),
        }),
      ),
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText(/Person 0/)).toBeInTheDocument();
    expect(screen.queryByText(/Person 6/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show all 7" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    expect(screen.getByText(/Person 6/)).toBeInTheDocument();
  });

  it("orders newest first whatever order the rows arrived in", () => {
    renderStrip([
      event({
        partKey: "patina.ceiling",
        actorName: "Older",
        at: daysBefore(5),
      }),
      event({
        partKey: "patina.ceiling",
        actorName: "Newer",
        at: daysBefore(1),
      }),
    ]);
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Newer");
    expect(rows[1]).toHaveTextContent("Older");
  });
});

describe("relativeDay", () => {
  it("reads as paper, not as chat", () => {
    expect(relativeDay(daysBefore(0), NOW)).toBe("today");
    expect(relativeDay(daysBefore(1), NOW)).toBe("yesterday");
    expect(relativeDay(daysBefore(4), NOW)).toBe("4 days ago");
    expect(relativeDay(daysBefore(400), NOW)).toMatch(/\d{4}$/);
  });

  it("answers empty for a date it cannot read", () => {
    expect(relativeDay("not a date", NOW)).toBe("");
  });
});
