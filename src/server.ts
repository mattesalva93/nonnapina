import express from 'express';
import cron from 'node-cron';
import { config, validateConfig } from './config/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimiter } from './middleware/rate-limiter.js';
import { requestLogger } from './middleware/request-logger.js';
import { dealsRouter } from './routes/deals.routes.js';
import { productsRouter } from './routes/products.routes.js';
import { publishRouter } from './routes/publish.routes.js';
import { runScrapeJob, scrapeRouter } from './routes/scrape.routes.js';
import { whatsappRouter } from './routes/whatsapp.routes.js';
import { sendErrorAlert } from './services/email.service.js';
import { getActiveRun, prisma, startScrapeRun } from './services/product.service.js';
import { initPublishScheduler } from './services/scheduler.service.js';
import { initWhatsApp } from './services/whatsapp.service.js';
import { localISOString } from './utils/date.js';
import { createComponentLogger } from './utils/logger.js';

const logger = createComponentLogger('Server');

if (config.server.nodeEnv !== 'test') {
  validateConfig();
}

const app = express();

// ─── Global middleware ────────────────────────────────────────────────────────
app.use(express.json({ limit: '100kb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (config.server.nodeEnv === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});
app.use(rateLimiter);
app.use(requestLogger);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.debug('Health check passed');
    res.json({ status: 'ok', timestamp: localISOString(), db: 'connected' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'Health check failed — database unreachable');
    void sendErrorAlert({
      errorMessage: `Health check failed: ${message}`,
      errorStack: err instanceof Error ? err.stack : undefined,
      component: 'HealthCheck',
      severity: 'critical',
      endpoint: '/health',
      httpMethod: 'GET',
      httpStatus: 503,
    });
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

app.use('/api/scrape', authMiddleware, scrapeRouter);
app.use('/api/products', authMiddleware, productsRouter);
app.use('/api/deals', authMiddleware, dealsRouter);
app.use('/api/publish', authMiddleware, publishRouter);
app.use('/api/whatsapp', authMiddleware, whatsappRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// ─── Error handler (must be last) ────────────────────────────────────────────
app.use(errorHandler);

// ─── Scheduled scraping ──────────────────────────────────────────────────────
// Runs every day at 08:00 (can be overridden via SCRAPE_CRON env var)
const { cronSchedule } = config.server;

if (config.server.nodeEnv !== 'test') {
  // Initialize WhatsApp client only when a channel is configured
  if (config.whatsapp.channelId) {
    void initWhatsApp().catch(err => {
      const message = (err as Error).message;
      logger.error({ err: message }, 'WhatsApp initialization failed');
      void sendErrorAlert({
        errorMessage: `WhatsApp initialization failed: ${message}`,
        errorStack: (err as Error).stack,
        component: 'WhatsAppInit',
        severity: 'error',
      });
    });
  } else {
    logger.info('WhatsApp not configured (WHATSAPP_CHANNEL_ID unset) — skipping initialization');
  }

  cron.schedule(cronSchedule, () => {
    logger.info({ schedule: cronSchedule }, 'Scheduled scrape triggered');
    void (async () => {
      try {
        const activeRun = await getActiveRun();
        if (activeRun) {
          logger.warn(
            { scrapeRunId: activeRun.id },
            'Scheduled scrape skipped — a job is already running'
          );
          return;
        }
        const run = await startScrapeRun();
        logger.info({ scrapeRunId: run.id }, 'Scheduled scrape run created');
        await runScrapeJob(run.id);
        logger.info({ scrapeRunId: run.id }, 'Scheduled scrape run completed');
      } catch (err) {
        const message = (err as Error).message;
        logger.error({ err: message }, 'Scheduled scrape failed');
        void sendErrorAlert({
          errorMessage: `Scheduled scrape failed: ${message}`,
          errorStack: (err as Error).stack,
          component: 'ScheduledScrape',
          severity: 'critical',
        });
      }
    })();
  });
  logger.info({ schedule: cronSchedule }, 'Scrape cron job registered');

  // ─── Scheduled publishing (randomised daily slots) ──────────────────────
  initPublishScheduler();
}

// ─── Start server ─────────────────────────────────────────────────────────────
const { port } = config.server;

app.listen(port, () => {
  logger.info({ port, env: config.server.nodeEnv }, `Server running on port ${port}`);
});

export { app };
