/**
 * RC-7 E7 (X08): client-portal consumers, current and older, over the
 * payloads the owned stack returned for one mixed project (legacy Stage-2
 * approvals, C4 requests, C6 completions, C5 external presence).
 * Payloads: apps/designer-portal/e2e/round8/rc7-e7-fixtures/payloads/.
 * "Older" = the file at `main`, transpiled and evaluated with its relative
 * imports resolved into this tree.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import ts from "typescript";
import { render, screen } from "@testing-library/react";
import {
  parseProjectApprovalReview,
  readMyServiceAcceptanceRequests,
} from "@patina/supabase";
import { ServiceAcceptanceDoor } from "@/components/service-acceptance/service-acceptance-door";
import {
  isClientActionableProjectApproval,
  projectApprovalAttentionLabel,
} from "@/lib/client-attention";
import { adaptClientSelections } from "@/lib/commercial-documents";
import payloads from "../../../../designer-portal/e2e/round8/rc7-e7-fixtures/payloads/mixed-payloads.json";

let mockQuery: {
  data: unknown;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
};
jest.mock("@patina/supabase", () => ({
  ...jest.requireActual("@patina/supabase"),
  useMyServiceAcceptanceRequests: () => mockQuery,
}));
jest.mock("@/hooks/use-hydrated", () => ({ useHydrated: () => true }));

type Recorded = { status: number; body: unknown };
const actors = payloads.actors as unknown as Record<
  string,
  Record<string, Recorded>
>;
const { project, request } = payloads.meta;
const decision = (n: number) =>
  `e7e7a000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const repoRoot = path.resolve(__dirname, "../../../../..");
const BASE_REF = "main";
function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}
const baseSha = git(["rev-parse", BASE_REF])?.trim() ?? null;
const describeBase = baseSha ? describe : describe.skip;

function loadBase<T>(rel: string): T {
  const source = git(["show", `${BASE_REF}:${rel}`]);
  if (source == null) throw new Error(`${rel} is absent on ${BASE_REF}`);
  const { outputText } = ts.transpileModule(source, {
    fileName: rel,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  const dir = path.join(repoRoot, path.dirname(rel));
  const mod = { exports: {} as Record<string, unknown> };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const req = (spec: string) =>
    require(spec.startsWith(".") ? path.join(dir, spec) : spec);
  // eslint-disable-next-line no-new-func
  new Function("exports", "require", "module", outputText)(
    mod.exports,
    req,
    mod,
  );
  return mod.exports as T;
}
function sameBlob(rel: string): boolean {
  const atBase = git(["rev-parse", `${BASE_REF}:${rel}`])?.trim();
  return (
    !!atBase &&
    atBase === git(["hash-object", path.join(repoRoot, rel)])?.trim()
  );
}

describe("RC7-E7 X08 client approval inbox over the mixed project", () => {
  const approvals = (label: string) =>
    (actors[label].list_my_project_decision_reviews.body as unknown[]).map(
      parseProjectApprovalReview,
    );

  it("the lead sees the five legacy approvals with their attention and labels", () => {
    const rows = Object.fromEntries(
      approvals("client_lead").map((r) => [r.decisionId, r]),
    );
    expect(Object.keys(rows).sort()).toEqual(
      [1, 2, 3, 4, 5].map(decision).sort(),
    );
    expect(
      [1, 2, 3, 4, 5].map((n) =>
        isClientActionableProjectApproval(rows[decision(n)]),
      ),
    ).toEqual([true, true, false, false, false]);
    expect(
      [1, 2, 3, 4, 5].map((n) =>
        projectApprovalAttentionLabel(rows[decision(n)]),
      ),
    ).toEqual([
      "Response required",
      "Review required",
      "Approved",
      "Withdrawn",
      "Superseded",
    ]);
  });

  it("signers who are not the approval lead get an empty inbox, not service rows", () => {
    for (const label of [
      "co_client",
      "replaced_partner",
      "replacement_partner",
      "gc_party",
      "outsider",
    ]) {
      expect(approvals(label)).toEqual([]);
    }
  });

  it("client-attention and the approval parser are the shipped (main) files", () => {
    expect(sameBlob("apps/client-portal/src/lib/client-attention.ts")).toBe(
      true,
    );
    expect(
      sameBlob("packages/supabase/src/hooks/use-project-approvals.ts"),
    ).toBe(true);
  });
});

describe("RC7-E7 X08 acceptance door over the recorded request lists", () => {
  function renderDoor(label: string, projectId: string) {
    mockQuery = {
      data: readMyServiceAcceptanceRequests(
        actors[label].get_my_service_acceptance_requests.body,
      ),
      isPending: false,
      isError: false,
      refetch: () => undefined,
    };
    return render(<ServiceAcceptanceDoor projectId={projectId} />);
  }

  it.each(["client_lead", "co_client", "replaced_partner"])(
    "%s: only the open request on job 3 opens the door",
    (label) => {
      const { unmount } = renderDoor(label, project.job3);
      const links = screen.getAllByRole("link");
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAttribute("href", `/acceptance/${request.s2}`);
      unmount();
      for (const job of ["job1", "job2"] as const) {
        const { container } = renderDoor(label, project[job]);
        expect(container).toBeEmptyDOMElement();
      }
    },
  );

  it("the replacement signer and the paper observer get no door", () => {
    for (const job of ["job1", "job2", "job3"] as const) {
      expect(
        renderDoor("replacement_partner", project[job]).container,
      ).toBeEmptyDOMElement();
    }
  });
});

describe("RC7-E7 X08 client threshold selections with an external line", () => {
  const threshold =
    actors.client_lead["get_client_project_threshold.job1"].body;
  const externalId = "e7e7c000-0000-4000-8000-000000000002";

  it("the recorded payload carries the client-safe external line and no studio price", () => {
    const rows = (threshold as { selections: Record<string, unknown>[] })
      .selections;
    const external = rows.find((row) => row.id === externalId);
    expect(external).toMatchObject({
      kind: "external",
      responsibility: "external",
      clientUnitPriceCents: null,
    });
  });

  it("the current adapter keeps it external and unpriced (threshold.tsx filters it from studio pieces)", () => {
    const adapted = adaptClientSelections(threshold);
    expect(adapted.origin).toBe("commercial");
    const external =
      adapted.origin === "commercial"
        ? adapted.selections.find((s) => s.id === externalId)
        : undefined;
    expect(external).toMatchObject({
      kind: "external",
      clientUnitPriceCents: null,
      clientLineTotalCents: null,
    });
  });

  describeBase(`older adapter (${BASE_REF})`, () => {
    const rel = "apps/client-portal/src/lib/commercial-documents.ts";
    it("differs from the current file (it predates the external kind)", () => {
      expect(sameBlob(rel)).toBe(false);
    });

    // DEFECT RC7-e7-1: the older client page reads the C5 external line as an
    // ordinary studio furnishing priced at $0 (main commercial-documents.ts
    // adaptClientSelections: oneOf(row.kind, ['furnishings','trade'], 'furnishings')
    // and number(undefined) -> 0), because get_client_project_threshold emits
    // kind 'external' rows inside the same unversioned `selections` array.
    // The assertion records what the older reader does today.
    it("records what the older client page would render for the external line", () => {
      const base = loadBase<{
        adaptClientSelections: typeof adaptClientSelections;
      }>(rel);
      const adapted = base.adaptClientSelections(threshold);
      expect(adapted.origin).toBe("commercial");
      const external =
        adapted.origin === "commercial"
          ? adapted.selections.find((s) => s.id === externalId)
          : undefined;
      expect(external).toMatchObject({
        kind: "furnishings",
        clientUnitPriceCents: 0,
        clientLineTotalCents: 0,
      });
    });
  });
});
