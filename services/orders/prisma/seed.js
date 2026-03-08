const { PrismaClient } = require('../src/generated/prisma-client');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting orders database seed...');

  // Clean existing data
  console.log('Cleaning existing data...');
  await prisma.refund.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.discount.deleteMany();

  // Create sample discount codes
  console.log('Creating discount codes...');
  const discounts = await Promise.all([
    prisma.discount.create({
      data: {
        code: 'WELCOME10',
        name: 'Welcome 10% Off',
        description: 'Welcome discount for new customers',
        kind: 'percent',
        value: 10,
        usageLimit: 100,
        usageCount: 12,
        startsAt: new Date('2025-01-01'),
        endsAt: new Date('2025-12-31'),
        active: true,
        eligibleProducts: [],
        eligibleCategories: [],
      },
    }),
    prisma.discount.create({
      data: {
        code: 'SUMMER25',
        name: 'Summer Sale 25% Off',
        description: 'Summer sale discount',
        kind: 'percent',
        value: 25,
        usageLimit: 50,
        usageCount: 8,
        startsAt: new Date('2025-06-01'),
        endsAt: new Date('2025-08-31'),
        active: true,
        eligibleProducts: [],
        eligibleCategories: [],
      },
    }),
    prisma.discount.create({
      data: {
        code: 'FLAT50',
        name: '$50 Off',
        description: '$50 off your order',
        kind: 'fixed',
        value: 50,
        currency: 'USD',
        usageLimit: 200,
        usageCount: 45,
        startsAt: new Date('2025-01-01'),
        endsAt: new Date('2025-12-31'),
        active: true,
        eligibleProducts: [],
        eligibleCategories: [],
      },
    }),
  ]);
  console.log(`Created ${discounts.length} discount codes`);

  // Create sample active carts
  console.log('Creating sample carts...');
  const carts = await Promise.all([
    prisma.cart.create({
      data: {
        userId: 'client-001', // Would reference actual user IDs
        status: 'active',
        currency: 'USD',
        subtotal: 1250.00,
        taxTotal: 106.25,
        shippingTotal: 0,
        total: 1356.25,
        items: {
          create: [
            {
              productId: 'prod-001',
              variantId: 'var-001',
              name: 'Modern Sofa - Gray',
              sku: 'SKU-LIVING-001',
              qty: 1,
              unitPrice: 1250.00,
              currency: 'USD',
              snapshot: { image: '/products/sofa-gray.jpg' },
            },
          ],
        },
      },
    }),
    prisma.cart.create({
      data: {
        userId: 'client-002',
        status: 'active',
        currency: 'USD',
        discountCode: 'WELCOME10',
        discountAmount: 45.00,
        subtotal: 450.00,
        taxTotal: 34.42,
        shippingTotal: 25.00,
        total: 464.42,
        items: {
          create: [
            {
              productId: 'prod-002',
              variantId: 'var-002',
              name: 'Dining Chair Set',
              sku: 'SKU-DINING-002',
              qty: 4,
              unitPrice: 112.50,
              currency: 'USD',
              discountAlloc: 45.00,
              snapshot: { image: '/products/chair-set.jpg' },
            },
          ],
        },
      },
    }),
  ]);
  console.log(`Created ${carts.length} active carts`);

  // Create sample orders
  console.log('Creating sample orders...');
  const orders = [];

  // Completed order
  const order1 = await prisma.order.create({
    data: {
      orderNumber: 'ORD-2025-001',
      userId: 'client-003',
      status: 'fulfilled',
      paymentStatus: 'captured',
      fulfillmentStatus: 'fulfilled',
      currency: 'USD',
      subtotal: 2850.00,
      taxTotal: 242.25,
      shippingTotal: 0,
      total: 3092.25,
      snapshot: {
        customerEmail: 'client3@example.com',
        shippingAddress: {
          fullName: 'John Doe',
          addressLine1: '123 Main St',
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94102',
          country: 'US',
          phone: '+1-555-0123',
        },
        billingAddress: {
          fullName: 'John Doe',
          addressLine1: '123 Main St',
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94102',
          country: 'US',
        },
      },
      fulfilledAt: new Date('2025-10-01'),
      items: {
        create: [
          {
            productId: 'prod-003',
            variantId: 'var-003',
            name: 'King Bed Frame',
            sku: 'SKU-BEDROOM-003',
            qty: 1,
            unitPrice: 1850.00,
            currency: 'USD',
            subtotal: 1850.00,
            total: 1850.00,
            snapshot: { image: '/products/bed-frame.jpg' },
          },
          {
            productId: 'prod-004',
            variantId: 'var-004',
            name: 'Nightstand Set',
            sku: 'SKU-BEDROOM-004',
            qty: 2,
            unitPrice: 500.00,
            currency: 'USD',
            subtotal: 1000.00,
            total: 1000.00,
            snapshot: { image: '/products/nightstand.jpg' },
          },
        ],
      },
      payments: {
        create: {
          provider: 'stripe',
          paymentIntentId: 'pi_test_12345',
          chargeId: 'ch_test_12345',
          status: 'succeeded',
          amount: 3092.25,
          currency: 'USD',
          last4: '4242',
          brand: 'visa',
          raw: {
            paymentMethod: 'card',
          },
        },
      },
    },
  });
  orders.push(order1);

  // Processing order
  const order2 = await prisma.order.create({
    data: {
      orderNumber: 'ORD-2025-002',
      userId: 'client-004',
      status: 'processing',
      paymentStatus: 'captured',
      fulfillmentStatus: 'partial',
      currency: 'USD',
      discountTotal: 187.50,
      subtotal: 750.00,
      taxTotal: 47.81,
      shippingTotal: 35.00,
      total: 645.31,
      snapshot: {
        customerEmail: 'client4@example.com',
        discountCode: 'SUMMER25',
        shippingAddress: {
          fullName: 'Jane Smith',
          addressLine1: '456 Oak Ave',
          city: 'Los Angeles',
          state: 'CA',
          postalCode: '90001',
          country: 'US',
          phone: '+1-555-0456',
        },
      },
      items: {
        create: [
          {
            productId: 'prod-005',
            variantId: 'var-005',
            name: 'Office Desk',
            sku: 'SKU-OFFICE-005',
            qty: 1,
            unitPrice: 750.00,
            currency: 'USD',
            discountAlloc: 187.50,
            subtotal: 750.00,
            total: 562.50,
            snapshot: { image: '/products/desk.jpg' },
          },
        ],
      },
      payments: {
        create: {
          provider: 'stripe',
          paymentIntentId: 'pi_test_67890',
          chargeId: 'ch_test_67890',
          status: 'succeeded',
          amount: 645.31,
          currency: 'USD',
          last4: '5555',
          brand: 'mastercard',
          raw: {
            paymentMethod: 'card',
          },
        },
      },
    },
  });
  orders.push(order2);

  // Cancelled order with refund
  const order3 = await prisma.order.create({
    data: {
      orderNumber: 'ORD-2025-003',
      userId: 'client-005',
      status: 'canceled',
      paymentStatus: 'refunded',
      fulfillmentStatus: 'unfulfilled',
      currency: 'USD',
      subtotal: 425.00,
      taxTotal: 36.12,
      shippingTotal: 15.00,
      total: 476.12,
      snapshot: {
        customerEmail: 'client5@example.com',
        shippingAddress: {
          fullName: 'Bob Johnson',
          addressLine1: '789 Pine St',
          city: 'Seattle',
          state: 'WA',
          postalCode: '98101',
          country: 'US',
          phone: '+1-555-0789',
        },
      },
      canceledAt: new Date('2025-10-02'),
      items: {
        create: [
          {
            productId: 'prod-006',
            variantId: 'var-006',
            name: 'Table Lamp',
            sku: 'SKU-LIGHTING-006',
            qty: 1,
            unitPrice: 125.00,
            currency: 'USD',
            subtotal: 125.00,
            total: 125.00,
            snapshot: { image: '/products/lamp.jpg' },
          },
          {
            productId: 'prod-007',
            variantId: 'var-007',
            name: 'Decorative Rug',
            sku: 'SKU-RUGS-007',
            qty: 1,
            unitPrice: 300.00,
            currency: 'USD',
            subtotal: 300.00,
            total: 300.00,
            snapshot: { image: '/products/rug.jpg' },
          },
        ],
      },
      payments: {
        create: {
          provider: 'stripe',
          paymentIntentId: 'pi_test_refunded',
          chargeId: 'ch_test_refunded',
          status: 'refunded',
          amount: 476.12,
          currency: 'USD',
          last4: '1111',
          brand: 'amex',
          raw: {
            paymentMethod: 'card',
          },
        },
      },
    },
  });

  // Create refund for the cancelled order
  await prisma.refund.create({
    data: {
      orderId: order3.id,
      provider: 'stripe',
      providerRefundId: 're_test_12345',
      amount: 476.12,
      currency: 'USD',
      status: 'succeeded',
      reason: 'requested_by_customer',
      processedAt: new Date('2025-10-02'),
    },
  });

  orders.push(order3);

  console.log(`Created ${orders.length} sample orders`);

  // Summary
  console.log('\nSeed Summary:');
  console.log(`- ${discounts.length} discount codes`);
  console.log(`- ${carts.length} active carts`);
  console.log(`- ${orders.length} orders (1 completed, 1 processing, 1 cancelled with refund)`);
  console.log('Orders seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
