/**
 * Connection Quality Monitor
 *
 * Client-side connection quality monitoring for WebSocket connections.
 * Tracks latency, connection status, and provides quality metrics.
 */

export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected';

export interface ConnectionStats {
  avgLatency: number;
  minLatency: number;
  maxLatency: number;
  p95Latency: number;
  quality: ConnectionQuality;
  sampleCount: number;
  lastMeasurement: number;
}

export class ConnectionMonitor {
  private latencies: number[] = [];
  private readonly maxSamples = 50;

  private readonly qualityThresholds = {
    excellent: 50,
    good: 100,
    fair: 300,
    poor: 500,
  };

  /**
   * Record a latency measurement
   */
  recordLatency(latency: number): void {
    this.latencies.push(latency);

    // Keep only recent samples
    if (this.latencies.length > this.maxSamples) {
      this.latencies.shift();
    }
  }

  /**
   * Get current connection quality
   */
  getQuality(): ConnectionQuality {
    if (this.latencies.length === 0) {
      return 'disconnected';
    }

    const avgLatency = this.getAverageLatency();

    if (avgLatency <= this.qualityThresholds.excellent) return 'excellent';
    if (avgLatency <= this.qualityThresholds.good) return 'good';
    if (avgLatency <= this.qualityThresholds.fair) return 'fair';
    if (avgLatency <= this.qualityThresholds.poor) return 'poor';

    return 'disconnected';
  }

  /**
   * Get connection statistics
   */
  getStats(): ConnectionStats | null {
    if (this.latencies.length === 0) {
      return null;
    }

    const sorted = [...this.latencies].sort((a, b) => a - b);

    return {
      avgLatency: this.getAverageLatency(),
      minLatency: sorted[0],
      maxLatency: sorted[sorted.length - 1],
      p95Latency: this.calculatePercentile(sorted, 95),
      quality: this.getQuality(),
      sampleCount: this.latencies.length,
      lastMeasurement: this.latencies[this.latencies.length - 1],
    };
  }

  /**
   * Calculate average latency
   */
  private getAverageLatency(): number {
    if (this.latencies.length === 0) return 0;
    const sum = this.latencies.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.latencies.length);
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
   * Reset all measurements
   */
  reset(): void {
    this.latencies = [];
  }
}
