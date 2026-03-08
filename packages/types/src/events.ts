/**
 * Event Types for Patina Event Catalog
 * Based on the Event Catalog PRD - Standard Envelope Format
 */

// Base Event Envelope
export interface EventEnvelope<T = unknown> {
  id: string; // UUID
  type: string; // e.g., "order.paid", "catalog.product.published"
  ts: string; // ISO-8601 UTC timestamp
  actor: string; // e.g., "user:123" or "system"
  resource: string; // e.g., "order:o_abc123", "product:prod_456"
  payload: T;
  traceId: string;
  version: string; // Schema version e.g., "1.0"
}

// Event Types by Domain
export type EventType =
  // User events
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'designer.verified'
  | 'designer.rejected'
  // Catalog events
  | 'catalog.product.created'
  | 'catalog.product.updated'
  | 'catalog.product.published'
  | 'catalog.product.archived'
  | 'catalog.media.processed'
  // Style events
  | 'style.profile.created'
  | 'style.profile.updated'
  | 'style.signal.recorded'
  // Aesthete events
  | 'aesthete.rec.issued'
  | 'teaching.feedback.recorded'
  | 'teaching.rule.created'
  | 'teaching.rule.updated'
  // Proposal events
  | 'proposal.created'
  | 'proposal.sent'
  | 'proposal.viewed'
  | 'proposal.approved'
  | 'proposal.rejected'
  | 'proposal.changes_requested'
  // Order events
  | 'order.created'
  | 'order.paid'
  | 'order.fulfilled'
  | 'order.cancelled'
  | 'order.refunded'
  | 'cart.updated'
  | 'cart.abandoned'
  | 'cart.converted'
  // Project events
  | 'project.created'
  | 'project.closed'
  | 'task.created'
  | 'task.completed'
  | 'change_order.submitted'
  | 'change_order.approved'
  // Comms events
  | 'comms.message.sent'
  | 'comms.message.read'
  | 'notification.sent'
  | 'notification.failed'
  // Security events
  | 'security.role.assigned'
  | 'privacy.export.completed'
  | 'privacy.delete.completed';

// Event Payloads

export interface UserCreatedPayload {
  userId: string;
  email: string;
  rolePrimary: string;
}

export interface DesignerVerifiedPayload {
  userId: string;
  designerId: string;
  verifiedAt: string;
}

export interface ProductPublishedPayload {
  productId: string;
  slug: string;
  category: string;
  hasHero: boolean;
}

export interface ProductUpdatedPayload {
  productId: string;
  changes: Record<string, unknown>;
}

export interface StyleProfileCreatedPayload {
  profileId: string;
  userId: string;
  budgetBand: string;
  confidence: number;
}

export interface StyleSignalRecordedPayload {
  signalId: string;
  profileId: string;
  type: string;
  productId?: string;
  weight: number;
}

export interface ProposalCreatedPayload {
  proposalId: string;
  clientId: string;
  designerId: string;
  title: string;
}

export interface ProposalApprovedPayload {
  proposalId: string;
  clientId: string;
  approvedAt: string;
}

export interface OrderCreatedPayload {
  orderId: string;
  userId: string;
  total: number;
  currency: string;
  itemCount: number;
}

export interface OrderPaidPayload {
  orderId: string;
  amount: number;
  currency: string;
  paymentMethod: 'credit_card' | 'debit_card' | 'bank_transfer' | 'financing';
  transactionId: string;
  paidAt: string;
}

export interface OrderFulfilledPayload {
  orderId: string;
  shipmentId: string;
  trackingNumber?: string;
  fulfilledAt: string;
}

export interface MessageSentPayload {
  messageId: string;
  threadId: string;
  authorId: string;
  recipientIds: string[];
}

export interface NotificationSentPayload {
  notificationId: string;
  userId: string;
  type: string;
  category: string;
  sentAt: string;
}

// Typed Event Envelopes
export type UserCreatedEvent = EventEnvelope<UserCreatedPayload>;
export type DesignerVerifiedEvent = EventEnvelope<DesignerVerifiedPayload>;
export type ProductPublishedEvent = EventEnvelope<ProductPublishedPayload>;
export type ProductUpdatedEvent = EventEnvelope<ProductUpdatedPayload>;
export type StyleProfileCreatedEvent = EventEnvelope<StyleProfileCreatedPayload>;
export type StyleSignalRecordedEvent = EventEnvelope<StyleSignalRecordedPayload>;
export type ProposalCreatedEvent = EventEnvelope<ProposalCreatedPayload>;
export type ProposalApprovedEvent = EventEnvelope<ProposalApprovedPayload>;
export type OrderCreatedEvent = EventEnvelope<OrderCreatedPayload>;
export type OrderPaidEvent = EventEnvelope<OrderPaidPayload>;
export type OrderFulfilledEvent = EventEnvelope<OrderFulfilledPayload>;
export type MessageSentEvent = EventEnvelope<MessageSentPayload>;
export type NotificationSentEvent = EventEnvelope<NotificationSentPayload>;

// Union type of all events
export type PatinaEvent =
  | UserCreatedEvent
  | DesignerVerifiedEvent
  | ProductPublishedEvent
  | ProductUpdatedEvent
  | StyleProfileCreatedEvent
  | StyleSignalRecordedEvent
  | ProposalCreatedEvent
  | ProposalApprovedEvent
  | OrderCreatedEvent
  | OrderPaidEvent
  | OrderFulfilledEvent
  | MessageSentEvent
  | NotificationSentEvent;

// Type guard utilities
export function isEventType<T>(event: EventEnvelope, type: EventType): event is EventEnvelope<T> {
  return event.type === type;
}

// Outbox Event (for database storage)
export interface OutboxEvent {
  id: string;
  type: string;
  payload: unknown;
  headers?: Record<string, string>;
  published: boolean;
  createdAt: Date;
  publishedAt?: Date;
  retryCount: number;
  lastError?: string;
}
