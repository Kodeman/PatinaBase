/**
 * CRM Test Helper Utilities
 *
 * Common utility functions for testing
 */

import { Page, expect } from '@playwright/test';

/**
 * Wait for a condition with timeout
 */
export async function waitForCondition(
  condition: () => Promise<boolean>,
  timeout = 30000,
  checkInterval = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 100
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const delay = initialDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Generate a unique test ID
 */
export function generateTestId(prefix = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Format currency value for display
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

/**
 * Format date for display
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/**
 * Format time for display
 */
export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

/**
 * Compare two arrays regardless of order
 */
export function arrayEqualsUnordered<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;

  const sorted1 = [...a].sort();
  const sorted2 = [...b].sort();

  return sorted1.every((val, idx) => val === sorted2[idx]);
}

/**
 * Extract number from text
 */
export function extractNumber(text: string): number | null {
  const match = text.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

/**
 * Extract percentage from text
 */
export function extractPercentage(text: string): number | null {
  const match = text.match(/(\d+)%/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Capitalize first letter
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Convert camelCase to human readable
 */
export function toHumanReadable(str: string): string {
  return str
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/**
 * Compare health scores
 */
export function compareHealthScores(
  current: number,
  previous: number
): { change: number; trend: 'up' | 'down' | 'same'; percentage: number } {
  const change = current - previous;
  const percentage = previous !== 0 ? (change / previous) * 100 : 0;
  const trend = change > 0 ? 'up' : change < 0 ? 'down' : 'same';

  return { change, trend, percentage };
}

/**
 * Get health score color
 */
export function getHealthScoreColor(score: number): string {
  if (score >= 80) return 'green';
  if (score >= 60) return 'yellow';
  if (score >= 40) return 'orange';
  return 'red';
}

/**
 * Get health score label
 */
export function getHealthScoreLabel(score: number): string {
  if (score >= 80) return 'Thriving';
  if (score >= 60) return 'Healthy';
  if (score >= 40) return 'At Risk';
  return 'Critical';
}

/**
 * Calculate expected health score change from touchpoint
 */
export function calculateExpectedHealthChange(touchpointType: string): number {
  const impacts: Record<string, number> = {
    call: 5,
    email: 2,
    meeting: 8,
    proposal: 10,
    'site-visit': 12,
  };

  return impacts[touchpointType.toLowerCase()] || 3;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone format
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^\d{3}-\d{3}-\d{4}$/;
  return phoneRegex.test(phone);
}

/**
 * Get stage progression
 */
export function getStageProgression(): string[] {
  return ['Lead', 'Discovery', 'Active Project', 'Completed'];
}

/**
 * Get next stage
 */
export function getNextStage(currentStage: string): string | null {
  const stages = getStageProgression();
  const index = stages.findIndex((s) => s.toLowerCase() === currentStage.toLowerCase());

  if (index === -1 || index === stages.length - 1) return null;

  return stages[index + 1];
}

/**
 * Get previous stage
 */
export function getPreviousStage(currentStage: string): string | null {
  const stages = getStageProgression();
  const index = stages.findIndex((s) => s.toLowerCase() === currentStage.toLowerCase());

  if (index <= 0) return null;

  return stages[index - 1];
}

/**
 * Calculate days since date
 */
export function daysSinceDate(date: Date): number {
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Is date recent (within X days)
 */
export function isDateRecent(date: Date, days = 7): boolean {
  return daysSinceDate(date) <= days;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Batch array into chunks
 */
export function batch<T>(array: T[], batchSize: number): T[][] {
  const batches: T[][] = [];

  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }

  return batches;
}

/**
 * Flatten nested array
 */
export function flatten<T>(array: (T | T[])[]): T[] {
  return array.reduce((acc: T[], val) => {
    return acc.concat(Array.isArray(val) ? flatten(val) : val);
  }, []);
}

/**
 * Remove duplicates from array
 */
export function unique<T>(array: T[]): T[] {
  return Array.from(new Set(array));
}

/**
 * Random item from array
 */
export function randomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Shuffle array
 */
export function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

/**
 * Create a delay for testing
 */
export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse JSON safely
 */
export function safeJsonParse<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return defaultValue;
  }
}

/**
 * Deep merge objects
 */
export function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const output = Object.assign({}, target);

  Object.keys(source).forEach((key) => {
    if (source[key as keyof T] instanceof Object && !(source[key as keyof T] instanceof Array)) {
      output[key as keyof T] = deepMerge(
        target[key as keyof T] || {},
        source[key as keyof T] as object
      ) as T[keyof T];
    } else {
      output[key as keyof T] = source[key as keyof T] as T[keyof T];
    }
  });

  return output;
}

/**
 * Create a timeout promise
 */
export function timeout<T>(
  promise: Promise<T>,
  ms: number
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Validate test client data
 */
export function validateClientData(data: any): boolean {
  return (
    data.firstName &&
    typeof data.firstName === 'string' &&
    data.lastName &&
    typeof data.lastName === 'string' &&
    data.email &&
    isValidEmail(data.email) &&
    data.phone &&
    isValidPhone(data.phone)
  );
}

/**
 * Create test report
 */
export function createTestReport(
  testName: string,
  passed: boolean,
  duration: number,
  metadata?: Record<string, any>
): Record<string, any> {
  return {
    testName,
    passed,
    duration,
    timestamp: new Date().toISOString(),
    metadata: metadata || {},
  };
}

/**
 * Log test step
 */
export function logTestStep(step: number, description: string): void {
  console.log(`[Step ${step}] ${description}`);
}

/**
 * Assert equals with message
 */
export function assertEqual<T>(
  actual: T,
  expected: T,
  message?: string
): void {
  if (actual !== expected) {
    throw new Error(
      message || `Expected ${expected} but got ${actual}`
    );
  }
}

/**
 * Assert includes with message
 */
export function assertIncludes<T>(
  array: T[],
  item: T,
  message?: string
): void {
  if (!array.includes(item)) {
    throw new Error(
      message || `Expected array to include ${item}`
    );
  }
}

/**
 * Assert array length with message
 */
export function assertArrayLength(
  array: any[],
  expectedLength: number,
  message?: string
): void {
  if (array.length !== expectedLength) {
    throw new Error(
      message || `Expected array length ${expectedLength} but got ${array.length}`
    );
  }
}
