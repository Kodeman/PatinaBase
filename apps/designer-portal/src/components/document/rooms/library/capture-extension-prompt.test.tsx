import { fireEvent, render, screen } from "@testing-library/react";
import { CaptureExtensionPrompt } from "./capture-extension-prompt";

const mockUseFeatureFlag = jest.fn();
const mockOpenAccountPage = jest.fn();
const mockPromptViewed = jest.fn();
const mockInstallClicked = jest.fn();
const mockInstructionsOpened = jest.fn();
const mockPromptDismissed = jest.fn();

jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: (...args: unknown[]) => mockUseFeatureFlag(...args),
}));

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
    process.env.NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_MODE = "unpacked";
    process.env.NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_URL =
      "https://example.com/patina-capture.zip";
    mockUseFeatureFlag.mockReturnValue({ value: true, isLoading: false });
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_MODE;
    delete process.env.NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_URL;
  });

  it("fails closed while the beta flag is loading or disabled", () => {
    mockUseFeatureFlag.mockReturnValue({ value: false, isLoading: true });
    const { rerender } = render(<CaptureExtensionPrompt />);
    expect(screen.queryByText(/Bring product pages/i)).not.toBeInTheDocument();

    mockUseFeatureFlag.mockReturnValue({ value: false, isLoading: false });
    rerender(<CaptureExtensionPrompt />);
    expect(screen.queryByText(/Bring product pages/i)).not.toBeInTheDocument();
  });

  it("shows configured beta copy and permanently recedes on dismissal", () => {
    const { unmount } = render(<CaptureExtensionPrompt />);

    expect(screen.getByText(/Bring product pages/i)).toBeInTheDocument();
    expect(mockPromptViewed).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("link", { name: /Download beta/i }),
    ).toHaveAttribute("href", "https://example.com/patina-capture.zip");

    fireEvent.click(
      screen.getByRole("button", { name: /Dismiss extension beta/i }),
    );
    expect(mockPromptDismissed).toHaveBeenCalledWith({
      surface: "library",
      install_mode: "unpacked",
    });
    expect(screen.queryByText(/Bring product pages/i)).not.toBeInTheDocument();

    unmount();
    render(<CaptureExtensionPrompt />);
    expect(screen.queryByText(/Bring product pages/i)).not.toBeInTheDocument();
  });

  it("opens the permanent Account instructions and retires the prompt", () => {
    render(<CaptureExtensionPrompt />);
    fireEvent.click(
      screen.getByRole("button", { name: /Installation steps/i }),
    );

    expect(mockOpenAccountPage).toHaveBeenCalledWith("extension");
    expect(mockInstructionsOpened).toHaveBeenCalledWith({
      surface: "library",
      install_mode: "unpacked",
    });
    expect(screen.queryByText(/Bring product pages/i)).not.toBeInTheDocument();
  });
});
