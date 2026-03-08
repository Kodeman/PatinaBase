import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-client';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface AssetViewEvent {
  assetId: string;
  userId?: string;
  sessionId?: string;
  duration?: number;
  source: 'catalog' | 'product' | 'search' | 'direct';
  metadata?: Record<string, any>;
}

export interface AssetDownloadEvent {
  assetId: string;
  userId?: string;
  sessionId?: string;
  variant?: string;
  format?: string;
  sizeBytes?: number;
}

export interface AssetMetrics {
  assetId: string;
  viewCount: number;
  uniqueViewers: number;
  downloadCount: number;
  avgViewDuration: number;
  engagementScore: number;
  lastViewed?: Date;
  lastDownloaded?: Date;
  peakHour?: number;
  topSources: Array<{ source: string; count: number }>;
}

export interface BandwidthMetrics {
  period: 'hour' | 'day' | 'week' | 'month';
  startDate: Date;
  endDate: Date;
  totalBytes: number;
  requestCount: number;
  uniqueAssets: number;
  costEstimate: number;
  breakdown: {
    byFormat: Record<string, number>;
    byVariant: Record<string, number>;
    byRegion?: Record<string, number>;
  };
}

export interface StorageMetrics {
  totalAssets: number;
  totalSizeBytes: number;
  breakdown: {
    byKind: Record<string, { count: number; bytes: number }>;
    byFormat: Record<string, { count: number; bytes: number }>;
    byStatus: Record<string, { count: number; bytes: number }>;
  };
  growth: {
    assetsPerDay: number;
    bytesPerDay: number;
  };
  costEstimate: {
    storage: number;
    bandwidth: number;
    total: number;
  };
}

export interface PerformanceMetrics {
  assetId: string;
  period: Date;
  metrics: {
    impressions: number;
    views: number;
    downloads: number;
    shareCount: number;
    conversionRate: number;
    avgLoadTime: number;
  };
  comparison?: {
    previousPeriod: number;
    percentChange: number;
  };
}

export interface EngagementScore {
  score: number;
  factors: {
    viewFrequency: number;
    downloadRate: number;
    avgDuration: number;
    recency: number;
    searchAppearances: number;
  };
  trend: 'increasing' | 'stable' | 'decreasing';
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private prisma: PrismaClient,
    private config: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Track asset view event
   */
  async trackView(event: AssetViewEvent): Promise<void> {
    this.logger.debug(`Tracking view for asset ${event.assetId}`);

    try {
      await (this.prisma as any).assetAnalytics.upsert({
        where: {
          assetId_period: {
            assetId: event.assetId,
            period: this.getCurrentPeriod(),
          },
        },
        create: {
          assetId: event.assetId,
          period: this.getCurrentPeriod(),
          viewCount: 1,
          uniqueViewers: event.userId ? [event.userId] : [],
          totalViewDuration: event.duration || 0,
          sources: { [event.source]: 1 },
          lastViewed: new Date(),
        },
        update: {
          viewCount: { increment: 1 },
          uniqueViewers: event.userId
            ? { push: event.userId }
            : undefined,
          totalViewDuration: { increment: event.duration || 0 },
          sources: {
            // Increment source count
            [event.source]: { increment: 1 },
          },
          lastViewed: new Date(),
        },
      });

      // Emit event for real-time analytics
      this.eventEmitter.emit('asset.viewed', event);
    } catch (error) {
      this.logger.error(`Failed to track view: ${error.message}`);
    }
  }

  /**
   * Track asset download event
   */
  async trackDownload(event: AssetDownloadEvent): Promise<void> {
    this.logger.debug(`Tracking download for asset ${event.assetId}`);

    try {
      await (this.prisma as any).assetAnalytics.upsert({
        where: {
          assetId_period: {
            assetId: event.assetId,
            period: this.getCurrentPeriod(),
          },
        },
        create: {
          assetId: event.assetId,
          period: this.getCurrentPeriod(),
          downloadCount: 1,
          lastDownloaded: new Date(),
          bandwidthBytes: event.sizeBytes || 0,
        },
        update: {
          downloadCount: { increment: 1 },
          lastDownloaded: new Date(),
          bandwidthBytes: { increment: event.sizeBytes || 0 },
        },
      });

      // Emit event
      this.eventEmitter.emit('asset.downloaded', event);
    } catch (error) {
      this.logger.error(`Failed to track download: ${error.message}`);
    }
  }

  /**
   * Get asset metrics
   */
  async getAssetMetrics(assetId: string, days: number = 30): Promise<AssetMetrics> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const analytics = await (this.prisma as any).assetAnalytics.findMany({
      where: {
        assetId,
        period: { gte: startDate },
      },
      orderBy: {
        period: 'desc',
      },
    });

    const viewCount = analytics.reduce((sum: number, a: any) => sum + (a.viewCount || 0), 0);
    const downloadCount = analytics.reduce((sum: number, a: any) => sum + (a.downloadCount || 0), 0);
    const totalDuration = analytics.reduce((sum: number, a: any) => sum + (a.totalViewDuration || 0), 0);

