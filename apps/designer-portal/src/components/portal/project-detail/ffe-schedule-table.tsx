import type { MockFFEItem, FFEStatus } from '@/types/project-ui';

interface FFEScheduleTableProps {
  items: MockFFEItem[];
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const statusStyles: Record<FFEStatus, { color: string; bg: string; label: string }> = {
  specified: { color: 'var(--text-muted)', bg: 'rgba(139, 115, 85, 0.06)', label: 'Specified' },
  quoted: { color: 'var(--color-dusty-blue)', bg: 'rgba(139, 156, 173, 0.08)', label: 'Quoting' },
  approved: { color: 'var(--color-clay)', bg: 'rgba(196, 165, 123, 0.08)', label: 'Approved' },
  ordered: { color: 'var(--color-dusty-blue)', bg: 'rgba(139, 156, 173, 0.1)', label: 'Ordered' },
  production: { color: 'var(--color-golden-hour)', bg: 'rgba(232, 197, 71, 0.08)', label: 'Production' },
  shipped: { color: 'var(--color-golden-hour)', bg: 'rgba(232, 197, 71, 0.1)', label: 'Shipped' },
  delivered: { color: 'var(--color-sage)', bg: 'rgba(122, 155, 118, 0.08)', label: 'Delivered' },
  installed: { color: 'var(--color-sage)', bg: 'rgba(122, 155, 118, 0.12)', label: 'Installed' },
};

function StatusBadge({ status, blocked }: { status: FFEStatus; blocked?: boolean }) {
  if (blocked) {
    return (
      <span
        className="inline-flex whitespace-nowrap rounded-sm px-1.5 py-0.5"
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.48rem',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--color-terracotta)',
          background: 'rgba(139, 115, 85, 0.06)',
        }}
      >
        Blocked
      </span>
    );
  }

  const style = statusStyles[status];
  return (
    <span
      className="inline-flex whitespace-nowrap rounded-sm px-1.5 py-0.5"
      style={{
        fontFamily: 'var(--font-meta)',
        fontSize: '0.48rem',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color: style.color,
        background: style.bg,
      }}
    >
      {style.label}
    </span>
  );
}

export function FFEScheduleTable({ items }: FFEScheduleTableProps) {
  // Group by room
  const roomGroups = items.reduce<Record<string, MockFFEItem[]>>((acc, item) => {
    if (!acc[item.roomName]) acc[item.roomName] = [];
    acc[item.roomName].push(item);
    return acc;
  }, {});

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
        FF&E Schedule
      </h3>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        {items.length} items · 8-stage pipeline: Specified → Quoted → Approved → Ordered → Production → Shipped → Delivered → Installed
      </div>

      {/* Column headers */}
      <div
        className="mb-1 grid items-center gap-2 border-b py-1"
        style={{
          gridTemplateColumns: '1fr 70px 70px 85px 70px',
          borderColor: 'var(--border-default)',
        }}
      >
        <span style={{ fontFamily: 'var(--font-meta)', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
          Item / Vendor
        </span>
        <span style={{ fontFamily: 'var(--font-meta)', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', textAlign: 'right' }}>
          Qty
        </span>
        <span style={{ fontFamily: 'var(--font-meta)', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', textAlign: 'right' }}>
          Unit
        </span>
        <span style={{ fontFamily: 'var(--font-meta)', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', textAlign: 'right' }}>
          Status
        </span>
        <span style={{ fontFamily: 'var(--font-meta)', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', textAlign: 'right' }}>
          ETA
        </span>
      </div>

      {Object.entries(roomGroups).map(([roomName, roomItems]) => (
        <div key={roomName}>
          {/* Room label */}
          <div
            className="mt-3 mb-1"
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.62rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-clay)',
            }}
          >
            {roomName}
          </div>

          {/* Items */}
          {roomItems.map((item) => (
            <div
              key={item.id}
              className="grid items-center gap-2 border-b py-1.5"
              style={{
                gridTemplateColumns: '1fr 70px 70px 85px 70px',
                borderColor: 'rgba(229, 226, 221, 0.4)',
              }}
            >
              <div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                  {item.name}
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.68rem', fontStyle: 'italic', color: 'var(--color-aged-oak)' }}>
                  {item.vendor}{item.poNumber ? ` · ${item.poNumber}` : ''}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-meta)', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', textAlign: 'right' }}>
                {item.qty}
              </div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: '0.78rem', textAlign: 'right' }}>
                {typeof item.unitPrice === 'number' && item.unitPrice > 0
                  ? (item.status === 'quoted' ? '~' : '') + formatDollars(item.unitPrice)
                  : '—'}
              </div>
              <div className="text-right">
                <StatusBadge status={item.status} blocked={item.blocked} />
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-meta)',
                  fontSize: '0.58rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: item.blocked ? 'var(--color-terracotta)' : 'var(--text-muted)',
                  textAlign: 'right',
                }}
              >
                {item.blocked ? 'Decision' : item.eta ?? '—'}
              </div>
            </div>
          ))}
        </div>
      ))}

      <div className="mt-3 flex gap-2">
        <button
          className="rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 500 }}
        >
          + Add Item
        </button>
        <button
          className="rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 500 }}
        >
          Export FF&E Schedule
        </button>
        <button
          className="px-3 py-1.5 text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 500 }}
        >
          View Full Schedule
        </button>
      </div>
    </div>
  );
}
