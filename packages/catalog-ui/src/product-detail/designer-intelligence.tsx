'use client';

import { useProductEdit } from './product-edit-context';
import { TeachPanel } from '../components/teach-panel';
import { ScoreCircle } from '../components/score-circle';
import { SpectrumSlider } from '../components/spectrum-slider';
import { PortalButton } from '../components/portal-button';

export interface StyleSpectrum {
  leftLabel: string;
  rightLabel: string;
  value: number;
}

const DEFAULT_SPECTRUM: StyleSpectrum[] = [
  { leftLabel: 'Cold', rightLabel: 'Warm', value: 72 },
  { leftLabel: 'Minimal', rightLabel: 'Ornate', value: 35 },
  { leftLabel: 'Casual', rightLabel: 'Formal', value: 55 },
  { leftLabel: 'Trendy', rightLabel: 'Timeless', value: 85 },
  { leftLabel: 'Subtle', rightLabel: 'Statement', value: 60 },
];

interface DesignerIntelligenceProps {
  /** Portal supplies a teach-flow navigation callback (optional). */
  onTeach?: (productId: string) => void;
  /** Override the style spectrum values. */
  spectrum?: StyleSpectrum[];
  /** Label for this section (default "Designer Intelligence"). */
  title?: string;
  /** Badge text (default "Designer Only"). */
  badge?: string;
  /** Hide the whole zone. */
  hidden?: boolean;
}

export function DesignerIntelligence({
  onTeach,
  spectrum = DEFAULT_SPECTRUM,
  title = 'Designer Intelligence',
  badge = 'Designer Only',
  hidden = false,
}: DesignerIntelligenceProps) {
  const { mode, draft } = useProductEdit();
  const isEditable = mode === 'edit';

  if (hidden) return null;

  return (
    <div className="mb-8">
      <div className="mb-2 flex flex-col gap-1 py-4">
        <div className="h-[1.5px] w-[60px] rounded-sm bg-[var(--color-mocha)]" />
        <div className="h-[1.5px] w-12 rounded-sm bg-[var(--accent-primary)] opacity-70" />
        <div className="h-[1.5px] w-9 rounded-sm bg-[var(--accent-primary)] opacity-35" />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <h3 className="font-heading text-[1.4rem] font-normal text-[var(--text-primary)]">{title}</h3>
        {badge && (
          <span className="rounded-sm bg-[rgba(139,156,173,0.1)] px-2 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.06em] text-[var(--color-dusty-blue)]">
            {badge}
          </span>
        )}
      </div>

      {draft.aiScore !== undefined ? (
        <TeachPanel title="Aesthete Intelligence">
          <div className="mb-4 flex items-center justify-between">
            <span className="type-meta">Intelligence score based on teaching sessions</span>
            <ScoreCircle score={draft.aiScore} label="Score" size="sm" />
          </div>

          <div className="mb-4">
            <span className="mb-2 block font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--text-muted)]">
              Style Spectrum
            </span>
            {spectrum.map((s, i) => (
              <SpectrumSlider
                key={i}
                leftLabel={s.leftLabel}
                rightLabel={s.rightLabel}
                value={s.value}
                readOnly={!isEditable}
              />
            ))}
          </div>

          {isEditable && (
            <div className="rounded-md border border-[rgba(139,156,173,0.12)] bg-[rgba(139,156,173,0.04)] p-4">
              <span className="mb-2 block font-mono text-[0.58rem] uppercase tracking-[0.06em] text-[var(--color-dusty-blue)]">
                Aesthete Panel
              </span>
              <p className="mb-3 font-body text-[0.82rem] text-[var(--text-muted)]">
                Adjust spectrum sliders above to refine this product&apos;s style profile. Changes
                improve future matching recommendations.
              </p>
            </div>
          )}

          {onTeach && (
            <div className="mt-4">
              <PortalButton
                variant={isEditable ? 'primary' : 'secondary'}
                className="text-[0.78rem]"
                onClick={() => onTeach(draft.id)}
              >
                {isEditable ? 'Open Full Teaching' : 'Teach This Product'}
              </PortalButton>
            </div>
          )}
        </TeachPanel>
      ) : (
        <TeachPanel title="Aesthete Intelligence">
          <p className="mb-4 font-body text-[0.85rem] italic text-[var(--text-muted)]">
            This product hasn&apos;t been taught yet. Teaching adds style classification, client
            matching, and designer notes that improve future recommendations.
          </p>
          {onTeach && (
            <PortalButton
              variant="primary"
              className="text-[0.78rem]"
              onClick={() => onTeach(draft.id)}
            >
              Start Teaching
            </PortalButton>
          )}
        </TeachPanel>
      )}
    </div>
  );
}
