import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as os from 'oci-objectstorage';
import * as common from 'oci-common';

export interface PAROptions {
  bucketName: string;
  objectName: string;
  accessType: 'ObjectRead' | 'ObjectWrite' | 'ObjectReadWrite';
  timeExpires: Date;
}

export interface PARResult {
  parUrl: string;
  fullUrl: string;
  expiresAt: Date;
}

@Injectable()
export class OCIStorageService {
  private readonly logger = new Logger(OCIStorageService.name);
  private objectStorageClient: os.ObjectStorageClient | null = null;
  private namespace: string;
  private isConfigured = false;
  private initializationError: string | null = null;

  constructor(private configService: ConfigService) {
    this.initializeOCI();
  }

  /**
   * Initialize OCI Storage client if configured
   */
  private initializeOCI() {
    const configFile = this.configService.get('OCI_CONFIG_FILE');
    const namespace = this.configService.get('OCI_OBJECT_STORAGE_NAMESPACE');

    if (!configFile || !namespace) {
      this.logger.warn(
        'OCI Object Storage is not configured (OCI_CONFIG_FILE or OCI_OBJECT_STORAGE_NAMESPACE missing). ' +
        'Running in local development mode. For production, set these environment variables.',
      );
      this.isConfigured = false;
      return;
    }

    try {
      const provider = new common.ConfigFileAuthenticationDetailsProvider(
        configFile,
        this.configService.get('OCI_CONFIG_PROFILE', 'DEFAULT'),
      );

      this.objectStorageClient = new os.ObjectStorageClient({
        authenticationDetailsProvider: provider,
      });

      this.namespace = namespace;
      this.isConfigured = true;
      this.logger.log(`OCI Object Storage initialized with namespace: ${namespace}`);
    } catch (error) {
      this.logger.warn(
        `Failed to initialize OCI Object Storage: ${error.message}. ` +
        'Ensure OCI_CONFIG_FILE exists and is properly configured.',
      );
      this.initializationError = error.message;
      this.isConfigured = false;
    }
  }

  /**
   * Check if OCI Storage is configured and ready
   */
  isReady(): boolean {
    return this.isConfigured && this.objectStorageClient != null;
  }

  /**
   * Throw error if not configured
   */
  private ensureConfigured(): void {
    if (!this.isReady()) {
      throw new Error(
        'OCI Object Storage is not configured or failed to initialize. ' +
        `Error: ${this.initializationError || 'Unknown'}. ` +
        'For local development, configure MinIO or another S3-compatible storage.',
      );
    }
  }

  /**
   * Generate a Pre-Authenticated Request (PAR) for direct upload to Object Storage
   */
  async createPAR(options: PAROptions): Promise<PARResult> {
    this.ensureConfigured();

    const request: os.requests.CreatePreauthenticatedRequestRequest = {
      namespaceName: this.namespace,
      bucketName: options.bucketName,
      createPreauthenticatedRequestDetails: {
        name: `upload-${Date.now()}`,
        objectName: options.objectName,
        accessType: os.models.CreatePreauthenticatedRequestDetails.AccessType[options.accessType],
        timeExpires: options.timeExpires,
      },
    };

    try {
      const response = await this.objectStorageClient!.createPreauthenticatedRequest(request);
      const par = response.preauthenticatedRequest;

      const region = this.configService.get('OCI_REGION');
      const fullUrl = `https://objectstorage.${region}.oraclecloud.com${par.accessUri}`;

      this.logger.log(
        `Created PAR for ${options.objectName} in bucket ${options.bucketName}, expires at ${options.timeExpires}`,
      );

      return {
        parUrl: par.accessUri,
        fullUrl,
        expiresAt: options.timeExpires,
      };
    } catch (error) {
      this.logger.error(`Failed to create PAR: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Upload object to Object Storage (internal use)
   */
  async putObject(bucketName: string, objectName: string, data: Buffer | NodeJS.ReadableStream) {
    this.ensureConfigured();

    const request: os.requests.PutObjectRequest = {
      namespaceName: this.namespace,
      bucketName,
      objectName,
      putObjectBody: data as any,
    };

    try {
      await this.objectStorageClient!.putObject(request);
      this.logger.log(`Uploaded object ${objectName} to bucket ${bucketName}`);
    } catch (error) {
      this.logger.error(`Failed to upload object: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get object from Object Storage
   */
  async getObject(bucketName: string, objectName: string): Promise<Buffer> {
    this.ensureConfigured();

    const request: os.requests.GetObjectRequest = {
      namespaceName: this.namespace,
      bucketName,
      objectName,
    };

    try {
      const response = await this.objectStorageClient!.getObject(request);
      const chunks: Buffer[] = [];

      return new Promise((resolve, reject) => {
        (response.value as any).on('data', (chunk: Buffer) => chunks.push(chunk));
        (response.value as any).on('end', () => resolve(Buffer.concat(chunks)));
        (response.value as any).on('error', reject);
      });
    } catch (error) {
      this.logger.error(`Failed to get object: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete object from Object Storage
   */
  async deleteObject(bucketName: string, objectName: string) {
    this.ensureConfigured();

    const request: os.requests.DeleteObjectRequest = {
      namespaceName: this.namespace,
      bucketName,
      objectName,
    };

    try {
      await this.objectStorageClient!.deleteObject(request);
      this.logger.log(`Deleted object ${objectName} from bucket ${bucketName}`);
    } catch (error) {
      this.logger.error(`Failed to delete object: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Copy object within Object Storage
   */
  async copyObject(
    sourceBucket: string,
    sourceObject: string,
    destBucket: string,
    destObject: string,
  ) {
    this.ensureConfigured();

    const request: os.requests.CopyObjectRequest = {
      namespaceName: this.namespace,
      bucketName: destBucket,
      copyObjectDetails: {
        sourceObjectName: sourceObject,
        destinationBucket: destBucket,
        destinationNamespace: this.namespace,
        destinationObjectName: destObject,
        destinationRegion: this.configService.get('OCI_REGION') || 'us-ashburn-1',
      },
    };

    try {
      await this.objectStorageClient!.copyObject(request);
      this.logger.log(`Copied ${sourceObject} from ${sourceBucket} to ${destObject} in ${destBucket}`);
    } catch (error) {
      this.logger.error(`Failed to copy object: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Generate CDN URL for public objects
   */
  getCDNUrl(objectKey: string): string {
    const cdnDomain = this.configService.get('CDN_DOMAIN');
    const publicBucket = this.configService.get('OCI_BUCKET_PUBLIC');
    return `https://${cdnDomain}/${publicBucket}/${objectKey}`;
  }

  /**
   * Generate object key based on conventions
   */
  generateObjectKey(assetId: string, kind: 'image' | '3d', filename: string): string {
    const prefix = kind === 'image' ? 'raw/images' : 'raw/3d';
    return `${prefix}/${assetId}/${filename}`;
  }

  /**
   * Generate rendition key
   */
  generateRenditionKey(
    assetId: string,
    width: number,
    height: number,
    format: string,
  ): string {
    return `processed/images/${assetId}/${width}x${height}.${format}`;
  }

  /**
   * Generate 3D model key
   */
  generate3DKey(assetId: string, format: 'glb' | 'usdz'): string {
    return `processed/3d/${assetId}/model.${format}`;
  }

  /**
   * Generate preview/snapshot key
   */
  generatePreviewKey(assetId: string, kind: 'image' | '3d', variant?: string): string {
    if (kind === 'image') {
      return `previews/images/${assetId}/lqip.jpg`;
    }
    return `previews/3d/${assetId}/${variant || 'front'}.jpg`;
  }
}
