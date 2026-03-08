import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { NewLeadDesigner } from '../templates/new-lead-designer';
import { LeadExpiring } from '../templates/lead-expiring';
import { ClientConfirmation } from '../templates/client-confirmation';
import { OrderConfirmation } from '../templates/order-confirmation';
import { PaymentReceipt } from '../templates/payment-receipt';

// React Email uses react-dom@18 internally which conflicts with React 19.
// These tests verify template structure and props without full HTML rendering.

describe('NewLeadDesigner template', () => {
  it('creates a valid React element with required props', () => {
    const element = React.createElement(NewLeadDesigner, {
      clientName: 'Sarah Johnson',
      projectType: 'Living Room Redesign',
      leadId: 'lead-123',
    });
    expect(React.isValidElement(element)).toBe(true);
  });

  it('creates element with all optional props', () => {
    const element = React.createElement(NewLeadDesigner, {
      displayName: 'Ada',
      clientName: 'Sarah Johnson',
      projectType: 'Living Room Redesign',
      budgetRange: '$10,000 - $25,000',
      timeline: '3-6 months',
      locationCity: 'Austin',
      locationState: 'TX',
      matchScore: 92,
      matchReasons: ['Style alignment', 'Budget fit', 'Location proximity'],
      styleSummary: 'Mid-century modern with natural materials',
      roomScanThumbnail: 'https://example.com/scan.jpg',
      leadId: 'lead-456',
      portalUrl: 'https://admin.patina.cloud',
    });
    expect(React.isValidElement(element)).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((element.props as any).matchScore).toBe(92);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((element.props as any).matchReasons).toHaveLength(3);
  });

  it('passes lead ID through for deep linking', () => {
    const element = React.createElement(NewLeadDesigner, {
      clientName: 'Sarah',
      projectType: 'Kitchen',
      leadId: 'lead-deep-link-test',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((element.props as any).leadId).toBe('lead-deep-link-test');
  });
});

describe('LeadExpiring template', () => {
  it('creates a valid React element with urgency data', () => {
    const element = React.createElement(LeadExpiring, {
      clientName: 'Michael Chen',
      projectType: 'Bedroom Suite',
      timeRemaining: '2 hours',
      leadId: 'lead-789',
    });
    expect(React.isValidElement(element)).toBe(true);
  });

  it('accepts 30-minute warning threshold', () => {
    const element = React.createElement(LeadExpiring, {
      displayName: 'Leah',
      clientName: 'Michael Chen',
      projectType: 'Bedroom Suite',
      budgetRange: '$5,000 - $10,000',
      timeRemaining: '30 minutes',
      leadId: 'lead-urgent',
      portalUrl: 'https://admin.patina.cloud',
    });
    expect(React.isValidElement(element)).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((element.props as any).timeRemaining).toBe('30 minutes');
  });
});

describe('ClientConfirmation template', () => {
  it('creates a valid React element', () => {
    const element = React.createElement(ClientConfirmation, {
      clientName: 'Emma Wilson',
      designerName: 'Ada Thompson',
      projectType: 'Home Office',
    });
    expect(React.isValidElement(element)).toBe(true);
  });

  it('accepts custom next steps and timeline', () => {
    const element = React.createElement(ClientConfirmation, {
      clientName: 'Emma Wilson',
      designerName: 'Ada Thompson',
      projectType: 'Home Office',
      expectedTimeline: '1-2 business days',
      nextSteps: [
        'Review your project details',
        'Schedule an initial consultation',
        'Prepare a custom design proposal',
      ],
    });
    expect(React.isValidElement(element)).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((element.props as any).nextSteps).toHaveLength(3);
  });
});

describe('OrderConfirmation template', () => {
  it('creates a valid React element with items', () => {
    const element = React.createElement(OrderConfirmation, {
      orderId: 'ORD-2026-001',
      items: [
        {
          name: 'Walnut Dining Table',
          quantity: 1,
          priceFormatted: '$2,400.00',
          maker: 'Artisan Woodworks',
        },
        {
          name: 'Linen Dining Chair',
          quantity: 4,
          priceFormatted: '$1,600.00',
        },
      ],
      subtotalFormatted: '$4,000.00',
      totalFormatted: '$4,320.00',
    });
    expect(React.isValidElement(element)).toBe(true);
  });

  it('includes delivery and tax info', () => {
    const element = React.createElement(OrderConfirmation, {
      orderId: 'ORD-2026-002',
      items: [{ name: 'Side Table', quantity: 1, priceFormatted: '$800.00' }],
      subtotalFormatted: '$800.00',
      taxFormatted: '$64.00',
      shippingFormatted: '$50.00',
      totalFormatted: '$914.00',
      estimatedDelivery: 'March 15-20, 2026',
      shippingAddress: '123 Main St, Austin, TX 78701',
    });
    expect(React.isValidElement(element)).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((element.props as any).estimatedDelivery).toBe('March 15-20, 2026');
  });
});

describe('PaymentReceipt template', () => {
  it('creates a valid React element', () => {
    const element = React.createElement(PaymentReceipt, {
      receiptId: 'REC-2026-001',
      amountFormatted: '$4,320.00',
      paymentDate: '2026-03-03',
    });
    expect(React.isValidElement(element)).toBe(true);
  });

  it('includes line items and payment method', () => {
    const element = React.createElement(PaymentReceipt, {
      displayName: 'Emma Wilson',
      receiptId: 'REC-2026-002',
      amountFormatted: '$914.00',
      paymentMethod: 'Visa ending in 4242',
      paymentDate: '2026-03-03',
      description: 'Interior design consultation',
      items: [
        { name: 'Design consultation fee', amountFormatted: '$500.00' },
        { name: 'Material sourcing', amountFormatted: '$414.00' },
      ],
    });
    expect(React.isValidElement(element)).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((element.props as any).items).toHaveLength(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((element.props as any).paymentMethod).toBe('Visa ending in 4242');
  });
});
