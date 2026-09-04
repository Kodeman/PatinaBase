"use client";

import { useState } from "react";
import Image from "next/image";
import { useQueryClient } from "@tanstack/react-query";

import {
  useMyPendingReviewRequests,
  useMySubmittedReviews,
  useSubmitReview,
  type ClientPendingReview,
} from "@patina/supabase";

import { ScoredAction } from "@/components/making/scored-action";
import { moneyInWords } from "@/components/making/standing-sentence";
import {
  useClientProjectReviewBundle,
  useRecordProjectReviewFeedback,
} from "@/hooks/use-commercial-client";
import { useAuth } from "@/hooks/use-auth";
import {
  reviewVerdictFromLabel,
  type ClientReviewVerdict,
} from "@/lib/project-review";

/* ── REVIEW ASKS ──────────────────────────────────────────────────────────────
   Absorbs `/reviews` (a studio review — a rating and a few words about the
   relationship, `client_reviews`) and `/projects/[id]/reviews/[editionId]`
   (a selection-edition review — a preference on the pieces the studio has
   drawn up, `project_review_editions`). Two different tables, two different
   questions, and — old surface kept it this way too — two different asks.

   STUDIO REVIEW is discoverable: `useMyPendingReviewRequests` already reads
   every request addressed to the signed-in client, so the doorstep only has
   to keep the one that names this project.

   EDITION REVIEW is not: `project_review_editions` reads studio-only by RLS,
   and the RPC behind `useClientProjectReviewBundle` takes an edition id the
   client has no list of. The old page only ever reached one edition because
   the email that sent it carried the id in the URL
   (`selection-review-send/lib.ts`'s `reviewUrl`). That id still arrives the
   same way — the redirected route now hands it on as `?review=<editionId>`
   (`app/projects/[projectId]/reviews/[editionId]/page.tsx`) — and this reads
   it off the URL once, in place of the route param the old page took. A
   client who never opens that link never sees this ask, exactly as before. */

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
});
const MIN_BODY = 30;
const STARS = [1, 2, 3, 4, 5] as const;

function designerNameOf(request: ClientPendingReview): string {
  return (
    request.designer?.full_name?.trim() ||
    request.designer?.business_name?.trim() ||
    "your designer"
  );
}

/**
 * The studio's own review request, standing on the doorstep. There is no
 * room for it to belong to — a review is of the relationship, not a piece —
 * so like `DoorstepApproval` it stands beside the ledger rather than inside
 * a band.
 */
