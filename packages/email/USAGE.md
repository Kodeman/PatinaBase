# Email & Notifications — Usage Guide

This guide covers the `@patina/email` and `@patina/notifications` packages for sending emails and managing notification preferences in Patina.

## Architecture

```
Your code
  └─ notify(ctx, userId, type, data)           @patina/notifications
       ├─ Checks user preferences
       ├─ Checks quiet hours
       └─ Enqueues delivery via Edge Function
            └─ sendEmail({ react: <Template /> })   @patina/email
                 └─ Resend API
```

For simple cases you can call `sendEmail()` directly. For production flows, use `notify()` which handles preference checks, quiet hours, and multi-channel routing.

---

## Quick Start

### Sending a single email directly

```typescript
import { sendEmail, generateUnsubscribeHeaders } from '@patina/email';
import { WelcomeVerification } from '@patina/email/templates/welcome-verification';

const result = await sendEmail({
  to: 'designer@example.com',
  subject: 'Verify your Patina account',
  react: <WelcomeVerification
    displayName="Sarah"
    verificationUrl="https://admin.patina.cloud/verify?token=abc123"
  />,
});

if (result.success) {
  console.log('Sent:', result.id);
} else {
  console.error('Failed:', result.error);
}
```

### Using the notify() dispatcher (recommended)

```typescript
import { notify } from '@patina/notifications';

const results = await notify(
  { supabase },          // Supabase client (service role for server-side)
  userId,
  'new_lead_designer',   // NotificationType
  {                      // Template data — passed as props to the template
    clientName: 'Emily Chen',
    projectType: 'full_room',
    budgetRange: '15k_50k',
    matchScore: 0.92,
    leadId: 'lead-abc-123',
  },
);
```

`notify()` will:
1. Fetch the user's notification preferences
2. Skip if the user opted out of this type
3. Skip if quiet hours are active (non-critical only)
4. Route to the correct channels (email, push, in-app)
5. Log the notification in `notification_log`

---

## Environment Variables

| Variable | Required | Used By |
|---|---|---|
| `RESEND_API_KEY` | Yes | `@patina/email` — Resend SDK |
| `UNSUBSCRIBE_TOKEN_SECRET` | Recommended | `@patina/notifications` — JWT signing for unsubscribe tokens |
| `SUPABASE_SERVICE_ROLE_KEY` | Fallback | Used if `UNSUBSCRIBE_TOKEN_SECRET` is not set |

---

## Email Templates

