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

/** A file that came with a letter, named the way `/messages` named it. */
export interface LetterEnclosure {
  id: string;
  name: string;
}

export interface CorrespondenceLetter {
  id: string;
  body: string;
  /** 'studio' — any other hand; 'you' — the reader's own. */
  from: 'studio' | 'you';
  authorName: string | null;
  sentAt: Date | null;
  enclosures: LetterEnclosure[];
}

/** One line of what the house sent, off `notification_log`. */
export interface NoticeReceipt {
  id: string;
  label: string;
  /** `/inbox`'s body preview, so two notices of a type are told apart. */
  detail: string | null;
  /** An anchor within this page, where the old deep link had one here. */
  anchor: string | null;
  unread: boolean;
  date: Date | null;
}

function moment(value: string | null | undefined): number {
  const date = parseSourceDate(value);
  return date === null ? Number.NEGATIVE_INFINITY : date.getTime();
}

/**
 * The project's thread, chosen the way `/messages` chose it.
 *
 * `useThreads({projectId})` has already filed by project server-side and
 * dropped the threads the reader left or archived; the filter below is a
 * defence, not the filing. What is left to choose is which of her remaining
 * threads speaks for THIS house: one the studio opened for the project over a
 * direct message that happens to carry the same project_id, and the most
 * recently spoken-in where there is more than one.
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

/** What survives to be a letter at all: the one predicate, used twice. */
function isLetter(message: CommsMessage): boolean {
  return !message.deleted_at && !message.system && message.body.trim().length > 0;
}

function enclosuresOf(message: CommsMessage): LetterEnclosure[] {
  return (message.attachments ?? []).map((attachment, index) => ({
    id: `${message.id}-att-${index}`,
    name: attachment.filename ?? attachment.storage_path.split('/').pop() ?? 'Attachment',
  }));
}

/** Newest first, the order Previously keeps its own lines in. */
export function toLetters(
  messages: CommsMessage[] | undefined | null,
  readerId: string | null,
): CorrespondenceLetter[] {
  return (messages ?? [])
    .filter(isLetter)
    .map((message) => ({
      id: message.id,
      body: message.body,
      from:
        readerId !== null && message.sender_id === readerId
          ? ('you' as const)
          : ('studio' as const),
      authorName: message.sender?.full_name ?? null,
      sentAt: parseSourceDate(message.created_at),
      enclosures: enclosuresOf(message),
    }))
    .sort((a, b) => (b.sentAt?.getTime() ?? 0) - (a.sentAt?.getTime() ?? 0));
}

/**
 * Every letter's moment, for `deriveThreshold`'s changed rule.
 *
 * The reader's own hand is not a change: a house that counted her own reply as
 * something that had happened to her would be counting her back at herself.
 * Anything that does not print as a letter is not a moment either — a count
 * that points at a change she cannot find is worse than no count.
 */
export function letterMoments(
  messages: CommsMessage[] | undefined | null,
  readerId: string | null,
): string[] {
  return (messages ?? [])
    .filter((message) => isLetter(message) && message.sender_id !== readerId)
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

/** `/inbox`'s own body preview, so two notices of a type are told apart. */
function noticeDetail(notification: InboxNotification): string | null {
  const metadata = notification.metadata ?? {};
  const body =
    (metadata.preview as string | undefined) ||
    (metadata.message as string | undefined) ||
    (metadata.body as string | undefined) ||
    '';
  const trimmed = body.replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function deepLinkOf(notification: InboxNotification): string | null {
  const metadata = notification.metadata ?? {};
  return (
    (metadata.deep_link as string | undefined) ?? (metadata.url as string | undefined) ?? null
  );
}

/* Where a retired route's deep link lands on this page. Acts never leave the
   page, so a notice can only point at a region the Threshold actually has; a
   link with no home here is a link the retirement plan has to rewrite at the
   emitter, and it is dropped rather than faked. */
const ANCHOR_BY_SEGMENT: Record<string, string> = {
  invoices: '#letterbox',
  orders: '#letterbox',
  decisions: '#doorstep',
  proposals: '#doorstep',
  reviews: '#doorstep',
  documents: '#mat',
  scans: '#mat',
  messages: '#previously',
  inbox: '#previously',
};

export function noticeAnchor(link: string | null | undefined): string | null {
  if (!link || /^https?:/i.test(link)) return null;
  const segments = link.split(/[?#]/)[0].split('/').filter(Boolean);
  for (const segment of segments) {
    const anchor = ANCHOR_BY_SEGMENT[segment];
    if (anchor) return anchor;
  }
  return null;
}

/**
 * The house this notice belongs to.
 *
 * `notification_log` is filed by reader, not by project, so a client with two
 * houses would otherwise read the second house's notices under the first.
 * A row that names no project cannot be claimed by one.
 */
function noticeProjectId(notification: InboxNotification): string | null {
  const filed = (notification.metadata ?? {}).project_id;
  if (typeof filed === 'string' && filed.length > 0) return filed;
  const match = /\/projects\/([^/?#]+)/.exec(deepLinkOf(notification) ?? '');
  return match ? match[1] : null;
}

export function toNotices(
  notifications: InboxNotification[] | undefined | null,
  projectId: string,
): NoticeReceipt[] {
  return (notifications ?? [])
    .filter((notification) => noticeProjectId(notification) === projectId)
    .map((notification) => ({
      id: notification.id,
      label: noticeLabel(notification),
      detail: noticeDetail(notification),
      anchor: noticeAnchor(deepLinkOf(notification)),
      unread: !(notification.metadata ?? {}).read_at,
      date: parseSourceDate(notification.created_at),
    }))
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
}
