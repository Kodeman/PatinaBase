# Carrier Integration Guide

## Overview

The fulfillment service integrates with shipping carriers (EasyPost, ShipStation) to provide:
- Multi-carrier rate shopping (USPS, FedEx, UPS)
- Shipping label generation
- Real-time tracking updates
- Address validation
- Shipment refunds

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Fulfillment Service                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  FulfillmentController  →  FulfillmentService              │
│                              ↓                              │
│                         CarrierFactory                      │
│                              ↓                              │
│                      ICarrier (Interface)                   │
│                              ↓                              │
│              ┌───────────────┴───────────────┐             │
│              ↓                                ↓             │
│      EasyPostCarrier                 ShipStationCarrier    │
│         (Implemented)                   (Future)            │
│              ↓                                              │
│      EasyPost API (USPS, FedEx, UPS)                       │
└─────────────────────────────────────────────────────────────┘
```

## Setup

### 1. Install Dependencies

```bash
cd services/orders
pnpm install
```

EasyPost SDK is already installed: `@easypost/api`

### 2. Configure Environment Variables

Add to `.env`:

```bash
# Carrier Provider (easypost or shipstation)
CARRIER_PROVIDER=easypost

# EasyPost Configuration
EASYPOST_API_KEY=EZAK_test_your_api_key_here
EASYPOST_WEBHOOK_SECRET=whsec_your_webhook_secret
EASYPOST_MODE=test
EASYPOST_DEFAULT_FROM_ADDRESS_ID=addr_your_warehouse_address_id

# Optional: Customize default settings
DEFAULT_LABEL_FORMAT=PDF
DEFAULT_LABEL_SIZE=4x6
```

### 3. Get EasyPost API Key

1. Sign up at https://www.easypost.com/
2. Get your API key from the dashboard
3. Use test key for development: `EZAK_test_...`
4. Use production key for live: `EZAK_...`

### 4. Create Default Warehouse Address

Create a verified warehouse address in EasyPost:

```bash
curl https://api.easypost.com/v2/addresses \
  -u "EZAK_test_your_api_key:" \
  -d "address[company]=Patina Furnishings" \
  -d "address[street1]=123 Warehouse St" \
  -d "address[city]=San Francisco" \
  -d "address[state]=CA" \
  -d "address[zip]=94102" \
  -d "address[country]=US" \
  -d "address[phone]=415-555-0123"
```

Save the returned `id` as `EASYPOST_DEFAULT_FROM_ADDRESS_ID`.

### 5. Update Database Schema

```bash
cd services/orders
npx prisma generate
npx prisma db push
```

## API Endpoints

### Get Shipping Rates

```http
POST /shipments/rates
Content-Type: application/json

{
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
    "length": 24,
    "width": 18,
    "height": 12,
    "weight": 256
  }
}
```

**Response:**

```json
{
  "rates": [
    {
      "carrier": "USPS",
      "service": "Priority",
      "rate": 15.99,
      "currency": "USD",
      "deliveryDays": 2,
      "deliveryDate": "2025-10-17T00:00:00Z",
      "deliveryDateGuaranteed": false,
      "rateId": "rate_abc123"
    },
    {
      "carrier": "FedEx",
      "service": "Ground",
      "rate": 22.50,
      "currency": "USD",
      "deliveryDays": 3,
      "rateId": "rate_def456"
    }
  ],
  "recommendedRate": {
    "carrier": "USPS",
    "service": "Priority",
    "rate": 15.99,
    "rateId": "rate_abc123"
  }
}
```

### Create Shipment and Generate Label

```http
POST /orders/{orderId}/shipments
Content-Type: application/json

{
  "fromAddress": {
    "street1": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "zip": "94102",
    "country": "US"
  },
  "toAddress": {
    "firstName": "John",
    "lastName": "Doe",
    "street1": "456 Market St",
    "city": "Los Angeles",
    "state": "CA",
    "zip": "90001",
    "country": "US",
    "phone": "+1-310-555-0123",
    "email": "john.doe@example.com"
  },
  "parcel": {
    "length": 24,
    "width": 18,
    "height": 12,
    "weight": 256
  },
  "carrier": "USPS",
  "service": "Priority",
  "rateId": "rate_abc123",
  "items": [
    { "orderItemId": "uuid-item-1", "qty": 1 }
  ],
  "options": {
    "labelFormat": "PDF",
    "labelSize": "4x6",
    "insurance": 500,
    "signature": "STANDARD"
  }
}
```

**Response:**

```json
{
  "id": "shipment-uuid",
  "orderId": "order-uuid",
  "shipmentNumber": "SHIP-1697395200-ABC123",
  "carrier": "USPS",
  "service": "Priority",
  "trackingNumber": "9400111899562537845962",
  "status": "pending",
  "cost": 15.99,
  "label": {
    "trackingNumber": "9400111899562537845962",
    "labelUrl": "https://easypost-files.s3.amazonaws.com/files/label.pdf",
    "labelFormat": "PDF",
    "labelSize": "4x6"
  }
}
```

### Get Tracking Information

```http
GET /shipments/{shipmentId}/tracking
```

**Response:**

```json
{
  "trackingNumber": "9400111899562537845962",
  "carrier": "USPS",
  "status": "in_transit",
  "statusDetail": "Package is in transit to destination",
  "estimatedDelivery": "2025-10-17T17:00:00Z",
  "trackingEvents": [
    {
      "status": "pre_transit",
      "description": "Shipping label created",
      "datetime": "2025-10-14T10:00:00Z",
      "location": {
        "city": "San Francisco",
        "state": "CA",
        "zip": "94102"
      }
    },
    {
      "status": "in_transit",
      "description": "Package arrived at USPS facility",
      "datetime": "2025-10-15T08:30:00Z",
      "location": {
        "city": "Los Angeles",
        "state": "CA"
      }
    }
  ],
  "publicUrl": "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899562537845962"
}
```

### Validate Address

```http
POST /shipments/validate-address
Content-Type: application/json

