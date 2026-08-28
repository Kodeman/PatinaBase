'use client';

/**
 * Style DNA (R51 / Track B) — the Aesthete Engine's read of a client, drawn
 * straight from the client row: `style_tags` → the chips, `inspiration_quote` →
 * the narrative note, and a palette derived from those tags against the studio's
 * `styles` taxonomy (`color_hex`) — never a parallel store, never fabricated.
 * When `style_preferences.palette` carries explicit swatches we honour those;
 * otherwise we colour-match the tags; otherwise the palette is omitted.
 *
 * Clients-only surface (makers/GCs/team have no Style DNA — the profile hides
 * this block for them). Prototype `.dna-*`. Zero shadows (D4).
 */

import { useMemo } from 'react';
import { useStyles } from '@patina/supabase';

/** Pull explicit hex swatches out of `style_preferences` if a designer stored
 *  them there (e.g. `{ palette: ['#C4A57B', …] }` or `{ colors: [...] }`). */
function explicitSwatches(prefs: Record<string, unknown> | null | undefined): string[] {
  if (!prefs) return [];
  const raw =
    (Array.isArray(prefs['palette']) && prefs['palette']) ||
    (Array.isArray(prefs['colors']) && prefs['colors']) ||
    (Array.isArray(prefs['swatches']) && prefs['swatches']) ||
    [];
  return (raw as unknown[])
    .filter((v): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v))
    .slice(0, 6);
}

export function StyleDna({
  tags,
  preferences,
  narrative,
}: {
  tags: string[];
  preferences: Record<string, unknown> | null;
  narrative: string | null;
}) {
  const { data: styles } = useStyles();

  // Palette: explicit swatches win; otherwise colour-match tags against the
  // taxonomy; if neither yields colours, omit the palette entirely.
  const palette = useMemo(() => {
    const explicit = explicitSwatches(preferences);
    if (explicit.length) return explicit;
    if (!styles?.length || !tags.length) return [];
    const byName = new Map<string, string>();
    for (const s of styles) {
      const hex = (s as { color_hex?: string | null }).color_hex;
      const name = (s as { name?: string | null }).name;
      if (hex && name) byName.set(name.trim().toLowerCase(), hex);
    }
    const matched: string[] = [];
    for (const t of tags) {
      const hex = byName.get(t.trim().toLowerCase());
      if (hex && !matched.includes(hex)) matched.push(hex);
    }
    return matched.slice(0, 6);
  }, [preferences, styles, tags]);

  const hasTags = tags.length > 0;
  const hasNarrative = Boolean(narrative?.trim());

  // Nothing real to show → render nothing (honest, no empty Style DNA shell).
  if (!hasTags && !hasNarrative && palette.length === 0) return null;

  return (
    <>
      <div className="mb-[0.7rem] mt-[1.3rem] font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)] first:mt-0">
        Style DNA · the Engine&rsquo;s read
      </div>

      {hasTags && (
        <div className="mb-[0.7rem] flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-[16px] border border-[rgba(196,165,123,0.3)] bg-[rgba(196,165,123,0.1)] px-[0.7rem] py-[0.32rem] text-[0.7rem] text-[var(--color-mocha)]"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {palette.length > 0 && (
        <div className="flex gap-1.5" aria-label="Style palette">
          {palette.map((c) => (
            <span
              key={c}
              title={c}
              className="h-[34px] w-[34px] rounded-[7px] border border-[var(--doc-ink-border)]"
              style={{ background: c }}
            />
          ))}
        </div>
      )}

      {hasNarrative && (
        <p className="mt-2 text-[0.68rem] italic leading-relaxed text-[var(--color-aged-oak)]">
          {narrative}
        </p>
      )}
    </>
  );
}
