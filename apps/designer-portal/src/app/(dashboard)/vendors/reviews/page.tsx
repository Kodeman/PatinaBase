'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  PenLine,
  Star,
  Clock,
  FileText,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import { VendorRatingBadge, VendorLogo } from '@/components/vendors';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DesignerReview {
  id: string;
  vendor_id: string;
  overall_rating: number;
  rating_quality: number;
  rating_finish: number;
  rating_delivery: number;
  rating_service: number;
  rating_value: number;
  written_review: string | null;
  lead_time_accuracy: string | null;
  created_at: string;
  vendor: {
    id: string;
    name: string;
    trade_name: string | null;
    logo_url: string | null;
  } | null;
}

interface ReviewRequestVendor {
  id: string;
  name: string;
  trade_name: string | null;
  logo_url: string | null;
  last_order_date: string;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useDesignerReviews() {
  return useQuery({
    queryKey: ['designer-reviews'],
    queryFn: async (): Promise<DesignerReview[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createBrowserClient() as any;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('vendor_reviews')
        .select(
          `
          id,
          vendor_id,
          overall_rating,
          rating_quality,
          rating_finish,
          rating_delivery,
          rating_service,
          rating_value,
          written_review,
          lead_time_accuracy,
          created_at,
          vendor:vendors(id, name, trade_name, logo_url)
        `
        )
        .eq('designer_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as DesignerReview[];
    },
  });
}

interface OrderRow {
  vendor_id: string;
  created_at: string;
  vendor: {
    id: string;
    name: string;
    trade_name: string | null;
    logo_url: string | null;
  } | null;
}

interface ReviewedVendorRow {
  vendor_id: string;
}

function useReviewRequests() {
  return useQuery({
    queryKey: ['review-requests'],
    queryFn: async (): Promise<ReviewRequestVendor[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createBrowserClient() as any;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      const { data: reviewedVendors } = await supabase
        .from('vendor_reviews')
        .select('vendor_id')
        .eq('designer_id', user.id);

      const reviewedVendorIds = ((reviewedVendors ?? []) as unknown as ReviewedVendorRow[]).map((r) => r.vendor_id);

      const { data: recentOrders, error } = await supabase
        .from('orders')
        .select(
          `
          vendor_id,
          created_at,
          vendor:vendors(id, name, trade_name, logo_url)
        `
        )
        .eq('designer_id', user.id)
        .gte('created_at', twelveMonthsAgo.toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Could not fetch orders:', error.message);
        return [];
      }

      const vendorMap = new Map<string, ReviewRequestVendor>();
      const orders = (recentOrders ?? []) as unknown as OrderRow[];
      for (const order of orders) {
        if (
          order.vendor_id &&
          !reviewedVendorIds.includes(order.vendor_id) &&
          !vendorMap.has(order.vendor_id) &&
          order.vendor
        ) {
          vendorMap.set(order.vendor_id, {
            id: order.vendor.id,
            name: order.vendor.name,
            trade_name: order.vendor.trade_name,
            logo_url: order.vendor.logo_url,
            last_order_date: order.created_at,
          });
        }
      }

      return Array.from(vendorMap.values());
    },
  });
}

// ─── Tab Types ───────────────────────────────────────────────────────────────

type TabKey = 'submitted' | 'requests' | 'drafts';

// ─── Skeleton Components ─────────────────────────────────────────────────────

function ReviewCardSkeleton() {
  return (
    <div className="animate-pulse bg-white rounded-lg border border-patina-clay-beige/30 p-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-patina-clay-beige/30 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-3">
          <div className="h-5 bg-patina-clay-beige/30 rounded w-1/3" />
          <div className="h-4 bg-patina-clay-beige/30 rounded w-full" />
          <div className="h-4 bg-patina-clay-beige/30 rounded w-2/3" />
        </div>
      </div>
    </div>
  );
}

// ─── Tab Button Component ────────────────────────────────────────────────────

interface TabButtonProps {
  tabKey: TabKey;
  label: string;
  count?: number;
  activeTab: TabKey;
  onClick: (tab: TabKey) => void;
  icon: React.ReactNode;
}

function TabButton({ tabKey, label, count, activeTab, onClick, icon }: TabButtonProps) {
  const isActive = activeTab === tabKey;
  return (
    <button
      type="button"
      onClick={() => onClick(tabKey)}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
        isActive
          ? 'border-patina-mocha-brown text-patina-charcoal'
          : 'border-transparent text-patina-mocha-brown hover:text-patina-charcoal hover:border-patina-clay-beige'
      }`}
      aria-selected={isActive}
      role="tab"
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
            isActive
              ? 'bg-patina-mocha-brown text-white'
              : 'bg-patina-clay-beige/50 text-patina-mocha-brown'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Submitted Reviews Tab ───────────────────────────────────────────────────

function SubmittedReviewsTab({ reviews, isLoading }: { reviews: DesignerReview[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (<ReviewCardSkeleton key={i} />))}
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-patina-clay-beige/30">
        <PenLine className="w-12 h-12 mx-auto text-patina-clay-beige mb-4" />
        <h3 className="text-lg font-medium text-patina-charcoal mb-2">No reviews submitted yet</h3>
        <p className="text-patina-mocha-brown mb-4 max-w-md mx-auto">Share your experience with vendors to help other designers make informed decisions.</p>
        <Link href="/vendors" className="inline-flex items-center gap-2 px-4 py-2 bg-patina-mocha-brown text-white rounded-lg hover:bg-patina-charcoal transition-colors">Browse Vendors</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reviews.map((review) => {
        const vendorName = review.vendor?.trade_name || review.vendor?.name || 'Unknown Vendor';
        const createdAt = new Date(review.created_at);

        return (
          <div key={review.id} className="bg-white rounded-lg border border-patina-clay-beige/30 p-6 hover:border-patina-mocha-brown/30 transition-colors">
            <div className="flex items-start gap-4">
              <VendorLogo logoUrl={review.vendor?.logo_url ?? null} vendorName={vendorName} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link href={`/vendors/${review.vendor_id}`} className="font-medium text-patina-charcoal hover:text-patina-mocha-brown transition-colors">{vendorName}</Link>
                    <p className="text-xs text-patina-mocha-brown mt-0.5">
                      Reviewed on {createdAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <VendorRatingBadge rating={review.overall_rating} reviewCount={0} size="sm" showCount={false} />
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {[
                    { key: 'quality', value: review.rating_quality },
                    { key: 'finish', value: review.rating_finish },
                    { key: 'delivery', value: review.rating_delivery },
                    { key: 'service', value: review.rating_service },
                    { key: 'value', value: review.rating_value },
                  ].map(({ key, value }) => (
                    <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-patina-clay-beige/20 text-patina-mocha-brown capitalize">
                      {key}: {value.toFixed(1)}
                    </span>
                  ))}
                </div>
                {review.written_review && <p className="mt-3 text-sm text-patina-charcoal line-clamp-3">{review.written_review}</p>}
                {review.lead_time_accuracy && (
                  <p className="mt-2 text-xs text-patina-mocha-brown">
                    Lead time: <span className="font-medium">
                      {review.lead_time_accuracy === 'faster' ? 'Faster than expected' : review.lead_time_accuracy === 'as_expected' ? 'As expected' : 'Slower than expected'}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Review Requests Tab ─────────────────────────────────────────────────────

function ReviewRequestsTab({ requests, isLoading }: { requests: ReviewRequestVendor[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (<ReviewCardSkeleton key={i} />))}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-patina-clay-beige/30">
        <Clock className="w-12 h-12 mx-auto text-patina-clay-beige mb-4" />
        <h3 className="text-lg font-medium text-patina-charcoal mb-2">No pending review requests</h3>
        <p className="text-patina-mocha-brown max-w-md mx-auto">When you order from vendors, we will remind you to leave a review to help the community.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-patina-mocha-brown mb-4">You have ordered from these vendors in the past 12 months. Consider leaving a review to help other designers.</p>
      {requests.map((vendor) => {
        const vendorName = vendor.trade_name || vendor.name;
        const orderDate = new Date(vendor.last_order_date);

        return (
          <div key={vendor.id} className="bg-white rounded-lg border border-patina-clay-beige/30 p-4 hover:border-patina-mocha-brown/30 transition-colors">
            <div className="flex items-center gap-4">
              <VendorLogo logoUrl={vendor.logo_url} vendorName={vendorName} size="md" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-patina-charcoal">{vendorName}</p>
                <p className="text-xs text-patina-mocha-brown">
                  Last order: {orderDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <Link href={`/vendors/${vendor.id}?review=true`} className="inline-flex items-center gap-2 px-4 py-2 bg-patina-mocha-brown text-white rounded-lg hover:bg-patina-charcoal transition-colors text-sm">
                <PenLine className="w-4 h-4" />
                Write Review
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Review Drafts Tab ───────────────────────────────────────────────────────

function ReviewDraftsTab() {
  return (
    <div className="text-center py-12 bg-white rounded-lg border border-patina-clay-beige/30">
      <FileText className="w-12 h-12 mx-auto text-patina-clay-beige mb-4" />
      <h3 className="text-lg font-medium text-patina-charcoal mb-2">No draft reviews</h3>
      <p className="text-patina-mocha-brown max-w-md mx-auto">Review drafts will appear here when you start writing a review but do not finish submitting it.</p>
    </div>
  );
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function VendorReviewsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('submitted');

  const { data: reviews = [], isLoading: reviewsLoading } = useDesignerReviews();
  const { data: requests = [], isLoading: requestsLoading } = useReviewRequests();

  return (
    <div className="min-h-screen bg-patina-off-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/vendors" className="inline-flex items-center gap-2 text-patina-mocha-brown hover:text-patina-charcoal transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to Vendors
        </Link>

        <div className="mb-6">
          <h1 className="text-3xl font-serif text-patina-charcoal flex items-center gap-3">
            <Star className="w-8 h-8 text-amber-400" />
            My Reviews
          </h1>
          <p className="text-patina-mocha-brown mt-1">Manage your vendor reviews and see pending review requests</p>
        </div>

        <div className="bg-white rounded-xl border border-patina-clay-beige/30 overflow-hidden">
          <div className="flex border-b border-patina-clay-beige/30 overflow-x-auto" role="tablist">
            <TabButton tabKey="submitted" label="Submitted Reviews" count={reviews.length} activeTab={activeTab} onClick={setActiveTab} icon={<PenLine className="w-4 h-4" />} />
            <TabButton tabKey="requests" label="Review Requests" count={requests.length} activeTab={activeTab} onClick={setActiveTab} icon={<Clock className="w-4 h-4" />} />
            <TabButton tabKey="drafts" label="Drafts" activeTab={activeTab} onClick={setActiveTab} icon={<FileText className="w-4 h-4" />} />
          </div>

          <div className="p-6" role="tabpanel">
            {activeTab === 'submitted' && <SubmittedReviewsTab reviews={reviews} isLoading={reviewsLoading} />}
            {activeTab === 'requests' && <ReviewRequestsTab requests={requests} isLoading={requestsLoading} />}
            {activeTab === 'drafts' && <ReviewDraftsTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
