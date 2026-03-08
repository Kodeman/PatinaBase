
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.MediaAssetScalarFieldEnum = {
  id: 'id',
  kind: 'kind',
  productId: 'productId',
  variantId: 'variantId',
  role: 'role',
  rawKey: 'rawKey',
  processed: 'processed',
  status: 'status',
  width: 'width',
  height: 'height',
  format: 'format',
  sizeBytes: 'sizeBytes',
  mimeType: 'mimeType',
  phash: 'phash',
  palette: 'palette',
  blurhash: 'blurhash',
  lqipKey: 'lqipKey',
  license: 'license',
  qcIssues: 'qcIssues',
  qcScore: 'qcScore',
  scanStatus: 'scanStatus',
  scanResult: 'scanResult',
  isPublic: 'isPublic',
  permissions: 'permissions',
  viewCount: 'viewCount',
  downloadCount: 'downloadCount',
  tags: 'tags',
  sortOrder: 'sortOrder',
  uploadedBy: 'uploadedBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AssetRenditionScalarFieldEnum = {
  id: 'id',
  assetId: 'assetId',
  key: 'key',
  width: 'width',
  height: 'height',
  format: 'format',
  sizeBytes: 'sizeBytes',
  purpose: 'purpose',
  transform: 'transform',
  createdAt: 'createdAt'
};

exports.Prisma.ThreeDAssetScalarFieldEnum = {
  id: 'id',
  assetId: 'assetId',
  glbKey: 'glbKey',
  usdzKey: 'usdzKey',
  triCount: 'triCount',
  nodeCount: 'nodeCount',
  materialCount: 'materialCount',
  textureCount: 'textureCount',
  widthM: 'widthM',
  heightM: 'heightM',
  depthM: 'depthM',
  volumeM3: 'volumeM3',
  lods: 'lods',
  materials: 'materials',
  textures: 'textures',
  arReady: 'arReady',
  arChecks: 'arChecks',
  snapshots: 'snapshots',
  qcIssues: 'qcIssues',
  drawCalls: 'drawCalls',
  perfBudget: 'perfBudget',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProcessJobScalarFieldEnum = {
  id: 'id',
  assetId: 'assetId',
  type: 'type',
  state: 'state',
  priority: 'priority',
  attempts: 'attempts',
  maxRetries: 'maxRetries',
  error: 'error',
  errorCode: 'errorCode',
  queuedAt: 'queuedAt',
  startedAt: 'startedAt',
  finishedAt: 'finishedAt',
  meta: 'meta',
  result: 'result',
  workerId: 'workerId'
};

exports.Prisma.UploadSessionScalarFieldEnum = {
  id: 'id',
  assetId: 'assetId',
  filename: 'filename',
  fileSize: 'fileSize',
  mimeType: 'mimeType',
  kind: 'kind',
  parUrl: 'parUrl',
  targetKey: 'targetKey',
  expiresAt: 'expiresAt',
  status: 'status',
  uploadedAt: 'uploadedAt',
  userId: 'userId',
  productId: 'productId',
  variantId: 'variantId',
  role: 'role',
  idempotencyKey: 'idempotencyKey',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LicenseRecordScalarFieldEnum = {
  id: 'id',
  assetIds: 'assetIds',
  licenseType: 'licenseType',
  sourceVendor: 'sourceVendor',
  sourceVendorId: 'sourceVendorId',
  attribution: 'attribution',
  usageScope: 'usageScope',
  territory: 'territory',
  expiresAt: 'expiresAt',
  proofDocKey: 'proofDocKey',
  alertsSent: 'alertsSent',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OutboxEventScalarFieldEnum = {
  id: 'id',
  type: 'type',
  payload: 'payload',
  headers: 'headers',
  published: 'published',
  createdAt: 'createdAt',
  publishedAt: 'publishedAt',
  retryCount: 'retryCount',
  lastError: 'lastError'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};
exports.AssetKind = exports.$Enums.AssetKind = {
  IMAGE: 'IMAGE',
  MODEL3D: 'MODEL3D'
};

exports.AssetRole = exports.$Enums.AssetRole = {
  HERO: 'HERO',
  ANGLE: 'ANGLE',
  LIFESTYLE: 'LIFESTYLE',
  DETAIL: 'DETAIL',
  AR_PREVIEW: 'AR_PREVIEW',
  TEXTURE: 'TEXTURE',
  OTHER: 'OTHER'
};

exports.AssetStatus = exports.$Enums.AssetStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED',
  QUARANTINED: 'QUARANTINED'
};

exports.ScanStatus = exports.$Enums.ScanStatus = {
  PENDING: 'PENDING',
  SCANNING: 'SCANNING',
  CLEAN: 'CLEAN',
  INFECTED: 'INFECTED',
  ERROR: 'ERROR'
};

exports.RenditionFormat = exports.$Enums.RenditionFormat = {
  JPEG: 'JPEG',
  PNG: 'PNG',
  WEBP: 'WEBP',
  AVIF: 'AVIF'
};

exports.RenditionPurpose = exports.$Enums.RenditionPurpose = {
  THUMB: 'THUMB',
  WEB: 'WEB',
  RETINA: 'RETINA',
  PREVIEW: 'PREVIEW',
  ORIGINAL: 'ORIGINAL'
};

exports.JobType = exports.$Enums.JobType = {
  IMAGE_PROCESS: 'IMAGE_PROCESS',
  IMAGE_TRANSFORM: 'IMAGE_TRANSFORM',
  MODEL3D_CONVERT: 'MODEL3D_CONVERT',
  MODEL3D_OPTIMIZE: 'MODEL3D_OPTIMIZE',
  SNAPSHOT_GENERATE: 'SNAPSHOT_GENERATE',
  VIRUS_SCAN: 'VIRUS_SCAN',
  METADATA_EXTRACT: 'METADATA_EXTRACT',
  ASSET_DELETE: 'ASSET_DELETE',
  BULK_DELETE: 'BULK_DELETE',
  BULK_COPY: 'BULK_COPY',
  CLEANUP_ORPHANED: 'CLEANUP_ORPHANED'
};

exports.JobState = exports.$Enums.JobState = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  RETRY: 'RETRY',
  CANCELED: 'CANCELED'
};

exports.UploadStatus = exports.$Enums.UploadStatus = {
  PENDING: 'PENDING',
  UPLOADED: 'UPLOADED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED'
};

exports.Prisma.ModelName = {
  MediaAsset: 'MediaAsset',
  AssetRendition: 'AssetRendition',
  ThreeDAsset: 'ThreeDAsset',
  ProcessJob: 'ProcessJob',
  UploadSession: 'UploadSession',
  LicenseRecord: 'LicenseRecord',
  OutboxEvent: 'OutboxEvent'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
