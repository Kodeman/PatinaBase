'use client';

import { useState } from 'react';
import { X, Star } from 'lucide-react';
import { createBrowserClient } from '@patina/supabase';

interface ReviewModalProps {
  vendorId: string;
  vendorName: string;
  specializations: { id: string; name: string }[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

function StarRatingInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-patina-charcoal">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className="p-0.5"
          >
            <Star className={`w-5 h-5 transition-colors ${star <= value ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function ReviewModal({ vendorId, vendorName, isOpen, onClose, onSuccess }: ReviewModalProps) {
  const supabase = createBrowserClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ratings, setRatings] = useState({ quality: 0, finish: 0, delivery: 0, service: 0, value: 0 });
  const [review, setReview] = useState('');
  const [leadTimeAccuracy, setLeadTimeAccuracy] = useState<string>('');

  if (!isOpen) return null;

  const overallRating = Object.values(ratings).reduce((a, b) => a + b, 0) / 5;
  const isValid = Object.values(ratings).every(r => r > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      await supabase.from('vendor_reviews').insert({
        vendor_id: vendorId,
        designer_id: user.id,
        overall_rating: overallRating,
        rating_quality: ratings.quality,
        rating_finish: ratings.finish,
        rating_delivery: ratings.delivery,
        rating_service: ratings.service,
        rating_value: ratings.value,
        written_review: review || null,
        lead_time_accuracy: leadTimeAccuracy || null,
      });

      onClose();
      onSuccess?.();
    } catch (err) {
      console.error('Failed to submit review:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-patina-clay-beige/30">
          <h2 className="text-lg font-semibold text-patina-charcoal">Review {vendorName}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-patina-off-white transition-colors">
            <X className="w-5 h-5 text-patina-mocha-brown" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-patina-charcoal">Ratings</h3>
            <StarRatingInput value={ratings.quality} onChange={v => setRatings(r => ({ ...r, quality: v }))} label="Quality" />
            <StarRatingInput value={ratings.finish} onChange={v => setRatings(r => ({ ...r, finish: v }))} label="Finish" />
            <StarRatingInput value={ratings.delivery} onChange={v => setRatings(r => ({ ...r, delivery: v }))} label="Delivery" />
            <StarRatingInput value={ratings.service} onChange={v => setRatings(r => ({ ...r, service: v }))} label="Service" />
            <StarRatingInput value={ratings.value} onChange={v => setRatings(r => ({ ...r, value: v }))} label="Value" />
          </div>

          {isValid && (
            <div className="text-center p-3 rounded-lg bg-patina-off-white">
              <p className="text-sm text-patina-mocha-brown">Overall</p>
              <p className="text-2xl font-semibold text-patina-charcoal">{overallRating.toFixed(1)}</p>
            </div>
          )}

          <div>
            <label htmlFor="lead-time" className="block text-sm font-medium text-patina-charcoal mb-1.5">Lead Time Accuracy</label>
            <select
              id="lead-time"
              value={leadTimeAccuracy}
              onChange={e => setLeadTimeAccuracy(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-patina-clay-beige/50 text-sm text-patina-charcoal bg-white focus:outline-none focus:border-patina-mocha-brown"
            >
              <option value="">Select...</option>
              <option value="early">Early</option>
              <option value="on-time">On Time</option>
              <option value="late">Late</option>
            </select>
          </div>

          <div>
            <label htmlFor="review-text" className="block text-sm font-medium text-patina-charcoal mb-1.5">Written Review (optional)</label>
            <textarea
              id="review-text"
              value={review}
              onChange={e => setReview(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-patina-clay-beige/50 text-sm text-patina-charcoal bg-white focus:outline-none focus:border-patina-mocha-brown resize-none"
              placeholder="Share your experience working with this vendor..."
            />
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-patina-clay-beige/50 text-sm text-patina-mocha-brown hover:bg-patina-off-white transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="px-4 py-2 rounded-lg bg-patina-mocha-brown text-white text-sm font-medium hover:bg-patina-charcoal transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
