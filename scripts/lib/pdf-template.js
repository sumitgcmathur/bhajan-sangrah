const path = require('path');
const { ROOT } = require('./paths');
const { escapeHtml, anchorId, bhajanNumberLabel, bhajansByGroup, sectionUsesGroups, renderBhajanCard } = require('./template');
const { FILL_INDEX_PAGE_NUMBERS_JS } = require('./pdf-print');

function sectionAnchorId(slug) {
  return `pdf-section-${slug}`;
}

function pathToFileURL(filePath) {
  const resolved = path.resolve(filePath).replace(/\\/g, '/');
  return `file:///${resolved.startsWith('/') ? resolved.slice(1) : resolved}`;
}

function assetFileURL(relativePath) {
  if (!relativePath) return '';
  return pathToFileURL(path.join(ROOT, relativePath.replace(/^\//, '')));
}

function renderPdfIndexItem(hrefId, labelHtml) {
  return `<li class="pdf-index__item">
  <a href="#${hrefId}" class="pdf-index__link">
    <span class="pdf-index__label">${labelHtml}</span>
    <span class="pdf-index__leaders" aria-hidden="true"></span>
    <span class="pdf-index__pagenum" data-target="${hrefId}"></span>
  </a>
</li>`;
}

function assignBhajanIds(section, bhajans) {
  const grouped = sectionUsesGroups(section, bhajans);
  if (grouped && bhajansByGroup(bhajans).some((g) => g.title)) {
    let i = 0;
    const out = [];
    for (const g of bhajansByGroup(bhajans)) {
      if (!g.title) continue;
      for (const b of g.items) {
        out.push({
          ...b,
          id: b.id || anchorId(section.slug, b.title, i),
        });
        i += 1;
      }
    }
    return out;
  }
  return bhajans.map((b, i) => ({
    ...b,
    id: b.id || anchorId(section.slug, b.title, i),
  }));
}

function renderPdfIndexItemsForSection(section, bhajans, globalNumRef) {
  const showSwarachitBadge = section.slug !== 'swarachit';
  const withIds = assignBhajanIds(section, bhajans);
  const grouped = sectionUsesGroups(section, bhajans);
  const groups = grouped ? bhajansByGroup(withIds) : [];

  if (grouped && groups.some((g) => g.title)) {
    return groups
      .filter((g) => g.title)
      .map((g) => {
        const items = g.items
          .map((b) => {
            const num = bhajanNumberLabel(globalNumRef.n++);
            const sw =
              showSwarachitBadge && b.swarachit
                ? ' <span class="pdf-index__badge">स्वरचित</span>'
                : '';
            return renderPdfIndexItem(
              b.id,
              `<span class="bhajan-index__num">${num}</span> ${escapeHtml(b.title)}${sw}`
            );
          })
          .join('\n');
        return `<section class="pdf-index__group">
  <h3 class="pdf-index__group-title">${escapeHtml(g.title)}</h3>
  <ul class="pdf-index__list">${items}</ul>
</section>`;
      })
      .join('\n');
  }

  return `<ul class="pdf-index__list">${withIds
    .map((b) => {
      const num = bhajanNumberLabel(globalNumRef.n++);
      const sw =
        showSwarachitBadge && b.swarachit
          ? ' <span class="pdf-index__badge">स्वरचित</span>'
          : '';
      return renderPdfIndexItem(
        b.id,
        `<span class="bhajan-index__num">${num}</span> ${escapeHtml(b.title)}${sw}`
      );
    })
    .join('\n')}</ul>`;
}

/** One combined index for the whole book, grouped by section. */
function renderCompleteBhajanIndex(sectionPayloads) {
  const globalNumRef = { n: 1 };
  const blocks = sectionPayloads
    .map(({ section, bhajans }) => {
      if (!bhajans.length) return '';
      const indexBody = renderPdfIndexItemsForSection(section, bhajans, globalNumRef);
      const grouped =
        sectionUsesGroups(section, bhajans) && bhajansByGroup(bhajans).some((g) => g.title);
      return `<section class="pdf-index__section${grouped ? ' pdf-index__section--grouped' : ''}">
  <h2 class="pdf-index__section-title">
    <a href="#${sectionAnchorId(section.slug)}" class="pdf-index__section-link">${escapeHtml(section.title)}</a>
  </h2>
  ${indexBody}
</section>`;
    })
    .join('\n');

  return `<section class="pdf-master-index" id="pdf-bhajan-index">
  <h1 class="pdf-master-index__title">भजन सूची</h1>
  <div class="pdf-index__sections">${blocks}</div>
</section>`;
}

function renderPdfBanner(section, resolveAsset) {
  if (!section.banner) return '';
  const src = resolveAsset(section.banner);
  if (!src) return '';
  return `<figure class="pdf-banner">
  <img class="pdf-banner__img" src="${src}" alt="${escapeHtml(section.title)}">
</figure>`;
}

function renderPdfBhajanCard(b, section, index, showSwarachitBadge) {
  let html = renderBhajanCard(b, section, index, showSwarachitBadge);
  html = html.replace(/\s*<a class="bhajan-card__to-index"[^>]*>[\s\S]*?<\/a>/, '');
  html = html.replace('class="bhajan-badge"', 'class="bhajan-badge pdf-bhajan-badge"');
  return html;
}

function renderPdfSection(section, bhajans, resolveAsset) {
  const showSwarachitBadge = section.slug !== 'swarachit';
  const grouped = sectionUsesGroups(section, bhajans);
  const groups = grouped ? bhajansByGroup(bhajans) : [];
  const secId = sectionAnchorId(section.slug);

  let articlesHtml;

  if (grouped && groups.some((g) => g.title)) {
    let bhajanIndex = 0;
    const groupsWithIds = groups
      .filter((g) => g.title)
      .map((g) => ({
        title: g.title,
        items: g.items.map((b) => {
          const item = {
            ...b,
            id: b.id || anchorId(section.slug, b.title, bhajanIndex),
          };
          bhajanIndex += 1;
          return item;
        }),
      }));
    bhajanIndex = 0;
    articlesHtml = groupsWithIds
      .map((g) => {
        const cards = g.items
          .map((b) => renderPdfBhajanCard(b, section, bhajanIndex++, showSwarachitBadge))
          .join('\n');
        return `<section class="bhajan-group">
  <h2 class="bhajan-group__title">${escapeHtml(g.title)}</h2>
  <div class="bhajan-list pdf-bhajan-list">${cards}</div>
</section>`;
      })
      .join('\n');
  } else {
    const withIds = bhajans.map((b, i) => ({
      ...b,
      id: b.id || anchorId(section.slug, b.title, i),
    }));
    articlesHtml = `<div class="bhajan-list pdf-bhajan-list">${withIds
      .map((b, i) => renderPdfBhajanCard(b, section, i, showSwarachitBadge))
      .join('\n')}</div>`;
  }

  return `<section class="pdf-section" id="${secId}">
  ${renderPdfBanner(section, resolveAsset)}
  <header class="pdf-section__head">
    <h1 class="pdf-section__title">${escapeHtml(section.title)}</h1>
  </header>
  ${articlesHtml}
</section>`;
}


const PRINT_TOOLBAR = `<div class="pdf-print-toolbar no-print" role="region" aria-label="मुद्रण">
  <a class="pdf-print-toolbar__back" href="index.html">← मुख पृष्ठ</a>
  <button type="button" class="pdf-print-toolbar__btn" id="pdf-print-btn">Save as PDF</button>
  <p class="pdf-print-toolbar__hint">Use Chrome or Edge. Enable &ldquo;Background graphics&rdquo;. Index page numbers are filled by the browser at print time.</p>
</div>`;

const PRINT_TOOLBAR_SCRIPT = `
(function () {
  function doPrint() {
    window.print();
  }
  document.getElementById('pdf-print-btn')?.addEventListener('click', doPrint);
  if (new URLSearchParams(window.location.search).get('print') === '1') {
    function schedule() {
      setTimeout(doPrint, 600);
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(schedule);
    } else {
      schedule();
    }
  }
})();
`;

function renderPdfDocument(config, sectionPayloads, options = {}) {
  const resolveAsset = options.resolveAsset || assetFileURL;
  const cssHref =
    options.cssHref || pathToFileURL(path.join(ROOT, 'assets', 'css', 'pdf-export.css'));
  const date = new Date().toISOString().slice(0, 10);
  const coverImg = config.home_banner ? resolveAsset(config.home_banner) : '';
  const showToolbar = Boolean(options.showPrintToolbar);

  const sectionsHtml = sectionPayloads
    .map(({ section, bhajans }) => renderPdfSection(section, bhajans, resolveAsset))
    .join('\n');

  const coverBanner = coverImg
    ? `<img class="pdf-cover__img" src="${coverImg}" alt="">`
    : '';

  const toolbar = showToolbar ? PRINT_TOOLBAR : '';
  const toolbarScript = showToolbar ? `<script>${PRINT_TOOLBAR_SCRIPT}</script>` : '';

  return `<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="utf-8">
<title>${escapeHtml(config.site_title || 'भजन संग्रह')} — PDF</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${cssHref}">
</head>
<body class="pdf-export${showToolbar ? ' pdf-export--with-toolbar' : ''}">
${toolbar}
<section class="pdf-cover">
  ${coverBanner}
  <h1 class="pdf-cover__title">${escapeHtml(config.site_title || 'भजन संग्रह')}</h1>
  <p class="pdf-cover__meta">संपूर्ण भजन संग्रह · ${date}</p>
</section>
${renderCompleteBhajanIndex(sectionPayloads)}
${sectionsHtml}
<script>${FILL_INDEX_PAGE_NUMBERS_JS}</script>
${toolbarScript}
</body>
</html>`;
}

module.exports = {
  renderPdfDocument,
  sectionAnchorId,
  pathToFileURL,
  assetFileURL,
};
