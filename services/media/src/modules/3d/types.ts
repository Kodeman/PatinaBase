/**
 * 3D Asset Processing Types
 * Comprehensive type definitions for 3D model processing, validation, and AR/VR preparation
 */

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface BoundingBox {
  min: Vector3;
  max: Vector3;
  center: Vector3;
  size: Vector3;
}

export interface MaterialInfo {
  name: string;
  type: 'PBR_METALLIC_ROUGHNESS' | 'PBR_SPECULAR_GLOSSINESS' | 'UNLIT' | 'LEGACY';
  baseColor?: { r: number; g: number; b: number; a: number };
  metallicFactor?: number;
  roughnessFactor?: number;
  emissiveFactor?: { r: number; g: number; b: number };
  doubleSided?: boolean;
  alphaMode?: 'OPAQUE' | 'MASK' | 'BLEND';
  alphaCutoff?: number;
  textures: {
    baseColor?: TextureInfo;
    normal?: TextureInfo;
    metallicRoughness?: TextureInfo;
    occlusion?: TextureInfo;
    emissive?: TextureInfo;
  };
}

export interface TextureInfo {
  name: string;
  width: number;
  height: number;
  format: string;
  mimeType: string;
  sizeBytes: number;
  uri?: string;
}

export interface MeshInfo {
  name: string;
  primitiveCount: number;
  vertexCount: number;
  triangleCount: number;
  materialIndex?: number;
  boundingBox: BoundingBox;
}

export interface AnimationInfo {
  name: string;
  duration: number;
  channels: number;
  samplers: number;
}

export interface ModelMetrics {
  totalVertices: number;
  totalTriangles: number;
  totalNodes: number;
  totalMeshes: number;
  totalMaterials: number;
  totalTextures: number;
  totalAnimations: number;
  fileSizeBytes: number;
  complexityScore: number; // 0-100 scale
  // Aliases for test compatibility
  triCount?: number; // Alias for totalTriangles
  nodeCount?: number; // Alias for totalNodes
}

export interface ModelData {
  format: '3D_MODEL_FORMAT';
  version?: string;
  generator?: string;
  upAxis: 'X' | 'Y' | 'Z';
  unitScale: number; // Conversion factor to meters
  boundingBox: BoundingBox;
  meshes: MeshInfo[];
  materials: MaterialInfo[];
  textures: TextureInfo[];
  animations: AnimationInfo[];
  metrics: ModelMetrics;
  hasAnimations: boolean;
  hasSkins: boolean;
  hasMorphTargets: boolean;
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  details?: any;
}

export interface ThreeDValidation {
  valid: boolean;
  issues: ValidationIssue[];
  stats: ModelMetrics;
  recommendations: string[];
  warnings?: string[]; // Optional warnings array for backward compatibility
}

export interface LODLevel {
  lod: number;
  triCount: number;
  key: string;
  compressionRatio?: number;
}

export interface ARMetadata {
  supportsARKit: boolean; // iOS AR Quick Look
  supportsARCore: boolean; // Android Scene Viewer
  supportsWebXR: boolean; // Web-based AR
  hasEnvironmentMap: boolean;
  hasShadowPlane: boolean;
  optimizedForMobile: boolean;
  fileSize: {
    glb: number;
    usdz?: number;
    draco?: number;
  };
}

export interface ThreeDMetadata {
  assetId: string;
  sourceFormat: string;
  glbKey: string;
  usdzKey?: string;
  dracoKey?: string;
  triCount: number;
  nodeCount: number;
  materialCount: number;
  textureCount: number;
  widthM: number;
  heightM: number;
  depthM: number;
  volumeM3: number;
  arReady: boolean;
  arMetadata: ARMetadata;
  lods: LODLevel[];
  snapshots: {
    front: string;
    iso: string;
    top: string;
    back: string;
    left: string;
    right: string;
    turntable?: string; // Animated 360 preview
  };
  preview: {
    webgl: string; // WebGL-compatible GLB
    thumbnail: string; // Static thumbnail
  };
  qcIssues: ValidationIssue[];
  processedAt: Date;
}

export interface OptimizationOptions {
  targetTriangleCount?: number;
  targetTextureSizeMax?: number;
  generateLODs?: boolean;
  lodLevels?: number;
  lodReductionFactors?: number[];
  enableDracoCompression?: boolean;
  dracoCompressionLevel?: number; // 0-10
  enableTextureCompression?: boolean;
  textureFormat?: 'KTX2' | 'WEBP' | 'JPEG';
  removeAnimations?: boolean;
  removeSkins?: boolean;
  weldVertices?: boolean;
  simplifyMaterials?: boolean;
}

export interface ConversionOptions {
  inputFormat: 'GLB' | 'GLTF' | 'OBJ' | 'FBX' | 'STL' | 'DAE' | 'USDZ';
  outputFormat: 'GLB' | 'GLTF' | 'USDZ';
  normalizeUnits?: boolean; // Convert to meters
  normalizeAxis?: boolean; // Convert to Y-up
  centerPivot?: boolean;
  optimize?: OptimizationOptions;
}

export interface RenderOptions {
  width: number;
  height: number;
  format: 'PNG' | 'JPEG' | 'WEBP';
  quality?: number; // 0-100
  background: 'transparent' | 'white' | 'black' | string;
  lighting: 'studio' | 'outdoor' | 'neutral' | 'custom';
  camera: {
    type: 'perspective' | 'orthographic';
    position: Vector3;
    target: Vector3;
    fov?: number;
  };
  shadows?: boolean;
  antialiasing?: boolean;
}

export interface TurntableOptions {
  frames: number; // Number of frames for 360 rotation
  fps: number; // Frames per second
  width: number;
  height: number;
  format: 'GIF' | 'WEBM' | 'MP4';
  quality?: number;
  lighting?: RenderOptions['lighting'];
}

export type SupportedInputFormat = 'GLB' | 'GLTF' | 'OBJ' | 'FBX' | 'STL' | 'DAE';
export type SupportedOutputFormat = 'GLB' | 'GLTF' | 'USDZ' | 'DRACO';

export const SUPPORTED_INPUT_FORMATS: readonly SupportedInputFormat[] = [
  'GLB',
  'GLTF',
  'OBJ',
  'FBX',
  'STL',
  'DAE',
] as const;

export const SUPPORTED_OUTPUT_FORMATS: readonly SupportedOutputFormat[] = [
  'GLB',
  'GLTF',
  'USDZ',
  'DRACO',
] as const;

export const FORMAT_MIME_TYPES: Record<string, string> = {
  GLB: 'model/gltf-binary',
  GLTF: 'model/gltf+json',
  USDZ: 'model/vnd.usdz+zip',
  OBJ: 'model/obj',
  FBX: 'application/octet-stream',
  STL: 'model/stl',
  DAE: 'model/vnd.collada+xml',
} as const;
