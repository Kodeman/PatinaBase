import { render, screen } from "@testing-library/react";

import SpecBookSharePage from "../page";
import { resolveSpecBookShare } from "../spec-book-share";

jest.mock("../spec-book-share", () => ({
  resolveSpecBookShare: jest.fn(),
}));

const TOKEN = "a".repeat(64);
const share = {
  artifactId: "40000000-0000-4000-8000-000000000001",
  audience: "client" as const,
  format: "pdf" as const,
  label: "For the homeowners",
  title: "Lakeside Residence — Client Edition",
  sizeBytes: 248012,
  checksumSha256: "b".repeat(64),
  issuedAt: "2026-07-30T18:00:00.000Z",
  shareExpiresAt: null,
};

describe("/field/spec-book/[token]", () => {
  beforeEach(() => {
    jest.mocked(resolveSpecBookShare).mockReset();
  });

  it("renders a view-only, audience-labeled surface for a valid ready artifact", async () => {
    jest.mocked(resolveSpecBookShare).mockResolvedValue(share);
    render(
      await SpecBookSharePage({
        params: Promise.resolve({ token: TOKEN }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: share.title }),
    ).toBeInTheDocument();
    expect(screen.getByText("Client edition")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "View-only document" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View PDF" })).toHaveAttribute(
      "href",
      `/field/spec-book/${TOKEN}/download`,
    );
    expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
      "href",
      `/field/spec-book/${TOKEN}/download?download=1`,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it.each(["malformed", "expired", "revoked", "wrong-audience", "non-ready"])(
    "renders the same non-enumerating dead-link surface for a %s token",
    async () => {
      jest.mocked(resolveSpecBookShare).mockResolvedValue(null);
      render(
        await SpecBookSharePage({
          params: Promise.resolve({ token: TOKEN }),
        }),
      );

      expect(screen.getByTestId("spec-book-dead-link")).toHaveTextContent(
        "This link isn’t available",
      );
      expect(screen.queryByText(share.title)).not.toBeInTheDocument();
      expect(screen.queryByText(/client edition/i)).not.toBeInTheDocument();
    },
  );

  it("uses the identical dead-link UI after a failed download without resolving again", async () => {
    render(
      await SpecBookSharePage({
        params: Promise.resolve({ token: TOKEN }),
        searchParams: Promise.resolve({ unavailable: "1" }),
      }),
    );

    expect(screen.getByTestId("spec-book-dead-link")).toHaveTextContent(
      "This link isn’t available",
    );
    expect(resolveSpecBookShare).not.toHaveBeenCalled();
  });
});
