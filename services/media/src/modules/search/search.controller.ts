import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { MediaSearchService } from './media-search.service';
import { AIFeaturesService } from './ai-features.service';
import { AnalyticsService } from './analytics.service';
import { IntelligenceService } from './intelligence.service';
import { ReportingService } from './reporting.service';
import {
  SearchQuery,
  SimilaritySearchRequest,
  ColorSearchRequest,
  TextSearchRequest,
  MetadataSearchRequest,
} from './search.types';

@ApiTags('Search & Analytics')
@Controller('search')
export class SearchController {
  constructor(
    private searchService: MediaSearchService,
    private aiService: AIFeaturesService,
    private analytics: AnalyticsService,
    private intelligence: IntelligenceService,
    private reporting: ReportingService,
  ) {}

  /**
   * Search by visual similarity
   */
  @Post('similarity')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search for visually similar assets' })
  @ApiResponse({ status: 200, description: 'Similar assets found' })
  async searchBySimilarity(@Body() request: SimilaritySearchRequest) {
    return this.searchService.searchBySimilarity(request);
  }

  /**
   * Search by color
   */
  @Post('color')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search assets by color' })
  @ApiResponse({ status: 200, description: 'Assets matching color found' })
  async searchByColor(@Body() request: ColorSearchRequest) {
    return this.searchService.searchByColor(request);
  }

  /**
   * Search by text
   */
  @Post('text')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search assets by text' })
  @ApiResponse({ status: 200, description: 'Assets matching text query found' })
  async searchByText(@Body() request: TextSearchRequest) {
    return this.searchService.searchByText(request);
  }

  /**
   * Search by metadata
   */
  @Post('metadata')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search assets by metadata filters' })
  @ApiResponse({ status: 200, description: 'Assets matching metadata found' })
  async searchByMetadata(@Body() request: MetadataSearchRequest) {
    return this.searchService.searchByMetadata(request);
  }

