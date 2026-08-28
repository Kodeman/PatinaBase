'use client';

/**
 * "Your Eye" v1 (Aesthete design §8.5.4, Wave 3B) — the designer's taste
 * profile made legible. Lives with the profile components; mounted from the
 * People Room's "Your Eye" rail view (`/people?view=your-eye`) since the R21
 * dissolve retired its original home, /portal/teaching/your-eye.
 *
 * The display contract, in order:
 *   1. Center of gravity — the six spectrum coordinates.
 *   2. Signature biases — named, with evidence; the designer confirms,
 *      softens/strengthens, or mutes via `update_my_biases` (a pure override
 *      layer — edits NEVER write back into the learned state).
 *   3. Confidence by style — learning / advanced / expert, in words.
 *   4. Deviation from house — framed positively: where your eye diverges is
 *      what makes you you.
 *
 * De-gamified (R32/R37): no badges, streaks, goals, or scores. Pre-learning
 * states are honest and quiet — never fake numbers. Copy law: "the Engine",
 * never "AI".
 */

import {
  useMyTasteProfile,
  useMySignatureBiases,
  useUpdateMyBiases,
  useMyStyleConfidence,
  nudgeBiasStrength,
  type SignatureBiasRow,
  type StyleConfidenceRow,
  type TasteProfileRow,
} from '@patina/supabase';

// ─── Vocabulary ──────────────────────────────────────────────────────────────

const SPECTRUM_POLES: Array<{
  key: 'warmth' | 'complexity' | 'formality' | 'timelessness' | 'boldness' | 'craftsmanship';
  left: string;
  right: string;
  /** Comparative phrasings for the deviation readout. */
  moreLeft: string;
  moreRight: string;
}> = [
  { key: 'warmth', left: 'Cool', right: 'Warm', moreLeft: 'cooler', moreRight: 'warmer' },
  { key: 'complexity', left: 'Minimal', right: 'Ornate', moreLeft: 'more minimal', moreRight: 'more ornate' },
  { key: 'formality', left: 'Casual', right: 'Formal', moreLeft: 'more casual', moreRight: 'more formal' },
  { key: 'timelessness', left: 'Trendy', right: 'Timeless', moreLeft: 'trendier', moreRight: 'more timeless' },
  { key: 'boldness', left: 'Subtle', right: 'Statement', moreLeft: 'subtler', moreRight: 'bolder' },
  { key: 'craftsmanship', left: 'Industrial', right: 'Artisan', moreLeft: 'more industrial', moreRight: 'more artisan' },
];

const LEVEL_WORDS: Record<StyleConfidenceRow['level'], string> = {
  learning: 'still learning',
  advanced: 'advanced',
  expert: 'expert',
};

/** Human phrasing for a deviation key: spectrum keys get pole words. */
function deviationPhrase(key: string, value: number): string {
  const pole = SPECTRUM_POLES.find((p) => p.key === key);
  if (pole) return `${value > 0 ? pole.moreRight : pole.moreLeft} than the house`;
  const label = key.replace(/^[a-z_]+:/, '').replace(/_/g, ' ');
  return value > 0 ? `leans into ${label}` : `leans away from ${label}`;
}

