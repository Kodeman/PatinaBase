export interface ContentsEntry<K extends string = string> {
  key: K;
  /** Printed folio, e.g. "01". Omitted for the cover row. */
  number?: string;
  label: string;
  /** The chapter's exact next act or reading, printed under the label. */
  subLabel?: string;
}

export interface ContentsMarginProps<K extends string = string> {
  /** Every chapter the paper can carry, in paper order. */
  entries: readonly ContentsEntry<K>[];
  /** `useDocumentRunningIndex().mountedKeys`: only these are listed. */
  mountedKeys: readonly K[];
  activeKey: K | null;
  onSelect: (key: K) => void;
  /** Accessible name of the contents navigation. */
  label?: string;
}

/**
 * The round-8 job contents: a sticky column from 1180px that lists only the
 * chapters mounted on the paper. Below 1180px it is not laid out at all; the
 * MobileSheets spine sheet carries the contents there.
 */
export function ContentsMargin<K extends string>({
  entries,
  mountedKeys,
  activeKey,
  onSelect,
  label = 'Job contents',
}: ContentsMarginProps<K>) {
  const listed = entries.filter((entry) => mountedKeys.includes(entry.key));
  if (listed.length === 0) return null;

  return (
    <aside
      data-contents-margin=""
      className="sticky top-[calc(var(--r8-head)+24px)] max-h-[calc(100dvh-(var(--r8-head)+24px))] overflow-y-auto hidden w-[var(--r8-contents)] self-start min-[1180px]:block"
    >
      <p className="t-authorship border-b border-[var(--ink)] pb-[12px] text-[var(--text-primary)]">
        In this job
      </p>
      <nav aria-label={label}>
        <ol>
          {listed.map((entry) => {
            const current = entry.key === activeKey;
            return (
              <li key={entry.key}>
                <button
                  type="button"
                  data-contents-entry={entry.key}
                  aria-current={current ? 'location' : undefined}
                  onClick={() => onSelect(entry.key)}
                  className={`relative block min-h-[44px] w-full border-b border-l-[length:var(--tick-stage)] border-b-[var(--hairline-strong)] py-[12px] pl-[24px] pr-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)] ${
                    current
                      ? 'border-l-[var(--color-forest)]'
                      : 'border-l-transparent'
                  }`}
                >
                  {entry.number ? (
                    <span
                      aria-hidden="true"
                      className="r8-small absolute left-[4px] top-[12px] text-[var(--text-muted)]"
                    >
                      {entry.number}
                    </span>
                  ) : null}
                  <span className="t-body-sm block text-[var(--text-primary)]">
                    {entry.label}
                  </span>
                  {entry.subLabel ? (
                    <span className="r8-small mt-[4px] block text-[var(--text-muted)]">
                      {entry.subLabel}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </aside>
  );
}
