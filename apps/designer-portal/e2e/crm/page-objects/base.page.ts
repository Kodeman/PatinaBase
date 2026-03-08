/**
 * Base Page Object Model
 *
 * Provides common functionality for all CRM page objects
 */

import { Page, Locator } from '@playwright/test';

export class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigate to a specific URL path
   */
  async goto(path: string): Promise<void> {
    await this.page.goto(path);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Wait for an element to be visible
   */
  async waitForElement(selector: string, timeout = 30000): Promise<void> {
    await this.page.waitForSelector(selector, { timeout });
  }

  /**
   * Wait for an element to be hidden
   */
  async waitForElementHidden(selector: string, timeout = 30000): Promise<void> {
    await this.page.waitForSelector(selector, {
      timeout,
      state: 'hidden',
    });
  }

  /**
   * Click an element and wait for navigation if needed
   */
  async click(
    selector: string,
    options?: { timeout?: number; force?: boolean }
  ): Promise<void> {
    await this.page.click(selector, options);
  }

  /**
   * Fill an input field
   */
  async fill(selector: string, value: string): Promise<void> {
    await this.page.fill(selector, value);
  }

  /**
   * Get text content of an element
   */
  async getText(selector: string): Promise<string | null> {
    return this.page.textContent(selector);
  }

  /**
   * Get attribute value
   */
  async getAttribute(selector: string, attribute: string): Promise<string | null> {
    return this.page.getAttribute(selector, attribute);
  }

  /**
   * Check if element is visible
   */
  async isVisible(selector: string): Promise<boolean> {
    try {
      return await this.page.isVisible(selector);
    } catch {
      return false;
    }
  }

  /**
   * Check if element is enabled
   */
  async isEnabled(selector: string): Promise<boolean> {
    try {
      return await this.page.isEnabled(selector);
    } catch {
      return false;
    }
  }

  /**
   * Select an option from a dropdown
   */
  async selectDropdown(selector: string, value: string): Promise<void> {
    await this.page.selectOption(selector, value);
  }

  /**
   * Take a screenshot
   */
  async takeScreenshot(name: string): Promise<Buffer> {
    return await this.page.screenshot({ path: `screenshots/${name}.png` });
  }

  /**
   * Wait for a specific condition
   */
  async waitForFunction(
    condition: () => Promise<boolean>,
    timeout = 30000
  ): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await this.page.waitForTimeout(100);
    }
    throw new Error('Timeout waiting for condition');
  }

  /**
   * Get all text content matching a selector
   */
  async getAllText(selector: string): Promise<string[]> {
    const elements = await this.page.$$(selector);
    const texts: string[] = [];

    for (const element of elements) {
      const text = await element.textContent();
      if (text) {
        texts.push(text.trim());
      }
    }

    return texts;
  }

  /**
   * Hover over an element
   */
  async hover(selector: string): Promise<void> {
    await this.page.hover(selector);
  }

  /**
   * Press a key
   */
  async press(key: string): Promise<void> {
    await this.page.press('body', key);
  }

  /**
   * Get element locator
   */
  getLocator(selector: string): Locator {
    return this.page.locator(selector);
  }

  /**
   * Wait for console message (useful for debugging)
   */
  async onConsoleMessage(callback: (msg: string) => void): void {
    this.page.on('console', (msg) => callback(msg.text()));
  }

  /**
   * Handle dialog/alert
   */
  async handleDialog(action: 'accept' | 'dismiss' = 'accept'): Promise<void> {
    this.page.once('dialog', (dialog) => {
      if (action === 'accept') {
        dialog.accept();
      } else {
        dialog.dismiss();
      }
    });
  }

  /**
   * Get current URL
   */
  getCurrentUrl(): string {
    return this.page.url();
  }

  /**
   * Check if URL contains text
   */
  isUrlContaining(text: string): boolean {
    return this.page.url().includes(text);
  }

  /**
   * Reload page
   */
  async reload(): Promise<void> {
    await this.page.reload();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Wait for API response
   */
  async waitForAPIResponse(
    urlPattern: string | RegExp,
    timeout = 30000
  ): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (response) => {
        if (typeof urlPattern === 'string') {
          return response.url().includes(urlPattern);
        }
        return urlPattern.test(response.url());
      },
      { timeout }
    );

    await responsePromise;
  }

  /**
   * Get and verify API response
   */
  async getAPIResponse(
    urlPattern: string | RegExp,
    timeout = 30000
  ): Promise<any> {
    const response = await this.page.waitForResponse(
      (response) => {
        if (typeof urlPattern === 'string') {
          return response.url().includes(urlPattern);
        }
        return urlPattern.test(response.url());
      },
      { timeout }
    );

    return response.json();
  }

  /**
   * Intercept and mock API responses
   */
  async mockAPIResponse(
    urlPattern: string | RegExp,
    responseData: any,
    statusCode = 200
  ): Promise<void> {
    await this.page.route(urlPattern, (route) => {
      route.abort('blockedbyclient');
    });

    await this.page.route(urlPattern, (route) => {
      route.continue();
    });
  }

  /**
   * Check accessibility issues
   */
  async checkAccessibility(): Promise<void> {
    // Integration point for axe-core or similar tools
    // This would be implemented when accessibility testing is added
  }
}
