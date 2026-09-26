import { defineConfig, useDocumentOperation } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import type { DocumentActionComponent, DocumentActionProps } from "sanity";
import { schemaTypes } from "./schemas";

// Only these Sanity user ids may publish teaching notes and releases; a draft is
// the awaiting-review state. This hides the Studio button, it is not an API guard.
const TEACHING_TYPES = ["teachingNote", "teachingRelease"];
const publisherIds = (process.env.SANITY_STUDIO_PUBLISHER_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

// Fail closed: an unset or empty allowlist means nobody can publish a
// teaching doc, not everybody (SQ-278 finding #18).
if (publisherIds.length === 0) {
  console.warn("SANITY_STUDIO_PUBLISHER_IDS");
}

// Only teachingNote declares a `publishedAt` field; teachingRelease has no such
// field, so the stamp wrap must not apply to it (finding #19).
const PUBLISHED_AT_TYPES = ["teachingNote"];

/**
 * Wraps the default Publish action so a teaching doc always carries a
 * `publishedAt` before the transaction commits, stamped once (finding #19).
 */
function withPublishedAtStamp(
  PublishAction: DocumentActionComponent,
): DocumentActionComponent {
  const StampedPublishAction: DocumentActionComponent = (
    props: DocumentActionProps,
  ) => {
    const original = PublishAction(props);
    const { patch } = useDocumentOperation(props.id, props.type);
    if (!original) return original;
    return {
      ...original,
      onHandle: () => {
        const draft = props.draft as { publishedAt?: string } | null;
        if (draft && !draft.publishedAt) {
          patch.execute([{ set: { publishedAt: new Date().toISOString() } }]);
        }
        original.onHandle?.();
      },
    };
  };
  StampedPublishAction.action = PublishAction.action;
  return StampedPublishAction;
}

export default defineConfig({
  name: "help-system",
  title: "Patina Help System",
  projectId: "kv3qrinl",
  dataset: "production",
  basePath: "/help-system",
  plugins: [structureTool(), visionTool()],
  schema: {
    types: schemaTypes,
  },
  document: {
    actions: (prev, context) => {
      if (!TEACHING_TYPES.includes(context.schemaType)) return prev;

      const canPublish =
        publisherIds.length > 0 &&
        publisherIds.includes(context.currentUser?.id ?? "");

      return prev
        .filter((action) => canPublish || action.action !== "publish")
        .map((action) =>
          action.action === "publish" &&
          PUBLISHED_AT_TYPES.includes(context.schemaType)
            ? withPublishedAtStamp(action)
            : action,
        );
    },
  },
});
