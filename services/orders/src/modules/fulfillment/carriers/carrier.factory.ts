/**
 * Carrier Factory
 *
 * Factory for creating carrier instances based on configuration.
 * Supports multiple carrier providers with automatic fallback to mock in development.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ICarrier } from './carrier.interface';
import { EasyPostCarrier } from './easypost.carrier';
import { MockCarrier } from './mock.carrier';

export type CarrierProvider = 'easypost' | 'shipstation' | 'mock';

@Injectable()
export class CarrierFactory {
  private readonly logger = new Logger(CarrierFactory.name);

  constructor(
    private configService: ConfigService,
    private easyPostCarrier: EasyPostCarrier,
    private mockCarrier: MockCarrier,
  ) {
    // Log available carriers on startup
    const hasEasyPost = this.easyPostCarrier.isAvailable();
    this.logger.log(
      `Carrier factory initialized: EasyPost=${hasEasyPost ? 'available' : 'not configured'}, Mock=available`,
    );
  }

  /**
   * Get carrier instance based on provider
   * Falls back to mock carrier in development if EasyPost is not configured
   */
  getCarrier(provider?: CarrierProvider): ICarrier {
    const carrierProvider = provider || this.getDefaultProvider();

    switch (carrierProvider) {
      case 'easypost':
        if (!this.easyPostCarrier.isAvailable()) {
          this.logger.warn('EasyPost requested but not configured, falling back to mock carrier');
          return this.mockCarrier;
        }
        return this.easyPostCarrier;
      case 'mock':
        return this.mockCarrier;
      case 'shipstation':
        throw new Error('ShipStation carrier not yet implemented');
      default:
        throw new Error(`Unknown carrier provider: ${carrierProvider}`);
    }
  }

  /**
   * Check if a real (non-mock) carrier is available
   */
  hasRealCarrier(): boolean {
    return this.easyPostCarrier.isAvailable();
  }

  /**
   * Get default carrier provider from config
   * Falls back to mock if EasyPost is not configured in development
   */
  private getDefaultProvider(): CarrierProvider {
    const configuredProvider = this.configService.get<CarrierProvider>('CARRIER_PROVIDER');

    if (configuredProvider) {
      return configuredProvider;
    }

    // Auto-select based on environment and configuration
    if (this.easyPostCarrier.isAvailable()) {
      return 'easypost';
    }

    const isDevelopment = this.configService.get<string>('NODE_ENV') === 'development';
    if (isDevelopment) {
      this.logger.log('No carrier configured in development, using mock carrier');
      return 'mock';
    }

    // In production, require a real carrier
    throw new Error(
      'No carrier configured. Set EASYPOST_API_KEY or CARRIER_PROVIDER environment variable.',
    );
  }
}