All templates wrap in `BaseEmailLayout` which provides:
- 600px max-width container on linen (#FAF7F2) background
- Warm gold gradient header (#C4A57B → #8B7355) with "Patina" logo
- Dark charcoal footer with optional unsubscribe links
- Inter font loaded from Google Fonts

### Transactional (always sent, no unsubscribe)

#### WelcomeVerification

```typescript
import { WelcomeVerification } from '@patina/email/templates/welcome-verification';

<WelcomeVerification
  displayName="Sarah"              // optional — personalizes greeting
  verificationUrl="https://..."    // required — "Verify My Email" CTA
/>
```

#### PasswordReset

```typescript
import { PasswordReset } from '@patina/email/templates/password-reset';

<PasswordReset
  displayName="Sarah"         // optional
  resetUrl="https://..."      // required — "Reset Password" CTA
/>
```

#### SecurityAlert

```typescript
import { SecurityAlert } from '@patina/email/templates/security-alert';

<SecurityAlert
  displayName="Sarah"                       // optional
  alertType="new_device"                    // required — 'new_device' | 'password_changed' | 'email_changed' | 'suspicious_activity'
  deviceInfo="Chrome on macOS"              // optional
  ipAddress="192.168.1.1"                   // optional
  location="San Francisco, CA"              // optional
  timestamp="March 3, 2026 at 4:30 PM"     // required — displayed as-is
  secureAccountUrl="https://..."            // required — "Secure My Account" CTA (urgent red)
/>
```

#### OrderConfirmation

```typescript
import { OrderConfirmation } from '@patina/email/templates/order-confirmation';

<OrderConfirmation
  displayName="Sarah"                // optional
  orderId="ORD-2026-0042"           // required
  items={[                           // required
    { name: 'Walnut Console Table', quantity: 1, priceFormatted: '$2,400', maker: 'Studio Moe' },
    { name: 'Linen Throw Pillow', quantity: 2, priceFormatted: '$180' },
  ]}
  subtotalFormatted="$2,760"         // required
  taxFormatted="$220.80"             // optional
  shippingFormatted="$0"             // optional
  totalFormatted="$2,980.80"         // required
  estimatedDelivery="March 15-20"    // optional
  shippingAddress="123 Design St"    // optional
/>
```

#### PaymentReceipt

```typescript
import { PaymentReceipt } from '@patina/email/templates/payment-receipt';

<PaymentReceipt
  displayName="Sarah"                  // optional
  receiptId="REC-2026-0042"           // required
  amountFormatted="$2,980.80"         // required
  paymentMethod="Visa ending in 4242" // optional
  paymentDate="March 3, 2026"         // required — displayed as-is
  description="Furniture order"        // optional
  items={[                             // optional — line item breakdown
    { name: 'Walnut Console Table', amountFormatted: '$2,400' },
    { name: 'Linen Throw Pillow ×2', amountFormatted: '$360' },
  ]}
/>
```

### Designer Templates

#### NewLeadDesigner

```typescript
import { NewLeadDesigner } from '@patina/email/templates/new-lead-designer';

<NewLeadDesigner
  displayName="Sarah"                    // optional
  clientName="Emily Chen"                // required
  projectType="full_room"                // required — 'full_room' | 'consultation' | 'single_piece' | 'staging' or raw string
  budgetRange="15k_50k"                  // optional — 'under_5k' | '5k_15k' | '15k_50k' | '50k_100k' | 'over_100k'
  timeline="2_4_weeks"                   // optional — underscores replaced with spaces
  locationCity="San Francisco"           // optional
  locationState="CA"                     // optional
  matchScore={0.92}                      // optional — 0-1 float, displayed as "92% compatibility match"
  matchReasons={['Style alignment', 'Budget fit', 'Location']}  // optional — up to 3
  roomScanThumbnail="https://..."        // optional — 520px wide image
  styleSummary="Modern minimalist..."    // optional — italic text block
  leadId="lead-abc-123"                  // required — builds portal deep link
  responseDeadline="24 hours"            // optional — shown below CTA
  unsubscribeUrl="https://..."           // optional
/>
```

#### LeadExpiring

```typescript
import { LeadExpiring } from '@patina/email/templates/lead-expiring';

<LeadExpiring
  displayName="Sarah"           // optional
  clientName="Emily Chen"       // required
  projectType="full_room"       // required
  budgetRange="15k_50k"         // optional
  timeRemaining="2 hours"       // required — displayed in red urgency banner
  leadId="lead-abc-123"         // required
  unsubscribeUrl="https://..."  // optional
/>
```

Uses the **urgent** (red) Button variant for the "Respond Now" CTA.

#### ClientConfirmation

Sent to the consumer after a consultation request:

```typescript
import { ClientConfirmation } from '@patina/email/templates/client-confirmation';

<ClientConfirmation
  clientName="Emily"               // required
  designerName="Sarah Mitchell"    // required
  projectType="full_room"          // required
  expectedTimeline="2-3 weeks"     // optional — shown in a callout box
  nextSteps={[                     // optional — defaults to 3 built-in steps
    'Sarah will review your project details',
    'Expect a response within 24 hours',
    'You\'ll receive style recommendations',
  ]}
  unsubscribeUrl="https://..."     // optional
/>
```

### Consumer Templates

#### PriceDrop

```typescript
import { PriceDrop } from '@patina/email/templates/price-drop';

<PriceDrop
  displayName="Emily"                    // optional
  productName="Walnut Console Table"     // required
  productImageUrl="https://..."          // optional — 520px wide
  oldPriceFormatted="$3,200"             // required — shown with strikethrough
  newPriceFormatted="$2,400"             // required — large bold display
  savingsFormatted="$800"                // required
  savingsPercent={25}                    // optional — "Save $800 (25% off)"
  maker="Studio Moe"                     // optional — shown in provenance bar
  origin="Portland, OR"                  // optional
  material="American Walnut"             // optional
  productUrl="https://..."               // required — "View Deal" CTA
  unsubscribeUrl="https://..."           // optional
/>
```

#### BackInStock

```typescript
import { BackInStock } from '@patina/email/templates/back-in-stock';

<BackInStock
  displayName="Emily"                    // optional
  productName="Ceramic Table Lamp"       // required
  productImageUrl="https://..."          // optional
  priceFormatted="$450"                  // optional
  maker="Heath Ceramics"                 // optional
  origin="Sausalito, CA"                 // optional
  material="Stoneware"                   // optional
  quantityAvailable={3}                  // optional — ≤5: "Only 3 left", >5: "12 available"
  productUrl="https://..."               // required — "Shop Now" CTA
  unsubscribeUrl="https://..."           // optional
/>
```

#### WeeklyInspiration

```typescript
import { WeeklyInspiration } from '@patina/email/templates/weekly-inspiration';

<WeeklyInspiration
  displayName="Emily"                     // optional
  products={[                             // required — renders up to 4 product cards
    {
      name: 'Oak Dining Chair',
      imageUrl: 'https://...',
      priceFormatted: '$680',
      maker: 'Sawkille Co.',
      productUrl: 'https://...',
      matchReason: 'Matches your modern style',  // optional — shown in warm gold
    },
  ]}
  designerTip="Layer textures..."         // optional — italic callout section
  makerSpotlight={{                        // optional
    name: 'Sawkille Co.',
    description: 'Handcrafted in Rhinebeck, NY...',
    imageUrl: 'https://...',              // 80×80 circular avatar
  }}
  unsubscribeUrl="https://..."            // optional
/>
```

#### FoundingCircleUpdate

```typescript
import { FoundingCircleUpdate } from '@patina/email/templates/founding-circle-update';

<FoundingCircleUpdate
  displayName="Emily"                           // optional
  subject="March Update: What We've Built"      // required — used as heading
  progressNarrative="This month we..."          // required — main body text
  whatsNew={[                                    // optional — gold left-border list
    'Added 200 new artisan products',
    'Launched room scanning on iOS',
  ]}
  communityVoice={{                              // optional — testimonial block
    quote: 'Patina changed how I source...',
    author: 'Jessica M.',
    role: 'Interior Designer',
  }}
  upcomingPreview="Next month we're..."         // optional
  unsubscribeUrl="https://..."                   // optional
/>
```

---

## Shared Components

### Button

```typescript
import { Button } from '@patina/email/components/Button';

<Button href="https://..." variant="primary">Click Me</Button>
```

| Variant | Style |
|---|---|
| `primary` (default) | Warm gold fill, white text |
| `secondary` | Transparent, gold border + text |
| `urgent` | Red fill (#C45B4A), white text |

All buttons: pill-shaped (24px radius), 48px min height, 600-weight text.

### ProvenanceBar

```typescript
import { ProvenanceBar } from '@patina/email/components/ProvenanceBar';

<ProvenanceBar maker="Studio Moe" origin="Portland, OR" material="Walnut" />
// Renders: Studio Moe · Portland, OR · Walnut
```

Returns null if all props are empty.

---

## Sender Addresses

| Key | Address | Used For |
|---|---|---|
| `transactional` | `Patina <hello@notify.patina.com>` | Default for `sendEmail()` |
| `marketing` | `Patina <hello@mail.patina.com>` | Default for `sendBatchEmails()` |

Override with the `from` option:

```typescript
sendEmail({
  from: 'Patina Design <team@notify.patina.com>',
  // ...
});
```

---

## Unsubscribe Links

Every non-transactional email should include an unsubscribe link for CAN-SPAM compliance.

### Generating an unsubscribe URL

```typescript
import { generateUnsubscribeUrl } from '@patina/notifications';

const url = await generateUnsubscribeUrl(userId, 'price_drop');
// → https://admin.patina.cloud/preferences?token=eyJ...
```

Pass it to any template's `unsubscribeUrl` prop. The footer will render "Unsubscribe" and "Manage preferences" links.

### Adding List-Unsubscribe headers

For one-click unsubscribe support in email clients (Gmail, Apple Mail):

```typescript
import { sendEmail, generateUnsubscribeHeaders } from '@patina/email';
import { generateUnsubscribeUrl } from '@patina/notifications';

const unsubscribeUrl = await generateUnsubscribeUrl(userId, 'weekly_inspiration');

await sendEmail({
  to: 'user@example.com',
  subject: 'Your weekly picks',
  react: <WeeklyInspiration products={products} unsubscribeUrl={unsubscribeUrl} />,
  headers: generateUnsubscribeHeaders(unsubscribeUrl),
});
```

### Token details

- Signed JWT (HS256) with 72-hour expiry
- Contains: `sub` (userId), `type` (notification type or `'all_marketing'`), `purpose: 'unsubscribe'`
- Verified at `POST /api/unsubscribe` and the `/preferences` page in the portal

---

## Notification Types

All 26 types and their behavior:

| Type | Template | Channels | Transactional |
|---|---|---|---|
| `account_verification` | welcome-verification | email | Yes |
| `password_reset` | password-reset | email | Yes |
| `security_alert` | security-alert | email, push | Yes |
| `order_confirmation` | order-confirmation | email | Yes |
| `payment_receipt` | payment-receipt | email | Yes |
| `new_lead_designer` | new-lead-designer | email, push, in_app | No |
| `lead_expiring` | lead-expiring | email, push | No |
| `lead_response` | — | email, in_app | No |
| `client_confirmation` | client-confirmation | email | No |
| `client_message` | — | email, push, in_app | No |
| `project_milestone` | — | email, in_app | No |
| `commission_earned` | — | email, push | No |
| `new_products` | — | email | No |
| `teaching_reminder` | — | in_app | No |
| `price_drop` | price-drop | email, push | No |
| `back_in_stock` | back-in-stock | email, push | No |
| `wishlist_update` | — | email | No |
| `weekly_inspiration` | weekly-inspiration | email | No |
| `founding_circle_update` | founding-circle-update | email | No |
| `product_launch` | — | email | No |
| `seasonal_campaign` | — | email | No |
| `maker_spotlight` | — | email | No |
| `reengagement` | — | email | No |
| `welcome_series` | — | email | No |
| `designer_onboarding` | — | email | No |

**Transactional** types always send — they bypass preference checks and quiet hours.

Types marked with `—` for template don't have a template file yet; they'll need one before they can be sent via email.

---

## Notification Preferences

Preferences are stored in the `notification_preferences` table (one row per user). The `notify()` dispatcher checks these automatically.

### Preference columns

**Channel toggles:** `channels_email`, `channels_push`, `channels_in_app`, `channels_sms`

**Type toggles:** `type_new_lead`, `type_lead_expiring`, `type_lead_response`, `type_client_message`, `type_project_milestone`, `type_commission_earned`, `type_new_products`, `type_teaching_reminder`, `type_price_drop`, `type_back_in_stock`, `type_wishlist_update`, `type_weekly_inspiration`, `type_founding_circle`, `type_product_launch`, `type_seasonal_campaign`, `type_maker_spotlight`, `type_reengagement`

**Quiet hours:** `quiet_hours_enabled`, `quiet_hours_start` (HH:MM), `quiet_hours_end` (HH:MM), `timezone`

**Digest:** `digest_frequency` — `'daily'`, `'weekly'`, `'biweekly'`, `'monthly'`, `'never'`

### Reading preferences programmatically

```typescript
import { getUserPreferences, isTypeEnabled, isQuietHours } from '@patina/notifications';

const prefs = await getUserPreferences(supabase, userId);

if (isTypeEnabled(prefs, 'price_drop')) {
  // User wants price drop notifications
}

if (!isQuietHours(prefs)) {
  // Safe to send non-critical notifications
}
```

If no preferences row exists for a user, defaults are returned (all channels and types enabled, quiet hours off, weekly digest).

---

## Batch Sending

For campaigns or bulk notifications:

```typescript
import { sendBatchEmails } from '@patina/email';

const results = await sendBatchEmails([
  {
    to: 'user1@example.com',
    subject: 'New collection drop',
    react: <ProductLaunch {...props1} />,
  },
  {
    to: 'user2@example.com',
    subject: 'New collection drop',
    react: <ProductLaunch {...props2} />,
  },
]);

// results: SendEmailResult[] — one per email
```

Batch emails default to `SENDERS.marketing` (`hello@mail.patina.com`).

---

## Database Tables

| Table | Purpose |
|---|---|
| `notification_preferences` | Per-user channel/type toggles, quiet hours, digest settings |
| `notification_log` | Delivery audit trail — status, provider ID, open/click tracking |

Both tables have RLS enabled. Users can read/write their own preferences. Service role has full access.
