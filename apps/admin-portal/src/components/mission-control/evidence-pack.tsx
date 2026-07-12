import type { AgentTask } from '@patina/agent-queue';

// ─────────────────────────────────────────────────────────────────────────────
// Evidence pack — the expandable body of an approval card. Renders the shape of
// evidence that fits the task, so the reviewer sees the decision, not raw JSON:
//
//   data-change (payload.before/after) → two-column before/after diff, union of
//                                        keys, changed rows highlighted
//   research    (vendor_qualification, → payload.sources[] link list +
//                designer_scout_dossier) payload.body_excerpt
//   pin_draft / content                → the draft inline in a mono block
//   intake_error                       → payload.parse_error + raw header
//   default                            → pretty-printed payload
// ─────────────────────────────────────────────────────────────────────────────

const RESEARCH_TYPES = new Set(['vendor_qualification', 'designer_scout_dossier']);
const DRAFT_TYPES = new Set(['pin_draft', 'content']);

export type EvidenceKind = 'data-change' | 'research' | 'draft' | 'intake_error' | 'default';

export function evidenceKind(task: Pick<AgentTask, 'task_type' | 'payload'>): EvidenceKind {
  const { task_type, payload } = task;
  if (task_type === 'intake_error') return 'intake_error';
  if (RESEARCH_TYPES.has(task_type)) return 'research';
  if (DRAFT_TYPES.has(task_type)) return 'draft';
  const hasBeforeAfter =
    payload != null &&
    typeof payload === 'object' &&
    ('before' in payload || 'after' in payload);
  if (task_type.includes('data_change') || hasBeforeAfter) return 'data-change';
  return 'default';
}

function asRecord(v: unknown): Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function displayValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

// ─── data-change ─────────────────────────────────────────────────────────────
function DataChangeDiff({ payload }: { payload: Record<string, unknown> }) {
  const before = asRecord(payload.before);
  const after = asRecord(payload.after);
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();

  if (keys.length === 0) {
    return <PrettyPayload payload={payload} />;
  }

  return (
    <div className="overflow-x-auto" data-testid="evidence-data-change">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="type-meta-small border-b border-[var(--border-default)]">
            <th className="py-1.5 pr-4 font-normal">Field</th>
            <th className="py-1.5 pr-4 font-normal">Before</th>
            <th className="py-1.5 font-normal">After</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const b = displayValue(before[key]);
            const a = displayValue(after[key]);
            const changed = JSON.stringify(before[key]) !== JSON.stringify(after[key]);
            return (
              <tr
                key={key}
                data-changed={changed ? 'true' : 'false'}
                className={`border-b border-[var(--border-subtle)] align-top ${
                  changed ? 'bg-[var(--bg-hover)]' : ''
                }`}
              >
                <td className="type-label-secondary py-1.5 pr-4 text-[var(--text-primary)]">
                  {key}
                  {changed && (
                    <span className="ml-1.5 text-[var(--color-terracotta)]" aria-hidden>
                      •
                    </span>
                  )}
                </td>
                <td
                  className="py-1.5 pr-4 text-[0.78rem] text-[var(--text-muted)] line-through decoration-[var(--color-terracotta)]/40"
                  style={{ fontFamily: 'var(--font-meta)' }}
                >
                  {b}
                </td>
                <td
                  className="py-1.5 text-[0.78rem] text-[var(--text-primary)]"
                  style={{ fontFamily: 'var(--font-meta)' }}
                >
                  {a}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── research ────────────────────────────────────────────────────────────────
interface Source {
  url?: string;
  title?: string;
  label?: string;
}

function ResearchEvidence({ payload }: { payload: Record<string, unknown> }) {
  const sources = Array.isArray(payload.sources) ? (payload.sources as Source[]) : [];
  const excerpt =
    typeof payload.body_excerpt === 'string' ? payload.body_excerpt : undefined;

  return (
    <div className="flex flex-col gap-4" data-testid="evidence-research">
      {excerpt && <p className="type-body-small max-w-2xl">{excerpt}</p>}
      {sources.length > 0 && (
        <div>
          <div className="type-meta-small mb-2">Sources</div>
          <ul className="flex flex-col gap-1.5">
            {sources.map((s, i) => {
              const label = s.title || s.label || s.url || `Source ${i + 1}`;
              return (
                <li key={i} className="flex items-baseline gap-2">
                  <span className="text-[var(--text-subtle)]" aria-hidden>
                    ↳
                  </span>
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="type-body-small break-all text-[var(--accent-primary)] hover:text-[var(--accent-hover)]"
                    >
                      {label}
                    </a>
                  ) : (
                    <span className="type-body-small">{label}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {!excerpt && sources.length === 0 && <PrettyPayload payload={payload} />}
    </div>
  );
}

// ─── draft ───────────────────────────────────────────────────────────────────
function DraftEvidence({ payload }: { payload: Record<string, unknown> }) {
  const draft =
    (typeof payload.draft === 'string' && payload.draft) ||
    (typeof payload.body === 'string' && payload.body) ||
    (typeof payload.text === 'string' && payload.text) ||
    '';

  if (!draft) return <PrettyPayload payload={payload} />;

  return (
    <pre
      data-testid="evidence-draft"
      className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-l-2 border-[var(--border-default)] bg-[var(--bg-hover)] px-4 py-3 text-[0.8rem] leading-relaxed text-[var(--text-body)]"
      style={{ fontFamily: 'var(--font-meta)' }}
    >
      {draft}
    </pre>
  );
}

// ─── intake_error ────────────────────────────────────────────────────────────
function IntakeErrorEvidence({ payload }: { payload: Record<string, unknown> }) {
  const parseError =
    typeof payload.parse_error === 'string' ? payload.parse_error : 'Unknown parse error';
  const rawHeader =
    typeof payload.raw_header === 'string'
      ? payload.raw_header
      : typeof payload.raw === 'string'
        ? payload.raw
        : undefined;

  return (
    <div className="flex flex-col gap-3" data-testid="evidence-intake-error">
      <div>
        <div className="type-meta-small mb-1 text-[var(--color-error)]">Parse error</div>
        <p className="type-body-small text-[var(--color-error)]">{parseError}</p>
      </div>
      {rawHeader && (
        <div>
          <div className="type-meta-small mb-1">Raw header</div>
          <pre
            className="max-h-72 overflow-auto whitespace-pre-wrap break-words border-l-2 border-[var(--color-error)] bg-[var(--bg-hover)] px-4 py-3 text-[0.78rem] text-[var(--text-body)]"
            style={{ fontFamily: 'var(--font-meta)' }}
          >
            {rawHeader}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── default ─────────────────────────────────────────────────────────────────
function PrettyPayload({ payload }: { payload: Record<string, unknown> }) {
  return (
    <pre
      data-testid="evidence-default"
      className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-l-2 border-[var(--border-default)] bg-[var(--bg-hover)] px-4 py-3 text-[0.76rem] text-[var(--text-body)]"
      style={{ fontFamily: 'var(--font-meta)' }}
    >
      {JSON.stringify(payload ?? {}, null, 2)}
    </pre>
  );
}

export function EvidencePack({ task }: { task: AgentTask }) {
  const payload = asRecord(task.payload);
  const kind = evidenceKind(task);

  switch (kind) {
    case 'data-change':
      return <DataChangeDiff payload={payload} />;
    case 'research':
      return <ResearchEvidence payload={payload} />;
    case 'draft':
      return <DraftEvidence payload={payload} />;
    case 'intake_error':
      return <IntakeErrorEvidence payload={payload} />;
    default:
      return <PrettyPayload payload={payload} />;
  }
}
