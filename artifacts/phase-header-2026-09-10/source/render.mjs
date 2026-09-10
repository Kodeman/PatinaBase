#!/usr/bin/env node

/**
 * Headless render tool for design decks and single pages.
 * Renders HTML files and URLs to PNG screenshots at multiple widths and states.
 */

import { fileURLToPath } from 'url';
import { dirname, resolve as resolvePath } from 'path';
import { mkdirSync, writeFileSync } from 'fs';

// Main async IIFE
(async () => {
  // Resolve playwright from the pnpm store in root node_modules
  const scriptPath = fileURLToPath(import.meta.url);
  const scriptDir = dirname(scriptPath);
  const rootDir = '/Users/kody/Code/patina-merged';
  const playwrightModulePath = resolvePath(rootDir, 'node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs');

  let chromium;
  try {
    const pw = await import(`file://${playwrightModulePath}`);
    chromium = pw.chromium;
  } catch (e) {
    console.error('Failed to load Playwright:', e.message);
    process.exit(1);
  }

  // Parse command line arguments
  const args = process.argv.slice(2);
  let fileOrUrl = null;
  const options = {
    out: null,
    name: null,
    widths: [1440, 390],
    hashes: [],
    clicks: [],
    states: [],
    full: true,
    dark: false,
    reducedMotion: false,
    console: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--out') {
      options.out = args[++i];
    } else if (arg === '--name') {
      options.name = args[++i];
    } else if (arg === '--widths') {
      options.widths = args[++i].split(',').map(w => parseInt(w, 10));
    } else if (arg === '--hashes') {
      options.hashes = args[++i].split(',');
    } else if (arg === '--click') {
      options.clicks.push(args[++i]);
    } else if (arg === '--state') {
      options.states.push(args[++i]);
    } else if (arg === '--full') {
      options.full = args[++i] !== 'false';
    } else if (arg === '--dark') {
      options.dark = true;
    } else if (arg === '--reduced-motion') {
      options.reducedMotion = true;
    } else if (arg === '--console') {
      options.console = true;
    } else if (!fileOrUrl) {
      fileOrUrl = arg;
    }
  }

  if (!fileOrUrl || !options.out) {
    console.error('Usage: node render.mjs <file-or-url> --out <dir> [--name <base>] [--widths 1440,390] [--hashes slide-1,slide-2] [--click "<selector>"]... [--state "<label>=<selector>"]... [--full] [--dark] [--reduced-motion] [--console]');
    process.exit(1);
  }

  // Create output directory
  mkdirSync(options.out, { recursive: true });

  // Determine base name
  let baseName = options.name;
  if (!baseName) {
    if (fileOrUrl.startsWith('http://') || fileOrUrl.startsWith('https://')) {
      baseName = new URL(fileOrUrl).hostname.replace(/\./g, '-');
    } else {
      baseName = resolvePath(fileOrUrl).split('/').pop().split('.')[0];
    }
  }

  // Convert file path to file:// URL if needed
  let url = fileOrUrl;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'file://' + resolvePath(fileOrUrl);
  }

  // Viewport configs for each width
  const viewportConfig = {
    1440: { width: 1440, height: 900, deviceScaleFactor: 1 },
    390: { width: 390, height: 844, deviceScaleFactor: 2 }
  };

  // Parse states (format: "label=selector")
  const parsedStates = options.states.map(state => {
    const [label, selector] = state.split('=');
    return { label, selector };
  });

  // Create captures array for console.json
  const captures = [];
  let hasError = false;

  async function captureWithState(browser, state, width, hash) {
    const cfg = viewportConfig[width] || { width, height: 900, deviceScaleFactor: 1 };
    // deviceScaleFactor is a top-level newContext option, NOT a viewport field.
    // Nesting it inside `viewport` makes Playwright ignore it silently, so the
    // 390 captures came out at 1x instead of 2x.
    const viewport = { width: cfg.width, height: cfg.height };
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: cfg.deviceScaleFactor,
      colorScheme: options.dark ? 'dark' : 'light',
      reducedMotion: options.reducedMotion ? 'reduce' : 'no-preference'
    });
    const page = await context.newPage();

    const errors = [];
    const warnings = [];

    // Capture console messages
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      } else if (msg.type() === 'warn') {
        warnings.push(msg.text());
      }
    });

    // Capture page errors
    page.on('pageerror', err => {
      errors.push(err.toString());
      hasError = true;
    });

    try {
      // Navigate with hash if provided
      const fullUrl = hash ? `${url}#${hash}` : url;
      await page.goto(fullUrl, { waitUntil: 'domcontentloaded' });

      // Wait for fonts and images
      try {
        await page.evaluate(() => document.fonts.ready);
      } catch (e) {
        // Fonts API may not be available
      }

      // Wait for all images
      await Promise.race([
        page.evaluate(() => {
          return Promise.all(
            Array.from(document.querySelectorAll('img')).map(img => {
              return new Promise(resolve => {
                if (img.complete) {
                  resolve();
                } else {
                  img.addEventListener('load', resolve);
                  img.addEventListener('error', resolve);
                  setTimeout(resolve, 100); // Fallback
                }
              });
            })
          );
        }),
        new Promise(resolve => setTimeout(resolve, 15000)) // 15s timeout
      ]);

      // Click for state if provided
      if (state && state.selector) {
        try {
          await page.click(state.selector);
          // Wait a bit for any animations
          await page.waitForTimeout(500);
        } catch (e) {
          warnings.push(`Failed to click selector: ${state.selector}`);
        }
      }

      // Additional clicks (before state screenshots)
      for (const selector of options.clicks) {
        try {
          await page.click(selector);
          await page.waitForTimeout(300);
        } catch (e) {
          warnings.push(`Failed to click selector: ${selector}`);
        }
      }

      // Generate filename
      let filename = baseName;
      if (hash) {
        filename += `-${hash}`;
      }
      if (state && state.label) {
        filename += `-${state.label}`;
      }
      filename += `-${width}`;
      if (options.dark) {
        filename += '-dark';
      }
      if (options.reducedMotion) {
        filename += '-rm';
      }
      filename += '.png';

      // Check for horizontal overflow
      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1
      );

      // Screenshot
      const screenshotPath = `${options.out}/${filename}`;
      await page.screenshot({
        path: screenshotPath,
        fullPage: options.full
      });

      // Record capture
      captures.push({
        file: filename,
        width,
        hash: hash || null,
        state: state ? state.label : null,
        errors,
        warnings,
        horizontalOverflow
      });

      console.log(`✓ ${filename}`);

      if (errors.length > 0) {
        hasError = true;
      }
    } catch (err) {
      errors.push(err.message || err.toString());
      hasError = true;
      console.error(`✗ Capture failed: ${err.message}`);
    } finally {
      await context.close();
    }
  }

  const browser = await chromium.launch();

  try {
    // Ensure we have at least one hash (empty string = no hash)
    const hashes = options.hashes.length > 0 ? options.hashes : [''];

    // Capture combinations: widths × hashes × states
    for (const hash of hashes) {
      for (const width of options.widths) {
        if (parsedStates.length > 0) {
          // Capture each state variant
          for (const state of parsedStates) {
            await captureWithState(browser, state, width, hash);
          }
        } else {
          // No states, just capture the page
          await captureWithState(browser, null, width, hash);
        }
      }
    }

    // Write console.json
    const consoleJsonPath = `${options.out}/${baseName}-console.json`;
    writeFileSync(consoleJsonPath, JSON.stringify({ captures }, null, 2));
    console.log(`\nConsole log: ${baseName}-console.json`);

    if (options.console) {
      // Print all errors and warnings
      for (const capture of captures) {
        if (capture.errors.length > 0 || capture.warnings.length > 0) {
          console.log(`\n${capture.file}:`);
          if (capture.errors.length > 0) {
            console.error('  Errors:', capture.errors);
          }
          if (capture.warnings.length > 0) {
            console.log('  Warnings:', capture.warnings);
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  process.exit(hasError ? 1 : 0);
})().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
