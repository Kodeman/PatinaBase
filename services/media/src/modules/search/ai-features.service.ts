import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-client';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import axios from 'axios';
import { AITag } from './search.types';

export interface AutoTagResult {
  tags: AITag[];
  categories: string[];
  objects: DetectedObject[];
  scene: SceneAnalysis;
}

export interface DetectedObject {
  label: string;
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  category: string;
}

export interface SceneAnalysis {
  type: 'product' | 'lifestyle' | 'detail' | 'ambient' | 'other';
  confidence: number;
  attributes: string[];
}

export interface SmartCropSuggestion {
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio: string;
  focusPoint: { x: number; y: number };
  confidence: number;
  reason: string;
}

export interface BackgroundRemovalResult {
  success: boolean;
  outputBuffer?: Buffer;
  mask?: Buffer;
  confidence: number;
  hasTransparency: boolean;
}

export interface ProductDetectionResult {
  products: DetectedProduct[];
  totalCount: number;
  primaryProduct?: DetectedProduct;
  confidence: number;
}

export interface DetectedProduct {
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  category?: string;
  attributes?: string[];
  dominantColor?: string;
}

export interface QualityScore {
  overall: number;
  breakdown: {
    sharpness: number;
    exposure: number;
    composition: number;
    colorBalance: number;
    noiseLevel: number;
  };
  issues: QualityIssue[];
  recommendations: string[];
}

export interface QualityIssue {
  type: 'blur' | 'overexposure' | 'underexposure' | 'noise' | 'composition' | 'color';
  severity: 'low' | 'medium' | 'high';
  description: string;
  suggestion: string;
}

@Injectable()
export class AIFeaturesService {
  private readonly logger = new Logger(AIFeaturesService.name);

  constructor(
    private prisma: PrismaClient,
    private config: ConfigService,
  ) {}

