/**
 * R9's line, on the face of every schedule part.
 *
 * Fifteen variants: six create billing authority, `procurement` creates it
 * through its deposit percent alone, and the remaining eight are record only.
 * The list is `AUTHORITY_VARIANTS` from `@patina/types` — the chip reads it,
 * never re-declares it — so this spec walks the whole vocabulary rather than a
 * copy of it.
 */

import { render, screen } from "@testing-library/react";
import { AGREEMENT_SCHEDULE_VARIANTS, AUTHORITY_VARIANTS } from "@patina/types";
import { AuthorityChip } from "../schedules/authority-chip";
import { authorityStanding, RECORD_ONLY_HELP } from "../schedules";

const RECORD_ONLY = [
  "percent_of_cost",
  "percent_of_spend",
  "cost_plus",
  "day_rate",
  "package",
  "pricing_basis",
  "draws",
  "allowances",
] as const;

describe("the authority chip", () => {
  it("says `creates authority` for each of R9's six", () => {
    expect(AUTHORITY_VARIANTS).toHaveLength(6);
    for (const variant of AUTHORITY_VARIANTS) {
      const { unmount } = render(<AuthorityChip variant={variant} />);
      expect(screen.getByText("creates authority")).toBeInTheDocument();
      unmount();
    }
  });

  it("says `creates authority · deposit only` for procurement", () => {
    render(<AuthorityChip variant="procurement" />);
    expect(
      screen.getByText("creates authority · deposit only"),
    ).toBeInTheDocument();
  });

  it("says `record only` for each of the eight", () => {
    expect(RECORD_ONLY).toHaveLength(8);
    for (const variant of RECORD_ONLY) {
      const { unmount } = render(<AuthorityChip variant={variant} />);
      expect(screen.getByText("record only")).toBeInTheDocument();
      unmount();
    }
  });

  it("accounts for every variant in the vocabulary, and no more", () => {
    expect(AGREEMENT_SCHEDULE_VARIANTS).toHaveLength(15);
    const counted = new Set<string>([
      ...AUTHORITY_VARIANTS,
      "procurement",
      ...RECORD_ONLY,
    ]);
    expect([...AGREEMENT_SCHEDULE_VARIANTS].sort()).toEqual(
      [...counted].sort(),
    );
  });

  it("wears the quieter ink only when the part is record only", () => {
    const { container: authority } = render(<AuthorityChip variant="flat" />);
    expect(authority.firstChild).toHaveClass("text-[var(--color-charcoal)]");

    const { container: recorded } = render(
      <AuthorityChip variant="cost_plus" />,
    );
    expect(recorded.firstChild).toHaveClass("text-[var(--ink-subtle)]");
  });

  it("answers `record-only` for a variant it has never heard of", () => {
    expect(authorityStanding("something_a_later_wave_mints")).toBe(
      "record-only",
    );
    expect(authorityStanding(null)).toBe("record-only");
    expect(authorityStanding(undefined)).toBe("record-only");
  });

  it("carries one sentence of help, and no tooltip or link", () => {
    expect(RECORD_ONLY_HELP).toBe(
      "This is recorded on the agreement. It does not create billing authority yet.",
    );
  });
});
