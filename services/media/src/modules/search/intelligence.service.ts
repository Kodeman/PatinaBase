import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-client';
import { ConfigService } from '@nestjs/config';
import { imageHash } from 'image-hash';
import { promisify } from 'util';
import sharp from 'sharp';

const imageHashAsync = promisify(imageHash);

export interface DuplicateDetectionResult {
  assetId: string;
  duplicates: DuplicateAsset[];
  totalFound: number;
  confidence: number;
}

export interface DuplicateAsset {
  assetId: string;
  similarity: number;
  type: 'exact' | 'near_exact' | 'similar' | 'variant';
  details: {
    sameHash?: boolean;
    sameDimensions?: boolean;
    colorMatch?: number;
  };
}

export interface MissingAssetReport {
  productId: string;
  productName?: string;
  missingRoles: string[];
  hasHero: boolean;
  hasAngles: boolean;
  has3D: boolean;
  totalAssets: number;
  recommendations: string[];
}

export interface ComplianceCheckResult {
  assetId: string;
  compliant: boolean;
  issues: ComplianceIssue[];
  warnings: ComplianceWarning[];
  score: number;
}

export interface ComplianceIssue {
  type: 'copyright' | 'inappropriate' | 'quality' | 'format' | 'dimensions';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  remedy: string;
}

export interface ComplianceWarning {
  type: string;
  message: string;
  suggestion: string;
}

export interface BrandConsistencyScore {
  overall: number;
  metrics: {
    colorConsistency: number;
    styleConsistency: number;
    qualityConsistency: number;
    formatConsistency: number;
  };
  outliers: Array<{
    assetId: string;
    reason: string;
    deviation: number;
  }>;
  recommendations: string[];
}

export interface SEOOptimization {
  assetId: string;
  score: number;
  optimizations: SEOOptimizationItem[];
  metadata: {
    hasAltText: boolean;
    hasTitle: boolean;
    hasDescription: boolean;
    hasTags: boolean;
  };
  recommendations: string[];
}

export interface SEOOptimizationItem {
  field: string;
  current?: string;
  suggested: string;
  priority: 'high' | 'medium' | 'low';
  impact: string;
}

@Injectable()
export class IntelligenceService {
  private readonly logger = new Logger(IntelligenceService.name);

  constructor(
    private prisma: PrismaClient,
    private config: ConfigService,
  ) {}

