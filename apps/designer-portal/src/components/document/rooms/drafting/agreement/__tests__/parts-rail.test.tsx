import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AgreementPart } from "@patina/types";
import { PartsRail } from "../parts-rail";

let seq = 0;
function part(
  input: Partial<AgreementPart> & { partKey: string },
): AgreementPart {
  seq += 1;
  return {
    id: input.id ?? `part-${seq}`,
    proposalId: "agreement-1",
    position: input.position ?? seq,
    kind: input.kind ?? "clause",
    variant: input.variant ?? null,
    title: input.title ?? "Part",
    payload: input.payload ?? {},
    required: input.required ?? false,
    clientVisible: input.clientVisible ?? true,
    sourceTemplateKey: null,
    sourcePartId: null,
    updatedAt: null,
    partKey: input.partKey,
  };
}

const four = () => [
  part({ partKey: "patina.services", title: "Services", required: true }),
  part({ partKey: "patina.exclusions", title: "Exclusions", kind: "list" }),
  part({
    partKey: "patina.ceiling",
    title: "Ceiling",
    kind: "schedule",
    variant: "ceiling",
  }),
  part({ partKey: "patina.terms", title: "Terms", required: true }),
];

/** A host that owns the list, exactly as the composer does — the rail itself
 *  never writes, so reordering has to be observed through its caller. */
function Host({
  initial,
  blockedIds = new Set<string>(),
  readOnly = false,
  onRemove,
  onRename,
  onAdd,
}: {
  initial: AgreementPart[];
  blockedIds?: Set<string>;
  readOnly?: boolean;
  onRemove?: (id: string) => void;
  onRename?: (id: string, title: string) => void;
  onAdd?: (input: unknown) => void;
}) {
  const [parts, setParts] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(
    initial[0]?.id ?? null,
  );
  return (
    <PartsRail
      parts={parts}
      selectedId={selectedId}
      blockedIds={blockedIds}
      readOnly={readOnly}
      onSelect={setSelectedId}
      onReorder={(from, to) =>
        setParts((current) => {
          const next = [...current];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          return next;
        })
      }
      onRename={(id, title) => {
        onRename?.(id, title);
        setParts((current) =>
          current.map((p) => (p.id === id ? { ...p, title } : p)),
        );
      }}
      onRemove={(id) => {
        onRemove?.(id);
        setParts((current) => current.filter((p) => p.id !== id));
      }}
      onAdd={(input) => onAdd?.(input)}
    />
  );
}

const rows = () =>
  within(screen.getByRole("navigation", { name: "Agreement parts" }))
    .getAllByRole("listitem")
    .map((row) => row.textContent ?? "");

const openMenu = (title: string) =>
  fireEvent.click(
    screen.getByRole("button", { name: `Part options for ${title}` }),
  );

beforeEach(() => {
  seq = 0;
});

