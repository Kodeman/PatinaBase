# Reconciliation Procedures

## Overview

Daily reconciliation ensures that all Stripe payments are properly recorded in Patina and vice versa. This is critical for financial accuracy, compliance, and detecting missed webhooks.

---

## Reconciliation Schedule

### Automated Jobs

- **Hourly Incremental**: Reconciles last 2 hours of transactions
  - Cron: `0 * * * *` (every hour at :00)
  - Window: `now - 2 hours` to `now`
  - Purpose: Quick detection of recent discrepancies

- **Daily Full**: Reconciles previous day's transactions
  - Cron: `0 2 * * *` (2 AM daily)
  - Window: Previous calendar day (00:00 - 23:59)
  - Purpose: Complete daily close, generates finance report

### Manual Triggers

Run via Admin Portal or API:

```bash
POST /v1/reconciliation/run
```

---

## Reconciliation Process

### Step 1: Fetch Stripe Data

```typescript
// Fetch charges from Stripe within time window
const charges = await stripe.charges.list({
  created: {
    gte: Math.floor(startTime.getTime() / 1000),
    lte: Math.floor(endTime.getTime() / 1000),
  },
  limit: 100, // paginate if needed
});

// Extract unique Payment Intent IDs
const stripePaymentIntents = new Set(
  charges.data
    .map(c => c.payment_intent)
    .filter(Boolean) as string[]
);
```

### Step 2: Fetch Patina Data

```typescript
// Fetch orders paid within time window
const orders = await prisma.order.findMany({
  where: {
    paidAt: {
      gte: startTime,
      lte: endTime,
    },
    paymentStatus: 'captured',
  },
  include: { payments: true },
});

// Extract unique Payment Intent IDs
const patinaPaymentIntents = new Set(
  orders
    .map(o => o.paymentIntentId)
    .filter(Boolean) as string[]
);
```

### Step 3: Compare and Identify Discrepancies

```typescript
// Orphan Stripe payments (in Stripe but not in Patina)
const orphanStripe: string[] = [];
for (const pi of stripePaymentIntents) {
  if (!patinaPaymentIntents.has(pi)) {
    orphanStripe.push(pi);
  }
}

// Orphan Patina orders (in Patina but not in Stripe)
const orphanPatina: string[] = [];
for (const pi of patinaPaymentIntents) {
  if (!stripePaymentIntents.has(pi)) {
    orphanPatina.push(pi);
  }
}

const discrepancies = orphanStripe.length + orphanPatina.length;
```

### Step 4: Store Results

```typescript
await prisma.reconciliation.create({
  data: {
    jobId: uuidv4(),
    status: 'completed',
    window: { start: startTime, end: endTime },
    stripeCount: stripePaymentIntents.size,
    patinaCount: patinaPaymentIntents.size,
    matchedCount: stripePaymentIntents.size - orphanStripe.length,
    discrepancies,
    orphanStripe: orphanStripe.length > 0 ? orphanStripe : undefined,
    orphanPatina: orphanPatina.length > 0 ? orphanPatina : undefined,
  },
});
```

### Step 5: Alert on Discrepancies

If `discrepancies > 0`:
1. Emit `reconciliation.discrepancy.detected` event
2. Send alert to Finance team
3. Create resolution tasks in Admin Portal

---

## Discrepancy Types & Resolution

### Type 1: Orphan Stripe Payment

**Cause**: Webhook was missed or failed to process

**Symptoms**: Payment exists in Stripe but no corresponding Order/Payment in Patina

**Resolution**:

1. **Fetch Payment Intent from Stripe**:
   ```typescript
   const paymentIntent = await stripe.paymentIntents.retrieve(
     orphanPaymentIntentId
   );
   ```

2. **Find Order by Metadata**:
   - Check `paymentIntent.metadata.cartId`
   - Check `paymentIntent.metadata.userId`
   - Query Orders table for matching cart or customer

3. **Create Payment Record**:
   ```typescript
   await prisma.payment.create({
     data: {
       orderId: order.id,
       paymentIntentId: paymentIntent.id,
       chargeId: charge.id,
       status: 'succeeded',
       amount: new Decimal(paymentIntent.amount).div(100),
       currency: paymentIntent.currency.toUpperCase(),
       raw: paymentIntent,
     },
   });
   ```

4. **Update Order Status**:
   ```typescript
   await prisma.order.update({
     where: { id: order.id },
     data: {
       status: 'paid',
       paymentStatus: 'captured',
       paidAt: new Date(paymentIntent.created * 1000),
     },
   });
   ```

