/**
 * The Post — row-derivation contract (R82). Pure logic, no DOM, no component
 * imports (stays off the help-system → @portabletext ESM trap).
 *
 * The load-bearing question this pins: WHICH notification subjects render as
 * quiet cross-references ("on your Desk") versus plain Record notices — and
 * that a cross-reference never points at its own act route.
 */
import {
  deriveRecordRow,
  documentHrefFor,
  deepLinkFor,
  notificationTitle,
  notificationBody,
  letterHref,
  letterTitle,
  relTime,
  NOTIFICATION_NEED_KIND,
} from '../post-derivation';
import type { InboxNotification, InboxMessage } from '@patina/supabase';

function notif(over: Partial<InboxNotification> = {}): InboxNotification {
  return {
    id: 'n1',
    user_id: 'u1',
    type: 'generic_event',
    channel: 'in_app',
    status: 'delivered',
    template_id: null,
    metadata: {},
    opened_at: null,
    clicked_at: null,
    sent_at: null,
    created_at: '2026-07-01T12:00:00Z',
    ...over,
  };
}

function letter(over: Partial<InboxMessage> = {}): InboxMessage {
  return {
    id: 'm1',
    thread_id: 't1',
    sender_id: 's1',
    body: 'Hello',
    created_at: '2026-07-01T12:00:00Z',
    edited_at: null,
    deleted_at: null,
    system: false,
    thread: { id: 't1', kind: 'direct', title: null, project_id: null, last_message_at: '2026-07-01T12:00:00Z' },
    sender: { id: 's1', full_name: 'Sarah Chen', avatar_url: null },
    is_unread: true,
    ...over,
  };
}

describe('deriveRecordRow — cross-reference vs notice (R82)', () => {
  describe('need-backed subjects become cross-references', () => {
    // Every mapped type must classify as a cross-reference — the Desk holds the act.
    for (const [type, needKind] of Object.entries(NOTIFICATION_NEED_KIND)) {
      it(`${type} → cross_reference (${needKind})`, () => {
        const row = deriveRecordRow(notif({ type }));
        expect(row.kind).toBe('cross_reference');
        expect(row.onDesk).toBe(true);
        expect(row.needKind).toBe(needKind);
      });
    }

    it('is case-insensitive on the type', () => {
      const row = deriveRecordRow(notif({ type: 'DECISION_OVERDUE' }));
      expect(row.kind).toBe('cross_reference');
      expect(row.needKind).toBe('overdue_decision');
    });

    it('points at the Desk when the notice carries no project', () => {
      const row = deriveRecordRow(notif({ type: 'invoice_overdue', metadata: {} }));
      expect(row.href).toBe('/desk');
    });

    it('points at the document when the notice names a project', () => {
      const row = deriveRecordRow(
        notif({ type: 'decision_overdue', metadata: { project_id: 'p-42' } }),
      );
      expect(row.href).toBe('/doc/p-42');
    });

    it('points at the section anchor when the notice names one', () => {
      const row = deriveRecordRow(
        notif({ type: 'damage_claim_drafted', metadata: { project_id: 'p-42', section: 'install' } }),
      );
      expect(row.href).toBe('/doc/p-42#doc-section-install');
    });

    it('never follows the notice’s own act route — the Desk carries it', () => {
      // A legacy AR deep link must NOT win over the Desk/document for a
      // need-backed row (that would be the duplicate act R82 forbids).
      const row = deriveRecordRow(
        notif({ type: 'invoice_ar_flagged', metadata: { deep_link: '/portal/billing/ar' } }),
      );
      expect(row.href).toBe('/desk');
    });
  });

  describe('everything else is a plain notice', () => {
    for (const type of [
      'invoice_paid',
      'invoice_payment_received',
      'invoice_payment_failed',
      'invoice_reminder',
      'po_sent',
      'decision_resolved',
      'account_created',
      'milestone_due',
    ]) {
      it(`${type} → notice`, () => {
        const row = deriveRecordRow(notif({ type }));
        expect(row.kind).toBe('notice');
        expect(row.onDesk).toBe(false);
        expect(row.needKind).toBeNull();
      });
    }

    it('navigates to the document when a notice names a project', () => {
      const row = deriveRecordRow(notif({ type: 'invoice_paid', metadata: { project_id: 'p-7' } }));
      expect(row.href).toBe('/doc/p-7');
    });

    it('does NOT leave the Document to a legacy /portal deep link', () => {
      const row = deriveRecordRow(
        notif({ type: 'invoice_paid', metadata: { deep_link: '/portal/billing/ar' } }),
      );
      expect(row.href).toBeNull();
    });

    it('honors a deep link that is already a Document route', () => {
      const row = deriveRecordRow(
        notif({ type: 'account_created', metadata: { deep_link: '/people?person=x&role=client' } }),
      );
      expect(row.href).toBe('/people?person=x&role=client');
    });

    it('is read-only (href null) when a notice carries no navigable target', () => {
      const row = deriveRecordRow(notif({ type: 'account_created', metadata: {} }));
      expect(row.href).toBeNull();
    });
  });

  it('an unknown type falls through to a plain notice', () => {
    const row = deriveRecordRow(notif({ type: 'brand_new_signal_2027' }));
    expect(row.kind).toBe('notice');
    expect(row.needKind).toBeNull();
  });
});

