"use client";

import { useEffect, useRef } from "react";
import { captureExtensionEvents } from "@/lib/analytics/capture-extension-events";
import { getCaptureExtensionConfig } from "@/lib/capture-extension";
import { DocumentAction, DocumentActionGroup } from "../document-action";
import { StrataMark } from "../strata-mark";

export function AccountExtensionPage() {
  const { mode, installUrl, isConfigured } = getCaptureExtensionConfig();
  const instructionsTrackedRef = useRef(false);

  useEffect(() => {
    if (instructionsTrackedRef.current) return;
    instructionsTrackedRef.current = true;
    captureExtensionEvents.instructionsOpened({
      surface: "account",
      install_mode: mode,
    });
  }, [mode]);

  const isWebStore = mode === "webstore";

  return (
    <div className="pt-1">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.11em] text-[var(--color-clay)]">
            Selected-designer beta
          </p>
          <h3 className="mt-1 font-heading text-[18px] text-[var(--color-charcoal)]">
            Patina Capture for Chrome
          </h3>
        </div>
        <span className="rounded-full border border-[rgba(196,165,123,0.4)] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
          In development
        </span>
      </div>

      <p className="max-w-[58ch] text-[12px] leading-relaxed text-[var(--color-aged-oak)]">
        Capture furniture, lighting, and materials from a product page into My
        Library. The beta works in desktop Google Chrome and adopts the Patina
        session you already use here.
      </p>

      {isConfigured && mode && installUrl ? (
        <DocumentActionGroup
          surfaceKey="account"
          regionKey="capture-extension"
          className="mt-5"
        >
          <DocumentAction
            actionKey="install-capture-extension"
            variant="primary"
            href={installUrl}
            target="_blank"
            rel="noopener noreferrer"
            trailing="↗"
            onClick={() =>
              captureExtensionEvents.installClicked({
                surface: "account",
                install_mode: mode,
              })
            }
          >
            {isWebStore ? "Add to Chrome" : "Download beta"}
          </DocumentAction>
        </DocumentActionGroup>
      ) : (
        <div
          role="status"
          className="mt-5 rounded-[6px] border border-[var(--color-pearl)] px-4 py-3 text-[11.5px] text-[var(--color-aged-oak)]"
        >
          The beta installer is temporarily unavailable. Your Library and
          existing captures are unaffected.
        </div>
      )}

      <div className="my-6">
        <StrataMark size="sm" />
      </div>

      {isWebStore ? <WebStoreInstructions /> : <UnpackedInstructions />}

      <p className="mt-6 border-t border-[var(--color-pearl)] pt-4 text-[10.5px] leading-relaxed text-[var(--color-aged-oak)]">
        Install only the Patina-provided beta. Because it reads product pages
        you choose to capture, Chrome will describe broad site access during
        installation.
      </p>
    </div>
  );
}

function WebStoreInstructions() {
  return (
    <section aria-labelledby="capture-extension-store-steps">
      <h4
        id="capture-extension-store-steps"
        className="font-heading text-[15px] text-[var(--color-charcoal)]"
      >
        After installation
      </h4>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-[11.5px] leading-relaxed text-[var(--color-mocha)]">
        <li>Open Chrome&apos;s Extensions menu and pin Patina Capture.</li>
        <li>
          Keep this portal signed in; the extension adopts the same Patina
          session.
        </li>
        <li>Visit a product page and choose the Patina icon to capture it.</li>
      </ol>
      <p className="mt-3 text-[10.5px] text-[var(--color-aged-oak)]">
        Chrome installs reviewed beta updates automatically.
      </p>
    </section>
  );
}

function UnpackedInstructions() {
  return (
    <section aria-labelledby="capture-extension-unpacked-steps">
      <h4
        id="capture-extension-unpacked-steps"
        className="font-heading text-[15px] text-[var(--color-charcoal)]"
      >
        Install the development build
      </h4>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-[11.5px] leading-relaxed text-[var(--color-mocha)]">
        <li>Download the ZIP and extract it into a permanent folder.</li>
        <li>
          Enter{" "}
          <code className="font-mono text-[10.5px]">chrome://extensions</code>{" "}
          in Chrome&apos;s address bar.
        </li>
        <li>Turn on Developer mode, then choose Load unpacked.</li>
        <li>Select the extracted folder—the one containing manifest.json.</li>
        <li>Open Chrome&apos;s Extensions menu and pin Patina Capture.</li>
      </ol>
      <p className="mt-3 text-[10.5px] leading-relaxed text-[var(--color-aged-oak)]">
        Keep the extracted folder in place. When an update appears, replace its
        contents with the new build and choose Reload on the Chrome extensions
        page.
      </p>
    </section>
  );
}
