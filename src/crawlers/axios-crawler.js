import { BasicCrawler } from 'crawlee';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { FragranticaExtractor } from '../extractors/fragrantica.js';

/**
 * Creates and configures a Crawlee BasicCrawler powered by Axios for fast static fetching.
 *
 * @param {Object} options
 * @param {import('../storage/database.js').StorageService} options.storage
 * @param {typeof import('../config/index.js').config} options.config
 * @param {Function} [options.onComplete]
 * @returns {BasicCrawler}
 */
export function createAxiosCrawler({ storage, config, onComplete }) {
  const crawler = new BasicCrawler({
    maxRequestsPerCrawl: config.maxRequestsPerCrawl,
    maxRequestRetries: config.maxRetries,
    maxConcurrency: config.concurrency,
    requestHandlerTimeoutSecs: Math.round(config.timeoutMs / 1000),

    async requestHandler({ request, log }) {
      log.info(`[Axios] Fetching static HTML: ${request.url}`);

      const response = await axios.get(request.url, {
        headers: {
          'User-Agent': config.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
        },
        timeout: config.timeoutMs,
        responseType: 'text',
        validateStatus: (status) => status < 500, // Pass 4xx without throwing so we can record them; 5xx throws to trigger Crawlee retry
      });

      const statusCode = response.status;
      const html = typeof response.data === 'string' ? response.data : String(response.data);
      const contentType = response.headers['content-type'] || 'text/html';

      log.info(`[Axios] Received response (${Buffer.byteLength(html, 'utf-8')} bytes) - Status ${statusCode}`);

      // Pass HTML into Cheerio for parsing
      const $ = cheerio.load(html);
      const pageTitle = $('title').first().text().trim();
      const extractedData = FragranticaExtractor.extract($, request.url);

      // Persist raw HTML into SQLite
      const pageId = storage.savePage({
        url: request.url,
        engine: 'axios',
        statusCode,
        contentType,
        title: pageTitle,
        htmlContent: html,
      });

      // Part 1: Persist notes to SQLite with unique constraints
      let notesResult = null;
      if (extractedData.pageType === 'notes' && extractedData.content?.notes?.length > 0) {
        notesResult = storage.saveNotes(extractedData.content.notes);
        log.info(
          `[SQLite] Notes Catalog: Processed ${notesResult.total} notes (${notesResult.inserted} inserted, ${notesResult.updated} updated)`
        );
      }

      // Part 2: Persist fragrance if scraping a perfume detail page
      let fragranceId = null;
      if (extractedData.pageType === 'perfume' && extractedData.content?.perfumeName) {
        fragranceId = storage.saveFragrance({
          name: extractedData.content.perfumeName,
          brand: extractedData.content.brand,
          link: request.url,
          image: extractedData.content.image,
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
          engine: 'axios',
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
      log.error(`[Axios] Request failed after ${request.retryCount} retries: ${request.url}`, {
        error: error.message,
      });
    },
  });

  return crawler;
}
