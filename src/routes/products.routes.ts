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
    const limit = Math.min(parseInt(String(req.query.limit ?? '50')), 200);
    const offset = parseInt(String(req.query.offset ?? '0'));
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
    const product = await getProductByAsin(req.params.asin.toUpperCase());
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.json(product);
  } catch (err) {
    next(err);
  }
});
