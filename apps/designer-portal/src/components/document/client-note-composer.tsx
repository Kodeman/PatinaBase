'use client';

/**
 * "Write to your client" (spec §6, Lane 6) — a project document's one
 * instrument for a studio member to leave a note that stands on the
 * client's page until she answers. Shape copied from margin-rail.tsx's
 * note composer (collapsed DocumentAction → textarea → DocumentActionRow);
 * scored ink, no shadows, no "AI" — VISION §6.
 *
 * Gated on the `threshold` flag (fail-closed: renders nothing while loading
 * or off). Every hook below runs unconditionally above the gate's early
 * return so hook order never depends on the flag's resolved value.
 */

import { useState } from 'react';
import {
  useProjectNotes,
  useSendProjectNote,
  useRetireProjectNote,
  type ProjectNote,
  type ProjectNoteEnclosure,
} from '@patina/supabase';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import {
  DocumentAction,
  DocumentActionRow,
} from './document-action';
import { DOCUMENT_WRITE_EVENT } from './margin-rail';

const MAX_BODY_LENGTH = 2000;

/** "4 September" — the day-month form the receipt lines are written in.
 *  `en-GB` for the day-before-month order; the words themselves stay
 *  English regardless of locale. */
function dayMonth(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso));
}

export interface ClientNoteComposerEnclosureOption {
  id: string;
  title: string;
  code?: string;
}

export interface ClientNoteComposerProps {
  projectId: string;
  clientFirstName: string | null | undefined;
  openProposals: ClientNoteComposerEnclosureOption[];
  openTradeScopes: ClientNoteComposerEnclosureOption[];
  openInvoices: ClientNoteComposerEnclosureOption[];
}

function defaultTickedKeys(
  openProposals: ClientNoteComposerEnclosureOption[],
  openTradeScopes: ClientNoteComposerEnclosureOption[],
): Set<string> {
  return new Set([
    ...openProposals.map((p) => `proposal:${p.id}`),
    ...openTradeScopes.map((t) => `trade_scope:${t.id}`),
  ]);
}

function ticketsToEnclosures(ticked: Set<string>): ProjectNoteEnclosure[] {
  return Array.from(ticked).map((key) => {
    const [kind, id] = key.split(':') as [ProjectNoteEnclosure['kind'], string];
    return { kind, id };
  });
}

