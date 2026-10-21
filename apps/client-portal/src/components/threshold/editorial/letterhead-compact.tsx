"use client";

/* The House Issue's letterhead (PLAN §1 0–96 at 390; the top band's left at
   1440): the studio in 15px mono, the house as the page's h1 in Playfair
   24/28, and who the page is prepared for. Like the Doorplate it replaces
   under the edition it links nowhere and never dims; it keeps the Doorplate's
   ids so every reader of `#doorplate` still finds the house's name. */

export interface LetterheadCompactProps {
  studioName?: string | null;
  projectName: string;
  preparedFor?: string | null;
}

export function LetterheadCompact({
  studioName,
  projectName,
  preparedFor,
}: LetterheadCompactProps) {
  const studio = studioName?.trim();
  const addressee = preparedFor?.trim();
  return (
    <header id="doorplate" data-testid="doorplate" className="min-w-0">
      {studio ? (
        <p className="m-0 font-mono text-[15px] leading-[22px] text-[var(--text-body)]">
          {studio}
        </p>
      ) : null}
      <h1
        data-testid="doorplate-title"
        className="font-heading m-0 text-[24px] font-medium leading-[28px] text-[var(--text-primary)]"
      >
        {projectName}
      </h1>
      {addressee ? (
        <p className="m-0 text-[15px] leading-[22px] text-[var(--text-body)]">{`Prepared for ${addressee}`}</p>
      ) : null}
    </header>
  );
}
