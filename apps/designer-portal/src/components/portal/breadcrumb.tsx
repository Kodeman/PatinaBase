import Link from 'next/link';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="type-meta mb-6">
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-1.5 opacity-50">→</span>}
          {item.href ? (
            <Link
              href={item.href}
              className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]"
            >
              {item.label}
            </Link>
          ) : (
            <span>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
