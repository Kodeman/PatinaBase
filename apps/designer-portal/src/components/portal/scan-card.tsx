'use client';

/**
 * ScanCard — compact grid card used in the client-profile page's
 * "Room Scans" section.
 */

function qualityGradeColor(grade: string | null): string {
  if (grade === 'excellent') return 'var(--color-sage)';
  if (grade === 'good') return 'var(--color-dusty-blue)';
  if (grade === 'fair') return 'var(--color-golden-hour)';
  return 'var(--text-muted)';
}

export interface ScanCardScan {
  id: string;
  name: string;
  thumbnail_url: string | null;
  room_type: string | null;
  quality_grade: string | null;
}

export function ScanCard({ scan }: { scan: ScanCardScan }) {
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: '6px',
        overflow: 'hidden',
        border: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
        aspectRatio: '4/3',
      }}
    >
      {scan.thumbnail_url ? (
        <img
          src={scan.thumbnail_url}
          alt={scan.name}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-meta)',
            fontSize: '0.6rem',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {scan.room_type || 'Scan'}
        </div>
      )}

      {/* Overlay: name + grade */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '0.35rem 0.5rem',
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.55rem',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'rgba(255,255,255,0.85)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {scan.name}
        </span>
        {scan.quality_grade && (
          <span
            data-testid="quality-grade-badge"
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.5rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: qualityGradeColor(scan.quality_grade),
              flexShrink: 0,
              marginLeft: '0.5rem',
            }}
          >
            {scan.quality_grade}
          </span>
        )}
      </div>
    </div>
  );
}
