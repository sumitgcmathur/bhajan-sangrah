const path = require('path');
const { getFile, getFileSha, putFile, putFileBinary } = require('./github');
const { parseSectionsYaml } = require('./yaml-bridge');

const { dumpSectionsDoc } = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'yaml-io'));
const { processBannerUpload } = require('./banner-resize');
const {
  homeIconPath,
  resolveSectionIconPath,
  defaultSectionIconPath,
  thumbPathForSlug,
  menuPathForSlug,
  landingHomeBannerPath,
  sidebarMenuHomePath,
} = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'banner-thumbs'));

const SECTIONS_PATH = 'content/sections.yaml';
/** Raw image bytes (base64 JSON must stay under Vercel ~4.5 MB request limit). */
const MAX_BYTES = 3 * 1024 * 1024;

async function commitBinary(path, buffer, message, token) {
  const sha = await getFileSha(path, token);
  await putFileBinary(path, buffer, message, token, sha || undefined);
}

/**
 * Upload + resize banner image; commits icon, landing tile, menu icon (+ sections.yaml if needed).
 * @param {string} target - `home` or section slug
 */
async function uploadBannerImage(token, target, imageBuffer) {
  if (!imageBuffer?.length) {
    const err = new Error('Empty image');
    err.status = 400;
    throw err;
  }
  if (imageBuffer.length > MAX_BYTES) {
    const err = new Error('Image too large (max 3 MB)');
    err.status = 400;
    throw err;
  }

  const secFile = await getFile(SECTIONS_PATH, token);
  if (!secFile) {
    const err = new Error('sections.yaml not found');
    err.status = 500;
    throw err;
  }

  const config = parseSectionsYaml(secFile.content);
  const { source, thumb, menu } = await processBannerUpload(imageBuffer);

  let iconRel;
  let thumbRel;
  let menuRel;
  let yamlChanged = false;
  let label;

  if (target === 'home') {
    iconRel = homeIconPath(config);
    thumbRel = landingHomeBannerPath();
    menuRel = sidebarMenuHomePath();
    label = 'landing page';
    if (!config.home_banner) {
      config.home_banner = iconRel;
      yamlChanged = true;
    }
  } else {
    const section = (config.sections || []).find((s) => s.slug === target);
    if (!section) {
      const err = new Error('Unknown section');
      err.status = 404;
      throw err;
    }
    label = section.title || target;
    if (!section.banner) {
      section.banner = defaultSectionIconPath(section);
      yamlChanged = true;
    }
    iconRel = resolveSectionIconPath(section);
    thumbRel = thumbPathForSlug(section.slug);
    menuRel = menuPathForSlug(section.slug);
  }

  const msg = `admin: update ${label} banner image`;

  await commitBinary(iconRel, source, msg, token);
  await commitBinary(thumbRel, thumb, msg, token);
  await commitBinary(menuRel, menu, msg, token);

  if (yamlChanged) {
    const header = '# Master section index — edit via add-section.js or directly\n';
    const yaml = header + dumpSectionsDoc(config);
    await putFile(SECTIONS_PATH, yaml, msg, token, secFile.sha);
  }

  return {
    target,
    icon: iconRel,
    thumb: thumbRel,
    menu: menuRel,
    yamlUpdated: yamlChanged,
  };
}

module.exports = { uploadBannerImage, MAX_BYTES };
