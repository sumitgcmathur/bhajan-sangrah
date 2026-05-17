#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { ROOT, ASSETS } = require('./lib/paths');

const urlsPath = path.join(ROOT, 'content', 'banner-urls.json');
if (!fs.existsSync(urlsPath)) {
  console.error('Run scraper first to create content/banner-urls.json');
  process.exit(1);
}
const urls = JSON.parse(fs.readFileSync(urlsPath, 'utf8'));
const outDir = path.join(ASSETS, 'banners');
fs.mkdirSync(outDir, { recursive: true });

async function download(slug, url) {
  const dest = path.join(outDir, `${slug}.jpg`);
  if (fs.existsSync(dest)) {
    console.log(`skip ${slug} (exists)`);
    return;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${slug}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  console.log(`saved ${dest}`);
}

(async () => {
  for (const [slug, url] of Object.entries(urls)) {
    try {
      await download(slug, url);
    } catch (e) {
      console.error(`${slug}: ${e.message}`);
    }
  }
})();