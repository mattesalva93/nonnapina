import axios from 'axios';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { CollageLayout, CollageProduct } from '../types/index.js';

class ImageGenerator {
  private readonly outputDir: string;

  constructor(outputDir = './output/assets') {
    this.outputDir = outputDir;
  }

  private async downloadImage(url: string): Promise<Buffer> {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      maxRedirects: 5,
    });
    return Buffer.from(response.data);
  }

  async createTopDealsCollage(
    products: CollageProduct[],
    outputFileName = 'top-5-deals.jpg'
  ): Promise<string> {
    const count = products?.length;
    if (!count || count < 3 || count > 5) {
      throw new Error(`Between 3 and 5 products are required for the collage (got ${count || 0})`);
    }

    const imageUrls = products.map(p => p.immagineLarge ?? p.immagineSmall);
    const discounts = products.map(p => parseFloat(String(p.percentualeSconto ?? 0)) || 0);

    if (imageUrls.some(url => !url)) {
      throw new Error('All products must have valid image URLs');
    }

    console.log('📥 Downloading product images...');

    const imageBuffers = await Promise.all(
      imageUrls.map(async (url, index) => {
        try {
          console.log(`  [${index + 1}/${count}] Downloading: ${url}`);
          return await this.downloadImage(url as string);
        } catch (error) {
          console.error(`  ❌ Failed to download image ${index + 1}: ${(error as Error).message}`);
          return this.createPlaceholder(280, 280);
        }
      })
    );

    console.log('✅ All images downloaded');
    console.log('🖼️  Composing collage...');

    const imageWidth = 280;
    const imageHeight = 280;
    const padding = 15;
    const titleHeight = 80;

    const layout = this.calculateLayout(count, imageWidth, imageHeight, padding, titleHeight);

    const resizedImages = await Promise.all(
      imageBuffers.map(buffer =>
        sharp(buffer)
          .resize(imageWidth, imageHeight, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          })
          .toBuffer()
      )
    );

    const composites: sharp.OverlayOptions[] = layout.positions.map((pos, i) => ({
      input: resizedImages[i],
      top: pos.top,
      left: pos.left,
    }));

    await fs.mkdir(this.outputDir, { recursive: true });

    const outputPath = path.join(this.outputDir, outputFileName);
    const titleText = `🏆 Top ${count} Offerte - I Consigli di Nonna Pina 🏆`;

    const titleSvg = `
      <svg width="${layout.canvasWidth}" height="${titleHeight}">
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="${layout.canvasWidth}" height="${titleHeight}" fill="url(#gradient)"/>
        <text
          x="50%"
          y="50%"
          text-anchor="middle"
          dominant-baseline="middle"
          font-family="Arial, Helvetica, sans-serif"
          font-size="32"
          font-weight="bold"
          fill="white"
          letter-spacing="1">
          ${titleText}
        </text>
      </svg>
    `;

    composites.unshift({ input: Buffer.from(titleSvg), top: 0, left: 0 });

    for (let i = 0; i < count; i++) {
      if (discounts[i] > 0) {
        const badgeSize = 70;
        const badgeSvg = `
          <svg width="${badgeSize}" height="${badgeSize}">
            <defs>
              <linearGradient id="badge-gradient-${i}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#ee5a24;stop-opacity:1" />
              </linearGradient>
            </defs>
            <circle cx="${badgeSize / 2}" cy="${badgeSize / 2}" r="${badgeSize / 2 - 2}" fill="url(#badge-gradient-${i})" stroke="white" stroke-width="3"/>
            <text
              x="50%"
              y="50%"
              text-anchor="middle"
              dominant-baseline="middle"
              font-family="Arial, Helvetica, sans-serif"
              font-size="22"
              font-weight="bold"
              fill="white">
              -${Math.round(discounts[i])}%
            </text>
          </svg>
        `;
        composites.push({
          input: Buffer.from(badgeSvg),
          top: layout.positions[i].top + 10,
          left: layout.positions[i].left + imageWidth - badgeSize - 10,
        });
      }
    }

    await sharp({
      create: {
        width: layout.canvasWidth,
        height: layout.canvasHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite(composites)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: 85, mozjpeg: true })
      .toFile(outputPath);

    console.log(`✅ Collage created: ${outputPath}`);
    return outputPath;
  }

  calculateLayout(
    count: number,
    imageWidth: number,
    imageHeight: number,
    padding: number,
    titleHeight: number
  ): CollageLayout {
    if (count === 5) {
      const canvasWidth = imageWidth * 3 + padding * 4;
      const canvasHeight = titleHeight + imageHeight * 2 + padding * 3;
      return {
        canvasWidth,
        canvasHeight,
        positions: [
          { top: titleHeight + padding, left: padding },
          { top: titleHeight + padding, left: padding * 2 + imageWidth },
          { top: titleHeight + padding, left: padding * 3 + imageWidth * 2 },
          { top: titleHeight + padding * 2 + imageHeight, left: padding + imageWidth / 2 },
          {
            top: titleHeight + padding * 2 + imageHeight,
            left: padding * 2 + imageWidth + imageWidth / 2,
          },
        ],
      };
    } else if (count === 4) {
      const canvasWidth = imageWidth * 2 + padding * 3;
      const canvasHeight = titleHeight + imageHeight * 2 + padding * 3;
      return {
        canvasWidth,
        canvasHeight,
        positions: [
          { top: titleHeight + padding, left: padding },
          { top: titleHeight + padding, left: padding * 2 + imageWidth },
          { top: titleHeight + padding * 2 + imageHeight, left: padding },
          { top: titleHeight + padding * 2 + imageHeight, left: padding * 2 + imageWidth },
        ],
      };
    } else {
      const canvasWidth = imageWidth * 3 + padding * 4;
      const canvasHeight = titleHeight + imageHeight + padding * 2;
      return {
        canvasWidth,
        canvasHeight,
        positions: [
          { top: titleHeight + padding, left: padding },
          { top: titleHeight + padding, left: padding * 2 + imageWidth },
          { top: titleHeight + padding, left: padding * 3 + imageWidth * 2 },
        ],
      };
    }
  }

  private async createPlaceholder(width: number, height: number): Promise<Buffer> {
    return sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 200, g: 200, b: 200 },
      },
    })
      .jpeg({ quality: 85 })
      .toBuffer();
  }
}

export default ImageGenerator;
