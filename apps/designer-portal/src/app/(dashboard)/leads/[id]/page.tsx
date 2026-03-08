'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useLead, useMarkLeadViewed, useAcceptLead, useDeclineLead, useRoomScan } from '@patina/supabase';
import {
  ArrowLeft,
  User,
  MapPin,
  Calendar,
  DollarSign,
  Clock,
  TrendingUp,
  CheckCircle,
  XCircle,
  Mail,
  MessageSquare,
  Loader2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LeadRoomScans } from '@/components/leads/lead-room-scans';

// Dynamically import the viewer to avoid SSR issues with Three.js
const RoomScanViewer = dynamic(
  () => import('@/components/rooms/viewer/RoomScanViewer').then((mod) => mod.RoomScanViewer),
  { ssr: false }
);

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function formatMatchScore(score: number | null): string {
  if (score === null) return '--';
  return `${Math.round(score * 100)}%`;
}

function getMatchScoreColor(score: number | null): string {
  if (score === null) return 'text-patina-clay-beige';
  if (score >= 0.8) return 'text-green-600';
  if (score >= 0.6) return 'text-amber-600';
  return 'text-patina-clay-beige';
}

function formatBudgetRange(range: string | null): string {
  const labels: Record<string, string> = {
    under_5k: 'Under $5,000',
    '5k_15k': '$5,000 - $15,000',
    '15k_50k': '$15,000 - $50,000',
    '50k_100k': '$50,000 - $100,000',
    over_100k: 'Over $100,000',
  };
  return range ? labels[range] || range : 'Not specified';
}

function formatProjectType(type: string): string {
  const labels: Record<string, string> = {
    full_room: 'Full Room Design',
    consultation: 'Consultation',
    single_piece: 'Single Piece',
    staging: 'Staging',
  };
  return labels[type] || type;
}

function formatTimeline(timeline: string | null): string {
  const labels: Record<string, string> = {
    asap: 'ASAP',
    '1_3_months': '1-3 months',
    '3_6_months': '3-6 months',
    '6_12_months': '6-12 months',
    flexible: 'Flexible',
  };
  return timeline ? labels[timeline] || timeline : 'Flexible';
}

