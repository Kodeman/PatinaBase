import { isAnalyticsEnabled, posthog } from "./posthog";
import type { CaptureExtensionInstallMode } from "../capture-extension";

export type CaptureExtensionSurface = "account" | "library";

function track(event: string, properties?: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) return;
  posthog.capture(event, properties);
}

export const captureExtensionEvents = {
  promptViewed: (properties: {
    surface: CaptureExtensionSurface;
    install_mode: CaptureExtensionInstallMode;
  }) => track("ffe_extension_prompt_viewed", properties),

  installClicked: (properties: {
    surface: CaptureExtensionSurface;
    install_mode: CaptureExtensionInstallMode;
  }) => track("ffe_extension_install_clicked", properties),

  instructionsOpened: (properties: {
    surface: CaptureExtensionSurface;
    install_mode: CaptureExtensionInstallMode | null;
  }) => track("ffe_extension_instructions_opened", properties),

  promptDismissed: (properties: {
    surface: "library";
    install_mode: CaptureExtensionInstallMode;
  }) => track("ffe_extension_prompt_dismissed", properties),
};
