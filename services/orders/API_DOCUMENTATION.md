# Patina Orders & Payments API Documentation

**Service Version:** 1.0.0
**Last Updated:** 2025-10-03
**Base URL:** `/v1`

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [API Endpoints](#api-endpoints)
3. [Payment Flows](#payment-flows)
4. [Stripe Integration](#stripe-integration)
5. [Security & Compliance](#security--compliance)
6. [Testing](#testing)
7. [Deployment](#deployment)

---

## Architecture Overview

### Core Modules

The Orders & Payments service is built on NestJS with the following modules:

1. **Carts Module** - Shopping cart management
2. **Checkout Module** - Stripe checkout session creation
3. **Orders Module** - Order lifecycle and state machine
4. **Payments Module** - Payment processing and tracking
5. **Refunds Module** - Full and partial refunds
6. **Webhooks Module** - Stripe webhook handling with signature verification
7. **Reconciliation Module** - Daily Stripe-to-Patina reconciliation
8. **Fulfillment Module** - Shipment tracking

### Technology Stack

- **Framework:** NestJS 10.x
- **Database:** PostgreSQL 16 (OCI Database)
- **ORM:** Prisma 5.x
- **Payment Provider:** Stripe (Payment Intents API)
- **Cache:** Redis (cart sessions, idempotency)
- **Events:** OCI Streaming
- **Security:** PCI-DSS compliant (no card data stored)

### State Machine

Orders follow this state machine:

```
created → paid → processing → fulfilled → closed
   ↓        ↓         ↓
canceled  refunded  refunded
```

**Valid Transitions:**
- `created` → `paid`, `canceled`
- `paid` → `processing`, `fulfilled`, `refunded`, `canceled`
- `processing` → `fulfilled`, `refunded`, `canceled`
- `fulfilled` → `closed`, `refunded`
- `refunded` → `closed`
- `closed` → (terminal state)
- `canceled` → (terminal state)

---

## API Endpoints

### Carts API

#### Create Cart
```http
POST /v1/carts
Content-Type: application/json

{
  "userId": "user-123",  // optional for logged-in users
  "currency": "USD",
  "items": [             // optional initial items
    {
      "productId": "prod-001",
      "variantId": "var-001",
      "qty": 2
    }
  ]
}
```

**Response:** `201 Created`
```json
{
  "id": "cart-abc123",
  "userId": "user-123",
  "sessionToken": null,
  "status": "active",
  "currency": "USD",
  "subtotal": "0.00",
  "discountAmount": "0.00",
  "taxTotal": "0.00",
  "shippingTotal": "0.00",
  "total": "0.00",
  "items": [],
  "expiresAt": "2025-11-03T00:00:00Z",
  "createdAt": "2025-10-03T12:00:00Z",
  "updatedAt": "2025-10-03T12:00:00Z"
}
```

#### Get Cart
```http
GET /v1/carts/{cartId}
```

**Response:** `200 OK`

#### Add Item to Cart
```http
POST /v1/carts/{cartId}/items
Content-Type: application/json

{
  "productId": "prod-sofa-001",
  "variantId": "var-gray-large",
  "qty": 1
}
```

**Response:** `201 Created` - Returns updated cart

#### Update Cart Item
```http
PATCH /v1/carts/{cartId}/items/{itemId}
Content-Type: application/json

{
  "qty": 3,
  "metadata": {}
}
```

**Response:** `200 OK` - Returns updated cart

#### Remove Cart Item
```http
DELETE /v1/carts/{cartId}/items/{itemId}
```

**Response:** `200 OK` - Returns updated cart

#### Apply Discount
```http
POST /v1/carts/{cartId}/apply-discount
Content-Type: application/json

{
  "code": "SUMMER2025"
}
```

**Response:** `200 OK` - Returns cart with discount applied

**Error Responses:**
- `404` - Discount code not found
- `400` - Discount expired or usage limit reached

#### Remove Discount
```http
DELETE /v1/carts/{cartId}/discount
```

**Response:** `200 OK`

---

### Checkout API

#### Create Checkout Session (Stripe Checkout)
```http
POST /v1/checkout
Content-Type: application/json
Idempotency-Key: checkout-{unique-id}

{
  "cartId": "cart-abc123",
  "userId": "user-123",
  "returnUrl": "https://example.com/order/success",
  "cancelUrl": "https://example.com/cart",
  "customerEmail": "customer@example.com",
  "shippingAddressId": "addr-123",
  "billingAddressId": "addr-456",
  "metadata": {
    "proposalId": "proposal-789"
  }
}
```

**Response:** `201 Created`
```json
{
  "sessionId": "cs_test_abc123",
  "sessionUrl": "https://checkout.stripe.com/c/pay/cs_test_abc123",
  "orderNumber": "ORD-20251003-A1B2"
}
```

**Notes:**
- Uses `Idempotency-Key` header to prevent duplicate checkouts
- Creates order in `created` status
- Returns Stripe Checkout URL for redirect
- Supports Apple Pay/Google Pay via Stripe
- Automatically enables Stripe Tax

#### Create Payment Intent (Direct Integration)
```http
POST /v1/checkout/payment-intent
Content-Type: application/json
Idempotency-Key: payment-{unique-id}

{
  "cartId": "cart-abc123",
  "userId": "user-123",
  "shippingAddressId": "addr-123",
  "billingAddressId": "addr-456"
}
```

**Response:** `201 Created`
```json
{
  "clientSecret": "pi_abc123_secret_xyz",
  "paymentIntentId": "pi_abc123",
  "orderNumber": "ORD-20251003-C3D4"
}
```

---

### Orders API

#### Get Order by ID
```http
GET /v1/orders/{orderId}
```

**Response:** `200 OK`
```json
{
  "id": "order-123",
  "orderNumber": "ORD-20251003-A1B2",
  "userId": "user-123",
  "status": "paid",
  "paymentStatus": "captured",
  "fulfillmentStatus": "unfulfilled",
  "currency": "USD",
  "subtotal": "299.99",
  "discountTotal": "30.00",
  "taxTotal": "22.27",
  "shippingTotal": "15.00",
  "total": "307.26",
  "items": [
    {
      "id": "item-1",
      "productId": "prod-sofa-001",
      "variantId": "var-gray-large",
      "name": "Modern Sofa - Gray Large",
      "sku": "SOFA-GRAY-LG",
      "qty": 1,
      "unitPrice": "299.99",
      "subtotal": "299.99",
      "taxAmount": "22.27",
      "discountAlloc": "30.00",
      "total": "292.26"
    }
  ],
  "payments": [
    {
      "id": "payment-1",
      "status": "succeeded",
      "amount": "307.26",
      "paymentIntentId": "pi_abc123",
      "chargeId": "ch_xyz789",
      "last4": "4242",
      "brand": "visa"
    }
  ],
  "refunds": [],
  "shipments": [],
  "shippingAddress": {
    "line1": "123 Main St",
    "city": "San Francisco",
    "region": "CA",
    "postal": "94102",
    "country": "US"
  },
  "paidAt": "2025-10-03T12:30:00Z",
  "createdAt": "2025-10-03T12:00:00Z",
  "updatedAt": "2025-10-03T12:30:00Z"
}
```

#### List Orders
```http
GET /v1/orders?userId={userId}&status={status}&page=1&limit=20
```

**Query Parameters:**
- `userId` - Filter by user ID
- `status` - Filter by order status
- `paymentStatus` - Filter by payment status
- `fulfillmentStatus` - Filter by fulfillment status
- `fromDate` - ISO date string (start)
- `toDate` - ISO date string (end)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)

**Response:** `200 OK`
```json
{
  "data": [
    { "id": "order-1", "orderNumber": "ORD-001", "status": "paid", "total": "307.26" },
    { "id": "order-2", "orderNumber": "ORD-002", "status": "fulfilled", "total": "150.00" }
  ],
  "pagination": {
    "total": 45,
    "skip": 0,
    "take": 20
  }
}
```

#### Update Order Status
```http
PATCH /v1/orders/{orderId}
Content-Type: application/json

{
  "status": "fulfilled",
  "internalNotes": "Shipped via FedEx"
}
```

**Response:** `200 OK` - Returns updated order

**Validation:** Enforces state machine transitions

---

### Refunds API

#### Create Refund
```http
POST /v1/orders/{orderId}/refunds
Content-Type: application/json
Idempotency-Key: refund-{unique-id}

{
  "amount": 150.00,  // optional, defaults to full refund
  "reason": "requested_by_customer",
  "description": "Customer changed mind"
}
```

**Response:** `201 Created`
```json
{
  "id": "refund-123",
  "orderId": "order-123",
  "amount": "150.00",
  "currency": "USD",
  "reason": "requested_by_customer",
  "status": "succeeded",
  "providerRefundId": "re_stripe123",
  "processedAt": "2025-10-03T14:00:00Z",
  "createdAt": "2025-10-03T14:00:00Z"
}
```

**Supported Reasons:**
- `duplicate`
- `fraudulent`
- `requested_by_customer`

#### List Refunds for Order
```http
GET /v1/orders/{orderId}/refunds
```

**Response:** `200 OK` - Array of refunds

---

### Fulfillment API

#### Create Shipment
```http
POST /v1/orders/{orderId}/shipments
Content-Type: application/json

{
  "carrier": "FedEx",
  "trackingNumber": "123456789012",
  "method": "standard",
  "notes": "Fragile items"
}
```

**Response:** `201 Created`
```json
{
  "id": "shipment-123",
  "orderId": "order-123",
  "shipmentNumber": "SHIP-001",
  "carrier": "FedEx",
  "trackingNumber": "123456789012",
  "trackingUrl": "https://fedex.com/track/123456789012",
  "status": "pending",
  "method": "standard",
  "shippedAt": null,
  "estimatedDelivery": "2025-10-10T00:00:00Z",
  "createdAt": "2025-10-03T15:00:00Z"
}
```

#### Update Shipment Status
```http
PATCH /v1/shipments/{shipmentId}
Content-Type: application/json

{
  "status": "in_transit",
  "shippedAt": "2025-10-03T16:00:00Z"
}
```

**Shipment Statuses:**
- `pending`
- `in_transit`
- `out_for_delivery`
- `delivered`
- `exception`
- `returned`

---

### Webhooks API

#### Stripe Webhook Endpoint
```http
POST /v1/webhooks/stripe
Stripe-Signature: t=timestamp,v1=signature

{
  "id": "evt_abc123",
  "type": "payment_intent.succeeded",
  "data": { ... }
}
```

**Handled Events:**
- `checkout.session.completed`
- `payment_intent.created`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `charge.succeeded`
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.closed`
- `refund.created`
- `refund.updated`

**Security:**
- Validates Stripe webhook signature
- Rejects requests with timestamp drift > 5 minutes
- Implements idempotency to prevent duplicate processing

---

## Payment Flows

### Flow 1: Stripe Checkout (Recommended)

1. **Client:** Create cart and add items
2. **Client:** POST `/v1/checkout` with cart ID
3. **Server:** Create order (status: `created`)
4. **Server:** Create Stripe Checkout Session
5. **Server:** Return `sessionUrl` to client
6. **Client:** Redirect to Stripe Checkout
7. **Customer:** Complete payment on Stripe
8. **Stripe:** Send `checkout.session.completed` webhook
9. **Server:** Update order with payment intent ID
10. **Stripe:** Send `payment_intent.succeeded` webhook
11. **Server:** Create payment record, update order to `paid`
12. **Server:** Emit `order.paid` event
13. **Client:** Redirect to success page

### Flow 2: Payment Intent (Custom UI)

1. **Client:** Create cart and add items
2. **Client:** POST `/v1/checkout/payment-intent`
3. **Server:** Create order and Payment Intent
4. **Server:** Return `clientSecret`
5. **Client:** Use Stripe.js to collect payment
6. **Client:** Confirm Payment Intent with Stripe
7. **Stripe:** Process payment
8. **Stripe:** Send `payment_intent.succeeded` webhook
9. **Server:** Update order to `paid`

### Flow 3: Refund Processing

1. **Admin:** POST `/v1/orders/{id}/refunds`
2. **Server:** Validate order is paid
3. **Server:** Create Stripe refund
4. **Server:** Create refund record (status: `succeeded`)
5. **Stripe:** Send `charge.refunded` webhook
6. **Server:** Update order payment status
7. **Server:** If fully refunded, update order status to `refunded`
8. **Server:** Emit `refund.created` event

---

## Stripe Integration

### Configuration

Required environment variables:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### Features Used

1. **Payment Intents API** - Modern payment flow with SCA support
2. **Stripe Checkout** - Hosted checkout page
3. **Stripe Tax** - Automatic tax calculation
4. **Webhooks** - Real-time event notifications
5. **Idempotency** - Safe retry mechanism
6. **Customers** - Saved payment methods

### 3D Secure (SCA) Support

Automatically handled by Stripe Payment Intents:

- Strong Customer Authentication required in EU
- Payment Intent goes to `requires_action` status
- Client handles 3DS challenge via Stripe.js
- Payment continues after authentication

### Error Handling

Common Stripe errors:

- `card_declined` - Card was declined
- `insufficient_funds` - Not enough balance
- `expired_card` - Card has expired
- `incorrect_cvc` - Wrong CVV/CVC
- `processing_error` - Generic processing error

All errors are captured in payment records with `failureCode` and `failureMessage`.

---

## Security & Compliance

### PCI Compliance

- **No card data stored** - All card details handled by Stripe
- **Tokenization** - Only store Stripe payment method IDs
- **Webhook signatures** - Verify all webhooks
- **TLS/HTTPS** - All communication encrypted
- **Scope minimization** - PCI scope limited to Stripe integration

### Authentication & Authorization

- OAuth2/OIDC tokens required
- JWT validation via OCI API Gateway
- Rate limiting: 60 requests/minute per user
- Idempotency keys for mutations

### Data Privacy (GDPR)

- PII minimized to email and addresses
- Customer data exportable
- Right to be forgotten supported
- Logs redact sensitive data
- 30-day retention for carts

### Audit Logging

All operations logged with:

- Entity type and ID
- Action performed
- Actor (user/system/admin)
- Timestamp
- IP address
- Changes made

Audit logs stored in `audit_logs` table, retention: 7 years

---

## Testing

### Unit Tests

Run unit tests:

```bash
npm run test
```

**Coverage Targets:**
- Branches: ≥80%
- Functions: ≥80%
- Lines: ≥80%
- Statements: ≥80%

**Key Test Files:**
- `/src/modules/carts/carts.service.spec.ts` - Cart pricing logic
- `/src/modules/orders/orders.service.spec.ts` - State machine transitions
- `/src/modules/webhooks/webhooks.service.spec.ts` - Webhook handling

### Integration Tests

Run E2E tests:

```bash
npm run test:e2e
```

**Test Scenarios:**
- Complete checkout flow (cart → checkout → payment → fulfillment)
- Discount code application
- Refund processing
- Webhook idempotency
- Error handling

**Key Test Files:**
- `/test/checkout-flow.e2e-spec.ts` - Full user journey

### Stripe Testing

Use Stripe test mode with test cards:

- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3DS Required: `4000 0025 0000 3155`
- Insufficient funds: `4000 0000 0000 9995`

Trigger webhooks:

```bash
stripe trigger payment_intent.succeeded
stripe trigger charge.refunded
```

---

## Deployment

### Environment Setup

**Development:**
```env
NODE_ENV=development
DATABASE_URL=postgresql://user:pass@localhost:5432/orders_dev
REDIS_HOST=localhost
REDIS_PORT=6379
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
```

**Production:**
```env
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@oci-db:5432/orders_prod
REDIS_HOST=redis.oci.internal
REDIS_PORT=6379
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_live_...
RECONCILIATION_WINDOW_HOURS=24
CART_EXPIRY_DAYS=30
ORDER_NUMBER_PREFIX=ORD
```

### Build & Run

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Build
npm run build

# Start production
npm run start:prod
```

### Health Checks

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" },
    "stripe": { "status": "up" }
  }
}
```

### Monitoring

**Key Metrics:**
- Checkout conversion rate
- Payment success rate
- p95 latency (checkout < 400ms)
- Webhook processing time
- Reconciliation discrepancies
- Refund percentage

**Alerts:**
- Payment failure rate > 5%
- Webhook processing failures
- Reconciliation discrepancies detected
- Database connection issues

---

## API Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "ORDER.PAYMENT_FAILED",
    "message": "Payment was declined",
    "details": {
      "reason": "insufficient_funds",
      "paymentIntentId": "pi_abc123"
    }
  },
  "statusCode": 400,
  "timestamp": "2025-10-03T12:00:00Z",
  "path": "/v1/checkout"
}
```

**Common Error Codes:**
- `CART.NOT_FOUND` - Cart does not exist
- `CART.EXPIRED` - Cart has expired
- `CART.EMPTY` - Cannot checkout empty cart
- `ORDER.NOT_FOUND` - Order does not exist
- `ORDER.INVALID_TRANSITION` - Invalid status change
- `PAYMENT.FAILED` - Payment processing failed
- `REFUND.FAILED` - Refund processing failed
- `DISCOUNT.INVALID` - Invalid discount code
- `DISCOUNT.EXPIRED` - Discount code expired

---

## Rate Limits

- **Global:** 60 requests/minute per IP
- **Checkout:** 10 checkouts/minute per user
- **Webhooks:** No limit (verified by signature)

Rate limit headers:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1696348800
```

---

## Support & Contact

**Engineering Team:** Team Golf - Orders & Payments
**Documentation:** `/home/middle/patina/docs/features/12-orders-payments/`
**PRD:** `Patina_Orders_Payments_PRD_OCI_Extended.md`

**Service Status:** Production Ready ✅
**Test Coverage:** 80%+ ✅
**PCI Compliance:** Yes ✅
**Stripe Integration:** Complete ✅
