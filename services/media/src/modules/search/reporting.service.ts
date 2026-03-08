import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-client';
import { ConfigService } from '@nestjs/config';
import { AnalyticsService, StorageMetrics, BandwidthMetrics } from './analytics.service';
import { IntelligenceService } from './intelligence.service';

export interface MediaUsageReport {
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalAssets: number;
    totalViews: number;
    totalDownloads: number;
    totalBandwidth: number;
    totalStorage: number;
  };
  breakdown: {
    byProduct: Array<{ productId: string; productName: string; assetCount: number; views: number }>;
    byKind: Record<string, { count: number; views: number; downloads: number }>;
    byRole: Record<string, { count: number; views: number }>;
  };
  trends: {
    viewsTrend: number[];
    downloadsTrend: number[];
    uploadsTrend: number[];
  };
  topAssets: Array<{
    assetId: string;
    productId?: string;
    views: number;
    downloads: number;
    engagementScore: number;
  }>;
}

export interface PerformanceDashboard {
  overview: {
    totalAssets: number;
    activeAssets: number;
    avgQualityScore: number;
    complianceRate: number;
  };
  performance: {
    topPerformers: Array<{
      assetId: string;
      productName?: string;
      metric: string;
      value: number;
    }>;
    poorPerformers: Array<{
      assetId: string;
      productName?: string;
      issue: string;
    }>;
  };
  quality: {
    highQuality: number;
    mediumQuality: number;
    lowQuality: number;
    avgSharpness: number;
    avgExposure: number;
  };
  health: {
    duplicates: number;
    missingAssets: number;
    complianceIssues: number;
    warnings: number;
  };
}

export interface CostAnalysisReport {
  period: {
    start: Date;
    end: Date;
  };
  costs: {
    storage: {
      total: number;
      perGB: number;
      breakdown: Record<string, number>;
    };
    bandwidth: {
      total: number;
      perGB: number;
      breakdown: Record<string, number>;
    };
    processing: {
      total: number;
      breakdown: {
        transforms: number;
        ai: number;
        other: number;
      };
    };
    total: number;
  };
  projections: {
    nextMonth: number;
    nextQuarter: number;
    nextYear: number;
  };
  recommendations: Array<{
    type: 'storage' | 'bandwidth' | 'processing';
    description: string;
    potentialSavings: number;
    priority: 'high' | 'medium' | 'low';
  }>;
}

export interface OptimizationReport {
  summary: {
    totalAssets: number;
    optimizableAssets: number;
    potentialSavings: {
      storage: number;
      bandwidth: number;
      percentage: number;
    };
  };
  opportunities: OptimizationOpportunity[];
  actions: OptimizationAction[];
  impact: {
    storageReduction: number;
    bandwidthReduction: number;
    qualityImprovement: number;
    seoImprovement: number;
  };
}

export interface OptimizationOpportunity {
  type: 'format' | 'compression' | 'dimensions' | 'duplicate' | 'unused';
  assetCount: number;
  currentSize: number;
  optimizedSize: number;
  savings: number;
  description: string;
}

export interface OptimizationAction {
  assetId: string;
  action: string;
  priority: 'high' | 'medium' | 'low';
  impact: string;
  estimatedSavings: number;
}

@Injectable()
export class ReportingService {
  private readonly logger = new Logger(ReportingService.name);

  constructor(
    private prisma: PrismaClient,
    private config: ConfigService,
    private analytics: AnalyticsService,
    private intelligence: IntelligenceService,
  ) {}

