import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ThreeDProcessingService, ThreeDValidation } from './3d-processing.service';
import { OCIStorageService } from '../storage/oci-storage.service';
import { Model3DService } from './model-3d.service';

// model-3d.service.ts imports `NodeIO` from `@gltf-transform/core` at the
// top level and constructs one eagerly in its constructor — the same
// ESM-parsing crash documented in model-3d.service.spec.ts. Mock it here too
// so it never loads; ThreeDProcessingService's two public methods are pure
// delegation to it, so a stub covering `validate3DModel`/`process3DAsset` is
// all this spec needs.
jest.mock('./model-3d.service', () => ({
  Model3DService: jest.fn().mockImplementation(() => ({
    validate3DModel: jest.fn(),
    process3DAsset: jest.fn(),
  })),
}));

describe('ThreeDProcessingService', () => {
  let service: ThreeDProcessingService;
  let config: jest.Mocked<ConfigService>;
  let ociStorage: jest.Mocked<OCIStorageService>;
  let model3DService: jest.Mocked<Model3DService>;

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
      generatePreviewKey: jest.fn(
        (assetId, kind, variant) => `previews/3d/${assetId}/${variant}.jpg`,
      ),
      putObject: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThreeDProcessingService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: OCIStorageService, useValue: mockOCIStorage },
        Model3DService,
      ],
    }).compile();

    service = module.get<ThreeDProcessingService>(ThreeDProcessingService);
    config = module.get(ConfigService) as jest.Mocked<ConfigService>;
    ociStorage = module.get(OCIStorageService) as jest.Mocked<OCIStorageService>;
    model3DService = module.get(Model3DService) as jest.Mocked<Model3DService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // NOTE ON DISPOSITION: ThreeDProcessingService is now a thin delegating
  // shim — per its own doc comment, "Legacy 3D Processing Service ...
  // delegates to Model3DService" — and validate3DModel()/process3DModel()
  // do exactly that (call model3DService.validate3DModel /
  // .process3DAsset and either return the result or catch+fall back). The
  // detailed per-field validation cases that used to live here (triangle
  // count, node count, texture count/size, PBR conversion, animations,
  // axis, aspect-ratio-style warnings) all tested a private parseModel()
  // implementation that no longer exists on this class — that logic now
  // lives in ModelParserService + ModelValidatorService, reached through
  // Model3DService.validate3DModel(). Those cases are deleted here rather
  // than ported 1:1, since porting them would just re-assert the OLD
  // shim's own dead code; the two tests below instead cover what this
  // class actually still does (delegate, and the error fallback shape).
  // model-3d.service.spec.ts covers Model3DService's own wiring of
  // ModelParserService -> ModelValidatorService, but neither that spec nor
  // any other file in this module currently exercises ModelValidatorService's
  // threshold/warning logic with real inputs — flagged in the task report
  // as a coverage gap, not fixed here (out of scope for a suite repair).
  describe('validate3DModel', () => {
    it('should delegate to Model3DService and return its result', async () => {
      const buffer = Buffer.from('valid 3d model');
      const format = 'glb';
      const validation: ThreeDValidation = {
        valid: true,
        issues: [],
        stats: {
          totalVertices: 1000,
          totalTriangles: 150000,
          totalNodes: 45,
          totalMeshes: 2,
          totalMaterials: 5,
          totalTextures: 6,
          totalAnimations: 0,
          fileSizeBytes: buffer.length,
          complexityScore: 25,
        },
        recommendations: [],
      };
      (model3DService.validate3DModel as jest.Mock).mockResolvedValue(validation);

      const result = await service.validate3DModel(buffer, format);

      expect(model3DService.validate3DModel).toHaveBeenCalledWith(buffer, format);
      expect(result).toBe(validation);
    });

    it('should catch Model3DService errors and return a VALIDATION_FAILED fallback', async () => {
      const buffer = Buffer.from('invalid model');
      const format = 'glb';
      (model3DService.validate3DModel as jest.Mock).mockRejectedValue(new Error('Parse failed'));

      const result = await service.validate3DModel(buffer, format);

      expect(result.valid).toBe(false);
      expect(result.issues[0]).toMatchObject({
        code: 'VALIDATION_FAILED',
        message: expect.stringContaining('Parse failed'),
      });
      expect(result.stats.fileSizeBytes).toBe(buffer.length);
    });
  });

  describe('process3DModel', () => {
    it('should delegate to Model3DService.process3DAsset and return its result', async () => {
      const assetId = 'asset-3d-123';
      const sourceBuffer = Buffer.from('3d model data');
      const format = 'glb';
      const metadata = {
        glbKey: 'processed/3d/asset-3d-123/model.glb',
        usdzKey: 'processed/3d/asset-3d-123/model.usdz',
        triCount: 120000,
        arReady: true,
        lods: [
          { lod: 0, triCount: 120000, key: 'lod0.glb' },
          { lod: 1, triCount: 60000, key: 'lod1.glb' },
          { lod: 2, triCount: 30000, key: 'lod2.glb' },
        ],
        snapshots: { front: 'front.jpg', iso: 'iso.jpg', top: 'top.jpg' },
      };
      (model3DService.process3DAsset as jest.Mock).mockResolvedValue(metadata);

      const result = await service.process3DModel(assetId, sourceBuffer, format);

      expect(model3DService.process3DAsset).toHaveBeenCalledWith(assetId, sourceBuffer, format);
      expect(result).toBe(metadata);
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
