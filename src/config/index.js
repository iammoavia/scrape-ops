import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

// Ensure Crawlee does not falsely throttle under Linux buffer/cache memory usage
process.env.CRAWLEE_AVAILABLE_MEMORY_RATIO = process.env.CRAWLEE_AVAILABLE_MEMORY_RATIO || '1.0';
process.env.CRAWLEE_MEMORY_MBYTES = process.env.CRAWLEE_MEMORY_MBYTES || '8192';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');

// Helper to parse CLI arguments like --engine=puppeteer or --download-images or --url=https://...
function parseCliArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--')) {
      const [rawKey, value] = arg.slice(2).split('=');
      // Convert kebab-case to camelCase (e.g. download-images -> downloadImages)
      const key = rawKey.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      args[key] = value === undefined ? true : value;
    }
  }
  return args;
}

const cliArgs = parseCliArgs();

function findChromeExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const candidatePaths = [
    '/opt/google/chrome/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

const imagesBaseDir = path.resolve(rootDir, process.env.IMAGES_DIR || './data/images');

export const config = {
  rootDir,
  // Engine can be 'axios' or 'puppeteer' (puppeteer recommended for Fragrantica due to Cloudflare)
  engine: (cliArgs.engine || process.env.FETCH_ENGINE || 'puppeteer').toLowerCase(),
  // Initial URL (defaults to the fragrance notes catalog page)
  targetUrl: cliArgs.url || process.env.TARGET_URL || 'https://www.fragrantica.com/notes/',
  // Crawlee crawler limits
  maxRequestsPerCrawl: Number(cliArgs.maxRequests || process.env.MAX_REQUESTS_PER_CRAWL || 1),
  maxRetries: Number(process.env.MAX_RETRIES || 3),
  concurrency: Number(process.env.CONCURRENCY || 1),
  // Database
  databasePath: path.resolve(rootDir, process.env.DATABASE_PATH || './data/scrapes.db'),
  // Image downloading options
  downloadImages:
    cliArgs.downloadImages !== undefined
      ? cliArgs.downloadImages === true || cliArgs.downloadImages === 'true'
      : process.env.DOWNLOAD_IMAGES === 'true',
  imagesDir: imagesBaseDir,
  notesImagesDir: path.join(imagesBaseDir, 'notes'),
  fragrancesImagesDir: path.join(imagesBaseDir, 'fragrances'),
  imageConcurrency: Number(process.env.IMAGE_CONCURRENCY || 5),
  // Puppeteer specific
  puppeteer: {
    headless: process.env.PUPPETEER_HEADLESS !== 'false',
    executablePath: findChromeExecutable(),
  },
  // HTTP / Network
  timeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 30000),
  userAgent:
    process.env.USER_AGENT ||
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};
