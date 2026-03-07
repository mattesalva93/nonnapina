import express from 'express';
import cron from 'node-cron';
import { config } from './config/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { dealsRouter } from './routes/deals.routes.js';
import { productsRouter } from './routes/products.routes.js';
import { scrapeRouter } from './routes/scrape.routes.js';
import { prisma } from './services/product.service.js';
import { logger } from './utils/logger.js';

const app = express();

// ─── Global middleware ────────────────────────────────────────────────────────
app.use(express.json());
app.use(requestLogger);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', timestamp: new Date().toISOString(), db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

app.use('/api/scrape', scrapeRouter);
app.use('/api/products', productsRouter);
app.use('/api/deals', dealsRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// ─── Error handler (must be last) ────────────────────────────────────────────
app.use(errorHandler);

// ─── Scheduled scraping ──────────────────────────────────────────────────────
// Runs every day at 08:00 (can be overridden via SCRAPE_CRON env var)
const cronSchedule = process.env.SCRAPE_CRON ?? '0 8 * * *';

if (config.server.nodeEnv !== 'test') {
  cron.schedule(cronSchedule, () => {
    logger.info({ schedule: cronSchedule }, 'Scheduled scrape triggered — POST /api/scrape');
    // Trigger via internal fetch to reuse the same code path
    fetch(`http://localhost:${config.server.port}/api/scrape`, { method: 'POST' }).catch(err => {
      logger.error({ err: (err as Error).message }, 'Scheduled scrape trigger failed');
    });
  });
  logger.info({ schedule: cronSchedule }, 'Scrape cron job registered');
}

// ─── Start server ─────────────────────────────────────────────────────────────
const { port } = config.server;

app.listen(port, () => {
  logger.info({ port, env: config.server.nodeEnv }, `Server running on port ${port}`);
});

export { app };
