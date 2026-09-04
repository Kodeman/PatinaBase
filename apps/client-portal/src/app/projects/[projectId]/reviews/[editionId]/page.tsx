"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * L6 absorbs this route's act into the Threshold: `SelectionEditionAsk`
 * (components/threshold/review-ask.tsx) reads the edition id off `?review=`
 * the way the letterbox reads `?checkout=`, and renders the same bundle in
 * place. `selection-review-send`'s email still points here, so the deep link
 * still has to land somewhere real — this hands the id on rather than
 * rendering a standalone page.
 *
 * Unconditional — L8's brief removes the `threshold` flag from
 * `ProjectSurfaceSwitch` entirely ("everyone gets the new portal, no feature
 * flag"), so a flag read here would go stale the moment that lands: it would
 * render the standalone `ProjectReviewEdition` forever (the flag simply never
 * resolving true again) while the retirement plan's deletion of that
 * component turns this route into a build error. Finding #2.
 */
export default function ProjectReviewPage({
  params,
}: {
  params: Promise<{ projectId: string; editionId: string }>;
}) {
  const { projectId, editionId } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/projects/${projectId}?review=${editionId}`);
  }, [projectId, editionId, router]);

  return null;
}
