import { config } from '../config/index.js';
import { StorageService } from '../storage/database.js';

function inspect() {
  const storage = new StorageService(config.databasePath);

  try {
    const stats = storage.getStats();
    console.log('='.repeat(70));
    console.log('               SQLITE DATABASE INSPECTION');
    console.log('='.repeat(70));
    console.log(`Database Path   : ${config.databasePath}`);
    console.log(`Total Pages     : ${stats.pageCount}`);
    console.log(`Total Records   : ${stats.recordCount}`);
    console.log('Engine Breakdown:');
    stats.engineStats.forEach((s) => console.log(`  - ${s.engine}: ${s.count}`));
    console.log('-'.repeat(70));

    const recentPages = storage.getRecentPages(5);
    console.log(`Most Recent Crawled Pages (up to 5):`);
    recentPages.forEach((p) => {
      console.log(`\n[Page #${p.id}]`);
      console.log(`  URL        : ${p.url}`);
      console.log(`  Engine     : ${p.engine}`);
      console.log(`  Status     : ${p.status_code}`);
      console.log(`  Title      : ${p.title}`);
      console.log(`  Size       : ${(p.byte_length / 1024).toFixed(2)} KB`);
      console.log(`  Crawled At : ${p.crawled_at}`);

      const records = storage.getRecordsForPage(p.id);
      if (records.length > 0) {
        console.log(`  Extracted Records (${records.length}):`);
        records.forEach((r) => {
          console.log(`    - Record #${r.id} (${r.record_type})`);
          try {
            const parsed = JSON.parse(r.payload);
            if (parsed.content?.samplePerfumeUrls?.length) {
              console.log(`      Sample URLs found: ${parsed.content.samplePerfumeUrls.length}`);
            }
          } catch {
            // Ignore parse errors for inspection display
          }
        });
      }
    });

    console.log('\n' + '='.repeat(70));
  } finally {
    storage.close();
  }
}

inspect();

