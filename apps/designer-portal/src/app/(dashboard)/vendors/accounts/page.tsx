'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Building2,
  Clock,
  FileText,
  Mail,
  Phone,
  TrendingUp,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useTradeAccounts, useVendors } from '@patina/supabase';
import type { MarketPosition, AccountStatus } from '@patina/types';
import { VendorLogo, TierProgressBar, TradeTierIndicator } from '@/components/vendors';
import { useVendorsStore } from '@/stores/vendors-store';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TradeAccountWithVendor {
  id: string;
  vendor_id: string;
  status: AccountStatus;
  current_tier: string;
  account_number: string | null;
  account_since: string;
  ytd_volume: number;
  volume_to_next_tier: number | null;
  next_tier: string | null;
  sales_rep_name: string | null;
  sales_rep_email: string | null;
  sales_rep_phone: string | null;
  vendor: {
    id: string;
    name: string;
    trade_name: string | null;
    logo_url: string | null;
    market_position: MarketPosition;
  };
}

interface PendingApplicationWithVendor {
  id: string;
  vendor_id: string;
  submitted_at: string;
  status: 'submitted' | 'under-review' | 'documents-requested';
  estimated_decision: string | null;
  documents_requested: string[] | null;
  vendor: {
    id: string;
    name: string;
    trade_name: string | null;
    logo_url: string | null;
    market_position: MarketPosition;
  };
}

// ─── Utility Functions ────────────────────────────────────────────────────────

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return formatDate(dateString);
}

function formatDollars(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

// ─── Skeleton Components ──────────────────────────────────────────────────────

function AccountCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-patina-clay-beige/30 bg-white p-5">
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 bg-patina-clay-beige/30 rounded-lg" />
        <div className="flex-1 min-w-0">
          <div className="h-5 bg-patina-clay-beige/30 rounded w-1/2 mb-2" />
          <div className="h-4 bg-patina-clay-beige/30 rounded w-1/3 mb-4" />
          <div className="h-2 bg-patina-clay-beige/30 rounded w-full mb-2" />
          <div className="h-3 bg-patina-clay-beige/30 rounded w-2/3" />
        </div>
      </div>
    </div>
  );
}

function ApplicationCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-patina-clay-beige/30 bg-white p-5">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-patina-clay-beige/30 rounded-lg" />
        <div className="flex-1 min-w-0">
          <div className="h-5 bg-patina-clay-beige/30 rounded w-1/3 mb-2" />
          <div className="h-4 bg-patina-clay-beige/30 rounded w-1/4" />
        </div>
        <div className="h-6 bg-patina-clay-beige/30 rounded-full w-24" />
      </div>
    </div>
  );
}

function SuggestedCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-patina-clay-beige/30 bg-white p-5">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-patina-clay-beige/30 rounded-lg" />
        <div className="flex-1 min-w-0">
          <div className="h-5 bg-patina-clay-beige/30 rounded w-1/2 mb-2" />
          <div className="h-4 bg-patina-clay-beige/30 rounded w-1/3" />
        </div>
        <div className="h-9 bg-patina-clay-beige/30 rounded-lg w-24" />
      </div>
    </div>
  );
}

// ─── Stats Card Component ─────────────────────────────────────────────────────

interface StatsCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
}

function StatsCard({ icon, label, value, subtext }: StatsCardProps) {
  return (
    <div className="bg-white rounded-xl border border-patina-clay-beige/30 p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-patina-clay-beige/20">{icon}</div>
        <span className="text-sm text-patina-mocha-brown">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-patina-charcoal">{value}</p>
      {subtext && <p className="text-xs text-patina-mocha-brown mt-1">{subtext}</p>}
    </div>
  );
}

// ─── Application Status Badge ─────────────────────────────────────────────────

