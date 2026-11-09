# Scentel Scrape-Ops: Fragrantica Scraper

A production-ready web scraping pipeline built with **Node.js**, **Crawlee**, **Puppeteer**, **Axios**, **Cheerio**, and **SQLite**.

Designed following a two-part domain architecture:
1. **Part 1 (Implemented)**: Fragrance Notes Catalog Scraper (`https://www.fragrantica.com/notes/`) extracting note name, canonical link, remote image, local downloaded image reference, and olfactory family, persisted uniquely in SQLite.
2. **Part 2 (Architecture in Place)**: Fragrance / Perfume Catalog schema (`fragrances` table) and extractor placeholders ready for detail-level expansion.

```
                  Node.js Application
                          │
                   Crawlee Crawler
                          │
                  ┌───────┴───────┐
                  │               │
              Puppeteer         Axios
                  │               │
                  └───────┬───────┘
                          │
                       Cheerio
                          │
                   Data Extraction
                   (Notes & Perfumes)
                          │
                 Base Utility Helpers
             (Image Downloader, Cleaners)
                          │
                   SQLite Database
             ┌────────────┼────────────┐
        scraped_pages   notes     fragrances
```

---

## Key Features

- **Fragrantica Notes Catalog Scraper**: Analyzes the HTML structure of `https://www.fragrantica.com/notes/` and extracts **1,952 unique notes** across 13 olfactory groups (Citrus, Floral, Woody, Gourmand, Spices, etc.).
- **Reusable Base Functions**: Core image downloading utilities (`downloadImage`, `downloadImageBatch`, `sanitizeFilename`, `ensureDir`) defined in `src/extractors/base.js` with browser headers (`User-Agent`, `Referer`), automatic disk caching, and error resilience.
- **Local Image Persistence**: Downloads note thumbnails into `data/images/notes/` and stores their relative filesystem paths in the SQLite `notes.local_image_path` column.
- **Deduplication & Uniqueness**: Uses a `UNIQUE` constraint on note links with transactional SQLite upsert (`ON CONFLICT(link) DO UPDATE`) so re-running the scraper never duplicates data and updates missing fields smoothly.
- **Link Preservation for Expansion**: Stores canonical note links and a `detail_scraped` status flag (`0 = pending`, `1 = scraped`) so subsequent crawl jobs can iterate through notes and scrape note descriptions and associated perfumes.
- **Fragrance Catalog Setup**: Database schema and extractor placeholders for perfumes (`fragrances` table) are already configured and waiting for Part 2 crawling.
- **Cloudflare Bypass & Fast Navigation**: Configured with automatic Chrome discovery and `domcontentloaded` navigation hooks to bypass Cloudflare protection without stalling on ad trackers (averaging ~11 seconds per crawl).
- **SQLite with WAL Mode**: High concurrency and zero data corruption using `better-sqlite3` with Write-Ahead Logging.
- **Clean Git Repository**: Pre-configured `.gitignore` ensures no databases, downloaded images, raw dumps, or environment secrets leak into Git.

---

## Project Structure

```
scrape-ops/
├── data/
│   ├── images/                # Downloaded media (ignored by Git)
│   │   ├── notes/             # Note thumbnail images (e.g. note-75-Bergamot.jpg)
│   │   └── fragrances/        # Perfume bottle images
│   ├── scrapes.db             # Local SQLite database (ignored by Git)
│   └── .gitkeep               # Preserves data/ directory in Git
├── src/
│   ├── config/
│   │   └── index.js           # Configuration loader (.env, CLI flags, Chrome discovery)
│   ├── storage/
│   │   └── database.js        # SQLite schema & persistence service (notes, fragrances, pages)
│   ├── extractors/
│   │   ├── base.js            # General DOM, text, and reusable image downloader utilities
│   │   └── fragrantica.js     # Site-specific extractor for Fragrantica (notes, note details, perfumes)
│   ├── crawlers/
│   │   ├── axios-crawler.js   # Crawlee BasicCrawler wrapping Axios
│   │   ├── puppeteer-crawler.js # Crawlee PuppeteerCrawler with Cloudflare & DOM optimization
│   │   └── factory.js         # Engine selector factory
│   ├── scripts/
│   │   ├── inspect-db.js      # CLI tool to inspect overall SQLite contents
│   │   ├── inspect-notes.js   # CLI tool to inspect notes, categories, images, and pending URLs
│   │   └── download-images.js # Dedicated CLI script to download images with concurrency
│   └── main.js                # Main application entry point
├── .env                       # Local environment configuration
├── .env.example               # Configuration template
├── .gitignore                 # Clean repo ignore rules (no scraped data committed)
├── package.json
└── README.md
```

---

## Quick Start & Running Guide

