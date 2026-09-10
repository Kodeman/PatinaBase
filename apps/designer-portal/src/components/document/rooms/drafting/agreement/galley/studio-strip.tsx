"use client";

/**
 * The studio's own voice, set outside the paper at every width (NO-4).
 *
 * A marginal note, a rest row for a part the paper does not print, and the
 * sentences readiness is holding a part on. `--rail` ground, a 2px
 * `--clay-ink` leading rule, a `THE STUDIO` running head — never the paper's
 * ground, never inline in the paper's flow.
 *
 * Below 1248 a strip whose whole payload is a part's name and its standing
 * says nothing the paper has not already said, so it does not print; the
 * standings gather into one run below the paper instead.
 */

export function StudioStrip({
  label,
  name,
  nameId,
  beside,
  standing,
  quiet = false,
  children,
}: {
  /** The landmark's name — "The studio · Role rates". */
  label: string;
  name: string;
  nameId?: string;
  /** The id of the part section this note is about. At 1440 the strip is set
   *  beside it in the margin; the top is measured, because a marginal note
   *  cannot be laid out by CSS against a sibling it is not a child of. */
  beside: string;
  standing?: string | null;
  /** Nothing here but the name and the standing. */
  quiet?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <aside
      className={quiet ? "g-strip g-strip--quiet" : "g-strip"}
      aria-label={label}
      data-beside={beside}
    >
      <div className="studio-note">
        <span className="t-head head">The studio</span>
        <p className="t-head g-strip__part" id={nameId}>
          {name}
        </p>
        {standing && <p className="t-head g-strip__standing">{standing}</p>}
        {children}
      </div>
    </aside>
  );
}

/** The standings, gathered — one run below the paper, below 1248 only. */
export function StudioRun({
  standings,
}: {
  standings: { standing: string; names: string[] }[];
}) {
  if (standings.length === 0) return null;
  return (
    <aside
      className="g-strip g-studio-run"
      aria-label="The studio · what these parts do"
    >
      <div className="studio-note">
        <span className="t-head head">The studio</span>
        {standings.map((row) => (
          <div key={row.standing}>
            <p className="t-head g-strip__standing">{row.standing}</p>
            <p className="t-body-sm">{row.names.join(" · ")}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
