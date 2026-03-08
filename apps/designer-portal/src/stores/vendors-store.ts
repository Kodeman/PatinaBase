/**
 * Vendor directory state store
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MarketPosition, ProductionModel, AccountStatus } from '@patina/types';

interface VendorFilters {
  search: string;
  categories: string[];
  marketPositions: MarketPosition[];
  accountStatus: AccountStatus | null;
  minRating: number | null;
  certifications: string[];
  productionModels: ProductionModel[];
  hasQuickShip: boolean | null;
  maxLeadTimeWeeks?: number;
}

interface VendorsState {
  // Directory filters
  filters: VendorFilters;
  setFilters: (filters: Partial<VendorFilters>) => void;
  clearFilters: () => void;
  getActiveFilterCount: () => number;

  // View preferences (persisted)
  viewMode: 'list' | 'card';
  setViewMode: (mode: 'list' | 'card') => void;

  // Slide-over state
  slideOverVendorId: string | null;
  openSlideOver: (vendorId: string) => void;
  closeSlideOver: () => void;

  // Review modal state
  reviewModalVendorId: string | null;
  openReviewModal: (vendorId: string) => void;
  closeReviewModal: () => void;
}

const DEFAULT_FILTERS: VendorFilters = {
  search: '',
  categories: [],
  marketPositions: [],
  accountStatus: null,
  minRating: null,
  certifications: [],
  productionModels: [],
  hasQuickShip: null,
  maxLeadTimeWeeks: undefined,
};

export const useVendorsStore = create<VendorsState>()(
  persist(
    (set, get) => ({
      // Filter state
      filters: DEFAULT_FILTERS,
      setFilters: (newFilters) =>
        set((state) => ({
          filters: { ...state.filters, ...newFilters },
        })),
      clearFilters: () => set({ filters: DEFAULT_FILTERS }),
      getActiveFilterCount: () => {
        const { filters } = get();
        let count = 0;
        if (filters.search) count++;
        count += filters.categories.length;
        count += filters.marketPositions.length;
        if (filters.accountStatus) count++;
        if (filters.minRating) count++;
        count += filters.certifications.length;
        count += filters.productionModels.length;
        if (filters.hasQuickShip !== null) count++;
        if (filters.maxLeadTimeWeeks !== undefined) count++;
        return count;
      },

      // View mode
      viewMode: 'list',
      setViewMode: (mode) => set({ viewMode: mode }),

      // Slide-over
      slideOverVendorId: null,
      openSlideOver: (vendorId) => set({ slideOverVendorId: vendorId }),
      closeSlideOver: () => set({ slideOverVendorId: null }),

      // Review modal
      reviewModalVendorId: null,
      openReviewModal: (vendorId) => set({ reviewModalVendorId: vendorId }),
      closeReviewModal: () => set({ reviewModalVendorId: null }),
    }),
    {
      name: 'vendors-store',
      partialize: (state) => ({
        viewMode: state.viewMode,
      }),
    }
  )
);

// Selector hooks for convenience
export const useVendorFilters = () => useVendorsStore((state) => state.filters);
export const useVendorViewMode = () => useVendorsStore((state) => state.viewMode);
export const useVendorSlideOver = () =>
  useVendorsStore((state) => ({
    vendorId: state.slideOverVendorId,
    open: state.openSlideOver,
    close: state.closeSlideOver,
    isOpen: state.slideOverVendorId !== null,
  }));
