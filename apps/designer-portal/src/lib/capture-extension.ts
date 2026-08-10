export type CaptureExtensionInstallMode = "under_review" | "webstore";

export interface CaptureExtensionConfig {
  mode: CaptureExtensionInstallMode | null;
  installUrl: string | null;
  isConfigured: boolean;
}

function isInstallMode(
  value: string | undefined,
): value is CaptureExtensionInstallMode {
  return value === "under_review" || value === "webstore";
}

function safeInstallUrl(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Public build-time configuration for the reviewed Chrome distribution.
 * Invalid or incomplete values fail closed so the portal never emits a broken
 * or unsafe install link.
 */
export function getCaptureExtensionConfig(): CaptureExtensionConfig {
  const rawMode = process.env.NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_MODE;
  const mode = isInstallMode(rawMode) ? rawMode : null;
  const installUrl = safeInstallUrl(
    process.env.NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_URL,
  );

  return {
    mode,
    installUrl,
    isConfigured: mode === "under_review" || (mode === "webstore" && installUrl !== null),
  };
}