describe('metadata readers', () => {
  it('documentHrefFor reads snake and camel project keys', () => {
    expect(documentHrefFor(notif({ metadata: { project_id: 'a' } }))).toBe('/doc/a');
    expect(documentHrefFor(notif({ metadata: { projectId: 'b' } }))).toBe('/doc/b');
    expect(documentHrefFor(notif({ metadata: {} }))).toBeNull();
  });

  it('deepLinkFor reads deep_link then url', () => {
    expect(deepLinkFor(notif({ metadata: { deep_link: '/x' } }))).toBe('/x');
    expect(deepLinkFor(notif({ metadata: { url: '/y' } }))).toBe('/y');
    expect(deepLinkFor(notif({ metadata: {} }))).toBeNull();
  });

  it('notificationTitle prefers subject/headline/title, then humanizes the type', () => {
    expect(notificationTitle(notif({ metadata: { subject: 'A subject' } }))).toBe('A subject');
    expect(notificationTitle(notif({ type: 'decision_overdue', metadata: {} }))).toBe(
      'Decision Overdue',
    );
  });

  it('notificationBody prefers preview/message/body', () => {
    expect(notificationBody(notif({ metadata: { preview: 'p' } }))).toBe('p');
    expect(notificationBody(notif({ metadata: { message: 'm' } }))).toBe('m');
    expect(notificationBody(notif({ metadata: {} }))).toBe('');
  });
});

describe('Letters', () => {
  it('opens the People Room’s Threads view on the shared conversation', () => {
    expect(letterHref(letter({ thread_id: 'thread-9' }))).toBe('/people?thread=thread-9');
  });

  it('titles from the thread title, else a scope label', () => {
    expect(letterTitle(letter({ thread: { id: 't', kind: 'project', title: 'Aspen kitchen', project_id: 'p', last_message_at: 'x' } }))).toBe(
      'Aspen kitchen',
    );
    expect(letterTitle(letter({ thread: { id: 't', kind: 'project', title: null, project_id: 'p', last_message_at: 'x' } }))).toBe(
      'Project conversation',
    );
    expect(letterTitle(letter({ thread: { id: 't', kind: 'vendor_brief', title: null, project_id: null, last_message_at: 'x' } }))).toBe(
      'Vendor brief',
    );
    expect(letterTitle(letter({ thread: null }))).toBe('Direct message');
  });
});

describe('relTime', () => {
  const now = new Date('2026-07-01T12:00:00Z');
  it('renders coarse relative buckets', () => {
    expect(relTime('2026-07-01T11:59:30Z', now)).toBe('30s ago');
    expect(relTime('2026-07-01T11:30:00Z', now)).toBe('30m ago');
    expect(relTime('2026-07-01T09:00:00Z', now)).toBe('3h ago');
    expect(relTime('2026-06-29T12:00:00Z', now)).toBe('2d ago');
  });
  it('falls back to a date past a week', () => {
    expect(relTime('2026-06-01T12:00:00Z', now)).toMatch(/2026|6\/1|Jun/);
  });
  it('is empty for an unparseable value', () => {
    expect(relTime('not-a-date', now)).toBe('');
  });
});
