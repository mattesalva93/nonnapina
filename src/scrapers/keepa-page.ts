/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'rebrowser-puppeteer-core';
import { config } from '../config/index.js';
import { createComponentLogger } from '../utils/logger.js';
import { withTimeout } from './browser.js';

const logger = createComponentLogger('KeepaPage');

const SCREENSHOT_DIR = './output/screenshots';
let screenshotCounter = 0;
const SCREENSHOTS_ENABLED = config.server.nodeEnv !== 'production';

// ─── Screenshot helpers ───────────────────────────────────────────────────────

export async function resetScreenshots(): Promise<void> {
  screenshotCounter = 0;
  try {
    await fs.rm(SCREENSHOT_DIR, { recursive: true, force: true });
    await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
    logger.debug('Screenshot directory cleared');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Could not clear screenshot directory');
  }
}

export async function takeScreenshot(page: Page, label: string): Promise<void> {
  if (!SCREENSHOTS_ENABLED) return;
  try {
    await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
    const idx = String(++screenshotCounter).padStart(3, '0');
    const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    const filepath = path.join(SCREENSHOT_DIR, `${idx}_${safeLabel}.png`);
    await page.screenshot({ path: filepath });
    logger.debug({ filename: path.basename(filepath) }, 'Screenshot saved');
  } catch (err) {
    logger.warn({ label, err: (err as Error).message }, 'Screenshot failed');
  }
}

