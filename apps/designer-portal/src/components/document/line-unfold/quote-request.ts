/**
 * C-29 (d2 §M2): a quote request names its job, the lines it asks about and
 * when the studio wants the answer. Import-free, so the maker profile's form
 * and the POST /api/vendors/[id]/quote-request route share one reading.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export interface QuoteRequestForm {
  scope: string;
  timeline: string;
  message: string;
  projectId: string | null;
  ffeItemIds: readonly string[];
  /** YYYY-MM-DD, or '' for none. */
  dueOn: string;
}

export interface QuoteRequestBody {
  message: string;
  scope?: string;
  timeline?: string;
  projectId?: string;
  ffeItemIds?: string[];
  dueOn?: string;
}

/** The POST body: blanks drop out, and lines only ride with their job. */
export function quoteRequestBody(form: QuoteRequestForm): QuoteRequestBody {
  const body: QuoteRequestBody = { message: form.message.trim() };
  if (form.scope.trim()) body.scope = form.scope.trim();
  if (form.timeline.trim()) body.timeline = form.timeline.trim();
  if (form.projectId) {
    body.projectId = form.projectId;
    if (form.ffeItemIds.length > 0) body.ffeItemIds = [...form.ffeItemIds];
  }
  if (form.dueOn.trim()) body.dueOn = form.dueOn.trim();
  return body;
}

export type ParsedQuoteRequest =
  | {
      ok: true;
      value: {
        message: string;
        scope: string | null;
        timeline: string | null;
        projectId: string | null;
        ffeItemIds: string[];
        dueOn: string | null;
      };
    }
  | { ok: false; error: string };

/** The route's read of that body. The database re-checks the job and lines (00707). */
export function parseQuoteRequestBody(raw: unknown): ParsedQuoteRequest {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const text = (v: unknown) => (v == null ? '' : String(v).trim());
  const message = text(body.message);
  if (!message) return { ok: false, error: 'message is required' };
  const projectId = text(body.projectId) || null;
  if (projectId && !UUID.test(projectId)) return { ok: false, error: 'projectId must be an id' };
  const rawLines = body.ffeItemIds ?? [];
  if (!Array.isArray(rawLines) || rawLines.some((id) => typeof id !== 'string' || !UUID.test(id))) {
    return { ok: false, error: 'ffeItemIds must be a list of ids' };
  }
  const ffeItemIds = Array.from(new Set(rawLines as string[]));
  if (ffeItemIds.length > 0 && !projectId) {
    return { ok: false, error: 'Choose the job before naming its lines' };
  }
  if (ffeItemIds.length > 200) return { ok: false, error: 'At most 200 lines in one request' };
  const dueOn = text(body.dueOn) || null;
  if (dueOn && !YMD.test(dueOn)) return { ok: false, error: 'dueOn must be a date (YYYY-MM-DD)' };
  return {
    ok: true,
    value: {
      message,
      scope: text(body.scope) || null,
      timeline: text(body.timeline) || null,
      projectId,
      ffeItemIds,
      dueOn,
    },
  };
}
