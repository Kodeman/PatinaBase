'use client';

import { StatusDot, type StatusDotStatus } from '@patina/design-system';
import { useProjectFFEItems } from '@patina/supabase';
import { Package } from 'lucide-react';

interface FFEStatusProps {
  projectId: string;
}

const CLIENT_VISIBLE_STATUSES = ['approved', 'ordered', 'production', 'shipped', 'delivered', 'installed'];

const statusLabels: Record<string, string> = {
  approved: 'Approved',
  ordered: 'Ordered',
  production: 'In Production',
  shipped: 'Shipped',
  delivered: 'Delivered',
  installed: 'Installed',
};

function ffeStatusToDotStatus(status: string): StatusDotStatus {
  switch (status) {
    case 'installed':
    case 'delivered':
      return 'completed';
    case 'shipped':
    case 'production':
    case 'ordered':
      return 'active';
    default:
      return 'pending';
  }
}

export function FFEStatus({ projectId }: FFEStatusProps) {
  const { data: allItems, isLoading } = useProjectFFEItems(projectId);

  if (isLoading) {
    return (
      <div className="py-6">
        <div className="h-4 w-32 animate-pulse rounded bg-[var(--color-pearl)]" />
      </div>
    );
  }

  // Filter to only client-visible items (past the internal specified/quoted stages)
  const items = (allItems ?? []).filter((item: any) =>
    CLIENT_VISIBLE_STATUSES.includes(item.status)
  );

  if (items.length === 0) {
    return null;
  }

  // Group by room
  const byRoom = new Map<string, any[]>();
  for (const item of items) {
    const roomName = item.room?.name || 'General';
    const existing = byRoom.get(roomName) || [];
    existing.push(item);
    byRoom.set(roomName, existing);
  }

  return (
    <div>
      <h3 className="type-section-head">Your Selections</h3>
      <p className="type-body-small mt-1">Track the status of your approved furnishings and materials.</p>

      {Array.from(byRoom.entries()).map(([roomName, roomItems]) => (
        <div key={roomName} className="mt-6">
          <h4 className="type-meta mb-3">{roomName}</h4>
          <div className="space-y-0">
            {roomItems.map((item: any) => {
              const itemName = item.product?.name || item.name || item.description || 'Item';
              const dotStatus = ffeStatusToDotStatus(item.status);

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between border-b border-[var(--border-subtle)] py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusDot status={dotStatus} />
                    <div className="min-w-0">
                      <p className="text-sm text-[var(--text-primary)] truncate">{itemName}</p>
                      <p className="type-meta-small mt-0.5">
                        {statusLabels[item.status] || item.status}
                      </p>
                    </div>
                  </div>
                  {item.eta && (
                    <span className="type-meta shrink-0 ml-4">
                      ETA {new Date(item.eta).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