export async function takeErrorScreenshot(page: Page, label: string): Promise<void> {
  try {
    await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
    const idx = String(++screenshotCounter).padStart(3, '0');
    const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    const filepath = path.join(SCREENSHOT_DIR, `${idx}_ERROR_${safeLabel}.png`);
    await page.screenshot({ path: filepath });
    logger.info({ filename: path.basename(filepath) }, 'Error screenshot saved');
  } catch (err) {
    logger.warn({ label, err: (err as Error).message }, 'Error screenshot failed');
  }
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

// ─── Delay helper ─────────────────────────────────────────────────────────────

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// ─── Evaluated helpers (run in page context with timeout) ─────────────────────

async function evalSafe<T>(page: Page, fn: () => Promise<T>, timeoutMs = 30_000): Promise<T> {
  return withTimeout(fn(), timeoutMs, 'page.evaluate');
}

// ─── Cloudflare / Deals UI readiness ──────────────────────────────────────────

export async function waitForDealsUI(
  page: Page,
  context: string,
  maxWaitMs = 120_000
): Promise<void> {
  const start = Date.now();
  let lastLog = 0;

  while (Date.now() - start < maxWaitMs) {
    const state = await page
      .evaluate(() => {
        const title = document.title ?? '';
        const bodyText = document.body?.innerText ?? '';
        const isCloudflare =
          title.includes('Just a moment') ||
          bodyText.includes('Checking your browser') ||
          bodyText.includes('Cloudflare') ||
          !!document.querySelector('iframe[src*="challenges.cloudflare.com"]') ||
          !!document.querySelector('#turnstile-wrapper') ||
          !!document.querySelector('.cf-browser-verification');
        const hasDealButton = !!document.querySelector('#submitDealQuery');
        return { isCloudflare, hasDealButton, title: title.slice(0, 60) };
      })
      .catch(() => ({ isCloudflare: false, hasDealButton: false, title: 'page-error' }));

    if (state.hasDealButton) {
      logger.info({ context, waitedMs: Date.now() - start }, 'Deals UI is ready');
      return;
    }

    const now = Date.now();
    if (now - lastLog > 15_000) {
      lastLog = now;
      if (state.isCloudflare) {
        logger.warn(
          { context, waitedMs: now - start, title: state.title },
          'Cloudflare challenge detected — waiting'
        );
      } else {
        logger.info(
          { context, waitedMs: now - start, title: state.title },
          'Deals UI not ready — waiting'
        );
      }
      await takeScreenshot(page, `wait_deals_ui_${context}_${Math.round((now - start) / 1000)}s`);
    }

    await delay(3000);
  }

  await takeErrorScreenshot(page, `wait_deals_ui_${context}_timeout`);
  throw new Error(
    `Deals UI not ready after ${Math.round(maxWaitMs / 1000)}s (context: ${context})`
  );
}

// ─── Domain & Language setup ──────────────────────────────────────────────────

export async function selectAmazonItDomain(page: Page): Promise<void> {
  logger.info('Selecting Amazon.it domain');
  const domainSelected = await page.evaluate(() => {
    const domainSelector = document.querySelector('.languageMenuImg[rel="domain"]');
    if (domainSelector) {
      (domainSelector as HTMLElement).click();
      return true;
    }
    return false;
  });

  if (!domainSelected) {
    logger.warn('Domain selector not found');
    return;
  }

  await delay(1000);
  await page.evaluate(() => {
    const options = document.querySelectorAll('[setting="8"]');
    for (const option of options) {
      if (option.textContent?.includes('AMAZON.IT') || option.getAttribute('rel') === 'domain') {
        (option as HTMLElement).click();
        return;
      }
    }
    const fallback = document.querySelector('[setting="8"]');
    if (fallback) (fallback as HTMLElement).click();
  });

  await delay(2000);
  logger.info('Amazon.it domain selected');
  await takeScreenshot(page, 'domain_it_selected');
}

export async function selectItalianLanguage(page: Page): Promise<boolean> {
  logger.info('Selecting Italian language');

  const italianSelected = await page.evaluate(() => {
    const italianFlag = document.querySelector('img[rel="language"][setting="8"]');
    if (italianFlag) {
      (italianFlag as HTMLElement).click();
      return true;
    }
    const langIt = document.getElementById('lang_it');
    if (langIt) {
      langIt.click();
      return true;
    }
    return false;
  });

  if (italianSelected) {
    logger.info('Italian language selected');
    await delay(4000);
    return true;
  }

  logger.warn('Italian language option not found');
  return false;
}

const ITALIAN_CATEGORY_MARKERS = [
  'elettronica',
  'bellezza',
  'casa e cucina',
  'informatica',
  'fai da te',
  'giardino',
  'illuminazione',
  'sport',
  'giochi e giocattoli',
  'salute',
  'prima infanzia',
];

export async function verifyItalianCategories(page: Page): Promise<boolean> {
  return page.evaluate((markers: string[]) => {
    const fc = document.getElementById('filterCats');
    if (!fc) return false;
    const text = fc.textContent?.toLowerCase() ?? '';
    return markers.some(m => text.includes(m));
  }, ITALIAN_CATEGORY_MARKERS);
}

export async function verifyAndFixLanguage(page: Page): Promise<void> {
  const isItalian = await verifyItalianCategories(page);
  if (isItalian) {
    logger.info('Categories confirmed in Italian');
    return;
  }

  logger.warn('Categories NOT in Italian — retrying language selection');
  await takeErrorScreenshot(page, 'wrong_language');
  const fixed = await selectItalianLanguage(page);
  if (fixed) {
    await waitForDealsUI(page, 'lang-fix');
  }
}

// ─── Domain verification ──────────────────────────────────────────────────────

export async function verifyDomain(page: Page): Promise<void> {
  const domainCheck = await page.evaluate(() => {
    const el = document.querySelector('.languageMenuImg[rel="domain"]');
    return el ? (el.textContent ?? '') : '';
  });

  if (!domainCheck.includes('.it')) {
    logger.warn({ domain: domainCheck }, 'Domain NOT set to .it — attempting fix');
    await page.click('.languageMenuImg[rel="domain"]').catch(() => {});
    await delay(1500);
    await page.evaluate(() => {
      const option = document.querySelector('span[rel="domain"][setting="8"]');
      if (option) (option as HTMLElement).click();
    });
    await delay(5000);
  } else {
    logger.info('Domain correctly set to Amazon.it');
  }
}

// ─── Filter configuration ─────────────────────────────────────────────────────

async function ensurePanelExpanded(
  page: Page,
  toggleId: string,
  contentId: string,
  logLabel: string
): Promise<void> {
  const isHidden = await withTimeout(
    page.evaluate((cId: string) => {
      const content = document.getElementById(cId);
      if (!content) return true;
      const style = window.getComputedStyle(content);
      return style.display === 'none' || content.offsetHeight === 0;
    }, contentId),
    15_000,
    `panel visibility (${logLabel})`
  );

  if (!isHidden) {
    logger.debug({ panel: logLabel }, 'Panel already expanded');
    return;
  }

  logger.debug({ panel: logLabel }, 'Expanding panel');
  await withTimeout(
    page.evaluate((tId: string) => {
      const toggle = document.getElementById(tId);
      if (!toggle) return;
      toggle.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toggle.click();
    }, toggleId),
    15_000,
    `panel click (${logLabel})`
  );

  const maxWait = 5000;
  const start = Date.now();
  let visible = false;

  while (!visible && Date.now() - start < maxWait) {
    visible = await withTimeout(
      page.evaluate((cId: string) => {
        const content = document.getElementById(cId);
        if (!content) return false;
        const style = window.getComputedStyle(content);
        return style.display !== 'none' && content.offsetHeight > 0;
      }, contentId),
      5_000,
      `panel poll (${logLabel})`
    );
    if (!visible) await delay(300);
  }

  if (visible) {
    logger.debug({ panel: logLabel }, 'Panel expanded');
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
  const result = await withTimeout(
    page.evaluate(
      (id: string, shouldBeChecked: boolean) => {
        const checkbox = document.getElementById(id) as HTMLInputElement | null;
        if (!checkbox) return 'not-found';
        if (checkbox.checked === shouldBeChecked) return 'already-correct';
        checkbox.click();
        return 'toggled';
      },
      checkboxId,
      desired
    ),
    15_000,
    `checkbox ${checkboxId}`
  );

  if (result === 'not-found') {
    logger.warn({ checkboxId, label: logLabel }, 'Checkbox not found');
    return false;
  }
  logger.debug({ checkboxId, label: logLabel, desired, result }, 'Checkbox set');
  return true;
}

export interface FilterOptions {
  lowestEver: boolean;
}

export async function applyDealFilters(
  page: Page,
  options: FilterOptions = { lowestEver: false }
): Promise<void> {
  logger.info({ lowestEver: options.lowestEver }, 'Applying deal filters');

  // Price type: Amazon
  await page.evaluate(() => {
    const container = document.getElementById('dealPriceTypesFilter');
    if (!container) return;
    const opt = container.querySelector('div[data-type="0"]') as HTMLElement | null;
    if (opt) opt.click();
  });
  await delay(1000);

  // Date range: 3 months
  await page.evaluate(() => {
    const container = document.getElementById('dealDateRange');
    if (!container) return;
    const opt = container.querySelector('[setting="3"]') as HTMLElement | null;
    if (opt) opt.click();
  });
  await delay(500);

  // Range filter panel
  await ensurePanelExpanded(
    page,
    'panelRangeSelectionDisableCross',
    'panelRangeSelection',
    'Range'
  );
  await delay(300);
  await setCheckboxById(page, 'checkboxDeltaLastRange', true, 'Solo ultima variazione');
  await delay(300);

  // Applica filtri panel
  await ensurePanelExpanded(
    page,
    'panelFilterSelectionDisableCross',
    'dealCheckBoxes',
    'Applica filtri'
  );
  await delay(300);
  await setCheckboxById(page, 'checkboxLowestEver', options.lowestEver, 'Minimo');
  await delay(200);
  await setCheckboxById(page, 'checkboxHasReviews', true, 'Recensioni');
  await delay(200);
  await setCheckboxById(page, 'checkboxFilterErotic', true, 'Filtra adulti');
  await delay(200);
  await setCheckboxById(page, 'checkboxSingleVariation', true, 'Variante singola');
  await delay(300);

  logger.info('Filters applied');
  await takeScreenshot(page, 'filters_applied');
}

export async function toggleLowestFilter(page: Page, enabled: boolean): Promise<void> {
  await ensurePanelExpanded(
    page,
    'panelFilterSelectionDisableCross',
    'dealCheckBoxes',
    'Applica filtri'
  );
  await delay(300);
  await setCheckboxById(page, 'checkboxLowestEver', enabled, `Minimo ${enabled ? 'ON' : 'OFF'}`);
  await delay(200);
}

// ─── Find Deals & wait for results ────────────────────────────────────────────

export async function clickFindDeals(page: Page): Promise<void> {
  await withTimeout(
    page.evaluate(() => {
      const button = document.querySelector('#submitDealQuery');
      if (button) (button as HTMLElement).click();
    }),
    15_000,
    'Find Deals click'
  );
  logger.debug('Find Deals button clicked');
}

export async function waitForProducts(page: Page, maxWaitMs = 60_000): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const ready = await evalSafe(page, () =>
      page.evaluate(() => {
        const productPage = document.querySelector('#productPage0');
        const loadingIcon = document.querySelector('#loadingIcon');
        const loading = loadingIcon && (loadingIcon as HTMLElement).style.display !== 'none';
        return !!productPage && productPage.innerHTML.trim().length > 50 && !loading;
      })
    ).catch(() => false);

    if (ready) {
      logger.info({ waitedMs: Date.now() - start }, 'Products loaded');
      return true;
    }
    await delay(2000);
  }

  logger.warn('Timeout waiting for products');
  return false;
}

