import { fireEvent, render, screen } from "@testing-library/react";
import { CaptureExtensionPrompt } from "./capture-extension-prompt";

const mockOpenAccountPage = jest.fn();
const mockPromptViewed = jest.fn();
const mockInstallClicked = jest.fn();
const mockInstructionsOpened = jest.fn();
const mockPromptDismissed = jest.fn();

jest.mock("@/lib/analytics/capture-extension-events", () => ({
  captureExtensionEvents: {
    promptViewed: (...args: unknown[]) => mockPromptViewed(...args),
    installClicked: (...args: unknown[]) => mockInstallClicked(...args),
    instructionsOpened: (...args: unknown[]) => mockInstructionsOpened(...args),
    promptDismissed: (...args: unknown[]) => mockPromptDismissed(...args),
  },
}));

jest.mock("../../account/account-sheet", () => ({
  openAccountPage: (...args: unknown[]) => mockOpenAccountPage(...args),
}));

describe("CaptureExtensionPrompt", () => {
  beforeEach(() => {
    window.localStorage.clear();
    process.env.NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_MODE = "under_review";
    delete process.env.NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_URL;
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_MODE;
    delete process.env.NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_URL;
  });

  it("fails closed when no Web Store configuration exists", () => {
    delete process.env.NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_MODE;
    const { rerender } = render(<CaptureExtensionPrompt />);
    expect(screen.queryByText(/Bring product pages/i)).not.toBeInTheDocument();
    process.env.NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_MODE = "under_review";
    rerender(<CaptureExtensionPrompt />);
  });

  it("shows the honest update-under-review alternative and permanently recedes on dismissal", () => {
    const { unmount } = render(<CaptureExtensionPrompt />);

    expect(screen.getByText(/Bring product pages/i)).toBeInTheDocument();
    expect(mockPromptViewed).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Paste a URL/i })).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /Dismiss extension prompt/i }),
    );
    expect(mockPromptDismissed).toHaveBeenCalledWith({
      surface: "library",
      install_mode: "under_review",
    });
    expect(screen.queryByText(/Bring product pages/i)).not.toBeInTheDocument();

    unmount();
    render(<CaptureExtensionPrompt />);
    expect(screen.queryByText(/Bring product pages/i)).not.toBeInTheDocument();
  });

  it("offers the paste-URL alternative while Chrome is under review", () => {
    const opened = jest.fn();
    window.addEventListener("document:open-library-capture", opened);
    render(<CaptureExtensionPrompt />);
    fireEvent.click(
      screen.getByRole("button", { name: /Paste a URL/i }),
    );

    expect(opened).toHaveBeenCalledTimes(1);
    expect(mockInstallClicked).toHaveBeenCalledWith({ surface: "library", install_mode: "under_review" });
    expect(screen.queryByText(/Bring product pages/i)).not.toBeInTheDocument();
    window.removeEventListener("document:open-library-capture", opened);
  });
});
