'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, AlertCircle, Loader2 } from 'lucide-react';
import { useSubmitVendorReview } from '@patina/supabase';
import type { VendorReviewInput, LeadTimeAccuracy } from '@patina/shared/validation';
import { StarRatingInput } from './star-rating-input';

interface ReviewModalProps {
  vendorId: string;
  vendorName: string;
  specializations?: { id: string; name: string }[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface FormState {
  ratings: {
    quality: number;
    finish: number;
    delivery: number;
    service: number;
    value: number;
  };
  writtenReview: string;
  leadTimeAccuracy: LeadTimeAccuracy | undefined;
  leadTimeWeeksOver: number | undefined;
  hasOrderedRecently: boolean;
  selectedSpecializations: string[];
}

interface FormErrors {
  quality?: string;
  finish?: string;
  delivery?: string;
  service?: string;
  value?: string;
  writtenReview?: string;
  specializations?: string;
  general?: string;
}

const RATING_DIMENSIONS = [
  { key: 'quality', label: 'Quality', description: 'Overall build quality and materials' },
  { key: 'finish', label: 'Finish', description: 'Surface finish and attention to detail' },
  { key: 'delivery', label: 'Delivery', description: 'Packaging and delivery condition' },
  { key: 'service', label: 'Service', description: 'Customer service and communication' },
  { key: 'value', label: 'Value', description: 'Price relative to quality' },
] as const;

const LEAD_TIME_OPTIONS: { value: LeadTimeAccuracy; label: string }[] = [
  { value: 'faster', label: 'Faster than expected' },
  { value: 'as_expected', label: 'As expected' },
  { value: 'slower', label: 'Slower than expected' },
];

const MAX_REVIEW_LENGTH = 500;

const initialFormState: FormState = {
  ratings: {
    quality: 0,
    finish: 0,
    delivery: 0,
    service: 0,
    value: 0,
  },
  writtenReview: '',
  leadTimeAccuracy: undefined,
  leadTimeWeeksOver: undefined,
  hasOrderedRecently: false,
  selectedSpecializations: [],
};

export function ReviewModal({
  vendorId,
  vendorName,
  specializations = [],
  isOpen,
  onClose,
  onSuccess,
}: ReviewModalProps) {
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const submitReview = useSubmitVendorReview();

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setFormState(initialFormState);
      setErrors({});
      setTouched({});
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    for (const dimension of RATING_DIMENSIONS) {
      if (formState.ratings[dimension.key] === 0) {
        newErrors[dimension.key] = `${dimension.label} rating is required`;
      }
    }

    if (formState.writtenReview.length > MAX_REVIEW_LENGTH) {
      newErrors.writtenReview = `Review must be ${MAX_REVIEW_LENGTH} characters or less`;
    }

    if (formState.selectedSpecializations.length === 0) {
      newErrors.specializations = 'Select at least one specialization';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formState]);

  const handleRatingChange = useCallback((dimension: keyof FormState['ratings'], value: number) => {
    setFormState((prev) => ({
      ...prev,
      ratings: {
        ...prev.ratings,
        [dimension]: value,
      },
    }));
    setTouched((prev) => ({ ...prev, [dimension]: true }));
    setErrors((prev) => ({ ...prev, [dimension]: undefined }));
  }, []);

  const handleWrittenReviewChange = useCallback((value: string) => {
    setFormState((prev) => ({
      ...prev,
      writtenReview: value,
    }));
    if (value.length <= MAX_REVIEW_LENGTH) {
      setErrors((prev) => ({ ...prev, writtenReview: undefined }));
    }
  }, []);

  const handleLeadTimeChange = useCallback((value: LeadTimeAccuracy) => {
    setFormState((prev) => ({
      ...prev,
      leadTimeAccuracy: value,
      leadTimeWeeksOver: value === 'slower' ? prev.leadTimeWeeksOver : undefined,
    }));
  }, []);

  const handleLeadTimeWeeksOverChange = useCallback((value: number | undefined) => {
    setFormState((prev) => ({
      ...prev,
      leadTimeWeeksOver: value,
    }));
  }, []);

  const handleHasOrderedRecentlyChange = useCallback((checked: boolean) => {
    setFormState((prev) => ({
      ...prev,
      hasOrderedRecently: checked,
    }));
  }, []);

  const handleSpecializationToggle = useCallback((specializationId: string) => {
    setFormState((prev) => {
      const isSelected = prev.selectedSpecializations.includes(specializationId);
      const newSpecializations = isSelected
        ? prev.selectedSpecializations.filter((id) => id !== specializationId)
        : [...prev.selectedSpecializations, specializationId];

      return {
        ...prev,
        selectedSpecializations: newSpecializations,
      };
    });
    setErrors((prev) => ({ ...prev, specializations: undefined }));
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      const allTouched: Record<string, boolean> = {};
      for (const dimension of RATING_DIMENSIONS) {
        allTouched[dimension.key] = true;
      }
      setTouched(allTouched);

      if (!validateForm()) {
        return;
      }

      const reviewInput: VendorReviewInput = {
        ratings: formState.ratings as VendorReviewInput['ratings'],
        specializations: formState.selectedSpecializations,
        writtenReview: formState.writtenReview || undefined,
        leadTimeAccuracy: formState.leadTimeAccuracy,
        leadTimeWeeksOver: formState.leadTimeAccuracy === 'slower' ? formState.leadTimeWeeksOver : undefined,
        hasOrderedRecently: formState.hasOrderedRecently,
      };

      try {
        await submitReview.mutateAsync({
          vendorId,
          review: reviewInput,
        });
        onSuccess?.();
        onClose();
      } catch (error) {
        setErrors((prev) => ({
          ...prev,
          general: error instanceof Error ? error.message : 'Failed to submit review',
        }));
      }
    },
    [formState, validateForm, submitReview, vendorId, onSuccess, onClose]
  );

  if (!isOpen) return null;

  const remainingChars = MAX_REVIEW_LENGTH - formState.writtenReview.length;
  const isOverLimit = remainingChars < 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-xl bg-patina-off-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-patina-clay-beige">
          <h2
            id="review-modal-title"
            className="text-xl font-semibold text-patina-charcoal font-display"
          >
            Review {vendorName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-patina-mocha-brown hover:bg-patina-clay-beige/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-patina-mocha-brown"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <form id="review-form" onSubmit={handleSubmit} className="space-y-6">
            {/* General Error */}
            {errors.general && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errors.general}</span>
              </div>
            )}