export function ClientNoteComposer({
  projectId,
  clientFirstName,
  openProposals,
  openTradeScopes,
  openInvoices,
}: ClientNoteComposerProps) {
  const flag = useFeatureFlag('threshold');
  const { data: notes } = useProjectNotes(projectId);
  const sendNote = useSendProjectNote();
  const retireNote = useRetireProjectNote();

  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState('');
  const [ticked, setTicked] = useState<Set<string>>(() =>
    defaultTickedKeys(openProposals, openTradeScopes),
  );
  const [retiredReceipt, setRetiredReceipt] = useState<string | null>(null);

  if (flag.isLoading || !flag.value) return null;

  const standingNote: ProjectNote | undefined = (notes ?? []).find(
    (n) => n.state === 'standing',
  );

  const openComposer = () => {
    setTicked(defaultTickedKeys(openProposals, openTradeScopes));
    setBody('');
    setComposing(true);
  };

  const closeComposer = () => {
    setComposing(false);
    setBody('');
    setTicked(defaultTickedKeys(openProposals, openTradeScopes));
  };

  const send = () => {
    if (!body.trim() || body.length > MAX_BODY_LENGTH) return;
    sendNote.mutate(
      {
        projectId,
        body: body.trim(),
        enclosures: ticketsToEnclosures(ticked),
      },
      {
        onSuccess: () => {
          closeComposer();
          window.dispatchEvent(new CustomEvent(DOCUMENT_WRITE_EVENT));
        },
      },
    );
  };

  const retire = () => {
    if (!standingNote) return;
    retireNote.mutate(
      { noteId: standingNote.id, projectId },
      {
        onSuccess: () => {
          setRetiredReceipt(
            `Taken down ${dayMonth(new Date().toISOString())}. It moves to Previously.`,
          );
        },
      },
    );
  };

  const toggleTick = (key: string) => {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (standingNote) {
    return (
      <div className="mt-2 rounded-[4px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] p-2.5">
        <p className="text-[13px] leading-relaxed text-[var(--color-charcoal)]">
          {standingNote.body}
        </p>
        <p className="mt-1 text-[11px] italic text-[var(--text-muted)]">
          Sent {dayMonth(standingNote.sentAt)}. It stands on her page until she
          answers.
        </p>
        <DocumentActionRow
          surfaceKey="open-document"
          regionKey="client-note"
          className="mt-1.5"
          aria-label="Client note actions"
        >
          <DocumentAction
            actionKey="retire-client-note"
            variant="tertiary"
            disabled={retireNote.isPending}
            loading={retireNote.isPending}
            loadingLabel="Taking down…"
            onClick={retire}
          >
            Take it down
          </DocumentAction>
        </DocumentActionRow>
      </div>
    );
  }

  if (retiredReceipt) {
    return (
      <p className="mt-2 text-[11px] italic text-[var(--text-muted)]">
        {retiredReceipt}
      </p>
    );
  }

  if (!composing) {
    return (
      <DocumentAction
        actionKey="open-client-note-composer"
        surfaceKey="open-document"
        regionKey="client-note"
        variant="secondary"
        onClick={openComposer}
      >
        Write to your client
      </DocumentAction>
    );
  }

  const label = clientFirstName
    ? `A line to ${clientFirstName}`
    : 'A line to your client';
  const disabled =
    !body.trim() || body.length > MAX_BODY_LENGTH || sendNote.isPending;

  return (
    <div className="mt-2 rounded-[4px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] p-2.5">
      <label
        htmlFor="client-note-body"
        className="mb-1 block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]"
      >
        {label}
      </label>
      <textarea
        id="client-note-body"
        autoFocus
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Three last pieces for the library — sign and I'll have them ordered by Friday."
        className="w-full resize-y bg-transparent text-[12px] text-[var(--color-charcoal)] outline-none placeholder:italic placeholder:text-[var(--text-muted)]"
      />
      {(openProposals.length > 0 ||
        openTradeScopes.length > 0 ||
        openInvoices.length > 0) && (
        <div className="mt-1.5 flex flex-col gap-1">
          {openProposals.map((p) => {
            const key = `proposal:${p.id}`;
            return (
              <label
                key={key}
                className="flex cursor-pointer items-baseline gap-2 text-[11px] text-[var(--color-charcoal)]"
              >
                <input
                  type="checkbox"
                  className="relative top-[1px] accent-[var(--color-clay)]"
                  checked={ticked.has(key)}
                  onChange={() => toggleTick(key)}
                />
                Send it with {p.title}
              </label>
            );
          })}
          {openTradeScopes.map((t) => {
            const key = `trade_scope:${t.id}`;
            return (
              <label
                key={key}
                className="flex cursor-pointer items-baseline gap-2 text-[11px] text-[var(--color-charcoal)]"
              >
                <input
                  type="checkbox"
                  className="relative top-[1px] accent-[var(--color-clay)]"
                  checked={ticked.has(key)}
                  onChange={() => toggleTick(key)}
                />
                Send it with the {t.title}
              </label>
            );
          })}
          {openInvoices.map((inv) => {
            const key = `invoice:${inv.id}`;
            return (
              <label
                key={key}
                className="flex cursor-pointer items-baseline gap-2 text-[11px] text-[var(--color-charcoal)]"
              >
                <input
                  type="checkbox"
                  className="relative top-[1px] accent-[var(--color-clay)]"
                  checked={ticked.has(key)}
                  onChange={() => toggleTick(key)}
                />
                Send it with {inv.title}
              </label>
            );
          })}
        </div>
      )}
      <p className="mt-1.5 text-[11px] italic text-[var(--text-muted)]">
        She reads this on her page. Nothing is emailed.
      </p>
      <DocumentActionRow
        surfaceKey="open-document"
        regionKey="client-note"
        className="mt-1.5"
        aria-label="Client note actions"
      >
        <DocumentAction
          actionKey="send-client-note"
          variant="primary"
          disabled={disabled}
          loading={sendNote.isPending}
          loadingLabel="Sending…"
          onClick={send}
        >
          Send
        </DocumentAction>
        <DocumentAction
          actionKey="cancel-client-note"
          variant="tertiary"
          onClick={closeComposer}
        >
          Never mind
        </DocumentAction>
      </DocumentActionRow>
    </div>
  );
}
