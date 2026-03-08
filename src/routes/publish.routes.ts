import { Router } from 'express';
import { prisma } from '../services/product.service.js';
import { buildPostContent, runPublishCycle, selectNextDeal } from '../services/publish.service.js';
import { getDailySchedule, getNextScheduledSlot } from '../services/scheduler.service.js';
import {
  buildTop5PostContent,
  computeTop5Score,
  runTop5PublishCycle,
  selectTop5Deals,
} from '../services/top5.service.js';
import { logger } from '../utils/logger.js';

export const publishRouter = Router();

/**
 * GET /api/publish
 * Returns past publications, most recent first.
 */
publishRouter.get('/', async (req, res, next) => {
  try {
    const rawLimit = parseInt(String(req.query.limit ?? '50'), 10);
    const rawOffset = parseInt(String(req.query.offset ?? '0'), 10);
    const limit = Math.min(Number.isNaN(rawLimit) || rawLimit < 0 ? 50 : rawLimit, 200);
    const offset = Number.isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;

    const publications = await prisma.publication.findMany({
      orderBy: { publishedAt: 'desc' },
      include: { deal: { include: { product: true } } },
      take: limit,
      skip: offset,
    });

    res.json({ data: publications, limit, offset, count: publications.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/publish/next
 * Preview the next deal that would be selected for publishing (dry run).
 */
publishRouter.get('/next', async (_req, res, next) => {
  try {
    const deal = await selectNextDeal();
    if (!deal) {
      res.json({
        message: 'No unpublished deals available',
        deal: null,
        postPreview: null,
        nextScheduledAt: null,
        todaySchedule: getDailySchedule(),
      });
      return;
    }

    const postPreview = buildPostContent(deal);
    res.json({
      deal,
      postPreview,
      nextScheduledAt: getNextScheduledSlot() ?? null,
      todaySchedule: getDailySchedule(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/publish
 * Manually triggers one publish cycle.
 * Returns 200 with the result, or 204 if no deals are available.
 */
publishRouter.post('/', async (_req, res, next) => {
  try {
    const result = await runPublishCycle();
    if (!result) {
      res.status(204).end();
      return;
    }
    logger.info({ dealId: result.dealId }, 'Manual publish cycle completed');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/publish/top5/preview
 * Preview the top 5 deals that would be selected for today's summary post.
 */
publishRouter.get('/top5/preview', async (_req, res, next) => {
  try {
    const deals = await selectTop5Deals();
    if (deals.length === 0) {
      res.json({
        message: 'No eligible deals found for top 5 today',
        deals: [],
        postPreview: null,
      });
      return;
    }

    const postPreview = buildTop5PostContent(deals);
    const scored = deals.map(d => ({
      asin: d.asin,
      title: d.product.title,
      discount: d.discount,
      rating: d.rating,
      reviewCount: d.reviewCount,
      score: computeTop5Score(d.discount ?? 0, d.rating ?? 0, d.reviewCount ?? 0),
    }));

    res.json({ deals: scored, postPreview });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/publish/top5
 * Manually triggers the top 5 daily summary publish cycle.
 * Returns 200 with the result, or 204 if no deals are available.
 */
publishRouter.post('/top5', async (_req, res, next) => {
  try {
    const result = await runTop5PublishCycle();
    if (!result) {
      res.status(204).end();
      return;
    }
    logger.info({ dealCount: result.dealCount }, 'Manual top 5 publish cycle completed');
    res.json(result);
  } catch (err) {
    next(err);
  }
});
