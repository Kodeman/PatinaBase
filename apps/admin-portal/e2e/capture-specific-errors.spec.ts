import { test, expect } from '@playwright/test';

test('Capture exact error messages from protected routes', async ({ page }) => {
  const routes = ['/catalog', '/settings', '/orders', '/media', '/users'];

  for (const route of routes) {
    console.log(`\n======================================`);
    console.log(`Testing route: ${route}`);
    console.log(`======================================`);

    const consoleMessages: { type: string; text: string }[] = [];

    page.on('console', (msg) => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
      });
    });

    page.on('pageerror', (error) => {
      console.log(`PAGE ERROR: ${error.message}`);
      console.log(`Stack: ${error.stack}`);
    });

    await page.goto(route);
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // Print all console messages
    const errors = consoleMessages.filter(m => m.type === 'error');
    const warnings = consoleMessages.filter(m => m.type === 'warning');
    const logs = consoleMessages.filter(m => m.type === 'log');

    console.log(`\nConsole Errors (${errors.length}):`);
    errors.forEach((msg, idx) => {
      console.log(`  ${idx + 1}. [${msg.type}] ${msg.text}`);
    });

    console.log(`\nConsole Warnings (${warnings.length}):`);
    warnings.forEach((msg, idx) => {
      console.log(`  ${idx + 1}. [${msg.type}] ${msg.text}`);
    });

    console.log(`\nConsole Logs (first 5 of ${logs.length}):`);
    logs.slice(0, 5).forEach((msg, idx) => {
      console.log(`  ${idx + 1}. [${msg.type}] ${msg.text}`);
    });

    // Remove listeners for next iteration
    page.removeAllListeners('console');
    page.removeAllListeners('pageerror');
  }
});
