import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';

/**
 * Base extractor & utility functions for web scraping pipelines.
 * Designed for maximum reusability across extractors, crawlers, and scripts.
 */

/**
 * Clean and normalize text extracted from DOM nodes.
 * @param {string} text
 * @returns {string}
 */
export function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
}

/**
 * Extract standard meta tags and OpenGraph/Twitter attributes from Cheerio instance.
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Record<string, string>}
 */
export function extractMetaTags($) {
  const meta = {};

  // Standard metadata
  meta.title = cleanText($('title').first().text());
  meta.description = $('meta[name="description"]').attr('content') || '';
  meta.keywords = $('meta[name="keywords"]').attr('content') || '';
  meta.canonical = $('link[rel="canonical"]').attr('href') || '';
  meta.robots = $('meta[name="robots"]').attr('content') || '';

  // Open Graph
  meta.ogTitle = $('meta[property="og:title"]').attr('content') || '';
  meta.ogDescription = $('meta[property="og:description"]').attr('content') || '';
  meta.ogImage = $('meta[property="og:image"]').attr('content') || '';
  meta.ogUrl = $('meta[property="og:url"]').attr('content') || '';
  meta.ogSiteName = $('meta[property="og:site_name"]').attr('content') || '';

  // Twitter
  meta.twitterCard = $('meta[name="twitter:card"]').attr('content') || '';
  meta.twitterTitle = $('meta[name="twitter:title"]').attr('content') || '';

  return meta;
}

/**
 * Sanitizes a string to be safely used as a filename across all OS filesystems.
 * @param {string} name
 * @param {string} [fallback='file']
 * @returns {string}
 */
export function sanitizeFilename(name, fallback = 'file') {
  if (!name || typeof name !== 'string') return fallback;
  const sanitized = name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .trim();
  return sanitized || fallback;
}

/**
 * Ensures a directory exists synchronously, creating parent directories as needed.
 * @param {string} dirPath
 * @returns {string}
 */
export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

/**
 * Derives a clean extension and filename from an image URL and optional metadata.
 * @param {string} imageUrl
 * @param {Object} [options]
 * @param {string} [options.prefix='']
 * @param {string} [options.slug='']
 * @param {number|string} [options.id='']
 * @returns {string}
 */
export function generateFilenameFromUrl(imageUrl, { prefix = '', slug = '', id = '' } = {}) {
  let ext = '.jpg';
  try {
    const parsed = new URL(imageUrl);
    const pathname = parsed.pathname;
    const match = pathname.match(/\.(jpg|jpeg|png|webp|avif|gif|svg)$/i);
    if (match) {
      ext = `.${match[1].toLowerCase()}`;
    }
  } catch {
    // Keep default .jpg
  }

  const parts = [];
  if (prefix) parts.push(sanitizeFilename(prefix));
  if (id) parts.push(sanitizeFilename(String(id)));
  if (slug) parts.push(sanitizeFilename(slug));

  if (parts.length > 0) {
    return `${parts.join('-')}${ext}`;
  }

  // Fallback: derive from URL pathname
  try {
    const parsed = new URL(imageUrl);
    const basename = path.basename(parsed.pathname).replace(/\.[^/.]+$/, '');
    return `${sanitizeFilename(basename, 'image')}${ext}`;
  } catch {
    return `image-${Date.now()}${ext}`;
  }
}

/**
 * Reusable function to download an image from a URL and save it to the local filesystem.
 * Returns local filesystem references (absolute and project-relative) for database storage.
 *
 * @param {string} imageUrl - The remote image URL to download
 * @param {Object} [options]
 * @param {string} [options.targetDir] - Destination folder (defaults to ./data/images)
 * @param {string} [options.filename] - Specific filename to save as (auto-generated if omitted)
 * @param {string} [options.prefix=''] - Filename prefix (e.g. 'note-', 'fragrance-')
 * @param {string} [options.slug=''] - Slug identifier for filename
 * @param {number|string} [options.id=''] - Numeric/string ID for filename
 * @param {boolean} [options.overwrite=false] - Whether to re-download if file already exists
 * @param {number} [options.timeoutMs=15000] - Request timeout in ms
 * @param {string} [options.referer='https://www.fragrantica.com/'] - HTTP Referer header
 * @param {string} [options.userAgent] - HTTP User-Agent header
 * @returns {Promise<{
 *   success: boolean,
 *   url: string,
 *   localPath: string|null,
 *   relativePath: string|null,
 *   filename: string|null,
 *   byteLength: number,
 *   contentType: string|null,
 *   cached: boolean,
 *   error?: string
 * }>}
 */
export async function downloadImage(imageUrl, options = {}) {
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
    return {
      success: false,
      url: imageUrl || '',
      localPath: null,
      relativePath: null,
      filename: null,
      byteLength: 0,
      contentType: null,
      cached: false,
      error: 'Invalid or missing image URL',
    };
  }

  const targetDir = options.targetDir || path.resolve(process.cwd(), 'data', 'images');
  ensureDir(targetDir);

  const filename = options.filename || generateFilenameFromUrl(imageUrl, {
    prefix: options.prefix || '',
    slug: options.slug || '',
    id: options.id || '',
  });

  const localPath = path.join(targetDir, filename);
  const relativePath = path.relative(process.cwd(), localPath);

  // If already exists and overwrite is false, return cached reference immediately
  if (!options.overwrite && fs.existsSync(localPath)) {
    try {
      const stats = fs.statSync(localPath);
      if (stats.size > 0) {
        return {
          success: true,
          url: imageUrl,
          localPath,
          relativePath,
          filename,
          byteLength: stats.size,
          contentType: null,
          cached: true,
        };
      }
    } catch {
      // Re-download if read failed
    }
  }

  try {
    const userAgent =
      options.userAgent ||
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: options.timeoutMs || 15000,
      headers: {
        'User-Agent': userAgent,
        'Referer': options.referer || 'https://www.fragrantica.com/',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });

    const buffer = Buffer.from(response.data);
    fs.writeFileSync(localPath, buffer);

    return {
      success: true,
      url: imageUrl,
      localPath,
      relativePath,
      filename,
      byteLength: buffer.length,
      contentType: response.headers['content-type'] || 'image/jpeg',
      cached: false,
    };
  } catch (error) {
    return {
      success: false,
      url: imageUrl,
      localPath: null,
      relativePath: null,
      filename,
      byteLength: 0,
      contentType: null,
      cached: false,
      error: error.message,
    };
  }
}

/**
 * Downloads a list of images in parallel with concurrency control.
 *
 * @param {Array<{ url: string, filename?: string, prefix?: string, slug?: string, id?: string|number }>} items
 * @param {Object} [options]
 * @param {string} [options.targetDir]
 * @param {number} [options.concurrency=5]
 * @param {Function} [options.onProgress]
 * @returns {Promise<Array<Object>>}
 */
export async function downloadImageBatch(items, options = {}) {
  const concurrency = Math.max(1, options.concurrency || 5);
  const results = [];
  const total = items.length;
  let completed = 0;

  // Process in chunks of size `concurrency`
  for (let i = 0; i < total; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((item) =>
        downloadImage(item.url, {
          targetDir: options.targetDir,
          filename: item.filename,
          prefix: item.prefix,
          slug: item.slug,
          id: item.id,
          overwrite: options.overwrite,
          timeoutMs: options.timeoutMs,
          userAgent: options.userAgent,
          referer: options.referer,
        }).then((res) => {
          completed++;
          if (options.onProgress) {
            options.onProgress({ completed, total, current: item, result: res });
          }
          return res;
        })
      )
    );
    results.push(...chunkResults);
  }

  return results;
}
