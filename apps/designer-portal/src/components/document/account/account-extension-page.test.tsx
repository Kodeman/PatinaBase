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

  it("shows the honest under-review state without a download or unpacked instructions", () => {
    process.env.NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_MODE = "under_review";

    render(<AccountExtensionPage />);

    expect(screen.getByRole("status")).toHaveTextContent(/update is under review/i);
    expect(screen.queryByRole("link", { name: /Download|Chrome/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Load unpacked|Developer mode|ZIP/i)).not.toBeInTheDocument();
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
    expect(screen.getByText(/install and update it through the Web Store/i)).toBeInTheDocument();
  });

  it("renders an unavailable state for missing configuration", () => {
    render(<AccountExtensionPage />);
    expect(screen.getByRole("status")).toHaveTextContent(
      /under review/i,
    );
    expect(
      screen.queryByRole("link", { name: /Chrome|beta/i }),
    ).not.toBeInTheDocument();
  });
});