  /**
   * Auto-tag image using computer vision API
   */
  async autoTagImage(imageBuffer: Buffer, assetId: string): Promise<AutoTagResult> {
    this.logger.log(`Auto-tagging image for asset ${assetId}`);

    try {
      // Extract metadata for basic tagging
      const metadata = await sharp(imageBuffer).metadata();

      // Call vision API for advanced tagging
      const visionTags = await this.callVisionAPI(imageBuffer);

      // Detect objects
      const objects = await this.detectObjects(imageBuffer);

      // Analyze scene
      const scene = await this.analyzeScene(imageBuffer, objects);

      // Combine all tags
      const allTags: AITag[] = [
        ...visionTags,
        ...this.generateMetadataTags(metadata),
        ...this.generateObjectTags(objects),
        ...this.generateSceneTags(scene),
      ];

      // Extract unique categories
      const categories = [...new Set(allTags.map((tag) => tag.category))];

      // Save tags to database
      await this.prisma.mediaAsset.update({
        where: { id: assetId },
        data: {
          tags: allTags.map((t) => t.label),
        },
      });

      return {
        tags: allTags,
        categories,
        objects,
        scene,
      };
    } catch (error) {
      this.logger.error(`Failed to auto-tag image: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate smart cropping suggestions
   */
  async generateSmartCrops(
    imageBuffer: Buffer,
    aspectRatios: string[] = ['1:1', '4:3', '16:9', '3:4', '9:16'],
  ): Promise<SmartCropSuggestion[]> {
    this.logger.log('Generating smart crop suggestions');

    try {
      const metadata = await sharp(imageBuffer).metadata();
      const width = metadata.width!;
      const height = metadata.height!;

      // Detect focus points (faces, products, areas of interest)
      const focusPoints = await this.detectFocusPoints(imageBuffer);
      const primaryFocus = focusPoints[0] || { x: width / 2, y: height / 2 };

      const suggestions: SmartCropSuggestion[] = [];

      for (const ratio of aspectRatios) {
        const [w, h] = ratio.split(':').map(Number);
        const targetRatio = w / h;

        // Calculate crop dimensions
        let cropWidth = width;
        let cropHeight = height;

        if (width / height > targetRatio) {
          // Image is too wide
          cropWidth = Math.floor(height * targetRatio);
        } else {
          // Image is too tall
          cropHeight = Math.floor(width / targetRatio);
        }

        // Center crop around focus point
        const x = Math.max(0, Math.min(primaryFocus.x - cropWidth / 2, width - cropWidth));
        const y = Math.max(0, Math.min(primaryFocus.y - cropHeight / 2, height - cropHeight));

        suggestions.push({
          x: Math.floor(x),
          y: Math.floor(y),
          width: cropWidth,
          height: cropHeight,
          aspectRatio: ratio,
          focusPoint: primaryFocus,
          confidence: this.calculateCropConfidence(primaryFocus, focusPoints.length),
          reason: `Optimized for ${ratio} aspect ratio with focus on detected subject`,
        });
      }

      return suggestions;
    } catch (error) {
      this.logger.error(`Failed to generate smart crops: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remove background from image
   */
  async removeBackground(imageBuffer: Buffer): Promise<BackgroundRemovalResult> {
    this.logger.log('Removing background from image');

    try {
      // Call background removal API (e.g., remove.bg, rembg)
      const apiKey = this.config.get('BACKGROUND_REMOVAL_API_KEY');
      const apiUrl = this.config.get('BACKGROUND_REMOVAL_API_URL') || 'https://api.remove.bg/v1.0/removebg';

      if (!apiKey) {
        this.logger.warn('Background removal API key not configured, using fallback');
        return this.fallbackBackgroundRemoval(imageBuffer);
      }

      const response = await axios.post(
        apiUrl,
        {
          image_file_b64: imageBuffer.toString('base64'),
          size: 'auto',
          format: 'png',
        },
        {
          headers: {
            'X-Api-Key': apiKey,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
        },
      );

      const outputBuffer = Buffer.from(response.data);

      return {
        success: true,
        outputBuffer,
        confidence: 0.95,
        hasTransparency: true,
      };
    } catch (error) {
      this.logger.error(`Failed to remove background: ${error.message}`);
      return {
        success: false,
        confidence: 0,
        hasTransparency: false,
      };
    }
  }

  /**
   * Detect products in lifestyle images
   */
  async detectProducts(imageBuffer: Buffer): Promise<ProductDetectionResult> {
    this.logger.log('Detecting products in image');

    try {
      // Detect objects first
      const objects = await this.detectObjects(imageBuffer);

      // Filter for product-like objects
      const products: DetectedProduct[] = objects
        .filter((obj) => this.isProductCategory(obj.category))
        .map((obj) => ({
          boundingBox: obj.boundingBox!,
          confidence: obj.confidence,
          category: obj.category,
          attributes: [obj.label],
        }));

      // Find primary product (largest, most confident)
      let primaryProduct: DetectedProduct | undefined;
      if (products.length > 0) {
        primaryProduct = products.reduce((prev, current) => {
          const prevArea = prev.boundingBox.width * prev.boundingBox.height;
          const currentArea = current.boundingBox.width * current.boundingBox.height;
          return currentArea * current.confidence > prevArea * prev.confidence ? current : prev;
        });
      }

      return {
        products,
        totalCount: products.length,
        primaryProduct,
        confidence: products.length > 0 ? products[0].confidence : 0,
      };
    } catch (error) {
      this.logger.error(`Failed to detect products: ${error.message}`);
      return {
        products: [],
        totalCount: 0,
        confidence: 0,
      };
    }
  }

  /**
   * Calculate comprehensive quality score
   */
  async calculateQualityScore(imageBuffer: Buffer): Promise<QualityScore> {
    this.logger.log('Calculating quality score');

    try {
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();
      const stats = await image.stats();

      const breakdown = {
        sharpness: await this.calculateSharpness(imageBuffer),
        exposure: this.calculateExposure(stats),
        composition: await this.calculateComposition(imageBuffer),
        colorBalance: this.calculateColorBalance(stats),
        noiseLevel: await this.calculateNoiseLevel(imageBuffer),
      };

      const overall =
        breakdown.sharpness * 0.3 +
        breakdown.exposure * 0.25 +
        breakdown.composition * 0.2 +
        breakdown.colorBalance * 0.15 +
        (1 - breakdown.noiseLevel) * 0.1;

      const issues: QualityIssue[] = [];
      const recommendations: string[] = [];

      // Check for issues
      if (breakdown.sharpness < 0.6) {
        issues.push({
          type: 'blur',
          severity: breakdown.sharpness < 0.3 ? 'high' : 'medium',
          description: 'Image appears blurry or out of focus',
          suggestion: 'Retake photo with better focus or use a tripod',
        });
      }

      if (breakdown.exposure < 0.4 || breakdown.exposure > 0.9) {
        issues.push({
          type: breakdown.exposure < 0.4 ? 'underexposure' : 'overexposure',
          severity: 'medium',
          description: `Image is ${breakdown.exposure < 0.4 ? 'under' : 'over'}exposed`,
          suggestion: 'Adjust exposure settings or lighting conditions',
        });
      }

      if (breakdown.noiseLevel > 0.4) {
        issues.push({
          type: 'noise',
          severity: breakdown.noiseLevel > 0.7 ? 'high' : 'medium',
          description: 'High noise level detected',
          suggestion: 'Use better lighting or lower ISO settings',
        });
      }

      if (breakdown.composition < 0.5) {
        issues.push({
          type: 'composition',
          severity: 'low',
          description: 'Composition could be improved',
          suggestion: 'Consider rule of thirds or better subject positioning',
        });
      }

      // Generate recommendations
      if (overall >= 0.8) {
        recommendations.push('Excellent image quality - ready for publication');
      } else if (overall >= 0.6) {
        recommendations.push('Good quality - minor improvements possible');
      } else {
        recommendations.push('Consider retaking photo for better quality');
      }

      if (metadata.width! < 1600 || metadata.height! < 1600) {
        recommendations.push('Higher resolution recommended for hero images');
      }

      return {
        overall,
        breakdown,
        issues,
        recommendations,
      };
    } catch (error) {
      this.logger.error(`Failed to calculate quality score: ${error.message}`);
      throw error;
    }
  }

  /**
   * Call vision API for advanced tagging
   */
  private async callVisionAPI(imageBuffer: Buffer): Promise<AITag[]> {
    // Simulated vision API response
    // In production, integrate with Google Vision, AWS Rekognition, or Azure Computer Vision
    const tags: AITag[] = [
      { label: 'furniture', confidence: 0.95, category: 'object', source: 'vision_api' },
      { label: 'modern', confidence: 0.88, category: 'style', source: 'vision_api' },
      { label: 'interior', confidence: 0.92, category: 'scene', source: 'vision_api' },
    ];

    return tags;
  }

  /**
   * Detect objects in image
   */
  private async detectObjects(imageBuffer: Buffer): Promise<DetectedObject[]> {
    // Simulated object detection
    // In production, use YOLO, TensorFlow, or cloud vision APIs
    return [
      {
        label: 'sofa',
        confidence: 0.92,
        boundingBox: { x: 100, y: 150, width: 800, height: 600 },
        category: 'furniture',
      },
      {
        label: 'cushion',
        confidence: 0.85,
        boundingBox: { x: 300, y: 200, width: 200, height: 150 },
        category: 'accessory',
      },
    ];
  }

  /**
   * Analyze scene type
   */
  private async analyzeScene(
    imageBuffer: Buffer,
    objects: DetectedObject[],
  ): Promise<SceneAnalysis> {
    const hasProduct = objects.some((obj) => this.isProductCategory(obj.category));
    const hasLifestyle = objects.some((obj) => obj.category === 'scene' || obj.category === 'background');

    if (hasProduct && !hasLifestyle) {
      return {
        type: 'product',
        confidence: 0.9,
        attributes: ['studio', 'white_background', 'professional'],
      };
    } else if (hasProduct && hasLifestyle) {
      return {
        type: 'lifestyle',
        confidence: 0.85,
        attributes: ['contextual', 'room_setting', 'styled'],
      };
    } else {
      return {
        type: 'other',
        confidence: 0.5,
        attributes: [],
      };
    }
  }

  /**
   * Generate tags from metadata
   */
  private generateMetadataTags(metadata: sharp.Metadata): AITag[] {
    const tags: AITag[] = [];

    if (metadata.format) {
      tags.push({
        label: metadata.format,
        confidence: 1.0,
        category: 'format',
        source: 'custom_model',
      });
    }

    if (metadata.width && metadata.height) {
      const aspectRatio = metadata.width / metadata.height;
      if (aspectRatio > 1.5) {
        tags.push({
          label: 'landscape',
          confidence: 0.95,
          category: 'orientation',
          source: 'custom_model',
        });
      } else if (aspectRatio < 0.75) {
        tags.push({
          label: 'portrait',
          confidence: 0.95,
          category: 'orientation',
          source: 'custom_model',
        });
      }
    }

    return tags;
  }

  /**
   * Generate tags from detected objects
   */
  private generateObjectTags(objects: DetectedObject[]): AITag[] {
    return objects.map((obj) => ({
      label: obj.label,
      confidence: obj.confidence,
      category: obj.category,
      source: 'vision_api' as const,
    }));
  }

  /**
   * Generate tags from scene analysis
   */
  private generateSceneTags(scene: SceneAnalysis): AITag[] {
    const tags: AITag[] = [
      {
        label: scene.type,
        confidence: scene.confidence,
        category: 'scene_type',
        source: 'custom_model',
      },
    ];

    scene.attributes.forEach((attr) => {
      tags.push({
        label: attr,
        confidence: scene.confidence * 0.9,
        category: 'scene_attribute',
        source: 'custom_model',
      });
    });

    return tags;
  }

  /**
   * Detect focus points in image
   */
  private async detectFocusPoints(
    imageBuffer: Buffer,
  ): Promise<Array<{ x: number; y: number }>> {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width!;
    const height = metadata.height!;

    // Simulated focus point detection
    // In production, use face detection, saliency maps, or edge detection
    return [{ x: width / 2, y: height / 2 }];
  }

  /**
   * Calculate crop confidence based on focus points
   */
  private calculateCropConfidence(
    focusPoint: { x: number; y: number },
    focusPointCount: number,
  ): number {
    // Higher confidence if we detected actual focus points
    return focusPointCount > 0 ? 0.9 : 0.6;
  }

  /**
   * Fallback background removal using edge detection
   */
  private async fallbackBackgroundRemoval(
    imageBuffer: Buffer,
  ): Promise<BackgroundRemovalResult> {
    try {
      // Simple threshold-based background removal
      const output = await sharp(imageBuffer)
        .threshold(240)
        .toBuffer();

      return {
        success: true,
        outputBuffer: output,
        confidence: 0.5,
        hasTransparency: false,
      };
    } catch (error) {
      return {
        success: false,
        confidence: 0,
        hasTransparency: false,
      };
    }
  }

  /**
   * Check if category is product-related
   */
  private isProductCategory(category: string): boolean {
    const productCategories = [
      'furniture',
      'accessory',
      'decor',
      'lighting',
      'textile',
      'art',
      'product',
    ];
    return productCategories.includes(category.toLowerCase());
  }

  /**
   * Calculate image sharpness
   */
  private async calculateSharpness(imageBuffer: Buffer): Promise<number> {
    try {
      const stats = await sharp(imageBuffer).stats();
      // Use sharpness metric from stats if available
      return stats.sharpness || 0.7;
    } catch {
      return 0.5;
    }
  }

  /**
   * Calculate exposure score
   */
  private calculateExposure(stats: sharp.Stats): number {
    const avgBrightness =
      stats.channels.reduce((sum, ch) => sum + ch.mean, 0) / stats.channels.length / 255;

    // Ideal brightness is around 0.5-0.7
    if (avgBrightness < 0.3) return avgBrightness / 0.3 * 0.5;
    if (avgBrightness > 0.8) return (1 - avgBrightness) / 0.2 * 0.5;
    return 0.8 + (avgBrightness - 0.5) * 0.4;
  }

  /**
   * Calculate composition score
   */
  private async calculateComposition(imageBuffer: Buffer): Promise<number> {
    // Simplified composition analysis
    // In production, check rule of thirds, balance, etc.
    return 0.7;
  }

  /**
   * Calculate color balance score
   */
  private calculateColorBalance(stats: sharp.Stats): number {
    const [r, g, b] = stats.channels.slice(0, 3).map((ch) => ch.mean);
    const avg = (r + g + b) / 3;
    const variance = Math.sqrt(
      (Math.pow(r - avg, 2) + Math.pow(g - avg, 2) + Math.pow(b - avg, 2)) / 3,
    );

    // Lower variance indicates better color balance (for neutral images)
    return Math.max(0, 1 - variance / 100);
  }

  /**
   * Calculate noise level
   */
  private async calculateNoiseLevel(imageBuffer: Buffer): Promise<number> {
    try {
      const stats = await sharp(imageBuffer).stats();
      const avgStdev =
        stats.channels.reduce((sum, ch) => sum + ch.stdev, 0) / stats.channels.length;

      // Normalize to 0-1 range (higher = more noise)
      return Math.min(1, avgStdev / 50);
    } catch {
      return 0.3;
    }
  }
}
