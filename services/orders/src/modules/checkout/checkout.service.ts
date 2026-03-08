import { Injectable, BadRequestException, Inject, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-client';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';
import { generateIdentifierSuffix } from '@patina/utils';
import { Decimal } from '../../generated/prisma-client/runtime/library';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

@Injectable()
export class CheckoutService {
  constructor(
    private prisma: PrismaClient,
    private configService: ConfigService,
    @Inject('STRIPE_CLIENT') private stripe: Stripe,
    @Inject('EVENTS_SERVICE') private eventsService: any,
  ) {}

  /**
   * Create a Stripe Checkout Session
   */
  async createCheckoutSession(dto: CreateCheckoutDto) {
    // Get cart
    const cart = await this.prisma.cart.findUnique({
      where: { id: dto.cartId },
      include: { items: true },
    });

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    if (cart.status !== 'active') {
      throw new BadRequestException('Cart is not active');
    }

    if (cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    // Build line items for Stripe
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    for (const item of cart.items) {
      const unitAmount = new Decimal(item.unitPrice).mul(100).toNumber(); // Convert to cents

      lineItems.push({
        price_data: {
          currency: cart.currency.toLowerCase(),
          product_data: {
            name: item.name,
            description: `SKU: ${item.sku || 'N/A'}`,
            metadata: {
              productId: item.productId,
              variantId: item.variantId || '',
            },
          },
          unit_amount: unitAmount,
        },
        quantity: item.qty,
      });
    }

    // Apply discount if present
    const discounts: Stripe.Checkout.SessionCreateParams.Discount[] = [];
    if (cart.discountCode) {
      // Create or retrieve Stripe coupon
      const coupon = await this.getOrCreateStripeCoupon(cart.discountCode);
      if (coupon) {
        discounts.push({ coupon: coupon.id });
      }
    }

    // Create Stripe Checkout Session
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      line_items: lineItems,
      success_url: dto.returnUrl,
      cancel_url: dto.cancelUrl,
      customer_email: dto.customerEmail,
      client_reference_id: cart.id,
      metadata: {
        cartId: cart.id,
        userId: cart.userId || dto.userId || '',
        ...dto.metadata,
      },
      payment_intent_data: {
        metadata: {
          cartId: cart.id,
          userId: cart.userId || dto.userId || '',
        },
      },
      automatic_tax: {
        enabled: true, // Use Stripe Tax
      },
      shipping_address_collection: dto.shippingAddressId
        ? undefined
        : {
            allowed_countries: ['US', 'CA'],
          },
      payment_method_types: ['card'],
      allow_promotion_codes: true,
    };

    if (discounts.length > 0) {
      sessionParams.discounts = discounts;
    }

    const session = await this.stripe.checkout.sessions.create(sessionParams);

    // Create placeholder order
    const orderNumber = await this.generateOrderNumber();

    await this.prisma.order.create({
      data: {
        orderNumber,
        userId: cart.userId || dto.userId || 'guest',
        cartId: cart.id,
        status: 'created',
        paymentStatus: 'pending',
        fulfillmentStatus: 'unfulfilled',
        currency: cart.currency,
        subtotal: cart.subtotal,
        discountTotal: cart.discountAmount || new Decimal(0),
        taxTotal: cart.taxTotal,
        shippingTotal: cart.shippingTotal,
        total: cart.total,
        checkoutSessionId: session.id,
        shippingAddressId: dto.shippingAddressId,
        billingAddressId: dto.billingAddressId,
        snapshot: {
          cart,
          items: cart.items,
        },
      },
    });

    // Emit event
    await this.eventsService.publish('checkout.created', {
      id: uuidv4(),
      type: 'checkout.session_created',
      timestamp: new Date(),
      resource: `checkout:${session.id}`,
      payload: {
        sessionId: session.id,
        cartId: cart.id,
        amount: cart.total.toString(),
      },
    });

    return {
      sessionId: session.id,
      sessionUrl: session.url,
      orderNumber,
    };
  }

  /**
   * Create Payment Intent (for direct card processing)
   */
  async createPaymentIntent(dto: CreateCheckoutDto) {
    const cart = await this.prisma.cart.findUnique({
      where: { id: dto.cartId },
      include: { items: true },
    });

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    if (cart.status !== 'active') {
      throw new BadRequestException('Cart is not active');
    }

    if (cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    const amount = cart.total.mul(100).toNumber(); // Convert to cents

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount,
      currency: cart.currency.toLowerCase(),
      metadata: {
        cartId: cart.id,
        userId: cart.userId || dto.userId || '',
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Create order
    const orderNumber = await this.generateOrderNumber();

    await this.prisma.order.create({
      data: {
        orderNumber,
        userId: cart.userId || dto.userId || 'guest',
        cartId: cart.id,
        status: 'created',
        paymentStatus: 'pending',
        fulfillmentStatus: 'unfulfilled',
        currency: cart.currency,
        subtotal: cart.subtotal,
        discountTotal: cart.discountAmount || new Decimal(0),
        taxTotal: cart.taxTotal,
        shippingTotal: cart.shippingTotal,
        total: cart.total,
        paymentIntentId: paymentIntent.id,
        shippingAddressId: dto.shippingAddressId,
        billingAddressId: dto.billingAddressId,
        snapshot: {
          cart,
          items: cart.items,
        },
      },
    });

    await this.eventsService.publish('payment.intent.created', {
      id: uuidv4(),
      type: 'payment_intent.created',
      timestamp: new Date(),
      resource: `payment_intent:${paymentIntent.id}`,
      payload: {
        paymentIntentId: paymentIntent.id,
        cartId: cart.id,
        amount: cart.total.toString(),
      },
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      orderNumber,
    };
  }

  /**
   * Get or create Stripe coupon for discount
   */
  private async getOrCreateStripeCoupon(discountCode: string) {
    const discount = await this.prisma.discount.findUnique({
      where: { code: discountCode },
    });

    if (!discount || !discount.active) {
      return null;
    }

    try {
      // Try to retrieve existing coupon
      const coupon = await this.stripe.coupons.retrieve(discountCode);
      return coupon;
    } catch (error: any) {
      if (error.code === 'resource_missing') {
        // Create new coupon
        const couponParams: Stripe.CouponCreateParams = {
          id: discountCode,
          name: discount.name,
          currency: discount.currency?.toLowerCase() || 'usd',
        };

        if (discount.kind === 'percent') {
          couponParams.percent_off = discount.value.toNumber();
        } else if (discount.kind === 'fixed') {
          couponParams.amount_off = discount.value.mul(100).toNumber(); // Convert to cents
        }

        return await this.stripe.coupons.create(couponParams);
      }
      throw error;
    }
  }

  /**
   * Generate order number
   */
  private async generateOrderNumber(): Promise<string> {
    const prefix = this.configService.get('ORDER_NUMBER_PREFIX', 'ORD');
    const timestamp = Date.now().toString().slice(-8);
    const random = generateIdentifierSuffix(4);
    return `${prefix}-${timestamp}-${random}`;
  }
}
