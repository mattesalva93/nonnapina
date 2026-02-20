import { connect } from 'puppeteer-real-browser';
import { config } from '../config/index.js';

/**
 * Helper function to wait/delay
 */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Category mapping for Keepa (Amazon.it)
 * Format: Keepa Category ID: 'Category Name'
 */
const CATEGORY_NAMES = {
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
};

/**
 * Scrapes ASINs from Keepa deals page using puppeteer-real-browser
 * @returns {Promise<Array<{asin: string, category: string}>>}
 */
export async function scrapeKeepaDeals() {
  console.log('🚀 Starting Keepa scraper (puppeteer-real-browser)...');

  let browser, page;
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
        defaultViewport: null,
      },
      disableXvfb: true,
      ignoreAllFlags: false,
    });

    browser = realBrowser;
    page = realPage;
    console.log('✅ Browser launched with puppeteer-real-browser');

    // Set realistic viewport and user agent
    page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const allProducts = [];

    // Navigate to base Keepa site
    console.log('\n🛒 Navigating to Keepa homepage...');
    try {
      await page.goto('https://keepa.com/', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
      console.log('   ✅ Keepa homepage loaded');
    } catch (error) {
      console.warn(`   ⚠️  Navigation error: ${error.message}`);
    }

    // Wait for navbar to load
    await delay(2000);

    // Select Amazon.it domain from navbar
    console.log('\n🇮🇹 Selecting Amazon.it domain from navbar...');
    try {
      const domainSelected = await page.evaluate(() => {
        // Find the domain selector element
        const domainSelector = document.querySelector('.languageMenuImg[rel="domain"]');
        if (domainSelector) {
          domainSelector.click();
          return true;
        }
        return false;
      });

      if (domainSelected) {
        console.log('   ✅ Domain selector clicked');
        await delay(1000);

        // Click on Italy option (Amazon.it)
        const italySelected = await page.evaluate(() => {
          // Look for the Italy option in the dropdown
          const options = document.querySelectorAll('[setting="8"]');
          for (const option of options) {
            if (
              option.textContent.includes('AMAZON.IT') ||
              option.getAttribute('rel') === 'domain'
            ) {
              option.click();
              return true;
            }
          }
          // Fallback: just click any element with setting="8"
          const fallback = document.querySelector('[setting="8"]');
          if (fallback) {
            fallback.click();
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
      console.log(`   ⚠️  Error selecting domain: ${error.message}`);
    }

    // Navigate to deals page
    console.log('\n🛒 Navigating to Deals page...');
    try {
      await page.goto('https://keepa.com/#!deals', {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });
      page.mouse.move(423, 354);
      page.mouse.move(320, 530);

      console.log('   ✅ Deals page loaded successfully');
    } catch (error) {
      console.warn(`   ⚠️  Navigation timeout: ${error.message}`);
    }

    // Wait for page to fully render
    await delay(5000);

    // Verify domain is set to Italy
    console.log('\n🇮🇹 Verifying Amazon.it domain...');
    const domainCheck = await page.evaluate(() => {
      const domainElement = document.querySelector('.languageMenuImg[rel="domain"]');
      const domainText = domainElement ? domainElement.textContent : '';
      const isVisible = domainElement
        ? domainElement.offsetWidth > 0 && domainElement.offsetHeight > 0
        : false;

      return {
        text: domainText,
        visible: isVisible,
        exists: !!domainElement,
      };
    });

    console.log(`   Domain element exists: ${domainCheck.exists ? 'Yes' : 'No'}`);
    console.log(`   Domain element visible: ${domainCheck.visible ? 'Yes' : 'No'}`);
    console.log(`   Domain text: "${domainCheck.text}"`);

    if (!domainCheck.text.includes('.it')) {
      console.log('   ⚠️  WARNING: Domain is NOT set to .it!');
      console.log('   🔄 Attempting manual fix...');

      // Try to set domain manually
      await page.click('.languageMenuImg[rel="domain"]').catch(() => {});
      await delay(1500);
      await page.evaluate(() => {
        const italyOption = document.querySelector('span[rel="domain"][setting="8"]');
        if (italyOption) italyOption.click();
      });
      await delay(5000);

      // Check again
      const newDomain = await page.evaluate(() => {
        const el = document.querySelector('.languageMenuImg[rel="domain"]');
        return el ? el.textContent : '';
      });
      console.log(`   After fix, domain: "${newDomain}"`);
    } else {
      console.log('   ✅ Domain correctly set to Amazon.it');
    }

    // Select Italian language for Keepa interface
    console.log('\n🇮🇹 Selecting Italian language for Keepa...');
    try {
      // Click directly on the Italian language flag
      const italianSelected = await page.evaluate(() => {
        // Find Italian language element with setting="8" and rel="language"
        const italianFlag = document.querySelector('img[rel="language"][setting="8"]');
        if (italianFlag) {
          italianFlag.click();
          return true;
        }
        return false;
      });

      if (italianSelected) {
        console.log('   ✅ Italian language selected!');
        await delay(4000);
      } else {
        console.log('   ⚠️  Could not find Italian language option');

        // Try alternative method: look for id="lang_it"
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
      console.log(`   ⚠️  Error selecting language: ${error.message}`);
    }

    // Check if there's a Cloudflare challenge
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

    // Click on "Nuovo, Gestito da Amazon" filter
    console.log('\n📦 Selecting "Nuovo, Gestito da Amazon" filter...');
    try {
      const filterClicked = await page.evaluate(() => {
        // Use XPath to find the exact div: //*[@id="dealPriceTypesFilter"]/div[6]
        const container = document.getElementById('dealPriceTypesFilter');
        if (container) {
          const divs = container.querySelectorAll(':scope > div');
          const targetDiv = divs[5]; // div[6] in XPath = index 5 in array (0-based)

          if (targetDiv) {
            targetDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetDiv.click();
            console.log('Found text:', targetDiv.textContent?.trim());
            return true;
          }
        }
        return false;
      });

      if (filterClicked) {
        console.log('   ✅ "Nuovo, Gestito da Amazon" filter selected!');
        await delay(2000); // Wait for filter to take effect
      } else {
        console.log('   ⚠️  Could not find "Nuovo, Gestito da Amazon" filter at XPath');
      }
    } catch (error) {
      console.log(`   ⚠️  Error selecting filter: ${error.message}`);
    }

    // DEBUG: Uncomment to save initial screenshot and HTML
    // console.log('   📸 Taking screenshot of page state...');
    // await page.screenshot({
    //   path: `./output/keepa-loaded.png`,
    //   fullPage: false,
    // }).catch(() => {});
    // console.log('   📸 Screenshot saved');
    // console.log('   💾 Saving page HTML for analysis...');
    // const htmlContent = await page.content();
    // const fs = await import('fs/promises');
    // await fs.writeFile('./output/keepa-page.html', htmlContent).catch(() => {});
    // console.log('   ✅ HTML saved to output/keepa-page.html');

    // Click "Find Deals!" button to load products
    console.log('\n🔘 Looking for "Find Deals!" button...');
    try {
      // Wait for button to exist
      await page.waitForSelector('#submitDealQuery', { timeout: 5000 });
      console.log('   ✅ Found "Find Deals!" button');

      // Click using JavaScript
      console.log('   🖱️  Clicking button via JavaScript...');
      await page.evaluate(() => {
        const button = document.querySelector('#submitDealQuery');
        if (button) {
          button.click();
          return true;
        }
        return false;
      });

      console.log('   ⏳ Waiting for products container to appear...');
      console.log('   ⏰ Max wait time: 60 seconds');

      // Wait for #productPage0 to have content (max 60 seconds)
      let productPageReady = false;
      const maxWaitTime = 60000; // 60 seconds
      const checkInterval = 2000; // check every 2 seconds
      const startTime = Date.now();

      while (!productPageReady && Date.now() - startTime < maxWaitTime) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`   ⏱️  Checking... (${elapsed}s elapsed)`);

        productPageReady = await page.evaluate(() => {
          const productPage = document.querySelector('#productPage0');
          const loadingIcon = document.querySelector('#loadingIcon');
          const loadingVisible = loadingIcon && loadingIcon.style.display !== 'none';

          // Check if products are loaded (productPage has content AND loading is done)
          if (productPage) {
            const hasContent = productPage.innerHTML.trim().length > 50;
            const notLoading = !loadingVisible;
            return hasContent && notLoading;
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
        console.log(
          '   💡 Nota: Potrebbe essere necessario selezionare filtri/categorie manualmente'
        );
      }

      // DEBUG: Uncomment to save HTML and screenshot after click
      // console.log('   💾 Saving HTML after "Find Deals!" click...');
      // const htmlAfterClick = await page.content();
      // await fs.writeFile('./output/keepa-after-click.html', htmlAfterClick).catch(() => {});
      // await page.screenshot({
      //   path: `./output/keepa-after-click.png`,
      //   fullPage: true,
      // }).catch(() => {});
      // console.log('   ✅ HTML and screenshot saved');
    } catch (error) {
      console.log('   ⚠️  Could not interact with "Find Deals!" button:', error.message);
    }

    // Skip extracting products from general page - go directly to categories
    console.log('\n⏭️  Skipping general page extraction - navigating directly to categories...');

    // DEBUG: Uncomment to see page state
    // const pageDebug = await page.evaluate(() => {
    //   const productPage = document.querySelector('#productPage0');
    //   return {
    //     totalLinks: document.querySelectorAll('a').length,
    //     productLinks: document.querySelectorAll('a[href*="/product/"]').length,
    //     productPageHTML: productPage ? productPage.innerHTML.substring(0, 300) : null,
    //   };
    // });
    // console.log('   Debug info:', JSON.stringify(pageDebug, null, 2));

    // Navigate to each category and extract products
    console.log('\n🔍 Navigating through selected categories...');

    for (const categoryId of config.keepa.categories) {
      const categoryName = CATEGORY_NAMES[categoryId];
      if (!categoryName) {
        console.log(`   ⚠️  Category ID ${categoryId} not found in CATEGORY_NAMES`);
        continue;
      }

      console.log(`\n   🎯 Processing: "${categoryName}" (ID: ${categoryId})`);

      try {
        // Find and click the <a> tag containing the category name
        const clicked = await page.evaluate(targetCategory => {
          // Search all <a> tags for the category name
          const links = Array.from(document.querySelectorAll('a'));
          const categoryLink = links.find(link => {
            const text = link.textContent?.trim() || '';
            return text === targetCategory || text.includes(targetCategory);
          });

          if (categoryLink) {
            categoryLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
            categoryLink.click();
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

        // Wait for #productPage0 to update with new products (max 30 seconds)
        let productsReady = false;
        const maxWait = 30000;
        const checkInt = 2000;
        const start = Date.now();

        while (!productsReady && Date.now() - start < maxWait) {
          productsReady = await page.evaluate(() => {
            const productPage = document.querySelector('#productPage0');
            const loadingIcon = document.querySelector('#loadingIcon');
            const isLoading = loadingIcon && loadingIcon.style.display !== 'none';

            if (productPage && !isLoading) {
              const hasContent = productPage.innerHTML.trim().length > 50;
              return hasContent;
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

        // Extract products with full details (ASIN, prices, discount)
        const categoryProducts = await page.evaluate(() => {
          const products = [];
          const seen = new Set();

          // Extract from Keepa internal links (href="#!product/8-ASIN")
          const keepaLinks = document.querySelectorAll('a[href*="#!product/"]');

          for (const link of keepaLinks) {
            const href = link.getAttribute('href');
            if (!href) continue;

            const match = href.match(/#!product\/\d+-([A-Z0-9]{10})/);
            if (!match || !match[1] || seen.has(match[1])) continue;

            const asin = match[1];
            seen.add(asin);

            // Find the product row/container by traversing up from the link
            let productContainer = link;
            while (productContainer && !productContainer.classList.contains('productRow')) {
              productContainer = productContainer.parentElement;
            }

            // If no productRow found, try to find any parent div with product data
            if (!productContainer) {
              productContainer =
                link.closest('div[style*="flex"]') || link.closest('tr') || link.parentElement;
            }

            // Extract discount percentage from span.productSmallPercent-24
            let discount = null;
            if (productContainer) {
              const discountSpan = productContainer.querySelector('span.productSmallPercent-24');
              if (discountSpan) {
                const discountText = discountSpan.textContent.trim();
                // Extract number from text like "-15%" to get "15"
                const match = discountText.match(/(-?\d+)/);
                if (match) {
                  discount = parseInt(match[1]);
                }
              }
            }

            // Extract prices
            // avgPrice: from span.productPriceTableTdSmallS
            // currentPrice: from span.productPriceTableTdLargeS
            let avgPrice = null;
            let currentPrice = null;
            if (productContainer) {
              // Extract average price from span.productPriceTableTdSmallS
              const avgPriceSpan = productContainer.querySelector('span.productPriceTableTdSmallS');
              if (avgPriceSpan) {
                const avgText = avgPriceSpan.textContent.trim();
                const avgMatch = avgText.match(/(\d+[.,]\d+)/);
                if (avgMatch) avgPrice = parseFloat(avgMatch[1].replace(',', '.'));
              }

              // Extract current (discounted) price from span.productPriceTableTdLargeS
              const currPriceSpan = productContainer.querySelector(
                'span.productPriceTableTdLargeS'
              );
              if (currPriceSpan) {
                const currText = currPriceSpan.textContent.trim();
                const currMatch = currText.match(/(\d+[.,]\d+)/);
                if (currMatch) currentPrice = parseFloat(currMatch[1].replace(',', '.'));
              }
            }

            products.push({
              asin,
              discount,
              avgPrice,
              currentPrice,
            });

            // LIMIT: Only 10 products per category
            if (products.length >= 10) break;
          }

          return products;
        });

        console.log(`   📦 Extracted ${categoryProducts.length} products with pricing`);

        // Show first 3 products for verification
        if (categoryProducts.length > 0) {
          const sample = categoryProducts.slice(0, 3);
          sample.forEach(p => {
            const priceInfo = p.avgPrice
              ? ` (avg: €${p.avgPrice}, current: €${p.currentPrice}, discount: ${p.discount}%)`
              : '';
            console.log(`   🔍 ${p.asin}${priceInfo}`);
          });
        }

        // Add products to the list with category name
        for (const product of categoryProducts) {
          if (!allProducts.find(p => p.asin === product.asin)) {
            allProducts.push({
              asin: product.asin,
              category: categoryName,
              discount: product.discount,
              avgPrice: product.avgPrice,
              currentPrice: product.currentPrice,
            });
          }
        }

        // DEBUG: Uncomment to save screenshots per category
        // await page.screenshot({
        //   path: `./output/keepa-category-${categoryId}.png`,
        //   fullPage: false,
        // }).catch(() => {});

        // Delay before next category
        await delay(config.keepa.scrapingDelayMs);
      } catch (error) {
        console.log(`   ❌ Error processing "${categoryName}": ${error.message}`);
        continue;
      }
    }

    console.log(`\n🎉 Total products scraped: ${allProducts.length}`);

    // Keep browser open for 10 seconds so user can see results
    console.log('\n⏳ Keeping browser open for 10 seconds...');
    await delay(10000);

    await browser.close();
    return allProducts;
  } catch (error) {
    console.error('\n❌ Scraping error:', error.message);
    console.error('Stack trace:', error.stack);

    if (browser) {
      console.log('\n⏳ Keeping browser open for 10 seconds so you can see what happened...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      await browser.close();
    }

    throw error;
  }
}

// Test execution if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeKeepaDeals()
    .then(products => {
      console.log('\n📋 Scraped products:', JSON.stringify(products, null, 2));
    })
    .catch(console.error);
}