            {/* Rating Dimensions */}
            <section>
              <h3 className="text-sm font-medium text-patina-charcoal mb-4">
                Rate your experience
              </h3>
              <div className="space-y-4">
                {RATING_DIMENSIONS.map((dimension) => {
                  const error = touched[dimension.key] ? errors[dimension.key] : undefined;
                  return (
                    <div
                      key={dimension.key}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
                    >
                      <div className="sm:w-32 flex-shrink-0">
                        <label className="text-sm font-medium text-patina-charcoal">
                          {dimension.label}
                        </label>
                        <p className="text-xs text-patina-mocha-brown hidden sm:block">
                          {dimension.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <StarRatingInput
                          value={formState.ratings[dimension.key]}
                          onChange={(value) => handleRatingChange(dimension.key, value)}
                          label={`${dimension.label} rating`}
                          size="md"
                        />
                        {error && (
                          <span className="text-xs text-red-600">{error}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Written Review */}
            <section>
              <label
                htmlFor="written-review"
                className="block text-sm font-medium text-patina-charcoal mb-2"
              >
                Written Review
                <span className="text-patina-mocha-brown font-normal ml-1">(optional)</span>
              </label>
              <textarea
                id="written-review"
                value={formState.writtenReview}
                onChange={(e) => handleWrittenReviewChange(e.target.value)}
                placeholder="Share your experience with this vendor..."
                rows={4}
                className={`
                  w-full px-3 py-2 rounded-lg border bg-white text-patina-charcoal placeholder:text-patina-mocha-brown/50
                  focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown focus:border-transparent
                  resize-none transition-colors
                  ${isOverLimit ? 'border-red-400' : 'border-patina-clay-beige'}
                `}
              />
              <div className="flex justify-between mt-1">
                {errors.writtenReview && (
                  <span className="text-xs text-red-600">{errors.writtenReview}</span>
                )}
                <span
                  className={`text-xs ml-auto ${
                    isOverLimit ? 'text-red-600' : 'text-patina-mocha-brown'
                  }`}
                >
                  {remainingChars.toLocaleString()} characters remaining
                </span>
              </div>
            </section>

            {/* Lead Time Accuracy */}
            <section>
              <fieldset>
                <legend className="block text-sm font-medium text-patina-charcoal mb-3">
                  Lead Time Accuracy
                  <span className="text-patina-mocha-brown font-normal ml-1">(optional)</span>
                </legend>
                <div className="flex flex-wrap gap-2">
                  {LEAD_TIME_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`
                        inline-flex items-center px-4 py-2 rounded-full border cursor-pointer transition-all
                        text-sm font-medium min-h-[44px]
                        ${
                          formState.leadTimeAccuracy === option.value
                            ? 'border-patina-mocha-brown bg-patina-mocha-brown text-white'
                            : 'border-patina-clay-beige bg-white text-patina-charcoal hover:border-patina-mocha-brown'
                        }
                      `}
                    >
                      <input
                        type="radio"
                        name="leadTimeAccuracy"
                        value={option.value}
                        checked={formState.leadTimeAccuracy === option.value}
                        onChange={() => handleLeadTimeChange(option.value)}
                        className="sr-only"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                {formState.leadTimeAccuracy === 'slower' && (
                  <div className="mt-3">
                    <label
                      htmlFor="weeks-over"
                      className="block text-sm text-patina-mocha-brown mb-1"
                    >
                      How many weeks over the quoted lead time?
                    </label>
                    <input
                      type="number"
                      id="weeks-over"
                      min={1}
                      max={52}
                      value={formState.leadTimeWeeksOver ?? ''}
                      onChange={(e) => {
                        const value = e.target.value ? parseInt(e.target.value, 10) : undefined;
                        handleLeadTimeWeeksOverChange(value);
                      }}
                      placeholder="e.g., 2"
                      className="w-32 px-3 py-2 rounded-lg border border-patina-clay-beige bg-white text-patina-charcoal placeholder:text-patina-mocha-brown/50 focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown focus:border-transparent"
                    />
                    <span className="ml-2 text-sm text-patina-mocha-brown">weeks</span>
                  </div>
                )}
              </fieldset>
            </section>

            {/* Has Ordered Recently */}
            <section>
              <label className="inline-flex items-center gap-3 cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={formState.hasOrderedRecently}
                  onChange={(e) => handleHasOrderedRecentlyChange(e.target.checked)}
                  className="w-5 h-5 rounded border-patina-clay-beige text-patina-mocha-brown focus:ring-patina-mocha-brown focus:ring-offset-0 cursor-pointer"
                />
                <span className="text-sm text-patina-charcoal">
                  I have ordered from this vendor in the past 12 months
                </span>
              </label>
            </section>

            {/* Specializations */}
            {specializations.length > 0 && (
              <section>
                <fieldset>
                  <legend className="block text-sm font-medium text-patina-charcoal mb-3">
                    What does this vendor excel at?
                    {errors.specializations && (
                      <span className="text-red-600 font-normal ml-2 text-xs">
                        {errors.specializations}
                      </span>
                    )}
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {specializations.map((spec) => {
                      const isSelected = formState.selectedSpecializations.includes(spec.id);
                      return (
                        <label
                          key={spec.id}
                          className={`
                            inline-flex items-center px-3 py-2 rounded-lg border cursor-pointer transition-all
                            text-sm min-h-[44px]
                            ${
                              isSelected
                                ? 'border-patina-mocha-brown bg-patina-mocha-brown/10 text-patina-charcoal'
                                : 'border-patina-clay-beige bg-white text-patina-mocha-brown hover:border-patina-mocha-brown'
                            }
                          `}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSpecializationToggle(spec.id)}
                            className="sr-only"
                          />
                          {spec.name}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </section>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-patina-clay-beige bg-patina-clay-beige/20">
          <button
            type="button"
            onClick={onClose}
            disabled={submitReview.isPending}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-patina-charcoal hover:bg-patina-clay-beige/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-patina-mocha-brown min-h-[44px]"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="review-form"
            disabled={submitReview.isPending}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-patina-charcoal text-white hover:bg-patina-mocha-brown transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-patina-mocha-brown focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            {submitReview.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Review'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
