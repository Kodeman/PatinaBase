import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VirusScannerService } from './virus-scanner.service';
import { PrismaClient } from '../../generated/prisma-client';

jest.mock('clamav.js');

describe('VirusScannerService', () => {
  let service: VirusScannerService;
  let config: jest.Mocked<ConfigService>;
  let prisma: jest.Mocked<PrismaClient>;
  let mockClamavClient: any;

  beforeEach(async () => {
    mockClamavClient = {
      scan: jest.fn(),
    };

    const clamav = require('clamav.js');
    clamav.createScanner = jest.fn().mockReturnValue(mockClamavClient);

    const mockConfig = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const values: Record<string, any> = {
          VIRUS_SCAN_ENABLED: 'true',
          CLAMAV_HOST: 'localhost',
          CLAMAV_PORT: 3310,
        };
        return values[key] || defaultValue;
      }),
    };

    const mockPrisma = {
      mediaAsset: {
        update: jest.fn(),
        groupBy: jest.fn(),
        findUnique: jest.fn(),
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VirusScannerService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: PrismaClient, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<VirusScannerService>(VirusScannerService);
    config = module.get(ConfigService) as jest.Mocked<ConfigService>;
    prisma = module.get(PrismaClient) as jest.Mocked<PrismaClient>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('scanBuffer', () => {
    it('should scan clean file successfully', async () => {
      const buffer = Buffer.from('clean file');
      const assetId = 'asset-123';

      mockClamavClient.scan.mockImplementation((buf: any, callback: any) => {
        callback(null, {}, null); // No virus
      });

      (prisma.mediaAsset.update as jest.Mock).mockResolvedValue({} as any);

      const result = await service.scanBuffer(buffer, assetId);

      expect(result.clean).toBe(true);
      expect(result.infected).toBe(false);
      expect(result.scanTime).toBeGreaterThanOrEqual(0);

      expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: assetId },
        data: expect.objectContaining({
          scanStatus: 'CLEAN',
        }),
      });
    });

    it('should detect infected file', async () => {
      const buffer = Buffer.from('infected file');
      const assetId = 'asset-456';

      mockClamavClient.scan.mockImplementation((buf: any, callback: any) => {
        callback(null, {}, 'EICAR-Test-File'); // Virus detected
      });

      (prisma.mediaAsset.update as jest.Mock).mockResolvedValue({} as any);

      const result = await service.scanBuffer(buffer, assetId);

      expect(result.clean).toBe(false);
      expect(result.infected).toBe(true);
      expect(result.virus).toBe('EICAR-Test-File');

      expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: assetId },
        data: expect.objectContaining({
          scanStatus: 'INFECTED',
          status: 'QUARANTINED',
        }),
      });
    });

    it('should handle scan errors', async () => {
      const buffer = Buffer.from('error file');
      const assetId = 'asset-789';

      mockClamavClient.scan.mockImplementation((buf: any, callback: any) => {
        callback(new Error('ClamAV error'), null, null);
      });

      (prisma.mediaAsset.update as jest.Mock).mockResolvedValue({} as any);

      const result = await service.scanBuffer(buffer, assetId);

      expect(result.infected).toBe(true);
      expect(result.virus).toBe('SCAN_ERROR');

      expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: assetId },
        data: expect.objectContaining({
          scanStatus: 'ERROR',
        }),
      });
    });

    it('should skip scan when disabled', async () => {
      config.get.mockReturnValue('false');

      // Recreate service with disabled scanning
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          VirusScannerService,
          { provide: ConfigService, useValue: config },
          { provide: PrismaClient, useValue: prisma },
        ],
      }).compile();

      const disabledService = module.get<VirusScannerService>(VirusScannerService);

      const buffer = Buffer.from('test file');
      const assetId = 'asset-skip';

      const result = await disabledService.scanBuffer(buffer, assetId);

      expect(result.clean).toBe(true);
      expect(result.scanTime).toBe(0);
      expect(mockClamavClient.scan).not.toHaveBeenCalled();
    });

    it('should update scan status before scanning', async () => {
      const buffer = Buffer.from('test');
      const assetId = 'asset-status';

      mockClamavClient.scan.mockImplementation((buf: any, callback: any) => {
        callback(null, {}, null);
      });

      (prisma.mediaAsset.update as jest.Mock).mockResolvedValue({} as any);

      await service.scanBuffer(buffer, assetId);

      expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: assetId },
        data: { scanStatus: 'SCANNING' },
      });
    });
  });

  describe('getScanStats', () => {
    it('should return scan statistics', async () => {
      const mockStats = [
        { scanStatus: 'CLEAN', _count: 150 },
        { scanStatus: 'INFECTED', _count: 5 },
        { scanStatus: 'PENDING', _count: 10 },
      ];

      (prisma.mediaAsset.groupBy as jest.Mock).mockResolvedValue(mockStats as any);

      const stats = await service.getScanStats();

      expect(stats).toEqual({
        clean: 150,
        infected: 5,
        pending: 10,
      });
    });
  });

  describe('quarantineAsset', () => {
    it('should quarantine asset with reason', async () => {
      const assetId = 'asset-quarantine';
      const reason = 'Detected malware';

      (prisma.mediaAsset.update as jest.Mock).mockResolvedValue({} as any);

      await service.quarantineAsset(assetId, reason);

      expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: assetId },
        data: expect.objectContaining({
          status: 'QUARANTINED',
          qcIssues: expect.objectContaining({
            quarantine: expect.objectContaining({
              reason,
            }),
          }),
        }),
      });
    });
  });

  describe('releaseAsset', () => {
    it('should release quarantined asset', async () => {
      const assetId = 'asset-release';

      (prisma.mediaAsset.findUnique as jest.Mock).mockResolvedValue({
        id: assetId,
        status: 'QUARANTINED',
      } as any);

      (prisma.mediaAsset.update as jest.Mock).mockResolvedValue({} as any);

      await service.releaseAsset(assetId);

      expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: assetId },
        data: { status: 'PENDING' },
      });
    });

    it('should throw error if asset not quarantined', async () => {
      const assetId = 'asset-not-quarantined';

      (prisma.mediaAsset.findUnique as jest.Mock).mockResolvedValue({
        id: assetId,
        status: 'CLEAN',
      } as any);

      await expect(service.releaseAsset(assetId)).rejects.toThrow('Asset not quarantined');
    });

    it('should throw error if asset not found', async () => {
      const assetId = 'asset-missing';

      (prisma.mediaAsset.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.releaseAsset(assetId)).rejects.toThrow('Asset not quarantined');
    });
  });

  describe('checkHealth', () => {
    it('should return true when ClamAV is healthy', async () => {
      mockClamavClient.scan.mockImplementation((buf: any, callback: any) => {
        callback(null, {}, null);
      });

      const health = await service.checkHealth();

      expect(health).toBe(true);
    });

    it('should return false when ClamAV is unhealthy', async () => {
      mockClamavClient.scan.mockImplementation((buf: any, callback: any) => {
        callback(new Error('ClamAV down'), null, null);
      });

      const health = await service.checkHealth();

      expect(health).toBe(false);
    });

    it('should return true when scanning is disabled', async () => {
      config.get.mockReturnValue('false');

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          VirusScannerService,
          { provide: ConfigService, useValue: config },
          { provide: PrismaClient, useValue: prisma },
        ],
      }).compile();

      const disabledService = module.get<VirusScannerService>(VirusScannerService);

      const health = await disabledService.checkHealth();

      expect(health).toBe(true);
    });
  });
});
