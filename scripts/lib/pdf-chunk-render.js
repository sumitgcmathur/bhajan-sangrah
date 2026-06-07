const path = require('path');
const { ROOT } = require('./paths');
const { pathToFileURL } = require('./pdf-assets');
const { escapeHtml, renderOmFrameDecor } = require('./template');
const {
  resolvePdfAsset,
  renderPdfLanding,
  renderPdfBannerFill,
  renderPdfSectionChunkBody,
} = require('./pdf-template');

function cssHref(options = {}) {
  return options.cssHref || pathToFileURL(path.join(ROOT, 'assets', 'css', 'pdf-export.css'));
}

function wrapChunkDocument(title, bodyHtml, options = {}) {
  const { watermarkUrl = '', omFrame = true } = options;
  const stylesheet = options.cssHref || cssHref();
  const wm = watermarkUrl
    ? `<div class="pdf-chunk-watermark" aria-hidden="true"><img class="pdf-chunk-watermark__img" src="${watermarkUrl}" alt=""></div>`
    : '';
  const om = omFrame
    ? `<div class="pdf-page-frame" aria-hidden="true">${renderOmFrameDecor()}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${stylesheet}">
</head>
<body class="pdf-export pdf-export--chunk${watermarkUrl ? ' pdf-export--has-chunk-watermark' : ''}">
${wm}
${om}
${bodyHtml}
</body>
</html>`;
}

function renderFrontMatterChunk(config, sectionPayloads, resolveAsset, options = {}) {
  const date = new Date().toISOString().slice(0, 10);
  const coverAssets = config.home_banner
    ? resolvePdfAsset(resolveAsset, config.home_banner)
    : { full: '', blur: '', thumb: '' };
  const coverBanner = coverAssets.full
    ? renderPdfBannerFill(coverAssets, config.site_title || 'भजन संग्रह')
    : '';

  const body = `<section class="pdf-cover">
  ${coverBanner}
  <div class="pdf-cover__text">
    <h1 class="pdf-cover__title">${escapeHtml(config.site_title || 'भजन संग्रह')}</h1>
    <p class="pdf-cover__meta">संपूर्ण भजन संग्रह · ${date}</p>
  </div>
</section>
${renderPdfLanding(config, sectionPayloads, resolveAsset)}`;

  return wrapChunkDocument(`${config.site_title || 'भजन संग्रह'} — cover`, body, {
    watermarkUrl: '',
    omFrame: false,
  });
}

function renderSectionChunk(section, bhajans, resolveAsset, watermarkBySlug = {}) {
  const watermarkUrl = section.banner ? watermarkBySlug[section.slug] || '' : '';
  const body = renderPdfSectionChunkBody(section, bhajans, resolveAsset);
  return wrapChunkDocument(`${section.title} — PDF`, body, { watermarkUrl });
}

module.exports = {
  renderFrontMatterChunk,
  renderSectionChunk,
  wrapChunkDocument,
};
