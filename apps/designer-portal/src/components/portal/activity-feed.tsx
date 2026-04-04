'use client';

interface ActivityItem {
  id: string;
  title: string;
  actorName?: string;
  timestamp: string;
}

interface ActivityFeedProps {
  items: ActivityItem[];
}

export function ActivityFeed({ items }: ActivityFeedProps) {
  if (items.length === 0) {
    return (
      <p className="type-body py-4 italic text-[var(--text-muted)]">
        No recent activity.
      </p>
    );
  }

  return (
    <div>
      {items.map((item) => (
        <div
          key={item.id}
          className="border-b py-2"
          style={{ borderColor: 'rgba(229, 226, 221, 0.3)' }}
        >
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.82rem',
              color: 'var(--text-body)',
              lineHeight: 1.5,
            }}
          >
            {item.actorName && (
              <strong
                style={{ fontWeight: 500, color: 'var(--text-primary)' }}
              >
                {item.actorName}
              </strong>
            )}{' '}
            {item.title}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.52rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--text-muted)',
              marginTop: '0.1rem',
            }}
          >
            {item.timestamp}
          </div>
        </div>
      ))}
    </div>
  );
}
