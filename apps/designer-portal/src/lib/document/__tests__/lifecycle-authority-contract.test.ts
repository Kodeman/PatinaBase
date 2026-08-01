import { readFileSync } from "fs";
import { join } from "path";

const srcRoot = join(__dirname, "..", "..", "..");
const draftOpener = readFileSync(
  join(
    srcRoot,
    "components",
    "document",
    "rooms",
    "drafting",
    "draft-proposal-opener.tsx",
  ),
  "utf8",
);
const projectHooks = readFileSync(
  join(srcRoot, "hooks", "use-projects.ts"),
  "utf8",
);

describe("document lifecycle authority wiring", () => {
  it("carries the chosen designer_clients row into an existing-household draft", () => {
    expect(draftOpener).toMatch(/designerClientId:\s*household\.id/);
    expect(draftOpener).toMatch(
      /createProposal\.mutateAsync\(\{[\s\S]*designerClientId/,
    );
  });

  it("routes UUID project completion through close_project with no direct completed update", () => {
    const completionHook = projectHooks.slice(
      projectHooks.indexOf("export function useCompleteProject"),
    );
    const completionBody = completionHook.slice(
      0,
      completionHook.indexOf("export function useCreateRFI"),
    );

    expect(completionBody).toMatch(/\.rpc\('close_project'/);
    expect(completionBody).not.toMatch(
      /\.from\('projects'\)[\s\S]*status:\s*'completed'/,
    );
  });
});
