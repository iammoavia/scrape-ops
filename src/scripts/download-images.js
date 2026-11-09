import { config } from '../config/index.js';
import { StorageService } from '../storage/database.js';
import { downloadImageBatch, ensureDir } from '../extractors/base.js';

function parseCliLimit() {
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--limit=')) {
      return parseInt(arg.split('=')[1], 10);
    }
    if (arg === '--all') {
      return 100000;
    }
  }
  return 50; // default batch limit
}

async function main() {
  console.log('='.repeat(70));
  console.log('               FRAGRANTICA IMAGE DOWNLOADER');
  console.log('='.repeat(70));
  console.log(`Database Path     : ${config.databasePath}`);
  console.log(`Target Images Dir : ${config.notesImagesDir}`);
  console.log(`Concurrency       : ${config.imageConcurrency}`);

  const storage = new StorageService(config.databasePath);
  ensureDir(config.notesImagesDir);

  try {
    const limit = parseCliLimit();
    const pendingNotes = storage.getNotesMissingImages(limit);

    console.log(`Images Pending    : ${pendingNotes.length} note(s) to process (limit: ${limit})`);
    console.log('='.repeat(70) + '\n');

    if (pendingNotes.length === 0) {
      console.log('✓ All notes already have their images downloaded locally!');
      return;
    }

    const downloadItems = pendingNotes.map((note) => ({
      url: note.image,
      prefix: 'note',
      id: note.note_id || note.id,
      slug: note.slug || note.name,
      noteLink: note.link,
    }));

    let downloadedCount = 0;
    let cachedCount = 0;
    let failedCount = 0;

    const results = await downloadImageBatch(downloadItems, {
      targetDir: config.notesImagesDir,
      concurrency: config.imageConcurrency,
      onProgress: ({ completed, total, current, result }) => {
        if (result.success) {
          // Update SQLite with the relative local image path
          storage.updateNoteLocalImage(current.noteLink, result.relativePath);
          if (result.cached) {
            cachedCount++;
          } else {
            downloadedCount++;
          }
          process.stdout.write(
            `\r[Downloading] (${completed}/${total}) ${result.cached ? '[CACHED]' : '[SAVED]'} ${result.filename} (${(result.byteLength / 1024).toFixed(1)} KB)      `
          );
        } else {
          failedCount++;
          console.error(`\n[Failed] Note ${current.noteLink}: ${result.error}`);
        }
      },
    });

    console.log('\n\n' + '='.repeat(70));
    console.log('                 DOWNLOAD SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total Processed   : ${results.length}`);
    console.log(`Newly Downloaded  : ${downloadedCount}`);
    console.log(`Already Cached    : ${cachedCount}`);
    console.log(`Failed Downloads  : ${failedCount}`);

    const stats = storage.getStats();
    console.log('-'.repeat(70));
    console.log(`Database Totals   : ${stats.notesWithLocalImages} of ${stats.notesCount} notes have local images`);
    console.log('='.repeat(70));
  } finally {
    storage.close();
  }
}

main().catch((err) => {
  console.error('[Fatal Error]:', err);
  process.exit(1);
});

