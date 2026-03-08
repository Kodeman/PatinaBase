import { Page, Response, Locator } from '@playwright/test';

/**
 * Deterministic wait helper utilities for E2E tests.
 * These replace arbitrary timeouts with condition-based waits.
 */
export class WaitHelpers {
  /**
   * Wait for an element to be visible on the page
   * @param page - Playwright page object
   * @param selector - CSS selector or data-testid
   * @param options - Optional timeout configuration
   */
  static async waitForElement(
    page: Page,
    selector: string,
    options?: { timeout?: number; state?: 'attached' | 'detached' | 'visible' | 'hidden' }
  ): Promise<void> {
    await page.waitForSelector(selector, {
      state: options?.state ?? 'visible',
      timeout: options?.timeout ?? 10000,
    });
  }

  /**
   * Wait for network to be idle (no network activity for at least 500ms)
   * @param page - Playwright page object
   * @param options - Optional timeout configuration
   */
  static async waitForNetworkIdle(page: Page, options?: { timeout?: number }): Promise<void> {
    await page.waitForLoadState('networkidle', { timeout: options?.timeout ?? 30000 });
  }

  /**
   * Wait for DOM content to be loaded
   * @param page - Playwright page object
   * @param options - Optional timeout configuration
   */
  static async waitForDOMContentLoaded(page: Page, options?: { timeout?: number }): Promise<void> {
    await page.waitForLoadState('domcontentloaded', { timeout: options?.timeout ?? 30000 });
  }

  /**
   * Wait for a specific API response matching the URL pattern
   * @param page - Playwright page object
   * @param urlPattern - String to match in URL or RegExp pattern
   * @param options - Optional timeout and status code configuration
   */
  static async waitForApiResponse(
    page: Page,
    urlPattern: string | RegExp,
    options?: { timeout?: number; status?: number }
  ): Promise<Response> {
    return page.waitForResponse(
      (response) => {
        const url = response.url();
        const matchesUrl =
          typeof urlPattern === 'string' ? url.includes(urlPattern) : urlPattern.test(url);

        if (options?.status) {
          return matchesUrl && response.status() === options.status;
        }
        return matchesUrl;
      },
      { timeout: options?.timeout ?? 15000 }
    );
  }

  /**
   * Wait for multiple API responses matching the URL patterns
   * @param page - Playwright page object
   * @param urlPatterns - Array of strings or RegExp patterns
   * @param options - Optional timeout configuration
   */
  static async waitForMultipleApiResponses(
    page: Page,
    urlPatterns: (string | RegExp)[],
    options?: { timeout?: number }
  ): Promise<Response[]> {
    const responses = await Promise.all(
      urlPatterns.map((pattern) =>
        this.waitForApiResponse(page, pattern, { timeout: options?.timeout })
      )
    );
    return responses;
  }

  /**
   * Wait for an element to disappear from the page
   * @param page - Playwright page object
   * @param selector - CSS selector or data-testid
   * @param options - Optional timeout configuration
   */
  static async waitForElementToDisappear(
    page: Page,
    selector: string,
    options?: { timeout?: number }
  ): Promise<void> {
    await page.waitForSelector(selector, {
      state: 'hidden',
      timeout: options?.timeout ?? 10000,
    });
  }

  /**
   * Wait for an element to be detached from the DOM
   * @param page - Playwright page object
   * @param selector - CSS selector or data-testid
   * @param options - Optional timeout configuration
   */
  static async waitForElementToDetach(
    page: Page,
    selector: string,
    options?: { timeout?: number }
  ): Promise<void> {
    await page.waitForSelector(selector, {
      state: 'detached',
      timeout: options?.timeout ?? 10000,
    });
  }

  /**
   * Wait for a custom condition to be true
   * @param page - Playwright page object
   * @param condition - Function that returns true when condition is met
   * @param options - Optional timeout and polling interval configuration
   */
  static async waitForCondition(
    page: Page,
    condition: () => Promise<boolean> | boolean,
    options?: { timeout?: number; interval?: number }
  ): Promise<void> {
    await page.waitForFunction(condition, {
      timeout: options?.timeout ?? 10000,
      polling: options?.interval ?? 100,
    });
  }

  /**
   * Wait for a locator to have a specific count
   * @param locator - Playwright locator
   * @param count - Expected count
   * @param options - Optional timeout configuration
   */
  static async waitForCount(
    locator: Locator,
    count: number,
    options?: { timeout?: number }
  ): Promise<void> {
    await locator.first().waitFor({ timeout: options?.timeout ?? 10000 });
    await locator.nth(count - 1).waitFor({ timeout: options?.timeout ?? 10000 });
  }

  /**
   * Wait for an element to contain specific text
   * @param page - Playwright page object
   * @param selector - CSS selector or data-testid
   * @param text - Text to wait for
   * @param options - Optional timeout configuration
   */
  static async waitForText(
    page: Page,
    selector: string,
    text: string,
    options?: { timeout?: number }
  ): Promise<void> {
    await page.waitForFunction(
      ({ sel, txt }) => {
        const element = document.querySelector(sel);
        return element?.textContent?.includes(txt) ?? false;
      },
      { sel: selector, txt: text },
      { timeout: options?.timeout ?? 10000 }
    );
  }

