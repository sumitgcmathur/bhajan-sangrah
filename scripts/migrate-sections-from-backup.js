#!/usr/bin/env node
/**
 * Migrate content/<section>/*.yaml from backup (hook-stanzas + ambe shapes).
 *
 *   node scripts/migrate-sections-from-backup.js hanuman krishna ram shiv navratri
 *   node scripts/migrate-sections-from-backup.js krishna [backup-folder]
 */
const { migrateSectionDoc } = require('./lib/section-lyrics');
const { runSectionMigration } = require('./lib/run-section-migration');

const DEFAULT_SECTIONS = ['hanuman', 'krishna', 'ram', 'shiv', 'navratri'];
const backupRoot = process.argv.find((a) => a.startsWith('content-backup')) || 'content-backup-20260517-123521';
const sections = process.argv
  .slice(2)
  .filter((a) => !a.startsWith('content-backup') && !a.endsWith('.js'));

const toRun = sections.length ? sections : DEFAULT_SECTIONS;

let failed = 0;
for (const section of toRun) {
  try {
    const { outDir, report } = runSectionMigration(section, migrateSectionDoc, {
      backupRoot,
      strategyField: '_sectionStrategy',
    });
    console.log(`\n${section}: ${report.total} files → ${outDir}`);
    console.log(`  Strategies: ${JSON.stringify(report.summary.strategies)}`);
    console.log(`  Manual review: ${report.summary.manualReview}`);
  } catch (err) {
    failed += 1;
    console.error(`\n${section}: ${err.message}`);
  }
}

if (failed) process.exit(1);
