/**
 * W5-R2 item 4 — the Brief's own inline `<h2>Brief</h2>` and its
 * "Respond by …" / "Reconnect …" sub-label are retired: `PreworkRegion`'s
 * `RegionHead` (mounted by the caller, `page.tsx`) is the paper's one head
 * for this stop now. The sub-label names a distinct fact (a date), so it
 * reports up into that head's eyebrow via `onEyebrow`, rather than standing
 * beside a second heading.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { BriefSection } from "./brief-section";
import { ACT_LANDING_EVENTS } from "@/lib/document/act-names";

let mockLead: Record<string, unknown> | undefined;

jest.mock("@patina/supabase", () => ({
  useLead: () => ({ data: mockLead, isLoading: false }),
}));

// Not the subject of this test — both render nothing for a lead with no
// scans / a non-actionable status, which the fixtures below keep true.
jest.mock("./triage-bar", () => ({ TriageBar: () => null }));
jest.mock("./brief-scan-strip", () => ({ BriefScanStrip: () => null }));

const BASE_LEAD = {
  id: "lead-1",
  status: "new",
  homeowner: null,
  contact_name: null,
  contact_email: null,
  contact_phone: null,
  source: null,
  homeowner_id: null,
  match_score: null,
  budget_range: null,
  timeline: null,
  project_description: null,
  match_reasons: [],
  location_city: null,
  location_state: null,
  project_type: null,
  response_deadline: null,
};

describe("BriefSection — US-28 S9 her words on the note edge, budget and timeline as facts", () => {
  it("prints the quote on --edge-note and Budget and Timeline as dt/dd facts, never tiles", () => {
    mockLead = {
      ...BASE_LEAD,
      budget_range: "50k_100k",
      timeline: "this_quarter",
      project_description: "The living room is empty except for a piano.",
    };
    render(<BriefSection leadId="lead-1" />);

    const quote = screen.getByText("“The living room is empty except for a piano.”");
    expect(quote.tagName).toBe("BLOCKQUOTE");
    expect(quote).toHaveClass("papers-note");
    expect(quote.className).not.toMatch(/border-l-\[3px\]|bg-\[rgba/);

    const facts = document.querySelector("dl.papers-facts");
    expect(facts).not.toBeNull();
    const terms = Array.from(facts!.querySelectorAll("dt"));
    expect(terms.map((dt) => dt.textContent)).toEqual(["Budget", "Timeline"]);
    for (const dt of terms) {
      expect(dt.nextElementSibling?.tagName).toBe("DD");
    }
    // the quote reads before the facts
    expect(
      quote.compareDocumentPosition(facts!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("prints no facts list when the lead carries none", () => {
    mockLead = { ...BASE_LEAD };
    render(<BriefSection leadId="lead-1" />);
    expect(document.querySelector("dl.papers-facts")).toBeNull();
  });
});

describe("BriefSection — one head, not two (W5-R2 item 4)", () => {
  beforeEach(() => {
    mockLead = { ...BASE_LEAD };
  });

  it('prints no inline "Brief" heading of its own', () => {
    render(<BriefSection leadId="lead-1" />);
    expect(screen.queryByRole("heading", { name: "Brief" })).toBeNull();
    expect(screen.queryByText("Brief", { selector: "h2" })).toBeNull();
  });

  it("reports the response deadline to the caller instead of printing a second head", () => {
    mockLead = { ...BASE_LEAD, response_deadline: "2026-09-04" };
    const onEyebrow = jest.fn();
    render(<BriefSection leadId="lead-1" onEyebrow={onEyebrow} />);
    expect(onEyebrow).toHaveBeenLastCalledWith(
      expect.stringContaining("Respond by"),
    );
    // The date no longer prints inline as a sub-label beside a second head.
    expect(screen.queryByText(/Respond by/)).toBeNull();
  });

  it('reports "Reconnect …" once the lead has been nurtured', () => {
    mockLead = {
      ...BASE_LEAD,
      status: "contacted",
      response_deadline: "2026-09-04",
    };
    const onEyebrow = jest.fn();
    render(<BriefSection leadId="lead-1" onEyebrow={onEyebrow} />);
    expect(onEyebrow).toHaveBeenLastCalledWith(
      expect.stringContaining("Reconnect"),
    );
  });

  it("reports null when the lead carries no response deadline", () => {
    const onEyebrow = jest.fn();
    render(<BriefSection leadId="lead-1" onEyebrow={onEyebrow} />);
    expect(onEyebrow).toHaveBeenLastCalledWith(null);
  });

  it("renders with no `onEyebrow` at all — the prop is optional", () => {
    expect(() => render(<BriefSection leadId="lead-1" />)).not.toThrow();
  });
});

describe("BriefSection — the captured contact line (00583)", () => {
  it("prints name, email, and phone separated by a middle dot", () => {
    mockLead = {
      ...BASE_LEAD,
      contact_name: "The Okafors",
      contact_email: "okafors@email.com",
      contact_phone: "(555) 014-2200",
    };
    render(<BriefSection leadId="lead-1" />);
    expect(screen.getByText("The Okafors")).toBeInTheDocument();
    expect(screen.getByText("okafors@email.com")).toBeInTheDocument();
    expect(screen.getByText("(555) 014-2200")).toBeInTheDocument();
  });

  it("prints a phone-only capture without a leading separator", () => {
    mockLead = { ...BASE_LEAD, contact_phone: "(555) 014-2200" };
    render(<BriefSection leadId="lead-1" />);
    const line = screen.getByText("(555) 014-2200").parentElement;
    expect(line?.textContent).toBe("(555) 014-2200");
  });

  it("prefers the joined homeowner profile's phone, as the name and email do", () => {
    mockLead = {
      ...BASE_LEAD,
      contact_phone: "(555) 014-2200",
      homeowner: { full_name: "Ada Okafor", email: "ada@email.com", phone: "(555) 990-0001" },
    };
    render(<BriefSection leadId="lead-1" />);
    expect(screen.getByText("(555) 990-0001")).toBeInTheDocument();
    expect(screen.queryByText("(555) 014-2200")).toBeNull();
  });

  it("falls back to the captured phone when the profile carries none", () => {
    mockLead = {
      ...BASE_LEAD,
      contact_phone: "(555) 014-2200",
      homeowner: { full_name: "Ada Okafor", email: "ada@email.com", phone: null },
    };
    render(<BriefSection leadId="lead-1" />);
    expect(screen.getByText("(555) 014-2200")).toBeInTheDocument();
  });

  it("falls back to the joined homeowner profile's phone on an inbound lead", () => {
    mockLead = {
      ...BASE_LEAD,
      homeowner_id: "profile-1",
      homeowner: { full_name: "Ada Okafor", email: "ada@email.com", phone: "(555) 990-0001" },
    };
    render(<BriefSection leadId="lead-1" />);
    expect(screen.getByText("(555) 990-0001")).toBeInTheDocument();
  });
});

// US-25 fix-now 14 — `Respond to the inquiry` opens a reply draft to the
// lead's contact, not just a scroll; nothing sends without a second named
// control, and that control hands the draft to her own mail.
describe("BriefSection — the inquiry reply draft (fix-now 14)", () => {
  const land = () => {
    let taken = false;
    act(() => {
      taken = !window.dispatchEvent(
        new CustomEvent(ACT_LANDING_EVENTS.inquiryReply, { cancelable: true }),
      );
    });
    return taken;
  };

  it("opens a draft addressed to the lead's contact, with a named send control", () => {
    mockLead = { ...BASE_LEAD, contact_name: "Ada Park", contact_email: "ada@example.com" };
    render(<BriefSection leadId="lead-1" />);
    expect(screen.queryByRole("group", { name: "Reply to Ada Park" })).toBeNull();
    expect(land()).toBe(true);
    const draft = screen.getByRole("group", { name: "Reply to Ada Park" });
    expect(draft).toHaveTextContent("To Ada Park · ada@example.com");
    fireEvent.change(screen.getByRole("textbox", { name: "Your reply to Ada Park" }), {
      target: { value: "Thanks for writing." },
    });
    const send = screen.getByRole("link", { name: "Open in your mail to send" });
    expect(send.getAttribute("href")).toBe(
      "mailto:ada%40example.com?subject=Your%20inquiry&body=Thanks%20for%20writing.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group", { name: "Reply to Ada Park" })).toBeNull();
  });

  it("does not take the press when there is no address to reply to", () => {
    mockLead = { ...BASE_LEAD, contact_name: "Ada Park" };
    render(<BriefSection leadId="lead-1" />);
    expect(land()).toBe(false);
  });
});
