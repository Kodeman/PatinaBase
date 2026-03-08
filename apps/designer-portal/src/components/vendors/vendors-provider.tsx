'use client';

import { useVendor } from '@patina/supabase';
import { useVendorsStore } from '../../stores/vendors-store';
import { VendorSlideOver } from './vendor-slide-over';
import { ReviewModal } from './review-modal';

/**
 * Inner component that renders the ReviewModal with vendor data
 */
function ReviewModalWithData({ vendorId, onClose }: { vendorId: string; onClose: () => void }) {
  const { data: vendor, isLoading } = useVendor(vendorId);

  if (isLoading || !vendor) {
    return null;
  }

  return (
    <ReviewModal
      vendorId={vendorId}
      vendorName={vendor.trade_name ?? vendor.name}
      specializations={
        vendor.vendor_specializations?.map(
          (spec: { id: string; category: string }) => ({
            id: spec.id,
            name: spec.category,
          })
        ) ?? []
      }
      isOpen={true}
      onClose={onClose}
    />
  );
}

/**
 * Provider component that renders the VendorSlideOver and ReviewModal.
 * Wraps vendor pages to provide these interactive overlays.
 */
export function VendorsProvider({ children }: { children: React.ReactNode }) {
  const slideOverVendorId = useVendorsStore((state) => state.slideOverVendorId);
  const reviewModalVendorId = useVendorsStore((state) => state.reviewModalVendorId);
  const closeReviewModal = useVendorsStore((state) => state.closeReviewModal);

  return (
    <>
      {children}

      {/* Slide-over for quick vendor preview */}
      {slideOverVendorId && <VendorSlideOver />}

      {/* Review modal */}
      {reviewModalVendorId && (
        <ReviewModalWithData
          vendorId={reviewModalVendorId}
          onClose={closeReviewModal}
        />
      )}
    </>
  );
}
