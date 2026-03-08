/**
 * Diagnostic script to identify specific overflowing elements
 */
import { test } from '@playwright/test';
import * as fs from 'fs';

test('Diagnose overflow issues on mobile dashboard', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/dashboard', { waitUntil: 'networkidle' });

  // Get detailed information about overflowing elements
  const overflowingElements = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const elements = document.querySelectorAll('*');
    const overflowing: any[] = [];

    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.right > viewportWidth && rect.width > 0) {
        const computedStyle = window.getComputedStyle(el);
        const html = el.outerHTML.substring(0, 200);

        const className = typeof el.className === 'string' ? el.className : '';
        const id = (el as HTMLElement).id || '';

        overflowing.push({
          tag: el.tagName,
          class: className,
          id: id,
          width: rect.width,
          right: rect.right,
          left: rect.left,
          overflow: computedStyle.overflow,
          overflowX: computedStyle.overflowX,
          position: computedStyle.position,
          display: computedStyle.display,
          html: html,
          selector: el.tagName + (className ? `.${className.split(' ')[0]}` : '') + (id ? `#${id}` : ''),
        });
      }
    });

    return overflowing;
  });

  console.log('\n' + '='.repeat(80));
  console.log('MOBILE DASHBOARD - OVERFLOW DIAGNOSIS');
  console.log('='.repeat(80));
  console.log(`\nViewport Width: 375px`);
  console.log(`Found ${overflowingElements.length} overflowing elements:\n`);

  overflowingElements.forEach((el, idx) => {
    console.log(`\n${idx + 1}. ${el.selector}`);
    console.log(`   Tag: ${el.tag}`);
    console.log(`   Class: ${el.class}`);
    console.log(`   ID: ${el.id}`);
    console.log(`   Width: ${el.width}px (extends to ${el.right}px, overflow by ${el.right - 375}px)`);
    console.log(`   Position: ${el.position}, Display: ${el.display}`);
    console.log(`   Overflow: ${el.overflow}, OverflowX: ${el.overflowX}`);
    console.log(`   HTML: ${el.html}`);
  });

  // Save to file
  const reportPath = '/tmp/overflow-diagnosis.json';
  fs.writeFileSync(reportPath, JSON.stringify(overflowingElements, null, 2));
  console.log(`\n\nDetailed report saved to: ${reportPath}`);
});
