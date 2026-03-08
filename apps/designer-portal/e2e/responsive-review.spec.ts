/**
 * Responsive Design Review
 * Tests all major pages across different viewports to identify overflow and alignment issues
 */
import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Define viewports to test
const VIEWPORTS = {
  mobile: { width: 375, height: 667, name: 'Mobile (iPhone SE)' },
  tablet: { width: 768, height: 1024, name: 'Tablet (iPad)' },
  desktop: { width: 1920, height: 1080, name: 'Desktop (Full HD)' },
  largeDesktop: { width: 2560, height: 1440, name: 'Large Desktop (QHD)' },
};

// Pages to test
const PAGES = [
  { path: '/dashboard', name: 'Dashboard' },
  { path: '/catalog', name: 'Catalog - Products' },
  { path: '/catalog/collections', name: 'Catalog - Collections' },
  { path: '/clients', name: 'Clients' },
  { path: '/projects', name: 'Projects' },
  { path: '/proposals', name: 'Proposals' },
  { path: '/messages', name: 'Messages' },
  { path: '/style-profile', name: 'Style Profile' },
];

interface OverflowElement {
  tag: string;
  class: string;
  id: string;
  width: number;
  right: number;
  overflow: string;
  overflowX: string;
}

interface Issue {
  type: string;
  message: string;
  severity: 'high' | 'medium' | 'low';
  elements?: any[];
}

async function checkOverflowIssues(page: Page): Promise<Issue[]> {
  const issues: Issue[] = [];

  // Check for horizontal scrollbar
  const hasHorizontalScroll = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });

  if (hasHorizontalScroll) {
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    issues.push({
      type: 'horizontal_overflow',
      message: `Page has horizontal scroll: ${scrollWidth}px content in ${clientWidth}px viewport`,
      severity: 'high',
    });
  }

  // Find elements that overflow viewport
  const overflowingElements = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const elements = document.querySelectorAll('*');
    const overflowing: OverflowElement[] = [];

    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.right > viewportWidth && rect.width > 0) {
        const computedStyle = window.getComputedStyle(el);
        overflowing.push({
          tag: el.tagName,
          class: (el as HTMLElement).className,
          id: (el as HTMLElement).id,
          width: rect.width,
          right: rect.right,
          overflow: computedStyle.overflow,
          overflowX: computedStyle.overflowX,
        });
      }
    });

    return overflowing.slice(0, 20); // Limit to top 20 offenders
  });

  if (overflowingElements.length > 0) {
    issues.push({
      type: 'overflowing_elements',
      message: `Found ${overflowingElements.length} elements extending beyond viewport`,
      elements: overflowingElements,
      severity: 'high',
    });
  }

  return issues;
}

async function checkLayoutIssues(page: Page): Promise<Issue[]> {
  const issues: Issue[] = [];

  // Check for fixed width elements that might break responsive design
  const fixedWidthElements = await page.evaluate(() => {
    const elements = document.querySelectorAll('*');
    const fixed: any[] = [];

    elements.forEach((el) => {
      const style = window.getComputedStyle(el);
      const width = style.width;

      // Check for fixed pixel widths (not percentages or auto)
      if (width && width.includes('px') && !width.includes('calc')) {
        const pixelValue = parseInt(width);
        if (pixelValue > 1000) {
          // Only flag large fixed widths
          fixed.push({
            tag: el.tagName,
            class: (el as HTMLElement).className,
            id: (el as HTMLElement).id,
            width: width,
          });
        }
      }
    });

    return fixed.slice(0, 10);
  });

  if (fixedWidthElements.length > 0) {
    issues.push({
      type: 'fixed_width_elements',
      message: `Found ${fixedWidthElements.length} elements with large fixed widths`,
      elements: fixedWidthElements,
      severity: 'medium',
    });
  }

  // Check for text overflow (truncated text)
  const textOverflowElements = await page.evaluate(() => {
    const elements = document.querySelectorAll('*');
    const overflowing: any[] = [];

    elements.forEach((el) => {
      if (el.scrollWidth > el.clientWidth && el.textContent?.trim()) {
        overflowing.push({
          tag: el.tagName,
          class: (el as HTMLElement).className,
          id: (el as HTMLElement).id,
          text: el.textContent.substring(0, 50),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        });
      }
    });

    return overflowing.slice(0, 10);
  });

  if (textOverflowElements.length > 0) {
    issues.push({
      type: 'text_overflow',
      message: `Found ${textOverflowElements.length} elements with overflowing text`,
      elements: textOverflowElements,
      severity: 'low',
    });
  }

  return issues;
}

// Test each viewport
for (const [viewportKey, viewportConfig] of Object.entries(VIEWPORTS)) {
  test.describe(`${viewportConfig.name} (${viewportConfig.width}x${viewportConfig.height})`, () => {
    test.use({
      viewport: { width: viewportConfig.width, height: viewportConfig.height },
    });

    for (const pageInfo of PAGES) {
      test(`${pageInfo.name}`, async ({ page }) => {
        const resultsDir = path.join(__dirname, '../playwright-report/responsive-review');
        fs.mkdirSync(resultsDir, { recursive: true });

        // Navigate to page
        await page.goto(pageInfo.path, { waitUntil: 'networkidle' });

        // Take screenshot
        const screenshotPath = path.join(
          resultsDir,
          `${viewportKey}_${pageInfo.path.replace(/\//g, '_')}.png`
        );
        await page.screenshot({ path: screenshotPath, fullPage: true });

        // Check for issues
        const overflowIssues = await checkOverflowIssues(page);
        const layoutIssues = await checkLayoutIssues(page);
        const allIssues = [...overflowIssues, ...layoutIssues];

        // Log results
        console.log(`\n${'='.repeat(60)}`);
        console.log(`${viewportConfig.name} - ${pageInfo.name}`);
        console.log(`${'='.repeat(60)}`);

        if (allIssues.length > 0) {
          console.log(`⚠️  Found ${allIssues.length} issue(s):`);
          allIssues.forEach((issue) => {
            console.log(`  - [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.message}`);
            if (issue.elements && issue.elements.length > 0) {
              console.log(`    Elements:`);
              issue.elements.slice(0, 5).forEach((el: any) => {
                const className = typeof el.class === 'string' && el.class ? `.${el.class.split(' ')[0]}` : '';
                console.log(`      - ${el.tag}${className}${el.id ? `#${el.id}` : ''}`);
              });
            }
          });
        } else {
          console.log('✅ No issues found');
        }

        // Save detailed results
        const resultsFile = path.join(
          resultsDir,
          `${viewportKey}_${pageInfo.path.replace(/\//g, '_')}_results.json`
        );
        fs.writeFileSync(
          resultsFile,
          JSON.stringify(
            {
              viewport: viewportConfig,
              page: pageInfo,
              issues: allIssues,
              screenshot: screenshotPath,
              timestamp: new Date().toISOString(),
            },
            null,
            2
          )
        );

        // The test passes if there are no high-severity issues
        // Medium and low severity issues are logged but don't fail the test
        const highSeverityIssues = allIssues.filter((i) => i.severity === 'high');
        if (highSeverityIssues.length > 0) {
          console.log(`\n❌ Test failed due to ${highSeverityIssues.length} high-severity issue(s)`);
        }

        expect(highSeverityIssues.length).toBe(0);
      });
    }
  });
}
