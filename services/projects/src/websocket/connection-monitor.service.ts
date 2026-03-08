import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Connection Monitor Service
 *
 * Monitors WebSocket connection health, tracks latency, and provides
 * connection quality metrics. Automatically cleans up stale connections.
 *
 * Features:
 * - Connection health monitoring
 * - Latency tracking and analysis
 * - Connection quality scoring
 * - Stale connection cleanup
 * - Real-time metrics collection
 */
@Injectable()
export class ConnectionMonitorService {
  private readonly logger = new Logger(ConnectionMonitorService.name);

  // Latency tracking per connection
  private latencies = new Map<string, number[]>();

  // Connection quality thresholds (in milliseconds)
  private readonly QUALITY_THRESHOLDS = {
    excellent: 50,
    good: 100,
    fair: 300,
    poor: 500,
  };

  // Maximum latency samples to keep per connection
  private readonly MAX_LATENCY_SAMPLES = 50;

  // Stale connection timeout (in milliseconds)
  private readonly STALE_CONNECTION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record latency measurement for a connection
   */
  recordLatency(socketId: string, latency: number): void {
    if (!this.latencies.has(socketId)) {
      this.latencies.set(socketId, []);
    }

    const samples = this.latencies.get(socketId)!;
    samples.push(latency);

    // Keep only recent samples
    if (samples.length > this.MAX_LATENCY_SAMPLES) {
      samples.shift();
    }

    this.logger.debug(`Latency recorded for ${socketId}: ${latency}ms`);
  }

  /**
   * Get connection quality for a socket
   */
  getConnectionQuality(socketId: string): 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected' {
    const samples = this.latencies.get(socketId);

    if (!samples || samples.length === 0) {
      return 'disconnected';
    }

    const avgLatency = this.calculateAverageLatency(samples);

    if (avgLatency <= this.QUALITY_THRESHOLDS.excellent) return 'excellent';
    if (avgLatency <= this.QUALITY_THRESHOLDS.good) return 'good';
    if (avgLatency <= this.QUALITY_THRESHOLDS.fair) return 'fair';
    if (avgLatency <= this.QUALITY_THRESHOLDS.poor) return 'poor';