export function StudioReviewAsk({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const pendingQuery = useMyPendingReviewRequests(user?.id);
  const submit = useSubmitReview();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<Date | null>(null);

  const request =
    (pendingQuery.data ?? []).find((req) => req.project?.id === projectId) ??
    null;

  if (!request && !sentAt) return null;

  if (sentAt) {
    return (
      <section
        data-threshold-unit="review-ask"
        data-testid="studio-review-sent"
        className="relative mt-8 border-t border-[var(--border-subtle)] pb-8 text-[var(--text-primary)]"
      >
        <p className="pt-2.5 text-[15px] leading-relaxed text-[var(--text-body)]">
          {`Sent ${DAY_MONTH.format(sentAt)}. Thank you for the words.`}
        </p>
      </section>
    );
  }
  if (!request) return null;

  const designerName = designerNameOf(request);

  function handleSubmit() {
    setError(null);
    if (rating < 1 || rating > 5) {
      setError("Choose a rating from 1 to 5 stars.");
      return;
    }
    if (body.trim().length < MIN_BODY) {
      setError(`Share at least ${MIN_BODY} characters.`);
      return;
    }
    submit.mutate(
      { reviewId: request!.id, rating, reviewText: body.trim() },
      {
        onSuccess: () => {
          setSentAt(new Date());
          void queryClient.invalidateQueries({
            queryKey: ["my-pending-review-requests", user?.id],
          });
          void queryClient.invalidateQueries({
            queryKey: ["my-submitted-reviews", user?.id],
          });
        },
        onError: (err) => {
          setError(
            err instanceof Error
              ? err.message
              : "Could not send just now. Try again.",
          );
        },
      },
    );
  }

  return (
    <section
      id={`review-${request.id}`}
      data-threshold-unit="review-ask"
      data-never-dim=""
      data-testid="studio-review-ask"
      aria-labelledby={`review-ask-title-${request.id}`}
      className="relative mt-8 border-t border-[var(--border-subtle)] pb-8 text-[var(--text-primary)]"
    >
      <p className="pt-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
        An ask · your review is welcome
      </p>
      <h2
        id={`review-ask-title-${request.id}`}
        className="font-heading mt-1.5 text-[1.35rem] font-medium tracking-[-0.012em]"
      >
        {`A few words about working with ${designerName}`}
      </h2>
      {request.custom_message && (
        <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-[var(--text-body)]">
          {`“${request.custom_message}”`}
        </p>
      )}

      <div
        className="mt-4 flex items-center gap-1"
        role="radiogroup"
        aria-label="Rating, out of 5 stars"
      >
        {STARS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} star${value === 1 ? "" : "s"}`}
            onClick={() => setRating(value)}
            data-testid={`review-star-${value}`}
            className="min-h-[44px] min-w-[28px] font-heading text-[1.1rem] leading-none text-[var(--text-primary)]"
            style={{ opacity: value <= rating ? 1 : 0.32 }}
          >
            ★
          </button>
        ))}
      </div>

      <label
        htmlFor={`review-body-${request.id}`}
        className="mt-4 block font-mono text-[11px] uppercase tracking-[0.13em] text-[var(--text-muted)]"
      >
        What did you love? Anything we could improve?
      </label>
      <textarea
        id={`review-body-${request.id}`}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={4}
        data-testid="review-body"
        placeholder="A few sentences about your experience…"
        className="mt-1.5 w-full max-w-[52ch] resize-y border border-[var(--border-default)] bg-transparent px-3 py-2 text-[15px] leading-relaxed text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--threshold-accent,#8A5F19)]"
      />
      <p className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
        {`${body.length} / ${MIN_BODY} min`}
      </p>

      {error && (
        <p
          role="alert"
          className="mt-2 text-[15px] leading-normal text-[var(--color-error)]"
        >
          {error}
        </p>
      )}

      <div className="mt-4">
        <ScoredAction
          actionKey="review_submit"
          regionKey="doorstep"
          surfaceKey="the_threshold"
          variant="primary"
          loading={submit.isPending}
          loadingLabel="Sending"
          onClick={handleSubmit}
          data-testid="review-submit"
        >
          Send your review
        </ScoredAction>
      </div>
    </section>
  );
}

/**
 * The reviews this client has already sent, read the way the rest of
 * Previously reads a closed thing: one dated line, ruled with a leader out to
 * the word for how it closed. A sibling list rather than an entry merged into
 * `deriveThreshold`'s own join — `client_reviews` never touches selections,
 * proposals, invoices, rooms or notes, so it has nothing to say to the one
 * join that reconciles those five.
 */
export function SubmittedReviewsPrevious({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const submittedQuery = useMySubmittedReviews(user?.id);
  const rows = (submittedQuery.data ?? []).filter(
    (review) => review.project?.id === projectId,
  );

  if (rows.length === 0) return null;

  return (
    <ul data-testid="submitted-reviews-previously" className="list-none">
      {rows.map((review) => {
        const date = review.created_at ? new Date(review.created_at) : null;
        return (
          <li
            key={review.id}
            data-testid="submitted-review-line"
            className="border-t border-[var(--border-default)]"
          >
            <p className="flex min-h-[44px] w-full items-baseline gap-3 py-3">
              <span className="min-w-[6.6em] shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                {date && !Number.isNaN(date.getTime())
                  ? DAY_MONTH.format(date)
                  : "—"}
              </span>
              <span className="font-heading text-[1.05rem]">
                {review.rating
                  ? `Your review · ${review.rating} of 5 stars`
                  : "Your review"}
              </span>
              <span
                aria-hidden="true"
                className="relative top-[-0.28em] mx-2 min-w-[10px] flex-auto border-b border-dotted border-[var(--border-default)]"
              />
              <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-mocha)]">
                Sent
              </span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

const VERDICT_LABEL: Record<ClientReviewVerdict, string> = {
  approved: "Looks good",
  rejected: "Needs a change",
  comment: "Ask a question",
};

/**
 * A selection edition, read in place. `useClientProjectReviewBundle` already
 * belongs to the client portal (`ProjectReviewEdition` used it verbatim) so
 * this is the same bundle and the same feedback mutation — only the frame
 * around them is the Threshold's rather than a standalone page's.
 */
/** Read once, at construction — this ask never reacts to the URL changing
 * under it, only to what it carried the moment the Threshold mounted (the
 * same moment the deep link redirected here). A lazy initializer rather than
 * an effect: `SelectionEditionAsk` only ever mounts client-side (Threshold
 * itself renders only once `ProjectSurfaceSwitch`'s flag read resolves), so
 * there is no SSR/hydration mismatch to guard against, and setting state
 * synchronously from an effect body is the pattern the rest of this codebase
 * avoids (react-hooks/set-state-in-effect). */
function editionIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("review");
  return value && value.trim().length > 0 ? value.trim() : null;
}

export function SelectionEditionAsk({ projectId }: { projectId: string }) {
  const [editionId] = useState<string | null>(editionIdFromUrl);
  const [comments, setComments] = useState<Record<string, string>>({});

  const bundleQuery = useClientProjectReviewBundle(editionId ?? "", projectId);
  const feedback = useRecordProjectReviewFeedback(editionId ?? "");

  if (!editionId) return null;
  const bundle = bundleQuery.data;
  if (bundleQuery.isLoading || bundleQuery.isError || !bundle) return null;
  if (bundle.items.length === 0) return null;

  const closed = bundle.status !== "published";

  return (
    <section
      id={`review-edition-${bundle.editionId}`}
      data-threshold-unit="review-edition-ask"
      data-never-dim=""
      data-testid="review-edition-ask"
      aria-labelledby="review-edition-title"
      className="relative mt-8 border-t border-[var(--border-subtle)] pb-8 text-[var(--text-primary)]"
    >
      <p className="pt-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
        An ask · a selection review
      </p>
      <h2
        id="review-edition-title"
        className="font-heading mt-1.5 text-[1.35rem] font-medium tracking-[-0.012em]"
      >
        Share a preference with your studio
      </h2>
      <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-[var(--text-body)]">
        Your response does not authorize a purchase or change an authorization.
      </p>

      <ul className="mt-4 list-none">
        {bundle.items.map((item) => (
          <li
            key={item.id}
            data-testid="review-edition-item"
            className="flex gap-3 border-t border-[var(--border-subtle)] pt-4"
          >
            {item.imageUrl && (
              <Image
                src={item.imageUrl}
                alt=""
                width={64}
                height={64}
                unoptimized
                className="h-16 w-16 shrink-0 object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[15px] text-[var(--text-primary)]">
                {item.name}
                {` · ${item.roomName}`}
                {item.clientPriceCents
                  ? ` · ${moneyInWords(item.clientPriceCents)}`
                  : ""}
              </p>
              {item.verdict && (
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  {`Your response: ${VERDICT_LABEL[item.verdict]}`}
                </p>
              )}
              {!closed && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <ScoredAction
                    actionKey="review_edition_looks_good"
                    regionKey="doorstep"
                    surfaceKey="the_threshold"
                    variant="tertiary"
                    disabled={feedback.isPending}
                    onClick={() =>
                      feedback.mutate({
                        reviewItemId: item.id,
                        verdict: reviewVerdictFromLabel("Looks good"),
                      })
                    }
                    data-testid={`review-edition-approve-${item.id}`}
                  >
                    Looks good
                  </ScoredAction>
                  <ScoredAction
                    actionKey="review_edition_needs_change"
                    regionKey="doorstep"
                    surfaceKey="the_threshold"
                    variant="tertiary"
                    disabled={feedback.isPending}
                    onClick={() =>
                      feedback.mutate({
                        reviewItemId: item.id,
                        verdict: reviewVerdictFromLabel("Needs a change"),
                      })
                    }
                    data-testid={`review-edition-reject-${item.id}`}
                  >
                    Needs a change
                  </ScoredAction>
                  <input
                    aria-label={`Question about ${item.name}`}
                    value={comments[item.id] ?? ""}
                    onChange={(event) =>
                      setComments({
                        ...comments,
                        [item.id]: event.target.value,
                      })
                    }
                    placeholder="Ask a question"
                    data-testid={`review-edition-question-${item.id}`}
                    className="min-w-[10rem] border-0 border-b border-current bg-transparent px-0.5 py-1 text-[13px] text-[var(--text-primary)]"
                  />
                  <ScoredAction
                    actionKey="review_edition_ask_question"
                    regionKey="doorstep"
                    surfaceKey="the_threshold"
                    variant="tertiary"
                    disabled={
                      feedback.isPending || !(comments[item.id] ?? "").trim()
                    }
                    onClick={() =>
                      feedback.mutate({
                        reviewItemId: item.id,
                        verdict: "comment",
                        comment: comments[item.id],
                      })
                    }
                    data-testid={`review-edition-comment-${item.id}`}
                  >
                    Ask a question
                  </ScoredAction>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {closed && (
        <p className="mt-4 text-[15px] leading-relaxed text-[var(--text-body)]">
          This edition is closed. Your studio can share a newer edition if
          changes are needed.
        </p>
      )}
    </section>
  );
}
