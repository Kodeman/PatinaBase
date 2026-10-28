"use client";

import { lazy, Suspense, type ReactNode } from "react";

// Loaded on its own so the round-8 frame chunk does not carry the acceptance
// instrument until the Closeout chapter prints.
const ServiceAcceptanceSection = lazy(() =>
  import("../../service-acceptance/service-acceptance-section").then((module) => ({
    default: module.ServiceAcceptanceSection,
  })),
);

export interface CloseoutChapterProps {
  projectId: string | null;
  /** The stage's existing closeout pieces (care band, install ceremony, care). */
  children: ReactNode;
}

/**
 * 09 Closeout — the stage's closeout pieces, then C4 service acceptance
 * (WP-10C). The single mount point for the chapter's acceptance and
 * completion instruments.
 */
export function CloseoutChapter({ projectId, children }: CloseoutChapterProps) {
  return (
    <>
      {children}
      {projectId && (
        <Suspense fallback={null}>
          <ServiceAcceptanceSection projectId={projectId} />
        </Suspense>
      )}
    </>
  );
}
