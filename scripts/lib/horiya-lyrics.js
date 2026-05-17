/**
 * Migration for content/horiya — shared section migrator + Horiya chorus phrases.
 */
const { createSectionMigrator } = require('./section-lyrics');

const HORIYA_CHORUS_HOOKS = [
  'आज ब्रिज में होरी ओ रसिया',
  'खेलो जी खेलो गंग श्याम मो संग होरी खेलो',
  'राधे और रंग दे',
  'काना धर लो',
  'महीनो फागण रो',
  'खेले माडाणी',
];

const horiyaMigrator = createSectionMigrator({
  chorusHooks: HORIYA_CHORUS_HOOKS,
  strategyField: '_horiyaStrategy',
});

module.exports = {
  migrateHoriyaDoc: horiyaMigrator.migrateDoc,
  migrateHoriyaLines: horiyaMigrator.migrateLines,
  preprocessHoriyaLine: horiyaMigrator.preprocessLine,
};
