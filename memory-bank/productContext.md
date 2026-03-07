# Product Context - Keepa Tracker

## Why This Project Exists

The project automates a manual workflow for Amazon affiliate marketing: finding deals on Keepa, looking up product details on Amazon, generating affiliate links, and publishing formatted posts to social media groups (WhatsApp/Telegram).

## Problems It Solves

1. **Time-consuming manual deal discovery:** Automates Keepa browsing and product data collection
2. **Repetitive affiliate link generation:** Automatically creates universal deep links with partner tags
3. **Content formatting for social media:** Generates copy-paste ready content with product images and details
4. **Deal tracking and history:** Maintains price history and deal records over time

## How It Should Work

### Current Flow (CLI)

1. User configures `.env` with Amazon credentials, categories, and preferences
2. User runs `npm start`
3. Headless browser opens Keepa, scrapes deals by category
4. Amazon Creators API enriches products with details and pricing
5. Output files generated: JSON, Excel tracker, HTML page (on Desktop), image collage
6. User manually copies content from HTML page to WhatsApp/Telegram

### Target Flow (Server)

1. Server runs in Docker with PostgreSQL
2. Scheduled cron job triggers Keepa scraping
3. Products are enriched via Amazon API and persisted to database
4. REST API exposes deal data, product history, and scraping status
5. Data consumed via API instead of file outputs

## User Experience Goals

- Reliable automated scraping with error recovery
- Historical price and deal data accessible via API
- Clean, queryable product database
- Easy deployment via Docker Compose