describe("PartsRail", () => {
  it("lists every part in the order it was given", () => {
    render(<Host initial={four()} />);
    expect(rows().map((row) => row.replace(/\s+/g, " "))).toEqual([
      expect.stringContaining("Services"),
      expect.stringContaining("Exclusions"),
      expect.stringContaining("Ceiling"),
      expect.stringContaining("Terms"),
    ]);
  });

  it("Move up on row 3 puts it at row 2", () => {
    render(<Host initial={four()} />);
    openMenu("Ceiling");
    fireEvent.click(screen.getByRole("button", { name: "Move up" }));
    expect(rows()[1]).toContain("Ceiling");
    expect(rows()[2]).toContain("Exclusions");
  });

  it("Move up is unavailable on the first row, Move down on the last", () => {
    render(<Host initial={four()} />);
    openMenu("Services");
    expect(screen.getByRole("button", { name: "Move up" })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Part options for Services" }),
    );
    openMenu("Terms");
    expect(screen.getByRole("button", { name: "Move down" })).toBeDisabled();
  });

  it("offers Remove on a required part — readiness is what refuses, not the rail", () => {
    const onRemove = jest.fn();
    render(<Host initial={four()} onRemove={onRemove} />);
    openMenu("Services");
    const remove = screen.getByRole("button", { name: "Remove" });
    expect(remove).toBeEnabled();
    fireEvent.click(remove);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(rows()).toHaveLength(3);
    expect(rows().join(" ")).not.toContain("Services");
  });

  it("renames on Enter and abandons on Escape", () => {
    const onRename = jest.fn();
    render(<Host initial={four()} onRename={onRename} />);

    openMenu("Exclusions");
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    let field = screen.getByRole("textbox", { name: "Rename Exclusions" });
    fireEvent.change(field, { target: { value: "Not included" } });
    fireEvent.keyDown(field, { key: "Escape" });
    expect(onRename).not.toHaveBeenCalled();
    expect(rows().join(" ")).toContain("Exclusions");

    openMenu("Exclusions");
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    field = screen.getByRole("textbox", { name: "Rename Exclusions" });
    fireEvent.change(field, { target: { value: "Not included" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith(expect.any(String), "Not included");
  });

  it("marks a blocked row without a colour, a badge or a count", () => {
    const parts = four();
    render(<Host initial={parts} blockedIds={new Set([parts[3].id])} />);
    const terms = within(
      screen.getByRole("navigation", { name: "Agreement parts" }),
    ).getAllByRole("listitem")[3];
    expect(within(terms).getByText("needs attention")).toBeInTheDocument();
    const services = within(
      screen.getByRole("navigation", { name: "Agreement parts" }),
    ).getAllByRole("listitem")[0];
    expect(within(services).queryByText("needs attention")).toBeNull();
  });

  it("names the variants that will create authority", () => {
    render(<Host initial={four()} />);
    expect(rows()[2]).toContain("creates authority");
    expect(rows()[0]).not.toContain("creates authority");
  });

  it("selects a part when its row is clicked", () => {
    render(<Host initial={four()} />);
    const exclusions = within(
      screen.getByRole("navigation", { name: "Agreement parts" }),
    ).getAllByRole("listitem")[1];
    const select = within(exclusions)
      .getAllByRole("button")
      .find((node) => node.textContent?.includes("Exclusions"))!;
    expect(select).not.toHaveAttribute("aria-current");
    fireEvent.click(select);
    expect(select).toHaveAttribute("aria-current", "true");
  });

  it("offers a keyboard-reachable drag handle for every row", () => {
    render(<Host initial={four()} />);
    expect(
      screen.getByRole("button", { name: "Reorder Services" }),
    ).toBeEnabled();
    expect(screen.getAllByRole("button", { name: /^Reorder / })).toHaveLength(
      4,
    );
  });

  it("offers nothing to change once composition is frozen", () => {
    render(<Host initial={four()} readOnly />);
    expect(
      screen.queryByRole("button", { name: "+ Add a part" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Part options for/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reorder Services" }),
    ).toBeDisabled();
  });

  it("offers blank kinds only — no Library, no Save as template", () => {
    const onAdd = jest.fn();
    render(<Host initial={four()} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add a part" }));
    expect(screen.getByRole("button", { name: "Clause" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "List" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Role rates" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Library/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Save as template/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Flat fee" }));
    expect(onAdd).toHaveBeenCalledWith({ kind: "schedule", variant: "flat" });
  });

  // R18 — an agreement carries only one of each money part, so the menu does
  // not offer a second one. `four()` already holds a Ceiling.
  it("does not offer a money part the agreement already carries", () => {
    render(<Host initial={four()} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add a part" }));
    expect(
      screen.queryByRole("button", { name: "Ceiling" }),
    ).not.toBeInTheDocument();
    // The other four money parts are still on offer, and so are the two the
    // rule does not cover.
    for (const label of [
      "Role rates",
      "Retainer",
      "Billing cadence",
      "Furnishings deposit",
      "Flat fee",
      "Fee by phase",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("offers a money part again once it is removed", () => {
    render(
      <Host initial={four().filter((p) => p.partKey !== "patina.ceiling")} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Add a part" }));
    expect(screen.getByRole("button", { name: "Ceiling" })).toBeInTheDocument();
  });

  it("says so when an agreement has no parts at all", () => {
    render(<Host initial={[]} />);
    expect(
      screen.getByText("This agreement has no parts yet."),
    ).toBeInTheDocument();
  });
});
