import { Router } from 'express';
import { getProductByAsin, getProducts } from '../services/product.service.js';

export const productsRouter = Router();

/**
 * GET /api/products
 * Returns a paginated list of products.
 * Query params: limit (default 50), offset (default 0)
 */
productsRouter.get('/', async (req, res, next) => {
  try {
    const rawLimit = parseInt(String(req.query.limit ?? '50'), 10);
    const rawOffset = parseInt(String(req.query.offset ?? '0'), 10);
    const limit = Math.min(Number.isNaN(rawLimit) || rawLimit < 0 ? 50 : rawLimit, 200);
    const offset = Number.isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;
    const products = await getProducts({ limit, offset });
    res.json({ data: products, limit, offset, count: products.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/products/:asin
 * Returns a single product with its last 10 deals.
 */
productsRouter.get('/:asin', async (req, res, next) => {
  try {
    const asin = req.params.asin.toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin)) {
      res.status(400).json({ error: 'Invalid ASIN format' });
      return;
    }
    const product = await getProductByAsin(asin);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.json(product);
  } catch (err) {
    next(err);
  }
});
