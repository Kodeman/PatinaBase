interface CompatItemProps {
  id: string;
  name: string;
  relationship?: string;
  thumbUrl?: string;
  onClick?: (id: string) => void;
}

export function CompatItem({ id, name, relationship = '✦ Complements', thumbUrl, onClick }: CompatItemProps) {
  return (
    <div
      className="grid cursor-pointer items-center gap-3 border-b border-[var(--border-subtle)] py-2.5"
      style={{ gridTemplateColumns: '56px 1fr' }}
      onClick={() => onClick?.(id)}
    >
      <div className="h-[42px] w-[56px] rounded bg-[var(--color-pearl)]">
        {thumbUrl && (
          <img src={thumbUrl} alt={name} className="h-full w-full rounded object-cover" />
        )}
      </div>
      <div>
        <div className="font-body text-[0.82rem] font-medium text-[var(--text-primary)]">
          {name}
        </div>
        <div className="type-meta-small text-[var(--color-sage)]">
          {relationship}
        </div>
      </div>
    </div>
  );
}
