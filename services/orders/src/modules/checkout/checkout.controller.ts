import { Controller, Post, Body, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CheckoutService } from './checkout.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

@ApiTags('checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post()
  @ApiOperation({ summary: 'Create Stripe Checkout Session' })
  @ApiResponse({ status: 201, description: 'Checkout session created' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async createCheckoutSession(
    @Body() createCheckoutDto: CreateCheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.checkoutService.createCheckoutSession(createCheckoutDto);
  }

  @Post('payment-intent')
  @ApiOperation({ summary: 'Create Payment Intent (direct card processing)' })
  @ApiResponse({ status: 201, description: 'Payment intent created' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async createPaymentIntent(
    @Body() createCheckoutDto: CreateCheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.checkoutService.createPaymentIntent(createCheckoutDto);
  }
}
