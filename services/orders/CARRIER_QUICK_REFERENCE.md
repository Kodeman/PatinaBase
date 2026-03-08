# Carrier Integration Quick Reference

## Quick Start (5 minutes)

### 1. Get EasyPost API Key
```bash
# Sign up: https://www.easypost.com/signup
# Copy test API key from dashboard
```

### 2. Configure Environment
```bash
# Add to services/orders/.env
CARRIER_PROVIDER=easypost
EASYPOST_API_KEY=EZAK_test_your_key_here
EASYPOST_MODE=test
```

### 3. Push Database Schema
```bash
cd services/orders
npx prisma generate
npx prisma db push
```

### 4. Start Service
```bash
pnpm dev
```

## Common Operations

### Get Shipping Rates
```bash
curl -X POST http://localhost:3015/shipments/rates \
  -H "Content-Type: application/json" \
  -d '{
    "fromAddress": {
      "street1": "123 Main St",
      "city": "San Francisco",
      "state": "CA",
      "zip": "94102",
      "country": "US"
    },
    "toAddress": {
      "street1": "456 Market St",
      "city": "Los Angeles",
      "state": "CA",
      "zip": "90001",
      "country": "US"
    },
    "parcel": {
      "length": 10,
      "width": 8,
      "height": 6,
      "weight": 16
    }
  }'
```

### Create Shipment + Label
```bash
curl -X POST http://localhost:3015/orders/{orderId}/shipments \
  -H "Content-Type: application/json" \
  -d '{
    "fromAddress": { ... },
    "toAddress": { ... },
    "parcel": { ... },
    "carrier": "USPS",
    "service": "Priority",
    "items": [{"orderItemId": "uuid", "qty": 1}]
  }'
```

### Get Tracking
```bash
curl http://localhost:3015/shipments/{shipmentId}/tracking
```

### Validate Address
```bash
curl -X POST http://localhost:3015/shipments/validate-address \
  -H "Content-Type: application/json" \
  -d '{
    "street1": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "zip": "94102",
    "country": "US"
  }'
```

## File Structure

```
services/orders/src/modules/fulfillment/
├── carriers/
│   ├── carrier.interface.ts       # Abstract carrier interface
│   ├── easypost.carrier.ts        # EasyPost implementation
│   └── carrier.factory.ts         # Factory for carrier instances
├── dto/
│   ├── address.dto.ts             # Address DTOs
│   ├── parcel.dto.ts              # Parcel DTOs
│   ├── create-shipment.dto.ts     # Create shipment DTOs
│   ├── update-shipment.dto.ts     # Update DTOs
│   ├── shipping-rate.dto.ts       # Rate response DTOs
│   ├── shipping-label.dto.ts      # Label response DTOs
│   ├── tracking.dto.ts            # Tracking DTOs
│   └── index.ts                   # Barrel export
├── fulfillment.controller.ts      # Main controller
├── fulfillment.service.ts         # Business logic
├── fulfillment.module.ts          # Module definition
├── fulfillment.service.spec.ts    # Unit tests
└── webhooks.controller.ts         # Webhook handler
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/shipments/rates` | Get shipping rates |
| POST | `/shipments/validate-address` | Validate address |
| POST | `/orders/:orderId/shipments` | Create shipment + label |
| GET | `/orders/:orderId/shipments` | List order shipments |
| GET | `/shipments/:id` | Get shipment details |
| GET | `/shipments/:id/tracking` | Get tracking info |
| PATCH | `/shipments/:id` | Update shipment |
| PATCH | `/shipments/:id/status` | Update status |
| POST | `/shipments/:id/refund` | Refund shipment |
| POST | `/webhooks/carriers/easypost` | EasyPost webhook |

## Environment Variables

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| CARRIER_PROVIDER | Yes | `easypost` | Carrier provider |
| EASYPOST_API_KEY | Yes | `EZAK_test_...` | EasyPost API key |
| EASYPOST_MODE | Yes | `test` | Mode (test/production) |
| EASYPOST_WEBHOOK_SECRET | No | `whsec_...` | Webhook secret |
| EASYPOST_DEFAULT_FROM_ADDRESS_ID | No | `addr_...` | Default warehouse address |

## Database Schema Changes

### Shipment Model (Enhanced)

```prisma
model Shipment {
  // ... existing fields ...

  // New fields
  service            String?   // Priority|Ground|Express
  carrierShipmentId  String?   // EasyPost shipment ID
  labelUrl           String?   // URL to shipping label
  labelFormat        String?   // PDF|PNG|ZPL
  labelSize          String?   // 4x6|4x8
  commercialInvoiceUrl String? // For international
  rateId             String?   // Rate ID used
  trackingStatus     String?   // Carrier-specific status
  trackingEvents     Json?     // Tracking history
  publicTrackingUrl  String?   // Public tracking URL
  fromAddress        Json?     // Address snapshot
  toAddress          Json?     // Address snapshot
  parcel             Json?     // Parcel details

  @@index([carrier])
  @@index([carrierShipmentId])
}
```

## Common Errors & Fixes

| Error | Fix |
|-------|-----|
| `EASYPOST_API_KEY is required` | Add API key to `.env` |
| `Order must be paid` | Complete payment first |
| `Invalid order items` | Check item UUIDs |
| `No rate found` | Verify carrier/service names |
| `Address validation failed` | Fix address format |

## Testing

### Run Unit Tests
```bash
pnpm test fulfillment.service.spec.ts
```

### Test with EasyPost Test Mode
```bash
EASYPOST_API_KEY=EZAK_test_... pnpm dev
```

### Test Addresses (EasyPost)
```javascript
// Valid address
{ street1: "179 N Harbor Dr", city: "Redondo Beach", state: "CA", zip: "90277", country: "US" }

// Invalid (fails validation)
{ street1: "UNDELIVERABLE ST", city: "San Francisco", state: "CA", zip: "94102", country: "US" }
```

## Carrier Support

### USPS
- Services: Priority, Express, First Class, Parcel Select
- Best for: Domestic, lightweight packages
- Cost: $$

### FedEx
- Services: Ground, Express, 2Day, Overnight
- Best for: Time-sensitive shipments
- Cost: $$$

### UPS
- Services: Ground, 3 Day, 2Day, Next Day Air
- Best for: Commercial, heavy packages
- Cost: $$$

## Webhook Setup

1. Go to https://www.easypost.com/account/webhooks
2. Click "Add Webhook"
3. URL: `https://your-api.com/webhooks/carriers/easypost`
4. Events: Select all tracker events
5. Copy secret to `EASYPOST_WEBHOOK_SECRET`

## Production Checklist

- [ ] Production API key configured
- [ ] `EASYPOST_MODE=production`
- [ ] Webhook configured
- [ ] Default warehouse address set
- [ ] Test label generation
- [ ] Test tracking updates
- [ ] Monitor error rates
- [ ] Set up alerts

## Support

- **EasyPost Docs**: https://www.easypost.com/docs/api
- **EasyPost Support**: support@easypost.com
- **Test API**: https://www.easypost.com/docs/api#testing

## Cost Estimates (per shipment)

| Carrier | Service | Weight | Cost Range |
|---------|---------|--------|------------|
| USPS | Priority | 1 lb | $7-10 |
| USPS | Express | 1 lb | $25-35 |
| FedEx | Ground | 5 lb | $12-18 |
| FedEx | 2Day | 5 lb | $30-45 |
| UPS | Ground | 5 lb | $10-15 |
| UPS | Next Day | 5 lb | $50-70 |

Note: Actual rates vary by distance and dimensions.
