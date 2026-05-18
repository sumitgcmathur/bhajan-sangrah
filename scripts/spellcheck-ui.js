#!/usr/bin/env node
/**
 * Local-only spellcheck UI. Not deployed to docs/ or GitHub Pages.
 * Usage: node scripts/spellcheck-ui.js [--port 3765] [--no-open]
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { ROOT, ASSETS } = require('./lib/paths');
const { loadSections } = require('./lib/sections');
const { collectSpellcheckData } = require('./lib/spellcheck-core');
const { renderLocalSpellcheckPage } = require('./lib/spellcheck-page');

const OUT = path.join(ROOT, '.spellcheck');
const PORT = (() => {
  const i = process.argv.indexOf('--port');
  return i !== -1 && process.argv[i + 1] ? Number(process.argv[i + 1]) : 3765;
})();
const NO_OPEN = process.argv.includes('--no-open');

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function buildLocalSite() {
  if (fs.existsSync(OUT)) {
    fs.rmSync(OUT, { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(OUT, 'assets', 'css'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'assets', 'js'), { recursive: true });

  const config = loadSections();
  const spellData = collectSpellcheckData();

  fs.writeFileSync(path.join(OUT, 'index.html'), renderLocalSpellcheckPage(config), 'utf8');
  fs.writeFileSync(
    path.join(OUT, 'assets', 'spellcheck-data.json'),
    JSON.stringify(spellData),
    'utf8'
  );

  copyFile(path.join(ASSETS, 'css', 'site.css'), path.join(OUT, 'assets', 'css', 'site.css'));
  copyFile(
    path.join(ASSETS, 'css', 'spellcheck.css'),
    path.join(OUT, 'assets', 'css', 'spellcheck.css')
  );
  copyFile(path.join(ASSETS, 'js', 'spellcheck.js'), path.join(OUT, 'assets', 'js', 'spellcheck.js'));

  console.log(`Spellcheck data: ${spellData.unknown.length} unknown words`);
  return spellData.unknown.length;
}

function openBrowser(url) {
  const start =
    process.platform === 'win32'
      ? 'start'
      : process.platform === 'darwin'
        ? 'open'
        : 'xdg-open';
  spawn(start, [url], { shell: true, stdio: 'ignore' }).unref();
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function serve() {
  const url = `http://localhost:${PORT}`;
  console.log(`\nLocal spellcheck UI → ${url}`);
  console.log('Press Ctrl+C to stop.\n');

  if (!NO_OPEN) openBrowser(url);

  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent((req.url || '/').split('?')[0]);
    if (rel === '/') rel = '/index.html';
    const filePath = path.normalize(path.join(OUT, rel));
    if (!filePath.startsWith(OUT)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });

  server.listen(PORT);
}

buildLocalSite();
serve();