  /**
   * Detect duplicate and similar assets
   */
  async detectDuplicates(assetId: string, threshold: number = 0.9): Promise<DuplicateDetectionResult> {
    this.logger.log(`Detecting duplicates for asset ${assetId}`);

    const sourceAsset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
    });

    if (!sourceAsset) {
      throw new Error('Asset not found');
    }

    const sourceHash = sourceAsset.phash as string;
    const sourceDimensions = { width: sourceAsset.width, height: sourceAsset.height };
    const sourceColor = (sourceAsset as any).dominantColor as string;

    // Find potentially duplicate assets
    const candidates = await this.prisma.mediaAsset.findMany({
      where: {
        id: { not: assetId },
        kind: sourceAsset.kind,
        phash: { not: null },
      },
    });

    const duplicates: DuplicateAsset[] = [];

    for (const candidate of candidates) {
      const similarity = this.calculateHashSimilarity(
        sourceHash,
        candidate.phash as string,
      );

      if (similarity >= threshold * 0.7) {
        const sameHash = sourceHash === candidate.phash;
        const sameDimensions =
          sourceDimensions.width === candidate.width &&
          sourceDimensions.height === candidate.height;
        const colorMatch = this.calculateColorSimilarity(
          sourceColor,
          (candidate as any).dominantColor as string,
        );

        let type: 'exact' | 'near_exact' | 'similar' | 'variant' = 'similar';
        if (sameHash && sameDimensions) type = 'exact';
        else if (similarity >= 0.95) type = 'near_exact';
        else if (sameDimensions || colorMatch > 0.9) type = 'variant';

        duplicates.push({
          assetId: candidate.id,
          similarity,
          type,
          details: {
            sameHash,
            sameDimensions,
            colorMatch,
          },
        });
      }
    }

    // Sort by similarity
    duplicates.sort((a, b) => b.similarity - a.similarity);

    const confidence = duplicates.length > 0 ? duplicates[0].similarity : 0;

    return {
      assetId,
      duplicates,
      totalFound: duplicates.length,
      confidence,
    };
  }

  /**
   * Detect missing assets for products
   */
  async detectMissingAssets(productId?: string): Promise<MissingAssetReport[]> {
    this.logger.log('Detecting missing assets for products');

    // Get products with their assets
    const products = await (this.prisma as any).product.findMany({
      where: productId ? { id: productId } : undefined,
      include: {
        assets: true,
      },
    });

    const reports: MissingAssetReport[] = [];

    for (const product of products) {
      const assets = product.assets || [];
      const imageAssets = assets.filter((a: any) => a.kind === 'IMAGE');
      const model3D = assets.filter((a: any) => a.kind === 'MODEL_3D');

      const hasHero = imageAssets.some((a: any) => a.role === 'HERO');
      const hasAngles = imageAssets.some((a: any) => a.role === 'ANGLE');
      const has3D = model3D.length > 0;

      const missingRoles: string[] = [];
      const recommendations: string[] = [];

      if (!hasHero) {
        missingRoles.push('HERO');
        recommendations.push('Add a high-quality hero image (min 1600px)');
      }

      if (!hasAngles) {
        missingRoles.push('ANGLE');
        recommendations.push('Add multiple angle shots to showcase product details');
      }

      if (!has3D) {
        missingRoles.push('3D');
        recommendations.push('Consider adding 3D model for interactive viewing');
      }

      if (imageAssets.length < 5) {
        recommendations.push(`Add ${5 - imageAssets.length} more product images`);
      }

      if (missingRoles.length > 0 || recommendations.length > 0) {
        reports.push({
          productId: product.id,
          productName: product.name,
          missingRoles,
          hasHero,
          hasAngles,
          has3D,
          totalAssets: assets.length,
          recommendations,
        });
      }
    }

    return reports;
  }

  /**
   * Check asset compliance
   */
  async checkCompliance(assetId: string): Promise<ComplianceCheckResult> {
    this.logger.log(`Checking compliance for asset ${assetId}`);

    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
    });

    if (!asset) {
      throw new Error('Asset not found');
    }

    const issues: ComplianceIssue[] = [];
    const warnings: ComplianceWarning[] = [];

    // Check quality
    const quality = (asset as any).quality as any;
    if (quality?.isLowQuality) {
      issues.push({
        type: 'quality',
        severity: 'high',
        description: 'Image quality below acceptable standards',
        remedy: 'Replace with higher quality image',
      });
    }

    // Check dimensions
    if (asset.role === 'HERO' && (asset.width! < 1600 || asset.height! < 1600)) {
      issues.push({
        type: 'dimensions',
        severity: 'high',
        description: 'Hero image dimensions below minimum requirements',
        remedy: 'Provide image with at least 1600px on shortest edge',
      });
    }

    // Check format
    const allowedFormats = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
    if (asset.kind === 'IMAGE' && !allowedFormats.includes(asset.mimeType || '')) {
      issues.push({
        type: 'format',
        severity: 'medium',
        description: 'Image format not optimal',
        remedy: 'Convert to WebP or AVIF for better compression',
      });
    }

    // Check for potential copyright issues (simulated)
    const hasWatermark = await this.detectWatermark(asset.rawKey);
    if (hasWatermark) {
      issues.push({
        type: 'copyright',
        severity: 'critical',
        description: 'Potential watermark or copyright notice detected',
        remedy: 'Verify usage rights and remove watermark',
      });
    }

    // Check for inappropriate content (simulated)
    const contentCheck = await this.checkInappropriateContent(asset.rawKey);
    if (contentCheck.flagged) {
      issues.push({
        type: 'inappropriate',
        severity: 'critical',
        description: contentCheck.reason,
        remedy: 'Review and remove inappropriate content',
      });
    }

    // Warnings
    if (!asset.tags || (asset.tags as string[]).length === 0) {
      warnings.push({
        type: 'metadata',
        message: 'No tags assigned to asset',
        suggestion: 'Add descriptive tags for better discoverability',
      });
    }

    if (!(asset as any).aiTags || ((asset as any).aiTags as any[]).length === 0) {
      warnings.push({
        type: 'ai_tags',
        message: 'Asset not processed for AI tagging',
        suggestion: 'Run auto-tagging to improve search capabilities',
      });
    }

    // Calculate compliance score
    const criticalIssues = issues.filter((i) => i.severity === 'critical').length;
    const highIssues = issues.filter((i) => i.severity === 'high').length;
    const mediumIssues = issues.filter((i) => i.severity === 'medium').length;
    const lowIssues = issues.filter((i) => i.severity === 'low').length;

    const score = Math.max(
      0,
      1 - (criticalIssues * 0.4 + highIssues * 0.2 + mediumIssues * 0.1 + lowIssues * 0.05),
    );

    return {
      assetId,
      compliant: criticalIssues === 0 && highIssues === 0,
      issues,
      warnings,
      score,
    };
  }

  /**
   * Calculate brand consistency score
   */
  async calculateBrandConsistency(productIds?: string[]): Promise<BrandConsistencyScore> {
    this.logger.log('Calculating brand consistency score');

    const assets = await this.prisma.mediaAsset.findMany({
      where: productIds
        ? { productId: { in: productIds } }
        : { kind: 'IMAGE' },
    });

    if (assets.length === 0) {
      throw new Error('No assets found for analysis');
    }

    // Extract metrics
    const colors = assets
      .map((a) => (a as any).dominantColor as string)
      .filter(Boolean);
    const qualities = assets
      .map((a) => ((a as any).quality as any)?.sharpness)
      .filter(Boolean);
    const formats = assets
      .map((a) => a.mimeType)
      .filter(Boolean) as string[];

    // Calculate consistency scores
    const colorConsistency = this.calculateColorConsistencyScore(colors);
    const qualityConsistency = this.calculateVarianceScore(qualities);
    const formatConsistency = this.calculateFormatConsistencyScore(formats);
    const styleConsistency = 0.75; // Placeholder for style analysis

    const overall =
      colorConsistency * 0.3 +
      styleConsistency * 0.3 +
      qualityConsistency * 0.25 +
      formatConsistency * 0.15;

    // Find outliers
    const outliers: Array<{ assetId: string; reason: string; deviation: number }> = [];

    const avgQuality = qualities.reduce((a, b) => a + b, 0) / qualities.length;
    assets.forEach((asset) => {
      const quality = ((asset as any).quality as any)?.sharpness || 0;
      const deviation = Math.abs(quality - avgQuality);
      if (deviation > 0.3) {
        outliers.push({
          assetId: asset.id,
          reason: 'Quality significantly different from average',
          deviation,
        });
      }
    });

    // Generate recommendations
    const recommendations: string[] = [];
    if (colorConsistency < 0.7) {
      recommendations.push('Standardize color grading across product images');
    }
    if (qualityConsistency < 0.7) {
      recommendations.push('Ensure consistent image quality across all assets');
    }
    if (formatConsistency < 0.8) {
      recommendations.push('Use consistent image format (recommend WebP)');
    }

    return {
      overall,
      metrics: {
        colorConsistency,
        styleConsistency,
        qualityConsistency,
        formatConsistency,
      },
      outliers,
      recommendations,
    };
  }

  /**
   * Generate SEO optimization recommendations
   */
  async generateSEOOptimizations(assetId: string): Promise<SEOOptimization> {
    this.logger.log(`Generating SEO optimizations for asset ${assetId}`);

    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
    }) as any;

    if (!asset) {
      throw new Error('Asset not found');
    }

    const metadata = asset.metadata as any || {};
    const aiTags = (asset.aiTags as any[]) || [];
    const tags = (asset.tags as string[]) || [];

    const optimizations: SEOOptimizationItem[] = [];
    const recommendations: string[] = [];

    // Alt text optimization
    const hasAltText = !!metadata.altText;
    if (!hasAltText) {
      const suggestedAlt = this.generateAltText(asset, aiTags);
      optimizations.push({
        field: 'altText',
        suggested: suggestedAlt,
        priority: 'high',
        impact: 'Improves accessibility and image search ranking',
      });
    }

    // Title optimization
    const hasTitle = !!metadata.title;
    if (!hasTitle) {
      const suggestedTitle = this.generateTitle(asset);
      optimizations.push({
        field: 'title',
        suggested: suggestedTitle,
        priority: 'medium',
        impact: 'Improves image search visibility',
      });
    }

    // Description optimization
    const hasDescription = !!metadata.description;
    if (!hasDescription) {
      const suggestedDesc = this.generateDescription(asset, aiTags);
      optimizations.push({
        field: 'description',
        suggested: suggestedDesc,
        priority: 'medium',
        impact: 'Provides context for search engines',
      });
    }

    // Tags optimization
    const hasTags = tags.length > 0;
    if (!hasTags) {
      optimizations.push({
        field: 'tags',
        suggested: aiTags.map((t) => t.label).join(', '),
        priority: 'high',
        impact: 'Essential for categorization and search',
      });
    }

    // File name optimization
    const fileName = asset.rawKey.split('/').pop() || '';
    if (fileName.includes('uuid') || fileName.match(/^[a-f0-9-]+/i)) {
      optimizations.push({
        field: 'fileName',
        current: fileName,
        suggested: this.generateSEOFriendlyFileName(asset),
        priority: 'low',
        impact: 'Minor improvement in image search',
      });
    }

    // Calculate score
    const score =
      (hasAltText ? 0.35 : 0) +
      (hasTitle ? 0.25 : 0) +
      (hasDescription ? 0.2 : 0) +
      (hasTags ? 0.2 : 0);

    // Recommendations
    if (score < 0.6) {
      recommendations.push('Add comprehensive metadata for better SEO');
    }
    if (!hasAltText) {
      recommendations.push('Alt text is critical for accessibility and SEO');
    }
    if (tags.length < 3) {
      recommendations.push('Add at least 3-5 relevant tags');
    }

    return {
      assetId,
      score,
      optimizations,
      metadata: {
        hasAltText,
        hasTitle,
        hasDescription,
        hasTags,
      },
      recommendations,
    };
  }

  /**
   * Calculate hash similarity
   */
  private calculateHashSimilarity(hash1: string, hash2: string): number {
    if (!hash1 || !hash2 || hash1.length !== hash2.length) return 0;

    let matches = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] === hash2[i]) matches++;
    }

    return matches / hash1.length;
  }

  /**
   * Calculate color similarity
   */
  private calculateColorSimilarity(color1: string, color2: string): number {
    if (!color1 || !color2) return 0;

    const rgb1 = this.hexToRgb(color1);
    const rgb2 = this.hexToRgb(color2);

    const distance = Math.sqrt(
      Math.pow(rgb1.r - rgb2.r, 2) +
        Math.pow(rgb1.g - rgb2.g, 2) +
        Math.pow(rgb1.b - rgb2.b, 2),
    );

    return Math.max(0, 1 - distance / 441.67); // Max distance in RGB space
  }

  /**
   * Hex to RGB conversion
   */
  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 };
  }

  /**
   * Detect watermark (simulated)
   */
  private async detectWatermark(imageKey: string): Promise<boolean> {
    // In production, use image analysis to detect watermarks
    return false;
  }

  /**
   * Check for inappropriate content (simulated)
   */
  private async checkInappropriateContent(
    imageKey: string,
  ): Promise<{ flagged: boolean; reason: string }> {
    // In production, use content moderation API
    return { flagged: false, reason: '' };
  }

  /**
   * Calculate color consistency score
   */
  private calculateColorConsistencyScore(colors: string[]): number {
    if (colors.length < 2) return 1;

    const rgbs = colors.map((c) => this.hexToRgb(c));
    const avgR = rgbs.reduce((sum, rgb) => sum + rgb.r, 0) / rgbs.length;
    const avgG = rgbs.reduce((sum, rgb) => sum + rgb.g, 0) / rgbs.length;
    const avgB = rgbs.reduce((sum, rgb) => sum + rgb.b, 0) / rgbs.length;

    const variance =
      rgbs.reduce(
        (sum, rgb) =>
          sum +
          Math.pow(rgb.r - avgR, 2) +
          Math.pow(rgb.g - avgG, 2) +
          Math.pow(rgb.b - avgB, 2),
        0,
      ) /
      (rgbs.length * 3);

    return Math.max(0, 1 - Math.sqrt(variance) / 128);
  }

  /**
   * Calculate variance score
   */
  private calculateVarianceScore(values: number[]): number {
    if (values.length < 2) return 1;

    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;

    return Math.max(0, 1 - Math.sqrt(variance));
  }

  /**
   * Calculate format consistency score
   */
  private calculateFormatConsistencyScore(formats: string[]): number {
    const formatCounts: Record<string, number> = {};
    formats.forEach((f) => {
      formatCounts[f] = (formatCounts[f] || 0) + 1;
    });

    const maxCount = Math.max(...Object.values(formatCounts));
    return maxCount / formats.length;
  }

  /**
   * Generate alt text for image
   */
  private generateAltText(asset: any, aiTags: any[]): string {
    const tags = aiTags.map((t) => t.label).slice(0, 5);
    const productName = asset.product?.name || 'product';
    return `${productName} - ${tags.join(', ')}`;
  }

  /**
   * Generate title for image
   */
  private generateTitle(asset: any): string {
    const productName = asset.product?.name || 'Product';
    const role = asset.role || 'Image';
    return `${productName} ${role}`;
  }

  /**
   * Generate description for image
   */
  private generateDescription(asset: any, aiTags: any[]): string {
    const productName = asset.product?.name || 'product';
    const attributes = aiTags
      .filter((t) => t.category === 'attribute')
      .map((t) => t.label);

    return `High-quality ${asset.role?.toLowerCase() || 'image'} of ${productName}${attributes.length > 0 ? ` featuring ${attributes.join(', ')}` : ''}`;
  }

  /**
   * Generate SEO-friendly file name
   */
  private generateSEOFriendlyFileName(asset: any): string {
    const productName = (asset.product?.name || 'product')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    const role = (asset.role || 'image').toLowerCase();
    const ext = asset.mimeType?.split('/')[1] || 'jpg';

    return `${productName}-${role}.${ext}`;
  }
}
