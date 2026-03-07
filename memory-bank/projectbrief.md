# Project Brief - Keepa Tracker

## Overview

Keepa Tracker is a Node.js tool that automates the discovery and publication of Amazon product deals for affiliate marketing. It scrapes the Keepa website for discounted products, enriches them with Amazon product data and affiliate links, and generates ready-to-publish content for WhatsApp and Telegram groups.

## Core Requirements

### Current (v0.0.4 - CLI Pipeline)

- Scrape Keepa deals by configurable categories (headless browser via puppeteer-real-browser)
- Fetch product details from Amazon Creators API (OAuth 2.0 / Cognito)
- Generate affiliate links (universal deep links + optional storefront links)
- Output: JSON files, Excel tracker, HTML page for social media copy-paste, image collages
- Single user, macOS, manual execution

### Target (v1.0.0 - Dockerized Server)

- **Dockerized Express + Prisma + PostgreSQL** server application
- RESTful API replacing CLI entry points
- Persistent data storage in PostgreSQL (replace JSON/Excel/HTML outputs)
- Scheduled scraping via cron
- TypeScript migration
- Remove all user-friendly file outputs (Excel, HTML, image collages)
- Platform agnostic (no macOS dependencies)

## Goals

1. Transform from single-user CLI tool to a deployable server application
2. Enable historical data tracking and analysis via database
3. Provide API endpoints for deal discovery and product data
4. Maintain Keepa scraping and Amazon API integration capabilities
5. Improve code quality with TypeScript and proper testing

## Scope Boundaries

- **In scope:** Keepa scraping, Amazon API integration, data persistence, REST API
- **Out of scope (for now):** Frontend UI, user authentication, multi-tenant support
