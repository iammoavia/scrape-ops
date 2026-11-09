import { config } from './config/index.js';
import { StorageService } from './storage/database.js';
import { createCrawler } from './crawlers/factory.js';

async function main() {
  console.log('='.repeat(70));
  console.log('               SCENTEL SCRAPING STARTER');
  console.log('='.repeat(70));
  console.log(`[Config] Target URL     : ${config.targetUrl}`);
  console.log(`[Config] Engine         : ${config.engine.toUpperCase()} (Crawlee + ${config.engine === 'puppeteer' ? 'Puppeteer' : 'Axios'})`);
  console.log(`[Config] Parser         : Cheerio`);
  console.log(`[Config] Storage        : SQLite (${config.databasePath})`);
  console.log(`[Config] Crawl Limit    : ${config.maxRequestsPerCrawl} request(s)`);
  console.log(`[Config] Retries        : ${config.maxRetries}`);
  console.log('='.repeat(70));

  // Initialize SQLite storage
  const storage = new StorageService(config.databasePath);

  let runSummary = null;

  try {
    // Create Crawlee crawler instance (Puppeteer or Axios engine)
    const crawler = createCrawler({
      engine: config.engine,
      storage,
      config,
      onComplete: (summary) => {
        runSummary = summary;
      },
    });

    console.log(`\n[Runner] Enqueueing target URL: ${config.targetUrl}`);
    console.log(`[Runner] Starting Crawlee run...\n`);

    // Run the crawler for the initial URL
    await crawler.run([config.targetUrl]);

    console.log('\n' + '='.repeat(70));
    console.log('                  EXECUTION RESULT');
    console.log('='.repeat(70));

    if (runSummary) {
      console.log(`Status          : SUCCESS`);
      console.log(`Engine Used     : ${runSummary.engine}`);
      console.log(`HTTP Status     : ${runSummary.statusCode}`);
      console.log(`Page Title      : ${runSummary.title || '(No title tag found)'}`);
      console.log(`HTML Size       : ${(runSummary.htmlLength / 1024).toFixed(2)} KB (${runSummary.htmlLength} bytes)`);
      console.log(`SQLite Page ID  : #${runSummary.pageId}`);
      console.log(`SQLite Record ID: #${runSummary.recordId}`);

      const data = runSummary.extractedData;
      console.log(`Page Type       : ${data.pageType.toUpperCase()}`);

      if (data.metadata?.description) {
        console.log(`Description     : ${data.metadata.description.slice(0, 100)}...`);
      }

      // Display notes-specific summary if notes page was scraped
      if (data.pageType === 'notes') {
        console.log('-'.repeat(70));
        console.log('                    NOTES CATALOG SUMMARY');
        console.log('-'.repeat(70));
        console.log(`Total Extracted : ${data.content?.totalNotes || 0} notes across ${data.content?.totalGroups || 0} olfactory groups`);

        if (runSummary.notesResult) {
          console.log(`Database Sync   : ${runSummary.notesResult.inserted} inserted, ${runSummary.notesResult.updated} updated (unique by link)`);
        }

        if (data.content?.groups?.length) {
          console.log('\nCategory Groups:');
          data.content.groups.forEach((g) => {
            console.log(`  • ${g.name.padEnd(42)} : ${String(g.count).padStart(4)} notes`);
          });
        }

        if (data.content?.sampleNotes?.length) {
          console.log('\nSample Saved Notes (First 5):');
          data.content.sampleNotes.slice(0, 5).forEach((n, idx) => {
            console.log(`  ${idx + 1}. [${n.group || 'General'}] ${n.name}`);
            console.log(`     Link        : ${n.link}`);
            console.log(`     Remote Image: ${n.image || '(No image)'}`);
            if (n.localImagePath) {
              console.log(`     Local Image : ${n.localImagePath}`);
            }
          });
        }
      }

      // Display fragrance-specific summary if perfume detail was scraped
      if (data.pageType === 'perfume') {
        console.log('-'.repeat(70));
        console.log('                   FRAGRANCE DETAIL SUMMARY');
        console.log('-'.repeat(70));
        console.log(`Perfume Name    : ${data.content?.perfumeName}`);
        console.log(`Brand           : ${data.content?.brand}`);
        console.log(`Rating          : ${data.content?.rating} (${data.content?.votesCount || 0} votes)`);
        if (data.content?.accords?.length) {
          console.log(`Main Accords    : ${data.content.accords.slice(0, 6).join(', ')}`);
        }
      }

      // Display homepage sample links if homepage was scraped
      if (data.pageType === 'homepage' && data.content?.samplePerfumeUrls?.length) {
        console.log(`Sample Links    :`);
        data.content.samplePerfumeUrls.forEach((link, idx) => {
          console.log(`   ${idx + 1}. ${link}`);
        });
      }
    } else {
      console.log(`Status          : COMPLETED (No page processed)`);
    }

    const stats = storage.getStats();
    console.log('-'.repeat(70));
    console.log(`Database Totals :`);
    console.log(`  • Notes       : ${stats.notesCount} unique note(s) (${stats.notesWithLocalImages || 0} with local images, ${stats.pendingNotesCount} pending detail scrape)`);
    console.log(`  • Fragrances  : ${stats.fragrancesCount} fragrance record(s)`);
    console.log(`  • Raw Pages   : ${stats.pageCount} page(s) cached`);
    console.log(`  • Records     : ${stats.recordCount} structured record(s)`);
    console.log('='.repeat(70));
  } catch (error) {
    console.error('\n[Error] Crawler execution encountered an error:', error);
    process.exitCode = 1;
  } finally {
    storage.close();
  }
}

main().catch((err) => {
  console.error('[Fatal Error]:', err);
  process.exit(1);
});
