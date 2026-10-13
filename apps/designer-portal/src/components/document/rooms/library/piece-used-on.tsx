"use client";

/**
 * "Used on" on the piece page (US-28 S10c; specimens/library-1440.html p2):
 * one ledger row per job the piece is on, each with its job's tick and the
 * stage word in ink. Loading is not empty, so nothing prints until the read
 * lands; a piece on no job says so in one sentence.
 */

import Link from "next/link";
import { EmptyState } from "../../empty-state";
import { DocumentAction } from "../../document-action";
import {
  USAGE_STAGE_WORD,
  usePieceUsage,
  usageStageClass,
} from "./use-piece-usage";

export function PieceUsedOn({ productId }: { productId: string }) {
  const { data, isLoading, isError } = usePieceUsage([productId]);
  if (isLoading || isError) return null;

  const uses = data?.[productId] ?? [];
  if (uses.length === 0) {
    return (
      <EmptyState eyebrow="Used on" className="piece-used">
        Not on a job yet.
      </EmptyState>
    );
  }

  return (
    <section
      aria-labelledby="piece-used-on"
      data-piece-used-on
      className="section piece-used"
    >
      <div className="sec-head">
        <h2 id="piece-used-on" className="eb">
          <svg className="orn" viewBox="0 0 34 12" aria-hidden="true" focusable="false">
            <path d="M0 2h34M0 6h28M0 10h20" />
          </svg>
          <span>Used on</span>
        </h2>
      </div>
      <div className="ledger">
        <ul className="rows">
          {uses.map((use) => (
            <li key={use.projectId} className="lrow">
              <span className="lname">
                <span className={`tick ${usageStageClass(use.stage)}`}>
                  <Link className="name t-d4" href={`/doc/${use.projectId}`}>
                    {use.title}
                  </Link>
                </span>
              </span>
              <span className="lphase word">{USAGE_STAGE_WORD[use.stage]}</span>
              <span className="lsent">{use.clientName ?? ""}</span>
              <span className="lwhen t-body-sm" />
              <span className="lact">
                <DocumentAction
                  actionKey="open-piece-job"
                  surfaceKey="piece"
                  regionKey="piece-used-on"
                  variant="tertiary"
                  href={`/doc/${use.projectId}`}
                  aria-label={`Open the paper for ${use.title}`}
                >
                  Open the paper
                </DocumentAction>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