  /**
   * Wait for a navigation to complete
   * @param page - Playwright page object
   * @param action - Function that triggers navigation
   * @param options - Optional timeout and wait until configuration
   */
  static async waitForNavigation(
    page: Page,
    action: () => Promise<void>,
    options?: { timeout?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }
  ): Promise<void> {
    await Promise.all([
      page.waitForLoadState(options?.waitUntil ?? 'networkidle', {
        timeout: options?.timeout ?? 30000,
      }),
      action(),
    ]);
  }

  /**
   * Wait for a file upload to complete
   * @param page - Playwright page object
   * @param uploadAction - Function that triggers the upload
   * @param options - Optional timeout configuration
   */
  static async waitForUpload(
    page: Page,
    uploadAction: () => Promise<void>,
    options?: { timeout?: number }
  ): Promise<void> {
    const responsePromise = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.status() === 200,
      { timeout: options?.timeout ?? 30000 }
    );
    await uploadAction();
    await responsePromise;
  }

  /**
   * Wait for a tab or section transition animation to complete
   * @param page - Playwright page object
   * @param targetSelector - Selector for the tab/section that should become visible
   * @param options - Optional timeout configuration
   */
  static async waitForTabTransition(
    page: Page,
    targetSelector: string,
    options?: { timeout?: number }
  ): Promise<void> {
    // Wait for the element to be visible
    await this.waitForElement(page, targetSelector, { timeout: options?.timeout });

    // Wait for any animations to complete by checking the element is stable
    await page.waitForFunction(
      (selector) => {
        const element = document.querySelector(selector);
        if (!element) return false;

        // Check if element has animations running
        const animations = element.getAnimations();
        return animations.length === 0 || animations.every((anim) => anim.playState === 'finished');
      },
      targetSelector,
      { timeout: options?.timeout ?? 5000 }
    );
  }

  /**
   * Wait for a debounced search to complete
   * @param page - Playwright page object
   * @param searchApiPattern - API endpoint pattern for search
   * @param options - Optional timeout and debounce delay configuration
   */
  static async waitForDebouncedSearch(
    page: Page,
    searchApiPattern: string | RegExp,
    options?: { timeout?: number; debounceDelay?: number }
  ): Promise<Response> {
    // Wait for the debounce delay to pass
    await page.waitForFunction(
      (delay) => {
        return new Promise((resolve) => setTimeout(resolve, delay));
      },
      options?.debounceDelay ?? 500,
      { timeout: options?.timeout ?? 15000 }
    );

    // Then wait for the API response
    return this.waitForApiResponse(page, searchApiPattern, { timeout: options?.timeout });
  }

  /**
   * Wait for an element to be enabled (not disabled)
   * @param page - Playwright page object
   * @param selector - CSS selector or data-testid
   * @param options - Optional timeout configuration
   */
  static async waitForEnabled(
    page: Page,
    selector: string,
    options?: { timeout?: number }
  ): Promise<void> {
    await page.waitForFunction(
      (sel) => {
        const element = document.querySelector(sel) as HTMLInputElement | HTMLButtonElement;
        return element && !element.disabled;
      },
      selector,
      { timeout: options?.timeout ?? 10000 }
    );
  }

  /**
   * Wait for loading indicator to appear and then disappear
   * @param page - Playwright page object
   * @param loadingSelector - Selector for the loading indicator
   * @param options - Optional timeout configuration
   */
  static async waitForLoadingComplete(
    page: Page,
    loadingSelector: string,
    options?: { timeout?: number }
  ): Promise<void> {
    try {
      // First wait for loading indicator to appear (with a short timeout)
      await this.waitForElement(page, loadingSelector, { timeout: 2000 });
    } catch {
      // If it doesn't appear, it might have already disappeared
      return;
    }

    // Then wait for it to disappear
    await this.waitForElementToDisappear(page, loadingSelector, { timeout: options?.timeout });
  }

  /**
   * Wait for a CSS animation or transition to complete
   * @param page - Playwright page object
   * @param selector - Selector for the animated element
   * @param options - Optional timeout configuration
   */
  static async waitForAnimationComplete(
    page: Page,
    selector: string,
    options?: { timeout?: number }
  ): Promise<void> {
    await page.waitForFunction(
      (sel) => {
        const element = document.querySelector(sel);
        if (!element) return false;

        const animations = element.getAnimations();
        if (animations.length === 0) return true;

        return animations.every((anim) => anim.playState === 'finished');
      },
      selector,
      { timeout: options?.timeout ?? 5000 }
    );
  }

  /**
   * Wait for all images within a selector to load
   * @param page - Playwright page object
   * @param containerSelector - Selector for the container with images
   * @param options - Optional timeout configuration
   */
  static async waitForImagesLoaded(
    page: Page,
    containerSelector: string,
    options?: { timeout?: number }
  ): Promise<void> {
    await page.waitForFunction(
      (sel) => {
        const container = document.querySelector(sel);
        if (!container) return false;

        const images = container.querySelectorAll('img');
        if (images.length === 0) return true;

        return Array.from(images).every((img) => img.complete && img.naturalHeight > 0);
      },
      containerSelector,
      { timeout: options?.timeout ?? 15000 }
    );
  }
}
