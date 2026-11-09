import { createAxiosCrawler } from './axios-crawler.js';
import { createPuppeteerCrawler } from './puppeteer-crawler.js';

/**
 * Factory to create the requested crawler based on engine ('axios' or 'puppeteer').
 *
 * @param {Object} options
 * @param {'axios' | 'puppeteer'} options.engine
 * @param {import('../storage/database.js').StorageService} options.storage
 * @param {typeof import('../config/index.js').config} options.config
 * @param {Function} [options.onComplete]
 */
export function createCrawler({ engine, storage, config, onComplete }) {
  if (engine === 'puppeteer') {
    return createPuppeteerCrawler({ storage, config, onComplete });
  }

  if (engine === 'axios') {
    return createAxiosCrawler({ storage, config, onComplete });
  }

  throw new Error(`Unknown crawling engine: "${engine}". Allowed options are "axios" or "puppeteer".`);
}

