/**
 * Order Mapper
 * Converts between Domain entities and Prisma models
 *
 * Handles the transformation of the Order aggregate (including OrderItems)
 * between domain and persistence layers.
 */

import {
  Order as PrismaOrder,
  OrderItem as PrismaOrderItem,
  Address as PrismaAddress,
} from '../../generated/prisma-client';
import { Order, OrderProps } from '../../domain/entities/order.entity';
import { OrderItem, OrderItemProps } from '../../domain/entities/order-item.entity';
import { OrderStatus } from '../../domain/value-objects/order-status.vo';
import { PaymentStatus } from '../../domain/value-objects/payment-status.vo';
import { FulfillmentStatus } from '../../domain/value-objects/fulfillment-status.vo';
import { Money, AddressVO as Address, AddressComponents } from '@patina/types';
import { Prisma } from '../../generated/prisma-client';

// Import Decimal as both type and value
type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

/**
 * Type for Prisma Order with relations
 */
export type PrismaOrderWithRelations = PrismaOrder & {
  items: PrismaOrderItem[];
  shippingAddress?: PrismaAddress | null;
  billingAddress?: PrismaAddress | null;
};

export class OrderMapper {
  /**
   * Convert Prisma model to Domain entity
   */
  static toDomain(prismaOrder: PrismaOrderWithRelations): Order {
    const currency = prismaOrder.currency;

    // Map order items
    const items = prismaOrder.items.map((item) => this.mapOrderItemToDomain(item));

    // Map addresses
    const shippingAddress = prismaOrder.shippingAddress
      ? this.mapAddressToDomain(prismaOrder.shippingAddress)
      : null;
    const billingAddress = prismaOrder.billingAddress
      ? this.mapAddressToDomain(prismaOrder.billingAddress)
      : null;

    const props: OrderProps = {
      id: prismaOrder.id,
      orderNumber: prismaOrder.orderNumber,
      userId: prismaOrder.userId,
      cartId: prismaOrder.cartId,
      status: OrderStatus.create(prismaOrder.status as any),
      paymentStatus: PaymentStatus.create(prismaOrder.paymentStatus as any),
      fulfillmentStatus: FulfillmentStatus.create(prismaOrder.fulfillmentStatus as any),
      currency: prismaOrder.currency,
      subtotal: Money.create(this.decimalToNumber(prismaOrder.subtotal), currency as any),
      discountTotal: Money.create(this.decimalToNumber(prismaOrder.discountTotal), currency as any),
      taxTotal: Money.create(this.decimalToNumber(prismaOrder.taxTotal), currency as any),
      shippingTotal: Money.create(this.decimalToNumber(prismaOrder.shippingTotal), currency as any),
      total: Money.create(this.decimalToNumber(prismaOrder.total), currency as any),
      shippingAddress,
      billingAddress,
      shippingMethod: prismaOrder.shippingMethod,
      customerNotes: prismaOrder.customerNotes,
      internalNotes: prismaOrder.internalNotes,
      metadata: prismaOrder.metadata ? (prismaOrder.metadata as any) : null,
      snapshot: prismaOrder.snapshot as any,
      items,
      paymentIntentId: prismaOrder.paymentIntentId,
      checkoutSessionId: prismaOrder.checkoutSessionId,
      customerId: prismaOrder.customerId,
      paidAt: prismaOrder.paidAt,
      fulfilledAt: prismaOrder.fulfilledAt,
      closedAt: prismaOrder.closedAt,
      canceledAt: prismaOrder.canceledAt,
      createdAt: prismaOrder.createdAt,
      updatedAt: prismaOrder.updatedAt,
    };

    return Order.reconstitute(props);
  }

  /**
   * Convert array of Prisma models to Domain entities
   */
  static toDomainArray(prismaOrders: PrismaOrderWithRelations[]): Order[] {
    return prismaOrders.map((order) => this.toDomain(order));
  }

  /**
   * Convert Domain entity to Prisma create data
   */
  static toPrismaCreate(order: Order): {
    order: Prisma.OrderCreateInput;
    items: Prisma.OrderItemCreateManyInput[];
  } {
    const props = order.toProps();
    const items = props.items.map((item) => this.mapOrderItemToPrismaCreate(item, props.id));

    const orderData: Prisma.OrderCreateInput = {
      id: props.id || undefined,
      orderNumber: props.orderNumber,
      userId: props.userId,
      cartId: props.cartId,
      status: props.status.getValue(),
      paymentStatus: props.paymentStatus.getValue(),
      fulfillmentStatus: props.fulfillmentStatus.getValue(),
      currency: props.currency,
      subtotal: new Decimal(props.subtotal.getAmount()),
      discountTotal: new Decimal(props.discountTotal.getAmount()),
      taxTotal: new Decimal(props.taxTotal.getAmount()),
      shippingTotal: new Decimal(props.shippingTotal.getAmount()),
      total: new Decimal(props.total.getAmount()),
      shippingMethod: props.shippingMethod,
      customerNotes: props.customerNotes,
      internalNotes: props.internalNotes,
      metadata: props.metadata ? (props.metadata as any) : Prisma.JsonNull,
      snapshot: props.snapshot as any,
      paymentIntentId: props.paymentIntentId,
      checkoutSessionId: props.checkoutSessionId,
      customerId: props.customerId,
      paidAt: props.paidAt,
      fulfilledAt: props.fulfilledAt,
      closedAt: props.closedAt,
      canceledAt: props.canceledAt,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    };

    return { order: orderData, items };
  }

