import type { MockRoom } from '@/types/project-ui';
import { ProgressBar } from '@/components/portal/progress-bar';

interface RoomScopeGridProps {
  rooms: MockRoom[];
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function RoomCard({ room }: { room: MockRoom }) {
  return (
    <div
      className="mb-3 rounded-md border p-4 transition-colors hover:border-[var(--color-clay)]"
      style={{ borderColor: 'var(--border-default)' }}
    >
      {/* Header row */}
      <div className="mb-2.5 flex items-center justify-between">
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-primary)' }}>
            {room.name}
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {room.dimensions} · {room.notes}
          </div>
        </div>
        <div className="text-right">
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1rem' }}>
            {formatDollars(room.budget)}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.58rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-muted)',
            }}
          >
            {room.itemCount} items · {room.orderedCount} ordered
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-2" style={{ height: '4px' }}>
        <ProgressBar progress={room.progress} />
      </div>

      {/* Item tags */}
      <div className="flex flex-wrap gap-1.5">
        {room.itemNames.map((name) => (
          <span
            key={name}
            className="inline-flex whitespace-nowrap rounded-sm border px-2.5 py-1"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.62rem',
              fontWeight: 500,
              color: 'var(--text-body)',
              borderColor: 'var(--border-default)',
              background: 'var(--bg-primary)',
            }}
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RoomScopeGrid({ rooms }: RoomScopeGridProps) {
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
        Project Scope by Room
      </h3>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Each room has its own FF&E schedule, budget allocation, and progress tracker
      </div>

      {rooms.map((room) => (
        <RoomCard key={room.id} room={room} />
      ))}

      <div className="mt-2">
        <button
          className="rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 500 }}
        >
          + Add Room to Scope
        </button>
      </div>
    </div>
  );
}
