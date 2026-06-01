import { describe, it, expect } from 'vitest';
import {
  buildDecisionInsertPayload,
  buildDecisionOptionInsertPayload,
} from '../../lib/payloads';

// Columns that exist on public.client_decisions after migrations
//   00062 (base) · 00064 (designer_id+trigger) · 00172 (room_id).
// designer_id is intentionally NOT set by the extension — the
// set_decision_designer_id trigger (00064) derives it from designer_clients.
const CLIENT_DECISIONS_COLUMNS = new Set([
  'designer_client_id',
  'project_id',
  'room_id',
  'title',
  'context',
  'due_date',
  'decision_type',
  'blocking_status',
  'status',
  'sent_at',
]);

// Columns on public.client_decision_options after migrations
//   00062 (base) · 00064 (price, quantity) · 00088 (deltas) · 00172 (product_id).
const CLIENT_DECISION_OPTIONS_COLUMNS = new Set([
  'decision_id',
  'name',
  'image_url',
  'designer_note',
  'product_id',
  'is_recommended',
  'price',
  'quantity',
  'sort_order',
]);

describe('buildDecisionInsertPayload', () => {
  it('only includes columns that exist on client_decisions', () => {
    const payload = buildDecisionInsertPayload({
      designerClientId: 'dc-1',
      projectId: 'proj-1',
      roomId: 'room-1',
      title: 'Approve: Test Chair',
      context: 'Captured from the extension',
      dueDate: null,
      status: 'pending',
    });

    for (const key of Object.keys(payload)) {
      expect(
        CLIENT_DECISIONS_COLUMNS.has(key),
        `"${key}" is not a column on the client_decisions table`
      ).toBe(true);
    }
  });

  it('never sets designer_id (left to the DB trigger)', () => {
    const payload = buildDecisionInsertPayload({
      designerClientId: 'dc-1',
      projectId: null,
      roomId: null,
      title: 'x',
      context: null,
      dueDate: null,
    });
    expect('designer_id' in payload).toBe(false);
  });

  it('defaults status to pending and stamps sent_at', () => {
    const payload = buildDecisionInsertPayload({
      designerClientId: 'dc-1',
      projectId: null,
      roomId: null,
      title: 'x',
      context: null,
      dueDate: null,
    });
    expect(payload.status).toBe('pending');
    expect(payload.sent_at).not.toBeNull();
    expect(typeof payload.sent_at).toBe('string');
  });

  it('leaves sent_at null for a draft', () => {
    const payload = buildDecisionInsertPayload({
      designerClientId: 'dc-1',
      projectId: null,
      roomId: null,
      title: 'x',
      context: null,
      dueDate: null,
      status: 'draft',
    });
    expect(payload.status).toBe('draft');
    expect(payload.sent_at).toBeNull();
  });

  it('passes through room_id and project_id as provided', () => {
    const payload = buildDecisionInsertPayload({
      designerClientId: 'dc-1',
      projectId: 'proj-9',
      roomId: 'room-9',
      title: 'x',
      context: null,
      dueDate: null,
    });
    expect(payload.designer_client_id).toBe('dc-1');
    expect(payload.project_id).toBe('proj-9');
    expect(payload.room_id).toBe('room-9');
  });

  it('uses a fixed product decision_type and non-blocking status', () => {
    const payload = buildDecisionInsertPayload({
      designerClientId: 'dc-1',
      projectId: null,
      roomId: null,
      title: 'x',
      context: null,
      dueDate: null,
    });
    expect(payload.decision_type).toBe('product');
    expect(payload.blocking_status).toBe('non_blocking');
  });
});

describe('buildDecisionOptionInsertPayload', () => {
  it('only includes columns that exist on client_decision_options', () => {
    const payload = buildDecisionOptionInsertPayload({
      decisionId: 'dec-1',
      name: 'Test Chair',
      imageUrl: 'https://example.com/img.jpg',
      designerNote: 'note',
      productId: 'prod-1',
      priceCents: 129900,
    });

    for (const key of Object.keys(payload)) {
      expect(
        CLIENT_DECISION_OPTIONS_COLUMNS.has(key),
        `"${key}" is not a column on the client_decision_options table`
      ).toBe(true);
    }
  });

  it('links the captured product via product_id (the T5 deliverable)', () => {
    const payload = buildDecisionOptionInsertPayload({
      decisionId: 'dec-1',
      name: 'Test Chair',
      imageUrl: null,
      designerNote: null,
      productId: 'prod-42',
      priceCents: null,
    });
    expect(payload.product_id).toBe('prod-42');
    expect(payload.decision_id).toBe('dec-1');
  });

  it('marks the single captured option as recommended and qty 1', () => {
    const payload = buildDecisionOptionInsertPayload({
      decisionId: 'dec-1',
      name: 'Test Chair',
      imageUrl: null,
      designerNote: null,
      productId: 'prod-1',
      priceCents: 5000,
    });
    expect(payload.is_recommended).toBe(true);
    expect(payload.quantity).toBe(1);
    expect(payload.sort_order).toBe(0);
    expect(payload.price).toBe(5000);
  });

  it('allows a null product_id and null price', () => {
    const payload = buildDecisionOptionInsertPayload({
      decisionId: 'dec-1',
      name: 'Test Chair',
      imageUrl: null,
      designerNote: null,
      productId: null,
      priceCents: null,
    });
    expect(payload.product_id).toBeNull();
    expect(payload.price).toBeNull();
  });
});