export async function waitForCategoryLinks(page: Page, maxWaitMs = 30_000): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const ready = await page
      .evaluate(() => {
        const fc = document.getElementById('filterCats');
        if (!fc) return false;
        return fc.querySelectorAll('a[rel]').length >= 3;
      })
      .catch(() => false);

    if (ready) {
      const count = await page
        .evaluate(() => {
          const fc = document.getElementById('filterCats');
          return fc ? fc.querySelectorAll('a[rel]').length : 0;
        })
        .catch(() => 0);
      logger.info({ categoryLinks: count }, 'Category links loaded');
      return true;
    }
    await delay(2000);
  }

  logger.warn('Category links did not appear');
  return false;
}

// ─── Category navigation ──────────────────────────────────────────────────────

export const CATEGORY_NAMES: Record<string, string> = {
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

export async function getFirstVisibleAsin(page: Page): Promise<string> {
  return evalSafe(page, () =>
    page.evaluate(() => {
      const container = document.getElementById('p0');
      if (!container) return '';
      const link = container.querySelector(':scope > a[href*="#!product/"]');
      if (!link) return '';
      const href = link.getAttribute('href') ?? '';
      const m = href.match(/#!product\/\d+-([A-Z0-9]{10})/);
      return m ? m[1] : '';
    })
  );
}

export async function clickCategory(page: Page, categoryName: string): Promise<boolean> {
  const clicked = await evalSafe(page, () =>
    page.evaluate((target: string) => {
      const links = Array.from(document.querySelectorAll('a'));
      const link = links.find(l => {
        const text = l.textContent?.trim() ?? '';
        return text === target || text.includes(target);
      });
      if (link) {
        (link as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
        (link as HTMLElement).click();
        return true;
      }
      return false;
    }, categoryName)
  );

  if (!clicked) {
    const available = await evalSafe(page, () =>
      page.evaluate(() => {
        const fc = document.getElementById('filterCats');
        if (!fc) return [] as string[];
        return Array.from(fc.querySelectorAll('a[rel]'))
          .map(a => a.textContent?.trim() ?? '')
          .filter(t => t.length > 0 && !t.includes('\uf00d'))
          .slice(0, 8);
      })
    ).catch(() => [] as string[]);
    logger.warn({ category: categoryName, available }, 'Category link not found');
  }

  return clicked;
}

export async function waitForCategorySwitch(
  page: Page,
  previousAsin: string,
  maxWaitMs = 30_000
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const ready = await evalSafe(page, () =>
      page.evaluate((prevAsin: string) => {
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
      }, previousAsin)
    ).catch(() => false);

    if (ready) return true;
    await delay(2000);
  }

  return false;
}

// ─── Product extraction from product list ─────────────────────────────────────

export interface RawProductData {
  asin: string;
  href: string;
  discount: number | undefined;
  avgPrice: number | undefined;
  currentPrice: number | undefined;
}

export async function extractProductLinks(
  page: Page,
  maxProducts = 500
): Promise<RawProductData[]> {
  const raw = await evalSafe(page, () =>
    page.evaluate(
      (
        max: number
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
        let idx = 0;
        let misses = 0;

        while (links.length < max && misses < 5) {
          const container = document.getElementById(`p${idx}`);
          if (!container) {
            misses++;
            idx++;
            continue;
          }
          misses = 0;

          const link = container.querySelector(':scope > a[href*="#!product/"]');
          if (!link) {
            idx++;
            continue;
          }

          const href = link.getAttribute('href');
          if (!href) {
            idx++;
            continue;
          }

          const match = href.match(/#!product\/\d+-([A-Z0-9]{10})/);
          if (!match?.[1] || seen.has(match[1])) {
            idx++;
            continue;
          }

          const asin = match[1];
          seen.add(asin);

          let discount: number | null = null;
          const discountSpan = container.querySelector(
            'span.productSmallPercent-24, span.productSmallPercent-16'
          );
          if (discountSpan) {
            const m = discountSpan.textContent?.trim()?.match(/(-?\d+)/);
            if (m) discount = parseInt(m[1]);
          }

          let avgPrice: number | null = null;
          const avgSpan = container.querySelector('span.productPriceTableTdSmallS');
          if (avgSpan) {
            const m = avgSpan.textContent?.trim()?.match(/(\d+[.,]\d+)/);
            if (m) avgPrice = parseFloat(m[1].replace(',', '.'));
          }

          let currentPrice: number | null = null;
          const currSpan = container.querySelector('span.productPriceTableTdLargeS');
          if (currSpan) {
            const m = currSpan.textContent?.trim()?.match(/(\d+[.,]\d+)/);
            if (m) currentPrice = parseFloat(m[1].replace(',', '.'));
          }

          links.push({ asin, href, discount, avgPrice, currentPrice });
          idx++;
        }
        return links;
      },
      maxProducts
    )
  );

  return raw.map(l => ({
    asin: l.asin,
    href: l.href,
    discount: l.discount ?? undefined,
    avgPrice: l.avgPrice ?? undefined,
    currentPrice: l.currentPrice ?? undefined,
  }));
}

// ─── Flot.js chart blocker ────────────────────────────────────────────────────
// Prevents heavy canvas rendering (~2.5 MB each) and window-level event handler
// accumulation when navigating between product pages.

export async function ensureChartBlocker(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      if (document.getElementById('npina-chart-blocker')) return;

      // CSS: shrink chart containers so Flot creates ~6 KB canvases instead of ~2.5 MB
      const style = document.createElement('style');
      style.id = 'npina-chart-blocker';
      style.textContent = `
        #graph, #salesRankGraph, #moreDataGraph {
          height: 1px !important;
          overflow: hidden !important;
          pointer-events: none !important;
        }
      `;
      document.head.appendChild(style);

      // JS: override $.plot so Flot never computes or renders charts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jq = (window as any).jQuery || (window as any).$;
      if (jq && typeof jq.plot === 'function') {
        const noop = () => {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        jq.plot = function (placeholder: any) {
          const $el = typeof placeholder === 'string' ? jq(placeholder) : placeholder;
          return {
            getCanvas: () => document.createElement('canvas'),
            getPlaceholder: () => $el,
            getData: () => [],
            getAxes: () => ({
              xaxis: { min: 0, max: 1, options: {} },
              yaxis: { min: 0, max: 1, options: {} },
            }),
            getOptions: () => ({}),
            width: () => 1,
            height: () => 1,
            offset: () => ({ left: 0, top: 0 }),
            shutdown: noop,
            resize: noop,
            setupGrid: noop,
            draw: noop,
            setData: noop,
            destroy: noop,
            triggerRedrawOverlay: noop,
            pointOffset: () => ({ left: 0, top: 0 }),
            highlight: noop,
            unhighlight: noop,
          };
        };
        jq.plot.plugins = [];
      }
    })
    .catch(() => {});
}

// ─── ASINs-only extraction (for lowest pass) ─────────────────────────────────

export async function extractAsinsOnly(page: Page): Promise<string[]> {
  return evalSafe(page, () =>
    page.evaluate(() => {
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
          if (m?.[1] && !seen.has(m[1])) {
            seen.add(m[1]);
            result.push(m[1]);
          }
        }
        idx++;
      }
      return result;
    })
  );
}

// ─── Missing categories detection ─────────────────────────────────────────────

export async function detectMissingCategories(
  page: Page,
  sendEmail: (cats: Array<{ name: string; count: number }>) => Promise<boolean>
): Promise<void> {
  try {
    const pageCategories = await page.evaluate(() => {
      const results: { name: string; count: number }[] = [];
      const seen = new Set<string>();
      const pattern = /^(.+?)\s*\((\d+)\)$/;
      const links = Array.from(document.querySelectorAll('a'));

      for (const link of links) {
        const text = link.textContent?.trim();
        if (!text) continue;
        const match = text.match(pattern);
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

    const knownNames = Object.values(CATEGORY_NAMES).map(n => n.toLowerCase().trim());
    const missing = pageCategories.filter(
      cat => !knownNames.includes(cat.name.toLowerCase().trim())
    );

    if (missing.length === 0) {
      logger.info('All page categories already mapped');
      return;
    }

    logger.warn({ missingCategories: missing }, 'Unmapped categories detected');
    await sendEmail(missing);
  } catch (error) {
    logger.error({ err: (error as Error).message }, 'Error detecting missing categories');
  }
}
