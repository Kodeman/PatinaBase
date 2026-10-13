export interface BatchDraft { id: string; organization_id: string; project_id: string | null }
export interface SendBatchDeps {
  loadDraft(id: string): Promise<BatchDraft | null>;
  canSend(draft: BatchDraft, userId: string): Promise<boolean>;
  send(id: string, userId: string): Promise<{ id: string; ok: boolean; error?: string; messageId?: string }>;
}
export async function sendDraftBatch(draftIds: string[], userId: string, deps: SendBatchDeps) {
  const results = [];
  for (const id of draftIds) {
    try {
      const draft = await deps.loadDraft(id);
      if (!draft) { results.push({ id, ok: false, error: "not_found" }); continue; }
      if (!(await deps.canSend(draft, userId))) { results.push({ id, ok: false, error: "not_authorized" }); continue; }
      results.push(await deps.send(id, userId));
    } catch (error) {
      results.push({ id, ok: false, error: error instanceof Error ? error.message : "send_failed" });
    }
  }
  return results;
}