### 1. Installation
```bash
npm install
```

### 2. Available NPM Scripts

| Command | Description |
|---|---|
| `npm run scrape:notes` | Scrapes `https://www.fragrantica.com/notes/` via Puppeteer, extracting and upserting all 1,952 notes into SQLite. |
| `npm run download:images` | Downloads pending note images in parallel (default limit: 50) and saves local path references in SQLite. |
| `npm run inspect:notes` | Displays summary of stored notes, olfactory groups, image download counts, sample rows, and pending URLs. |
| `npm run inspect:db` | Inspects raw page snapshots, engine statistics, and extracted record payloads. |
| `npm start` | Runs the crawler with default settings from `.env`. |
| `npm run start:puppeteer` | Runs the crawler using the Puppeteer engine. |
| `npm run start:axios` | Runs the crawler using the Axios engine. |

---

## Common Workflows

### Workflow A: Scrape the Notes Catalog
```bash
npm run scrape:notes
```
This visits `https://www.fragrantica.com/notes/`, extracts all 1,952 notes across 13 olfactory groups, and saves them into the `notes` table in `data/scrapes.db`.
Re-running the command safely updates existing records without creating duplicates:
```
[SQLite] Notes Catalog: Processed 1952 notes (0 inserted, 1952 updated)
```

### Workflow B: Download Images for Saved Notes
Once notes are stored in SQLite, download their thumbnail images locally:
```bash
# Download the default batch (50 images):
npm run download:images

# Download a custom batch:
node src/scripts/download-images.js --limit=100

# Download all pending images:
node src/scripts/download-images.js --all
```
Images are saved to `data/images/notes/` and referenced in SQLite as `data/images/notes/note-<id>-<name>.jpg`. Re-running skips already downloaded images instantly via local disk caching.

### Workflow C: Scrape & Download Images Simultaneously
You can also download images during the live scraping pass:
```bash
node src/main.js --url=https://www.fragrantica.com/notes/ --engine=puppeteer --download-images
```

### Workflow D: Inspect Database & Pending Links
```bash
npm run inspect:notes
```
Sample output:
```
======================================================================
               FRAGRANTICA NOTES CATALOG INSPECTION
======================================================================
Database Path     : /home/worstation/Desktop/scentel/scrape-ops/data/scrapes.db
Total Unique Notes: 1952
Images Downloaded : 5 of 1952
Pending Scrapes   : 1952 (ready for note-detail scraper expansion)
Scraped Notes     : 0
----------------------------------------------------------------------
Olfactory Groups Breakdown:
  • FLOWERS                                    :  352 notes
  • NATURAL AND SYNTHETIC, POPULAR AND WEIRD   :  302 notes
  • GREENS, HERBS AND FOUGERES                 :  252 notes
  • FRUITS, VEGETABLES AND NUTS                :  243 notes
  • SWEETS AND GOURMAND SMELLS                 :  218 notes
  • WOODS AND MOSSES                           :  169 notes
  • BEVERAGES                                  :  128 notes
  • SPICES                                     :   73 notes
  • MUSK, AMBER, ANIMALIC SMELLS               :   63 notes
  • CITRUS SMELLS                              :   57 notes
  • RESINS AND BALSAMS                         :   45 notes
  • WHITE FLOWERS                              :   26 notes
  • UNCATEGORIZED                              :   24 notes
----------------------------------------------------------------------
Sample Notes in SQLite (first 10):

[#1] Bergamot (Group: CITRUS SMELLS)
  Link           : https://www.fragrantica.com/notes/Bergamot-75.html
  Remote Image   : https://fimgs.net/mdimg/sastojci/m.75.jpg?1733161266
  Local Image    : data/images/notes/note-75-Bergamot.jpg
  Detail Scraped : NO (Pending)
  Created At     : 2026-11-09 07:52:14
----------------------------------------------------------------------
Next Note URLs Ready for Further Crawling:
  1. [Bergamot] https://www.fragrantica.com/notes/Bergamot-75.html
  2. [Bigarade] https://www.fragrantica.com/notes/Bigarade-1083.html
  3. [Bitter Orange] https://www.fragrantica.com/notes/Bitter-Orange-79.html
  4. [Black Lemon] https://www.fragrantica.com/notes/Black-Lemon-1958.html
  5. [Blood Orange] https://www.fragrantica.com/notes/Blood-Orange-286.html
======================================================================
```

---

## CLI Options & Flags

Override configuration settings directly from the terminal:

```bash
node src/main.js [options]
```

