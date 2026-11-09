import { config } from '../config/index.js';
import { StorageService } from '../storage/database.js';

function inspectNotes() {
  const storage = new StorageService(config.databasePath);

  try {
    const stats = storage.getStats();
    console.log('='.repeat(70));
    console.log('               FRAGRANTICA NOTES CATALOG INSPECTION');
    console.log('='.repeat(70));
    console.log(`Database Path     : ${config.databasePath}`);
    console.log(`Total Unique Notes: ${stats.notesCount}`);
    console.log(`Pending Scrapes   : ${stats.pendingNotesCount} (ready for note-detail scraper expansion)`);
    console.log(`Scraped Notes     : ${stats.notesCount - stats.pendingNotesCount}`);
    console.log('-'.repeat(70));

    if (stats.notesByGroup?.length) {
      console.log('Olfactory Groups Breakdown:');
      stats.notesByGroup.forEach((g) => {
        console.log(`  • ${g.groupName.padEnd(42)} : ${String(g.count).padStart(4)} notes`);
      });
      console.log('-'.repeat(70));
    }

    const sampleNotes = storage.getNotes({ limit: 10 });
    if (sampleNotes.length > 0) {
      console.log('Sample Notes in SQLite (first 10):');
      sampleNotes.forEach((n, idx) => {
        console.log(`\n[#${n.id}] ${n.name} (Group: ${n.group_name || 'Uncategorized'})`);
        console.log(`  Link           : ${n.link}`);
        console.log(`  Image          : ${n.image || '(none)'}`);
        console.log(`  Detail Scraped : ${n.detail_scraped ? 'YES' : 'NO (Pending)'}`);
        console.log(`  Created At     : ${n.created_at}`);
      });
    }

    const pending = storage.getPendingNotes(5);
    if (pending.length > 0) {
      console.log('\n' + '-'.repeat(70));
      console.log('Next Note URLs Ready for Further Crawling:');
      pending.forEach((p, idx) => {
        console.log(`  ${idx + 1}. [${p.name}] ${p.link}`);
      });
    }

    console.log('\n' + '='.repeat(70));
  } finally {
    storage.close();
  }
}

inspectNotes();

