/**
 * DEC — Send as a client decision (legacy parity). Picks client/project/room,
 * then creates a single-option decision via the saveAsDecision effect. Owns its
 * own send state; on success it resets for the next capture.
 */
import { useContext, useState } from 'react';
import { useCapture, useCaptureDispatch } from '../state/CaptureProvider';
import { OverlaySheet } from '../panel/OverlaySheet';
import { DecisionTargetSelector } from '../components/DecisionTargetSelector';
import { saveAsDecision, classifySaveError } from '../state/effects';
import { ControllerContext } from '../panel/controller-context';

export function DecisionSheet() {
  const { draft, routing, session } = useCapture();
  const dispatch = useCaptureDispatch();
  const controller = useContext(ControllerContext);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  if (!draft) return null;

  const dec = routing.decision;
  const canSend = !!dec.designerClientId && !!session.user && !sending;

  const send = async () => {
    if (!session.user || !dec.designerClientId) return;
    setSending(true);
    setError('');
    const captureTimeMs =
      controller?.captureStartedAt != null ? Date.now() - controller.captureStartedAt : undefined;
    try {
      await saveAsDecision(draft, routing, session.user, captureTimeMs);
      setSent(true);
    } catch (e) {
      setError(classifySaveError(e).message);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <OverlaySheet title="Sent for approval">
        <div className="flex flex-col items-center py-10 text-center">
          <span className="font-display text-[1.5rem] text-verdigris">✓</span>
          <p className="mt-2 text-[0.9rem] text-ink">The client has been notified.</p>
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'CLOSE_OVERLAY' });
              dispatch({ type: 'CAPTURE_NEXT' });
            }}
            className="mt-5 rounded-md bg-verdigris px-4 py-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-paper hover:bg-verdigris-ink"
          >
            Capture another
          </button>
        </div>
      </OverlaySheet>
    );
  }

  return (
    <OverlaySheet
      title="Send for approval"
      subtitle="Ask the client to choose"
      footer={
        <button
          type="button"
          disabled={!canSend}
          onClick={send}
          className="w-full rounded-md bg-brass py-2.5 text-[0.85rem] font-medium text-paper transition-colors hover:bg-brass-2 disabled:opacity-50"
        >
          {sending ? 'Sending…' : !dec.designerClientId ? 'Choose a client' : 'Send to client'}
        </button>
      }
    >
      {error && (
        <div className="mb-3 rounded-md border-l-[3px] border-rust bg-rust/5 px-3 py-2 text-[0.82rem] text-rust">
          {error}
        </div>
      )}
      <div className="mb-3 space-y-1">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-ink-soft">
          What the client is choosing
        </span>
        <input
          value={dec.title}
          onChange={(e) =>
            dispatch({ type: 'DECISION_TARGET_SET', patch: { title: e.target.value } })
          }
          placeholder={`Approve: ${draft.fields.name.value || 'this piece'}`}
          className="w-full rounded-md border border-line bg-paper-3 px-2.5 py-2 text-[0.85rem] text-ink outline-none focus:border-brass"
        />
      </div>
      <DecisionTargetSelector
        designerClientId={dec.designerClientId}
        projectId={dec.projectId}
        roomId={dec.roomId}
        onDesignerClientChange={(designerClientId, clientId) =>
          dispatch({
            type: 'DECISION_TARGET_SET',
            patch: { designerClientId, clientProfileId: clientId },
          })
        }
        onProjectChange={(projectId) =>
          dispatch({ type: 'DECISION_TARGET_SET', patch: { projectId } })
        }
        onRoomChange={(roomId) => dispatch({ type: 'DECISION_TARGET_SET', patch: { roomId } })}
        disabled={sending}
      />
    </OverlaySheet>
  );
}