function getStatusConfig(status: string) {
  const configs: Record<string, { label: string; className: string; description: string }> = {
    new: {
      label: 'New Lead',
      className: 'bg-blue-100 text-blue-700 border-blue-200',
      description: 'This lead is waiting for your review',
    },
    viewed: {
      label: 'Viewed',
      className: 'bg-patina-off-white text-patina-mocha-brown border-patina-clay-beige',
      description: 'You have viewed this lead',
    },
    contacted: {
      label: 'Contacted',
      className: 'bg-amber-100 text-amber-700 border-amber-200',
      description: 'You have reached out to this homeowner',
    },
    accepted: {
      label: 'Accepted',
      className: 'bg-green-100 text-green-700 border-green-200',
      description: 'This lead has been converted to a client',
    },
    declined: {
      label: 'Declined',
      className: 'bg-red-100 text-red-700 border-red-200',
      description: 'You declined this lead',
    },
  };
  return configs[status] || configs.new;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;

  const { data: lead, isLoading, error } = useLead(leadId);
  const markViewed = useMarkLeadViewed();
  const acceptLead = useAcceptLead();
  const declineLead = useDeclineLead();

  // 3D Viewer state
  const [viewerScanId, setViewerScanId] = useState<string | null>(null);
  const { data: viewerScan } = useRoomScan(viewerScanId || '');

  // Mark as viewed when opening
  useEffect(() => {
    if (lead && lead.status === 'new') {
      markViewed.mutate(leadId);
    }
  }, [lead, leadId, markViewed]);

  const handleAccept = async () => {
    try {
      await acceptLead.mutateAsync(leadId);
      router.push('/clients');
    } catch (err) {
      console.error('Failed to accept lead:', err);
    }
  };

  const handleDecline = async () => {
    try {
      await declineLead.mutateAsync({ leadId });
      router.push('/leads');
    } catch (err) {
      console.error('Failed to decline lead:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-patina-off-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-patina-mocha-brown" />
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="min-h-screen bg-patina-off-white">
        <div className="px-6 py-6">
          <Link
            href="/leads"
            className="inline-flex items-center gap-2 text-patina-clay-beige hover:text-patina-mocha-brown mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Leads
          </Link>
          <div className="text-center py-12">
            <h2 className="font-display text-xl font-semibold text-patina-charcoal mb-2">
              Lead not found
            </h2>
            <p className="text-patina-clay-beige">
              This lead may have been removed or you don&apos;t have access to it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const statusConfig = getStatusConfig(lead.status);
  const canTakeAction = ['new', 'viewed', 'contacted'].includes(lead.status);
  const isHighMatch = (lead.match_score ?? 0) >= 0.8;

  return (
    <div className="min-h-screen bg-patina-off-white">
      {/* Header */}
      <div className="bg-white border-b border-patina-clay-beige/20">
        <div className="px-6 py-4">
          <Link
            href="/leads"
            className="inline-flex items-center gap-2 text-patina-clay-beige hover:text-patina-mocha-brown mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Lead Inbox
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="font-display text-2xl font-semibold text-patina-charcoal">
                  {lead.homeowner?.full_name || lead.homeowner?.email || 'Anonymous Lead'}
                </h1>
                <span className={cn('px-3 py-1 rounded-full text-sm font-medium border', statusConfig.className)}>
                  {statusConfig.label}
                </span>
              </div>
              <p className="text-patina-clay-beige">{statusConfig.description}</p>
            </div>

            {/* Match Score */}
            <div className="text-right">
              <div className="flex items-center gap-2 justify-end">
                <TrendingUp className={cn('w-5 h-5', getMatchScoreColor(lead.match_score))} />
                <span className={cn('text-2xl font-display font-semibold', getMatchScoreColor(lead.match_score))}>
                  {formatMatchScore(lead.match_score)}
                </span>
              </div>
              <p className="text-sm text-patina-clay-beige">Match Score</p>
              {isHighMatch && (
                <span className="inline-block mt-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                  Highly Compatible
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Project Details */}
            <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
              <h2 className="font-display text-lg font-semibold text-patina-charcoal mb-4">
                Project Details
              </h2>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center gap-2 text-patina-clay-beige mb-1">
                    <Calendar className="w-4 h-4" />
                    <span className="text-sm">Project Type</span>
                  </div>
                  <p className="font-medium text-patina-charcoal">
                    {formatProjectType(lead.project_type)}
                  </p>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-patina-clay-beige mb-1">
                    <DollarSign className="w-4 h-4" />
                    <span className="text-sm">Budget Range</span>
                  </div>
                  <p className="font-medium text-patina-charcoal">
                    {formatBudgetRange(lead.budget_range)}
                  </p>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-patina-clay-beige mb-1">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">Timeline</span>
                  </div>
                  <p className="font-medium text-patina-charcoal">
                    {formatTimeline(lead.timeline)}
                  </p>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-patina-clay-beige mb-1">
                    <MapPin className="w-4 h-4" />
                    <span className="text-sm">Location</span>
                  </div>
                  <p className="font-medium text-patina-charcoal">
                    {lead.location_city && lead.location_state
                      ? `${lead.location_city}, ${lead.location_state}${lead.location_zip ? ` ${lead.location_zip}` : ''}`
                      : 'Not specified'}
                  </p>
                </div>
              </div>

              {lead.project_description && (
                <div className="mt-6 pt-6 border-t border-patina-clay-beige/10">
                  <h3 className="text-sm font-medium text-patina-charcoal mb-2">
                    Project Description
                  </h3>
                  <p className="text-patina-mocha-brown whitespace-pre-wrap">
                    {lead.project_description}
                  </p>
                </div>
              )}
            </div>

            {/* Match Reasons */}
            {lead.match_reasons && lead.match_reasons.length > 0 && (
              <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
                <h2 className="font-display text-lg font-semibold text-patina-charcoal mb-4">
                  Why This Lead Matches
                </h2>
                <ul className="space-y-2">
                  {lead.match_reasons.map((reason, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-patina-mocha-brown">{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Room Scans */}
            {lead.homeowner?.id && (
              <LeadRoomScans
                homeownerId={lead.homeowner.id}
                leadName={lead.homeowner?.full_name || 'This homeowner'}
                onViewScan={(scanId) => setViewerScanId(scanId)}
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Contact Card */}
            <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
              <h2 className="font-display text-lg font-semibold text-patina-charcoal mb-4">
                Homeowner
              </h2>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-patina-off-white flex items-center justify-center">
                  {lead.homeowner?.avatar_url ? (
                    <img
                      src={lead.homeowner.avatar_url}
                      alt=""
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <User className="w-6 h-6 text-patina-clay-beige" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-patina-charcoal">
                    {lead.homeowner?.full_name || 'Name not provided'}
                  </p>
                  <p className="text-sm text-patina-clay-beige">
                    {lead.homeowner?.email || 'Email hidden'}
                  </p>
                </div>
              </div>

              {canTakeAction && lead.homeowner?.email && (
                <a
                  href={`mailto:${lead.homeowner.email}`}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-patina-off-white text-patina-charcoal rounded-lg hover:bg-patina-soft-cream transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  Send Email
                </a>
              )}
            </div>

            {/* Actions */}
            {canTakeAction && (
              <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
                <h2 className="font-display text-lg font-semibold text-patina-charcoal mb-4">
                  Actions
                </h2>

                <div className="space-y-3">
                  <button
                    onClick={handleAccept}
                    disabled={acceptLead.isPending}
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {acceptLead.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    Accept Lead
                  </button>

                  <button
                    onClick={handleDecline}
                    disabled={declineLead.isPending}
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {declineLead.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                    Decline Lead
                  </button>
                </div>

                <p className="text-xs text-patina-clay-beige mt-4">
                  Accepting a lead will add the homeowner to your clients list.
                </p>
              </div>
            )}

            {/* Timeline */}
            <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
              <h2 className="font-display text-lg font-semibold text-patina-charcoal mb-4">
                Timeline
              </h2>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-patina-clay-beige">Received</span>
                  <span className="text-patina-charcoal">
                    {new Date(lead.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>

                {lead.contacted_at && (
                  <div className="flex justify-between">
                    <span className="text-patina-clay-beige">Contacted</span>
                    <span className="text-patina-charcoal">
                      {new Date(lead.contacted_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                )}

                {lead.accepted_at && (
                  <div className="flex justify-between">
                    <span className="text-patina-clay-beige">Accepted</span>
                    <span className="text-green-600">
                      {new Date(lead.accepted_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                )}

                {lead.declined_at && (
                  <div className="flex justify-between">
                    <span className="text-patina-clay-beige">Declined</span>
                    <span className="text-red-600">
                      {new Date(lead.declined_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                )}

                {lead.response_deadline && (
                  <div className="flex justify-between pt-2 border-t border-patina-clay-beige/10">
                    <span className="text-patina-clay-beige">Response Deadline</span>
                    <span className="text-amber-600 font-medium">
                      {new Date(lead.response_deadline).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3D Viewer Modal */}
      {viewerScanId && viewerScan && (
        <div className="fixed inset-0 z-50 bg-black/90">
          <RoomScanViewer
            scan={viewerScan}
            onClose={() => setViewerScanId(null)}
            isFullscreen
          />
        </div>
      )}
    </div>
  );
}
