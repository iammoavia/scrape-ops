import { PuppeteerCrawler } from 'crawlee';
import * as cheerio from 'cheerio';
import { FragranticaExtractor } from '../extractors/fragrantica.js';
import { downloadImage, downloadImageBatch } from '../extractors/base.js';

/**
 * Creates and configures a Crawlee PuppeteerCrawler instance.
 *
 * @param {Object} options
 * @param {import('../storage/database.js').StorageService} options.storage
 * @param {typeof import('../config/index.js').config} options.config
 * @param {Function} [options.onComplete]
 * @returns {PuppeteerCrawler}
 */
export function createPuppeteerCrawler({ storage, config, onComplete }) {
  const crawler = new PuppeteerCrawler({
    maxRequestsPerCrawl: config.maxRequestsPerCrawl,
    maxRequestRetries: config.maxRetries,
    maxConcurrency: config.concurrency,
    requestHandlerTimeoutSecs: Math.max(90, Math.round(config.timeoutMs / 1000)),
    navigationTimeoutSecs: 60,

    launchContext: {
      launchOptions: {
        headless: config.puppeteer.headless,
        executablePath: config.puppeteer.executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
        ],
      },
    },

    preNavigationHooks: [
      async ({ page }, gotoOptions) => {
        if (gotoOptions) {
          // Use 'domcontentloaded' to avoid waiting on heavy third-party ads/trackers
          gotoOptions.waitUntil = 'domcontentloaded';
        }
        await page.setUserAgent(config.userAgent);
        await page.setViewport({ width: 1920, height: 1080 });
      },
    ],

    async requestHandler({ page, request, response, log }) {
      log.info(`[Puppeteer] Processing: ${request.url}`);

      const statusCode = response ? response.status() : 200;
      const html = await page.content();
      const pageTitle = await page.title();

      log.info(`[Puppeteer] Fetched HTML (${Buffer.byteLength(html, 'utf-8')} bytes) - Status ${statusCode}`);

      // Pass HTML to Cheerio for fast, standardized data extraction
      const $ = cheerio.load(html);
      const extractedData = FragranticaExtractor.extract($, request.url);

      // Persist raw page HTML to SQLite
      const pageId = storage.savePage({
        url: request.url,
        engine: 'puppeteer',
        statusCode,
        contentType: 'text/html',
        title: pageTitle,
        htmlContent: html,
      });

      // Part 1: Persist notes to SQLite with unique constraints
      let notesResult = null;
      if (extractedData.pageType === 'notes' && extractedData.content?.notes?.length > 0) {
        // Download images if enabled in configuration
        if (config.downloadImages) {
          log.info(`[Images] Downloading images for ${extractedData.content.notes.length} notes...`);
          const itemsToDownload = extractedData.content.notes.map((n) => ({
            url: n.image,
            prefix: 'note',
            id: n.noteId,
            slug: n.slug,
          }));

          const downloadResults = await downloadImageBatch(itemsToDownload, {
            targetDir: config.notesImagesDir,
            concurrency: config.imageConcurrency,
          });

          // Attach relative localImagePath to each note
          extractedData.content.notes.forEach((note, idx) => {
            const res = downloadResults[idx];
            if (res && res.success) {
              note.localImagePath = res.relativePath;
            }
          });
          log.info(`[Images] Completed downloading note images.`);
        }

        notesResult = storage.saveNotes(extractedData.content.notes);
        log.info(
          `[SQLite] Notes Catalog: Processed ${notesResult.total} notes (${notesResult.inserted} inserted, ${notesResult.updated} updated)`
        );
      }

      // Part 2: Persist fragrance if scraping a perfume detail page
      let fragranceId = null;
      if (extractedData.pageType === 'perfume' && extractedData.content?.perfumeName) {
        let localImagePath = null;
        if (config.downloadImages && extractedData.content?.image) {
          log.info(`[Images] Downloading perfume bottle image...`);
          const imgRes = await downloadImage(extractedData.content.image, {
            targetDir: config.fragrancesImagesDir,
            prefix: 'fragrance',
            slug: extractedData.content.perfumeName,
          });
          if (imgRes.success) {
            localImagePath = imgRes.relativePath;
          }
        }

        fragranceId = storage.saveFragrance({
          name: extractedData.content.perfumeName,
          brand: extractedData.content.brand,
          link: request.url,
          image: extractedData.content.image,
          localImagePath,
          rating: extractedData.content.rating,
          votesCount: extractedData.content.votesCount,
          description: extractedData.content.description,
          rawData: extractedData.content,
        });
        log.info(`[SQLite] Fragrance persisted: "${extractedData.content.perfumeName}" (ID: #${fragranceId})`);
      }

      // Persist structured record summary
      const recordPayload = {
        ...extractedData,
        content: {
          ...extractedData.content,
          // Store count and sample in record payload; the full list is indexed in 'notes' table
          notesCount: extractedData.content?.totalNotes || undefined,
          notes: undefined,
        },
      };

      const recordId = storage.saveExtractedRecord({
        pageId,
        url: request.url,
        recordType: extractedData.pageType,
        payload: recordPayload,
      });

      log.info(`[SQLite] Saved page (ID: #${pageId}) and extracted record (ID: #${recordId})`);

      if (onComplete) {
        onComplete({
          url: request.url,
          engine: 'puppeteer',
          statusCode,
          title: pageTitle,
          htmlLength: Buffer.byteLength(html, 'utf-8'),
          pageId,
          recordId,
          fragranceId,
          notesResult,
          extractedData,
        });
      }
    },

    failedRequestHandler({ request, log }, error) {
      log.error(`[Puppeteer] Request failed after ${request.retryCount} retries: ${request.url}`, {
        error: error.message,
      });
    },
  });

  return crawler;
}
