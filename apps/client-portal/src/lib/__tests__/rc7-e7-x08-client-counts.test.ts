/**
 * @jest-environment node
 *
 * RC-7 E7 (X08): the client project list's attention counts (projects.ts,
 * the same blob as main) over the reads the owned stack returned for the
 * client lead on the mixed project. Only the Supabase client is substituted;
 * every row it hands back is a recorded payload except the project list
 * itself and the proposal/comms reads, which the fixture does not exercise.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createServerClient } from "@patina/supabase/server";
import { fetchClientProjects } from "../data/projects";
import payloads from "../../../../designer-portal/e2e/round8/rc7-e7-fixtures/payloads/mixed-payloads.json";

jest.mock("server-only", () => ({}), { virtual: true });
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  cache: (fn: unknown) => fn,
}));
jest.mock("@/lib/env", () => ({ env: { useProjectFixtures: false } }));
jest.mock("@patina/supabase/server", () => ({ createServerClient: jest.fn() }));

type Recorded = { status: number; body: unknown };
const actors = payloads.actors as unknown as Record<
  string,
  Record<string, Recorded>
>;
const { project } = payloads.meta;
const lead = actors.client_lead;
const leadId = "e7e70000-0000-4000-8000-000000000005";

function client(stage2Rows: unknown) {
  const tables: Record<string, unknown> = {
    projects: (["job1", "job2", "job3"] as const).map((job) => ({
      id: project[job],
      name: job,
      status: "active",
      project_phases: [],
    })),
    client_decisions: lead["client.legacy_pending_decisions"].body,
    comms_thread_participants: [],
    comms_threads: [],
    comms_messages: [],
  };
  const rpcs: Record<string, unknown> = {
    list_my_project_decision_reviews: stage2Rows,
    list_client_proposals: [],
  };
  const builder = (table: string) => {
    const result = Promise.resolve({ data: tables[table], error: null });
    const chain: Record<string, unknown> = {};
    for (const verb of [
      "select",
      "eq",
      "or",
      "in",
      "is",
      "order",
      "gte",
      "neq",
      "not",
    ])
      chain[verb] = () => chain;
    chain.then = result.then.bind(result);
    return chain;
  };
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: leadId } }, error: null }),
    },
    from: jest.fn(builder),
    rpc: jest.fn(async (name: string) => ({ data: rpcs[name], error: null })),
  };
}

describe("RC7-E7 X08 client project counts", () => {
  it("projects.ts is the shipped (main) file", () => {
    const root = path.resolve(__dirname, "../../../../..");
    const rel = "apps/client-portal/src/lib/data/projects.ts";
    const git = (args: string[]) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    expect(git(["hash-object", path.join(root, rel)])).toBe(
      git(["rev-parse", `main:${rel}`]),
    );
  });

  it("counts the two actionable legacy approvals on job 1 and nothing for the service-only jobs", async () => {
    (createServerClient as jest.Mock).mockResolvedValue(
      client(lead.list_my_project_decision_reviews.body),
    );
    const items = await fetchClientProjects();
    const pending = Object.fromEntries(
      items.map((p) => [p.id, p.approvalsPending]),
    );
    expect(pending).toEqual({
      [project.job1]: 2,
      [project.job2]: 0,
      [project.job3]: 0,
    });
  });

  it("a service record that reached the Stage-2 list would not break or inflate the counts", async () => {
    const service = lead.get_my_service_acceptance_requests.body as unknown[];
    (createServerClient as jest.Mock).mockResolvedValue(
      client([
        ...(lead.list_my_project_decision_reviews.body as unknown[]),
        ...service,
      ]),
    );
    const items = await fetchClientProjects();
    const pending = Object.fromEntries(
      items.map((p) => [p.id, p.approvalsPending]),
    );
    expect(pending).toEqual({
      [project.job1]: 2,
      [project.job2]: 0,
      [project.job3]: 0,
    });
  });

  it("the recorded legacy pending read is empty for the client (designer_clients RLS), so legacy b1-b3 add nothing", () => {
    expect(lead["client.legacy_pending_decisions"]).toEqual({
      status: 200,
      body: [],
    });
  });
});