    const uniqueViewers = new Set(
      analytics.flatMap((a: any) => (a.uniqueViewers as string[]) || []),
    ).size;

    const avgViewDuration = viewCount > 0 ? totalDuration / viewCount : 0;

    const sources = analytics.reduce((acc: any, a: any) => {
      const sources = a.sources as Record<string, number> || {};
      Object.entries(sources).forEach(([source, count]) => {
        acc[source] = (acc[source] || 0) + count;
      });
      return acc;
    }, {} as Record<string, number>);

    const topSources = Object.entries(sources)
      .map(([source, count]) => ({ source, count: count as number }))
      .sort((a, b) => (b.count as number) - (a.count as number))
      .slice(0, 5);

    const lastAnalytic = analytics[0];
    const engagementScore = this.calculateEngagementScore({
      viewCount,
      downloadCount,
      avgViewDuration,
      uniqueViewers,
      lastViewed: lastAnalytic?.lastViewed || undefined,
    });

    return {
      assetId,
      viewCount,
      uniqueViewers,
      downloadCount,
      avgViewDuration,
      engagementScore: engagementScore.score,
      lastViewed: lastAnalytic?.lastViewed || undefined,
      lastDownloaded: lastAnalytic?.lastDownloaded || undefined,
      topSources,
    };
  }

  /**
   * Get bandwidth metrics
   */
  async getBandwidthMetrics(
    period: 'hour' | 'day' | 'week' | 'month',
    startDate?: Date,
  ): Promise<BandwidthMetrics> {
    const start = startDate || this.getPeriodStart(period);
    const end = new Date();

    const analytics = await (this.prisma as any).assetAnalytics.findMany({
      where: {
        period: {
          gte: start,
          lte: end,
        },
      },
      include: {
        asset: true,
      },
    });

    const totalBytes = analytics.reduce((sum: number, a: any) => sum + (a.bandwidthBytes || 0), 0);
    const requestCount = analytics.reduce((sum: number, a: any) => sum + (a.downloadCount || 0), 0);
    const uniqueAssets = new Set(analytics.map((a: any) => a.assetId)).size;

    // Calculate cost estimate (example: $0.085 per GB)
    const costPerGB = this.config.get('BANDWIDTH_COST_PER_GB') || 0.085;
    const costEstimate = (totalBytes / (1024 * 1024 * 1024)) * costPerGB;

    // Breakdown by format and variant
    const byFormat: Record<string, number> = {};
    const byVariant: Record<string, number> = {};

    analytics.forEach((a: any) => {
      if (a.asset?.mimeType) {
        byFormat[a.asset.mimeType] = (byFormat[a.asset.mimeType] || 0) + (a.bandwidthBytes || 0);
      }
    });

    return {
      period,
      startDate: start,
      endDate: end,
      totalBytes,
      requestCount,
      uniqueAssets,
      costEstimate,
      breakdown: {
        byFormat,
        byVariant,
      },
    };
  }

  /**
   * Get storage metrics
   */
  async getStorageMetrics(): Promise<StorageMetrics> {
    const assets = await this.prisma.mediaAsset.findMany({
      select: {
        kind: true,
        mimeType: true,
        status: true,
        sizeBytes: true,
        createdAt: true,
      },
    });

    const totalAssets = assets.length;
    const totalSizeBytes = assets.reduce((sum, a) => sum + (a.sizeBytes || 0), 0);

    // Breakdown by kind
    const byKind: Record<string, { count: number; bytes: number }> = {};
    const byFormat: Record<string, { count: number; bytes: number }> = {};
    const byStatus: Record<string, { count: number; bytes: number }> = {};

    assets.forEach((asset) => {
      // By kind
      if (!byKind[asset.kind]) {
        byKind[asset.kind] = { count: 0, bytes: 0 };
      }
      byKind[asset.kind].count++;
      byKind[asset.kind].bytes += asset.sizeBytes || 0;

      // By format
      if (asset.mimeType) {
        if (!byFormat[asset.mimeType]) {
          byFormat[asset.mimeType] = { count: 0, bytes: 0 };
        }
        byFormat[asset.mimeType].count++;
        byFormat[asset.mimeType].bytes += asset.sizeBytes || 0;
      }

      // By status
      if (!byStatus[asset.status]) {
        byStatus[asset.status] = { count: 0, bytes: 0 };
      }
      byStatus[asset.status].count++;
      byStatus[asset.status].bytes += asset.sizeBytes || 0;
    });

    // Calculate growth
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentAssets = assets.filter((a) => a.createdAt >= thirtyDaysAgo);
    const assetsPerDay = recentAssets.length / 30;
    const bytesPerDay =
      recentAssets.reduce((sum, a) => sum + (a.sizeBytes || 0), 0) / 30;

    // Cost estimates
    const storageCostPerGB = this.config.get('STORAGE_COST_PER_GB') || 0.025;
    const storageCost = (totalSizeBytes / (1024 * 1024 * 1024)) * storageCostPerGB;

    const bandwidthMetrics = await this.getBandwidthMetrics('month');
    const bandwidthCost = bandwidthMetrics.costEstimate;

    return {
      totalAssets,
      totalSizeBytes,
      breakdown: {
        byKind,
        byFormat,
        byStatus,
      },
      growth: {
        assetsPerDay,
        bytesPerDay,
      },
      costEstimate: {
        storage: storageCost,
        bandwidth: bandwidthCost,
        total: storageCost + bandwidthCost,
      },
    };
  }

  /**
   * Get performance metrics for asset
   */
  async getPerformanceMetrics(
    assetId: string,
    period: Date,
  ): Promise<PerformanceMetrics> {
    const analytics = await (this.prisma as any).assetAnalytics.findUnique({
      where: {
        assetId_period: {
          assetId,
          period,
        },
      },
    });

    // Get previous period for comparison
    const previousPeriod = new Date(period.getTime() - 24 * 60 * 60 * 1000);
    const previousAnalytics = await (this.prisma as any).assetAnalytics.findUnique({
      where: {
        assetId_period: {
          assetId,
          period: previousPeriod,
        },
      },
    });

    const currentViews = analytics?.viewCount || 0;
    const previousViews = previousAnalytics?.viewCount || 0;
    const percentChange = previousViews > 0
      ? ((currentViews - previousViews) / previousViews) * 100
      : 0;

    return {
      assetId,
      period,
      metrics: {
        impressions: currentViews * 1.5, // Estimate
        views: currentViews,
        downloads: analytics?.downloadCount || 0,
        shareCount: 0, // To be implemented
        conversionRate: currentViews > 0
          ? ((analytics?.downloadCount || 0) / currentViews) * 100
          : 0,
        avgLoadTime: 0, // To be implemented
      },
      comparison: {
        previousPeriod: previousViews,
        percentChange,
      },
    };
  }

  /**
   * Calculate engagement score
   */
  calculateEngagementScore(data: {
    viewCount: number;
    downloadCount: number;
    avgViewDuration: number;
    uniqueViewers: number;
    lastViewed?: Date;
  }): EngagementScore {
    const factors = {
      viewFrequency: Math.min(data.viewCount / 100, 1),
      downloadRate: data.viewCount > 0 ? data.downloadCount / data.viewCount : 0,
      avgDuration: Math.min(data.avgViewDuration / 30, 1), // Normalize to 30 seconds
      recency: data.lastViewed
        ? Math.max(0, 1 - (Date.now() - data.lastViewed.getTime()) / (30 * 24 * 60 * 60 * 1000))
        : 0,
      searchAppearances: 0.5, // To be implemented
    };

    const score =
      factors.viewFrequency * 0.3 +
      factors.downloadRate * 0.25 +
      factors.avgDuration * 0.2 +
      factors.recency * 0.15 +
      factors.searchAppearances * 0.1;

    // Determine trend
    let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';
    if (factors.recency > 0.7) trend = 'increasing';
    else if (factors.recency < 0.3) trend = 'decreasing';

    return {
      score,
      factors,
      trend,
    };
  }

  /**
   * Get top performing assets
   */
  async getTopPerformingAssets(
    limit: number = 10,
    metric: 'views' | 'downloads' | 'engagement' = 'engagement',
  ): Promise<Array<{ assetId: string; score: number; metrics: AssetMetrics }>> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const analytics = await (this.prisma as any).assetAnalytics.findMany({
      where: {
        period: { gte: thirtyDaysAgo },
      },
    });

    // Group by asset
    const assetMap = new Map<string, any[]>();
    analytics.forEach((a: any) => {
      if (!assetMap.has(a.assetId)) {
        assetMap.set(a.assetId, []);
      }
      assetMap.get(a.assetId)!.push(a);
    });

    // Calculate scores
    const results = await Promise.all(
      Array.from(assetMap.keys()).map(async (assetId) => {
        const metrics = await this.getAssetMetrics(assetId, 30);
        let score = 0;

        switch (metric) {
          case 'views':
            score = metrics.viewCount;
            break;
          case 'downloads':
            score = metrics.downloadCount;
            break;
          case 'engagement':
            score = metrics.engagementScore;
            break;
        }

        return { assetId, score, metrics };
      }),
    );

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Get current period for analytics grouping
   */
  private getCurrentPeriod(): Date {
    const now = new Date();
    // Round to start of day
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  /**
   * Get period start date
   */
  private getPeriodStart(period: 'hour' | 'day' | 'week' | 'month'): Date {
    const now = new Date();

    switch (period) {
      case 'hour':
        return new Date(now.getTime() - 60 * 60 * 1000);
      case 'day':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case 'week':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'month':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }
}
