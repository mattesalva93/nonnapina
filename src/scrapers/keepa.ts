/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { connect } from 'puppeteer-real-browser';
import type { Browser, Page } from 'rebrowser-puppeteer-core';
import { config } from '../config/index.js';
import { sendErrorAlert, sendMissingCategoriesEmail } from '../services/email.service.js';
import { checkDealDuplicate } from '../services/product.service.js';
import type { KeepaProduct, ScrapeResult } from '../types/index.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('KeepaService');

const SCREENSHOT_DIR = './output/screenshots';
let screenshotCounter = 0;
const SCREENSHOTS_ENABLED = config.server.nodeEnv !== 'production';

async function takeScreenshot(page: Page, label: string): Promise<void> {
  if (!SCREENSHOTS_ENABLED) return;
  try {
    await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
    const idx = String(++screenshotCounter).padStart(3, '0');
    const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    const filename = `${idx}_${safeLabel}.png`;
    const filepath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: filepath });
    logger.debug({ filename }, 'Screenshot saved');
  } catch (err) {
    logger.warn({ label, err: (err as Error).message }, 'Screenshot failed');
  }
}

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Wait for the Keepa deals UI to be fully loaded and interactive.
 * Handles Cloudflare challenges (Turnstile, JS challenges, interstitials)
 * by polling for the #submitDealQuery button which only exists on the
 * real deals page. If a challenge is detected, waits up to 120s for it
 * to resolve before giving up.
 */
async function waitForDealsUI(page: Page, context: string, maxWaitMs = 120_000): Promise<void> {
  const start = Date.now();
  let lastLog = 0;

  while (Date.now() - start < maxWaitMs) {
    const state = await page
      .evaluate(() => {
        const title = document.title ?? '';
        const bodyText = document.body?.innerText ?? '';

        // Cloudflare / Turnstile challenge indicators
        const isCloudflare =
          title.includes('Just a moment') ||
          bodyText.includes('Checking your browser') ||
          bodyText.includes('Cloudflare') ||
          !!document.querySelector('iframe[src*="challenges.cloudflare.com"]') ||
          !!document.querySelector('#turnstile-wrapper') ||
          !!document.querySelector('.cf-browser-verification');

        // Keepa deals page indicator
        const hasDealButton = !!document.querySelector('#submitDealQuery');

        return { isCloudflare, hasDealButton, title: title.slice(0, 60) };
      })
      .catch(() => ({ isCloudflare: false, hasDealButton: false, title: 'page-error' }));

    if (state.hasDealButton) {
      logger.info({ context, waitedMs: Date.now() - start }, 'Deals UI is ready');
      return;
    }

    // Log progress every 15 seconds to avoid log spam
    const now = Date.now();
    if (now - lastLog > 15_000) {
      lastLog = now;
      if (state.isCloudflare) {
        logger.warn(
          { context, waitedMs: now - start, title: state.title },
          'Cloudflare challenge detected — waiting for it to resolve'
        );
      } else {
        logger.info(
          { context, waitedMs: now - start, title: state.title },
          'Deals UI not ready yet — waiting'
        );
      }
      await takeScreenshot(page, `wait_deals_ui_${context}_${Math.round((now - start) / 1000)}s`);
    }

    await delay(3000);
  }

  await takeScreenshot(page, `wait_deals_ui_${context}_timeout`);
  throw new Error(
    `Deals UI not ready after ${Math.round(maxWaitMs / 1000)}s (context: ${context})`
  );
}

interface RetryOptions {
  retries?: number;
  baseDelay?: number;
  label?: string;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 3, baseDelay = 2000, label = 'operation' }: RetryOptions = {}
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries) {
        logger.error(
          { label, retries, err: (error as Error).message },
          'Operation failed after all retries'
        );
        throw error;
      }
      const waitMs = baseDelay * Math.pow(2, attempt - 1);
      logger.warn(
        { label, attempt, retries, err: (error as Error).message, retryInSec: waitMs / 1000 },
        'Retry attempt failed'
      );
      await delay(waitMs);
    }
  }
  throw new Error(`${label} failed after ${retries} attempts`);
}

const CATEGORY_NAMES: Record<string, string> = {
  1: 'Alimentari e cura della casa',
  2: 'Altro',
  3: 'App e Giochi',
  4: 'Auto e Moto',
  5: 'Bellezza',
  6: 'CD e Vinili',
  7: 'Cancelleria e prodotti per ufficio',
  8: 'Casa e cucina',
  9: 'Commercio, Industria e Scienza',
  10: 'Elettronica',
  11: 'Fai da te',
  12: 'Film e TV',
  13: 'Giardino e giardinaggio',
  14: 'Giochi e giocattoli',
  15: 'Grandi elettrodomestici',
  16: 'Illuminazione',
  17: 'Informatica',
  18: 'Libri',
  19: 'Moda',
  20: 'Musica Digitale',
  21: 'Prima infanzia',
  22: 'Prodotti per animali domestici',
  23: 'Salute e cura della persona',
  24: 'Software',
  25: 'Sport e tempo libero',
  26: 'Strumenti musicali',
  27: 'Videogiochi',
  28: 'Amazon Luxury',
};

async function isPageAlive(page: Page): Promise<boolean> {
  try {
    await page.evaluate(() => document.title);
    return true;
  } catch {
    return false;
  }
}

// ─── Browser lifecycle helpers ────────────────────────────────────────────────

const BROWSER_CONNECT_ARGS = [
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-popup-blocking',
  '--disable-prompt-on-repost',
  '--disable-blink-features=AutomationControlled',
  '--no-sandbox',
  '--disable-crash-reporter',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-software-rasterizer',
];

/**
 * Kill any stale Chromium/chrome processes left over from a previous run.
 * This prevents zombie processes from blocking WebSocket ports and consuming
 * /dev/shm memory, which is the root cause of "Failed to fetch browser
 * webSocket URL" errors after container restarts.
 */
function killStaleChromiumProcesses(): void {
  try {
    // Kill only Chromium processes that are NOT part of the WhatsApp session.
    // WhatsApp runs its own headless Chromium with a --user-data-dir pointing
    // to .wwebjs_auth. We must keep those alive to avoid "detached Frame" errors
    // on the next scheduled publish.
    //
    // Strategy: list all chromium/chrome PIDs, filter out those whose command
    // line contains the WhatsApp session directory, then kill the rest.
    const script = `
      for pid in $(pgrep -f 'chrom(ium|e)' 2>/dev/null); do
        cmdline=$(cat /proc/$pid/cmdline 2>/dev/null | tr '\\0' ' ')
        case "$cmdline" in
          *wwebjs_auth*) ;;
          *) kill "$pid" 2>/dev/null ;;
        esac
      done
    `;
    execSync(script, { stdio: 'ignore' });
    logger.info('Stale Chromium processes cleaned up (WhatsApp excluded)');
  } catch {
    // pgrep returns non-zero if no processes matched — that's fine
    logger.debug('No stale Chromium processes found (or cleanup not needed)');
  }
}

/**
 * Verify that Xvfb (the virtual framebuffer) is running and responsive.
 * puppeteer-real-browser needs a display server because it runs in headed mode
 * to bypass Cloudflare/Turnstile. If Xvfb crashed or hasn't started yet the
 * browser connect will fail silently.
 */
async function ensureXvfbReady(maxWaitMs = 10_000): Promise<void> {
  const start = Date.now();
  const checkInterval = 500;

  while (Date.now() - start < maxWaitMs) {
    try {
      // xdpyinfo queries the X display — if it succeeds, Xvfb is alive
      execSync('xdpyinfo -display :99 >/dev/null 2>&1', { timeout: 3000 });
      logger.debug('Xvfb display :99 is ready');
      return;
    } catch {
      // Xvfb not ready yet — wait and retry
      await delay(checkInterval);
    }
  }

  // Xvfb not available — start it ourselves
  logger.warn('Xvfb not detected — attempting to start it');
  try {
    execSync('Xvfb :99 -screen 0 1280x800x24 -nolisten tcp &', {
      stdio: 'ignore',
      env: { ...process.env, DISPLAY: ':99' },
    });
    // Give Xvfb time to initialize
    await delay(2000);
    logger.info('Xvfb started on display :99');
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Could not start Xvfb');
  }
}

/**
 * Launch a browser with full cleanup and retry logic.
 * Between each attempt we:
 * 1. Kill stale Chromium processes
 * 2. Verify Xvfb is running
 * 3. Wait before retrying (exponential backoff)
 */
