# Scentel Scrape-Ops Starter

A production-ready web scraping system built with **Node.js**, **Crawlee**, **Puppeteer**, **Axios**, **Cheerio**, and **SQLite**.

Designed with a two-part architecture for fragrance domain intelligence:
1. **Part 1 (Implemented)**: Fragrance notes catalog scraper (`https://www.fragrantica.com/notes/`) extracting note name, link, image, and category, persisting uniquely in SQLite with links saved for detail-level expansion.
2. **Part 2 (Architecture in place)**: Fragrance / perfume catalog and detail extraction schema (`fragrances` table) ready for multi-step scraping.

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
           SQLite Database
     ┌────────────┼────────────┐
scraped_pages   notes     fragrances
```

---

## Features

- **Fragrantica Notes Scraper**: Analyzes the HTML of `https://www.fragrantica.com/notes/`, extracts 1,950+ unique notes across 13 olfactory groups (Citrus, Floral, Woody, Gourmand, etc.).
- **Deduplication & Uniqueness**: Uses a `UNIQUE` constraint on note links with transactional SQLite upsert (`ON CONFLICT(link) DO UPDATE`) so re-running the scraper never duplicates data and updates missing fields smoothly.
- **Link Preservation for Expansion**: Stores canonical note links and a `detail_scraped` status flag (`0 = pending`, `1 = scraped`) so subsequent crawl jobs can iterate through notes and scrape note descriptions and associated perfumes.
- **Fragrance Catalog Setup**: Database schema and extractor placeholders for perfumes (`fragrances` table) are already configured and waiting for Part 2 crawling.
- **Crawlee Orchestration**: Fast headless Puppeteer crawling configured with `domcontentloaded` navigation hooks to bypass Cloudflare protection without stalling on ad trackers.
- **SQLite Persistence**: Stored via `better-sqlite3` with WAL mode enabled.

---

## Project Structure

```
scrape-ops/
├── data/
│   └── scrapes.db             # Local SQLite database (auto-created)
├── src/
│   ├── config/
│   │   └── index.js           # Configuration loader (.env, CLI args, auto Chrome detection)
│   ├── storage/
│   │   └── database.js        # SQLite schema & persistence service (notes, fragrances, pages)
│   ├── extractors/
│   │   ├── base.js            # General DOM & metadata extraction utilities
│   │   └── fragrantica.js     # Site-specific extractor for Fragrantica (notes, note details, perfumes)
│   ├── crawlers/
│   │   ├── axios-crawler.js   # Crawlee BasicCrawler wrapping Axios
│   │   ├── puppeteer-crawler.js # Crawlee PuppeteerCrawler with Cloudflare & DOM optimization
│   │   └── factory.js         # Engine selector factory
│   ├── scripts/
│   │   ├── inspect-db.js      # CLI tool to inspect overall SQLite contents
│   │   └── inspect-notes.js   # CLI tool to inspect notes, categories, and pending URLs
│   └── main.js                # Main application entry point
├── .env                       # Environment configuration
├── package.json
└── README.md
```

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Scrape Fragrance Notes
To run the Fragrantica notes scraper (using Puppeteer to bypass Cloudflare):
```bash
npm run scrape:notes
```
This fetches `https://www.fragrantica.com/notes/`, extracts all notes, and upserts them into `scrapes.db`.

### 3. Inspect Saved Notes
To view total notes count, olfactory category breakdowns, sample entries, and next pending URLs:
```bash
npm run inspect:notes
```

### 4. General Database Inspection
```bash
npm run inspect:db
```

---

## Database Schema

The SQLite database (`data/scrapes.db`) contains four core tables:

### 1. `notes` (Part 1)
Stores all unique fragrance notes extracted from the notes catalog.
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `name` (TEXT NOT NULL) — e.g. "Bergamot"
- `link` (TEXT NOT NULL UNIQUE) — e.g. "https://www.fragrantica.com/notes/Bergamot-75.html"
- `image` (TEXT) — e.g. "https://fimgs.net/mdimg/sastojci/m.75.jpg?..."
- `group_name` (TEXT) — Olfactory group (e.g. "CITRUS SMELLS", "FLOWERS")
- `slug` (TEXT) — "Bergamot"
- `note_id` (INTEGER) — 75
- `detail_scraped` (INTEGER DEFAULT 0) — 0 for pending, 1 once note detail page is scraped
- `detail_scraped_at` (TEXT)
- `created_at` (DATETIME)
- `updated_at` (DATETIME)

### 2. `fragrances` (Part 2 Setup)
Prepared table for storing perfumes and colognes.
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `name` (TEXT NOT NULL)
- `brand` (TEXT)
- `link` (TEXT NOT NULL UNIQUE)
- `image` (TEXT)
- `gender` (TEXT)
- `rating` (REAL)
- `votes_count` (INTEGER)
- `description` (TEXT)
- `top_notes`, `middle_notes`, `base_notes` (JSON text)
- `raw_data` (JSON text)
- `detail_scraped` (INTEGER DEFAULT 0)
- `created_at`, `updated_at` (DATETIME)

### 3. `scraped_pages` & `extracted_records`
Maintains the raw HTML snapshot and raw JSON parsing audit trail for every URL visited.
