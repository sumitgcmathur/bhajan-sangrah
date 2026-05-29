#!/usr/bin/env node
const { loadSections } = require('./lib/sections');
const { generateBannerThumbs } = require('./lib/banner-thumbs');

generateBannerThumbs(loadSections())
  .then(() => console.log('Done. Commit assets/banners/*.jpg, then npm run build.'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
