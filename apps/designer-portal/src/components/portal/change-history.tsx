interface ChangeHistoryItem {
  id: string;
  actorName: string;
  description: string;
  timestamp: string;
}

interface ChangeHistoryProps {
  items: ChangeHistoryItem[];
}

export function ChangeHistory({ items }: ChangeHistoryProps) {
  if (items.length === 0) {
    return (
      <p className="type-body py-4 italic text-[var(--text-muted)]">
        No changes recorded.
      </p>
    );
  }

  return (
    <div>
      {items.map((item) => (
        <div
          key={item.id}
          className="border-b py-2.5"
          style={{ borderColor: 'rgba(229, 226, 221, 0.3)' }}
        >
          <div className="font-body text-[0.82rem] leading-[1.5] text-[var(--text-body)]">
            <strong className="font-medium text-[var(--text-primary)]">{item.actorName}</strong>{' '}
            {item.description}
          </div>
          <div className="type-meta-small mt-0.5">
            {item.timestamp}
          </div>
        </div>
      ))}
    </div>
  );
}
