import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { Decimal } from '../../generated/prisma-client/runtime/library';
import { CreateCartDto, AddItemDto, UpdateItemDto, ApplyDiscountDto } from './dto';
import {
  OrdersAuthorizationResolver,
  type OrdersDatabaseClient,
} from '../../common/authorization/orders-authorization.resolver';

@Injectable()
export class CartsService {
  constructor(
    private readonly authorization: OrdersAuthorizationResolver,
    private readonly configService: ConfigService,
    @Inject('EVENTS_SERVICE') private readonly eventsService: any,
  ) {}

  async create(dto: CreateCartDto, subject: string) {
    const expiryDays = this.configService.get<number>('CART_EXPIRY_DAYS', 30);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    const cart = await this.authorization.authorize(subject, 'manage', async (database, state) => {
      this.authorization.cartScope(state, 'manage');
      const created = await database.cart.create({
        data: {
          userId: subject,
          currency: dto.currency || 'USD',
          expiresAt,
          status: 'active',
        },
      });

      for (const item of dto.items ?? []) {
        const product = await this.fetchProduct(item.productId, item.variantId);
        await database.cartItem.create({
          data: {
            cartId: created.id,
            productId: item.productId,
            variantId: item.variantId,
            name: product.name,
            sku: product.sku,
            qty: item.qty || 1,
            unitPrice: new Decimal(product.price),
            currency: created.currency,
            snapshot: product,
          },
        });
      }
      await this.recalculateTotals(database, created.id);
      return database.cart.findUniqueOrThrow({ where: { id: created.id }, include: { items: true } });
    });

    await this.publish('cart.created', 'cart.created', cart.id, { cartId: cart.id });
    return cart;
  }

  async findOne(id: string, subject: string) {
    return this.authorization.authorizeCart(subject, 'read', id, async (_database, _state, cart) => cart);
  }

  async findActiveByUser(subject: string) {
    return this.authorization.authorize(subject, 'read', async (database, state) => {
      const scope = this.authorization.cartScope(state, 'read');
      return database.cart.findFirst({
        where: { AND: [scope, { status: 'active' }] },
        include: { items: true },
        orderBy: { updatedAt: 'desc' },
      });
    });
  }

