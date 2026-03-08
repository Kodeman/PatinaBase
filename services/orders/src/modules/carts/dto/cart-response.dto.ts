import { Exclude, Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Cart Item Response DTO
 */
@Exclude()
export class CartItemResponseDto {
  @Expose()
  @ApiProperty({ description: 'Cart item ID', example: '123e4567-e89b-12d3-a456-426614174001' })
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
  @ApiProperty({ description: 'Quantity', example: 2 })
  qty: number;

  @Expose()
  @ApiProperty({ description: 'Unit price (decimal)', example: '1299.99' })
  unitPrice: string;

  @Expose()
  @ApiProperty({ description: 'Currency code', example: 'USD' })
  currency: string;

  @Expose()
  @ApiProperty({ description: 'Discount allocation (decimal)', nullable: true, example: '50.00' })
  discountAlloc: string | null;

  @Expose()
  @ApiProperty({ description: 'Tax amount (decimal)', nullable: true, example: '104.00' })
  taxAmount: string | null;

  @Expose()
  @ApiProperty({ description: 'Line total (decimal)', example: '2599.98' })
  lineTotal: string;

  @Expose()
  @ApiProperty({ description: 'Item creation date' })
  createdAt: Date;

  @Expose()
  @ApiProperty({ description: 'Item last update date' })
  updatedAt: Date;

  static fromPrisma(item: any): CartItemResponseDto | undefined {
    if (!item) return undefined;
    const dto = new CartItemResponseDto();
    dto.id = item.id;
    dto.productId = item.productId;
    dto.variantId = item.variantId;
    dto.name = item.name;
    dto.sku = item.sku;
    dto.qty = item.qty;
    dto.currency = item.currency;

    // Transform Decimal to string
    dto.unitPrice = item.unitPrice?.toString() || '0.00';
    dto.discountAlloc = item.discountAlloc ? item.discountAlloc.toString() : null;
    dto.taxAmount = item.taxAmount ? item.taxAmount.toString() : null;

    // Calculate line total: (unitPrice * qty) - discountAlloc + taxAmount
    const unitPrice = parseFloat(item.unitPrice?.toString() || '0');
    const discountAlloc = parseFloat(item.discountAlloc?.toString() || '0');
    const taxAmount = parseFloat(item.taxAmount?.toString() || '0');
    const lineTotal = unitPrice * item.qty - discountAlloc + taxAmount;
    dto.lineTotal = lineTotal.toFixed(2);

    dto.createdAt = item.createdAt;
    dto.updatedAt = item.updatedAt;

    return dto;
  }

  static fromPrismaMany(items: any[]): CartItemResponseDto[] {
    return (
      items?.map((i) => this.fromPrisma(i)).filter((i): i is CartItemResponseDto => i !== undefined) || []
    );
  }
}

/**
 * Cart Response DTO
 * Excludes sensitive internal fields
 */
@Exclude()
export class CartResponseDto {
  @Expose()
  @ApiProperty({ description: 'Cart ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'User ID', nullable: true, example: '123e4567-e89b-12d3-a456-426614174004' })
  userId: string | null;

  @Expose()
  @ApiProperty({
    description: 'Cart status',
    enum: ['active', 'expired', 'converted', 'abandoned'],
    example: 'active',
  })
  status: string;

  @Expose()
  @ApiProperty({ description: 'Currency code', example: 'USD' })
  currency: string;

  @Expose()
  @ApiProperty({ description: 'Discount code applied', nullable: true, example: 'SUMMER20' })
  discountCode: string | null;

  @Expose()
  @ApiProperty({ description: 'Discount amount (decimal)', nullable: true, example: '100.00' })
  discountAmount: string | null;

  @Expose()
  @ApiProperty({ description: 'Subtotal amount (decimal)', example: '2599.98' })
  subtotal: string;

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
  @ApiProperty({ description: 'Cart items', type: [CartItemResponseDto] })
  @Type(() => CartItemResponseDto)
  items: CartItemResponseDto[];

  @Expose()
  @ApiProperty({ description: 'Number of items in cart', example: 3 })
  itemCount: number;

  @Expose()
  @ApiProperty({ description: 'Cart expiration date', nullable: true })
  expiresAt: Date | null;

  @Expose()
  @ApiProperty({ description: 'Date cart was converted to order', nullable: true })
  convertedAt: Date | null;

  @Expose()
  @ApiProperty({ description: 'Cart creation date' })
  createdAt: Date;

  @Expose()
  @ApiProperty({ description: 'Cart last update date' })
  updatedAt: Date;

  // EXCLUDED FIELDS:
  // - sessionToken (sensitive)
  // - metadata (internal)
  // - shippingAddressId (internal foreign key)
  // - billingAddressId (internal foreign key)

  static fromPrisma(cart: any): CartResponseDto | undefined {
    if (!cart) return undefined;
    const dto = new CartResponseDto();

    dto.id = cart.id;
    dto.userId = cart.userId;
    dto.status = cart.status;
    dto.currency = cart.currency;
    dto.discountCode = cart.discountCode;

    // Transform Decimal to string
    dto.discountAmount = cart.discountAmount ? cart.discountAmount.toString() : null;
    dto.subtotal = cart.subtotal?.toString() || '0.00';
    dto.taxTotal = cart.taxTotal?.toString() || '0.00';
    dto.shippingTotal = cart.shippingTotal?.toString() || '0.00';
    dto.total = cart.total?.toString() || '0.00';

    // Transform cart items
    dto.items = cart.items ? CartItemResponseDto.fromPrismaMany(cart.items) : [];
    dto.itemCount = dto.items.length;

    // Timestamps
    dto.expiresAt = cart.expiresAt;
    dto.convertedAt = cart.convertedAt;
    dto.createdAt = cart.createdAt;
    dto.updatedAt = cart.updatedAt;

    return dto;
  }

  static fromPrismaMany(carts: any[]): CartResponseDto[] {
    return (
      carts?.map((c) => this.fromPrisma(c)).filter((c): c is CartResponseDto => c !== undefined) || []
    );
  }
}
