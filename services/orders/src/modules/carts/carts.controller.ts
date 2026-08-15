import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  CurrentUser,
  RequireAnyPermission,
  type AuthenticatedUserIdentity,
} from '@patina/auth';
import { Throttle } from '@nestjs/throttler';
import { CartsService } from './carts.service';
import { CreateCartDto, AddItemDto, UpdateItemDto, ApplyDiscountDto, CartResponseDto } from './dto';
import { ORDER_PERMISSIONS } from '../../common/authorization/orders-authorization.resolver';

@ApiTags('carts')
@Controller('carts')
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Post()
  @RequireAnyPermission(ORDER_PERMISSIONS.MANAGE_OWN, ORDER_PERMISSIONS.ADMIN_ALL)
  @ApiOperation({ summary: 'Create a new cart' })
  @ApiResponse({ status: 201, description: 'Cart created successfully', type: CartResponseDto })
  async create(
    @Body() createCartDto: CreateCartDto,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ): Promise<CartResponseDto> {
    const cart = await this.cartsService.create(createCartDto, user.sub);
    return CartResponseDto.fromPrisma(cart)!;
  }

  @Get(':id')
  @RequireAnyPermission(ORDER_PERMISSIONS.READ_OWN, ORDER_PERMISSIONS.ADMIN_ALL)
  @ApiOperation({ summary: 'Get cart by ID' })
  @ApiResponse({ status: 200, description: 'Cart found', type: CartResponseDto })
  @ApiResponse({ status: 404, description: 'Cart not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ): Promise<CartResponseDto> {
    const cart = await this.cartsService.findOne(id, user.sub);
    return CartResponseDto.fromPrisma(cart)!;
  }

  @Get('user/:userId/active')
  @RequireAnyPermission(ORDER_PERMISSIONS.READ_OWN, ORDER_PERMISSIONS.ADMIN_ALL)
  @ApiOperation({ summary: 'Get active cart for user' })
  @ApiResponse({ status: 200, description: 'Cart found or null', type: CartResponseDto })
  async findActiveByUser(
    @Param('userId') _ignoredUserId: string,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ): Promise<CartResponseDto | null> {
    const cart = await this.cartsService.findActiveByUser(user.sub);
    return cart ? CartResponseDto.fromPrisma(cart)! : null;
  }

  @Post(':id/items')
  @RequireAnyPermission(ORDER_PERMISSIONS.MANAGE_OWN, ORDER_PERMISSIONS.ADMIN_ALL)
  @ApiOperation({ summary: 'Add item to cart' })
  @ApiResponse({ status: 200, description: 'Item added successfully', type: CartResponseDto })
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async addItem(
    @Param('id') id: string,
    @Body() addItemDto: AddItemDto,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ): Promise<CartResponseDto> {
    const cart = await this.cartsService.addItem(id, addItemDto, user.sub);
    return CartResponseDto.fromPrisma(cart)!;
  }

  @Patch(':id/items/:itemId')
  @RequireAnyPermission(ORDER_PERMISSIONS.MANAGE_OWN, ORDER_PERMISSIONS.ADMIN_ALL)
  @ApiOperation({ summary: 'Update cart item quantity' })
  @ApiResponse({ status: 200, description: 'Item updated successfully', type: CartResponseDto })
  async updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() updateItemDto: UpdateItemDto,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ): Promise<CartResponseDto> {
    const cart = await this.cartsService.updateItem(id, itemId, updateItemDto, user.sub);
    return CartResponseDto.fromPrisma(cart)!;
  }

  @Delete(':id/items/:itemId')
  @RequireAnyPermission(ORDER_PERMISSIONS.MANAGE_OWN, ORDER_PERMISSIONS.ADMIN_ALL)
  @ApiOperation({ summary: 'Remove item from cart' })
  @ApiResponse({ status: 200, description: 'Item removed successfully', type: CartResponseDto })
  async removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ): Promise<CartResponseDto> {
    const cart = await this.cartsService.removeItem(id, itemId, user.sub);
    return CartResponseDto.fromPrisma(cart)!;
  }

  @Post(':id/apply-discount')
  @RequireAnyPermission(ORDER_PERMISSIONS.MANAGE_OWN, ORDER_PERMISSIONS.ADMIN_ALL)
  @ApiOperation({ summary: 'Apply discount code to cart' })
  @ApiResponse({ status: 200, description: 'Discount applied successfully', type: CartResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid discount code' })
  async applyDiscount(
    @Param('id') id: string,
    @Body() applyDiscountDto: ApplyDiscountDto,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ): Promise<CartResponseDto> {
    const cart = await this.cartsService.applyDiscount(id, applyDiscountDto, user.sub);
    return CartResponseDto.fromPrisma(cart)!;
  }

  @Delete(':id/discount')
  @RequireAnyPermission(ORDER_PERMISSIONS.MANAGE_OWN, ORDER_PERMISSIONS.ADMIN_ALL)
  @ApiOperation({ summary: 'Remove discount from cart' })
  @ApiResponse({ status: 200, description: 'Discount removed successfully', type: CartResponseDto })
  async removeDiscount(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ): Promise<CartResponseDto> {
    const cart = await this.cartsService.removeDiscount(id, user.sub);
    return CartResponseDto.fromPrisma(cart)!;
  }

  @Delete(':id/clear')
  @RequireAnyPermission(ORDER_PERMISSIONS.MANAGE_OWN, ORDER_PERMISSIONS.ADMIN_ALL)
  @ApiOperation({ summary: 'Clear all items from cart' })
  @ApiResponse({ status: 200, description: 'Cart cleared successfully', type: CartResponseDto })
  async clear(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ): Promise<CartResponseDto> {
    const cart = await this.cartsService.clear(id, user.sub);
    return CartResponseDto.fromPrisma(cart)!;
  }

  @Delete(':id')
  @RequireAnyPermission(ORDER_PERMISSIONS.MANAGE_OWN, ORDER_PERMISSIONS.ADMIN_ALL)
  @ApiOperation({ summary: 'Delete cart' })
  @ApiResponse({ status: 204, description: 'Cart deleted successfully' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ) {
    await this.cartsService.delete(id, user.sub);
  }

  @Post('batch')
  @RequireAnyPermission(ORDER_PERMISSIONS.READ_OWN, ORDER_PERMISSIONS.ADMIN_ALL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batch fetch carts by IDs' })
  @ApiResponse({ status: 200, description: 'Carts retrieved in order of requested IDs', type: [CartResponseDto] })
  async findByIds(
    @Body() body: { ids: string[] },
    @CurrentUser() user: AuthenticatedUserIdentity,
  ): Promise<CartResponseDto[]> {
    const carts = await this.cartsService.findByIds(body.ids, user.sub);
    return CartResponseDto.fromPrismaMany(carts);
  }
}