async function launchBrowserWithRetry(
  retries = 3,
  baseDelayMs = 5000
): Promise<{ browser: Browser; page: Page }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Clean slate before every attempt
      killStaleChromiumProcesses();
      await delay(1000); // let OS reclaim resources
      await ensureXvfbReady();

      logger.info({ attempt, retries }, 'Attempting browser launch');

      const { browser, page } = await connect({
        headless: false,
        args: BROWSER_CONNECT_ARGS,
        customConfig: {},
        turnstile: true,
        connectOption: {
          defaultViewport: undefined,
          protocolTimeout: 120_000,
        },
        disableXvfb: false,
        ignoreAllFlags: false,
      });

      // Verify browser is actually responsive
      const title = await page.evaluate(() => document.title).catch(() => undefined);
      if (title === undefined) {
        throw new Error('Browser launched but page is not responsive');
      }

      logger.info({ attempt }, 'Browser launched and verified');
      return { browser, page };
    } catch (error) {
      const msg = (error as Error).message;
      logger.error({ attempt, retries, err: msg }, 'Browser launch failed');

      if (attempt === retries) {
        throw new Error(`Browser launch failed after ${retries} attempts. Last error: ${msg}`);
      }

      const waitMs = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn({ retryInSec: waitMs / 1000 }, 'Waiting before next browser launch attempt');
      await delay(waitMs);
    }
  }

  throw new Error('Browser launch failed — unreachable');
}

/**
 * Safely close the browser, catching and logging any errors.
 * Also kills lingering Chromium processes to prevent zombies.
 */
async function closeBrowserSafely(browser: Browser | undefined): Promise<void> {
  if (!browser) return;

  const keepOpenMs = parseInt(process.env.BROWSER_KEEP_OPEN_MS ?? '3000', 10);
  if (keepOpenMs > 0) {
    await delay(keepOpenMs);
  }

  try {
    await browser.close();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'browser.close() failed — force-killing');
  }

  // Always clean up to prevent zombie accumulation
  killStaleChromiumProcesses();
}

/**
 * Recovery: launch a fresh browser + deals page, re-apply essential filters,
 * and click "Find Deals" so the caller can resume category iteration.
 *
 * We launch a brand-new browser because the original Chromium process may
 * have crashed entirely (not just a single page).
 */
async function recoverDealsPage(
  options: { lowestEver?: boolean } = {}
): Promise<{ browser: Browser; page: Page }> {
  logger.info('Launching fresh browser for recovery');

  const { browser: newBrowser, page: newPage } = await launchBrowserWithRetry();

  await newPage.setViewport({ width: 1280, height: 800 });
  await newPage.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // Navigate to homepage first to set domain/language (fresh browser has no cookies)
  await newPage.goto('https://keepa.com/', { waitUntil: 'networkidle2', timeout: 30000 });
  await delay(2000);

  // Select Amazon.it domain
  await newPage.evaluate(() => {
    const domainSelector = document.querySelector('.languageMenuImg[rel="domain"]');
    if (domainSelector) (domainSelector as HTMLElement).click();
  });
  await delay(1000);
  await newPage.evaluate(() => {
    const option = document.querySelector('[setting="8"]');
    if (option) (option as HTMLElement).click();
  });
  await delay(2000);
  logger.debug('Recovery: Amazon.it domain selected');

  // Navigate to deals page
  await newPage.goto('https://keepa.com/#!deals', { waitUntil: 'networkidle2', timeout: 60000 });
  await delay(5000);

  // Wait for the deals UI (handles Cloudflare transparently)
  await waitForDealsUI(newPage, 'recovery');

  // Price type filter: Amazon
  await newPage.evaluate(() => {
    const container = document.getElementById('dealPriceTypesFilter');
    if (!container) return;
    const opt = container.querySelector('div[data-type="0"]') as HTMLElement | null;
    if (opt) opt.click();
  });
  await delay(1000);

  // Date range: 3 months
  await newPage.evaluate(() => {
    const container = document.getElementById('dealDateRange');
    if (!container) return;
    const opt = container.querySelector('[setting="3"]') as HTMLElement | null;
    if (opt) opt.click();
  });
  await delay(500);

  // Range filter panel
  await ensurePanelExpanded(
    newPage,
    'panelRangeSelectionDisableCross',
    'panelRangeSelection',
    'Recovery: Seleziona Range'
  );
  await delay(300);
  await setCheckboxById(
    newPage,
    'checkboxDeltaLastRange',
    true,
    'Recovery: Solo ultima variazione'
  );
  await delay(300);

  // Applica filtri panel
  await ensurePanelExpanded(
    newPage,
    'panelFilterSelectionDisableCross',
    'dealCheckBoxes',
    'Recovery: Applica filtri'
  );
  await delay(300);
  await setCheckboxById(
    newPage,
    'checkboxLowestEver',
    options.lowestEver ?? false,
    'Recovery: Minimo'
  );
  await delay(200);
  await setCheckboxById(newPage, 'checkboxHasReviews', true, 'Recovery: Recensioni');
  await delay(200);
  await setCheckboxById(newPage, 'checkboxFilterErotic', true, 'Recovery: Filtra adulti');
  await delay(200);
  await setCheckboxById(newPage, 'checkboxSingleVariation', true, 'Recovery: Variante singola');
  await delay(300);

  // Click Find Deals
  await newPage.evaluate(() => {
    const button = document.querySelector('#submitDealQuery');
    if (button) (button as HTMLElement).click();
  });

  // Wait for products
  let ready = false;
  const start = Date.now();
  while (!ready && Date.now() - start < 60_000) {
    ready = await newPage.evaluate(() => {
      const productPage = document.querySelector('#productPage0');
      const loadingIcon = document.querySelector('#loadingIcon');
      const loading = loadingIcon && (loadingIcon as HTMLElement).style.display !== 'none';
      return !!productPage && productPage.innerHTML.trim().length > 50 && !loading;
    });
    if (!ready) await delay(2000);
  }

  if (!ready) throw new Error('Timeout waiting for products after recovery');

  await takeScreenshot(newPage, 'recovery_deals_ready');
  logger.info('Deals page recovered successfully');
  return { browser: newBrowser, page: newPage };
}

async function clickFilterToggle(
  page: Page,
  searchText: string,
  logLabel: string
): Promise<boolean> {
  const clicked = await page.evaluate((text: string) => {
    const normalized = text.toLowerCase().trim();
    let bestMatch: HTMLElement | null = null;
    let bestLength = Infinity;

    const candidates = document.querySelectorAll('div, span, label, button');
    for (const el of candidates) {
      const elText = (el.textContent ?? '').toLowerCase().trim();
      if (elText.includes(normalized) && elText.length < bestLength) {
        bestMatch = el as HTMLElement;
        bestLength = elText.length;
      }
    }

    if (!bestMatch) return false;

    const checkbox = bestMatch.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    if (checkbox) {
      if (!checkbox.checked) checkbox.click();
      return true;
    }
    bestMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
    bestMatch.click();
    return true;
  }, searchText);

  if (clicked) {
    logger.debug({ filter: logLabel }, 'Filter toggled');
    await takeScreenshot(page, `filter_toggle_${logLabel}`);
  } else {
    logger.warn({ filter: logLabel }, 'Filter element not found');
  }
  return clicked;
}

async function ensurePanelExpanded(
  page: Page,
  toggleId: string,
  contentId: string,
  logLabel: string
): Promise<void> {
  const isHidden = await page.evaluate((cId: string) => {
    const content = document.getElementById(cId);
    if (!content) return true;
    const style = window.getComputedStyle(content);
    return style.display === 'none' || content.offsetHeight === 0;
  }, contentId);

  if (!isHidden) {
    logger.debug({ panel: logLabel }, 'Panel already expanded');
    return;
  }

  logger.debug({ panel: logLabel }, 'Expanding panel');
  const clicked = await page.evaluate((tId: string) => {
    const toggle = document.getElementById(tId);
    if (!toggle) return false;
    toggle.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toggle.click();
    return true;
  }, toggleId);

  if (!clicked) {
    logger.warn({ toggleId, panel: logLabel }, 'Panel toggle element not found');
    return;
  }

  // Wait for the content to become visible
  const maxWait = 5000;
  const interval = 300;
  const start = Date.now();
  let visible = false;

  while (!visible && Date.now() - start < maxWait) {
    visible = await page.evaluate((cId: string) => {
      const content = document.getElementById(cId);
      if (!content) return false;
      const style = window.getComputedStyle(content);
      return style.display !== 'none' && content.offsetHeight > 0;
    }, contentId);
    if (!visible) await delay(interval);
  }

  if (visible) {
    logger.debug({ panel: logLabel }, 'Panel expanded');
    await takeScreenshot(page, `panel_expanded_${logLabel.replace(/\s+/g, '_')}`);
  } else {
    logger.warn({ panel: logLabel }, 'Panel expand timed out');
  }
}

