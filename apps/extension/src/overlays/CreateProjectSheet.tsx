/** S2 — Create project inline. Speeds up first-time routing without leaving capture. */
import { useState } from 'react';
import { useCaptureDispatch } from '../state/CaptureProvider';
import { OverlaySheet } from '../panel/OverlaySheet';
import { createProject } from '../hooks/use-reference-data';

export function CreateProjectSheet() {
  const dispatch = useCaptureDispatch();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    const project = await createProject(trimmed);
    setBusy(false);
    if (!project) {
      setError('Could not create the project.');
      return;
    }
    dispatch({
      type: 'DESTINATION_SET',
      value: { type: 'project-room', projectId: project.id, roomId: null },
    });
    dispatch({ type: 'CLOSE_OVERLAY' });
  };

  return (
    <OverlaySheet
      title="New project"
      footer={
        <button
          type="button"
          disabled={!name.trim() || busy}
          onClick={create}
          className="w-full rounded-md bg-verdigris py-2.5 text-[0.85rem] font-medium text-paper transition-colors hover:bg-verdigris-ink disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create & route here'}
        </button>
      }
    >
      {error && (
        <div className="mb-3 rounded-md border-l-[3px] border-rust bg-rust/5 px-3 py-2 text-[0.82rem] text-rust">
          {error}
        </div>
      )}
      <label className="space-y-1">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-ink-soft">
          Project name
        </span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder="e.g. Aspen Residence"
          className="w-full rounded-md border border-line bg-paper-3 px-2.5 py-2 text-[0.9rem] text-ink outline-none focus:border-verdigris"
        />
      </label>
    </OverlaySheet>
  );
}
