#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { GOOGLE_SITES_BASE, CONTENT, ROOT } = require('./lib/paths');
const { loadSections } = require('./lib/sections');
const { bhajanFilename } = require('./lib/slug');
const { dumpBhajanDoc } = require('./lib/yaml-io');
const { parseBhajans, extractBannerUrl } = require('./lib/parse-html');

const CACHE = path.join(ROOT, 'scrape-cache');
const DELAY_MS = 500;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'bhajan-sangrah-migrator/1.0' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function cachePath(slug) { return path.join(CACHE, `${slug}.html`); }

async function getHtml(section, flags) {
  const cached = cachePath(section.slug);
  if (flags.cacheOnly || (flags.preferCache && fs.existsSync(cached))) {
    return fs.readFileSync(cached, 'utf8');
  }
  try {
    const html = await fetchHtml(`${GOOGLE_SITES_BASE}${section.google_path}`);
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(cached, html, 'utf8');
    return html;
  } catch (err) {
    if (fs.existsSync(cached)) {
      console.log(`  (using cache: ${cached})`);
      return fs.readFileSync(cached, 'utf8');
    }
    throw err;
  }
}

async function scrapeSection(section, flags) {
  console.log(`Scraping ${section.slug} …`);
  const html = await getHtml(section, flags);
  const banner = extractBannerUrl(html);
  if (banner) console.log(`  Banner URL: ${banner}`);

  const bhajans = parseBhajans(html, section.title, {
    swarachitSection: section.slug === 'swarachit',
  });

  const dir = path.join(CONTENT, section.folder);
  fs.mkdirSync(dir, { recursive: true });
  const existing = new Set(fs.existsSync(dir) ? fs.readdirSync(dir) : []);
  bhajans.forEach((b, i) => {
    const filename = bhajanFilename(b.title, i, existing);
    existing.add(filename);
    fs.writeFileSync(path.join(dir, filename), dumpBhajanDoc(b), 'utf8');
    console.log(`  + ${filename}`);
  });
  return { count: bhajans.length, banner };
}

async function main() {
  const flags = {
    cacheOnly: process.argv.includes('--cache-only'),
    preferCache: process.argv.includes('--prefer-cache'),
  };
  const only = process.argv.find((a) => a.startsWith('--section='));
  const slugFilter = only ? only.split('=')[1] : null;

  const config = loadSections();
  const banners = {};
  for (const section of config.sections) {
    if (slugFilter && section.slug !== slugFilter) continue;
    try {
      const { count, banner } = await scrapeSection(section, flags);
      if (banner) banners[section.slug] = banner;
      console.log(`  → ${count} bhajans\n`);
    } catch (err) {
      console.error(`  ERROR ${section.slug}: ${err.message}\n`);
    }
    await sleep(DELAY_MS);
  }
  fs.writeFileSync(path.join(CONTENT, 'banner-urls.json'), JSON.stringify(banners, null, 2), 'utf8');
  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });