import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, ScanStatus } from '../../generated/prisma-client';
import * as clamav from 'clamav.js';

export interface ScanResult {
  clean: boolean;
  infected: boolean;
  virus?: string;
  threat?: string; // Alias for virus, used by interceptors
  scanTime: number;
}

@Injectable()
export class VirusScannerService {
  private readonly logger = new Logger(VirusScannerService.name);
  private clamavClient: any;
  private enabled: boolean;
  private initialized = false;
  private initializationError: string | null = null;

  constructor(
    private config: ConfigService,
    private prisma: PrismaClient,
  ) {
    this.enabled = this.config.get('VIRUS_SCAN_ENABLED', 'true') === 'true';

    if (this.enabled) {
      // Initialize asynchronously without blocking service startup
      this.initializeClamAVAsync();
    } else {
      this.logger.warn('Virus scanning is disabled via VIRUS_SCAN_ENABLED=false');
      this.initialized = true;
    }
  }

  /**
   * Initialize ClamAV client asynchronously (non-blocking)
   */
  private initializeClamAVAsync() {
    setImmediate(async () => {
      try {
        await this.initializeClamAV();
      } catch (error) {
        this.logger.error(
          `Failed to initialize ClamAV during startup: ${error.message}. ` +
          'Virus scanning will be disabled. Ensure ClamAV is running on the configured host:port.',
          error.stack,
        );
      }
    });
  }

  /**
   * Initialize ClamAV client (internal method)
   */
  private async initializeClamAV() {
    try {
      const host = this.config.get('CLAMAV_HOST', 'localhost');
      const port = this.config.get('CLAMAV_PORT', 3310);

      // Attempt to create scanner
      if (typeof clamav.createScanner === 'function') {
        this.clamavClient = clamav.createScanner(host, port);
        this.logger.log(`Connected to ClamAV at ${host}:${port}`);
      } else {
        throw new Error('ClamAV library not properly initialized: createScanner is not a function');
      }

      this.initialized = true;
    } catch (error) {
      this.logger.warn(`ClamAV initialization failed: ${error.message}`);
      this.initializationError = error.message;
      this.enabled = false;
      this.initialized = true;
    }
  }

  /**
   * Scan buffer for viruses
   */
  async scanBuffer(buffer: Buffer, assetId: string): Promise<ScanResult> {
    if (!this.enabled) {
      this.logger.debug('Virus scanning is disabled, skipping scan for asset ' + assetId);
      return { clean: true, infected: false, scanTime: 0 };
    }

    // Wait for initialization if not yet complete (with timeout)
    if (!this.initialized) {
      await this.waitForInitialization(5000); // 5 second timeout
      if (!this.initialized) {
        this.logger.warn('ClamAV initialization timeout, skipping scan for asset ' + assetId);
        return { clean: true, infected: false, scanTime: 0 };
      }
    }

    if (!this.enabled) {
      // May have been disabled during initialization
      this.logger.debug('Virus scanning disabled after initialization, skipping scan for asset ' + assetId);
      return { clean: true, infected: false, scanTime: 0 };
    }

    const startTime = Date.now();

    try {
      // Update asset scan status
      await this.prisma.mediaAsset.update({
        where: { id: assetId },
        data: { scanStatus: 'SCANNING' },
      });

      const result = await this.performScan(buffer);
      const scanTime = Date.now() - startTime;

      // Update asset with scan results
      await this.prisma.mediaAsset.update({
        where: { id: assetId },
        data: {
          scanStatus: result.infected ? 'INFECTED' : 'CLEAN',
          scanResult: result,
          status: result.infected ? 'QUARANTINED' : undefined,
        },
      });

      if (result.infected) {
        this.logger.warn(
          `INFECTED FILE DETECTED for asset ${assetId}: ${result.virus}`,
        );
      } else {
        this.logger.log(`File scan complete for asset ${assetId}: CLEAN (${scanTime}ms)`);
      }

      return { ...result, scanTime };
    } catch (error) {
      this.logger.error(`Scan failed for asset ${assetId}: ${error.message}`, error.stack);

      await this.prisma.mediaAsset.update({
        where: { id: assetId },
        data: {
          scanStatus: 'ERROR',
          scanResult: { error: error.message },
        },
      });

      // On scan error, allow file through (don't quarantine as safety measure if scanner is unavailable)
      return {
        clean: true,
        infected: false,
        scanTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Wait for ClamAV initialization to complete
   */
  private waitForInitialization(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = 100;
      let elapsed = 0;

      const interval = setInterval(() => {
        if (this.initialized || elapsed >= timeoutMs) {
          clearInterval(interval);
          resolve();
        }
        elapsed += checkInterval;
      }, checkInterval);
    });
  }

  /**
   * Perform actual virus scan
   */
  private async performScan(buffer: Buffer): Promise<Omit<ScanResult, 'scanTime'>> {
    return new Promise((resolve, reject) => {
      if (!this.clamavClient) {
        return reject(new Error('ClamAV client not initialized'));
      }

      this.clamavClient.scan(buffer, (err: any, object: any, virus: string) => {
        if (err) {
          return reject(err);
        }

        if (virus) {
          resolve({
            clean: false,
            infected: true,
            virus,
          });
        } else {
          resolve({
            clean: true,
            infected: false,
          });
        }
      });
    });
  }

  /**
   * Scan file by path (for local testing)
   */
  async scanFile(filePath: string, assetId: string): Promise<ScanResult> {
    if (!this.enabled) {
      return { clean: true, infected: false, scanTime: 0 };
    }

    const fs = require('fs');
    const buffer = fs.readFileSync(filePath);
    return this.scanBuffer(buffer, assetId);
  }

  /**
   * Get scan statistics
   */
  async getScanStats() {
    const stats = await this.prisma.mediaAsset.groupBy({
      by: ['scanStatus'],
      _count: true,
    });

    return stats.reduce(
      (acc, stat) => {
        acc[stat.scanStatus.toLowerCase()] = stat._count;
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  /**
   * Quarantine infected asset
   */
  async quarantineAsset(assetId: string, reason: string) {
    await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: {
        status: 'QUARANTINED',
        qcIssues: {
          quarantine: {
            reason,
            timestamp: new Date().toISOString(),
          },
        },
      },
    });

    this.logger.warn(`Asset ${assetId} quarantined: ${reason}`);
  }

  /**
   * Release quarantined asset (admin action)
   */
  async releaseAsset(assetId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
    });

    if (!asset || asset.status !== 'QUARANTINED') {
      throw new Error('Asset not quarantined');
    }

    await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: {
        status: 'PENDING',
      },
    });

    this.logger.log(`Released asset ${assetId} from quarantine`);
  }

  /**
   * Check ClamAV health
   */
  async checkHealth(): Promise<boolean> {
    if (!this.enabled) {
      return true; // Disabled is considered "healthy"
    }

    try {
      // Ping ClamAV
      const testBuffer = Buffer.from('test');
      await this.performScan(testBuffer);
      return true;
    } catch (error) {
      this.logger.error(`ClamAV health check failed: ${error.message}`);
      return false;
    }
  }
}
