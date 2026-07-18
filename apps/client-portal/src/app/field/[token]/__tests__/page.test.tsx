import { render, screen } from "@testing-library/react";
import FieldLinkPage from "../page";
import { bootstrapSiteRequest } from "../site-request-api";
import { createServiceClient } from "@patina/supabase/server";

jest.mock("@patina/supabase/server", () => ({
  createServiceClient: jest.fn(),
}));
jest.mock("../site-request-api", () => ({ bootstrapSiteRequest: jest.fn() }));
jest.mock("../field-actions", () => ({
  FieldWorkBody: () => <div>Legacy field coordination</div>,
}));
jest.mock("../site-request-guest", () => ({
  SiteRequestGuest: () => <div>Site Request checklist</div>,
}));
jest.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const legacy = {
  project: { id: "project", name: "Legacy project" },
  studio_name: "Studio",
  party: {
    id: "party",
    display_name: "Dan",
    party_kind: "contractor",
    trade: null,
  },
  tasks: [],
  items: [],
  punch: [],
  deliveries: [],
};

describe("/field/[token] compatibility routing", () => {
  beforeEach(() => {
    (bootstrapSiteRequest as jest.Mock).mockResolvedValue(null);
    (createServiceClient as jest.Mock).mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    });
  });

  it("preserves the older field-coordination token flow", async () => {
    (createServiceClient as jest.Mock).mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: legacy, error: null }),
    });
    render(
      await FieldLinkPage({
        params: Promise.resolve({ token: "a".repeat(64) }),
      }),
    );
    expect(screen.getByText("Legacy field coordination")).toBeInTheDocument();
    expect(bootstrapSiteRequest).not.toHaveBeenCalled();
  });

  it("falls through to the narrow Site Request bootstrap without direct guest table access", async () => {
    (bootstrapSiteRequest as jest.Mock).mockResolvedValue({
      request: { id: "site-request" },
    });
    render(
      await FieldLinkPage({
        params: Promise.resolve({
          token: "opaque_site_request_token_1234567890abcd",
        }),
      }),
    );
    expect(screen.getByText("Site Request checklist")).toBeInTheDocument();
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("fails closed when neither token rail recognizes the credential", async () => {
    await expect(
      FieldLinkPage({ params: Promise.resolve({ token: "a".repeat(64) }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
