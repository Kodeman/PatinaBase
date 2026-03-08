# Payment Flow Documentation

## Overview

This document describes the complete payment flow for Patina Orders & Payments service, including all state transitions, webhook handling, and error scenarios.

---

## Payment Flow Diagrams

### 1. Standard Checkout Flow (Stripe Checkout)

```
[Client] → Create Cart → Add Items → Apply Discount (optional)
    ↓
[Client] → POST /v1/checkout (with cartId)
    ↓
[Orders Service] → Create Stripe Checkout Session
    ↓                Create Order (status: created, paymentStatus: pending)
    ↓
[Client] ← Return { sessionId, sessionUrl, orderNumber }
    ↓
[Client] → Redirect to Stripe Checkout (sessionUrl)
    ↓
[Stripe] → Customer enters payment details
    ↓
    ├─ SUCCESS → checkout.session.completed webhook
    │      ↓
    │   [Orders Service] → Update Order with paymentIntentId
    │      ↓
    │   payment_intent.succeeded webhook
    │      ↓
    │   [Orders Service] → Create Payment record
    │                   → Update Order (status: paid, paymentStatus: captured)
    │                   → Mark Cart as converted
    │                   → Emit payment.succeeded event
    │      ↓
    │   [Comms Service] → Send order confirmation email
    │
    └─ CANCEL → Customer returns to cancelUrl
           ↓
        Cart remains active (can retry checkout)
```

### 2. Direct Payment Intent Flow

```
[Client] → POST /v1/checkout/payment-intent (with cartId)
    ↓
[Orders Service] → Create Stripe Payment Intent
    ↓                Create Order (status: created, paymentStatus: pending)
    ↓
[Client] ← Return { clientSecret, paymentIntentId, orderNumber }
    ↓
[Client] → Confirm Payment Intent with Stripe.js
    ↓
[Stripe] → Process payment
    ↓
    ├─ SUCCESS → payment_intent.succeeded webhook
    │      ↓
    │   [Orders Service] → Create Payment record
    │                   → Update Order (status: paid, paymentStatus: captured)
    │                   → Mark Cart as converted
    │      ↓
    │   [Comms Service] → Send order confirmation
    │
    ├─ REQUIRES_ACTION (3DS) → Client handles 3DS challenge
    │      ↓
    │   Customer completes 3DS
    │      ↓
    │   payment_intent.succeeded webhook (on success)
    │
    └─ FAILED → payment_intent.payment_failed webhook
           ↓
        [Orders Service] → Create failed Payment record
                        → Update Order (paymentStatus: failed)
                        → Emit payment.failed event
           ↓
        [Comms Service] → Send payment failure notification
```

---

## State Transitions

### Order Status State Machine

```
created ──────────────→ paid ──────────→ processing ──────→ fulfilled ──────→ closed
   │                       │                  │                  │
   │                       │                  │                  ↓
   │                       │                  └─────────────→ refunded ──────→ closed
   │                       │
   │                       └──────────────────────────────→ refunded
   │
   └──────────────────────────────────────────────────────→ canceled
```

### Payment Status Values

- `pending` - Payment not yet initiated
- `authorized` - Payment authorized (not captured)
- `captured` - Payment captured (funds secured)
- `failed` - Payment failed
- `refunded` - Payment fully refunded
- `canceled` - Payment canceled before capture

---

## Webhook Event Handling

### Critical Webhooks (Must Process)

#### 1. `checkout.session.completed`

**Purpose**: Links Stripe Checkout Session to Order

**Processing**:
1. Find Order by `checkoutSessionId`
2. Update Order with `paymentIntentId` and `customerId`
3. Emit `checkout.completed` event

**Idempotency**: Safe to process multiple times (update is idempotent)

#### 2. `payment_intent.succeeded`

**Purpose**: Confirms successful payment and transitions order to paid

**Processing**:
1. Find Order by `paymentIntentId`
2. Create Payment record with charge details
3. Update Order:
   - `status` → `paid`
   - `paymentStatus` → `captured`
   - `paidAt` → current timestamp
4. Mark Cart as `converted`
5. Create audit log
6. Emit `payment.succeeded` event

**Idempotency**: Check if Payment with `chargeId` already exists before creating

**Triggers**: Order confirmation email, inventory reservation (if applicable)

#### 3. `payment_intent.payment_failed`

**Purpose**: Records payment failure

**Processing**:
1. Find Order by `paymentIntentId`
2. Create failed Payment record with error details
3. Update Order `paymentStatus` → `failed`
4. Emit `payment.failed` event

**Customer Action**: Retry payment with different card or method

#### 4. `charge.refunded`

**Purpose**: Records refund and updates order status

**Processing**:
1. Find Payment by `chargeId`
2. For each refund in `charge.refunds.data`:
   - Check if Refund already exists (by `providerRefundId`)
   - Create Refund record if new
   - Emit `refund.succeeded` event
3. If fully refunded (`charge.refunded === true`):
   - Update Order `status` → `refunded`, `paymentStatus` → `refunded`

**Idempotency**: Check for existing refund by `providerRefundId`

#### 5. `charge.dispute.created`

**Purpose**: Alert about chargeback/dispute

**Processing**:
1. Find Payment by `chargeId`
2. Emit `dispute.created` event
3. Notify Admin/Support (create alert in Admin Portal)

**Manual Action**: Support team must respond to dispute in Stripe Dashboard

#### 6. `charge.dispute.closed`

**Purpose**: Record dispute outcome

**Processing**:
1. Find Payment by `chargeId`
2. Emit `dispute.closed` event with status (won/lost)
3. If lost and not refunded, may need to create Refund record

