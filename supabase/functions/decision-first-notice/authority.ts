import type { SendAuthority } from "../_shared/send-authority.ts";

interface DecisionAuthorityDb {
  from(table: string): any;
}

export async function resolveDecisionSendAuthority(
  db: DecisionAuthorityDb,
  projectId: string | null,
  decisionDesignerId: string | null,
): Promise<SendAuthority | null> {
  const { data: project } = projectId
    ? await db.from("projects")
      .select("designer_id, studio_id")
      .eq("id", projectId)
      .maybeSingle()
    : { data: null };

  // The publishing trigger is the click. Legacy decisions do not retain a
  // distinct publisher id, so prefer the recorded decision designer, then the
  // project's designer; if neither exists, attribute to the studio schedule.
  if (decisionDesignerId) {
    return { kind: "designer", userId: decisionDesignerId };
  }
  if (project?.designer_id) {
    return { kind: "designer", userId: project.designer_id };
  }
  if (project?.studio_id) {
    return {
      // TODO(B7): decision/project designer can be absent on legacy records.
      kind: "studio_schedule",
      studioId: project.studio_id,
      outboundKind: "decision_reminder",
    };
  }
  return null;
}
