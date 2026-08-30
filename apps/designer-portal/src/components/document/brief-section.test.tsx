/**
 * W5-R2 item 4 — the Brief's own inline `<h2>Brief</h2>` and its
 * "Respond by …" / "Reconnect …" sub-label are retired: `PreworkRegion`'s
 * `RegionHead` (mounted by the caller, `page.tsx`) is the paper's one head
 * for this stop now. The sub-label names a distinct fact (a date), so it
 * reports up into that head's eyebrow via `onEyebrow`, rather than standing
 * beside a second heading.
 */
import { render, screen } from "@testing-library/react";
import { BriefSection } from "./brief-section";

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
