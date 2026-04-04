'use client';

interface StarRatingProps {
  rating: number;
  maxStars?: number;
}

export function StarRating({ rating, maxStars = 5 }: StarRatingProps) {
  return (
    <div className="flex gap-0.5" style={{ fontSize: '1.1rem' }}>
      {Array.from({ length: maxStars }, (_, i) => (
        <span
          key={i}
          style={{
            color: i < rating ? 'var(--accent-primary)' : 'var(--color-pearl)',
          }}
        >
          &#9733;
        </span>
      ))}
    </div>
  );
}