5. **Emit Events** (late):
   - `payment.succeeded`
   - `order.paid`

6. **Trigger Notifications**:
   - Send order confirmation email (if not already sent)

### Type 2: Orphan Patina Order

**Cause**: Order created but payment failed or was canceled; webhook processed but Stripe charge voided

**Symptoms**: Order in Patina marked as `paid` but no corresponding charge in Stripe

**Resolution**:

1. **Verify in Stripe Dashboard**:
   - Search for Payment Intent ID
   - Check charge status

2. **If Payment Intent Exists but Failed**:
   ```typescript
   // Update order to failed status
   await prisma.order.update({
     where: { paymentIntentId },
     data: {
       status: 'canceled',
       paymentStatus: 'failed',
     },
   });
   ```

3. **If Payment Intent Refunded**:
   - Create Refund record (if missing)
   - Update Order status to `refunded`

4. **If Payment Intent Not Found**:
   - **Manual Review Required**
   - Check if Order was created speculatively
   - Mark Order as `canceled` if no payment was intended
   - Contact customer if payment was expected

5. **Create Audit Log**:
   ```typescript
   await prisma.auditLog.create({
     data: {
       entityType: 'order',
       entityId: order.id,
       action: 'reconciliation_correction',
       actorType: 'system',
       actor: 'reconciliation_job',
       changes: { from: 'paid', to: 'canceled', reason: 'orphan_order' },
     },
   });
   ```

### Type 3: Amount Mismatch

**Cause**: Partial refund, currency conversion issue, or data corruption

**Symptoms**: Payment Intent amount doesn't match Order total

**Resolution**:

1. **Compare Amounts**:
   ```typescript
   const stripeAmount = new Decimal(paymentIntent.amount).div(100);
   const patinaAmount = order.total;
   const difference = stripeAmount.minus(patinaAmount).abs();

   if (difference.greaterThan(0.01)) {
     // Significant mismatch (> 1 cent)
     // Manual review required
   }
   ```

2. **Check for Partial Refunds**:
   - Fetch refunds from Stripe
   - Ensure all refunds recorded in Patina

3. **If Mismatch Due to Data Error**:
   - **DO NOT auto-correct Order total**
   - Create manual review task
   - Finance team must approve any corrections

4. **If Mismatch Due to Refund**:
   - Create missing Refund records
   - Update Order status accordingly

---

## Daily Close Procedure

### Finance Team Checklist

**Run at**: 2 AM UTC (after daily reconciliation job)

1. **Review Reconciliation Report**:
   ```bash
   GET /v1/reconciliation/history?limit=1
   ```
   - Check `discrepancies` count
   - Review `orphanStripe` and `orphanPatina` arrays

2. **Zero Discrepancies**:
   - ✅ Day is reconciled
   - Generate daily summary:
     - Total orders paid
     - Total revenue (subtotal + tax + shipping)
     - Total refunds
     - Net revenue

3. **Discrepancies Detected**:
   - 🔍 Investigate each discrepancy
   - Follow resolution procedures above
   - Mark as resolved once corrected
   - Re-run reconciliation for the day

4. **Generate Finance Reports**:
   - Export to CSV/PDF
   - Store in OCI Object Storage (`patina-exports` bucket)
   - Send to accounting system (via API or file transfer)

5. **Verify Stripe Dashboard**:
   - Compare Patina totals with Stripe Balance
   - Check for:
     - Pending payouts
     - Disputes
     - Chargebacks

---

## Reconciliation API Endpoints

### Trigger Manual Reconciliation

```http
POST /v1/reconciliation/run
Authorization: Bearer <admin-token>

{
  "windowHours": 24  // optional, defaults to 24
}
```

**Response**:
```json
{
  "jobId": "uuid",
  "status": "completed",
  "window": {
    "start": "2025-10-02T00:00:00Z",
    "end": "2025-10-03T00:00:00Z"
  },
  "stripeCount": 150,
  "patinaCount": 150,
  "matchedCount": 148,
  "discrepancies": 2,
  "orphanStripe": ["pi_123", "pi_456"],
  "orphanPatina": []
}
```

### Get Reconciliation History

```http
GET /v1/reconciliation/history?limit=10
Authorization: Bearer <admin-token>
```

