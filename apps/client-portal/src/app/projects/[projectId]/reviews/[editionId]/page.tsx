"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ProjectReviewEdition } from "@/components/project/ProjectReviewEdition";
import { useFeatureFlag } from "@/hooks/use-feature-flag";

interface ProjectReviewPageProps {
  params: Promise<{ projectId: string; editionId: string }>;
}

/**
 * L6 absorbs this route's act into the Threshold: `SelectionEditionAsk`
 * (components/threshold/review-ask.tsx) reads the edition id off `?review=`
 * the way the letterbox reads `?checkout=`, and renders the same bundle in
 * place. `selection-review-send`'s email still points here, so the deep link
 * still has to land somewhere real — this now hands the id on rather than
 * rendering the standalone page itself.
 *
 * Fail-closed, the same way `ProjectSurfaceSwitch` is: while the `threshold`
 * flag is loading, or when this client is not on it, the page renders exactly
 * what it always has. A client not on the pilot must not lose the act while
 * the two surfaces run side by side — only a `threshold` client is forwarded.
 */
export default function ProjectReviewPage({ params }: ProjectReviewPageProps) {
  const { projectId, editionId } = use(params);
  const router = useRouter();
  const { value: threshold, isLoading } = useFeatureFlag("threshold");

  useEffect(() => {
    if (!isLoading && threshold) {
      router.replace(`/projects/${projectId}?review=${editionId}`);
    }
  }, [isLoading, threshold, projectId, editionId, router]);

  if (!isLoading && threshold) return null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl bg-[var(--bg-primary)] px-6 py-10">
      <Link
        href={`/projects/${projectId}`}
        className="type-meta-small text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        ← Back to project
      </Link>
      <ProjectReviewEdition projectId={projectId} editionId={editionId} />
    </main>
  );
}
