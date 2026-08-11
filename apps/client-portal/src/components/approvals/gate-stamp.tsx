/* Gate stamp — the client-scale seal/hold marks from the gate ceremony
   (Ruling VIII, folio 13, mockup M8). Same inspection-tag grammar the spine
   already uses for a stage stamp (`StatusStamp` in making/tracking-row.tsx):
   a doubled border, low-opacity ink, a couple of degrees off square, one
   line of mono caps. No shadow, no fill — depth is value contrast only.

   Two variants: `seal` marks an approved gate and may settle into place
   (`settle`); `hold` marks a gate the client chose to keep open pending
   discussion — drawn deliberately as loud as the seal, per M8's own note
   that a holding gate must never read as a soft approval. */

const INK_BY_VARIANT = {
  seal: "var(--color-mocha)",
  hold: "var(--color-clay)",
} as const;

export type GateStampVariant = keyof typeof INK_BY_VARIANT;

export function GateStamp({
  label,
  variant,
  settle = false,
  "data-testid": testId,
}: {
  label: string;
  variant: GateStampVariant;
  /** Plays a brief settle-in on mount; stilled under prefers-reduced-motion. */
  settle?: boolean;
  "data-testid"?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-testid={testId}
      data-gate-stamp-variant={variant}
      className={[
        "relative inline-block shrink-0 -rotate-[2deg] rounded-[2px] border-[1.5px] border-current px-3 pb-[7px] pt-2 text-center opacity-[0.88]",
        settle ? "gate-seal-settle" : "",
      ].join(" ")}
      style={{ color: INK_BY_VARIANT[variant] }}
    >
      <span className="pointer-events-none absolute inset-[2.5px] rounded-[1px] border border-current opacity-[0.42]" />
      <span className="relative block whitespace-nowrap font-mono text-xs font-bold uppercase tracking-[0.18em]">
        {label}
      </span>
    </span>
  );
}
