'use client';

import { StarRating } from './star-rating';
import { StyleTag } from './style-tag';

interface ReviewCardProps {
  clientName: string;
  rating: number;
  projectDescription: string;
  reviewText: string;
  tags?: string[];
  referralCount?: number;
}

export function ReviewCard({
  clientName,
  rating,
  projectDescription,
  reviewText,
  tags = [],
  referralCount,
}: ReviewCardProps) {
  return (
    <div
      className="border-b py-6"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div className="mb-2 flex items-baseline justify-between">
        <span className="type-label">{clientName}</span>
        <StarRating rating={rating} />
      </div>
      <div className="type-label-secondary mb-2">{projectDescription}</div>
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.88rem',
          color: 'var(--text-body)',
          lineHeight: 1.65,
          fontStyle: 'italic',
        }}
      >
        &ldquo;{reviewText}&rdquo;
      </p>
      {(tags.length > 0 || (referralCount != null && referralCount > 0)) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <StyleTag key={tag} label={tag} active />
          ))}
          {referralCount != null && referralCount > 0 && (
            <StyleTag label={`Referred ${referralCount} client${referralCount !== 1 ? 's' : ''}`} />
          )}
        </div>
      )}
    </div>
  );
}