  async addItem(cartId: string, dto: AddItemDto, subject: string) {
    const result = await this.authorization.authorizeCart(
      subject,
      'manage',
      cartId,
      async (database, _state, cart) => {
        this.assertActive(cart.status);
        const product = await this.fetchProduct(dto.productId, dto.variantId);
        const existingItem = cart.items.find(
          (item) =>
            item.productId === dto.productId &&
            (dto.variantId ? item.variantId === dto.variantId : !item.variantId),
        );

        if (existingItem) {
          await database.cartItem.update({
            where: { id: existingItem.id },
            data: { qty: existingItem.qty + dto.qty },
          });
        } else {
          await database.cartItem.create({
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
        await this.recalculateTotals(database, cartId);
        return database.cart.findUniqueOrThrow({ where: { id: cartId }, include: { items: true } });
      },
    );
    await this.publish('cart.updated', 'cart.item_added', cartId, { cartId });
    return result;
  }

  async updateItem(cartId: string, itemId: string, dto: UpdateItemDto, subject: string) {
    const result = await this.authorization.authorizeCart(
      subject,
      'manage',
      cartId,
      async (database, _state, cart) => {
        this.assertActive(cart.status);
        const item = cart.items.find((candidate) => candidate.id === itemId);
        if (!item) throw new NotFoundException('Cart item not found');
        if (dto.qty === 0) {
          await database.cartItem.delete({ where: { id: item.id } });
        } else {
          await database.cartItem.update({ where: { id: item.id }, data: { qty: dto.qty } });
        }
        await this.recalculateTotals(database, cartId);
        return database.cart.findUniqueOrThrow({ where: { id: cartId }, include: { items: true } });
      },
    );
    await this.publish('cart.updated', 'cart.item_updated', cartId, { cartId });
    return result;
  }

  async removeItem(cartId: string, itemId: string, subject: string) {
    const result = await this.authorization.authorizeCart(
      subject,
      'manage',
      cartId,
      async (database, _state, cart) => {
        this.assertActive(cart.status);
        const item = cart.items.find((candidate) => candidate.id === itemId);
        if (!item) throw new NotFoundException('Cart item not found');
        await database.cartItem.delete({ where: { id: item.id } });
        await this.recalculateTotals(database, cartId);
        return database.cart.findUniqueOrThrow({ where: { id: cartId }, include: { items: true } });
      },
    );
    await this.publish('cart.updated', 'cart.item_removed', cartId, { cartId });
    return result;
  }

  async applyDiscount(cartId: string, dto: ApplyDiscountDto, subject: string) {
    const result = await this.authorization.authorizeCart(
      subject,
      'manage',
      cartId,
      async (database, _state, cart) => {
        this.assertActive(cart.status);
        const discount = await database.discount.findUnique({ where: { code: dto.code } });
        if (!discount || !discount.active) throw new NotFoundException('Discount not found');
        const now = new Date();
        if (discount.startsAt && discount.startsAt > now) throw new BadRequestException('Discount not yet active');
        if (discount.endsAt && discount.endsAt < now) throw new BadRequestException('Discount has expired');
        if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
          throw new BadRequestException('Discount usage limit reached');
        }
        await database.cart.update({ where: { id: cartId }, data: { discountCode: discount.code } });
        await this.recalculateTotals(database, cartId);
        return database.cart.findUniqueOrThrow({ where: { id: cartId }, include: { items: true } });
      },
    );
    await this.publish('cart.updated', 'cart.discount_applied', cartId, { cartId });
    return result;
  }

  async removeDiscount(cartId: string, subject: string) {
    const result = await this.authorization.authorizeCart(
      subject,
      'manage',
      cartId,
      async (database, _state, cart) => {
        this.assertActive(cart.status);
        await database.cart.update({
          where: { id: cartId },
          data: { discountCode: null, discountAmount: new Decimal(0) },
        });
        await this.recalculateTotals(database, cartId);
        return database.cart.findUniqueOrThrow({ where: { id: cartId }, include: { items: true } });
      },
    );
    await this.publish('cart.updated', 'cart.discount_removed', cartId, { cartId });
    return result;
  }

  async clear(cartId: string, subject: string) {
    return this.authorization.authorizeCart(subject, 'manage', cartId, async (database, _state, cart) => {
      this.assertActive(cart.status);
      await database.cartItem.deleteMany({ where: { cartId } });
      await database.cart.update({
        where: { id: cartId },
        data: {
          subtotal: new Decimal(0),
          discountAmount: new Decimal(0),
          taxTotal: new Decimal(0),
          shippingTotal: new Decimal(0),
          total: new Decimal(0),
        },
      });
      return database.cart.findUniqueOrThrow({ where: { id: cartId }, include: { items: true } });
    });
  }

  async delete(cartId: string, subject: string) {
    await this.authorization.authorizeCart(subject, 'manage', cartId, async (database) => {
      await database.cart.update({ where: { id: cartId }, data: { status: 'expired' } });
    });
    await this.publish('cart.deleted', 'cart.deleted', cartId, { cartId });
  }

  async findByIds(ids: string[], subject: string) {
    return this.authorization.authorize(subject, 'read', async (database, state) => {
      const scope = this.authorization.cartScope(state, 'read');
      return database.cart.findMany({
        where: { AND: [{ id: { in: ids } }, scope] },
        include: { items: true, discount: true, shippingAddress: true, billingAddress: true },
      });
    });
  }

  private async recalculateTotals(database: OrdersDatabaseClient, cartId: string) {
    const cart = await database.cart.findUnique({ where: { id: cartId }, include: { items: true } });
    if (!cart) throw new NotFoundException('Cart not found');

    let subtotal = new Decimal(0);
    for (const item of cart.items) subtotal = subtotal.add(new Decimal(item.unitPrice).mul(item.qty));

    let discountAmount = new Decimal(0);
    if (cart.discountCode) {
      const discount = await database.discount.findUnique({ where: { code: cart.discountCode } });
      if (discount?.active) {
        discountAmount = discount.kind === 'percent'
          ? subtotal.mul(discount.value).div(100)
          : new Decimal(discount.value);
        if (discount.maxDiscount && discountAmount.gt(discount.maxDiscount)) {
          discountAmount = new Decimal(discount.maxDiscount);
        }
        if (discountAmount.gt(subtotal)) discountAmount = subtotal;
        if (discountAmount.gt(0) && subtotal.gt(0)) {
          for (const item of cart.items) {
            const allocation = discountAmount.mul(new Decimal(item.unitPrice).mul(item.qty)).div(subtotal);
            await database.cartItem.update({ where: { id: item.id }, data: { discountAlloc: allocation } });
          }
        }
      }
    }

    const taxTotal = subtotal.sub(discountAmount).mul(new Decimal(0.0825));
    const shippingTotal = new Decimal(0);
    await database.cart.update({
      where: { id: cartId },
      data: {
        subtotal,
        discountAmount,
        taxTotal,
        shippingTotal,
        total: subtotal.sub(discountAmount).add(taxTotal).add(shippingTotal),
      },
    });
  }

  private assertActive(status: string) {
    if (status !== 'active') throw new BadRequestException('Cannot modify inactive cart');
  }

  private publish(topic: string, type: string, cartId: string, payload: Record<string, unknown>) {
    return this.eventsService.publish(topic, {
      id: uuidv4(),
      type,
      timestamp: new Date(),
      resource: `cart:${cartId}`,
      payload,
    });
  }

  private async fetchProduct(productId: string, variantId?: string) {
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