  /**
   * Hybrid search
   */
  @Post('hybrid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute hybrid search across multiple dimensions' })
  @ApiResponse({ status: 200, description: 'Search results from hybrid query' })
  async searchHybrid(@Body() query: SearchQuery) {
    return this.searchService.searchHybrid(query);
  }

  /**
   * Auto-tag image
   */
  @Post('ai/auto-tag/:assetId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Auto-tag image using AI' })
  @ApiResponse({ status: 200, description: 'Image tagged successfully' })
  async autoTag(@Param('assetId') assetId: string) {
    // In real implementation, fetch asset buffer
    const buffer = Buffer.from(''); // Placeholder
    return this.aiService.autoTagImage(buffer, assetId);
  }

  /**
   * Generate smart crops
   */
  @Post('ai/smart-crop/:assetId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate smart crop suggestions' })
  @ApiResponse({ status: 200, description: 'Crop suggestions generated' })
  async generateSmartCrops(
    @Param('assetId') assetId: string,
    @Query('ratios') ratios?: string,
  ) {
    const aspectRatios = ratios?.split(',') || ['1:1', '4:3', '16:9'];
    const buffer = Buffer.from(''); // Placeholder
    return this.aiService.generateSmartCrops(buffer, aspectRatios);
  }

  /**
   * Remove background
   */
  @Post('ai/remove-background/:assetId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove background from image' })
  @ApiResponse({ status: 200, description: 'Background removed successfully' })
  async removeBackground(@Param('assetId') assetId: string) {
    const buffer = Buffer.from(''); // Placeholder
    return this.aiService.removeBackground(buffer);
  }

  /**
   * Detect products in image
   */
  @Post('ai/detect-products/:assetId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Detect products in lifestyle image' })
  @ApiResponse({ status: 200, description: 'Products detected' })
  async detectProducts(@Param('assetId') assetId: string) {
    const buffer = Buffer.from(''); // Placeholder
    return this.aiService.detectProducts(buffer);
  }

  /**
   * Calculate quality score
   */
  @Post('ai/quality-score/:assetId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Calculate comprehensive quality score' })
  @ApiResponse({ status: 200, description: 'Quality score calculated' })
  async calculateQualityScore(@Param('assetId') assetId: string) {
    const buffer = Buffer.from(''); // Placeholder
    return this.aiService.calculateQualityScore(buffer);
  }

  /**
   * Track asset view
   */
  @Post('analytics/track/view')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Track asset view event' })
  @ApiResponse({ status: 204, description: 'View tracked' })
  async trackView(@Body() event: any) {
    await this.analytics.trackView(event);
  }

  /**
   * Track asset download
   */
  @Post('analytics/track/download')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Track asset download event' })
  @ApiResponse({ status: 204, description: 'Download tracked' })
  async trackDownload(@Body() event: any) {
    await this.analytics.trackDownload(event);
  }

  /**
   * Get asset metrics
   */
  @Get('analytics/metrics/:assetId')
  @ApiOperation({ summary: 'Get metrics for specific asset' })
  @ApiResponse({ status: 200, description: 'Asset metrics retrieved' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  async getAssetMetrics(
    @Param('assetId') assetId: string,
    @Query('days') days?: number,
  ) {
    return this.analytics.getAssetMetrics(assetId, days || 30);
  }

  /**
   * Get bandwidth metrics
   */
  @Get('analytics/bandwidth')
  @ApiOperation({ summary: 'Get bandwidth usage metrics' })
  @ApiResponse({ status: 200, description: 'Bandwidth metrics retrieved' })
  @ApiQuery({ name: 'period', required: false, enum: ['hour', 'day', 'week', 'month'] })
  async getBandwidthMetrics(@Query('period') period?: string) {
    return this.analytics.getBandwidthMetrics(
      (period as any) || 'month',
    );
  }

  /**
   * Get storage metrics
   */
  @Get('analytics/storage')
  @ApiOperation({ summary: 'Get storage usage metrics' })
  @ApiResponse({ status: 200, description: 'Storage metrics retrieved' })
  async getStorageMetrics() {
    return this.analytics.getStorageMetrics();
  }

  /**
   * Get top performing assets
   */
  @Get('analytics/top-performing')
  @ApiOperation({ summary: 'Get top performing assets' })
  @ApiResponse({ status: 200, description: 'Top performers retrieved' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'metric', required: false, enum: ['views', 'downloads', 'engagement'] })
  async getTopPerformingAssets(
    @Query('limit') limit?: number,
    @Query('metric') metric?: string,
  ) {
    return this.analytics.getTopPerformingAssets(
      limit || 10,
      (metric as any) || 'engagement',
    );
  }

  /**
   * Detect duplicates
   */
  @Get('intelligence/duplicates/:assetId')
  @ApiOperation({ summary: 'Detect duplicate and similar assets' })
  @ApiResponse({ status: 200, description: 'Duplicate detection complete' })
  @ApiQuery({ name: 'threshold', required: false, type: Number })
  async detectDuplicates(
    @Param('assetId') assetId: string,
    @Query('threshold') threshold?: number,
  ) {
    return this.intelligence.detectDuplicates(assetId, threshold || 0.9);
  }

  /**
   * Detect missing assets
   */
  @Get('intelligence/missing-assets')
  @ApiOperation({ summary: 'Detect missing assets for products' })
  @ApiResponse({ status: 200, description: 'Missing assets detected' })
  @ApiQuery({ name: 'productId', required: false, type: String })
  async detectMissingAssets(@Query('productId') productId?: string) {
    return this.intelligence.detectMissingAssets(productId);
  }

  /**
   * Check compliance
   */
  @Get('intelligence/compliance/:assetId')
  @ApiOperation({ summary: 'Check asset compliance' })
  @ApiResponse({ status: 200, description: 'Compliance check complete' })
  async checkCompliance(@Param('assetId') assetId: string) {
    return this.intelligence.checkCompliance(assetId);
  }

  /**
   * Calculate brand consistency
   */
  @Get('intelligence/brand-consistency')
  @ApiOperation({ summary: 'Calculate brand consistency score' })
  @ApiResponse({ status: 200, description: 'Brand consistency calculated' })
  @ApiQuery({ name: 'productIds', required: false, type: String })
  async calculateBrandConsistency(@Query('productIds') productIds?: string) {
    const ids = productIds?.split(',');
    return this.intelligence.calculateBrandConsistency(ids);
  }

  /**
   * Generate SEO optimizations
   */
  @Get('intelligence/seo/:assetId')
  @ApiOperation({ summary: 'Generate SEO optimization recommendations' })
  @ApiResponse({ status: 200, description: 'SEO optimizations generated' })
  async generateSEOOptimizations(@Param('assetId') assetId: string) {
    return this.intelligence.generateSEOOptimizations(assetId);
  }

  /**
   * Generate usage report
   */
  @Post('reports/usage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate media usage report' })
  @ApiResponse({ status: 200, description: 'Usage report generated' })
  async generateUsageReport(@Body() body: { startDate: string; endDate: string }) {
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    return this.reporting.generateUsageReport(startDate, endDate);
  }

  /**
   * Generate performance dashboard
   */
  @Get('reports/performance-dashboard')
  @ApiOperation({ summary: 'Generate performance dashboard' })
  @ApiResponse({ status: 200, description: 'Dashboard generated' })
  async generatePerformanceDashboard() {
    return this.reporting.generatePerformanceDashboard();
  }

  /**
   * Generate cost analysis
   */
  @Post('reports/cost-analysis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate cost analysis report' })
  @ApiResponse({ status: 200, description: 'Cost analysis generated' })
  async generateCostAnalysis(@Body() body: { startDate: string; endDate: string }) {
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    return this.reporting.generateCostAnalysis(startDate, endDate);
  }

  /**
   * Generate optimization report
   */
  @Get('reports/optimization')
  @ApiOperation({ summary: 'Generate optimization recommendations' })
  @ApiResponse({ status: 200, description: 'Optimization report generated' })
  async generateOptimizationReport() {
    return this.reporting.generateOptimizationReport();
  }

  /**
   * Export report as CSV
   */
  @Post('reports/export/csv')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Export report as CSV' })
  @ApiResponse({ status: 200, description: 'Report exported as CSV' })
  async exportReportAsCSV(@Body() report: any) {
    return this.reporting.exportReportAsCSV(report);
  }

  /**
   * Export report as JSON
   */
  @Post('reports/export/json')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Export report as JSON' })
  @ApiResponse({ status: 200, description: 'Report exported as JSON' })
  async exportReportAsJSON(@Body() report: any) {
    return this.reporting.exportReportAsJSON(report);
  }
}
