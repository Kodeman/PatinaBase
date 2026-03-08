import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CartsService } from './carts.service';
import { CreateCartDto, AddItemDto, UpdateItemDto, ApplyDiscountDto, CartResponseDto } from './dto';

@ApiTags('carts')
@Controller('carts')
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new cart' })
  @ApiResponse({ status: 201, description: 'Cart created successfully', type: CartResponseDto })
  async create(@Body() createCartDto: CreateCartDto): Promise<CartResponseDto> {
    const cart = await this.cartsService.create(createCartDto);
    return CartResponseDto.fromPrisma(cart)!;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get cart by ID' })
  @ApiResponse({ status: 200, description: 'Cart found', type: CartResponseDto })
  @ApiResponse({ status: 404, description: 'Cart not found' })
  async findOne(@Param('id') id: string): Promise<CartResponseDto> {
    const cart = await this.cartsService.findOne(id);
    return CartResponseDto.fromPrisma(cart)!;
  }

  @Get('user/:userId/active')
  @ApiOperation({ summary: 'Get active cart for user' })
  @ApiResponse({ status: 200, description: 'Cart found or null', type: CartResponseDto })
  async findActiveByUser(@Param('userId') userId: string): Promise<CartResponseDto | null> {
    const cart = await this.cartsService.findActiveByUser(userId);
    return cart ? CartResponseDto.fromPrisma(cart)! : null;
  }

  @Post(':id/items')
  @ApiOperation({ summary: 'Add item to cart' })
  @ApiResponse({ status: 200, description: 'Item added successfully', type: CartResponseDto })
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async addItem(@Param('id') id: string, @Body() addItemDto: AddItemDto): Promise<CartResponseDto> {
    const cart = await this.cartsService.addItem(id, addItemDto);
    return CartResponseDto.fromPrisma(cart)!;
  }

  @Patch(':id/items/:itemId')
  @ApiOperation({ summary: 'Update cart item quantity' })
  @ApiResponse({ status: 200, description: 'Item updated successfully', type: CartResponseDto })
  async updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() updateItemDto: UpdateItemDto,
  ): Promise<CartResponseDto> {
    const cart = await this.cartsService.updateItem(id, itemId, updateItemDto);
    return CartResponseDto.fromPrisma(cart)!;
  }

  @Delete(':id/items/:itemId')
  @ApiOperation({ summary: 'Remove item from cart' })
  @ApiResponse({ status: 200, description: 'Item removed successfully', type: CartResponseDto })
  async removeItem(@Param('id') id: string, @Param('itemId') itemId: string): Promise<CartResponseDto> {
    const cart = await this.cartsService.removeItem(id, itemId);
    return CartResponseDto.fromPrisma(cart)!;
  }

  @Post(':id/apply-discount')
  @ApiOperation({ summary: 'Apply discount code to cart' })
  @ApiResponse({ status: 200, description: 'Discount applied successfully', type: CartResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid discount code' })
  async applyDiscount(
    @Param('id') id: string,
    @Body() applyDiscountDto: ApplyDiscountDto,
  ): Promise<CartResponseDto> {
    const cart = await this.cartsService.applyDiscount(id, applyDiscountDto);
    return CartResponseDto.fromPrisma(cart)!;
  }

  @Delete(':id/discount')
  @ApiOperation({ summary: 'Remove discount from cart' })
  @ApiResponse({ status: 200, description: 'Discount removed successfully', type: CartResponseDto })
  async removeDiscount(@Param('id') id: string): Promise<CartResponseDto> {
    const cart = await this.cartsService.removeDiscount(id);
    return CartResponseDto.fromPrisma(cart)!;
  }

  @Delete(':id/clear')
  @ApiOperation({ summary: 'Clear all items from cart' })
  @ApiResponse({ status: 200, description: 'Cart cleared successfully', type: CartResponseDto })
  async clear(@Param('id') id: string): Promise<CartResponseDto> {
    const cart = await this.cartsService.clear(id);
    return CartResponseDto.fromPrisma(cart)!;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete cart' })
  @ApiResponse({ status: 204, description: 'Cart deleted successfully' })
  async delete(@Param('id') id: string) {
    await this.cartsService.delete(id);
  }

  @Post('batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batch fetch carts by IDs' })
  @ApiResponse({ status: 200, description: 'Carts retrieved in order of requested IDs', type: [CartResponseDto] })
  async findByIds(@Body() body: { ids: string[] }): Promise<(CartResponseDto | null)[]> {
    const carts = await this.cartsService.findByIds(body.ids);
    // CRITICAL: Return in same order as requested IDs for DataLoader
    const cartsMap = new Map(carts.map(c => [c.id, c]));
    return body.ids.map(id => {
      const cart = cartsMap.get(id);
      return cart ? CartResponseDto.fromPrisma(cart)! : null;
    });
  }
}