/** Defensive evidence chips — 4B settles the jsonb shape; render what's here. */
function evidenceChips(evidence: Record<string, unknown> | null): string[] {
  if (!evidence) return [];
  const chips: string[] = [];
  for (const [key, value] of Object.entries(evidence)) {
    if (Array.isArray(value)) {
      if (value.length && typeof value[0] === 'string' && !/^[0-9a-f-]{36}$/i.test(value[0])) {
        for (const v of value.slice(0, 2)) chips.push(String(v));
      } else if (value.length) {
        chips.push(`${value.length} ${key.replace(/_/g, ' ')}`);
      }
    } else if (typeof value === 'string' && value.length < 80) {
      chips.push(value);
    } else if (typeof value === 'number') {
      chips.push(`${value} ${key.replace(/_/g, ' ')}`);
    }
  }
  return chips.slice(0, 4);
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export function YourEyePanel() {
  const { data: profile, isLoading: profileLoading } = useMyTasteProfile();
  const { data: biases, isLoading: biasesLoading } = useMySignatureBiases();
  const { data: confidence, isLoading: confidenceLoading } = useMyStyleConfidence();
  const updateBiases = useUpdateMyBiases();

  if (profileLoading || biasesLoading || confidenceLoading) {
    return (
      <p className="py-12 text-center font-body text-[0.85rem] italic text-[var(--text-muted)]">
        Reading your eye…
      </p>
    );
  }

  const hasCenter =
    !!profile && SPECTRUM_POLES.some((p) => typeof profile[p.key] === 'number');
  const sources = profile?.sources ?? null;
  const judgments = sources?.judgments ?? 0;
  const corrections = sources?.corrections ?? 0;
  const portfolio = sources?.portfolio_items ?? 0;

  return (
    <div className="max-w-[720px] space-y-10">
      {/* Honest provenance line — counts are state, not scores. */}
      <p className="font-body text-[0.8rem] italic text-[var(--text-muted)]">
        {judgments + corrections + portfolio > 0 ? (
          <>
            Learned from {judgments} {judgments === 1 ? 'pair' : 'pairs'} weighed
            {corrections > 0 && <>, {corrections} {corrections === 1 ? 'correction' : 'corrections'}</>}
            {portfolio > 0 && <>, {portfolio} portfolio {portfolio === 1 ? 'piece' : 'pieces'}</>}
            . It keeps learning as you teach.
          </>
        ) : (
          <>Your eye is still being learned from your teaching. Weigh a few pairs and it starts to take shape.</>
        )}
      </p>

      {profile?.drift_flag && (
        <p className="border-l-2 border-[var(--color-clay,#C4A57B)] pl-3 font-body text-[0.8rem] text-[var(--text-primary)]">
          Your eye is shifting — recent choices lean differently than last year&apos;s. The Engine
          is following the newer you.
        </p>
      )}

      {/* 1. Center of gravity */}
      <section>
        <SectionHead title="Center of gravity" note="Where your choices settle, across the six dimensions." />
        {hasCenter && profile ? (
          <div className="mt-4 space-y-3.5">
            {SPECTRUM_POLES.map((pole) => (
              <GravityRow key={pole.key} pole={pole} value={profile[pole.key]} />
            ))}
          </div>
        ) : (
          <EmptyLine text="Not settled yet — it takes shape from your judgments and portfolio." />
        )}
      </section>

      {/* 2. Signature biases */}
      <section>
        <SectionHead
          title="Signature moves"
          note="Named leans the Engine has noticed. Confirm the true ones, soften or mute the rest — your edits never rewrite what was learned."
        />
        {biases && biases.length > 0 ? (
          <ul className="mt-4 space-y-4">
            {biases.map((bias) => (
              <BiasRow
                key={bias.id}
                bias={bias}
                pending={updateBiases.isPending}
                onUpdate={(override) => updateBiases.mutate([{ id: bias.id, ...override }])}
              />
            ))}
          </ul>
        ) : (
          <EmptyLine text="None named yet — signature moves emerge once your judgments accumulate." />
        )}
      </section>

      {/* 3. Confidence by style */}
      <section>
        <SectionHead title="Confidence by style" note="How settled your eye is, style by style." />
        {confidence && confidence.length > 0 ? (
          <ul className="mt-4 space-y-1.5">
            {confidence.map((row) => (
              <li key={row.style_id} className="flex items-baseline justify-between border-b border-[var(--border-subtle,var(--color-pearl))] pb-1.5">
                <span className="font-body text-[0.85rem] text-[var(--text-primary)]">
                  {row.style?.name ?? 'Style'}
                </span>
                <span className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {LEVEL_WORDS[row.level] ?? row.level}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyLine text="Nothing measured yet — this fills in as your teaching meets validation." />
        )}
      </section>

      {/* 4. Deviation from house */}
      <section>
        <SectionHead
          title="Where you diverge from the house"
          note="That divergence is the point — it's what makes you you."
        />
        <DeviationList profile={profile ?? null} />
      </section>
    </div>
  );
}

// ─── Bits ────────────────────────────────────────────────────────────────────

function SectionHead({ title, note }: { title: string; note: string }) {
  return (
    <div>
      <h2 className="font-heading text-[1.15rem] font-medium text-[var(--text-primary)]">{title}</h2>
      <p className="mt-0.5 font-body text-[0.76rem] text-[var(--text-muted)]">{note}</p>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="mt-4 font-body text-[0.8rem] italic text-[var(--text-muted)]">{text}</p>;
}

function GravityRow({
  pole,
  value,
}: {
  pole: { key: string; left: string; right: string };
  value: number | null;
}) {
  const pct = value == null ? null : ((value + 1) / 2) * 100;
  return (
    <div>
      <div className="flex justify-between font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
        <span>{pole.left}</span>
        <span>{pole.right}</span>
      </div>
      <div className="relative mt-1 h-[2px] w-full bg-[var(--border-subtle,var(--color-pearl))]">
        {pct != null ? (
          <span
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-charcoal,#2C2926)]"
            style={{ left: `${pct}%` }}
          />
        ) : (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-[11px] text-[var(--text-muted)]">
            —
          </span>
        )}
      </div>
    </div>
  );
}

function BiasRow({
  bias,
  pending,
  onUpdate,
}: {
  bias: SignatureBiasRow;
  pending: boolean;
  onUpdate: (override: {
    status?: 'confirmed' | 'edited' | 'muted';
    displayed_strength?: number;
  }) => void;
}) {
  const muted = bias.status === 'muted';
  const chips = evidenceChips(bias.evidence);

  return (
    <li className={`border-l-2 pl-3 ${muted ? 'border-[var(--border-subtle,var(--color-pearl))] opacity-60' : 'border-[var(--color-clay,#C4A57B)]'}`}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-heading text-[0.98rem] font-medium text-[var(--text-primary)]">
          {bias.name}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          {bias.status === 'proposed' ? 'the Engine proposes' : bias.status}
        </span>
      </div>
      {bias.description && (
        <p className="mt-0.5 font-body text-[0.8rem] text-[var(--text-muted)]">{bias.description}</p>
      )}
      {chips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {chips.map((chip, i) => (
            <span
              key={i}
              className="rounded-full border border-[var(--border-subtle,var(--color-pearl))] px-2 py-0.5 font-body text-[0.68rem] text-[var(--text-muted)]"
            >
              {chip}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-3">
        {muted ? (
          <BiasAction label="Bring it back" disabled={pending} onClick={() => onUpdate({ status: 'confirmed' })} />
        ) : (
          <>
            {bias.status === 'proposed' && (
              <BiasAction label="That's me" disabled={pending} onClick={() => onUpdate({ status: 'confirmed' })} />
            )}
            <BiasAction
              label="Softer"
              disabled={pending}
              onClick={() =>
                onUpdate({
                  status: 'edited',
                  displayed_strength: nudgeBiasStrength(bias.learned_strength, bias.displayed_strength, 'softer'),
                })
              }
            />
            <BiasAction
              label="Stronger"
              disabled={pending}
              onClick={() =>
                onUpdate({
                  status: 'edited',
                  displayed_strength: nudgeBiasStrength(bias.learned_strength, bias.displayed_strength, 'stronger'),
                })
              }
            />
            <BiasAction label="Not me" disabled={pending} onClick={() => onUpdate({ status: 'muted' })} />
          </>
        )}
      </div>
    </li>
  );
}

function BiasAction({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--text-muted)] underline decoration-[var(--border-subtle,var(--color-pearl))] underline-offset-2 hover:text-[var(--text-primary)] disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function DeviationList({ profile }: { profile: TasteProfileRow | null }) {
  const deviation = profile?.deviation_from_house;
  const entries = deviation
    ? Object.entries(deviation)
        .filter(([, v]) => typeof v === 'number' && Math.abs(v) >= 0.15)
        .sort(([, a], [, b]) => Math.abs(b as number) - Math.abs(a as number))
        .slice(0, 6)
    : [];

  if (entries.length === 0) {
    return <EmptyLine text="Nothing measured yet — divergence shows once your eye and the house are both on record." />;
  }

  return (
    <ul className="mt-4 space-y-1.5">
      {entries.map(([key, value]) => (
        <li key={key} className="font-body text-[0.85rem] text-[var(--text-primary)]">
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {key.replace(/^[a-z_]+:/, '').replace(/_/g, ' ')}
          </span>{' '}
          — {deviationPhrase(key, value as number)}
        </li>
      ))}
    </ul>
  );
}
