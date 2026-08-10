"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { captureExtensionEvents } from "@/lib/analytics/capture-extension-events";
import { getCaptureExtensionConfig } from "@/lib/capture-extension";
import { DocumentAction, DocumentActionGroup } from "../../document-action";
import { openAccountPage } from "../../account/account-sheet";

const DISMISSED_KEY = "patina:capture-extension-prompt";

function markPromptSeen(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    // Best effort: storage-disabled browsers may see the prompt next visit.
  }
}

function promptWasSeen(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) !== null;
  } catch {
    return false;
  }
}

export function CaptureExtensionPrompt() {
  const [visible, setVisible] = useState(false);
  const viewedRef = useRef(false);
  const { mode, installUrl, isConfigured } = getCaptureExtensionConfig();

  useEffect(() => {
    if (!isConfigured || !mode || promptWasSeen()) {
      setVisible(false);
      return;
    }

    setVisible(true);
    if (!viewedRef.current) {
      viewedRef.current = true;
      captureExtensionEvents.promptViewed({
        surface: "library",
        install_mode: mode,
      });
    }
  }, [isConfigured, mode]);

  if (
    !visible ||
    !isConfigured ||
    !mode ||
    !installUrl
  ) {
    return null;
  }

  const recede = () => {
    markPromptSeen();
    setVisible(false);
  };

  return (
    <aside
      aria-labelledby="capture-extension-prompt-title"
      className="mx-6 mt-5 border-y border-[rgba(196,165,123,0.34)] px-1 py-4 sm:mx-9 sm:flex sm:items-center sm:justify-between sm:gap-6"
    >
      <div className="min-w-0">
        <p className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.11em] text-[var(--color-clay)]">
          Chrome capture
        </p>
        <h2
          id="capture-extension-prompt-title"
          className="mt-1 font-heading text-[17px] text-[var(--color-charcoal)]"
        >
          Bring product pages into your Library.
        </h2>
        <p className="mt-1 max-w-[58ch] text-[11.5px] leading-relaxed text-[var(--color-aged-oak)]">
          {mode === "webstore"
            ? "Patina Capture reads the piece in front of you and saves it here, ready for your eye."
            : "The Chrome update is under review. Paste a product URL below to capture it now."}
        </p>
      </div>

      <div className="mt-4 flex shrink-0 items-center gap-2 sm:mt-0">
        <DocumentActionGroup
          surfaceKey="library"
          regionKey="capture-extension-prompt"
        >
          <DocumentAction
            actionKey="install-capture-extension"
            variant="primary"
            href={installUrl}
            target="_blank"
            rel="noopener noreferrer"
            trailing="↗"
            onClick={() => {
              captureExtensionEvents.installClicked({
                surface: "library",
                install_mode: mode,
              });
              recede();
            }}
          >{mode === "webstore" ? "Add to Chrome" : "Chrome update under review"}</DocumentAction>
          <DocumentAction
            actionKey="capture-extension-instructions"
            variant="tertiary"
            onClick={() => {
              captureExtensionEvents.instructionsOpened({
                surface: "library",
                install_mode: mode,
              });
              recede();
              openAccountPage("extension");
            }}
          >
            {mode === "webstore" ? "Installation steps" : "Paste a URL instead"}
          </DocumentAction>
        </DocumentActionGroup>
        <button
          type="button"
          aria-label="Dismiss extension prompt"
          onClick={() => {
            captureExtensionEvents.promptDismissed({
              surface: "library",
              install_mode: mode,
            });
            recede();
          }}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[4px] text-[var(--color-aged-oak)] transition-colors hover:text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
        >
          <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        </button>
      </div>
    </aside>
  );
}