  /**
   * Convert Domain entity to Prisma update data
   */
  static toPrismaUpdate(order: Order): {
    order: Prisma.OrderUpdateInput;
    items: Prisma.OrderItemCreateManyInput[];
  } {
    const props = order.toProps();
    const items = props.items.map((item) => this.mapOrderItemToPrismaCreate(item, props.id));

    const orderData: Prisma.OrderUpdateInput = {
      status: props.status.getValue(),
      paymentStatus: props.paymentStatus.getValue(),
      fulfillmentStatus: props.fulfillmentStatus.getValue(),
      subtotal: new Decimal(props.subtotal.getAmount()),
      discountTotal: new Decimal(props.discountTotal.getAmount()),
      taxTotal: new Decimal(props.taxTotal.getAmount()),
      shippingTotal: new Decimal(props.shippingTotal.getAmount()),
      total: new Decimal(props.total.getAmount()),
      shippingMethod: props.shippingMethod,
      customerNotes: props.customerNotes,
      internalNotes: props.internalNotes,
      metadata: props.metadata ? (props.metadata as any) : Prisma.JsonNull,
      snapshot: props.snapshot as any,
      paymentIntentId: props.paymentIntentId,
      checkoutSessionId: props.checkoutSessionId,
      customerId: props.customerId,
      paidAt: props.paidAt,
      fulfilledAt: props.fulfilledAt,
      closedAt: props.closedAt,
      canceledAt: props.canceledAt,
      updatedAt: props.updatedAt,
    };

    return { order: orderData, items };
  }

  /**
   * Map Prisma OrderItem to Domain OrderItem
   */
  private static mapOrderItemToDomain(prismaItem: PrismaOrderItem): OrderItem {
    const currency = prismaItem.currency;

    // Calculate tax amount from taxLines if available
    const taxLines = prismaItem.taxLines as any[];
    const taxAmount = taxLines?.reduce((sum: number, line: any) => sum + (line.amount || 0), 0) || 0;

    const props: OrderItemProps = {
      id: prismaItem.id,
      orderId: prismaItem.orderId,
      productId: prismaItem.productId,
      variantId: prismaItem.variantId,
      name: prismaItem.name,
      sku: prismaItem.sku,
      quantity: prismaItem.qty,
      unitPrice: Money.create(this.decimalToNumber(prismaItem.unitPrice), currency as any),
      taxAmount: Money.create(taxAmount, currency as any),
      discountAmount: Money.create(this.decimalToNumber(prismaItem.discountAlloc || 0), currency as any),
      subtotal: Money.create(this.decimalToNumber(prismaItem.subtotal), currency as any),
      total: Money.create(this.decimalToNumber(prismaItem.total), currency as any),
      snapshot: prismaItem.snapshot as any,
      metadata: prismaItem.metadata ? (prismaItem.metadata as any) : null,
      quantityFulfilled: prismaItem.qtyFulfilled,
      quantityRefunded: prismaItem.qtyRefunded,
      createdAt: prismaItem.createdAt,
    };

    return OrderItem.reconstitute(props);
  }

  /**
   * Map Domain OrderItem to Prisma create data
   */
  private static mapOrderItemToPrismaCreate(item: OrderItem, orderId: string): Prisma.OrderItemCreateManyInput {
    const props = item.toProps();

    return {
      id: props.id || undefined,
      orderId: orderId,
      productId: props.productId,
      variantId: props.variantId,
      name: props.name,
      sku: props.sku,
      qty: props.quantity,
      unitPrice: new Decimal(props.unitPrice.getAmount()),
      currency: props.unitPrice.getCurrency(),
      taxLines: Prisma.JsonNull, // TODO: Implement tax lines
      discountAlloc: new Decimal(props.discountAmount.getAmount()),
      subtotal: new Decimal(props.subtotal.getAmount()),
      total: new Decimal(props.total.getAmount()),
      snapshot: props.snapshot as any,
      metadata: props.metadata ? (props.metadata as any) : Prisma.JsonNull,
      qtyFulfilled: props.quantityFulfilled,
      qtyRefunded: props.quantityRefunded,
      createdAt: props.createdAt,
    };
  }

  /**
   * Map Prisma Address to Domain Address
   */
  private static mapAddressToDomain(prismaAddress: PrismaAddress): Address {
    const components: AddressComponents = {
      street1: prismaAddress.line1,
      street2: prismaAddress.line2 || undefined,
      city: prismaAddress.city,
      state: prismaAddress.region || '',
      postalCode: prismaAddress.postal,
      country: prismaAddress.country as any,
    };

    return Address.create(components);
  }

  /**
   * Convert Decimal to number
   */
  private static decimalToNumber(decimal: Decimal | number | null | undefined): number {
    if (decimal === null || decimal === undefined) {
      return 0;
    }
    if (typeof decimal === 'number') {
      return decimal;
    }
    return decimal.toNumber();
  }
}
