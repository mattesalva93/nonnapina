import fs from 'node:fs/promises';
import path from 'node:path';
import { connect } from 'puppeteer-real-browser';
import type { Browser, Page } from 'rebrowser-puppeteer-core';
import { config } from '../config/index.js';
import type { KeepaProduct } from '../types/index.js';

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
        console.error(
          `   ❌ ${label} failed after ${retries} attempts: ${(error as Error).message}`
        );
        throw error;
      }
      const waitMs = baseDelay * Math.pow(2, attempt - 1);
      console.warn(
        `   ⚠️  ${label} attempt ${attempt}/${retries} failed: ${(error as Error).message}. Retrying in ${waitMs / 1000}s...`
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

    console.log(`   📋 Found ${pageCategories.length} deal categories on the page`);

    const knownCategoryNames = Object.values(CATEGORY_NAMES).map(n => n.toLowerCase().trim());
    const missingCategories = pageCategories.filter(
      cat => !knownCategoryNames.includes(cat.name.toLowerCase().trim())
    );

    if (missingCategories.length === 0) {
      console.log('   ✅ All page categories are already mapped — no missing categories found');
      return;
    }

    console.log(`   ⚠️  Found ${missingCategories.length} missing categories:`);
    for (const cat of missingCategories) {
      console.log(`      - ${cat.name} (${cat.count} deals)`);
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
      console.log('   ℹ️  All missing categories were already recorded in the file');
      return;
    }

    await fs.mkdir(path.dirname(MISSING_CATEGORIES_FILE), { recursive: true });
    await fs.writeFile(MISSING_CATEGORIES_FILE, JSON.stringify(existingData, null, 2), 'utf-8');
    console.log(`   💾 Saved ${added} new missing categories to ${MISSING_CATEGORIES_FILE}`);
  } catch (error) {
    console.error(`   ❌ Error detecting missing categories: ${(error as Error).message}`);
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

export async function scrapeKeepaDeals(): Promise<KeepaProduct[]> {
  console.log('🚀 Starting Keepa scraper (puppeteer-real-browser)...');

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
    console.log('✅ Browser launched with puppeteer-real-browser');

    page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const allProducts: KeepaProduct[] = [];

    console.log('\n🛒 Navigating to Keepa homepage...');
    try {
      await withRetry(
        () => page!.goto('https://keepa.com/', { waitUntil: 'networkidle2', timeout: 30000 }),
        { retries: 3, baseDelay: 3000, label: 'Keepa homepage navigation' }
      );
      console.log('   ✅ Keepa homepage loaded');
    } catch (error) {
      console.warn(`   ⚠️  Navigation error: ${(error as Error).message}`);
    }

    await delay(2000);

    console.log('\n🇮🇹 Selecting Amazon.it domain from navbar...');
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
        console.log('   ✅ Domain selector clicked');
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
          console.log('   ✅ Amazon.it selected!');
          await delay(2000);
        } else {
          console.log('   ⚠️  Could not find Italy option, proceeding anyway...');
        }
      } else {
        console.log('   ⚠️  Could not find domain selector, proceeding anyway...');
      }
    } catch (error) {
      console.log(`   ⚠️  Error selecting domain: ${(error as Error).message}`);
    }

    console.log('\n🛒 Navigating to Deals page...');
    try {
      await withRetry(
        () =>
          page!.goto('https://keepa.com/#!deals', { waitUntil: 'networkidle2', timeout: 60000 }),
        { retries: 3, baseDelay: 5000, label: 'Deals page navigation' }
      );
      page.mouse.move(423, 354);
      page.mouse.move(320, 530);
      console.log('   ✅ Deals page loaded successfully');
    } catch (error) {
      console.warn(`   ⚠️  Navigation timeout: ${(error as Error).message}`);
    }

    await delay(5000);

    console.log('\n🇮🇹 Verifying Amazon.it domain...');
    const domainCheck = await page.evaluate(() => {
      const domainElement = document.querySelector('.languageMenuImg[rel="domain"]');
      const domainText = domainElement ? (domainElement.textContent ?? '') : '';
      const isVisible = domainElement
        ? (domainElement as HTMLElement).offsetWidth > 0 &&
          (domainElement as HTMLElement).offsetHeight > 0
        : false;
      return { text: domainText, visible: isVisible, exists: !!domainElement };
    });

    console.log(`   Domain element exists: ${domainCheck.exists ? 'Yes' : 'No'}`);
    console.log(`   Domain element visible: ${domainCheck.visible ? 'Yes' : 'No'}`);
    console.log(`   Domain text: "${domainCheck.text}"`);

    if (!domainCheck.text.includes('.it')) {
      console.log('   ⚠️  WARNING: Domain is NOT set to .it!');
      console.log('   🔄 Attempting manual fix...');
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
      console.log(`   After fix, domain: "${newDomain}"`);
    } else {
      console.log('   ✅ Domain correctly set to Amazon.it');
    }

    console.log('\n🇮🇹 Selecting Italian language for Keepa...');
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
        console.log('   ✅ Italian language selected!');
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
          console.log('   ✅ Italian language selected (alternative method)!');
          await delay(4000);
        } else {
          console.log('   ⚠️  Could not find Italian language option, proceeding anyway...');
        }
      }
    } catch (error) {
      console.log(`   ⚠️  Error selecting language: ${(error as Error).message}`);
    }

    console.log('\n🛡️  Checking for Cloudflare challenge...');
    const hasCloudflare = await page.evaluate(() => {
      return (
        document.body.innerText.includes('Cloudflare') ||
        document.body.innerText.includes('Checking your browser') ||
        document.title.includes('Just a moment')
      );
    });

    if (hasCloudflare) {
      console.log('⚠️  Cloudflare challenge detected - waiting 90 seconds for completion...');
    }

    console.log('\n📦 Selecting "Nuovo, Gestito da Amazon" filter...');
    try {
      const filterClicked = await page.evaluate(() => {
        const container = document.getElementById('dealPriceTypesFilter');
        if (container) {
          const divs = container.querySelectorAll(':scope > div');
          const targetDiv = divs[5] as HTMLElement | undefined;
          if (targetDiv) {
            targetDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetDiv.click();
            return true;
          }
        }
        return false;
      });

      if (filterClicked) {
        console.log('   ✅ "Nuovo, Gestito da Amazon" filter selected!');
        await delay(2000);
      } else {
        console.log('   ⚠️  Could not find "Nuovo, Gestito da Amazon" filter at XPath');
      }
    } catch (error) {
      console.log(`   ⚠️  Error selecting filter: ${(error as Error).message}`);
    }

    console.log('\n🔘 Looking for "Find Deals!" button...');
    try {
      await page.waitForSelector('#submitDealQuery', { timeout: 5000 });
      console.log('   ✅ Found "Find Deals!" button');

      await page.evaluate(() => {
        const button = document.querySelector('#submitDealQuery');
        if (button) {
          (button as HTMLElement).click();
        }
      });

      console.log('   ⏳ Waiting for products container to appear...');
      console.log('   ⏰ Max wait time: 60 seconds');

      let productPageReady = false;
      const maxWaitTime = 60000;
      const checkInterval = 2000;
      const startTime = Date.now();

      while (!productPageReady && Date.now() - startTime < maxWaitTime) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`   ⏱️  Checking... (${elapsed}s elapsed)`);

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
        console.log('   ✅ Products container is ready!');
      } else {
        console.log('   ⚠️  Timeout waiting for products. Proceeding anyway...');
      }
    } catch (error) {
      console.log('   ⚠️  Could not interact with "Find Deals!" button:', (error as Error).message);
    }

    console.log('\n⏭️  Skipping general page extraction - navigating directly to categories...');

    console.log('\n🔎 Checking for missing categories on the page...');
    await detectMissingCategories(page);

    console.log('\n🔍 Navigating through selected categories...');

    for (const categoryId of config.keepa.categories) {
      const categoryName = CATEGORY_NAMES[categoryId];
      if (!categoryName) {
        console.log(`   ⚠️  Category ID ${categoryId} not found in CATEGORY_NAMES`);
        continue;
      }

      console.log(`\n   🎯 Processing: "${categoryName}" (ID: ${categoryId})`);

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
          console.log(`   ⚠️  Could not find <a> tag for "${categoryName}"`);
          continue;
        }

        console.log(`   ✅ Clicked category link`);
        console.log(`   ⏳ Waiting for products to load...`);

        let productsReady = false;
        const maxWait = 30000;
        const checkInt = 2000;
        const start = Date.now();

        while (!productsReady && Date.now() - start < maxWait) {
          productsReady = await page.evaluate(() => {
            const productPage = document.querySelector('#productPage0');
            const loadingIcon = document.querySelector('#loadingIcon');
            const isLoading = loadingIcon && (loadingIcon as HTMLElement).style.display !== 'none';
            if (productPage && !isLoading) {
              return productPage.innerHTML.trim().length > 50;
            }
            return false;
          });

          if (!productsReady) {
            await delay(checkInt);
          }
        }

        if (!productsReady) {
          console.log(`   ⚠️  Timeout waiting for products in "${categoryName}"`);
          continue;
        }

        console.log(`   ✅ Products loaded`);

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
          config.keepa.maxProductsPerCategory
        );

        // Normalize null → undefined for TypeScript/domain types
        const normalizedLinks: RawProductLink[] = productLinks.map(l => ({
          asin: l.asin,
          href: l.href,
          discount: l.discount ?? undefined,
          avgPrice: l.avgPrice ?? undefined,
          currentPrice: l.currentPrice ?? undefined,
        }));

        console.log(`   📦 Found ${normalizedLinks.length} products to extract`);

        const categoryProducts: KeepaProduct[] = [];
        for (let i = 0; i < normalizedLinks.length; i++) {
          const { asin, discount, avgPrice, currentPrice } = normalizedLinks[i];

          try {
            console.log(`   🔄 [${i + 1}/${normalizedLinks.length}] Processing ${asin}...`);

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
              console.log(`   ⚠️  Could not click product link for ${asin}`);
              categoryProducts.push({
                asin,
                category: categoryName,
                discount,
                avgPrice,
                currentPrice,
                rating: undefined,
                reviewCount: undefined,
              });
              continue;
            }

            await delay(2000);
            await page
              .waitForSelector('#productInfoBox', { timeout: 10000 })
              .catch(() => undefined);

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

                      const countMatch = fullText.match(/\((\d+)/);
                      if (countMatch) {
                        data.reviewCount = parseInt(countMatch[1], 10);
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
            };

            categoryProducts.push(productData);

            const reviewInfo = productData.rating
              ? ` | ⭐ ${productData.rating} (${productData.reviewCount} reviews)`
              : ' | ⭐ no reviews';
            const priceInfo = productData.avgPrice
              ? ` | €${productData.currentPrice} (was €${productData.avgPrice}, ${productData.discount}%)`
              : '';
            console.log(`   ✅ ${asin}${priceInfo}${reviewInfo}`);

            await page.goBack();
            await delay(1500);
            await page.waitForSelector('#productPage0', { timeout: 10000 }).catch(() => undefined);
          } catch (error) {
            console.log(`   ⚠️  Error processing ${asin}: ${(error as Error).message}`);
            try {
              await page.goBack();
              await delay(1500);
            } catch {
              console.log(`   ⚠️  Could not recover, continuing...`);
            }
          }
        }

        console.log(
          `   📦 Successfully extracted ${categoryProducts.length} products with reviews and pricing`
        );

        for (const product of categoryProducts) {
          if (!allProducts.find(p => p.asin === product.asin)) {
            allProducts.push(product);
          }
        }

        await delay(config.keepa.scrapingDelayMs);
      } catch (error) {
        console.log(`   ❌ Error processing "${categoryName}": ${(error as Error).message}`);
        continue;
      }
    }

    console.log(`\n🎉 Total products scraped: ${allProducts.length}`);

    const keepOpenMs = parseInt(process.env.BROWSER_KEEP_OPEN_MS ?? '3000', 10);
    if (keepOpenMs > 0) {
      console.log(`\n⏳ Keeping browser open for ${keepOpenMs / 1000} seconds...`);
      await delay(keepOpenMs);
    }

    await browser.close();
    return allProducts;
  } catch (error) {
    console.error('\n❌ Scraping error:', (error as Error).message);
    console.error('Stack trace:', (error as Error).stack);

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
    .then(products => {
      console.log('\n📋 Scraped products:', JSON.stringify(products, null, 2));
    })
    .catch(console.error);
}
