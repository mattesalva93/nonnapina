import axios from 'axios';
import sharp from 'sharp';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('ImageService');

// ─── Layout constants ─────────────────────────────────────────────────────────

const CANVAS_WIDTH = 1200;
const BANNER_HEIGHT = 120;
const IMAGE_SIZE = 240;
const IMAGE_GAP = 30;
const IMAGE_PADDING_Y = 30;
const ROW_GAP = 40;
const BADGE_DIAMETER = 64;

// ─── SVG builders ─────────────────────────────────────────────────────────────

function createBannerSvg(width: number, height: number): Buffer {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="50%" stop-color="#16213e"/>
      <stop offset="100%" stop-color="#0f3460"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <text x="${width / 2}" y="${height / 2 + 2}"
        font-family="Arial,Helvetica,sans-serif" font-size="38" font-weight="bold"
        fill="#FFD700" text-anchor="middle" dominant-baseline="middle"
        letter-spacing="2">&#9733; TOP 5 DEALS DEL GIORNO &#9733;</text>
</svg>`;
  return Buffer.from(svg);
}

function createBadgeSvg(discount: number): Buffer {
  const d = BADGE_DIAMETER;
  const r = d / 2 - 1;
  const fontSize = discount >= 100 ? 11 : 14;
  const svg = `<svg width="${d}" height="${d}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${d / 2}" cy="${d / 2}" r="${r}" fill="#e74c3c" stroke="#fff" stroke-width="2"/>
  <text x="${d / 2}" y="${d / 2 + 1}"
        font-family="Arial,Helvetica,sans-serif" font-size="${fontSize}" font-weight="bold"
        fill="#fff" text-anchor="middle" dominant-baseline="middle">-${discount}%</text>
</svg>`;
  return Buffer.from(svg);
}

function createPlaceholderSvg(): Buffer {
  const svg = `<svg width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" fill="#f0f0f0" rx="8"/>
  <text x="${IMAGE_SIZE / 2}" y="${IMAGE_SIZE / 2}"
        font-family="Arial,sans-serif" font-size="14" fill="#999"
        text-anchor="middle" dominant-baseline="middle">No Image</text>
</svg>`;
  return Buffer.from(svg);
}

// ─── Image downloading ────────────────────────────────────────────────────────

async function downloadImage(url: string): Promise<Buffer | undefined> {
  try {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 10_000,
    });
    return Buffer.from(response.data);
  } catch (err) {
    logger.warn({ url, error: (err as Error).message }, 'Failed to download product image');
    return undefined;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface Top5ImageDeal {
  imageUrl: string | undefined;
  discount: number;
}

export async function generateTop5Image(deals: Top5ImageDeal[]): Promise<Buffer> {
  const count = deals.length;
  const firstRowCount = Math.min(3, count);
  const secondRowCount = count - firstRowCount;

  const firstRowWidth = firstRowCount * IMAGE_SIZE + Math.max(0, firstRowCount - 1) * IMAGE_GAP;
  const secondRowWidth =
    secondRowCount > 0
      ? secondRowCount * IMAGE_SIZE + Math.max(0, secondRowCount - 1) * IMAGE_GAP
      : 0;

  const canvasHeight =
    BANNER_HEIGHT +
    IMAGE_PADDING_Y +
    IMAGE_SIZE +
    (secondRowCount > 0 ? ROW_GAP + IMAGE_SIZE : 0) +
    IMAGE_PADDING_Y;

  // Download and resize all product images
  const productImages: Buffer[] = [];
  for (const deal of deals) {
    let raw: Buffer | undefined;
    if (deal.imageUrl) {
      raw = await downloadImage(deal.imageUrl);
    }

    if (raw) {
      const resized = await sharp(raw)
        .resize(IMAGE_SIZE, IMAGE_SIZE, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .png()
        .toBuffer();
      productImages.push(resized);
    } else {
      productImages.push(createPlaceholderSvg());
    }
  }

  // Build composite layers
  const composites: sharp.OverlayOptions[] = [
    { input: createBannerSvg(CANVAS_WIDTH, BANNER_HEIGHT), top: 0, left: 0 },
  ];

  // First row (centered)
  const firstRowLeft = Math.round((CANVAS_WIDTH - firstRowWidth) / 2);
  const firstRowY = BANNER_HEIGHT + IMAGE_PADDING_Y;
  for (let i = 0; i < firstRowCount; i++) {
    const x = firstRowLeft + i * (IMAGE_SIZE + IMAGE_GAP);
    composites.push({ input: productImages[i], top: firstRowY, left: x });
    composites.push({
      input: createBadgeSvg(deals[i].discount),
      top: firstRowY - 8,
      left: x + IMAGE_SIZE - BADGE_DIAMETER + 8,
    });
  }

  // Second row (centered)
  if (secondRowCount > 0) {
    const secondRowLeft = Math.round((CANVAS_WIDTH - secondRowWidth) / 2);
    const secondRowY = firstRowY + IMAGE_SIZE + ROW_GAP;
    for (let i = 0; i < secondRowCount; i++) {
      const x = secondRowLeft + i * (IMAGE_SIZE + IMAGE_GAP);
      const idx = firstRowCount + i;
      composites.push({ input: productImages[idx], top: secondRowY, left: x });
      composites.push({
        input: createBadgeSvg(deals[idx].discount),
        top: secondRowY - 8,
        left: x + IMAGE_SIZE - BADGE_DIAMETER + 8,
      });
    }
  }

  const image = await sharp({
    create: {
      width: CANVAS_WIDTH,
      height: canvasHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  logger.info(
    { width: CANVAS_WIDTH, height: canvasHeight, dealCount: count },
    'Top 5 image generated'
  );
  return image;
}