    return 'disconnected';
  }

  /**
   * Get connection statistics for a socket
   */
  getConnectionStats(socketId: string): {
    avgLatency: number;
    minLatency: number;
    maxLatency: number;
    p95Latency: number;
    quality: string;
    sampleCount: number;
  } | null {
    const samples = this.latencies.get(socketId);

    if (!samples || samples.length === 0) {
      return null;
    }

    const sorted = [...samples].sort((a, b) => a - b);

    return {
      avgLatency: this.calculateAverageLatency(samples),
      minLatency: sorted[0],
      maxLatency: sorted[sorted.length - 1],
      p95Latency: this.calculatePercentile(sorted, 95),
      quality: this.getConnectionQuality(socketId),
      sampleCount: samples.length,
    };
  }

  /**
   * Get aggregate statistics for all connections
   */
  getAggregateStats(): {
    totalConnections: number;
    qualityDistribution: Record<string, number>;
    avgLatencyOverall: number;
    p95LatencyOverall: number;
  } {
    const allLatencies: number[] = [];
    const qualityDistribution: Record<string, number> = {
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0,
      disconnected: 0,
    };

    for (const [socketId, samples] of this.latencies) {
      if (samples.length > 0) {
        allLatencies.push(...samples);
        const quality = this.getConnectionQuality(socketId);
        qualityDistribution[quality]++;
      }
    }

    const sortedLatencies = [...allLatencies].sort((a, b) => a - b);

    return {
      totalConnections: this.latencies.size,
      qualityDistribution,
      avgLatencyOverall: this.calculateAverageLatency(allLatencies),
      p95LatencyOverall: this.calculatePercentile(sortedLatencies, 95),
    };
  }

  /**
   * Clear latency data for a connection
   */
  clearConnectionData(socketId: string): void {
    this.latencies.delete(socketId);
    this.logger.debug(`Cleared connection data for ${socketId}`);
  }

  /**
   * Calculate average latency
   */
  private calculateAverageLatency(samples: number[]): number {
    if (samples.length === 0) return 0;
    const sum = samples.reduce((a, b) => a + b, 0);
    return Math.round(sum / samples.length);
  }

  /**
   * Calculate percentile value
   */
  private calculatePercentile(sortedSamples: number[], percentile: number): number {
    if (sortedSamples.length === 0) return 0;

    const index = Math.ceil((percentile / 100) * sortedSamples.length) - 1;
    return sortedSamples[Math.max(0, index)];
  }

  /**
   * Cleanup stale connections from database
   * Runs every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async cleanupStaleConnections(): Promise<void> {
    try {
      const staleThreshold = new Date(Date.now() - this.STALE_CONNECTION_TIMEOUT);

      const result = await this.prisma.activeConnection.deleteMany({
        where: {
          lastPingAt: {
            lt: staleThreshold,
          },
        },
      });

      if (result.count > 0) {
        this.logger.log(`Cleaned up ${result.count} stale connections`);
      }
    } catch (error) {
      this.logger.error('Error cleaning up stale connections:', error);
    }
  }

  /**
   * Get active connection count
   */
  async getActiveConnectionCount(): Promise<number> {
    return this.prisma.activeConnection.count({
      where: {
        lastPingAt: {
          gte: new Date(Date.now() - 60000), // Active in last minute
        },
      },
    });
  }

  /**
   * Get connections by user
   */
  async getUserConnections(userId: string): Promise<any[]> {
    return this.prisma.activeConnection.findMany({
      where: {
        userId,
        lastPingAt: {
          gte: new Date(Date.now() - 60000),
        },
      },
      select: {
        socketId: true,
        connectedAt: true,
        lastPingAt: true,
        userAgent: true,
        projectId: true,
      },
    });
  }

  /**
   * Get connections by project
   */
  async getProjectConnections(projectId: string): Promise<any[]> {
    return this.prisma.activeConnection.findMany({
      where: {
        projectId,
        lastPingAt: {
          gte: new Date(Date.now() - 60000),
        },
      },
      select: {
        socketId: true,
        userId: true,
        connectedAt: true,
        lastPingAt: true,
      },
    });
  }

  /**
   * Log connection metrics (runs every 5 minutes)
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async logMetrics(): Promise<void> {
    try {
      const stats = this.getAggregateStats();
      const activeCount = await this.getActiveConnectionCount();

      this.logger.log('WebSocket Metrics:', {
        activeConnections: activeCount,
        trackedConnections: stats.totalConnections,
        avgLatency: `${stats.avgLatencyOverall}ms`,
        p95Latency: `${stats.p95LatencyOverall}ms`,
        qualityDistribution: stats.qualityDistribution,
      });
    } catch (error) {
      this.logger.error('Error logging metrics:', error);
    }
  }

  /**
   * Get health check data
   */
  async getHealthStatus(): Promise<{
    healthy: boolean;
    activeConnections: number;
    avgLatency: number;
    issues: string[];
  }> {
    const issues: string[] = [];
    const activeCount = await this.getActiveConnectionCount();
    const stats = this.getAggregateStats();

    // Check for issues
    if (stats.avgLatencyOverall > this.QUALITY_THRESHOLDS.fair) {
      issues.push(`High average latency: ${stats.avgLatencyOverall}ms`);
    }

    if (stats.p95LatencyOverall > this.QUALITY_THRESHOLDS.poor) {
      issues.push(`High p95 latency: ${stats.p95LatencyOverall}ms`);
    }

    const poorQualityRatio =
      (stats.qualityDistribution.poor + stats.qualityDistribution.disconnected) /
      Math.max(stats.totalConnections, 1);

    if (poorQualityRatio > 0.3) {
      issues.push(`${Math.round(poorQualityRatio * 100)}% of connections have poor quality`);
    }

    return {
      healthy: issues.length === 0,
      activeConnections: activeCount,
      avgLatency: stats.avgLatencyOverall,
      issues,
    };
  }
}
