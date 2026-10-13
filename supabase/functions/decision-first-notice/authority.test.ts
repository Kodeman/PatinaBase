import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveDecisionSendAuthority } from "./authority.ts";

Deno.test("legacy decision uses projects.studio_id for scheduled send authority", async () => {
  const authority = await resolveDecisionSendAuthority({
    from(table: string) {
      assertEquals(table, "projects");
      return {
        select(columns: string) {
          assertEquals(columns, "designer_id, studio_id");
          const query = {
            eq: (_column: string, _value: string) => query,
            maybeSingle: async () => ({
              data: { designer_id: null, studio_id: "studio-project-org" },
            }),
          };
          return query;
        },
      };
    },
  }, "project-1", null);

  assertEquals(authority, {
    kind: "studio_schedule",
    studioId: "studio-project-org",
    outboundKind: "decision_reminder",
  });
});