  /**
   * Generate comprehensive media usage report
   */
  async generateUsageReport(startDate: Date, endDate: Date): Promise<MediaUsageReport> {
    this.logger.log(`Generating usage report from ${startDate} to ${endDate}`);

    // Get all assets
    const assets = await this.prisma.mediaAsset.findMany({} as any);

    // Get analytics for period
    const analytics = await (this.prisma as any).assetAnalytics.findMany({
      where: {
        period: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // Calculate summary
    const totalViews = analytics.reduce((sum: number, a: any) => sum + (a.viewCount || 0), 0);
    const totalDownloads = analytics.reduce((sum: number, a: any) => sum + (a.downloadCount || 0), 0);
    const totalBandwidth = analytics.reduce((sum: number, a: any) => sum + (a.bandwidthBytes || 0), 0);
    const totalStorage = assets.reduce((sum: number, a: any) => sum + (a.sizeBytes || 0), 0);

    // Breakdown by product
    const productMap = new Map<string, any>();
    assets.forEach((asset) => {
      if (asset.productId) {
        if (!productMap.has(asset.productId)) {
          productMap.set(asset.productId, {
            productId: asset.productId,
            productName: (asset as any).product?.name || 'Unknown',
            assetCount: 0,
            views: 0,
          });
        }
        const productData = productMap.get(asset.productId);
        productData.assetCount++;

        const assetViews = analytics
          .filter((a: any) => a.assetId === asset.id)
          .reduce((sum: number, a: any) => sum + (a.viewCount || 0), 0);
        productData.views += assetViews;
      }
    });

    const byProduct = Array.from(productMap.values());

    // Breakdown by kind
    const byKind: Record<string, any> = {};
    assets.forEach((asset) => {
      if (!byKind[asset.kind]) {
        byKind[asset.kind] = { count: 0, views: 0, downloads: 0 };
      }
      byKind[asset.kind].count++;

      const assetAnalytics = analytics.filter((a: any) => a.assetId === asset.id);
      byKind[asset.kind].views += assetAnalytics.reduce(
        (sum: number, a: any) => sum + (a.viewCount || 0),
        0,
      );
      byKind[asset.kind].downloads += assetAnalytics.reduce(
        (sum: number, a: any) => sum + (a.downloadCount || 0),
        0,
      );
    });

    // Breakdown by role
    const byRole: Record<string, any> = {};
    assets.forEach((asset) => {
      if (asset.role) {
        if (!byRole[asset.role]) {
          byRole[asset.role] = { count: 0, views: 0 };
        }
        byRole[asset.role].count++;

        const assetViews = analytics
          .filter((a: any) => a.assetId === asset.id)
          .reduce((sum: number, a: any) => sum + (a.viewCount || 0), 0);
        byRole[asset.role].views += assetViews;
      }
    });

    // Calculate trends (daily)
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
    const viewsTrend: number[] = [];
    const downloadsTrend: number[] = [];
    const uploadsTrend: number[] = [];

    for (let i = 0; i < days; i++) {
      const dayStart = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const dayAnalytics = analytics.filter(
        (a: any) => a.period >= dayStart && a.period < dayEnd,
      );

      viewsTrend.push(dayAnalytics.reduce((sum: number, a: any) => sum + (a.viewCount || 0), 0));
      downloadsTrend.push(dayAnalytics.reduce((sum: number, a: any) => sum + (a.downloadCount || 0), 0));

      const dayUploads = assets.filter(
        (a) => a.createdAt >= dayStart && a.createdAt < dayEnd,
      ).length;
      uploadsTrend.push(dayUploads);
    }

    // Get top assets
    const topAssets = await this.analytics.getTopPerformingAssets(10, 'engagement');

    return {
      period: { start: startDate, end: endDate },
      summary: {
        totalAssets: assets.length,
        totalViews,
        totalDownloads,
        totalBandwidth,
        totalStorage,
      },
      breakdown: {
        byProduct,
        byKind,
        byRole,
      },
      trends: {
        viewsTrend,
        downloadsTrend,
        uploadsTrend,
      },
      topAssets: topAssets.map((t) => ({
        assetId: t.assetId,
        productId: t.metrics.assetId,
        views: t.metrics.viewCount,
        downloads: t.metrics.downloadCount,
        engagementScore: t.metrics.engagementScore,
      })),
    };
  }

  /**
   * Generate performance dashboard
   */
  async generatePerformanceDashboard(): Promise<PerformanceDashboard> {
    this.logger.log('Generating performance dashboard');

    const assets = await this.prisma.mediaAsset.findMany({} as any);

    // Overview metrics
    const totalAssets = assets.length;
    const activeAssets = assets.filter((a: any) => a.status === 'READY').length;

    const qualityScores = assets
      .map((a) => ((a as any).quality as any)?.sharpness || 0)
      .filter((q) => q > 0);
    const avgQualityScore =
      qualityScores.length > 0
        ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
        : 0;

    // Check compliance for sample
    const sampleSize = Math.min(100, assets.length);
    const sample = assets.slice(0, sampleSize);
    let compliantCount = 0;

    for (const asset of sample) {
      const compliance = await this.intelligence.checkCompliance(asset.id);
      if (compliance.compliant) compliantCount++;
    }

    const complianceRate = sample.length > 0 ? compliantCount / sample.length : 0;

    // Top performers
    const topPerformers = await this.analytics.getTopPerformingAssets(5, 'engagement');

    // Poor performers (low engagement)
    const poorPerformers = assets
      .filter((a: any) => {
        const quality = a.quality as any;
        return quality?.isLowQuality || (quality?.sharpness || 0) < 0.3;
      })
      .slice(0, 5)
      .map((a: any) => ({
        assetId: a.id,
        productName: (a as any).product?.name,
        issue: 'Low quality detected',
      }));

    // Quality distribution
    const highQuality = assets.filter((a: any) => ((a as any).quality as any)?.sharpness >= 0.7).length;
    const lowQuality = assets.filter((a: any) => ((a as any).quality as any)?.isLowQuality).length;
    const mediumQuality = assets.length - highQuality - lowQuality;

    const avgSharpness =
      assets
        .map((a) => ((a as any).quality as any)?.sharpness || 0)
        .reduce((a, b) => a + b, 0) / assets.length;
    const avgExposure =
      assets
        .map((a) => ((a as any).quality as any)?.brightness || 0.5)
        .reduce((a, b) => a + b, 0) / assets.length;

    // Health metrics
    const missingReports = await this.intelligence.detectMissingAssets();
    const duplicates = 0; // Would need to scan all assets
    const complianceIssues = Math.floor((1 - complianceRate) * sampleSize);

    return {
      overview: {
        totalAssets,
        activeAssets,
        avgQualityScore,
        complianceRate,
      },
      performance: {
        topPerformers: topPerformers.map((t) => ({
          assetId: t.assetId,
          productName: undefined,
          metric: 'engagement',
          value: t.score,
        })),
        poorPerformers,
      },
      quality: {
        highQuality,
        mediumQuality,
        lowQuality,
        avgSharpness,
        avgExposure,
      },
      health: {
        duplicates,
        missingAssets: missingReports.length,
        complianceIssues,
        warnings: missingReports.reduce((sum, r) => sum + r.recommendations.length, 0),
      },
    };
  }

  /**
   * Generate cost analysis report
   */
  async generateCostAnalysis(startDate: Date, endDate: Date): Promise<CostAnalysisReport> {
    this.logger.log('Generating cost analysis report');

    // Get storage metrics
    const storageMetrics = await this.analytics.getStorageMetrics();

    // Get bandwidth metrics
    const bandwidthMetrics = await this.analytics.getBandwidthMetrics('month', startDate);

    // Calculate processing costs (estimated)
    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const transformCost = assets.length * 0.02; // $0.02 per transform
    const aiCost = assets.length * 0.05; // $0.05 per AI processing
    const processingTotal = transformCost + aiCost;

    const totalCost =
      storageMetrics.costEstimate.storage +
      bandwidthMetrics.costEstimate +
      processingTotal;

    // Calculate projections
    const daysInPeriod = (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000);
    const dailyAvg = totalCost / daysInPeriod;

    const nextMonth = dailyAvg * 30;
    const nextQuarter = dailyAvg * 90;
    const nextYear = dailyAvg * 365;

    // Generate recommendations
    const recommendations: CostAnalysisReport['recommendations'] = [];

    // Check for optimization opportunities
    const largeImages = assets.filter(
      (a) => a.kind === 'IMAGE' && (a.sizeBytes || 0) > 5 * 1024 * 1024,
    );

    if (largeImages.length > 0) {
      const potentialSavings = largeImages.reduce(
        (sum, a) => sum + (a.sizeBytes || 0) * 0.3,
        0,
      );
      recommendations.push({
        type: 'storage',
        description: `Convert ${largeImages.length} large images to WebP format`,
        potentialSavings: (potentialSavings / (1024 * 1024 * 1024)) * 0.025,
        priority: 'high',
      });
    }

    // Check bandwidth usage
    if (bandwidthMetrics.costEstimate > 100) {
      recommendations.push({
        type: 'bandwidth',
        description: 'Implement CDN caching to reduce bandwidth costs',
        potentialSavings: bandwidthMetrics.costEstimate * 0.4,
        priority: 'high',
      });
    }

    // Check for unused assets
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const unusedAssets = assets.filter((a: any) => !a.updatedAt || a.updatedAt < thirtyDaysAgo);

    if (unusedAssets.length > 10) {
      const unusedSize = unusedAssets.reduce((sum: number, a: any) => sum + (a.sizeBytes || 0), 0);
      recommendations.push({
        type: 'storage',
        description: `Archive or remove ${unusedAssets.length} unused assets`,
        potentialSavings: (unusedSize / (1024 * 1024 * 1024)) * 0.025,
        priority: 'medium',
      });
    }

    return {
      period: { start: startDate, end: endDate },
      costs: {
        storage: {
          total: storageMetrics.costEstimate.storage,
          perGB: 0.025,
          breakdown: {},
        },
        bandwidth: {
          total: bandwidthMetrics.costEstimate,
          perGB: 0.085,
          breakdown: {},
        },
        processing: {
          total: processingTotal,
          breakdown: {
            transforms: transformCost,
            ai: aiCost,
            other: 0,
          },
        },
        total: totalCost,
      },
      projections: {
        nextMonth,
        nextQuarter,
        nextYear,
      },
      recommendations,
    };
  }

  /**
   * Generate optimization recommendations
   */
  async generateOptimizationReport(): Promise<OptimizationReport> {
    this.logger.log('Generating optimization report');

    const assets = await this.prisma.mediaAsset.findMany();

    const opportunities: OptimizationOpportunity[] = [];
    const actions: OptimizationAction[] = [];

    // Format optimization
    const jpegAssets = assets.filter((a: any) => a.mimeType === 'image/jpeg');
    if (jpegAssets.length > 0) {
      const currentSize = jpegAssets.reduce((sum: number, a: any) => sum + (a.sizeBytes || 0), 0);
      const optimizedSize = currentSize * 0.6; // 40% reduction with WebP

      opportunities.push({
        type: 'format',
        assetCount: jpegAssets.length,
        currentSize,
        optimizedSize,
        savings: currentSize - optimizedSize,
        description: 'Convert JPEG images to WebP format',
      });
    }

    // Duplicate detection
    let totalDuplicateSize = 0;
    const checkedAssets = new Set<string>();

    for (const asset of assets.slice(0, 50)) {
      // Sample first 50
      if (!checkedAssets.has(asset.id)) {
        const duplicateResult = await this.intelligence.detectDuplicates(asset.id, 0.95);
        if (duplicateResult.duplicates.length > 0) {
          duplicateResult.duplicates.forEach((dup) => checkedAssets.add(dup.assetId));
          totalDuplicateSize += (asset.sizeBytes || 0) * duplicateResult.duplicates.length;
        }
        checkedAssets.add(asset.id);
      }
    }

    if (totalDuplicateSize > 0) {
      opportunities.push({
        type: 'duplicate',
        assetCount: checkedAssets.size,
        currentSize: totalDuplicateSize,
        optimizedSize: 0,
        savings: totalDuplicateSize,
        description: 'Remove duplicate and near-duplicate assets',
      });
    }

    // Calculate total impact
    const totalCurrentSize = assets.reduce((sum: number, a: any) => sum + (a.sizeBytes || 0), 0);
    const totalSavings = opportunities.reduce((sum, o) => sum + o.savings, 0);
    const storageReduction = (totalSavings / totalCurrentSize) * 100;

    // Generate priority actions
    assets.slice(0, 20).forEach((asset) => {
      if (asset.mimeType === 'image/jpeg' && (asset.sizeBytes || 0) > 2 * 1024 * 1024) {
        actions.push({
          assetId: asset.id,
          action: 'Convert to WebP format',
          priority: 'high',
          impact: 'Reduce file size by ~40%',
          estimatedSavings: (asset.sizeBytes || 0) * 0.4,
        });
      }
    });

    return {
      summary: {
        totalAssets: assets.length,
        optimizableAssets: opportunities.reduce((sum, o) => sum + o.assetCount, 0),
        potentialSavings: {
          storage: totalSavings / (1024 * 1024 * 1024), // Convert to GB
          bandwidth: (totalSavings / (1024 * 1024 * 1024)) * 0.085, // Bandwidth cost
          percentage: storageReduction,
        },
      },
      opportunities,
      actions,
      impact: {
        storageReduction,
        bandwidthReduction: storageReduction * 0.8,
        qualityImprovement: 15,
        seoImprovement: 20,
      },
    };
  }

  /**
   * Export report as CSV
   */
  async exportReportAsCSV(report: MediaUsageReport): Promise<string> {
    const rows: string[] = [];

    // Header
    rows.push('Type,Metric,Value');

    // Summary
    rows.push(`Summary,Total Assets,${report.summary.totalAssets}`);
    rows.push(`Summary,Total Views,${report.summary.totalViews}`);
    rows.push(`Summary,Total Downloads,${report.summary.totalDownloads}`);
    rows.push(`Summary,Total Bandwidth (bytes),${report.summary.totalBandwidth}`);
    rows.push(`Summary,Total Storage (bytes),${report.summary.totalStorage}`);

    // By Product
    report.breakdown.byProduct.forEach((product) => {
      rows.push(
        `Product,${product.productName},Assets: ${product.assetCount} Views: ${product.views}`,
      );
    });

    // By Kind
    Object.entries(report.breakdown.byKind).forEach(([kind, data]) => {
      rows.push(`Kind,${kind},Assets: ${data.count} Views: ${data.views} Downloads: ${data.downloads}`);
    });

    return rows.join('\n');
  }

  /**
   * Export report as JSON
   */
  async exportReportAsJSON(report: any): Promise<string> {
    return JSON.stringify(report, null, 2);
  }
}
