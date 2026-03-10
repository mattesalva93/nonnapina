# [TASK005] - Research: Amazon API Deals Integration

**Status:** Completed
**Added:** 2026-03-09
**Updated:** 2026-03-09

## Original Request

"Sarebbe possibile ottenere dalle API di Amazon stesse l'elenco delle offerte odierne presenti ufficialmente su Amazon?"

## Research Summary

### Can the Amazon Creators API (or PA-API 5.0) provide today's official deals?

**Short answer: No — there is no "browse deals" or "list today's deals" endpoint.**

Neither the PA-API 5.0 (deprecated April 30, 2026) nor the Creators API has an operation to retrieve a list of current deals/offers. The only 4 operations available are:

1. **GetItems** — fetch product details by ASIN (up to 10 ASINs per request)
2. **SearchItems** — search products by keywords, returns max 10 results per page, max 10 pages
3. **GetVariations** — get product variations
4. **GetBrowseNodes** — get category tree information

### What CAN the API tell us about deals?

The `OffersV2.Listings.DealDetails` resource (available in GetItems, SearchItems, GetVariations) reveals whether a **specific product** currently has an active deal:

- **DealDetails.AccessType**: `ALL` | `PRIME_EXCLUSIVE` | `PRIME_EARLY_ACCESS`
- **DealDetails.Badge**: e.g., "Limited time deal", "With Prime", "Black Friday Deal", "Ends In"
- **DealDetails.StartTime** / **EndTime**: UTC timestamps of the deal window
- **DealDetails.PercentClaimed**: percentage of deal capacity consumed (lightning deals)
- **Listing.Type**: `LIGHTNING_DEAL` | `SUBSCRIBE_AND_SAVE` (or absent for regular deals)

**Key limitation**: You must already know the ASIN to check if it has a deal. You cannot discover deals.

### SearchItems with MinSavingPercent — a partial workaround

`SearchItems` supports a `MinSavingPercent` parameter (1–99) which filters results to items with at least that savings percentage. Combined with:

- `BrowseNodeId` (category filter)
- `Merchant: "Amazon"` (Amazon-only offers)
- `Condition: "New"`
- `MinReviewsRating` (minimum review rating)
- `OffersV2.Listings.DealDetails` resource

This could theoretically find discounted products, but:

- **Max 100 results per query** (10 items × 10 pages)
- **Requires a keyword** (at least one of Keywords, Brand, Title, Actor, etc.)
- **No "deal-only" filter** — `MinSavingPercent` catches any discount, not only official Amazon deals
- **Rate limits**: 1 TPS initial, 8640 TPD; scales with affiliate revenue ($0.05 shipped = 1 TPD)
- Not practical for comprehensive deal discovery

### Alternative Option A: Keepa API (programmatic, paid)

The Keepa API has a dedicated `/deal` endpoint (`DealRequest`) that supports:

- `priceTypes`, `dateRange`, `deltaPercentRange`, `currentRange`, `salesRankRange`
- `isLowest`, `isLowest90`, `isLowestOffer` (minimum price filters)
- `hasReviews`, `filterErotic`, `singleVariation`, `isPrimeExclusive`
- `mustHaveAmazonOffer`, `mustNotHaveAmazonOffer`
- `includeCategories`, `excludeCategories`
- `brand`, `manufacturer`, `minRating`, `warehouseConditions`
- `titleSearch`, `sortType`, `isBackInStock`, `isOutOfStock`
- Pagination: max 150 deals per page, cached for 120 seconds

There is also a `/lightningdeal` endpoint for all current/upcoming lightning deals, updated every 10 minutes.

**Cost**: Keepa API requires a paid subscription with token-based pricing. Each deal request costs tokens. Pricing tiers are available on keepa.com.

**Pros**: Direct access to deal discovery (exactly what our scraper does, but via API), comprehensive filtering, no browser/Puppeteer needed, much faster and more reliable than scraping.

**Cons**: Additional cost (subscription + tokens), adds a third-party API dependency for deal discovery.

### Alternative Option B: Amazon SP-API (Selling Partner API)

Has deal-related endpoints but requires a **seller account**, not an affiliate account. Not applicable for our use case.

### Alternative Option C: Scraping Amazon's deals page

Scraping `amazon.it/deals` directly would provide today's official deals, but:

- Violates Amazon's Terms of Service
- Much harder to bypass anti-bot protections compared to Keepa
- Fragile and maintenance-heavy

## Conclusion and Recommendations

| Approach                       | Feasibility                                                       | Recommended            |
| ------------------------------ | ----------------------------------------------------------------- | ---------------------- |
| Creators API "browse deals"    | Not possible — endpoint doesn't exist                             | No                     |
| SearchItems + MinSavingPercent | Partial — max 100 results, requires keywords, not deal-specific   | No                     |
| GetItems + DealDetails check   | Only for known ASINs (already scraped) — useful for enrichment    | Yes (already usable)   |
| Keepa API `/deal` endpoint     | Full deal discovery via API, same as web scraper but programmatic | Yes (if budget allows) |
| Keepa API `/lightningdeal`     | Lightning deals specifically, updated every 10 min                | Yes (if budget allows) |
| Amazon SP-API                  | Requires seller account                                           | No                     |
| Scraping Amazon deals page     | ToS violation, fragile                                            | No                     |

### Recommended approach

1. **Keep the current Keepa web scraper** as the primary deal discovery method — it works and has no additional API cost.
2. **Enhance the existing Amazon Creators API integration** to request `OffersV2.Listings.DealDetails` when fetching product details. This enriches already-discovered deals with official Amazon deal metadata (deal type, badge, start/end times, percent claimed).
3. **Consider the Keepa API** as a future upgrade if the web scraper becomes unreliable or if faster/more comprehensive deal discovery is needed. The `/deal` endpoint provides exactly what the scraper does, but programmatically and more reliably.

### Actionable enhancement (no new API required)

Add `OffersV2.Listings.DealDetails` to the resources requested in `amazon.ts` → `getProductDetails()`. This gives us:

- Whether the product has an official Amazon deal (not just a Keepa-detected price drop)
- The deal type (Lightning Deal, Prime Exclusive, Limited Time)
- The deal badge text
- Start/end timestamps and percent claimed

This data can be stored in new Deal model fields (e.g., `amazonDealType`, `amazonDealBadge`, `amazonDealEndTime`).

## Progress Log

### 2026-03-09

- Researched PA-API 5.0 documentation (SearchItems, OffersV2, DealDetails, API Rates)
- Researched Creators API capabilities (4 operations, no deals endpoint)
- Researched Keepa API backend (DealRequest.java, Request.java) for deal and lightning deal endpoints
- Compiled comprehensive comparison of all approaches
- Delivered research report with actionable recommendations
