interface FieldGroupProps {
  label: string;
  children: React.ReactNode;
}

export function FieldGroup({ label, children }: FieldGroupProps) {
  return (
    <div className="mb-8">
      <span className="type-meta mb-2 block">{label}</span>
      {children}
    </div>
  );
}
