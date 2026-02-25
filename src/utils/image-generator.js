import sharp from 'sharp';
import https from 'https';
import http from 'http';
import fs from 'fs/promises';
import path from 'path';

/**
 * Image Generator - Create collage images from product images
 */
class ImageGenerator {
  constructor(outputDir = './output/assets') {
    this.outputDir = outputDir;
  }

  /**
   * Download an image from a URL
   * @param {string} url - Image URL
   * @returns {Promise<Buffer>} Image buffer
   */
  async downloadImage(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      protocol
        .get(url, response => {
          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download image: ${response.statusCode}`));
            return;
          }

          const chunks = [];
          response.on('data', chunk => chunks.push(chunk));
          response.on('end', () => resolve(Buffer.concat(chunks)));
          response.on('error', reject);
        })
        .on('error', reject);
    });
  }

  /**
   * Create a collage image from product data
   * Layout: 3 images on top row, 2 images on bottom row
   * @param {Array<Object>} products - Array of product objects (expects 5 products)
   * @param {string} outputFileName - Output file name (default: top-5-deals.png)
   * @returns {Promise<string>} Path to the generated image
   */
  async createTopDealsCollage(products, outputFileName = 'top-5-deals.png') {
    try {
      if (!products || products.length !== 5) {
        throw new Error('Exactly 5 products are required for the collage');
      }

      // Extract image URLs from products
      const imageUrls = products.map(p => p.immagineLarge || p.immagineSmall);
      const discounts = products.map(p => parseFloat(p.percentualeSconto) || 0);

      if (imageUrls.some(url => !url)) {
        throw new Error('All products must have valid image URLs');
      }

      console.log('📥 Downloading product images...');

      // Download all images
      const imageBuffers = await Promise.all(
        imageUrls.map(async (url, index) => {
          try {
            console.log(`  [${index + 1}/5] Downloading: ${url}`);
            return await this.downloadImage(url);
          } catch (error) {
            console.error(`  ❌ Failed to download image ${index + 1}: ${error.message}`);
            // Create a placeholder if download fails
            return await this.createPlaceholder(280, 280);
          }
        })
      );

      console.log('✅ All images downloaded');
      console.log('🖼️  Composing collage...');

      // Define dimensions
      const imageWidth = 280;
      const imageHeight = 280;
      const padding = 15;
      const titleHeight = 80; // Height for title banner

      // Canvas dimensions: 3 images wide for top row
      const canvasWidth = imageWidth * 3 + padding * 4;
      // 2 rows + title banner on top
      const canvasHeight = titleHeight + imageHeight * 2 + padding * 3;

      // Resize all images to same size
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

      // Create composite positions for 3+2 layout (offset by title height)
      const composites = [
        // Top row (3 images)
        { input: resizedImages[0], top: titleHeight + padding, left: padding },
        { input: resizedImages[1], top: titleHeight + padding, left: padding * 2 + imageWidth },
        { input: resizedImages[2], top: titleHeight + padding, left: padding * 3 + imageWidth * 2 },
        // Bottom row (2 images, centered)
        {
          input: resizedImages[3],
          top: titleHeight + padding * 2 + imageHeight,
          left: padding + imageWidth / 2,
        },
        {
          input: resizedImages[4],
          top: titleHeight + padding * 2 + imageHeight,
          left: padding * 2 + imageWidth + imageWidth / 2,
        },
      ];

      // Ensure output directory exists
      await fs.mkdir(this.outputDir, { recursive: true });

      const outputPath = path.join(this.outputDir, outputFileName);

      // Create SVG for title text
      const titleSvg = `
        <svg width="${canvasWidth}" height="${titleHeight}">
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
            </linearGradient>
          </defs>
          <rect width="${canvasWidth}" height="${titleHeight}" fill="url(#gradient)"/>
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
            🏆 Top 5 Offerte - I Consigli di Nonna Pina 🏆
          </text>
        </svg>
      `;

      const titleBuffer = Buffer.from(titleSvg);

      // Add title to composites
      composites.unshift({ input: titleBuffer, top: 0, left: 0 });

      // Create discount badge positions (3 top row, 2 bottom row)
      const badgePositions = [
        { top: titleHeight + padding, left: padding },
        { top: titleHeight + padding, left: padding * 2 + imageWidth },
        { top: titleHeight + padding, left: padding * 3 + imageWidth * 2 },
        { top: titleHeight + padding * 2 + imageHeight, left: padding + imageWidth / 2 },
        {
          top: titleHeight + padding * 2 + imageHeight,
          left: padding * 2 + imageWidth + imageWidth / 2,
        },
      ];

      // Create and add discount badges
      for (let i = 0; i < 5; i++) {
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
          const badgeBuffer = Buffer.from(badgeSvg);
          // Position badge in top-right corner of each image
          composites.push({
            input: badgeBuffer,
            top: badgePositions[i].top + 10,
            left: badgePositions[i].left + imageWidth - badgeSize - 10,
          });
        }
      }

      // Create canvas and composite images
      await sharp({
        create: {
          width: canvasWidth,
          height: canvasHeight,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        },
      })
        .composite(composites)
        .png()
        .toFile(outputPath);

      console.log(`✅ Collage created: ${outputPath}`);

      return outputPath;
    } catch (error) {
      console.error('❌ Error creating collage:', error.message);
      throw error;
    }
  }

  /**
   * Create a placeholder image (used when image download fails)
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {Promise<Buffer>} Placeholder image buffer
   */
  async createPlaceholder(width, height) {
    return await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 200, g: 200, b: 200, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
  }
}

export default ImageGenerator;
