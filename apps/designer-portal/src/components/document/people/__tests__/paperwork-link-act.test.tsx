/**
 * MINT A PAPERWORK LINK (PR-a, R-AD, R-AF, acceptance 11–12).
 *
 * R-AD is the whole test: the end date is NEVER assumed. The band says which
 * clock it would use, in words, before the press; a firm with no open
 * engagement is offered the choice rather than a silent fallback; and the act
 * is HELD while the named day is blank.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  PaperworkLinkAct,
  NO_ENGAGEMENT_SENTENCE,
  paperworkReplaceSentence,
} from "../paperwork-link-act";
// The REAL derivation the company card feeds this band — W4 r2 MAJOR-2 is a
// disagreement between it and `mint_paperwork_link`, so the seam is tested
// with the real function rather than a hand-picked prop.
const { firmEngagementWindowEnd } = jest.requireActual("@patina/supabase");

const mintMutate = jest.fn();
const links: { current: unknown[] } = { current: [] };

jest.mock("@patina/supabase", () => ({
  useMintPaperworkLink: () => ({ mutateAsync: mintMutate, isPending: false }),
  usePaperworkLinks: () => ({ data: links.current }),
  paperworkLinkUrl: (t: string) => `https://client.patina.cloud/paperwork/${t}`,
  thirtyDaysOut: () => "2026-10-15",
}));

const grantMinted = jest.fn();
jest.mock("@/lib/analytics/people-events", () => ({
  peopleEvents: { grantMinted: (p: unknown) => grantMinted(p) },
}));

const announce = jest.fn();
const NOW = new Date("2026-09-15T12:00:00Z");

function renderAct(windowEnd: string | null) {
  return render(
    <PaperworkLinkAct
      companyId="firm-twin-cities"
      firmName="Twin Cities Drywall"
      windowEnd={windowEnd}
      onAnnounce={announce}
      now={NOW}
    />,
  );
}

beforeEach(() => {
  links.current = [];
  mintMutate.mockReset().mockResolvedValue({
    id: "tok-1",
    token: "rawtoken",
    expires_at: "2026-11-21T23:59:59Z",
  });
  announce.mockReset();
  grantMinted.mockReset();
});

describe("the paperwork mint act", () => {
  it("names the firm's own window before the press (R-AD)", () => {
    renderAct("2026-11-21");
    fireEvent.click(screen.getByText("Mint a paperwork link"));
    expect(
      screen.getByText(
        "– The door can end with this firm's work here, 21 November 2026.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Ends with the job — 21 November 2026"),
    ).toBeChecked();
  });

  it("says a firm with no engagement has no clock to fall back on", () => {
    renderAct(null);
    fireEvent.click(screen.getByText("Mint a paperwork link"));
    expect(screen.getByText(`– ${NO_ENGAGEMENT_SENTENCE}`)).toBeInTheDocument();
    // The window option is not offered where there is no window to offer.
    expect(screen.queryByLabelText(/Ends with the job/)).toBeNull();
    expect(screen.getByLabelText("Thirty days — 15 October 2026")).toBeChecked();
  });

  // W4 r2 MAJOR-2. An open seat whose `on_site_to` has passed — a crew nobody
  // stamped off the job — is NOT a window. The band used to print it, pre-select
  // it, and then meet `paperwork_link_window_required` on its own default.
  it("offers no 'Ends with the job' choice for a firm whose window has passed", () => {
    const lapsedSeats = [
      {
        company_id: "firm-twin-cities",
        off_job_at: null,
        on_site_to: "2026-03-01",
        warranty_until: null,
      },
    ];
    const windowEnd = firmEngagementWindowEnd(
      lapsedSeats,
      "firm-twin-cities",
      NOW,
    );
    expect(windowEnd).toBeNull();
    renderAct(windowEnd);
    fireEvent.click(screen.getByText("Mint a paperwork link"));
    expect(screen.queryByLabelText(/Ends with the job/)).toBeNull();
    expect(screen.queryByText(/1 March 2026/)).toBeNull();
    expect(screen.getByText(`– ${NO_ENGAGEMENT_SENTENCE}`)).toBeInTheDocument();
    expect(screen.getByLabelText("Thirty days — 15 October 2026")).toBeChecked();
  });

  it("still offers a window that is still ahead", () => {
    const openSeats = [
      {
        company_id: "firm-twin-cities",
        off_job_at: null,
        on_site_to: "2026-11-21",
        warranty_until: null,
      },
    ];
    renderAct(firmEngagementWindowEnd(openSeats, "firm-twin-cities", NOW));
    fireEvent.click(screen.getByText("Mint a paperwork link"));
    expect(
      screen.getByLabelText("Ends with the job — 21 November 2026"),
    ).toBeChecked();
  });

  it("hands the RPC no date when the firm's own window is chosen", async () => {
    renderAct("2026-11-21");
    fireEvent.click(screen.getByText("Mint a paperwork link"));
    fireEvent.click(screen.getByText("Open the door"));
    await waitFor(() =>
      expect(mintMutate).toHaveBeenCalledWith({
        companyId: "firm-twin-cities",
        expiresAt: null,
      }),
    );
    expect(grantMinted).toHaveBeenCalledWith({
      tier: "paperwork_link",
      expiry_source: "engagement_window",
    });
  });

  it("sends the thirty-day DAY the studio picked, not a running clock", async () => {
    renderAct(null);
    fireEvent.click(screen.getByText("Mint a paperwork link"));
    fireEvent.click(screen.getByText("Open the door"));
    await waitFor(() =>
      expect(mintMutate).toHaveBeenCalledWith({
        companyId: "firm-twin-cities",
        expiresAt: "2026-10-15T23:59:59Z",
      }),
    );
    expect(grantMinted).toHaveBeenCalledWith({
      tier: "paperwork_link",
      expiry_source: "chosen",
    });
  });

  it("is held, with its reason visible, while the named day is blank", () => {
    renderAct(null);
    fireEvent.click(screen.getByText("Mint a paperwork link"));
    fireEvent.click(screen.getByLabelText("Their next window — a day I name"));
    const act = screen.getByText("Open the door").closest("button")!;
    expect(act).toHaveAttribute("aria-disabled", "true");
    expect(act).not.toHaveAttribute("disabled");
    // W4 round-1 review MAJOR-4: the sentence in full, and no ruling id on the
    // studio's face.
    expect(
      screen.getByText(
        "Name the day it closes. There is no clock to fall back on.",
      ),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bR-[A-Z]{1,2}\b/);
    fireEvent.click(act);
    expect(mintMutate).not.toHaveBeenCalled();
  });

  it("prints the address once, and says it will not print it again", async () => {
    renderAct("2026-11-21");
    fireEvent.click(screen.getByText("Mint a paperwork link"));
    fireEvent.click(screen.getByText("Open the door"));
    expect(
      await screen.findByText("https://client.patina.cloud/paperwork/rawtoken"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This address is shown once. Twin Cities Drywall can send their paper here until 21 November 2026.",
      ),
    ).toBeInTheDocument();
  });

  it("warns that a new door closes the standing one (R-AF)", () => {
    links.current = [
      { id: "tok-0", status: "active", expires_at: "2026-12-01T00:00:00Z" },
    ];
    renderAct("2026-11-21");
    fireEvent.click(screen.getByText("Mint a paperwork link"));
    expect(
      screen.getByText(paperworkReplaceSentence("Twin Cities Drywall")),
    ).toBeInTheDocument();
  });

  it("says the RPC's refusal in an alert and mints nothing", async () => {
    mintMutate.mockRejectedValue(
      new Error("This firm has no open engagement here, so the door needs an end date."),
    );
    renderAct(null);
    fireEvent.click(screen.getByText("Mint a paperwork link"));
    fireEvent.click(screen.getByText("Open the door"));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("no open engagement here");
    expect(screen.queryByText(/\/paperwork\//)).toBeNull();
  });
});