{
  "street1": "123 Main Street",
  "city": "San Francisco",
  "state": "CA",
  "zip": "94102",
  "country": "US"
}
```

**Response:**

```json
{
  "valid": true,
  "address": {
    "street1": "123 MAIN ST",
    "city": "SAN FRANCISCO",
    "state": "CA",
    "zip": "94102-1234",
    "country": "US"
  },
  "messages": [],
  "warnings": ["Address was normalized"]
}
```

### Refund Shipment

```http
POST /shipments/{shipmentId}/refund
```

**Response:**

```json
{
  "refunded": true,
  "refundAmount": 15.99
}
```

## Webhooks

### Setup EasyPost Webhook

1. Go to EasyPost Dashboard → Webhooks
2. Create new webhook with URL: `https://your-api.com/webhooks/carriers/easypost`
3. Select events: `tracker.created`, `tracker.updated`, `refund.successful`
4. Copy webhook secret to `EASYPOST_WEBHOOK_SECRET`

### Webhook Events Handled

| Event | Description | Action |
|-------|-------------|--------|
| `tracker.created` | Tracking created | Update shipment tracking info |
| `tracker.updated` | Tracking status changed | Update shipment status |
| `refund.successful` | Refund processed | Mark shipment as returned |

### Webhook Payload Example

```json
{
  "id": "evt_abc123",
  "mode": "test",
  "description": "tracker.updated",
  "result": {
    "tracking_code": "9400111899562537845962",
    "status": "delivered",
    "status_detail": "Package delivered to recipient",
    "est_delivery_date": "2025-10-17T17:00:00Z",
    "signed_by": "J. DOE",
    "tracking_details": [...]
  },
  "created_at": "2025-10-17T17:15:00Z",
  "updated_at": "2025-10-17T17:15:00Z"
}
```

## Business Rules

1. **Order Must Be Paid**: Shipments can only be created for orders with `paymentStatus: 'captured'`
2. **Item Validation**: All `orderItemId`s must exist in the order
3. **Fulfillment Status**: Order status auto-updates based on shipment completion
4. **Label Storage**: Label URLs stored in database for retrieval
5. **Tracking Updates**: Webhooks automatically update tracking status
6. **Automatic Refunds**: Shipments can be refunded if within carrier refund window

## Testing

### Unit Tests

```bash
cd services/orders
pnpm test fulfillment.service.spec.ts
```

### Integration Tests

```bash
# Test with EasyPost test API
EASYPOST_API_KEY=EZAK_test_... pnpm test:e2e
```

### Test Mode Features

In test mode (`EASYPOST_MODE=test`):
- No actual labels printed
- No charges incurred
- Full API functionality available
- Test tracking numbers generated

### Test Addresses

EasyPost provides special test addresses:

```javascript
// Invalid address (will fail validation)
{
  "street1": "UNDELIVERABLE ST",
  "city": "San Francisco",
  "state": "CA",
  "zip": "94102",
  "country": "US"
}

// Valid test address
{
  "street1": "179 N Harbor Dr",
  "city": "Redondo Beach",
  "state": "CA",
  "zip": "90277",
  "country": "US"
}
```

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `EASYPOST_API_KEY is required` | Missing API key | Add to `.env` |
| `Order must be paid before creating shipment` | Order not captured | Complete payment first |
| `Invalid order items specified` | Bad `orderItemId` | Verify item IDs |
| `No rate found for carrier` | Invalid carrier/service | Check rate shopping response |
| `Shipment does not have a tracking number` | Label not generated | Create shipment first |
| `Address validation failed` | Invalid address | Fix address fields |

## Supported Carriers

### USPS (United States Postal Service)
- **Services**: Priority, Express, First Class, Parcel Select
- **Features**: Tracking, delivery confirmation
- **Best For**: Domestic shipments, lightweight packages

### FedEx
- **Services**: Ground, Express, 2Day, Overnight
- **Features**: Signature, insurance, Saturday delivery
- **Best For**: Time-sensitive shipments

### UPS
- **Services**: Ground, 3 Day, 2Day, Next Day Air
- **Features**: Signature, insurance, tracking
- **Best For**: Commercial shipments, heavy packages

## Production Checklist

- [ ] Switch `EASYPOST_API_KEY` to production key
- [ ] Set `EASYPOST_MODE=production`
- [ ] Verify `EASYPOST_DEFAULT_FROM_ADDRESS_ID` is correct
- [ ] Configure webhook URL in EasyPost dashboard
- [ ] Test webhook signature validation
- [ ] Set up monitoring for failed shipments
- [ ] Configure alerts for tracking exceptions
- [ ] Review carrier account credentials
- [ ] Test refund process
- [ ] Verify insurance amounts

## Cost Optimization

1. **Rate Shopping**: Always fetch rates and use lowest cost option
2. **Predefined Packages**: Use USPS Flat Rate boxes for cost savings
3. **Batch Processing**: Create labels in batches during off-peak hours
4. **Zone Optimization**: Choose carrier based on destination zone
5. **Address Validation**: Validate addresses to avoid delivery failures

## Monitoring

Track these metrics:
- Label creation success rate
- Average shipping cost per order
- Delivery time vs. estimated
- Tracking update frequency
- Refund requests
- Address validation failures

## Future Enhancements

- [ ] Batch label generation
- [ ] Return labels
- [ ] Multi-package shipments
- [ ] International customs forms
- [ ] Carrier account integration (direct API)
- [ ] ShipStation integration
- [ ] Rate caching
- [ ] Smart carrier selection
