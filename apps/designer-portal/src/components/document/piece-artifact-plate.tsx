"use client";

type ConfigurationSelection = {
  groupName: string;
  valueLabel: string;
};

type PieceArtifactItem = {
  name: string;
  quantity?: number | null;
  product?: unknown;
  spec?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

function configurationSelections(
  item: PieceArtifactItem,
): ConfigurationSelection[] {
  const rawSpec = Array.isArray(item.spec) ? item.spec[0] : item.spec;
  const spec = isRecord(rawSpec) ? rawSpec : null;
  const snapshot = isRecord(spec?.configuration_snapshot)
    ? spec.configuration_snapshot
    : null;
  const selections: unknown[] = Array.isArray(snapshot?.selections)
    ? snapshot.selections
    : [];

  return selections.flatMap((selection) => {
    if (!isRecord(selection)) return [];
    const groupName = text(selection.groupName);
    const valueLabel = text(selection.valueLabel);
    return groupName && valueLabel ? [{ groupName, valueLabel }] : [];
  });
}

export function PieceArtifactPlate({ item }: { item: PieceArtifactItem }) {
  const product = isRecord(item.product) ? item.product : null;
  const brand = text(product?.brand);
  const productImages = Array.isArray(product?.images) ? product.images : [];
  const imageUrl = productImages.map(text).find(Boolean) ?? null;
  const selections = configurationSelections(item);
  const visibleSelections = selections.slice(0, 4);
  const remainingSelections = selections.length - visibleSelections.length;
  const imageAlt = brand ? `${item.name} by ${brand}` : item.name;

  return (
    <figure className="mb-4 border-y border-[var(--color-pearl)] border-l-[5px] border-l-[var(--color-aged-oak)] bg-[rgba(252,250,246,0.72)] p-3 sm:p-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(150px,0.72fr)_minmax(0,1.28fr)] sm:items-stretch">
        <div className="flex min-h-40 items-center justify-center overflow-hidden border border-[var(--color-pearl)] bg-[rgba(255,255,255,0.64)] sm:min-h-44">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={imageAlt}
              loading="lazy"
              decoding="async"
              className="h-full max-h-64 w-full object-cover"
            />
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)]">
                Image not on file
              </p>
              <p className="mt-2 font-heading text-[18px] italic leading-snug text-[var(--color-charcoal)]">
                {item.name}
              </p>
            </div>
          )}
        </div>

        <figcaption className="flex min-w-0 flex-col border-t border-[var(--color-aged-oak)] pt-3 sm:border-t-0 sm:pt-0">
          <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)]">
            Piece in hand
          </p>
          <h3 className="mt-1 font-heading text-[23px] font-medium leading-[1.08] text-[var(--color-charcoal)]">
            {item.name}
            {(item.quantity ?? 0) > 1 ? ` · ×${item.quantity}` : ""}
          </h3>
          <p className="mt-1.5 text-[14px] text-[var(--text-muted)]">
            <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
              Maker
            </span>{" "}
            · {brand ?? "Not recorded"}
          </p>

          <div className="mt-4 border-t border-dashed border-[var(--color-pearl)] pt-3">
            <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
              Specification
            </p>
            {visibleSelections.length > 0 ? (
              <dl className="mt-1.5 grid gap-x-4 gap-y-1.5 min-[540px]:grid-cols-2">
                {visibleSelections.map((selection) => (
                  <div
                    key={`${selection.groupName}:${selection.valueLabel}`}
                    className="border-b border-[var(--color-pearl)] pb-1"
                  >
                    <dt className="font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                      {selection.groupName}
                    </dt>
                    <dd className="text-[14px] leading-snug text-[var(--color-charcoal)]">
                      {selection.valueLabel}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-1.5 text-[14px] italic text-[var(--text-muted)]">
                Configuration not recorded on this line.
              </p>
            )}
            {remainingSelections > 0 && (
              <p className="mt-2 font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                + {remainingSelections} more in spec details
              </p>
            )}
          </div>
        </figcaption>
      </div>
    </figure>
  );
}
