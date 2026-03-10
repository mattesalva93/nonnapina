import fs from 'node:fs/promises';
import path from 'node:path';
import { connect } from 'puppeteer-real-browser';
import type { Browser, Page } from 'rebrowser-puppeteer-core';
import { config } from '../config/index.js';
import { sendErrorAlert } from '../services/email.service.js';
import { checkDealDuplicate } from '../services/product.service.js';
import type { KeepaProduct, ScrapeResult } from '../types/index.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('KeepaService');

const SCREENSHOT_DIR = './output/screenshots';
let screenshotCounter = 0;

async function takeScreenshot(page: Page, label: string): Promise<void> {
  try {
    await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
    const idx = String(++screenshotCounter).padStart(3, '0');
    const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    const filename = `${idx}_${safeLabel}.png`;
    const filepath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: filepath, fullPage: true });
    logger.info(`   📸 Screenshot saved: ${filename}`);
  } catch (err) {
    logger.warn(`   📸 Screenshot failed (${label}): ${(err as Error).message}`);
  }
}

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

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
        logger.error(`${label} failed after ${retries} attempts: ${(error as Error).message}`);
        throw error;
      }
      const waitMs = baseDelay * Math.pow(2, attempt - 1);
      logger.warn(
        `${label} attempt ${attempt}/${retries} failed: ${(error as Error).message}. Retrying in ${waitMs / 1000}s...`
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

const MISSING_CATEGORIES_FILE = './output/missing-categories.json';

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
    logger.info(`   ✅ ${logLabel}`);
    await takeScreenshot(page, `filter_toggle_${logLabel}`);
  } else {
    logger.info(`   ⚠️  Could not find: ${logLabel}`);
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
    logger.info(`   ✅ "${logLabel}" panel already expanded`);
    return;
  }

  logger.info(`   🔽 Expanding "${logLabel}" panel...`);
  const clicked = await page.evaluate((tId: string) => {
    const toggle = document.getElementById(tId);
    if (!toggle) return false;
    toggle.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toggle.click();
    return true;
  }, toggleId);

  if (!clicked) {
    logger.warn(`   ⚠️  Could not find toggle #${toggleId} for "${logLabel}"`);
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
    logger.info(`   ✅ "${logLabel}" panel expanded successfully`);
    await takeScreenshot(page, `panel_expanded_${logLabel.replace(/\s+/g, '_')}`);
  } else {
    logger.warn(`   ⚠️  "${logLabel}" panel may not have expanded (timeout)`);
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
    logger.info(`   ⚠️  Checkbox #${checkboxId} not found: ${logLabel}`);
    return false;
  }
  if (result === 'already-correct') {
    logger.info(`   ✅ ${logLabel} (already ${desired ? 'checked' : 'unchecked'})`);
    await takeScreenshot(page, `checkbox_${checkboxId}_already`);
    return true;
  }
  logger.info(`   ✅ ${logLabel} (${desired ? 'checked' : 'unchecked'})`);
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

    logger.info(`   📋 Found ${pageCategories.length} deal categories on the page`);

    const knownCategoryNames = Object.values(CATEGORY_NAMES).map(n => n.toLowerCase().trim());
    const missingCategories = pageCategories.filter(
      cat => !knownCategoryNames.includes(cat.name.toLowerCase().trim())
    );

    if (missingCategories.length === 0) {
      logger.info('   ✅ All page categories are already mapped — no missing categories found');
      return;
    }

    logger.info(`   ⚠️  Found ${missingCategories.length} missing categories:`);
    for (const cat of missingCategories) {
      logger.info(`      - ${cat.name} (${cat.count} deals)`);
    }

    let existingData: Record<string, string> = {};
    try {
      const raw = await fs.readFile(MISSING_CATEGORIES_FILE, 'utf-8');
      existingData = JSON.parse(raw) as Record<string, string>;
    } catch {
      // File does not exist yet — will be created
    }

    const allExistingIds = [
      ...Object.keys(CATEGORY_NAMES).map(Number),
      ...Object.keys(existingData).map(Number),
    ];
    let nextId = Math.max(...allExistingIds, 0) + 1;

    const alreadyRecordedNames = Object.values(existingData).map(n => n.toLowerCase().trim());

    let added = 0;
    for (const cat of missingCategories) {
      if (!alreadyRecordedNames.includes(cat.name.toLowerCase().trim())) {
        existingData[nextId] = cat.name;
        nextId++;
        added++;
      }
    }

    if (added === 0) {
      logger.info('   ℹ️  All missing categories were already recorded in the file');
      return;
    }

    await fs.mkdir(path.dirname(MISSING_CATEGORIES_FILE), { recursive: true });
    await fs.writeFile(MISSING_CATEGORIES_FILE, JSON.stringify(existingData, null, 2), 'utf-8');
    logger.info(`   💾 Saved ${added} new missing categories to ${MISSING_CATEGORIES_FILE}`);
  } catch (error) {
    logger.error(`   ❌ Error detecting missing categories: ${(error as Error).message}`);
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

async function scrapeAllCategories(page: Page): Promise<KeepaProduct[]> {
  logger.info('\n🔍 Navigating through selected categories...');

  const products: KeepaProduct[] = [];

  for (const categoryId of config.keepa.categories) {
    const categoryName = CATEGORY_NAMES[categoryId];
    if (!categoryName) {
      logger.info(`   ⚠️  Category ID ${categoryId} not found in CATEGORY_NAMES`);
      continue;
    }

    logger.info(`\n   🎯 Processing: "${categoryName}" (ID: ${categoryId})`);

    try {
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
        logger.info(`   ⚠️  Could not find <a> tag for "${categoryName}"`);
        continue;
      }

      logger.info(`   ✅ Clicked category link`);
      await takeScreenshot(page, `pass1_cat_${categoryId}_clicked`);
      logger.info(`   ⏳ Waiting for products to load...`);

      // Capture the first ASIN currently visible before the category switch
      const previousFirstAsin = await page.evaluate(() => {
        const firstContainer = document.getElementById('p0');
        if (!firstContainer) return '';
        const link = firstContainer.querySelector(':scope > a[href*="#!product/"]');
        if (!link) return '';
        const href = link.getAttribute('href') ?? '';
        const m = href.match(/#!product\/\d+-([A-Z0-9]{10})/);
        return m ? m[1] : '';
      });

      let productsReady = false;
      const maxWait = 30000;
      const checkInt = 2000;
      const start = Date.now();

      while (!productsReady && Date.now() - start < maxWait) {
        productsReady = await page.evaluate((prevAsin: string) => {
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
        logger.info(`   ⚠️  Timeout waiting for products in "${categoryName}"`);
        await takeScreenshot(page, `pass1_cat_${categoryId}_timeout`);
        continue;
      }

      logger.info(`   ✅ Products loaded`);
      await takeScreenshot(page, `pass1_cat_${categoryId}_loaded`);

      const productLinks = await page.evaluate(
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
        `   📦 Found ${normalizedLinks.length} products on page (target: ${targetCount} new/updated)`
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
            logger.info(
              `   ⏩ [${i + 1}/${normalizedLinks.length}] Skipping ${asin} (unchanged in DB)`
            );
            continue;
          }

          const statusIcon = dupCheck.status === 'new' ? '🆕' : '🔄';
          logger.info(
            `   ${statusIcon} [${i + 1}/${normalizedLinks.length}] Processing ${asin} (${dupCheck.status})...`
          );

          const clickSuccess = await page.evaluate((targetAsin: string) => {
            const links = Array.from(
              document.querySelectorAll('a[href*="#!product/"]')
            ) as HTMLAnchorElement[];
            const link = links.find(l => l.getAttribute('href')?.includes(`-${targetAsin}`));
            if (link) {
              link.click();
              return true;
            }
            return false;
          }, asin);

          if (!clickSuccess) {
            logger.info(`   ⚠️  Could not click product link for ${asin}`);
            await takeScreenshot(page, `product_${asin}_click_fail`);
            categoryProducts.push({
              asin,
              category: categoryName,
              discount,
              avgPrice,
              currentPrice,
              rating: undefined,
              reviewCount: undefined,
              isLowest: false,
            });
            continue;
          }

          await delay(2000);
          await page.waitForSelector('#productInfoBox', { timeout: 10000 }).catch(() => undefined);
          await takeScreenshot(page, `product_${asin}_detail`);

          const reviewData: ReviewData = await page.evaluate(
            (): { rating: number | undefined; reviewCount: number | undefined } => {
              const data: { rating: number | undefined; reviewCount: number | undefined } = {
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

                    // Look for review count near the rating/stars text to avoid
                    // matching unrelated parenthesized numbers (sales rank, etc.)
                    const reviewPatterns = [
                      // "(80 recensioni)", "(80 valutazioni)", "(80 ratings)"
                      /\((\d[\d.,]*)\s*(?:recensioni|valutazioni|reviews?|ratings?|Bewertungen)/i,
                      // "(80)" right after "stelle" or "stars": "4.0 stelle (80)"
                      /(?:stelle|stars?)\s*\((\d[\d.,]*)\)/i,
                    ];

                    for (const pattern of reviewPatterns) {
                      const countMatch = fullText.match(pattern);
                      if (countMatch) {
                        const raw = (countMatch[1] ?? countMatch[2] ?? '').replace(/[.,]/g, '');
                        const parsed = parseInt(raw, 10);
                        if (!isNaN(parsed) && parsed > 0) {
                          data.reviewCount = parsed;
                          break;
                        }
                      }
                    }
                  }
                }
              } catch (e) {
                // swallow — best-effort extraction
              }

              return data;
            }
          );

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

          const reviewInfo = productData.rating
            ? ` | ⭐ ${productData.rating} (${productData.reviewCount} reviews)`
            : ' | ⭐ no reviews';
          const priceInfo = productData.avgPrice
            ? ` | €${productData.currentPrice} (was €${productData.avgPrice}, ${productData.discount}%)`
            : '';
          logger.info(`   ✅ ${asin}${priceInfo}${reviewInfo}`);

          await page.goBack();
          await delay(1500);
          await page.waitForSelector('#productPage0', { timeout: 10000 }).catch(() => undefined);
        } catch (error) {
          logger.info(`   ⚠️  Error processing ${asin}: ${(error as Error).message}`);
          try {
            await page.goBack();
            await delay(1500);
          } catch {
            logger.info(`   ⚠️  Could not recover, continuing...`);
          }
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

      await delay(config.keepa.scrapingDelayMs);
    } catch (error) {
      logger.info(`   ❌ Error processing "${categoryName}": ${(error as Error).message}`);
      continue;
    }
  }

  logger.info(`\n🎉 Total products scraped: ${products.length}`);
  return products;
}

/**
 * Lightweight pass 2: navigate each category with "Minimo" filter active
 * and collect only the visible ASINs — no product detail clicks needed.
 */
async function collectLowestAsins(page: Page): Promise<Set<string>> {
  logger.info('\n🔍 [Pass 2] Collecting lowest-ever ASINs from each category...');

  const allLowestAsins = new Set<string>();

  for (const categoryId of config.keepa.categories) {
    const categoryName = CATEGORY_NAMES[categoryId];
    if (!categoryName) {
      logger.info(`   ⚠️  Category ID ${categoryId} not found in CATEGORY_NAMES`);
      continue;
    }

    logger.info(`\n   🎯 [Pass 2] Scanning: "${categoryName}" (ID: ${categoryId})`);

    try {
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
        logger.info(`   ⚠️  Could not find <a> tag for "${categoryName}"`);
        continue;
      }

      // Capture first visible ASIN before category switch to detect stale DOM
      await takeScreenshot(page, `pass2_cat_${categoryId}_clicked`);
      const previousFirstAsin = await page.evaluate(() => {
        const container = document.getElementById('p0');
        if (!container) return '';
        const link = container.querySelector(':scope > a[href*="#!product/"]');
        if (!link) return '';
        const href = link.getAttribute('href') ?? '';
        const m = href.match(/#!product\/\d+-([A-Z0-9]{10})/);
        return m ? m[1] : '';
      });

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
        logger.info(`   ⚠️  Timeout waiting for "${categoryName}" — skipping`);
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
      logger.info(`   ✅ [Pass 2] "${categoryName}": found ${asins.length} lowest-ever ASINs`);
      await takeScreenshot(page, `pass2_cat_${categoryId}_asins_collected`);

      await delay(config.keepa.scrapingDelayMs);
    } catch (error) {
      logger.info(`   ❌ [Pass 2] Error processing "${categoryName}": ${(error as Error).message}`);
      continue;
    }
  }

  logger.info(`\n🎉 [Pass 2] Total lowest-ever ASINs collected: ${allLowestAsins.size}`);
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
  logger.info('🚀 Starting Keepa scraper (puppeteer-real-browser)...');

  let browser: Browser | undefined;
  let page: Page | undefined;

  try {
    const { browser: realBrowser, page: realPage } = await connect({
      headless: true,
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
      ],
      customConfig: {},
      turnstile: true,
      connectOption: {
        defaultViewport: undefined,
      },
      disableXvfb: true,
      ignoreAllFlags: false,
    });

    browser = realBrowser;
    page = realPage;
    logger.info('✅ Browser launched with puppeteer-real-browser');
    screenshotCounter = 0;

    // Clear screenshot directory for a fresh run
    try {
      await fs.rm(SCREENSHOT_DIR, { recursive: true, force: true });
      await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
      logger.info('📂 Screenshot directory cleared for new run');
    } catch (err) {
      logger.warn(`📂 Could not clear screenshot directory: ${(err as Error).message}`);
    }

    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    logger.info('\n🛒 Navigating to Keepa homepage...');
    try {
      await withRetry(
        () => page!.goto('https://keepa.com/', { waitUntil: 'networkidle2', timeout: 30000 }),
        { retries: 3, baseDelay: 3000, label: 'Keepa homepage navigation' }
      );
      logger.info('   ✅ Keepa homepage loaded');
      await takeScreenshot(page, 'homepage_loaded');
    } catch (error) {
      logger.warn(`   ⚠️  Navigation error: ${(error as Error).message}`);
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
        logger.info('   ✅ Domain selector clicked');
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
          logger.info('   ✅ Amazon.it selected!');
          await delay(2000);
          await takeScreenshot(page, 'domain_it_selected');
        } else {
          logger.info('   ⚠️  Could not find Italy option, proceeding anyway...');
        }
      } else {
        logger.info('   ⚠️  Could not find domain selector, proceeding anyway...');
      }
    } catch (error) {
      logger.info(`   ⚠️  Error selecting domain: ${(error as Error).message}`);
    }

    logger.info('\n🛒 Navigating to Deals page...');
    try {
      await withRetry(
        () =>
          page!.goto('https://keepa.com/#!deals', { waitUntil: 'networkidle2', timeout: 60000 }),
        { retries: 3, baseDelay: 5000, label: 'Deals page navigation' }
      );
      await page.mouse.move(423, 354);
      await page.mouse.move(320, 530);
      logger.info('   ✅ Deals page loaded successfully');
      await takeScreenshot(page, 'deals_page_loaded');
    } catch (error) {
      logger.warn(`   ⚠️  Navigation timeout: ${(error as Error).message}`);
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
      logger.info('   ⚠️  WARNING: Domain is NOT set to .it!');
      logger.info('   🔄 Attempting manual fix...');
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
      logger.info(`   After fix, domain: "${newDomain}"`);
    } else {
      logger.info('   ✅ Domain correctly set to Amazon.it');
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
        logger.info('   ✅ Italian language selected!');
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
          logger.info('   ✅ Italian language selected (alternative method)!');
          await delay(4000);
        } else {
          logger.info('   ⚠️  Could not find Italian language option, proceeding anyway...');
        }
      }
    } catch (error) {
      logger.info(`   ⚠️  Error selecting language: ${(error as Error).message}`);
    }

    logger.info('\n🛡️  Checking for Cloudflare challenge...');
    const hasCloudflare = await page.evaluate(() => {
      return (
        document.body.innerText.includes('Cloudflare') ||
        document.body.innerText.includes('Checking your browser') ||
        document.title.includes('Just a moment')
      );
    });

    if (hasCloudflare) {
      logger.info('⚠️  Cloudflare challenge detected - waiting 90 seconds for completion...');
      await takeScreenshot(page, 'cloudflare_detected');
    }

    logger.info('\n📦 Selecting "Amazon" price type filter...');
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
        logger.info('   ✅ "Amazon" filter selected (data-type=0)!');
        await delay(2000);
        await takeScreenshot(page, 'amazon_price_filter_selected');
      } else {
        logger.info('   ⚠️  Could not find "Amazon" filter (data-type=0) in dealPriceTypesFilter');
      }
    } catch (error) {
      logger.info(`   ⚠️  Error selecting price type: ${(error as Error).message}`);
    }

    logger.info('\n📅 Setting time interval to 3 months...');
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
        logger.info(`   ✅ Time interval set to 3 months (via ${dateRangeSet})`);
        await delay(1000);
      } else {
        logger.info('   ⚠️  Could not set date range to 3 months');
      }
    } catch (error) {
      logger.info(`   ⚠️  Error setting date range: ${(error as Error).message}`);
    }

    logger.info('\n📊 Configuring range filters...');
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
      logger.info(`   ⚠️  Error in range config: ${(error as Error).message}`);
    }

    logger.info('\n🔍 Expanding "Applica filtri" panel...');
    try {
      await ensurePanelExpanded(
        page,
        'panelFilterSelectionDisableCross',
        'dealCheckBoxes',
        'Applica filtri'
      );
      await delay(500);
    } catch (error) {
      logger.info(`   ⚠️  Error expanding Applica filtri panel: ${(error as Error).message}`);
    }

    logger.info('\n🔍 Configuring deal filters (Pass 1: without Minimo)...');
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
      logger.info(`   ⚠️  Error applying filters: ${(error as Error).message}`);
    }

    logger.info('\n🔘 Looking for "Find Deals!" button...');
    try {
      await page.waitForSelector('#submitDealQuery', { timeout: 5000 });
      logger.info('   ✅ Found "Find Deals!" button');

      await page.evaluate(() => {
        const button = document.querySelector('#submitDealQuery');
        if (button) {
          (button as HTMLElement).click();
        }
      });

      logger.info('   ⏳ Waiting for products container to appear...');
      logger.info('   ⏰ Max wait time: 60 seconds');

      let productPageReady = false;
      const maxWaitTime = 60000;
      const checkInterval = 2000;
      const startTime = Date.now();

      while (!productPageReady && Date.now() - startTime < maxWaitTime) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        logger.info(`   ⏱️  Checking... (${elapsed}s elapsed)`);

        productPageReady = await page.evaluate(() => {
          const productPage = document.querySelector('#productPage0');
          const loadingIcon = document.querySelector('#loadingIcon');
          const loadingVisible =
            loadingIcon && (loadingIcon as HTMLElement).style.display !== 'none';
          if (productPage) {
            const hasContent = productPage.innerHTML.trim().length > 50;
            return hasContent && !loadingVisible;
          }
          return false;
        });

        if (!productPageReady) {
          await delay(checkInterval);
        }
      }

      if (productPageReady) {
        logger.info('   ✅ Products container is ready!');
        await takeScreenshot(page, 'find_deals_results_ready');
      } else {
        logger.info('   ⚠️  Timeout waiting for products. Proceeding anyway...');
        await takeScreenshot(page, 'find_deals_results_timeout');
      }
    } catch (error) {
      logger.warn(
        { err: (error as Error).message },
        'Could not interact with "Find Deals!" button'
      );
    }

    logger.info('\n⏭️  Skipping general page extraction - navigating directly to categories...');

    logger.info('\n🔎 Checking for missing categories on the page...');
    await detectMissingCategories(page);

    // ── Pass 1: Normal scraping (Minimo OFF) ───────────────────────────────
    logger.info('\n═══ PASS 1: Normal deal scraping (Minimo OFF) ═══');
    const pass1Products = await scrapeAllCategories(page);

    // ── Pass 2: Enable "minimo" filter, collect ASINs only ───────────────
    logger.info('\n═══ PASS 2: Collecting lowest-ever ASINs (Minimo ON) ═══');
    let lowestAsins = new Set<string>();
    try {
      // Ensure the "Applica filtri" panel is still expanded before Pass 2
      await ensurePanelExpanded(
        page,
        'panelFilterSelectionDisableCross',
        'dealCheckBoxes',
        'Applica filtri'
      );
      await delay(300);

      await setCheckboxById(page, 'checkboxLowestEver', true, '"Minimo" enabled for Pass 2');
      await delay(500);

      logger.info('\n🔘 Clicking "Find Deals!" for pass 2...');
      await page.evaluate(() => {
        const button = document.querySelector('#submitDealQuery');
        if (button) (button as HTMLElement).click();
      });

      let passReady = false;
      const maxWaitPass2 = 60000;
      const checkIntPass2 = 2000;
      const startPass2 = Date.now();

      while (!passReady && Date.now() - startPass2 < maxWaitPass2) {
        passReady = await page.evaluate(() => {
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
        logger.info('   ✅ Pass 2 results loaded');
        await takeScreenshot(page, 'pass2_find_deals_ready');
      } else {
        logger.info('   ⚠️  Timeout waiting for pass 2 results, proceeding anyway...');
        await takeScreenshot(page, 'pass2_find_deals_timeout');
      }

      await delay(2000);

      lowestAsins = await collectLowestAsins(page);
    } catch (error) {
      logger.warn(`   ⚠️  Error in pass 2: ${(error as Error).message}`);
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
      logger.info(`\n⏳ Keeping browser open for ${keepOpenMs / 1000} seconds...`);
      await delay(keepOpenMs);
    }

    await browser.close();
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

    if (browser) {
      const keepOpenMs = parseInt(process.env.BROWSER_KEEP_OPEN_MS ?? '3000', 10);
      if (keepOpenMs > 0) {
        await delay(keepOpenMs);
      }
      await browser.close();
    }

    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeKeepaDeals()
    .then(result => {
      logger.info({ productCount: result.products.length }, 'Scraped products (standalone run)');
    })
    .catch(err => logger.error(err));
}