**Response**:
```json
[
  {
    "id": "uuid",
    "jobId": "uuid",
    "status": "completed",
    "window": { "start": "...", "end": "..." },
    "discrepancies": 0,
    "startedAt": "2025-10-03T02:00:00Z",
    "completedAt": "2025-10-03T02:00:15Z"
  }
]
```

---

## Monitoring & Alerts

### Key Metrics

1. **Reconciliation Success Rate**: `(successful jobs / total jobs) * 100`
   - Target: 100%
   - Alert if < 99%

2. **Discrepancy Rate**: `discrepancies / total_transactions * 100`
   - Target: 0%
   - Alert if > 0.1%

3. **Time to Resolution**: Time from discrepancy detected to resolved
   - Target: < 4 hours for automated
   - Target: < 24 hours for manual review

4. **Job Duration**: p95 completion time
   - Target: < 60 seconds for hourly
   - Target: < 5 minutes for daily

### Critical Alerts

- **Reconciliation Job Failed**: Immediate page to SRE
- **Discrepancies > 5**: Alert Finance team
- **Unresolved Discrepancies > 24 hours**: Escalate to Finance Manager

---

## Audit Trail

Every reconciliation action must be logged:

```typescript
await prisma.auditLog.create({
  data: {
    entityType: 'reconciliation',
    entityId: reconciliation.id,
    action: 'discrepancy_resolved',
    actor: 'finance-user-id',
    actorType: 'admin',
    changes: {
      paymentIntentId: 'pi_123',
      resolution: 'created_missing_payment_record',
      orderId: 'order-id',
    },
    metadata: {
      jobId: reconciliation.jobId,
      resolvedAt: new Date(),
    },
  },
});
```

---

## Compliance & Reporting

### SOC 2 Requirements

- **Daily reconciliation** documented
- **All discrepancies** tracked and resolved
- **Audit logs** retained for 7 years
- **Separation of duties**: Reconciliation run by system, reviewed by Finance

### Financial Close Process

**Month-End**:
1. Run full reconciliation for entire month
2. Ensure zero discrepancies
3. Export transaction log
4. Store in immutable storage (OCI Object Storage with retention policy)
5. Sign off by Finance Manager

**Quarter-End**:
- Same as month-end
- External audit may request reconciliation reports

---

## Disaster Recovery

### Scenario: Database Corruption

1. **Restore from backup** (most recent)
2. **Re-run reconciliation** for affected time period
3. **Fetch all data from Stripe** (source of truth for payments)
4. **Rebuild Payment records** from Stripe data
5. **Verify Order statuses** match Stripe

### Scenario: Stripe Webhook Endpoint Down

1. **Detection**: Reconciliation finds many orphan Stripe payments
2. **Identify time window** of outage
3. **Fetch all Stripe events** during outage:
   ```typescript
   const events = await stripe.events.list({
     created: { gte: outageStart, lte: outageEnd },
     type: 'payment_intent.succeeded',
   });
   ```
4. **Replay events** through webhook handler
5. **Re-run reconciliation** to verify

---

## Testing Reconciliation

### Unit Tests

```typescript
describe('ReconciliationService', () => {
  it('should detect orphan Stripe payment', async () => {
    // Mock Stripe API with payment not in DB
    // Run reconciliation
    // Assert discrepancy detected
  });

  it('should detect orphan Patina order', async () => {
    // Create order in DB
    // Mock Stripe API without matching charge
    // Run reconciliation
    // Assert discrepancy detected
  });
});
```

### Integration Tests

- Create real Stripe test charge
- Simulate webhook failure (don't process)
- Run reconciliation
- Verify discrepancy detected and auto-resolved

---

## Escalation Procedures

### Level 1: Auto-Resolution (System)

- Orphan Stripe payment with valid metadata
- Missing Payment record creation
- No manual intervention needed

### Level 2: Finance Review (< 4 hours)

- Orphan Patina order (investigate in Stripe Dashboard)
- Amount mismatches > $0.01
- Create resolution task in Admin Portal

### Level 3: Engineering + Finance (< 24 hours)

- Multiple recurring discrepancies
- Data corruption suspected
- Webhook endpoint issues

### Level 4: Escalate to Leadership

- Unresolved discrepancies > $1,000
- Pattern of data integrity issues
- Potential fraud detected

---

## Related Documentation

- [Payment Flow](./PAYMENT_FLOW.md)
- [Admin Portal Operations Guide](./ADMIN_OPERATIONS.md)
- [Stripe Dispute Management](./DISPUTES.md)
