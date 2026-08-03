import { render, screen } from "@testing-library/react";
import { AccountExtensionPage } from "./account-extension-page";

jest.mock("@/lib/analytics/capture-extension-events", () => ({
  captureExtensionEvents: {
    instructionsOpened: jest.fn(),
    installClicked: jest.fn(),
  },
}));

describe("AccountExtensionPage", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_MODE;
    delete process.env.NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_URL;
  });

  it("shows the supported unpacked installation flow", () => {
    process.env.NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_MODE = "unpacked";
    process.env.NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_URL =
      "https://example.com/patina-capture.zip";

    render(<AccountExtensionPage />);

    expect(
      screen.getByRole("link", { name: /Download beta/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Load unpacked/i)).toBeInTheDocument();
    expect(screen.getByText(/containing manifest.json/i)).toBeInTheDocument();
  });

  it("switches to Web Store installation without code changes", () => {
    process.env.NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_MODE = "webstore";
    process.env.NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_URL =
      "https://chromewebstore.google.com/detail/patina/example";

    render(<AccountExtensionPage />);

    expect(
      screen.getByRole("link", { name: /Add to Chrome/i }),
    ).toHaveAttribute(
      "href",
      "https://chromewebstore.google.com/detail/patina/example",
    );
    expect(screen.getByText(/updates automatically/i)).toBeInTheDocument();
  });

  it("renders an unavailable state for missing configuration", () => {
    render(<AccountExtensionPage />);
    expect(screen.getByRole("status")).toHaveTextContent(
      /temporarily unavailable/i,
    );
    expect(
      screen.queryByRole("link", { name: /Chrome|beta/i }),
    ).not.toBeInTheDocument();
  });
});
