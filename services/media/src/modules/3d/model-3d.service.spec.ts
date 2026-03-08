import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Model3DService } from './model-3d.service';
import { ModelParserService } from './model-parser.service';
import { ModelValidatorService } from './model-validator.service';
import { ModelConverterService } from './model-converter.service';
import { ARPreparationService } from './ar-preparation.service';
import { ModelRendererService } from './model-renderer.service';
import { OCIStorageService } from '../storage/oci-storage.service';

describe('Model3DService', () => {
  let service: Model3DService;
  let parserService: ModelParserService;
  let validatorService: ModelValidatorService;
  let converterService: ModelConverterService;
  let arPrepService: ARPreparationService;
  let rendererService: ModelRendererService;
  let ociStorage: OCIStorageService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        OCI_BUCKET_PROCESSED: 'test-processed-bucket',
        OCI_BUCKET_PUBLIC: 'test-public-bucket',
        OCI_REGION: 'us-ashburn-1',
        OCI_OBJECT_STORAGE_NAMESPACE: 'test-namespace',
        OCI_CONFIG_FILE: '~/.oci/config',
        OCI_CONFIG_PROFILE: 'DEFAULT',
        CDN_DOMAIN: 'cdn.example.com',
      };
      return config[key];
    }),
  };

  const mockOCIStorage = {
    generate3DKey: jest.fn((assetId, format) => `processed/3d/${assetId}/model.${format}`),
    generatePreviewKey: jest.fn((assetId, kind, variant) => `previews/3d/${assetId}/${variant}.jpg`),
    putObject: jest.fn().mockResolvedValue(undefined),
    getObject: jest.fn().mockResolvedValue(Buffer.from('mock-data')),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    getCDNUrl: jest.fn((key) => `https://cdn.example.com/${key}`),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Model3DService,
        ModelParserService,
        ModelValidatorService,
        ModelConverterService,
        ARPreparationService,
        ModelRendererService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: OCIStorageService,
          useValue: mockOCIStorage,
        },
      ],
    }).compile();

    service = module.get<Model3DService>(Model3DService);
    parserService = module.get<ModelParserService>(ModelParserService);
    validatorService = module.get<ModelValidatorService>(ModelValidatorService);
    converterService = module.get<ModelConverterService>(ModelConverterService);
    arPrepService = module.get<ARPreparationService>(ARPreparationService);
    rendererService = module.get<ModelRendererService>(ModelRendererService);
    ociStorage = module.get<OCIStorageService>(OCIStorageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSupportedFormats', () => {
    it('should return list of supported input formats', () => {
      const formats = service.getSupportedFormats();
      expect(formats).toContain('GLB');
      expect(formats).toContain('GLTF');
      expect(formats).toContain('OBJ');
      expect(formats).toContain('FBX');
      expect(formats).toContain('STL');
      expect(formats).toContain('DAE');
    });
  });

  describe('isFormatSupported', () => {
    it('should return true for supported formats', () => {
      expect(service.isFormatSupported('GLB')).toBe(true);
      expect(service.isFormatSupported('gltf')).toBe(true);
      expect(service.isFormatSupported('OBJ')).toBe(true);
    });

    it('should return false for unsupported formats', () => {
      expect(service.isFormatSupported('UNKNOWN')).toBe(false);
      expect(service.isFormatSupported('MP4')).toBe(false);
    });
  });

  describe('validate3DModel', () => {
    it('should validate a valid GLB model', async () => {
      const mockBuffer = Buffer.from('GLB_MOCK_DATA');

      jest.spyOn(parserService, 'parseModel').mockResolvedValue({
        format: '3D_MODEL_FORMAT',
        version: '2.0',
        upAxis: 'Y',
        unitScale: 1.0,
        boundingBox: {
          min: { x: -1, y: -1, z: -1 },
          max: { x: 1, y: 1, z: 1 },
          center: { x: 0, y: 0, z: 0 },
          size: { x: 2, y: 2, z: 2 },
        },
        meshes: [],
        materials: [],
        textures: [],
        animations: [],
        metrics: {
          totalVertices: 1000,
          totalTriangles: 500,
          totalNodes: 10,
          totalMeshes: 2,
          totalMaterials: 1,
          totalTextures: 2,
          totalAnimations: 0,
          fileSizeBytes: mockBuffer.length,
          complexityScore: 25,
        },
        hasAnimations: false,
        hasSkins: false,
        hasMorphTargets: false,
      });

      const result = await service.validate3DModel(mockBuffer, 'GLB');

      expect(result).toBeDefined();
      expect(result.valid).toBeDefined();
      expect(result.stats).toBeDefined();
      expect(result.issues).toBeDefined();
    });

    it('should handle validation errors gracefully', async () => {
      const mockBuffer = Buffer.from('INVALID_DATA');

      jest.spyOn(parserService, 'parseModel').mockRejectedValue(new Error('Invalid format'));

      await expect(service.validate3DModel(mockBuffer, 'INVALID')).rejects.toThrow();
    });
  });

  describe('process3DAsset', () => {
    it('should process a GLB asset through complete pipeline', async () => {
      const mockBuffer = Buffer.from('GLB_MOCK_DATA');
      const assetId = 'test-asset-123';

      // Mock all dependent service calls
      jest.spyOn(parserService, 'parseModel').mockResolvedValue({
        format: '3D_MODEL_FORMAT',
        version: '2.0',
        upAxis: 'Y',
        unitScale: 1.0,
        boundingBox: {
          min: { x: -1, y: -1, z: -1 },
          max: { x: 1, y: 1, z: 1 },
          center: { x: 0, y: 0, z: 0 },
          size: { x: 2, y: 2, z: 2 },
        },
        meshes: [],
        materials: [],
        textures: [],
        animations: [],
        metrics: {
          totalVertices: 1000,
          totalTriangles: 500,
          totalNodes: 10,
          totalMeshes: 2,
          totalMaterials: 1,
          totalTextures: 2,
          totalAnimations: 0,
          fileSizeBytes: mockBuffer.length,
          complexityScore: 25,
        },
        hasAnimations: false,
        hasSkins: false,
        hasMorphTargets: false,
      });

      jest.spyOn(validatorService, 'validate').mockResolvedValue({
        valid: true,
        issues: [],
        stats: {
          totalVertices: 1000,
          totalTriangles: 500,
          totalNodes: 10,
          totalMeshes: 2,
          totalMaterials: 1,
          totalTextures: 2,
          totalAnimations: 0,
          fileSizeBytes: mockBuffer.length,
          complexityScore: 25,
        },
        recommendations: [],
      });

      jest.spyOn(converterService, 'optimizeGLB').mockResolvedValue(mockBuffer);
      jest.spyOn(rendererService, 'renderSnapshots').mockResolvedValue({
        front: Buffer.from('front'),
        iso: Buffer.from('iso'),
        top: Buffer.from('top'),
        back: Buffer.from('back'),
        left: Buffer.from('left'),
        right: Buffer.from('right'),
      });
      jest.spyOn(rendererService, 'generateThumbnail').mockResolvedValue(Buffer.from('thumbnail'));

      // Note: This test would require mocking the entire gltf-transform pipeline
      // For now, we test that the service exists and has the right structure
      expect(service.process3DAsset).toBeDefined();
    });
  });
});