| Flag | Type | Description | Default |
|---|---|---|---|
| `--url=<url>` | string | Target URL to start crawling | `https://www.fragrantica.com/notes/` |
| `--engine=<name>` | string | Engine to use: `puppeteer` or `axios` | `puppeteer` |
| `--download-images` | boolean | Download images during page crawl | `false` |
| `--maxRequests=<n>` | number | Maximum pages to crawl in one run | `1` |

---

## Environment Variables (`.env`)

Configure the scraping environment in `.env`:

```ini
# Fetch Engine: "puppeteer" (recommended for Fragrantica) or "axios"
FETCH_ENGINE=puppeteer

# Starting URL
TARGET_URL=https://www.fragrantica.com/notes/

# Crawling Limits
MAX_REQUESTS_PER_CRAWL=1
MAX_RETRIES=3
CONCURRENCY=1

# SQLite Database Storage
DATABASE_PATH=./data/scrapes.db

# Image Downloading Options
DOWNLOAD_IMAGES=false
IMAGES_DIR=./data/images
IMAGE_CONCURRENCY=5

# Puppeteer Options
PUPPETEER_HEADLESS=true
PUPPETEER_EXECUTABLE_PATH=/opt/google/chrome/chrome

# HTTP & Network Options
REQUEST_TIMEOUT_MS=30000
```

---

## Reusable Base Functions (`src/extractors/base.js`)

All common, cross-pipeline utility functions are defined in `src/extractors/base.js`:

- **`downloadImage(imageUrl, options)`**:
  - Downloads an image with browser headers (`User-Agent`, `Referer: https://www.fragrantica.com/`).
  - Checks if file already exists locally before making network requests (`cached: true`).
  - Returns `{ success, localPath, relativePath, filename, byteLength, cached }`.
- **`downloadImageBatch(items, options)`**:
  - Concurrency-controlled batch downloader with live progress callback.
- **`sanitizeFilename(name, fallback)`**:
  - Strips illegal filesystem characters (`/ \ : * ? " < > |`) for cross-platform compatibility.
- **`ensureDir(dirPath)`**:
  - Recursively ensures directory exists.
- **`generateFilenameFromUrl(imageUrl, options)`**:
  - Extracts file extension and builds clean names like `note-75-Bergamot.jpg`.
- **`cleanText(text)`**:
  - Normalizes whitespace, strips irregular carriage returns and tabs.
- **`extractMetaTags($)`**:
  - Extracts standard meta tags and OpenGraph/Twitter attributes.

---

## Database Schema Reference

The SQLite database (`data/scrapes.db`) contains four core tables:

### 1. `notes` Table (Part 1)
Stores all unique fragrance notes extracted from the notes catalog:

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Internal row ID |
| `name` | TEXT NOT NULL | Note name (e.g. `Bergamot`) |
| `link` | TEXT NOT NULL UNIQUE | Canonical URL (`https://www.fragrantica.com/notes/Bergamot-75.html`) |
| `image` | TEXT | Remote CDN image URL |
| `local_image_path` | TEXT | Local filesystem reference (e.g. `data/images/notes/note-75-Bergamot.jpg`) |
| `group_name` | TEXT | Olfactory group (e.g. `CITRUS SMELLS`, `FLOWERS`) |
| `slug` | TEXT | Slug identifier (e.g. `Bergamot`) |
| `note_id` | INTEGER | External ID number (e.g. `75`) |
| `detail_scraped` | INTEGER DEFAULT 0 | `0` = pending, `1` = detail page scraped |
| `detail_scraped_at` | TEXT | Timestamp when detail page was scraped |
| `created_at` | TEXT | Timestamp record was created |
| `updated_at` | TEXT | Timestamp record was last updated |

### 2. `fragrances` Table (Part 2 Setup)
Prepared table for storing perfumes and colognes:

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Internal row ID |
| `name` | TEXT NOT NULL | Perfume title |
| `brand` | TEXT | Brand / design house |
| `link` | TEXT NOT NULL UNIQUE | Perfume page URL |
| `image` | TEXT | Remote bottle image URL |
| `local_image_path` | TEXT | Local filesystem image reference |
| `gender` | TEXT | Marketed gender |
| `rating` | REAL | Rating score (e.g. `4.35`) |
| `votes_count` | INTEGER | Number of user votes |
| `description` | TEXT | Editorial description |
| `top_notes` | TEXT | JSON array of top notes |
| `middle_notes` | TEXT | JSON array of middle notes |
| `base_notes` | TEXT | JSON array of base notes |
| `raw_data` | TEXT | Complete extracted JSON payload |
| `detail_scraped` | INTEGER DEFAULT 0 | Detail scraping status |
| `created_at` | TEXT | Creation timestamp |
| `updated_at` | TEXT | Update timestamp |

### 3. `scraped_pages` & `extracted_records`
Maintains raw HTML snapshots and extracted JSON audit logs for every crawled URL.