async function setCheckboxById(
  page: Page,
  checkboxId: string,
  desired: boolean,
  logLabel: string
): Promise<boolean> {
  const result = await page.evaluate(
    (id: string, shouldBeChecked: boolean) => {
      const checkbox = document.getElementById(id) as HTMLInputElement | null;
      if (!checkbox) return 'not-found';
      if (checkbox.checked === shouldBeChecked) return 'already-correct';
      checkbox.click();
      return 'toggled';
    },
    checkboxId,
    desired
  );

  if (result === 'not-found') {
    logger.warn({ checkboxId, label: logLabel }, 'Checkbox not found');
    return false;
  }
  if (result === 'already-correct') {
    logger.debug({ checkboxId, label: logLabel, desired }, 'Checkbox already in desired state');
    await takeScreenshot(page, `checkbox_${checkboxId}_already`);
    return true;
  }
  logger.debug({ checkboxId, label: logLabel, desired }, 'Checkbox toggled');
  await takeScreenshot(page, `checkbox_${checkboxId}_toggled`);
  return true;
}

interface PageCategory {
  name: string;
  count: number;
}

async function detectMissingCategories(page: Page): Promise<void> {
  try {
    const pageCategories: PageCategory[] = await page.evaluate(() => {
      const results: { name: string; count: number }[] = [];
      const seen = new Set<string>();
      const categoryPattern = /^(.+?)\s*\((\d+)\)$/;
      const links = Array.from(document.querySelectorAll('a'));

      for (const link of links) {
        const text = link.textContent?.trim();
        if (!text) continue;
        const match = text.match(categoryPattern);
        if (match) {
          const name = match[1].trim();
          const count = parseInt(match[2], 10);
          const key = name.toLowerCase();
          if (name.length < 2 || name === '?') continue;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({ name, count });
          }
        }
      }
      return results;
    });

    logger.info({ count: pageCategories.length }, 'Deal categories found on page');

    const knownCategoryNames = Object.values(CATEGORY_NAMES).map(n => n.toLowerCase().trim());
    const missingCategories = pageCategories.filter(
      cat => !knownCategoryNames.includes(cat.name.toLowerCase().trim())
    );

    if (missingCategories.length === 0) {
      logger.info('All page categories already mapped');
      return;
    }

    logger.warn({ missingCategories }, 'Unmapped categories detected');

    const sent = await sendMissingCategoriesEmail(missingCategories);
    if (sent) {
      logger.info({ count: missingCategories.length }, 'Missing categories email sent');
    } else {
      logger.warn('Missing categories email not sent (disabled or transport error)');
    }
  } catch (error) {
    logger.error({ err: (error as Error).message }, 'Error detecting missing categories');
  }
}

interface RawProductLink {
  asin: string;
  href: string;
  discount: number | undefined;
  avgPrice: number | undefined;
  currentPrice: number | undefined;
}

interface ReviewData {
  rating: number | undefined;
  reviewCount: number | undefined;
}

