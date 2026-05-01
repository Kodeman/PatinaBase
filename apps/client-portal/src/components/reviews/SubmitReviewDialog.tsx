'use client';

import { useState } from 'react';

import { useSubmitReview } from '@patina/supabase';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@patina/design-system';

import { StarRatingInput } from './StarRatingInput';

interface SubmitReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reviewId: string;
  projectName: string | null;
  designerName: string;
}

const MIN_BODY = 30;

export function SubmitReviewDialog({
  open,
  onOpenChange,
  reviewId,
  projectName,
  designerName,
}: SubmitReviewDialogProps) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = useSubmitReview();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (rating < 1 || rating > 5) {
      setError('Please select a rating from 1 to 5 stars.');
      return;
    }
    if (body.trim().length < MIN_BODY) {
      setError(`Please share at least ${MIN_BODY} characters.`);
      return;
    }
    submit.mutate(
      { reviewId, rating, reviewText: body.trim() },
      {
        onSuccess: () => {
          setRating(0);
          setBody('');
          onOpenChange(false);
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Failed to submit. Please try again.');
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Leave a review</DialogTitle>
          <DialogDescription>
            Share your experience working with {designerName}
            {projectName ? ` on "${projectName}"` : ''}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="review-rating" className="block type-meta">
              Overall rating
            </label>
            <div id="review-rating" className="mt-2">
              <StarRatingInput value={rating} onChange={setRating} size="lg" />
            </div>
          </div>

          <div>
            <label htmlFor="review-body" className="block type-meta">
              What did you love? Anything we could improve?
            </label>
            <textarea
              id="review-body"
              required
              minLength={MIN_BODY}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="mt-2 w-full rounded-md border border-[var(--border-default)] bg-white px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none"
              placeholder="A few sentences about your experience…"
              data-testid="review-body"
            />
            <p className="mt-1 type-meta-small text-[var(--text-muted)]">
              {body.length} / {MIN_BODY} min
            </p>
          </div>

          {error ? (
            <p className="type-meta-small text-patina-terracotta" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter className="mt-2 flex items-center justify-end gap-2">
            <DialogClose asChild>
              <button
                type="button"
                className="rounded-[3px] border border-[var(--border-default)] px-3 py-1.5 text-sm text-[var(--text-muted)] transition hover:bg-[var(--bg-surface)]"
              >
                Cancel
              </button>
            </DialogClose>
            <button
              type="submit"
              disabled={submit.isPending}
              className="rounded-[3px] bg-patina-charcoal px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              data-testid="submit-review"
            >
              {submit.isPending ? 'Submitting…' : 'Submit review'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
