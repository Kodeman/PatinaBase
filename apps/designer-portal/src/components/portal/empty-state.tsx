import { PortalButton } from './button';

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="px-8 py-12 text-center">
      <h3 className="type-item-name mb-2 font-normal italic text-[var(--text-muted)]">
        {title}
      </h3>
      {description && (
        <p className="type-body-small mx-auto mb-6 max-w-[360px] text-[var(--text-muted)]">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <PortalButton variant="primary" onClick={onAction}>
          {actionLabel}
        </PortalButton>
      )}
    </div>
  );
}
