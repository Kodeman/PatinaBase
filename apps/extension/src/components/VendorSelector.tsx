/**
 * Vendor selector dropdown for choosing or creating vendors
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { VendorSummaryForCapture } from '@patina/shared';

interface VendorSelectorProps {
  selectedVendor: VendorSummaryForCapture | null;
  suggestions: VendorSummaryForCapture[];
  onSelect: (vendor: VendorSummaryForCapture) => void;
  onCreateNew: () => void;
  isOpen: boolean;
  onClose: () => void;
  /** Optional DB search callback — queried when user types 2+ characters */
  onSearch?: (query: string) => Promise<VendorSummaryForCapture[]>;
}

const MARKET_POSITION_LABELS: Record<string, string> = {
  entry: 'Entry',
  mid: 'Mid-Market',
  premium: 'Premium',
  luxury: 'Luxury',
  'ultra-luxury': 'Ultra Luxury',
};

export function VendorSelector({
  selectedVendor,
  suggestions,
  onSelect,
  onCreateNew,
  isOpen,
  onClose,
  onSearch,
}: VendorSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [dbResults, setDbResults] = useState<VendorSummaryForCapture[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced DB search when user types 2+ characters
  const debouncedSearch = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!onSearch || query.length < 2) {
      setDbResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await onSearch(query);
        setDbResults(results);
      } catch {
        setDbResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, [onSearch]);

  // Trigger search when query changes
  useEffect(() => {
    debouncedSearch(searchQuery);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, debouncedSearch]);

  // Merge local suggestions with DB results, deduplicated
  const mergedVendors = (() => {
    const seen = new Set<string>();
    const result: VendorSummaryForCapture[] = [];

    // Local suggestions first (filtered by query)
    for (const v of suggestions) {
      if (!searchQuery || v.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        if (!seen.has(v.id)) {
          seen.add(v.id);
          result.push(v);
        }
      }
    }

    // Then DB results
    for (const v of dbResults) {
      if (!seen.has(v.id)) {
        seen.add(v.id);
        result.push(v);
      }
    }

    return result;
  })();

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  const handleSelect = (vendor: VendorSummaryForCapture) => {
    onSelect(vendor);
    setSearchQuery('');
    setDbResults([]);
    onClose();
  };

  const handleCreateNew = () => {
    onCreateNew();
    setSearchQuery('');
    setDbResults([]);
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="absolute z-20 w-full mt-1 bg-white border border-patina-clay-beige/50 rounded-lg shadow-lg overflow-hidden"
      data-vendor-selector
    >
      {/* Search input */}
      <div className="p-2 border-b border-patina-clay-beige/30">
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-patina-mocha-brown/50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search vendors..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-patina-off-white border-none rounded
                     placeholder-patina-mocha-brown/40 focus:outline-none focus:ring-1 focus:ring-patina-mocha-brown"
          />
        </div>
      </div>

      {/* Suggestions list */}
      <div className="max-h-48 overflow-y-auto">
        {isSearching ? (
          <div className="px-3 py-4 text-center text-sm text-patina-mocha-brown/50">
            Searching...
          </div>
        ) : mergedVendors.length > 0 ? (
          mergedVendors.map((vendor) => (
            <button
              key={vendor.id}
              onClick={() => handleSelect(vendor)}
              className={`w-full px-3 py-2 text-left hover:bg-patina-off-white transition-colors flex items-center gap-3
                       ${selectedVendor?.id === vendor.id ? 'bg-patina-clay-beige/20' : ''}`}
            >
              {/* Logo / Avatar */}
              <div className="flex-shrink-0 w-7 h-7 rounded overflow-hidden bg-patina-off-white flex items-center justify-center">
                {vendor.logoUrl ? (
                  <img
                    src={vendor.logoUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                ) : (
                  <span className="text-patina-mocha-brown font-medium text-xs">
                    {vendor.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              {/* Vendor info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-patina-charcoal truncate">{vendor.name}</div>
                {vendor.marketPosition && (
                  <div className="text-xs text-patina-mocha-brown/70">
                    {MARKET_POSITION_LABELS[vendor.marketPosition] || vendor.marketPosition}
                    {vendor.primaryCategory && ` - ${vendor.primaryCategory}`}
                  </div>
                )}
              </div>

              {/* Selected indicator */}
              {selectedVendor?.id === vendor.id && (
                <svg className="w-4 h-4 text-patina-mocha-brown flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))
        ) : (
          <div className="px-3 py-4 text-center text-sm text-patina-mocha-brown/50">
            {searchQuery ? 'No vendors match your search' : 'No vendor suggestions'}
          </div>
        )}
      </div>

      {/* Create new option */}
      <div className="border-t border-patina-clay-beige/30">
        <button
          onClick={handleCreateNew}
          className="w-full px-3 py-2.5 text-left hover:bg-patina-off-white transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4 text-patina-mocha-brown" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-sm text-patina-mocha-brown font-medium">Create new vendor</span>
        </button>
      </div>
    </div>
  );
}
