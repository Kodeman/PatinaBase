import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OCIStorageService, PAROptions } from './oci-storage.service';
import * as os from 'oci-objectstorage';

// Mock OCI modules
jest.mock('oci-objectstorage');
jest.mock('oci-common');

describe('OCIStorageService', () => {
  let service: OCIStorageService;
  let config: jest.Mocked<ConfigService>;
  let mockObjectStorageClient: any;

  beforeEach(async () => {
    mockObjectStorageClient = {
      createPreauthenticatedRequest: jest.fn(),
      putObject: jest.fn(),
      getObject: jest.fn(),
      deleteObject: jest.fn(),
      copyObject: jest.fn(),
    };

    // Mock the ObjectStorageClient constructor
    (os.ObjectStorageClient as any) = jest.fn().mockImplementation(() => mockObjectStorageClient);

    const mockConfig = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const values: Record<string, any> = {
          OCI_CONFIG_FILE: '~/.oci/config',
          OCI_CONFIG_PROFILE: 'DEFAULT',
          OCI_OBJECT_STORAGE_NAMESPACE: 'test-namespace',
          OCI_REGION: 'us-ashburn-1',
          CDN_DOMAIN: 'cdn.patina.app',
          OCI_BUCKET_PUBLIC: 'public-bucket',
          OCI_BUCKET_PROCESSED: 'processed-bucket',
        };
        return values[key] || defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OCIStorageService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<OCIStorageService>(OCIStorageService);
    config = module.get(ConfigService) as jest.Mocked<ConfigService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createPAR', () => {
    it('should create PAR for object write', async () => {
      const options: PAROptions = {
        bucketName: 'raw-bucket',
        objectName: 'raw/images/123/test.jpg',
        accessType: 'ObjectWrite',
        timeExpires: new Date('2025-10-05T12:00:00Z'),
      };

      const mockResponse = {
        preauthenticatedRequest: {
          accessUri: '/p/abc123def456',
          timeExpires: options.timeExpires,
        },
      };

      mockObjectStorageClient.createPreauthenticatedRequest.mockResolvedValue(mockResponse);

      const result = await service.createPAR(options);

      expect(result).toEqual({
        parUrl: '/p/abc123def456',
        fullUrl: 'https://objectstorage.us-ashburn-1.oraclecloud.com/p/abc123def456',
        expiresAt: options.timeExpires,
      });

      expect(mockObjectStorageClient.createPreauthenticatedRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          namespaceName: 'test-namespace',
          bucketName: 'raw-bucket',
          createPreauthenticatedRequestDetails: expect.objectContaining({
            objectName: 'raw/images/123/test.jpg',
            timeExpires: options.timeExpires,
          }),
        }),
      );
    });

    it('should create PAR for object read', async () => {
      const options: PAROptions = {
        bucketName: 'processed-bucket',
        objectName: 'processed/images/123/1024x1024.webp',
        accessType: 'ObjectRead',
        timeExpires: new Date(),
      };

      mockObjectStorageClient.createPreauthenticatedRequest.mockResolvedValue({
        preauthenticatedRequest: {
          accessUri: '/p/read123',
          timeExpires: options.timeExpires,
        },
      });

      const result = await service.createPAR(options);

      expect(result.parUrl).toBe('/p/read123');
    });

    it('should handle PAR creation errors', async () => {
      const options: PAROptions = {
        bucketName: 'test-bucket',
        objectName: 'test.jpg',
        accessType: 'ObjectWrite',
        timeExpires: new Date(),
      };

      const error = new Error('OCI API Error: Bucket not found');
      mockObjectStorageClient.createPreauthenticatedRequest.mockRejectedValue(error);

      await expect(service.createPAR(options)).rejects.toThrow(error);
    });
  });

  describe('putObject', () => {
    it('should upload buffer to object storage', async () => {
      const bucketName = 'raw-bucket';
      const objectName = 'raw/images/123/test.jpg';
      const buffer = Buffer.from('test image data');

      mockObjectStorageClient.putObject.mockResolvedValue({});

      await service.putObject(bucketName, objectName, buffer);

      expect(mockObjectStorageClient.putObject).toHaveBeenCalledWith({
        namespaceName: 'test-namespace',
        bucketName,
        objectName,
        putObjectBody: buffer,
      });
    });

    it('should upload stream to object storage', async () => {
      const bucketName = 'processed-bucket';
      const objectName = 'processed/images/123/rendition.webp';
      const stream = Buffer.from('stream data');

      mockObjectStorageClient.putObject.mockResolvedValue({});

      await service.putObject(bucketName, objectName, stream);

      expect(mockObjectStorageClient.putObject).toHaveBeenCalledWith(
        expect.objectContaining({
          putObjectBody: stream,
        }),
      );
    });

    it('should handle upload errors', async () => {
      const error = new Error('Upload failed');
      mockObjectStorageClient.putObject.mockRejectedValue(error);

      await expect(
        service.putObject('bucket', 'object', Buffer.from('data')),
      ).rejects.toThrow(error);
    });
  });

  describe('getObject', () => {
    it('should download object from storage', async () => {
      const bucketName = 'processed-bucket';
      const objectName = 'processed/images/123/test.jpg';
      const mockData = Buffer.from('image data');

      const mockStream: any = {
        on: jest.fn((event: string, handler: any): any => {
          if (event === 'data') {
            handler(mockData);
          } else if (event === 'end') {
            handler();
          }
          return mockStream;
        }),
      };

      mockObjectStorageClient.getObject.mockResolvedValue({
        value: mockStream,
      });

      const result = await service.getObject(bucketName, objectName);

      expect(result).toEqual(mockData);
      expect(mockObjectStorageClient.getObject).toHaveBeenCalledWith({
        namespaceName: 'test-namespace',
        bucketName,
        objectName,
      });
    });

    it('should handle download errors', async () => {
      const error = new Error('Download failed');
      mockObjectStorageClient.getObject.mockRejectedValue(error);

      await expect(service.getObject('bucket', 'object')).rejects.toThrow(error);
    });

    it('should handle stream errors', async () => {
      const streamError = new Error('Stream error');
      const mockStream: any = {
        on: jest.fn((event: string, handler: any): any => {
          if (event === 'error') {
            handler(streamError);
          }
          return mockStream;
        }),
      };

      mockObjectStorageClient.getObject.mockResolvedValue({
        value: mockStream,
      });

      await expect(service.getObject('bucket', 'object')).rejects.toThrow(streamError);
    });
  });

  describe('deleteObject', () => {
    it('should delete object from storage', async () => {
      const bucketName = 'raw-bucket';
      const objectName = 'raw/images/123/test.jpg';

      mockObjectStorageClient.deleteObject.mockResolvedValue({});

      await service.deleteObject(bucketName, objectName);

      expect(mockObjectStorageClient.deleteObject).toHaveBeenCalledWith({
        namespaceName: 'test-namespace',
        bucketName,
        objectName,
      });
    });

    it('should handle deletion errors', async () => {
      const error = new Error('Delete failed');
      mockObjectStorageClient.deleteObject.mockRejectedValue(error);

      await expect(service.deleteObject('bucket', 'object')).rejects.toThrow(error);
    });
  });

  describe('copyObject', () => {
    it('should copy object within storage', async () => {
      const sourceBucket = 'raw-bucket';
      const sourceObject = 'raw/images/123/test.jpg';
      const destBucket = 'processed-bucket';
      const destObject = 'processed/images/123/optimized.jpg';

      mockObjectStorageClient.copyObject.mockResolvedValue({});

      await service.copyObject(sourceBucket, sourceObject, destBucket, destObject);

      expect(mockObjectStorageClient.copyObject).toHaveBeenCalledWith({
        namespaceName: 'test-namespace',
        bucketName: destBucket,
        copyObjectDetails: {
          sourceObjectName: sourceObject,
          destinationBucket: destBucket,
          destinationNamespace: 'test-namespace',
          destinationObjectName: destObject,
          destinationRegion: 'us-ashburn-1',
        },
      });
    });

    it('should handle copy errors', async () => {
      const error = new Error('Copy failed');
      mockObjectStorageClient.copyObject.mockRejectedValue(error);

      await expect(
        service.copyObject('src-bucket', 'src-obj', 'dest-bucket', 'dest-obj'),
      ).rejects.toThrow(error);
    });
  });

  describe('getCDNUrl', () => {
    it('should generate CDN URL for public object', () => {
      const objectKey = 'processed/images/123/1024x1024.webp';

      const url = service.getCDNUrl(objectKey);

      expect(url).toBe('https://cdn.patina.app/public-bucket/processed/images/123/1024x1024.webp');
    });
  });

  describe('generateObjectKey', () => {
    it('should generate object key for image', () => {
      const assetId = '550e8400-e29b-41d4-a716-446655440000';
      const key = service.generateObjectKey(assetId, 'image', 'hero.jpg');

      expect(key).toBe('raw/images/550e8400-e29b-41d4-a716-446655440000/hero.jpg');
    });

    it('should generate object key for 3D model', () => {
      const assetId = '550e8400-e29b-41d4-a716-446655440000';
      const key = service.generateObjectKey(assetId, '3d', 'chair.glb');

      expect(key).toBe('raw/3d/550e8400-e29b-41d4-a716-446655440000/chair.glb');
    });
  });

  describe('generateRenditionKey', () => {
    it('should generate rendition key with dimensions and format', () => {
      const assetId = '550e8400-e29b-41d4-a716-446655440000';
      const key = service.generateRenditionKey(assetId, 1024, 768, 'webp');

      expect(key).toBe('processed/images/550e8400-e29b-41d4-a716-446655440000/1024x768.webp');
    });

    it('should generate square rendition key', () => {
      const assetId = '123';
      const key = service.generateRenditionKey(assetId, 512, 512, 'jpeg');

      expect(key).toBe('processed/images/123/512x512.jpeg');
    });
  });

  describe('generate3DKey', () => {
    it('should generate GLB key', () => {
      const assetId = '550e8400-e29b-41d4-a716-446655440000';
      const key = service.generate3DKey(assetId, 'glb');

      expect(key).toBe('processed/3d/550e8400-e29b-41d4-a716-446655440000/model.glb');
    });

    it('should generate USDZ key', () => {
      const assetId = '550e8400-e29b-41d4-a716-446655440000';
      const key = service.generate3DKey(assetId, 'usdz');

      expect(key).toBe('processed/3d/550e8400-e29b-41d4-a716-446655440000/model.usdz');
    });
  });

  describe('generatePreviewKey', () => {
    it('should generate LQIP preview key for image', () => {
      const assetId = '123';
      const key = service.generatePreviewKey(assetId, 'image');

      expect(key).toBe('previews/images/123/lqip.jpg');
    });

    it('should generate preview key for 3D front view', () => {
      const assetId = '123';
      const key = service.generatePreviewKey(assetId, '3d', 'front');

      expect(key).toBe('previews/3d/123/front.jpg');
    });

    it('should generate preview key for 3D iso view', () => {
      const assetId = '123';
      const key = service.generatePreviewKey(assetId, '3d', 'iso');

      expect(key).toBe('previews/3d/123/iso.jpg');
    });

    it('should generate preview key with default variant', () => {
      const assetId = '123';
      const key = service.generatePreviewKey(assetId, '3d');

      expect(key).toBe('previews/3d/123/front.jpg');
    });
  });
});
