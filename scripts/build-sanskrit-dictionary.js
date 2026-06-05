#!/usr/bin/env node
const { writeSanskritDictionary } = require('./lib/sanskrit-dictionary');

writeSanskritDictionary().catch((err) => {
  console.error(err);
  process.exit(1);
});