async function scrapeAllCategories(
  page: Page,
  browser: Browser
): Promise<{ products: KeepaProduct[]; activePage: Page; activeBrowser: Browser }> {
  logger.info('Navigating through selected categories');

  const products: KeepaProduct[] = [];

  // Mutable references — may be replaced by a recovered browser/page
  let activePage = page;
  let activeBrowser = browser;

  // Create a dedicated page for product detail extraction.
  // This avoids the fragile click+goBack pattern on the main deals page,
  // which crashes the browser session after heavy DOM manipulation.
  let detailPage: Page | undefined;
  let detailPageInitialized = false;
  let mainPageClosed = false;

  // Track unexpected main-page close for diagnostics
  const attachCloseListener = (p: Page) => {
    p.on('close', () => {
      logger.error('Main deals page was closed unexpectedly');
      mainPageClosed = true;
    });
  };
  attachCloseListener(activePage);

  try {
    detailPage = await activeBrowser.newPage();
    await detailPage.setViewport({ width: 1280, height: 800 });
    await detailPage.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    logger.info('Detail page created for product extraction');
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'Could not create detail page — reviews will be skipped'
    );
  }

  for (const categoryId of config.keepa.categories) {
    const categoryName = CATEGORY_NAMES[categoryId];
    if (!categoryName) {
      logger.warn({ categoryId }, 'Category ID not found in CATEGORY_NAMES');
      continue;
    }

    // Recover if the main deals page session died
    if (mainPageClosed || !(await isPageAlive(activePage))) {
      logger.error('Main page session died — attempting recovery');
      try {
        // Close old browser (process may already be dead — ignore errors)
        await closeBrowserSafely(activeBrowser);
        // Close old detail page reference
        detailPage = undefined;
        detailPageInitialized = false;

        const recovered = await recoverDealsPage();
        activeBrowser = recovered.browser;
        activePage = recovered.page;
        mainPageClosed = false;
        attachCloseListener(activePage);

        // Re-create detail page on the new browser
        try {
          detailPage = await activeBrowser.newPage();
          await detailPage.setViewport({ width: 1280, height: 800 });
          await detailPage.setUserAgent(
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          );
          logger.info('Detail page re-created after recovery');
        } catch (err) {
          logger.warn(
            { err: (err as Error).message },
            'Could not create detail page after recovery'
          );
        }
      } catch (err) {
        logger.error(
          { err: (err as Error).message },
          'Recovery failed — aborting category iteration'
        );
        break;
      }
    }

    logger.info({ category: categoryName, categoryId }, 'Processing category');

    try {
      // Capture the first ASIN currently visible BEFORE the category click,
      // so we can detect when the SPA actually swaps content after the click.
      const previousFirstAsin = await activePage.evaluate(() => {
        const firstContainer = document.getElementById('p0');
        if (!firstContainer) return '';
        const link = firstContainer.querySelector(':scope > a[href*="#!product/"]');
        if (!link) return '';
        const href = link.getAttribute('href') ?? '';
        const m = href.match(/#!product\/\d+-([A-Z0-9]{10})/);
        return m ? m[1] : '';
      });

      const clicked = await activePage.evaluate((targetCategory: string) => {
        const links = Array.from(document.querySelectorAll('a'));
        const categoryLink = links.find(link => {
          const text = link.textContent?.trim() ?? '';
          return text === targetCategory || text.includes(targetCategory);
        });
        if (categoryLink) {
          (categoryLink as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
          (categoryLink as HTMLElement).click();
          return true;
        }
        return false;
      }, categoryName);

      if (!clicked) {
        logger.warn({ category: categoryName }, 'Category link not found');
        continue;
      }

      logger.debug({ category: categoryName }, 'Category link clicked');
      await takeScreenshot(activePage, `pass1_cat_${categoryId}_clicked`);
      logger.debug({ category: categoryName }, 'Waiting for products to load');

      let productsReady = false;
      const maxWait = 30000;
      const checkInt = 2000;
      const start = Date.now();

      while (!productsReady && Date.now() - start < maxWait) {
        productsReady = await activePage.evaluate((prevAsin: string) => {
          const productPage = document.querySelector('#productPage0');
          const loadingIcon = document.querySelector('#loadingIcon');
          const isLoading = loadingIcon && (loadingIcon as HTMLElement).style.display !== 'none';
          if (isLoading) return false;
          if (!productPage || productPage.innerHTML.trim().length <= 50) return false;

          // If we had a previous ASIN, wait until the page content actually changes
          if (prevAsin) {
            const firstContainer = document.getElementById('p0');
            if (firstContainer) {
              const link = firstContainer.querySelector(':scope > a[href*="#!product/"]');
              if (link) {
                const href = link.getAttribute('href') ?? '';
                const m = href.match(/#!product\/\d+-([A-Z0-9]{10})/);
                const currentFirst = m ? m[1] : '';
                // Content hasn't changed yet — keep waiting
                if (currentFirst === prevAsin) return false;
              }
            }
          }

          return true;
        }, previousFirstAsin);

        if (!productsReady) {
          await delay(checkInt);
        }
      }

      if (!productsReady) {
        logger.warn({ category: categoryName }, 'Timeout waiting for products');
        await takeScreenshot(activePage, `pass1_cat_${categoryId}_timeout`);
        continue;
      }

      logger.debug({ category: categoryName }, 'Products loaded');
      await takeScreenshot(activePage, `pass1_cat_${categoryId}_loaded`);

      const productLinks = await activePage.evaluate(
        (
          maxProducts: number
        ): {
          asin: string;
          href: string;
          discount: number | null;
          avgPrice: number | null;
          currentPrice: number | null;
        }[] => {
          const links: {
            asin: string;
            href: string;
            discount: number | null;
            avgPrice: number | null;
            currentPrice: number | null;
          }[] = [];
          const seen = new Set<string>();

          let containerIndex = 0;
          let consecutiveMisses = 0;
          const maxConsecutiveMisses = 5;

          while (links.length < maxProducts && consecutiveMisses < maxConsecutiveMisses) {
            const containerId = `p${containerIndex}`;
            const container = document.getElementById(containerId);

            if (!container) {
              consecutiveMisses++;
              containerIndex++;
              continue;
            }

            consecutiveMisses = 0;

            const link = container.querySelector(':scope > a[href*="#!product/"]');
            if (!link) {
              containerIndex++;
              continue;
            }

            const href = link.getAttribute('href');
            if (!href) {
              containerIndex++;
              continue;
            }

            const match = href.match(/#!product\/\d+-([A-Z0-9]{10})/);
            if (!match || !match[1]) {
              containerIndex++;
              continue;
            }

            if (seen.has(match[1])) {
              containerIndex++;
              continue;
            }

            const asin = match[1];
            seen.add(asin);

            let discount: number | null = null;
            const discountSpan = container.querySelector(
              'span.productSmallPercent-24, span.productSmallPercent-16'
            );
            if (discountSpan) {
              const discountText = discountSpan.textContent?.trim() ?? '';
              const discountMatch = discountText.match(/(-?\d+)/);
              if (discountMatch) discount = parseInt(discountMatch[1]);
            }

            let avgPrice: number | null = null;
            let currentPrice: number | null = null;
            const avgPriceSpan = container.querySelector('span.productPriceTableTdSmallS');
            if (avgPriceSpan) {
              const avgText = avgPriceSpan.textContent?.trim() ?? '';
              const avgMatch = avgText.match(/(\d+[.,]\d+)/);
              if (avgMatch) avgPrice = parseFloat(avgMatch[1].replace(',', '.'));
            }

            const currPriceSpan = container.querySelector('span.productPriceTableTdLargeS');
            if (currPriceSpan) {
              const currText = currPriceSpan.textContent?.trim() ?? '';
              const currMatch = currText.match(/(\d+[.,]\d+)/);
              if (currMatch) currentPrice = parseFloat(currMatch[1].replace(',', '.'));
            }

            links.push({ asin, href, discount, avgPrice, currentPrice });
            containerIndex++;
          }

          return links;
        },
        500
      );

      const normalizedLinks: RawProductLink[] = productLinks.map(l => ({
        asin: l.asin,
        href: l.href,
        discount: l.discount ?? undefined,
        avgPrice: l.avgPrice ?? undefined,
        currentPrice: l.currentPrice ?? undefined,
      }));

      const targetCount = config.keepa.maxProductsPerCategory;
      logger.info(
        { found: normalizedLinks.length, target: targetCount, category: categoryName },
        'Products found on page'
      );

      const categoryProducts: KeepaProduct[] = [];
      let skippedUnchanged = 0;

      for (let i = 0; i < normalizedLinks.length && categoryProducts.length < targetCount; i++) {
        const { asin, discount, avgPrice, currentPrice } = normalizedLinks[i];

        try {
          const dupCheck = await checkDealDuplicate(asin, {
            avgPrice,
            currentPrice,
            discount,
          });

          if (dupCheck.status === 'unchanged') {
            skippedUnchanged++;
            logger.debug(
              { asin, index: i + 1, total: normalizedLinks.length },
              'Skipping unchanged product'
            );
            continue;
          }

          logger.debug(
            { asin, status: dupCheck.status, index: i + 1, total: normalizedLinks.length },
            'Processing product'
          );

          // Extract review data using the dedicated detail page (isolated tab).
          // This avoids click+goBack on the main deals page which causes session crashes.
          let reviewData: ReviewData = { rating: undefined, reviewCount: undefined };

          if (detailPage) {
            try {
              // Wrap the entire detail page extraction in a local timeout
              // to avoid 3-minute protocol timeouts blocking the whole scrape.
              const DETAIL_TIMEOUT_MS = 20_000;
              reviewData = await Promise.race([
                (async () => {
                  if (!detailPageInitialized) {
                    // First navigation: full page load (including Cloudflare)
                    await detailPage!.goto(`https://keepa.com/#!product/8-${asin}`, {
                      waitUntil: 'networkidle2',
                      timeout: 30000,
                    });
                    detailPageInitialized = true;
                  } else {
                    // Subsequent navigations: SPA hash change (fast, no reload)
                    await detailPage!.evaluate((hash: string) => {
                      window.location.hash = hash;
                    }, `!product/8-${asin}`);
                  }

                  await delay(1500);
                  await detailPage!
                    .waitForSelector('#productInfoBox', { timeout: 10000 })
                    .catch(() => undefined);
                  await takeScreenshot(detailPage!, `product_${asin}_detail`);

                  return await detailPage!.evaluate(
                    (): { rating: number | undefined; reviewCount: number | undefined } => {
                      const data: { rating: number | undefined; reviewCount: number | undefined } =
                        {
                          rating: undefined,
                          reviewCount: undefined,
                        };

                      try {
                        const productInfoBox = document.querySelector('#productInfoBox');
                        if (productInfoBox) {
                          const firstDiv = productInfoBox.querySelector('div');
                          if (firstDiv) {
                            const fullText = firstDiv.textContent?.trim() ?? '';

                            let ratingMatch = fullText.match(
                              /(\d+[.,]\d+)\s*(?:su\s*\d+\s*)?(stelle|stars?)/i
                            );
                            if (!ratingMatch) {
                              ratingMatch = fullText.match(/(\d+[.,]\d+)(?!\s*(?:cm|mm|kg|x|×))/);
                            }

                            if (ratingMatch) {
                              const parsedRating = parseFloat(ratingMatch[1].replace(',', '.'));
                              if (parsedRating >= 0 && parsedRating <= 5) {
                                data.rating = parsedRating;
                              }
                            }

                            const reviewPatterns = [
                              /\((\d[\d.,]*)\s*(?:recensioni|valutazioni|reviews?|ratings?|Bewertungen)/i,
                              /(?:stelle|stars?)\s*\((\d[\d.,]*)\)/i,
                            ];

                            for (const pattern of reviewPatterns) {
                              const countMatch = fullText.match(pattern);
                              if (countMatch) {
                                const raw = (countMatch[1] ?? countMatch[2] ?? '').replace(
                                  /[.,]/g,
                                  ''
                                );
                                const parsed = parseInt(raw, 10);
                                if (!isNaN(parsed) && parsed > 0) {
                                  data.reviewCount = parsed;
                                  break;
                                }
                              }
                            }
                          }
                        }
                      } catch {
                        // swallow — best-effort extraction
                      }

                      return data;
                    }
                  );
                })(),
                new Promise<ReviewData>((_, reject) =>
                  setTimeout(
                    () => reject(new Error('Detail extraction timeout')),
                    DETAIL_TIMEOUT_MS
                  )
                ),
              ]);
            } catch (err) {
              logger.warn({ asin, err: (err as Error).message }, 'Detail page extraction failed');
              // If the page is stuck, try to recover by navigating away
              try {
                await detailPage.goto('about:blank', { timeout: 5000 }).catch(() => undefined);
                detailPageInitialized = false;
              } catch {
                // ignore recovery failure
              }
            }
          }

          const productData: KeepaProduct = {
            asin,
            category: categoryName,
            discount,
            avgPrice,
            currentPrice,
            rating: reviewData.rating,
            reviewCount: reviewData.reviewCount,
            isLowest: false,
          };

          categoryProducts.push(productData);

          logger.info(
            {
              asin,
              currentPrice: productData.currentPrice,
              avgPrice: productData.avgPrice,
              discount: productData.discount,
              rating: productData.rating,
              reviewCount: productData.reviewCount,
            },
            'Product scraped'
          );
        } catch (error) {
          logger.warn({ asin, err: (error as Error).message }, 'Error processing product');
        }
      }

      logger.info(
        {
          newOrUpdated: categoryProducts.length,
          skippedUnchanged,
          totalOnPage: normalizedLinks.length,
          category: categoryName,
        },
        'Category extraction complete'
      );

      for (const product of categoryProducts) {
        if (!products.find(p => p.asin === product.asin)) {
          products.push(product);
        }
      }

      // Navigate detail page away from keepa.com between categories to avoid
      // cross-page SPA interference that can crash the main deals page.
      if (detailPage) {
        try {
          await detailPage.goto('about:blank', { timeout: 5000 }).catch(() => undefined);
          detailPageInitialized = false;
          logger.debug('Detail page reset to about:blank between categories');
        } catch {
          // ignore — detail page may already be dead
        }
      }

      await delay(config.keepa.scrapingDelayMs);
    } catch (error) {
      logger.error(
        { category: categoryName, err: (error as Error).message },
        'Category processing failed'
      );
      continue;
    }
  }

  // Clean up the detail page
  if (detailPage) {
    try {
      await detailPage.close();
      logger.debug('Detail page closed');
    } catch {
      // already closed
    }
  }

  logger.info({ totalProducts: products.length }, 'All categories scraped');
  return { products, activePage, activeBrowser };
}

/**
 * Lightweight pass 2: navigate each category with "Minimo" filter active
 * and collect only the visible ASINs — no product detail clicks needed.
 */
async function collectLowestAsins(page: Page): Promise<Set<string>> {
  logger.info('Pass 2: collecting lowest-ever ASINs');

  const allLowestAsins = new Set<string>();

  for (const categoryId of config.keepa.categories) {
    const categoryName = CATEGORY_NAMES[categoryId];
    if (!categoryName) {
      logger.warn({ categoryId }, 'Pass 2: category ID not found');
      continue;
    }

    logger.info({ category: categoryName, categoryId }, 'Pass 2: scanning category');

    // Abort early if the page session died
    if (!(await isPageAlive(page))) {
      logger.error('Main page session died — aborting Pass 2 category iteration');
      break;
    }

    try {
      // Capture first visible ASIN BEFORE category click to detect stale DOM
      const previousFirstAsin = await page.evaluate(() => {
        const container = document.getElementById('p0');
        if (!container) return '';
        const link = container.querySelector(':scope > a[href*="#!product/"]');
        if (!link) return '';
        const href = link.getAttribute('href') ?? '';
        const m = href.match(/#!product\/\d+-([A-Z0-9]{10})/);
        return m ? m[1] : '';
      });

      const clicked = await page.evaluate((targetCategory: string) => {
        const links = Array.from(document.querySelectorAll('a'));
        const categoryLink = links.find(link => {
          const text = link.textContent?.trim() ?? '';
          return text === targetCategory || text.includes(targetCategory);
        });
        if (categoryLink) {
          (categoryLink as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
          (categoryLink as HTMLElement).click();
          return true;
        }
        return false;
      }, categoryName);

      if (!clicked) {
        logger.warn({ category: categoryName }, 'Pass 2: category link not found');
        continue;
      }

      await takeScreenshot(page, `pass2_cat_${categoryId}_clicked`);

      let ready = false;
      const maxWait = 30000;
      const checkInt = 2000;
      const start = Date.now();

      while (!ready && Date.now() - start < maxWait) {
        ready = await page.evaluate((prevAsin: string) => {
          const productPage = document.querySelector('#productPage0');
          const loadingIcon = document.querySelector('#loadingIcon');
          const isLoading = loadingIcon && (loadingIcon as HTMLElement).style.display !== 'none';
          if (isLoading) return false;
          if (!productPage || productPage.innerHTML.trim().length <= 50) return false;
          if (prevAsin) {
            const container = document.getElementById('p0');
            if (container) {
              const link = container.querySelector(':scope > a[href*="#!product/"]');
              if (link) {
                const href = link.getAttribute('href') ?? '';
                const m = href.match(/#!product\/\d+-([A-Z0-9]{10})/);
                if (m && m[1] === prevAsin) return false;
              }
            }
          }
          return true;
        }, previousFirstAsin);
        if (!ready) await delay(checkInt);
      }

      if (!ready) {
        logger.warn({ category: categoryName }, 'Pass 2: timeout waiting for category');
        await takeScreenshot(page, `pass2_cat_${categoryId}_timeout`);
        continue;
      }

      // Extract just ASINs from visible product containers — no clicking needed
      const asins: string[] = await page.evaluate(() => {
        const result: string[] = [];
        const seen = new Set<string>();
        let idx = 0;
        let misses = 0;

        while (misses < 5) {
          const container = document.getElementById(`p${idx}`);
          if (!container) {
            misses++;
            idx++;
            continue;
          }
          misses = 0;
          const link = container.querySelector(':scope > a[href*="#!product/"]');
          if (link) {
            const href = link.getAttribute('href') ?? '';
            const m = href.match(/#!product\/\d+-([A-Z0-9]{10})/);
            if (m && m[1] && !seen.has(m[1])) {
              seen.add(m[1]);
              result.push(m[1]);
            }
          }
          idx++;
        }
        return result;
      });

      for (const asin of asins) allLowestAsins.add(asin);
      logger.info(
        { category: categoryName, asinCount: asins.length },
        'Pass 2: lowest ASINs collected'
      );
      await takeScreenshot(page, `pass2_cat_${categoryId}_asins_collected`);

      await delay(config.keepa.scrapingDelayMs);
    } catch (error) {
      logger.error(
        { category: categoryName, err: (error as Error).message },
        'Pass 2: category processing failed'
      );
      continue;
    }
  }

  logger.info({ totalLowestAsins: allLowestAsins.size }, 'Pass 2 complete');
  return allLowestAsins;
}

/**
 * Pure function: flag pass 1 products whose ASIN appeared in the "Minimo" pass.
 * Exported for unit testing.
 */
export function mergeLowestFlags(
  products: KeepaProduct[],
  lowestAsins: Set<string>
): KeepaProduct[] {
  return products.map(p => ({
    ...p,
    isLowest: lowestAsins.has(p.asin),
  }));
}

export async function getLatestScreenshots(count = 4): Promise<string[]> {
  try {
    const files = await fs.readdir(SCREENSHOT_DIR);
    const pngFiles = files.filter(f => f.endsWith('.png')).sort();
    return pngFiles.slice(-count).map(f => path.join(SCREENSHOT_DIR, f));
  } catch {
    return [];
  }
}

export async function scrapeKeepaDeals(): Promise<ScrapeResult> {
  logger.info('Starting Keepa scraper');

  let browser: Browser | undefined;
  let page: Page | undefined;

  try {
    const { browser: realBrowser, page: realPage } = await launchBrowserWithRetry();

    browser = realBrowser;
    page = realPage;
    logger.info('Browser launched with puppeteer-real-browser');
    screenshotCounter = 0;

    // Clear screenshot directory for a fresh run
    try {
      await fs.rm(SCREENSHOT_DIR, { recursive: true, force: true });
      await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
      logger.debug('Screenshot directory cleared');
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Could not clear screenshot directory');
    }

    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    logger.info('Navigating to Keepa homepage');
    try {
      await withRetry(
        () => page!.goto('https://keepa.com/', { waitUntil: 'networkidle2', timeout: 30000 }),
        { retries: 3, baseDelay: 3000, label: 'Keepa homepage navigation' }
      );
      logger.info('Keepa homepage loaded');
      await takeScreenshot(page, 'homepage_loaded');
    } catch (error) {
      logger.warn({ err: (error as Error).message }, 'Navigation error');
    }

    await delay(2000);

    logger.info('\n🇮🇹 Selecting Amazon.it domain from navbar...');
    try {
      const domainSelected = await page.evaluate(() => {
        const domainSelector = document.querySelector('.languageMenuImg[rel="domain"]');
        if (domainSelector) {
          (domainSelector as HTMLElement).click();
          return true;
        }
        return false;
      });

      if (domainSelected) {
        logger.debug('Domain selector clicked');
        await delay(1000);

        const italySelected = await page.evaluate(() => {
          const options = document.querySelectorAll('[setting="8"]');
          for (const option of options) {
            if (
              option.textContent?.includes('AMAZON.IT') ||
              option.getAttribute('rel') === 'domain'
            ) {
              (option as HTMLElement).click();
              return true;
            }
          }
          const fallback = document.querySelector('[setting="8"]');
          if (fallback) {
            (fallback as HTMLElement).click();
            return true;
          }
          return false;
        });

        if (italySelected) {
          logger.info('Amazon.it selected');
          await delay(2000);
          await takeScreenshot(page, 'domain_it_selected');
        } else {
          logger.warn('Italy domain option not found, proceeding');
        }
      } else {
        logger.warn('Domain selector not found, proceeding');
      }
    } catch (error) {
      logger.warn({ err: (error as Error).message }, 'Error selecting domain');
    }

    logger.info('Navigating to Deals page');
    try {
      await withRetry(
        () =>
          page!.goto('https://keepa.com/#!deals', { waitUntil: 'networkidle2', timeout: 60000 }),
        { retries: 3, baseDelay: 5000, label: 'Deals page navigation' }
      );
      await page.mouse.move(423, 354);
      await page.mouse.move(320, 530);
      logger.info('Deals page loaded');
      await takeScreenshot(page, 'deals_page_loaded');
    } catch (error) {
      logger.warn({ err: (error as Error).message }, 'Deals page navigation timeout');
    }

    await delay(5000);

    logger.info('\n🇮🇹 Verifying Amazon.it domain...');
    const domainCheck = await page.evaluate(() => {
      const domainElement = document.querySelector('.languageMenuImg[rel="domain"]');
      const domainText = domainElement ? (domainElement.textContent ?? '') : '';
      const isVisible = domainElement
        ? (domainElement as HTMLElement).offsetWidth > 0 &&
          (domainElement as HTMLElement).offsetHeight > 0
        : false;
      return { text: domainText, visible: isVisible, exists: !!domainElement };
    });

    logger.info(`   Domain element exists: ${domainCheck.exists ? 'Yes' : 'No'}`);
    logger.info(`   Domain element visible: ${domainCheck.visible ? 'Yes' : 'No'}`);
    logger.info(`   Domain text: "${domainCheck.text}"`);

    if (!domainCheck.text.includes('.it')) {
      logger.warn({ domain: domainCheck.text }, 'Domain NOT set to .it — attempting fix');
      await page.click('.languageMenuImg[rel="domain"]').catch(() => {});
      await delay(1500);
      await page.evaluate(() => {
        const italyOption = document.querySelector('span[rel="domain"][setting="8"]');
        if (italyOption) (italyOption as HTMLElement).click();
      });
      await delay(5000);

      const newDomain = await page.evaluate(() => {
        const el = document.querySelector('.languageMenuImg[rel="domain"]');
        return el ? (el.textContent ?? '') : '';
      });
      logger.info({ domain: newDomain }, 'Domain after fix');
    } else {
      logger.info('Domain correctly set to Amazon.it');
    }
    await takeScreenshot(page, 'domain_verification');

    logger.info('\n🇮🇹 Selecting Italian language for Keepa...');
    try {
      const italianSelected = await page.evaluate(() => {
        const italianFlag = document.querySelector('img[rel="language"][setting="8"]');
        if (italianFlag) {
          (italianFlag as HTMLElement).click();
          return true;
        }
        return false;
      });

      if (italianSelected) {
        logger.info('Italian language selected');
        await delay(4000);
      } else {
        const italianSelectedAlt = await page.evaluate(() => {
          const langIt = document.getElementById('lang_it');
          if (langIt) {
            langIt.click();
            return true;
          }
          return false;
        });

        if (italianSelectedAlt) {
          logger.info('Italian language selected (alternative method)');
          await delay(4000);
        } else {
          logger.warn('Italian language option not found, proceeding');
        }
      }
    } catch (error) {
      logger.warn({ err: (error as Error).message }, 'Error selecting language');
    }

    // Wait for the deals UI to be fully ready (handles Cloudflare transparently)
    logger.info('Waiting for Keepa deals UI to be ready');
    try {
      await waitForDealsUI(page, 'main-flow');
    } catch (error) {
      logger.error(
        { err: (error as Error).message },
        'Deals UI never became ready — aborting scrape'
      );
      await closeBrowserSafely(browser);
      return { products: [], lowestAsins: new Set<string>() };
    }

    logger.info('Selecting "Amazon" price type filter');
    try {
      const filterClicked = await page.evaluate(() => {
        const container = document.getElementById('dealPriceTypesFilter');
        if (!container) return false;
        const amazonOption = container.querySelector('div[data-type="0"]') as HTMLElement | null;
        if (amazonOption) {
          amazonOption.scrollIntoView({ behavior: 'smooth', block: 'center' });
          amazonOption.click();
          return true;
        }
        return false;
      });

      if (filterClicked) {
        logger.debug('Amazon price filter selected');
        await delay(2000);
        await takeScreenshot(page, 'amazon_price_filter_selected');
      } else {
        logger.warn('Amazon price filter not found');
      }
    } catch (error) {
      logger.warn({ err: (error as Error).message }, 'Error selecting price type filter');
    }

    logger.info('Setting time interval to 3 months');
    try {
      const dateRangeSet = await page.evaluate(() => {
        // Strategy 1: find dealDateRange container with setting attribute
        const container = document.getElementById('dealDateRange');
        if (container) {
          const option = container.querySelector('[setting="3"]') as HTMLElement | null;
          if (option) {
            option.click();
            return 'setting';
          }
          const children = container.querySelectorAll(':scope > *');
          if (children.length > 3) {
            (children[3] as HTMLElement).click();
            return 'index';
          }
        }
        // Strategy 2: text fallback
        const elements = document.querySelectorAll('div, span, button');
        for (const el of elements) {
          const text = el.textContent?.trim() ?? '';
          if (/^3\s*mesi$/i.test(text) || /^90\s*days?$/i.test(text)) {
            (el as HTMLElement).click();
            return 'text';
          }
        }
        return null;
      });

      if (dateRangeSet) {
        logger.debug({ method: dateRangeSet }, 'Time interval set to 3 months');
        await delay(1000);
      } else {
        logger.warn('Could not set date range to 3 months');
      }
    } catch (error) {
      logger.warn({ err: (error as Error).message }, 'Error setting date range');
    }

    logger.info('Configuring range filters');
    try {
      await ensurePanelExpanded(
        page,
        'panelRangeSelectionDisableCross',
        'panelRangeSelection',
        'Seleziona Range'
      );
      await delay(500);

      await setCheckboxById(
        page,
        'checkboxDeltaLastRange',
        true,
        '"Solo ultima variazione di prezzo"'
      );
      await delay(500);
    } catch (error) {
      logger.warn({ err: (error as Error).message }, 'Error in range config');
    }

    logger.info('Expanding Applica filtri panel');
    try {
      await ensurePanelExpanded(
        page,
        'panelFilterSelectionDisableCross',
        'dealCheckBoxes',
        'Applica filtri'
      );
      await delay(500);
    } catch (error) {
      logger.warn({ err: (error as Error).message }, 'Error expanding Applica filtri panel');
    }

    logger.info('Configuring deal filters (Pass 1: without Minimo)');
    try {
      await setCheckboxById(page, 'checkboxLowestEver', false, '"Minimo" unchecked for Pass 1');
      await delay(300);
      await setCheckboxById(page, 'checkboxHasReviews', true, '"Deve avere delle recensioni"');
      await delay(300);
      await setCheckboxById(page, 'checkboxFilterErotic', true, '"Filtra oggetti per adulti"');
      await delay(300);
      await setCheckboxById(
        page,
        'checkboxSingleVariation',
        true,
        '"Mostrare solo una variante per prodotto"'
      );
      await delay(500);
    } catch (error) {
      logger.warn({ err: (error as Error).message }, 'Error applying filters');
    }

    logger.info('Clicking Find Deals button');

    // ── Network + console diagnostics: capture everything around the click ──
    interface CapturedRequest {
      url: string;
      method: string;
      resourceType: string;
    }
    interface CapturedResponse {
      url: string;
      status: number;
      statusText: string;
      bodyLen: number;
      bodySnippet: string;
    }
    interface FailedRequest {
      url: string;
      method: string;
      errorText: string;
    }
    interface ConsoleEntry {
      type: string;
      text: string;
    }

    const capturedRequests: CapturedRequest[] = [];
    const capturedResponses: CapturedResponse[] = [];
    const failedRequests: FailedRequest[] = [];
    const consoleEntries: ConsoleEntry[] = [];
    let checkHumanDetected = false;
    let turnstileMonitorTimer: ReturnType<typeof setInterval> | undefined;

    const requestHandler = (request: import('rebrowser-puppeteer-core').HTTPRequest) => {
      const url = request.url();
      if (
        url.includes('keepa.com') &&
        (url.includes('/api/') || url.includes('deal') || url.includes('query'))
      ) {
        capturedRequests.push({
          url: url.slice(0, 200),
          method: request.method(),
          resourceType: request.resourceType(),
        });
        logger.info(
          { url: url.slice(0, 200), method: request.method() },
          'Keepa API request intercepted'
        );
      }
    };

    const responseHandler = async (response: import('rebrowser-puppeteer-core').HTTPResponse) => {
      const url = response.url();
      if (
        url.includes('keepa.com') &&
        (url.includes('/api/') || url.includes('deal') || url.includes('query'))
      ) {
        try {
          const body = await response.text().catch(() => '(unreadable)');
          capturedResponses.push({
            url: url.slice(0, 200),
            status: response.status(),
            statusText: response.statusText(),
            bodyLen: body.length,
            bodySnippet: body.slice(0, 300),
          });
        } catch {
          /* response already consumed */
        }
      }
    };

    const requestFailedHandler = (request: import('rebrowser-puppeteer-core').HTTPRequest) => {
      const url = request.url();
      if (url.includes('keepa.com')) {
        const failure = request.failure();
        failedRequests.push({
          url: url.slice(0, 200),
          method: request.method(),
          errorText: failure?.errorText ?? 'unknown',
        });
        logger.warn(
          { url: url.slice(0, 200), errorText: failure?.errorText },
          'Keepa request FAILED at network level'
        );
      }
    };

    const consoleHandler = (msg: import('rebrowser-puppeteer-core').ConsoleMessage) => {
      const type = msg.type();
      if (type === 'error' || type === 'warn') {
        consoleEntries.push({ type, text: msg.text().slice(0, 300) });
      }
    };

    page.on('request', requestHandler);
    page.on('response', responseHandler);
    page.on('requestfailed', requestFailedHandler);
    page.on('console', consoleHandler);

    // ── CDP WebSocket frame monitoring ──
    const cdpSession = await page.createCDPSession();
    await cdpSession.send('Network.enable');

    interface WsFrame {
      direction: 'sent' | 'received';
      ts: number;
      len: number;
      snippet: string;
    }
    const wsFrames: WsFrame[] = [];

    cdpSession.on('Network.webSocketFrameSent', (params: { response: { payloadData: string } }) => {
      const data = params.response.payloadData;
      wsFrames.push({ direction: 'sent', ts: Date.now(), len: data.length, snippet: data.slice(0, 200) });
      logger.info({ len: data.length, snippet: data.slice(0, 200) }, 'WS frame SENT');
    });

    cdpSession.on('Network.webSocketFrameReceived', (params: { response: { payloadData: string } }) => {
      const data = params.response.payloadData;
      wsFrames.push({ direction: 'received', ts: Date.now(), len: data.length, snippet: data.slice(0, 200) });
      logger.info({ len: data.length, snippet: data.slice(0, 200) }, 'WS frame RECEIVED');

      // Detect checkHuman challenge and start Turnstile monitoring
      try {
        const decoded = Buffer.from(data, 'base64').toString('utf-8');
        if (decoded.includes('"checkHuman"') && !checkHumanDetected) {
          checkHumanDetected = true;
          logger.warn({ decoded: decoded.slice(0, 300) }, 'Keepa checkHuman challenge detected via WebSocket — starting Turnstile monitor');

          const monitorStart = Date.now();

          // Initial snapshot
          (async () => {
            try {
              if (!page) return;
              await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
              await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'checkHuman_t0.png') });
            } catch { /* page closed */ }
          })();

          // Monitor Turnstile state every 3 seconds for up to 60 seconds
          let monitorCount = 0;
          turnstileMonitorTimer = setInterval(async () => {
            monitorCount++;
            if (monitorCount > 20 || !page) {
              if (turnstileMonitorTimer) clearInterval(turnstileMonitorTimer);
              return;
            }
            try {
              const elapsed = Math.round((Date.now() - monitorStart) / 1000);
              const state = await page.evaluate(() => {
                const w = window as unknown as Record<string, unknown>;
                const ts = w.turnstile as { ready?: unknown; render?: unknown; } | undefined;

                // Popup created by isUserHuman()
                const cfDiv = document.getElementById('cfTurnstile');
                const tsWidget = document.getElementById('tsWidget');
                const tsSpinner = document.getElementById('tsSpinner');

                // Turnstile iframe (created by turnstile.render())
                const tsIframes = [...document.querySelectorAll('iframe[src*="challenges.cloudflare.com"]')];
                const allIframes = [...document.querySelectorAll('iframe')];

                // Turnstile response input (set when challenge is solved)
                const responseInput = document.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement | undefined;

                // Divs 290-310px wide (what puppeteer-real-browser's solver looks for)
                const candidateDivs = [...document.querySelectorAll('div')].filter(d => {
                  const r = d.getBoundingClientRect();
                  return r.width >= 290 && r.width <= 310 && d.children.length === 0;
                });

                return {
                  turnstileGlobal: !!ts,
                  turnstileReady: typeof ts?.ready === 'function',
                  turnstileRender: typeof ts?.render === 'function',
                  popupExists: !!cfDiv,
                  popupDisplay: cfDiv ? getComputedStyle(cfDiv).display : 'N/A',
                  tsWidgetExists: !!tsWidget,
                  tsWidgetChildCount: tsWidget?.children?.length ?? -1,
                  tsWidgetHTML: tsWidget?.innerHTML?.slice(0, 300) ?? '',
                  spinnerVisible: tsSpinner ? getComputedStyle(tsSpinner).display !== 'none' : false,
                  turnstileIframes: tsIframes.length,
                  turnstileIframeSrcs: tsIframes.map(f => (f as HTMLIFrameElement).src.slice(0, 100)),
                  allIframeCount: allIframes.length,
                  responseToken: responseInput?.value ? responseInput.value.slice(0, 30) + '...' : '',
                  solverCandidateDivs: candidateDivs.length,
                };
              });
              logger.warn({ elapsed, ...state }, 'Turnstile monitor tick');

              // Take screenshot at key intervals (3s, 10s, 30s, 60s)
              if ([1, 3, 10, 20].includes(monitorCount)) {
                await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
                await page.screenshot({ path: path.join(SCREENSHOT_DIR, `turnstile_${elapsed}s.png`) });
              }
            } catch {
              // page closed or eval error — stop monitoring
              if (turnstileMonitorTimer) clearInterval(turnstileMonitorTimer);
            }
          }, 3000);
        }
      } catch { /* not base64 or not JSON — ignore */ }
    });

    // Inject diagnostic wrappers for Keepa's checkHuman handling functions
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;

      // Wrap isUserHuman to detect if/when it's called
      const origIsUserHuman = w.isUserHuman as ((...args: unknown[]) => unknown) | undefined;
      if (typeof origIsUserHuman === 'function') {
        w.isUserHuman = function (...args: unknown[]) {
          console.warn('[DIAG] isUserHuman CALLED with args:', JSON.stringify(args));
          try {
            return origIsUserHuman.apply(this, args);
          } catch (e) {
            console.error('[DIAG] isUserHuman THREW:', e);
            throw e;
          }
        };
        console.warn('[DIAG] isUserHuman wrapper installed');
      } else {
        console.warn('[DIAG] isUserHuman NOT FOUND on window');
      }

      // Wrap showPopup to detect popup creation
      const origShowPopup = w.showPopup as ((...args: unknown[]) => unknown) | undefined;
      if (typeof origShowPopup === 'function') {
        w.showPopup = function (...args: unknown[]) {
          console.warn('[DIAG] showPopup CALLED with title:', args[0]);
          try {
            return origShowPopup.apply(this, args);
          } catch (e) {
            console.error('[DIAG] showPopup THREW:', e);
            throw e;
          }
        };
        console.warn('[DIAG] showPopup wrapper installed');
      } else {
        console.warn('[DIAG] showPopup NOT FOUND on window');
      }

      // Listen for unhandled errors
      window.addEventListener('error', (e) => {
        console.error('[DIAG] Uncaught error:', e.message, 'at', e.filename, ':', e.lineno);
      });

      // Listen for unhandled promise rejections
      window.addEventListener('unhandledrejection', (e) => {
        console.error('[DIAG] Unhandled rejection:', String(e.reason));
      });
    });

    // Upgrade console handler to capture ALL levels (not just error/warn)
    const diagConsoleHandler = (msg: import('rebrowser-puppeteer-core').ConsoleMessage) => {
      const text = msg.text();
      if (text.includes('[DIAG]')) {
        logger.warn({ browserLog: text }, 'Browser diagnostic log');
      }
    };
    page.on('console', diagConsoleHandler);

    await page.evaluate(() => {
      const button = document.querySelector('#submitDealQuery');
      if (button) {
        (button as HTMLElement).click();
      }
    });

    logger.debug('Waiting for products container');

    let productPageReady = false;
    const baseWaitTime = 60000;
    const checkInterval = 2000;
    const startTime = Date.now();

    while (!productPageReady) {
      // Extend timeout to 180s when checkHuman is active (Turnstile needs time to resolve)
      const maxWaitTime = checkHumanDetected ? 180000 : baseWaitTime;
      if (Date.now() - startTime >= maxWaitTime) break;

      const elapsed = Math.round((Date.now() - startTime) / 1000);

      productPageReady = await page.evaluate(() => {
        const productPage = document.querySelector('#productPage0');
        const loadingIcon = document.querySelector('#loadingIcon');
        const loadingVisible = loadingIcon && (loadingIcon as HTMLElement).style.display !== 'none';
        if (productPage) {
          const hasContent = productPage.innerHTML.trim().length > 50;
          return hasContent && !loadingVisible;
        }
        return false;
      });

      // Log progress every 15s at info level
      const now = Date.now();
      if (!productPageReady && now - startTime > 0 && elapsed % 15 === 0 && elapsed > 0) {
        const pollState = await page
          .evaluate(() => {
            const pp = document.querySelector('#productPage0');
            const li = document.querySelector('#loadingIcon');
            return {
              productPageExists: !!pp,
              productPageLen: pp?.innerHTML?.trim()?.length ?? 0,
              loadingDisplay: li ? (li as HTMLElement).style.display : '(not found)',
            };
          })
          .catch(() => ({
            productPageExists: false,
            productPageLen: 0,
            loadingDisplay: 'eval-error',
          }));
        logger.info({ elapsedSec: elapsed, ...pollState }, 'Polling for products');
      }

      if (!productPageReady) {
        await delay(checkInterval);
      }
    }

    // Stop intercepting
    page.off('request', requestHandler);
    page.off('response', responseHandler);
    page.off('requestfailed', requestFailedHandler);
    page.off('console', consoleHandler);
    page.off('console', diagConsoleHandler);

    // Stop Turnstile monitor if still running
    if (turnstileMonitorTimer) clearInterval(turnstileMonitorTimer);

    // Stop CDP WebSocket monitoring
    await cdpSession.detach().catch(() => {});

    // ── Diagnostic summary ──
    logger.info(
      {
        requestsOut: capturedRequests.length,
        responsesBack: capturedResponses.length,
        failedRequests: failedRequests.length,
        consoleErrors: consoleEntries.length,
        wsFramesSent: wsFrames.filter(f => f.direction === 'sent').length,
        wsFramesReceived: wsFrames.filter(f => f.direction === 'received').length,
      },
      'Find Deals network diagnostics summary'
    );
    for (const f of wsFrames) {
      logger.info(f, `WS frame ${f.direction}`);
    }
    for (const r of capturedRequests) {
      logger.info(r, 'Keepa API request sent');
    }
    for (const r of capturedResponses) {
      logger.info(r, 'Keepa API response received');
    }
    for (const r of failedRequests) {
      logger.warn(r, 'Keepa request failed');
    }
    for (const e of consoleEntries) {
      logger.warn(e, 'Browser console error/warning during Find Deals');
    }

    if (productPageReady) {
      logger.info('Products container ready');
      await takeScreenshot(page, 'find_deals_results_ready');
    } else {
      logger.warn('Timeout waiting for products container');
      await takeScreenshot(page, 'find_deals_results_timeout');
    }

    logger.debug('Skipping general page extraction — navigating to categories');

    logger.info('Checking for missing categories');
    await detectMissingCategories(page);

    // ── Pass 1: Normal scraping (Minimo OFF) ───────────────────────────────
    logger.info('Pass 1: normal deal scraping (Minimo OFF)');
    const {
      products: pass1Products,
      activePage,
      activeBrowser,
    } = await scrapeAllCategories(page, browser!);

    // Use the (possibly recovered) browser and page for pass 2
    browser = activeBrowser;
    const dealsPage = activePage;

    // ── Pass 2: Enable "minimo" filter, collect ASINs only ───────────────
    logger.info('Pass 2: collecting lowest-ever ASINs (Minimo ON)');
    let lowestAsins = new Set<string>();
    try {
      // If the page died during pass 1 and could not recover, skip pass 2
      if (!(await isPageAlive(dealsPage))) {
        logger.warn('Deals page not alive — skipping pass 2');
      } else {
        // Ensure the "Applica filtri" panel is still expanded before Pass 2
        await ensurePanelExpanded(
          dealsPage,
          'panelFilterSelectionDisableCross',
          'dealCheckBoxes',
          'Applica filtri'
        );
        await delay(300);

        await setCheckboxById(dealsPage, 'checkboxLowestEver', true, '"Minimo" enabled for Pass 2');
        await delay(500);

        logger.info('Clicking Find Deals for pass 2');
        await dealsPage.evaluate(() => {
          const button = document.querySelector('#submitDealQuery');
          if (button) (button as HTMLElement).click();
        });

        let passReady = false;
        const maxWaitPass2 = 60000;
        const checkIntPass2 = 2000;
        const startPass2 = Date.now();

        while (!passReady && Date.now() - startPass2 < maxWaitPass2) {
          passReady = await dealsPage.evaluate(() => {
            const productPage = document.querySelector('#productPage0');
            const loadingIcon = document.querySelector('#loadingIcon');
            const loadingVisible =
              loadingIcon && (loadingIcon as HTMLElement).style.display !== 'none';
            if (productPage) {
              return productPage.innerHTML.trim().length > 50 && !loadingVisible;
            }
            return false;
          });
          if (!passReady) await delay(checkIntPass2);
        }

        if (passReady) {
          logger.info('Pass 2 results loaded');
          await takeScreenshot(dealsPage, 'pass2_find_deals_ready');
        } else {
          logger.warn('Timeout waiting for pass 2 results');
          await takeScreenshot(dealsPage, 'pass2_find_deals_timeout');
        }

        await delay(2000);

        lowestAsins = await collectLowestAsins(dealsPage);
      }
    } catch (error) {
      logger.warn({ err: (error as Error).message }, 'Error in pass 2');
    }

    // ── Merge: flag pass 1 products that appear in the "Minimo" results ──
    const allProducts = mergeLowestFlags(pass1Products, lowestAsins);

    const upgradedCount = allProducts.filter(p => p.isLowest).length;
    logger.info(
      {
        pass1: pass1Products.length,
        lowestAsinsFound: lowestAsins.size,
        upgradedToLowest: upgradedCount,
        total: allProducts.length,
      },
      'Both passes complete — merged results'
    );

    const keepOpenMs = parseInt(process.env.BROWSER_KEEP_OPEN_MS ?? '3000', 10);
    if (keepOpenMs > 0) {
      logger.debug({ keepOpenMs }, 'Keeping browser open before close');
      await delay(keepOpenMs);
    }

    await closeBrowserSafely(browser);
    return { products: allProducts, lowestAsins };
  } catch (error) {
    const message = (error as Error).message;
    logger.error({ err: message, stack: (error as Error).stack }, 'Keepa scraping failed');
    const screenshots = await getLatestScreenshots(4);
    void sendErrorAlert({
      errorMessage: `Keepa scraping failed: ${message}`,
      errorStack: (error as Error).stack,
      component: 'KeepaService',
      severity: 'critical',
      attachments: screenshots.map(filepath => ({
        filename: path.basename(filepath),
        path: path.resolve(filepath),
      })),
    });

    await closeBrowserSafely(browser);

    throw error;
  }
}
