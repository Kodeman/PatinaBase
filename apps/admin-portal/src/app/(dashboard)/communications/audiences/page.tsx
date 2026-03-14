'use client';

import { useRouter } from 'next/navigation';
import { useAudienceSegments, useDeleteAudienceSegment } from '@patina/supabase/hooks';
import { Users, Plus, Shield, Trash2 } from 'lucide-react';

export default function AudiencesPage() {
  const router = useRouter();
  const { data: segments, isLoading } = useAudienceSegments();
  const deleteSegment = useDeleteAudienceSegment();

  const presets = (segments || []).filter((s) => s.is_preset);
  const custom = (segments || []).filter((s) => !s.is_preset);

  return (
    <div className="min-h-screen bg-patina-off-white">
      <div className="bg-white border-b border-patina-clay-beige/20 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-semibold text-patina-charcoal">Audiences</h1>
            <p className="text-sm text-patina-clay-beige mt-1">Manage audience segments and suppression lists</p>
          </div>
          <button
            onClick={() => router.push('/communications/audiences/new')}
            className="flex items-center gap-2 px-4 py-2.5 bg-patina-mocha-brown text-white rounded-lg text-sm font-medium hover:bg-patina-charcoal transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Segment
          </button>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-patina-clay-beige border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Preset segments */}
            {presets.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-patina-charcoal mb-3">Preset Segments</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {presets.map((segment) => (
                    <div
                      key={segment.id}
                      className="bg-white rounded-xl border border-patina-clay-beige/20 p-5 cursor-pointer hover:shadow-sm transition-shadow"
                      onClick={() => router.push(`/communications/audiences/${segment.id}`)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="w-9 h-9 rounded-lg bg-patina-off-white flex items-center justify-center">
                          <Users className="w-4 h-4 text-patina-mocha-brown" />
                        </div>
                        <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded-full">
                          Preset
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-patina-charcoal">{segment.name}</h3>
                      {segment.description && (
                        <p className="text-xs text-patina-clay-beige mt-1 line-clamp-2">{segment.description}</p>
                      )}
                      <p className="text-xs text-patina-clay-beige mt-2">
                        ~{segment.estimated_size.toLocaleString()} recipients
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Custom segments */}
            <div>
              <h2 className="text-sm font-semibold text-patina-charcoal mb-3">Custom Segments</h2>
              {custom.length === 0 ? (
                <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-12 text-center">
                  <Users className="w-12 h-12 text-patina-clay-beige/50 mx-auto mb-4" />
                  <h3 className="text-lg font-display font-semibold text-patina-charcoal mb-2">No custom segments</h3>
                  <p className="text-sm text-patina-clay-beige mb-4">Create segments to target specific audiences.</p>
                  <button
                    onClick={() => router.push('/communications/audiences/new')}
                    className="px-4 py-2 bg-patina-mocha-brown text-white rounded-lg text-sm font-medium hover:bg-patina-charcoal transition-colors"
                  >
                    Create Segment
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-patina-clay-beige/20 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-patina-clay-beige/20">
                        <th className="text-left px-6 py-3 text-xs font-medium text-patina-clay-beige uppercase tracking-wider">Segment</th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-patina-clay-beige uppercase tracking-wider">Est. Size</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-patina-clay-beige uppercase tracking-wider">Rules</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-patina-clay-beige uppercase tracking-wider">Created</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-patina-clay-beige/10">
                      {custom.map((segment) => (
                        <tr
                          key={segment.id}
                          className="hover:bg-patina-off-white/50 cursor-pointer transition-colors"
                          onClick={() => router.push(`/communications/audiences/${segment.id}`)}
                        >
                          <td className="px-6 py-4">
                            <p className="text-sm font-medium text-patina-charcoal">{segment.name}</p>
                            {segment.description && (
                              <p className="text-xs text-patina-clay-beige truncate max-w-[250px]">{segment.description}</p>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-patina-charcoal text-right">
                            {segment.estimated_size.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-sm text-patina-clay-beige">
                            {segment.rules.conditions.length} {segment.rules.conditions.length === 1 ? 'rule' : 'rules'} ({segment.rules.logic.toUpperCase()})
                          </td>
                          <td className="px-6 py-4 text-sm text-patina-clay-beige">
                            {new Date(segment.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('Delete this segment?')) {
                                  deleteSegment.mutate(segment.id);
                                }
                              }}
                              className="p-1 text-patina-clay-beige hover:text-red-500"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Suppression Lists section */}
            <div>
              <h2 className="text-sm font-semibold text-patina-charcoal mb-3">Suppression Lists</h2>
              <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-patina-clay-beige" />
                  <div>
                    <p className="text-sm font-medium text-patina-charcoal">Automatic Suppression</p>
                    <p className="text-xs text-patina-clay-beige mt-0.5">
                      Users who unsubscribed, hard-bounced, or exceeded frequency caps are automatically excluded from campaigns.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
