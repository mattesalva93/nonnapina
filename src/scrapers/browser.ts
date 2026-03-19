/// <reference lib="dom" />
import { execSync } from 'node:child_process';
import { connect } from 'puppeteer-real-browser';
import type { Browser, Page } from 'rebrowser-puppeteer-core';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('Browser');

const BROWSER_ARGS = [
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

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export function killStaleChromiumProcesses(): void {
  try {
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
    logger.debug('No stale Chromium processes found');
  }
}

async function ensureXvfbReady(maxWaitMs = 10_000): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    try {
      execSync('xdpyinfo -display :99 >/dev/null 2>&1', { timeout: 3000 });
      logger.debug('Xvfb display :99 is ready');
      return;
    } catch {
      await delay(500);
    }
  }

  logger.warn('Xvfb not detected — attempting to start it');
  try {
    execSync('Xvfb :99 -screen 0 1280x800x24 -nolisten tcp &', {
      stdio: 'ignore',
      env: { ...process.env, DISPLAY: ':99' },
    });
    await delay(2000);
    logger.info('Xvfb started on display :99');
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Could not start Xvfb');
  }
}

export async function launchBrowser(retries = 3): Promise<{ browser: Browser; page: Page }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      killStaleChromiumProcesses();
      await delay(1000);
      await ensureXvfbReady();

      logger.info({ attempt, retries }, 'Launching browser');

      const { browser, page } = await connect({
        headless: false,
        args: BROWSER_ARGS,
        customConfig: {},
        turnstile: true,
        connectOption: {
          defaultViewport: undefined,
          protocolTimeout: 30_000,
        },
        disableXvfb: false,
        ignoreAllFlags: false,
      });

      const title = await page.evaluate(() => document.title).catch(() => undefined);
      if (title === undefined) {
        throw new Error('Browser launched but page is not responsive');
      }

      await page.setViewport({ width: 1280, height: 800 });
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      logger.info({ attempt }, 'Browser launched and verified');
      return { browser, page };
    } catch (error) {
      const msg = (error as Error).message;
      logger.error({ attempt, retries, err: msg }, 'Browser launch failed');

      if (attempt === retries) {
        throw new Error(`Browser launch failed after ${retries} attempts: ${msg}`);
      }

      const waitMs = 5000 * Math.pow(2, attempt - 1);
      logger.warn({ retryInSec: waitMs / 1000 }, 'Waiting before next attempt');
      await delay(waitMs);
    }
  }

  throw new Error('Browser launch failed — unreachable');
}

export async function closeBrowser(browser: Browser | undefined): Promise<void> {
  if (!browser) return;

  const keepOpenMs = parseInt(process.env.BROWSER_KEEP_OPEN_MS ?? '3000', 10);
  if (keepOpenMs > 0) await delay(keepOpenMs);

  try {
    await browser.close();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'browser.close() failed — force-killing');
  }

  killStaleChromiumProcesses();
}

export async function isPageAlive(page: Page, timeoutMs = 10_000): Promise<boolean> {
  try {
    await Promise.race([
      page.evaluate(() => document.title),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('isPageAlive timeout')), timeoutMs)
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export class MouseHeartbeat {
  private page: Page | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  start(page: Page, intervalMs = 20_000): void {
    this.stop();
    this.page = page;
    this.running = true;
    this.timer = setInterval(() => void this.pulse(), intervalMs);
    logger.debug({ intervalMs }, 'Mouse heartbeat started');
  }

  updatePage(page: Page): void {
    this.page = page;
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.running = false;
    this.page = undefined;
    logger.debug('Mouse heartbeat stopped');
  }

  private async pulse(): Promise<void> {
    if (!this.running || !this.page) return;
    try {
      const moves = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < moves; i++) {
        const x = 200 + Math.random() * 800;
        const y = 150 + Math.random() * 500;
        await this.page.mouse.move(x, y, { steps: 3 });
        await delay(100 + Math.random() * 200);
      }
    } catch {
      // Page likely dead — main loop handles recovery
    }
  }
}

export async function simulateMouseBurst(page: Page, count = 15): Promise<void> {
  try {
    for (let i = 0; i < count; i++) {
      const x = 100 + Math.random() * 1000;
      const y = 100 + Math.random() * 600;
      await page.mouse.move(x, y, { steps: 5 });
      await delay(200 + Math.random() * 300);
    }
    await delay(8000);
    logger.debug('Mouse burst complete');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Mouse burst failed');
  }
}
