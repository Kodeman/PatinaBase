import type { CommsMessage, InboxNotification, ThreadSummary } from '@patina/supabase';

import { parseSourceDate } from './derive';

/* ── CORRESPONDENCE ─────────────────────────────────────────────────────────
   /messages and /inbox, read as post rather than as a mailbox application.
   The project's comms thread is the correspondence between this house and the
   studio; `notification_log` is the record of what the house itself sent. Both
   are shaped here, away from React, so the page only has to print them.

   THE READER'S OWN HAND IS PLAIN. A letter from the studio is a quotation and
   keeps its first person; a letter the client wrote is her own and is set in
   plain type. `from` is the only thing the printer needs to tell them apart.

   A DELETED LETTER IS NOT A LETTER. `/messages` printed "(message deleted)"
   because a chat pane has to hold the place in a sequence; a record does not.
   System messages go the same way: they are the application talking about
   itself, and this surface has no voice for that. ────────────────────────── */

export interface CorrespondenceLetter {
  id: string;
  body: string;
  /** 'studio' — any other hand; 'you' — the reader's own. */
  from: 'studio' | 'you';
  authorName: string | null;
  sentAt: Date | null;
}

/** One line of what the house sent, off `notification_log`. */
export interface NoticeReceipt {
  id: string;
  label: string;
  date: Date | null;
}

function moment(value: string | null | undefined): number {
  const date = parseSourceDate(value);
  return date === null ? Number.NEGATIVE_INFINITY : date.getTime();
}

/**
 * The project's thread, chosen the way `/messages` chose it.
 *
 * `useThreads` has already dropped the threads the reader left or archived, so
 * the choice left here is which of her remaining threads belongs to THIS
 * house: one filed under the project, preferring a thread the studio opened
 * for the project over a direct message that happens to carry the same
 * project_id, and the most recently spoken-in where there is more than one.
 */
export function pickProjectThread(
  threads: ThreadSummary[] | undefined | null,
  projectId: string,
): ThreadSummary | null {
  const filed = (threads ?? []).filter((thread) => thread.project_id === projectId);
  if (filed.length === 0) return null;
  const opened = filed.filter((thread) => thread.kind === 'project');
  const pool = opened.length > 0 ? opened : filed;
  return (
    [...pool].sort((a, b) => moment(b.last_message_at) - moment(a.last_message_at))[0] ?? null
  );
}

/** Newest first, the order Previously keeps its own lines in. */
export function toLetters(
  messages: CommsMessage[] | undefined | null,
  readerId: string | null,
): CorrespondenceLetter[] {
  return (messages ?? [])
    .filter((message) => !message.deleted_at && !message.system && message.body.trim().length > 0)
    .map((message) => ({
      id: message.id,
      body: message.body,
      from:
        readerId !== null && message.sender_id === readerId
          ? ('you' as const)
          : ('studio' as const),
      authorName: message.sender?.full_name ?? null,
      sentAt: parseSourceDate(message.created_at),
    }))
    .sort((a, b) => (b.sentAt?.getTime() ?? 0) - (a.sentAt?.getTime() ?? 0));
}

/** Every letter's moment, for `deriveThreshold`'s changed rule. */
export function letterMoments(messages: CommsMessage[] | undefined | null): string[] {
  return (messages ?? [])
    .filter((message) => !message.deleted_at)
    .map((message) => message.created_at);
}

/** `/inbox`'s own title resolution, copied from `previewOf`/`formatType`. */
function noticeLabel(notification: InboxNotification): string {
  const metadata = notification.metadata ?? {};
  const named =
    (metadata.subject as string | undefined) ||
    (metadata.headline as string | undefined) ||
    (metadata.title as string | undefined);
  if (named) return named;
  return notification.type.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function toNotices(
  notifications: InboxNotification[] | undefined | null,
): NoticeReceipt[] {
  return (notifications ?? [])
    .map((notification) => ({
      id: notification.id,
      label: noticeLabel(notification),
      date: parseSourceDate(notification.created_at),
    }))
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
}
