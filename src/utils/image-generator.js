import sharp from 'sharp';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

/**
 * Image Generator - Create collage images from product images
 * Supports flexible layouts for 3-5 products
 */
class ImageGenerator {
  constructor(outputDir = './output/assets') {
    this.outputDir = outputDir;
  }

  /**
   * Download an image from a URL using axios (handles redirects reliably)
   * @param {string} url - Image URL
   * @returns {Promise<Buffer>} Image buffer
   */
  async downloadImage(url) {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      maxRedirects: 5,
    });
    return Buffer.from(response.data);
  }

  /**
   * Create a collage image from product data
   * Flexible layout: supports 3, 4, or 5 products
   *
   * Layouts:
   * - 5 products: 3 on top row, 2 on bottom row (centered)
   * - 4 products: 2 on top row, 2 on bottom row
   * - 3 products: 3 in a single row
   *
   * @param {Array<Object>} products - Array of product objects (3-5 products)
   * @param {string} outputFileName - Output file name (default: top-deals.jpg)
   * @returns {Promise<string>} Path to the generated image
   */
  async createTopDealsCollage(products, outputFileName = 'top-5-deals.jpg') {
    try {
      const count = products?.length;
      if (!count || count < 3 || count > 5) {
        throw new Error(
          `Between 3 and 5 products are required for the collage (got ${count || 0})`
        );
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
            console.log(`  [${index + 1}/${count}] Downloading: ${url}`);
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

      // Calculate layout based on product count
      const layout = this.calculateLayout(count, imageWidth, imageHeight, padding, titleHeight);

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

      // Create composite positions from layout
      const composites = layout.positions.map((pos, i) => ({
        input: resizedImages[i],
        top: pos.top,
        left: pos.left,
      }));

      // Ensure output directory exists
      await fs.mkdir(this.outputDir, { recursive: true });

      const outputPath = path.join(this.outputDir, outputFileName);

      // Create SVG for title text
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

      const titleBuffer = Buffer.from(titleSvg);

      // Add title to composites
      composites.unshift({ input: titleBuffer, top: 0, left: 0 });

      // Create and add discount badges
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
          const badgeBuffer = Buffer.from(badgeSvg);
          // Position badge in top-right corner of each image
          composites.push({
            input: badgeBuffer,
            top: layout.positions[i].top + 10,
            left: layout.positions[i].left + imageWidth - badgeSize - 10,
          });
        }
      }

      // Create canvas and composite images
      await sharp({
        create: {
          width: layout.canvasWidth,
          height: layout.canvasHeight,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        },
      })
        .composite(composites)
        .flatten({ background: { r: 255, g: 255, b: 255 } }) // Remove alpha channel
        .jpeg({ quality: 85, mozjpeg: true }) // Convert to JPEG with 85% quality
        .toFile(outputPath);

      console.log(`✅ Collage created: ${outputPath}`);

      return outputPath;
    } catch (error) {
      console.error('❌ Error creating collage:', error.message);
      throw error;
    }
  }

  /**
   * Calculate layout positions based on number of products
   * @param {number} count - Number of products (3-5)
   * @param {number} imageWidth - Width of each image
   * @param {number} imageHeight - Height of each image
   * @param {number} padding - Padding between images
   * @param {number} titleHeight - Height of the title banner
   * @returns {Object} { canvasWidth, canvasHeight, positions: [{top, left}] }
   */
  calculateLayout(count, imageWidth, imageHeight, padding, titleHeight) {
    if (count === 5) {
      // 3 on top, 2 on bottom (centered)
      const canvasWidth = imageWidth * 3 + padding * 4;
      const canvasHeight = titleHeight + imageHeight * 2 + padding * 3;
      return {
        canvasWidth,
        canvasHeight,
        positions: [
          // Top row (3 images)
          { top: titleHeight + padding, left: padding },
          { top: titleHeight + padding, left: padding * 2 + imageWidth },
          { top: titleHeight + padding, left: padding * 3 + imageWidth * 2 },
          // Bottom row (2 images, centered)
          { top: titleHeight + padding * 2 + imageHeight, left: padding + imageWidth / 2 },
          {
            top: titleHeight + padding * 2 + imageHeight,
            left: padding * 2 + imageWidth + imageWidth / 2,
          },
        ],
      };
    } else if (count === 4) {
      // 2 on top, 2 on bottom
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
      // count === 3: single row
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
        channels: 3,
        background: { r: 200, g: 200, b: 200 },
      },
    })
      .jpeg({ quality: 85 })
      .toBuffer();
  }
}

export default ImageGenerator;
