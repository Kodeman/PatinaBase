import { ActivityFeed } from '@/components/portal/activity-feed';

interface ActivityItem {
  id: string;
  title: string;
  actorName?: string;
  timestamp: string;
}

interface RecentActivityPanelProps {
  items: ActivityItem[];
  projectId: string;
}

export function RecentActivityPanel({ items, projectId }: RecentActivityPanelProps) {
  return (
    <div>
      <h3
        style={{
          fontFamily: 'var(--font-heading)',
          fontWeight: 500,
          fontSize: '1.25rem',
          lineHeight: 1.35,
          marginBottom: '0.25rem',
        }}
      >
        Recent Activity
      </h3>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        All project events
      </div>

      <ActivityFeed items={items} />
      {/* "View Full Activity Log" removed — there is no dedicated activity
          route yet, and a dead button reads as broken. Re-add as a link once a
          /portal/projects/[id]/activity surface exists. */}
    </div>
  );
}
