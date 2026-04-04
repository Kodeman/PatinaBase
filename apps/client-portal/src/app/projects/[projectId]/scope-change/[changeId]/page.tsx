'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useScopeChangeRequest,
  useApproveScopeChange,
  useDeclineScopeChange,
} from '@patina/supabase';

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString()}`;
}

export default function ClientScopeChangeApprovalPage({
  params,
}: {
  params: Promise<{ projectId: string; changeId: string }>;
}) {
  const { projectId, changeId } = use(params);
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: request, isLoading } = useScopeChangeRequest(changeId) as { data: any; isLoading: boolean };
  const approveChange = useApproveScopeChange();
  const declineChange = useDeclineScopeChange();

  const [signName, setSignName] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [showDecline, setShowDecline] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse font-body text-sm text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="font-body text-sm text-gray-500">Scope change request not found.</p>
      </div>
    );
  }

  const isActionable = request.status === 'sent' || request.status === 'viewed';
  const isResolved = request.status === 'approved' || request.status === 'declined';

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      {/* Header */}
      <div className="mb-8">
        <p className="mb-2 font-mono text-[0.6rem] uppercase tracking-widest text-gray-400">
          Scope Change Authorization
        </p>
        <h1 className="mb-2 font-serif text-3xl font-normal tracking-tight text-gray-900">
          {request.title}
        </h1>
        {isResolved && (
          <span
            className={`inline-block rounded-sm px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider ${
              request.status === 'approved'
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {request.status}
          </span>
        )}
      </div>

      {/* Description */}
      <p className="mb-8 font-body text-sm leading-relaxed text-gray-600">
        {request.description}
      </p>

      {/* Impact Summary */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-gray-50 p-6">
        <h3 className="mb-4 font-mono text-[0.6rem] uppercase tracking-widest text-gray-500">
          Impact Summary
        </h3>
        <div className="space-y-3">
          {(request.additional_ffe_budget_cents || 0) > 0 && (
            <div className="flex justify-between font-body text-sm">
              <span className="text-gray-600">Additional FF&E Budget</span>
              <span className="font-medium text-gray-900">
                {formatDollars(request.additional_ffe_budget_cents)}
              </span>
            </div>
          )}
          {(request.additional_design_fee_cents || 0) > 0 && (
            <div className="flex justify-between font-body text-sm">
              <span className="text-gray-600">Additional Design Fee</span>
              <span className="font-medium text-gray-900">
                {formatDollars(request.additional_design_fee_cents)}
              </span>
            </div>
          )}
          {(request.timeline_impact_weeks || 0) > 0 && (
            <div className="flex justify-between font-body text-sm">
              <span className="text-gray-600">Timeline Impact</span>
              <span className="font-medium text-gray-900">
                +{request.timeline_impact_weeks} weeks
              </span>
            </div>
          )}
          <div className="border-t border-gray-200 pt-3">
            <div className="flex justify-between font-body text-sm">
              <span className="font-medium text-gray-900">New Total Project Value</span>
              <span className="font-serif text-lg font-medium text-gray-900">
                {formatDollars(request.new_total_budget_cents || 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* New rooms */}
      {request.new_rooms?.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-3 font-mono text-[0.6rem] uppercase tracking-widest text-gray-500">
            New Rooms
          </h3>
          {request.new_rooms.map(
            (room: { name: string; budgetCents?: number; budget_cents?: number }, i: number) => (
              <div
                key={i}
                className="mb-2 rounded-md border border-gray-200 px-4 py-3"
              >
                <span className="font-body text-sm font-medium text-gray-900">{room.name}</span>
                <span className="ml-2 font-mono text-xs text-gray-400">
                  {formatDollars(room.budgetCents || room.budget_cents || 0)} budget
                </span>
              </div>
            )
          )}
        </div>
      )}

      {/* Approval section */}
      {isActionable && !showDecline && (
        <div className="border-t border-gray-200 pt-8">
          <h3 className="mb-4 font-serif text-lg text-gray-900">Approve This Change</h3>
          <div className="mb-4">
            <label className="mb-1 block font-mono text-[0.58rem] uppercase tracking-wider text-gray-500">
              Your Full Name (Digital Signature)
            </label>
            <input
              type="text"
              value={signName}
              onChange={(e) => setSignName(e.target.value)}
              placeholder="Enter your full name to sign"
              className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 font-body text-sm outline-none focus:border-gray-500"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={async () => {
                await approveChange.mutateAsync({
                  requestId: changeId,
                  projectId,
                  approvedByName: signName,
                });
                router.refresh();
              }}
              disabled={!signName.trim() || approveChange.isPending}
              className="rounded-md bg-gray-900 px-5 py-2.5 font-body text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
            >
              {approveChange.isPending ? 'Approving...' : 'Approve Change'}
            </button>
            <button
              onClick={() => setShowDecline(true)}
              className="rounded-md border border-gray-300 px-5 py-2.5 font-body text-sm text-gray-600 transition-colors hover:bg-gray-50"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Decline section */}
      {isActionable && showDecline && (
        <div className="border-t border-gray-200 pt-8">
          <h3 className="mb-4 font-serif text-lg text-gray-900">Decline This Change</h3>
          <div className="mb-4">
            <label className="mb-1 block font-mono text-[0.58rem] uppercase tracking-wider text-gray-500">
              Reason (Optional)
            </label>
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Why are you declining this change?"
              className="min-h-[80px] w-full max-w-sm resize-y rounded-md border border-gray-300 px-3 py-2 font-body text-sm outline-none focus:border-gray-500"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={async () => {
                await declineChange.mutateAsync({
                  requestId: changeId,
                  projectId,
                  declineReason: declineReason || undefined,
                });
                router.refresh();
              }}
              disabled={declineChange.isPending}
              className="rounded-md bg-red-600 px-5 py-2.5 font-body text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {declineChange.isPending ? 'Declining...' : 'Confirm Decline'}
            </button>
            <button
              onClick={() => setShowDecline(false)}
              className="rounded-md border border-gray-300 px-5 py-2.5 font-body text-sm text-gray-600 transition-colors hover:bg-gray-50"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Already resolved */}
      {request.approved_at && (
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-5">
          <p className="font-body text-sm text-green-800">
            Approved by {request.approved_by_name || 'You'} on{' '}
            {new Date(request.approved_at).toLocaleDateString()}
          </p>
        </div>
      )}
      {request.declined_at && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-5">
          <p className="font-body text-sm text-red-800">
            Declined on {new Date(request.declined_at).toLocaleDateString()}
            {request.decline_reason ? `: ${request.decline_reason}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