const APPLICATION_STATUS_CONFIG = {
  submitted: { label: 'Submitted', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  'under-review': { label: 'Under Review', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  'documents-requested': { label: 'Documents Requested', bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
} as const;

function ApplicationStatusBadge({ status }: { status: 'submitted' | 'under-review' | 'documents-requested' }) {
  const config = APPLICATION_STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

// ─── Active Account Card ──────────────────────────────────────────────────────

function ActiveAccountCard({ account, onClick }: { account: TradeAccountWithVendor; onClick: () => void }) {
  const vendorName = account.vendor.trade_name || account.vendor.name;
  const hasSalesRep = account.sales_rep_name || account.sales_rep_email;
  const targetVolume = account.volume_to_next_tier ? account.ytd_volume + account.volume_to_next_tier : account.ytd_volume;

  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className="rounded-xl border border-patina-clay-beige/30 bg-white p-5 hover:border-patina-mocha-brown/50 hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown focus:ring-offset-2"
    >
      <div className="flex items-start gap-4 mb-4">
        <VendorLogo logoUrl={account.vendor.logo_url} vendorName={vendorName} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold text-patina-charcoal truncate">{vendorName}</h3>
            <ChevronRight className="w-4 h-4 text-patina-mocha-brown flex-shrink-0" />
          </div>
          <TradeTierIndicator status="active" tierName={account.current_tier} variant="badge" />
          {account.account_number && <p className="text-xs text-patina-mocha-brown mt-1">Account #{account.account_number}</p>}
        </div>
      </div>

      <div className="mb-4">
        <TierProgressBar currentVolume={account.ytd_volume} targetVolume={targetVolume} currentTier={account.current_tier} nextTier={account.next_tier} showAmount />
      </div>

      <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-patina-clay-beige/10">
        <TrendingUp className="w-4 h-4 text-patina-mocha-brown" />
        <span className="text-sm text-patina-mocha-brown">YTD Volume:</span>
        <span className="text-sm font-semibold text-patina-charcoal">{formatDollars(account.ytd_volume)}</span>
      </div>

      {hasSalesRep && (
        <div className="pt-4 border-t border-patina-clay-beige/30">
          <p className="text-xs text-patina-mocha-brown mb-2">Your Sales Rep</p>
          <div className="flex flex-col gap-1">
            {account.sales_rep_name && <p className="text-sm font-medium text-patina-charcoal">{account.sales_rep_name}</p>}
            <div className="flex flex-wrap gap-3">
              {account.sales_rep_email && (
                <a href={`mailto:${account.sales_rep_email}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-patina-mocha-brown hover:text-patina-charcoal transition-colors">
                  <Mail className="w-3.5 h-3.5" />{account.sales_rep_email}
                </a>
              )}
              {account.sales_rep_phone && (
                <a href={`tel:${account.sales_rep_phone}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-patina-mocha-brown hover:text-patina-charcoal transition-colors">
                  <Phone className="w-3.5 h-3.5" />{account.sales_rep_phone}
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pending Application Card ─────────────────────────────────────────────────

function PendingApplicationCard({ application, onClick }: { application: PendingApplicationWithVendor; onClick: () => void }) {
  const vendorName = application.vendor.trade_name || application.vendor.name;
  const hasDocumentsRequested = application.status === 'documents-requested' && application.documents_requested && application.documents_requested.length > 0;

  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className="rounded-xl border border-patina-clay-beige/30 bg-white p-5 hover:border-patina-mocha-brown/50 hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown focus:ring-offset-2"
    >
      <div className="flex items-start gap-4">
        <VendorLogo logoUrl={application.vendor.logo_url} vendorName={vendorName} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="text-base font-semibold text-patina-charcoal truncate">{vendorName}</h3>
            <ApplicationStatusBadge status={application.status} />
          </div>
          <div className="flex items-center gap-2 text-sm text-patina-mocha-brown">
            <Clock className="w-3.5 h-3.5" />
            <span>Applied {formatRelativeDate(application.submitted_at)}</span>
          </div>
          {application.estimated_decision && <p className="text-xs text-patina-mocha-brown mt-1">Estimated decision: {formatDate(application.estimated_decision)}</p>}
        </div>
      </div>
      {hasDocumentsRequested && (
        <div className="mt-4 p-3 rounded-lg bg-orange-50 border border-orange-200">
          <div className="flex items-start gap-2">
            <FileText className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-orange-800">Documents Requested</p>
              <ul className="text-xs text-orange-700 mt-1 list-disc list-inside">
                {application.documents_requested?.map((doc, index) => (<li key={index}>{doc}</li>))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Suggested Vendor Card ────────────────────────────────────────────────────

function SuggestedVendorCard({ vendor, onClick }: { vendor: { id: string; name: string; trade_name: string | null; logo_url: string | null; market_position: MarketPosition; primary_category: string }; onClick: () => void }) {
  const vendorName = vendor.trade_name || vendor.name;

  return (
    <div className="rounded-xl border border-patina-clay-beige/30 bg-white p-5 hover:border-patina-mocha-brown/50 hover:shadow-sm transition-all">
      <div className="flex items-center gap-4">
        <VendorLogo logoUrl={vendor.logo_url} vendorName={vendorName} size="md" />
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-patina-charcoal truncate mb-0.5">{vendorName}</h3>
          <p className="text-sm text-patina-mocha-brown">{vendor.primary_category}</p>
        </div>
        <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} className="px-4 py-2 rounded-lg bg-patina-mocha-brown text-white text-sm font-medium hover:bg-patina-charcoal transition-colors focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown focus:ring-offset-2">
          View
        </button>
      </div>
    </div>
  );
}

// ─── Empty States ─────────────────────────────────────────────────────────────

function EmptyAccountsState() {
  return (
    <div className="text-center py-12 bg-white rounded-xl border border-patina-clay-beige/20">
      <Building2 className="w-12 h-12 mx-auto text-patina-clay-beige mb-4" />
      <h3 className="text-lg font-serif text-patina-charcoal mb-2">No Active Trade Accounts</h3>
      <p className="text-sm text-patina-mocha-brown mb-4 max-w-md mx-auto">Apply for trade accounts with vendors to access designer pricing and exclusive benefits.</p>
      <Link href="/vendors" className="inline-flex items-center gap-2 px-4 py-2 bg-patina-mocha-brown text-white rounded-lg hover:bg-patina-charcoal transition-colors">
        Browse Vendors
        <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

function EmptyApplicationsState() {
  return (
    <div className="text-center py-8 bg-patina-clay-beige/10 rounded-xl">
      <FileText className="w-10 h-10 mx-auto text-patina-clay-beige mb-3" />
      <p className="text-sm text-patina-mocha-brown">No pending applications</p>
    </div>
  );
}

function EmptySuggestionsState() {
  return (
    <div className="text-center py-8 bg-patina-clay-beige/10 rounded-xl">
      <Sparkles className="w-10 h-10 mx-auto text-patina-clay-beige mb-3" />
      <p className="text-sm text-patina-mocha-brown">No suggestions available at this time</p>
    </div>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function TradeAccountsPage() {
  const { openSlideOver } = useVendorsStore();

  const { data: tradeAccountsData, isLoading: isLoadingAccounts, error: accountsError } = useTradeAccounts();
  const { data: vendorsData, isLoading: isLoadingVendors } = useVendors(undefined, { page: 1, pageSize: 50 });

  const activeAccounts = useMemo(() => {
    if (!tradeAccountsData?.accounts) return [];
    return tradeAccountsData.accounts.filter((account: TradeAccountWithVendor) => account.status === 'active') as TradeAccountWithVendor[];
  }, [tradeAccountsData?.accounts]);

  const pendingApplications = useMemo(() => {
    if (!tradeAccountsData?.pendingApplications) return [];
    return tradeAccountsData.pendingApplications as PendingApplicationWithVendor[];
  }, [tradeAccountsData?.pendingApplications]);

  const existingVendorIds = useMemo(() => {
    const ids = new Set<string>();
    activeAccounts.forEach((account) => ids.add(account.vendor_id));
    pendingApplications.forEach((app) => ids.add(app.vendor_id));
    if (tradeAccountsData?.accounts) {
      tradeAccountsData.accounts.forEach((account: TradeAccountWithVendor) => {
        if (account.status === 'pending') ids.add(account.vendor_id);
      });
    }
    return ids;
  }, [activeAccounts, pendingApplications, tradeAccountsData?.accounts]);

  const suggestedVendors = useMemo(() => {
    if (!vendorsData?.data) return [];
    return vendorsData.data
      .filter((vendor: { id: string }) => !existingVendorIds.has(vendor.id))
      .slice(0, 5) as Array<{ id: string; name: string; trade_name: string | null; logo_url: string | null; market_position: MarketPosition; primary_category: string }>;
  }, [vendorsData?.data, existingVendorIds]);

  const totalYtdVolume = useMemo(() => {
    return activeAccounts.reduce((sum, account) => sum + account.ytd_volume, 0);
  }, [activeAccounts]);

  const handleVendorClick = (vendorId: string) => { openSlideOver(vendorId); };

  const isLoading = isLoadingAccounts || isLoadingVendors;

  if (accountsError) {
    return (
      <div className="min-h-screen bg-patina-off-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-serif text-patina-charcoal mb-2">Error Loading Trade Accounts</h1>
          <p className="text-patina-mocha-brown">Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-patina-off-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-serif text-patina-charcoal mb-2">My Trade Accounts</h1>
          <p className="text-patina-mocha-brown">Manage your vendor relationships and track account progress</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse bg-white rounded-xl border border-patina-clay-beige/30 p-5 h-28">
                <div className="flex items-center gap-3 mb-2"><div className="w-10 h-10 bg-patina-clay-beige/30 rounded-lg" /><div className="h-4 bg-patina-clay-beige/30 rounded w-20" /></div>
                <div className="h-7 bg-patina-clay-beige/30 rounded w-16" />
              </div>
            ))
          ) : (
            <>
              <StatsCard icon={<Building2 className="w-5 h-5 text-patina-mocha-brown" />} label="Active Accounts" value={activeAccounts.length} subtext={activeAccounts.length === 1 ? 'vendor' : 'vendors'} />
              <StatsCard icon={<Clock className="w-5 h-5 text-amber-600" />} label="Pending Applications" value={pendingApplications.length} subtext={pendingApplications.length === 1 ? 'application' : 'applications'} />
              <StatsCard icon={<TrendingUp className="w-5 h-5 text-green-600" />} label="Total YTD Volume" value={formatDollars(totalYtdVolume)} subtext="across all accounts" />
              <StatsCard icon={<Sparkles className="w-5 h-5 text-purple-600" />} label="Available Programs" value={suggestedVendors.length} subtext="vendors to explore" />
            </>
          )}
        </div>

        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-serif text-patina-charcoal">Active Accounts</h2>
            {activeAccounts.length > 0 && <span className="text-sm text-patina-mocha-brown">{activeAccounts.length} {activeAccounts.length === 1 ? 'account' : 'accounts'}</span>}
          </div>
          {isLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => (<AccountCardSkeleton key={i} />))}</div>
          ) : activeAccounts.length === 0 ? (
            <EmptyAccountsState />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {activeAccounts.map((account) => (<ActiveAccountCard key={account.id} account={account} onClick={() => handleVendorClick(account.vendor_id)} />))}
            </div>
          )}
        </section>

        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-serif text-patina-charcoal">Pending Applications</h2>
            {pendingApplications.length > 0 && <span className="text-sm text-patina-mocha-brown">{pendingApplications.length} {pendingApplications.length === 1 ? 'application' : 'applications'}</span>}
          </div>
          {isLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{Array.from({ length: 2 }).map((_, i) => (<ApplicationCardSkeleton key={i} />))}</div>
          ) : pendingApplications.length === 0 ? (
            <EmptyApplicationsState />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {pendingApplications.map((application) => (<PendingApplicationCard key={application.id} application={application} onClick={() => handleVendorClick(application.vendor_id)} />))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-serif text-patina-charcoal">Suggested Trade Programs</h2>
              <p className="text-sm text-patina-mocha-brown mt-1">Vendors you may want to establish trade accounts with</p>
            </div>
            {suggestedVendors.length > 0 && <Link href="/vendors" className="text-sm text-patina-mocha-brown hover:text-patina-charcoal transition-colors">View all vendors</Link>}
          </div>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => (<SuggestedCardSkeleton key={i} />))}</div>
          ) : suggestedVendors.length === 0 ? (
            <EmptySuggestionsState />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {suggestedVendors.map((vendor) => (<SuggestedVendorCard key={vendor.id} vendor={vendor} onClick={() => handleVendorClick(vendor.id)} />))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
