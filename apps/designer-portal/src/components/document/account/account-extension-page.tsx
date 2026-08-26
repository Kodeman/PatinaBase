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
    captureExtensionEvents.instructionsOpened({ surface: "account", install_mode: mode });
  }, [mode]);

  const isWebStore = mode === "webstore" && !!installUrl;

  return (
    <div className="pt-1">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.11em] text-[var(--color-clay-ink)]">
            Chrome capture
          </p>
          <h3 className="mt-1 font-heading text-[18px] text-[var(--color-charcoal)]">
            Patina Capture for Chrome
          </h3>
        </div>
        <span className="rounded-full border border-[rgba(196,165,123,0.4)] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
          {isWebStore ? "Available" : "Under review"}
        </span>
      </div>

      <p className="max-w-[58ch] text-[12px] leading-relaxed text-[var(--color-aged-oak)]">
        Capture furniture, lighting, and materials from a product page into My Library.
      </p>

      {isConfigured && isWebStore ? (
        <DocumentActionGroup surfaceKey="account" regionKey="capture-extension" className="mt-5">
          <DocumentAction
            actionKey="install-capture-extension"
            variant="primary"
            href={installUrl}
            target="_blank"
            rel="noopener noreferrer"
            trailing="↗"
            onClick={() => captureExtensionEvents.installClicked({ surface: "account", install_mode: "webstore" })}
          >
            Add to Chrome
          </DocumentAction>
        </DocumentActionGroup>
      ) : (
        <div role="status" className="mt-5 rounded-[6px] border border-[var(--color-pearl)] px-4 py-3 text-[11.5px] text-[var(--color-aged-oak)]">
          The Chrome update is under review. In the meantime, open the Library, choose Capture, and paste a product URL.
        </div>
      )}

      <div className="my-6"><StrataMark size="sm" /></div>

      {isWebStore ? (
        <section aria-labelledby="capture-extension-store-steps">
          <h4 id="capture-extension-store-steps" className="font-heading text-[15px] text-[var(--color-charcoal)]">After installation</h4>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-[11.5px] leading-relaxed text-[var(--color-mocha)]">
            <li>Open Chrome&apos;s Extensions menu and pin Patina Capture.</li>
            <li>Keep this portal signed in so the extension can use your Patina session.</li>
            <li>Visit a product page and choose the Patina icon to capture it.</li>
          </ol>
        </section>
      ) : (
        <section aria-labelledby="capture-extension-review-status">
          <h4 id="capture-extension-review-status" className="font-heading text-[15px] text-[var(--color-charcoal)]">While Chrome reviews the update</h4>
          <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--color-mocha)]">
            Paste URL uses the same guarded capture service and keeps every capture reusable in My Library.
          </p>
        </section>
      )}

      <p className="mt-6 border-t border-[var(--color-pearl)] pt-4 text-[10.5px] leading-relaxed text-[var(--color-aged-oak)]">
        When the reviewed extension is publicly available, Chrome will install and update it through the Web Store.
      </p>
    </div>
  );
}
