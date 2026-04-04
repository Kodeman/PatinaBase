'use client';

import { ProgressBar } from './progress-bar';

interface SectionStat {
  sectionType: string;
  totalSeconds: number;
  viewCount: number;
}

interface SectionEngagementProps {
  sections: SectionStat[];
  maxSeconds?: number;
}

function formatSectionLabel(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}:${sec.toString().padStart(2, '0')} total`;
}

export function SectionEngagement({ sections, maxSeconds }: SectionEngagementProps) {
  const max = maxSeconds || Math.max(...sections.map((s) => s.totalSeconds), 1);

  return (
    <div>
      {sections.map((section) => {
        const percent = Math.round((section.totalSeconds / max) * 100);

        return (
          <div key={section.sectionType} className="mb-6">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="type-label" style={{ fontSize: '0.85rem' }}>
                {formatSectionLabel(section.sectionType)}
              </span>
              <span className="type-meta-small">{formatTime(section.totalSeconds)}</span>
            </div>
            <ProgressBar progress={percent} />
          </div>
        );
      })}

      {sections.length === 0 && (
        <p
          className="py-4 text-center italic"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.82rem',
            color: 'var(--text-muted)',
          }}
        >
          No section views recorded yet.
        </p>
      )}
    </div>
  );
}
