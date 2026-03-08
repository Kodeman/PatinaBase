import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ThreeDProcessingService, ThreeDValidation } from './3d-processing.service';
import { OCIStorageService } from '../storage/oci-storage.service';

describe('ThreeDProcessingService', () => {
  let service: ThreeDProcessingService;
  let config: jest.Mocked<ConfigService>;
  let ociStorage: jest.Mocked<OCIStorageService>;

  beforeEach(async () => {
    const mockConfig = {
      get: jest.fn((key: string) => {
        const values: Record<string, any> = {
          OCI_BUCKET_PROCESSED: 'processed-bucket',
        };
        return values[key];
      }),
    };

    const mockOCIStorage = {
      generate3DKey: jest.fn((assetId, format) => `processed/3d/${assetId}/model.${format}`),
      generatePreviewKey: jest.fn((assetId, kind, variant) => `previews/3d/${assetId}/${variant}.jpg`),
      putObject: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThreeDProcessingService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: OCIStorageService, useValue: mockOCIStorage },
      ],
    }).compile();

    service = module.get<ThreeDProcessingService>(ThreeDProcessingService);
    config = module.get(ConfigService) as jest.Mocked<ConfigService>;
    ociStorage = module.get(OCIStorageService) as jest.Mocked<OCIStorageService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validate3DModel', () => {
    it('should validate model within limits', async () => {
      const buffer = Buffer.from('valid 3d model');
      const format = 'glb';

      // Mock the parseModel method to return valid stats
      jest.spyOn(service as any, 'parseModel').mockResolvedValue({
        triangleCount: 150000,
        nodeCount: 45,
        materialCount: 5,
        textureCount: 6,
        hasAnimations: false,
        upAxis: 'Y',
        textures: [
          { name: 'baseColor', width: 2048, height: 2048 },
          { name: 'normal', width: 2048, height: 2048 },
        ],
        materials: [{ name: 'material_0', type: 'PBR_METALLIC_ROUGHNESS' }],
      });

      const result = await service.validate3DModel(buffer, format);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.stats.triCount).toBe(150000);
      expect(result.stats.nodeCount).toBe(45);
    });

    it('should reject model with too many triangles', async () => {
      const buffer = Buffer.from('high poly model');
      const format = 'glb';

      jest.spyOn(service as any, 'parseModel').mockResolvedValue({
        triangleCount: 600000, // Exceeds 500k limit
        nodeCount: 30,
        materialCount: 3,
        textureCount: 4,
        hasAnimations: false,
        upAxis: 'Y',
        textures: [],
        materials: [],
      });

      const result = await service.validate3DModel(buffer, format);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain(expect.stringContaining('Triangle count'));
    });

    it('should reject model with too many nodes', async () => {
      const buffer = Buffer.from('complex hierarchy');
      const format = 'glb';

      jest.spyOn(service as any, 'parseModel').mockResolvedValue({
        triangleCount: 100000,
        nodeCount: 600, // Exceeds 500 limit
        materialCount: 3,
        textureCount: 4,
        hasAnimations: false,
        upAxis: 'Y',
        textures: [],
        materials: [],
      });

      const result = await service.validate3DModel(buffer, format);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain(expect.stringContaining('Node count'));
    });

    it('should reject model with too many textures', async () => {
      const buffer = Buffer.from('many textures');
      const format = 'glb';

      jest.spyOn(service as any, 'parseModel').mockResolvedValue({
        triangleCount: 100000,
        nodeCount: 30,
        materialCount: 5,
        textureCount: 10, // Exceeds 8 limit
        hasAnimations: false,
        upAxis: 'Y',
        textures: [],
        materials: [],
      });

      const result = await service.validate3DModel(buffer, format);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain(expect.stringContaining('Texture count'));
    });

    it('should warn about oversized textures', async () => {
      const buffer = Buffer.from('large textures');
      const format = 'glb';

      jest.spyOn(service as any, 'parseModel').mockResolvedValue({
        triangleCount: 100000,
        nodeCount: 30,
        materialCount: 3,
        textureCount: 2,
        hasAnimations: false,
        upAxis: 'Y',
        textures: [
          { name: 'baseColor', width: 8192, height: 8192 }, // Too large
        ],
        materials: [],
      });

      const result = await service.validate3DModel(buffer, format);

      expect(result.warnings).toContain(expect.stringContaining('exceeds maximum size'));
    });

    it('should warn about undersized textures', async () => {
      const buffer = Buffer.from('small textures');
      const format = 'glb';

      jest.spyOn(service as any, 'parseModel').mockResolvedValue({
        triangleCount: 100000,
        nodeCount: 30,
        materialCount: 3,
        textureCount: 2,
        hasAnimations: false,
        upAxis: 'Y',
        textures: [
          { name: 'baseColor', width: 512, height: 512 }, // Below recommended
        ],
        materials: [],
      });

      const result = await service.validate3DModel(buffer, format);

      expect(result.warnings).toContain(expect.stringContaining('below recommended minimum'));
    });

    it('should warn about non-PBR materials', async () => {
      const buffer = Buffer.from('phong materials');
      const format = 'glb';

      jest.spyOn(service as any, 'parseModel').mockResolvedValue({
        triangleCount: 100000,
        nodeCount: 30,
        materialCount: 2,
        textureCount: 3,
        hasAnimations: false,
        upAxis: 'Y',
        textures: [],
        materials: [
          { name: 'phong_material', type: 'PHONG' },
        ],
      });

      const result = await service.validate3DModel(buffer, format);

      expect(result.warnings).toContain(expect.stringContaining('will be converted to PBR'));
    });

    it('should warn about animations', async () => {
      const buffer = Buffer.from('animated model');
      const format = 'glb';

      jest.spyOn(service as any, 'parseModel').mockResolvedValue({
        triangleCount: 100000,
        nodeCount: 30,
        materialCount: 3,
        textureCount: 4,
        hasAnimations: true,
        upAxis: 'Y',
        textures: [],
        materials: [],
      });

      const result = await service.validate3DModel(buffer, format);

      expect(result.warnings).toContain(expect.stringContaining('animations'));
    });

    it('should warn about non-Y-up axis', async () => {
      const buffer = Buffer.from('z-up model');
      const format = 'glb';

      jest.spyOn(service as any, 'parseModel').mockResolvedValue({
        triangleCount: 100000,
        nodeCount: 30,
        materialCount: 3,
        textureCount: 4,
        hasAnimations: false,
        upAxis: 'Z',
        textures: [],
        materials: [],
      });

      const result = await service.validate3DModel(buffer, format);

      expect(result.warnings).toContain(expect.stringContaining('will be converted to Y-up'));
    });

    it('should handle parsing errors gracefully', async () => {
      const buffer = Buffer.from('invalid model');
      const format = 'glb';

      jest.spyOn(service as any, 'parseModel').mockRejectedValue(new Error('Parse failed'));

      const result = await service.validate3DModel(buffer, format);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain(expect.stringContaining('Failed to parse model'));
    });
  });

  describe('process3DModel', () => {
    it('should process valid 3D model', async () => {
      const assetId = 'asset-3d-123';
      const sourceBuffer = Buffer.from('3d model data');
      const format = 'glb';

      // Mock all processing steps
      jest.spyOn(service as any, 'normalizeModel').mockResolvedValue({});
      jest.spyOn(service as any, 'optimizeGeometry').mockResolvedValue({
        triangleCount: 120000,
        nodeCount: 40,
        materialCount: 5,
        textureCount: 6,
        qcIssues: [],
      });
      jest.spyOn(service as any, 'optimizeMaterialsAndTextures').mockResolvedValue({});
      jest.spyOn(service as any, 'generateLODs').mockResolvedValue([
        { lod: 0, triCount: 120000, key: 'lod0.glb' },
        { lod: 1, triCount: 60000, key: 'lod1.glb' },
        { lod: 2, triCount: 30000, key: 'lod2.glb' },
      ]);
      jest.spyOn(service as any, 'exportGLB').mockResolvedValue(Buffer.from('glb data'));
      jest.spyOn(service as any, 'exportUSDZ').mockResolvedValue(Buffer.from('usdz data'));
      jest.spyOn(service as any, 'generateSnapshots').mockResolvedValue({
        front: 'previews/3d/asset-3d-123/front.jpg',
        iso: 'previews/3d/asset-3d-123/iso.jpg',
        top: 'previews/3d/asset-3d-123/top.jpg',
      });
      jest.spyOn(service as any, 'calculateDimensions').mockResolvedValue({
        widthM: 1.5,
        heightM: 0.8,
        depthM: 0.6,
        volumeM3: 0.72,
      });
      jest.spyOn(service as any, 'validateARReadiness').mockResolvedValue(true);

      const result = await service.process3DModel(assetId, sourceBuffer, format);

      expect(result.glbKey).toContain('model.glb');
      expect(result.usdzKey).toContain('model.usdz');
      expect(result.triCount).toBe(120000);
      expect(result.arReady).toBe(true);
      expect(result.lods).toHaveLength(3);
      expect(result.snapshots).toBeDefined();
      expect(ociStorage.putObject).toHaveBeenCalledTimes(2); // GLB + USDZ
    });
  });

  describe('generateLODs', () => {
    it('should generate 3 LOD levels', async () => {
      const assetId = 'asset-lod-test';
      const modelData = { triangleCount: 100000 };

      const lods = await (service as any).generateLODs(modelData, assetId);

      expect(lods).toHaveLength(3);
      expect(lods[0].lod).toBe(0);
      expect(lods[0].triCount).toBe(100000);
      expect(lods[1].lod).toBe(1);
      expect(lods[1].triCount).toBe(50000);
      expect(lods[2].lod).toBe(2);
      expect(lods[2].triCount).toBe(25000);
    });
  });

  describe('validateARReadiness', () => {
    it('should validate AR-ready models', async () => {
      const glbBuffer = Buffer.alloc(10 * 1024 * 1024); // 10MB
      const usdzBuffer = Buffer.alloc(12 * 1024 * 1024); // 12MB

      const isReady = await (service as any).validateARReadiness(glbBuffer, usdzBuffer);

      expect(isReady).toBe(true);
    });

    it('should reject models exceeding size limits', async () => {
      const glbBuffer = Buffer.alloc(30 * 1024 * 1024); // 30MB > 25MB limit
      const usdzBuffer = Buffer.alloc(10 * 1024 * 1024);

      const isReady = await (service as any).validateARReadiness(glbBuffer, usdzBuffer);

      expect(isReady).toBe(false);
    });

    it('should reject empty buffers', async () => {
      const glbBuffer = Buffer.alloc(0);
      const usdzBuffer = Buffer.alloc(10 * 1024 * 1024);

      const isReady = await (service as any).validateARReadiness(glbBuffer, usdzBuffer);

      expect(isReady).toBe(false);
    });
  });

  describe('calculateDimensions', () => {
    it('should calculate model dimensions', async () => {
      const modelData = {};

      const dimensions = await (service as any).calculateDimensions(modelData);

      expect(dimensions.widthM).toBeDefined();
      expect(dimensions.heightM).toBeDefined();
      expect(dimensions.depthM).toBeDefined();
      expect(dimensions.volumeM3).toBeDefined();
      expect(dimensions.volumeM3).toBeGreaterThan(0);
    });
  });
});