---

## Webhook Signature Verification

### Security Requirements

1. **Always verify webhook signature** before processing
2. **Reject requests** with invalid signatures
3. **Check timestamp** - reject if > 5 minutes old (prevents replay attacks)
4. **Use raw body** for signature verification (not parsed JSON)

### Implementation

```typescript
const signature = headers['stripe-signature'];
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const event = stripe.webhooks.constructEvent(
  rawBody,
  signature,
  webhookSecret
);
// Verified! Process event...
```

---

## Idempotency Strategy

### For API Endpoints

**Required Header**: `Idempotency-Key: <uuid>`

**Endpoints**:
- `POST /v1/checkout`
- `POST /v1/checkout/payment-intent`
- `POST /v1/orders/{id}/refunds`

**Implementation**:
1. Check if `IdempotencyKey` exists in database
2. If exists and not expired:
   - Return cached response (same status code and body)
3. If new:
   - Store key with request/response
   - Set expiry (24 hours)
   - Process request normally

### For Webhooks

**Strategy**: Deduplicate by `event.id`

**Implementation**:
1. Check if event already processed (query audit log or idempotency table)
2. If processed: return 200 (acknowledge receipt)
3. If new: process and record `event.id`

---

## Error Scenarios & Recovery

### Scenario 1: Webhook Missed (Network Failure)

**Detection**: Reconciliation job finds Stripe payment without corresponding Order

**Recovery**:
1. Fetch Payment Intent from Stripe
2. Find Order by metadata (`cartId` or `orderNumber`)
3. Create Payment record
4. Update Order status
5. Emit events (late)

### Scenario 2: Order Created but Payment Intent Not Created

**Detection**: Order stuck in `created` status for > 30 minutes

**Recovery**:
1. Check if Payment Intent exists in Stripe (by Order ID in metadata)
2. If exists: Link to Order
3. If not: Mark Order as `canceled` and alert

### Scenario 3: Payment Succeeded but Order Not Updated

**Detection**: Order in `created` status but Payment exists with `succeeded` status

**Recovery**:
1. Find Order by `paymentIntentId`
2. Re-run status update logic
3. Emit events

### Scenario 4: Double Payment (Idempotency Failure)

**Detection**: Two Payment records for same Order

**Prevention**: Check for existing Payment with same `chargeId` before creating

**Recovery**:
1. Identify duplicate
2. Keep the first Payment
3. Initiate refund for duplicate charge
4. Create audit log

---

## Testing Payment Flows

### Test Cards (Stripe Test Mode)

**Successful Payment**:
- `4242 4242 4242 4242` (Visa)
- `5555 5555 5555 4444` (Mastercard)

**Requires 3DS**:
- `4000 0025 0000 3155`

**Declined**:
- `4000 0000 0000 9995` (insufficient funds)
- `4000 0000 0000 0002` (declined)

**Disputed**:
- `4000 0000 0000 0259` (disputed)

### Mock Webhook Testing

```bash
# Install Stripe CLI
stripe listen --forward-to localhost:3002/v1/webhooks/stripe

# Trigger test webhook
stripe trigger payment_intent.succeeded
```

---

## Monitoring & Alerts

### Key Metrics

1. **Checkout Conversion Rate**: `(paid orders / checkout sessions created) * 100`
2. **Payment Failure Rate**: `(failed payments / total payment attempts) * 100`
3. **3DS Challenge Rate**: `(requires_action / total payments) * 100`
4. **Webhook Processing Latency**: Time from webhook received to order updated (p95 < 2s)
5. **Reconciliation Discrepancies**: Count of unmatched payments (target: 0)

### Critical Alerts

- Payment failure rate > 5% (spike)
- Webhook processing failures > 1% (reliability issue)
- Reconciliation discrepancies > 0 (data integrity issue)
- Order stuck in `created` for > 1 hour (needs manual review)

---

## Security Considerations

### PCI Compliance

- **No card data stored** in Patina database
- **Only tokens/IDs** from Stripe (`paymentIntentId`, `chargeId`, `customerId`)
- **Last 4 digits** stored for display purposes (not sensitive)

### Webhook Endpoint Security

1. **Signature verification** (required)
2. **IP allowlist** (optional, Stripe IPs)
3. **Private ingress** (OCI security groups)
4. **Rate limiting** (protect against DDoS)

### Secrets Management

- Store Stripe keys in **OCI Vault**
- Rotate secrets periodically
- Use different keys for test/production
- Never log keys or raw webhook payloads with sensitive data

---

## Troubleshooting Guide

### Order Stuck in "Created"

**Check**:
1. Stripe Dashboard - was payment successful?
2. Webhook logs - was webhook delivered?
3. Application logs - any errors processing webhook?

**Action**:
- If payment succeeded but webhook missed: manually trigger reconciliation
- If payment failed: contact customer to retry

### Payment Succeeded but Customer Not Notified

**Check**:
1. Order status in database
2. Events published to OCI Streaming
3. Comms service logs

**Action**:
- Re-emit `payment.succeeded` event
- Manually send confirmation email

### Duplicate Charges

**Check**:
1. Idempotency keys in logs
2. Multiple Payment records for same Order
3. Stripe Dashboard - actual charges

**Action**:
- Refund duplicate charge immediately
- Fix idempotency implementation
- Notify customer

---

## Related Documentation

- [Reconciliation Procedures](./RECONCILIATION.md)
- [API Reference](./API_REFERENCE.md)
- [Stripe Integration Guide](https://stripe.com/docs)
