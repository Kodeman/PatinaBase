import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-client';
import { ConfigService } from '@nestjs/config';
import { Decimal } from '../../generated/prisma-client/runtime/library';
import { v4 as uuidv4 } from 'uuid';
import { CreateCartDto, AddItemDto, UpdateItemDto, ApplyDiscountDto } from './dto';

@Injectable()
export class CartsService {
  constructor(
    private prisma: PrismaClient,
    private configService: ConfigService,
    @Inject('EVENTS_SERVICE') private eventsService: any,
  ) {}

  /**
   * Create a new cart
   */
  async create(dto: CreateCartDto) {
    const expiryDays = this.configService.get<number>('CART_EXPIRY_DAYS', 30);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    const cart = await this.prisma.cart.create({
      data: {
        userId: dto.userId,
        sessionToken: dto.userId ? undefined : uuidv4(),
        currency: dto.currency || 'USD',
        expiresAt,
        status: 'active',
      },
      include: {
        items: true,
      },
    });

    // Add initial items if provided
    if (dto.items && dto.items.length > 0) {
      for (const item of dto.items) {
        await this.addItem(cart.id, {
          productId: item.productId,
          variantId: item.variantId,
          qty: item.qty || 1,
        });
      }
    }

    await this.eventsService.publish('cart.created', {
      id: uuidv4(),
      type: 'cart.created',
      timestamp: new Date(),
      resource: `cart:${cart.id}`,
      payload: { cartId: cart.id, userId: cart.userId },
    });

    return this.findOne(cart.id);
  }

  /**
   * Find a cart by ID
   */
  async findOne(id: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!cart) {
      throw new NotFoundException(`Cart ${id} not found`);
    }

