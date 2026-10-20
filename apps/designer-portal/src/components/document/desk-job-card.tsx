"use client";

/**
 * A Today card (US-28 S3; uplift.md change 1): one job and its lines on the
 * Day Sheet. The S1 Card — the stage edge on the left, the eyebrow (stage ·
 * holder · freshness), the job's name in display type, its one state
 * sentence (US-43 R7), then its lines. The
 * name's link covers the card's upper block; the lines keep their own acts.
 */

import { useRef, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { queryClient } from "@/lib/react-query";
import { documentEngagementQueryOptions } from "@/hooks/use-document-state";
import { STAGE_WORD } from "@/lib/document/act-names";
import type { SectionKey } from "@/lib/document/desk-derivation";
import type { DeskScope } from "@/lib/document/desk-scope";
import { timeWord, type SheetCard } from "@/lib/document/day-sheet";

/** The S1 stage class for a job's stage. Care has no edge of its own: it
 *  stands on the install edge it grew out of. */
export function stageClass(stage: SectionKey): string {
  return `st-${stage === "care" ? "install" : stage}`;
}

/** The holder word: "Leah’s". */
export const holderWord = (name: string) => `${name}’s`;

/** "9:30" — the clock time a line settled at. */
export function clockTime(at: string | null | undefined): string {
  const date = at ? new Date(at) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getHours() % 12 || 12}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** US-43 R7 — the card's one state sentence, in body type under its name. */
function CardState({ words }: { words?: string }) {
  if (!words) return null;
  return (
    <p className="t-body card-state" data-card-state>
      {words}
    </p>
  );
}

export function DeskJobCard({
  card,
  scope,
  now,
  first = false,
  state,
  children,
}: {
  card: SheetCard;
  scope: DeskScope;
  now: Date;
  /** Card one carries the arrival's `job` mark on its name. */
  first?: boolean;
  /** US-43 R7 — the one state sentence under the name (`cardStateWords`). */
  state?: string;
  children: ReactNode;
}) {
  const { stage, holder } = card;
  const router = useRouter();
  const prefetched = useRef(false);
  const href = `/doc/${card.jobId}`;
  const prefetchDocument = () => {
    if (prefetched.current) return;
    prefetched.current = true;
    router.prefetch(href);
    void queryClient.prefetchQuery(documentEngagementQueryOptions(card.jobId));
  };
  // The holder prints wherever the job could be someone else's: always in
  // the studio's scope, and in Mine only on a job she does not carry.
  const showHolder = !!holder?.name && (scope === "studio" || !holder.mine);
  const latest = card.lines
    .map((line) => line.need.at)
    .filter((at): at is string => !!at)
    .sort()
    .at(-1);
  const fresh = timeWord(latest, now);
  const eyebrow = [
    stage ? STAGE_WORD[stage] : null,
    showHolder ? holderWord(holder!.name!) : null,
    fresh,
  ].filter(Boolean);

  return (
    <article
      className={stage ? `card ${stageClass(stage)}` : "card"}
      data-stage={stage ?? undefined}
      data-desk-card={card.jobId}
    >
      <div className="card-up">
        {eyebrow.length > 0 && <p className="eb">{eyebrow.join(" · ")}</p>}
        <h3 className="t-d3 name-h">
          <Link
            href={href}
            prefetch={false}
            onPointerEnter={prefetchDocument}
            onFocus={prefetchDocument}
            className="name"
            data-part={first ? "job" : undefined}
            data-day-sheet-job
            // arrival-mount.tsx TOKEN_LINKS: opening the job from its card is
            // a soft entry into the Document, as the claim card's name was.
            data-roster-name
          >
            {card.name}
          </Link>
        </h3>
        <CardState words={state} />
      </div>
      <ul className="lines">{children}</ul>
    </article>
  );
}
