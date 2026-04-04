interface DetailRowProps {
  label: string;
  value: string;
}

export function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 py-[0.35rem]">
      <span className="type-meta">{label}</span>
      <span className="type-body-small">{value}</span>
    </div>
  );
}