    return cart;
  }

  /**
   * Find active cart for a user
   */
  async findActiveByUser(userId: string) {
    const cart = await this.prisma.cart.findFirst({
      where: {
        userId,
        status: 'active',
      },
      include: {
        items: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return cart;
  }

  /**
   * Add item to cart
   */
  async addItem(cartId: string, dto: AddItemDto) {
    const cart = await this.findOne(cartId);

    if (cart.status !== 'active') {
      throw new BadRequestException('Cannot modify inactive cart');
    }

    // Fetch product details (mock for now - would call catalog service)
    const product = await this.fetchProduct(dto.productId, dto.variantId);

    // Check if item already exists
    const existingItem = cart.items.find(
      (item) =>
        item.productId === dto.productId &&
        (dto.variantId ? item.variantId === dto.variantId : !item.variantId),
    );

    if (existingItem) {
      // Update quantity
      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          qty: existingItem.qty + dto.qty,
        },
      });
    } else {
      // Add new item
      await this.prisma.cartItem.create({
        data: {
          cartId,
          productId: dto.productId,
          variantId: dto.variantId,
          name: product.name,
          sku: product.sku,
          qty: dto.qty,
          unitPrice: new Decimal(product.price),
          currency: cart.currency,
          snapshot: product,
        },
      });
    }

    // Recalculate totals
    await this.recalculateTotals(cartId);

    await this.eventsService.publish('cart.updated', {
      id: uuidv4(),
      type: 'cart.item_added',
      timestamp: new Date(),
      resource: `cart:${cartId}`,
      payload: { cartId, productId: dto.productId, qty: dto.qty },
    });

    return this.findOne(cartId);
  }

  /**
   * Update cart item quantity
   */
  async updateItem(cartId: string, itemId: string, dto: UpdateItemDto) {
    const cart = await this.findOne(cartId);

    if (cart.status !== 'active') {
      throw new BadRequestException('Cannot modify inactive cart');
    }

    const item = cart.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException(`Item ${itemId} not found in cart`);
    }

    if (dto.qty === 0) {
      // Remove item
      await this.prisma.cartItem.delete({
        where: { id: itemId },
      });
    } else {
      // Update quantity
      await this.prisma.cartItem.update({
        where: { id: itemId },
        data: { qty: dto.qty },
      });
    }

    // Recalculate totals
    await this.recalculateTotals(cartId);

    await this.eventsService.publish('cart.updated', {
      id: uuidv4(),
      type: 'cart.item_updated',
      timestamp: new Date(),
      resource: `cart:${cartId}`,
      payload: { cartId, itemId, qty: dto.qty },
    });

    return this.findOne(cartId);
  }

  /**
   * Remove item from cart
   */
  async removeItem(cartId: string, itemId: string) {
    const cart = await this.findOne(cartId);

    if (cart.status !== 'active') {
      throw new BadRequestException('Cannot modify inactive cart');
    }

    await this.prisma.cartItem.delete({
      where: { id: itemId },
    });

    // Recalculate totals
    await this.recalculateTotals(cartId);

    await this.eventsService.publish('cart.updated', {
      id: uuidv4(),
      type: 'cart.item_removed',
      timestamp: new Date(),
      resource: `cart:${cartId}`,
      payload: { cartId, itemId },
    });

    return this.findOne(cartId);
  }

  /**
   * Apply discount code
   */
  async applyDiscount(cartId: string, dto: ApplyDiscountDto) {
    const cart = await this.findOne(cartId);

    if (cart.status !== 'active') {
      throw new BadRequestException('Cannot apply discount to inactive cart');
    }

    // Fetch discount
    const discount = await this.prisma.discount.findUnique({
      where: { code: dto.code },
    });

    if (!discount || !discount.active) {
      throw new NotFoundException('Invalid or inactive discount code');
    }

    // Validate discount eligibility
    const now = new Date();
    if (discount.startsAt && discount.startsAt > now) {
      throw new BadRequestException('Discount not yet active');
    }
    if (discount.endsAt && discount.endsAt < now) {
      throw new BadRequestException('Discount has expired');
    }

    // Check usage limits
    if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
      throw new BadRequestException('Discount usage limit reached');
    }

    // Apply discount to cart
    await this.prisma.cart.update({
      where: { id: cartId },
      data: {
        discountCode: discount.code,
      },
    });

    // Recalculate totals with discount
    await this.recalculateTotals(cartId);

    await this.eventsService.publish('cart.updated', {
      id: uuidv4(),
      type: 'cart.discount_applied',
      timestamp: new Date(),
      resource: `cart:${cartId}`,
      payload: { cartId, discountCode: discount.code },
    });

    return this.findOne(cartId);
  }

  /**
   * Remove discount from cart
   */
  async removeDiscount(cartId: string) {
    const cart = await this.findOne(cartId);

    await this.prisma.cart.update({
      where: { id: cartId },
      data: {
        discountCode: null,
        discountAmount: new Decimal(0),
      },
    });

    // Recalculate totals
    await this.recalculateTotals(cartId);

    await this.eventsService.publish('cart.updated', {
      id: uuidv4(),
      type: 'cart.discount_removed',
      timestamp: new Date(),
      resource: `cart:${cartId}`,
      payload: { cartId },
    });

    return this.findOne(cartId);
  }

  /**
   * Clear all items from cart
   */
  async clear(cartId: string) {
    const cart = await this.findOne(cartId);

    await this.prisma.cartItem.deleteMany({
      where: { cartId },
    });

    await this.prisma.cart.update({
      where: { id: cartId },
      data: {
        subtotal: new Decimal(0),
        discountAmount: new Decimal(0),
        taxTotal: new Decimal(0),
        shippingTotal: new Decimal(0),
        total: new Decimal(0),
      },
    });

    return this.findOne(cartId);
  }

  /**
   * Delete cart
   */
  async delete(cartId: string) {
    await this.findOne(cartId); // Verify exists

    await this.prisma.cart.update({
      where: { id: cartId },
      data: { status: 'expired' },
    });

    await this.eventsService.publish('cart.deleted', {
      id: uuidv4(),
      type: 'cart.deleted',
      timestamp: new Date(),
      resource: `cart:${cartId}`,
      payload: { cartId },
    });
  }

  /**
   * Recalculate cart totals
   */
  private async recalculateTotals(cartId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { id: cartId },
      include: { items: true },
    });

    if (!cart) return;

    // Calculate subtotal
    let subtotal = new Decimal(0);
    for (const item of cart.items) {
      const itemTotal = new Decimal(item.unitPrice).mul(item.qty);
      subtotal = subtotal.add(itemTotal);
    }

    // Calculate discount
    let discountAmount = new Decimal(0);
    if (cart.discountCode) {
      const discount = await this.prisma.discount.findUnique({
        where: { code: cart.discountCode },
      });

      if (discount && discount.active) {
        if (discount.kind === 'percent') {
          discountAmount = subtotal.mul(discount.value).div(100);
        } else if (discount.kind === 'fixed') {
          discountAmount = new Decimal(discount.value);
        }

        // Apply max discount limit
        if (discount.maxDiscount) {
          const maxDiscount = new Decimal(discount.maxDiscount);
          if (discountAmount.gt(maxDiscount)) {
            discountAmount = maxDiscount;
          }
        }

        // Ensure discount doesn't exceed subtotal
        if (discountAmount.gt(subtotal)) {
          discountAmount = subtotal;
        }

        // Allocate discount to line items proportionally
        if (discountAmount.gt(0)) {
          for (const item of cart.items) {
            const itemTotal = new Decimal(item.unitPrice).mul(item.qty);
            const itemDiscountAlloc = discountAmount.mul(itemTotal).div(subtotal);

            await this.prisma.cartItem.update({
              where: { id: item.id },
              data: { discountAlloc: itemDiscountAlloc },
            });
          }
        }
      }
    }

    // Calculate tax (simplified - would use Stripe Tax in production)
    const taxableAmount = subtotal.sub(discountAmount);
    const taxRate = new Decimal(0.0825); // 8.25% example
    const taxTotal = taxableAmount.mul(taxRate);

    // Shipping (placeholder)
    const shippingTotal = new Decimal(0);

    // Grand total
    const total = subtotal.sub(discountAmount).add(taxTotal).add(shippingTotal);

    // Update cart
    await this.prisma.cart.update({
      where: { id: cartId },
      data: {
        subtotal,
        discountAmount,
        taxTotal,
        shippingTotal,
        total,
      },
    });
  }

  /**
   * Get carts by multiple IDs (bulk fetch)
   */
  async findByIds(ids: string[]) {
    return this.prisma.cart.findMany({
      where: { id: { in: ids } },
      include: {
        items: true,
        discount: true,
        shippingAddress: true,
        billingAddress: true,
      },
    });
  }

  /**
   * Fetch product details (mock - would call catalog service)
   */
  private async fetchProduct(productId: string, variantId?: string) {
    // TODO: Call catalog service
    // For now, return mock data
    return {
      id: productId,
      variantId,
      name: 'Sample Product',
      sku: 'SKU-001',
      price: 99.99,
      currency: 'USD',
    };
  }
}
