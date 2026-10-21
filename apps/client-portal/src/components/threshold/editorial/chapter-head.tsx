export interface ChapterHeadProps {
  /** "05" */
  number: string;
  /** "Living room" */
  label: string;
  headline: string;
  headingId?: string;
}

/** Bare numeral and eyebrow in DM Mono, the studio's headline in Playfair. */
export function ChapterHead({ number, label, headline, headingId }: ChapterHeadProps) {
  return (
    <div className="ed-chapter-head">
      <p className="ed-eyebrow">
        <span className="ed-numeral">{number}</span> · {label}
      </p>
      <h2 id={headingId} className="ed-chapter-head__title">
        {headline}
      </h2>
    </div>
  );
}
