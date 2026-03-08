import { Exclude, Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Shared Address DTO for shipping and billing
 */
@Exclude()
export class AddressDto {
  @Expose()
  @ApiProperty({ description: 'Street address', example: '123 Main St' })
  street: string;

  @Expose()
  @ApiProperty({ description: 'City', example: 'New York' })
  city: string;

  @Expose()
  @ApiProperty({ description: 'State/Province', example: 'NY' })
  state: string;

  @Expose()
  @ApiProperty({ description: 'Postal/ZIP code', example: '10001' })
  zipCode: string;

  @Expose()
  @ApiProperty({ description: 'Country code', example: 'US' })
  country: string;

  static fromValueObject(address: any): AddressDto | null {
    if (!address) return null;
    const dto = new AddressDto();
    dto.street = address.street;
    dto.city = address.city;
    dto.state = address.state;
    dto.zipCode = address.zipCode || address.postalCode;
    dto.country = address.country;
    return dto;
  }
}

/**
 * Order Item Response DTO
 */
@Exclude()
export class OrderItemResponseDto {
  @Expose()
  @ApiProperty({ description: 'Order item ID', example: '123e4567-e89b-12d3-a456-426614174001' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'Product ID', example: '123e4567-e89b-12d3-a456-426614174002' })
  productId: string;

  @Expose()
  @ApiProperty({ description: 'Variant ID', nullable: true, example: '123e4567-e89b-12d3-a456-426614174003' })
  variantId: string | null;

  @Expose()
  @ApiProperty({ description: 'Product name', example: 'Velvet Sofa' })
  name: string;

  @Expose()
  @ApiProperty({ description: 'SKU', nullable: true, example: 'SOFA-VEL-BLU-001' })
  sku: string | null;

  @Expose()
  @ApiProperty({ description: 'Quantity ordered', example: 2 })
  quantity: number;

  @Expose()
  @ApiProperty({ description: 'Unit price (decimal)', example: '1299.99' })
  unitPrice: string;

  @Expose()
  @ApiProperty({ description: 'Tax amount (decimal)', example: '104.00' })
  taxAmount: string;

  @Expose()
  @ApiProperty({ description: 'Discount amount (decimal)', example: '50.00' })
  discountAmount: string;

  @Expose()
  @ApiProperty({ description: 'Subtotal (decimal)', example: '2599.98' })
  subtotal: string;

  @Expose()
  @ApiProperty({ description: 'Total (decimal)', example: '2653.98' })
  total: string;

  @Expose()
  @ApiProperty({ description: 'Quantity fulfilled', example: 2 })
  quantityFulfilled: number;

  @Expose()
  @ApiProperty({ description: 'Quantity refunded', example: 0 })
  quantityRefunded: number;

  @Expose()
  @ApiProperty({ description: 'Quantity remaining to fulfill', example: 0 })
  quantityRemaining: number;

  @Expose()
  @ApiProperty({ description: 'Item creation date' })
  createdAt: Date;

  static fromPrisma(item: any): OrderItemResponseDto | undefined {
    if (!item) return undefined;
    const dto = new OrderItemResponseDto();
    dto.id = item.id;
    dto.productId = item.productId;
    dto.variantId = item.variantId;
    dto.name = item.name;
    dto.sku = item.sku;
    dto.quantity = item.qty;

    // Transform Decimal to decimal strings
    dto.unitPrice = item.unitPrice?.toString() || '0.00';
    dto.taxAmount = item.taxAmount?.toString() || '0.00';
    dto.discountAmount = item.discountAlloc?.toString() || '0.00';

    // Calculate subtotal and total
    const unitPrice = parseFloat(item.unitPrice?.toString() || '0');
    const qty = item.qty || 0;
    const taxAmount = parseFloat(item.taxAmount?.toString() || '0');
    const discountAmount = parseFloat(item.discountAlloc?.toString() || '0');

    dto.subtotal = (unitPrice * qty).toFixed(2);
    dto.total = (unitPrice * qty - discountAmount + taxAmount).toFixed(2);

    dto.quantityFulfilled = item.qtyFulfilled || 0;
    dto.quantityRefunded = item.qtyRefunded || 0;
    dto.quantityRemaining = qty - (item.qtyFulfilled || 0) - (item.qtyRefunded || 0);
    dto.createdAt = item.createdAt;

    return dto;
  }

  static fromPrismaMany(items: any[]): OrderItemResponseDto[] {
    return (
      items?.map((i) => this.fromPrisma(i)).filter((i): i is OrderItemResponseDto => i !== undefined) || []
    );
  }
}

/**
 * Order Response DTO
 * Excludes sensitive internal fields
 */
@Exclude()
export class OrderResponseDto {
  @Expose()
  @ApiProperty({ description: 'Order ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'Human-readable order number', example: 'ORD-20241018-001' })
  orderNumber: string;

  @Expose()
  @ApiProperty({ description: 'User ID', example: '123e4567-e89b-12d3-a456-426614174004' })
  userId: string;

  @Expose()
  @ApiProperty({ description: 'Cart ID', nullable: true, example: '123e4567-e89b-12d3-a456-426614174005' })
  cartId: string | null;

  @Expose()
  @ApiProperty({
    description: 'Order status',
    enum: ['created', 'paid', 'processing', 'fulfilled', 'closed', 'canceled', 'refunded'],
    example: 'paid',
  })
  status: string;

  @Expose()
  @ApiProperty({
    description: 'Payment status',
    enum: ['pending', 'authorized', 'captured', 'refunded', 'failed', 'canceled'],
    example: 'captured',
  })
  paymentStatus: string;

  @Expose()
  @ApiProperty({
    description: 'Fulfillment status',
    enum: ['unfulfilled', 'partial', 'fulfilled'],
    example: 'fulfilled',
  })
  fulfillmentStatus: string;

  @Expose()
  @ApiProperty({ description: 'Currency code', example: 'USD' })
  currency: string;

  @Expose()
  @ApiProperty({ description: 'Subtotal amount (decimal)', example: '2599.98' })
  subtotal: string;

  @Expose()
  @ApiProperty({ description: 'Discount total (decimal)', example: '100.00' })
  discountTotal: string;

  @Expose()
  @ApiProperty({ description: 'Tax total (decimal)', example: '208.00' })
  taxTotal: string;

  @Expose()
  @ApiProperty({ description: 'Shipping total (decimal)', example: '29.99' })
  shippingTotal: string;

  @Expose()
  @ApiProperty({ description: 'Grand total (decimal)', example: '2737.97' })
  total: string;

  @Expose()
  @ApiProperty({ description: 'Shipping address', type: AddressDto })
  @Type(() => AddressDto)
  shippingAddress: AddressDto | null;

  @Expose()
  @ApiProperty({ description: 'Billing address', type: AddressDto })
  @Type(() => AddressDto)
  billingAddress: AddressDto | null;

  @Expose()
  @ApiProperty({ description: 'Shipping method', nullable: true, example: 'standard' })
  shippingMethod: string | null;

  @Expose()
  @ApiProperty({ description: 'Customer notes', nullable: true, example: 'Please ring doorbell' })
  customerNotes: string | null;

  @Expose()
  @ApiProperty({ description: 'Order items', type: [OrderItemResponseDto] })
  @Type(() => OrderItemResponseDto)
  items: OrderItemResponseDto[];

  @Expose()
  @ApiProperty({ description: 'Number of items in order', example: 3 })
  itemCount: number;

  @Expose()
  @ApiProperty({ description: 'Date payment was captured', nullable: true })
  paidAt: Date | null;

  @Expose()
  @ApiProperty({ description: 'Date order was fulfilled', nullable: true })
  fulfilledAt: Date | null;

  @Expose()
  @ApiProperty({ description: 'Date order was closed', nullable: true })
  closedAt: Date | null;

  @Expose()
  @ApiProperty({ description: 'Date order was canceled', nullable: true })
  canceledAt: Date | null;

  @Expose()
  @ApiProperty({ description: 'Order creation date' })
  createdAt: Date;

  @Expose()
  @ApiProperty({ description: 'Order last update date' })
  updatedAt: Date;

  // EXCLUDED FIELDS:
  // - internalNotes (sensitive)
  // - paymentIntentId (sensitive)
  // - checkoutSessionId (sensitive)
  // - customerId (sensitive)
  // - snapshot (internal)
  // - metadata (internal)

  static fromPrisma(order: any): OrderResponseDto | undefined {
    if (!order) return undefined;

    const dto = new OrderResponseDto();

    dto.id = order.id;
    dto.orderNumber = order.orderNumber;
    dto.userId = order.userId;
    dto.cartId = order.cartId;

    // Status fields are already strings in Prisma
    dto.status = order.status;
    dto.paymentStatus = order.paymentStatus;
    dto.fulfillmentStatus = order.fulfillmentStatus;

    dto.currency = order.currency;

    // Transform Decimal to decimal strings
    dto.subtotal = order.subtotal?.toString() || '0.00';
    dto.discountTotal = order.discountTotal?.toString() || '0.00';
    dto.taxTotal = order.taxTotal?.toString() || '0.00';
    dto.shippingTotal = order.shippingTotal?.toString() || '0.00';
    dto.total = order.total?.toString() || '0.00';

    // Transform Address relations
    dto.shippingAddress = AddressDto.fromValueObject(order.shippingAddress);
    dto.billingAddress = AddressDto.fromValueObject(order.billingAddress);

    dto.shippingMethod = order.shippingMethod;
    dto.customerNotes = order.customerNotes;

    // Transform order items
    dto.items = order.items ? OrderItemResponseDto.fromPrismaMany(order.items) : [];
    dto.itemCount = dto.items.length;

    // Timestamps
    dto.paidAt = order.paidAt;
    dto.fulfilledAt = order.fulfilledAt;
    dto.closedAt = order.closedAt;
    dto.canceledAt = order.canceledAt;
    dto.createdAt = order.createdAt;
    dto.updatedAt = order.updatedAt;

    return dto;
  }

  static fromPrismaMany(orders: any[]): OrderResponseDto[] {
    return (
      orders?.map((o) => this.fromPrisma(o)).filter((o): o is OrderResponseDto => o !== undefined) || []
    );
  }
}
