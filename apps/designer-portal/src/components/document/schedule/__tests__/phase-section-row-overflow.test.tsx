import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { PhaseSection } from "../phase-section";
import type { ResolvedPhase } from "@patina/utils";

const phase = (id: string, start: string, end: string): ResolvedPhase => ({
  id,
  start,
  end,
  lane: "main",
  anchored: false,
  source: "chain",
  slackDays: 0,
  governingAnchorId: null,
  origin: "project-start",
});

function TwoPhaseRows() {
  const [openRowVerbs, setOpenRowVerbs] = useState<string | null>(null);
  return (
    <>
      <PhaseSection
        phase={phase("phase-a", "2026-08-01", "2026-08-10")}
        name="Design development"
        state="active"
        expanded
        onToggle={null}
        metaLine=""
        milestones={[]}
        items={[]}
        tasks={[]}
        parties={[]}
        clientName="Winky Loft"
        threads={[]}
        onOpenItem={() => {}}
        today="2026-08-14"
        headingActions={<button type="button">verb a</button>}
        openRowVerbs={openRowVerbs}
        onOpenRowVerbsChange={setOpenRowVerbs}
      />
      <PhaseSection
        phase={phase("phase-b", "2026-08-11", "2026-08-20")}
        name="Procurement"
        state="active"
        expanded
        onToggle={null}
        metaLine=""
        milestones={[]}
        items={[]}
        tasks={[]}
        parties={[]}
        clientName="Winky Loft"
        threads={[]}
        onOpenItem={() => {}}
        today="2026-08-14"
        headingActions={<button type="button">verb b</button>}
        openRowVerbs={openRowVerbs}
        onOpenRowVerbsChange={setOpenRowVerbs}
      />
    </>
  );
}

const glyphFor = (rowKey: string) =>
  screen.getByRole("button", { name: `More actions for ${rowKey}` });

describe("PhaseSection row-verb overflow", () => {
  it("always shows both glyphs, collapsed", () => {
    render(<TwoPhaseRows />);
    expect(glyphFor("Design development")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(glyphFor("Procurement")).toHaveAttribute("aria-expanded", "false");
  });

  it("expanding phase B's overflow collapses phase A's", () => {
    render(<TwoPhaseRows />);

    fireEvent.click(glyphFor("Design development"));
    expect(glyphFor("Design development")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "verb a" })).toBeInTheDocument();

    fireEvent.click(glyphFor("Procurement"));

    expect(glyphFor("Design development")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("button", { name: "verb a" })).toBeNull();
    expect(glyphFor("Procurement")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "verb b" })).toBeInTheDocument();
  });
});
