#!/usr/bin/env node
/**
 * Migrate content/horiya/*.yaml from backup (ganpati-style hooks + ambe shapes).
 * Writes only under content/horiya/.
 *
 *   node scripts/migrate-horiya-from-backup.js
 */
const { migrateHoriyaDoc } = require('./lib/horiya-lyrics');
const { runSectionMigration } = require('./lib/run-section-migration');

const backupRoot = process.argv[2] || 'content-backup-20260517-123521';

const { outDir, report } = runSectionMigration('horiya', migrateHoriyaDoc, {
  backupRoot,
  strategyField: '_horiyaStrategy',
});

console.log(`Migrated ${report.total} horiya files → ${outDir}`);
console.log(`  Strategies: ${JSON.stringify(report.summary.strategies)}`);
console.log(`  Manual review: ${report.summary.manualReview}`);
